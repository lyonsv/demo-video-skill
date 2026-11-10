// Records an animated scene page (e.g. an architecture before → after diagram)
// straight to MP4. The page must define `window.step(n)`; each entry of the
// timeline calls one step and holds it for that many milliseconds.
//
//   node record-scenes.js <page.html> <output.mp4> "0:3000,1:4500,2:3800,3:6500"
//
// See assets/architecture-example.html for the page contract.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const paths = { paths: [process.cwd(), __dirname] };
const { chromium } = require(require.resolve('playwright-core', paths));
const ffmpeg = require(require.resolve('ffmpeg-static', paths));

const [, , pageArg, output, timelineArg] = process.argv;
if (!pageArg || !output || !timelineArg) {
  console.error('usage: node record-scenes.js <page.html> <output.mp4> "step:holdMs,step:holdMs,..."');
  process.exit(2);
}
const TIMELINE = timelineArg.split(',').map((pair) => pair.split(':').map(Number));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-frames-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const url = /^https?:|^file:/.test(pageArg) ? pageArg : `file://${path.resolve(pageArg)}`;
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  await sleep(500);

  const times = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    fs.writeFileSync(path.join(dir, `${String(times.length).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
    times.push(metadata.timestamp);
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1440, maxHeight: 900 });
  for (const [step, hold] of TIMELINE) {
    await page.evaluate((n) => window.step(n), step);
    await sleep(hold);
  }
  const end = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  await browser.close();

  const lines = [];
  times.forEach((t, index) => {
    const next = index + 1 < times.length ? times[index + 1] : Math.max(t + 0.5, end);
    lines.push(`file '${path.join(dir, `${String(index).padStart(5, '0')}.jpg`)}'`, `duration ${Math.max(0.001, next - t).toFixed(4)}`);
  });
  lines.push(lines[lines.length - 2]);
  const concatFile = path.join(dir, 'concat.txt');
  fs.writeFileSync(concatFile, lines.join('\n'));
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concatFile,
    '-vf', 'fps=30,scale=1440:900:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', path.resolve(output)], { stdio: 'inherit' });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`frames=${times.length} -> ${path.resolve(output)}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
