/*
 * LocalDeck app — boots every module, owns the theme toggle, first-run
 * sample data, midnight rollover and cross-tab sync.
 */
(function () {
  'use strict';

  const LD = window.LocalDeck;
  const { util, icons, store, settings, ui } = LD;

  /* ---------------- theme ---------------- */

  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  function currentTheme() {
    const saved = settings.get('theme', null);
    return saved === 'light' || saved === 'dark' ? saved : systemDark.matches ? 'dark' : 'light';
  }

  function applyTheme() {
    const theme = currentTheme();
    document.documentElement.dataset.theme = theme;
    const btn = document.getElementById('themeToggle');
    const next = theme === 'dark' ? 'light' : 'dark';
    btn.innerHTML = theme === 'dark' ? icons.sun : icons.moon;
    btn.setAttribute('aria-label', `Switch to ${next} mode`);
    btn.title = `Switch to ${next} mode`;
  }

  function toggleTheme() {
    settings.set('theme', currentTheme() === 'dark' ? 'light' : 'dark');
    applyTheme();
  }

  /* ---------------- first run ---------------- */

  const WELCOME_NOTE = `# Brain dump 🧠

Everything here **auto-saves** to this browser as you type.

## Markdown works
- **bold**, _italic_, ~~strike~~, ==highlight== and \`code\`
- [Links](https://github.com) and bare URLs
- [ ] Task lists — tick them in the preview
- [x] Try the Write / Split / Preview toggle

> Shortcuts: Ctrl/⌘ + B, I, K. Press Enter in a list to continue it.
`;

  function seedIfFirstRun() {
    if (store.keys().length > 0) return;
    const today = new Date();
    const past = (n) => util.dateKey(util.addDays(today, -n));
    const created = past(20);
    const history = (days) => Object.fromEntries(days.map((n) => [past(n), true]));

    store.set('habits', [
      { id: util.uid(), name: 'Drink 8 glasses of water', color: '#06b6d4', createdAt: created, completions: history([1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13]) },
      { id: util.uid(), name: 'Read for 20 minutes', color: '#6366f1', createdAt: created, completions: history([1, 2, 4, 5, 8, 9, 15]) },
      { id: util.uid(), name: 'Move / exercise', color: '#10b981', createdAt: created, completions: history([2, 3, 5, 9, 12, 16]) },
    ]);
    store.set('links', [
      { id: util.uid(), title: 'GitHub', url: 'https://github.com/', icon: { type: 'auto', value: '' } },
      { id: util.uid(), title: 'Mail', url: 'https://mail.google.com/', icon: { type: 'emoji', value: '📬' } },
      { id: util.uid(), title: 'Calendar', url: 'https://calendar.google.com/', icon: { type: 'emoji', value: '📅' } },
      { id: util.uid(), title: 'Wikipedia', url: 'https://www.wikipedia.org/', icon: { type: 'auto', value: '' } },
      { id: util.uid(), title: 'MDN', url: 'https://developer.mozilla.org/', icon: { type: 'letter', value: '' } },
    ]);
    store.set('notes', { content: WELCOME_NOTE, updatedAt: null });
    settings.set('initialized', true);
  }

  /* ---------------- lifecycle ---------------- */

  function reload({ external = false } = {}) {
    applyTheme();
    LD.habits.reload();
    LD.launchpad.reload();
    LD.notes.reload({ external });
    LD.stats.render();
  }

  function watchDayRollover() {
    let lastKey = util.dateKey();
    const check = () => {
      const key = util.dateKey();
      if (key === lastKey) return;
      lastKey = key;
      LD.habits.render();
      LD.stats.render();
    };
    setInterval(check, 30000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  }

  function watchOtherTabs() {
    window.addEventListener('storage', (e) => {
      if (e.key !== null && !e.key.startsWith(store.PREFIX)) return;
      reload({ external: true });
    });
  }

  function init() {
    seedIfFirstRun();
    applyTheme();
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    systemDark.addEventListener('change', applyTheme);

    document.querySelectorAll('[data-icon]').forEach((el) => {
      el.insertAdjacentHTML('afterbegin', icons[el.dataset.icon] || '');
    });
    ui.enhanceDialog(document.getElementById('confirmDialog'));

    LD.habits.init();
    LD.launchpad.init();
    LD.notes.init();
    LD.stats.init();
    LD.backup.init();

    watchDayRollover();
    watchOtherTabs();

    if (!store.persistent) {
      document.getElementById('storageWarning').hidden = false;
    }
    document.documentElement.classList.add('is-ready');
  }

  LD.app = { reload };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
