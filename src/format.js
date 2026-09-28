/*
 * Turns parsed messages into clipboard text and the file list for the Mac helper.
 * Runs as a content script (exports to globalThis.PaperClipper) and under Node for tests.
 */
(function (exports) {
  'use strict';

  const LABELS = {
    de: {
      subject: 'Betreff',
      from: 'Von',
      to: 'An',
      cc: 'Cc',
      bcc: 'Bcc',
      replyTo: 'Antwort an',
      date: 'Datum',
      attachments: 'Anhänge',
      thread: 'Verlauf',
      messages: (n) => (n === 1 ? '1 Nachricht' : `${n} Nachrichten`),
      noSubject: '(kein Betreff)',
    },
    en: {
      subject: 'Subject',
      from: 'From',
      to: 'To',
      cc: 'Cc',
      bcc: 'Bcc',
      replyTo: 'Reply-To',
      date: 'Date',
      attachments: 'Attachments',
      thread: 'Thread',
      messages: (n) => (n === 1 ? '1 message' : `${n} messages`),
      noSubject: '(no subject)',
    },
  };
  const SEPARATOR = '─'.repeat(40);
  const LINK_MAX_LENGTH = 150;

  function labelsFor(locale) {
    return String(locale || 'de').toLowerCase().startsWith('de') ? LABELS.de : LABELS.en;
  }

  const ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', shy: '', zwnj: '', zwj: '',
    auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
    eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', ccedil: 'ç',
    euro: '€', ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·', deg: '°', times: '×',
    copy: '©', reg: '®', trade: '™', sect: '§', para: '¶',
    laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', sbquo: '‚', lsquo: '‘', rsquo: '’',
    ensp: ' ', emsp: ' ', thinsp: ' ',
  };

  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        // Lone surrogates would make the text invalid JSON for the helper.
        if (!code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '\ufffd';
        return String.fromCodePoint(code);
      }
      return Object.prototype.hasOwnProperty.call(ENTITIES, e) ? ENTITIES[e] : m;
    });
  }

  function normalizeText(s) {
    return s
      .replace(/\r\n?/g, '\n')
      .replace(/[\u200b-\u200d\u2060\ufeff\u034f\u00ad]/g, '')
      .replace(/[ \t\u00a0]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function sameLink(label, href) {
    const bare = (s) => s.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
    return bare(label) === bare(href);
  }

  const SKIPPED_TAGS = new Set(['head', 'style', 'script', 'title']);
  const PARAGRAPH_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'blockquote', 'pre']);
  const LINE_END_TAGS = new Set(['div', 'tr', 'section', 'article', 'header', 'footer', 'address']);

  function hrefOf(attrs) {
    const m = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    return m ? decodeEntities(m[1] ?? m[2] ?? m[3]).trim() : '';
  }

  // One pass with indexOf instead of regexes over the whole document: a hostile mail with thousands
  // of unclosed tags or comments must not freeze Gmail while copying.
  function htmlToText(html) {
    const out = [];
    const links = [];
    let skip = null;
    let i = 0;
    const text = (chunk) => skip || out.push(chunk.replace(/\s+/g, ' '));
    while (i < html.length) {
      const lt = html.indexOf('<', i);
      if (lt === -1) {
        text(html.slice(i));
        break;
      }
      text(html.slice(i, lt));
      if (html.startsWith('<!--', lt)) {
        const end = html.indexOf('-->', lt + 4);
        if (end === -1) break;
        i = end + 3;
        continue;
      }
      const gt = html.indexOf('>', lt + 1);
      if (gt === -1) {
        text(html.slice(lt));
        break;
      }
      i = gt + 1;
      const tag = /^(\/?)([a-z][a-z0-9]*)\b([\s\S]*)$/i.exec(html.slice(lt + 1, gt));
      if (!tag) {
        text(html.slice(lt, gt + 1)); // a literal "<", as in "1 < 2 und 3 > 2"
        continue;
      }
      const closing = tag[1] === '/';
      const name = tag[2].toLowerCase();
      if (skip) {
        if (closing && name === skip) skip = null;
      } else if (SKIPPED_TAGS.has(name)) {
        if (!closing && !/\/\s*$/.test(tag[3])) skip = name;
      } else if (name === 'br') {
        out.push('\n');
      } else if (name === 'hr') {
        out.push('\n---\n');
      } else if (name === 'li') {
        if (!closing) out.push('\n- ');
      } else if (PARAGRAPH_TAGS.has(name)) {
        out.push('\n\n');
      } else if (LINE_END_TAGS.has(name)) {
        if (closing) out.push('\n');
      } else if (name === 'td' || name === 'th') {
        if (closing) out.push(' ');
      } else if (name === 'a') {
        if (!closing) links.push({ href: hrefOf(tag[3]), start: out.length });
        else if (links.length) {
          const { href, start } = links.pop();
          const label = decodeEntities(out.slice(start).join('')).trim();
          if (/^https?:/i.test(href) && href.length <= LINK_MAX_LENGTH && label && !sameLink(label, href)) out.push(` (${href})`);
        }
      }
    }
    const s = decodeEntities(out.join('')).replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
    return normalizeText(s.split('\n').map((line) => line.trim()).join('\n'));
  }

  // Plain text is what the sender wrote; some senders only put "view in browser" stubs there.
  function bodyText(msg) {
    const plain = normalizeText(msg.text || '');
    if (plain.length >= 200 || !msg.html) return plain;
    const fromHtml = htmlToText(msg.html);
    if (!plain) return fromHtml;
    return fromHtml.length > 1000 ? fromHtml : plain;
  }

  const REPLY_MARKERS = [
    // "Am Mo., 28. Sept. 2026 um 14:03 Uhr schrieb Max <max@x.de>:" (Gmail wraps it onto two lines)
    /^(?:On|Am|Le|El|Il|Op)\s(?:[^\n]|\n(?!\n)){0,250}?(?:wrote|schrieb|a écrit|escribió|ha scritto|schreef)(?:[^\n]|\n(?!\n)){0,120}?:[ \t]*$/gm,
    /^-{2,}\s*(?:Original Message|Ursprüngliche Nachricht|Originalnachricht)\s*-{2,}[ \t]*$/gim,
    /^_{20,}[ \t]*\n(?:From|Von|De):\s/gm,
    /^(?:From|Von):\s[^\n]+\n(?:Sent|Gesendet|Date|Datum):\s/gm,
  ];
  const FORWARD_SUBJECT = /^\s*(fwd?|wg|tr|rv)\s*:/i;
  const FORWARD_MARKER = /(forwarded message|weitergeleitete nachricht|begin forwarded message|anfang der weitergeleiteten nachricht)[^\n]*\n?\s*$/i;

  // Cuts the quoted history from a reply, so a thread does not repeat every earlier message.
  function stripQuotedReply(text) {
    let cut = text.length;
    for (const marker of REPLY_MARKERS) {
      marker.lastIndex = 0;
      let m;
      while ((m = marker.exec(text))) {
        if (m.index >= cut) break;
        // A real attribution carries a date or time; "Am Montag schrieb der Kunde:" is content.
        if (marker === REPLY_MARKERS[0] && !/\d/.test(m[0])) continue;
        if (!FORWARD_MARKER.test(text.slice(Math.max(0, m.index - 200), m.index))) {
          cut = m.index;
          break;
        }
      }
    }
    let kept = text.slice(0, cut).split('\n');
    while (kept.length && (/^\s*$/.test(kept[kept.length - 1]) || /^\s*>/.test(kept[kept.length - 1]))) kept.pop();
    const result = kept.join('\n').trimEnd();
    return result.trim() ? result : text;
  }

  const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]/g;

  // Header values come from the sender: a newline would forge extra header lines in the copy.
  function oneLine(value) {
    return String(value || '')
      .replace(BIDI, '')
      .replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029]+/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  function formatAddresses(list) {
    return list.map((a) => (a.name ? `${oneLine(a.name)} <${oneLine(a.address)}>` : oneLine(a.address))).join(', ');
  }

  function sameAddresses(a, b) {
    const key = (list) => list.map((x) => x.address.toLowerCase()).sort().join(',');
    return key(a) === key(b);
  }

  function formatDate(date, opts) {
    return date.toLocaleString(opts.locale || 'de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: opts.timeZone,
    });
  }

  function formatSize(bytes, locale) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toLocaleString(locale || 'de-DE', { maximumFractionDigits: 1 })} MB`;
  }

  function headerBlock(msg, opts, withSubject) {
    const L = labelsFor(opts.locale);
    const lines = [];
    if (withSubject) lines.push(`${L.subject}: ${oneLine(msg.subject) || L.noSubject}`);
    lines.push(`${L.from}: ${formatAddresses(msg.from)}`);
    if (msg.to.length) lines.push(`${L.to}: ${formatAddresses(msg.to)}`);
    if (msg.cc.length) lines.push(`${L.cc}: ${formatAddresses(msg.cc)}`);
    if (msg.bcc.length) lines.push(`${L.bcc}: ${formatAddresses(msg.bcc)}`);
    if (msg.replyTo.length && !sameAddresses(msg.replyTo, msg.from)) lines.push(`${L.replyTo}: ${formatAddresses(msg.replyTo)}`);
    if (msg.date) lines.push(`${L.date}: ${formatDate(msg.date, opts)}`);
    if (msg.attachments.length) {
      // The names the files will actually carry (see collectFiles).
      const names = msg.attachments.map((a) => `${safeFilename(a.filename)} (${formatSize(a.size, opts.locale)})`);
      lines.push(`${L.attachments}: ${names.join(', ')}`);
    }
    return lines.join('\n');
  }

  function formatMessage(msg, opts = {}) {
    return `${headerBlock(msg, opts, true)}\n\n${bodyText(msg)}`.trim() + '\n';
  }

  function baseSubject(subject) {
    return (subject || '').replace(/^\s*((re|aw|wg|fwd?|antw)\s*:\s*)+/i, '').trim().toLowerCase();
  }

  function formatThread(msgs, opts = {}) {
    const L = labelsFor(opts.locale);
    const subject = oneLine(msgs[0] && msgs[0].subject) || L.noSubject;
    const parts = [`${L.thread}: ${subject} (${L.messages(msgs.length)})`];
    msgs.forEach((msg, i) => {
      const withSubject = i === 0 || baseSubject(msg.subject) !== baseSubject(subject);
      // Forwards are content, not quoted history.
      const keepAll = i === 0 || FORWARD_SUBJECT.test(msg.subject || '');
      const body = keepAll ? bodyText(msg) : stripQuotedReply(bodyText(msg));
      parts.push(`${SEPARATOR}\n[${i + 1}/${msgs.length}]\n${headerBlock(msg, opts, withSubject)}\n\n${body}`.trimEnd());
    });
    return parts.join('\n\n') + '\n';
  }

  function safeFilename(name, max = 100) {
    let s = String(name || '')
      // Bidi controls could disguise "invoice\u202Efdp.exe" as "invoiceexe.pdf".
      .replace(BIDI, '')
      .replace(/[\x7f-\x9f]/g, '')
      .replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/^[\s.]+|[\s.]+$/g, '');
    if (!s) return 'Mail';
    const chars = Array.from(s); // code points, so an emoji is never cut in half
    if (chars.length > max) {
      const dot = s.lastIndexOf('.');
      const ext = dot > 0 && s.length - dot <= 10 ? s.slice(dot) : '';
      s = chars.slice(0, max - Array.from(ext).length).join('').trimEnd() + ext;
    }
    return s;
  }

  function withSuffix(name, n) {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
  }

  // Files for the Mac helper: the mail text first, then every attachment once.
  function collectFiles(msgs, textName, text) {
    const files = [{ name: safeFilename(textName), data: text, encoding: 'utf8' }];
    const seen = [];
    const used = new Set([files[0].name.toLowerCase()]);
    for (const msg of msgs) {
      for (const att of msg.attachments) {
        if (seen.some((s) => s.filename === att.filename && s.size === att.size && s.data === att.data)) continue;
        seen.push(att);
        let name = safeFilename(att.filename);
        for (let n = 2; used.has(name.toLowerCase()); n++) name = withSuffix(safeFilename(att.filename), n);
        used.add(name.toLowerCase());
        files.push({ name, data: att.data, encoding: 'binary' });
      }
    }
    return files;
  }

  function textFileName(subject, isThread, locale) {
    const L = labelsFor(locale);
    return `${subject || L.noSubject}${isThread ? ` (${L.thread})` : ''}.txt`;
  }

  Object.assign(exports, {
    htmlToText,
    bodyText,
    stripQuotedReply,
    formatMessage,
    formatThread,
    formatSize,
    safeFilename,
    collectFiles,
    textFileName,
  });
})(typeof module !== 'undefined' ? module.exports : (globalThis.PaperClipper = globalThis.PaperClipper || {}));
