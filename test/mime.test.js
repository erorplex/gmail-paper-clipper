const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMessage, decodeWords, parseAddressList, toBytes } = require('../src/mime.js');

const crlf = (s) => s.replace(/\n/g, '\r\n');
const utf8 = (s) => new TextEncoder().encode(s);
const SP = ' '; // explicit, editors strip trailing spaces
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

test('decodes encoded-word subjects (Q and B, split across words)', () => {
  assert.equal(decodeWords('=?UTF-8?Q?Gr=C3=BC=C3=9Fe_aus_K=C3=B6ln?='), 'Grüße aus Köln');
  assert.equal(decodeWords('=?utf-8?B?' + b64('Angebot Q4 – Übersicht') + '?='), 'Angebot Q4 – Übersicht');
  // "ü" (C3 BC) split across two adjacent encoded words must be joined before decoding
  assert.equal(decodeWords('=?UTF-8?Q?Gr=C3?= =?UTF-8?Q?=BC=C3=9Fe?='), 'Grüße');
  assert.equal(decodeWords('Re: =?iso-8859-1?Q?M=FCller?= und Co'), 'Re: Müller und Co');
});

test('parses address lists with quotes, commas, encoded names and groups', () => {
  const list = parseAddressList(
    '"Muster, Max" <max@example.org>, =?UTF-8?Q?J=C3=BCrgen_B=C3=A4r?= <jb@x.de>, plain@y.de, undisclosed-recipients:;'
  );
  assert.deepEqual(list, [
    { name: 'Muster, Max', address: 'max@example.org' },
    { name: 'Jürgen Bär', address: 'jb@x.de' },
    { name: '', address: 'plain@y.de' },
  ]);
  assert.deepEqual(parseAddressList('=?UTF-8?Q?M=C3=BCller=2C_Anna?= <a@b.de>'), [
    { name: 'Müller, Anna', address: 'a@b.de' },
  ]);
});

test('parses a simple quoted-printable UTF-8 mail', () => {
  const raw = crlf(`From: Max Muster <max@example.org>
To: Erika <erika@example.com>
Cc: a@b.de, "C, D" <cd@e.de>
Subject: =?UTF-8?Q?R=C3=BCckfrage?=
Date: Mon, 28 Sep 2026 14:03:12 +0200 (CEST)
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

Hallo Erika,=20
kurze R=C3=BCckfrage zu deinem Angebot. Das ist eine sehr lange Zeile, die =
umbrochen wurde.

Gru=C3=9F Max
`);
  const msg = parseMessage(utf8(raw));
  assert.equal(msg.subject, 'Rückfrage');
  assert.deepEqual(msg.from, [{ name: 'Max Muster', address: 'max@example.org' }]);
  assert.deepEqual(msg.cc.map((a) => a.address), ['a@b.de', 'cd@e.de']);
  assert.equal(msg.date.toISOString(), '2026-09-28T12:03:12.000Z');
  assert.match(msg.text, /kurze Rückfrage zu deinem Angebot\. Das ist eine sehr lange Zeile, die umbrochen wurde\./);
  assert.match(msg.text, /Gruß Max/);
  assert.equal(msg.attachments.length, 0);
});

test('multipart/mixed with alternative body and base64 PDF attachment', () => {
  const pdf = '%PDF-1.4\n\x00\x01\x02\xff binary';
  const pdfB64 = Buffer.from(pdf, 'latin1').toString('base64');
  const raw = crlf(`From: a@b.de
To: c@d.de
Subject: Rechnung
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="outer"

This is a multi-part message in MIME format.
--outer
Content-Type: multipart/alternative; boundary="inner"

--inner
Content-Type: text/plain; charset=UTF-8

Anbei die Rechnung.
--inner
Content-Type: text/html; charset=UTF-8

<div>Anbei die <b>Rechnung</b>.</div>
--inner--

--outer
Content-Type: application/pdf; name="Rechnung 2026-09.pdf"
Content-Disposition: attachment; filename="Rechnung 2026-09.pdf"
Content-Transfer-Encoding: base64

${pdfB64.slice(0, 10)}
${pdfB64.slice(10)}
--outer--
epilogue
`);
  const msg = parseMessage(utf8(raw));
  assert.equal(msg.text.trim(), 'Anbei die Rechnung.');
  assert.match(msg.html, /<b>Rechnung<\/b>/);
  assert.equal(msg.attachments.length, 1);
  const [att] = msg.attachments;
  assert.equal(att.filename, 'Rechnung 2026-09.pdf');
  assert.equal(att.mimeType, 'application/pdf');
  assert.equal(att.size, pdf.length);
  assert.deepEqual(Buffer.from(toBytes(att.data)), Buffer.from(pdf, 'latin1'));
});

