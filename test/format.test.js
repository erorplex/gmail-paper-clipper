const test = require('node:test');
const assert = require('node:assert/strict');
const {
  htmlToText,
  bodyText,
  stripQuotedReply,
  formatMessage,
  formatThread,
  safeFilename,
  collectFiles,
  formatSize,
} = require('../src/format.js');

const opts = { locale: 'de-DE', timeZone: 'Europe/Berlin' };

function msg(overrides = {}) {
  return {
    subject: 'Angebot Q4',
    from: [{ name: 'Max Muster', address: 'max@example.org' }],
    to: [{ name: 'Erika', address: 'erika@example.com' }],
    cc: [],
    bcc: [],
    replyTo: [],
    date: new Date('2026-09-28T12:03:00Z'),
    text: 'Hallo Erika,\n\nanbei das Angebot.\n\nGruß Max',
    html: '',
    attachments: [],
    ...overrides,
  };
}

test('htmlToText keeps structure, links and entities, drops styles', () => {
  const html = `<html><head><style>p{color:red}</style><title>x</title></head><body>
    <p>Hallo&nbsp;Erika,</p>
    <p>bitte <a href="https://example.com/termin">hier klicken</a> oder
    <a href="https://example.com">https://example.com</a>.<br>Danke &amp; Gru&szlig;</p>
    <ul><li>Punkt eins</li><li>Punkt &#8222;zwei&#8220;</li></ul>
    <script>alert(1)</script><!-- kommentar -->
  </body></html>`;
  assert.equal(
    htmlToText(html),
    'Hallo Erika,\n\nbitte hier klicken (https://example.com/termin) oder https://example.com.\nDanke & Gruß\n\n- Punkt eins\n- Punkt „zwei“'
  );
});

test('bodyText prefers plain text but falls back to HTML for stub plain parts', () => {
  assert.equal(bodyText(msg()), 'Hallo Erika,\n\nanbei das Angebot.\n\nGruß Max');
  const longHtml = '<p>' + 'Newsletter Inhalt. '.repeat(80) + '</p>';
  assert.match(bodyText(msg({ text: 'Bitte HTML aktivieren.', html: longHtml })), /^Newsletter Inhalt\./);
  assert.equal(bodyText(msg({ text: '', html: '<div>Nur HTML</div>' })), 'Nur HTML');
});

test('stripQuotedReply cuts German, English and Outlook reply history', () => {
  assert.equal(
    stripQuotedReply('Passt, danke!\n\nAm Mo., 28. Sept. 2026 um 14:03 Uhr schrieb Max Muster <\nmax@example.org>:\n> Hallo\n> Gruß'),
    'Passt, danke!'
  );
  assert.equal(
    stripQuotedReply('Sounds good.\n\nOn Mon, Sep 28, 2026 at 2:03 PM Max Muster <max@example.org>\nwrote:\n\n> Hi'),
    'Sounds good.'
  );
  assert.equal(
    stripQuotedReply('Erledigt.\n\n________________________________\nVon: Max Muster <max@example.org>\nGesendet: Montag, 28. September 2026 14:03\nAn: Erika'),
    'Erledigt.'
  );
  assert.equal(stripQuotedReply('Siehe unten\n\n> alte Zeile\n> noch eine\n'), 'Siehe unten');
});

test('stripQuotedReply keeps forwarded messages and never returns empty text', () => {
  const fwd = 'FYI\n\n---------- Forwarded message ---------\nFrom: Max <max@example.org>\nDate: Mon, Sep 28, 2026\nSubject: Angebot\n\nInhalt';
  assert.equal(stripQuotedReply(fwd), fwd);
  const onlyQuote = 'Am Mo., 28. Sept. 2026 um 14:03 Uhr schrieb Max <max@example.org>:\n> Hallo';
  assert.equal(stripQuotedReply(onlyQuote), onlyQuote);
});

test('formatMessage renders headers, attachment list and body', () => {
  const text = formatMessage(
    msg({
      cc: [{ name: '', address: 'team@example.org' }],
      replyTo: [{ name: '', address: 'noreply@example.org' }],
      attachments: [{ filename: 'Angebot.pdf', size: 240 * 1024 }],
    }),
    opts
  );
  assert.equal(
    text,
    [
      'Betreff: Angebot Q4',
      'Von: Max Muster <max@example.org>',
      'An: Erika <erika@example.com>',
      'Cc: team@example.org',
      'Antwort an: noreply@example.org',
      'Datum: Mo., 28.09.2026, 14:03',
      'Anhänge: Angebot.pdf (240 KB)',
      '',
      'Hallo Erika,',
      '',
      'anbei das Angebot.',
      '',
      'Gruß Max',
      '',
    ].join('\n')
  );
});

test('formatThread numbers messages, strips quoted history and repeats only changed subjects', () => {
  const first = msg();
  const reply = msg({
    subject: 'Re: Angebot Q4',
    from: [{ name: 'Erika', address: 'erika@example.com' }],
    to: [{ name: 'Max Muster', address: 'max@example.org' }],
    date: new Date('2026-09-28T13:00:00Z'),
    text: 'Passt, danke!\n\nAm Mo., 28. Sept. 2026 um 14:03 Uhr schrieb Max Muster <max@example.org>:\n> Hallo Erika,',
  });
  const out = formatThread([first, reply], opts);
  assert.match(out, /^Verlauf: Angebot Q4 \(2 Nachrichten\)\n/);
  assert.match(out, /\[1\/2\]\nBetreff: Angebot Q4\nVon: Max Muster/);
  assert.match(out, /\[2\/2\]\nVon: Erika <erika@example.com>/);
  assert.match(out, /Passt, danke!\n$/);
  assert.doesNotMatch(out, /schrieb Max/);
});

test('safeFilename, formatSize and collectFiles', () => {
  assert.equal(safeFilename('Re: Angebot / Q4?'), 'Re_ Angebot _ Q4_');
  assert.equal(safeFilename('  ...  '), 'Mail');
  assert.equal(safeFilename('a'.repeat(200) + '.pdf').length, 100);
  assert.ok(safeFilename('a'.repeat(200) + '.pdf').endsWith('.pdf'));
  assert.equal(formatSize(512, 'de-DE'), '512 B');
  assert.equal(formatSize(1.25 * 1024 * 1024, 'de-DE'), '1,3 MB');

  const pdf = { filename: 'scan.pdf', mimeType: 'application/pdf', size: 3, data: 'abc' };
  const files = collectFiles(
    [msg({ attachments: [pdf, { ...pdf, data: 'xyz', size: 4 }] }), msg({ attachments: [pdf] })],
    'Angebot Q4.txt',
    'Mailtext'
  );
  assert.deepEqual(
    files.map((f) => f.name),
    ['Angebot Q4.txt', 'scan.pdf', 'scan (2).pdf']
  );
  assert.equal(files[0].data, 'Mailtext');
  assert.equal(files[0].encoding, 'utf8');
  assert.equal(files[1].encoding, 'binary');
});
