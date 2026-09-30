/*
 * LocalDeck notes — Markdown-friendly brain dump scratchpad.
 * Saves to localStorage on every keystroke (localdeck.notes).
 *
 * Storage shape: { content: string, updatedAt: ISO string | null }
 */
(function () {
  'use strict';

  const LD = window.LocalDeck;
  const { util, store, settings, ui, markdown } = LD;

  const MODES = ['write', 'split', 'preview'];
  const MAX_LENGTH = 1_000_000;
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

  let note = { content: '', updatedAt: null };
  let els = {};
  let mode = 'split';

  function sanitize(value) {
    if (typeof value === 'string') return { content: value.slice(0, MAX_LENGTH), updatedAt: null };
    if (!value || typeof value !== 'object') return { content: '', updatedAt: null };
    return {
      content: typeof value.content === 'string' ? value.content.slice(0, MAX_LENGTH) : '',
      updatedAt: typeof value.updatedAt === 'string' && !isNaN(Date.parse(value.updatedAt)) ? value.updatedAt : null,
    };
  }

  function load() {
    note = sanitize(store.get('notes', note));
  }

  /* ---------------- rendering ---------------- */

  function renderPreview() {
    if (mode === 'write') return;
    const html = markdown.render(note.content);
    els.preview.innerHTML = html || '<p class="muted">Nothing here yet — start typing on the left.</p>';
  }
  const renderPreviewSoon = util.debounce(renderPreview, 120);

  function renderStatus(saved) {
    const text = note.content;
    const words = (text.match(/\S+/g) || []).length;
    els.count.textContent = `${util.plural(words, 'word')} · ${util.plural(text.length, 'char')}`;
    if (!note.updatedAt) {
      els.status.textContent = 'Auto-saves as you type';
    } else {
      els.status.textContent = `${saved === false ? 'Not saved' : 'Saved'} · ${timeFmt.format(new Date(note.updatedAt))}`;
    }
    els.status.classList.toggle('is-error', saved === false);
  }

  function setMode(next) {
    mode = MODES.includes(next) ? next : 'split';
    els.editor.dataset.mode = mode;
    els.modeButtons.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode)));
    renderPreview();
  }

  function render() {
    if (els.input.value !== note.content) els.input.value = note.content;
    renderPreview();
    renderStatus();
  }

  /* ---------------- persistence ---------------- */

  function persist() {
    note.content = els.input.value;
    note.updatedAt = new Date().toISOString();
    const ok = store.set('notes', note);
    renderStatus(ok);
    renderPreviewSoon();
  }

  /* ---------------- editing helpers ---------------- */

  /** Insert text via execCommand so the browser undo stack keeps working. */
  function insertText(text) {
    const ta = els.input;
    ta.focus();
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (_) { ok = false; }
    if (!ok) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function deleteSelection() {
    const ta = els.input;
    let ok = false;
    try { ok = document.execCommand('delete', false); } catch (_) { ok = false; }
    if (!ok) {
      ta.setRangeText('', ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function wrap(before, after, placeholder) {
    const ta = els.input;
    const start = ta.selectionStart;
    const selected = ta.value.slice(start, ta.selectionEnd) || placeholder;
    insertText(before + selected + after);
    ta.setSelectionRange(start + before.length, start + before.length + selected.length);
  }

  function prefixLines(prefix) {
    const ta = els.input;
    const value = ta.value;
    const start = value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let end = value.indexOf('\n', ta.selectionEnd);
    if (end === -1) end = value.length;
    const lines = value.slice(start, end).split('\n');
    const allPrefixed = lines.every((l) => l.startsWith(prefix));
    const next = lines.map((l) => (allPrefixed ? l.slice(prefix.length) : prefix + l)).join('\n');
    ta.setSelectionRange(start, end);
    insertText(next);
    ta.setSelectionRange(start, start + next.length);
  }

  const ACTIONS = {
    bold: () => wrap('**', '**', 'bold text'),
    italic: () => wrap('_', '_', 'italic text'),
    strike: () => wrap('~~', '~~', 'struck text'),
    code: () => wrap('`', '`', 'code'),
    link: () => {
      const ta = els.input;
      const start = ta.selectionStart;
      const label = ta.value.slice(start, ta.selectionEnd) || 'link text';
      insertText(`[${label}](https://)`);
      const urlStart = start + label.length + 3;
      ta.setSelectionRange(urlStart, urlStart + 8);
    },
    heading: () => prefixLines('## '),
    bullet: () => prefixLines('- '),
    task: () => prefixLines('- [ ] '),
    quote: () => prefixLines('> '),
  };

  /** Continue lists on Enter; an Enter on an empty list item ends the list. */
  function continueList(e) {
    const ta = els.input;
    if (ta.selectionStart !== ta.selectionEnd) return;
    const pos = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', pos - 1) + 1;
    const line = ta.value.slice(lineStart, pos);
    const m = line.match(/^(\s*)([-*+] \[[ xX]\] |[-*+] |(\d+)([.)]) |> )/);
    if (!m) return;
    e.preventDefault();
    if (line.trim() === m[0].trim()) {
      ta.setSelectionRange(lineStart, pos);
      deleteSelection();
      return;
    }
    let marker = m[2];
    if (m[3]) marker = `${Number(m[3]) + 1}${m[4]} `;
    marker = marker.replace(/\[[xX]\]/, '[ ]');
    insertText('\n' + m[1] + marker);
  }

  function onKeydown(e) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey) {
      const key = e.key.toLowerCase();
      const action = { b: 'bold', i: 'italic', k: 'link' }[key];
      if (action) {
        e.preventDefault();
        ACTIONS[action]();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !mod && !e.isComposing) continueList(e);
  }

  function onPreviewChange(e) {
    const box = e.target;
    if (!box.matches('input[type="checkbox"][data-line]')) return;
    els.input.value = markdown.toggleTask(els.input.value, Number(box.dataset.line));
    persist();
    renderPreview();
  }

  async function clearNote() {
    if (!els.input.value) return;
    const ok = await ui.confirm({
      title: 'Clear scratchpad?',
      message: 'Everything in the brain dump will be erased. Export first if you want a backup.',
      confirmText: 'Clear',
      danger: true,
    });
    if (!ok) return;
    els.input.value = '';
    persist();
    renderPreview();
  }

  function init() {
    els = {
      editor: document.getElementById('noteEditor'),
      input: document.getElementById('noteInput'),
      preview: document.getElementById('notePreview'),
      status: document.getElementById('noteStatus'),
      count: document.getElementById('noteCount'),
      modeButtons: Array.from(document.querySelectorAll('[data-note-mode]')),
    };
    els.modeButtons.forEach((btn) => {
      btn.dataset.mode = btn.dataset.noteMode;
      btn.addEventListener('click', () => {
        setMode(btn.dataset.mode);
        settings.set('notesMode', mode);
      });
    });
    document.querySelectorAll('[data-md]').forEach((btn) =>
      btn.addEventListener('click', () => ACTIONS[btn.dataset.md]()));
    document.getElementById('clearNoteBtn').addEventListener('click', clearNote);

    els.input.addEventListener('input', persist);
    els.input.addEventListener('keydown', onKeydown);
    els.preview.addEventListener('change', onPreviewChange);

    load();
    setMode(settings.get('notesMode', 'split'));
    render();
  }

  /** Re-read from storage (import, or an edit in another tab). */
  function reload({ external = false } = {}) {
    // Don't yank text out from under someone typing in this tab.
    if (external && document.activeElement === els.input) return;
    load();
    setMode(settings.get('notesMode', mode));
    render();
  }

  LD.notes = { init, reload, sanitize };
})();
