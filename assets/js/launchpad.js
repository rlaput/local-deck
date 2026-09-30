/*
 * LocalDeck launchpad — a grid of custom bookmarks with custom icons.
 *
 * Storage shape (localdeck.links):
 *   [{ id, title, url, icon: { type: 'auto'|'emoji'|'image'|'letter', value } }]
 *
 * Icon types:
 *   auto   — the site's own /favicon.ico (no third-party favicon service)
 *   emoji  — any emoji / short text
 *   image  — an http(s) image URL, or an uploaded image stored as a data: URL
 *   letter — a colored tile with the title's first letter
 */
(function () {
  'use strict';

  const LD = window.LocalDeck;
  const { util, h, icons, store, ui } = LD;

  const ICON_TYPES = ['auto', 'emoji', 'image', 'letter'];
  const TILE_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6'];
  const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[a-z0-9+/=\s]+$/i;
  const MAX_DATA_URL = 200_000;

  let links = [];
  let editMode = false;
  let editingId = null;
  let draggingId = null;
  let draft = null; // icon state while the editor is open

  /* ---------------- url + icon helpers ---------------- */

  /** Normalize user input into a safe URL, or return null. */
  function normalizeUrl(input) {
    let s = String(input || '').trim();
    if (!s) return null;
    if (s.startsWith('//')) s = 'https:' + s;
    else if (!/^(https?:\/\/|ftp:\/\/|file:\/\/|mailto:)/i.test(s)) s = 'https://' + s;
    try {
      const url = new URL(s);
      if (!['http:', 'https:', 'ftp:', 'file:', 'mailto:'].includes(url.protocol)) return null;
      if (['http:', 'https:', 'ftp:'].includes(url.protocol) && !url.hostname) return null;
      return url.href;
    } catch (_) {
      return null;
    }
  }

  function safeImageSrc(value) {
    const v = String(value || '').trim();
    if (DATA_IMAGE_RE.test(v) && v.length <= MAX_DATA_URL) return v;
    try {
      const url = new URL(v);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch (_) {
      return null;
    }
  }

  function faviconFor(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'http:' || u.protocol === 'https:' ? `${u.origin}/favicon.ico` : null;
    } catch (_) {
      return null;
    }
  }

  function titleFromUrl(url) {
    try {
      const u = new URL(url);
      if (u.protocol === 'mailto:') return u.pathname;
      const host = u.hostname.replace(/^www\./, '');
      const name = host.split('.')[0] || host;
      return name.charAt(0).toUpperCase() + name.slice(1);
    } catch (_) {
      return '';
    }
  }

  function firstGlyph(str) {
    return (Array.from(String(str || '').trim())[0] || '?').toUpperCase();
  }

  function renderIcon(link) {
    const wrap = h('span', { class: 'tile-icon', 'aria-hidden': 'true' });
    const asLetter = () => {
      wrap.className = 'tile-icon is-letter';
      wrap.style.setProperty('--tile-color', TILE_COLORS[util.hashString(link.title || link.url) % TILE_COLORS.length]);
      wrap.replaceChildren(firstGlyph(link.title || titleFromUrl(link.url)));
    };
    const { type, value } = link.icon || {};

    if (type === 'emoji' && value) {
      wrap.classList.add('is-emoji');
      wrap.textContent = value;
    } else if (type === 'image' || type === 'auto' || !type) {
      const src = type === 'image' ? safeImageSrc(value) : faviconFor(link.url);
      if (!src) asLetter();
      else {
        const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false' });
        img.addEventListener('error', asLetter, { once: true });
        wrap.append(img);
      }
    } else {
      asLetter();
    }
    return wrap;
  }

  /* ---------------- data ---------------- */

  function sanitize(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const x of list) {
      if (!x || typeof x !== 'object') continue;
      const url = normalizeUrl(x.url);
      if (!url) continue;
      let id = typeof x.id === 'string' && x.id ? x.id : util.uid();
      if (seen.has(id)) id = util.uid();
      seen.add(id);

      const rawIcon = x.icon && typeof x.icon === 'object' ? x.icon : {};
      let type = ICON_TYPES.includes(rawIcon.type) ? rawIcon.type : 'auto';
      let value = typeof rawIcon.value === 'string' ? rawIcon.value : '';
      if (type === 'emoji') value = Array.from(value.trim()).slice(0, 4).join('');
      if (type === 'image') value = safeImageSrc(value) || '';
      if ((type === 'emoji' || type === 'image') && !value) type = 'auto';
      if (type === 'auto' || type === 'letter') value = '';

      out.push({
        id,
        title: (typeof x.title === 'string' && x.title.trim() ? x.title.trim() : titleFromUrl(url)).slice(0, 60),
        url,
        icon: { type, value },
      });
    }
    return out;
  }

  function load() {
    links = sanitize(store.get('links', []));
  }

  function save() {
    store.set('links', links);
  }

  const find = (id) => links.find((x) => x.id === id);

  /* ---------------- grid ---------------- */

  function renderTile(link) {
    const tile = h('li', { class: 'tile', dataset: { id: link.id }, draggable: editMode ? 'true' : null },
      h('a', {
        class: 'tile-link',
        href: link.url,
        title: editMode ? `Edit ${link.title}` : link.url,
        draggable: editMode ? 'false' : null,
        onclick: editMode ? (e) => { e.preventDefault(); openEditor(link.id); } : null,
      },
      renderIcon(link),
      h('span', { class: 'tile-title' }, link.title)),
      editMode && h('div', { class: 'tile-actions' },
        h('button', { type: 'button', class: 'tile-btn', title: 'Edit', 'aria-label': `Edit ${link.title}`, html: icons.pencil, onclick: () => openEditor(link.id) }),
        h('button', { type: 'button', class: 'tile-btn is-danger', title: 'Remove', 'aria-label': `Remove ${link.title}`, html: icons.x, onclick: () => remove(link.id) })));

    if (editMode) {
      tile.addEventListener('dragstart', (e) => {
        draggingId = link.id;
        tile.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', link.id);
      });
      tile.addEventListener('dragend', () => {
        draggingId = null;
        document.querySelectorAll('.tile.is-drop-target').forEach((t) => t.classList.remove('is-drop-target'));
        tile.classList.remove('is-dragging');
      });
      tile.addEventListener('dragover', (e) => {
        if (!draggingId || draggingId === link.id) return;
        e.preventDefault();
        tile.classList.add('is-drop-target');
      });
      tile.addEventListener('dragleave', () => tile.classList.remove('is-drop-target'));
      tile.addEventListener('drop', (e) => {
        e.preventDefault();
        tile.classList.remove('is-drop-target');
        move(draggingId, link.id);
      });
    }
    return tile;
  }

  function render() {
    const grid = document.getElementById('linkGrid');
    const card = document.getElementById('launchpad');
    card.classList.toggle('is-editing', editMode);

    const toggle = document.getElementById('editLinksBtn');
    toggle.setAttribute('aria-pressed', String(editMode));
    toggle.innerHTML = `${editMode ? icons.check : icons.pencil}<span>${editMode ? 'Done' : 'Edit'}</span>`;
    toggle.hidden = links.length === 0 && !editMode;

    const hint = document.getElementById('launchpadHint');
    hint.hidden = !editMode;

    grid.replaceChildren(
      ...links.map(renderTile),
      h('li', { class: 'tile tile-add' },
        h('button', { type: 'button', class: 'tile-link', onclick: () => openEditor() },
          h('span', { class: 'tile-icon', html: icons.plus }),
          h('span', { class: 'tile-title' }, 'Add link'))));
  }

  function move(fromId, toId) {
    const from = links.findIndex((x) => x.id === fromId);
    const to = links.findIndex((x) => x.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const [item] = links.splice(from, 1);
    links.splice(to, 0, item);
    save();
    render();
  }

  async function remove(id) {
    const link = find(id);
    if (!link) return;
    const ok = await ui.confirm({
      title: 'Remove link?',
      message: `“${link.title}” will be removed from your launchpad.`,
      confirmText: 'Remove',
      danger: true,
    });
    if (!ok) return;
    links = links.filter((x) => x.id !== id);
    if (!links.length) editMode = false;
    save();
    render();
  }

  /* ---------------- editor ---------------- */

  function form() {
    return document.getElementById('linkDialog').querySelector('form');
  }

  function syncEditorUi() {
    const f = form();
    f.querySelectorAll('[data-icon-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.iconPanel !== draft.type;
    });
    f.querySelectorAll('input[name="iconType"]').forEach((r) => { r.checked = r.value === draft.type; });
    updatePreview();
  }

  function updatePreview() {
    const f = form();
    const url = normalizeUrl(f.elements.url.value) || 'https://example.com';
    const title = f.elements.title.value.trim() || titleFromUrl(url) || 'Link';
    let value = '';
    if (draft.type === 'emoji') value = f.elements.emoji.value.trim();
    if (draft.type === 'image') value = draft.upload || f.elements.imageUrl.value.trim();
    const preview = document.getElementById('linkPreview');
    preview.replaceChildren(renderIcon({ title, url, icon: { type: draft.type, value } }), h('span', { class: 'tile-title' }, title));
  }

  function openEditor(id = null) {
    const dialog = document.getElementById('linkDialog');
    const f = form();
    const link = id ? find(id) : null;
    editingId = link ? link.id : null;

    dialog.querySelector('[data-title]').textContent = link ? 'Edit link' : 'New link';
    f.reset();
    f.elements.title.value = link ? link.title : '';
    f.elements.url.value = link ? link.url : '';
    const icon = link ? link.icon : { type: 'auto', value: '' };
    draft = { type: icon.type, upload: null };
    if (icon.type === 'emoji') f.elements.emoji.value = icon.value;
    if (icon.type === 'image') {
      if (icon.value.startsWith('data:')) draft.upload = icon.value;
      else f.elements.imageUrl.value = icon.value;
    }
    document.getElementById('linkUrlError').hidden = true;
    syncEditorUi();
    dialog.showModal();
    (link ? f.elements.title : f.elements.url).focus();
  }

  /** Downscale an uploaded image to a small square PNG so it fits comfortably in localStorage. */
  function readIconFile(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));
      if (file.size > 5 * 1024 * 1024) return reject(new Error('Image is larger than 5 MB.'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('That image could not be decoded.'));
        img.onload = () => {
          const size = 96;
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = size;
          const ctx = canvas.getContext('2d');
          const scale = Math.min(size / (img.naturalWidth || size), size / (img.naturalHeight || size));
          const w = (img.naturalWidth || size) * scale;
          const hgt = (img.naturalHeight || size) * scale;
          ctx.drawImage(img, (size - w) / 2, (size - hgt) / 2, w, hgt);
          resolve(canvas.toDataURL('image/png'));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function onSubmit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const url = normalizeUrl(f.elements.url.value);
    const err = document.getElementById('linkUrlError');
    if (!url) {
      err.hidden = false;
      f.elements.url.focus();
      return;
    }
    err.hidden = true;

    let icon = { type: draft.type, value: '' };
    if (draft.type === 'emoji') icon.value = Array.from(f.elements.emoji.value.trim()).slice(0, 4).join('');
    if (draft.type === 'image') icon.value = draft.upload || safeImageSrc(f.elements.imageUrl.value) || '';
    if ((icon.type === 'emoji' || icon.type === 'image') && !icon.value) icon = { type: 'auto', value: '' };

    const title = (f.elements.title.value.trim() || titleFromUrl(url) || url).slice(0, 60);
    const existing = editingId && find(editingId);
    if (existing) Object.assign(existing, { title, url, icon });
    else links.push({ id: util.uid(), title, url, icon });

    save();
    render();
    f.closest('dialog').close();
    ui.toast(existing ? 'Link updated' : 'Link added', 'success');
  }

  function init() {
    load();
    render();

    document.getElementById('addLinkBtn').addEventListener('click', () => openEditor());
    document.getElementById('editLinksBtn').addEventListener('click', () => {
      editMode = !editMode;
      render();
    });

    const dialog = document.getElementById('linkDialog');
    ui.enhanceDialog(dialog);
    const f = form();
    f.addEventListener('submit', onSubmit);
    f.addEventListener('input', (e) => {
      if (e.target.name === 'iconType') {
        draft.type = e.target.value;
        syncEditorUi();
      } else if (e.target.name === 'imageUrl') {
        draft.upload = null;
        updatePreview();
      } else if (e.target.name !== 'iconFile') {
        updatePreview();
      }
    });
    f.elements.url.addEventListener('blur', () => {
      const url = normalizeUrl(f.elements.url.value);
      if (url && !f.elements.title.value.trim()) {
        f.elements.title.value = titleFromUrl(url);
        updatePreview();
      }
    });
    f.elements.iconFile.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        draft.upload = await readIconFile(file);
        f.elements.imageUrl.value = '';
        updatePreview();
      } catch (err) {
        ui.toast(err.message, 'error');
      } finally {
        e.target.value = '';
      }
    });
    document.getElementById('iconUploadBtn').addEventListener('click', () => f.elements.iconFile.click());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && editMode && !document.querySelector('dialog[open]')) {
        editMode = false;
        render();
      }
    });
  }

  function reload() {
    load();
    render();
  }

  LD.launchpad = { init, reload, sanitize, normalizeUrl, count: () => links.length };
})();
