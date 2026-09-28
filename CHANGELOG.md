# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-09-28

### Added

- Buttons in Gmail: **Copy**, **With attachments** on every opened email; **Copy thread**, **Thread + attachments**
  below the subject.
- Raw message loading through Gmail's "Download original" link and a dependency-free MIME parser (charsets,
  quoted-printable, base64, RFC 2047/2231 names, `format=flowed`).
- Thread output with numbered messages and quoted reply history removed; forwarded emails are kept.
- macOS helper (Swift, native messaging) that puts text and attachments on the clipboard as real files, quarantined
  like browser downloads.
- Copy counters on every copy button: how often an email or thread was copied that way, and when last.
- Notes per thread: autosaving note field below the subject that reopens with the thread; toolbar popup lists all
  notes with search, link back to Gmail, delete and JSON export. Stored only locally.
- Automatic updates for git checkouts: `./auto-update.sh on` pulls `main` every five minutes (launchd) and
  rebuilds the helper when it changed; `./update.sh` does the same once.
- Unpacked installs reload themselves when their files change, and open Gmail tabs switch to the new version
  without a reload (also after a normal install or update).
- End-to-end test of the real extension in Chromium against a mocked Gmail, run in CI.
- German and English interface.

### Security

- Header values (subject, names, attachment names) are kept on one line in the copied text, so an email cannot
  forge extra header lines; the attachment list shows the cleaned file names.
- HTML-to-text conversion runs in linear time, so hostile markup cannot freeze Gmail.
- The helper answers invalid messages with an error instead of exiting; the extension sends only well-formed
  Unicode.

[Unreleased]: https://github.com/erorplex/gmail-paper-clipper/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/erorplex/gmail-paper-clipper/releases/tag/v0.1.0
