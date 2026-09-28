# Privacy

Paper Clipper for Gmail processes your email only on your own computer.

## What the extension reads

- **Only when you click a button**, it loads the raw source of the email or thread you are looking at from
  `mail.google.com`, using your existing Gmail session in the same browser tab. The same happens when you use
  Gmail's own "Download original".
- It does not read your inbox in the background and does not scan other emails.

## Where data goes

- Text buttons: the formatted text goes to your clipboard. Nowhere else.
- Attachment buttons: text and attachments go to the Paper Clipper helper on your Mac (Chrome native messaging,
  a local process). The helper writes them to `~/Library/Caches/PaperClipper` and references them on the clipboard.
  The most recent copy stays there so that pasting keeps working; older copies are deleted the next time you copy
  with attachments (after one hour). `./uninstall.sh` removes the folder.
- Nothing is sent to any server. There are no analytics, no telemetry, no remote code and no third-party libraries.

## Permissions

| Permission | Why |
| --- | --- |
| Access to `mail.google.com` (content script) | show the buttons and load the email you choose to copy |
| `clipboardWrite` | put the text on the clipboard |
| `nativeMessaging` | talk to the local macOS helper for attachments |

## Contact

Questions or concerns: open an issue at https://github.com/erorplex/gmail-paper-clipper/issues.
