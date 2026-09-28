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
- German and English interface.

[Unreleased]: https://github.com/erorplex/gmail-paper-clipper/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/erorplex/gmail-paper-clipper/releases/tag/v0.1.0
