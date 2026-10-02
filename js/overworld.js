// Overworld: The Enterprise. Tile map, player, sites, roaming enemies, day/night clock.
(function () {
  'use strict';
  const PQ = window.PQ;
  const C = PQ.C;
  const TS = 16, MW = 48, MH = 30, VIEW_Y = 16, VIEW_H = 224;
  const SOLID = { T: 1, '~': 1, B: 1, G: 1 };

  // ---- Map construction (deterministic) ----
  let seed = 1337;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  const tiles = [];
  for (let y = 0; y < MH; y++) { tiles.push([]); for (let x = 0; x < MW; x++) tiles[y].push(x === 0 || y === 0 || x === MW - 1 || y === MH - 1 ? 'T' : '.'); }
  const set = (x, y, c) => { if (x > 0 && y > 0 && x < MW - 1 && y < MH - 1) tiles[y][x] = c; };
  const road = (x, y) => { if (tiles[y][x] === '.') set(x, y, '#'); else if (tiles[y][x] === '~') set(x, y, '='); };

  // rivers (data streams)
  for (let y = 1; y < MH - 1; y++) { set(14, y, '~'); set(36, y, '~'); }
  for (let x = 15; x < 36; x++) set(x, 9, '~');
  // main roads
  for (let x = 1; x < MW - 1; x++) road(x, 18);
  for (let y = 2; y < MH - 1; y++) road(24, y);
  for (let y = 3; y < MH - 1; y++) { road(7, y); road(42, y); }
  const gates = [
    { x: 36, y: 18, rank: 2, label: 'DATA CENTER BADGE: NETWORK ENGINEER' },
    { x: 24, y: 9, rank: 3, label: 'HQ CAMPUS BADGE: SENIOR ENGINEER' },
  ];

  PQ.SITES = [];
  function building(id, name, x, y, w, h, doorX, doorSide, jx, jy, info) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, 'B');
    const dy = doorSide === 'top' ? y : y + h - 1;
    set(doorX, dy, 'D');
    let cx = doorX, cy = doorSide === 'top' ? dy - 1 : dy + 1;
    road(cx, cy);
    while (cy !== jy) { cy += Math.sign(jy - cy); road(cx, cy); }
    while (cx !== jx) { cx += Math.sign(jx - cx); road(cx, cy); }
    PQ.SITES.push(Object.assign({ id, name, x, y, w, h, doorX, doorY: dy, doorSide }, info));
  }
  building('hq', 'HQ', 17, 11, 6, 5, 20, 'bottom', 20, 18, { kind: 'hq', world: 0 });
  building('depot', 'SUPPLY DEPOT', 27, 12, 5, 4, 29, 'bottom', 29, 18, { kind: 'shop', world: 0 });
  building('noc', 'NOC WAR ROOM', 27, 21, 6, 4, 29, 'top', 29, 18, { kind: 'final', world: 0 });
  building('branch', 'BRANCH CLINIC', 2, 3, 5, 4, 4, 'bottom', 7, 8, { kind: 'site', world: 1, boss: 'loop' });
  building('remote', 'REMOTE CLINIC', 9, 11, 4, 4, 10, 'bottom', 7, 15, { kind: 'site', world: 1 });
  building('idf', 'IDF CLOSET 2B', 2, 21, 4, 3, 3, 'top', 3, 18, { kind: 'site', world: 1 });
  building('pharm', 'PHARMACY', 9, 22, 4, 4, 10, 'top', 10, 18, { kind: 'site', world: 1 });
  building('dc', 'DATA CENTER', 43, 2, 4, 6, 44, 'bottom', 42, 9, { kind: 'site', world: 2, boss: 'bgp' });
  building('colo', 'COLO CAGE', 37, 11, 4, 4, 38, 'bottom', 42, 16, { kind: 'site', world: 2 });
  building('roof', 'ROOFTOP', 43, 21, 4, 4, 44, 'top', 42, 19, { kind: 'site', world: 2 });
  building('tower', 'HQ TOWER', 17, 2, 6, 5, 19, 'bottom', 24, 7, { kind: 'site', world: 3, boss: 'auditor' });
  building('med', 'MEDICAL CENTER', 27, 2, 7, 5, 30, 'bottom', 24, 8, { kind: 'site', world: 3 });
  PQ.siteById = (id) => PQ.SITES.find((s) => s.id === id);

  for (let i = 0; i < 170; i++) {
    const x = 1 + Math.floor(rnd() * (MW - 2)), y = 1 + Math.floor(rnd() * (MH - 2));
    if (tiles[y][x] !== '.') continue;
    let nearRoad = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = (tiles[y + dy] || [])[x + dx]; if (c && c !== '.' && c !== 'T' && c !== '~' && c !== 'f') nearRoad = true; }
    if (!nearRoad) set(x, y, rnd() < 0.85 ? 'T' : 'f');
  }

  const worldOf = (tx, ty) => (tx < 14 ? 1 : tx > 36 ? 2 : ty < 9 ? 3 : 0);

  // ---- Static map prerender ----
  let mapCanvas = null;
  const isRoadCh = (c) => c === '#' || c === 'D' || c === '=' || c === 'G';
  function prerender() {
    mapCanvas = document.createElement('canvas');
    mapCanvas.width = MW * TS; mapCanvas.height = MH * TS;
    const g = mapCanvas.getContext('2d');
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const c = tiles[y][x], px = x * TS, py = y * TS;
        PQ.rect(g, px, py, TS, TS, C.navy);
        if ((x * 7 + y * 13) % 5 === 0) PQ.rect(g, px + 4, py + 10, 1, 1, C.blue);
        if ((x * 3 + y * 11) % 7 === 0) PQ.rect(g, px + 11, py + 4, 1, 1, C.blue);
        if (c === '#' || c === 'D' || c === '=') {
          PQ.rect(g, px, py, TS, TS, C.blue);
          const isR = (xx, yy) => isRoadCh((tiles[yy] || [])[xx]);
          if (!isR(x, y - 1)) PQ.rect(g, px, py, TS, 1, C.sky);
          if (!isR(x, y + 1)) PQ.rect(g, px, py + TS - 1, TS, 1, C.sky);
          if (!isR(x - 1, y)) PQ.rect(g, px, py, 1, TS, C.sky);
          if (!isR(x + 1, y)) PQ.rect(g, px + TS - 1, py, 1, TS, C.sky);
          if (isR(x - 1, y) || isR(x + 1, y)) { PQ.rect(g, px + 2, py + 7, 4, 2, C.royal); PQ.rect(g, px + 10, py + 7, 4, 2, C.royal); }
          else { PQ.rect(g, px + 7, py + 2, 2, 4, C.royal); PQ.rect(g, px + 7, py + 10, 2, 4, C.royal); }
          if (c === '=') {
            const vert = x === 14 || x === 36;
            if (vert) { PQ.rect(g, px, py + 1, TS, 2, C.brown); PQ.rect(g, px, py + 13, TS, 2, C.brown); }
            else { PQ.rect(g, px + 1, py, 2, TS, C.brown); PQ.rect(g, px + 13, py, 2, TS, C.brown); }
          }
        } else if (c === 'T') {
          PQ.rect(g, px + 7, py + 11, 2, 4, C.brown);
          PQ.rect(g, px + 3, py + 6, 10, 6, '#1f7a44');
          PQ.rect(g, px + 5, py + 2, 6, 5, '#1f7a44');
          PQ.rect(g, px + 5, py + 7, 3, 2, C.green);
          PQ.rect(g, px + 7, py + 3, 2, 2, C.green);
        } else if (c === 'f') {
          PQ.rect(g, px + 4, py + 6, 2, 2, C.cyan); PQ.rect(g, px + 10, py + 9, 2, 2, C.yellow); PQ.rect(g, px + 6, py + 11, 2, 2, C.ice);
        }
      }
    }
    PQ.SITES.forEach((s) => {
      const px = s.x * TS, py = s.y * TS, w = s.w * TS, h = s.h * TS;
      const roof = s.kind === 'hq' ? C.royal : s.kind === 'shop' ? C.brown : s.kind === 'final' ? C.red : s.world === 2 ? C.dgrey : s.world === 3 ? C.purple : C.sky;
      PQ.rect(g, px, py, w, h, C.grey);
      PQ.rect(g, px, py, w, 10, roof);
      PQ.rect(g, px, py + 10, w, 2, C.black);
      for (let wy = py + 16; wy < py + h - 12; wy += 12) for (let wx = px + 6; wx < px + w - 8; wx += 12) { PQ.rect(g, wx, wy, 6, 6, C.cyan); PQ.rect(g, wx, wy, 6, 2, C.ice); }
      if (s.kind === 'hq') PQ.drawBill(g, px + w / 2 - 22, py + 16, 44, 20, '');
      if (s.id === 'dc') for (let i = 0; i < 4; i++) PQ.rect(g, px + 8 + i * 12, py + 16, 6, h - 34, C.black);
      const dx = s.doorX * TS, dy = s.doorY * TS, top = s.doorSide === 'top';
      PQ.rect(g, dx + 3, top ? dy : dy + 4, 10, 12, C.black);
      PQ.rect(g, dx + 4, top ? dy + 1 : dy + 5, 8, 11, C.brown);
      PQ.rect(g, dx + 10, top ? dy + 6 : dy + 10, 1, 2, C.yellow);
    });
  }

  // ---- Overworld scene ----
  const OW = (PQ.overworld = {});
  const player = { x: 0, y: 0, dir: 'down', anim: 0, stam: 100, hurt: 0, zap: 0 };
  let enemies = [], chests = [], toasts = [], bills = [], cam = { x: 0, y: 0 }, t = 0, prompt = null, clockMin = 8 * 60;
  OW.player = player;

  OW.reset = function () {
    const st = PQ.state;
    const hq = PQ.siteById('hq');
    player.x = st.px != null ? st.px : hq.doorX * TS + 8;
    player.y = st.py != null ? st.py : (hq.doorY + 1) * TS + 6;
    player.stam = 100;
    enemies = []; chests = []; bills = []; toasts = [];
    clockMin = st.clock || 8 * 60;
  };
  OW.toast = function (s, col) { toasts.push({ s, col: col || C.yellow, t: 3.5 }); if (toasts.length > 4) toasts.shift(); };
  OW.burstBills = function (amount) {
    const n = Math.min(12, Math.max(2, Math.floor(amount / 10)));
    for (let i = 0; i < n; i++) bills.push({ x: 160 + PQ.rand(-30, 30), y: 130 + PQ.rand(-20, 20), vx: PQ.rand(-60, 60), vy: PQ.rand(-120, -40), r: PQ.rand(-1, 1), t: 1.2 + i * 0.03 });
  };

  function solidAt(px, py) {
    const c = (tiles[Math.floor(py / TS)] || [])[Math.floor(px / TS)];
    return c === undefined || !!SOLID[c];
  }
  function gateAt(tx, ty) { return gates.find((g) => g.x === tx && g.y === ty); }
  OW.refreshGates = function () {
    const rank = PQ.rankOf(PQ.state.earned);
    gates.forEach((g) => set(g.x, g.y, rank >= g.rank ? '=' : 'G'));
  };
  const collide = (x, y) => solidAt(x - 5, y - 3) || solidAt(x + 5, y - 3) || solidAt(x - 5, y + 6) || solidAt(x + 5, y + 6);

  function isNight() { const h = Math.floor(clockMin / 60) % 24; return h >= 2 && h < 4; }
  function nightAlpha() {
    const h = (clockMin / 60) % 24;
    if (h >= 20 || h < 5) return 0.45;
    if (h >= 18) return ((h - 18) / 2) * 0.45;
    if (h < 7) return ((7 - h) / 2) * 0.45;
    return 0;
  }

  function spawnEnemies(dt) {
    const rank = PQ.rankOf(PQ.state.earned);
    const want = { gremlin: 4, slime: rank >= 2 ? 3 : 0, ghost: 2, phantom: isNight() ? 1 : 0 };
    Object.keys(want).forEach((type) => {
      const have = enemies.filter((e) => e.type === type).length;
      if (have >= want[type] || Math.random() > dt * (type === 'phantom' ? 3 : 0.5)) return;
      for (let tries = 0; tries < 20; tries++) {
        const tx = PQ.randi(1, MW - 2), ty = PQ.randi(1, MH - 2);
        if (solidAt(tx * TS + 8, ty * TS + 8)) continue;
        const w = worldOf(tx, ty);
        if (type === 'slime' && w !== 2 && w !== 3) continue;
        if ((w === 2 && rank < 2) || (w === 3 && rank < 3)) continue;
        const ex = tx * TS + 8, ey = ty * TS + 8;
        if (Math.hypot(ex - player.x, ey - player.y) < 120) continue;
        enemies.push({ type, x: ex, y: ey, vx: 0, vy: 0, t: 0, hp: type === 'phantom' ? 3 : 1, size: type === 'slime' ? 2 : 1, stun: 0 });
        if (type === 'phantom') OW.toast('THE CHANGE WINDOW PHANTOM STIRS...', C.purple);
        break;
      }
    });
    if (chests.length < 2 && Math.random() < dt * 0.05) {
      const tx = PQ.randi(2, MW - 3), ty = PQ.randi(2, MH - 3);
      const w = worldOf(tx, ty), rank = PQ.rankOf(PQ.state.earned);
      if (tiles[ty][tx] === '.' && !((w === 2 && rank < 2) || (w === 3 && rank < 3))) chests.push({ x: tx * TS + 8, y: ty * TS + 8 });
    }
  }

  function stealTD(n, why) {
    const st = PQ.state;
    const lost = Math.min(st.td, n);
    st.td -= lost;
    OW.toast((lost ? '-' + lost + ' T$  ' : '') + why, C.red);
  }

  function nearDoor() {
    const reach = PQ.state.items.reach ? 34 : 18;
    let best = null, bd = 1e9;
    PQ.SITES.forEach((s) => {
      const dx = s.doorX * TS + 8, dy = s.doorSide === 'top' ? s.doorY * TS - 4 : (s.doorY + 1) * TS + 4;
      const d = Math.hypot(dx - player.x, dy - player.y);
      if (d < reach && d < bd) { bd = d; best = s; }
    });
    return best;
  }

  OW.scene = {
    enter() {
      OW.refreshGates();
      if (!mapCanvas) prerender();
      PQ.music(PQ.TRACKS.overworld);
    },
    update(dt) {
      const st = PQ.state, I = PQ.input;
      t += dt;
      st.playTime += dt;
      clockMin = (clockMin + dt * 4) % (24 * 60);
      st.clock = clockMin;
      player.hurt = Math.max(0, player.hurt - dt);
      player.zap = Math.max(0, player.zap - dt);
      toasts.forEach((ts) => { ts.t -= dt; });
      toasts = toasts.filter((ts) => ts.t > 0);
      bills.forEach((b) => { b.t -= dt; b.vy += 200 * dt; b.x += b.vx * dt; b.y += b.vy * dt; });
      bills = bills.filter((b) => b.t > 0);

      const tk = st.active;
      let ghostSlow = 1, slaRate = 1;
      enemies.forEach((e) => { if (e.type === 'ghost' && Math.hypot(e.x - player.x, e.y - player.y) < 40) { ghostSlow = 0.55; slaRate = 2; } });
      if (tk) tk.slaLeft -= dt * slaRate;
      PQ.tickets.tick(dt);

      let mx = 0, my = 0;
      if (I.down('ArrowLeft') || I.down('KeyA')) mx -= 1;
      if (I.down('ArrowRight') || I.down('KeyD')) mx += 1;
      if (I.down('ArrowUp') || I.down('KeyW')) my -= 1;
      if (I.down('ArrowDown') || I.down('KeyS')) my += 1;
      const sprint = (I.down('ShiftLeft') || I.down('ShiftRight')) && player.stam > 0 && (mx || my);
      const spd = (sprint ? 115 : 72) * ghostSlow;
      if (sprint) player.stam = Math.max(0, player.stam - 30 * dt); else player.stam = Math.min(100, player.stam + 8 * dt);
      if (mx || my) {
        const len = Math.hypot(mx, my);
        const nx = player.x + (mx / len) * spd * dt, ny = player.y + (my / len) * spd * dt;
        if (!collide(nx, player.y)) player.x = nx;
        if (!collide(player.x, ny)) player.y = ny;
        player.dir = Math.abs(mx) > Math.abs(my) ? (mx < 0 ? 'left' : 'right') : (my < 0 ? 'up' : 'down');
        const before = Math.floor(player.anim);
        player.anim += dt * (sprint ? 12 : 8);
        if (Math.floor(player.anim) !== before && Math.floor(player.anim) % 2 === 0) PQ.sfx('step');
      }
      const ftx = Math.floor((player.x + mx * 12) / TS), fty = Math.floor((player.y + my * 12) / TS);
      const gt = gateAt(ftx, fty);
      prompt = gt && tiles[fty][ftx] === 'G' && (mx || my) ? { s: 'LOCKED - ' + gt.label, col: C.red } : null;

      if (I.pressed('KeyC') && st.items.mugs > 0 && player.stam < 100) { st.items.mugs--; player.stam = 100; PQ.sfx('coin'); OW.toast('COFFEE! STAMINA FULL', C.orange); }

      // zap (console cable)
      if (I.pressed('Space') && player.zap <= 0 && player.stam >= 15) {
        player.zap = 0.35; player.stam -= 15; PQ.sfx('zap');
        const range = st.items.reach ? 44 : 28;
        const spawned = [];
        enemies.forEach((e) => {
          if (Math.hypot(e.x - player.x, e.y - player.y) > range) return;
          if (e.type === 'ghost') { const a = Math.atan2(e.y - player.y, e.x - player.x); e.x += Math.cos(a) * 30; e.y += Math.sin(a) * 30; e.stun = 1.5; return; }
          e.hp--; e.stun = 0.6;
          if (e.type === 'slime' && e.size > 0) {
            e.size--; e.hp = 1;
            spawned.push({ type: 'slime', x: e.x + 8, y: e.y, vx: 0, vy: 0, t: 0, hp: 1, size: e.size, stun: 0.6 });
            OW.toast('SHADOW IT SPLIT! UNMANAGED SWITCH!', C.purple);
          } else if (e.hp <= 0) {
            e.dead = true; PQ.sfx('hit');
            if (e.type === 'phantom') { st.td += 25; st.earned += 25; OW.toast('PHANTOM BANISHED +25 T$', C.green); OW.burstBills(25); }
            else if (e.type === 'slime') { st.td += 3; st.earned += 3; OW.toast('+3 T$  SWITCH DECOMMISSIONED', C.green); }
            else if (Math.random() < 0.35) { st.td += 5; st.earned += 5; OW.toast('+5 T$  LOOSE CHANGE', C.green); }
          }
        });
        enemies = enemies.filter((e) => !e.dead).concat(spawned);
      }

      spawnEnemies(dt);
      enemies.forEach((e) => {
        e.t += dt;
        if (e.stun > 0) { e.stun -= dt; return; }
        const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1;
        let sp = 0;
        const wander = (every, speed) => { if (e.t > every) { e.t = 0; const a = Math.random() * 6.28; e.vx = Math.cos(a); e.vy = Math.sin(a); } sp = speed; };
        if (e.type === 'gremlin') { if (d < 90) { sp = 50; e.vx = dx / d; e.vy = dy / d; } else wander(1.5, 25); }
        else if (e.type === 'slime') { if (d < 70) { sp = 30; e.vx = dx / d; e.vy = dy / d; } else wander(2, 12); }
        else if (e.type === 'ghost') wander(3, 14);
        else if (e.type === 'phantom') { sp = 40; e.vx = dx / d; e.vy = dy / d; if (!isNight()) e.dead = true; }
        const nx = e.x + e.vx * sp * dt, ny = e.y + e.vy * sp * dt;
        if (e.type === 'ghost' || e.type === 'phantom' || !collide(nx, ny)) { e.x = PQ.clamp(nx, 20, MW * TS - 20); e.y = PQ.clamp(ny, 20, MH * TS - 20); }
        else { e.vx *= -1; e.vy *= -1; }
        if (d < 12 && player.hurt <= 0 && e.type !== 'ghost') {
          player.hurt = 1.2; PQ.sfx('hit');
          const a = Math.atan2(dy, dx);
          for (let k = 0; k < 4; k++) { const nx2 = player.x + Math.cos(a) * 6, ny2 = player.y + Math.sin(a) * 6; if (!collide(nx2, ny2)) { player.x = nx2; player.y = ny2; } }
          if (e.type === 'gremlin') stealTD(5, 'GREMLIN UNPLUGGED YOUR LAPTOP');
          if (e.type === 'slime') { if (tk) { tk.slaLeft -= 8; OW.toast('-8s SLA  SHADOW IT SLIME', C.purple); } else stealTD(3, 'SHADOW IT SLIME'); }
          if (e.type === 'phantom') { if (tk) { tk.slaLeft -= 20; OW.toast('CHANGE ROLLED BACK! -20s SLA', C.red); } else stealTD(10, 'CHANGE WINDOW PHANTOM'); }
        }
      });
      enemies = enemies.filter((e) => !e.dead);

      // chests: maybe Firmware Mimics
      for (let i = chests.length - 1; i >= 0; i--) {
        const ch = chests[i];
        if (Math.hypot(ch.x - player.x, ch.y - player.y) < 16 && (I.pressed('KeyE') || I.pressed('Enter'))) {
          chests.splice(i, 1);
          if (Math.random() < 0.45) { PQ.sfx('error'); player.hurt = 1; stealTD(15, 'FIRMWARE MIMIC BRICKED YOUR GEAR'); }
          else { const n = PQ.pick([10, 10, 20]); st.td += n; st.earned += n; PQ.sfx('cash'); OW.toast('STABLE FIRMWARE! +' + n + ' T$', C.green); OW.burstBills(n); }
          return;
        }
      }

      const door = nearDoor();
      OW.door = door;
      if (door && (I.pressed('KeyE') || I.pressed('Enter'))) {
        st.px = player.x; st.py = player.y;
        PQ.enterSite(door);
        return;
      }

      cam.x = PQ.clamp(player.x - 160, 0, MW * TS - 320);
      cam.y = PQ.clamp(player.y - VIEW_H / 2, 0, MH * TS - VIEW_H);
    },
    draw(g) {
      const st = PQ.state;
      PQ.rect(g, 0, 0, 320, 240, C.black);
      const cx = Math.round(cam.x), cy = Math.round(cam.y);
      g.drawImage(mapCanvas, cx, cy, 320, VIEW_H, 0, VIEW_Y, 320, VIEW_H);
      g.save(); g.translate(-cx, VIEW_Y - cy);
      const tx0 = Math.floor(cx / TS), ty0 = Math.floor(cy / TS);
      g.font = '8px ' + PQ.FONT; g.textBaseline = 'top'; g.textAlign = 'left';
      for (let y = ty0; y < Math.min(MH, ty0 + 16); y++) {
        for (let x = tx0; x < Math.min(MW, tx0 + 21); x++) {
          const c = tiles[y][x];
          if (c === '~') {
            PQ.rect(g, x * TS, y * TS, TS, TS, C.black);
            const vert = x === 14 || x === 36;
            const off = (t * 20 + (vert ? x : y) * 7) % TS;
            g.fillStyle = C.blue;
            g.fillText((x + y + Math.floor(t * 2)) % 2 ? '1' : '0', x * TS + (vert ? 4 : off - 4), y * TS + (vert ? off - 4 : 4));
            g.fillStyle = C.royal;
            g.fillText((x * y + Math.floor(t * 3)) % 2 ? '0' : '1', x * TS + (vert ? 4 : ((off + 8) % TS) - 4), y * TS + (vert ? ((off + 8) % TS) - 4 : 4));
          } else if (c === 'G') {
            PQ.rect(g, x * TS, y * TS, TS, TS, C.dgrey);
            for (let i = 0; i < 4; i++) PQ.rect(g, x * TS + 1 + i * 4, y * TS, 2, TS, Math.floor(t * 2) % 2 ? C.red : C.orange);
            PQ.rect(g, x * TS + 5, y * TS + 5, 6, 6, C.yellow);
          }
        }
      }
      PQ.SITES.forEach((s) => {
        const px = s.x * TS + (s.w * TS) / 2, py = s.doorSide === 'top' ? (s.y + s.h) * TS - 10 : s.y * TS + 2;
        PQ.text(g, s.name, px, py, s.kind === 'final' ? C.yellow : C.white, { size: 6, align: 'center' });
        if ((s.boss && PQ.bossAvailable(s.boss)) || (s.kind === 'final' && PQ.bossAvailable('outage')))
          PQ.text(g, s.kind === 'final' ? '! FINAL !' : '! BOSS !', px, s.y * TS - 9, Math.floor(t * 3) % 2 ? C.red : C.yellow, { size: 6, align: 'center' });
        if (st.documented[s.id]) { PQ.rect(g, s.x * TS + s.w * TS - 9, s.y * TS + 14, 6, 4, C.yellow); PQ.rect(g, s.x * TS + s.w * TS - 8, s.y * TS + 15, 4, 1, C.black); }
      });
      const tk = st.active;
      let target = null;
      if (tk) target = PQ.siteById(tk.siteId);
      else if (PQ.tickets.queue.length) target = PQ.siteById('hq');
      if (target) {
        const mx = target.doorX * TS + 8, my = (target.doorSide === 'top' ? target.doorY * TS - 10 : target.doorY * TS - 4) + Math.sin(t * 6) * 3;
        g.fillStyle = tk ? C.yellow : C.cyan;
        g.beginPath(); g.moveTo(mx - 5, my - 6); g.lineTo(mx + 5, my - 6); g.lineTo(mx, my); g.fill();
      }
      chests.forEach((ch) => {
        PQ.rect(g, ch.x - 6, ch.y - 4, 12, 9, C.brown);
        PQ.rect(g, ch.x - 6, ch.y - 4, 12, 3, C.orange);
        PQ.rect(g, ch.x - 1, ch.y - 2, 2, 3, C.yellow);
        if (Math.hypot(ch.x - player.x, ch.y - player.y) < 28) PQ.text(g, 'UPGRADE? (E)', ch.x, ch.y - 14, C.yellow, { size: 6, align: 'center' });
      });
      enemies.forEach((e) => drawEnemy(g, e));
      drawPlayer(g);
      if (player.zap > 0) {
        const range = st.items.reach ? 44 : 28;
        g.strokeStyle = Math.floor(t * 30) % 2 ? C.cyan : C.white; g.lineWidth = 1;
        g.beginPath(); g.arc(player.x, player.y, range * (1 - (player.zap / 0.35) * 0.5), 0, Math.PI * 2); g.stroke();
      }
      g.restore();

      const na = nightAlpha();
      if (na > 0) { g.globalAlpha = na; PQ.rect(g, 0, VIEW_Y, 320, VIEW_H, C.black); g.globalAlpha = 1; }

      if (target) {
        const sx = target.doorX * TS + 8 - cx, sy = target.doorY * TS - cy + VIEW_Y;
        if (sx < 0 || sx > 320 || sy < VIEW_Y || sy > 240) {
          const a = Math.atan2(sy - 128, sx - 160);
          const ax = PQ.clamp(160 + Math.cos(a) * 150, 8, 312), ay = PQ.clamp(128 + Math.sin(a) * 100, 26, 222);
          g.save(); g.translate(ax, ay); g.rotate(a);
          g.fillStyle = Math.floor(t * 4) % 2 ? C.yellow : C.orange;
          g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-5, 5); g.fill();
          g.restore();
        }
      }

      drawHud(g);
      let ps = prompt;
      if (!ps && OW.door) ps = { s: 'E / ENTER: ' + PQ.doorLabel(OW.door), col: C.white };
      if (ps) { PQ.rect(g, 0, 228, 320, 12, C.navy); PQ.text(g, ps.s, 160, 230, ps.col, { size: 6, align: 'center' }); }
      toasts.forEach((ts, i) => PQ.text(g, ts.s, 160, 24 + i * 10, ts.col, { size: 6, align: 'center' }));
      bills.forEach((b) => PQ.drawBill(g, b.x, b.y, 18, 9, '', b.r));
    },
  };

  function drawHud(g) {
    const st = PQ.state;
    PQ.rect(g, 0, 0, 320, 16, C.navy);
    PQ.rect(g, 0, 15, 320, 1, C.cyan);
    PQ.drawTD(g, 3, 4, st.td);
    const rk = PQ.CFG.ranks[PQ.rankOf(st.earned)].name;
    PQ.text(g, rk.length > 16 ? 'PRINCIPAL' : rk.toUpperCase(), 66, 5, C.ice, { size: 6 });
    const h = Math.floor(clockMin / 60), m = Math.floor(clockMin % 60);
    PQ.text(g, String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'), 172, 5, isNight() ? C.purple : C.grey, { size: 6 });
    PQ.rect(g, 208, 6, 30, 4, C.black); PQ.rect(g, 208, 6, (30 * player.stam) / 100, 4, C.orange);
    for (let i = 0; i < st.items.mugs; i++) { PQ.rect(g, 241 + i * 7, 5, 4, 5, C.ice); PQ.rect(g, 245 + i * 7, 6, 1, 2, C.ice); }
    const tk = st.active;
    if (tk) {
      const col = tk.slaLeft <= 0 ? C.red : tk.slaLeft / tk.sla < 0.3 ? C.yellow : C.green;
      PQ.text(g, tk.slaLeft > 0 ? PQ.fmtTime(tk.slaLeft) : 'BLOWN', 316, 5, col, { size: 6, align: 'right' });
    } else {
      PQ.text(g, 'Q:' + PQ.tickets.queue.length, 316, 5, C.cyan, { size: 6, align: 'right' });
    }
  }

  function drawPlayer(g) {
    const st = PQ.state;
    if (player.hurt > 0 && Math.floor(player.hurt * 12) % 2) return;
    const x = Math.round(player.x), y = Math.round(player.y);
    const step = Math.floor(player.anim) % 2;
    const shirt = st.wearing === 'tee' ? C.yellow : st.wearing === 'vest' ? C.orange : C.royal;
    const hasHat = st.wearing === 'hat' || st.wearing === 'vest';
    PQ.rect(g, x - 5, y + 7, 10, 2, C.black);
    PQ.rect(g, x - 3, y + 3, 2, 4 + (step ? 1 : 0), C.dgrey);
    PQ.rect(g, x + 1, y + 3, 2, 4 + (step ? 0 : 1), C.dgrey);
    PQ.rect(g, x - 4, y - 3, 8, 7, shirt);
    if (st.wearing === 'vest') PQ.rect(g, x - 4, y, 8, 1, C.ice);
    if (st.wearing === 'tee') PQ.rect(g, x - 1, y - 1, 2, 2, C.navy);
    PQ.rect(g, x, y - 2, 1, 3, C.cyan); PQ.rect(g, x - 1, y + 1, 3, 2, C.white);
    PQ.rect(g, x - 3, y - 9, 6, 6, '#f0c090');
    PQ.rect(g, x - 3, y - 10, 6, 2, hasHat ? C.yellow : C.brown);
    if (hasHat) PQ.rect(g, x - 4, y - 9, 8, 1, C.yellow);
    if (player.dir !== 'up') {
      const ex = player.dir === 'left' ? -1 : player.dir === 'right' ? 1 : 0;
      PQ.rect(g, x - 2 + ex, y - 7, 1, 1, C.black); PQ.rect(g, x + 1 + ex, y - 7, 1, 1, C.black);
    }
    PQ.rect(g, x + 4, y - 1, 3, 3, st.items.reach ? C.cyan : C.sky);
  }

  function drawEnemy(g, e) {
    const x = Math.round(e.x), y = Math.round(e.y);
    const blink = e.stun > 0 && Math.floor(e.stun * 10) % 2;
    if (e.type === 'gremlin') {
      const hop = Math.abs(Math.sin(e.t * 10)) * 2;
      PQ.rect(g, x - 5, y - 4 - hop, 10, 9, blink ? C.white : C.green);
      PQ.rect(g, x - 6, y - 7 - hop, 3, 3, C.green); PQ.rect(g, x + 3, y - 7 - hop, 3, 3, C.green);
      PQ.rect(g, x - 3, y - 2 - hop, 2, 2, C.red); PQ.rect(g, x + 1, y - 2 - hop, 2, 2, C.red);
      PQ.rect(g, x + 5, y + 2 - hop, 4, 1, C.yellow); PQ.rect(g, x + 8, y + 2 - hop, 2, 2, C.ice);
    } else if (e.type === 'slime') {
      const s = 4 + e.size * 3, wob = Math.sin(e.t * 6);
      PQ.rect(g, x - s, y - s + 2 + wob, s * 2, s * 2 - 2 - wob, blink ? C.white : C.purple);
      PQ.rect(g, x - s + 2, y - s + 4, s * 2 - 4, 2, C.ice);
      for (let i = 0; i < 3; i++) PQ.rect(g, x - s + 3 + i * 4, y + 1, 2, 2, Math.floor(e.t * 8 + i) % 2 ? C.green : C.black);
    } else if (e.type === 'ghost') {
      const bob = Math.sin(e.t * 3) * 3;
      g.globalAlpha = 0.18; g.fillStyle = C.purple; g.beginPath(); g.arc(x, y, 40, 0, Math.PI * 2); g.fill(); g.globalAlpha = 0.85;
      PQ.rect(g, x - 9, y - 7 + bob, 18, 12, C.ice);
      PQ.rect(g, x - 7, y - 5 + bob, 10, 8, C.black);
      PQ.rect(g, x - 5, y - 3 + bob, 4, 3, Math.floor(e.t * 6) % 2 ? C.yellow : C.orange);
      PQ.rect(g, x + 5, y - 5 + bob, 2, 2, C.red);
      for (let i = 0; i < 3; i++) PQ.rect(g, x - 9 + i * 7, y + 5 + bob + ((i + Math.floor(e.t * 6)) % 2), 4, 3, C.ice);
      g.globalAlpha = 1;
    } else if (e.type === 'phantom') {
      const bob = Math.sin(e.t * 5) * 2;
      g.globalAlpha = 0.8;
      PQ.rect(g, x - 7, y - 10 + bob, 14, 16, blink ? C.white : C.dgrey);
      PQ.rect(g, x - 5, y - 6 + bob, 3, 3, C.cyan); PQ.rect(g, x + 2, y - 6 + bob, 3, 3, C.cyan);
      PQ.text(g, '2AM', x, y - 1 + bob, C.red, { size: 6, align: 'center', shadow: false });
      g.globalAlpha = 1;
    }
  }
})();
