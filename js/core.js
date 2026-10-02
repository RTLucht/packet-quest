// Packet Quest core: namespace, palette, input, audio, draw helpers, scenes, save.
(function () {
  'use strict';
  const PQ = (window.PQ = window.PQ || {});
  PQ.W = 320;
  PQ.H = 240;

  // ---- Palette: 16-color Tech$$$ blue set ----
  PQ.C = {
    black: '#050a1e', navy: '#0b1a4a', blue: '#1a3a9a', royal: '#2850c8',
    sky: '#4a7ae8', cyan: '#7ad0ff', ice: '#c8ecff', white: '#ffffff',
    grey: '#8090b0', dgrey: '#3a4460', green: '#3ce070', yellow: '#ffd23c',
    orange: '#ff8a2a', red: '#ff3c4c', purple: '#a050e0', brown: '#8a5a2a',
  };

  // ---- Input ----
  const keys = {}, pressedNow = {};
  const mouse = { x: 0, y: 0, down: false, clicked: false, rclicked: false };
  PQ.input = {
    down: (k) => !!keys[k],
    pressed: (k) => !!pressedNow[k],
    anyPressed: (...ks) => ks.some((k) => pressedNow[k]),
    mouse,
    endFrame() {
      for (const k in pressedNow) delete pressedNow[k];
      mouse.clicked = mouse.rclicked = false;
    },
  };
  const BLOCK = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
  window.addEventListener('keydown', (e) => {
    if (BLOCK.includes(e.code)) e.preventDefault();
    if (!keys[e.code]) pressedNow[e.code] = true;
    keys[e.code] = true;
    PQ.audio.unlock();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  PQ.bindMouse = function (canvas) {
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = Math.floor(((e.clientX - r.left) / r.width) * PQ.W);
      mouse.y = Math.floor(((e.clientY - r.top) / r.height) * PQ.H);
    };
    canvas.addEventListener('mousemove', pos);
    canvas.addEventListener('mousedown', (e) => {
      pos(e);
      if (e.button === 2) mouse.rclicked = true;
      else { mouse.down = true; mouse.clicked = true; }
      PQ.audio.unlock();
    });
    window.addEventListener('mouseup', () => { mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  // ---- Audio (WebAudio chiptune) ----
  const audio = (PQ.audio = { ctx: null, master: null, muted: false, musicTimer: null, track: null });
  audio.unlock = function () {
    if (audio.ctx) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio.ctx = new AC();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = audio.muted ? 0 : 0.18;
    audio.master.connect(audio.ctx.destination);
    if (audio.pendingTrack) { const t = audio.pendingTrack; audio.pendingTrack = null; audio.track = null; PQ.music(t); }
  };
  audio.toggleMute = function () {
    audio.muted = !audio.muted;
    if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.18;
  };
  function tone(freq, start, dur, type, vol, slideTo) {
    const c = audio.ctx;
    if (!c) return;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    gn.gain.setValueAtTime(vol == null ? 0.5 : vol, start);
    gn.gain.exponentialRampToValueAtTime(0.001, start + dur);
    o.connect(gn); gn.connect(audio.master);
    o.start(start); o.stop(start + dur + 0.02);
  }
  function noise(start, dur, vol) {
    const c = audio.ctx;
    if (!c) return;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), gn = c.createGain();
    s.buffer = buf;
    gn.gain.setValueAtTime(vol || 0.3, start);
    gn.gain.exponentialRampToValueAtTime(0.001, start + dur);
    s.connect(gn); gn.connect(audio.master);
    s.start(start);
  }
  const SFX = {
    blip: (t) => tone(880, t, 0.05, 'square', 0.3),
    select: (t) => { tone(660, t, 0.06); tone(990, t + 0.06, 0.08); },
    coin: (t) => { tone(988, t, 0.07); tone(1319, t + 0.07, 0.25); },
    cash: (t) => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + i * 0.06, 0.12)); },
    error: (t) => { tone(200, t, 0.12, 'square', 0.5); tone(150, t + 0.12, 0.2, 'square', 0.5); },
    hit: (t) => { noise(t, 0.12, 0.4); tone(300, t, 0.12, 'square', 0.3, 80); },
    zap: (t) => tone(1400, t, 0.15, 'sawtooth', 0.25, 200),
    success: (t) => { [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.15)); tone(1047, t + 0.36, 0.4, 'triangle', 0.5); },
    fail: (t) => { [392, 370, 349, 330].forEach((f, i) => tone(f, t + i * 0.18, 0.2, 'triangle', 0.6)); },
    trombone: (t) => { [392, 370, 349].forEach((f, i) => tone(f, t + i * 0.35, 0.33, 'sawtooth', 0.35)); tone(330, t + 1.05, 0.9, 'sawtooth', 0.35, 300); },
    pager: (t) => { for (let i = 0; i < 3; i++) { tone(2093, t + i * 0.22, 0.09); tone(2637, t + i * 0.22 + 0.1, 0.09); } },
    step: (t) => noise(t, 0.03, 0.08),
    beep: (t) => tone(1760, t, 0.04, 'square', 0.3),
    boom: (t) => { noise(t, 0.5, 0.6); tone(120, t, 0.5, 'triangle', 0.6, 40); },
  };
  PQ.sfx = function (name) {
    if (!audio.ctx || !SFX[name]) return;
    SFX[name](audio.ctx.currentTime + 0.001);
  };

  // Music: tracks are { bpm, lead:[...], bass:[...], drums:bool } with notes like 'C5' or '-' (rest), 8th-note steps.
  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function freqOf(n) {
    const m = /^([A-G]#?)(\d)$/.exec(n);
    if (!m) return 0;
    const midi = 12 * (+m[2] + 1) + NOTE[m[1]];
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  PQ.music = function (track) {
    if (audio.track === track && (audio.musicTimer || audio.pendingTrack)) return;
    if (audio.musicTimer) clearInterval(audio.musicTimer);
    audio.musicTimer = null;
    audio.track = track;
    if (!track) return;
    if (!audio.ctx) { audio.pendingTrack = track; return; }
    const step = 60 / track.bpm / 2;
    let i = 0, next = audio.ctx.currentTime + 0.05;
    audio.musicTimer = setInterval(() => {
      if (next < audio.ctx.currentTime) next = audio.ctx.currentTime + 0.05; // tab was backgrounded
      while (next < audio.ctx.currentTime + 0.2) {
        const L = track.lead[i % track.lead.length], B = track.bass[i % track.bass.length];
        if (L && L !== '-') tone(freqOf(L), next, step * 0.9, 'square', 0.16);
        if (B && B !== '-') tone(freqOf(B), next, step * 0.95, 'triangle', 0.4);
        if (track.drums && i % 4 === 2) noise(next, 0.04, 0.06);
        i++; next += step;
      }
    }, 50);
  };

  // ---- Draw helpers ----
  PQ.FONT = '"Press Start 2P", monospace';
  PQ.MONO = 'Consolas, "Courier New", monospace'; // readable terminal text
  PQ.SCALE = 3; // backing-store multiplier: logic stays 320x240, text renders crisp
  PQ.rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  PQ.stroke = (g, x, y, w, h, c) => { g.strokeStyle = c; g.lineWidth = 1; g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1); };
  PQ.text = function (g, s, x, y, col, opt) {
    opt = opt || {};
    g.font = (opt.size || 8) + 'px ' + (opt.font || PQ.FONT);
    g.textAlign = opt.align || 'left';
    g.textBaseline = 'top';
    if (opt.shadow !== false) { g.fillStyle = PQ.C.black; g.fillText(s, Math.round(x) + 1, Math.round(y) + 1); }
    g.fillStyle = col || PQ.C.white;
    g.fillText(s, Math.round(x), Math.round(y));
  };
  PQ.textWidth = (g, s, size) => { g.font = (size || 8) + 'px ' + PQ.FONT; return g.measureText(s).width; };
  PQ.wrap = function (s, maxChars) {
    const out = []; let line = '';
    s.split(' ').forEach((w) => {
      if ((line + ' ' + w).trim().length > maxChars) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
    });
    if (line) out.push(line);
    return out;
  };
  // Framed panel in Tech$$$ style
  PQ.box = function (g, x, y, w, h, fill) {
    PQ.rect(g, x, y, w, h, PQ.C.cyan);
    PQ.rect(g, x + 1, y + 1, w - 2, h - 2, PQ.C.blue);
    PQ.rect(g, x + 2, y + 2, w - 4, h - 4, fill || PQ.C.navy);
  };
  PQ.button = function (g, x, y, w, h, label, hot) {
    PQ.box(g, x, y, w, h, hot ? PQ.C.royal : PQ.C.navy);
    PQ.text(g, label, x + w / 2, y + (h - 8) / 2, hot ? PQ.C.yellow : PQ.C.ice, { align: 'center' });
  };
  PQ.inRect = (p, x, y, w, h) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;

  // Procedural Tech$$$ banknote (matches the blue currency art).
  PQ.drawBill = function (g, x, y, w, h, denom, tilt) {
    g.save();
    g.translate(Math.round(x + w / 2), Math.round(y + h / 2));
    if (tilt) g.rotate(tilt);
    const x0 = -w / 2, y0 = -h / 2;
    PQ.rect(g, x0, y0, w, h, PQ.C.ice);
    PQ.rect(g, x0 + 1, y0 + 1, w - 2, h - 2, PQ.C.royal);
    PQ.rect(g, x0 + 2, y0 + 2, w - 4, h - 4, PQ.C.blue);
    if (h >= 10) {
      g.strokeStyle = PQ.C.sky; g.lineWidth = 1; g.beginPath();
      g.moveTo(x0 + 3, y0 + h * 0.3); g.lineTo(x0 + w * 0.3, y0 + h * 0.3); g.lineTo(x0 + w * 0.36, y0 + h * 0.15);
      g.moveTo(x0 + w - 3, y0 + h * 0.75); g.lineTo(x0 + w * 0.68, y0 + h * 0.75); g.lineTo(x0 + w * 0.62, y0 + h * 0.88);
      g.stroke();
    }
    const r = Math.max(1.5, h * 0.28);
    g.fillStyle = PQ.C.ice; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = PQ.C.royal; g.beginPath(); g.arc(0, 0, r * 0.62, 0.4, Math.PI * 1.6); g.fill();
    if (h >= 14) {
      g.fillStyle = PQ.C.white; g.fillRect(-r * 0.35, -r * 0.2, r * 0.7, r * 0.4);
      const fs = Math.max(6, Math.floor(h * 0.24));
      g.font = fs + 'px ' + PQ.FONT;
      g.fillStyle = PQ.C.white; g.textBaseline = 'top';
      g.textAlign = 'left'; g.fillText(String(denom), x0 + 4, y0 + 4);
      g.textAlign = 'right'; g.fillText(String(denom), x0 + w - 4, y0 + h - fs - 4);
      if (w >= 80) {
        g.font = '6px ' + PQ.FONT; g.textAlign = 'center'; g.fillStyle = PQ.C.ice;
        g.fillText('TECH$$$', 0, y0 + h - 10);
      }
    }
    g.restore();
  };
  PQ.drawTD = function (g, x, y, amount, col) {
    PQ.drawBill(g, x, y, 14, 7, '');
    PQ.text(g, String(amount), x + 17, y, col || PQ.C.yellow);
  };

  // Binary rain background (the "011010" texture on the bills)
  const rain = [];
  for (let i = 0; i < 40; i++) rain.push({ x: Math.floor(Math.random() * 40) * 8, y: Math.random() * 240, v: 10 + Math.random() * 30, b: Math.random() < 0.5 ? '0' : '1' });
  PQ.binaryRain = function (g, dt, col) {
    g.font = '8px ' + PQ.FONT; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = col || PQ.C.blue;
    rain.forEach((d) => {
      d.y += d.v * dt;
      if (d.y > 240) { d.y = -8; d.x = Math.floor(Math.random() * 40) * 8; }
      if (Math.random() < 0.02) d.b = d.b === '0' ? '1' : '0';
      g.fillText(d.b, d.x, Math.floor(d.y));
    });
  };

  // ---- Utility ----
  PQ.rand = (a, b) => a + Math.random() * (b - a);
  PQ.randi = (a, b) => Math.floor(PQ.rand(a, b + 1));
  PQ.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  PQ.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  PQ.shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  PQ.fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  // ---- Scenes ----
  PQ.scene = null;
  PQ.setScene = function (s) {
    if (PQ.scene && PQ.scene.exit) PQ.scene.exit();
    PQ.scene = s;
    if (s.enter) s.enter();
  };

  // ---- Mini-game registry ----
  PQ.minigames = {};
  PQ.registerMinigame = function (def) { PQ.minigames[def.id] = def; };

  // ---- Save ----
  const SAVE_KEY = 'pq.save.v1';
  PQ.newState = function () {
    return {
      td: 0, earned: 0, closed: 0, blown: 0, lives: 3, chain: 0, closesW: {}, lastFailed: null, nextId: 100,
      items: { reach: false, mugs: 0, label: false, certs: 0, drone: 0, cosmetics: [] },
      wearing: null, bosses: {}, documented: {}, dnsUses: 0, playTime: 0, clock: 480,
      active: null, px: null, py: null, beatGame: false,
    };
  };
  PQ.save = function () { try { localStorage.setItem(SAVE_KEY, JSON.stringify(PQ.state)); } catch (e) { /* storage blocked */ } };
  PQ.load = function () {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s.td === 'number') {
        const base = PQ.newState();
        s.items = Object.assign(base.items, s.items);
        return Object.assign(base, s);
      }
    } catch (e) { /* ignore */ }
    return null;
  };
  PQ.wipeSave = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } };
})();
