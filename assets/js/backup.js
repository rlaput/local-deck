/*
 * LocalDeck backup — export every localdeck.* key as a structured JSON file
 * and restore a dashboard from such a file.
 *
 * File format:
 * {
 *   "app": "LocalDeck",
 *   "schemaVersion": 1,
 *   "exportedAt": "2026-09-30T08:15:00.000Z",
 *   "summary": { "habits": 3, "habitCompletions": 42, "links": 8, "noteCharacters": 1234 },
 *   "data": {
 *     "settings": { ... },
 *     "habits":   [ ... ],
 *     "links":    [ ... ],
 *     "notes":    { "content": "...", "updatedAt": "..." }
 *   }
 * }
 */
(function () {
  'use strict';

  const LD = window.LocalDeck;
  const { util, store, ui } = LD;

  const APP = 'LocalDeck';
  const SCHEMA_VERSION = 1;
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const SECTION_ORDER = ['settings', 'habits', 'links', 'notes'];
  const KEY_RE = /^[\w.-]{1,64}$/;

  function sanitizeSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out = {};
    if (value.theme === 'light' || value.theme === 'dark') out.theme = value.theme;
    if (['write', 'split', 'preview'].includes(value.notesMode)) out.notesMode = value.notesMode;
    if (value.quote && util.isDateKey(value.quote.date) && Number.isInteger(value.quote.index)) {
      out.quote = { date: value.quote.date, index: value.quote.index };
    }
    if (value.initialized) out.initialized = true;
    return out;
  }

  const SANITIZERS = {
    settings: sanitizeSettings,
    habits: (v) => LD.habits.sanitize(v),
    links: (v) => LD.launchpad.sanitize(v),
    notes: (v) => LD.notes.sanitize(v),
  };

  function summarize(data) {
    const habits = Array.isArray(data.habits) ? data.habits : [];
    return {
      habits: habits.length,
      habitCompletions: habits.reduce((n, x) => n + Object.keys(x.completions || {}).length, 0),
      links: Array.isArray(data.links) ? data.links.length : 0,
      noteCharacters: data.notes && typeof data.notes.content === 'string' ? data.notes.content.length : 0,
    };
  }

  function buildExport() {
    const snapshot = store.snapshot();
    const data = {};
    for (const k of SECTION_ORDER) if (k in snapshot) data[k] = snapshot[k];
    for (const k of Object.keys(snapshot)) if (!(k in data)) data[k] = snapshot[k];
    return {
      app: APP,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      summary: summarize(data),
      data,
    };
  }

  function exportData() {
    const json = JSON.stringify(buildExport(), null, 2) + '\n';
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `localdeck-backup-${util.dateKey()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ui.toast('Backup downloaded', 'success');
  }

  /** Validate and sanitize a parsed backup. Throws with a user-facing message. */
  function parseBackup(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('That file isn’t a LocalDeck backup.');
    }
    if (payload.app !== APP || !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
      throw new Error('That file isn’t a LocalDeck backup (missing "app" or "data").');
    }
    if (typeof payload.schemaVersion === 'number' && payload.schemaVersion > SCHEMA_VERSION) {
      throw new Error('This backup was made by a newer version of LocalDeck.');
    }
    const data = {};
    for (const [key, value] of Object.entries(payload.data)) {
      if (!KEY_RE.test(key)) continue;
      data[key] = SANITIZERS[key] ? SANITIZERS[key](value) : value;
    }
    data.settings = { ...(data.settings || {}), initialized: true };
    return data;
  }

  async function importFile(file) {
    if (!file) return;
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('That file is too large to be a LocalDeck backup.');
      let payload;
      try {
        payload = JSON.parse(await file.text());
      } catch (_) {
        throw new Error('That file isn’t valid JSON.');
      }
      const data = parseBackup(payload);
      const s = summarize(data);
      const when = payload.exportedAt && !isNaN(Date.parse(payload.exportedAt))
        ? ` from ${new Date(payload.exportedAt).toLocaleString()}` : '';

      const ok = await ui.confirm({
        title: 'Restore this backup?',
        message: `Backup${when}: ${util.plural(s.habits, 'habit')}, ${util.plural(s.links, 'link')}, ` +
          `${util.plural(s.noteCharacters, 'character')} of notes. This replaces everything currently on your dashboard.`,
        confirmText: 'Replace my data',
        danger: true,
      });
      if (!ok) return;

      store.replaceAll(data);
      LD.app.reload();
      ui.toast('Dashboard restored from backup', 'success');
    } catch (err) {
      ui.toast(err.message || 'Import failed.', 'error', 5000);
    }
  }

  function init() {
    const input = document.getElementById('importFile');
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('footerExportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.value = '';
      importFile(file);
    });

    // Dropping a backup file anywhere on the page imports it too.
    document.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
    });
    document.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      e.preventDefault();
      if (/\.json$/i.test(file.name) || file.type === 'application/json') importFile(file);
    });
  }

  LD.backup = { init, buildExport, parseBackup, exportData };
})();
