const $ = (s) => document.querySelector(s);
const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let highlight = null; // id of the comment added most recently

const item = (f) => `
  <li class="item${f.id === highlight ? ' new' : ''}" data-id="${f.id}">
    <p>${escape(f.text)}</p>
    <div class="meta"><span class="src src-${f.source.replace(/\s/g, '').toLowerCase()}">${escape(f.source)}</span><span>${f.date}</span></div>
  </li>`;

const loadInbox = async () => {
  const list = await (await fetch('/api/feedback')).json();
  $('#list').innerHTML = list.map(item).join('');
  $('#count').textContent = `${list.length} comments`;
};

$('#add').addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = $('#text').value.trim();
  if (!text) return;
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, source: $('#source').value }),
  });
  highlight = (await res.json()).id;
  $('#text').value = '';
  await loadInbox();
});

const theme = (t, total) => `
  <article class="theme" data-theme="${escape(t.name)}">
    <div class="theme-head"><h3>${escape(t.name)}</h3><span class="n">${t.count}</span></div>
    <div class="share"><div style="width:${Math.round((t.count / total) * 100)}%"></div></div>
    <ul>${t.quotes.map((q) => `<li class="${q.id === highlight ? 'new' : ''}">“${escape(q.text)}”</li>`).join('')}</ul>
  </article>`;

// POST creates the job; its progress streams back over Server-Sent Events.
$('#build').addEventListener('click', async () => {
  $('#build').disabled = true;
  $('#themes').innerHTML = '';
  $('#progress').hidden = false;
  const { id } = await (await fetch('/api/digests', { method: 'POST' })).json();
  const stream = new EventSource(`/api/digests/${id}/events`);
  stream.addEventListener('progress', (e) => {
    const { done, total, id: current } = JSON.parse(e.data);
    $('#bar-fill').style.width = `${(done / total) * 100}%`;
    $('#progress-text').textContent = `Reading comment ${done} of ${total}`;
    document.querySelectorAll('.item').forEach((li) => li.classList.toggle('reading', +li.dataset.id === current));
  });
  stream.addEventListener('done', (e) => {
    stream.close();
    const { themes, total } = JSON.parse(e.data);
    document.querySelectorAll('.item.reading').forEach((li) => li.classList.remove('reading'));
    $('#progress-text').textContent = `${total} comments · ${themes.length} themes`;
    $('#themes').innerHTML = themes.map((t) => theme(t, total)).join('');
    $('#themes').dataset.ready = 'true';
    $('#build').disabled = false;
  });
});

loadInbox();
