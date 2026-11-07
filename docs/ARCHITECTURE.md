# Architecture

Link Hopper is a Manifest V3 extension with no background script, no content script and no build step. The whole thing is a popup.

## Files

```
src/popup/index.html   loads, in order: vendor/qr-code-styling.js, lib/utils.js, lib/card.js, popup/index.js
src/lib/utils.js       pure helpers
src/lib/card.js        bento card layout (pure) and canvas rendering
src/popup/index.js     ThemeManager, Toast, QR options, actions, startup flow
src/popup/index.css    styling and light/dark themes
```

`src/manifest.json` declares the popup (`action.default_popup`), the icons, the `Alt+Q` command (`_execute_action`) and the permissions `activeTab`, `favicon` and `storage` (`tests/structure.test.js` enforces that exact list).

## Opening the popup

```
DOMContentLoaded
  |- ThemeManager.init()            apply cached theme, then reconcile with chrome.storage.sync
  `- chrome.tabs.query({active, currentWindow})
        |- no URL or !isSupportedUrl  -> error screen (unsupported page)
        |- getQrUrlStatus(url)
        |     |- 'too-long'           -> error screen (too long)
        |     |- 'long'               -> QR + warning
        |     `- 'ok'                 -> QR
        |- new QRCodeStyling(280px).append(container)
        |     `- throws               -> error screen (generic)
        |- fill URL, title, site name, favicon (or letter badge)
        `- wire Copy / Download / Share
```

The QR code is created before the rest of the UI is filled in, so a failure there shows the error screen instead of a half-populated popup.

## Modules

**`src/lib/utils.js`** exports `isSupportedUrl`, `extractWebsiteName`, `QR_LIMITS`, `getQrUrlStatus`, `getSiteInitial`, `PALETTES`, `getSitePalette`, `getQrPalette`, `contrastRatio` and `hslToHex`. All are pure and tolerate bad input. It is wrapped in a UMD header: in the popup, a classic `<script>` sets `window.LinkHopperUtils` (no bundler or ES modules needed), and in Node tests it is `require`d. Keeping logic here makes it unit testable without a DOM.

**`src/popup/index.js`** holds everything with side effects:

- `ThemeManager`: reading, applying and persisting the theme.
- `Toast`: transient messages, built with `createElement` / `textContent`, never `innerHTML`.
- `buildQrOptions`, `copyUrlToClipboard`, `downloadQRCode`, `getCardBlob`, `loadCardFavicon`, `shareUrl`, `showFaviconFallback`, `showError`.

## Theme storage

Two layers, because `chrome.storage.sync` is asynchronous and waiting on it would flash the wrong theme:

- `localStorage['linkhopper-theme']` is a synchronous cache, read on startup so the theme is applied immediately.
- `chrome.storage.sync` (same key) is the source of truth, shared across the user's devices when Chrome Sync is on.

After applying the cached value, `_reconcile` reads sync. If a remote value exists and differs, it overwrites the cache and re-applies the theme. If there is no remote value but a local one exists (a setting from before sync was used), it is written up to sync. Toggling writes the cache first, then sync. Sync failures are caught and never break the popup.

Follow-system rule: with no stored choice, the theme follows `prefers-color-scheme`, including live changes. Once a choice is stored, system changes are ignored.

## QR code

Options come from `buildQrOptions(url, size, margin)`:

- Opaque white background (`#ffffff`) with rounded dots and finder patterns in the site's colour (see QR colours below), so the code scans in dark mode as well as light.
- Error-correction level `M`, a balance between density and damage tolerance for long URLs.
- Two instances (plus the card, see below): the on-screen one is 280px with margin 8, created at startup. The export instance is 1024px with margin 32, created lazily on the first Download click and then reused, so normal use doesn't pay for it. The download is a PNG.

## QR colours

`PALETTES` in `utils.js` holds 10 frozen palettes, each with a `light` and a `dark` variant (`base` page colour, `surface` raised tile, `border`, `text`, `muted`, `accent`, `badgeText`, `iconBack`, `shadow`) and `dots` for the QR. `getSitePalette(siteName)` picks one by a stable hash of the hostname. Tests check contrast for every palette in both themes: text at 7:1 or better, muted text and accents at 4.5:1 or better, QR dots at 7:1 or better on white. `getQrPalette(palette)` returns `{ dots, corners, background }` with a pure white background, never light-on-dark, and falls back to near-black if the dots ever fail the 7:1 check. `buildQrOptions` is the single builder used by both the popup preview and the export instance. Dot style (`rounded`) and error correction `M` are unchanged. The popup script sets `--pl-*` (light) and `--pd-*` (dark) custom properties and `data-palette` on `<html>`; `index.css` selects the set matching `data-theme`, with Ocean fallbacks. `card.js` maps the same palette variant onto the card colours (`getCardTheme(theme, palette)`).

## Share

`shareUrl` in `index.js` shares only the URL. If `navigator.share` exists and `navigator.canShare({ url })` (when present) does not say no, it calls `navigator.share({ url })`: no title, no text, no image. An `AbortError` (the user dismissed the sheet) is silent. Success shows a "Shared!" toast.

If `navigator.share` is missing, `canShare` refuses, or the share fails with another error, it falls back to `copyUrlToClipboard(url)`, the same path as the Copy button: `navigator.clipboard.writeText(url)` with a "Copied to clipboard!" toast, or "Failed to copy" if that fails. The Share button is always visible. Copy is separate and also writes only the plain URL.

Limit: whether the share sheet exists depends on the OS and browser.

## Verification limits

jsdom has no canvas or real clipboard. Tests use a recording fake canvas (`tests/helpers/fakeCanvas.js`) and check the layout through its draw log, and stubbed `navigator.share` and clipboard. The real canvas output, the `_favicon` endpoint, file saving, and the system share sheet can only be verified by loading `src/` in Chrome.

## Error states

One error screen, three messages: unsupported page (no URL, or not http/https), URL over 2000 characters, and a generic message when creating or appending the QR code throws. The header resets to "Link Hopper" with no favicon. URLs of 801-2000 characters still render a QR code plus an inline warning.

## Favicon fallback chain

1. The tab's `favIconUrl`, loaded with `referrerPolicy = 'no-referrer'`.
2. On error, `/favicon.ico` on the page's origin (tried once; skipped if that was already the tab icon).
3. On a further error, or if the tab has no icon, a letter badge: the first alphanumeric character of the site name, coloured with the site palette accent.

## Tests and their limits

- `tests/utils.test.js`: pure unit tests, including the UMD browser path.
- `tests/card.test.js`: pure unit tests for `card.js`, including `renderCard` against the fake canvas.
- `tests/popup.test.js`, `tests/popup-card.test.js` and `tests/popup-share.test.js`: load the real `index.html` and scripts into jsdom through `tests/helpers/loadPopup.js`, with fakes for `chrome.tabs`, `chrome.storage.sync`, clipboard, `matchMedia` and `QRCodeStyling`.
- `tests/structure.test.js` and `tests/package-script.test.js`: manifest/package consistency and the zip.

Limits: the QR library is faked, so tests verify the options passed and the calls made, not the canvas output or the file download. QR colour contrast is unit tested as numbers, and scanning was checked with a decoder on square-module renders across hues and sizes, but scanning the rounded style with a phone camera must be checked by hand. Those, the card and favicon paths described above, plus real `chrome.*` behaviour, CSP enforcement and Chrome Sync, can only be verified by loading `src/` in Chrome.
