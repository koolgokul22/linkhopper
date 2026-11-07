'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { createFakeContext } = require('./fakeCanvas');

const ROOT = path.resolve(__dirname, '..', '..');

const flush = async (n = 5) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

/**
 * opts: { tab, theme, matchMediaDark, hasShare, shareImpl, clipboardImpl,
 *         qrCtorThrows, qrAppendThrows, qrDownloadThrows,
 *         fakeCanvas (true: canvases get a recording 2d ctx), fakeCanvasNullBlob,
 *         canShareFiles (true|false; omit = no navigator.canShare), rawDataThrows,
 *         faviconBlob (Blob returned for _favicon fetches; default tiny blob), faviconFails (fetch rejects),
 *         faviconHangs (fetch only settles on abort), faviconNotOk (res.ok false), noRuntimeGetURL,
 *         syncStorage (seed object), syncFails ('get'|'set'|true), syncThrowsSync, noStorage }
 */
async function loadPopup(opts = {}) {
  const {
    tab = null,
    theme = null,
    matchMediaDark = false,
    hasShare = false,
    shareImpl = async () => {},
    clipboardImpl = async () => {},
    qrCtorThrows = false,
    qrAppendThrows = false,
    qrDownloadThrows = false,
    syncStorage = {},
    syncFails = false,
    syncThrowsSync = false,
    noStorage = false,
    holdSyncGet = false,
    fakeCanvas = false,
    fakeCanvasNullBlob = false,
    canShareFiles,
    rawDataThrows = false,
    faviconBlob = null,
    faviconFails = false,
    faviconHangs = false,
    faviconNotOk = false,
    noRuntimeGetURL = false,
  } = opts;

  const html = fs.readFileSync(path.join(ROOT, 'src', 'popup', 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://linkhopper.test/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;

  const qrInstances = [];
  const clipboardWrites = [];
  const shareCalls = [];
  const mediaListeners = [];
  const sync = { data: { ...syncStorage }, gets: 0, sets: [] };

  if (theme) window.localStorage.setItem('linkhopper-theme', theme);

  window.matchMedia = (query) => ({
    matches: matchMediaDark,
    media: query,
    addEventListener(type, fn) {
      mediaListeners.push(fn);
    },
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });

  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text) => {
        clipboardWrites.push(text);
        return clipboardImpl(text);
      },
    },
  });
  if (hasShare) {
    Object.defineProperty(window.navigator, 'share', {
      configurable: true,
      value: async (data) => {
        shareCalls.push(data);
        return shareImpl(data);
      },
    });
  }

  const canShareCalls = [];
  if (canShareFiles !== undefined) {
    Object.defineProperty(window.navigator, 'canShare', {
      configurable: true,
      value: (data) => {
        canShareCalls.push(data);
        return !!canShareFiles;
      },
    });
  }

  // Canvas: jsdom has none. Default getContext -> null (card building fails, popup falls back).
  const canvases = [];
  window.HTMLCanvasElement.prototype.getContext = function () {
    if (!fakeCanvas) return null;
    if (!this.__ctx) {
      this.__ctx = createFakeContext();
      canvases.push({ el: this, ctx: this.__ctx, toBlobCalls: [] });
    }
    return this.__ctx;
  };
  window.HTMLCanvasElement.prototype.toBlob = function (cb, type) {
    const rec = canvases.find((c) => c.el === this);
    if (rec) rec.toBlobCalls.push(type);
    cb(fakeCanvasNullBlob ? null : new window.Blob(['png'], { type }));
  };
  window.createImageBitmap = async (blob) => ({ fakeBitmap: true, blob });

  // fetch stub: only the extension's `_favicon` endpoint is expected. Calls are recorded.
  const fetchCalls = [];
  window.fetch = (input, init = {}) => {
    const href = String(input);
    fetchCalls.push({ url: href, signal: init.signal });
    if (faviconFails) return Promise.reject(new Error('fake favicon fetch failure'));
    if (faviconHangs) {
      return new Promise((resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
    const blob = faviconBlob || new window.Blob(['fav'], { type: 'image/png' });
    return Promise.resolve({ ok: !faviconNotOk, status: faviconNotOk ? 404 : 200, blob: async () => blob });
  };

  const objectUrls = [];
  const revokedUrls = [];
  const anchorClicks = [];
  window.URL.createObjectURL = (blob) => {
    objectUrls.push(blob);
    return `blob:fake-${objectUrls.length}`;
  };
  window.URL.revokeObjectURL = (u) => revokedUrls.push(u);
  window.HTMLAnchorElement.prototype.click = function () {
    anchorClicks.push({ download: this.download, href: this.href });
  };

  window.chrome = {
    runtime: noRuntimeGetURL ? {} : { getURL: (p) => `chrome-extension://testid${p}` },
    tabs: {
      query(info, cb) {
        const tabs = tab ? [tab] : [];
        if (typeof cb === 'function') {
          Promise.resolve().then(() => cb(tabs));
          return undefined;
        }
        return Promise.resolve(tabs);
      },
    },
  };

  if (!noStorage) {
    const guard = (op) => {
      if (syncThrowsSync) throw new Error('fake sync sync-throw');
      if (syncFails === true || syncFails === op) return Promise.reject(new Error('fake sync failure'));
      return null;
    };
    window.chrome.storage = {
      sync: {
        get(key) {
          sync.gets++;
          const failed = guard('get');
          if (failed) return failed;
          const keys = typeof key === 'string' ? [key] : key;
          const out = {};
          for (const k of keys) if (k in sync.data) out[k] = sync.data[k];
          if (holdSyncGet) return new Promise((resolve) => { sync.releaseGet = () => resolve(out); });
          return Promise.resolve(out);
        },
        set(items) {
          const failed = guard('set');
          if (failed) return failed;
          sync.sets.push({ ...items });
          Object.assign(sync.data, items);
          return Promise.resolve();
        },
      },
    };
  }

  class FakeQRCodeStyling {
    constructor(options) {
      if (qrCtorThrows) throw new Error('fake ctor failure');
      this.options = options;
      this.appended = [];
      this.downloads = [];
      this.rawDataCalls = [];
      FakeQRCodeStyling.instances.push(this);
    }
    append(el) {
      if (qrAppendThrows) throw new Error('fake append failure');
      this.appended.push(el);
      const c = document.createElement('canvas');
      c.setAttribute('data-fake-qr', '');
      if (el) el.appendChild(c);
    }
    download(o) {
      this.downloads.push(o);
      if (qrDownloadThrows) throw new Error('fake download failure');
      return Promise.resolve();
    }
    getRawData(ext) {
      this.rawDataCalls.push(ext);
      if (rawDataThrows) return Promise.reject(new Error('fake rawdata failure'));
      return Promise.resolve(new window.Blob(['qr'], { type: `image/${ext}` }));
    }
    update(o) {
      this.options = { ...this.options, ...o };
    }
  }
  FakeQRCodeStyling.instances = qrInstances;
  window.QRCodeStyling = FakeQRCodeStyling;

  const utilsPath = path.join(ROOT, 'src', 'lib', 'utils.js');
  if (fs.existsSync(utilsPath)) window.eval(fs.readFileSync(utilsPath, 'utf8'));
  const cardPath = path.join(ROOT, 'src', 'lib', 'card.js');
  if (fs.existsSync(cardPath)) window.eval(fs.readFileSync(cardPath, 'utf8'));
  window.eval(fs.readFileSync(path.join(ROOT, 'src', 'popup', 'index.js'), 'utf8'));

  // The natural DOMContentLoaded fires asynchronously after JSDOM construction.
  await flush(8);

  return {
    window,
    document,
    qrInstances,
    clipboardWrites,
    shareCalls,
    canShareCalls,
    fetchCalls,
    canvases,
    objectUrls,
    revokedUrls,
    anchorClicks,
    sync,
    systemThemeChange: (dark) => mediaListeners.forEach((fn) => fn({ matches: dark })),
    flush,
    close: () => window.close(),
  };
}

module.exports = { loadPopup, flush };
