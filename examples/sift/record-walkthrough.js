// Segment "walkthrough": Sift doing real work. A comment is added, a digest
// is built (its streamed progress is fast-forwarded) and the new comment shows
// up in its theme. Everything on screen is the real app; nothing is mocked.
const kit = require(process.env.DEMO_KIT || `${process.env.HOME}/.claude/skills/demo-video/scripts/demo-kit`);

const APP = process.env.SIFT_URL || 'http://localhost:4318';
const COMMENT = "Search can't filter by date, so I scroll for ages";

(async () => {
  // Clean take: back to the seeded inbox, and check it really is.
  const { count } = await (await fetch(`${APP}/api/reset`, { method: 'POST' })).json();
  if (count !== 12) throw new Error(`Expected the 12 seeded comments after reset, got ${count}`);

  const demo = await kit.start({ brand: 'demo-video example' });
  const { page, sleep, caption, tap, type, ff } = demo;

  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForSelector('.item');
  await demo.title('Sift', 'A feedback inbox that groups comments into themes');
  await demo.startCast();
  await sleep(2800);
  await demo.untitle();
  await sleep(900);

  // 1. The inbox.
  await caption('Comments from support, surveys and app reviews land here');
  await sleep(3200);

  // 2. Add one.
  await caption('Anyone on the team can paste in a new one');
  await type(page.locator('#text'), COMMENT, 24);
  await page.selectOption('#source', 'Survey');
  await sleep(500);
  await tap(page.locator('#add-btn'));
  await page.waitForSelector('.item.new');
  await caption('It goes to the top of the inbox');
  await sleep(2800);

  // 3. Build a digest. The job streams progress; the wait is fast-forwarded.
  await caption('Build a digest of everything in the inbox');
  await tap(page.locator('#build'));
  await sleep(1800);
  await caption('The server reads each comment and streams its progress');
  await sleep(2200);
  await ff(() => page.waitForSelector('#themes[data-ready=true]', { timeout: 60000 }));
  await sleep(900);

  // 4. The result.
  await caption('Themes, largest first, with example quotes');
  await sleep(3400);
  const search = page.locator('.theme[data-theme=Search] li.new');
  if (!(await search.count())) throw new Error('The new comment is not in the Search theme');
  await demo.ripple(search);
  await caption('The comment just added is already in Search');
  await sleep(3400);
  await caption('');
  await sleep(500);

  await demo.finish();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
