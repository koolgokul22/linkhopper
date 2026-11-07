# Contributing to Link Hopper

Thanks for helping out. This is a small project, so the process is light.

## Setup

1. Install Node.js 22 (the version in [`.nvmrc`](.nvmrc)).
2. Fork and clone the repo, then:

   ```bash
   npm ci
   npm test
   ```

There is no build step. Load the extension in Chrome from `chrome://extensions` -> Developer mode -> Load unpacked -> select the **`src`** folder. After editing, click the reload icon on the extension card and reopen the popup.

## Repository layout

```
src/            What Chrome loads and what gets zipped (manifest, popup/, lib/utils.js, lib/card.js, vendor/, assets/)
tests/          node:test tests; tests/helpers/ holds the jsdom harness and fakes
scripts/        package.mjs builds dist/link-hopper-v<version>.zip
.github/        Workflows, Dependabot, PR and issue templates
docs/           ARCHITECTURE.md, RELEASING.md, images/
```

Nothing outside `src/` ships in the extension. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit.

## Workflow: tests first

1. Create a branch from `main`.
2. Write or update a test that fails for the bug or feature.
3. Make it pass. Run `npm test` (it runs `node --test tests/*.test.js`).
4. Try the change by hand in Chrome (see below).
5. Update `CHANGELOG.md` under `[Unreleased]` if the change is user-facing.

### Tests

| File | Covers |
|------|--------|
| `tests/utils.test.js` | Pure helpers in `src/lib/utils.js` (URL support, site name, QR limits, letter badge, QR palette and contrast). |
| `tests/popup.test.js` | Popup behaviour in jsdom: unsupported schemes, long URLs, download, favicon fallback, theme storage, no markup injection. |
| `tests/card.test.js` | Card helpers and `renderCard` layout, checked through a fake canvas draw log. |
| `tests/popup-card.test.js` | Download in the popup: card pipeline, theme, favicon fallback, plain-QR fallback. |
| `tests/popup-share.test.js` | Share button: system share sheet gets only the URL, abort handling, plain-URL clipboard fallback, toasts. |
| `tests/structure.test.js` | Package structure, including matching versions and the exact manifest permission list. |
| `tests/package-script.test.js` | Zip layout, reproducibility, and clear failures. |

`loadPopup()` in `tests/helpers/loadPopup.js` loads `src/popup/index.html` into jsdom, evaluates the `src/lib/` scripts and `src/popup/index.js`, and fakes the browser APIs the popup needs:

- `chrome.tabs.query`, returning the tab you pass in
- `chrome.storage.sync` (`get`/`set`), with options to make it fail or be absent
- `navigator.clipboard.writeText`
- `window.matchMedia` (system dark mode and change events)
- `QRCodeStyling`, a fake class that records its options, `append` and `download` calls and can be told to throw

One more helper: `tests/helpers/fakeCanvas.js` is a recording canvas/context for the card.

Because the QR library and canvas are faked, tests check the options passed and the draw calls, not the rendered pixels. Real canvas rendering, the favicon endpoint, file saving, the system share sheet and whether the (rounded-style) QR codes scan on a phone are only verified in Chrome and on a device.

To run one file: `node --test tests/utils.test.js`.

## Code style

Follow what the existing code does:

- Vanilla JavaScript, no framework and no build step.
- No inline scripts or inline event handlers: the Manifest V3 extension-page CSP blocks them. Put code in files under `src/` and reference them with `<script src>`.
- Build DOM with `textContent` / `createElement`, not `innerHTML` with dynamic data.
- Keep pure logic in `src/lib/` (`utils.js`, `card.js`; UMD, so Node tests and the popup share it) and cover it with unit tests.
- Comments only where the reason isn't obvious.
- Don't add runtime dependencies. The only dev dependency is `jsdom`.

## Manual testing

Load `src/` unpacked and check:

1. **Normal page**: open an `https://` page, then the popup. The site name, title, URL and QR code appear; Copy, Download and Share work; the theme choice persists after closing and reopening.
2. **Unsupported page**: open `chrome://extensions` or a `file://` page. The popup shows the unsupported-page message, not a blank popup.
3. **Favicon**: a page without an icon shows a letter badge.
4. **Long URL warning** (801-2000 characters): in PowerShell, put a long URL on the clipboard, paste it into a tab's address bar and press Enter (the page doesn't need to exist for the popup to show the warning once it is the tab's URL), then open the popup:

   ```powershell
   "https://example.com/?q=" + ("a" * 880) | Set-Clipboard
   ```

5. **Too long** (over 2000 characters):

   ```powershell
   "https://example.com/?q=" + ("a" * 2100) | Set-Clipboard
   ```

6. **Both themes**: check the popup and its QR code in light and dark mode.
7. **Download**: click Download in light and dark mode and open each PNG. Check the site's real icon (or letter badge), the white QR tile and the single URL tile, and that the filename matches `<website>_<YYYYMMDD>-<HHMMSS>.png` (for example `linkedin.com_20261107-143512.png`). Try a very long URL: the text should end in an ellipsis.
8. **Share**: click Share. The system share sheet should appear; send to Messages, Mail or similar and check the receiving app gets only the link (no title or extra text). Dismissing the sheet should show nothing. If your browser or OS shows no sheet, the plain link should land on the clipboard with a "Copied to clipboard!" toast; paste it into Notepad to confirm.
9. **Scan**: point a phone camera at the popup QR code, and at the QR on a downloaded card, from 30-40 cm. Try a few sites (different colours) and both themes. Automated tests cannot check this for the rounded dot style.
10. **Permission change**: when testing the `favicon` permission, reload the extension in `chrome://extensions` and re-approve any permission prompt (Chrome may disable the extension until you do).

## Branches and pull requests

- Branch from `main` with a short descriptive name (for example `fix/favicon-retry`).
- Open the PR against `main` and fill in the [pull request template](.github/pull_request_template.md): summary, type of change, and the checklist (`npm test` passes, tried unpacked from `src/`, version bumped only if releasing, docs/changelog updated if user-facing). Add screenshots for UI changes.
- CI must pass on Ubuntu and Windows.
- Don't bump the version in regular PRs; see [docs/RELEASING.md](docs/RELEASING.md).

## Reporting bugs and ideas

[Open an issue](https://github.com/koolgokul22/linkhopper/issues/new/choose) and pick **Bug report** or **Feature request**. For bugs include the Link Hopper version, Chrome version, operating system, the type of URL or page, steps to reproduce, and expected versus actual behavior.
