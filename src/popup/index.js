'use strict';

/* ==========================================================
   Link Hopper — Extension Logic
   ========================================================== */

// ----------------------------------------------------------
// SVG Icon Templates
// ----------------------------------------------------------
const ICON_MOON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

const ICON_SUN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

// ----------------------------------------------------------
// Unsupported URL Protocols
// ----------------------------------------------------------
const UNSUPPORTED_PROTOCOLS = [
  'chrome:', 'chrome-extension:', 'edge:', 'about:',
  'devtools:', 'file:', 'view-source:', 'chrome-search:',
];

// ----------------------------------------------------------
// DOM References
// ----------------------------------------------------------
const DOM = {
  favicon: document.getElementById('url-favicon'),
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
  normalContent: document.getElementById('normal-content'),
};

// ----------------------------------------------------------
// Theme Manager
// ----------------------------------------------------------
const ThemeManager = {
  STORAGE_KEY: 'linkhopper-theme',

  init() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    this.apply(theme);

    DOM.themeToggle.addEventListener('click', () => this.toggle());

    // Follow system changes if user hasn't set a manual preference
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(this.STORAGE_KEY)) {
        this.apply(e.matches ? 'dark' : 'light');
      }
    });
  },

  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // Show moon in light mode (to switch to dark), sun in dark mode (to switch to light)
    DOM.themeToggle.innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
  },

  toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(this.STORAGE_KEY, next);
    this.apply(next);
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
    DOM.toast.innerHTML = `<span class="toast-icon">${icon}</span> ${message}`;

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
// URL Utilities
// ----------------------------------------------------------
const isUnsupportedUrl = (url) => {
  if (!url) return true;
  return UNSUPPORTED_PROTOCOLS.some((protocol) => url.startsWith(protocol));
};

const extractWebsiteName = (url) => {
  try {
    const { hostname } = new URL(url);
    const parts = hostname.split('.');
    const name = parts.length > 2 ? parts[1] : parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return 'Unknown';
  }
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

const downloadQRCode = (qrCode) => {
  qrCode.download({ extension: 'png' });
  Toast.show('QR code downloaded!', '↓');
};

const shareUrl = async (url, title) => {
  try {
    await navigator.share({ title, url });
    Toast.show('Shared!');
  } catch (err) {
    // AbortError means the user cancelled the share sheet — not a real error
    if (err.name !== 'AbortError') {
      // Fallback: copy to clipboard instead
      await copyUrlToClipboard(url);
    }
  }
};

// ----------------------------------------------------------
// Error State
// ----------------------------------------------------------
const showError = () => {
  DOM.normalContent.classList.add('hidden');
  DOM.errorState.classList.remove('hidden');
  // Hide favicon & site name when in error state
  DOM.favicon.style.display = 'none';
  DOM.siteName.textContent = 'Link Hopper';
};

// ----------------------------------------------------------
// Main Initialization
// ----------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();

  // Hide Share button if Web Share API is unavailable
  if (!navigator.share) {
    DOM.shareBtn.style.display = 'none';
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0];

    if (!tab?.url || isUnsupportedUrl(tab.url)) {
      showError();
      return;
    }

    const url = tab.url;
    const pageTitle = tab.title || '';
    const faviconUrl = tab.favIconUrl || '';
    const siteName = extractWebsiteName(url);

    // --- Render QR Code ---
    const qrCode = new QRCodeStyling({
      width: 280,
      height: 280,
      type: 'canvas',
      data: url,
      margin: 8,
      dotsOptions: {
        color: '#4267b2',
        type: 'rounded',
      },
      backgroundOptions: {
        color: 'transparent',
      },
      cornersSquareOptions: {
        type: 'extra-rounded',
      },
      cornersDotOptions: {
        type: 'dot',
      },
    });

    qrCode.append(DOM.qrContainer);

    // --- Populate UI ---
    DOM.urlDisplay.value = url;
    DOM.siteName.textContent = siteName;
    DOM.pageTitle.textContent = pageTitle;
    DOM.pageTitle.title = pageTitle;

    if (faviconUrl) {
      DOM.favicon.src = faviconUrl;
      DOM.favicon.alt = siteName;
    } else {
      DOM.favicon.style.display = 'none';
    }

    // --- Event Listeners ---
    DOM.copyBtn.addEventListener('click', () => copyUrlToClipboard(url));
    DOM.downloadBtn.addEventListener('click', () => downloadQRCode(qrCode));
    DOM.shareBtn.addEventListener('click', () => shareUrl(url, pageTitle));
  });
});
