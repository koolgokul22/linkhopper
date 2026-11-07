#!/usr/bin/env node
// Builds dist/link-hopper-v<version>.zip from the contents of src/.
// Pure Node, no dependencies. Deterministic: sorted entries, fixed timestamps.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXCLUDE = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$|\.map$|~$/;
// Fixed DOS timestamp: 1980-01-01 00:00:00
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

let crcTable;
function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf);
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function walk(dir, base = '') {
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${d.name}` : d.name;
    if (d.isDirectory()) out.push(...walk(path.join(dir, d.name), rel));
    else if (d.isFile() && !EXCLUDE.test(rel)) out.push(rel);
  }
  return out;
}

function referencedFiles(m) {
  const refs = new Set();
  const add = (v) => { if (typeof v === 'string') refs.add(v); };
  const addAll = (o) => { if (o && typeof o === 'object') Object.values(o).forEach(add); };
  add(m.action?.default_popup);
  add(m.browser_action?.default_popup);
  add(m.options_page);
  add(m.options_ui?.page);
  add(m.background?.service_worker);
  add(m.side_panel?.default_path);
  addAll(m.icons);
  for (const k of ['action', 'browser_action']) {
    const di = m[k]?.default_icon;
    if (typeof di === 'string') add(di);
    else addAll(di);
  }
  for (const cs of m.content_scripts ?? []) {
    (cs.js ?? []).forEach(add);
    (cs.css ?? []).forEach(add);
  }
  return [...refs];
}

export function buildZip({ srcDir = path.join(ROOT, 'src'), outDir = path.join(ROOT, 'dist') } = {}) {
  const manifestPath = path.join(srcDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`manifest.json not found at ${manifestPath}`);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    throw new Error(`manifest.json is not valid JSON: ${e.message}`);
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    throw new Error('manifest.json has no string "version" field');
  }
  for (const ref of referencedFiles(manifest)) {
    if (!fs.existsSync(path.join(srcDir, ref))) {
      throw new Error(`manifest.json references missing file: ${ref}`);
    }
  }

  const files = walk(srcDir).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const rel of files) {
    const data = fs.readFileSync(path.join(srcDir, rel));
    const name = Buffer.from(rel, 'utf8');
    const crc = crc32(data);
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // UTF-8 names
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(DOS_TIME, 10);
    lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE((3 << 8) | 20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(DOS_TIME, 12);
    ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    ch.writeUInt32LE(offset, 42);

    locals.push(lh, name, body);
    centrals.push(ch, name);
    offset += lh.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);

  const zip = Buffer.concat([...locals, cd, end]);
  fs.mkdirSync(outDir, { recursive: true });
  const zipPath = path.join(outDir, `link-hopper-v${manifest.version}.zip`);
  fs.writeFileSync(zipPath, zip);
  return { zipPath, size: zip.length, files, version: manifest.version };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { zipPath, size, files } = buildZip();
    console.log(`Created ${path.relative(process.cwd(), zipPath)} (${size} bytes, ${files.length} files)`);
  } catch (e) {
    console.error(`package failed: ${e.message}`);
    process.exit(1);
  }
}
