# 🔗 Link Hopper

A lightweight Chrome extension that turns any tab's URL into a scannable QR code — share links to your phone in one scan, no typing required.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/igkffepamaelmkbbbmihiiklabbdhlnp?label=Install%20from%20Chrome%20Web%20Store&logo=google-chrome)](https://chromewebstore.google.com/detail/igkffepamaelmkbbbmihiiklabbdhlnp)

---

## ✨ Features

- **Instant QR Code** — One click turns the current page URL into a styled, scannable QR code.
- **Copy URL** — Copy the link to your clipboard with a single tap.
- **Download QR** — Save the QR code as a PNG image.
- **Share** — Send the URL directly to any app via the native share sheet (email, WhatsApp, Notes, etc.).
- **Dark / Light Mode** — Toggle between themes, or let it follow your system preference automatically.
- **Keyboard Shortcut** — Press `Alt+Q` to open Link Hopper instantly (customizable in `chrome://extensions/shortcuts`).
- **Smart Error Handling** — Friendly message on unsupported pages (`chrome://`, `file://`, etc.) instead of a blank popup.
- **Lightweight & Private** — Pure JavaScript, no external servers, no tracking. Everything runs locally in your browser.

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
4. Click **Load unpacked** and select the repo folder.

---

## 🚀 How to Use

1. Navigate to any webpage.
2. Click the **Link Hopper icon** in the toolbar (or press **Alt+Q**).
3. A popup appears with:
   - The page's **favicon and site name** in the header.
   - A **QR code** of the current URL — scan it with your phone.
   - The **page title** and **full URL** displayed below the QR.
4. Use the action buttons:
   - **Copy** — copies the URL to your clipboard.
   - **Download** — saves the QR code as a PNG file.
   - **Share** — opens your OS share sheet to send the link anywhere.
5. Toggle the **🌙 / ☀️** button in the header to switch between dark and light mode.

---

## ⌨️ Keyboard Shortcut

| Shortcut | Action |
|----------|--------|
| `Alt+Q`  | Open Link Hopper popup |

You can customize this shortcut at `chrome://extensions/shortcuts`.

---

## 🤝 Contributing

Found a bug or have an idea? [Open an issue](../../issues) or submit a pull request — contributions are welcome!

If you find Link Hopper useful, consider giving the repo a ⭐ — it helps others discover it.

---

## 📄 License

[ISC](LICENSE)
