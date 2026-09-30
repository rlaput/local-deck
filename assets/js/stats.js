/*
 * LocalDeck quick stats — greeting, date, live clock, today's habit
 * completion ring and the motivational quote generator.
 */
(function () {
  'use strict';

  const LD = window.LocalDeck;
  const { util, settings, bus } = LD;

  const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const RING_CIRCUMFERENCE = 2 * Math.PI * 42;

  function greeting(hour) {
    if (hour < 5) return 'Good night';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function renderClock() {
    const now = new Date();
    document.getElementById('greeting').textContent = greeting(now.getHours());
    document.getElementById('todayDate').textContent = dateFmt.format(now);
    const clock = document.getElementById('clock');
    clock.textContent = timeFmt.format(now);
    clock.dateTime = now.toISOString();
  }

  function renderProgress() {
    const { done, total } = LD.habits.todayProgress();
    const pct = total ? Math.round((done / total) * 100) : 0;
    const ring = document.getElementById('progressRing');
    ring.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - pct / 100));
    document.getElementById('progressPct').textContent = total ? `${pct}%` : '—';
    document.getElementById('progressWrap').classList.toggle('is-complete', total > 0 && done === total);
    document.getElementById('progressWrap').setAttribute('aria-valuenow', String(pct));

    let label;
    if (!total) label = 'Add a habit to start tracking';
    else if (done === total) label = `All ${total} habits done — nice work!`;
    else label = `${done} of ${util.plural(total, 'habit')} done`;
    document.getElementById('progressLabel').textContent = label;
  }

  /* ---------------- quotes ---------------- */

  function currentQuoteIndex() {
    const quotes = LD.quotes;
    const saved = settings.get('quote', null);
    const today = util.dateKey();
    if (saved && saved.date === today && Number.isInteger(saved.index) && quotes[saved.index]) return saved.index;
    // One deterministic "quote of the day" until the user asks for another.
    return util.hashString(today) % quotes.length;
  }

  function showQuote(index, animate) {
    const q = LD.quotes[index];
    const fig = document.getElementById('quote');
    const apply = () => {
      document.getElementById('quoteText').textContent = q.text;
      document.getElementById('quoteAuthor').textContent = q.author;
      fig.classList.remove('is-changing');
    };
    if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fig.classList.add('is-changing');
      setTimeout(apply, 180);
    } else apply();
  }

  function nextQuote() {
    const current = currentQuoteIndex();
    let next = current;
    while (LD.quotes.length > 1 && next === current) next = Math.floor(Math.random() * LD.quotes.length);
    settings.set('quote', { date: util.dateKey(), index: next });
    showQuote(next, true);
  }

  function render() {
    renderClock();
    renderProgress();
    showQuote(currentQuoteIndex(), false);
  }

  function init() {
    render();
    document.getElementById('newQuoteBtn').addEventListener('click', nextQuote);
    bus.on('habits:changed', renderProgress);
    setInterval(renderClock, 15000);
  }

  LD.stats = { init, render, renderProgress };
})();
