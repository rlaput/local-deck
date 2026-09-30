/*
 * LocalDeck markdown — a small, dependency-free Markdown renderer.
 *
 * Safety model: every piece of source text is HTML-escaped before any markup
 * is added, and links are only emitted for http(s)/mailto URLs, so the output
 * can be assigned to innerHTML without allowing script injection.
 *
 * Supports: headings, paragraphs, bold, italic, strikethrough, highlight,
 * inline code, fenced code blocks, blockquotes, horizontal rules, ordered and
 * unordered lists, task lists (- [ ] / - [x]) and links / bare URLs.
 */
(function () {
  'use strict';

  const LD = window.LocalDeck;
  const esc = LD.util.escapeHtml;
  const SAFE_URL = /^(https?:\/\/|mailto:)/i;

  function inline(text) {
    let s = esc(text);

    // Protect code spans from further formatting.
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, code) => {
      codes.push(code);
      return `\u0000${codes.length - 1}\u0000`;
    });

    // [label](url)
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) =>
      SAFE_URL.test(url)
        ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : label);

    // Bare URLs (not already inside an attribute or anchor text).
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,
      (_, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);

    s = s
      .replace(/\*\*([^\s*](?:[^*]*[^\s*])?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^\w])__([^\s_](?:[^_]*[^\s_])?)__(?=[^\w]|$)/g, '$1<strong>$2</strong>')
      .replace(/\*([^\s*](?:[^*]*[^\s*])?)\*/g, '<em>$1</em>')
      .replace(/(^|[^\w])_([^\s_](?:[^_]*[^\s_])?)_(?=[^\w]|$)/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/==([^=]+)==/g, '<mark>$1</mark>');

    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  }

  const RE = {
    fence: /^\s*```/,
    blank: /^\s*$/,
    heading: /^(#{1,6})\s+(.*?)\s*#*\s*$/,
    hr: /^\s*([-*_])(\s*\1){2,}\s*$/,
    quote: /^\s*>\s?(.*)$/,
    ul: /^\s*[-*+]\s+(.*)$/,
    ol: /^\s*(\d+)[.)]\s+(.*)$/,
    task: /^\[( |x|X)\]\s+(.*)$/,
  };

  function render(source) {
    const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let para = [];
    let list = null; // 'ul' | 'ol'

    const flushPara = () => {
      if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
      para = [];
    };
    const closeList = () => {
      if (list) out.push(`</${list}>`);
      list = null;
    };
    const openList = (type, start) => {
      if (list === type) return;
      closeList();
      out.push(type === 'ol' && start !== 1 ? `<ol start="${start}">` : `<${type}>`);
      list = type;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;

      if (RE.fence.test(line)) {
        flushPara(); closeList();
        const buf = [];
        while (++i < lines.length && !RE.fence.test(lines[i])) buf.push(lines[i]);
        out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }
      if (RE.blank.test(line)) { flushPara(); closeList(); continue; }
      if ((m = line.match(RE.heading))) {
        flushPara(); closeList();
        const n = m[1].length;
        out.push(`<h${n}>${inline(m[2])}</h${n}>`);
        continue;
      }
      if (RE.hr.test(line)) { flushPara(); closeList(); out.push('<hr>'); continue; }
      if ((m = line.match(RE.quote))) {
        flushPara(); closeList();
        const buf = [m[1]];
        while (i + 1 < lines.length && (m = lines[i + 1].match(RE.quote))) { buf.push(m[1]); i++; }
        out.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`);
        continue;
      }
      if ((m = line.match(RE.ul))) {
        flushPara(); openList('ul');
        const task = m[1].match(RE.task);
        if (task) {
          const checked = task[1] !== ' ';
          out.push(`<li class="task${checked ? ' is-checked' : ''}"><label><input type="checkbox" data-line="${i}"${checked ? ' checked' : ''}><span>${inline(task[2])}</span></label></li>`);
        } else {
          out.push(`<li>${inline(m[1])}</li>`);
        }
        continue;
      }
      if ((m = line.match(RE.ol))) {
        flushPara(); openList('ol', Number(m[1]));
        out.push(`<li>${inline(m[2])}</li>`);
        continue;
      }
      closeList();
      para.push(line.trim());
    }
    flushPara(); closeList();
    return out.join('\n');
  }

  /** Flip the "[ ]" / "[x]" marker on a given source line. */
  function toggleTask(source, lineIndex) {
    const lines = source.split('\n');
    const line = lines[lineIndex];
    if (line == null) return source;
    lines[lineIndex] = line.replace(/^(\s*[-*+]\s+)\[( |x|X)\]/, (_, pre, mark) =>
      `${pre}[${mark === ' ' ? 'x' : ' '}]`);
    return lines.join('\n');
  }

  LD.markdown = { render, toggleTask };
})();
