'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const exists = (rel) => fs.existsSync(path.join(SRC, rel));
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
const html = fs.readFileSync(path.join(SRC, 'popup', 'index.html'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

describe('extension package structure', () => {
  it('manifest is Manifest V3 with a name and version', () => {
    assert.equal(manifest.manifest_version, 3);
    assert.ok(manifest.name);
    assert.match(manifest.version, /^\d+(\.\d+){1,3}$/);
  });

  it('requests exactly the expected permissions (changes must be deliberate)', () => {
    assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'favicon', 'storage']);
    assert.deepEqual(manifest.permissions, ['activeTab', 'favicon', 'storage']);
  });

  it('every file the manifest references exists', () => {
    const refs = [
      manifest.action?.default_popup,
      ...Object.values(manifest.action?.default_icon ?? {}),
      ...Object.values(manifest.icons ?? {}),
    ].filter(Boolean);
    assert.ok(refs.length > 0);
    for (const ref of refs) assert.ok(exists(ref), `missing from src/: ${ref}`);
  });

  it('every script and stylesheet the popup loads exists', () => {
    const refs = [...html.matchAll(/(?:src|href)="(\.[^"]+)"/g)].map((m) => m[1]);
    assert.ok(refs.length >= 4);
    for (const ref of refs) {
      assert.ok(fs.existsSync(path.join(SRC, 'popup', ref)), `popup references missing file: ${ref}`);
    }
  });

  it('utils.js loads before index.js in the popup', () => {
    assert.ok(html.indexOf('lib/utils.js') !== -1);
    assert.ok(html.indexOf('lib/utils.js') < html.indexOf('./index.js'));
  });

  it('card.js loads after utils.js and before index.js in the popup', () => {
    assert.ok(html.indexOf('lib/card.js') !== -1);
    assert.ok(html.indexOf('lib/utils.js') < html.indexOf('lib/card.js'));
    assert.ok(html.indexOf('lib/card.js') < html.indexOf('./index.js'));
  });

  it('popup has no inline scripts (MV3 CSP)', () => {
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  });

  it('package.json version matches the manifest version', () => {
    const norm = (v) => v.split('.').concat(['0', '0']).slice(0, 3).join('.');
    assert.equal(norm(pkg.version), norm(manifest.version));
  });
});
