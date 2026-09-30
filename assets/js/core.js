/*
 * LocalDeck core — shared namespace, utilities, storage layer and UI helpers.
 * Loaded first; every other module attaches itself to window.LocalDeck.
 */
(function () {
  'use strict';

  const LD = (window.LocalDeck = window.LocalDeck || {});

  /* ------------------------------------------------------------------ *
   * Utilities
   * ------------------------------------------------------------------ */
  const pad = (n) => String(n).padStart(2, '0');
  const DAY_MS = 86400000;

  const util = {
    /** Local-time date key, e.g. "2026-09-30". Never UTC, so days roll over at local midnight. */
    dateKey(d = new Date()) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },
    parseKey(key) {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(y, m - 1, d);
    },
    isDateKey(key) {
      return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key);
    },
    startOfDay(d = new Date()) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    },
    addDays(d, n) {
      const x = new Date(d);
      x.setDate(x.getDate() + n);
      return x;
    },
    /** Whole days from a to b; rounding keeps it correct across DST changes. */
    dayDiff(a, b) {
      return Math.round((util.startOfDay(b) - util.startOfDay(a)) / DAY_MS);
    },
    uid() {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        try { return window.crypto.randomUUID(); } catch (_) { /* insecure context */ }
      }
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    },
    escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c]));
    },
    debounce(fn, ms) {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
      };
    },
    hashString(str) {
      let h = 0;
      for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
      return Math.abs(h);
    },
    plural(n, word, pluralWord) {
      return `${n} ${n === 1 ? word : (pluralWord || word + 's')}`;
    },
  };

  /**
   * Tiny DOM builder. Text children are always inserted as text nodes, so user
   * content is never interpreted as HTML. Only the `html` prop sets innerHTML
   * and it is reserved for trusted strings (icons, sanitized markdown).
   */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value == null || value === false) continue;
        if (key === 'class') el.className = value;
        else if (key === 'html') el.innerHTML = value;
        else if (key === 'text') el.textContent = value;
        else if (key === 'dataset') Object.assign(el.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') {
          el.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) {
          el.setAttribute(key, '');
          if (key in el) el[key] = true;
        } else el.setAttribute(key, value);
      }
    }
    appendChildren(el, children);
    return el;
  }
  function appendChildren(el, children) {
    for (const child of children) {
      if (child == null || child === false) continue;
      if (Array.isArray(child)) appendChildren(el, child);
      else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
  }

  /* ------------------------------------------------------------------ *
   * Icons (inline SVG, stroke = currentColor)
   * ------------------------------------------------------------------ */
  const svg = (paths) =>
    `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;

  const icons = {
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
    moon: svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
    download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'),
    upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    pencil: svg('<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>'),
    trash: svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
    refresh: svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
    flame: svg('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
    x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    image: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>'),
    grip: svg('<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>'),
    info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
    alert: svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>'),
  };

  /* ------------------------------------------------------------------ *
   * Storage — every key is namespaced under "localdeck." so the app never
   * touches other data that shares the origin (all of a user's GitHub Pages
   * project sites live on the same <user>.github.io origin).
   * ------------------------------------------------------------------ */
  const PREFIX = 'localdeck.';

  function memoryStorage() {
    const map = new Map();
    return {
      get length() { return map.size; },
      key: (i) => Array.from(map.keys())[i] ?? null,
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => { map.set(k, String(v)); },
      removeItem: (k) => { map.delete(k); },
    };
  }

  let backend;
  let persistent = true;
  try {
    const probe = '__localdeck_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    backend = window.localStorage;
  } catch (_) {
    backend = memoryStorage();
    persistent = false;
  }

  const store = {
    PREFIX,
    persistent,
    get(name, fallback) {
      try {
        const raw = backend.getItem(PREFIX + name);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    },
    set(name, value) {
      try {
        backend.setItem(PREFIX + name, JSON.stringify(value));
        return true;
      } catch (err) {
        ui.toast('Could not save — browser storage is full or blocked.', 'error');
        console.error('[LocalDeck] save failed', name, err);
        return false;
      }
    },
    remove(name) {
      backend.removeItem(PREFIX + name);
    },
    /** Names (without prefix) of every LocalDeck key currently stored. */
    keys() {
      const out = [];
      for (let i = 0; i < backend.length; i++) {
        const k = backend.key(i);
        if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
      }
      return out.sort();
    },
    snapshot() {
      const out = {};
      for (const k of store.keys()) out[k] = store.get(k, null);
      return out;
    },
    /** Replace all LocalDeck keys at once; rolls back if any write fails. */
    replaceAll(data) {
      const previous = {};
      for (const k of store.keys()) previous[k] = backend.getItem(PREFIX + k);
      try {
        for (const k of Object.keys(previous)) backend.removeItem(PREFIX + k);
        for (const [k, v] of Object.entries(data)) backend.setItem(PREFIX + k, JSON.stringify(v));
      } catch (err) {
        for (const k of store.keys()) backend.removeItem(PREFIX + k);
        for (const [k, raw] of Object.entries(previous)) backend.setItem(PREFIX + k, raw);
        throw err;
      }
    },
  };

  /** Small key/value settings object stored under localdeck.settings. */
  const settings = {
    all() {
      const s = store.get('settings', {});
      return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
    },
    get(key, fallback) {
      const s = settings.all();
      return key in s ? s[key] : fallback;
    },
    set(key, value) {
      const s = settings.all();
      if (value === undefined) delete s[key];
      else s[key] = value;
      store.set('settings', s);
    },
  };

  /* ------------------------------------------------------------------ *
   * Event bus — lets modules react to each other without direct coupling.
   * ------------------------------------------------------------------ */
  const target = new EventTarget();
  const bus = {
    on: (type, fn) => target.addEventListener(type, (e) => fn(e.detail)),
    emit: (type, detail) => target.dispatchEvent(new CustomEvent(type, { detail })),
  };

  /* ------------------------------------------------------------------ *
   * UI helpers: toasts, confirm dialog, dialog wiring
   * ------------------------------------------------------------------ */
  const ui = {
    toast(message, type = 'info', timeout = 3200) {
      const region = document.getElementById('toasts');
      if (!region) return;
      const icon = type === 'error' ? icons.alert : type === 'success' ? icons.check : icons.info;
      const el = h('div', { class: `toast toast-${type}`, role: type === 'error' ? 'alert' : 'status' },
        h('span', { class: 'toast-icon', html: icon }),
        h('span', { class: 'toast-msg' }, message));
      region.append(el);
      requestAnimationFrame(() => el.classList.add('is-visible'));
      setTimeout(() => {
        el.classList.remove('is-visible');
        setTimeout(() => el.remove(), 250);
      }, timeout);
    },

    /** Promise-based confirm using the shared #confirmDialog. */
    confirm({ title, message, confirmText = 'Confirm', danger = false }) {
      const dialog = document.getElementById('confirmDialog');
      dialog.querySelector('[data-confirm-title]').textContent = title;
      dialog.querySelector('[data-confirm-message]').textContent = message;
      const ok = dialog.querySelector('[data-confirm-ok]');
      ok.textContent = confirmText;
      ok.classList.toggle('btn-danger', danger);
      ok.classList.toggle('btn-primary', !danger);
      return new Promise((resolve) => {
        dialog.returnValue = '';
        dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
        dialog.showModal();
        ok.focus();
      });
    },

    /** Close a <dialog> when its backdrop is clicked, and wire [data-close] buttons. */
    enhanceDialog(dialog) {
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close('cancel');
      });
      dialog.querySelectorAll('[data-close]').forEach((btn) =>
        btn.addEventListener('click', () => dialog.close('cancel')));
    },
  };

  Object.assign(LD, { util, h, icons, store, settings, bus, ui });
})();
