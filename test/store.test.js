const test = require('node:test');
const assert = require('node:assert/strict');
const { bumpStats, listNotes, filterNotes } = require('../src/store.js');

test('bumpStats counts per mode and remembers the last copy per mode', () => {
  const first = bumpStats(undefined, 'copy', 1000);
  assert.deepEqual(first, { copy: 1, attach: 0, copyAt: 1000, attachAt: 0 });
  const second = bumpStats(first, 'attach', 2000);
  assert.deepEqual(second, { copy: 1, attach: 1, copyAt: 1000, attachAt: 2000 });
  assert.deepEqual(first, { copy: 1, attach: 0, copyAt: 1000, attachAt: 0 }, 'input stays untouched');
});

test('listNotes returns notes newest first and ignores other keys and empty notes', () => {
  const items = {
    'note:a': { text: 'alt', subject: 'A', url: 'u1', updatedAt: 1 },
    'note:b': { text: 'neu', subject: 'B', url: 'u2', updatedAt: 5 },
    'note:c': { text: '', subject: 'C', url: 'u3', updatedAt: 9 },
    'stats:m:1': { copy: 3, attach: 0, copyAt: 7, attachAt: 0 },
  };
  assert.deepEqual(
    listNotes(items).map((n) => n.id),
    ['b', 'a']
  );
});

test('filterNotes searches subject and text, case-insensitive', () => {
  const notes = [
    { id: 'a', subject: 'Angebot Q4', text: 'Rückruf Montag' },
    { id: 'b', subject: 'Rechnung', text: 'bezahlt' },
  ];
  assert.deepEqual(filterNotes(notes, 'q4').map((n) => n.id), ['a']);
  assert.deepEqual(filterNotes(notes, 'BEZAHLT').map((n) => n.id), ['b']);
  assert.equal(filterNotes(notes, '  ').length, 2);
});
