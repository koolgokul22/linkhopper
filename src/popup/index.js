'use strict';

/* ==========================================================
   Link Hopper — Extension Logic
   ========================================================== */

// ----------------------------------------------------------
// SVG Icon Templates
// ----------------------------------------------------------
const ICON_MOON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

const ICON_SUN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

const { isSupportedUrl, extractWebsiteName, getQrUrlStatus, getSiteInitial, getSitePalette, getQrPalette } = window.LinkHopperUtils;
const { renderCard, cardFilename, cardBaseName } = window.LinkHopperCard;

const DEFAULT_ERROR_MESSAGE = "This page type isn't supported.\nTry navigating to a regular webpage.";
const TOO_LONG_MESSAGE = 'This URL is too long to fit in a QR code.';
const GENERIC_QR_ERROR_MESSAGE = 'Something went wrong while creating the QR code.';
const LONG_URL_WARNING = 'This link is very long, so the QR code may be hard to scan. Try a shorter link.';

// ----------------------------------------------------------
// DOM References
// ----------------------------------------------------------
const DOM = {
  favicon: document.getElementById('url-favicon'),
  faviconFallback: document.getElementById('url-favicon-fallback'),
  siteName: document.getElementById('site-name'),
  qrContainer: document.getElementById('qr-container'),
  pageTitle: document.getElementById('page-title'),
  urlDisplay: document.getElementById('url-display'),
  copyBtn: document.getElementById('copy-btn'),
  downloadBtn: document.getElementById('download-btn'),
  shareBtn: document.getElementById('share-btn'),
  themeToggle: document.getElementById('theme-toggle'),
  toast: document.getElementById('toast'),
  errorState: document.getElementById('error-state'),
  errorSubtitle: document.getElementById('error-subtitle'),
  qrWarning: document.getElementById('qr-warning'),
  normalContent: document.getElementById('normal-content'),
};

// ----------------------------------------------------------
// Theme Manager
// ----------------------------------------------------------
const isTheme = (v) => v === 'light' || v === 'dark';

const ThemeManager = {
  STORAGE_KEY: 'linkhopper-theme',

  _readLocal() {
    try {
      const v = localStorage.getItem(this.STORAGE_KEY);
      return isTheme(v) ? v : null;
    } catch (err) {
      return null;
    }
  },

  _writeLocal(theme) {
    try {
      localStorage.setItem(this.STORAGE_KEY, theme);
    } catch (err) {
      console.error('Theme cache write failed:', err);
    }
  },

  async _readSync() {
    try {
      const res = await chrome.storage.sync.get(this.STORAGE_KEY);
      const v = res?.[this.STORAGE_KEY];
      return isTheme(v) ? v : null;
    } catch (err) {
      return null;
    }
  },

  async _writeSync(theme) {
    try {
      await chrome.storage.sync.set({ [this.STORAGE_KEY]: theme });
    } catch (err) {
      console.error('Theme sync write failed:', err);
    }
  },

  init() {
    const saved = this._readLocal();
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.apply(saved || (prefersDark ? 'dark' : 'light'));

    DOM.themeToggle.addEventListener('click', () => this.toggle());

    // Follow system changes if user hasn't set a manual preference
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!this._readLocal()) {
        this.apply(e.matches ? 'dark' : 'light');
      }
    });

    return this._reconcile(saved);
  },

  async _reconcile(local) {
    const remote = await this._readSync();
    if (this._userToggled) return;
    if (remote) {
      if (remote !== local) {
        this._writeLocal(remote);
        if (document.documentElement.getAttribute('data-theme') !== remote) this.apply(remote);
      }
    } else if (local) {
      await this._writeSync(local);
    }
  },

  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // Show moon in light mode (to switch to dark), sun in dark mode (to switch to light)
    DOM.themeToggle.innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
  },

  async toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    this._userToggled = true;
    this._writeLocal(next);
    this.apply(next);
    await this._writeSync(next);
  },
};

