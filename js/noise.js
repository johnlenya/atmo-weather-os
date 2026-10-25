/* ══════════════════════════════════════════════════════════════════════
   ATMO · js/noise.js
   3D value noise, fBm, seamless equirectangular cloud maps, lightning bolts.
   Classic script — exposes window.ATMO.noise
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const ATMO = (window.ATMO = window.ATMO || {});

  /* ── math helpers ─────────────────────────────────────────────────── */
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ── 32-bit integer hash → [0,1) ──────────────────────────────────── */
  function hash3(x, y, z) {
    let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483629);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967295;
  }

  /* ── 3D value noise with smoothstep interpolation ─────────────────── */
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const w = zf * zf * (3 - 2 * zf);

    const n000 = hash3(xi, yi, zi),         n100 = hash3(xi + 1, yi, zi);
    const n010 = hash3(xi, yi + 1, zi),     n110 = hash3(xi + 1, yi + 1, zi);
    const n001 = hash3(xi, yi, zi + 1),     n101 = hash3(xi + 1, yi, zi + 1);
    const n011 = hash3(xi, yi + 1, zi + 1), n111 = hash3(xi + 1, yi + 1, zi + 1);

    const x00 = lerp(n000, n100, u), x10 = lerp(n010, n110, u);
    const x01 = lerp(n001, n101, u), x11 = lerp(n011, n111, u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
  }

  /* ── fractal brownian motion → [0,1] ──────────────────────────────── */
  function fbm3(x, y, z, octaves, seed) {
    let sum = 0, norm = 0, amp = 0.5, f = 1;
    const s = seed * 13.37;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise3(x * f + s, y * f - s, z * f + s * 0.5);
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  }

  /* ── seamless equirectangular noise map ───────────────────────────────
     Sampling a unit sphere guarantees the map tiles horizontally (and is
     correctly compressed at the poles).                                        */
  function equirectMap(w, h, scale, octaves, seed) {
    const map = new Float32Array(w * h);
    for (let j = 0; j < h; j++) {
      const lat = ((j + 0.5) / h) * Math.PI - Math.PI * 0.5;
      const cl = Math.cos(lat), sl = Math.sin(lat);
      for (let i = 0; i < w; i++) {
        const lon = ((i + 0.5) / w) * Math.PI * 2;
        map[j * w + i] = fbm3(
          cl * Math.cos(lon) * scale,
          sl * scale,
          cl * Math.sin(lon) * scale,
          octaves, seed
        );
      }
    }
    return map;
  }

  /* ── procedural lightning bolt (recursive midpoint displacement) ───── */
  function bolt(segments, spread, jitter) {
    // returns normalised [0..1] x/y polyline from top-ish to bottom-ish
    let pts = [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }];
    let off = spread;
    for (let pass = 0; pass < segments; pass++) {
      const next = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const mx = (a.x + b.x) * 0.5 + (Math.random() - 0.5) * off;
        const my = (a.y + b.y) * 0.5 + (Math.random() - 0.5) * off * jitter;
        next.push({ x: mx, y: my }, b);
      }
      pts = next;
      off *= 0.52;
    }
    return pts;
  }

  /* fork: a shorter branch growing off a point of the main bolt */
  function fork(boltPts, at) {
    const idx = Math.floor(at * (boltPts.length - 1));
    const origin = boltPts[idx];
    let pts = [{ x: origin.x, y: origin.y }, { x: origin.x + (Math.random() - 0.5) * 0.3, y: 1 }];
    let off = 0.09;
    for (let pass = 0; pass < 4; pass++) {
      const next = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        next.push({
          x: (a.x + b.x) * 0.5 + (Math.random() - 0.5) * off,
          y: (a.y + b.y) * 0.5 + (Math.random() - 0.5) * off
        }, b);
      }
      pts = next;
      off *= 0.5;
    }
    return pts;
  }

  ATMO.noise = { hash3, noise3, fbm3, equirectMap, bolt, fork, clamp01, lerp };
})();