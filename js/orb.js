/* ══════════════════════════════════════════════════════════════════════
   ATMO · js/orb.js
   The morphing atmosphere orb.

     · per-pixel sphere shading   — rotating volumetric clouds from a
       seamless equirect noise map, sweeping terminator, limb atmosphere,
       holographic lat/long grid
     · state morphs               — glowing star (clear) · marble (cloudy) ·
       liquid glass with ripples (rain) · plasma filaments (storm)
     · overlays at full device res — rain streaks, procedural lightning
       bolts and a global flash

   The globe occupies radius GLOBE (0.8) of the –1…1 shader space so the
   remaining margin can carry the atmosphere halo and corona rays.

   Classic script — exposes window.ATMO.Orb
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const ATMO = (window.ATMO = window.ATMO || {});
  const N = ATMO.noise;

  const MAP1_W = 256, MAP1_H = 128;
  const MAP2_W = 192, MAP2_H = 96;
  const GLOBE = 0.80, GINV = 1 / GLOBE;

  /* bilinear fetch with horizontal wrap and vertical clamp */
  function smp(map, MW, MH, u, v) {
    u -= Math.floor(u);
    if (v < 0) v = 0; else if (v > 0.99999) v = 0.99999;
    const fx = u * MW - 0.5, fy = v * MH - 0.5;
    let x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    let x1 = x0 + 1, y1 = y0 + 1;
    if (x0 < 0) x0 += MW; else if (x0 >= MW) x0 -= MW;
    if (x1 >= MW) x1 -= MW;
    if (y0 < 0) y0 = 0;
    if (y1 >= MH) y1 = MH - 1;
    const r0 = y0 * MW, r1 = y1 * MW;
    const ab = map[r0 + x0] + (map[r0 + x1] - map[r0 + x0]) * tx;
    const cd = map[r1 + x0] + (map[r1 + x1] - map[r1 + x0]) * tx;
    return ab + (cd - ab) * ty;
  }

  /* ── state palettes ───────────────────────────────────────────────── */
  const PALETTES = {
    clear: {
      deep: [46, 26, 4], base: [255, 196, 64], cloud: [255, 248, 220],
      cloudCover: 0.22, threshold: 0.55, scroll: 0.0045,
      spec: 0.62, specRGB: [255, 252, 232],
      rim: [255, 235, 150], rimStrength: 0.45, grid: 0.30,
      plasma: 0, ripple: 0, rays: 0.85,
      corona: [255, 200, 40], coronaStrength: 0.46,
      flashRGB: [255, 246, 222], lightning: 0, rain: 0,
      glow: 'rgba(255,205,60,.42)', tempGlow: 'rgba(255,215,80,.42)',
      halo: 'rgba(255,205,60,.20)',
      blobA: 'rgba(255,235,0,.26)', blobB: 'rgba(0,229,255,.14)', blobC: 'rgba(139,92,255,.14)'
    },
    cloudy: {
      deep: [30, 38, 50], base: [152, 174, 200], cloud: [236, 243, 251],
      cloudCover: 0.94, threshold: 0.44, scroll: 0.0060,
      spec: 0.30, specRGB: [235, 244, 255],
      rim: [170, 200, 230], rimStrength: 0.35, grid: 0.34,
      plasma: 0, ripple: 0, rays: 0.12,
      corona: [150, 190, 230], coronaStrength: 0.28,
      flashRGB: [232, 240, 255], lightning: 0, rain: 0,
      glow: 'rgba(150,190,235,.30)', tempGlow: 'rgba(185,215,245,.32)',
      halo: 'rgba(120,170,220,.18)',
      blobA: 'rgba(120,170,220,.18)', blobB: 'rgba(0,229,255,.16)', blobC: 'rgba(139,92,255,.16)'
    },
    rain: {
      deep: [8, 20, 36], base: [64, 126, 188], cloud: [198, 226, 255],
      cloudCover: 1.0, threshold: 0.38, scroll: 0.0075,
      spec: 0.80, specRGB: [220, 240, 255],
      rim: [90, 190, 255], rimStrength: 0.55, grid: 0.33,
      plasma: 0, ripple: 1, rays: 0.32,
      corona: [70, 170, 255], coronaStrength: 0.36,
      flashRGB: [226, 240, 255], lightning: 0.4, rain: 160,
      glow: 'rgba(60,150,255,.36)', tempGlow: 'rgba(120,200,255,.34)',
      halo: 'rgba(0,140,255,.20)',
      blobA: 'rgba(0,229,255,.22)', blobB: 'rgba(0,140,255,.22)', blobC: 'rgba(139,92,255,.16)'
    },
    storm: {
      deep: [14, 6, 28], base: [86, 48, 142], cloud: [152, 134, 202],
      cloudCover: 1.0, threshold: 0.34, scroll: 0.0105,
      spec: 0.34, specRGB: [200, 180, 255],
      rim: [175, 90, 255], rimStrength: 0.62, grid: 0.38,
      plasma: 1, ripple: 0.5, rays: 0.8,
      corona: [170, 70, 255], coronaStrength: 0.48,
      flashRGB: [246, 236, 255], lightning: 2.8, rain: 230,
      glow: 'rgba(150,70,255,.38)', tempGlow: 'rgba(255,235,0,.34)',
      halo: 'rgba(150,70,255,.22)',
      blobA: 'rgba(139,92,255,.24)', blobB: 'rgba(0,229,255,.18)', blobC: 'rgba(255,235,0,.13)'
    }
  };

  class Orb {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.off = document.createElement('canvas');
      this.offCtx = this.off.getContext('2d');
      this.levels = [340, 300, 264, 232];
      this.level = 0;
      this.res = this.levels[0];
      this._shadeAcc = 0;
      this.t = 0;
      this.flash = 0;
      this.second = 0;
      this.nextStrike = 1.2;
      this.bolts = [];
      this.rain = [];
      this.windX = 0.30;
      this.state = 'clear';
      this.stats = { acc: 0, frames: 0 };
      this._rip = [
        { x: -0.34, y: 0.22, sp: 0.9 },
        { x: 0.38, y: -0.28, sp: 1.15 },
        { x: 0.06, y: 0.46, sp: 1.4 }
      ];
      this.mapsReady = false;
      this._raf = null;
      this._last = 0;
      this.onFrameExtra = null;
      this.applyPalette(PALETTES.clear);
    }

    /* ── heavy one-time noise generation ───────────────────────────── */
    buildMaps() {
      if (this.mapsReady) return;
      this.cloudMap = N.equirectMap(MAP1_W, MAP1_H, 3.1, 5, 7);
      this.detailMap = N.equirectMap(MAP2_W, MAP2_H, 6.7, 4, 23);
      this.mapsReady = true;
      this.resize();
    }

    applyPalette(p) {
      this.pal = p;
      this.deep = p.deep.slice(); this.base = p.base.slice(); this.cloud = p.cloud.slice();
      this.rim = p.rim.slice(); this.corona = p.corona.slice();
      this.specRGB = p.specRGB.slice(); this.flashRGB = p.flashRGB.slice();
    }

    setState(name) {
      if (!PALETTES[name] || this.state === name) return;
      this.state = name;
      this.applyPalette(PALETTES[name]);
      const want = PALETTES[name].rain;
      while (this.rain.length < want) this.rain.push(this._newDrop(true));
      if (this.rain.length > want) this.rain.length = want;
      if (PALETTES[name].lightning > 0 && this.nextStrike > 0.35) this.nextStrike = 0.35;
    }

    palette() { return PALETTES[this.state]; }

    /* ── geometry: precompute everything constant per pixel ─────────── */
    resize() {
      if (!this.mapsReady) return;
      const res = this.res;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = this.canvas.clientWidth || 380;
      this.canvas.width = Math.round(cssW * dpr);
      this.canvas.height = Math.round(cssW * dpr);
      this.mw = this.canvas.width;
      this.mh = this.canvas.height;

      this.off.width = res; this.off.height = res;
      this.imgData = this.offCtx.createImageData(res, res);

      const total = res * res;
      this.nzArr = new Float32Array(total);
      this.uArr = new Float32Array(total);
      this.vArr = new Float32Array(total);
      this.gvArr = new Float32Array(total);

      for (let y = 0; y < res; y++) {
        const ny = (((y + 0.5) / res) * 2 - 1) * GINV, ny2 = ny * ny;
        for (let x = 0; x < res; x++) {
          const nx = (((x + 0.5) / res) * 2 - 1) * GINV;
          const i = y * res + x;
          const d2 = nx * nx + ny2;
          if (d2 > 1) { this.nzArr[i] = -1; continue; }
          const z = Math.sqrt(1 - d2);
          // head-on view of a sphere: the visible hemisphere spans
          // lon ∈ (-90°, 90°) and lat ∈ (-90°, 90°)
          const lon = Math.atan2(nx, z);
          const lat = Math.asin(ny < -1 ? -1 : ny > 1 ? 1 : ny);
          this.nzArr[i] = z;
          this.uArr[i] = lon / (Math.PI * 2) + 0.5;
          this.vArr[i] = 0.5 - lat / Math.PI;
          this.gvArr[i] = Math.abs(Math.sin(this.vArr[i] * Math.PI * 7));
        }
      }
      this.stats.acc = 0; this.stats.frames = 0;
    }

    /* ── particles ─────────────────────────────────────────────────── */
    _newDrop(anywhere) {
      return {
        x: Math.random() * 1.7 - 0.85,
        y: anywhere ? Math.random() * 1.7 - 0.85 : -0.9 - Math.random() * 0.4,
        vy: 0.9 + Math.random() * 0.9,
        vx: this.windX * (0.4 + Math.random() * 0.5),
        len: 0.045 + Math.random() * 0.085,
        a: 0.16 + Math.random() * 0.42
      };
    }

    _strike() {
      const main = N.bolt(5, 0.36, 0.85);
      const forks = [];
      const nF = Math.random() < 0.45 ? 2 : 1;
      for (let i = 0; i < nF; i++) forks.push(N.fork(main, 0.25 + Math.random() * 0.45));
      this.bolts.push({ main, forks, life: 0.44, ttl: 0.44, x: (Math.random() - 0.5) * 0.9 });
      this.flash = 1;
      if (Math.random() < 0.35) this.second = 0.075;
    }

    /* ── the sphere shader ─────────────────────────────────────────── */
    _shade() {
      const P = this.pal;
      const res = this.res, W = res, H = res;
      const data = this.imgData.data;
      const nzA = this.nzArr, uA = this.uArr, vA = this.vArr, gvA = this.gvArr;
      const m1 = this.cloudMap, m2 = this.detailMap;
      const t = this.t;

      const scroll1 = (t * P.scroll) % 1;
      const scroll2 = ((t * P.scroll * 1.4) % 1);

      // sweeping light
      const la = t * 0.15 + 0.6;
      let Lx = Math.cos(la) * 0.86, Ly = -0.30, Lz = Math.sin(la) * 0.5 + 0.5;
      const inv = 1 / Math.sqrt(Lx * Lx + Ly * Ly + Lz * Lz);
      Lx *= inv; Ly *= inv; Lz *= inv;

      const dR = this.deep[0], dG = this.deep[1], dB = this.deep[2];
      const bR = this.base[0], bG = this.base[1], bB = this.base[2];
      const cR0 = this.cloud[0], cG0 = this.cloud[1], cB0 = this.cloud[2];
      const rR = this.rim[0], rG = this.rim[1], rB = this.rim[2];
      const sR = this.specRGB[0], sG = this.specRGB[1], sB = this.specRGB[2];
      const coR = this.corona[0], coG = this.corona[1], coB = this.corona[2];
      const fR = this.flashRGB[0], fG = this.flashRGB[1], fB = this.flashRGB[2];

      const cov = P.cloudCover, thr = P.threshold;
      const plasma = P.plasma, ripple = P.ripple, spec = P.spec;
      const gridA = P.grid, rimS = P.rimStrength, rays = P.rays, cSt = P.coronaStrength;
      const flash = this.flash;

      const rip = this._rip;
      const rx0 = rip[0].x, ry0 = rip[0].y;
      const rx1 = rip[1].x, ry1 = rip[1].y;
      const rx2 = rip[2].x, ry2 = rip[2].y;

      let p = 0;
      for (let y = 0; y < H; y++) {
        const ry = (((y + 0.5) / H) * 2 - 1) * GINV, ry2 = ry * ry;
        for (let x = 0; x < W; x++, p++) {
          const rx = (((x + 0.5) / W) * 2 - 1) * GINV;
          const d2 = rx * rx + ry2;

          /* ── outside the limb: atmosphere halo + corona rays ─────── */
          if (d2 > 1) {
            let a = 1 - (Math.sqrt(d2) - 1) * 2.1;
            if (a <= 0) { data[p * 4 + 3] = 0; continue; }
            a *= a;
            let rr = Math.atan2(ry, rx) / Math.PI * 9 + t * 0.22;
            rr -= Math.floor(rr);
            rr = Math.abs(rr * 2 - 1);
            const rayMix = 1 - rays + rays * (0.30 + 0.70 * rr);
            data[p * 4] = coR;
            data[p * 4 + 1] = coG;
            data[p * 4 + 2] = coB;
            data[p * 4 + 3] = a * rayMix * cSt * 255;
            continue;
          }

          const z = nzA[p];
          let diff = rx * Lx + ry * Ly + z * Lz;
          if (diff < 0) diff = 0;
          let lam = 0.17 + 0.83 * diff;
          lam *= 1.07 - 0.07 * lam;

          /* volumetric clouds */
          let u1 = uA[p] + scroll1; u1 -= Math.floor(u1);
          let u2 = uA[p] + scroll2 + 0.37; u2 -= Math.floor(u2);
          const v = vA[p];
          let cl = smp(m1, MAP1_W, MAP1_H, u1, v) * 0.70 + smp(m2, MAP2_W, MAP2_H, u2, v) * 0.46;
          cl = cl * cl * (3 - 2 * cl);
          let cf = (cl - thr) * 2.7;
          if (cf < 0) cf = 0; else if (cf > 1) cf = 1;
          cf = cf * cf * (3 - 2 * cf) * cov;

          /* body */
          let r = dR + (bR - dR) * lam;
          let g = dG + (bG - dG) * lam;
          let b = dB + (bB - dB) * lam;

          /* limb atmosphere */
          const limb = 1 - z * z * z;
          r += rR * limb * rimS; g += rG * limb * rimS; b += rB * limb * rimS;

          /* clouds lit from the same direction */
          let cAmt = cf * (0.45 + 0.75 * diff);
          if (cAmt > 1) cAmt = 1;
          const cLit = 0.22 + 0.95 * diff;
          r = r * (1 - cAmt) + cR0 * cLit * cAmt;
          g = g * (1 - cAmt) + cG0 * cLit * cAmt;
          b = b * (1 - cAmt) + cB0 * cLit * cAmt;

          /* specular sheen */
          const d4 = diff * diff * diff * diff;
          const sp = d4 * d4 * d4 * d4 * spec;
          r += sR * sp; g += sG * sp; b += sB * sp;

          /* plasma filaments — storm */
          if (plasma > 0) {
            let u3 = uA[p] * 3.17 + 0.11 - t * 0.055; u3 -= Math.floor(u3);
            let v3 = vA[p] * 1.9 + t * 0.012; if (v3 > 0.9999) v3 -= 0.9999;
            const n3 = smp(m2, MAP2_W, MAP2_H, u3, v3);
            let fil = (n3 - 0.44) * 3.6;
            if (fil < 0) fil = 0; else if (fil > 1) fil = 1;
            let ph = n3 * 7 + t * 2.1; ph -= Math.floor(ph); ph = Math.abs(ph * 2 - 1);
            const amp = fil * (0.26 + 0.9 * ph) * plasma;
            let hb = uA[p] * 4.2 + 0.3; hb -= Math.floor(hb); hb = Math.abs(hb * 2 - 1);
            r += (255 * hb + 150 * (1 - hb)) * amp;
            g += (238 * hb + 70 * (1 - hb)) * amp;
            b += (30 * hb + 255 * (1 - hb)) * amp;
          }

          /* liquid ripples — rain */
          if (ripple > 0) {
            let rp = 0, dx, dy, q, ph;
            dx = rx - rx0; dy = ry - ry0; q = dx * dx + dy * dy;
            ph = q * 5.2 - t * 1.45; ph -= Math.floor(ph); ph = Math.abs(ph * 2 - 1);
            rp += ph * ph * ph / (1 + q * 3.1);
            dx = rx - rx1; dy = ry - ry1; q = dx * dx + dy * dy;
            ph = q * 5.2 - t * 1.75 + 0.35; ph -= Math.floor(ph); ph = Math.abs(ph * 2 - 1);
            rp += ph * ph * ph / (1 + q * 3.1);
            dx = rx - rx2; dy = ry - ry2; q = dx * dx + dy * dy;
            ph = q * 5.2 - t * 2.05 + 0.7; ph -= Math.floor(ph); ph = Math.abs(ph * 2 - 1);
            rp += ph * ph * ph / (1 + q * 3.1);
            rp *= ripple * 0.62;
            r += 180 * rp; g += 225 * rp; b += 255 * rp;
          }

          /* holographic grid */
          if (gridA > 0) {
            let gu = u1 * 18; gu -= Math.floor(gu); gu = Math.abs(gu * 2 - 1);
            const gv = gvA[p];
            const gm = gv > gu ? gv : gu;
            if (gm > 0.955) {
              const gi = (gm - 0.955) / 0.045;
              const ga = gi * gi * gridA * (1 - cf * 0.8) * (0.22 + 0.78 * diff);
              g += 208 * ga; b += 255 * ga;
            }
          }

          /* lightning wash */
          if (flash > 0.002) {
            const fw = flash * (0.5 + 0.7 * cf);
            r += fR * fw; g += fG * fw; b += fB * fw;
          }

          data[p * 4] = r > 255 ? 255 : r;
          data[p * 4 + 1] = g > 255 ? 255 : g;
          data[p * 4 + 2] = b > 255 ? 255 : b;
          // tight rim falloff so the globe melts into its own halo
          const af = 1 - limb * limb * limb * 0.45;
          data[p * 4 + 3] = 255 * af;
        }
      }
      this.offCtx.putImageData(this.imgData, 0, 0);
    }

    /* ── per-frame composite ───────────────────────────────────────── */
    _draw(dt) {
      const ctx = this.ctx, mw = this.mw, mh = this.mh, s = mw / 2;
      const R = GLOBE;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, mw, mh);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.off, 0, 0, mw, mh);

      ctx.globalCompositeOperation = 'lighter';

      /* rain streaks inside the globe */
      if (this.rain.length) {
        ctx.lineCap = 'round';
        const r2max = R * R * 1.02;
        for (let i = 0; i < this.rain.length; i++) {
          const d = this.rain[i];
          d.x += d.vx * dt; d.y += d.vy * dt;
          if (d.y > 1.25 || d.x > 1.35 || d.x < -1.35) { this.rain[i] = this._newDrop(false); continue; }
          if (d.x * d.x + d.y * d.y > r2max) continue;
          const px = (d.x * 0.5 + 0.5) * mw, py = (d.y * 0.5 + 0.5) * mh;
          const k = d.len * mw * 0.5;
          const nrm = Math.sqrt(d.vx * d.vx + d.vy * d.vy) || 1;
          ctx.strokeStyle = 'rgba(196,232,255,' + d.a.toFixed(3) + ')';
          ctx.lineWidth = Math.max(1, mw / 420);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - (d.vx / nrm) * k, py - (d.vy / nrm) * k);
          ctx.stroke();
        }
      }

      /* lightning — procedurally generated, drawn crisp at device res */
      if (this.bolts.length) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const gr = R * s;   // globe radius in px
        for (let i = this.bolts.length - 1; i >= 0; i--) {
          const bo = this.bolts[i];
          bo.life -= dt;
          if (bo.life <= 0) { this.bolts.splice(i, 1); continue; }
          const k = bo.life / bo.ttl;
          const flick = k * (0.55 + 0.45 * Math.random());
          const ox = bo.x * gr * 0.5;
          const path = (pts, wMul, alpha) => {
            ctx.beginPath();
            for (let j = 0; j < pts.length; j++) {
              const X = s + ox + (pts[j].x - 0.5) * gr * 0.9;
              const Y = s + (pts[j].y - 0.5) * gr * 1.84;
              if (j === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
            }
            ctx.lineWidth = Math.max(1, (mw / 300) * wMul);
            ctx.strokeStyle = 'rgba(255,245,220,' + Math.min(1, alpha).toFixed(3) + ')';
            ctx.stroke();
          };
          ctx.shadowBlur = mw / 15;
          ctx.shadowColor = 'rgba(190,150,255,.95)';
          path(bo.main, 8, flick * 0.22);
          for (let f = 0; f < bo.forks.length; f++) path(bo.forks[f], 5, flick * 0.16);
          ctx.shadowBlur = 0;
          path(bo.main, 2.4, flick * 0.95);
          for (let f = 0; f < bo.forks.length; f++) path(bo.forks[f], 1.5, flick * 0.7);
          // ground bloom under the strike
          ctx.beginPath();
          ctx.arc(s + ox, s + gr * 0.92, mw / 20, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,250,230,' + (flick * 0.14).toFixed(3) + ')';
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;
    }

    /* ── main loop with adaptive quality ───────────────────────────── */
    start() {
      if (this._raf) return;
      const SHADE_HZ = 30;          // the cloud field evolves slowly; the
      const SHADE_STEP = 1 / SHADE_HZ;  // 60 Hz overlays still draw every frame
      const loop = (now) => {
        this._raf = requestAnimationFrame(loop);
        if (!this.mapsReady) return;
        const dt = this._last ? Math.min(0.05, (now - this._last) / 1000) : 0.016;
        this._last = now;
        this.t += dt;

        const rate = this.pal.lightning;
        if (rate > 0) {
          this.nextStrike -= dt;
          if (this.nextStrike <= 0) {
            this.nextStrike = (1 / rate) * (0.3 + Math.random() * 1.6);
            this._strike();
          }
        }
        if (this.second > 0) {
          this.second -= dt;
          if (this.second <= 0) { this.second = 0; this.flash = Math.max(this.flash, 0.6); }
        }
        this.flash *= Math.exp(-17 * dt);
        if (this.flash < 0.002) this.flash = 0;

        if (this.pal.ripple > 0) {
          for (let i = 0; i < this._rip.length; i++) {
            const R = this._rip[i];
            R.x = Math.sin(t * 0.13 * R.sp + i * 2.1) * 0.45;
            R.y = Math.cos(t * 0.11 * R.sp + i * 1.7) * 0.45;
          }
        }

        this._shadeAcc = (this._shadeAcc || 0) + dt;
        if (this._shadeAcc >= SHADE_STEP || this.flash > 0) {
          this._shadeAcc = 0;
          const t0 = performance.now();
          this._shade();
          this._watch(performance.now() - t0);
        }
        this._draw(dt);
        if (this.onFrameExtra) this.onFrameExtra(dt, this.t);
      };
      this._raf = requestAnimationFrame(loop);
    }

    /* downgrade/upgrade the shader resolution to hold the frame budget */
    _watch(cost) {
      const st = this.stats;
      st.acc += cost; st.frames++;
      if (st.frames < 40) return;
      const avg = st.acc / st.frames;
      st.acc = 0; st.frames = 0;
      if (avg > 11 && this.level < this.levels.length - 1) {
        this.res = this.levels[++this.level];
        this.resize();
      } else if (avg < 4 && this.level > 0) {
        this.res = this.levels[--this.level];
        this.resize();
      }
    }

    stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; } }

    pulse() { this.flash = Math.min(1, this.flash + 0.45); }
  }

  ATMO.Orb = Orb;
  ATMO.ORB_PALETTES = PALETTES;
})();