// ----------------------------------------------------------
// Toast Notifications
// ----------------------------------------------------------
const Toast = {
  _timeout: null,

  show(message, icon = '✓') {
    clearTimeout(this._timeout);

    DOM.toast.classList.remove('visible', 'hiding');
    const iconEl = document.createElement('span');
    iconEl.className = 'toast-icon';
    iconEl.textContent = icon;
    DOM.toast.replaceChildren(iconEl, document.createTextNode(` ${message}`));

    // Force reflow to restart animation
    void DOM.toast.offsetWidth;
    DOM.toast.classList.add('visible');

    this._timeout = setTimeout(() => {
      DOM.toast.classList.remove('visible');
      DOM.toast.classList.add('hiding');
      // Remove hiding class after animation ends
      setTimeout(() => DOM.toast.classList.remove('hiding'), 250);
    }, 2000);
  },
};

// ----------------------------------------------------------
// Site palette: exposes both theme variants as CSS custom properties (--pl-* light, --pd-* dark);
// index.css picks the set that matches data-theme, so toggling the theme needs no extra work.
// ----------------------------------------------------------
const applyPalette = (palette) => {
  const root = document.documentElement;
  root.setAttribute('data-palette', palette.id);
  for (const [k, v] of Object.entries(palette.light)) root.style.setProperty('--pl-' + k, v);
  for (const [k, v] of Object.entries(palette.dark)) root.style.setProperty('--pd-' + k, v);
};

// ----------------------------------------------------------
// QR Code
// ----------------------------------------------------------
const buildQrOptions = (url, size, margin) => {
  const palette = getQrPalette(getSitePalette(extractWebsiteName(url)));
  return {
  width: size,
  height: size,
  type: 'canvas',
  data: url,
  margin,
  qrOptions: { errorCorrectionLevel: 'M' },
  dotsOptions: {
    color: palette.dots,
    type: 'rounded',
  },
  backgroundOptions: {
    color: palette.background,
  },
  cornersSquareOptions: {
    color: palette.corners,
    type: 'extra-rounded',
  },
  cornersDotOptions: {
    color: palette.corners,
    type: 'dot',
  },
  };
};

// ----------------------------------------------------------
// Actions
// ----------------------------------------------------------
const copyUrlToClipboard = async (url) => {
  try {
    await navigator.clipboard.writeText(url);
    Toast.show('Copied to clipboard!');
  } catch (err) {
    console.error('Copy failed:', err);
    Toast.show('Failed to copy', '✗');
  }
};

let exportQr = null;
let qrBitmap = null;
let cardCache = null; // { key, blob }

const currentTheme = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

// Loads the page's favicon as a bitmap for the card, or null on any failure (never throws).
// Why not the tab's favIconUrl: drawing another site's image onto a canvas taints it, so
// toBlob() would fail. Chrome's `_favicon` endpoint is served from the extension's own origin
// (needs the "favicon" permission), so the bitmap does not taint the canvas.
const FAVICON_TIMEOUT_MS = 2000;
const loadCardFavicon = async (pageUrl) => {
  let timer;
  try {
    if (typeof chrome === 'undefined' || typeof chrome.runtime?.getURL !== 'function') return null;
    const endpoint = new URL(chrome.runtime.getURL('/_favicon/'));
    endpoint.searchParams.set('pageUrl', pageUrl);
    endpoint.searchParams.set('size', '64');
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), FAVICON_TIMEOUT_MS);
    const res = await fetch(endpoint.href, { signal: controller.signal });
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

// Builds (and caches per theme + url) the shareable card PNG. Rejects if anything fails.
const getCardBlob = async (url) => {
  const theme = currentTheme();
  const key = `${theme}|${url}`;
  if (cardCache && cardCache.key === key) return cardCache.blob;

  exportQr = exportQr || new QRCodeStyling(buildQrOptions(url, 1024, 32));
  const [bitmap, favicon] = await Promise.all([
    qrBitmap ? qrBitmap : exportQr.getRawData('png').then((b) => createImageBitmap(b)),
    loadCardFavicon(url),
  ]);
  qrBitmap = bitmap;

  const siteName = extractWebsiteName(url);
  const blob = await renderCard({
    qrBitmap,
    favicon,
    siteName,
    url,
    theme,
    palette: getSitePalette(siteName),
    initial: getSiteInitial(siteName),
  });
  cardCache = { key, blob };
  return blob;
};

