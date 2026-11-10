---
name: demo-video
description: Record polished, scripted demo videos of a web app (product walkthroughs, before → after architecture animations, feature segments) as 1440×900 MP4s in a consistent house format — white title cards, pill captions, click ripples, fast-forwarded waits — by driving headless Chrome with Playwright and encoding with ffmpeg. Use this whenever the user wants a demo video, screencast, walkthrough recording, product video, "record the app", "make a video of this feature", "extend/add to the demo video", an animated architecture diagram, or wants to show a feature to stakeholders as a video, even if they don't say "skill" or name a format.
---

# Demo videos

Scripted walkthroughs recorded from the real running app. The viewer sees the
product doing real work; slow parts (model replies, jobs) are fast-forwarded,
and every beat has a short caption saying what to notice. The same format is
used every time so segments can be joined into one video.

## The house format

Keep these exact, so new segments match earlier ones:

- **Video:** 1440×900, 30fps, H.264 (`libx264 -preset slow -crf 18`), `yuv420p`, `+faststart`, no audio.
- **Title and end cards:** full white screen, centred: an optional small uppercase grey brand
  line (set `brand` in `kit.start`; none by default), 46px bold title, 20px grey subtitle.
  Hold about 2.8s, then fade out. Segments open with a title card; the last one ends with a
  one-line takeaway card (e.g. "Idea → evaluation → live test → ship" / "No app deploy in between").
- **Captions:** dark pill (`rgba(17,17,17,.88)`), white 17px semibold Lato, bottom centre.
  One idea per caption, about 60 characters or fewer, sentence case, no final full stop,
  present tense, written from the viewer's side ("Results open as an artifact beside the chat").
  Change the caption when the beat changes; hold each for about 2.5–4s.
- **Clicks:** a purple ripple (`rgba(122,71,255,…)`) appears on the target just before every click.
- **Typing:** visible, key by key (about 25ms per key; 14ms for long text).
- **Waits:** anything slow runs inside `ff()`, which plays back in about 2s. Everything else is real time.
- **Architecture scenes:** a fixed 1440×900 white page of scenes (title → before → problem
  highlighted → after → metrics count-up → feature list), Lato, ink `#111`, purple accent
  `#6f43d6`; "before" tags grey, "after" tags purple. `assets/architecture-example.html` is
  the reference: reuse its CSS and structure and change the content.

## Where videos live: the demos repo

Every video has a folder in the team's **demos repo** (default `~/src/demos`, or
`$DEMOS_REPO`), holding its recording scripts and a `demo.json` manifest. Product repos
stay free of demo code. Recordings are never committed; the manifest's `output` says where
the MP4 goes.

```
~/src/demos/
  package.json            playwright-core + ffmpeg-static (npm install once)
  <video>/
    demo.json             manifest
    architecture.html     "scenes" segment (optional)
    record-<part>.js      "walkthrough" segments, written on demo-kit
    .build/               per-segment MP4s and frames (gitignored)
```

Manifest (`demo.json`):

```json
{
  "name": "<video-name>",
  "title": "One line: what the video shows",
  "description": "Who it is for and the point it makes",
  "owner": "email",
  "repos": ["repos the recorded features live in, with branches"],
  "needs": [{ "what": "service", "check": "URL that answers 2xx/3xx when it is up", "start": "how to start it" }],
  "reset": "how to get a clean take, and what the recording leaves behind",
  "segments": [
    { "name": "architecture", "kind": "scenes", "page": "architecture.html", "timeline": "0:3000,1:4500" },
    { "name": "walkthrough", "kind": "walkthrough", "script": "record-walkthrough.js" },
    { "name": "intro", "kind": "video", "file": "~/path/to/existing.mp4" }
  ],
  "output": "~/Downloads/<name>.mp4"
}
```

This skill's `examples/sift/` is a reference folder: a two-segment video (a scene page and a
real walkthrough) of a small example app that ships in the same folder.

