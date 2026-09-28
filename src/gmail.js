/*
 * Everything that depends on Gmail's markup or URLs lives here, so a Gmail change means fixing
 * this file only. Messages are loaded as raw source through Gmail's own "Download original" URL,
 * which carries all headers and attachments.
 */
(function (exports) {
  'use strict';

  const SUBJECT = 'h2.hP';
  const MESSAGE = '[data-legacy-message-id], [data-message-id]';
  const BODY = '.a3s';
  // The "N older messages" bubble in long threads; those messages are not in the DOM until clicked.
  const OLDER_MESSAGES = ['.adv', '.adx'];
  const FETCH_PARALLEL = 4;

  function isVisible(el) {
    return el.isConnected && el.getClientRects().length > 0;
  }

  // Gmail sets both a legacy hex id and a permanent id ("#msg-f:<decimal>"); msg-f converts to hex.
  function messageRef(el) {
    const legacy = el.getAttribute('data-legacy-message-id') || '';
    const perm = (el.getAttribute('data-message-id') || '').replace(/^#/, '');
    let id = /^[0-9a-f]{8,}$/i.test(legacy) ? legacy : '';
    if (!id && /^msg-f:\d+$/.test(perm)) id = BigInt(perm.slice(6)).toString(16);
    return id || perm ? { id, perm } : null;
  }

  function messageRefs(container) {
    const seen = new Set();
    const refs = [];
    for (const el of container.querySelectorAll(MESSAGE)) {
      const ref = messageRef(el);
      const key = ref && (ref.id || ref.perm);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      refs.push(ref);
    }
    return refs;
  }

  function threadContainer(subject) {
    for (let el = subject.parentElement; el && el !== document.body; el = el.parentElement) {
      if (el.querySelector(MESSAGE)) return el;
    }
    return null;
  }

  function visibleSubjects() {
    return [...document.querySelectorAll(SUBJECT)].filter(isVisible);
  }

  // Opened messages: the element carrying the id plus its body, where the button bar goes.
  function expandedMessages() {
    const out = [];
    for (const body of document.querySelectorAll(BODY)) {
      if (!isVisible(body)) continue;
      const element = body.closest(MESSAGE);
      if (element) out.push({ element, body, ref: messageRef(element) });
    }
    return out;
  }

  function insertThreadBar(subject, bar) {
    subject.parentElement.after(bar);
  }

  function insertMessageBar(body, bar) {
    const anchor = body.closest('.ii') || body;
    anchor.before(bar);
  }

  function click(el) {
    for (const type of ['mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Opens the "older messages" bubble so every message of the thread is in the DOM.
  async function threadMessageRefs(subject) {
    const container = threadContainer(subject);
    if (!container) return [];
    for (let round = 0; round < 3; round++) {
      const bubble = OLDER_MESSAGES.map((sel) => container.querySelector(sel)).find((el) => el && isVisible(el));
      if (!bubble) break;
      const before = messageRefs(container).length;
      click(bubble);
      for (let t = 0; t < 30 && messageRefs(container).length <= before; t++) await wait(100);
    }
    return messageRefs(container);
  }

  function looksLikeMessage(bin) {
    const head = bin.slice(0, 4000).trimStart();
    return !/^<(!doctype|html)/i.test(head) && /^[A-Za-z0-9-]+:/m.test(head);
  }

  async function fetchRaw(ref) {
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    const urls = [];
    if (ref.id) urls.push(`${base}?view=att&th=${ref.id}&attid=0&disp=comp&safe=1&zw`);
    if (ref.perm) urls.push(`${base}?view=att&permmsgid=${encodeURIComponent(ref.perm)}&attid=0&disp=comp&safe=1&zw`);
    let lastError = new Error('message without id');
    for (const url of urls) {
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bin = exports.toBinaryString(new Uint8Array(await res.arrayBuffer()));
        if (!looksLikeMessage(bin)) throw new Error('Gmail returned no raw message');
        return bin;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  async function fetchRawAll(refs) {
    const out = new Array(refs.length);
    let next = 0;
    const worker = async () => {
      while (next < refs.length) {
        const i = next++;
        out[i] = await fetchRaw(refs[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(FETCH_PARALLEL, refs.length) }, worker));
    return out;
  }

  Object.assign(exports, {
    isVisible,
    visibleSubjects,
    expandedMessages,
    insertThreadBar,
    insertMessageBar,
    threadMessageRefs,
    fetchRawAll,
  });
})((globalThis.MailClip = globalThis.MailClip || {}));
