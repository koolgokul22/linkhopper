'use strict';
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadPopup } = require('./helpers/loadPopup');

const open = [];
const load = async (o) => {
  const p = await loadPopup(o);
  open.push(p);
  return p;
};
afterEach(() => {
  while (open.length) open.pop().close();
});

const tabOf = (url, title = 'Title') => ({ url, title, favIconUrl: '' });
const toast = (p) => p.document.getElementById('toast');
const shareBtn = (p) => p.document.getElementById('share-btn');
const errNamed = (name) => Object.assign(new Error(name), { name });

describe('Share button shares only the URL', () => {
  it('is visible with and without navigator.share', async () => {
    for (const hasShare of [false, true]) {
      const p = await load({ tab: tabOf('https://example.com/'), hasShare });
      assert.notEqual(shareBtn(p).style.display, 'none');
    }
  });

  it('calls navigator.share once with exactly { url }', async () => {
    const url = 'https://docs.google.com/document/d/1?a=1&b=2';
    const p = await load({ tab: tabOf(url, 'My Doc'), hasShare: true });
    shareBtn(p).click();
    await p.flush();
    assert.equal(p.shareCalls.length, 1);
    assert.deepEqual(Object.keys(p.shareCalls[0]), ['url']);
    assert.equal(p.shareCalls[0].url, url);
    assert.deepEqual(p.clipboardWrites, []);
    assert.match(toast(p).textContent, /Shared!/);
    assert.ok(toast(p).classList.contains('visible'));
  });

  it('AbortError is silent: no toast, nothing copied', async () => {
    const p = await load({
      tab: tabOf('https://example.com/'),
      hasShare: true,
      shareImpl: async () => {
        throw errNamed('AbortError');
      },
    });
    shareBtn(p).click();
    await p.flush();
    assert.equal(p.shareCalls.length, 1);
    assert.deepEqual(p.clipboardWrites, []);
    assert.ok(!toast(p).classList.contains('visible'));
  });

  it('a non-abort share error falls back to copying the plain URL', async () => {
    const url = 'https://example.com/a?b=1&c=2';
    const p = await load({
      tab: tabOf(url),
      hasShare: true,
      shareImpl: async () => {
        throw errNamed('NotAllowedError');
      },
    });
    shareBtn(p).click();
    await p.flush();
    assert.deepEqual(p.clipboardWrites, [url]);
    assert.match(toast(p).textContent, /Copied to clipboard!/);
  });

  it('canShare() === false skips the sheet and copies the plain URL', async () => {
    const url = 'https://example.com/x';
    const p = await load({ tab: tabOf(url), hasShare: true });
    p.window.navigator.canShare = () => false;
    shareBtn(p).click();
    await p.flush();
    assert.equal(p.shareCalls.length, 0);
    assert.deepEqual(p.clipboardWrites, [url]);
  });

  it('without navigator.share it copies the plain URL', async () => {
    const url = 'https://example.com/plain';
    const p = await load({ tab: tabOf(url), hasShare: false });
    shareBtn(p).click();
    await p.flush();
    assert.equal(p.shareCalls.length, 0);
    assert.deepEqual(p.clipboardWrites, [url]);
    assert.match(toast(p).textContent, /Copied to clipboard!/);
  });

  it('share failing AND clipboard failing shows the failure toast', async () => {
    const p = await load({
      tab: tabOf('https://example.com/'),
      hasShare: true,
      shareImpl: async () => {
        throw errNamed('NotAllowedError');
      },
      clipboardImpl: async () => {
        throw new Error('denied');
      },
    });
    shareBtn(p).click();
    await p.flush();
    assert.match(toast(p).textContent, /Failed to copy/);
  });

  it('never sends a title, text, files, promo or store link', async () => {
    const p = await load({ tab: tabOf('https://example.com/', 'A Page Title'), hasShare: true });
    shareBtn(p).click();
    await p.flush();
    const payload = p.shareCalls[0];
    assert.ok(!('title' in payload) && !('text' in payload) && !('files' in payload));
    assert.doesNotMatch(JSON.stringify(payload), /Link Hopper|chromewebstore/i);
  });

  it('creates no QR/card instances or downloads', async () => {
    const p = await load({ tab: tabOf('https://example.com/'), hasShare: true });
    const before = p.qrInstances.length;
    shareBtn(p).click();
    await p.flush();
    assert.equal(p.qrInstances.length, before);
    assert.equal(p.anchorClicks.length, 0);
    assert.equal(p.canvases.length, 0);
  });

  it('Copy button still writes only the plain URL and never opens the share sheet', async () => {
    const url = 'https://example.com/plain';
    const p = await load({ tab: tabOf(url), hasShare: true });
    p.document.getElementById('copy-btn').click();
    await p.flush();
    assert.deepEqual(p.clipboardWrites, [url]);
    assert.equal(p.shareCalls.length, 0);
  });
});
