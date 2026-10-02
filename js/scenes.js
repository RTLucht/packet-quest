// Scenes + game flow: tickets, payout, terminal, shop, bosses, Great Outage, title, ending, leaderboard.
(function () {
  'use strict';
  const PQ = window.PQ;
  const C = PQ.C;
  const CFG = PQ.CFG;
  const OW = PQ.overworld;
  PQ.time = 0;

  const blink = (rate) => Math.floor(PQ.time * (rate || 3)) % 2 === 0;
  const st = () => PQ.state;
  const rank = () => PQ.rankOf(PQ.state.earned);
  const toOverworld = () => PQ.setScene(OW.scene);

  // ================= Tickets =================
  PQ.tickets = {
    queue: [],
    refill: 0,
    tick(dt) {
      this.refill += dt;
      if (this.refill >= CFG.queueRefill) { this.refill = 0; if (this.queue.length < CFG.queueSize) this.queue.push(gen()); }
    },
    reset() { this.queue = [gen(), gen(), gen()]; this.refill = 0; },
  };
  function weighted(ws) { let r = Math.random() * ws.reduce((a, b) => a + b, 0); for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r < 0) return i; } return ws.length - 1; }
  function gen() {
    const s = st(), rk = rank();
    const worlds = [1]; if (rk >= 2) worlds.push(2); if (rk >= 3) worlds.push(3);
    const world = worlds[weighted(worlds.map((w, i) => 1 + i * 0.6))];
    const site = PQ.pick(PQ.SITES.filter((x) => x.kind === 'site' && x.world === world));
    let pool = [];
    CFG.missionsByCert.forEach((m, i) => { if (s.items.certs >= i) pool = pool.concat(m); });
    if (s.lastFailed && pool.includes(s.lastFailed)) pool.push(s.lastFailed); // repeat-the-break weighting
    const game = PQ.pick(pool);
    const level = world;
    const urgency = ['green', 'yellow', 'red'][weighted(CFG.urgencyWeights[level])];
    const u = CFG.urgency[urgency];
    let raw = Math.floor(PQ.minigames[game].payout * CFG.levelMult[level - 1] * u.mult);
    if (s.documented[site.id]) raw = Math.floor(raw * 1.25);
    s.nextId = (s.nextId || 100) + 1;
    return { id: s.nextId, siteId: site.id, game, level, urgency, sla: u.sla, slaLeft: u.sla, payout: raw, desc: PQ.pick(CFG.flavor[game]) };
  }

  // ================= Boss gating =================
  PQ.bossAvailable = function (id) {
    const s = st(), b = s.bosses, rk = rank(), certs = s.items.certs;
    if (b[id]) return false;
    if (id === 'loop') return rk >= 1 && (s.closesW[1] || 0) >= 3;
    if (id === 'bgp') return !!b.loop && rk >= 2 && certs >= 1;
    if (id === 'auditor') return !!b.bgp && rk >= 3 && certs >= 2;
    if (id === 'outage') return !!(b.loop && b.bgp && b.auditor) && rk >= 4 && certs >= 3;
    return false;
  };
  PQ.doorLabel = function (site) {
    const tk = st().active;
    if (site.kind === 'hq') return 'TICKET QUEUE TERMINAL';
    if (site.kind === 'shop') return 'SUPPLY DEPOT';
    if (site.kind === 'final') return PQ.bossAvailable('outage') ? 'FACE THE GREAT OUTAGE' : st().bosses.outage ? 'NOC (ALL GREEN)' : 'NOC WAR ROOM (LOCKED)';
    if (tk && tk.siteId === site.id) return 'WORK TICKET #' + tk.id;
    if (site.boss && PQ.bossAvailable(site.boss)) return 'FIGHT ' + CFG.bosses[site.boss].name;
    return site.name;
  };

  PQ.enterSite = function (site) {
    const s = st(), tk = s.active;
    if (site.kind === 'hq') { PQ.sfx('select'); PQ.setScene(terminalScene()); return; }
    if (site.kind === 'shop') { PQ.sfx('select'); PQ.setScene(shopScene()); return; }
    if (site.kind === 'final') {
      if (PQ.bossAvailable('outage')) PQ.setScene(bossIntro('outage'));
      else { PQ.sfx('error'); OW.toast(s.bosses.outage ? 'ALL 2,200 SITES GREEN. NICE.' : 'NEED: ' + CFG.bosses.outage.need, C.red); }
      return;
    }
    if (tk && tk.siteId === site.id) { runTicket(tk); return; }
    if (site.boss && PQ.bossAvailable(site.boss)) { PQ.setScene(bossIntro(site.boss)); return; }
    PQ.sfx('error');
    if (tk) OW.toast('TICKET #' + tk.id + ' IS FOR ' + PQ.siteById(tk.siteId).name, C.yellow);
    else if (site.boss && !s.bosses[site.boss]) OW.toast('BOSS LOCKED - NEED: ' + CFG.bosses[site.boss].need, C.grey);
    else OW.toast('NO OPEN TICKET HERE. CHECK HQ.', C.grey);
  };

  // ================= Loading tip =================
  function loadingTip(next) {
    const tip = PQ.pick(CFG.tips);
    let t = 0, gone = false;
    const go = () => { if (!gone) { gone = true; next(); } };
    return {
      update(dt) { t += dt; if (t > 2.2 || (t > 0.4 && (PQ.input.anyPressed('Enter', 'Space', 'KeyE') || PQ.input.mouse.clicked))) go(); },
      draw(g, dt) {
        PQ.rect(g, 0, 0, 320, 240, C.black);
        PQ.binaryRain(g, dt);
        PQ.box(g, 20, 86, 280, 70);
        PQ.text(g, 'LOADING...  NETWORK TIP', 160, 94, C.yellow, { align: 'center', size: 6 });
        PQ.wrap(tip, 40).forEach((l, i) => PQ.text(g, l, 160, 110 + i * 11, C.ice, { align: 'center', size: 6 }));
        PQ.rect(g, 40, 146, 240 * Math.min(1, t / 2.2), 3, C.cyan);
      },
    };
  }

  // ================= Ticket run + payout =================
  function runTicket(tk) {
    const s = st();
    tk.site = PQ.siteById(tk.siteId);
    PQ.setScene(loadingTip(() => PQ.runMinigame({
      id: tk.game, level: tk.level, ticket: tk,
      canDrone: s.items.drone > 0,
      onDone: (r) => ticketDone(tk, r),
    })));
  }

  function ticketDone(tk, r) {
    const s = st();
    if (r.abort) { toOverworld(); OW.toast('BAILED. TICKET STILL OPEN.', C.grey); return; }
    const lines = [];
    const rankBefore = rank();
    let pay = 0;
    if (r.success) {
      if (r.drone) { s.items.drone--; pay = tk.payout; lines.push(['AI DRONE AUTO-SOLVE', pay]); }
      else if (r.dns) { pay = CFG.dnsPay; lines.push(['IT WAS DNS. (SAD TROMBONE)', pay]); }
      else {
        lines.push(['BASE ' + tk.urgency.toUpperCase() + ' L' + tk.level, tk.payout]);
        if (tk.slaLeft > 0) {
          const bonus = Math.floor(tk.payout * (tk.slaLeft / tk.sla) * CFG.speedBonusMax);
          pay = tk.payout + bonus;
          lines.push(['SPEED BONUS', '+' + bonus]);
        } else { pay = Math.floor(tk.payout * CFG.blownMult); lines.push(['SLA BLOWN x0.5', pay]); }
      }
      if (s.items.certs >= 3 && pay > 1) { pay = Math.floor(pay * CFG.ccieMult); lines.push(['CCIE +10%', pay]); }
      if (!r.dns && !r.drone) {
        s.chain = (s.chain || 0) + 1;
        if (s.chain % CFG.chainEvery === 0) { pay = Math.floor(pay * CFG.chainMult); lines.push(['CLEAN STREAK x' + s.chain + ' BONUS', pay]); }
      } else s.chain = 0;
      s.td += pay; s.earned += pay; s.closed++;
      const site = PQ.siteById(tk.siteId);
      s.closesW[site.world] = (s.closesW[site.world] || 0) + 1;
      if (s.items.label && !s.documented[site.id]) { s.documented[site.id] = true; lines.push(['SITE DOCUMENTED (LABEL MAKER)', '']); }
      if (s.lastFailed === tk.game) s.lastFailed = null;
      if (tk.slaLeft <= 0) s.blown++;
      s.active = null;
    } else {
      s.chain = 0; s.lives--; s.lastFailed = tk.game;
      lines.push(['FIX FAILED. -1 LIFE', '']);
      if (s.lives <= 0) {
        const tax = Math.floor(s.td * CFG.burnoutTax);
        s.td -= tax; s.lives = CFG.lives; s.active = null;
        const hq = PQ.siteById('hq'); s.px = hq.doorX * 16 + 8; s.py = (hq.doorY + 1) * 16 + 6;
        lines.push(['BURNOUT! PTO TAX', '-' + tax]);
        lines.push(['TICKET REASSIGNED. LIVES RESET.', '']);
        OW.reset();
      } else lines.push(['TICKET STILL OPEN - TRY AGAIN', '']);
    }
    const rankAfter = rank();
    PQ.save();
    PQ.setScene(reportScene({
      title: r.success ? (r.dns ? 'IT WAS DNS' : 'TICKET #' + tk.id + ' CLOSED') : 'TICKET #' + tk.id + ' FAILED',
      ok: r.success, lines, pay,
      quote: r.success && !r.dns ? PQ.pick(CFG.closeLines[tk.game]) : null,
      rankUp: rankAfter > rankBefore ? CFG.ranks[rankAfter].name : null,
    }));
  }

  function reportScene(rep) {
    let t = 0, shown = 0;
    return {
      enter() { PQ.music(PQ.TRACKS.shop); if (rep.rankUp) setTimeout(() => PQ.sfx('success'), 600); },
      update(dt) {
        t += dt;
        const target = Math.min(rep.pay, Math.floor(t * 60));
        if (target > shown) { shown = target; if (Math.floor(t * 20) % 2) PQ.sfx('beep'); }
        if (t > 0.8 && (PQ.input.anyPressed('Enter', 'Space', 'KeyE') || PQ.input.mouse.clicked)) {
          toOverworld();
          if (rep.pay > 0) { OW.burstBills(rep.pay); PQ.sfx('cash'); }
          if (rep.rankUp) { OW.toast('PROMOTED: ' + rep.rankUp.toUpperCase() + '!', C.yellow); OW.refreshGates(); }
        }
      },
      draw(g, dt) {
        PQ.rect(g, 0, 0, 320, 240, C.black);
        PQ.binaryRain(g, dt, C.navy);
        PQ.box(g, 16, 16, 288, 208);
        PQ.text(g, rep.title, 160, 26, rep.ok ? C.green : C.red, { align: 'center', size: 10 });
        rep.lines.forEach((l, i) => {
          PQ.text(g, l[0], 30, 50 + i * 13, C.ice, { size: 6 });
          PQ.text(g, String(l[1]), 290, 50 + i * 13, C.yellow, { size: 6, align: 'right' });
        });
        PQ.drawBill(g, 104, 126, 112, 50, rep.pay >= 100 ? 100 : rep.pay >= 50 ? 50 : rep.pay >= 20 ? 20 : 10, Math.sin(t * 2) * 0.05);
        PQ.text(g, '+' + shown + ' T$', 160, 184, C.yellow, { align: 'center', size: 12 });
        if (rep.quote) PQ.text(g, rep.quote, 160, 202, C.cyan, { align: 'center', size: 6 });
        if (rep.rankUp && blink(4)) PQ.text(g, 'RANK UP: ' + rep.rankUp.toUpperCase(), 160, 114, C.yellow, { align: 'center', size: 6 });
        PQ.text(g, 'ENTER', 290, 212, blink() ? C.white : C.dgrey, { size: 6, align: 'right' });
        PQ.text(g, 'LIVES ' + st().lives, 30, 212, C.red, { size: 6 });
      },
    };
  }

  // ================= HQ terminal =================
  function terminalScene() {
    let sel = 0;
    const items = () => {
      const s = st();
      const list = s.active ? [{ kind: 'abandon' }] : PQ.tickets.queue.map((tk) => ({ kind: 'take', tk }));
      list.push({ kind: 'exit' });
      return list;
    };
    return {
      enter() { PQ.music(PQ.TRACKS.shop); },
      update() {
        const I = PQ.input, list = items();
        sel = PQ.clamp(sel, 0, list.length - 1);
        if (I.anyPressed('ArrowUp', 'KeyW')) { sel = (sel + list.length - 1) % list.length; PQ.sfx('blip'); }
        if (I.anyPressed('ArrowDown', 'KeyS')) { sel = (sel + 1) % list.length; PQ.sfx('blip'); }
        let pick = null;
        if (I.anyPressed('Enter', 'Space', 'KeyE')) pick = list[sel];
        list.forEach((it, i) => { if (I.mouse.clicked && PQ.inRect(I.mouse, 14, 50 + i * 32, 292, 30)) { sel = i; pick = it; } });
        if (I.pressed('Escape')) pick = { kind: 'exit' };
        if (!pick) return;
        const s = st();
        if (pick.kind === 'exit') { PQ.sfx('blip'); toOverworld(); }
        else if (pick.kind === 'take') {
          PQ.tickets.queue = PQ.tickets.queue.filter((x) => x !== pick.tk);
          s.active = pick.tk; PQ.sfx('select'); PQ.save();
          toOverworld(); OW.toast('TICKET #' + pick.tk.id + ': GO TO ' + PQ.siteById(pick.tk.siteId).name, C.yellow);
        } else if (pick.kind === 'abandon') {
          s.active = null; s.chain = 0; PQ.sfx('error'); PQ.save();
          toOverworld(); OW.toast('TICKET ABANDONED. NO PAY.', C.red);
        }
      },
      draw(g, dt) {
        const s = st();
        PQ.rect(g, 0, 0, 320, 240, C.black);
        PQ.binaryRain(g, dt, C.navy);
        PQ.box(g, 4, 4, 312, 232, C.black);
        PQ.text(g, 'HQ TICKET QUEUE', 12, 12, C.cyan);
        PQ.drawTD(g, 236, 12, s.td);
        const rk = rank(), next = CFG.ranks[rk + 1];
        PQ.text(g, CFG.ranks[rk].name.toUpperCase(), 12, 26, C.yellow, { size: 6 });
        if (next) {
          const prev = CFG.ranks[rk].at;
          PQ.rect(g, 12, 36, 180, 4, C.dgrey);
          PQ.rect(g, 12, 36, 180 * PQ.clamp((s.earned - prev) / (next.at - prev), 0, 1), 4, C.yellow);
          PQ.text(g, s.earned + '/' + next.at, 198, 35, C.grey, { size: 6 });
        }
        PQ.text(g, 'LIVES ' + s.lives, 306, 26, C.red, { size: 6, align: 'right' });
        PQ.text(g, 'STREAK ' + (s.chain || 0), 306, 35, C.green, { size: 6, align: 'right' });
        items().forEach((it, i) => {
          const y = 50 + i * 32, hot = i === sel;
          PQ.rect(g, 14, y, 292, 30, hot ? C.blue : C.navy);
          if (hot) PQ.stroke(g, 14, y, 292, 30, C.cyan);
          if (it.kind === 'take') {
            const tk = it.tk;
            PQ.rect(g, 18, y + 4, 6, 22, tk.urgency === 'red' && !blink(6) ? C.black : C[tk.urgency]);
            PQ.text(g, '#' + tk.id + ' ' + PQ.minigames[tk.game].title, 30, y + 4, C.white, { size: 6 });
            PQ.text(g, PQ.siteById(tk.siteId).name + '  L' + tk.level + '  SLA ' + PQ.fmtTime(tk.sla), 30, y + 13, C.ice, { size: 6 });
            PQ.text(g, '"' + (tk.desc.length > 42 ? tk.desc.slice(0, 40) + '..' : tk.desc) + '"', 30, y + 22, C.grey, { size: 6, shadow: false });
            PQ.text(g, tk.payout + ' T$', 300, y + 4, C.yellow, { size: 6, align: 'right' });
          } else if (it.kind === 'abandon') {
            const tk = s.active;
            PQ.text(g, 'ACTIVE #' + tk.id + ' ' + PQ.minigames[tk.game].title, 22, y + 5, C.yellow, { size: 6 });
            PQ.text(g, '@ ' + PQ.siteById(tk.siteId).name + '.  ENTER = ABANDON (NO PAY)', 22, y + 17, C.red, { size: 6 });
          } else PQ.text(g, 'LOG OFF', 160, y + 11, C.ice, { size: 6, align: 'center' });
        });
        if (!s.active && !PQ.tickets.queue.length) PQ.text(g, 'QUEUE EMPTY. ENJOY THE QUIET...', 160, 170, C.grey, { align: 'center', size: 6 });
        PQ.text(g, 'UP/DOWN  ENTER  ESC', 160, 224, C.dgrey, { size: 6, align: 'center' });
      },
    };
  }

  // ================= Supply Depot =================
  const COSMETIC = ['hat', 'vest', 'tee'];
  function owned(it) {
    const x = st().items;
    if (it.id === 'reach') return x.reach;
    if (it.id === 'mug') return x.mugs >= 3;
    if (it.id === 'label') return x.label;
    if (it.id === 'cert1') return x.certs >= 1;
    if (it.id === 'cert2') return x.certs >= 2;
    if (it.id === 'cert3') return x.certs >= 3;
    if (it.id === 'drone') return x.drone >= 3;
    return x.cosmetics.includes(it.id);
  }
  function locked(it) { const x = st().items; return (it.id === 'cert2' && x.certs < 1) || (it.id === 'cert3' && x.certs < 2); }
  function shopScene() {
    let sel = 0, msg = null, scroll = 0;
    const list = CFG.shop.concat([{ id: 'exit', name: 'LEAVE', price: 0, desc: '' }]);
    const ROWS = 9;
    return {
      enter() { PQ.music(PQ.TRACKS.shop); },
      update(dt) {
        if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
        const I = PQ.input, s = st();
        if (I.anyPressed('ArrowUp', 'KeyW')) { sel = (sel + list.length - 1) % list.length; PQ.sfx('blip'); }
        if (I.anyPressed('ArrowDown', 'KeyS')) { sel = (sel + 1) % list.length; PQ.sfx('blip'); }
        if (sel < scroll) scroll = sel;
        if (sel >= scroll + ROWS) scroll = sel - ROWS + 1;
        let buy = I.anyPressed('Enter', 'Space', 'KeyE');
        for (let i = 0; i < ROWS; i++) if (I.mouse.clicked && PQ.inRect(I.mouse, 10, 42 + i * 16, 300, 15)) { sel = scroll + i; buy = true; }
        if (I.pressed('Escape')) { toOverworld(); return; }
        if (!buy) return;
        const it = list[sel];
        if (!it) return;
        if (it.id === 'exit') { PQ.sfx('blip'); toOverworld(); return; }
        const x = s.items;
        if (COSMETIC.includes(it.id) && x.cosmetics.includes(it.id)) { s.wearing = s.wearing === it.id ? null : it.id; PQ.sfx('select'); msg = { s: s.wearing ? 'NOW WEARING: ' + it.name : 'UNEQUIPPED', t: 1.5 }; PQ.save(); return; }
        if (owned(it)) { PQ.sfx('error'); msg = { s: 'ALREADY MAXED', t: 1.2 }; return; }
        if (locked(it)) { PQ.sfx('error'); msg = { s: 'NEED THE PREVIOUS CERT FIRST', t: 1.5 }; return; }
        if (s.td < it.price) { PQ.sfx('error'); msg = { s: 'NOT ENOUGH TECH$$$', t: 1.2 }; return; }
        s.td -= it.price;
        if (it.id === 'reach') x.reach = true;
        else if (it.id === 'mug') x.mugs++;
        else if (it.id === 'label') x.label = true;
        else if (it.id.startsWith('cert')) { x.certs = +it.id.slice(4); PQ.tickets.reset(); }
        else if (it.id === 'drone') x.drone = 3;
        else { x.cosmetics.push(it.id); s.wearing = it.id; }
        PQ.sfx('cash');
        msg = { s: 'PURCHASED: ' + it.name, t: 1.6 };
        PQ.save();
      },
      draw(g, dt) {
        const s = st();
        PQ.rect(g, 0, 0, 320, 240, C.black);
        PQ.binaryRain(g, dt, C.navy);
        PQ.box(g, 4, 4, 312, 232, C.black);
        PQ.text(g, 'SUPPLY DEPOT', 12, 12, C.yellow);
        PQ.drawTD(g, 236, 12, s.td);
        PQ.text(g, '"No receipts. No refunds. No RMAs."', 12, 26, C.grey, { size: 6 });
        for (let i = 0; i < ROWS; i++) {
          const idx = scroll + i, it = list[idx];
          if (!it) break;
          const y = 42 + i * 16;
          if (idx === sel) PQ.rect(g, 10, y - 2, 300, 15, C.blue);
          const own = it.id !== 'exit' && owned(it), lock = locked(it);
          const col = it.id === 'exit' ? C.ice : own ? C.green : lock ? C.dgrey : s.td >= it.price ? C.white : C.grey;
          PQ.text(g, it.name, 16, y + 2, col, { size: 6 });
          if (it.id !== 'exit') {
            let tag = it.price + ' T$';
            if (it.id === 'mug') tag = s.items.mugs + '/3  ' + tag;
            if (it.id === 'drone' && s.items.drone) tag = s.items.drone + 'CHG  ' + tag;
            if (own) tag = COSMETIC.includes(it.id) ? (s.wearing === it.id ? 'WEARING' : 'OWNED') : it.id === 'mug' || it.id === 'drone' ? 'FULL' : 'OWNED';
            PQ.text(g, tag, 304, y + 2, own ? C.green : C.yellow, { size: 6, align: 'right' });
          }
        }
        const it = list[sel];
        PQ.rect(g, 10, 190, 300, 1, C.cyan);
        if (it && it.desc) PQ.wrap(it.desc, 38).forEach((l, i) => PQ.text(g, l, 16, 196 + i * 10, C.ice, { size: 6 }));
        PQ.drawBill(g, 262, 194, 44, 20, 100, Math.sin(PQ.time) * 0.1);
        if (msg) { PQ.rect(g, 0, 222, 320, 12, C.navy); PQ.text(g, msg.s, 160, 224, C.yellow, { size: 6, align: 'center' }); }
      },
    };
  }

  // ================= Bosses =================
  function drawBoss(g, id, x, y, t, hp) {
    const wob = Math.sin(t * 3) * 2;
    if (id === 'loop') { // broadcast storm hydra: heads on cable necks
      for (let i = 0; i < 3; i++) {
        const a = -0.7 + i * 0.7 + Math.sin(t * 2 + i) * 0.15, nx = x + Math.sin(a) * 34, ny = y - 30 + Math.cos(a * 2) * 4 + wob;
        g.strokeStyle = C.orange; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + 10); g.quadraticCurveTo(x + Math.sin(a) * 10, y - 10, nx, ny); g.stroke();
        PQ.rect(g, nx - 8, ny - 6, 16, 12, C.red); PQ.rect(g, nx - 5, ny - 3, 3, 3, C.yellow); PQ.rect(g, nx + 2, ny - 3, 3, 3, C.yellow);
        PQ.rect(g, nx - 4, ny + 3, 8, 2, C.white);
      }
      PQ.rect(g, x - 20, y + 6, 40, 20, C.dgrey); PQ.text(g, 'L2 SW', x, y + 12, C.red, { size: 6, align: 'center' });
    } else if (id === 'bgp') { // lord with a crown of AS numbers
      PQ.rect(g, x - 18, y - 22 + wob, 36, 46, C.purple);
      PQ.rect(g, x - 22, y - 30 + wob, 44, 8, C.yellow);
      for (let i = 0; i < 5; i++) PQ.rect(g, x - 22 + i * 10, y - 36 + wob, 4, 6, C.yellow);
      PQ.rect(g, x - 10, y - 12 + wob, 6, 6, Math.floor(t * 4) % 2 ? C.white : C.dgrey); PQ.rect(g, x + 4, y - 12 + wob, 6, 6, Math.floor(t * 4) % 2 ? C.dgrey : C.white);
      PQ.text(g, 'AS65001', x, y + 4 + wob, C.ice, { size: 6, align: 'center' });
      PQ.text(g, 'WITHDRAWN', x, y + 30, Math.floor(t * 3) % 2 ? C.red : C.dgrey, { size: 6, align: 'center' });
    } else if (id === 'auditor') { // compliance golem with a clipboard
      PQ.rect(g, x - 22, y - 26, 44, 52, C.grey);
      PQ.rect(g, x - 16, y - 20, 32, 10, C.black);
      PQ.rect(g, x - 12, y - 18, 8, 6, C.red); PQ.rect(g, x + 4, y - 18, 8, 6, C.red);
      PQ.rect(g, x + 14, y - 4 + wob, 18, 24, C.brown); PQ.rect(g, x + 16, y + wob, 14, 18, C.white);
      for (let i = 0; i < 4; i++) PQ.rect(g, x + 18, y + 3 + i * 4 + wob, 10, 1, C.dgrey);
      PQ.text(g, 'SOX', x - 6, y + 4, C.navy, { size: 6, align: 'center', shadow: false });
    } else { // the great outage: a swirling void of 2,200 red dots
      for (let i = 0; i < 60; i++) { const a = i * 2.4 + t * 0.5, r = 6 + (i % 12) * 3.5; PQ.rect(g, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, 2, 2, i % 3 ? C.red : C.orange); }
      PQ.rect(g, x - 8, y - 6, 16, 12, C.black); PQ.text(g, '!', x, y - 4, C.red, { align: 'center' });
    }
    if (hp != null) { PQ.rect(g, x - 50, y + 42, 100, 6, C.dgrey); PQ.rect(g, x - 50, y + 42, 100 * hp, 6, C.red); }
  }

  function bossIntro(id) {
    const b = CFG.bosses[id];
    let t = 0;
    return {
      enter() { PQ.music(PQ.TRACKS.boss); PQ.sfx('boom'); },
      update(dt) {
        t += dt;
        if (t < 0.6) return;
        if (PQ.input.anyPressed('Enter', 'Space', 'KeyE') || PQ.input.mouse.clicked) { if (id === 'outage') PQ.setScene(outageScene()); else startBoss(id); }
        else if (PQ.input.pressed('Escape')) toOverworld();
      },
      draw(g, dt) {
        PQ.rect(g, 0, 0, 320, 240, C.black);
        PQ.binaryRain(g, dt, '#3a0a1a');
        PQ.text(g, 'BOSS', 160, 18, blink(6) ? C.red : C.orange, { align: 'center', size: 12 });
        drawBoss(g, id, 160, 100, t, 1);
        PQ.text(g, b.name, 160, 158, C.yellow, { align: 'center', size: 12 });
        PQ.text(g, '"' + b.taunt + '"', 160, 178, C.ice, { align: 'center', size: 6 });
        PQ.text(g, id === 'outage' ? 'TRIAGE 4 SITES, THEN FIND THE ROOT CAUSE' : b.phases.length + ' PHASES.  2 FAILS = RETREAT', 160, 194, C.grey, { align: 'center', size: 6 });
        PQ.text(g, 'REWARD ' + b.reward + ' T$', 160, 206, C.yellow, { align: 'center', size: 6 });
        if (t > 0.6) PQ.text(g, 'ENTER = FIGHT   ESC = NOT TODAY', 160, 222, blink() ? C.white : C.cyan, { align: 'center', size: 6 });
      },
    };
  }

  function startBoss(id) {
    const b = CFG.bosses[id];
    const run = { phase: 0, fails: 0, dnsUsed: 0 };
    const next = () => {
      if (run.phase >= b.phases.length) { bossWin(id, b.reward - run.dnsUsed * 50); return; }
      const [game, lv] = b.phases[run.phase];
      PQ.runMinigame({
        id: game, level: lv === 'boss' ? 3 : lv, boss: lv === 'boss', bossName: b.name, canDrone: st().items.drone > 0,
        dnsAfter: game === 'docs' ? 6 : null,
        onDone(r) {
          if (r.success) {
            if (r.drone) { st().items.drone--; PQ.save(); }
            if (r.dns) run.dnsUsed++;
            run.phase++;
            if (run.phase >= b.phases.length) next();
            else PQ.setScene(bossInterstitial(id, run, 'PHASE CLEARED!', next));
          } else {
            run.fails++;
            if (r.abort || run.fails >= 2) PQ.setScene(bossRetreat(id));
            else PQ.setScene(bossInterstitial(id, run, 'PHASE FAILED - ONE MORE TRY', next));
          }
        },
      });
    };
    next();
  }
  function bossInterstitial(id, run, msg, next) {
    const b = CFG.bosses[id];
    let t = 0;
    return {
      enter() { PQ.music(PQ.TRACKS.boss); },
      update(dt) { t += dt; if (t > 0.6 && (PQ.input.anyPressed('Enter', 'Space') || PQ.input.mouse.clicked)) next(); },
      draw(g, dt) {
        PQ.rect(g, 0, 0, 320, 240, C.black);
        PQ.binaryRain(g, dt, '#3a0a1a');
        drawBoss(g, id, 160, 90, t * (msg.includes('FAILED') ? 2 : 1), 1 - run.phase / b.phases.length);
        PQ.text(g, msg, 160, 160, msg.includes('FAILED') ? C.red : C.green, { align: 'center' });
        PQ.text(g, 'NEXT: PHASE ' + (run.phase + 1) + '/' + b.phases.length + '  ' + PQ.minigames[b.phases[run.phase][0]].title, 160, 178, C.ice, { align: 'center', size: 6 });
        PQ.text(g, 'ENTER', 160, 210, blink() ? C.white : C.cyan, { align: 'center', size: 6 });
      },
    };
  }
  function bossRetreat(id) {
    return reportScene({ title: 'RETREAT!', ok: false, lines: [[CFG.bosses[id].name + ' STILL STANDS.', ''], ['NO LIVES LOST. TRY AGAIN ANY TIME.', '']], pay: 0, quote: null, rankUp: null });
  }
  function bossWin(id, reward) {
    const s = st();
    const before = rank();
    reward = Math.max(50, reward);
    s.bosses[id] = true; s.td += reward; s.earned += reward;
    PQ.save();
    const after = rank();
    const quotes = { loop: 'A tree with N switches has N-1 links.', bgp: 'Stable routes are boring routes. Boring is good.', auditor: 'Documentation: the only weapon auditors fear.' };
    PQ.setScene(reportScene({ title: CFG.bosses[id].name + ' DOWN!', ok: true, lines: [['BOSS BOUNTY', reward]], pay: reward, quote: quotes[id], rankUp: after > before ? CFG.ranks[after].name : null }));
  }

  // ---- Auditor docs phase (only used by The Auditor) ----
  PQ.registerMinigame({
    id: 'docs', title: 'DOCUMENTATION CHECK', payout: 0,
    help: ['The Auditor demands proof.', 'CONFIRM (SPACE/CLICK) every site', 'marked DOCUMENTED. Rows shuffle!', 'Confirming an undocumented site', 'is a strike. 3 strikes = fail.', 'No docs at all? Weak spot sealed.', 'Then only one thing can save you.'],
    create(api) {
      const sites = PQ.SITES.filter((x) => x.kind === 'site').map((x) => ({ name: x.name, doc: !!st().documented[x.id], ok: false }));
      const need = sites.filter((x) => x.doc).length;
      let sel = 0, strikes = 0, t = 0, done = false, shuffleT = 4, shake = 0;
      const fin = (ok) => { if (!done) { done = true; api.finish({ success: ok, quality: ok ? 1 - strikes / 3 : 0 }); } };
      return {
        update(dt) {
          if (done) return;
          t += dt; shake = Math.max(0, shake - dt);
          if (t > 30) { fin(false); return; }
          shuffleT -= dt;
          if (shuffleT <= 0 && need) { shuffleT = 4; PQ.shuffle(sites); PQ.sfx('blip'); }
          const I = PQ.input;
          if (I.anyPressed('ArrowUp', 'KeyW')) sel = (sel + sites.length - 1) % sites.length;
          if (I.anyPressed('ArrowDown', 'KeyS')) sel = (sel + 1) % sites.length;
          let pick = I.anyPressed('Space', 'Enter') ? sel : -1;
          sites.forEach((_, i) => { if (I.mouse.clicked && PQ.inRect(I.mouse, 30, 48 + i * 16, 260, 15)) pick = sel = i; });
          if (pick < 0 || !need) return;
          const r = sites[pick];
          if (r.ok) return;
          if (r.doc) { r.ok = true; PQ.sfx('coin'); if (sites.filter((x) => x.ok).length === need) fin(true); }
          else { strikes++; shake = 0.4; PQ.sfx('error'); if (strikes >= 3) fin(false); }
        },
        draw(g) {
          g.save(); if (shake > 0) g.translate(PQ.randi(-2, 2), 0);
          PQ.rect(g, -4, 16, 328, 224, C.black);
          PQ.text(g, 'AUDIT ENDS IN ' + PQ.fmtTime(30 - t), 8, 22, C.ice, { size: 6 });
          PQ.text(g, 'STRIKES ' + strikes + '/3', 312, 22, C.red, { size: 6, align: 'right' });
          if (!need) {
            PQ.text(g, 'NO DOCUMENTATION FOUND.', 160, 90, C.red, { align: 'center' });
            PQ.text(g, 'THE AUDITOR IS INVULNERABLE.', 160, 104, C.red, { align: 'center', size: 6 });
            PQ.text(g, '(the Golden Label Maker documents sites)', 160, 120, C.grey, { align: 'center', size: 6 });
            PQ.text(g, 'when every clue fails... look up and right', 160, 150, blink(2) ? C.dgrey : C.blue, { align: 'center', size: 6 });
          } else sites.forEach((x, i) => {
            const y = 48 + i * 16;
            if (i === sel) PQ.rect(g, 30, y - 2, 260, 15, C.blue);
            PQ.text(g, x.name, 38, y + 2, C.white, { size: 6 });
            PQ.text(g, x.ok ? 'CONFIRMED' : x.doc ? 'DOCUMENTED' : 'NOT DOCUMENTED', 284, y + 2, x.ok ? C.green : x.doc ? C.yellow : C.grey, { size: 6, align: 'right' });
          });
          g.restore();
        },
      };
    },
  });

  // ================= The Great Outage =================
  function outageScene() {
    const cards = CFG.outageCards.map((c) => Object.assign({ state: 'open', deadline: PQ.time + c.timer }, c));
    let sel = 0, phase = 'triage', dnsT = 0;
    const self = {
      enter() { PQ.music(PQ.TRACKS.boss); },
      update(dt) {
        const I = PQ.input;
        cards.forEach((c) => { if (c.state === 'open' && PQ.time >= c.deadline) { c.state = 'dead'; PQ.sfx('boom'); } });
        const green = cards.filter((c) => c.state === 'green').length, dead = cards.filter((c) => c.state === 'dead').length;
        if (phase === 'triage') {
          if (dead >= 2) { phase = 'lost'; PQ.sfx('fail'); return; }
          if (green >= 3) { phase = 'dns'; dnsT = 0; PQ.sfx('pager'); return; }
          if (I.anyPressed('ArrowLeft', 'KeyA', 'ArrowUp', 'KeyW')) sel = (sel + 3) % 4;
          if (I.anyPressed('ArrowRight', 'KeyD', 'ArrowDown', 'KeyS')) sel = (sel + 1) % 4;
          let pick = I.anyPressed('Enter', 'Space') ? sel : -1;
          cards.forEach((c, i) => { if (I.mouse.clicked && PQ.inRect(I.mouse, 8 + (i % 2) * 156, 50 + Math.floor(i / 2) * 76, 148, 70)) pick = sel = i; });
          if (pick >= 0 && cards[pick].state === 'open') {
            const c = cards[pick];
            PQ.runMinigame({ id: c.game, level: c.level, bossName: 'THE GREAT OUTAGE', canDrone: st().items.drone > 0,
              onDone(r) { if (r.drone) { st().items.drone--; PQ.save(); } if (r.success && PQ.time < c.deadline) c.state = 'green'; PQ.setScene(self); } });
          } else if (pick >= 0) PQ.sfx('error');
        } else if (phase === 'dns') {
          dnsT += dt;
          if (I.anyPressed('Enter', 'Space', 'KeyN') || (I.mouse.clicked && PQ.inRect(I.mouse, 110, 120, 100, 40))) {
            PQ.sfx('trombone');
            phase = 'won';
            const reward = dnsT <= 10 ? CFG.bosses.outage.reward : CFG.bosses.outage.lateReward;
            const s = st();
            s.bosses.outage = true; s.td += reward; s.earned += reward; s.beatGame = true;
            PQ.save();
            setTimeout(() => PQ.setScene(endingScene(reward, dnsT)), 1800);
          }
        } else if (phase === 'lost') {
          if (I.anyPressed('Enter', 'Space') || I.mouse.clicked) PQ.setScene(bossRetreat('outage'));
        }
      },
      draw(g, dt) {
        PQ.rect(g, 0, 0, 320, 240, C.black);
        PQ.binaryRain(g, dt, '#3a0a1a');
        PQ.text(g, 'THE GREAT OUTAGE', 160, 8, C.red, { align: 'center', size: 10 });
        if (phase === 'triage' || phase === 'lost') {
          PQ.text(g, 'RESTORE 3 OF 4. TIMERS NEVER STOP.', 160, 26, C.ice, { align: 'center', size: 6 });
          PQ.text(g, '2,200 SITES DOWN - MOST URGENT FIRST!', 160, 36, blink(4) ? C.red : C.orange, { align: 'center', size: 6 });
          cards.forEach((c, i) => {
            const x = 8 + (i % 2) * 156, y = 50 + Math.floor(i / 2) * 76;
            const left = c.deadline - PQ.time;
            PQ.box(g, x, y, 148, 70, c.state === 'green' ? '#0a3a20' : c.state === 'dead' ? C.dgrey : i === sel ? C.blue : C.navy);
            PQ.text(g, c.name, x + 74, y + 8, C.white, { size: 6, align: 'center' });
            PQ.text(g, PQ.minigames[c.game].title, x + 74, y + 22, C.cyan, { size: 6, align: 'center' });
            if (c.state === 'open') {
              PQ.text(g, PQ.fmtTime(left), x + 74, y + 36, left < 15 ? (blink(6) ? C.red : C.yellow) : C.white, { size: 12, align: 'center' });
              PQ.rect(g, x + 10, y + 56, 128 * PQ.clamp(left / c.timer, 0, 1), 4, left < 15 ? C.red : C.yellow);
            } else PQ.text(g, c.state === 'green' ? 'RESTORED' : 'LOST', x + 74, y + 40, c.state === 'green' ? C.green : C.red, { size: 8, align: 'center' });
          });
          if (phase === 'lost') { PQ.box(g, 60, 100, 200, 40, C.black); PQ.text(g, 'TOO MANY SITES LOST', 160, 108, C.red, { align: 'center' }); PQ.text(g, 'ENTER', 160, 124, C.white, { align: 'center', size: 6 }); }
          PQ.text(g, 'ARROWS + ENTER OR CLICK A CARD', 160, 210, C.grey, { align: 'center', size: 6 });
        } else {
          PQ.text(g, '3 SITES RESTORED... BUT IT KEEPS COMING BACK.', 160, 40, C.ice, { align: 'center', size: 6 });
          PQ.text(g, 'EVERY CLUE HAS FAILED. ONE ANSWER REMAINS.', 160, 54, C.ice, { align: 'center', size: 6 });
          if (phase === 'dns') PQ.text(g, PQ.fmtTime(Math.max(0, 10 - dnsT)), 160, 90, dnsT <= 10 ? C.yellow : C.dgrey, { align: 'center', size: 12 });
          PQ.button(g, 110, 120, 100, 40, 'DNS', blink(4));
          if (phase === 'won') PQ.text(g, 'IT WAS DNS. IT WAS ALWAYS DNS.', 160, 180, C.yellow, { align: 'center', size: 6 });
        }
      },
    };
    return self;
  }

  // ================= Leaderboard =================
  const BOARD_KEY = 'pq.board.v1';
  PQ.board = {
    load() { try { return JSON.parse(localStorage.getItem(BOARD_KEY)) || []; } catch (e) { return []; } },
    add(entry) {
      const b = this.load(); b.push(entry); b.sort((a, c) => c.earned - a.earned);
      try { localStorage.setItem(BOARD_KEY, JSON.stringify(b.slice(0, 8))); } catch (e) { /* storage blocked */ }
    },
  };
  function drawBoard(g, y0) {
    const b = PQ.board.load();
    PQ.text(g, 'TOP ENGINEERS THIS QUARTER', 160, y0, C.yellow, { align: 'center' });
    if (!b.length) PQ.text(g, 'NO ENTRIES YET. BE THE FIRST.', 160, y0 + 20, C.grey, { align: 'center', size: 6 });
    b.slice(0, 8).forEach((e, i) => {
      const y = y0 + 20 + i * 14;
      PQ.text(g, (i + 1) + '. ' + e.name, 28, y, i === 0 ? C.yellow : C.ice, { size: 6 });
      PQ.text(g, e.rank, 190, y, C.grey, { size: 6, align: 'center' });
      PQ.text(g, e.earned + ' T$', 292, y, C.green, { size: 6, align: 'right' });
    });
    PQ.text(g, 'ENTER = BACK', 160, y0 + 186, C.dgrey, { align: 'center', size: 6 });
  }

  function nameEntry(onDone) {
    let name = '';
    return {
      update() {
        const I = PQ.input;
        for (let c = 65; c <= 90; c++) if (I.pressed('Key' + String.fromCharCode(c)) && name.length < 12) { name += String.fromCharCode(c); PQ.sfx('blip'); }
        for (let d = 0; d <= 9; d++) if (I.pressed('Digit' + d) && name.length < 12) { name += d; PQ.sfx('blip'); }
        if (I.pressed('Space') && name && name.length < 12) name += ' ';
        if (I.pressed('Backspace')) name = name.slice(0, -1);
        if (I.pressed('Enter')) { PQ.sfx('select'); onDone(name.trim() || 'TECH'); }
      },
      draw(g, dt) {
        PQ.rect(g, 0, 0, 320, 240, C.black);
        PQ.binaryRain(g, dt);
        PQ.box(g, 40, 80, 240, 80);
        PQ.text(g, 'ENTER YOUR NAME', 160, 92, C.yellow, { align: 'center' });
        PQ.rect(g, 64, 110, 192, 16, C.black);
        PQ.text(g, name + (blink(4) ? '_' : ''), 70, 114, C.white);
        PQ.text(g, 'TYPE, THEN ENTER', 160, 140, C.grey, { align: 'center', size: 6 });
      },
    };
  }
  function submitScore(then) {
    const s = st();
    PQ.setScene(nameEntry((name) => {
      PQ.board.add({ name, earned: s.earned, rank: CFG.ranks[rank()].name.split(' ')[0].toUpperCase(), date: new Date().toISOString().slice(0, 10) });
      then();
    }));
  }

  // ================= Ending =================
  function endingScene(reward, dnsT) {
    let t = 0;
    const s = st();
    return {
      enter() { PQ.music(PQ.TRACKS.title); PQ.sfx('success'); },
      update(dt) {
        t += dt;
        if (t > 2 && (PQ.input.anyPressed('Enter', 'Space') || PQ.input.mouse.clicked)) submitScore(() => PQ.setScene(titleScene()));
      },
      draw(g, dt) {
        PQ.rect(g, 0, 0, 320, 240, C.black);
        PQ.binaryRain(g, dt);
        [100, 50, 20, 10].forEach((d, i) => PQ.drawBill(g, 40 + i * 42, 26 + Math.sin(t * 2 + i) * 4, 96, 44, d, -0.5 + i * 0.12));
        PQ.text(g, 'THE GREAT OUTAGE', 160, 100, C.green, { align: 'center', size: 10 });
        PQ.text(g, 'IS RESOLVED', 160, 114, C.green, { align: 'center', size: 10 });
        PQ.text(g, 'YOU ARE NOW', 160, 136, C.ice, { align: 'center', size: 6 });
        PQ.text(g, 'PRINCIPAL OF THE PACKET REALM', 160, 148, blink(3) ? C.yellow : C.orange, { align: 'center', size: 8 });
        PQ.text(g, 'ROOT CAUSE FOUND IN ' + dnsT.toFixed(1) + 's  +' + reward + ' T$', 160, 166, C.cyan, { align: 'center', size: 6 });
        PQ.text(g, 'LIFETIME ' + s.earned + ' T$  TICKETS ' + s.closed + '  DNS ' + s.dnsUses, 160, 180, C.ice, { align: 'center', size: 6 });
        PQ.text(g, 'PLAY TIME ' + PQ.fmtTime(s.playTime), 160, 192, C.ice, { align: 'center', size: 6 });
        if (t > 2) PQ.text(g, 'ENTER = SIGN THE LEADERBOARD', 160, 216, blink() ? C.white : C.cyan, { align: 'center', size: 6 });
      },
    };
  }

  // ================= Title =================
  function startGame(fresh) {
    if (fresh) { PQ.wipeSave(); PQ.state = PQ.newState(); }
    OW.reset();
    PQ.tickets.reset();
    PQ.setScene(OW.scene);
    if (fresh) { OW.toast('WELCOME, TIER 1. GRAB A TICKET AT HQ.', C.cyan); OW.toast('E INTERACT  SPACE ZAP  SHIFT RUN', C.grey); }
  }
  function titleScene() {
    let sel = 0, t = 0, view = 'menu';
    const save = PQ.load();
    const menu = save ? ['CONTINUE', 'NEW GAME', 'HOW TO PLAY', 'LEADERBOARD'] : ['NEW GAME', 'HOW TO PLAY', 'LEADERBOARD'];
    const HELP = [
      'You are a junior network engineer.',
      'Take tickets at HQ, walk to the site,',
      'solve the mini-game before the SLA',
      'runs out. Earn TECH$$$. Rank up.',
      '',
      'ARROWS/WASD move    SHIFT run',
      'E/ENTER interact    SPACE zap',
      'C coffee   P ack pager   M mute',
      '',
      'Spend T$ at the Supply Depot.',
      'Beat 3 bosses, then The Great Outage.',
      'Stuck in a puzzle? Something small',
      'may appear in the top-right corner...',
    ];
    return {
      enter() { PQ.music(PQ.TRACKS.title); },
      update(dt) {
        t += dt;
        const I = PQ.input;
        if (view !== 'menu') { if (I.anyPressed('Enter', 'Escape', 'Space') || I.mouse.clicked) { view = 'menu'; PQ.sfx('blip'); } return; }
        if (I.anyPressed('ArrowUp', 'KeyW')) { sel = (sel + menu.length - 1) % menu.length; PQ.sfx('blip'); }
        if (I.anyPressed('ArrowDown', 'KeyS')) { sel = (sel + 1) % menu.length; PQ.sfx('blip'); }
        let pick = I.anyPressed('Enter', 'Space') ? sel : -1;
        menu.forEach((_, i) => { if (I.mouse.clicked && PQ.inRect(I.mouse, 96, 148 + i * 16, 140, 14)) pick = sel = i; });
        if (pick < 0) return;
        PQ.sfx('select');
        const choice = menu[pick];
        if (choice === 'CONTINUE') { PQ.state = PQ.load(); startGame(false); }
        else if (choice === 'NEW GAME') startGame(true);
        else if (choice === 'HOW TO PLAY') view = 'help';
        else view = 'board';
      },
      draw(g, dt) {
        PQ.rect(g, 0, 0, 320, 240, C.black);
        PQ.binaryRain(g, dt);
        if (view === 'help') {
          PQ.box(g, 12, 12, 296, 216);
          PQ.text(g, 'HOW TO PLAY', 160, 22, C.yellow, { align: 'center' });
          HELP.forEach((l, i) => PQ.text(g, l, 24, 42 + i * 13, C.ice, { size: 6 }));
          return;
        }
        if (view === 'board') { PQ.box(g, 12, 12, 296, 216); drawBoard(g, 24); return; }
        [100, 50, 20, 10].forEach((d, i) => PQ.drawBill(g, 22 + i * 50, 14 + Math.sin(t * 1.5 + i) * 3, 110, 50, d, -0.42 + i * 0.1));
        PQ.text(g, 'PACKET QUEST', 160, 84, C.white, { align: 'center', size: 20 });
        PQ.text(g, 'THE TECH$$$ RUN', 160, 112, C.cyan, { align: 'center', size: 10 });
        menu.forEach((m, i) => PQ.text(g, (i === sel ? '> ' : '  ') + m, 100, 150 + i * 16, i === sel ? C.yellow : C.ice));
        PQ.text(g, 'A NETWORK ENGINEERING ADVENTURE', 160, 224, C.grey, { align: 'center', size: 6 });
      },
    };
  }
  PQ.titleScene = titleScene;
})();
