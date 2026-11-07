'use strict';
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadPopup } = require('./helpers/loadPopup');
const { getSitePalette, getQrPalette, contrastRatio } = require('../src/lib/utils.js');

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
const hidden = (el) => !el || el.classList.contains('hidden');
const text = (p, id) => p.document.getElementById(id).textContent;
const isError = (p) =>
  !hidden(p.document.getElementById('error-state')) &&
  hidden(p.document.getElementById('normal-content'));
const toast = (p) => p.document.getElementById('toast');
const click = (p, id) => p.document.getElementById(id).click();
const longUrl = (len) => 'https://example.com/' + 'a'.repeat(len - 'https://example.com/'.length);

describe('A: baseline behaviour', () => {
  it('https tab renders QR with url, url display and title', async () => {
    const url = 'https://example.com/page?x=1';
    const p = await load({ tab: tabOf(url, 'Example Page') });
    assert.equal(p.qrInstances.length, 1);
    assert.equal(p.qrInstances[0].options.data, url);
    assert.equal(p.document.getElementById('url-display').value, url);
    assert.equal(text(p, 'page-title'), 'Example Page');
    assert.ok(p.document.querySelector('#qr-container canvas[data-fake-qr]'));
    assert.equal(isError(p), false);
  });

  it('copy button writes url and shows toast', async () => {
    const url = 'https://example.com/';
    const p = await load({ tab: tabOf(url) });
    click(p, 'copy-btn');
    await p.flush();
    assert.deepEqual(p.clipboardWrites, [url]);
    assert.ok(toast(p).classList.contains('visible'));
  });

  it('clipboard failure shows failure toast', async () => {
    const p = await load({
      tab: tabOf('https://example.com/'),
      clipboardImpl: async () => { throw new Error('denied'); },
    });
    click(p, 'copy-btn');
    await p.flush();
    assert.ok(toast(p).classList.contains('visible'));
    assert.match(toast(p).textContent, /fail/i);
  });

  it('theme toggle flips data-theme and persists', async () => {
    const p = await load({ tab: tabOf('https://example.com/'), theme: 'light' });
    const root = p.document.documentElement;
    assert.equal(root.getAttribute('data-theme'), 'light');
    click(p, 'theme-toggle');
    assert.equal(root.getAttribute('data-theme'), 'dark');
    assert.equal(p.window.localStorage.getItem('linkhopper-theme'), 'dark');
    click(p, 'theme-toggle');
    assert.equal(root.getAttribute('data-theme'), 'light');
    assert.equal(p.window.localStorage.getItem('linkhopper-theme'), 'light');
  });

  it('prefers-dark without saved theme -> dark', async () => {
    const p = await load({ tab: tabOf('https://example.com/'), matchMediaDark: true });
    assert.equal(p.document.documentElement.getAttribute('data-theme'), 'dark');
  });

  it('saved theme beats system preference', async () => {
    const p = await load({ tab: tabOf('https://example.com/'), matchMediaDark: true, theme: 'light' });
    assert.equal(p.document.documentElement.getAttribute('data-theme'), 'light');
  });

  it('chrome:// tab shows error state', async () => {
    const p = await load({ tab: tabOf('chrome://settings') });
    assert.equal(isError(p), true);
    assert.equal(p.qrInstances.length, 0);
    assert.equal(text(p, 'site-name'), 'Link Hopper');
  });

  for (const [label, tab] of [['null', null], ['undefined', undefined], ['no url', { title: 'x' }]]) {
    it(`tab ${label} shows error state`, async () => {
      const p = await load({ tab });
      assert.equal(isError(p), true);
      assert.equal(p.qrInstances.length, 0);
    });
  }
});

describe('B1: unsupported schemes', () => {
  for (const url of [
    'file:///x', 'data:text/html,hi', 'blob:https://a/b', 'javascript:alert(1)',
    'chrome-untrusted://x', 'ftp://x',
  ]) {
    it(`${url} -> error state`, async () => {
      const p = await load({ tab: tabOf(url) });
      assert.equal(isError(p), true);
      assert.equal(p.qrInstances.length, 0);
    });
  }
  for (const url of ['http://localhost:3000', 'https://example.com/a']) {
    it(`${url} is supported`, async () => {
      const p = await load({ tab: tabOf(url) });
      assert.equal(isError(p), false);
      assert.ok(p.qrInstances.length >= 1);
    });
  }
});

