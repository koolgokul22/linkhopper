'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PALETTES } = require('../src/lib/utils.js');
const { fitText, getCardTheme, cardFilename, bentoLayout, renderCard } = require('../src/lib/card.js');
const { createFakeCanvas, textsOf } = require('./helpers/fakeCanvas');

const m = (s) => s.length * 10;

describe('fitText', () => {
  it('returns one line when text fits', () => {
    assert.deepEqual(fitText(m, 'hello world', 200, 3), ['hello world']);
  });
  it('wraps at spaces', () => {
    assert.deepEqual(fitText(m, 'aaa bbb ccc ddd', 80, 5), ['aaa bbb', 'ccc ddd']);
  });
  it('hard-breaks a token that is too long', () => {
    const url = 'https://example.com/' + 'a'.repeat(30);
    const lines = fitText(m, url, 100, 10);
    assert.ok(lines.length > 1);
    assert.equal(lines.join(''), url);
    for (const l of lines) assert.ok(m(l) <= 100);
  });
  it('ellipsises the last line when over maxLines', () => {
    const lines = fitText(m, 'x'.repeat(100), 100, 2);
    assert.equal(lines.length, 2);
    assert.ok(lines[1].endsWith('…'));
    assert.ok(m(lines[1]) <= 100);
  });
  it('returns [] for empty or non-string input', () => {
    assert.deepEqual(fitText(m, '', 100, 2), []);
    assert.deepEqual(fitText(m, '   ', 100, 2), []);
    assert.deepEqual(fitText(m, null, 100, 2), []);
    assert.deepEqual(fitText(m, 42, 100, 2), []);
  });
  it('never exceeds maxWidth or maxLines', () => {
    const text = 'The quick brown fox https://example.com/' + 'z'.repeat(77) + ' jumps over';
    for (const w of [50, 90, 130, 400]) {
      for (const n of [1, 2, 3]) {
        const lines = fitText(m, text, w, n);
        assert.ok(lines.length <= n);
        for (const l of lines) assert.ok(m(l) <= w, `"${l}" too wide for ${w}`);
      }
    }
  });
});

describe('getCardTheme', () => {
  const P0 = PALETTES[0];
  const P4 = PALETTES[4];
  it('has the expected keys and a white QR tile in both themes', () => {
    for (const t of ['light', 'dark']) {
      const th = getCardTheme(t, P0);
      for (const k of ['bg', 'bgFrom', 'bgTo', 'text', 'subtext', 'caption', 'border', 'tile', 'headerTile', 'iconBack', 'accent', 'shadow', 'qrTile', 'badgeText']) {
        assert.ok(th[k], k);
      }
      assert.equal(th.qrTile, '#ffffff');
    }
  });
  it('dark differs from light; anything else is light; a missing palette uses the first', () => {
    assert.notEqual(getCardTheme('dark', P0).bg, getCardTheme('light', P0).bg);
    assert.deepEqual(getCardTheme('nonsense', P0), getCardTheme('light', P0));
    assert.deepEqual(getCardTheme(undefined), getCardTheme('light', P0));
    assert.deepEqual(getCardTheme('dark', null), getCardTheme('dark', P0));
  });
  it('takes its colours from the palette variant, stably', () => {
    for (const t of ['light', 'dark']) {
      const v = P4[t];
      const th = getCardTheme(t, P4);
      assert.equal(th.bg, v.base);
      assert.equal(th.tile, v.surface);
      assert.equal(th.accent, v.accent);
      assert.equal(th.text, v.text);
      assert.notEqual(getCardTheme(t, P0).bg, getCardTheme(t, P4).bg);
      assert.notEqual(getCardTheme(t, P0).accent, getCardTheme(t, P4).accent);
      assert.deepEqual(getCardTheme(t, P4), getCardTheme(t, P4));
    }
  });
});

