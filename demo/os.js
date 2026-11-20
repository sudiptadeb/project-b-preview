// The mock OS (os.html): the desktop, driven by the core as the real OS is driven by the
// engine. Each part is what the OS draws for the app; each is started once with the OS
// below, and reads and acts through the dev server's /mock/ addresses, which the web demo
// answers in the page instead (core/cmd/webdemo).
//
// Parts now: the windows, the menu bar, the app's icon (the Dock). Each later part is one
// more entry in parts at the bottom: notifications (mocksystem's Notifications()), the
// person check's sheet, the default-browser question, and the OS's dialogs.
(() => {
  const q = new URLSearchParams(location.search);
  const phone = q.has('phone');
  const mac = /Macintosh|Mac OS X/.test(navigator.userAgent);
  if (phone) document.documentElement.classList.add('phone');

  // os is what the parts share: the page around this one (the web demo's stage), told of
  // what happens, and whether the app is open yet.
  const os = {
    phone,
    mac,
    launched: q.has('launched') || window.top === window,
    // log says what happened: the visitor ("you") or the system did it.
    log(who, text) {
      if (window.parent !== window) window.parent.postMessage({ pbOS: 'log', who, text }, '*');
      else console.log(`${who}: ${text}`);
    },
    tell(msg) { if (window.parent !== window) window.parent.postMessage({ pbOS: msg.t, ...msg }, '*'); },
    get: (path) => fetch(path).then((r) => r.json()),
    post: (path, fields) => fetch(path, { method: 'POST', body: new URLSearchParams(fields) }),
    listeners: {},
    on(t, fn) { (this.listeners[t] ||= []).push(fn); },
    emit(t, v) { for (const fn of this.listeners[t] || []) fn(v); },
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };

  // by is who did what an event says: the visitor, or the page around showing the way
  // (the web demo's tour), whose clicks are the page's own.
  const by = (e) => (e && !e.isTrusted ? 'tour' : 'you');

  // ---- Windows: a frame for each window the core has open ------------------------------

  function windowsPart() {
    const holder = document.getElementById('windows');
    const icon = document.querySelector('#app-icon img');
    const wins = new Map(); // id → { el, shown, minimised (by the OS), core: last report }
    let front = 10;
    let quit = false;

    const area = () => {
      const top = phone ? 28 : 30;
      return { x: 0, y: top, w: innerWidth, h: innerHeight - top - (phone ? 22 : 0) };
    };
    function rectOf(id, w) {
      const a = area();
      if (phone || (w.core && w.core.zoomed)) return a;
      const width = Math.min(1320, Math.round(a.w * 0.92));
      const height = Math.min(900, Math.round(a.h * 0.9));
      const step = 28 * [...wins.keys()].indexOf(id);
      return { x: Math.round((a.w - width) / 2) + step, y: a.y + Math.round((a.h - height) / 2) + step, w: width, h: height };
    }
    function place(id) {
      const w = wins.get(id);
      const r = rectOf(id, w);
      Object.assign(w.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      w.el.classList.toggle('zoomed', !!(w.core && w.core.zoomed));
      if (!phone && w.radius !== undefined) w.el.style.borderRadius = w.core && w.core.zoomed ? '0' : w.radius + 'px';
    }
    // toIcon is the transform that puts a window over the icon's picture.
    function toIcon(el) {
      const i = icon.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return `translate(${i.left - r.left}px, ${i.top - r.top}px) scale(${i.width / r.width}, ${i.height / r.height})`;
    }
    function raise(w) { w.el.style.zIndex = ++front; }
    function grow(w) {
      w.el.classList.remove('hidden');
      raise(w);
      if (!os.reduced) w.el.animate([{ transform: toIcon(w.el), opacity: 0, borderRadius: '40px' }, { transform: 'none', opacity: 1 }], { duration: 460, easing: 'cubic-bezier(0.2, 0.85, 0.25, 1)' });
    }
    async function shrink(w) {
      if (!os.reduced) await w.el.animate([{ transform: 'none', opacity: 1 }, { transform: toIcon(w.el), opacity: 0, borderRadius: '40px' }], { duration: 340, easing: 'cubic-bezier(0.5, 0, 0.75, 0.3)' }).finished;
      w.el.classList.add('hidden');
    }

    function make(id) {
      const el = document.createElement('div');
      el.className = 'win hidden';
      const frame = document.createElement('iframe');
      frame.title = `Project B, window ${id}`;
      frame.src = `window.html?window=${id}`;
      // The window's own buttons, where the engine reports them, which the OS answers.
      const buttons = document.createElement('div');
      buttons.className = 'buttons';
      buttons.hidden = true;
      for (const [n, label] of [['close', 'Close'], ['minimise', 'Minimise'], ['zoom', 'Zoom']]) {
        const b = document.createElement('button');
        b.setAttribute('aria-label', label);
        b.addEventListener('click', (e) => button(id, n, e));
        buttons.append(b);
      }
      el.append(frame, buttons);
      holder.append(el);
      const w = { el, frame, buttons, shown: false, minimised: false, core: null };
      wins.set(id, w);
      place(id);
      // On a phone the window has no frame: the page draws none. Elsewhere this page is the
      // window's edge, its corners the window's own, so the window page's band, a second
      // edge inside it, is not drawn; behind the shell the window takes its dark colour
      // while the system is dark, as the real window paints FrameDark by its appearance.
      let band = null;
      frame.addEventListener('load', () => {
        const s = frame.contentDocument.createElement('style');
        if (phone) s.textContent = '.band, .controls { display: none !important; } #window { border-radius: 0 !important; }';
        frame.contentDocument.head.append(s);
        band = s;
        paintBand();
      });
      const dark = matchMedia('(prefers-color-scheme: dark)');
      const paintBand = () => {
        if (!band || phone || !w.colors) return;
        const c = dark.matches ? w.colors.dark : w.colors.light;
        band.textContent = `.band { display: none !important; } #window { background: ${c} !important; }`;
      };
      dark.addEventListener('change', paintBand);
      // Where the engine puts the window's buttons, as the window page reads it.
      const feed = new EventSource(`/mock/window/events?window=${id}`);
      feed.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.t !== 'window') return;
        // The frame is the shape the engine gives the window: its corners are the window's.
        w.radius = m.cornerRadius || 0;
        if (!phone) el.style.borderRadius = w.core && w.core.zoomed ? '0' : w.radius + 'px';
        w.colors = { light: m.frameColor, dark: m.frameDark || m.frameColor };
        // Where the window drags, for a double-click on its empty title area.
        w.regions = m.regions || [];
        paintBand();
        const c = m.controls;
        buttons.hidden = phone || !c;
        if (c) Object.assign(buttons.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' });
      };
      w.feed = feed;
      os.emit('window', frame);
      return w;
    }

    function button(id, which, e) {
      const who = by(e);
      const w = wins.get(id);
      if (!w) return;
      if (which === 'close') {
        // As the real frame's button: the engine closes the window and tells the app.
        os.log(who, `closed window ${id}`);
        os.post(`/mock/fire?window=${id}`, { kind: 'close', value: '', tab: '0' });
      } else if (which === 'minimise') {
        // The OS's own: the window goes to the icon, and the core is told nothing.
        os.log(who, `minimised window ${id}`);
        w.minimised = true;
        sync();
      } else {
        os.log(who, `${w.core && w.core.zoomed ? 'unzoomed' : 'zoomed'} window ${id}`);
        os.post(`/mock/mode?window=${id}`, { mode: w.core && w.core.zoomed ? 'normal' : 'zoomed' });
      }
    }

    // sync brings the desktop in line with the windows the core has.
    let syncing = false;
    async function sync() {
      if (syncing) return;
      syncing = true;
      try {
        const s = await os.get('/mock/windows');
        if (s.quit && !quit) {
          quit = os.quit = true;
          os.log('system', 'Project B quit');
          os.tell({ t: 'quit' });
        }
        const ids = new Set(s.windows.map((w) => w.id));
        for (const [id, w] of wins) {
          if (ids.has(id)) continue;
          wins.delete(id);
          w.feed.close();
          os.log('system', `window ${id} closed`);
          if (w.shown) await shrink(w);
          w.el.remove();
        }
        for (const r of s.windows) {
          let w = wins.get(r.id);
          if (!w) {
            w = make(r.id);
            if (os.launched && r.id > 1) os.log('system', `window ${r.id} opened`);
          }
          const zoomed = w.core && w.core.zoomed;
          w.core = r;
          if (zoomed !== r.zoomed) place(r.id);
          const visible = os.launched && !quit && !r.minimised && !w.minimised;
          if (visible && !w.shown) {
            w.shown = true;
            grow(w);
          } else if (!visible && w.shown) {
            w.shown = false;
            shrink(w);
          }
        }
        document.querySelector('#app-icon .running').hidden = !(os.launched && !quit);
        os.tell({ t: 'state', windows: s.windows.length, shown: [...wins.values()].filter((w) => w.shown).length, quit });
      } finally {
        syncing = false;
      }
    }
    const tick = () => sync().catch((e) => console.error(e)).finally(() => setTimeout(tick, 250));
    tick();
    addEventListener('resize', () => { for (const id of wins.keys()) place(id); });
    // A press in a window brings it to the front.
    os.on('press', (frame) => { for (const w of wins.values()) if (w.frame === frame) raise(w); });
    // A double-click on a window's empty title area zooms it, as the Mac's title bar does:
    // where the window drags, in the window page or its shell, which both cover the window
    // from its corner. A page's own double-clicks are the page's.
    os.on('dblclick', ({ frame, win, e }) => {
      if (phone) return;
      for (const [id, w] of wins) {
        if (w.frame !== frame) continue;
        const fe = win.frameElement;
        if (win !== frame.contentWindow && !(fe && fe.classList.contains('shell'))) return;
        if (e.target.closest && e.target.closest('button, a, input, textarea, select, [role=tab], [role=button], [contenteditable]')) return;
        const r = (w.regions || []).find((g) => e.clientX >= g.x && e.clientX < g.x + g.w && e.clientY >= g.y && e.clientY < g.y + g.h);
        if (r && r.area === 'drag') button(id, 'zoom', e);
      }
    });

    // activate is the icon clicked, as the Dock does: the app opens; minimised windows
    // come back; with no window open, the app is asked for a new one.
    os.on('activate', async (who) => {
      if (quit) {
        os.tell({ t: 'restart' });
        return;
      }
      if (!os.launched) {
        os.launched = true;
        os.log(who, 'opened Project B');
        os.tell({ t: 'launched' });
        await sync();
        return;
      }
      const hidden = [...wins.entries()].filter(([, w]) => !w.shown);
      if (hidden.length) {
        os.log(who, 'clicked Project B in the dock: its windows come back');
        for (const [id, w] of hidden) {
          w.minimised = false;
          if (w.core && w.core.minimised) os.post(`/mock/mode?window=${id}`, { mode: 'normal' });
        }
        sync();
      } else if (!wins.size) {
        os.log(who, 'clicked Project B with no window open');
        os.post('/mock/choose', { action: 'window.new' });
      } else {
        for (const w of wins.values()) raise(w);
      }
    });

    // The phone's home bar: every window goes to the home screen, as on a phone.
    if (phone) {
      const home = document.createElement('button');
      home.id = 'home-bar';
      home.setAttribute('aria-label', 'Home');
      home.addEventListener('click', () => {
        let any = false;
        for (const w of wins.values()) if (w.shown) { any = true; w.minimised = true; }
        if (any) os.log('you', 'went to the home screen');
        sync();
      });
      document.body.append(home);
    }
  }

  // ---- The menu bar: the app's menus, as the app sets them ------------------------------

  function menuBarPart() {
    const menusEl = document.getElementById('menus');
    let shownJSON = '';
    let openTop = null;

    const vk = { 8: 'Backspace', 9: 'Tab', 13: 'Enter', 27: 'Escape', 32: 'Space', 33: 'PageUp', 34: 'PageDown', 35: 'End', 36: 'Home', 37: 'Left', 38: 'Up', 39: 'Right', 40: 'Down', 46: 'Delete', 0xba: ';', 0xbb: '=', 0xbc: ',', 0xbd: '-', 0xbe: '.', 0xbf: '/', 0xc0: '`', 0xdb: '[', 0xdc: '\\', 0xdd: ']', 0xde: "'" };
    const macKeys = { Left: '←', Right: '→', Up: '↑', Down: '↓', Enter: '↩', Escape: '⎋', Tab: '⇥', Backspace: '⌫', Delete: '⌦', PageUp: '⇞', PageDown: '⇟', Home: '↖', End: '↘' };
    // keyText is a menu item's key as the OS shows it.
    function keyText(k) {
      if (!k) return '';
      const name = vk[k.code] || (k.code >= 0x70 && k.code <= 0x7b ? 'F' + (k.code - 0x6f) : String.fromCharCode(k.code));
      if (os.mac) return (k.mods & 1 ? '⌃' : '') + (k.mods & 2 ? '⌥' : '') + (k.mods & 4 ? '⇧' : '') + (k.mods & 8 ? '⌘' : '') + (macKeys[name] || name);
      const parts = [];
      if (k.mods & 1) parts.push('Ctrl');
      if (k.mods & 2) parts.push('Alt');
      if (k.mods & 4) parts.push('Shift');
      if (k.mods & 8) parts.push('Super');
      return [...parts, name].join('+');
    }

    function closeMenus() {
      if (!openTop) return;
      openTop.button.setAttribute('aria-expanded', 'false');
      openTop.menu.remove();
      openTop = null;
    }
    os.on('press', closeMenus);
    document.addEventListener('click', closeMenus);

    const closeSubs = (menu, keep) => menu.querySelectorAll(':scope > .item.open').forEach((o) => {
      if (o === keep) return;
      o.classList.remove('open');
      o.querySelector(':scope > .submenu')?.remove();
    });

    // fill puts items in a menu; path names where it is, for the log.
    function fill(menu, items, path) {
      if (!items || !items.length) {
        const e = document.createElement('div');
        e.className = 'empty';
        e.textContent = 'Nothing here';
        menu.append(e);
        return;
      }
      for (const it of items) {
        if (it.separator) {
          menu.append(document.createElement('hr'));
          continue;
        }
        if (it.list) {
          // A list that changes: its items as they are each time the menu opens.
          const holder = document.createElement('div');
          menu.append(holder);
          fetch(`/mock/menulist?name=${encodeURIComponent(it.list)}`).then((r) => r.json()).then((sub) => {
            const tmp = document.createElement('div');
            fill(tmp, sub, path);
            holder.replaceWith(...tmp.childNodes);
          });
          continue;
        }
        const b = document.createElement('button');
        b.className = 'item';
        const title = document.createElement('span');
        title.textContent = it.title || (it.role === 'services' ? 'Services' : '');
        b.append(title);
        if (it.checked) {
          const c = document.createElement('span');
          c.className = 'check';
          c.textContent = '✓';
          b.append(c);
        }
        if (it.items || it.role) {
          // A submenu, opened by resting on it; the OS's own (Services) has nothing here.
          b.classList.add('sub');
          b.disabled = !it.items;
          b.addEventListener('pointerenter', () => {
            closeSubs(menu, b);
            if (b.classList.contains('open')) return;
            b.classList.add('open');
            const sub = document.createElement('div');
            sub.className = 'menu submenu';
            fill(sub, it.items, [...path, it.title]);
            b.append(sub);
          });
        } else {
          b.disabled = !it.enabled;
          const key = keyText(it.key);
          if (key) {
            const k = document.createElement('span');
            k.className = 'key';
            k.textContent = key;
            b.append(k);
          }
          b.addEventListener('pointerenter', () => closeSubs(menu));
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            os.log(by(e), [...path, it.title].join(' › '));
            closeMenus();
            // As the OS's menu bar tells the app of a choice.
            os.post('/mock/choose', { action: it.action });
          });
        }
        menu.append(b);
      }
    }

    function open(wrap, button, item) {
      closeMenus();
      const menu = document.createElement('div');
      menu.className = 'menu';
      fill(menu, item.items, [button.textContent]);
      wrap.append(menu);
      button.setAttribute('aria-expanded', 'true');
      openTop = { button, menu };
    }

    async function refresh() {
      const menu = os.launched && !os.quit ? await os.get('/mock/menu') : [];
      const json = JSON.stringify(menu);
      if (json === shownJSON) return;
      shownJSON = json;
      closeMenus();
      menusEl.replaceChildren();
      for (const item of menu || []) {
        const wrap = document.createElement('div');
        const b = document.createElement('button');
        b.textContent = item.role === 'app' ? 'Project B' : item.title;
        if (item.role === 'app') b.className = 'app';
        b.setAttribute('aria-haspopup', 'true');
        b.setAttribute('aria-expanded', 'false');
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (openTop && openTop.button === b) closeMenus();
          else open(wrap, b, item);
        });
        b.addEventListener('pointerenter', () => { if (openTop && openTop.button !== b) open(wrap, b, item); });
        wrap.append(b);
        menusEl.append(wrap);
      }
    }
    const tick = () => refresh().catch((e) => console.error(e)).finally(() => setTimeout(tick, 500));
    tick();
  }

  // ---- The app's icon: the Dock --------------------------------------------------------

  function iconPart() {
    const icon = document.getElementById('app-icon');
    icon.addEventListener('click', (e) => {
      icon.classList.add('selected');
      os.emit('activate', by(e));
    });
    if (phone) {
      const clock = document.getElementById('clock');
      const show = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
      show();
      setInterval(show, 10000);
    }
  }

  // ---- The visitor's own input, wherever it lands ---------------------------------------

  // Every press and key in this page and in every frame in it, the windows' pages
  // included: a press in a window raises it, and the page around is told the visitor
  // did something (the web demo's stage stops its tour).
  function inputPart() {
    const hooked = new WeakSet();
    // Each document once: a frame that loads another page (the window's shell, on a change
    // of shell) keeps its window but gets a new document, whose listeners are new.
    function hook(win, frame) {
      let doc;
      try { doc = win && win.document; } catch { return; }
      if (!doc || hooked.has(doc)) return;
      hooked.add(doc);
      win.addEventListener('pointerdown', (e) => {
        if (frame) os.emit('press', frame);
        if (e.isTrusted) os.tell({ t: 'visitor' });
      }, true);
      win.addEventListener('keydown', (e) => { if (e.isTrusted) os.tell({ t: 'visitor' }); }, true);
      if (frame) win.addEventListener('dblclick', (e) => os.emit('dblclick', { frame, win, e }), true);
      const watch = (doc) => {
        const each = (f) => {
          f.addEventListener('load', () => hook(f.contentWindow, frame || f));
          try { if (f.contentDocument && f.contentDocument.readyState !== 'loading') hook(f.contentWindow, frame || f); } catch { /* not ours */ }
        };
        doc.querySelectorAll('iframe').forEach(each);
        new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
          if (n.tagName === 'IFRAME') each(n);
          else if (n.querySelectorAll) n.querySelectorAll('iframe').forEach(each);
        }))).observe(doc, { childList: true, subtree: true });
      };
      try { watch(win.document); } catch { /* not ours */ }
    }
    hook(window, null);
  }

  // The parts, in order. Each later one is one more entry: notifications, the person
  // check's sheet, the default-browser question, the OS's dialogs.
  const parts = [windowsPart, menuBarPart, iconPart, inputPart];
  for (const part of parts) part();
  window.mockOS = os;
})();
