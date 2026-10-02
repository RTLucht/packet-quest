// CABLE CHAOS: rotate patch-cable tiles to connect each patch-panel port to its switch port before the closet overheats.
(function () {
  'use strict';
  const PQ = window.PQ;
  const C = PQ.C;
  const N = 1, E = 2, S = 4, W = 8;
  const DIRS = [[N, 0, -1], [E, 1, 0], [S, 0, 1], [W, -1, 0]];
  const OPP = { 1: 4, 2: 8, 4: 1, 8: 2 };
  const rotCW = (m) => ((m << 1) | (m >> 3)) & 15;
  const CABLE_COLS = [C.green, C.yellow, C.orange, C.purple, C.cyan];

  const COLS = 8, ROWS = 6, CELL = 24, GX = 64, GY = 52;

  // Monotone (E/N/S) self-avoiding path from (0,r0) to (COLS-1,r1) avoiding used cells.
  function findPath(r0, r1, used) {
    const seen = new Set();
    const path = [];
    function dfs(x, y, lastDy) {
      const k = x + ',' + y;
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS || used.has(k) || seen.has(k)) return false;
      seen.add(k); path.push([x, y]);
      if (x === COLS - 1 && y === r1) return true;
      const moves = PQ.shuffle([[1, 0], [1, 0], [0, 1], [0, -1]]);
      for (const [dx, dy] of moves) {
        if (dy !== 0 && dy === -lastDy) continue;
        if (dx === 0 && x === COLS - 1 && Math.sign(r1 - y) !== dy) continue;
        if (dfs(x + dx, y + dy, dy)) return true;
      }
      path.pop(); // keep k in seen: dead ends stay dead, keeps search linear
      return false;
    }
    return dfs(0, r0, 0) ? path : null;
  }

  function maskBetween(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    return dx === 1 ? E : dx === -1 ? W : dy === 1 ? S : N;
  }

  function buildPuzzle(nCables) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const srcRows = PQ.shuffle([0, 1, 2, 3, 4, 5]).slice(0, nCables).sort((a, b) => a - b);
      const dstRows = PQ.shuffle([0, 1, 2, 3, 4, 5]).slice(0, nCables).sort((a, b) => a - b);
      const used = new Set();
      const cables = [];
      let ok = true;
      for (let i = 0; i < nCables; i++) {
        const p = findPath(srcRows[i], dstRows[i], used);
        if (!p) { ok = false; break; }
        p.forEach(([x, y]) => used.add(x + ',' + y));
        cables.push({ src: srcRows[i], dst: dstRows[i], path: p, col: CABLE_COLS[i], ok: false });
      }
      if (!ok) continue;
      const grid = [];
      for (let y = 0; y < ROWS; y++) {
        grid.push([]);
        for (let x = 0; x < COLS; x++) {
          const m = Math.random() < 0.5 ? (N | S) : (N | E);
          grid[y].push({ mask: m, lit: null, spin: 0 });
        }
      }
      cables.forEach((cb) => {
        cb.path.forEach((pt, i) => {
          const inDir = i === 0 ? W : OPP[maskBetween(cb.path[i - 1], pt)];
          const outDir = i === cb.path.length - 1 ? E : maskBetween(pt, cb.path[i + 1]);
          grid[pt[1]][pt[0]].mask = inDir | outDir;
        });
      });
      grid.forEach((row) => row.forEach((t) => { const r = PQ.randi(1, 3); for (let k = 0; k < r; k++) t.mask = rotCW(t.mask); }));
      return { grid, cables };
    }
    // fallback: straight runs on matching rows (always solvable once scrambled)
    const rows = PQ.shuffle([0, 1, 2, 3, 4, 5]).slice(0, nCables).sort((a, b) => a - b);
    const grid = [];
    for (let y = 0; y < ROWS; y++) { grid.push([]); for (let x = 0; x < COLS; x++) grid[y].push({ mask: rows.includes(y) ? (E | W) : (Math.random() < 0.5 ? (N | S) : (N | E)), lit: null, spin: 0 }); }
    grid.forEach((row) => row.forEach((t) => { const r = PQ.randi(1, 3); for (let k = 0; k < r; k++) t.mask = rotCW(t.mask); }));
    return { grid, cables: rows.map((r, i) => ({ src: r, dst: r, path: [], col: CABLE_COLS[i], ok: false })) };
  }

  PQ.registerMinigame({
    id: 'cable',
    title: 'CABLE CHAOS',
    payout: 10,
    help: [
      'The closet is a rat nest and the',
      'temp is climbing. Connect every',
      'patch port (left) to its switch',
      'port (right). Swat gremlins!',
      'CLICK a tile = rotate',
      'RIGHT CLICK = rotate back',
      'or ARROWS + SPACE',
    ],
    create(api) {
      const lvl = api.boss ? 3 : api.level;
      const nCables = [2, 3, 4][lvl - 1];
      const heatTime = ([75, 65, 55][lvl - 1]) * (api.boss ? 1.3 : 1);
      const rounds = api.boss ? 2 : 1;
      let puzzle = buildPuzzle(nCables);
      let heat = 0, round = 1, done = false, t = 0, shake = 0, cur = { x: 0, y: 0 };
      let gremlin = null, gremlinTimer = lvl >= 2 ? 8 : 1e9;
      let clearFlash = 0, bossHp = 1;
      const sparks = [];

      function trace() {
        const g = puzzle.grid;
        g.forEach((row) => row.forEach((tl) => { tl.lit = null; }));
        let connected = 0;
        puzzle.cables.forEach((cb) => {
          let x = 0, y = cb.src, from = W, steps = 0;
          const cells = [];
          cb.ok = false;
          while (x >= 0 && x < COLS && y >= 0 && y < ROWS && steps++ < 64) {
            const tl = g[y][x];
            if (!(tl.mask & from)) break;
            cells.push(tl);
            const out = tl.mask & ~from;
            if (x === COLS - 1 && out === E) { if (y === cb.dst) cb.ok = true; break; }
            const d = DIRS.find((dd) => dd[0] === out);
            if (!d) break;
            x += d[1]; y += d[2]; from = OPP[out];
          }
          cells.forEach((tl) => { tl.lit = cb.ok ? cb.col : (tl.lit || C.sky); });
          if (cb.ok) connected++;
        });
        return connected;
      }
      let connected = trace();
      // never start solved
      while (connected === puzzle.cables.length) { puzzle = buildPuzzle(nCables); connected = trace(); }

      function rotate(x, y, ccw) {
        const tl = puzzle.grid[y][x];
        tl.mask = ccw ? rotCW(rotCW(rotCW(tl.mask))) : rotCW(tl.mask);
        tl.spin = 0.12;
        PQ.sfx('blip');
        const before = connected;
        connected = trace();
        if (connected > before) PQ.sfx('coin');
      }

      function finish(success) {
        if (done) return;
        done = true;
        api.finish({ success, quality: success ? 1 - heat * 0.8 : 0 });
      }

      return {
        update(dt) {
          if (done) return;
          t += dt;
          shake = Math.max(0, shake - dt);
          clearFlash = Math.max(0, clearFlash - dt);
          heat += dt / heatTime;
          puzzle.grid.forEach((row) => row.forEach((tl) => { tl.spin = Math.max(0, tl.spin - dt); }));
          if (Math.random() < heat * 0.3) sparks.push({ x: PQ.rand(64, 256), y: 44, vy: PQ.rand(10, 30), life: 1 });
          for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.y += s.vy * dt; s.life -= dt; if (s.life <= 0) sparks.splice(i, 1); }
          if (heat >= 1) { PQ.sfx('boom'); finish(false); return; }

          // Gremlin: unplugs (rotates) a random tile unless swatted first
          gremlinTimer -= dt;
          if (gremlinTimer <= 0 && !gremlin) {
            gremlin = { x: PQ.randi(0, COLS - 1), y: PQ.randi(0, ROWS - 1), t: 1.5 };
            gremlinTimer = lvl === 3 ? 6 : 9;
          }
          if (gremlin) {
            gremlin.t -= dt;
            if (gremlin.t <= 0) {
              const tl = puzzle.grid[gremlin.y][gremlin.x];
              tl.mask = rotCW(tl.mask); tl.spin = 0.2;
              PQ.sfx('hit'); shake = 0.25;
              connected = trace();
              gremlin = null;
            }
          }

          const I = PQ.input, m = I.mouse;
          if (I.pressed('ArrowLeft') || I.pressed('KeyA')) cur.x = Math.max(0, cur.x - 1);
          if (I.pressed('ArrowRight') || I.pressed('KeyD')) cur.x = Math.min(COLS - 1, cur.x + 1);
          if (I.pressed('ArrowUp') || I.pressed('KeyW')) cur.y = Math.max(0, cur.y - 1);
          if (I.pressed('ArrowDown') || I.pressed('KeyS')) cur.y = Math.min(ROWS - 1, cur.y + 1);
          const swat = (x, y) => { if (gremlin && gremlin.x === x && gremlin.y === y) { gremlin = null; PQ.sfx('zap'); return true; } return false; };
          if (I.pressed('Space') || I.pressed('Enter')) { if (!swat(cur.x, cur.y)) rotate(cur.x, cur.y, false); }
          if ((m.clicked || m.rclicked) && PQ.inRect(m, GX, GY, COLS * CELL, ROWS * CELL)) {
            const cx = Math.floor((m.x - GX) / CELL), cy = Math.floor((m.y - GY) / CELL);
            cur = { x: cx, y: cy };
            if (!swat(cx, cy)) rotate(cx, cy, m.rclicked);
          }

          if (connected === puzzle.cables.length) {
            if (round < rounds) {
              round++; bossHp = 0.5; PQ.sfx('cash');
              do { puzzle = buildPuzzle(nCables); connected = trace(); } while (connected === puzzle.cables.length);
              heat = Math.max(0, heat - 0.3);
              clearFlash = 1.2;
            } else { bossHp = 0; finish(true); }
          }
        },
        draw(g) {
          const sx = shake > 0 ? PQ.randi(-2, 2) : 0;
          g.save(); g.translate(sx, 0);
          PQ.rect(g, -4, 16, 328, 224, C.black);
          PQ.rect(g, 36, 44, 248, 168, C.navy);
          for (let y = 48; y < 208; y += 8) { PQ.rect(g, 38, y, 3, 2, C.dgrey); PQ.rect(g, 279, y, 3, 2, C.dgrey); }

          PQ.text(g, 'CLOSET TEMP', 8, 22, C.ice, { size: 6 });
          PQ.rect(g, 80, 21, 150, 8, C.dgrey);
          const hc = heat < 0.5 ? C.green : heat < 0.8 ? C.orange : C.red;
          PQ.rect(g, 81, 22, 148 * heat, 6, hc);
          PQ.text(g, Math.round(68 + heat * 52) + 'F', 236, 22, hc, { size: 6 });
          PQ.text(g, connected + '/' + puzzle.cables.length + ' UP', 314, 22, C.green, { size: 6, align: 'right' });
          if (api.boss) {
            PQ.text(g, api.bossName || 'BOSS', 8, 33, C.red, { size: 6 });
            PQ.rect(g, 96, 34, 120, 4, C.dgrey); PQ.rect(g, 96, 34, 120 * bossHp, 4, C.red);
          }

          puzzle.cables.forEach((cb, i) => {
            const col = cb.ok ? cb.col : C.grey;
            PQ.rect(g, GX - 22, GY + cb.src * CELL + 6, 16, 12, C.dgrey);
            PQ.rect(g, GX - 20, GY + cb.src * CELL + 8, 12, 8, col);
            PQ.text(g, 'P' + (i + 1), GX - 38, GY + cb.src * CELL + 9, cb.col, { size: 6 });
            PQ.rect(g, GX - 6, GY + cb.src * CELL + 10, 6, 4, cb.col);
            const rx = GX + COLS * CELL;
            PQ.rect(g, rx, GY + cb.dst * CELL + 10, 6, 4, cb.col);
            PQ.rect(g, rx + 6, GY + cb.dst * CELL + 6, 16, 12, C.dgrey);
            PQ.rect(g, rx + 8, GY + cb.dst * CELL + 8, 12, 8, cb.ok ? (Math.floor(t * 8) % 2 ? cb.col : C.white) : C.black);
            PQ.text(g, 'G' + (i + 1), rx + 24, GY + cb.dst * CELL + 9, cb.col, { size: 6 });
          });

          for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
              const tl = puzzle.grid[y][x];
              const px = GX + x * CELL, py = GY + y * CELL;
              PQ.rect(g, px, py, CELL, CELL, (x + y) % 2 ? C.blue : C.navy);
              const col = tl.lit || C.dgrey;
              const cx = px + CELL / 2, cy = py + CELL / 2, w = tl.lit ? 4 : 3;
              const off = tl.spin > 0 ? 1 : 0;
              if (tl.mask & N) PQ.rect(g, cx - w / 2 + off, py, w, CELL / 2 + w / 2, col);
              if (tl.mask & S) PQ.rect(g, cx - w / 2 + off, cy - w / 2, w, CELL / 2 + w / 2, col);
              if (tl.mask & E) PQ.rect(g, cx - w / 2, cy - w / 2 + off, CELL / 2 + w / 2, w, col);
              if (tl.mask & W) PQ.rect(g, px, cy - w / 2 + off, CELL / 2 + w / 2, w, col);
              PQ.rect(g, cx - 2, cy - 2, 4, 4, tl.lit ? C.white : C.grey);
            }
          }
          PQ.stroke(g, GX + cur.x * CELL, GY + cur.y * CELL, CELL, CELL, Math.floor(t * 4) % 2 ? C.yellow : C.white);

          if (gremlin) {
            const gx = GX + gremlin.x * CELL + 6, gy = GY + gremlin.y * CELL + 6 + Math.sin(t * 20);
            PQ.rect(g, gx, gy, 12, 12, C.green);
            PQ.rect(g, gx + 2, gy + 3, 3, 3, C.red); PQ.rect(g, gx + 7, gy + 3, 3, 3, C.red);
            PQ.rect(g, gx + 3, gy + 9, 6, 2, C.black);
            PQ.rect(g, gx - 2, gy - 2, 3, 3, C.green); PQ.rect(g, gx + 11, gy - 2, 3, 3, C.green);
            PQ.text(g, 'SWAT!', gx + 6, gy - 10, C.yellow, { size: 6, align: 'center' });
          }

          sparks.forEach((s) => PQ.rect(g, s.x, s.y, 2, 2, s.life > 0.5 ? C.orange : C.red));
          if (clearFlash > 0) PQ.text(g, 'HEAD 1 DOWN!', 160, 120, C.yellow, { align: 'center', size: 12 });
          PQ.text(g, api.boss ? 'ROUND ' + round + '/' + rounds : 'IDF-2B  RACK 1', 160, 220, C.grey, { size: 6, align: 'center' });
          g.restore();
        },
      };
    },
  });
})();
