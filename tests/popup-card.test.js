'use strict';
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadPopup } = require('./helpers/loadPopup');
const { textsOf } = require('./helpers/fakeCanvas');
const { getCardTheme } = require('../src/lib/card.js');
const { getSitePalette, getQrPalette } = require('../src/lib/utils.js');

const open = [];
const load = async (o) => {
  const p = await loadPopup(o);
  open.push(p);
  return p;
};
afterEach(() => {
  while (open.length) open.pop().close();
});

const tabOf = (url, title = 'Title', favIconUrl = '') => ({ url, title, favIconUrl });
const toast = (p) => p.document.getElementById('toast');
const click = (p, id) => p.document.getElementById(id).click();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const URL_ = 'https://www.example.com/some/page?x=1';
const cardOpts = (o = {}) => ({ tab: tabOf(URL_, 'My Page Title'), fakeCanvas: true, ...o });
const exportDownloads = (p) => p.qrInstances.filter((q) => q.downloads.length).length;

describe('card download', () => {
  it('saves a named card via anchor + object URL and skips exportQr.download', async () => {
    const p = await load(cardOpts());
    click(p, 'download-btn');
    await p.flush();
    assert.equal(p.anchorClicks.length, 1);
    assert.match(p.anchorClicks[0].download, /^example\.com_\d{8}-\d{6}\.png$/);
    assert.match(p.anchorClicks[0].href, /^blob:fake-/);
    assert.equal(p.objectUrls[0].type, 'image/png');
    assert.equal(exportDownloads(p), 0);
    assert.equal(p.qrInstances.length, 2);
    assert.deepEqual(p.qrInstances[1].rawDataCalls, ['png']);
    assert.ok(toast(p).classList.contains('visible'));
    assert.match(toast(p).textContent, /QR code downloaded!/);
    await sleep(1100);
    assert.deepEqual(p.revokedUrls, [p.anchorClicks[0].href]);
  });

  it('falls back to exportQr.download when card building fails (no canvas)', async () => {
    const p = await load({ tab: tabOf(URL_) });
    click(p, 'download-btn');
    await p.flush();
    assert.equal(p.anchorClicks.length, 0);
    assert.equal(exportDownloads(p), 1);
    const dl = p.qrInstances.find((q) => q.downloads.length).downloads[0];
    assert.equal(dl.extension, 'png');
    assert.match(dl.name, /^example\.com_\d{8}-\d{6}$/);
    assert.doesNotMatch(toast(p).textContent, /fail/i);
  });

  it('falls back when getRawData rejects or toBlob yields null', async () => {
    for (const o of [{ rawDataThrows: true }, { fakeCanvasNullBlob: true }]) {
      const p = await load(cardOpts(o));
      click(p, 'download-btn');
      await p.flush();
      assert.equal(p.anchorClicks.length, 0);
      assert.equal(exportDownloads(p), 1);
    }
  });

  it('shows the failure toast when card and fallback both fail', async () => {
    const p = await load(cardOpts({ rawDataThrows: true, qrDownloadThrows: true }));
    click(p, 'download-btn');
    await p.flush();
    assert.match(toast(p).textContent, /fail/i);
  });
});

describe('QR palette', () => {
  it('on-screen and export QR use the site palette, on a white background', async () => {
    const p = await load(cardOpts());
    click(p, 'download-btn');
    await p.flush();
    const pal = getQrPalette(getSitePalette('example.com'));
    assert.equal(p.qrInstances.length, 2);
    for (const q of p.qrInstances) {
      assert.equal(q.options.dotsOptions.color, pal.dots);
      assert.equal(q.options.cornersSquareOptions.color, pal.corners);
      assert.equal(q.options.cornersDotOptions.color, pal.corners);
      assert.equal(q.options.backgroundOptions.color, '#ffffff');
      assert.equal(q.options.qrOptions.errorCorrectionLevel, 'M');
    }
  });

  it('the card QR bitmap comes from the palette export instance', async () => {
    const p = await load(cardOpts());
    click(p, 'download-btn');
    await p.flush();
    assert.deepEqual(p.qrInstances[1].rawDataCalls, ['png']);
    assert.equal(p.qrInstances[1].options.dotsOptions.color, getQrPalette(getSitePalette('example.com')).dots);
    const draws = p.canvases[0].ctx.calls.filter((c) => c.op === 'drawImage');
    assert.equal(draws.at(-1).args[0].fakeBitmap, true);
  });

  it('different sites get different dot colours', async () => {
    const a = await load({ tab: tabOf('https://example.com/') });
    const b = await load({ tab: tabOf('https://github.com/') });
    assert.notEqual(a.qrInstances[0].options.dotsOptions.color, b.qrInstances[0].options.dotsOptions.color);
  });
});

