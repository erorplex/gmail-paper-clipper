const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNote, parseInline, safeHref, toggleTask } = require('../src/note.js');

test('headings, lists, tasks and paragraphs become blocks', () => {
  const blocks = parseNote('# Titel\n## Unter\n### Klein\n\n- eins\n* zwei\n- [ ] offen\n- [x] erledigt\n\n1. erst\n2) dann\nText\nweiter\n\nneu');
  assert.deepEqual(
    blocks.map((b) => b.type),
    ['heading', 'heading', 'heading', 'list', 'list', 'paragraph', 'paragraph']
  );
  assert.deepEqual(blocks.slice(0, 3).map((b) => b.level), [1, 2, 3]);
  const [ul, ol] = [blocks[3], blocks[4]];
  assert.equal(ul.ordered, false);
  assert.deepEqual(ul.items.map((i) => i.task), [null, null, 'open', 'done']);
  assert.deepEqual(ul.items.map((i) => i.line), [4, 5, 6, 7]);
  assert.equal(ol.ordered, true);
  assert.equal(ol.items.length, 2);
  assert.equal(blocks[5].lines.length, 2, 'consecutive lines stay one paragraph');
  assert.deepEqual(blocks[6].lines, [[{ type: 'text', text: 'neu' }]]);
});

test('a heading marker needs a space, so hashtags stay text', () => {
  assert.equal(parseNote('#wichtig')[0].type, 'paragraph');
});

test('bare URLs become links, trailing punctuation stays outside', () => {
  const url = 'https://sellercentral.amazon.de/cu/case-dashboard/view-case?ref=hill&caseID=13335259002&mons_sel_mkid=amzn1.mp.o.A';
  assert.deepEqual(parseInline(`Fall: ${url}.`), [
    { type: 'text', text: 'Fall: ' },
    { type: 'link', href: url, children: [{ type: 'text', text: url }] },
    { type: 'text', text: '.' },
  ]);
  assert.deepEqual(parseInline('(siehe https://example.org/a)'), [
    { type: 'text', text: '(siehe ' },
    { type: 'link', href: 'https://example.org/a', children: [{ type: 'text', text: 'https://example.org/a' }] },
    { type: 'text', text: ')' },
  ]);
  assert.deepEqual(parseInline('https://de.wikipedia.org/wiki/Foo_(Bar)'), [
    { type: 'link', href: 'https://de.wikipedia.org/wiki/Foo_(Bar)', children: [{ type: 'text', text: 'https://de.wikipedia.org/wiki/Foo_(Bar)' }] },
  ]);
  assert.equal(parseInline('www.pixkom.com')[0].href, 'https://www.pixkom.com');
});

test('markdown links, bold, italic and code', () => {
  assert.deepEqual(parseInline('[Case](https://example.org) **fett *kursiv*** `a*b*`'), [
    { type: 'link', href: 'https://example.org', children: [{ type: 'text', text: 'Case' }] },
    { type: 'text', text: ' ' },
    { type: 'bold', children: [{ type: 'text', text: 'fett ' }, { type: 'italic', children: [{ type: 'text', text: 'kursiv' }] }] },
    { type: 'text', text: ' ' },
    { type: 'code', text: 'a*b*' },
  ]);
  assert.deepEqual(parseInline('2 * 3 * 4'), [{ type: 'text', text: '2 * 3 * 4' }], 'loose asterisks are not italic');
});

test('only http, https and mailto links are allowed', () => {
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref(' JavaScript:alert(1)'), null);
  assert.equal(safeHref('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(safeHref('//evil.example'), null);
  assert.equal(safeHref('mailto:a@b.de'), 'mailto:a@b.de');
  assert.deepEqual(parseInline('[klick](javascript:alert(1))'), [{ type: 'text', text: '[klick](javascript:alert(1))' }]);
});

test('markup in the note stays text', () => {
  const blocks = parseNote('<img src=x onerror=alert(1)><script>alert(1)</script>');
  assert.deepEqual(blocks, [
    { type: 'paragraph', lines: [[{ type: 'text', text: '<img src=x onerror=alert(1)><script>alert(1)</script>' }]] },
  ]);
});

test('toggleTask flips exactly one checkbox and keeps the rest of the text', () => {
  const text = '# To do\n- [ ] Rückruf\n- [x] Angebot [ ] senden';
  assert.equal(toggleTask(text, 1), '# To do\n- [x] Rückruf\n- [x] Angebot [ ] senden');
  assert.equal(toggleTask(text, 2), '# To do\n- [ ] Rückruf\n- [ ] Angebot [ ] senden');
  assert.equal(toggleTask(text, 0), text, 'lines without a task stay as they are');
});
