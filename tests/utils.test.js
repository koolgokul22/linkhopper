'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const utilsPath = path.join(__dirname, '..', 'src', 'lib', 'utils.js');
const { isSupportedUrl, extractWebsiteName, QR_LIMITS, getQrUrlStatus, getSiteInitial, PALETTES, getSitePalette, contrastRatio, hslToHex, getQrPalette } = require('../src/lib/utils.js');

test('exports exactly the contract', () => {
  const u = require('../src/lib/utils.js');
  assert.deepEqual(Object.keys(u).sort(), ['PALETTES', 'QR_LIMITS', 'contrastRatio', 'extractWebsiteName', 'getQrPalette', 'getQrUrlStatus', 'getSiteInitial', 'getSitePalette', 'hslToHex', 'isSupportedUrl']);
});

test('isSupportedUrl accepts http/https', () => {
  for (const u of [
    'https://example.com',
    'http://example.com',
    'HTTPS://example.com',
    'HtTp://Example.COM/Path',
    'http://localhost:3000',
    'http://192.168.1.5',
    'https://user:pass@example.com:8443/a?b=c#d',
    'https://example.com/?q=1&r=2#hash',
  ]) assert.equal(isSupportedUrl(u), true, u);
});

test('isSupportedUrl rejects unsupported schemes', () => {
  for (const u of [
    'chrome://extensions',
    'chrome-extension://abcdef/index.html',
    'chrome-untrusted://foo',
    'edge://settings',
    'about:blank',
    'devtools://devtools/bundled/inspector.html',
    'file:///C:/x.txt',
    'view-source:https://example.com',
    'data:text/html,hi',
    'blob:https://example.com/uuid',
    'javascript:alert(1)',
    'ftp://example.com',
  ]) assert.equal(isSupportedUrl(u), false, u);
});

test('isSupportedUrl rejects non-strings and malformed input', () => {
  for (const u of [undefined, null, 42, {}, [], true, () => {}, '', '   ', 'not a url', 'http://', 'https://', '//example.com', 'example.com'])
    assert.equal(isSupportedUrl(u), false, String(u));
  assert.equal(isSupportedUrl({ toString: () => 'https://example.com' }), false);
});

test('extractWebsiteName examples', () => {
  const cases = [
    ['https://www.github.com/a/b', 'github.com'],
    ['https://docs.google.com/x', 'docs.google.com'],
    ['https://www.bbc.co.uk', 'bbc.co.uk'],
    ['http://localhost:3000', 'localhost'],
    ['http://192.168.1.5:8080', '192.168.1.5'],
    ['https://xn--bcher-kva.example', 'xn--bcher-kva.example'],
    ['https://WWW.Example.COM/Path', 'example.com'],
    ['https://user:pw@www.example.com:444/a?b#c', 'example.com'],
    ['https://www.www.example.com', 'www.example.com'],
    ['https://wwwexample.com', 'wwwexample.com'],
    ['https://www', 'www'],
    ['https://www.', 'www.'],
  ];
  for (const [input, expected] of cases) assert.equal(extractWebsiteName(input), expected, input);
});

test('extractWebsiteName returns Unknown for bad input and never throws', () => {
  for (const u of [undefined, null, 5, {}, [], '', '   ', 'not a url', 'http://', 'about:blank', 'data:text/plain,hi', 'file:///x'])
    assert.equal(extractWebsiteName(u), 'Unknown', String(u));
});

test('QR_LIMITS is frozen with warn/max', () => {
  assert.deepEqual(QR_LIMITS, { warn: 800, max: 2000 });
  assert.equal(Object.isFrozen(QR_LIMITS), true);
});

test('getQrUrlStatus boundaries', () => {
  const s = (n) => 'a'.repeat(n);
  assert.equal(getQrUrlStatus(''), 'ok');
  assert.equal(getQrUrlStatus('https://a.co'), 'ok');
  assert.equal(getQrUrlStatus(s(799)), 'ok');
  assert.equal(getQrUrlStatus(s(800)), 'ok');
  assert.equal(getQrUrlStatus(s(801)), 'long');
  assert.equal(getQrUrlStatus(s(2000)), 'long');
  assert.equal(getQrUrlStatus(s(2001)), 'too-long');
  assert.equal(getQrUrlStatus(s(10000)), 'too-long');
});

test('getQrUrlStatus non-strings are too-long', () => {
  for (const v of [undefined, null, 5, {}, [], { length: 10 }, ['a']])
    assert.equal(getQrUrlStatus(v), 'too-long', String(v));
});

test('browser path exposes window.LinkHopperUtils without module', () => {
  const code = fs.readFileSync(utilsPath, 'utf8');
  const win = { URL };
  win.self = win;
  win.window = win;
  vm.runInNewContext(code, win);
  const api = win.LinkHopperUtils;
  assert.ok(api);
  assert.deepEqual(Object.keys(api).sort(), ['PALETTES', 'QR_LIMITS', 'contrastRatio', 'extractWebsiteName', 'getQrPalette', 'getQrUrlStatus', 'getSiteInitial', 'getSitePalette', 'hslToHex', 'isSupportedUrl']);
  assert.equal(api.isSupportedUrl('https://example.com'), true);
  assert.equal(api.isSupportedUrl('chrome://x'), false);
  assert.equal(api.extractWebsiteName('https://www.github.com/a'), 'github.com');
  assert.equal(api.getQrUrlStatus('a'.repeat(801)), 'long');
  assert.equal(api.QR_LIMITS.max, 2000);
});

