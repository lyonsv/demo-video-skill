// Recording kit for scripted product walkthroughs: a headless Chrome page with
// the house overlay (title cards, pill captions, click ripples), a CDP
// screencast streamed to disk, and fast-forward windows for long waits.
//
//   const kit = require('<skill>/scripts/demo-kit');
//   const demo = await kit.start({ out: 'frames' });
//   await demo.page.goto(url, { waitUntil: 'networkidle' });
//   await demo.title('Feature name', 'What it lets people do');
//   await demo.startCast();
//   ...
//   await demo.finish();            // writes <out>/../<name>-timeline.json
//
// Then: node encode.js <frames> <timeline.json> <output.mp4>, or let record.js
// run the segment from a demos-repo manifest, which does both.
const fs = require('fs');
const path = require('path');

// Resolved from the working directory first, where `npm i playwright-core` ran.
const { chromium } = require(require.resolve('playwright-core', { paths: [process.cwd(), __dirname] }));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Injected into every page (and every navigation) before its own scripts run.
const OVERLAY = ({ brand }) => {
  window.__caption = (text) => {
    let el = document.getElementById('__demo_caption');
    if (!el) {
      el = document.createElement('div');
      el.id = '__demo_caption';
      el.style.cssText =
        'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;' +
        'background:rgba(17,17,17,.88);color:#fff;font:600 17px/1.3 Lato,Helvetica,Arial,sans-serif;' +
        'padding:10px 18px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.25);' +
        'transition:opacity .25s ease;pointer-events:none;white-space:nowrap';
      document.documentElement.appendChild(el);
    }
    el.style.opacity = text ? '1' : '0';
    if (text) el.textContent = text;
  };
  window.__ripple = (x, y) => {
    const dot = document.createElement('div');
    dot.style.cssText =
      `position:fixed;left:${x - 18}px;top:${y - 18}px;width:36px;height:36px;border-radius:50%;` +
      'background:rgba(122,71,255,.35);border:2px solid rgba(122,71,255,.9);z-index:2147483646;' +
      'pointer-events:none;transition:transform .45s ease,opacity .45s ease;transform:scale(.4)';
    document.documentElement.appendChild(dot);
    requestAnimationFrame(() => {
      dot.style.transform = 'scale(1.3)';
      dot.style.opacity = '0';
    });
    setTimeout(() => dot.remove(), 600);
  };
  window.__title = (title, subtitle) => {
    const el = document.createElement('div');
    el.id = '__demo_title';
    el.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:#fff;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;font-family:Lato,Helvetica,Arial,sans-serif;transition:opacity .5s ease';
    const escape = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    el.innerHTML =
      (brand
        ? `<div style="font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:#6f6f6f;font-weight:700">${escape(brand)}</div>`
        : '') +
      `<div style="font-size:46px;font-weight:700;margin:10px 0 12px;color:#111">${escape(title)}</div>` +
      `<div style="font-size:20px;color:#555">${escape(subtitle)}</div>`;
    document.documentElement.appendChild(el);
  };
  window.__untitle = () => {
    const el = document.getElementById('__demo_title');
    if (el) {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 550);
    }
  };
};

/**
 * Starts a recording session. Frames are written to `out` as they arrive
 * (holding them in memory runs Chrome's 60fps animation frames into the
 * gigabytes over a few minutes). Fast-forwarded stretches keep 4 frames a
 * second since they play back in about two seconds; the rest keep ~40.
 */
async function start({
  // record.js sets these, so a segment script needs no paths of its own.
  out = process.env.DEMO_FRAMES || 'frames',
  width = 1440,
  height = 900,
  brand = '', // optional small uppercase line above card titles
  timeline = process.env.DEMO_TIMELINE || `${path.basename(path.resolve(out))}-timeline.json`,
} = {}) {
  const outDir = path.resolve(out);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    // Local dev proxies serve self-signed certificates.
    ignoreHTTPSErrors: true,
  });
  await context.addInitScript(OVERLAY, { brand });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  const times = [];
  const fastForward = [];
  let fastForwarding = false;
  let lastKept = 0;
  let casting = false;
  // A throttled frame is held, not dropped: when a change settles (an outline
  // fades in, then nothing repaints) the last frame of the burst is the only
  // one showing the final state, and no later frame will ever replace it.
  let pending = null;
  let pendingTimer = null;
  const write = ({ t, data }) => {
    fs.writeFileSync(path.join(outDir, `${String(times.length).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
    times.push(t);
    lastKept = t;
  };
  const flushPending = () => {
    clearTimeout(pendingTimer);
    if (pending) write(pending);
    pending = null;
  };
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const t = metadata.timestamp;
    if (t - lastKept >= (fastForwarding ? 0.25 : 0.025)) {
      flushPending();
      write({ t, data });
    } else {
      pending = { t, data };
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(flushPending, 80);
    }
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });

  const startCast = async () => {
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: width, maxHeight: height, everyNthFrame: 1 });
    casting = true;
  };
  const stopCast = async () => {
    if (casting) await cdp.send('Page.stopScreencast');
    flushPending();
    casting = false;
  };

  const ripple = async (locator) => {
    const box = await locator.boundingBox();
    if (box) await page.evaluate(([x, y]) => window.__ripple(x, y), [box.x + box.width / 2, box.y + box.height / 2]);
  };

  const demo = {
    page,
    context,
    browser,
    sleep,
    startCast,
    stopCast,
    ripple,
    caption: (text) => page.evaluate((t) => window.__caption(t), text),
    title: (title, subtitle) => page.evaluate(([a, b]) => window.__title(a, b), [title, subtitle]),
    untitle: () => page.evaluate(() => window.__untitle()),
    /** Clicks with a ripple first, so viewers see where the click lands. */
    tap: async (locator) => {
      await ripple(locator);
      await sleep(180);
      await locator.click();
    },
    /** Types visibly, key by key. */
    type: async (locator, text, delay = 26) => {
      await demo.tap(locator);
      await locator.pressSequentially(text, { delay });
    },
    /** Runs `work` (a model reply, a job, a script) and compresses it to ~2s on playback. */
    ff: async (work) => {
      const begin = Date.now() / 1000;
      fastForwarding = true;
      try {
        return await work();
      } finally {
        fastForwarding = false;
        fastForward.push([begin, Date.now() / 1000]);
      }
    },
    /** Smoothly scrolls a scrollable element (default: the window). */
    scroll: (by, selector) =>
      page.evaluate(
        ([y, sel]) => (sel ? document.querySelector(sel) : window).scrollBy({ top: y, behavior: 'smooth' }),
        [by, selector]
      ),
    scrollTop: (selector) =>
      page.evaluate((sel) => (sel ? document.querySelector(sel) : window).scrollTo({ top: 0, behavior: 'smooth' }), selector),
    /** Navigation replaces the page, so the screencast restarts on the new one. */
    navigate: async (url) => {
      const wasCasting = casting;
      await stopCast();
      await page.goto(url, { waitUntil: 'networkidle' });
      if (wasCasting) await startCast();
    },
    /** Stops recording, writes the timeline for encode.js and closes Chrome. */
    finish: async () => {
      await stopCast();
      const timelinePath = path.resolve(timeline);
      fs.writeFileSync(timelinePath, JSON.stringify({ times, fastForward, end: Date.now() / 1000 }));
      await browser.close();
      console.log(
        `frames=${times.length} fastForward=${JSON.stringify(fastForward.map(([a, b]) => +(b - a).toFixed(1)))} ` +
          `timeline=${timelinePath}`
      );
      return timelinePath;
    },
  };
  return demo;
}

module.exports = { start, sleep };
