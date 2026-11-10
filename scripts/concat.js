// Joins MP4 segments into one, re-encoding to the house format so segments
// recorded separately (scene video, walkthroughs) play as one video.
//
//   node concat.js <output.mp4> <first.mp4> <second.mp4> [...]
const path = require('path');
const { execFileSync } = require('child_process');

const ffmpeg = require(require.resolve('ffmpeg-static', { paths: [process.cwd(), __dirname] }));

const [, , output, ...inputs] = process.argv;
if (!output || inputs.length < 2) {
  console.error('usage: node concat.js <output.mp4> <first.mp4> <second.mp4> [...]');
  process.exit(2);
}
const normalise = inputs
  .map((_, i) => `[${i}:v]fps=30,scale=1440:900:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p,setsar=1[v${i}]`)
  .join(';');
const joined = `${inputs.map((_, i) => `[v${i}]`).join('')}concat=n=${inputs.length}:v=1:a=0[v]`;
execFileSync(
  ffmpeg,
  [
    '-y', '-hide_banner', '-loglevel', 'error',
    ...inputs.flatMap((input) => ['-i', path.resolve(input)]),
    '-filter_complex', `${normalise};${joined}`,
    '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart',
    path.resolve(output),
  ],
  { stdio: 'inherit' }
);
console.log(`-> ${path.resolve(output)}`);
