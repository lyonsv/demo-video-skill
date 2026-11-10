// Sift: a small feedback inbox that groups comments into themes.
// One Node process, no dependencies: it serves the page in public/, a JSON API
// for feedback, and digest jobs that stream their progress over Server-Sent Events.
//
//   node examples/sift/app/server.js        # http://localhost:4318
//
// It exists so the demo-video skill has a real app to record (see ../demo.json).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { themeOf, THEMES } = require('./themes');

const PORT = Number(process.env.PORT) || 4318;
const PUBLIC = path.join(__dirname, 'public');
const SEED = path.join(__dirname, 'seed.json');
// Each comment takes this long to analyse, standing in for a slow model call,
// so the digest has visible progress (the demo fast-forwards it).
const STEP_MS = Number(process.env.SIFT_STEP_MS) || 450;

// The store: in memory, reset from seed.json on start and on POST /api/reset.
let feedback = [];
let nextId = 1;
const reset = () => {
  feedback = JSON.parse(fs.readFileSync(SEED, 'utf8')).map((item, i) => ({ id: i + 1, ...item }));
  nextId = feedback.length + 1;
};
reset();

// Digest jobs: created by POST, run in the background, watched over SSE.
const jobs = new Map();
const runDigest = (job) => {
  const items = [...feedback];
  const groups = new Map(THEMES.map((t) => [t.name, []]));
  let done = 0;
  const tick = () => {
    if (done === items.length) {
      job.result = [...groups]
        .map(([name, list]) => ({ name, count: list.length, quotes: list.slice(0, 3) }))
        .filter((g) => g.count)
        .sort((a, b) => b.count - a.count);
      return job.emit('done', { themes: job.result, total: items.length });
    }
    const item = items[done++];
    groups.get(themeOf(item.text)).push(item);
    job.emit('progress', { done, total: items.length, id: item.id });
    setTimeout(tick, STEP_MS);
  };
  setTimeout(tick, STEP_MS);
};
const createJob = () => {
  const job = { id: Math.random().toString(36).slice(2, 10), events: [], listeners: new Set() };
  job.emit = (type, data) => {
    job.events.push({ type, data });
    job.listeners.forEach((send) => send(type, data));
  };
  jobs.set(job.id, job);
  runDigest(job);
  return job;
};

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const routes = {
  'GET /api/health': (req, res) => json(res, 200, { ok: true }),
  'GET /api/feedback': (req, res) => json(res, 200, [...feedback].reverse()),
  'POST /api/feedback': async (req, res) => {
    const { text, source } = await readBody(req);
    if (!text || !String(text).trim()) return json(res, 400, { error: 'text is required' });
    const item = { id: nextId++, text: String(text).trim(), source: source || 'Support', date: new Date().toISOString().slice(0, 10) };
    feedback.push(item);
    json(res, 201, item);
  },
  'POST /api/reset': (req, res) => {
    reset();
    jobs.clear();
    json(res, 200, { count: feedback.length });
  },
  'POST /api/digests': (req, res) => json(res, 202, { id: createJob().id }),
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    const route = routes[`${req.method} ${url.pathname}`];
    if (route) return await route(req, res);

    const events = url.pathname.match(/^\/api\/digests\/(\w+)\/events$/);
    if (req.method === 'GET' && events) {
      const job = jobs.get(events[1]);
      if (!job) return json(res, 404, { error: 'no such digest' });
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      job.events.forEach(({ type, data }) => send(type, data)); // replay, then follow
      job.listeners.add(send);
      return req.on('close', () => job.listeners.delete(send));
    }

    if (req.method !== 'GET') return json(res, 404, { error: 'not found' });
    const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file)) return json(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => console.log(`Sift on http://localhost:${PORT}`));