describe('cardFilename', () => {
  const d = new Date(2026, 10, 7, 14, 35, 12); // local time: 2026-11-07 14:35:12
  it('is <website>_<YYYYMMDD>-<HHMMSS>.png in local time, no prefix', () => {
    assert.equal(cardFilename('linkedin.com', d), 'linkedin.com_20261107-143512.png');
    assert.equal(cardFilename('Docs.Google.com', d), 'docs.google.com_20261107-143512.png');
  });
  it('zero-pads fields', () => {
    assert.equal(cardFilename('x.io', new Date(2026, 0, 2, 3, 4, 5)), 'x.io_20260102-030405.png');
  });
  it('sanitises site names', () => {
    assert.equal(cardFilename('a b/c?d', d), 'a-b-c-d_20261107-143512.png');
    assert.equal(cardFilename('--x--', d), 'x_20261107-143512.png');
  });
  it('falls back to qr', () => {
    assert.equal(cardFilename('', d), 'qr_20261107-143512.png');
    assert.equal(cardFilename('???', d), 'qr_20261107-143512.png');
    assert.equal(cardFilename(undefined, d), 'qr_20261107-143512.png');
  });
  it('defaults the clock to now', () => {
    assert.match(cardFilename('a.com'), /^a\.com_\d{8}-\d{6}\.png$/);
  });
});

describe('bentoLayout', () => {
  it('has header, QR and one full-width URL tile; no title tile', () => {
    const l = bentoLayout({ urlLineCount: 2 });
    assert.equal(l.titleTile, undefined);
    assert.equal(l.urlTile.x, 56);
    assert.equal(l.urlTile.w, 1088);
    assert.equal(l.urlTile.y, l.qr.y + l.qr.h + 24);
    assert.equal(l.textW, 1088 - 2 * l.pad);
    assert.equal(l.height, l.urlTile.y + l.urlTile.h + 56);
  });
  it('height grows with each URL line and is sized to content', () => {
    const h = (n) => bentoLayout({ urlLineCount: n });
    assert.ok(h(2).height > h(1).height);
    assert.ok(h(6).height > h(3).height);
    assert.equal(h(2).urlTile.h - h(1).urlTile.h, h(3).urlTile.h - h(2).urlTile.h);
    assert.ok(h(0).urlTile.h > 0);
  });
});

