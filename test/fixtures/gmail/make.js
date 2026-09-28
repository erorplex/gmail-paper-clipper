// Writes the raw test messages of the mocked Gmail thread. Run: node test/fixtures/gmail/make.js
const fs = require('fs');
const path = require('path');
const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
const b64 = (buf) => buf.toString('base64').replace(/.{76}/g, '$&\n');
const pdf = b64(Buffer.from('%PDF-1.4\n' + 'x'.repeat(3000)));
const png = b64(Buffer.alloc(3000, 9));
const out = (name, text) => fs.writeFileSync(path.join(__dirname, name), crlf(text));

out('18a0000000000001.eml', `From: Max Muster <max@example.org>
To: Erika Beispiel <erika@example.com>
Subject: Angebot Q4
Date: Mon, 21 Sep 2026 09:15:00 +0200
Content-Type: multipart/mixed; boundary=b1

--b1
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: quoted-printable

Hallo Erika,

anbei unser Angebot f=C3=BCr Q4.

Gru=C3=9F Max
--b1
Content-Type: application/pdf; name="Angebot.pdf"
Content-Disposition: attachment; filename="Angebot.pdf"
Content-Transfer-Encoding: base64

${pdf}
--b1--
`);
out('18a0000000000002.eml', `From: Erika Beispiel <erika@example.com>
To: Max Muster <max@example.org>
Subject: Re: Angebot Q4
Date: Mon, 21 Sep 2026 11:02:00 +0200
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: quoted-printable

Danke, Max. Kannst du Position 3 noch aufschl=C3=BCsseln?

Am Mo., 21. Sept. 2026 um 09:15 Uhr schrieb Max Muster <max@example.org>:
> Hallo Erika,
> anbei unser Angebot.
`);
out('18a0000000000003.eml', `From: Max Muster <max@example.org>
To: Erika Beispiel <erika@example.com>
Cc: Team <team@example.org>
Subject: Re: Angebot Q4
Date: Tue, 22 Sep 2026 08:30:00 +0200
Content-Type: multipart/mixed; boundary=b3

--b3
Content-Type: text/html; charset=UTF-8

<div dir="ltr">Klar, siehe <b>Skizze</b> im Anhang.</div><div class="gmail_quote"><div class="gmail_attr">Am Mo., 21. Sept. 2026 um 11:02 Uhr schrieb Erika Beispiel &lt;erika@example.com&gt;:<br></div><blockquote>Danke, Max.</blockquote></div>
--b3
Content-Type: application/pdf; name="Angebot.pdf"
Content-Disposition: attachment; filename="Angebot.pdf"
Content-Transfer-Encoding: base64

${pdf}
--b3
Content-Type: image/png; name="Skizze.png"
Content-Disposition: attachment; filename="Skizze.png"
Content-Transfer-Encoding: base64

${png}
--b3--
`);
