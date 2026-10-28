/* ==========================================================================
   V Energy: site behaviour
   Plain JavaScript, no dependencies. Every feature degrades gracefully:
   without JS, booking links scroll to the contact form, which posts normally.
   ========================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     Settings you may want to change
     ------------------------------------------------------------------------ */
  const CONFIG = {
    formAjax: 'https://formsubmit.co/ajax/3cd046a3a50af33a7b7bb5796841d5ac',
    whatsapp: '27790410946',
    phoneDisplay: '010 824 5582',

    // Savings advisor assumptions
    tariff: 3.5,        // Rand per kWh (typical South African residential, incl. VAT)
    sunYield: 4.8,      // kWh produced per installed kWp per day in South Africa, after losses
    panelKw: 0.55,      // rating of one panel in kW
    co2PerKwh: 0.95,    // kg of CO2 avoided per kWh of grid power replaced

    // Call-back booking. Times are South African Standard Time (UTC+2).
    bookingDays: 10,    // number of open days to offer
    leadMinutes: 120,   // earliest slot today is at least this far away
    // First and last call-back slot (hour) per weekday. 0 = Sunday (closed).
    hours: { 1: [8, 16], 2: [8, 16], 3: [8, 16], 4: [8, 16], 5: [8, 16], 6: [9, 12] },
    holidays: [
      '2026-01-01', '2026-03-21', '2026-04-03', '2026-04-06', '2026-04-27', '2026-05-01',
      '2026-06-16', '2026-08-10', '2026-09-24', '2026-12-16', '2026-12-25', '2026-12-26',
      '2027-01-01', '2027-03-22', '2027-03-26', '2027-03-29', '2027-04-27', '2027-05-01',
      '2027-06-16', '2027-08-09', '2027-09-24', '2027-12-16', '2027-12-25', '2027-12-27'
    ]
  };

  const PACKAGES = [
    { name: '2.5 kVA Essential Backup', short: '2.5 kVA', kva: 2.5, panels: 2, price: 25000, inverter: '2.5 kVA inverter', battery: '2 × 100 Ah batteries', backup: 'lights, Wi-Fi, TV & laptops' },
    { name: '3 kVA Home Starter', short: '3 kVA', kva: 3, panels: 3, price: 56000, inverter: '3 kVA inverter', battery: '2 × 100 Ah batteries', backup: 'lights, Wi-Fi, TV, fridge & gate' },
    { name: '5 kVA Family Power', short: '5 kVA', kva: 5, panels: 6, price: 116000, inverter: '5 kVA hybrid inverter', battery: '4 × 100 Ah batteries', backup: 'most of the home' },
    { name: '10 kVA Whole Home', short: '10 kVA', kva: 10, panels: 12, price: 210000, inverter: '10 kVA hybrid inverter', battery: '8 × 100 Ah batteries', backup: 'the whole home' }
  ];

  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const pad = (n) => String(n).padStart(2, '0');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const rands = (n) => 'R' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');

  function track(event, data) {
    (window.dataLayer = window.dataLayer || []).push(Object.assign({ event }, data));
  }

  function waLink(text) {
    return `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;
  }

  // Animate a number inside an element from its last value to `to`.
  function tween(el, to, format, duration = 600) {
    if (!el) return;
    const from = typeof el._v === 'number' ? el._v : to;
    el._v = to;
    if (reduceMotion || from === to) { el.textContent = format(to); return; }
    const start = performance.now();
    cancelAnimationFrame(el._raf);
    const step = (now) => {
      const p = clamp((now - start) / duration, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = format(lerp(from, to, e));
      if (p < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }

  function onVisible(el, cb, options = {}) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { cb(true); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => cb(entry.isIntersecting, entry, io));
    }, options);
    io.observe(el);
    return io;
  }

  /* ------------------------------------------------------------------------
     Header, menu, progress, active nav
     ------------------------------------------------------------------------ */
  const header = $('.site-header');
  const menuBtn = $('.menu-btn');
  const mobileMenu = $('#mobile-menu');
  const progressBar = $('.scroll-progress span');

  function setMenu(open) {
    menuBtn.setAttribute('aria-expanded', String(open));
    $('.sr-only', menuBtn).textContent = open ? 'Close menu' : 'Open menu';
    mobileMenu.hidden = !open;
    header.classList.toggle('menu-open', open);
    document.body.classList.toggle('no-scroll', open);
    if (open) $('a', mobileMenu).focus();
  }

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
    mobileMenu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !mobileMenu.hidden) { setMenu(false); menuBtn.focus(); }
    });
    window.matchMedia('(min-width: 1180px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });
  }

  const navLinks = $$('.nav-list a');
  const navTargets = navLinks.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window && navTargets.length) {
    const inBand = new Set();
    const navIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => (entry.isIntersecting ? inBand.add(entry.target) : inBand.delete(entry.target)));
      const current = navTargets.find((t) => inBand.has(t));
      navLinks.forEach((a) => a.classList.toggle('is-active', !!current && a.getAttribute('href') === '#' + current.id));
    }, { rootMargin: '-45% 0px -50% 0px' });
    navTargets.forEach((t) => navIO.observe(t));
  }

  /* ------------------------------------------------------------------------
     Scroll-driven effects (one rAF-throttled listener)
     ------------------------------------------------------------------------ */
  const stage = $('[data-stage]');
  const parallaxEls = new Set();
  let ticking = false;

  if (!reduceMotion && 'IntersectionObserver' in window) {
    const wide = window.matchMedia('(min-width: 1024px)');
    const pIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const allowed = e.target.dataset.parallax !== 'lg' || wide.matches;
        if (e.isIntersecting && allowed) parallaxEls.add(e.target);
        else parallaxEls.delete(e.target);
      });
    }, { rootMargin: '120px 0px' });
    $$('[data-parallax]').forEach((el) => pIO.observe(el));
    wide.addEventListener('change', () => {
      $$('[data-parallax="lg"]').forEach((el) => {
        el.style.transform = '';
        pIO.unobserve(el);
        pIO.observe(el);
      });
    });
  }

  function onScroll() {
    const y = window.scrollY;
    const vh = window.innerHeight;
    header.classList.toggle('is-scrolled', y > 8);

    const max = document.documentElement.scrollHeight - vh;
    if (progressBar) progressBar.style.setProperty('--progress', max > 0 ? (y / max).toFixed(4) : 0);

    if (!reduceMotion) {
      if (stage && y < vh * 1.2) stage.style.translate = `0 ${(y * -0.06).toFixed(1)}px`;
      const reads = [];
      parallaxEls.forEach((el) => {
        const r = el.getBoundingClientRect();
        reads.push([el, r.top + r.height / 2 - vh / 2, r.height]);
      });
      reads.forEach(([el, offset, h]) => {
        const speed = parseFloat(el.dataset.speed || '0.1');
        const limit = h * 0.12;
        el.style.transform = `translate3d(0, ${clamp(-offset * speed, -limit, limit).toFixed(1)}px, 0)`;
      });
    }
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  window.addEventListener('resize', () => requestAnimationFrame(onScroll), { passive: true });
  onScroll();

  // Decorative animations only run while their section is on screen
  if ('IntersectionObserver' in window) {
    const offIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => e.target.classList.toggle('is-offscreen', !e.isIntersecting));
    }, { rootMargin: '100px 0px' });
    $$('.hero, .trust, .sim-card, .work, .contact').forEach((el) => offIO.observe(el));
  }

  /* ------------------------------------------------------------------------
     Reveal on scroll, counters, steps line
     ------------------------------------------------------------------------ */
  const revealEls = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const rIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('is-in'); rIO.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach((el) => rIO.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  $$('[data-count]').forEach((el) => {
    const target = parseFloat(el.dataset.count);
    onVisible(el, (visible, _e, io) => {
      if (!visible) return;
      io && io.disconnect();
      el._v = 0;
      tween(el, target, (v) => String(Math.round(v)), 1400);
    }, { threshold: 0.6 });
  });

  $$('[data-steps]').forEach((el) => onVisible(el, (visible, _e, io) => {
    if (visible) { el.classList.add('is-in'); io && io.disconnect(); }
  }, { threshold: 0.3 }));

  /* ------------------------------------------------------------------------
     Pointer effects: hero stage, tilt cards, magnetic button
     ------------------------------------------------------------------------ */
  if (finePointer && !reduceMotion) {
    const hero = $('.hero');
    if (hero && stage) {
      let raf = 0;
      hero.addEventListener('pointermove', (e) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const px = e.clientX / window.innerWidth - 0.5;
          const py = e.clientY / window.innerHeight - 0.5;
          stage.classList.add('is-tracking');
          stage.style.setProperty('--ry', `${(-11 + px * 16).toFixed(2)}deg`);
          stage.style.setProperty('--rx', `${(7 - py * 12).toFixed(2)}deg`);
        });
      });
      hero.addEventListener('pointerleave', () => {
        stage.classList.remove('is-tracking');
        stage.style.removeProperty('--ry');
        stage.style.removeProperty('--rx');
      });
    }

    $$('[data-tilt]').forEach((card) => {
      let raf = 0;
      card.addEventListener('pointermove', (e) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const r = card.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width;
          const py = (e.clientY - r.top) / r.height;
          card.classList.add('is-tilting');
          card.style.setProperty('--ry', `${((px - 0.5) * 9).toFixed(2)}deg`);
          card.style.setProperty('--rx', `${((0.5 - py) * 7).toFixed(2)}deg`);
        });
      });
      card.addEventListener('pointerleave', () => {
        cancelAnimationFrame(raf);
        card.classList.remove('is-tilting');
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });


    $$('.magnetic').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.18;
        const y = (e.clientY - r.top - r.height / 2) * 0.3;
        btn.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.translate = ''; });
    });
  }

  /* ------------------------------------------------------------------------
     Hero "live" chips and the typing rotator
     ------------------------------------------------------------------------ */
  (() => {
    const solarEl = $('[data-live="solar"]');
    const battEl = $('[data-live="batt"]');
    if (!solarEl || reduceMotion) return;
    let timer = 0;
    let solar = 3.2;
    let batt = 96;
    const tick = () => {
      solar = clamp(solar + (Math.random() - 0.5) * 0.3, 2.9, 3.4);
      batt = Math.min(99, batt + (Math.random() < 0.4 ? 1 : 0));
      if (batt >= 99) batt = 94;
      tween(solarEl, solar, (v) => `${v.toFixed(1)} kW`, 900);
      tween(battEl, batt, (v) => `${Math.round(v)}%`, 900);
    };
    solarEl._v = solar;
    battEl._v = batt;
    onVisible($('.hero'), (visible) => {
      clearInterval(timer);
      if (visible) timer = setInterval(tick, 2600);
    });
  })();

  $$('.rotator').forEach((el) => {
    const words = (el.dataset.words || '').split('|').filter(Boolean);
    if (words.length < 2 || reduceMotion) return;
    let i = 0;
    let running = false;
    let t = 0;
    const type = (word, n) => {
      el.textContent = word.slice(0, n);
      if (n < word.length) t = setTimeout(() => type(word, n + 1), 70);
      else t = setTimeout(() => erase(word, word.length), 1700);
    };
    const erase = (word, n) => {
      el.textContent = word.slice(0, n);
      if (n > 0) t = setTimeout(() => erase(word, n - 1), 40);
      else { i = (i + 1) % words.length; t = setTimeout(() => type(words[i], 1), 220); }
    };
    onVisible(el, (visible) => {
      if (visible && !running) { running = true; t = setTimeout(() => erase(words[i], words[i].length), 1400); }
      if (!visible && running) { running = false; clearTimeout(t); el.textContent = words[i]; }
    });
  });

  /* ------------------------------------------------------------------------
     Energy simulator
     ------------------------------------------------------------------------ */
  (() => {
    const svg = $('.sim-svg');
    if (!svg) return;
    const NS = 'http://www.w3.org/2000/svg';
    const START = 300;
    const END = 1380;
    const CAPACITY = 10;    // kWh of storage
    const PEAK = 3.0;       // kW of solar at noon

    const el = (tag, attrs, parent) => {
      const n = document.createElementNS(NS, tag);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
      if (parent) parent.appendChild(n);
      return n;
    };

    // Stars (deterministic so the sky looks the same every visit)
    const stars = $('#sim-stars', svg);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 56; i++) {
      el('circle', { cx: (rnd() * 800).toFixed(1), cy: (rnd() * 370 - 145).toFixed(1), r: (rnd() * 1.1 + 0.5).toFixed(2), opacity: (rnd() * 0.5 + 0.5).toFixed(2) }, stars);
    }

    // Solar panels on the roof, mapped onto the roof trapezoid
    const panelsG = $('#sim-panels', svg);
    const roof = { tl: 252, tr: 428, bl: 190, br: 490, top: 182, bottom: 265 };
    const map = (u, v) => {
      const xt = lerp(roof.tl, roof.tr, u);
      const xb = lerp(roof.bl, roof.br, u);
      return [lerp(xt, xb, v).toFixed(1), lerp(roof.top, roof.bottom, v).toFixed(1)];
    };
    const cols = 5;
    const rows = 2;
    const panels = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u0 = 0.1 + c * (0.8 / cols) + 0.008;
        const u1 = 0.1 + (c + 1) * (0.8 / cols) - 0.008;
        const v0 = 0.14 + r * (0.72 / rows) + 0.03;
        const v1 = 0.14 + (r + 1) * (0.72 / rows) - 0.03;
        const pts = [map(u0, v0), map(u1, v0), map(u1, v1), map(u0, v1)].map((p) => p.join(',')).join(' ');
        panels.push(el('polygon', { points: pts, fill: '#24569e', stroke: '#9db5d8', 'stroke-width': '1' }, panelsG));
      }
    }

    // Copies of the windows drawn above the night shade, so they can glow
    const lit = $('#sim-lit', svg);
    const houseLit = $$('.win', svg).map((w) => el('rect', { x: w.getAttribute('x'), y: w.getAttribute('y'), width: w.getAttribute('width'), height: w.getAttribute('height'), rx: w.getAttribute('rx'), opacity: '0' }, lit));
    const nbLit = $$('.nb-win', svg).map((w) => el('rect', { x: w.getAttribute('x'), y: w.getAttribute('y'), width: w.getAttribute('width'), height: w.getAttribute('height'), rx: w.getAttribute('rx'), opacity: '0' }, lit));

    const ui = {
      range: $('#sim-range'), play: $('#sim-play'), ls: $('#sim-ls'), card: $('.sim-card'), scene: $('.sim-scene'),
      time: $('#sim-time'), solar: $('#sim-solar'), home: $('#sim-home'), batt: $('#sim-batt'), grid: $('#sim-grid'),
      solarBar: $('#sim-solar-bar'), homeBar: $('#sim-home-bar'), battBar: $('#sim-batt-bar'), gridBar: $('#sim-grid-bar'),
      gridBox: $('.ro--grid'), status: $('#sim-status'),
      sky: $('#sim-sky', svg), sun: $('#sim-sun', svg), moon: $('#sim-moon', svg),
      night: $('#sim-night', svg), spill: $('#sim-spill', svg), battFill: $('#sim-batt-fill', svg),
      fSolar: $('#flow-solar', svg), fHome: $('#flow-home', svg), fBatt: $('#flow-batt', svg), fGrid: $('#flow-grid', svg),
      nbText: $('#tag-neighbour-text', svg), gridText: $('#tag-grid-text', svg)
    };

    const gauss = (t, mu, s) => Math.exp(-0.5 * Math.pow((t - mu) / s, 2));
    const solarAt = (t) => (t <= 6 || t >= 18.5 ? 0 : PEAK * Math.pow(Math.sin(Math.PI * (t - 6) / 12.5), 1.25));
    const loadAt = (t) => 0.35 + 1.05 * gauss(t, 6.9, 0.55) + 0.45 * gauss(t, 13, 2.6) + 1.55 * gauss(t, 19.2, 1.25) + 0.3 * gauss(t, 21.5, 0.8);

    // Simulate one day minute by minute: solar first, then battery, then grid.
    function simulate(loadShedding) {
      const out = [];
      let soc = 0.3;
      const dt = 1 / 60;
      const reserve = loadShedding ? 0.05 : 0.2;
      for (let m = START; m <= END; m++) {
        const t = m / 60;
        const solar = solarAt(t);
        const load = loadAt(t);
        let batt = 0;
        let grid = 0;
        const net = solar - load;
        if (net >= 0) {
          batt = Math.min(net, ((1 - soc) * CAPACITY) / dt, 5);
        } else {
          const available = Math.max(0, ((soc - reserve) * CAPACITY) / dt);
          const draw = Math.min(-net, available, 5);
          batt = -draw;
          const deficit = -net - draw;
          if (deficit > 1e-4 && !loadShedding) grid = deficit;
        }
        soc = clamp(soc + (batt * dt) / CAPACITY, 0, 1);
        out.push({ solar, load, batt, grid, soc });
      }
      return out;
    }
    const days = { normal: simulate(false), ls: simulate(true) };

    // One flat sky colour at a time, blended through the day
    const SKY = [
      [5.0, '#0e1d3a'], [5.75, '#2f4573'], [6.3, '#f0a874'], [7.3, '#8cc4f2'], [12, '#6fb3f2'],
      [16.5, '#86bdf0'], [18.1, '#f19b66'], [18.8, '#5b4f86'], [19.6, '#15254a'], [23, '#0a1630']
    ];
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const mix = (a, b, t) => {
      const [r1, g1, b1] = hex(a);
      const [r2, g2, b2] = hex(b);
      return `rgb(${Math.round(lerp(r1, r2, t))},${Math.round(lerp(g1, g2, t))},${Math.round(lerp(b1, b2, t))})`;
    };
    function sky(t) {
      for (let i = 0; i < SKY.length - 1; i++) {
        const [h1, c1] = SKY[i];
        const [h2, c2] = SKY[i + 1];
        if (t >= h1 && t <= h2) return mix(c1, c2, (t - h1) / (h2 - h1));
      }
      return SKY[SKY.length - 1][1];
    }
    const darkness = (t) => {
      if (t < 5.6 || t > 19.4) return 1;
      if (t < 7) return 1 - (t - 5.6) / 1.4;
      if (t > 17.8) return (t - 17.8) / 1.6;
      return 0;
    };

    const setFlow = (path, power, reverse) => {
      const on = Math.abs(power) > 0.05;
      path.classList.toggle('is-on', on);
      path.classList.toggle('is-rev', !!reverse);
      if (on) path.style.setProperty('--flow-speed', `${clamp(1.5 - Math.abs(power) * 0.32, 0.35, 1.5).toFixed(2)}s`);
    };

    let minute = parseInt(ui.range.value, 10);
    let lastStatus = '';

    function render() {
      const lsOn = ui.ls.checked;
      const d = (lsOn ? days.ls : days.normal)[clamp(minute - START, 0, END - START)];
      const t = minute / 60;
      const n = darkness(t);

      const skyColour = sky(t);
      ui.sky.setAttribute('fill', skyColour);
      ui.scene.style.setProperty('--sim-sky', skyColour);
      stars.setAttribute('opacity', n.toFixed(2));
      ui.night.setAttribute('opacity', (n * 0.5).toFixed(3));

      if (t > 5.85 && t < 18.65) {
        const p = (t - 6) / 12.5;
        const x = 70 + p * 660;
        const y = 300 - Math.sin(clamp(p, 0, 1) * Math.PI) * 330;
        ui.sun.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        ui.sun.setAttribute('opacity', '1');
      } else {
        ui.sun.setAttribute('opacity', '0');
      }
      const moonP = t >= 18.5 ? (t - 18.5) / 9.5 : (t + 5.5) / 9.5;
      ui.moon.setAttribute('transform', `translate(${(110 + moonP * 600).toFixed(1)} ${(90 - Math.sin(moonP * Math.PI) * 150).toFixed(1)})`);
      ui.moon.setAttribute('opacity', (n > 0.25 ? n : 0).toFixed(2));

      houseLit.forEach((r) => r.setAttribute('opacity', clamp(n * 1.4, 0, 1).toFixed(2)));
      const nbPower = !lsOn;
      nbLit.forEach((r) => r.setAttribute('opacity', nbPower ? clamp(n * 1.4, 0, 1).toFixed(2) : '0'));
      ui.spill.setAttribute('opacity', (n * 0.3).toFixed(2));
      const panelColour = mix('#1f3d6b', '#3a77c8', d.solar / PEAK);
      panels.forEach((panel) => panel.setAttribute('fill', panelColour));

      const h = 32 * d.soc;
      ui.battFill.setAttribute('height', h.toFixed(1));
      ui.battFill.setAttribute('y', (323 + 32 - h).toFixed(1));
      ui.battFill.setAttribute('fill', d.soc < 0.15 ? '#e5484d' : d.soc < 0.3 ? '#ffb703' : '#18a957');

      setFlow(ui.fSolar, d.solar, false);
      setFlow(ui.fHome, d.load, false);
      setFlow(ui.fBatt, d.batt, d.batt < 0);
      setFlow(ui.fGrid, d.grid, false);

      svg.classList.toggle('sim-ls', lsOn);
      ui.nbText.textContent = lsOn ? 'Neighbour · no power' : 'Neighbour · no solar';
      ui.nbText.setAttribute('fill', lsOn ? '#c02a2f' : '#0a2139');
      ui.gridText.textContent = lsOn ? 'Grid down' : 'Eskom grid';
      ui.gridText.setAttribute('fill', lsOn ? '#c02a2f' : '#0a2139');

      const hh = Math.floor(minute / 60);
      const mm = minute % 60;
      ui.time.textContent = `${pad(hh)}:${pad(mm)}`;
      ui.range.setAttribute('aria-valuetext', `${pad(hh)}:${pad(mm)}`);
      ui.solar.textContent = `${d.solar.toFixed(1)} kW`;
      ui.home.textContent = `${d.load.toFixed(1)} kW`;
      ui.batt.textContent = `${Math.round(d.soc * 100)}%`;
      ui.grid.textContent = lsOn ? 'Off' : `${d.grid.toFixed(1)} kW`;
      ui.gridBox.classList.toggle('is-off', lsOn);
      ui.solarBar.style.width = `${(d.solar / PEAK) * 100}%`;
      ui.homeBar.style.width = `${clamp(d.load / 2.5, 0, 1) * 100}%`;
      ui.battBar.style.width = `${d.soc * 100}%`;
      ui.gridBar.style.width = `${clamp(d.grid / 2, 0, 1) * 100}%`;

      let msg;
      let cls = '';
      const pct = Math.round(d.soc * 100);
      if (lsOn) {
        cls = 'is-alert';
        if (d.solar > d.load) msg = 'Load-shedding: the grid is down, but your panels are powering the home and charging the battery.';
        else if (d.solar > 0.05) msg = 'Load-shedding: the grid is down. Solar and battery are sharing the load, so nothing switches off.';
        else msg = `Load-shedding: the grid is down, but your lights, Wi-Fi and TV stay on. Battery at ${pct}%.`;
      } else if (d.grid > 0.05) {
        msg = 'Early morning: the battery is holding its backup reserve, so the grid tops you up until the sun is up.';
      } else if (d.solar > d.load) {
        msg = d.soc > 0.985
          ? 'Battery full. Your panels are covering the whole home on their own.'
          : 'Sunshine is powering your home and charging the battery for tonight.';
      } else if (d.solar > 0.05) {
        msg = 'Solar and battery are sharing the load. No grid power needed.';
      } else {
        cls = 'is-night';
        msg = `Night time: your battery is running the home on stored sunshine (${pct}%).`;
      }
      // Rewrite the live region only when the meaning changes, not every frame
      const key = msg.replace(/\d+%/, '');
      if (key !== lastStatus) {
        lastStatus = key;
        ui.status.textContent = msg;
        ui.status.className = `sim-status ${cls}`.trim();
      } else if (/\d+%/.test(msg)) {
        ui.status.textContent = msg;
      }
    }

    // Playback: `pos` advances smoothly, the scene redraws whenever the minute changes
    let playing = false;
    let inView = false;
    let raf = 0;
    let last = 0;
    let pos = minute;
    let autoStarted = false; // set once autoplay has run or the visitor has taken control
    const MINUTES_PER_SECOND = 75;

    const loop = (now) => {
      const dt = last ? Math.min(now - last, 100) : 16;
      last = now;
      pos += (dt / 1000) * MINUTES_PER_SECOND;
      if (pos > END) pos = START;
      const whole = Math.floor(pos);
      if (whole !== minute) {
        minute = whole;
        ui.range.value = String(minute);
        render();
      }
      raf = requestAnimationFrame(loop);
    };

    function setPlaying(on) {
      playing = on;
      ui.play.setAttribute('aria-pressed', String(on));
      $('span', ui.play).textContent = on ? 'Pause' : 'Play day';
      cancelAnimationFrame(raf);
      last = 0;
      if (on && inView) raf = requestAnimationFrame(loop);
    }

    ui.range.addEventListener('input', () => {
      autoStarted = true;
      if (playing) setPlaying(false);
      minute = parseInt(ui.range.value, 10);
      pos = minute;
      render();
    });
    ui.play.addEventListener('click', () => { autoStarted = true; setPlaying(!playing); });
    ui.ls.addEventListener('change', () => {
      autoStarted = true;
      render();
      track('simulator_loadshedding', { on: ui.ls.checked });
    });

    onVisible(ui.card, (visible) => {
      inView = visible;
      if (!visible) { cancelAnimationFrame(raf); return; }
      if (!autoStarted && !reduceMotion) { autoStarted = true; setPlaying(true); return; }
      if (playing) { last = 0; raf = requestAnimationFrame(loop); }
    }, { threshold: 0.35 });

    render();
  })();

  /* ------------------------------------------------------------------------
     Smart solar advisor
     ------------------------------------------------------------------------ */
  let advisorSummary = '';
  let advisorProperty = 'home';
  let advisorBillRange = '';

  (() => {
    const form = $('#advisor');
    if (!form) return;
    const bill = $('#bill');
    const billOut = $('#bill-out');
    const roofEl = $('#roof');
    const card = $('.result-card');
    const out = {
      name: $('#r-name'), sub: $('#r-sub'), month: $('#r-month'), year: $('#r-year'),
      cover: $('#r-cover'), payback: $('#r-payback'), backup: $('#r-backup'), co2: $('#r-co2'), price: $('#r-price')
    };

    const SLOTS = 18;
    for (let i = 0; i < SLOTS; i++) {
      const tile = document.createElement('i');
      tile.style.setProperty('--i', String(i));
      roofEl.appendChild(tile);
    }
    const tiles = $$('i', roofEl);

    function recommend(property, monthlyBill, goal) {
      const monthlyKwh = monthlyBill / CONFIG.tariff;
      const target = { backup: 0.35, both: 0.6, savings: 0.85 }[goal] || 0.6;
      const selfUse = property === 'business' ? 0.92 : 0.85;
      const neededKwp = (monthlyKwh * target) / (30 * CONFIG.sunYield);
      const options = property === 'business' ? PACKAGES.filter((p) => p.kva >= 5) : PACKAGES;
      const pkg = options.find((p) => p.panels * CONFIG.panelKw >= neededKwp * 0.85) || null;
      const kwp = pkg ? pkg.panels * CONFIG.panelKw : Math.ceil(neededKwp * 2) / 2;
      const panels = pkg ? pkg.panels : Math.round(kwp / CONFIG.panelKw);
      const usedKwh = Math.min(kwp * CONFIG.sunYield * 30 * selfUse, monthlyKwh * 0.9);
      const monthly = usedKwh * CONFIG.tariff;
      return {
        pkg, kwp, panels, monthly,
        yearly: monthly * 12,
        cover: monthly / monthlyBill,
        payback: pkg ? pkg.price / (monthly * 12) : null,
        co2: (usedKwh * 12 * CONFIG.co2PerKwh) / 1000
      };
    }

    function billRange(v) {
      if (v < 1000) return 'Under R1 000';
      if (v < 2500) return 'R1 000 to R2 500';
      if (v < 5000) return 'R2 500 to R5 000';
      if (v < 10000) return 'R5 000 to R10 000';
      return 'Over R10 000';
    }

    let lastLabel = '';
    let trackTimer = 0;

    function update() {
      const property = form.elements.property.value;
      const goal = form.elements.goal.value;
      const value = parseInt(bill.value, 10);
      const max = parseInt(bill.max, 10);
      const min = parseInt(bill.min, 10);
      bill.style.setProperty('--fill', `${((value - min) / (max - min)) * 100}%`);
      billOut.textContent = value >= max ? `${rands(value)}+` : rands(value);
      bill.setAttribute('aria-valuetext', billOut.textContent);

      const r = recommend(property, value, goal);
      const label = r.pkg
        ? r.pkg.name
        : property === 'business' ? `Commercial system ≈ ${r.kwp} kWp` : `Custom whole-home system ≈ ${r.kwp} kWp`;
      out.name.textContent = label;
      out.sub.textContent = r.pkg
        ? `${r.pkg.panels} panels · ${r.pkg.inverter} · ${r.pkg.battery}`
        : `≈ ${r.panels} panels · inverter and storage engineered to your load profile`;
      tween(out.month, r.monthly, rands);
      tween(out.year, r.yearly, rands);
      tween(out.cover, r.cover * 100, (v) => `${Math.round(v)}%`);
      tween(out.co2, r.co2, (v) => `${v.toFixed(1)} t`);
      out.payback.textContent = r.payback ? `≈ ${r.payback.toFixed(1)} yrs` : 'On assessment';
      out.backup.textContent = r.pkg ? r.pkg.backup : 'tailored to your essential loads';
      out.price.textContent = r.pkg ? rands(r.pkg.price) : 'Custom quote';

      const lit = Math.min(r.panels, SLOTS);
      tiles.forEach((tile, i) => tile.classList.toggle('on', i < lit));

      // Replay the "new result" animation only when the recommendation changes
      if (lastLabel && label !== lastLabel && !reduceMotion) {
        card.classList.remove('is-updating');
        void card.offsetWidth;
        card.classList.add('is-updating');
      }
      lastLabel = label;

      advisorProperty = property;
      advisorBillRange = billRange(value);
      advisorSummary = `${label} · bill ${billOut.textContent}/month · goal: ${{ backup: 'backup during outages', both: 'backup + savings', savings: 'maximum savings' }[goal]} · est. saving ${rands(r.monthly)}/month`;

      clearTimeout(trackTimer);
      trackTimer = setTimeout(() => track('advisor_update', { property, bill: value, goal, recommendation: label }), 1200);
    }

    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      update();
      card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
    update();
  })();

  /* ------------------------------------------------------------------------
     Booking dialog
     ------------------------------------------------------------------------ */
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // A Date whose local fields read as the current wall-clock time in South Africa.
  const sastNow = () => {
    const d = new Date();
    return new Date(d.getTime() + (d.getTimezoneOffset() + 120) * 60000);
  };
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function openDays() {
    const now = sastNow();
    const earliest = now.getHours() * 60 + now.getMinutes() + CONFIG.leadMinutes;
    const list = [];
    for (let i = 0; i < 30 && list.length < CONFIG.bookingDays; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const hours = CONFIG.hours[d.getDay()];
      const iso = isoDate(d);
      if (!hours || CONFIG.holidays.includes(iso)) continue;
      const slots = [];
      for (let h = hours[0]; h <= hours[1]; h++) {
        if (i === 0 && h * 60 < earliest) continue;
        slots.push(`${pad(h)}:00`);
      }
      if (!slots.length) continue;
      list.push({ date: d, iso, slots, offset: i });
    }
    return list;
  }

  (() => {
    const dialog = $('#book');
    const form = $('#book-form');
    if (!dialog || !form || typeof dialog.showModal !== 'function') return;

    const steps = $$('.book-step', form);
    const labels = $$('.book-steps li', form);
    const progress = $('.book-progress', form);
    const btnBack = $('[data-back]', form);
    const btnNext = $('[data-next]', form);
    const btnSubmit = $('[data-submit]', form);
    const btnFinish = $('[data-finish]', form);
    const done = $('.book-done', form);
    const fail = $('.book-fail', form);
    const daysEl = $('#b-days', form);
    const slotsEl = $('#b-slots', form);
    const hidden = { when: $('#b-when'), pkg: $('#b-package'), advisor: $('#b-advisor'), source: $('#b-source') };
    let step = 1;
    let days = [];
    let lastTrigger = null;
    let completed = false;

    // Value of the checked radio in a group ('' if none). Safer than form.elements[name].value,
    // which returns an unchecked radio's value when a group has a single option.
    const checked = (name) => {
      const input = $$('input[type="radio"]', form).find((r) => r.name === name && r.checked);
      return input ? input.value : '';
    };

    function renderDays() {
      days = openDays();
      const chosen = checked('day');
      daysEl.innerHTML = '';
      days.forEach((d, idx) => {
        const label = d.offset === 0 ? 'Today' : d.offset === 1 ? 'Tmrw' : DAYS[d.date.getDay()];
        const wrap = document.createElement('label');
        wrap.className = 'day';
        wrap.innerHTML = `<input type="radio" name="day" value="${d.iso}"><span><small>${label}</small><strong>${d.date.getDate()}</strong><small>${MONTHS[d.date.getMonth()]}</small></span>`;
        const input = $('input', wrap);
        input.setAttribute('aria-label', `${DAYS_LONG[d.date.getDay()]} ${d.date.getDate()} ${MONTHS[d.date.getMonth()]}`);
        if (d.iso === chosen || (!chosen && idx === 0)) input.checked = true;
        daysEl.appendChild(wrap);
      });
      renderSlots();
    }

    function renderSlots() {
      const iso = checked('day');
      const day = days.find((d) => d.iso === iso);
      const chosen = checked('slot');
      slotsEl.innerHTML = '';
      if (!day) {
        slotsEl.innerHTML = '<p class="slot-empty">No times available. Please choose another day.</p>';
        return;
      }
      day.slots.forEach((s) => {
        const wrap = document.createElement('label');
        wrap.className = 'slot';
        wrap.innerHTML = `<input type="radio" name="slot" value="${s}"><span>${s}</span>`;
        if (s === chosen) $('input', wrap).checked = true;
        slotsEl.appendChild(wrap);
      });
    }

    daysEl.addEventListener('change', () => { renderSlots(); setError(2, ''); });
    slotsEl.addEventListener('change', () => setError(2, ''));

    function setError(n, msg) {
      const box = $('.step-error', steps[n - 1]);
      if (box) box.textContent = msg;
    }

    function showStep(n, focus = true) {
      step = n;
      steps.forEach((s, i) => { s.hidden = i !== n - 1; });
      labels.forEach((li, i) => {
        li.classList.toggle('is-active', i === n - 1);
        li.classList.toggle('is-done', i < n - 1);
      });
      progress.style.setProperty('--p', `${Math.round((n / 3) * 100)}%`);
      btnBack.hidden = n === 1;
      btnNext.hidden = n === 3;
      btnSubmit.hidden = n !== 3;
      btnFinish.hidden = true;
      done.hidden = true;
      fail.hidden = true;
      if (n === 2 && !daysEl.children.length) renderDays();
      $('.book-body', form).scrollTop = 0;
      if (focus) {
        const target = n === 3 ? $('#b-name') : $('input:checked, input', steps[n - 1]);
        if (target) setTimeout(() => target.focus({ preventScroll: true }), 60);
      }
      track('booking_step', { step: n });
    }

    const digits = (v) => (v || '').replace(/\D/g, '');

    function validate(n) {
      if (n === 1) {
        const ok = !!checked('Service');
        setError(1, ok ? '' : 'Please choose an option so we can prepare for your call.');
        return ok;
      }
      if (n === 2) {
        const ok = !!(checked('day') && checked('slot'));
        setError(2, ok ? '' : 'Please pick a day and a time that suits you.');
        return ok;
      }
      const fields = [
        [$('#b-name'), (v) => v.trim().length >= 2, 'Please tell us your name.'],
        [$('#b-phone'), (v) => digits(v).length >= 9, 'Please enter a valid phone number.'],
        [$('#b-email'), (v) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()), 'That email address doesn’t look right.'],
        [$('#b-area'), (v) => v.trim().length >= 2, 'Please tell us your suburb or area.']
      ];
      let firstBad = null;
      let msg = '';
      fields.forEach(([input, test, m]) => {
        const ok = test(input.value);
        input.classList.toggle('is-invalid', !ok);
        input.setAttribute('aria-invalid', String(!ok));
        if (!ok && !firstBad) { firstBad = input; msg = m; }
      });
      const consent = $('.consent input', steps[2]);
      const consentLabel = consent.closest('.consent');
      consentLabel.classList.toggle('is-invalid', !consent.checked);
      if (!consent.checked && !firstBad) { firstBad = consent; msg = 'Please tick the box so we’re allowed to contact you.'; }
      setError(3, msg);
      if (firstBad) firstBad.focus();
      return !firstBad;
    }

    steps[2].addEventListener('input', (e) => {
      if (e.target.classList.contains('is-invalid')) {
        e.target.classList.remove('is-invalid');
        e.target.removeAttribute('aria-invalid');
      }
      if (e.target.type === 'checkbox') e.target.closest('.consent').classList.remove('is-invalid');
    });
    steps[0].addEventListener('change', () => setError(1, ''));

    btnNext.addEventListener('click', () => { if (validate(step)) showStep(step + 1); });
    btnBack.addEventListener('click', () => showStep(Math.max(1, step - 1)));

    function selectedWhen() {
      const iso = checked('day');
      const day = days.find((d) => d.iso === iso);
      const slot = checked('slot');
      const method = checked('Call method') || 'Phone call';
      const date = day ? day.date : new Date(iso);
      return {
        iso, slot, method,
        human: `${DAYS_LONG[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()} at ${slot}`
      };
    }

    function calendarLinks(when, phone) {
      const [y, m, d] = when.iso.split('-').map(Number);
      const [hh, mm] = when.slot.split(':').map(Number);
      const start = new Date(Date.UTC(y, m - 1, d, hh - 2, mm));
      const end = new Date(start.getTime() + 30 * 60000);
      const stamp = (dt) => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const esc = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
      const title = 'Free solar call with V Energy';
      const details = `${when.method} with a V Energy specialist on ${phone}. Questions? Call ${CONFIG.phoneDisplay}.`;
      const ics = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//V Energy//Call booking//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'BEGIN:VEVENT', `UID:${Date.now()}@venergy.co.za`, `DTSTAMP:${stamp(new Date())}`,
        `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(details)}`,
        'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'END:VALARM',
        'END:VEVENT', 'END:VCALENDAR'
      ].join('\r\n');
      return {
        ics: `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`,
        google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${stamp(start)}/${stamp(end)}&details=${encodeURIComponent(details)}`
      };
    }

    function waSummary(when) {
      const f = form.elements;
      return [
        'Hi V Energy, I’d like to book a free solar call.',
        `Need: ${checked('Service') || 'Not sure yet'}`,
        when ? `Preferred time: ${when.human} (${when.method})` : '',
        f.name.value ? `Name: ${f.name.value}` : '',
        f.phone.value ? `Phone: ${f.phone.value}` : '',
        f.Area.value ? `Area: ${f.Area.value}` : ''
      ].filter(Boolean).join('\n');
    }

    function showResult(ok, when) {
      steps.forEach((s) => { s.hidden = true; });
      btnBack.hidden = true;
      btnNext.hidden = true;
      btnSubmit.hidden = true;
      progress.style.setProperty('--p', '100%');
      labels.forEach((li) => { li.classList.remove('is-active'); li.classList.add('is-done'); });
      if (ok) {
        completed = true;
        const phone = form.elements.phone.value.trim();
        $('.done-summary', done).textContent = `Thanks, ${form.elements.name.value.trim().split(' ')[0]}. We’ve got you down for ${when.human} (${when.method}). A V Energy specialist will contact you on ${phone}.`;
        const links = calendarLinks(when, phone);
        $('#b-ics').href = links.ics;
        $('#b-gcal').href = links.google;
        $('#b-wa-done').href = waLink(`Hi V Energy, I’ve just booked a free call for ${when.human}. My name is ${form.elements.name.value.trim()}.`);
        done.hidden = false;
        btnFinish.hidden = false;
        done.focus();
      } else {
        $('#b-wa-fail').href = waLink(waSummary(when));
        fail.hidden = false;
        fail.focus();
      }
    }

    async function send() {
      const when = selectedWhen();
      hidden.when.value = `${when.human} (SAST) · ${when.method}`;
      const data = Object.fromEntries(new FormData(form));
      delete data.day;
      delete data.slot;
      delete data._next;
      data._subject = `New call booking: ${data.name} · ${DAYS[new Date(when.iso + 'T12:00:00').getDay()]} ${when.iso.slice(8)} ${MONTHS[parseInt(when.iso.slice(5, 7), 10) - 1]}, ${when.slot}`;

      if (data._honey) { showResult(true, when); return; }

      btnSubmit.disabled = true;
      const label = btnSubmit.textContent;
      btnSubmit.textContent = 'Sending…';
      try {
        const res = await fetch(CONFIG.formAjax, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data)
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || String(json.success) !== 'true') throw new Error(json.message || `HTTP ${res.status}`);
        track('booking_submit', { service: data.Service, method: when.method });
        showResult(true, when);
      } catch (err) {
        track('booking_error', { message: String(err && err.message) });
        if (navigator.onLine) {
          // The AJAX endpoint refused; post the form the classic way instead.
          form.removeAttribute('novalidate');
          HTMLFormElement.prototype.submit.call(form);
          return;
        }
        showResult(false, when);
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = label;
      }
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (step !== 3) { if (validate(step)) showStep(step + 1); return; }
      if (validate(3)) send();
    });

    $('[data-retry]', form).addEventListener('click', () => {
      fail.hidden = true;
      showStep(3, false);
      send();
    });

    function resetForm() {
      form.reset();
      daysEl.innerHTML = '';
      slotsEl.innerHTML = '';
      Object.values(hidden).forEach((h) => { h.value = ''; });
      $$('.is-invalid', form).forEach((x) => x.classList.remove('is-invalid'));
      $$('.step-error', form).forEach((x) => { x.textContent = ''; });
      completed = false;
    }

    function open(trigger) {
      if (completed) resetForm();
      const ds = trigger ? trigger.dataset : {};
      hidden.source.value = ds.source || '';
      let jump = false;

      if (ds.service) {
        const radio = $$('input[name="Service"]', form).find((r) => r.value === ds.service);
        if (radio) { radio.checked = true; jump = true; }
      }
      if (ds.package) {
        hidden.pkg.value = ds.package;
        const radio = $$('input[name="Service"]', form).find((r) => r.value.startsWith('Home solar'));
        if (radio && !checked('Service')) radio.checked = true;
        jump = true;
      }
      if (trigger && trigger.hasAttribute('data-advisor')) {
        hidden.advisor.value = advisorSummary;
        const value = advisorProperty === 'business' ? 'Business / commercial solar' : 'Home solar & battery';
        const radio = $$('input[name="Service"]', form).find((r) => r.value === value);
        if (radio) radio.checked = true;
        const sel = $('#b-bill');
        if (sel) sel.value = advisorBillRange;
        jump = true;
      }

      lastTrigger = trigger || null;
      document.body.classList.add('no-scroll');
      dialog.showModal();
      renderDays();
      showStep(jump && checked('Service') ? 2 : 1);
      track('booking_open', { source: ds.source || 'unknown' });
    }

    function close() {
      if (dialog.open) dialog.close();
    }

    dialog.addEventListener('close', () => {
      document.body.classList.remove('no-scroll');
      if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus({ preventScroll: true });
    });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
    $$('[data-close]', dialog).forEach((b) => b.addEventListener('click', close));

    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-book]');
      if (!trigger) return;
      e.preventDefault();
      if (!mobileMenu.hidden) setMenu(false);
      open(trigger);
    });
  })();

  /* ------------------------------------------------------------------------
     Call-back form (AJAX with classic-post fallback)
     ------------------------------------------------------------------------ */
  $$('[data-ajax-form]').forEach((form) => {
    const msg = $('.form-msg', form);
    const btn = $('button[type="submit"]', form);
    form.noValidate = true; // our own messages replace the browser bubbles (native validation still applies without JS)

    form.addEventListener('input', (e) => {
      e.target.classList.remove('is-invalid');
      if (e.target.type === 'checkbox') e.target.closest('.consent').classList.remove('is-invalid');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      let firstBad = null;
      $$('input[required], select[required]', form).forEach((input) => {
        let ok = input.type === 'checkbox' ? input.checked : input.value.trim().length >= 2;
        if (input.type === 'tel') ok = input.value.replace(/\D/g, '').length >= 9;
        const target = input.type === 'checkbox' ? input.closest('.consent') : input;
        target.classList.toggle('is-invalid', !ok);
        if (!ok && !firstBad) firstBad = input;
      });
      const email = $('input[type="email"]', form);
      if (email && email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        email.classList.add('is-invalid');
        if (!firstBad) firstBad = email;
      }
      if (firstBad) {
        msg.className = 'form-msg is-err';
        msg.textContent = 'Please check the highlighted fields.';
        firstBad.focus();
        return;
      }

      const data = Object.fromEntries(new FormData(form));
      delete data._next;
      if (data._honey) { form.innerHTML = '<p class="form-msg is-ok">Thanks! We’ll be in touch shortly.</p>'; return; }
      data._subject = `Call-back request: ${data.name} (${data['Best time to call']})`;

      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = 'Sending…';
      msg.textContent = '';
      try {
        const res = await fetch(CONFIG.formAjax, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data)
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || String(json.success) !== 'true') throw new Error(json.message || `HTTP ${res.status}`);
        track('callback_submit', { interest: data['Interested in'] });
        const badge = document.createElement('div');
        badge.className = 'done-badge';
        badge.setAttribute('aria-hidden', 'true');
        badge.innerHTML = '<svg class="i"><use href="#i-check"/></svg>';
        const title = document.createElement('h3');
        title.textContent = `Thanks, ${data.name.trim().split(' ')[0]}!`;
        const note = document.createElement('p');
        note.textContent = `We’ll call you back on ${data.phone.trim()} (${data['Best time to call'].toLowerCase()}). Need us sooner? `;
        const call = document.createElement('a');
        call.href = 'tel:+27108245582';
        call.textContent = `Call ${CONFIG.phoneDisplay}`;
        note.append(call, '.');
        form.classList.add('is-sent');
        form.replaceChildren(badge, title, note);
        title.setAttribute('tabindex', '-1');
        title.focus();
      } catch (err) {
        track('callback_error', { message: String(err && err.message) });
        if (navigator.onLine) { HTMLFormElement.prototype.submit.call(form); return; }
        msg.className = 'form-msg is-err';
        msg.innerHTML = `You seem to be offline. Please try again, or <a href="${waLink(`Hi V Energy, please call me back. Name: ${data.name}, phone: ${data.phone}.`)}" target="_blank" rel="noopener">send it on WhatsApp</a>.`;
        btn.disabled = false;
        btn.textContent = label;
      }
    });
  });

  /* ------------------------------------------------------------------------
     Lightbox
     ------------------------------------------------------------------------ */
  (() => {
    const box = $('#lightbox');
    const links = $$('[data-lightbox]');
    if (!box || !links.length || typeof box.showModal !== 'function') return;
    const img = $('#lb-img');
    const cap = $('#lb-cap');
    let index = 0;
    let lastFocus = null;

    function show(i) {
      index = (i + links.length) % links.length;
      const a = links[index];
      img.src = a.getAttribute('href');
      img.alt = ($('img', a) || {}).alt || '';
      cap.textContent = a.dataset.caption || '';
    }

    links.forEach((a, i) => a.addEventListener('click', (e) => {
      e.preventDefault();
      lastFocus = a;
      show(i);
      document.body.classList.add('no-scroll');
      box.showModal();
    }));

    box.addEventListener('click', (e) => {
      const action = e.target.closest('[data-lb]');
      if (action) {
        const a = action.dataset.lb;
        if (a === 'close') box.close();
        if (a === 'prev') show(index - 1);
        if (a === 'next') show(index + 1);
        return;
      }
      if (e.target === box) box.close();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') show(index - 1);
      if (e.key === 'ArrowRight') show(index + 1);
    });
    let startX = 0;
    box.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
    });
    box.addEventListener('close', () => {
      document.body.classList.remove('no-scroll');
      if (lastFocus) lastFocus.focus({ preventScroll: true });
    });
  })();

  /* ------------------------------------------------------------------------
     Live Google reviews (loaded only when the section approaches)
     ------------------------------------------------------------------------ */
  (() => {
    const frame = $('#g-reviews');
    const btn = $('[data-load-reviews]');
    if (!frame || !btn || !frame.dataset.src) return;
    btn.addEventListener('click', () => {
      frame.hidden = false;
      btn.hidden = true;
      const iframe = document.createElement('iframe');
      iframe.src = frame.dataset.src;
      iframe.title = 'Google reviews for V Energy';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.addEventListener('load', () => { const ph = $('.g-reviews-ph', frame); if (ph) ph.remove(); });
      frame.appendChild(iframe);
      track('reviews_widget_open', {});
    });
  })();

  /* ------------------------------------------------------------------------
     Sticky mobile action bar, tracking hooks, footer year
     ------------------------------------------------------------------------ */
  (() => {
    const bar = $('.action-bar');
    const ctas = $('.hero-ctas');
    if (!bar || !ctas) return;
    onVisible(ctas, (visible, entry) => {
      const past = !visible && entry && entry.boundingClientRect.top < 0;
      bar.classList.toggle('is-visible', past);
    });
  })();

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-track]');
    if (t) track(t.dataset.track, { href: t.getAttribute('href') });
  });

  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
})();