describe('B2: site name', () => {
  for (const [url, name] of [
    ['https://www.github.com/a', 'github.com'],
    ['https://docs.google.com', 'docs.google.com'],
    ['https://www.bbc.co.uk', 'bbc.co.uk'],
  ]) {
    it(`${url} -> ${name}`, async () => {
      const p = await load({ tab: tabOf(url) });
      assert.equal(text(p, 'site-name'), name);
    });
  }
});

describe('B3: on-screen QR options', () => {
  it('opaque white background and EC level M', async () => {
    const p = await load({ tab: tabOf('https://example.com/') });
    const o = p.qrInstances[0].options;
    assert.equal(o.backgroundOptions.color, '#ffffff');
    assert.equal(o.qrOptions.errorCorrectionLevel, 'M');
  });
  it('dots and corners use the site palette (not the old static blue)', async () => {
    const p = await load({ tab: tabOf('https://example.com/') });
    const o = p.qrInstances[0].options;
    const pal = getQrPalette(getSitePalette('example.com'));
    assert.equal(o.dotsOptions.color, pal.dots);
    assert.equal(o.cornersSquareOptions.color, pal.corners);
    assert.equal(o.cornersDotOptions.color, pal.corners);
    assert.notEqual(o.dotsOptions.color, '#4267b2');
  });
});

describe('B4: download', () => {
  it('uses a hi-res export instance and shows success toast', async () => {
    const url = 'https://example.com/dl';
    const p = await load({ tab: tabOf(url) });
    const onScreen = p.qrInstances[0];
    click(p, 'download-btn');
    await p.flush();
    const withDl = p.qrInstances.filter((q) => q.downloads.length > 0);
    assert.equal(withDl.length, 1);
    const exp = withDl[0];
    assert.notEqual(exp, onScreen);
    assert.ok(exp.options.width >= 1024 && exp.options.height >= 1024);
    assert.equal(exp.options.backgroundOptions.color, '#ffffff');
    assert.equal(exp.options.data, url);
    assert.equal(exp.downloads[0].extension, 'png');
    assert.match(exp.downloads[0].name, /^.+_\d{8}-\d{6}$/);
    assert.equal(exp.options.dotsOptions.color, getQrPalette(getSitePalette('example.com')).dots);
    assert.equal(onScreen.downloads.length, 0);
    assert.ok(toast(p).classList.contains('visible'));
    assert.doesNotMatch(toast(p).textContent, /fail/i);
  });

  it('download failure shows failure toast without crashing', async () => {
    const p = await load({ tab: tabOf('https://example.com/'), qrDownloadThrows: true });
    click(p, 'download-btn');
    await p.flush();
    assert.ok(toast(p).classList.contains('visible'));
    assert.match(toast(p).textContent, /fail/i);
  });
});

