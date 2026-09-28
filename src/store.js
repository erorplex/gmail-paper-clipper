/*
 * Copy counters and thread notes in chrome.storage.local. Nothing is synced or sent anywhere.
 *   stats:m:<message id> / stats:t:<thread id> -> { copy, attach, copyAt, attachAt }
 *   note:<thread id>                            -> { text, subject, url, updatedAt }
 * Runs in the content script and the popup (exports to globalThis.PaperClipper) and under Node for tests.
 */
(function (exports) {
  'use strict';

  const STATS = 'stats:';
  const NOTE = 'note:';

  function bumpStats(prev, mode, now) {
    const stats = { copy: 0, attach: 0, copyAt: 0, attachAt: 0, ...(prev || {}) };
    stats[mode] += 1;
    stats[`${mode}At`] = now;
    return stats;
  }

  function listNotes(items) {
    return Object.entries(items)
      .filter(([key, note]) => key.startsWith(NOTE) && note && note.text)
      .map(([key, note]) => ({ id: key.slice(NOTE.length), ...note }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function filterNotes(notes, query) {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => `${n.subject}\n${n.text}`.toLowerCase().includes(q));
  }

  const area = () => chrome.storage.local;

  async function getItem(key) {
    return (await area().get(key))[key] || null;
  }

  function getStats(target) {
    return getItem(STATS + target);
  }

  async function recordCopy(target, mode) {
    const key = STATS + target;
    await area().set({ [key]: bumpStats(await getItem(key), mode, Date.now()) });
  }

  function getNote(threadId) {
    return getItem(NOTE + threadId);
  }

  // An empty note is deleted, so clearing the field is all it takes.
  function saveNote(threadId, { text, subject, url }) {
    const key = NOTE + threadId;
    if (!text.trim()) return area().remove(key);
    return area().set({ [key]: { text, subject, url, updatedAt: Date.now() } });
  }

  function deleteNote(threadId) {
    return area().remove(NOTE + threadId);
  }

  async function allNotes() {
    return listNotes(await area().get(null));
  }

  // Calls fn(kind, id, value) for every changed counter ('stats') or note ('note'), across tabs.
  function onStoreChange(fn) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (key.startsWith(STATS)) fn('stats', key.slice(STATS.length), newValue || null);
        else if (key.startsWith(NOTE)) fn('note', key.slice(NOTE.length), newValue || null);
      }
    });
  }

  Object.assign(exports, {
    bumpStats,
    listNotes,
    filterNotes,
    getStats,
    recordCopy,
    getNote,
    saveNote,
    deleteNote,
    allNotes,
    onStoreChange,
  });
})(typeof module !== 'undefined' ? module.exports : (globalThis.PaperClipper = globalThis.PaperClipper || {}));
