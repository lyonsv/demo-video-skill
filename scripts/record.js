// Records a video from its folder in the demos repo: checks the services it
// needs, records and encodes each segment, then joins them into the output.
//
//   node record.js <video-dir>                   # every segment
//   node record.js <video-dir> --only experiments  # re-record one segment, reuse the rest
//
// Run it from the demos repo root (where playwright-core and ffmpeg-static
// are installed). The manifest format is in the skill's SKILL.md.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const videoDir = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--only');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
if (!videoDir) {
  console.error('usage: node record.js <video-dir> [--only <segment>]');
  process.exit(2);
}

const dir = path.resolve(videoDir);
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'demo.json'), 'utf8'));
const expand = (p) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : path.resolve(dir, p));
const build = path.join(dir, '.build');
fs.mkdirSync(build, { recursive: true });
const here = __dirname;
const node = (script, scriptArgs, env = {}) =>
  execFileSync(process.execPath, [script, ...scriptArgs], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, DEMO_KIT: path.join(here, 'demo-kit.js'), ...env },
  });

if (only && !manifest.segments.some((s) => s.name === only)) {
  throw new Error(`No segment "${only}"; segments: ${manifest.segments.map((s) => s.name).join(', ')}`);
}

// 1. Everything the video touches must be up before a take starts.
const down = (manifest.needs || []).filter(({ check }) => {
  if (!check) return false;
  try {
    const code = execFileSync('curl', ['-sk', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '10', check]).toString();
    return !/^[23]/.test(code);
  } catch {
    return true;
  }
});
if (down.length) {
  console.error('Not running:');
  down.forEach(({ what, check, start }) => console.error(`- ${what} (${check})${start ? `\n    start: ${start}` : ''}`));
  process.exit(1);
}
if (manifest.reset) console.log(`Reset before recording: ${manifest.reset}`);

// 2. Record and encode each segment into .build/<segment>.mp4.
for (const segment of manifest.segments) {
  const mp4 = path.join(build, `${segment.name}.mp4`);
  if (only && segment.name !== only) {
    if (!fs.existsSync(mp4)) throw new Error(`${segment.name} has not been recorded yet; run without --only first`);
    continue;
  }
  console.log(`\n== ${segment.name} (${segment.kind})`);
  if (segment.kind === 'scenes') {
    node(path.join(here, 'record-scenes.js'), [path.join(dir, segment.page), mp4, segment.timeline]);
  } else if (segment.kind === 'walkthrough') {
    const frames = path.join(build, `${segment.name}-frames`);
    const timeline = path.join(build, `${segment.name}-timeline.json`);
    node(path.join(dir, segment.script), [], { DEMO_FRAMES: frames, DEMO_TIMELINE: timeline });
    node(path.join(here, 'encode.js'), [frames, timeline, mp4]);
  } else if (segment.kind === 'video') {
    fs.copyFileSync(expand(segment.file), mp4); // an existing clip, used as-is
  } else {
    throw new Error(`Unknown segment kind "${segment.kind}" (scenes, walkthrough or video)`);
  }
}

// 3. Join. The previous output is kept beside it, not overwritten.
const output = expand(manifest.output);
fs.mkdirSync(path.dirname(output), { recursive: true });
if (fs.existsSync(output)) fs.renameSync(output, output.replace(/\.mp4$/, '.previous.mp4'));
const parts = manifest.segments.map((s) => path.join(build, `${s.name}.mp4`));
if (parts.length === 1) fs.copyFileSync(parts[0], output);
else node(path.join(here, 'concat.js'), [output, ...parts]);
console.log(`\nVideo: ${output}\nReview it: node ${path.join(here, 'review.js')} "${output}" ${path.join(build, 'review')} 16`);
