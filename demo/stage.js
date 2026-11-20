// The stage around the real app: the intro, then the mock OS page (core/cmd/dev/os.html),
// the desktop the core drives, with the app's icon, its menu bar and its windows. While
// the visitor watches, a pointer opens the app and tours its shells through the real
// menu; any press or key hands over. A log says what the visitor did, what the OS did,
// and what the app asked of the stand-in engine. The core runs in this page, started by
// index.html's head (core/cmd/webdemo).

// The opening lines, shown one after another before the desktop.
const OPENING = [
  'A browser in three separate parts.',
  'Shell. Core. Renderer.',
  "Swap any one, and the others don't notice.",
  'Like now: no renderer, and the rest is running in this tab.',
];

// The tour, once the window is open: View › Shell › each of these, in turn.
const TOUR = ['Glide', 'Terminal', 'Fox', 'Minimal', 'Standard'];
const TOUR_STEP_MS = 2200;

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
// What the app asks of the renderer, as the core's stand-in says it (stage.go).
globalThis.pbcoreLog = (line) => log('renderer', line);
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
  logEl.classList.remove('touring');
  lines.scrollTop = lines.scrollHeight;
}
addEventListener('pointerdown', (e) => { if (e.isTrusted) handOver(); }, true);
addEventListener('keydown', (e) => { if (e.isTrusted) handOver(); }, true);

// What the OS page says (os.js).
addEventListener('message', (e) => {
  // Only the OS page in this page speaks here, not a window that opened or framed us.
  if (e.source !== osFrame.contentWindow) return;
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
    // Out of the way, so the new shell is seen whole.
    pointer.style.transform = `translate(${innerWidth * 0.55}px, ${innerHeight * 0.6}px)`;
    // After the menu's own line, which comes from the OS page.
    await wait(50);
    log('core', `same tabs and history; the shell is now ${shell}`);
    await wait(TOUR_STEP_MS);
  }
  if (touring) {
    log('tour', 'your turn: try View › Shell');
    logEl.classList.add('ping');
  }
  logEl.classList.remove('touring');
  // Every line shows again: keep the newest in view.
  lines.scrollTop = lines.scrollHeight;
  handOver();
}

// ---- The intro ------------------------------------------------------------------------

// Each line is fully in view for LINE_MS before the next comes, and the last holds for
// LAST_MS. Any key or press ends it at once, with a short fade; it waits for the core,
// saying how far it has come, so the desktop never comes up empty.
const LINE_MS = 1100;
const LAST_MS = 1600;
const FADE_MS = 600;
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
  const hint = $('intro-hint');
  const status = $('intro-status');
  if (phone) hint.textContent = 'Tap to skip';
  setTimeout(() => hint.classList.add('shown'), reduced ? 0 : 1500);
  if (reduced) {
    // No motion: the lines all at once, for a moment or until a key.
    ps.forEach((p) => p.classList.add('shown'));
    await pause(3000);
  } else {
    await pause(150);
    for (const [i, p] of ps.entries()) {
      if (skipped) break;
      p.classList.add('shown');
      await pause(FADE_MS + (i === ps.length - 1 ? LAST_MS : LINE_MS));
    }
  }
  // The core, if it isn't there yet: how much of it has come.
  let ready = false;
  globalThis.pbcoreStarted.then(() => { ready = true; }, () => { ready = true; });
  while (!ready) {
    status.classList.add('shown');
    const got = globalThis.pbcoreBytes || 0;
    const all = globalThis.pbcoreTotal || 0;
    status.textContent = all ? `core.wasm · ${(got / 1048576).toFixed(1)} of ${(all / 1048576).toFixed(1)} MB` : 'core.wasm · starting';
    await wait(120);
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
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDownload(); });

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
  // The intro plays on every load while the core starts; one who asked for less motion sees
  // its lines still, then the desktop, with no tour.
  const introDone = intro();
  let started = true;
  try {
    await globalThis.pbcoreStarted;
  } catch (e) {
    started = false;
  }
  await introDone;
  if (!started) {
    // The page on its own, with a word on why.
    location.replace('mock-page.html?nocore');
    return;
  }
  log('core', `Go, ${Math.round((globalThis.pbcoreTotal || 0) / 1048576)} MB of WebAssembly, started in ${globalThis.pbcoreStartMs} ms`);
  desktop.hidden = false;
  if (!reduced) desktop.classList.add('arriving');
  osFrame.src = 'os.html' + (phone ? '?phone' : '');
  await new Promise((r) => osFrame.addEventListener('load', r, { once: true }));
  osDoc().addEventListener('click', closeDownload);
  // The other shells, fetched while the first one shows, so switching is quick.
  for (const id of ['glide', 'terminal', 'fox', 'minimal']) {
    for (const ext of ['js', 'css']) {
      const l = document.createElement('link');
      l.rel = 'prefetch';
      l.href = `shell/${id}/${id}.${ext}`;
      document.head.append(l);
    }
  }
  if (reduced || phone) {
    // A phone opens the app by itself, as no tour does it there.
    if (phone && !reduced) await wait(600);
    // No tour opens it here, so the log says the system did.
    osFrame.contentWindow.pbActor = 'system';
    osDoc().getElementById('app-icon').click();
    osFrame.contentWindow.pbActor = undefined;
    return;
  }
  if (!touring) return;
  await wait(500);
  if (!touring) return;
  logEl.classList.add('touring');
  if (!(await openByPointer())) { logEl.classList.remove('touring'); return; }
  await wait(1800);
  await tour();
})();
