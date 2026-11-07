'use strict';
/* Recording fakes for CanvasRenderingContext2D / HTMLCanvasElement (no real canvas in jsdom). */

function createFakeContext(measure = (s) => s.length * 10, { throwOnDrawImage } = {}) {
  const calls = [];
  const state = { fillStyle: '#000000', strokeStyle: '#000000', font: '10px sans-serif', textAlign: 'start' };
  const ctx = new Proxy(state, {
    get(t, p) {
      if (p === 'calls') return calls;
      if (p in t) return t[p];
      if (p === 'measureText') return (s) => ({ width: measure(String(s)) });
      if (p === 'createLinearGradient') {
        return (...args) => {
          const g = { args, stops: [], addColorStop: (o, c) => g.stops.push([o, c]) };
          calls.push({ op: 'createLinearGradient', args, gradient: g, fillStyle: t.fillStyle, font: t.font, textAlign: t.textAlign });
          return g;
        };
      }
      if (p === 'drawImage') {
        return (...args) => {
          if (throwOnDrawImage && throwOnDrawImage(args[0])) throw new Error('fake drawImage failure');
          calls.push({ op: 'drawImage', args, fillStyle: t.fillStyle, font: t.font, textAlign: t.textAlign });
        };
      }
      return (...args) => {
        calls.push({ op: String(p), args, fillStyle: t.fillStyle, font: t.font, textAlign: t.textAlign });
      };
    },
    set(t, p, v) {
      t[p] = v;
      return true;
    },
  });
  return ctx;
}

function createFakeCanvas({ nullBlob = false, noContext = false, BlobCtor = Blob, measure, throwOnDrawImage } = {}) {
  const ctx = createFakeContext(measure, { throwOnDrawImage });
  return {
    width: 0,
    height: 0,
    ctx,
    toBlobCalls: [],
    getContext() {
      return noContext ? null : ctx;
    },
    toBlob(cb, type) {
      this.toBlobCalls.push(type);
      cb(nullBlob ? null : new BlobCtor(['png'], { type }));
    },
  };
}

const textsOf = (ctx) => ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);

module.exports = { createFakeContext, createFakeCanvas, textsOf };
