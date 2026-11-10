// Lists the demo videos in the demos repo (or any folders given): one line per
// video folder with a demo.json manifest, newest first.
//
//   node find-demos.js [root ...] [--json]
//
// Default root: $DEMOS_REPO, else ~/src/demos.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const roots = args.filter((a) => a !== '--json');
if (!roots.length) roots.push(process.env.DEMOS_REPO || path.join(os.homedir(), 'src', 'demos'));

const SKIP = new Set(['node_modules', '.git', '.build']);
const found = [];
const walk = (folder, depth) => {
  if (depth > 4 || !fs.existsSync(folder)) return;
  const entries = fs.readdirSync(folder, { withFileTypes: true });
  if (entries.some((e) => e.isFile() && e.name === 'demo.json')) found.push(folder);
  entries.filter((e) => e.isDirectory() && !SKIP.has(e.name)).forEach((e) => walk(path.join(folder, e.name), depth + 1));
};
roots.forEach((root) => walk(path.resolve(root.replace(/^~(?=\/)/, os.homedir())), 0));

const lastCommit = (folder) => {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', '.'], { cwd: folder, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
};
const videos = found.map((folder) => {
  const m = JSON.parse(fs.readFileSync(path.join(folder, 'demo.json'), 'utf8'));
  const output = m.output ? m.output.replace(/^~(?=\/)/, os.homedir()) : '';
  return {
    folder,
    name: m.name,
    title: m.title,
    repos: m.repos || [],
    segments: (m.segments || []).map((s) => s.name),
    output,
    recorded: output && fs.existsSync(output) ? fs.statSync(output).mtime.toISOString().slice(0, 10) : 'never',
    committed: lastCommit(folder) || 'uncommitted',
  };
});
videos.sort((a, b) => (b.recorded > a.recorded ? 1 : -1));

if (asJson) {
  console.log(JSON.stringify(videos, null, 2));
} else if (!videos.length) {
  console.log(`No demo.json manifests under ${roots.join(', ')}`);
} else {
  videos.forEach((v) => {
    console.log(`${v.name} — ${v.title}`);
    console.log(`  folder:   ${v.folder}`);
    console.log(`  segments: ${v.segments.join(' → ')}`);
    console.log(`  repos:    ${v.repos.join(', ') || '—'}`);
    console.log(`  output:   ${v.output} (recorded ${v.recorded}; scripts ${v.committed})`);
  });
}
