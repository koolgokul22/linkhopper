# Changelog

All notable changes to Link Hopper are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.0]

### Added
- Letter-badge fallback when a site's favicon is missing or fails to load. The favicon is retried once at `/favicon.ico` and is requested without a referrer.
- Warning for links of 801-2000 characters, and a "too long" message above 2000.
- Download now saves a portrait "bento" card (1200px-wide PNG): a tinted header tile with the site's real favicon (or a coloured letter badge) and hostname, a large white QR tile, and one full-width URL tile (up to 6 lines, ellipsised; the QR still encodes the full URL), on an opaque per-site tinted background. The page title is not drawn. Colours follow the current light or dark theme; the QR tile is always white. Falls back to the plain 1024px QR PNG if the card cannot be built.
- Share opens the system share sheet (`navigator.share`) with just the link: no title, no extra text, no image. Dismissing the sheet is silent. If the share sheet is missing, not allowed, or fails, Share copies the plain URL to the clipboard instead (the same as Copy, with a "Copied to clipboard!" toast, or "Failed to copy"). Whether the sheet appears depends on the OS and browser. The Share button is always visible. Copy is unchanged (plain URL only).
- Downloads are named `<website>_<YYYYMMDD>-<HHMMSS>.png` in local time (for example `linkedin.com_20261107-143512.png`); the plain-QR fallback download uses the same base name.
- Ten curated colour palettes (Ocean, Lagoon, Forest, Olive, Honey, Terracotta, Rose, Plum, Indigo, Graphite), each with a light and a dark variant. A stable hash of the hostname picks the palette, so a site always gets the same colours. Palettes are soft and low-saturation, with text at 7:1 or better and accents at 4.5:1 or better on their tiles. Both the popup and the downloaded card use the palette matching the current theme. The colours are curated, not the website's real brand colours.
- QR colours match the palette: dots and finder patterns are a dark shade of the site palette on pure white, at least 7:1 against white for camera scanning, in both the popup and the downloaded card. Dot style and error-correction level M are unchanged.
- Popup restyled as a bento layout with soft raised tiles (header, QR, page info, actions). The elements, IDs and behaviour are unchanged; only the styling changed. The QR tile is always pure white.
- Theme preference synced via `chrome.storage.sync`, with a `localStorage` cache to avoid a flash on open, and migration of old settings.
- Unit and jsdom integration tests (`node:test`).
- GitHub Actions CI (Ubuntu and Windows) and a tag-driven Release workflow.
- Reproducible zip packaging script (`npm run package`).
- Dependabot configuration, pull request and issue templates.
- `LICENSE` file.

### Changed
- Only `http` and `https` pages are supported. `file:`, `data:`, `blob:`, `javascript:`, `chrome-untrusted:` and similar pages now show the unsupported-page screen.
- The site name now shows the hostname without `www` (for example `docs.google.com`, `bbc.co.uk`) instead of a guessed brand label.
- The QR code now renders on opaque white with error-correction level M for reliable scanning in dark mode.
- Repository reorganised: the extension now lives in `src/`. When installing manually, load the `src` folder instead of the repo root.

### Fixed
- Wrong site names for multi-part domains.
- The popup could be left blank if QR generation threw.
- The "downloaded" toast was shown even when the download failed.

### Security
- Toasts are no longer built with `innerHTML`.
- Added the `storage` permission (used only for the theme preference). `activeTab` is unchanged.
- Added the `favicon` permission, used only to read the page icon from Chrome's favicon cache so it can be drawn on the downloaded card (the extension's own origin serves it, so the canvas stays exportable). Nothing is sent anywhere. Because this is a permission change, Chrome shows a permission prompt and may disable the extension for existing users until they approve the update.

## [1.1.0]

### Added
- Glassmorphism popup UI.
- Dark mode.

### Fixed
- Assorted bug fixes (see commit `d9d3934`).

## 1.0.0

- Initial release: QR code for the current tab's URL, with copy, download and share actions.

[Unreleased]: https://github.com/koolgokul22/linkhopper/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/koolgokul22/linkhopper/compare/d9d3934...v1.2.0
[1.1.0]: https://github.com/koolgokul22/linkhopper/commit/d9d3934