test('browser path works when only a window-like this is available', () => {
  const code = fs.readFileSync(utilsPath, 'utf8');
  const ctx = vm.createContext({ URL });
  vm.runInContext(code, ctx);
  assert.equal(typeof ctx.LinkHopperUtils.isSupportedUrl, 'function');
});

test('getSiteInitial returns uppercase first alphanumeric character', () => {
  assert.equal(getSiteInitial('github.com'), 'G');
  assert.equal(getSiteInitial('192.168.1.5'), '1');
  assert.equal(getSiteInitial('-.foo.com'), 'F');
});

test('getSiteInitial falls back to ? when nothing usable', () => {
  for (const v of ['', '...', '-', null, undefined, 42]) assert.equal(getSiteInitial(v), '?');
});

test('there are exactly 10 distinct, frozen palettes with both theme variants', () => {
  assert.equal(PALETTES.length, 10);
  assert.equal(new Set(PALETTES.map((p) => p.id)).size, 10);
  assert.equal(new Set(PALETTES.map((p) => p.light.accent)).size, 10);
  assert.ok(Object.isFrozen(PALETTES) && Object.isFrozen(PALETTES[0]) && Object.isFrozen(PALETTES[0].light));
  const keys = ['base', 'baseEnd', 'surface', 'border', 'text', 'muted', 'accent', 'badgeText', 'iconBack', 'shadow'];
  for (const p of PALETTES) for (const v of [p.light, p.dark]) for (const k of keys) assert.ok(v[k], p.id + ' ' + k);
});

test('palette contrast: text >= 7, muted >= 4.5, accent >= 4.5, badge >= 4.5 (both themes)', () => {
  for (const p of PALETTES) {
    for (const [name, v] of [['light', p.light], ['dark', p.dark]]) {
      const at = (c, bg) => contrastRatio(c, bg);
      assert.ok(at(v.text, v.surface) >= 7, p.id + ' ' + name + ' text/surface');
      assert.ok(at(v.text, v.base) >= 7, p.id + ' ' + name + ' text/base');
      assert.ok(at(v.muted, v.surface) >= 4.5, p.id + ' ' + name + ' muted/surface');
      assert.ok(at(v.accent, v.surface) >= 4.5, p.id + ' ' + name + ' accent/surface ' + at(v.accent, v.surface).toFixed(2));
      assert.ok(at(v.badgeText, v.accent) >= 4.5, p.id + ' ' + name + ' badge/accent');
    }
  }
});

test('surfaces read as raised: the tile is lighter than the page base in both themes', () => {
  const lum = (c) => contrastRatio(c, '#000000');
  for (const p of PALETTES) {
    assert.ok(lum(p.light.surface) > lum(p.light.base), p.id + ' light');
    assert.ok(lum(p.dark.surface) > lum(p.dark.base), p.id + ' dark');
  }
});

test('getSitePalette is stable, always one of the 10, and spreads sites across palettes', () => {
  for (const v of ['github.com', 'example.com', '', 'a', 'x'.repeat(500), null, undefined, 42]) {
    const p = getSitePalette(v);
    assert.ok(PALETTES.includes(p), String(v));
    assert.equal(getSitePalette(v), p);
  }
  const hosts = ['github.com', 'google.com', 'youtube.com', 'linkedin.com', 'twitter.com', 'reddit.com', 'wikipedia.org', 'amazon.com', 'netflix.com', 'stackoverflow.com', 'medium.com', 'notion.so', 'figma.com', 'apple.com', 'microsoft.com', 'bbc.com', 'nytimes.com', 'spotify.com', 'twitch.tv', 'slack.com'];
  assert.ok(new Set(hosts.map((h) => getSitePalette(h).id)).size >= 6);
});

test('contrastRatio known values', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#ffffff', '#000000'), 21);
  assert.equal(contrastRatio('#336699', '#336699'), 1);
  assert.ok(Math.abs(contrastRatio('#777777', '#ffffff') - 4.48) < 0.02);
});

test('hslToHex known values', () => {
  assert.equal(hslToHex(0, 100, 50), '#ff0000');
  assert.equal(hslToHex(120, 100, 50), '#00ff00');
  assert.equal(hslToHex(240, 100, 50), '#0000ff');
  assert.equal(hslToHex(0, 0, 0), '#000000');
  assert.equal(hslToHex(0, 0, 100), '#ffffff');
  assert.equal(hslToHex(360, 100, 50), '#ff0000');
});

test('getQrPalette: white background, dark dots/corners with contrast >= 7 for every palette', () => {
  for (const pal of PALETTES) {
    const p = getQrPalette(pal);
    assert.equal(p.background, '#ffffff');
    for (const c of [p.dots, p.corners]) {
      assert.match(c, /^#[0-9a-f]{6}$/, pal.id);
      assert.ok(contrastRatio(c, '#ffffff') >= 7, pal.id + ' ' + c);
    }
    assert.deepEqual(getQrPalette(pal), p);
  }
  assert.notEqual(getQrPalette(PALETTES[0]).dots, getQrPalette(PALETTES[4]).dots);
});

test('getQrPalette tolerates bad input', () => {
  for (const v of [undefined, null, NaN, 'x', -30, {}]) {
    const p = getQrPalette(v);
    assert.match(p.dots, /^#[0-9a-f]{6}$/);
    assert.ok(contrastRatio(p.dots, '#ffffff') >= 7);
  }
});
