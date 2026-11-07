(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LinkHopperUtils = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const QR_LIMITS = Object.freeze({ warn: 800, max: 2000 });

  function parse(url) {
    if (typeof url !== 'string' || url === '') return null;
    try {
      return new URL(url);
    } catch (e) {
      return null;
    }
  }

  function isSupportedUrl(url) {
    const u = parse(url);
    return !!u && (u.protocol === 'http:' || u.protocol === 'https:');
  }

  function extractWebsiteName(url) {
    const u = parse(url);
    if (!u || !u.hostname) return 'Unknown';
    const host = u.hostname;
    if (host.startsWith('www.') && host.length > 4) return host.slice(4);
    return host;
  }

  function getQrUrlStatus(url) {
    if (typeof url !== 'string') return 'too-long';
    if (url.length <= QR_LIMITS.warn) return 'ok';
    if (url.length <= QR_LIMITS.max) return 'long';
    return 'too-long';
  }

  function getSiteInitial(siteName) {
    const m = typeof siteName === 'string' ? siteName.match(/[a-z0-9]/i) : null;
    return m ? m[0].toUpperCase() : '?';
  }

  function hashSite(siteName) {
    const str = typeof siteName === 'string' ? siteName : '';
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
  }

  function hexToRgb(hex) {
    const m = typeof hex === 'string' ? hex.trim().match(/^#?([0-9a-f]{6})$/i) : null;
    if (!m) return [0, 0, 0];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // WCAG 2 contrast ratio between two #rrggbb colours (1..21).
  function contrastRatio(hexA, hexB) {
    const a = luminance(hexA);
    const b = luminance(hexB);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  // h in degrees, s and l in percent -> lowercase #rrggbb.
  function hslToHex(h, s, l) {
    const hh = ((((Number(h) || 0) % 360) + 360) % 360) / 360;
    const ss = Math.min(1, Math.max(0, (Number(s) || 0) / 100));
    const ll = Math.min(1, Math.max(0, (Number(l) || 0) / 100));
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    const chan = (t) => {
      t = ((t % 1) + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const hex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
    return '#' + hex(chan(hh + 1 / 3)) + hex(chan(hh)) + hex(chan(hh - 1 / 3));
  }

  const QR_MIN_CONTRAST = 7;

  // [id, name, hue, saturation, light-theme accent lightness]. Soft, low-saturation colours:
  // text >= 10:1 and accents >= 4.5:1 on their surfaces; QR dots >= 7:1 on white.
  const PALETTE_SPECS = [
    ['ocean', 'Ocean', 214, 45, 36],
    ['lagoon', 'Lagoon', 178, 42, 29],
    ['forest', 'Forest', 148, 36, 29],
    ['olive', 'Olive', 86, 34, 29],
    ['honey', 'Honey', 38, 60, 29],
    ['terracotta', 'Terracotta', 15, 48, 36],
    ['rose', 'Rose', 346, 45, 36],
    ['plum', 'Plum', 298, 32, 36],
    ['indigo', 'Indigo', 253, 42, 36],
    ['graphite', 'Graphite', 215, 12, 36],
  ];

  function buildPalette([id, name, h, s, accL]) {
    const H = (sat, l) => hslToHex(h, sat, l);
    return Object.freeze({
      id,
      name,
      hue: h,
      // base = page background, surface = raised tile on top of it.
      light: Object.freeze({
        base: H(s, 89),
        baseEnd: H(s, 85),
        surface: H(s, 94),
        border: H(s, 82),
        text: H(s, 14),
        muted: H(s, 26),
        accent: H(s + 8, accL),
        badgeText: '#ffffff',
        iconBack: '#ffffff',
        shadow: `hsla(${h}, ${s}%, 18%, 0.22)`,
      }),
      dark: Object.freeze({
        base: H(s * 0.6, 12),
        baseEnd: H(s * 0.6, 9),
        surface: H(s * 0.55, 18),
        border: H(s * 0.5, 26),
        text: H(s, 92),
        muted: H(s, 78),
        accent: H(s + 15, 72),
        badgeText: H(s * 0.6, 12),
        iconBack: H(s * 0.5, 26),
        shadow: 'hsla(0, 0%, 0%, 0.5)',
      }),
      dots: H(Math.min(s + 25, 70), 21),
    });
  }

  const PALETTES = Object.freeze(PALETTE_SPECS.map(buildPalette));

  // Stable: the same site always gets the same palette.
  function getSitePalette(siteName) {
    return PALETTES[hashSite(siteName) % PALETTES.length];
  }

  // Dark dots on pure white (>= 7:1) so cameras read it; near-black if a palette ever fails.
  function getQrPalette(palette) {
    const p = palette && typeof palette === 'object' && palette.dots ? palette : PALETTES[0];
    const dots = contrastRatio(p.dots, '#ffffff') >= QR_MIN_CONTRAST ? p.dots : '#111111';
    return { dots, corners: dots, background: '#ffffff' };
  }

  return {
    isSupportedUrl,
    extractWebsiteName,
    QR_LIMITS,
    getQrUrlStatus,
    getSiteInitial,
    contrastRatio,
    hslToHex,
    PALETTES,
    getSitePalette,
    getQrPalette,
  };
});
