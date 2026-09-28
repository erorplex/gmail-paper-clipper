# Paper Clipper for Gmail

[![CI](https://github.com/erorplex/gmail-paper-clipper/actions/workflows/ci.yml/badge.svg)](https://github.com/erorplex/gmail-paper-clipper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platform: Chrome · macOS](https://img.shields.io/badge/platform-Chrome%20%C2%B7%20macOS-lightgrey)

**Copy a Gmail email or a whole thread in one click: subject, sender, recipients, date and text. The attachments
can come along as real files.**

Paste into Claude, ChatGPT, Slack, a ticket or the Finder with ⌘V. The PDFs arrive as PDFs, not as a line of text.

🇩🇪 [Deutsche Anleitung](README.de.md)

> Paper Clipper is an independent open source project, not affiliated with or endorsed by Google.
> Gmail is a trademark of Google LLC.

## Features

Two button bars appear in Gmail:

| Where | Button | What lands on the clipboard |
| --- | --- | --- |
| every opened email | **Copy** | headers and text of this email |
| every opened email | **With attachments** | text plus every attachment as a file |
| below the subject | **Copy thread** | every email of the conversation, numbered, quoted history removed |
| below the subject | **Thread + attachments** | the thread plus all attachments, each one once |

Example of **Copy**:

```
Subject: Offer Q4
From: Max Muster <max@example.org>
To: Erika Beispiel <erika@example.com>
Cc: Team <team@example.org>
Date: Tue, 22/09/2026, 08:30
Attachments: Offer.pdf (240 KB), Sketch.png (39 KB)

Hi Erika, …
```

The labels follow your browser language. German and English are built in.

## Installation guide

### Requirements

- Google Chrome. Other Chromium browsers (Brave, Edge, Arc) work too.
- For the attachment buttons: macOS with Apple's command line tools. `install.sh` tells you when they are missing.
  The text buttons work on any system that runs Chrome.

### Step 1: Get the code

Put the folder somewhere permanent. Chrome loads the extension from it every time it starts.

```bash
git clone https://github.com/erorplex/gmail-paper-clipper.git ~/gmail-paper-clipper
```

Without git: on GitHub, click **Code → Download ZIP**, unzip it and move the folder to a permanent place, for example
your home folder.

### Step 2: Install the helper (macOS, for the attachment buttons)

Open the Terminal, change into the folder and run the installer:

```bash
cd ~/gmail-paper-clipper && ./install.sh
```

The script compiles the small helper from `host/PaperClipperHelper.swift` and registers it with every Chromium
browser it finds. It ends with `✓ helper responds`. If Swift is missing, run `xcode-select --install` first.

### Step 3: Load the extension in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `gmail-paper-clipper` folder.
4. Optional: pin Paper Clipper via the puzzle icon in the toolbar.

### Step 4: Try it

Reload Gmail and open an email. The buttons sit below the subject and above the text of every opened email.
Click **With attachments**, switch to the Finder and press ⌘V: the attachments appear as files.

## Using it

- **Copy** and **Copy thread** put plain text on the clipboard. They work in any text field.
- **With attachments** and **Thread + attachments** put three things on the clipboard:
  - the text, for plain text fields,
  - `<subject>.txt` with the same text,
  - every attachment as a file.

  Web apps like Claude or ChatGPT take only the files when files are on the clipboard. The `.txt` file makes sure
  the email text still arrives.
- The thread buttons open Gmail's "older messages" bubble first, so no email is left out. The confirmation shows how
  many messages were copied.
- In a thread, quoted history ("On … wrote:", "Am … schrieb …:", Outlook header blocks) is cut from every reply, so
  nothing appears twice. Forwarded emails are kept. **Copy** on a single email keeps its full text.
- Small images embedded in the text, under 30 KB and usually signature logos, are skipped. Pasted screenshots are
  kept.

## Updating

```bash
cd ~/gmail-paper-clipper && git pull && ./install.sh
```

Then click the reload arrow of Paper Clipper at `chrome://extensions` and reload Gmail.

## Uninstalling

Run `./uninstall.sh` and remove the extension at `chrome://extensions`.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| No buttons in Gmail | Reload Gmail. Check at `chrome://extensions` that Paper Clipper is enabled and shows no errors. |
| "Mac helper missing" | Run `./install.sh` in the extension folder, then reload Gmail. |
| "The Mac helper does not know this extension" | You loaded a copy with a different extension id. Run `./install.sh` again, or `./install.sh <id>` with the id shown at `chrome://extensions`. |
| A thread copy has fewer messages than expected | Open the thread fully once and copy again. If it persists, please [open an issue](https://github.com/erorplex/gmail-paper-clipper/issues/new/choose). |
| Buttons stopped working after a Gmail update | Gmail changed its markup. Please [report it](https://github.com/erorplex/gmail-paper-clipper/issues/new/choose); the fix usually lives in `src/gmail.js`. |

## How it works

- Every email is loaded through Gmail's own **Download original** link as raw message (RFC 822), using your current
  Gmail session. There is no Google API, no OAuth and no extra login.
- `src/mime.js` parses the raw message: charsets, quoted-printable and base64, RFC 2047 and RFC 2231 names,
  `format=flowed`.
- `src/format.js` builds the text and the file list.
- The attachment buttons hand text and files to the helper via Chrome native messaging. The helper stores them in
  `~/Library/Caches/PaperClipper` and puts text and file references on the macOS clipboard. Copies older than one
  hour are deleted on the next copy.
- Attachments carry the macOS quarantine flag like browser downloads, so Gatekeeper still checks a file before it
  is opened. File names are cleaned of path separators and invisible direction characters.

## Privacy

Everything stays on your computer. No server, no analytics, no third-party code. Details in [PRIVACY.md](PRIVACY.md).

## Limitations

- The attachment buttons need macOS. Help for Windows or Linux helpers is welcome.
- Google Drive links in emails are links, not attachments, and are not copied as files.
- Gmail changes its markup from time to time. Everything Gmail-specific is kept in `src/gmail.js`.
- The helper only answers the extension id pinned by `key` in `manifest.json`. Forks with their own key run
  `./install.sh <id>`.

## Development

```bash
npm test              # parser, formatting and version tests (Node ≥ 20, no dependencies)
npm run build:helper  # compile the macOS helper
npm run test:helper   # end-to-end helper test (macOS, overwrites the clipboard)
npm run icons         # render the icons
```

`tools/paste-probe.html` shows what a web page receives when you paste: types, text and files.

```
manifest.json         Manifest V3
src/content.js        buttons, notifications, copy flow
src/gmail.js          everything Gmail-specific (DOM selectors, raw message URL)
src/mime.js           MIME parser
src/format.js         text output, quote stripping, file list
src/background.js     relay to the macOS helper
host/                 macOS helper (Swift, native messaging)
install.sh            build and register the helper
```

Contributions are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
