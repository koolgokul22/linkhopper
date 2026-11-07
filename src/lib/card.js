(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LinkHopperCard = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ELLIPSIS = '…';
  const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  /**
   * Wrap text into at most maxLines lines no wider than maxWidth (per the injected measure()).
   * Breaks at spaces when possible, at any character when a token is too long, and ends the
   * last line with an ellipsis when the text does not fit.
   */
  function fitText(measure, text, maxWidth, maxLines) {
    if (typeof text !== 'string' || !(maxLines >= 1)) return [];
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return [];

    const lines = [];
    let cur = '';
    for (const word of clean.split(' ')) {
      const candidate = cur ? cur + ' ' + word : word;
      if (measure(candidate) <= maxWidth) {
        cur = candidate;
        continue;
      }
      if (cur) {
        lines.push(cur);
        cur = '';
      }
      if (measure(word) <= maxWidth) {
        cur = word;
        continue;
      }
      for (const ch of word) {
        if (cur === '' || measure(cur + ch) <= maxWidth) {
          cur += ch;
        } else {
          lines.push(cur);
          cur = ch;
        }
      }
    }
    if (cur) lines.push(cur);

    if (lines.length <= maxLines) return lines;
    const out = lines.slice(0, maxLines);
    let last = out[maxLines - 1];
    while (last && measure(last + ELLIPSIS) > maxWidth) last = last.slice(0, -1);
    out[maxLines - 1] = last.trimEnd() + ELLIPSIS;
    return out;
  }

  // Palettes live in utils.js (loaded first in the popup, required in Node).
  const utils = typeof module === 'object' && module.exports ? require('./utils.js') : self.LinkHopperUtils;

  // Maps a site palette's light/dark variant onto the card's drawing tokens. The page background
  // is the darker "base"; tiles use the lighter "surface" so they read as raised.
  function getCardTheme(theme, palette) {
    const p = palette && typeof palette === 'object' && palette.light ? palette : utils.PALETTES[0];
    const v = theme === 'dark' ? p.dark : p.light;
    return {
      bg: v.base,
      bgFrom: v.base,
      bgTo: v.baseEnd,
      text: v.text,
      subtext: v.muted,
      caption: v.muted,
      border: v.border,
      tile: v.surface,
      headerTile: v.surface,
      iconBack: v.iconBack,
      accent: v.accent,
      shadow: v.shadow,
      qrTile: '#ffffff',
      badgeText: v.badgeText,
    };
  }

  const p2 = (n) => String(n).padStart(2, '0');

  // <website>_<YYYYMMDD>-<HHMMSS>.png in local time; the clock is injectable for tests.
  function cardBaseName(siteName, date = new Date()) {
    const clean =
      typeof siteName === 'string'
        ? siteName
            .toLowerCase()
            .replace(/[^a-z0-9.-]+/g, '-')
            .replace(/^-+|-+$/g, '')
        : '';
    const stamp =
      `${date.getFullYear()}${p2(date.getMonth() + 1)}${p2(date.getDate())}` +
      `-${p2(date.getHours())}${p2(date.getMinutes())}${p2(date.getSeconds())}`;
    return `${clean || 'qr'}_${stamp}`;
  }

  function cardFilename(siteName, date = new Date()) {
    return `${cardBaseName(siteName, date)}.png`;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  }

  const W = 1200;
  const PAD = 56;
  const GAP = 24;
  const RADIUS = 44;
  const HEADER_H = 152;
  const SLOT = 96;
  const FAV = 64;
  const QR_PAD = 56;
  const T_PAD = 40;
  const URL_FONT = 30;
  const URL_LH = 42;
  const URL_LINES = 6;

  /**
   * Pure bento geometry: header tile, square QR tile and one full-width URL tile sized to
   * its line count. Returns tile rects, the URL text width, tile padding and canvas height.
   */
  function bentoLayout({ urlLineCount }) {
    const inner = W - 2 * PAD;
    const header = { x: PAD, y: PAD, w: inner, h: HEADER_H };
    const qr = { x: PAD, y: header.y + HEADER_H + GAP, w: inner, h: inner };
    const urlY = qr.y + qr.h + GAP;
    const urlTile = { x: PAD, y: urlY, w: inner, h: T_PAD * 2 + Math.max(1, urlLineCount) * URL_LH };
    return { header, qr, urlTile, pad: T_PAD, textW: inner - 2 * T_PAD, height: urlY + urlTile.h + PAD };
  }

  async function renderCard({ qrBitmap, favicon, siteName, url, theme, palette, initial, createCanvas }) {
    const canvas = createCanvas ? createCanvas() : document.createElement('canvas');
    canvas.width = W;
    canvas.height = 1;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    const t = getCardTheme(theme, palette);
    const measure = (s) => ctx.measureText(s).width;

    // --- Layout (measure first, then size the canvas) ---
    const nameX = PAD + 28 + SLOT + 28;
    ctx.font = `700 56px ${FONT_STACK}`;
    const nameLine = fitText(measure, siteName, W - PAD - 28 - nameX, 1)[0] || '';
    const probe = bentoLayout({ urlLineCount: 1 });
    ctx.font = `400 ${URL_FONT}px ${FONT_STACK}`;
    const urlLines = fitText(measure, url, probe.textW, URL_LINES);
    const L = bentoLayout({ urlLineCount: urlLines.length });

    canvas.width = W;
    canvas.height = L.height;

    // --- Draw ---
    ctx.fillStyle = t.bg; // opaque base; the soft diagonal gradient goes on top
    ctx.fillRect(0, 0, W, L.height);
    const grad = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, W, L.height) : null;
    if (grad && typeof grad.addColorStop === 'function') {
      grad.addColorStop(0, t.bgFrom);
      grad.addColorStop(1, t.bgTo);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, L.height);
    }

    const tile = (r, fill) => {
      ctx.save();
      ctx.shadowColor = t.shadow;
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 8;
      roundRectPath(ctx, r.x, r.y, r.w, r.h, RADIUS);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
      roundRectPath(ctx, r.x, r.y, r.w, r.h, RADIUS);
      ctx.strokeStyle = t.border;
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    // Header tile: icon slot + site name
    const H = L.header;
    tile(H, t.headerTile);
    const sx = H.x + 28;
    const sy = H.y + (H.h - SLOT) / 2;
    let iconDrawn = false;
    if (favicon) {
      let saved = false;
      try {
        ctx.save();
        saved = true;
        roundRectPath(ctx, sx, sy, SLOT, SLOT, 24);
        ctx.fillStyle = t.iconBack;
        ctx.fill();
        ctx.clip();
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(favicon, sx + (SLOT - FAV) / 2, sy + (SLOT - FAV) / 2, FAV, FAV);
        iconDrawn = true;
      } catch (err) {
        iconDrawn = false;
      }
      if (saved) ctx.restore();
    }
    if (!iconDrawn) {
      ctx.fillStyle = t.accent;
      ctx.beginPath();
      ctx.arc(sx + SLOT / 2, sy + SLOT / 2, SLOT / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = t.badgeText;
      ctx.font = `700 52px ${FONT_STACK}`;
      ctx.fillText(initial, sx + SLOT / 2, sy + SLOT / 2 + 2);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = t.text;
    ctx.font = `700 56px ${FONT_STACK}`;
    ctx.fillText(nameLine, nameX, H.y + H.h / 2);

    // QR tile (always white)
    const Q = L.qr;
    tile(Q, t.qrTile);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(qrBitmap, Q.x + QR_PAD, Q.y + QR_PAD, Q.w - 2 * QR_PAD, Q.h - 2 * QR_PAD);

    // URL tile (full width)
    const U = L.urlTile;
    tile(U, t.tile);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = t.subtext;
    ctx.font = `400 ${URL_FONT}px ${FONT_STACK}`;
    urlLines.forEach((line, i) => ctx.fillText(line, U.x + T_PAD, U.y + T_PAD + URL_LH / 2 + i * URL_LH));

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas produced no image'))), 'image/png');
    });
  }

  return { fitText, getCardTheme, cardFilename, cardBaseName, bentoLayout, renderCard };
});
