// Contact sheets for reviewing a video without watching it: evenly spaced
// stills tiled 2x2 per sheet, plus the duration. Read the sheets (they are
// images) before handing a video over.
//
//   node review.js <video.mp4> <out-dir> [stills=12] [at=seconds,seconds,...]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ffmpeg = require(require.resolve('ffmpeg-static', { paths: [process.cwd(), __dirname] }));

const [, , video, outArg, countArg = '12', atArg] = process.argv;
if (!video || !outArg) {
  console.error('usage: node review.js <video.mp4> <out-dir> [stills=12] [at=seconds,seconds,...]');
  process.exit(2);
}
const out = path.resolve(outArg);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

let probe = '';
try {
  execFileSync(ffmpeg, ['-hide_banner', '-i', path.resolve(video)], { stdio: 'pipe' });
} catch (error) {
  probe = String(error.stderr); // ffmpeg -i with no output exits non-zero but prints the header
}
const [, h, m, s] = probe.match(/Duration: (\d+):(\d+):([\d.]+)/) || [];
if (!h) throw new Error(`Could not read the duration of ${video}`);
const duration = +h * 3600 + +m * 60 + +s;

const at = atArg
  ? atArg.replace(/^at=/, '').split(',').map(Number)
  : Array.from({ length: +countArg }, (_, i) => +(((i + 0.5) * duration) / +countArg).toFixed(2));
const stills = at.map((t, i) => {
  const file = path.join(out, `still-${String(i).padStart(2, '0')}-${t}s.jpg`);
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', path.resolve(video),
    '-frames:v', '1', '-vf', 'scale=720:-1', file]);
  return file;
});

const sheets = [];
for (let i = 0; i < stills.length; i += 4) {
  const group = stills.slice(i, i + 4);
  while (group.length < 4) group.push(group[group.length - 1]);
  const sheet = path.join(out, `sheet-${sheets.length + 1}.jpg`);
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...group.flatMap((f) => ['-i', f]),
    '-filter_complex', '[0][1][2][3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0', sheet]);
  sheets.push(sheet);
}
console.log(`duration=${duration.toFixed(1)}s stills at ${at.join(', ')}s`);
sheets.forEach((sheet, i) => console.log(`sheet ${i + 1} (stills ${i * 4 + 1}-${Math.min(i * 4 + 4, stills.length)}): ${sheet}`));
