/*
 * LocalDeck habits — daily habit tracker with streaks and a completion matrix.
 *
 * Storage shape (localdeck.habits):
 *   [{ id, name, color, createdAt: "YYYY-MM-DD", completions: { "YYYY-MM-DD": true } }]
 */
(function () {
  'use strict';

  const LD = window.LocalDeck;
  const { util, h, icons, store, ui, bus } = LD;

  const WEEKS = 16;
  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#8b5cf6', '#84cc16'];
  const COLOR_RE = /^#[0-9a-f]{6}$/i;
  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  let habits = [];
  let editingId = null;

  /* ---------------- data ---------------- */

  function cleanCompletions(input) {
    const out = {};
    if (Array.isArray(input)) {
      for (const k of input) if (util.isDateKey(k)) out[k] = true;
    } else if (input && typeof input === 'object') {
      for (const [k, v] of Object.entries(input)) if (v && util.isDateKey(k)) out[k] = true;
    }
    return out;
  }

  function sanitize(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list
      .filter((x) => x && typeof x.name === 'string' && x.name.trim())
      .map((x) => {
        let id = typeof x.id === 'string' && x.id ? x.id : util.uid();
        if (seen.has(id)) id = util.uid();
        seen.add(id);
        return {
          id,
          name: x.name.trim().slice(0, 80),
          color: COLOR_RE.test(x.color) ? x.color : COLORS[0],
          createdAt: util.isDateKey(x.createdAt) ? x.createdAt : util.dateKey(),
          completions: cleanCompletions(x.completions),
        };
      });
  }

  function load() {
    habits = sanitize(store.get('habits', []));
  }

  function save() {
    store.set('habits', habits);
    bus.emit('habits:changed');
  }

  function find(id) {
    return habits.find((x) => x.id === id);
  }

  function toggle(id, key) {
    const habit = find(id);
    if (!habit) return;
    if (habit.completions[key]) delete habit.completions[key];
    else habit.completions[key] = true;
    save();
    render();
  }

  /* ---------------- stats ---------------- */

  function currentStreak(c, today = new Date()) {
    let d = util.startOfDay(today);
    // Today still counts as "in progress": an unfinished today doesn't break the streak.
    if (!c[util.dateKey(d)]) d = util.addDays(d, -1);
    let n = 0;
    while (c[util.dateKey(d)]) {
      n++;
      d = util.addDays(d, -1);
    }
    return n;
  }

  function bestStreak(c) {
    const keys = Object.keys(c).filter((k) => c[k]).sort();
    let best = 0;
    let run = 0;
    let prev = null;
    for (const k of keys) {
      const d = util.parseKey(k);
      run = prev && util.dayDiff(prev, d) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    }
    return best;
  }

  /** Completion rate over the last 30 days (or since creation, if newer). */
  function recentRate(habit, today = new Date()) {
    const created = util.parseKey(habit.createdAt);
    const span = Math.max(1, Math.min(30, util.dayDiff(created, today) + 1));
    let done = 0;
    for (let i = 0; i < span; i++) if (habit.completions[util.dateKey(util.addDays(today, -i))]) done++;
    return Math.round((done / span) * 100);
  }

  function todayProgress() {
    const key = util.dateKey();
    const done = habits.filter((x) => x.completions[key]).length;
    return { done, total: habits.length };
  }

  /* ---------------- rendering ---------------- */

  function renderMatrix(habit, todayKey) {
    const today = util.parseKey(todayKey);
    const mondayOffset = (today.getDay() + 6) % 7; // 0 = Monday
    const start = util.addDays(today, -((WEEKS - 1) * 7 + mondayOffset));
    const cells = [];

    for (let i = 0; i < WEEKS * 7; i++) {
      const date = util.addDays(start, i);
      const key = util.dateKey(date);
      if (date > today) {
        cells.push(h('span', { class: 'cell is-future', 'aria-hidden': 'true' }));
        continue;
      }
      const done = !!habit.completions[key];
      const label = `${dayFmt.format(date)} — ${done ? 'done' : 'not done'}`;
      cells.push(h('button', {
        type: 'button',
        class: `cell${done ? ' is-done' : ''}${key === todayKey ? ' is-today' : ''}`,
        title: `${label} (click to toggle)`,
        'aria-label': `${habit.name}: ${label}`,
        'aria-pressed': String(done),
        tabindex: '-1',
        onclick: () => toggle(habit.id, key),
      }));
    }
    return h('div', { class: 'matrix', role: 'group', 'aria-label': `${habit.name}: last ${WEEKS} weeks` }, cells);
  }

  function renderHabit(habit, todayKey) {
    const done = !!habit.completions[todayKey];
    const streak = currentStreak(habit.completions);
    const best = bestStreak(habit.completions);
    const rate = recentRate(habit);

    return h('li', { class: `habit${done ? ' is-done' : ''}`, style: `--habit-color:${habit.color}`, dataset: { id: habit.id } },
      h('label', { class: 'habit-check', title: done ? 'Done today — click to undo' : 'Mark done for today' },
        h('input', {
          type: 'checkbox',
          checked: done,
          'aria-label': `${habit.name} — done today`,
          onchange: () => toggle(habit.id, todayKey),
        }),
        h('span', { class: 'checkmark', html: icons.check })),
      h('div', { class: 'habit-body' },
        h('div', { class: 'habit-name' }, habit.name),
        h('div', { class: 'habit-meta' },
          h('span', { class: `streak${streak ? ' is-hot' : ''}`, title: 'Current streak' },
            h('span', { html: icons.flame }), util.plural(streak, 'day')),
          h('span', { title: 'Longest streak' }, `Best ${best}`),
          h('span', { title: 'Completion rate, last 30 days' }, `${rate}% · 30d`))),
      renderMatrix(habit, todayKey),
      h('div', { class: 'habit-actions' },
        h('button', { type: 'button', class: 'btn-icon btn-sm', title: 'Edit habit', 'aria-label': `Edit ${habit.name}`, html: icons.pencil, onclick: () => openEditor(habit.id) }),
        h('button', { type: 'button', class: 'btn-icon btn-sm', title: 'Delete habit', 'aria-label': `Delete ${habit.name}`, html: icons.trash, onclick: () => remove(habit.id) })));
  }

  function render() {
    const list = document.getElementById('habitList');
    const todayKey = util.dateKey();
    list.replaceChildren();

    if (!habits.length) {
      list.append(h('li', { class: 'empty' },
        h('p', null, 'No habits yet.'),
        h('p', { class: 'muted' }, 'Add a daily habit and tick it off each day to build a streak.')));
    } else {
      for (const habit of habits) list.append(renderHabit(habit, todayKey));
    }

    const { done, total } = todayProgress();
    document.getElementById('habitSummary').textContent = total ? `${done}/${total} today` : '';
  }

  /* ---------------- editor ---------------- */

  function renderColorOptions(selected) {
    const wrap = document.getElementById('habitColors');
    wrap.replaceChildren(...COLORS.map((c, i) =>
      h('label', { class: 'swatch', style: `--swatch:${c}`, title: c },
        h('input', { type: 'radio', name: 'color', value: c, checked: c === selected, 'aria-label': `Color ${i + 1}` }),
        h('span'))));
  }

  function openEditor(id = null) {
    const dialog = document.getElementById('habitDialog');
    const form = dialog.querySelector('form');
    const habit = id ? find(id) : null;
    editingId = habit ? habit.id : null;

    dialog.querySelector('[data-title]').textContent = habit ? 'Edit habit' : 'New habit';
    form.elements.name.value = habit ? habit.name : '';
    renderColorOptions(habit ? habit.color : COLORS[habits.length % COLORS.length]);
    dialog.showModal();
    form.elements.name.focus();
  }

  function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = form.elements.name.value.trim();
    if (!name) {
      form.elements.name.focus();
      return;
    }
    const color = (form.querySelector('input[name="color"]:checked') || {}).value || COLORS[0];
    const existing = editingId && find(editingId);
    if (existing) {
      existing.name = name.slice(0, 80);
      existing.color = color;
    } else {
      habits.push({ id: util.uid(), name: name.slice(0, 80), color, createdAt: util.dateKey(), completions: {} });
    }
    save();
    render();
    form.closest('dialog').close();
    ui.toast(existing ? 'Habit updated' : 'Habit added', 'success');
  }

  async function remove(id) {
    const habit = find(id);
    if (!habit) return;
    const ok = await ui.confirm({
      title: 'Delete habit?',
      message: `“${habit.name}” and its completion history will be removed.`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    habits = habits.filter((x) => x.id !== id);
    save();
    render();
    ui.toast('Habit deleted');
  }

  function init() {
    load();
    render();
    document.getElementById('addHabitBtn').addEventListener('click', () => openEditor());
    const dialog = document.getElementById('habitDialog');
    ui.enhanceDialog(dialog);
    dialog.querySelector('form').addEventListener('submit', onSubmit);
  }

  function reload() {
    load();
    render();
  }

  LD.habits = { init, reload, render, sanitize, todayProgress, currentStreak, bestStreak, count: () => habits.length };
})();
