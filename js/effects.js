/* ══════════════════════════════════════════════════════════════════════
   ATMO · js/effects.js
   Ambient canvases: drifting starfield · haptic rain on glass · wind
   vector field.  Classic script — exposes window.ATMO.fx
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const ATMO = (window.ATMO = window.ATMO || {});
  const N = ATMO.noise;

  /* ── deep-space starfield ─────────────────────────────────────────── */
  class Starfield {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.stars = [];
      this.shots = [];
      this.t = 0;
      this.w = 0; this.h = 0;
      this.resize();
      window.setInterval(() => { if (Math.random() < 0.34) this._meteor(); }, 4200);
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.c.clientWidth || 430, h = this.c.clientHeight || 917;
      this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
      this.w = this.c.width; this.h = this.c.height;
      this.stars.length = 0;
      const count = Math.round((w * h) / 2600);
      for (let i = 0; i < count; i++) {
        const depth = Math.random();
        this.stars.push({
          x: Math.random() * this.w,
          y: Math.random() * this.h,
          r: (0.35 + depth * 1.5) * dpr,
          a: 0.18 + Math.random() * 0.6,
          tw: 0.5 + Math.random() * 2.2,
          ph: Math.random() * 6.28,
          v: (0.9 + depth * 2.6) * dpr,
          warm: Math.random() < 0.22
        });
      }
    }
    _meteor() {
      const fromLeft = Math.random() < 0.5;
      this.shots.push({
        x: fromLeft ? -40 : this.w + 40,
        y: Math.random() * this.h * 0.55,
        vx: (fromLeft ? 1 : -1) * (2.6 + Math.random() * 2.4) ,
        vy: 1.1 + Math.random() * 1.1,
        life: 1, len: 90 + Math.random() * 110
      });
    }
    frame(dt) {
      const ctx = this.ctx, w = this.w, h = this.h;
      this.t += dt;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        s.y -= s.v * dt * 0.6;
        if (s.y < -4) { s.y = h + 4; s.x = Math.random() * w; }
        const tw = 0.62 + 0.38 * Math.sin(this.t * s.tw + s.ph);
        const a = s.a * tw;
        // 1–2 device-pixel dots: fillRect avoids the arc() path entirely
        ctx.fillStyle = s.warm
          ? 'rgba(255,238,200,' + a.toFixed(3) + ')'
          : 'rgba(215,232,255,' + a.toFixed(3) + ')';
        if (s.r < 1.4) {
          ctx.fillRect(s.x, s.y, s.r * 2, s.r * 2);
        } else {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, 6.2832);
          ctx.fill();
        }
      }
      for (let i = this.shots.length - 1; i >= 0; i--) {
        const m = this.shots[i];
        m.x += m.vx * dt * 60; m.y += m.vy * dt * 60; m.life -= dt * 0.75;
        if (m.life <= 0) { this.shots.splice(i, 1); continue; }
        const nrm = Math.hypot(m.vx, m.vy) || 1;
        const g = ctx.createLinearGradient(m.x, m.y, m.x - (m.vx / nrm) * m.len, m.y - (m.vy / nrm) * m.len);
        g.addColorStop(0, 'rgba(255,255,255,' + (m.life * 0.85).toFixed(3) + ')');
        g.addColorStop(0.35, 'rgba(200,235,255,' + (m.life * 0.30).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(200,235,255,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - (m.vx / nrm) * m.len, m.y - (m.vy / nrm) * m.len);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* ── haptic rain on the glass ─────────────────────────────────────── */
  class RainOverlay {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.on = false;
      this.intensity = 0;
      this.drops = [];
      this.splashes = [];
      this.t = 0;
      this.w = 0; this.h = 0;
      this.dpr = 1;
      this.resize();
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.c.clientWidth || 430, h = this.c.clientHeight || 917;
      this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
      this.w = this.c.width; this.h = this.c.height; this.dpr = dpr;
      this.drops.length = 0;
    }
    set(on, intensity) {
      this.on = on;
      this.intensity = intensity;
      const want = on ? Math.round(70 + intensity * 90) : 0;
      while (this.drops.length < want) this.drops.push(this._drop(true));
      if (this.drops.length > want) this.drops.length = want;
    }
    _drop(anywhere) {
      return {
        x: Math.random() * this.w,
        y: anywhere ? Math.random() * this.h : -30 - Math.random() * 120,
        v: (420 + Math.random() * 780) * this.dpr,
        len: (7 + Math.random() * 26) * this.dpr,
        a: 0.10 + Math.random() * 0.30,
        w: (0.7 + Math.random() * 1.5) * this.dpr
      };
    }
    _splash(x, y) {
      if (this.splashes.length > 40) return;
      this.splashes.push({
        x, y,
        r: 1 * this.dpr,
        max: (9 + Math.random() * 16) * this.dpr,
        life: 1
      });
    }
    frame(dt) {
      const ctx = this.ctx;
      if (!this.on && !this.splashes.length) {
        if (this._cleared) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.w, this.h);
        this._cleared = true;
        return;
      }
      this._cleared = false;
      this.t += dt;
      const slant = 0.028 * this.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      for (let i = 0; i < this.drops.length; i++) {
        const d = this.drops[i];
        d.y += d.v * dt;
        d.x += d.v * dt * slant;
        if (d.y - d.len > this.h) {
          if (Math.random() < 0.5) this._splash(d.x, Math.random() * this.h);
          this.drops[i] = this._drop(false);
          continue;
        }
        const grd = ctx.createLinearGradient(d.x, d.y - d.len, d.x, d.y);
        grd.addColorStop(0, 'rgba(180,225,255,0)');
        grd.addColorStop(1, 'rgba(200,235,255,' + d.a.toFixed(3) + ')');
        ctx.strokeStyle = grd;
        ctx.lineWidth = d.w;
        ctx.beginPath();
        ctx.moveTo(d.x - d.len * slant, d.y - d.len);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();
      }

      /* rain hitting the glass: expanding rings = the "haptic" beat */
      if (this.on && Math.random() < 0.10 + this.intensity * 0.16) {
        this._splash(Math.random() * this.w, Math.random() * this.h);
      }
      for (let i = this.splashes.length - 1; i >= 0; i--) {
        const s = this.splashes[i];
        s.life -= dt * 1.55;
        if (s.life <= 0) { this.splashes.splice(i, 1); continue; }
        s.r += (s.max - s.r) * (1 - Math.pow(0.02, dt));
        const a = s.life * s.life * 0.28;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.2832);
        ctx.strokeStyle = 'rgba(205,238,255,' + a.toFixed(3) + ')';
        ctx.lineWidth = (1.1 * this.dpr);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 0.45, 0, 6.2832);
        ctx.fillStyle = 'rgba(230,246,255,' + (a * 0.7).toFixed(3) + ')';
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* ── wind vector field ────────────────────────────────────────────── */
  class WindField {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.parts = [];
      this.t = 0;
      this.energy = 0.55;   // 0..1 wind strength
      this.dpr = 1;
      this.w = 0; this.h = 0;
      this.resize();
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.c.clientWidth || 340, h = this.c.clientHeight || 104;
      this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
      this.w = this.c.width; this.h = this.c.height; this.dpr = dpr;
      this.parts.length = 0;
      const count = Math.round(w * h / 210);
      for (let i = 0; i < count; i++) this.parts.push(this._p());
    }
    _p() {
      return {
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        px: 0, py: 0,
        life: 1 + Math.random() * 2.4,
        age: 0,
        v: 0
      };
    }
    frame(dt) {
      const ctx = this.ctx, w = this.w, h = this.h;
      this.t += dt;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,' + (1 - Math.pow(0.0016, dt)).toFixed(3) + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      const s = 0.012 * this.dpr;
      const spd = (26 + this.energy * 74) * this.dpr;
      for (let i = 0; i < this.parts.length; i++) {
        const p = this.parts[i];
        const a = N.fbm3(p.x * s, p.y * s, this.t * 0.20, 2, 5) * Math.PI * 2 + this.t * 0.16;
        const vx = Math.cos(a) * spd, vy = Math.sin(a) * spd * 0.55;
        p.px = p.x; p.py = p.y;
        p.x += vx * dt; p.y += vy * dt;
        p.age += dt; p.v = Math.abs(vx);
        if (p.age > p.life || p.x < -4 || p.x > w + 4 || p.y < -4 || p.y > h + 4) {
          this.parts[i] = this._p();
          continue;
        }
        const fade = Math.min(1, p.age / p.life) * (1 - Math.min(1, p.age / p.life));
        const sp = Math.min(1, p.v / (spd * this.dpr));
        const r = Math.round(40 + 215 * sp);
        const g = Math.round(200 + 35 * sp);
        const b = Math.round(255 - 195 * sp);
        ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (0.10 + fade * 0.62).toFixed(3) + ')';
        ctx.lineWidth = (0.9 + sp * 0.8) * this.dpr;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  ATMO.fx = { Starfield, RainOverlay, WindField };
})();