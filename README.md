# Link Hopper

A lightweight Chrome extension that makes sharing URLs effortless—just generate a QR code and scan instantly from your smartphone.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/igkffepamaelmkbbbmihiiklabbdhlnp?label=Install%20from%20Chrome%20Web%20Store&logo=google-chrome)](https://chromewebstore.google.com/detail/igkffepamaelmkbbbmihiiklabbdhlnp)

---

##  Features

-  **Instant QR Code Generation** — With a single click, turn any current tab’s URL into a QR code.
-  **Seamless Use** — Scan with your phone (no need for manual typing).
-  **Lightweight & Fast** — Pure JavaScript with minimal footprint for blazing-fast performance.

---

##  Demo

| Generate QR | Scan on Phone |
|-------------|----------------|
| ![QR Popup](assets/qr-popup-demo.gif) | *(Scan the QR with your phone—example using Google Lens or any QR Scanner)* |

---

##  How to Use

1. **Install** from the [Chrome Web Store](https://chromewebstore.google.com/detail/igkffepamaelmkbbbmihiiklabbdhlnp).
2. Click the **Link Hopper icon** next to your address bar.
3. See an instant QR code drop-down.
4. **Scan** with your phone—share that link in one scan!

---

##  Code Highlights

- **`manifest.json`** — Defines permissions (`activeTab`), extension icon, and popup behavior.
- **`index.html`** + **`index.js`** — Core popup interface and logic to fetch URLs and render QR codes.
- **`qr-scanner.js`** — Parses QR codes from camera feeds (optional advanced feature).
- Clean, self-contained logic kept in simple JavaScript and CSS.

---

##  Why I Built It

I wanted a smoother way to share links between devices without the hassle of copying, emailing, or messaging. Plus, I wanted to explore browser extension development and QR code workflows. **Link Hopper** was born out of that curiosity—fast, minimal, and designed for actual use.

---

##  Tech Stack

- **JavaScript (ES6)**
- **Chrome Extensions API**
- **QR Code Generator** — (custom or using a library)
- **HTML / CSS**

---

##  Share the Love!

Found it useful? ⭐ Star the repo and share it!
Feedback welcome—open an issue or submit a PR to improve this project.

---

##  About Me

Full-stack developer who builds with Angular, explores .NET Core, and regularly churns out browser tools for productivity.

Let's connect!