If the demos repo isn't cloned yet, create it (`git init`, the `package.json` above, and a
`.gitignore` covering `node_modules/`, `.build/`, `*.mp4`, `*.jpg`, `*.png`, `*-frames/` and
`*-timeline.json`) and tell the user it has no remote yet.

## Tools (in `scripts/`, relative to this skill)

| Script | What it does |
| --- | --- |
| `find-demos.js` | `node find-demos.js [root…] [--json]`: lists every video in the demos repo, with segments, repos, output, and when it was last recorded and committed. |
| `record.js` | `node record.js <video-dir> [--only <segment>]`: checks `needs`, records and encodes each segment into `.build/`, joins them into `output` (the old video is kept as `*.previous.mp4`). Run it from the demos repo root. |
| `demo-kit.js` | Library for walkthrough scripts: `kit.start()` gives `page`, `title/untitle`, `caption`, `tap`, `type`, `ff`, `scroll/scrollTop`, `ripple`, `navigate`, `startCast`, `finish`. Frames stream to disk. |
| `encode.js` | `node encode.js <frames-dir> <timeline.json> <out.mp4>`: builds the MP4, compressing `ff()` windows. |
| `record-scenes.js` | `node record-scenes.js <page.html> <out.mp4> "0:3000,1:4500,…"`: records a scene page that defines `window.step(n)`. |
| `concat.js` | `node concat.js <out.mp4> <a.mp4> <b.mp4> …`: joins segments, re-encoding to the house format. |
| `review.js` | `node review.js <video.mp4> <out-dir> [stills] [at=s,s,…]`: 2×2 contact sheets of stills to read back. |

`assets/example-walkthrough.js` is a complete worked example on the kit (and
`examples/sift/record-walkthrough.js` is a real one). Read it before
writing a new walkthrough; it shows the structure, including switching apps mid-video,
fast-forwarded jobs and an end card.

## Workflow

### 0. Find what already exists

Run `find-demos.js` first. If the user wants to re-record or extend a video that already
has a folder, work in that folder: re-record with `record.js <folder>` (or
`--only <segment>` after a UI change), or add a segment to its manifest. Don't start a
second folder for the same video. Create a new folder only for a genuinely new video, named
after it (kebab-case).

### 1. Storyboard first

Before any code, write the storyboard as a numbered list of sections, each with its beats:
what happens on screen and the caption. Decide up front:

- **What must be real, and what can be simulated.** Prefer real (real model calls, real
  searches). If data has to be simulated (e.g. weeks of live traffic), say so on screen, both
  in a caption and in the app itself if it can label it. Viewers take a demo at face value,
  so a simulated result presented as real is misleading.
- **What must not be clicked.** Anything that writes to shared environments (saving boards,
  sending email, purchases). Show the button; don't press it.
- **Length:** about 60–90s per segment. A 3-minute joined video is fine; each segment should
  make one point.

If the user's goal is clear from the conversation, go ahead and share the storyboard in your
update as you work. Ask only when the point of the video is unclear.

### 2. Set up the video's folder

Create `<demos repo>/<video>/` with a `demo.json` (fill `needs` with a `check` URL for
every service the video touches, and write down `reset`). Run `npm install` at the demos
repo root if `node_modules` is missing. The kit and scripts resolve `playwright-core` and
`ffmpeg-static` from the working directory, so run everything from the repo root. Chrome
must be installed (`channel: 'chrome'`; no Playwright browser download is needed).

### 3. Preflight the app

- Confirm every service the video touches is up (curl each URL), and that local HTTPS works
  (the kit ignores self-signed certificates).
- **Reset state** so the take starts clean (fresh DB, cleared localStorage), and make the
  script throw immediately if the state is dirty. A take that fails 3 minutes in costs real
  model calls and time.
- Time the slow endpoints the video polls. A 4-second results query shows as a loading
  skeleton on camera; fix the query or wait for it.
- Screenshot each key state with a tiny Playwright script and look at it: layout,
  wrapping, broken images, what's above the fold at 1440×900. This is cheaper than recording.