describe('B5: long URLs', () => {
  for (const len of [801, 2000]) {
    it(`${len} chars renders QR with #qr-warning`, async () => {
      const p = await load({ tab: tabOf(longUrl(len)) });
      assert.ok(p.qrInstances.length >= 1, 'qr rendered');
      const w = p.document.getElementById('qr-warning');
      assert.ok(w, 'warning element exists');
      assert.equal(w.classList.contains('hidden'), false);
      assert.match(w.textContent, /scan/i);
      assert.match(w.textContent, /hard|difficult|may not/i);
    });
  }

  it('> 2000 chars shows error with "too long" and no QR', async () => {
    const p = await load({ tab: tabOf(longUrl(2001)) });
    assert.equal(p.qrInstances.length, 0);
    assert.equal(isError(p), true);
    const es = p.document.getElementById('error-state');
    assert.match(es.textContent, /too long/i);
    assert.match(es.textContent, /Can't generate QR code/);
  });

  for (const len of [100, 800]) {
    it(`${len} chars has no visible warning`, async () => {
      const p = await load({ tab: tabOf(longUrl(len)) });
      assert.ok(hidden(p.document.getElementById('qr-warning')));
    });
  }
});

describe('B6: QR library failures', () => {
  it('constructor throwing -> error state', async () => {
    const p = await load({ tab: tabOf('https://example.com/'), qrCtorThrows: true });
    assert.equal(isError(p), true);
  });
  it('append throwing -> error state', async () => {
    const p = await load({ tab: tabOf('https://example.com/'), qrAppendThrows: true });
    assert.equal(isError(p), true);
  });
});

describe('B7: no markup injection', () => {
  it('page title rendered as literal text', async () => {
    const title = '<img src=x onerror=alert(1)>';
    const p = await load({ tab: tabOf('https://example.com/', title) });
    const el = p.document.getElementById('page-title');
    assert.equal(el.textContent, title);
    assert.equal(el.querySelector('img'), null);
    click(p, 'copy-btn');
    await p.flush();
    assert.equal(toast(p).querySelector('img'), null);
  });
});

describe('C: favicon resilience', () => {
  const fav = (p) => p.document.getElementById('url-favicon');
  const fail = (p) => fav(p).dispatchEvent(new p.window.Event('error'));

  it('loads the tab favicon when provided', async () => {
    const p = await load({ tab: tabOf('https://example.com/a', 'T', 'https://cdn.example.com/icon.png') });
    assert.equal(fav(p).getAttribute('src'), 'https://cdn.example.com/icon.png');
    assert.notEqual(fav(p).style.display, 'none');
  });

  it('falls back to /favicon.ico once, then hides if that also fails', async () => {
    const p = await load({ tab: tabOf('https://example.com/a', 'T', 'https://cdn.example.com/icon.png') });
    fail(p);
    assert.equal(fav(p).getAttribute('src'), 'https://example.com/favicon.ico');
    assert.notEqual(fav(p).style.display, 'none');
    fail(p);
    assert.equal(fav(p).style.display, 'none');
    fail(p);
    assert.equal(fav(p).style.display, 'none');
  });

  it('hides immediately when the failing icon already is /favicon.ico', async () => {
    const p = await load({ tab: tabOf('https://example.com/a', 'T', 'https://example.com/favicon.ico') });
    fail(p);
    assert.equal(fav(p).style.display, 'none');
  });

  it('hides when the tab has no favicon', async () => {
    const p = await load({ tab: tabOf('https://example.com/a', 'T', '') });
    assert.equal(fav(p).style.display, 'none');
  });

  it('does not send a referrer when fetching the icon', async () => {
    const p = await load({ tab: tabOf('https://example.com/a', 'T', 'https://cdn.example.com/icon.png') });
    assert.equal(fav(p).referrerPolicy, 'no-referrer');
  });
});

describe('F: letter-badge fallback', () => {
  const badge = (p) => p.document.getElementById('url-favicon-fallback');
  const fav = (p) => p.document.getElementById('url-favicon');
  const fail = (p) => fav(p).dispatchEvent(new p.window.Event('error'));

  it('is hidden while a real favicon is displayed', async () => {
    const p = await load({ tab: tabOf('https://github.com/a', 'T', 'https://cdn.example.com/icon.png') });
    assert.ok(badge(p));
    assert.ok(hidden(badge(p)));
    fail(p);
    assert.ok(hidden(badge(p)), 'still hidden while /favicon.ico is being tried');
  });

  it('shows the site initial when there is no favicon url', async () => {
    const p = await load({ tab: tabOf('https://www.github.com/a', 'T', '') });
    assert.ok(!hidden(badge(p)));
    assert.equal(badge(p).textContent, 'G');
    assert.equal(fav(p).style.display, 'none');
    assert.equal(badge(p).getAttribute('aria-hidden'), 'true');
  });

  it('shows the badge after the final favicon failure', async () => {
    const p = await load({ tab: tabOf('https://example.com/a', 'T', 'https://cdn.example.com/icon.png') });
    fail(p);
    fail(p);
    assert.ok(!hidden(badge(p)));
    assert.equal(badge(p).textContent, 'E');
  });

  it('shows the badge when the failing icon already is /favicon.ico', async () => {
    const p = await load({ tab: tabOf('https://example.com/a', 'T', 'https://example.com/favicon.ico') });
    fail(p);
    assert.ok(!hidden(badge(p)));
  });

  it('uses a digit for IP hosts', async () => {
    const p = await load({ tab: tabOf('http://192.168.1.5:8080/', 'T', '') });
    assert.equal(badge(p).textContent, '1');
  });

  it('uses the site palette (same host, same palette) for the badge colours', async () => {
    const a = await load({ tab: tabOf('https://example.com/x', 'T', '') });
    const b = await load({ tab: tabOf('https://www.example.com/y', 'T', '') });
    const id = a.document.documentElement.getAttribute('data-palette');
    assert.equal(id, getSitePalette('example.com').id);
    assert.equal(id, b.document.documentElement.getAttribute('data-palette'));
    assert.equal(
      a.document.documentElement.style.getPropertyValue('--pl-accent'),
      b.document.documentElement.style.getPropertyValue('--pl-accent')
    );
  });

  it('stays hidden in the unsupported-page error state', async () => {
    const p = await load({ tab: tabOf('chrome://extensions/') });
    assert.ok(isError(p));
    assert.ok(hidden(badge(p)));
    assert.equal(fav(p).style.display, 'none');
    assert.equal(text(p, 'site-name'), 'Link Hopper');
  });

  it('stays hidden in the too-long error state', async () => {
    const p = await load({ tab: tabOf('https://example.com/' + 'a'.repeat(2100), 'T', '') });
    assert.ok(isError(p));
    assert.ok(hidden(badge(p)));
  });
});

describe('G: theme preference in chrome.storage.sync', () => {
  const KEY = 'linkhopper-theme';
  const root = (p) => p.document.documentElement.getAttribute('data-theme');
  const ls = (p) => p.window.localStorage.getItem(KEY);
  const base = { tab: tabOf('https://example.com/') };

  it('sync value overrides the local cache and refreshes it', async () => {
    const p = await load({ ...base, theme: 'light', syncStorage: { [KEY]: 'dark' } });
    assert.equal(root(p), 'dark');
    assert.equal(ls(p), 'dark');
  });

  it('sync value overrides system preference when nothing is cached', async () => {
    const p = await load({ ...base, matchMediaDark: false, syncStorage: { [KEY]: 'dark' } });
    assert.equal(root(p), 'dark');
    assert.equal(ls(p), 'dark');
  });

  it('local value migrates up to sync when sync is empty', async () => {
    const p = await load({ ...base, theme: 'dark' });
    assert.equal(p.sync.data[KEY], 'dark');
  });

  it('does not write to sync when both are empty (follow system)', async () => {
    const p = await load({ ...base, matchMediaDark: true });
    assert.equal(root(p), 'dark');
    assert.equal(p.sync.sets.length, 0);
    assert.equal(ls(p), null);
  });

  it('does not rewrite sync when it already matches', async () => {
    const p = await load({ ...base, theme: 'dark', syncStorage: { [KEY]: 'dark' } });
    assert.equal(p.sync.sets.length, 0);
  });

  it('toggle writes both localStorage and sync', async () => {
    const p = await load({ ...base, theme: 'light', syncStorage: { [KEY]: 'light' } });
    click(p, 'theme-toggle');
    await p.flush();
    assert.equal(root(p), 'dark');
    assert.equal(ls(p), 'dark');
    assert.equal(p.sync.data[KEY], 'dark');
  });

  it('ignores invalid values in sync', async () => {
    const p = await load({ ...base, theme: 'light', syncStorage: { [KEY]: 'purple' } });
    assert.equal(root(p), 'light');
    assert.equal(ls(p), 'light');
  });

  it('ignores invalid values in localStorage', async () => {
    const p = await load({ ...base, theme: 'purple', matchMediaDark: false, syncStorage: { [KEY]: 'dark' } });
    assert.equal(root(p), 'dark');
    assert.equal(ls(p), 'dark');
  });

  for (const [name, o] of [
    ['sync rejects', { syncFails: true }],
    ['sync throws synchronously', { syncThrowsSync: true }],
    ['chrome.storage is absent', { noStorage: true }],
  ]) {
    it(`toggle and init still work when ${name}`, async () => {
      const p = await load({ ...base, theme: 'light', ...o });
      assert.equal(root(p), 'light');
      click(p, 'theme-toggle');
      await p.flush();
      assert.equal(root(p), 'dark');
      assert.equal(ls(p), 'dark');
      click(p, 'theme-toggle');
      await p.flush();
      assert.equal(root(p), 'light');
    });
  }

  it('follows system changes while no preference is saved anywhere', async () => {
    const p = await load({ ...base, matchMediaDark: false });
    p.systemThemeChange(true);
    assert.equal(root(p), 'dark');
    p.systemThemeChange(false);
    assert.equal(root(p), 'light');
  });

  it('ignores system changes once a preference is saved', async () => {
    const p = await load({ ...base, matchMediaDark: false, theme: 'light' });
    p.systemThemeChange(true);
    assert.equal(root(p), 'light');
  });
});

describe('H: theme toggled before the storage read returns', () => {
  it('keeps the user choice instead of applying the stale synced value', async () => {
    const p = await load({
      tab: tabOf('https://example.com/'),
      matchMediaDark: false,
      syncStorage: { 'linkhopper-theme': 'light' },
      holdSyncGet: true,
    });
    const root = p.document.documentElement;
    assert.equal(root.getAttribute('data-theme'), 'light');
    click(p, 'theme-toggle');
    await p.flush();
    assert.equal(root.getAttribute('data-theme'), 'dark');
    p.sync.releaseGet();
    await p.flush();
    assert.equal(root.getAttribute('data-theme'), 'dark');
    assert.equal(p.window.localStorage.getItem('linkhopper-theme'), 'dark');
    assert.equal(p.sync.data['linkhopper-theme'], 'dark');
  });
});

describe('site palette in the popup', () => {
  const root = (p) => p.document.documentElement;
  const hosts = ['github.com', 'example.com', 'wikipedia.org', 'notion.so', 'bbc.com', 'figma.com'];

  it('exposes both theme variants as CSS custom properties, matching the palette', async () => {
    for (const h of hosts) {
      const p = await load({ tab: tabOf('https://' + h + '/') });
      const pal = getSitePalette(h);
      assert.equal(root(p).getAttribute('data-palette'), pal.id);
      for (const k of Object.keys(pal.light)) assert.equal(root(p).style.getPropertyValue('--pl-' + k), pal.light[k], h + ' light ' + k);
      for (const k of Object.keys(pal.dark)) assert.equal(root(p).style.getPropertyValue('--pd-' + k), pal.dark[k], h + ' dark ' + k);
    }
  });

  it('QR dots on screen are the palette dots, which contrast >= 7:1 on the white tile', async () => {
    for (const h of hosts) {
      const p = await load({ tab: tabOf('https://' + h + '/') });
      const dots = p.qrInstances[0].options.dotsOptions.color;
      assert.equal(dots, getQrPalette(getSitePalette(h)).dots);
      assert.ok(contrastRatio(dots, '#ffffff') >= 7, h);
    }
  });

  it('is not applied on the unsupported-page error screen (CSS falls back to Ocean)', async () => {
    const p = await load({ tab: tabOf('chrome://extensions/') });
    assert.equal(root(p).getAttribute('data-palette'), null);
  });

  it('the stylesheet reads the palette properties for both themes, with fallbacks', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup', 'index.css'), 'utf8');
    for (const k of ['base', 'baseEnd', 'surface', 'border', 'text', 'muted', 'accent', 'badgeText', 'shadow']) {
      assert.match(css, new RegExp('var\\(--pl-' + k + ', '), '--pl-' + k);
      assert.match(css, new RegExp('var\\(--pd-' + k + ', '), '--pd-' + k);
    }
  });
});
