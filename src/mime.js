/*
 * MIME parser for raw RFC 822 messages, as Gmail serves them via "Download original".
 * Works on binary strings (one char per byte) so non-UTF-8 parts and attachments stay intact.
 * Runs as a content script (exports to globalThis.PaperClipper) and under Node for tests.
 */
(function (exports) {
  'use strict';

  // Inline images referenced from the HTML body are usually signature logos. Larger ones are
  // pasted screenshots, which matter, so they are kept as attachments.
  const INLINE_IMAGE_MIN_BYTES = 30 * 1024;
  const SKIPPED_TYPES = new Set([
    'application/pgp-signature',
    'application/pkcs7-signature',
    'application/x-pkcs7-signature',
  ]);
  const EXTENSIONS = {
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'text/plain': 'txt',
    'text/html': 'html',
    'text/csv': 'csv',
    'text/calendar': 'ics',
    'message/rfc822': 'eml',
  };

  function toBinaryString(input) {
    if (typeof input === 'string') return input;
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    let out = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return out;
  }

  function toBytes(binary) {
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
    return bytes;
  }

  // Missing or ASCII charset: many senders omit it for UTF-8, so try that first.
  function decodeBytes(binary, charset) {
    const bytes = toBytes(binary);
    const label = (charset || '').trim().toLowerCase();
    if (!label || label === 'us-ascii' || label === 'ascii') {
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        return new TextDecoder('windows-1252').decode(bytes);
      }
    }
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }

  function hexToChar(_, hex) {
    return String.fromCharCode(parseInt(hex, 16));
  }

  function base64Decode(s) {
    const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
    return atob(clean.slice(0, clean.length - (clean.length % 4 === 1 ? 1 : 0)));
  }

  function quotedPrintableDecode(s) {
    return s
      .replace(/[ \t]+$/gm, '')
      .replace(/=\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, hexToChar);
  }

  const ENCODED_WORD = /=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/g;

  // RFC 2047. Adjacent words with the same charset are joined as bytes first, because some
  // mailers split multi-byte characters across two encoded words.
  function decodeWords(s) {
    if (!s || s.indexOf('=?') === -1) return s;
    let out = '';
    let last = 0;
    let pending = null;
    const flush = () => {
      if (pending) out += decodeBytes(pending.bin, pending.charset);
      pending = null;
    };
    ENCODED_WORD.lastIndex = 0;
    let m;
    while ((m = ENCODED_WORD.exec(s))) {
      const between = s.slice(last, m.index);
      last = ENCODED_WORD.lastIndex;
      const charset = m[1].split('*')[0].toLowerCase();
      let bin;
      try {
        bin = m[2].toUpperCase() === 'B' ? base64Decode(m[3]) : m[3].replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, hexToChar);
      } catch {
        flush();
        out += between + m[0];
        continue;
      }
      if (pending && /^\s*$/.test(between) && pending.charset === charset) {
        pending.bin += bin;
      } else {
        flush();
        if (!/^\s*$/.test(between) || !out) out += between;
        pending = { charset, bin };
      }
    }
    flush();
    return out + s.slice(last);
  }

  function splitHeaderBody(raw) {
    if (raw.startsWith('\n')) return { head: '', body: raw.slice(1) };
    const i = raw.indexOf('\n\n');
    return i === -1 ? { head: raw, body: '' } : { head: raw.slice(0, i), body: raw.slice(i + 2) };
  }

  // Header values may carry raw UTF-8 (RFC 6532); decode those bytes up front.
  function parseHeaders(head) {
    const headers = new Map();
    for (const line of head.replace(/\n(?=[ \t])/g, '').split('\n')) {
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const name = line.slice(0, idx).trim().toLowerCase();
      let value = line.slice(idx + 1).trim();
      if (/[\x80-\xff]/.test(value)) value = decodeBytes(value, '');
      if (!headers.has(name)) headers.set(name, []);
      headers.get(name).push(value);
    }
    return headers;
  }

  function header(headers, name) {
    const values = headers.get(name);
    return values ? values[0] : '';
  }

  function splitUnquoted(s, sep) {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '\\' && quoted) {
        cur += ch + (s[++i] || '');
        continue;
      }
      if (ch === '"') quoted = !quoted;
      if (ch === sep && !quoted) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  // Content-Type / Content-Disposition, including RFC 2231 (name*=charset''..., name*0*=...).
  function parseParams(value) {
    const pieces = splitUnquoted(value || '', ';');
    const main = (pieces.shift() || '').trim().toLowerCase();
    const params = {};
    const extended = {};
    for (const piece of pieces) {
      const eq = piece.indexOf('=');
      if (eq === -1) continue;
      const key = piece.slice(0, eq).trim().toLowerCase();
      let val = piece.slice(eq + 1).trim();
      if (val.startsWith('"')) val = val.replace(/^"|"$/g, '').replace(/\\(.)/g, '$1');
      const m = /^([^*]+)(?:\*(\d+))?(\*)?$/.exec(key);
      if (!m) continue;
      const [, name, index, star] = m;
      if (index === undefined && !star) {
        if (!(name in params)) params[name] = name === 'name' || name === 'filename' ? decodeWords(val) : val;
      } else {
        (extended[name] = extended[name] || []).push({ index: Number(index || 0), val, star: !!star });
      }
    }
    for (const [name, parts] of Object.entries(extended)) {
      parts.sort((a, b) => a.index - b.index);
      let charset = '';
      let bin = '';
      for (const part of parts) {
        let v = part.val;
        if (part.star) {
          if (part.index === 0) {
            const q = v.split("'");
            if (q.length >= 3) {
              charset = q[0];
              v = q.slice(2).join("'");
            }
          }
          v = v.replace(/%([0-9A-Fa-f]{2})/g, hexToChar);
        }
        bin += v;
      }
      params[name] = decodeBytes(bin, charset || 'utf-8');
    }
    return { value: main, params };
  }

  function parseAddress(s) {
    s = s.trim();
    if (!s) return null;
    let name = '';
    let address = '';
    const lt = s.lastIndexOf('<');
    const gt = s.indexOf('>', lt);
    if (lt !== -1 && gt !== -1) {
      address = s.slice(lt + 1, gt).trim();
      name = (s.slice(0, lt) + s.slice(gt + 1)).trim();
    } else {
      const comment = /\(([^)]*)\)/.exec(s);
      if (comment) {
        name = comment[1].trim();
        address = s.replace(comment[0], '').trim();
      } else {
        address = s;
      }
    }
    name = decodeWords(name.replace(/^"([\s\S]*)"$/, '$1').replace(/\\(.)/g, '$1').trim());
    if (name === address) name = '';
    return name || address ? { name, address } : null;
  }

  // Splits on commas outside quotes, <...> and (...); drops group names ("team: a, b;").
  function parseAddressList(value) {
    const out = [];
    if (!value) return out;
    let cur = '';
    let quoted = false;
    let angle = 0;
    let paren = 0;
    const push = () => {
      const a = parseAddress(cur);
      if (a) out.push(a);
      cur = '';
    };
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (ch === '\\' && quoted) {
        cur += ch + (value[++i] || '');
        continue;
      }
      if (ch === '"') quoted = !quoted;
      else if (!quoted) {
        if (ch === '<') angle++;
        else if (ch === '>') angle = Math.max(0, angle - 1);
        else if (ch === '(') paren++;
        else if (ch === ')') paren = Math.max(0, paren - 1);
        else if (!angle && !paren) {
          if (ch === ',' || ch === ';') {
            push();
            continue;
          }
          if (ch === ':') {
            cur = '';
            continue;
          }
        }
      }
      cur += ch;
    }
    push();
    return out;
  }

  function splitMultipart(body, boundary) {
    const delimiter = '--' + boundary;
    const parts = [];
    let cur = null;
    for (const line of body.split('\n')) {
      if (line.startsWith(delimiter)) {
        const rest = line.slice(delimiter.length).trimEnd();
        if (rest === '' || rest === '--') {
          if (cur) parts.push(cur.join('\n'));
          cur = rest === '' ? [] : null;
          if (rest === '--') return parts;
          continue;
        }
      }
      if (cur) cur.push(line);
    }
    if (cur) parts.push(cur.join('\n'));
    return parts;
  }

  function parseEntity(raw, depth) {
    const { head, body } = splitHeaderBody(raw);
    const headers = parseHeaders(head);
    const type = parseParams(header(headers, 'content-type') || 'text/plain');
    const disposition = parseParams(header(headers, 'content-disposition'));
    const entity = {
      headers,
      type: type.value.includes('/') ? type.value : 'text/plain',
      params: type.params,
      disposition: disposition.value,
      filename: (disposition.params.filename || type.params.name || '').trim(),
      encoding: header(headers, 'content-transfer-encoding').trim().toLowerCase(),
      contentId: header(headers, 'content-id').trim().replace(/^<|>$/g, ''),
      body,
      children: [],
    };
    if (entity.type.startsWith('multipart/') && type.params.boundary && depth < 20) {
      entity.children = splitMultipart(body, type.params.boundary).map((part) => parseEntity(part, depth + 1));
    }
    return entity;
  }

  function decodeBody(entity) {
    try {
      if (entity.encoding === 'base64') return base64Decode(entity.body);
      if (entity.encoding === 'quoted-printable') return quotedPrintableDecode(entity.body);
    } catch {
      // Broken encoding: hand back the raw body rather than losing the part.
    }
    return entity.body;
  }

  // RFC 3676: a trailing space marks a soft line break; leading spaces are stuffing.
  function unflow(text, delsp) {
    const out = [];
    let buf = null;
    for (let line of text.split('\n')) {
      if (line.startsWith(' ')) line = line.slice(1);
      if (line.endsWith(' ') && line !== '-- ') {
        buf = (buf || '') + (delsp ? line.slice(0, -1) : line);
      } else {
        out.push((buf || '') + line);
        buf = null;
      }
    }
    if (buf !== null) out.push(buf);
    return out.join('\n');
  }

  function collectLeaves(entity, out) {
    if (entity.children.length) entity.children.forEach((child) => collectLeaves(child, out));
    else out.push(entity);
    return out;
  }

  function fallbackName(leaf, data, n) {
    if (leaf.type === 'message/rfc822') {
      const subject = decodeWords(header(parseHeaders(splitHeaderBody(data).head), 'subject')).trim();
      if (subject) return subject + '.eml';
    }
    const ext = EXTENSIONS[leaf.type] || (leaf.type.split('/')[1] || '').replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
    return `attachment-${n}.${ext}`;
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value.replace(/\([^)]*\)/g, '').trim());
    return isNaN(date.getTime()) ? null : date;
  }

  function parseMessage(input) {
    const raw = toBinaryString(input).replace(/\r\n?/g, '\n');
    const root = parseEntity(raw, 0);
    const plain = [];
    const html = [];
    const candidates = [];

    for (const leaf of collectLeaves(root, [])) {
      const isText = leaf.type === 'text/plain' || leaf.type === 'text/html';
      if (isText && leaf.disposition !== 'attachment' && !leaf.filename) {
        let text = decodeBytes(decodeBody(leaf), leaf.params.charset);
        if (leaf.type === 'text/html') {
          html.push(text);
        } else {
          if ((leaf.params.format || '').toLowerCase() === 'flowed') {
            text = unflow(text, (leaf.params.delsp || '').toLowerCase() === 'yes');
          }
          plain.push(text);
        }
        continue;
      }
      if (SKIPPED_TYPES.has(leaf.type)) continue;
      // Calendar alternatives of an invite; the real invite.ics comes as a named attachment.
      if (leaf.type === 'text/calendar' && !leaf.filename && leaf.disposition !== 'attachment') continue;
      candidates.push(leaf);
    }

    const htmlBody = html.join('\n');
    const cids = new Set();
    for (const m of htmlBody.matchAll(/cid:([^"'\s)>]+)/gi)) cids.add(m[1].toLowerCase());

    const attachments = [];
    for (const leaf of candidates) {
      const data = decodeBody(leaf);
      const inline = !!leaf.contentId && cids.has(leaf.contentId.toLowerCase());
      if (inline && leaf.disposition !== 'attachment' && leaf.type.startsWith('image/') && data.length < INLINE_IMAGE_MIN_BYTES) {
        continue;
      }
      attachments.push({
        filename: leaf.filename || fallbackName(leaf, data, attachments.length + 1),
        mimeType: leaf.type,
        size: data.length,
        data,
        inline,
      });
    }

    const list = (name) => parseAddressList((root.headers.get(name) || []).join(', '));
    return {
      subject: decodeWords(header(root.headers, 'subject')).trim(),
      from: list('from'),
      to: list('to'),
      cc: list('cc'),
      bcc: list('bcc'),
      replyTo: list('reply-to'),
      date: parseDate(header(root.headers, 'date')),
      messageId: header(root.headers, 'message-id'),
      text: plain.join('\n\n'),
      html: htmlBody,
      attachments,
    };
  }

  Object.assign(exports, { parseMessage, decodeWords, parseAddressList, toBinaryString, toBytes });
})(typeof module !== 'undefined' ? module.exports : (globalThis.PaperClipper = globalThis.PaperClipper || {}));
