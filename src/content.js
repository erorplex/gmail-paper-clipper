/*
 * Adds the copy buttons, copy counters and thread notes to Gmail and runs the copy: fetch raw
 * messages, format them, then put the text on the clipboard directly or hand text plus attachments
 * to the Mac helper.
 * No innerHTML anywhere: Gmail enforces Trusted Types.
 */
(function () {
  'use strict';

  const PC = globalThis.PaperClipper;
  const locale = navigator.language || 'de-DE';

  const T = locale.toLowerCase().startsWith('de')
    ? {
        copy: 'Kopieren',
        copyTitle: 'Betreff, Absender, Empfänger, Datum und Text dieser Mail kopieren',
        withAttachments: 'Mit Anhängen',
        withAttachmentsTitle: 'Mail plus Anhänge als echte Dateien kopieren (Mac-Helfer)',
        thread: 'Verlauf kopieren',
        threadTitle: 'Alle Mails dieses Verlaufs kopieren',
        threadWithAttachments: 'Verlauf + Anhänge',
        threadWithAttachmentsTitle: 'Alle Mails des Verlaufs plus alle Anhänge als Dateien kopieren (Mac-Helfer)',
        note: 'Notiz',
        noteTitle: 'Eigene Notiz zu diesem Verlauf, nur lokal gespeichert',
        notePlaceholder: 'Notiz zu diesem Verlauf … (wird automatisch gespeichert)',
        noteSaving: 'Speichert …',
        noteSaved: (when) => `Gespeichert · ${when}`,
        noteDeleted: 'Notiz gelöscht',
        copiedTimes: (n, when) => `Bereits ${n}× kopiert, zuletzt ${when}`,
        loading: (n) => (n === 1 ? 'Lade Mail …' : `Lade ${n} Nachrichten …`),
        mail: 'Mail',
        threadOf: (n) => `Verlauf (${n} ${n === 1 ? 'Nachricht' : 'Nachrichten'})`,
        copied: (what) => `${what} kopiert`,
        copiedFiles: (what, n) => `${what} + ${n} ${n === 1 ? 'Anhang' : 'Anhänge'} kopiert – mit ⌘V einfügen`,
        noAttachments: (what) => `${what} kopiert – keine Anhänge gefunden, nur Text`,
        noMessages: 'Keine Mail gefunden. Bitte Gmail neu laden.',
        helperMissing: 'Mac-Helfer fehlt: im Ordner der Erweiterung ./install.sh ausführen.',
        helperForbidden: 'Mac-Helfer kennt diese Erweiterung nicht: ./install.sh erneut ausführen.',
        reload: 'Paper Clipper wurde aktualisiert. Bitte Gmail neu laden.',
        clipboardFailed: 'Zwischenablage nicht erreichbar. Bitte einmal in Gmail klicken und erneut versuchen.',
        failed: 'Kopieren fehlgeschlagen',
      }
    : {
        copy: 'Copy',
        copyTitle: 'Copy subject, sender, recipients, date and text of this email',
        withAttachments: 'With attachments',
        withAttachmentsTitle: 'Copy this email plus its attachments as real files (Mac helper)',
        thread: 'Copy thread',
        threadTitle: 'Copy every email in this thread',
        threadWithAttachments: 'Thread + attachments',
        threadWithAttachmentsTitle: 'Copy every email in this thread plus all attachments as files (Mac helper)',
        note: 'Note',
        noteTitle: 'Your own note on this thread, stored only locally',
        notePlaceholder: 'Note on this thread … (saved automatically)',
        noteSaving: 'Saving …',
        noteSaved: (when) => `Saved · ${when}`,
        noteDeleted: 'Note deleted',
        copiedTimes: (n, when) => `Copied ${n}× so far, last ${when}`,
        loading: (n) => (n === 1 ? 'Loading email …' : `Loading ${n} messages …`),
        mail: 'Email',
        threadOf: (n) => `Thread (${n} ${n === 1 ? 'message' : 'messages'})`,
        copied: (what) => `${what} copied`,
        copiedFiles: (what, n) => `${what} + ${n} ${n === 1 ? 'attachment' : 'attachments'} copied – paste with ⌘V`,
        noAttachments: (what) => `${what} copied – no attachments found, text only`,
        noMessages: 'No email found. Please reload Gmail.',
        helperMissing: 'Mac helper missing: run ./install.sh in the extension folder.',
        helperForbidden: 'The Mac helper does not know this extension: run ./install.sh again.',
        reload: 'Paper Clipper was updated. Please reload Gmail.',
        clipboardFailed: 'Clipboard not available. Click into Gmail once and try again.',
        failed: 'Copy failed',
      };

  const ICONS = {
    copy: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
    attach:
      'M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z',
    thread:
      'M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z',
    note: 'M3 10h11v2H3zm0-2h11V6H3zm0 8h7v-2H3zm15.01-3.13.71-.71c.39-.39 1.02-.39 1.41 0l.71.71c.39.39.39 1.02 0 1.41l-.71.71-2.12-2.12zm-.71.71-5.3 5.3V21h2.12l5.3-5.3-2.12-2.12z',
  };

  function when(ts) {
    return new Date(ts).toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // ---------- UI building blocks ----------

  function icon(path) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', path);
    svg.append(p);
    return svg;
  }

  function button(label, title, iconPath, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'paper-clipper-btn';
    b.title = title;
    b.dataset.pcTitle = title;
    b.append(icon(iconPath), document.createTextNode(label));
    // Keep Gmail from treating the click as "collapse message" or similar.
    b.addEventListener('mousedown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  // A copy button with a counter badge: how often this mail or thread was copied this way.
  function copyButton(label, title, iconPath, target, mode, action) {
    const b = button(label, title, iconPath, () => run(action));
    const count = document.createElement('span');
    count.className = 'paper-clipper-count';
    count.hidden = true;
    b.append(count);
    if (target) {
      b.dataset.pcTarget = target;
      b.dataset.pcMode = mode;
      guard(PC.getStats(target)).then((stats) => stats && showStats(target, stats));
    }
    return b;
  }

  function showStats(target, stats) {
    for (const b of document.querySelectorAll(`.paper-clipper-btn[data-pc-target="${CSS.escape(target)}"]`)) {
      const n = (stats && stats[b.dataset.pcMode]) || 0;
      const count = b.querySelector('.paper-clipper-count');
      count.textContent = String(n);
      count.hidden = n === 0;
      b.title = n ? `${b.dataset.pcTitle}\n${T.copiedTimes(n, when(stats.lastAt))}` : b.dataset.pcTitle;
    }
  }

  function bar(buttons) {
    const el = document.createElement('div');
    el.className = 'paper-clipper-bar';
    el.append(...buttons);
    return el;
  }

  let toastEl = null;
  let toastTimer = null;
  function toast(text, { error = false, sticky = false } = {}) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'paper-clipper-toast';
      toastEl.setAttribute('role', 'status');
      document.body.append(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.toggle('is-error', error);
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), error ? 8000 : 3500);
  }

  let busy = false;
  async function run(action) {
    if (busy) return;
    busy = true;
    document.documentElement.classList.add('paper-clipper-busy');
    try {
      toast(await action());
    } catch (err) {
      console.error('[Paper Clipper]', err);
      toast(explain(err), { error: true });
    } finally {
      busy = false;
      document.documentElement.classList.remove('paper-clipper-busy');
    }
  }

  function explain(err) {
    const msg = String((err && err.message) || err);
    if (/native messaging host not found|failed to start native messaging host/i.test(msg)) return T.helperMissing;
    if (/forbidden/i.test(msg)) return T.helperForbidden;
    if (/context invalidated/i.test(msg)) return T.reload;
    if (err && err.userFacing) return msg;
    return `${T.failed}: ${msg}`;
  }

  function userError(message) {
    return Object.assign(new Error(message), { userFacing: true });
  }

  // Counters and notes are extras: a storage failure (e.g. after an extension update) must not break copying.
  async function guard(promise) {
    try {
      return await promise;
    } catch (err) {
      console.warn('[Paper Clipper]', err);
      return null;
    }
  }

  // ---------- Copy ----------

  async function copy(refs, { thread, withAttachments, target }) {
    if (!refs.length) throw userError(T.noMessages);
    toast(T.loading(refs.length), { sticky: true });
    const msgs = (await PC.fetchRawAll(refs)).map((raw) => PC.parseMessage(raw));
    const text = thread ? PC.formatThread(msgs, { locale }) : PC.formatMessage(msgs[0], { locale });
    const what = thread ? T.threadOf(msgs.length) : T.mail;

    let result;
    const files = withAttachments ? PC.collectFiles(msgs, PC.textFileName(msgs[0].subject, thread, locale), text) : [];
    if (files.length > 1) {
      await helperCopy(text, files);
      result = T.copiedFiles(what, files.length - 1);
    } else {
      await writeClipboard(text);
      result = withAttachments ? T.noAttachments(what) : T.copied(what);
    }
    if (target) await guard(PC.recordCopy(target, withAttachments ? 'attach' : 'copy'));
    return result;
  }

  async function writeClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Falls back below, e.g. when Gmail lost focus during loading.
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw userError(T.clipboardFailed);
  }

  // Lone surrogates (a cut emoji, a bogus &#xD800;) would reach the helper as JSON it cannot parse.
  function wellFormed(s) {
    return typeof s.toWellFormed === 'function' ? s.toWellFormed() : s;
  }

  function toBase64(file) {
    const binary = file.encoding === 'utf8' ? PC.toBinaryString(new TextEncoder().encode(file.data)) : file.data;
    return btoa(binary);
  }

  // One message per file keeps every message far below Chrome's native messaging size limit.
  function helperCopy(text, files) {
    const port = chrome.runtime.connect({ name: 'paper-clipper-helper' });
    const pending = [];
    port.onMessage.addListener((reply) => {
      const p = pending.shift();
      if (p) reply.ok ? p.resolve(reply) : p.reject(new Error(reply.error || 'helper error'));
    });
    port.onDisconnect.addListener(() => {
      const err = new Error((chrome.runtime.lastError && chrome.runtime.lastError.message) || 'helper disconnected');
      pending.splice(0).forEach((p) => p.reject(err));
    });
    const call = (message) =>
      new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
        port.postMessage(message);
      });

    return (async () => {
      try {
        await call({ type: 'begin' });
        for (const file of files) await call({ type: 'file', name: wellFormed(file.name), data: toBase64(file) });
        return await call({ type: 'commit', text: wellFormed(text) });
      } finally {
        port.disconnect();
      }
    })();
  }

  // ---------- Notes ----------

  function autoGrow(field) {
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight + 2}px`;
  }

  function notePanel(threadId, subject) {
    const panel = document.createElement('div');
    panel.className = 'paper-clipper-note';
    panel.hidden = true;
    const field = document.createElement('textarea');
    field.className = 'paper-clipper-note-field';
    field.placeholder = T.notePlaceholder;
    field.rows = 3;
    field.setAttribute('aria-label', T.note);
    const status = document.createElement('div');
    status.className = 'paper-clipper-note-status';
    panel.append(field, status);

    // Gmail shortcuts (e.g. "#" deletes the thread) must not see what is typed here.
    for (const type of ['keydown', 'keypress', 'keyup']) panel.addEventListener(type, (e) => e.stopPropagation());

    let timer = null;
    const save = async () => {
      clearTimeout(timer);
      timer = null;
      try {
        const subjectText = currentSubject(subject).textContent.trim();
        await PC.saveNote(threadId, { text: field.value, subject: subjectText, url: location.href });
        status.textContent = field.value.trim() ? T.noteSaved(when(Date.now())) : T.noteDeleted;
      } catch (err) {
        status.textContent = explain(err);
      }
    };
    field.addEventListener('input', () => {
      autoGrow(field);
      status.textContent = T.noteSaving;
      clearTimeout(timer);
      timer = setTimeout(save, 500);
    });
    field.addEventListener('blur', () => timer && save());
    return panel;
  }

  // Updates every note UI of a thread, e.g. after typing in another tab. Opens it when asked and a note exists.
  function showNote(threadId, note, { open = false } = {}) {
    for (const wrap of document.querySelectorAll(`.paper-clipper-thread[data-pc-thread="${CSS.escape(threadId)}"]`)) {
      const panel = wrap.querySelector('.paper-clipper-note');
      const field = wrap.querySelector('.paper-clipper-note-field');
      wrap.querySelector('.paper-clipper-note-btn').classList.toggle('is-active', !!note);
      if (document.activeElement !== field) {
        field.value = note ? note.text : '';
        wrap.querySelector('.paper-clipper-note-status').textContent = note ? T.noteSaved(when(note.updatedAt)) : '';
      }
      if (open && note) panel.hidden = false;
      if (!panel.hidden) autoGrow(field);
    }
  }

  // ---------- Buttons in Gmail ----------

  function currentSubject(original) {
    return original.isConnected ? original : PC.visibleSubjects()[0];
  }

  function threadBar(subject) {
    const threadId = PC.threadId(subject);
    const target = threadId && `t:${threadId}`;
    const refs = () => PC.threadMessageRefs(currentSubject(subject));
    const wrap = document.createElement('div');
    wrap.className = 'paper-clipper-thread';
    const buttons = [
      copyButton(T.thread, T.threadTitle, ICONS.thread, target, 'copy', async () =>
        copy(await refs(), { thread: true, withAttachments: false, target })
      ),
      copyButton(T.threadWithAttachments, T.threadWithAttachmentsTitle, ICONS.attach, target, 'attach', async () =>
        copy(await refs(), { thread: true, withAttachments: true, target })
      ),
    ];
    if (threadId) {
      wrap.dataset.pcThread = threadId;
      const panel = notePanel(threadId, subject);
      const noteButton = button(T.note, T.noteTitle, ICONS.note, () => {
        panel.hidden = !panel.hidden;
        noteButton.setAttribute('aria-expanded', String(!panel.hidden));
        if (!panel.hidden) {
          autoGrow(panel.firstChild);
          panel.firstChild.focus();
        }
      });
      noteButton.classList.add('paper-clipper-note-btn');
      noteButton.setAttribute('aria-expanded', 'false');
      buttons.push(noteButton);
      wrap.append(bar(buttons), panel);
      guard(PC.getNote(threadId)).then((note) => note && showNote(threadId, note, { open: true }));
    } else {
      wrap.append(bar(buttons));
    }
    return wrap;
  }

  function messageBar(ref) {
    const refs = ref ? [ref] : [];
    const target = ref && `m:${ref.id || ref.perm}`;
    const el = bar([
      copyButton(T.copy, T.copyTitle, ICONS.copy, target, 'copy', () =>
        copy(refs, { thread: false, withAttachments: false, target })
      ),
      copyButton(T.withAttachments, T.withAttachmentsTitle, ICONS.attach, target, 'attach', () =>
        copy(refs, { thread: false, withAttachments: true, target })
      ),
    ]);
    el.classList.add('paper-clipper-message');
    return el;
  }

  function scan() {
    for (const subject of PC.visibleSubjects()) {
      const next = subject.parentElement.nextElementSibling;
      if (!(next && next.classList.contains('paper-clipper-thread'))) PC.insertThreadBar(subject, threadBar(subject));
    }
    for (const { element, body, ref } of PC.expandedMessages()) {
      if (!element.querySelector('.paper-clipper-message')) PC.insertMessageBar(body, messageBar(ref));
    }
  }

  PC.onStoreChange((kind, id, value) => {
    if (kind === 'stats') showStats(id, value);
    else showNote(id, value);
  });

  let scheduled = null;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = setTimeout(() => {
      scheduled = null;
      scan();
    }, 300);
  }).observe(document.body, { childList: true, subtree: true });
  scan();
})();
