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
- Notes are stored in the browser's extension storage (`chrome.storage.local`) on this computer, together with the
  subject and the Gmail link of the thread. Copy counters are a local record of which email or thread you copied
  and when. Neither is synced or shared. Notes can be deleted and exported in the toolbar popup; counters are
  deleted together with the extension.
- If you turn on automatic updates (`./auto-update.sh on`), a background job runs `git fetch` against github.com
  every five minutes. It sends no data about you or your email; GitHub sees a normal anonymous git request.
- Nothing is sent to any server. There are no analytics, no telemetry, no remote code and no third-party libraries.

## Permissions

| Permission | Why |
| --- | --- |
| Access to `mail.google.com` (content script, host permission) | show the buttons, load the email you choose to copy, and switch open Gmail tabs to a new version after an update |
| `clipboardWrite` | put the text on the clipboard |
| `nativeMessaging` | talk to the local macOS helper for attachments |
| `storage` | keep your notes and copy counters on this computer |
| `alarms` | unpacked installs only: check once a minute whether the extension files changed after an update |
| `scripting` | after an install or update, bring open Gmail tabs to the new version |

## Contact

Questions or concerns: open an issue at https://github.com/erorplex/gmail-paper-clipper/issues.
