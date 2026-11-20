// What the real engine gives one of our pages, played by the dev server over HTTP: the
// server puts this in the shell's and the settings page's index.html, before their own
// scripts (npm run dev's server does the same). The page's channel is its folder, /shell/
// or /settings/, and whom it speaks for its address says, as it says to the server: a
// shell its window, ?window=<id> (1 when it names none), and the settings page its tab,
// ?tab=<id>.
//
//   chrome.send(channel, [body])   POSTs body to /<channel>/send, in order.
//   window.__shellReceive(json)    is called with each message on /<channel>/events.
//
// The engine delivers nothing before the page sets __shellReceive, and nothing the page
// sends is lost, so messages wait for the one and sends for the event stream to connect:
// Go's feed reaches only who is connected. And as the engine tells the timeline when the
// page's clock started before the page can say anything, the first send in line is that
// time, so no entry of the page's arrives before it.
(() => {
  const channel = location.pathname.slice(new URL('.', top.location.href).pathname.length).split('/')[0];
  const home = location.search;
  let connected;
  let sending = new Promise((resolve) => (connected = resolve)).then(() =>
    fetch('/mock/origin', { method: 'POST', body: new URLSearchParams({ page: channel, t: performance.timeOrigin }) }));
  window.chrome ??= {};
  window.chrome.send = (name, [body]) => {
    sending = sending
      .then(() => fetch(`/${name}/send${home}`, { method: 'POST', body }))
      .catch((err) => console.error('send failed', err));
  };

  const waiting = [];
  let receive = null;
  Object.defineProperty(window, '__shellReceive', {
    get: () => receive,
    set(fn) {
      receive = fn;
      while (receive && waiting.length) receive(waiting.shift());
    },
  });
  const events = new EventSource(`/${channel}/events${home}`);
  events.onopen = () => connected();
  events.onmessage = (e) => (receive ? receive(e.data) : waiting.push(e.data));
})();
