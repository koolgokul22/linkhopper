'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'manifest.json'), 'utf8'));

function crcOf(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf);
  let crc = 0xffffffff;
  for (const b of buf) {
    let c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Tiny ZIP reader: parses the central directory.
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  assert.ok(eocd >= 0, 'end of central directory record found');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    assert.strictEqual(buf.readUInt32LE(off), 0x02014b50);
    const method = buf.readUInt16LE(off + 10);
    const crc = buf.readUInt32LE(off + 16);
    const csize = buf.readUInt32LE(off + 20);
    const usize = buf.readUInt32LE(off + 24);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nlen);
    const lnlen = buf.readUInt16LE(lho + 26);
    const lelen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lnlen + lelen;
    const raw = buf.subarray(start, start + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
    entries.push({ name, crc, csize, usize, data });
    off += 46 + nlen + elen + clen;
  }
  return entries;
}

async function build(outDir) {
  const mod = await import('../scripts/package.mjs');
  return mod.buildZip({ srcDir: path.join(ROOT, 'src'), outDir });
}

test('zip has expected layout and consistent metadata', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-zip-'));
  try {
    const { zipPath } = await build(dir);
    assert.strictEqual(path.basename(zipPath), `link-hopper-v${manifest.version}.zip`);
    const entries = readZip(fs.readFileSync(zipPath));
    const names = entries.map((e) => e.name);
    for (const f of ['manifest.json', 'popup/index.html', 'lib/utils.js',
      'vendor/qr-code-styling.js', 'assets/icon128.png']) {
      assert.ok(names.includes(f), `${f} present`);
    }
    for (const n of names) {
      assert.ok(!n.startsWith('src/'), `${n} has no src/ prefix`);
      assert.ok(!/^(tests|node_modules)\//.test(n), `${n} is not a dev file`);
      assert.ok(!/\.map$|\.DS_Store$|Thumbs\.db$/.test(n), `${n} is junk`);
    }
    assert.deepStrictEqual(names, [...names].sort(), 'sorted order');
    for (const e of entries) {
      assert.strictEqual(e.data.length, e.usize, `${e.name} size`);
      assert.strictEqual(crcOf(e.data), e.crc, `${e.name} crc`);
      const disk = fs.readFileSync(path.join(ROOT, 'src', e.name));
      assert.ok(disk.equals(e.data), `${e.name} content matches source`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('two builds are byte-identical', async () => {
  const a = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-zip-a-'));
  const b = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-zip-b-'));
  try {
    const ra = await build(a);
    await new Promise((r) => setTimeout(r, 1100));
    const rb = await build(b);
    assert.ok(fs.readFileSync(ra.zipPath).equals(fs.readFileSync(rb.zipPath)));
  } finally {
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  }
});

test('fails clearly when manifest is missing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-zip-m-'));
  try {
    const { buildZip } = await import('../scripts/package.mjs');
    assert.throws(() => buildZip({ srcDir: dir, outDir: dir }), /manifest\.json/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('fails when a manifest-referenced file is absent', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-zip-r-'));
  try {
    fs.writeFileSync(path.join(dir, 'manifest.json'),
      JSON.stringify({ name: 'x', version: '1', manifest_version: 3, action: { default_popup: 'nope.html' } }));
    const { buildZip } = await import('../scripts/package.mjs');
    assert.throws(() => buildZip({ srcDir: dir, outDir: dir }), /nope\.html/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('package.json is configured as a private non-library', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.private, true);
  assert.strictEqual(pkg.main, undefined);
  assert.strictEqual(pkg.scripts.package, 'node scripts/package.mjs');
  assert.strictEqual(pkg.engines.node, '>=22');
});
