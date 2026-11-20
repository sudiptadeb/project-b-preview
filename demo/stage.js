// The stage around the real app: the intro, then the mock OS page (core/cmd/dev/os.html),
// the desktop the core drives, with the app's icon, its menu bar and its windows. While
// the visitor watches, a pointer opens the app and tours its shells through the real
// menu; any press or key hands over. A log says what the visitor did, what the OS did,
// and what the app asked of the stand-in engine. The core runs in this page, started by
// index.html's head (core/cmd/webdemo).

// The opening lines, shown one after another before the desktop.
const OPENING = [
  "Project B's whole interface is a web page.",
  'So here it is, running inside yours.',
  'The same code as the app. Only the web engine is a stand-in.',
];

// The tour, once the window is open: View › Shell › each of these, in turn.
const TOUR = ['Glide', 'Terminal', 'Minimal', 'Standard'];
const TOUR_STEP_MS = 1200;

const $ = (id) => document.getElementById(id);
const desktop = $('desktop');
const osFrame = $('os');
const pointer = $('pointer');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = globalThis.pbcoreOS === 'android' || innerWidth < 640;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
if (phone) document.documentElement.classList.add('phone');

// ---- The log --------------------------------------------------------------------------

const lines = $('log-lines');
function log(who, text) {
  const li = document.createElement('li');
  li.className = 'fresh';
  const b = document.createElement('b');
  b.textContent = who + ': ';
  li.append(b, text);
  lines.append(li);
  while (lines.children.length > 80) lines.firstChild.remove();
  lines.scrollTop = lines.scrollHeight;
}
// What the app asks of the engine, as the core's demo engine says it (stage.go).
globalThis.pbcoreLog = (line) => log('engine', line);
const logEl = $('log');
if (phone) logEl.classList.add('collapsed');
$('log-toggle').addEventListener('click', () => {
  const collapsed = logEl.classList.toggle('collapsed');
  $('log-toggle').setAttribute('aria-expanded', String(!collapsed));
});

// ---- The tour: the pointer, until the visitor takes over -------------------------------

let touring = !reduced && !phone;
// While the intro plays, a press or key only ends the intro; the tour still follows.
let introPlaying = false;
function handOver() {
  if (!touring || introPlaying) return;
  touring = false;
  pointer.style.opacity = 0;
}
addEventListener('pointerdown', (e) => { if (e.isTrusted) handOver(); }, true);
addEventListener('keydown', (e) => { if (e.isTrusted) handOver(); }, true);

// What the OS page says (os.js).
addEventListener('message', (e) => {
  const m = e.data;
  if (!m || !m.pbOS) return;
  if (m.pbOS === 'log') log(m.who, m.text);
  if (m.pbOS === 'visitor') handOver();
  if (m.pbOS === 'restart') {
    log('you', 'opened Project B again: it starts afresh');
    setTimeout(() => location.reload(), 400);
  }
});

const osDoc = () => osFrame.contentDocument;
// moveTo glides the pointer to the middle of an element in the OS page.
async function moveTo(el, dx = 0.5, dy = 0.55) {
  const r = el.getBoundingClientRect();
  pointer.style.opacity = 1;
  pointer.style.transform = `translate(${r.left + r.width * dx}px, ${r.top + r.height * dy}px)`;
  await wait(reduced ? 0 : 900);
}
async function press() {
  pointer.classList.add('click');
  await wait(110);
  pointer.classList.remove('click');
}
// until waits for find to give an element, or gives up.
async function until(find, ms = 4000) {
  for (let t = 0; t < ms; t += 100) {
    const el = find();
    if (el) return el;
    await wait(100);
  }
  return null;
}

// openByPointer glides to the app's icon and opens it, as a person double-clicks it.
async function openByPointer() {
  const icon = osDoc().getElementById('app-icon');
  pointer.style.transition = 'none';
  pointer.style.transform = `translate(${innerWidth * 0.62}px, ${innerHeight * 0.82}px)`;
  pointer.getBoundingClientRect();
  pointer.style.transition = '';
  await moveTo(icon.querySelector('img'));
  if (!touring) return false;
  for (let n = 0; n < 2; n++) {
    icon.classList.add('pressed');
    await press();
    icon.classList.remove('pressed');
    await wait(60);
  }
  if (!touring) return false;
  icon.click();
  return true;
}

