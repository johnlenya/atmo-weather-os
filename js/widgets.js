/* ══════════════════════════════════════════════════════════════════════
   ATMO · js/widgets.js
   AQI fluid tube · UV + humidity glowing rings · holographic forecast
   timeline with floating 3D icons · 14-day AI confidence chart · voice
   command waveform.
   Classic script — exposes window.ATMO.widgets
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const ATMO = (window.ATMO = window.ATMO || {});
  const N = ATMO.noise;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  const COND = {
    sun:   { id: 'i-sun',   c: '#FFEB00', glow: 'rgba(255,235,0,.55)' },
    cloud: { id: 'i-cloud', c: '#C6D5E6', glow: 'rgba(190,215,240,.45)' },
    rain:  { id: 'i-rain',  c: '#59D4FF', glow: 'rgba(0,229,255,.55)' },
    storm: { id: 'i-storm', c: '#B884FF', glow: 'rgba(165,95,255,.6)' }
  };
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /* ── AQI fluid tube ───────────────────────────────────────────────── */
  class AqiMeter {
    constructor(front, back) {
      this.front = front;
      this.back = back;
      this.t = 0;
      this.level = 0.24;
      this.target = 0.24;
      this.amp = 4.2;
    }
    set(value, max, colorRGB) {
      this.target = clamp01(0.14 + (value / max) * 0.76);
      this.amp = 2.6 + (value / max) * 5.4;
      if (colorRGB) {
        const el = this.front.closest('.card');
        el.style.setProperty('--aqi-fill', 'rgba(' + colorRGB + ',.88)');
        el.style.setProperty('--aqi-glow', 'rgba(' + colorRGB + ',.62)');
      }
    }
    static _path(level, phase, amp, W, H) {
      const y0 = H * (1 - level);
      let d = 'M0 ' + H.toFixed(1) + ' L0 ' + y0.toFixed(2);
      const seg = 22, step = W / seg;
      for (let i = 1; i <= seg; i++) {
        const x = i * step;
        const y = y0 + Math.sin(phase + i * 0.78) * amp + Math.sin(phase * 1.63 + i * 1.44) * amp * 0.42;
        d += ' L' + x.toFixed(1) + ' ' + y.toFixed(2);
      }
      return d + ' L' + W + ' ' + H.toFixed(1) + ' Z';
    }
    frame(dt) {
      this.t += dt;
      this.level += (this.target - this.level) * (1 - Math.pow(0.004, dt));
      this.front.setAttribute('d', AqiMeter._path(this.level, this.t * 1.15, this.amp, 300, 72));
      this.back.setAttribute('d', AqiMeter._path(this.level + 0.03, -this.t * 0.82, this.amp * 1.35, 300, 72));
    }
  }

  /* ── glowing progress ring ────────────────────────────────────────── */
  class Ring {
    constructor(el, key, from, to) {
      this.el = el;
      const R = 46, C = 2 * Math.PI * R;
      el.innerHTML =
        '<svg viewBox="0 0 120 120" aria-hidden="true">' +
          '<defs>' +
            '<linearGradient id="rg-' + key + '" x1="0" y1="1" x2="1" y2="0">' +
              '<stop offset="0" stop-color="' + from + '"/>' +
              '<stop offset="1" stop-color="' + to + '"/>' +
            '</linearGradient>' +
            '<filter id="rf-' + key + '" x="-60%" y="-60%" width="220%" height="220%">' +
              '<feGaussianBlur stdDeviation="5" result="b"/>' +
              '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>' +
            '</filter>' +
          '</defs>' +
          '<circle class="ring__track" cx="60" cy="60" r="' + R + '"/>' +
          '<circle class="ring__prog" cx="60" cy="60" r="' + R + '" ' +
            'stroke="url(#rg-' + key + ')" filter="url(#rf-' + key + ')" ' +
            'transform="rotate(-90 60 60)" stroke-dasharray="' + C.toFixed(2) + '" ' +
            'stroke-dashoffset="' + C.toFixed(2) + '"/>' +
          '<circle class="ring__tip" cx="60" cy="14" r="3.4" fill="' + to + '"/>' +
        '</svg>' +
        '<span class="ring__val"><b>0</b><span></span></span>';
      this.C = C;
      this.prog = el.querySelector('.ring__prog');
      this.tip = el.querySelector('.ring__tip');
      this.valB = el.querySelector('.ring__val b');
      this.valS = el.querySelector('.ring__val span');
      this.cur = 0;
      this.target = 0;
    }
    set(value, max, unitLabel) {
      this.target = clamp01(value / max);
      this.valB.textContent = value;
      this.valS.textContent = unitLabel;
    }
    frame(dt) {
      this.cur += (this.target - this.cur) * (1 - Math.pow(0.006, dt));
      const off = this.C * (1 - this.cur);
      this.prog.setAttribute('stroke-dashoffset', off.toFixed(2));
      const ang = -90 + this.cur * 360;
      const rad = (ang * Math.PI) / 180;
      this.tip.setAttribute('cx', (60 + 46 * Math.cos(rad)).toFixed(2));
      this.tip.setAttribute('cy', (60 + 46 * Math.sin(rad)).toFixed(2));
    }
  }

  /* ── holographic forecast timeline ───────────────────────────────── */
  class Forecast {
    constructor(el) {
      this.el = el;
      this.cards = [];
    }
    build(items) {
      this.el.innerHTML = '';
      this.cards = [];
      items.forEach((it, i) => {
        const c = COND[it.cond] || COND.sun;
        const d = document.createElement('div');
        d.className = 'fc' + (i === 0 ? ' is-now' : '');
        d.style.setProperty('--d', (i * 46) + 'ms');
        d.style.setProperty('--fc-c', c.c);
        d.style.setProperty('--fc-glow', c.glow);
        d.innerHTML =
          '<span class="fc__icon"><svg><use href="#' + c.id + '"/></svg></span>' +
          '<p class="fc__temp">' + it.temp + '°</p>' +
          '<p class="fc__time">' + it.label + '</p>' +
          '<span class="fc__prec"><i style="transform:scaleX(' + (it.precip / 100).toFixed(2) + ')"></i></span>';
        this.el.appendChild(d);
        this.cards.push(d);
      });
      this._rects = null;
      this.parallax(0.016, true);
    }
    /* Scroll-linked 3D tilt + icon lift, lerped for a spring feel.
       Note: the entry animations own `transform`, so the parallax drives the
       individual `translate` / `rotate` properties on the card and
       `transform` on the icon (whose float animation owns `translate`).
       One layout read pass, then one write pass — no thrashing. */
    parallax(dt, force) {
      const el = this.el;
      const host = el.getBoundingClientRect();
      if (!host.width) return;
      if (!force && (host.bottom < -60 || host.top > window.innerHeight + 60)) return;
      const mid = host.left + host.width / 2;
      const half = host.width / 2;
      const n = this.cards.length;
      if (!this._rects || this._rects.length !== n) this._rects = new Array(n);
      for (let i = 0; i < n; i++) this._rects[i] = this.cards[i].getBoundingClientRect();
      for (let i = 0; i < n; i++) {
        const r = this._rects[i];
        const card = this.cards[i];
        let d = (r.left + r.width / 2 - mid) / half;
        if (d < -1.4) d = -1.4; else if (d > 1.4) d = 1.4;
        card.style.translate = '0 ' + (d * d * -26).toFixed(2) + 'px';
        card.style.rotate = 'y ' + (-d * 15).toFixed(2) + 'deg';
        const icon = card.firstElementChild;
        if (icon) {
          icon.style.transform = 'rotateY(' + (-d * 22).toFixed(2) + 'deg) ' +
            'translateZ(' + ((1 - Math.abs(d)) * 10).toFixed(1) + 'px)';
        }
      }
    }
  }

  /* ── 14-day AI ensemble chart ─────────────────────────────────────── */
  class AiChart {
    constructor(el) { this.el = el; }
    build(days) {
      this.el.innerHTML = '';
      days.forEach((d, i) => {
        const c = document.createElement('div');
        c.className = 'ai-col' + (d.precip > 45 ? ' is-wet' : '');
        c.style.setProperty('--d', (i * 52) + 'ms');
        c.innerHTML =
          '<span class="ai-col__conf">' + d.conf + '%</span>' +
          '<span class="ai-col__bar" style="height:' + d.h + '%"></span>' +
          '<span class="ai-col__prec"><i style="height:' + d.precip + '%"></i></span>' +
          '<span class="ai-col__temp">' + d.temp + '°</span>' +
          '<span class="ai-col__day">' + d.day + '</span>';
        this.el.appendChild(c);
      });
    }
  }

  /* ── voice command waveform ───────────────────────────────────────── */
  class VoiceWave {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.active = false;
      this.t = 0;
      this.bars = 46;
      this.resize();
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.c.clientWidth || 340, h = this.c.clientHeight || 56;
      this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
      this.w = this.c.width; this.h = this.c.height; this.dpr = dpr;
      const ctx = this.ctx;
      const g = ctx.createLinearGradient(0, 0, 0, this.h);
      g.addColorStop(0, '#3FA9FF');
      g.addColorStop(0.5, '#FFF79A');
      g.addColorStop(1, '#3FA9FF');
      this.grad = g;
    }
    frame(dt) {
      const ctx = this.ctx, w = this.w, h = this.h;
      this.t += dt;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!this.grad) return;
      const n = this.bars;
      const gap = (w / n) * 0.36;
      const bw = w / n - gap;
      const mid = h / 2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = this.grad;
      for (let i = 0; i < n; i++) {
        const p = i / n;
        const env = Math.sin(p * Math.PI);       // envelope peaking mid-console
        const nz = N.fbm3(p * 9, this.t * 2.4, 0.5, 3, 11);
        const idle = 0.10 + 0.10 * Math.sin(this.t * 1.6 + i * 0.5);
        const amp = this.active
          ? env * (0.24 + 0.86 * nz) * (0.55 + 0.45 * Math.sin(this.t * 4.2 + i * 0.7))
          : idle * env;
        const bh = Math.max(1.5, amp * mid * 1.75);
        const x = i * (bw + gap) + gap / 2;
        ctx.globalAlpha = Math.min(1, 0.22 + amp * 0.72);
        const rr = Math.min(bw / 2, 2.2 * this.dpr);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, mid - bh, bw, bh * 2, rr);
        else ctx.rect(x, mid - bh, bw, bh * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* ── data model per weather state ─────────────────────────────────── */
  const DATA = {
    clear: {
      temp: 27, feels: 29, hi: 31, lo: 21, cond: 'Sunny · High UV',
      aqi: 68, aqiMax: 300, aqiLabel: 'Moderate', aqiRGB: '255,235,0', pm: '18 µg/m³',
      uv: 9, uvMax: 12, uvLabel: 'Very High', burn: 'burn 42 min',
      hum: 42, dew: 'dew pt 15°',
      wind: 'NNE · 12 km/h', gust: 'gust 24', jet: 'jet 118 kt', energy: 0.42,
      hours: [27, 28, 29, 28, 26, 24, 22, 21, 21, 22, 24, 26],
      conds: ['sun', 'sun', 'sun', 'cloud', 'cloud', 'sun', 'sun', 'sun', 'cloud', 'sun', 'sun', 'sun'],
      precip: [0, 2, 4, 8, 10, 6, 3, 2, 4, 5, 3, 2],
      aiNote: 'Monsoon onset modelled for <b>03 Nov</b> · strong radiative cooling at night · ensemble spread low.',
      aiBase: 29, aiSwing: 4.5, aiWet: 0.16,
      conf: [97, 96, 95, 94, 93, 91, 89, 88, 86, 84, 82, 80, 78, 76],
      ticker: 'UV 9 · burn risk 42 min · UV shield nominal'
    },
    cloudy: {
      temp: 22, feels: 23, hi: 25, lo: 18, cond: 'Overcast · Low ceiling',
      aqi: 54, aqiMax: 300, aqiLabel: 'Moderate', aqiRGB: '180,225,255', pm: '14 µg/m³',
      uv: 4, uvMax: 12, uvLabel: 'Moderate', burn: 'burn 1 h 10 m',
      hum: 61, dew: 'dew pt 14°',
      wind: 'ENE · 18 km/h', gust: 'gust 30', jet: 'jet 104 kt', energy: 0.62,
      hours: [22, 23, 23, 22, 21, 20, 19, 19, 18, 19, 21, 22],
      conds: ['cloud', 'cloud', 'cloud', 'rain', 'cloud', 'cloud', 'cloud', 'cloud', 'rain', 'cloud', 'cloud', 'cloud'],
      precip: [18, 22, 26, 41, 34, 28, 22, 20, 38, 30, 24, 20],
      aiNote: 'Inversion layer holding below 900 m · ceiling lifting after <b>14:00</b> · ensemble spread moderate.',
      aiBase: 24, aiSwing: 3.4, aiWet: 0.4,
      conf: [95, 94, 93, 92, 90, 89, 87, 86, 84, 83, 81, 79, 77, 75],
      ticker: 'Ceiling 900 m · visibility 8 km · layers stable'
    },
    rain: {
      temp: 18, feels: 17, hi: 20, lo: 15, cond: 'Steady Rain · 4.2 mm/h',
      aqi: 31, aqiMax: 300, aqiLabel: 'Good', aqiRGB: '0,229,255', pm: '8 µg/m³',
      uv: 2, uvMax: 12, uvLabel: 'Low', burn: 'burn 2 h 40 m',
      hum: 88, dew: 'dew pt 16°',
      wind: 'NE · 22 km/h', gust: 'gust 38', jet: 'jet 126 kt', energy: 0.78,
      hours: [18, 18, 17, 17, 16, 16, 15, 15, 16, 17, 17, 18],
      conds: ['rain', 'rain', 'rain', 'storm', 'rain', 'rain', 'rain', 'cloud', 'rain', 'rain', 'cloud', 'cloud'],
      precip: [82, 88, 91, 95, 86, 78, 72, 58, 74, 66, 44, 36],
      aiNote: 'Convective band training over the highlands · <b>19 mm</b> in 6 h · flash-flood watch level 2.',
      aiBase: 18, aiSwing: 2.6, aiWet: 0.72,
      conf: [93, 92, 91, 90, 88, 86, 85, 83, 81, 79, 78, 76, 74, 72],
      ticker: '4.2 mm/h · 19 mm in 6 h · flood watch L2'
    },
    storm: {
      temp: 27, feels: 29, hi: 31, lo: 21, cond: 'Scattered Thunderstorms',
      aqi: 34, aqiMax: 300, aqiLabel: 'Good', aqiRGB: '178,132,255', pm: '9 µg/m³',
      uv: 3, uvMax: 12, uvLabel: 'Low', burn: 'burn 1 h 55 m',
      hum: 94, dew: 'dew pt 24°',
      wind: 'N · 34 km/h', gust: 'gust 62', jet: 'jet 142 kt', energy: 0.96,
      hours: [27, 26, 26, 25, 25, 24, 24, 25, 25, 26, 26, 27],
      conds: ['storm', 'storm', 'rain', 'storm', 'storm', 'rain', 'rain', 'storm', 'rain', 'rain', 'cloud', 'cloud'],
      precip: [94, 92, 88, 96, 93, 82, 76, 91, 74, 62, 46, 38],
      aiNote: 'Supercell signature on Doppler · <b>62 km/h</b> gusts at 40 m · hail 12 mm possible after 18:00.',
      aiBase: 27, aiSwing: 2.6, aiWet: 0.88,
      conf: [90, 89, 88, 87, 86, 84, 82, 81, 79, 77, 75, 73, 71, 69],
      ticker: '3 strikes / 60 s · 12 km NNE · gusts 62 km/h'
    }
  };

  /* ── facade ───────────────────────────────────────────────────────── */
  const widgets = {
    DATA,
    COND,
    init(refs) {
      this.refs = refs;
      this.aqi = new AqiMeter(refs.aqiWaveF, refs.aqiWaveB);
      this.uv = new Ring(refs.ringUv, 'uv', '#FFEB00', '#FFF45C');
      this.hum = new Ring(refs.ringHum, 'hum', '#00A6FF', '#00E5FF');
      this.forecast = new Forecast(refs.forecast);
      this.ai = new AiChart(refs.aiBars);
      this.voice = new VoiceWave(refs.voiceWave);
      this.state = null;
      this.hourOffset = new Date().getHours();
    },

    label(i) {
      if (i === 0) return 'NOW';
      const h = (this.hourOffset + i) % 24;
      return (h < 10 ? '0' : '') + h + ':00';
    },

    setState(name) {
      const d = DATA[name];
      if (!d) return;
      this.state = name;
      const r = this.refs;

      r.tempVal.textContent = d.temp;
      r.feelsVal.textContent = d.feels + '°';
      r.hiVal.textContent = d.hi + '°';
      r.loVal.textContent = d.lo + '°';
      r.condLabel.textContent = d.cond;

      r.aqiVal.textContent = d.aqi;
      r.aqiChip.textContent = d.aqiLabel;
      r.aqiFoot.textContent = d.pm + ' · trending ' + (name === 'clear' || name === 'cloudy' ? 'down' : 'steady') + ' · sensor 12 s';
      this.aqi.set(d.aqi, d.aqiMax, d.aqiRGB);

      r.windChip.textContent = d.wind;
      r.windFoot.textContent = d.gust + ' · shear ' + (name === 'storm' ? 'high' : 'low') + ' · ' + d.jet;
      if (r.windField) r.windField.energy = d.energy;

      this.uv.set(d.uv, d.uvMax, d.uvLabel.toUpperCase());
      r.uvFoot.textContent = d.burn;
      this.hum.set(d.hum, 100, d.hum >= 80 ? 'MUGGY' : d.hum >= 50 ? 'COMFY' : 'DRY');
      r.humFoot.textContent = d.dew;

      this.forecast.build(d.hours.map((t, i) => ({
        temp: t, label: this.label(i), cond: d.conds[i], precip: d.precip[i]
      })));

      const today = new Date().getDay();
      const seedRand = { clear: 3, cloudy: 9, rain: 17, storm: 23 }[name];
      this.ai.build(d.conf.map((c, i) => {
        const wob = (N.noise3(i * 0.7, seedRand, 0.5) - 0.5) * 2;
        const temp = Math.round(d.aiBase + Math.sin(i * 0.55 + seedRand) * d.aiSwing + wob * 1.2);
        const wetBias = d.aiWet * (0.55 + 0.75 * Math.abs(Math.sin(i * 0.8 + 1.1)));
        return {
          conf: c,
          day: DAYS[(today + i) % 7],
          temp,
          h: Math.round(28 + clamp01((temp - (d.aiBase - d.aiSwing)) / (d.aiSwing * 2)) * 68),
          precip: Math.round(clamp01(wetBias) * 100)
        };
      }));

      r.aiConfHead.textContent = '14 days · 51 members · 92% conf';
      r.aiNote.innerHTML = '<svg class="ai__spark"><use href="#i-spark"/></svg><span>' + d.aiNote + '</span>';
      r.ticker.innerHTML = '<svg><use href="#i-bolt"/></svg>' + d.ticker;
      r.ticker.classList.toggle('is-on', name === 'storm' || name === 'rain');
    },

    frame(dt) {
      this.aqi.frame(dt);
      this.uv.frame(dt);
      this.hum.frame(dt);
      this.forecast.parallax(dt, false);
      this.voice.frame(dt);
    }
  };

  ATMO.widgets = widgets;
})();