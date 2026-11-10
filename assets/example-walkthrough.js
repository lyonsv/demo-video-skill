// Worked example: a walkthrough segment on demo-kit for a hypothetical app
// (an admin tool plus the customer-facing page it configures). Copy it as a
// starting point; the structure (title card → numbered sections with a
// caption per beat → fast-forwarded waits → end card) is the house format.
// The URLs, selectors and script paths are placeholders.
//
//   node example-walkthrough.js && node <skill>/scripts/encode.js demo-frames demo-frames-timeline.json out.mp4
const path = require('path');
const { execFileSync } = require('child_process');
const kit = require(path.join(process.env.HOME, '.claude/skills/demo-video/scripts/demo-kit'));

const ADMIN = 'http://localhost:8765';
const APP = 'https://www.example.test/feature';
const TOOLS_DIR = path.join(process.env.HOME, 'src/example-admin');
const KEY = 'example-change';

(async () => {
  // Preflight: fail fast on dirty state rather than record a broken take.
  const existing = await (await fetch(`${ADMIN}/api/changes`)).json();
  if (existing.length) throw new Error('The admin database is not empty; start it with a fresh one.');

  const demo = await kit.start({ out: 'demo-frames' });
  const { page, sleep, caption, tap, type, ff } = demo;

  // Title card: load the first page, cover it, then start the screencast.
  await page.goto(`${ADMIN}/admin`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await demo.title('Configuring a feature', 'Changes go live without an app deploy');
  await demo.startCast();
  await sleep(2800);
  await demo.untitle();
  await sleep(900);

  // 1. Create something. Type visibly; captions say what the viewer should notice.
  await caption('The admin tool: a small service the team owns');
  await sleep(2600);
  await tap(page.locator('#new-btn'));
  await sleep(700);
  await caption('A change has a name and a description');
  await type(page.locator('#f-name'), 'Example change');
  await type(page.locator('#f-desc'), 'A longer description typed faster, so it does not drag on screen.', 14);
  await sleep(1200);
  await tap(page.locator('#f-create'));
  await page.waitForSelector('#run-check');
  await sleep(1800);

  // 2. A long real wait: fast-forwarded to ~2s on playback.
  await caption('First, check it offline');
  await tap(page.locator('#run-check'));
  await sleep(2500);
  await ff(() =>
    page.waitForFunction(() => /^Results ·/.test(document.querySelector('.section-title')?.textContent || ''), null, {
      timeout: 900000,
    })
  );
  await caption('Results for each option');
  await demo.scroll(420, 'main');
  await sleep(3200);
  await demo.scrollTop('main');
  await sleep(900);

  // 3. Switch apps mid-video with navigate() (it restarts the screencast).
  await caption('Looks good: turn it on');
  await tap(page.locator('button[data-status="on"]'));
  await sleep(2200);
  await demo.navigate(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await caption('Visitors see the change straight away');
  await type(page.locator('input[aria-label="Search"]'), 'An example query typed key by key', 24);
  await tap(page.locator('button[aria-label="Submit"]'));
  await ff(() => page.waitForFunction(() => document.querySelectorAll('main img').length > 0, null, { timeout: 180000 }));
  await caption('Internal builds show which option is active');
  await demo.ripple(page.locator('text=/Option\\s/').first());
  await sleep(3800);

  // 4. Simulated data is announced on screen, and the run is fast-forwarded.
  await demo.navigate(`${ADMIN}/admin#/${KEY}/live`);
  await caption('For this demo, two weeks of traffic are simulated');
  await ff(async () => {
    execFileSync('node', ['scripts/simulate-traffic.js', KEY], { cwd: TOOLS_DIR, stdio: 'inherit' });
    await sleep(3500);
  });
  await caption('Results per metric, with confidence intervals');
  await demo.scroll(340, 'main'); // bring what the caption talks about on screen
  await sleep(4200);
  await demo.scrollTop('main');
  await sleep(900);

  // End card.
  await caption('');
  await demo.title('Idea → check → live → ship', 'No app deploy in between');
  await sleep(3200);
  await demo.finish();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