test('RFC 2231 filenames (extended and continued) win over the plain fallback', () => {
  const raw = crlf(`From: a@b.de
Subject: x
Content-Type: multipart/mixed; boundary=b

--b
Content-Type: text/plain

Text
--b
Content-Type: application/pdf
Content-Disposition: attachment; filename="fallback.pdf"; filename*=UTF-8''%C3%9Cbersicht%20Q4.pdf
Content-Transfer-Encoding: base64

JVBERg==
--b
Content-Type: application/octet-stream
Content-Disposition: attachment; filename*0*=UTF-8''Gro%C3%9Fe%20; filename*1*=Tabelle.xlsx
Content-Transfer-Encoding: base64

AAAA
--b
Content-Type: application/pdf; name="=?utf-8?B?${b64('Bestätigung.pdf')}?="
Content-Transfer-Encoding: base64

JVBERg==
--b--
`);
  const names = parseMessage(utf8(raw)).attachments.map((a) => a.filename);
  assert.deepEqual(names, ['Übersicht Q4.pdf', 'Große Tabelle.xlsx', 'Bestätigung.pdf']);
});

test('skips small cid-referenced inline images, keeps screenshots and inline PDFs', () => {
  const small = Buffer.alloc(2000, 1).toString('base64');
  const big = Buffer.alloc(80 * 1024, 2).toString('base64');
  const raw = crlf(`From: a@b.de
Subject: Bilder
Content-Type: multipart/mixed; boundary=m

--m
Content-Type: multipart/related; boundary=r

--r
Content-Type: text/html; charset=utf-8

<p>Logo <img src="cid:logo@sig"> Screenshot <img src="cid:shot1"></p>
--r
Content-Type: image/png; name="logo.png"
Content-Disposition: inline; filename="logo.png"
Content-ID: <logo@sig>
Content-Transfer-Encoding: base64

${small}
--r
Content-Type: image/png; name="image001.png"
Content-Disposition: inline; filename="image001.png"
Content-ID: <shot1>
Content-Transfer-Encoding: base64

${big}
--r--
--m
Content-Type: application/pdf; name="Vertrag.pdf"
Content-Disposition: inline; filename="Vertrag.pdf"
Content-Transfer-Encoding: base64

JVBERg==
--m
Content-Type: application/pgp-signature; name="signature.asc"

-----BEGIN PGP SIGNATURE-----
--m--
`);
  const msg = parseMessage(utf8(raw));
  assert.deepEqual(
    msg.attachments.map((a) => [a.filename, a.inline]),
    [
      ['image001.png', true],
      ['Vertrag.pdf', false],
    ]
  );
  assert.equal(msg.attachments[0].size, 80 * 1024);
});

test('decodes 8bit latin1 bodies and raw UTF-8 headers', () => {
  const head = crlf('From: Jürgen <j@x.de>\nSubject: Äpfel & Birnen\nContent-Type: text/plain; charset=iso-8859-1\nContent-Transfer-Encoding: 8bit\n\n');
  const body = Buffer.from('Schöne Grüße\r\n', 'latin1');
  const msg = parseMessage(new Uint8Array(Buffer.concat([Buffer.from(head, 'utf8'), body])));
  assert.equal(msg.subject, 'Äpfel & Birnen');
  assert.equal(msg.from[0].name, 'Jürgen');
  assert.equal(msg.text.trim(), 'Schöne Grüße');
});

test('undoes format=flowed soft line breaks', () => {
  const raw = crlf(`From: a@b.de
Subject: flowed
Content-Type: text/plain; charset=utf-8; format=flowed

Das ist ein langer Absatz, der vom Mailprogramm${SP}
weich umbrochen wurde.

--${SP}
Signatur
`);
  const msg = parseMessage(utf8(raw));
  assert.equal(msg.text.trim(), 'Das ist ein langer Absatz, der vom Mailprogramm weich umbrochen wurde.\n\n-- \nSignatur');
});

test('attached messages become .eml files named after their subject; calendar alternatives are skipped', () => {
  const raw = crlf(`From: a@b.de
Subject: Fwd
Content-Type: multipart/mixed; boundary=z

--z
Content-Type: multipart/alternative; boundary=y

--y
Content-Type: text/plain

Einladung
--y
Content-Type: text/calendar; method=REQUEST

BEGIN:VCALENDAR
--y--
--z
Content-Type: message/rfc822

From: x@y.de
Subject: =?UTF-8?Q?Urspr=C3=BCngliche_Mail?=

Hallo
--z
Content-Type: application/ics; name="invite.ics"
Content-Disposition: attachment; filename="invite.ics"

BEGIN:VCALENDAR
--z--
`);
  const msg = parseMessage(utf8(raw));
  assert.equal(msg.text.trim(), 'Einladung');
  assert.deepEqual(
    msg.attachments.map((a) => [a.filename, a.mimeType]),
    [
      ['Ursprüngliche Mail.eml', 'message/rfc822'],
      ['invite.ics', 'application/ics'],
    ]
  );
});