### 4. Write the recording script

Copy the structure of `assets/example-walkthrough.js`:

```js
const kit = require(process.env.DEMO_KIT || `${process.env.HOME}/.claude/skills/demo-video/scripts/demo-kit`);
const demo = await kit.start();                             // record.js supplies the frame and timeline paths
await demo.page.goto(URL, { waitUntil: 'networkidle' });
await demo.title('Feature name', 'What it lets people do');
await demo.startCast();                                     // start after the title covers the page
await demo.sleep(2800); await demo.untitle(); await demo.sleep(900);
await demo.caption('…'); await demo.tap(locator); await demo.type(locator, 'text');
await demo.ff(() => page.waitForFunction(() => /* reply finished */ true, null, { timeout: 180000 }));
await demo.finish();
```

- Use stable selectors (`aria-label`, ids, `data-*`) and check them against the real DOM.
- Wait for real completion conditions inside `ff()`, not fixed sleeps, with generous timeouts.
- When a caption talks about something, scroll it on screen first (`demo.scroll(px, 'main')`
  for apps whose content scrolls inside an element).
- `demo.navigate(url)` switches pages or apps; it restarts the screencast on the new page.
- For an architecture segment, build the scene page from the example and record it with
  `record-scenes.js`. Also give it arrow-key and space navigation (the example has it), so
  the same page works when presenting live.

### 5. Record

From the demos repo root, run the whole video (or one segment) **in the foreground** with a
long timeout, logging the output:

```sh
set -o pipefail; node ~/.claude/skills/demo-video/scripts/record.js <video> [--only <segment>] 2>&1 | tee <video>/.build/record.log
```

Don't pipe into `tail`: it hides the recorder's exit code, and a failed take looks like
success. If you must background it, wait on the actual PID (`while kill -0 $PID; do sleep 5; done`)
rather than trusting a "completed" notification, which can arrive before the process ends.

### 6. Review

`record.js` already encoded and joined everything; it prints the review command:

```sh
node ~/.claude/skills/demo-video/scripts/review.js <output.mp4> <video>/.build/review 16
```

To look at one segment, review `<video>/.build/<segment>.mp4`.

**Read every contact sheet** before calling the video done. Check that:

- each caption matches what's on screen at that moment;
- the thing a caption refers to is visible, not below the fold;
- there are no broken images or alt text, stuck skeletons, error toasts, wrapped or clipped
  headers, or debug UI;
- fast-forwarded waits look like a quick blur of progress, not a frozen frame;
- title and end cards are there.

Fix the script or the app (e.g. a placeholder for images that fail to load, a faster query),
reset state, and re-record. Expect two or three takes.

### 7. Deliver

- Review the join points: `review.js <output> <dir> 0 at=<t-1>,<t+1>` at each segment boundary.
- `record.js` keeps the previous version as `*.previous.mp4`. Never overwrite videos that
  aren't this folder's own `output`: to add to someone else's video, add it as a `video`
  segment of a new folder.
- Tell the user the video folder is ready to commit in the demos repo. Only commit if they ask.
- Report to the user: the file paths and durations, what each segment shows, what was real
  and what was simulated, and any state the recording left behind (running services,
  records it created, anything still switched on) with how to undo it.

## Pitfalls met before

- **Memory:** a CDP screencast sends up to 60 frames a second while anything animates.
  Buffering frames in memory for a multi-minute take gets the recorder killed with no output.
  The kit streams frames to disk and thins them during `ff()`; keep it that way.
- **Clock:** `ff()` windows and frame timestamps both use wall-clock seconds, so time the
  whole wait (including polling) inside one `ff()` call.
- **Blocking work** (e.g. `execFileSync` for a data script) inside `ff()` is fine: frames
  resume afterwards and the window is compressed anyway.
- **Ports:** check a port is free before starting a service for the demo; don't kill
  processes you didn't start.
- **Leftover state:** a demo that ends by shipping or enabling something leaves it on.
  Turn it off afterwards or tell the user.
