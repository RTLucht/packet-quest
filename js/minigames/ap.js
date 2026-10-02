// AP PLACEMENT: place access points on a hospital floorplan until the coverage heatmap is green with no dead zones.
(function () {
  'use strict';
  const PQ = window.PQ;
  const C = PQ.C;

  const X0 = 16, Y0 = 40, FW = 288, FH = 168, CS = 8;
  const GW = FW / CS, GH = FH / CS;
  const GOOD = 38, WEAK = 18;          // signal thresholds
  const DIST_LOSS = 0.62;              // per pixel
  const LOSS = { dry: 12, concrete: 30, lead: 200 };

  function segX(ax, ay, bx, by, cx, cy, dx, dy) {
    const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (d === 0) return false;
    const u = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
    const v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
    return u > 0 && u < 1 && v >= 0 && v <= 1;
  }

  // Horizontal wall from x1..x2 at y with door gaps (list of x centers)
  function hWall(walls, y, x1, x2, doors, type) {
    let x = x1;
    doors.sort((a, b) => a - b).forEach((d) => { walls.push({ x1: x, y1: y, x2: d - 7, y2: y, type }); x = d + 7; });
    walls.push({ x1: x, y1: y, x2: x2, y2: y, type });
  }

  function buildFloor(lvl) {
    const walls = [];
    const yTop = Y0 + 64, yBot = Y0 + 100;
    const topSplits = [X0 + 72, X0 + 144, X0 + 216];
    const botSplits = lvl >= 2 ? [X0 + 84, X0 + 170] : [X0 + 110];
    const wallType = () => (lvl === 3 && Math.random() < 0.4 ? 'concrete' : 'dry');
    const topEdges = [X0, ...topSplits, X0 + FW];
    hWall(walls, yTop, X0, X0 + FW, topEdges.slice(0, -1).map((x, i) => PQ.randi(x + 12, topEdges[i + 1] - 12)), wallType());
    const mriX = X0 + 216;
    const botEdges = [X0, ...botSplits, mriX];
    hWall(walls, yBot, X0, mriX, botEdges.slice(0, -1).map((x, i) => PQ.randi(x + 12, botEdges[i + 1] - 12)), wallType());
    topSplits.forEach((x) => walls.push({ x1: x, y1: Y0, x2: x, y2: yTop, type: wallType() }));
    botSplits.forEach((x) => walls.push({ x1: x, y1: yBot, x2: x, y2: Y0 + FH, type: wallType() }));
    // MRI suite: lead-lined, excluded from coverage
    const mri = { x: mriX, y: yBot, w: X0 + FW - mriX, h: Y0 + FH - yBot };
    walls.push({ x1: mri.x, y1: mri.y, x2: mri.x + mri.w, y2: mri.y, type: 'lead' });
    walls.push({ x1: mri.x, y1: mri.y, x2: mri.x, y2: mri.y + mri.h, type: 'lead' });
    // elevator shaft (concrete block in the corridor)
    const ev = { x: X0 + PQ.randi(100, 160), y: yTop, w: 16, h: yBot - yTop };
    [[ev.x, ev.y, ev.x + ev.w, ev.y], [ev.x, ev.y + ev.h, ev.x + ev.w, ev.y + ev.h], [ev.x, ev.y, ev.x, ev.y + ev.h], [ev.x + ev.w, ev.y, ev.x + ev.w, ev.y + ev.h]]
      .forEach(([a, b, c, d]) => walls.push({ x1: a, y1: b, x2: c, y2: d, type: 'concrete' }));
    const roomNames = ['ICU', 'PHARM', 'RAD', 'NURSE', 'LAB', 'ED', 'WAIT'];
    return { walls, mri, ev, yTop, yBot, topSplits, botSplits, roomNames: PQ.shuffle(roomNames) };
  }

  PQ.registerMinigame({
    id: 'ap',
    title: 'AP PLACEMENT',
    payout: 20,
    help: [
      'Clinicians report dead spots.',
      'Place APs so the heatmap is',
      'GREEN with no RED dead zones.',
      'Walls eat signal; MRI is lead!',
      'CLICK = place / remove AP',
      'ENTER or SURVEY = submit',
      'Beware the Interference Ghost',
    ],
    create(api) {
      const lvl = api.boss ? 3 : api.level;
      const budget = [3, 4, 4][lvl - 1] + (api.boss ? 1 : 0);
      const target = [0.80, 0.85, 0.88][lvl - 1];
      const limit = [60, 55, 50][lvl - 1] + (api.boss ? 15 : 0);
      const floor = buildFloor(lvl);
      const aps = [];
      let sig = [], dirty = true, done = false, t = 0, fails = 0, flash = 0, msg = null, shake = 0;
      let cur = { x: X0 + FW / 2, y: Y0 + FH / 2 };
      const ghosts = [];
      if (lvl >= 2) ghosts.push({ x: X0 + 40, y: Y0 + 80, vx: 22, vy: 14, tick: 0 });
      if (api.boss) ghosts.push({ x: X0 + 240, y: Y0 + 30, vx: -18, vy: 20, tick: 0 });
      let cov = { good: 0, dead: 0 };

      function excluded(x, y) {
        const m = floor.mri, e = floor.ev;
        return (x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h) || (x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h);
      }

      function recompute() {
        sig = [];
        let good = 0, dead = 0, total = 0;
        for (let gy = 0; gy < GH; gy++) {
          for (let gx = 0; gx < GW; gx++) {
            const cx = X0 + gx * CS + CS / 2, cy = Y0 + gy * CS + CS / 2;
            let best = -999;
            aps.forEach((a) => {
              let s = 100 - Math.hypot(a.x - cx, a.y - cy) * DIST_LOSS;
              floor.walls.forEach((w) => { if (segX(a.x, a.y, cx, cy, w.x1, w.y1, w.x2, w.y2)) s -= LOSS[w.type]; });
              if (s > best) best = s;
            });
            ghosts.forEach((gh) => { const d = Math.hypot(gh.x - cx, gh.y - cy); if (d < 30) best -= 30 * (1 - d / 30) + 10; });
            const ex = excluded(cx, cy);
            sig.push({ s: best, ex });
            if (!ex) { total++; if (best >= GOOD) good++; else if (best < WEAK) dead++; }
          }
        }
        cov = { good: good / total, dead };
        dirty = false;
      }

      function apAt(x, y) { return aps.findIndex((a) => Math.hypot(a.x - x, a.y - y) < 8); }
      function toggle(x, y) {
        const i = apAt(x, y);
        if (i >= 0) { aps.splice(i, 1); PQ.sfx('blip'); dirty = true; return; }
        if (excluded(x, y)) { PQ.sfx('error'); msg = { s: 'NOT IN THERE', t: 1 }; return; }
        if (aps.length >= budget) { PQ.sfx('error'); msg = { s: 'NO APS LEFT - REMOVE ONE', t: 1.2 }; return; }
        aps.push({ x, y, ch: [1, 6, 11][aps.length % 3] });
        PQ.sfx('select'); dirty = true;
      }
      function finish(success) {
        if (done) return;
        done = true;
        const q = success ? PQ.clamp(0.4 + 0.5 * (1 - t / limit) + 0.1 * (budget - aps.length) - 0.15 * fails, 0.1, 1) : 0;
        api.finish({ success, quality: q });
      }
      function survey() {
        recompute();
        if (cov.good >= target && cov.dead === 0) { PQ.sfx('cash'); finish(true); return; }
        fails++; flash = 1.2; shake = 0.3; t += 8;
        PQ.sfx('error');
        msg = { s: cov.dead > 0 ? 'DEAD ZONES! -8s' : 'COVERAGE LOW! -8s', t: 1.5 };
      }

      return {
        update(dt) {
          if (done) return;
          t += dt;
          flash = Math.max(0, flash - dt); shake = Math.max(0, shake - dt);
          if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
          if (t >= limit) { survey(); if (!done) finish(false); return; }
          ghosts.forEach((gh) => {
            gh.x += gh.vx * dt; gh.y += gh.vy * dt;
            if (gh.x < X0 + 10 || gh.x > X0 + FW - 10) gh.vx *= -1;
            if (gh.y < Y0 + 10 || gh.y > Y0 + FH - 10) gh.vy *= -1;
            gh.x = PQ.clamp(gh.x, X0 + 10, X0 + FW - 10); gh.y = PQ.clamp(gh.y, Y0 + 10, Y0 + FH - 10);
            gh.tick += dt;
            if (gh.tick > 0.25) { gh.tick = 0; dirty = true; }
          });
          const I = PQ.input, m = I.mouse;
          const sp = 90 * dt;
          if (I.down('ArrowLeft') || I.down('KeyA')) cur.x -= sp;
          if (I.down('ArrowRight') || I.down('KeyD')) cur.x += sp;
          if (I.down('ArrowUp') || I.down('KeyW')) cur.y -= sp;
          if (I.down('ArrowDown') || I.down('KeyS')) cur.y += sp;
          cur.x = PQ.clamp(cur.x, X0 + 2, X0 + FW - 2); cur.y = PQ.clamp(cur.y, Y0 + 2, Y0 + FH - 2);
          if (I.pressed('Space')) toggle(Math.round(cur.x), Math.round(cur.y));
          if (I.pressed('Enter')) survey();
          if (m.clicked) {
            if (PQ.inRect(m, 248, 214, 68, 18)) survey();
            else if (PQ.inRect(m, X0, Y0, FW, FH)) { cur = { x: m.x, y: m.y }; toggle(m.x, m.y); }
          }
          if (m.rclicked) { const i = apAt(m.x, m.y); if (i >= 0) { aps.splice(i, 1); PQ.sfx('blip'); dirty = true; } }
          if (dirty && !done) recompute();
        },
        draw(g) {
          const sx = shake > 0 ? PQ.randi(-2, 2) : 0;
          g.save(); g.translate(sx, 0);
          PQ.rect(g, -4, 16, 328, 224, C.black);
          PQ.text(g, 'APs ' + (budget - aps.length) + '/' + budget, 8, 22, C.ice, { size: 6 });
          PQ.text(g, 'GOOD ' + Math.round(cov.good * 100) + '% / ' + Math.round(target * 100) + '%', 74, 22, cov.good >= target ? C.green : C.yellow, { size: 6 });
          PQ.text(g, 'DEAD ' + cov.dead, 194, 22, cov.dead ? C.red : C.green, { size: 6 });
          PQ.text(g, PQ.fmtTime(limit - t), 312, 22, limit - t < 10 ? C.red : C.white, { size: 6, align: 'right' });
          if (api.boss) PQ.text(g, (api.bossName || 'BOSS') + ' WANTS COVERAGE', 160, 31, C.red, { size: 6, align: 'center' });

          PQ.rect(g, X0 - 2, Y0 - 2, FW + 4, FH + 4, C.grey);
          PQ.rect(g, X0, Y0, FW, FH, C.navy);
          PQ.rect(g, X0, floor.yTop, FW, floor.yBot - floor.yTop, C.blue);
          const m = floor.mri;
          PQ.rect(g, m.x, m.y, m.w, m.h, C.dgrey);
          PQ.text(g, 'MRI', m.x + m.w / 2, m.y + m.h / 2 - 4, C.grey, { size: 6, align: 'center' });
          PQ.rect(g, floor.ev.x, floor.ev.y, floor.ev.w, floor.ev.h, C.dgrey);
          PQ.text(g, 'EV', floor.ev.x + 8, floor.ev.y + 14, C.grey, { size: 6, align: 'center' });

          g.globalAlpha = flash > 0 && Math.floor(flash * 8) % 2 ? 0.75 : 0.42;
          sig.forEach((c, i) => {
            if (c.ex) return;
            const gx = i % GW, gy = Math.floor(i / GW);
            const col = c.s >= GOOD ? C.green : c.s >= WEAK ? C.yellow : C.red;
            PQ.rect(g, X0 + gx * CS, Y0 + gy * CS, CS, CS, col);
          });
          g.globalAlpha = 1;

          const tops = [X0, ...floor.topSplits, X0 + FW];
          tops.slice(0, -1).forEach((x, i) => PQ.text(g, floor.roomNames[i], (x + tops[i + 1]) / 2, Y0 + 4, C.ice, { size: 6, align: 'center' }));
          const bots = [X0, ...floor.botSplits, floor.mri.x];
          bots.slice(0, -1).forEach((x, i) => PQ.text(g, floor.roomNames[4 + i] || 'STOR', (x + bots[i + 1]) / 2, Y0 + FH - 10, C.ice, { size: 6, align: 'center' }));

          floor.walls.forEach((w) => {
            const col = w.type === 'lead' ? C.purple : w.type === 'concrete' ? C.grey : C.ice;
            const th = w.type === 'dry' ? 2 : 3;
            if (w.y1 === w.y2) PQ.rect(g, Math.min(w.x1, w.x2), w.y1 - 1, Math.abs(w.x2 - w.x1), th, col);
            else PQ.rect(g, w.x1 - 1, Math.min(w.y1, w.y2), th, Math.abs(w.y2 - w.y1), col);
          });

          aps.forEach((a) => {
            PQ.rect(g, a.x - 4, a.y - 3, 8, 6, C.white);
            PQ.rect(g, a.x - 3, a.y - 2, 6, 4, C.royal);
            PQ.rect(g, a.x - 1, a.y - 1, 2, 2, Math.floor(t * 4) % 2 ? C.green : C.cyan);
            PQ.text(g, 'ch' + a.ch, a.x, a.y + 5, C.white, { size: 6, align: 'center' });
          });

          // Interference Ghost: the floating microwave
          ghosts.forEach((gh) => {
            const bob = Math.sin(t * 4) * 2;
            g.globalAlpha = 0.25;
            g.fillStyle = C.purple; g.beginPath(); g.arc(gh.x, gh.y, 30, 0, Math.PI * 2); g.fill();
            g.globalAlpha = 1;
            PQ.rect(g, gh.x - 9, gh.y - 6 + bob, 18, 12, C.ice);
            PQ.rect(g, gh.x - 7, gh.y - 4 + bob, 10, 8, C.black);
            PQ.rect(g, gh.x - 6, gh.y - 3 + bob, 3, 2, Math.floor(t * 6) % 2 ? C.yellow : C.orange);
            PQ.rect(g, gh.x + 5, gh.y - 4 + bob, 2, 2, C.red);
            PQ.rect(g, gh.x + 5, gh.y + bob, 2, 2, C.dgrey);
            for (let i = 0; i < 3; i++) PQ.rect(g, gh.x - 9 + i * 7, gh.y + 6 + bob + ((i + Math.floor(t * 6)) % 2), 4, 3, C.ice);
          });

          const cc = Math.floor(t * 4) % 2 ? C.yellow : C.white;
          PQ.rect(g, cur.x - 5, cur.y, 3, 1, cc); PQ.rect(g, cur.x + 3, cur.y, 3, 1, cc);
          PQ.rect(g, cur.x, cur.y - 5, 1, 3, cc); PQ.rect(g, cur.x, cur.y + 3, 1, 3, cc);

          PQ.button(g, 248, 214, 68, 18, 'SURVEY', PQ.inRect(PQ.input.mouse, 248, 214, 68, 18));
          PQ.text(g, 'GOOD', 8, 220, C.green, { size: 6 }); PQ.text(g, 'WEAK', 44, 220, C.yellow, { size: 6 }); PQ.text(g, 'DEAD', 80, 220, C.red, { size: 6 });
          if (msg) PQ.text(g, msg.s, 160, 124, C.yellow, { align: 'center' });
          g.restore();
        },
      };
    },
  });
})();
