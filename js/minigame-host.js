// Wraps a registered mini-game: intro card, HUD, SLA bar, DNS button, pager event, result card.
(function () {
  'use strict';
  const PQ = window.PQ;
  const C = PQ.C;

  // opts: { id, level, boss, bossName, ticket, canDrone, onDone(result) }
  // result: { success, quality, dns, drone, abort, time }
  PQ.runMinigame = function (opts) {
    const def = PQ.minigames[opts.id];
    if (!def) { opts.onDone({ success: false, quality: 0 }); return; }
    PQ.setScene(new HostScene(def, opts));
  };

  function HostScene(def, opts) {
    this.def = def;
    this.opts = opts;
    this.phase = 'intro';
    this.t = 0;
    this.result = null;
    this.game = null;
    this.pager = null;
    this.toast = null;
    this.pagerAt = !opts.boss && opts.ticket && !opts.ticket.pagerDone && Math.random() < PQ.CFG.pagerChance ? PQ.rand(8, 25) : -1;
  }
  HostScene.prototype.dnsAfter = function () { return this.opts.dnsAfter || PQ.CFG.dnsAfter; };
  HostScene.prototype.enter = function () { PQ.music(this.opts.boss ? PQ.TRACKS.boss : PQ.TRACKS.minigame); };

  HostScene.prototype.start = function () {
    const self = this;
    this.phase = 'play';
    this.t = 0;
    const st = PQ.state;
    this.game = this.def.create({
      level: this.opts.level || 1,
      boss: !!this.opts.boss,
      bossName: this.opts.bossName || null,
      perks: { reach: st.items.reach, label: st.items.label, certs: st.items.certs, mugs: st.items.mugs },
      finish(r) {
        if (self.result) return;
        self.end({ success: !!r.success, quality: PQ.clamp(r.quality == null ? (r.success ? 1 : 0) : r.quality, 0, 1) });
      },
    });
  };

  HostScene.prototype.end = function (r) {
    r.time = this.t;
    this.result = r;
    this.phase = 'result';
    this.t = 0;
    PQ.music(null);
    if (r.dns) PQ.sfx('trombone');
    else PQ.sfx(r.success ? 'success' : 'fail');
  };

  HostScene.prototype.update = function (dt) {
    const I = PQ.input;
    this.t += dt;
    const tk = this.opts.ticket;

    if (this.phase === 'intro') {
      if (I.anyPressed('Enter', 'Space') || I.mouse.clicked) { PQ.sfx('select'); this.start(); }
      else if (this.opts.canDrone && I.pressed('KeyD')) {
        PQ.sfx('zap');
        this.end({ success: true, quality: 1, drone: true });
      } else if (I.pressed('Escape')) { this.end({ success: false, quality: 0, abort: true }); }
      return;
    }

    if (this.phase === 'result') {
      if (this.t > 0.6 && (I.anyPressed('Enter', 'Space') || I.mouse.clicked)) {
        PQ.sfx('blip');
        this.opts.onDone(this.result);
      }
      return;
    }

    // ---- play ----
    if (tk) tk.slaLeft -= dt;

    // On-call pager interrupt: game freezes until acked or timed out
    if (this.pager) {
      this.pager.t -= dt;
      if (I.pressed('KeyP') || I.pressed('Space') || (I.mouse.clicked && PQ.inRect(I.mouse, 90, 90, 140, 60))) {
        PQ.sfx('coin');
        PQ.state.td += PQ.CFG.pagerBonus; PQ.state.earned += PQ.CFG.pagerBonus;
        this.pager = null;
        this.toast = { s: 'PAGE ACKED +' + PQ.CFG.pagerBonus + ' TD', t: 1.5 };
      } else if (this.pager.t <= 0) {
        if (tk) tk.slaLeft -= PQ.CFG.pagerPenalty;
        PQ.sfx('error');
        this.pager = null;
        this.toast = { s: 'MISSED PAGE! -' + PQ.CFG.pagerPenalty + 's SLA', t: 1.5 };
      }
      return;
    }
    if (this.pagerAt > 0 && this.t >= this.pagerAt) {
      this.pagerAt = -1;
      if (tk) tk.pagerDone = true;
      this.pager = { t: 3, site: PQ.pick(PQ.CFG.pagerSites) };
      PQ.sfx('pager');
      return;
    }
    if (this.toast) { this.toast.t -= dt; if (this.toast.t <= 0) this.toast = null; }

    // Hidden DNS button (top-right of HUD) after a while
    if (this.t > this.dnsAfter() && I.mouse.clicked && PQ.inRect(I.mouse, 288, 0, 32, 16)) {
      PQ.state.dnsUses++;
      this.end({ success: true, quality: 0, dns: true });
      return;
    }
    if (I.pressed('Escape')) { this.end({ success: false, quality: 0, abort: true }); return; }

    this.game.update(dt);
  };

  HostScene.prototype.drawHud = function (g) {
    PQ.rect(g, 0, 0, 320, 16, C.navy);
    PQ.rect(g, 0, 15, 320, 1, C.cyan);
    PQ.text(g, this.def.title, 4, 4, C.ice);
    const tk = this.opts.ticket;
    if (tk) {
      const frac = PQ.clamp(tk.slaLeft / tk.sla, 0, 1);
      const col = frac > 0.5 ? C.green : frac > 0.2 ? C.yellow : C.red;
      PQ.text(g, 'SLA', 166, 4, C.grey);
      PQ.rect(g, 192, 5, 50, 6, C.black);
      PQ.rect(g, 192, 5, 50 * frac, 6, col);
      PQ.text(g, tk.slaLeft > 0 ? PQ.fmtTime(tk.slaLeft) : 'BLOWN', 246, 4, tk.slaLeft > 0 ? C.white : C.red);
    } else if (this.opts.boss) {
      PQ.text(g, 'BOSS', 250, 4, C.red);
    }
    if (this.phase === 'play' && this.t > this.dnsAfter()) {
      const hot = PQ.inRect(PQ.input.mouse, 288, 0, 32, 16);
      PQ.text(g, 'dns', 294, 5, hot ? C.yellow : C.blue, { shadow: false, size: 6 });
    }
  };

  HostScene.prototype.draw = function (g, dt) {
    PQ.rect(g, 0, 0, 320, 240, C.black);
    if (this.phase === 'intro') {
      PQ.binaryRain(g, dt);
      this.drawHud(g);
      const d = this.def, tk = this.opts.ticket;
      PQ.box(g, 16, 24, 288, 206);
      PQ.text(g, d.title, 160, 34, C.yellow, { align: 'center', size: 12 });
      if (tk) PQ.text(g, tk.site.name + ': ' + tk.desc, 160, 52, C.cyan, { align: 'center', size: 6 });
      else if (this.opts.bossName) PQ.text(g, this.opts.bossName, 160, 52, C.red, { align: 'center' });
      PQ.text(g, 'LEVEL ' + (this.opts.level || 1), 160, 64, C.grey, { align: 'center' });
      (d.help || []).forEach((line, i) => PQ.text(g, line, 26, 82 + i * 12, C.ice));
      if (tk) PQ.drawTD(g, 26, 172, 'PAYOUT ' + tk.payout + ' TD');
      PQ.text(g, 'ENTER / CLICK = START', 160, 192, Math.floor(this.t * 3) % 2 ? C.white : C.cyan, { align: 'center' });
      if (this.opts.canDrone) PQ.text(g, 'D = SEND AI DRONE', 160, 206, C.green, { align: 'center' });
      PQ.text(g, 'ESC = BAIL', 296, 218, C.grey, { align: 'right', size: 6 });
      return;
    }

    if (this.game) {
      g.save();
      g.beginPath(); g.rect(0, 16, 320, 224); g.clip();
      this.game.draw(g, dt);
      g.restore();
    } else {
      PQ.binaryRain(g, dt);
    }
    this.drawHud(g);

    if (this.pager) {
      PQ.box(g, 90, 90, 140, 60, C.red);
      PQ.text(g, '** PAGE **', 160, 98, C.yellow, { align: 'center' });
      PQ.text(g, this.pager.site, 160, 112, C.white, { align: 'center', size: 6 });
      PQ.text(g, 'P / SPACE = ACK', 160, 126, Math.floor(this.t * 6) % 2 ? C.white : C.yellow, { align: 'center', size: 6 });
      PQ.rect(g, 100, 140, 120 * (this.pager.t / 3), 3, C.yellow);
    }
    if (this.toast) PQ.text(g, this.toast.s, 160, 24, C.yellow, { align: 'center' });

    if (this.phase === 'result') {
      const r = this.result;
      PQ.box(g, 60, 70, 200, 100);
      let title = r.success ? 'FIXED!' : 'FAILED';
      let col = r.success ? C.green : C.red;
      if (r.dns) { title = 'IT WAS DNS.'; col = C.yellow; }
      if (r.drone) title = 'DRONE HANDLED IT';
      if (r.abort) title = 'BAILED';
      PQ.text(g, title, 160, 84, col, { align: 'center', size: 10 });
      if (r.dns) PQ.text(g, 'it is always DNS.', 160, 102, C.grey, { align: 'center', size: 6 });
      if (r.success && !r.dns) {
        const stars = Math.max(1, Math.round(r.quality * 3));
        for (let i = 0; i < 3; i++) PQ.text(g, '*', 136 + i * 20, 102, i < stars ? C.yellow : C.dgrey, { size: 12 });
      }
      if (!r.abort && !r.drone) PQ.text(g, 'TIME ' + PQ.fmtTime(r.time), 160, 126, C.ice, { align: 'center' });
      if (this.t > 0.6) PQ.text(g, 'ENTER', 160, 148, Math.floor(this.t * 3) % 2 ? C.white : C.cyan, { align: 'center' });
    }
  };
})();