describe('card content and caching', () => {
  it('draws site name and URL only (no title, no captions); the favicon bitmap is drawn when it loads', async () => {
    const p = await load(cardOpts({ tab: tabOf(URL_, 'My Page Title', 'https://www.example.com/fav.png') }));
    click(p, 'download-btn');
    await p.flush();
    const t = textsOf(p.canvases[0].ctx);
    for (const x of ['example.com', URL_]) assert.ok(t.includes(x), x);
    for (const x of ['My Page Title', 'WEBSITE', 'PAGE', 'LINK']) assert.ok(!t.includes(x), x);
    assert.ok(!t.some((x) => /scan to open/i.test(x)));
    assert.ok(!t.includes('E'));
    const draws = p.canvases[0].ctx.calls.filter((c) => c.op === 'drawImage');
    assert.equal(draws.length, 2);
    assert.equal(draws[0].args[0].fakeBitmap, true);
    assert.equal(p.canvases[0].toBlobCalls[0], 'image/png');
  });

  it('requests the extension _favicon endpoint with pageUrl and size=64', async () => {
    const p = await load(cardOpts());
    click(p, 'download-btn');
    await p.flush();
    assert.equal(p.fetchCalls.length, 1);
    const u = new URL(p.fetchCalls[0].url);
    assert.equal(u.protocol + '//' + u.host, 'chrome-extension://testid');
    assert.equal(u.pathname, '/_favicon/');
    assert.equal(u.searchParams.get('pageUrl'), URL_);
    assert.equal(u.searchParams.get('size'), '64');
  });

  it('still renders the card with the letter badge when the favicon fails, is not ok or getURL is missing', async () => {
    for (const o of [{ faviconFails: true }, { faviconNotOk: true }, { noRuntimeGetURL: true }]) {
      const p = await load(cardOpts(o));
      click(p, 'download-btn');
      await p.flush();
      assert.equal(p.anchorClicks.length, 1, JSON.stringify(o));
      assert.equal(exportDownloads(p), 0);
      assert.ok(textsOf(p.canvases[0].ctx).includes('E'));
      assert.equal(p.canvases[0].ctx.calls.filter((c) => c.op === 'drawImage').length, 1);
    }
  });

  it('gives up on a hanging favicon after the timeout and renders the badge', async () => {
    const p = await load(cardOpts({ faviconHangs: true }));
    click(p, 'download-btn');
    await p.flush();
    assert.equal(p.anchorClicks.length, 0);
    await sleep(2200);
    await p.flush();
    assert.equal(p.fetchCalls[0].signal.aborted, true);
    assert.equal(p.anchorClicks.length, 1);
    assert.ok(textsOf(p.canvases[0].ctx).includes('E'));
  });

  it('uses the dark palette in dark theme and light otherwise', async () => {
    const pal = getSitePalette('example.com');
    const bgOf = (p) => p.canvases[0].ctx.calls.find((c) => c.op === 'fillRect').fillStyle;
    const d = await load(cardOpts({ theme: 'dark' }));
    click(d, 'download-btn');
    await d.flush();
    assert.equal(bgOf(d), getCardTheme('dark', pal).bg);
    const l = await load(cardOpts({ theme: 'light' }));
    click(l, 'download-btn');
    await l.flush();
    assert.equal(bgOf(l), getCardTheme('light', pal).bg);
  });

  it('second click reuses the cached blob; a theme toggle re-renders', async () => {
    const p = await load(cardOpts({ theme: 'light' }));
    click(p, 'download-btn');
    await p.flush();
    click(p, 'download-btn');
    await p.flush();
    assert.equal(p.anchorClicks.length, 2);
    assert.equal(p.canvases.length, 1);
    assert.equal(p.qrInstances.length, 2);
    assert.equal(p.qrInstances[1].rawDataCalls.length, 1);
    click(p, 'theme-toggle');
    await p.flush();
    click(p, 'download-btn');
    await p.flush();
    assert.equal(p.canvases.length, 2);
    assert.equal(p.anchorClicks.length, 3);
    assert.equal(p.qrInstances.length, 2);
  });
});
