# Security policy

Paper Clipper handles email content and runs a native helper on macOS, so security reports are very welcome.

## Supported versions

Only the latest release and the `main` branch receive fixes.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through GitHub:
[Security → Report a vulnerability](https://github.com/erorplex/gmail-paper-clipper/security/advisories/new).

Include what you found, how to reproduce it and the impact you see. You get a first answer within 7 days. Once a fix
is released, the advisory is published with credit, unless you prefer to stay anonymous.

## Scope

In scope, for example:

- the macOS helper (`host/`): file handling, native messaging input, clipboard content,
- parsing of untrusted email in `src/mime.js` and `src/format.js`, including crafted attachment names,
- anything that lets a web page or an email trigger actions of the extension.

Out of scope: vulnerabilities in Gmail, Chrome or macOS themselves.
