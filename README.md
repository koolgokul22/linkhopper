<p align="center">
  <img src="docs/images/icon1024.webp" alt="Link Hopper logo" width="96" height="96">
</p>

# 🔗 Link Hopper

A lightweight Chrome extension that turns any tab's URL into a scannable QR code — share links to your phone in one scan, no typing required.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/igkffepamaelmkbbbmihiiklabbdhlnp?label=Install%20from%20Chrome%20Web%20Store&logo=google-chrome)](https://chromewebstore.google.com/detail/igkffepamaelmkbbbmihiiklabbdhlnp)
[![CI](https://github.com/koolgokul22/linkhopper/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/koolgokul22/linkhopper/actions/workflows/ci.yml)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

---

## ✨ Features

- **Instant QR code** — One click turns the current page URL into a styled QR code with rounded dots in a dark shade of the site's own colour (always at least 7:1 contrast against pure white), drawn on white with error-correction level M so it scans reliably in dark mode too.
- **Copy URL** — Copy the link to your clipboard with a single tap.
- **Download** — Saves a portrait "bento" card (1200px-wide PNG): an opaque, per-site tinted background with a header tile (the site's real icon or a coloured letter badge, plus the hostname), a large white QR tile, and one full-width URL tile (up to 6 lines, ellipsised; the QR still encodes the full URL). Colours follow the current light or dark theme. The file is named `<website>_<YYYYMMDD>-<HHMMSS>.png` in local time, for example `linkedin.com_20261107-143512.png`.
- **Share** — Opens your system share sheet with just the link (no title, no extra text). Whether the sheet appears depends on your OS and browser. If it is unavailable or fails, Link Hopper copies the plain URL to your clipboard instead. Dismissing the sheet does nothing.
- **Dark / Light mode** — Toggle themes, or follow your system preference. Your choice is remembered and synced via Chrome Sync if you have it on.
- **Favicon fallback** — If a site's icon is missing or fails to load, you get a coloured letter badge instead.
- **Long-link warnings** — Links of 801–2000 characters show a "may be hard to scan" warning; longer ones get a clear "too long" message.
- **Keyboard shortcut** — Press `Alt+Q` to open Link Hopper (customizable at `chrome://extensions/shortcuts`).
- **Friendly errors** — Unsupported pages show a message instead of a blank popup.
- **Private** — Plain JavaScript, no servers, no tracking. The QR code is generated locally.

---

## 📦 Install

### From the Chrome Web Store (Recommended)

1. Visit the [Chrome Web Store listing](https://chromewebstore.google.com/detail/igkffepamaelmkbbbmihiiklabbdhlnp).
2. Click **Add to Chrome**.
3. Done — the Link Hopper icon appears next to your address bar.

### Manual Install (Developer Mode)

1. Clone or download this repo.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (toggle in the top-right).
4. Click **Load unpacked** and select the **`src`** folder (not the repo root).

---

## 🚀 How to Use

1. Navigate to any `http://` or `https://` webpage.
2. Click the **Link Hopper icon** in the toolbar (or press **Alt+Q**).
3. The popup shows the site's favicon and name, a **QR code** of the current URL (scan it with your phone), and the page title and full URL.
4. Use the action buttons:
   - **Copy** — copies the plain URL to your clipboard.
   - **Download** — saves the card as a PNG file named after the site and the time.
   - **Share** — opens the system share sheet with just the link; if there is no share sheet, copies the plain URL to your clipboard.
5. Use the **🌙 / ☀️** button in the header to switch between dark and light mode.

---

## ⌨️ Keyboard Shortcut

| Shortcut | Action |
|----------|--------|
| `Alt+Q`  | Open Link Hopper popup |

Customize it at `chrome://extensions/shortcuts`.

---

## 🔒 Privacy & Permissions

Link Hopper requests three permissions:

| Permission | Why |
|------------|-----|
| `activeTab` | Reads only the active tab's URL, title and favicon, and only when you open the popup. |
| `favicon` | Reads the page's icon from Chrome's own favicon cache, locally, only to draw it on the downloaded card. Nothing is sent anywhere by the extension. |
| `storage` | Remembers your light/dark choice. It is synced by Chrome Sync if you have sync turned on. |

No analytics, no remote servers. The QR code and the card are generated locally in the popup. Share hands the link to your system's own share sheet; the extension sends nothing itself. The only network request the popup can trigger is loading the site's favicon in the popup header, which is sent without a referrer.

Note for existing users: the `favicon` permission arrived in 1.2.0. Chrome shows a permission prompt for it and may disable the extension until you approve the update.

---

## 🌐 Supported Pages

- Only **`http`** and **`https`** pages are supported. `chrome://`, `file://`, `data:`, `blob:`, `javascript:`, `chrome-untrusted:` and similar pages show an "unsupported page" screen.
- URLs up to **800** characters work normally; **801–2000** show a scan-difficulty warning; above **2000** the QR code is not generated.

---

## 🗂️ Project Structure

```
src/                    Exactly what Chrome loads and what gets zipped
  manifest.json         Manifest V3 definition
  popup/                Popup UI (index.html, index.css, index.js)
  lib/utils.js          Pure helpers (URL checks, site name, limits, QR colour palette); unit tested
  lib/card.js           Bento card layout and canvas rendering for Download
  vendor/               Bundled qr-code-styling library
  assets/               Extension icons (16, 48, 128)
tests/                  node:test unit + jsdom integration tests
scripts/package.mjs     Builds dist/link-hopper-v<version>.zip from src/
.github/                CI, Release workflow, Dependabot, PR/issue templates
docs/                   ARCHITECTURE.md, RELEASING.md, images/icon1024.webp (store icon)
```

---

## 🛠️ Development

Requires Node.js 22 (see [`.nvmrc`](.nvmrc)). There is no build step.

```bash
npm ci            # install dev dependencies (jsdom)
npm test          # run unit + integration tests
npm run package   # build dist/link-hopper-v<version>.zip
```

To try your changes, load `src/` as an unpacked extension (see Manual Install). After editing files, click the reload icon on the extension's card in `chrome://extensions`, then reopen the popup.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the popup works.

---

## 🚢 CI/CD

- **CI** runs `npm test` on Ubuntu and Windows for every push and pull request to `main`, and builds the zip on Ubuntu.
- **Release** runs when a `vX.Y.Z` tag is pushed: it tests, checks the tag against `src/manifest.json`, builds the zip and attaches it to a GitHub Release.
- **Dependabot** opens weekly update PRs for npm and GitHub Actions.

Full steps are in [docs/RELEASING.md](docs/RELEASING.md). See also the [CHANGELOG](CHANGELOG.md).

---

## 🤝 Contributing

Found a bug or have an idea? [Open an issue](https://github.com/koolgokul22/linkhopper/issues) or send a pull request. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

If you find Link Hopper useful, consider giving the repo a ⭐ — it helps others discover it.

---

## 📄 License

[ISC](LICENSE)