// tour chooses each shell in turn from View › Shell, through the real menu.
async function tour() {
  const doc = osDoc();
  const topButton = (title) => [...doc.querySelectorAll('#menus > div > button')].find((b) => b.textContent === title);
  const item = (menu, title) => [...menu.querySelectorAll(':scope > .item')].find((b) => b.firstChild && b.firstChild.textContent === title);
  for (const shell of TOUR) {
    if (!touring) return;
    const view = await until(() => topButton('View'));
    if (!view || !touring) return;
    await moveTo(view);
    if (!touring) return;
    await press();
    if (view.getAttribute('aria-expanded') !== 'true') view.click();
    const menu = await until(() => view.parentElement.querySelector(':scope > .menu'));
    const shellItem = menu && await until(() => item(menu, 'Shell'));
    if (!shellItem || !touring) return;
    await moveTo(shellItem, 0.3);
    if (!touring) return;
    shellItem.dispatchEvent(new PointerEvent('pointerenter'));
    const sub = await until(() => shellItem.querySelector(':scope > .submenu'));
    const choice = sub && await until(() => item(sub, shell));
    if (!choice || !touring) return;
    await moveTo(choice, 0.3);
    if (!touring) return;
    await press();
    choice.click();
    await wait(TOUR_STEP_MS);
  }
  handOver();
}

// ---- The intro ------------------------------------------------------------------------

// Each line is fully in view for LINE_MS before the next comes, and the last holds for
// LAST_MS. Any key or press ends it at once, with a short fade.
const LINE_MS = 1800;
const LAST_MS = 1500;
async function intro() {
  const el = $('intro');
  introPlaying = true;
  let skipped = false;
  let wake = () => {};
  const skip = () => { skipped = true; wake(); };
  addEventListener('pointerdown', skip, true);
  addEventListener('keydown', skip, true);
  // pause waits ms, or less once skipped.
  const pause = (ms) => new Promise((r) => { const t = setTimeout(r, ms); wake = () => { clearTimeout(t); r(); }; });
  const ps = OPENING.map((t) => {
    const p = document.createElement('p');
    p.textContent = t;
    el.append(p);
    return p;
  });
  await pause(150);
  for (const [i, p] of ps.entries()) {
    if (skipped) break;
    p.classList.add('shown');
    // The line's own fade-in, then its time to be read.
    await pause(700 + (i === ps.length - 1 ? LAST_MS : LINE_MS));
  }
  removeEventListener('pointerdown', skip, true);
  removeEventListener('keydown', skip, true);
  el.classList.add(skipped ? 'leaving-fast' : 'leaving');
  await wait(skipped ? 250 : 600);
  introPlaying = false;
  el.remove();
}

// ---- Download -------------------------------------------------------------------------

const dlButton = $('download-button');
const dlMenu = $('download-menu');
dlMenu.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
dlButton.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = dlMenu.hidden;
  dlMenu.hidden = !open;
  dlButton.setAttribute('aria-expanded', String(open));
});
const closeDownload = () => { dlMenu.hidden = true; dlButton.setAttribute('aria-expanded', 'false'); };
document.addEventListener('click', closeDownload);

// ---- Full screen ----------------------------------------------------------------------

// The demo is best with the whole screen: a quiet button offers it where the browser can,
// and hides while the page is in full screen or on a phone.
const fsButton = $('fullscreen');
const fsShow = () => {
  fsButton.hidden = phone || !document.fullscreenEnabled || !!document.fullscreenElement;
};
fsButton.addEventListener('click', (e) => {
  e.stopPropagation();
  document.documentElement.requestFullscreen?.().catch(() => {});
});
document.addEventListener('fullscreenchange', fsShow);
fsShow();

// ---- Start ----------------------------------------------------------------------------

(async () => {
  // The intro plays on every load while the core starts; one who asked for less motion
  // goes straight to the desktop and skips the tour.
  const introDone = !reduced ? intro() : ($('intro').remove(), Promise.resolve());
  let started = true;
  try {
    await globalThis.pbcoreStarted;
  } catch (e) {
    started = false;
    log('system', 'Project B could not start here: ' + e);
  }
  await introDone;
  desktop.hidden = false;
  if (!reduced) desktop.classList.add('arriving');
  if (!started) return;
  osFrame.src = 'os.html' + (phone ? '?phone' : '');
  await new Promise((r) => osFrame.addEventListener('load', r, { once: true }));
  osDoc().addEventListener('click', closeDownload);
  if (reduced) {
    osDoc().getElementById('app-icon').click();
    return;
  }
  if (!touring) return;
  await wait(1500);
  if (!touring) return;
  if (!(await openByPointer())) return;
  await wait(1800);
  await tour();
})();
