# Contributing

Thanks for helping. Bug reports, Gmail breakage reports and pull requests are all welcome.

## Reporting a problem

Use the [issue templates](https://github.com/erorplex/gmail-paper-clipper/issues/new/choose). When Gmail changed and
the buttons break, say which view you use (default, split pane, popout) and paste any errors from the console
(right click in Gmail → Inspect → Console, filter for `Paper Clipper`). Please never post real email content.

## Development setup

```bash
git clone https://github.com/erorplex/gmail-paper-clipper.git
cd gmail-paper-clipper
npm test              # no install step, no dependencies
./install.sh          # macOS: build and register the helper
```

Load the folder at `chrome://extensions` (Developer mode → Load unpacked). The extension notices changed files
within a minute and reloads itself, open Gmail tabs included; the reload arrow at `chrome://extensions` is faster.

## Guidelines

- **`main` is live.** Installs with automatic updates pull it within minutes, so only green, reviewed pull requests
  go to `main`.

- **No runtime dependencies.** The extension reads email; every line of code in it should be reviewable here.
- **No `innerHTML`.** Gmail enforces Trusted Types; build DOM nodes with `createElement`.
- **Gmail specifics stay in `src/gmail.js`.** Selectors and URLs change; keeping them in one place keeps fixes small.
- **Tests first for logic.** Parser and formatting changes come with a test in `test/`. Use made-up addresses
  (`example.com`, `example.org`), never real email.
- **Helper changes** keep the protocol documented at the top of `host/PaperClipperHelper.swift` and pass
  `npm run test:helper` on macOS.
- Code and commit messages in English. User-facing strings in both German and English (`src/content.js`,
  `_locales/`).
- Add a line to `CHANGELOG.md` under **Unreleased**.

## Releasing

1. Move the **Unreleased** entries in `CHANGELOG.md` to a new version.
2. Bump the version in `manifest.json`, `package.json` and `host/PaperClipperHelper.swift` (`npm test` checks
   that they match).
3. Tag `vX.Y.Z` on `main` and create a GitHub release with the changelog entry.
