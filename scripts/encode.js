// Turns a demo-kit recording into an H.264 MP4 (1440 wide, 30fps, yuv420p).
// Frame durations come from real timestamps, except inside fast-forward
// windows (model waits, jobs), which are compressed so each plays in ~2s.
//
//   node encode.js <frames-dir> <timeline.json> <output.mp4>
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ffmpeg = require(require.resolve('ffmpeg-static', { paths: [process.cwd(), __dirname] }));

const [, , framesArg, timelineArg, output] = process.argv;
if (!framesArg || !timelineArg || !output) {
  console.error('usage: node encode.js <frames-dir> <timeline.json> <output.mp4>');
  process.exit(2);
}
const framesDir = path.resolve(framesArg);
const { times, fastForward } = JSON.parse(fs.readFileSync(path.resolve(timelineArg), 'utf8'));
if (!times.length) throw new Error('The timeline has no frames; the recording did not capture anything.');

const TARGET_FF_SECONDS = 2;
// Chrome sends up to ~60fps during animation; keep real durations and let
// ffmpeg resample to 30fps rather than stretching fast frames.
const MIN_FRAME = 0.001;

const speedAt = (t) => {
  const window = fastForward.find(([a, b]) => t >= a && t < b);
  if (!window) return 1;
  return Math.max(1, (window[1] - window[0]) / TARGET_FF_SECONDS);
};

const lines = [];
let total = 0;
times.forEach((t, index) => {
  const next = index + 1 < times.length ? times[index + 1] : t + 0.5;
  const duration = Math.max(MIN_FRAME, (next - t) / speedAt(t));
  total += duration;
  lines.push(`file '${path.join(framesDir, `${String(index).padStart(5, '0')}.jpg`)}'`);
  lines.push(`duration ${duration.toFixed(4)}`);
});
// The concat demuxer ignores the last duration unless the file repeats.
lines.push(lines[lines.length - 2]);
const concatFile = path.join(path.dirname(framesDir), `${path.basename(framesDir)}-concat.txt`);
fs.writeFileSync(concatFile, lines.join('\n'));

execFileSync(
  ffmpeg,
  [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', concatFile,
    '-vf', 'fps=30,scale=1440:-2:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart',
    path.resolve(output),
  ],
  { stdio: 'inherit' }
);
console.log(`duration≈${total.toFixed(1)}s -> ${path.resolve(output)}`);
