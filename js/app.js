/* ══════════════════════════════════════════════════════════════════════
   ATMO · js/app.js
   Boot sequence, weather state machine, interactions, AR sky view,
   voice command console.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const ATMO = window.ATMO;
  const $ = (id) => document.getElementById(id);
  const ORDER = ['clear', 'cloudy', 'rain', 'storm'];

  const AR_SKY = {
    clear: {
      sky: 'linear-gradient(to bottom,#05122E 0%,#0B2A57 24%,#1C4E84 44%,#3F7CA8 60%,#8FC0D8 74%,#E8C77A 86%,#1A1A1F 86.4%)',
      sun: '#FFEB00', sunPos: ['24%', '22%'], clouds: 0.16, tag: ['Cumulus Humilis', '1.8 km · 340° · 46% moisture']
    },
    cloudy: {
      sky: 'linear-gradient(to bottom,#141A24 0%,#232C39 26%,#3A4657 48%,#5B6675 68%,#8A939E 82%,#1A1A1F 82.4%)',
      sun: '#B9C9DC', sunPos: ['58%', '30%'], clouds: 0.5, tag: ['Stratus Deck', '0.9 km · 210° · 71% moisture']
    },
    rain: {
      sky: 'linear-gradient(to bottom,#070C16 0%,#101B2C 26%,#1B2E45 48%,#2C4358 68%,#485663 82%,#17171C 82.4%)',
      sun: '#6FA8D6', sunPos: ['70%', '34%'], clouds: 0.72, tag: ['Nimbostratus', '0.6 km · 040° · 88% moisture']
    },
    storm: {
      sky: 'linear-gradient(to bottom,#0B0616 0%,#1A0F2E 24%,#2C1748 44%,#3F2166 62%,#553172 78%,#131317 78.4%)',
      sun: '#B14CFF', sunPos: ['36%', '30%'], clouds: 0.85, tag: ['Cumulonimbus', '1.2 km · 340° · 94% moisture']
    }
  };

  const VOICE = {
    'Will it rain tonight?': 'Rain probability peaks at <b>74%</b> between 21:00 and 23:00. Expect <b>4.2 mm</b> — umbrella advised.',
    'UV at noon?': 'UV index reaches <b>9 · very high</b> at 12:20. Safe exposure window closes in <b>38 minutes</b>.',
    'Wind for the flight?': 'Surface wind <b>NNE 12 km/h</b>, 500 mb jet <b>118 kt</b>. Crosswind component within limits.'
  };

  const CITIES = [
    { city: 'Nairobi, KE',   meta: 'grid 4 · 1 km', state: 'storm'  },
    { city: 'Tokyo, JP',     meta: 'grid 9 · 3 km', state: 'rain'   },
    { city: 'Dubai, AE',     meta: 'grid 6 · 2 km', state: 'clear'  },
    { city: 'Reykjavík, IS', meta: 'grid 2 · 5 km', state: 'cloudy' },
    { city: 'São Paulo, BR', meta: 'grid 7 · 2 km', state: 'rain'   },
    { city: 'New York, US',  meta: 'grid 5 · 1 km', state: 'cloudy' }
  ];
  const STATE_ICON = { clear: 'sun', cloudy: 'cloud', rain: 'rain', storm: 'storm' };

  const app = {
    /* ── boot ─────────────────────────────────────────────────────── */
    async boot() {
      const steps = [
        ['initializing atmosphere kernel…', 6, 220],
        ['seeding 51-member ensemble…', 26, 260],
        ['generating volumetric cloud field…', 58, 60],
        ['calibrating lightning solver…', 84, 240],
        ['linking GPS grid 4 · Nairobi…', 96, 220],
        ['ready', 100, 240]
      ];
      for (let i = 0; i < steps.length; i++) {
        const [msg, pct, wait] = steps[i];
        $('bootLog').textContent = msg;
        $('bootBar').style.width = pct + '%';
        await new Promise((r) => setTimeout(r, wait));
        if (pct >= 58 && !this.orb.mapsReady) this.orb.buildMaps();  // heavy, hidden by the step
      }
      $('boot').classList.add('is-done');
      this.orb.start();
      this.setState('storm', true);
    },

    /* ── init ─────────────────────────────────────────────────────── */
    init() {
      this.screen = $('screen');
      this.content = $('content');
      this.stage = $('orbStage');

      this.widgets = ATMO.widgets;
      this.widgets.init({
        tempVal: $('tempVal'), feelsVal: $('feelsVal'), hiVal: $('hiVal'), loVal: $('loVal'),
        condLabel: $('condLabel'), ticker: $('ticker'),
        aqiVal: $('aqiVal'), aqiChip: $('aqiChip'), aqiFoot: $('aqiFoot'),
        aqiWaveF: $('aqiWaveF'), aqiWaveB: $('aqiWaveB'),
        windChip: $('windChip'), windFoot: $('windFoot'),
        ringUv: $('ringUv'), uvFoot: $('uvFoot'),
        ringHum: $('ringHum'), humFoot: $('humFoot'),
        forecast: $('forecast'), aiBars: $('aiBars'), aiNote: $('aiNote'), aiConfHead: $('aiConfHead'),
        voiceWave: $('voiceWave')
      });

      this.orb = new ATMO.Orb($('orb'));
      this.stars = new ATMO.fx.Starfield($('stars'));
      this.rain = new ATMO.fx.RainOverlay($('rainOverlay'));
      this.wind = new ATMO.fx.WindField($('windField'));
      this.widgets.refs.windField = this.wind;
      this._buildLayerTags();
      this.city = 'Nairobi, KE';
      this._buildCityList();

      /* one rAF drives every canvas */
      this.orb.onFrameExtra = (dt) => {
        this.stars.frame(dt);
        this.rain.frame(dt);
        this.wind.frame(dt);
        this.widgets.frame(dt);
      };

      this._wire();
      this._clock();
      window.setInterval(() => this._clock(), 1000);
      window.addEventListener('resize', () => this._resize());
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this._pills());
      this._pills();
      this.boot();
    },

    /* ── the AI/model layers that can be toggled from the dock ─────── */
    _buildLayerTags() {
      const wrap = document.createElement('div');
      wrap.className = 'orb-layers';
      wrap.setAttribute('aria-hidden', 'true');
      ['CLOUDS', 'PRECIP', 'WIND', 'LIGHTNING', 'THERMAL'].forEach((t) => {
        const s = document.createElement('span');
        s.className = 'orb-layers__tag';
        s.textContent = t;
        wrap.appendChild(s);
      });
      this.stage.appendChild(wrap);
    },

    /* ── state machine ────────────────────────────────────────────── */
    setState(name, immediate) {
      this.state = name;
      this.orb.setState(name);
      this.widgets.setState(name);
      const p = ATMO.ORB_PALETTES[name];
      const root = document.documentElement.style;
      root.setProperty('--orb-glow', p.glow);
      root.setProperty('--temp-glow', p.tempGlow);
      root.setProperty('--halo', p.halo);
      root.setProperty('--blob-a', p.blobA);
      root.setProperty('--blob-b', p.blobB);
      root.setProperty('--blob-c', p.blobC);

      this.rain.set(name === 'rain' || name === 'storm', name === 'storm' ? 0.9 : 0.5);
      $('rainOverlay').classList.toggle('is-on', name === 'rain' || name === 'storm');

      const btns = document.querySelectorAll('.switch__btn');
      btns.forEach((b) => {
        const on = b.dataset.state === name;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      this._pills();
      if (this.arOpen) this._paintAr();
      if (!immediate) this.orb.pulse();
    },

    next() {
      const i = ORDER.indexOf(this.state);
      this.setState(ORDER[(i + 1) % ORDER.length]);
    },

    /* ── AR sky view ──────────────────────────────────────────────── */
    openAr() {
      this.arOpen = true;
      $('arMode').classList.add('is-on');
      $('arMode').setAttribute('aria-hidden', 'false');
      $('scrim').hidden = true;
      this._paintAr();
      this._buildArTicks();
    },
    closeAr() {
      this.arOpen = false;
      $('arMode').classList.remove('is-on');
      $('arMode').setAttribute('aria-hidden', 'true');
      $('scrim').hidden = true;
      this._setDock(null);
    },
    _paintAr() {
      const d = AR_SKY[this.state] || AR_SKY.clear;
      const mode = $('arMode');
      $('arSky').style.background = d.sky;
      const sun = $('arSun');
      sun.style.background = 'radial-gradient(closest-side, ' + d.sun + ', transparent 72%)';
      sun.style.left = d.sunPos[0];
      sun.style.top = d.sunPos[1];
      sun.classList.toggle('is-on', this.state === 'clear' || this.state === 'cloudy');
      mode.querySelector('.ar__clouds--far').style.opacity = (d.clouds * 0.55).toFixed(2);
      mode.querySelector('.ar__clouds--near').style.opacity = d.clouds.toFixed(2);
      mode.classList.toggle('ar--storm', this.state === 'storm');
      mode.classList.toggle('ar--rain', this.state === 'rain');
      $('arTagName').textContent = d.tag[0];
      $('arTagMeta').textContent = d.tag[1];
      const w = this.widgets.DATA[this.state];
      $('arCompass').textContent = 'N 340° · PITCH −4° · ' + w.wind.replace(' · ', ' ');
    },
    _buildArTicks() {
      const wrap = $('arTicks');
      if (wrap.childElementCount) return;
      for (let i = 0; i <= 18; i++) {
        const t = document.createElement('span');
        t.className = 'ar__tick';
        t.style.left = (i / 18 * 100) + '%';
        const major = i % 3 === 0;
        t.style.height = major ? '12px' : '6px';
        if (major) {
          const s = document.createElement('span');
          s.textContent = ((340 + i * 10) % 360) + '°';
          t.appendChild(s);
        }
        wrap.appendChild(t);
      }
    },

    /* ── voice console ────────────────────────────────────────────── */
    openVoice() {
      if (this.locOpen) this.closeLoc();
      this.voiceOpen = true;
      const sh = $('voiceSheet');
      sh.classList.add('is-on');
      sh.setAttribute('aria-hidden', 'false');
      $('scrim').hidden = false;
      $('scrim').classList.add('is-on');
      this.widgets.voice.active = true;
      const keys = Object.keys(VOICE);
      this._vIndex = 0;
      this._ask(keys[0]);
    },
    closeVoice() {
      this.voiceOpen = false;
      $('voiceSheet').classList.remove('is-on');
      $('voiceSheet').setAttribute('aria-hidden', 'true');
      $('scrim').classList.remove('is-on');
      window.setTimeout(() => { if (!this.voiceOpen) $('scrim').hidden = true; }, 300);
      this.widgets.voice.active = false;
    },
    _ask(q) {
      $('voiceQuery').textContent = '“' + q + '”';
      $('voiceAnswer').innerHTML = VOICE[q] || VOICE[Object.keys(VOICE)[0]];
      document.querySelectorAll('#voiceChips button').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.q === q);
      });
    },

    /* ── location picker ──────────────────────────────────────────── */
    _buildCityList() {
      const list = $('cityList');
      if (!list || list.childElementCount) return;
      const COND = this.widgets.COND;
      CITIES.forEach((c) => {
        const cd = COND[STATE_ICON[c.state]];
        const li = document.createElement('li');
        li.innerHTML =
          '<button class="citylist__item" type="button" data-city="' + c.city + '">' +
            '<span class="citylist__ico" style="color:' + cd.c + '"><svg><use href="#' + cd.id + '"/></svg></span>' +
            '<span class="citylist__meta"><b>' + c.city + '</b><em>' + c.meta + '</em></span>' +
            '<span class="citylist__temp">' + this.widgets.DATA[c.state].temp + '°</span>' +
          '</button>';
        list.appendChild(li);
      });
    },
    _markCity() {
      document.querySelectorAll('#cityList .citylist__item').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.city === this.city);
      });
    },
    openLoc() {
      if (this.voiceOpen) this.closeVoice();
      this.locOpen = true;
      this._buildCityList();
      this._markCity();
      const sh = $('locSheet');
      sh.classList.add('is-on');
      sh.setAttribute('aria-hidden', 'false');
      $('scrim').hidden = false;
      $('scrim').classList.add('is-on');
    },
    closeLoc() {
      this.locOpen = false;
      $('locSheet').classList.remove('is-on');
      $('locSheet').setAttribute('aria-hidden', 'true');
      $('scrim').classList.remove('is-on');
      window.setTimeout(() => { if (!this.locOpen && !this.voiceOpen) $('scrim').hidden = true; }, 300);
    },
    setLocation(name) {
      const c = CITIES.find((x) => x.city === name);
      if (!c) return;
      this.city = c.city;
      $('locCity').textContent = c.city;
      $('locLive').textContent = c.meta;
      this.setState(c.state);
      this._markCity();
    },

    /* ── wiring ───────────────────────────────────────────────────── */
    _wire() {
      this.stage.addEventListener('click', () => this.next());

      document.querySelectorAll('.switch__btn').forEach((b) => {
        b.addEventListener('click', (e) => { e.stopPropagation(); this.setState(b.dataset.state); });
      });

      $('btnAr').addEventListener('click', () => this.openAr());
      $('btnArClose').addEventListener('click', () => this.closeAr());
      $('btnVoice').addEventListener('click', () => (this.voiceOpen ? this.closeVoice() : this.openVoice()));
      $('btnVoiceClose').addEventListener('click', () => this.closeVoice());

      document.querySelectorAll('#voiceChips button').forEach((b) => {
        b.addEventListener('click', () => this._ask(b.dataset.q));
      });

      $('btnLoc').addEventListener('click', () => (this.locOpen ? this.closeLoc() : this.openLoc()));
      $('btnLocClose').addEventListener('click', () => this.closeLoc());
      $('cityList').addEventListener('click', (e) => {
        const b = e.target.closest('.citylist__item');
        if (!b) return;
        this.setLocation(b.dataset.city);
        this.closeLoc();
      });

      $('scrim').addEventListener('click', () => {
        if (this.voiceOpen) this.closeVoice();
        if (this.locOpen) this.closeLoc();
      });

      document.querySelectorAll('.dock__btn').forEach((b) => {
        b.addEventListener('click', () => {
          const k = b.dataset.dock;
          if (k === 'ar') return this.openAr();
          if (k === 'layers') {
            const on = this.stage.classList.toggle('is-layers');
            this._setDock(on ? 'layers' : 'home');
            return;
          }
          this._setDock(k);
          const target = k === 'ai' ? document.querySelector('.ai') : document.querySelector('.hero');
          this.content.scrollTo({ top: (target.offsetTop || 0) - 40, behavior: 'smooth' });
        });
      });

      // keyboard niceties
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { this.closeAr(); this.closeVoice(); this.closeLoc(); return; }
        if (this.voiceOpen || this.locOpen) return;
        if (e.key === ' ') { e.preventDefault(); this.next(); }
        if (e.key === 'ArrowRight') this.content.scrollBy({ left: 0 });
      });

      // clicking the orb readout region is handled by the stage listener above
      document.querySelector('.forecast').addEventListener('keydown', (e) => {
        const step = 82;
        if (e.key === 'ArrowRight') { e.preventDefault(); e.currentTarget.scrollBy({ left: step, behavior: 'smooth' }); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); e.currentTarget.scrollBy({ left: -step, behavior: 'smooth' }); }
      });
    },

    _setDock(k) {
      const btns = document.querySelectorAll('.dock__btn');
      btns.forEach((b) => b.classList.toggle('is-active', k ? b.dataset.dock === k : false));
      this._pills();
    },

    /* ── pill positioning (switch + dock) ─────────────────────────── */
    _pills() {
      const sw = $('stateSwitch'), pill = $('switchPill');
      const act = sw.querySelector('.switch__btn.is-active');
      if (act) {
        pill.style.left = (act.offsetLeft) + 'px';
        pill.style.width = act.offsetWidth + 'px';
      }
      const dk = $('dock'), dp = $('dockPill');
      const dact = dk.querySelector('.dock__btn.is-active');
      if (dact) {
        dp.style.left = (dact.offsetLeft) + 'px';
        dp.style.width = dact.offsetWidth + 'px';
        dp.style.opacity = '1';
      } else {
        dp.style.opacity = '0';
      }
    },

    _clock() {
      const d = new Date();
      const hh = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
      const mm = String(d.getMinutes()).padStart(2, '0');
      $('statusTime').textContent = hh + ':' + mm;
    },

    _resize() {
      this.orb.resize();
      this.stars.resize();
      this.rain.resize();
      this.wind.resize();
      this.widgets.voice.resize();
      this.widgets.forecast.parallax(0.016, true);
      this._pills();
    }
  };

  ATMO.app = app;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
  } else {
    app.init();
  }
})();