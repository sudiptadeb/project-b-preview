// Loaded first in every page of the demo: the requests dev's pages make to core/cmd/dev's
// server go to the core running in the top page instead (pbcore, core/cmd/webdemo), and
// every other request goes out as usual.
(() => {
  const top = window.top;
  // A page opened on its own, with no core in the page above it (the homepage's content
  // page, mock-page.html, as a no-script visitor or a curious one opens it), goes out as usual.
  let alone = false;
  try { alone = !top.pbcore && !top.pbcoreStarted; } catch { alone = true; }
  if (alone) return;
  const root = new URL('.', top.location.href).pathname;
  const ours = /^(mock\/menu|mock\/menulist|mock\/choose|mock\/windows|mock\/mode|mock\/window\/size|mock\/origin|mock\/fire|mock\/extensions\/fire|mock\/window\/events|mock\/events|mock\/thumb\/\d+|[a-z]+\/send|[a-z]+\/events)$/;

  // route is the core's path for an address, or null for any other.
  function route(input) {
    const u = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (u.origin !== location.origin) return null;
    let p = u.pathname;
    if (p.startsWith(root)) p = p.slice(root.length);
    else p = p.replace(/^\//, '');
    return ours.test(p) ? { path: p, query: u.search.replace(/^\?/, '') } : null;
  }

  const fetch0 = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const r = route(input);
    if (!r) return fetch0(input, init);
    const core = top.pbcore;
    if (r.path.startsWith('mock/thumb/')) {
      const svg = core.thumb(Number(r.path.split('/')[2]));
      return svg ? new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } }) : new Response('', { status: 404 });
    }
    const body = init.body == null ? '' : String(init.body);
    // What the mock OS page reads and does (core/cmd/dev/os.js), answered by the core.
    const form = new URLSearchParams(body);
    const query = new URLSearchParams(r.query);
    const json = (s) => new Response(s, { headers: { 'Content-Type': 'application/json' } });
    switch (r.path) {
      case 'mock/menu': return json(core.menu());
      case 'mock/windows': return json(core.windows());
      case 'mock/menulist': return json(await new Promise((done) => core.menuList(query.get('name') || '', done)));
      case 'mock/choose': core.choose(form.get('action') || ''); return new Response('');
      case 'mock/mode': core.mode(Number(query.get('window') || 1), form.get('mode') || ''); return new Response('');
    }
    core.post(r.path, r.query, body);
    return new Response('');
  };

  const EventSource0 = window.EventSource;
  window.EventSource = function EventSource(url) {
    const r = route(url);
    if (!r) return new EventSource0(url);
    const es = new EventTarget();
    es.onmessage = null;
    es.onopen = null;
    es.readyState = 0;
    const deliver = (type, ev) => {
      es.dispatchEvent(ev);
      const h = es['on' + type];
      if (h) h.call(es, ev);
    };
    const stop = top.pbcore.stream(r.path, r.query, (data) => deliver('message', new MessageEvent('message', { data })));
    es.close = () => {
      es.readyState = 2;
      if (stop) stop();
    };
    // As the server's stream says it is connected once subscribed.
    setTimeout(() => {
      es.readyState = 1;
      deliver('open', new Event('open'));
    });
    addEventListener('pagehide', () => es.close());
    return es;
  };
})();
