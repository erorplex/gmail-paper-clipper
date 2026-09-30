/*
 * A small Markdown subset for thread notes: headings, lists, tasks, bold, italic, code and links.
 * Produces a plain tree that content.js turns into DOM nodes with textContent only, so note text is
 * never parsed as HTML. The note itself stays plain text in storage.
 * Runs as a content script (exports to globalThis.PaperClipper) and under Node for tests.
 */
(function (exports) {
  'use strict';

  const HEADING = /^(#{1,3})\s+(\S.*)$/;
  const TASK = /^\s*[-*+]\s+\[([ xX])\](?:\s+(.*))?$/;
  const BULLET = /^\s*[-*+]\s+(.*)$/;
  const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

  // Leftmost match wins; at the same position the earlier alternative does.
  const INLINE = new RegExp(
    [
      '`([^`\\n]+)`', // 1 code
      '\\[([^\\]\\n]+)\\]\\(([^()\\s]*(?:\\([^()\\s]*\\)[^()\\s]*)*)\\)', // 2 text, 3 url of [text](url)
      '((?:https?:\\/\\/|mailto:|www\\.)[^\\s<>]+)', // 4 bare url
      '\\*\\*(?=\\S)([\\s\\S]*?\\S)\\*\\*(?!\\*)', // 5 bold
      '\\*(?=[^\\s*])([^*\\n]*?[^\\s*])\\*', // 6 italic
    ].join('|'),
    'g'
  );

  function safeHref(url) {
    const value = String(url || '').trim();
    if (/^www\./i.test(value)) return `https://${value}`;
    return /^(https?:\/\/[^\s]+|mailto:[^\s]+)$/i.test(value) ? value : null;
  }

  // A bare URL ends before trailing punctuation and before a closing bracket it did not open.
  function trimUrl(url) {
    let out = url;
    for (;;) {
      const last = out.slice(-1);
      if ('.,;:!?\'"'.includes(last)) out = out.slice(0, -1);
      else if (last === ')' && out.split('(').length < out.split(')').length) out = out.slice(0, -1);
      else return out;
    }
  }

  function parseInline(text) {
    const out = [];
    const pushText = (value) => {
      if (!value) return;
      const prev = out[out.length - 1];
      if (prev && prev.type === 'text') prev.text += value;
      else out.push({ type: 'text', text: value });
    };
    const re = new RegExp(INLINE.source, 'g');
    let pos = 0;
    let m;
    while ((m = re.exec(text))) {
      pushText(text.slice(pos, m.index));
      let raw = m[0];
      if (m[1] !== undefined) {
        out.push({ type: 'code', text: m[1] });
      } else if (m[2] !== undefined) {
        const href = safeHref(m[3]);
        if (href) out.push({ type: 'link', href, children: [{ type: 'text', text: m[2] }] });
        else pushText(raw);
      } else if (m[4] !== undefined) {
        raw = trimUrl(m[4]);
        out.push({ type: 'link', href: safeHref(raw), children: [{ type: 'text', text: raw }] });
      } else if (m[5] !== undefined) {
        out.push({ type: 'bold', children: parseInline(m[5]) });
      } else {
        out.push({ type: 'italic', children: parseInline(m[6]) });
      }
      pos = m.index + raw.length;
      re.lastIndex = pos;
    }
    pushText(text.slice(pos));
    return out;
  }

  // Blocks keep the source line of every list item, so a task checkbox can write back into the text.
  function parseNote(text) {
    const blocks = [];
    let list = null;
    let paragraph = null;
    String(text || '')
      .split('\n')
      .forEach((line, index) => {
        const heading = HEADING.exec(line);
        const task = !heading && TASK.exec(line);
        const bullet = !heading && !task && BULLET.exec(line);
        const numbered = !heading && !task && !bullet && NUMBERED.exec(line);
        if (task || bullet || numbered) {
          paragraph = null;
          const ordered = !!numbered;
          if (!list || list.ordered !== ordered) {
            list = { type: 'list', ordered, items: [] };
            blocks.push(list);
          }
          const content = task ? task[2] || '' : (bullet || numbered)[1];
          list.items.push({
            task: task ? (task[1] === ' ' ? 'open' : 'done') : null,
            line: index,
            children: parseInline(content),
          });
          return;
        }
        list = null;
        if (heading) {
          paragraph = null;
          blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2]) });
        } else if (!line.trim()) {
          paragraph = null;
        } else {
          if (!paragraph) {
            paragraph = { type: 'paragraph', lines: [] };
            blocks.push(paragraph);
          }
          paragraph.lines.push(parseInline(line));
        }
      });
    return blocks;
  }

  function toggleTask(text, lineIndex) {
    const lines = String(text).split('\n');
    const line = lines[lineIndex];
    if (line === undefined || !TASK.test(line)) return text;
    lines[lineIndex] = line.replace(/^(\s*[-*+]\s+\[)([ xX])\]/, (_, head, mark) => `${head}${mark === ' ' ? 'x' : ' '}]`);
    return lines.join('\n');
  }

  Object.assign(exports, { parseNote, parseInline, safeHref, toggleTask });
})(typeof module !== 'undefined' ? module.exports : (globalThis.PaperClipper = globalThis.PaperClipper || {}));