const saveBlob = (blob, filename) => {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = filename;
  a.href = href;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
};

const downloadQRCode = async (url) => {
  try {
    const blob = await getCardBlob(url);
    saveBlob(blob, cardFilename(extractWebsiteName(url)));
    Toast.show('QR code downloaded!', '↓');
    return;
  } catch (err) {
    console.error('Card download failed, falling back to plain QR:', err);
  }
  try {
    exportQr = exportQr || new QRCodeStyling(buildQrOptions(url, 1024, 32));
    await exportQr.download({ name: cardBaseName(extractWebsiteName(url)), extension: 'png' });
    Toast.show('QR code downloaded!', '↓');
  } catch (err) {
    console.error('Download failed:', err);
    Toast.show('Download failed', '✗');
  }
};

// Opens the system share sheet with the URL only; if unavailable or it fails (other than the
// user dismissing it), copies the plain URL instead.
const shareUrl = async (url) => {
  if (typeof navigator.share === 'function' && navigator.canShare?.({ url }) !== false) {
    try {
      await navigator.share({ url });
      Toast.show('Shared!');
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.error('Share failed, falling back to copy:', err);
    }
  }
  await copyUrlToClipboard(url);
};

const showFaviconFallback = (siteName) => {
  DOM.favicon.style.display = 'none';
  DOM.faviconFallback.textContent = getSiteInitial(siteName);
  DOM.faviconFallback.classList.remove('hidden');
};

// ----------------------------------------------------------
// Error State
// ----------------------------------------------------------
const showError = (message = DEFAULT_ERROR_MESSAGE) => {
  const [first, ...rest] = message.split('\n');
  DOM.errorSubtitle.replaceChildren(first);
  rest.forEach((line) => DOM.errorSubtitle.append(document.createElement('br'), line));
  DOM.normalContent.classList.add('hidden');
  DOM.errorState.classList.remove('hidden');
  // Hide favicon & site name when in error state
  DOM.favicon.style.display = 'none';
  DOM.faviconFallback.classList.add('hidden');
  DOM.siteName.textContent = 'Link Hopper';
};

// ----------------------------------------------------------
// Main Initialization
// ----------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0];

    if (!tab?.url || !isSupportedUrl(tab.url)) {
      showError();
      return;
    }

    const url = tab.url;
    const pageTitle = tab.title || '';
    const faviconUrl = tab.favIconUrl || '';
    const siteName = extractWebsiteName(url);

    const status = getQrUrlStatus(url);
    if (status === 'too-long') {
      showError(TOO_LONG_MESSAGE);
      return;
    }

    applyPalette(getSitePalette(siteName));

    try {
      const qrCode = new QRCodeStyling(buildQrOptions(url, 280, 8));
      qrCode.append(DOM.qrContainer);
    } catch (err) {
      console.error('QR generation failed:', err);
      showError(GENERIC_QR_ERROR_MESSAGE);
      return;
    }

    if (status === 'long') {
      DOM.qrWarning.textContent = LONG_URL_WARNING;
      DOM.qrWarning.classList.remove('hidden');
    }

    // --- Populate UI ---
    DOM.urlDisplay.value = url;
    DOM.siteName.textContent = siteName;
    DOM.pageTitle.textContent = pageTitle;
    DOM.pageTitle.title = pageTitle;

    if (faviconUrl) {
      const fallbackIcon = new URL('/favicon.ico', url).href;
      let triedFallback = faviconUrl === fallbackIcon;
      DOM.favicon.addEventListener('error', () => {
        if (triedFallback) {
          showFaviconFallback(siteName);
          return;
        }
        triedFallback = true;
        DOM.favicon.src = fallbackIcon;
      });
      DOM.favicon.referrerPolicy = 'no-referrer';
      DOM.favicon.alt = siteName;
      DOM.favicon.src = faviconUrl;
    } else {
      showFaviconFallback(siteName);
    }

    // --- Event Listeners ---
    DOM.copyBtn.addEventListener('click', () => copyUrlToClipboard(url));
    DOM.downloadBtn.addEventListener('click', () => downloadQRCode(url));
    DOM.shareBtn.addEventListener('click', () => shareUrl(url));
  });
});