describe('renderCard', () => {
  const base = { qrBitmap: { fake: 1 }, siteName: 'example.com', url: 'https://example.com/x', theme: 'light', palette: PALETTES[4], initial: 'E' };
  const run = async (over = {}, canvasOpts = {}) => {
    const canvas = createFakeCanvas(canvasOpts);
    const blob = await renderCard({ ...base, ...over, createCanvas: () => canvas });
    return { canvas, blob };
  };

  it('returns a PNG blob from a 1200px wide portrait canvas', async () => {
    const { canvas, blob } = await run();
    assert.equal(blob.type, 'image/png');
    assert.equal(canvas.width, 1200);
    assert.ok(canvas.height > 1400);
    assert.deepEqual(canvas.toBlobCalls, ['image/png']);
  });

  it('fills an opaque palette base background first, then a diagonal gradient', async () => {
    const { canvas } = await run({ theme: 'dark' });
    const first = canvas.ctx.calls.find((c) => c.op === 'fillRect');
    assert.deepEqual(first.args, [0, 0, 1200, canvas.height]);
    assert.equal(first.fillStyle, getCardTheme('dark', PALETTES[4]).bg);
    const g = canvas.ctx.calls.find((c) => c.op === 'createLinearGradient').gradient;
    assert.deepEqual(g.stops, [
      [0, getCardTheme('dark', PALETTES[4]).bgFrom],
      [1, getCardTheme('dark', PALETTES[4]).bgTo],
    ]);
  });

  it('palette changes the background colours; the same palette is stable', async () => {
    const bg = async (palette) => (await run({ palette })).canvas.ctx.calls.find((c) => c.op === 'fillRect').fillStyle;
    assert.notEqual(await bg(PALETTES[0]), await bg(PALETTES[4]));
    assert.equal(await bg(PALETTES[4]), await bg(PALETTES[4]));
  });

  it('draws the letter badge, site name and URL (no captions, no title), and only the QR image, without a favicon', async () => {
    const { canvas } = await run();
    const draws = canvas.ctx.calls.filter((c) => c.op === 'drawImage');
    assert.equal(draws.length, 1);
    assert.equal(draws[0].args[0], base.qrBitmap);
    assert.deepEqual(textsOf(canvas.ctx), ['E', 'example.com', 'https://example.com/x']);
    assert.ok(canvas.ctx.calls.some((c) => c.op === 'fill' && c.fillStyle === getCardTheme('light', PALETTES[4]).accent));
    assert.ok(canvas.ctx.calls.some((c) => c.op === 'arc'));
  });

  it('has no "Scan to open" footer', async () => {
    const { canvas } = await run();
    assert.ok(!textsOf(canvas.ctx).some((t) => /scan to open/i.test(t)));
  });

  it('draws the favicon (clipped, before the QR) and no badge when supplied', async () => {
    const favicon = { fakeFavicon: 1 };
    const { canvas } = await run({ favicon });
    const draws = canvas.ctx.calls.filter((c) => c.op === 'drawImage');
    assert.equal(draws.length, 2);
    assert.equal(draws[0].args[0], favicon);
    assert.equal(draws[0].args[3], 64);
    assert.equal(draws[1].args[0], base.qrBitmap);
    assert.ok(canvas.ctx.calls.some((c) => c.op === 'clip'));
    assert.ok(!canvas.ctx.calls.some((c) => c.op === 'arc'));
    assert.ok(!textsOf(canvas.ctx).includes('E'));
  });

  it('falls back to the letter badge when drawing the favicon throws', async () => {
    const favicon = { fakeFavicon: 1 };
    const { canvas, blob } = await run({ favicon }, { throwOnDrawImage: (img) => img === favicon });
    assert.equal(blob.type, 'image/png');
    assert.equal(canvas.ctx.calls.filter((c) => c.op === 'drawImage').length, 1);
    assert.ok(textsOf(canvas.ctx).includes('E'));
    assert.ok(canvas.ctx.calls.some((c) => c.op === 'arc'));
  });

  it('never draws a title, PAGE, LINK or WEBSITE text, even if a title is passed', async () => {
    const { canvas } = await run({ title: 'A Title' });
    const t = textsOf(canvas.ctx);
    for (const x of ['A Title', 'PAGE', 'LINK', 'WEBSITE']) assert.ok(!t.includes(x), x);
  });

  it('bento structure: header, white QR tile, one full-width URL tile', async () => {
    const { canvas } = await run({ theme: 'dark' });
    const calls = canvas.ctx.calls;
    const rects = calls.filter((c) => c.op === 'roundRect').map((c) => c.args);
    // each tile is path-ed twice (fill, then stroke); take the distinct ones in order
    const tiles = rects.filter((r, i) => i % 2 === 0);
    assert.equal(tiles.length, 3);
    const [header, qr, link] = tiles;
    assert.deepEqual(header, [56, 56, 1088, 152, 44]);
    assert.deepEqual(qr.slice(2), [1088, 1088, 44]);
    assert.equal(link[0], 56);
    assert.equal(link[2], 1088);
    assert.equal(link[1], qr[1] + qr[3] + 24);
    assert.ok(calls.some((c) => c.op === 'fill' && c.fillStyle === '#ffffff'));
    assert.ok(calls.some((c) => c.op === 'stroke'));
  });

  it('draws the URL at 30px', async () => {
    const { canvas } = await run();
    const call = canvas.ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === base.url);
    assert.match(call.font, /^400 30px /);
  });

  it('wraps a long URL over up to 6 lines, ellipsised, and the height grows', async () => {
    const short = (await run()).canvas.height;
    const url = 'https://example.com/' + 'q'.repeat(1500);
    const u = await run({ url });
    assert.ok(u.canvas.height > short);
    const urlLines = textsOf(u.canvas.ctx).filter((t) => t.startsWith('https://') || /^q+…?$/.test(t));
    assert.equal(urlLines.length, 6);
    assert.ok(urlLines.at(-1).endsWith('…'));
    const tiles = u.canvas.ctx.calls.filter((c) => c.op === 'roundRect').map((c) => c.args).filter((r, i) => i % 2 === 0);
    assert.equal(tiles[2][2], 1088);
  });

  it('a medium URL uses several lines without ellipsis', async () => {
    const url = 'https://example.com/' + 'q'.repeat(120);
    const { canvas } = await run({ url });
    const lines = textsOf(canvas.ctx).filter((t) => t.startsWith('https://') || /^q+$/.test(t));
    assert.ok(lines.length > 1 && lines.length < 6);
    assert.equal(lines.join(''), url);
  });

  it('rejects when toBlob yields null', async () => {
    await assert.rejects(run({}, { nullBlob: true }));
  });
  it('rejects when there is no 2d context', async () => {
    await assert.rejects(run({}, { noContext: true }));
  });
});
