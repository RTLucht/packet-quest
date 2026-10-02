(function () {
  'use strict';
  const PQ = window.PQ, C = PQ.C;
  PQ.registerMinigame({
    id: 'rogue', title: 'ROGUE AP HUNT', payout: 50,
    help: [
      'ARROWS / WASD: search the ward.',
      'Follow RF: -30 is hot, -82 cold.',
      'SPACE beside an AP to unplug it.',
      'Guard cones cost 10s. Use rooms!',
      'Microwave ghosts scramble RF.',
      'L2/3: legit AP decoys cost 8s.',
      'Boss: hold SPACE to cut shielding.'
    ],
    create(api) {
      const level = api.boss ? 3 : Math.max(1, Math.min(3, api.level || 1));
      const limit = 90, reach = api.perks.reach ? 32 : 16;
      const walls = [
        { x: 8, y: 58, w: 304, h: 4 }, { x: 8, y: 204, w: 304, h: 4 },
        { x: 8, y: 58, w: 4, h: 150 }, { x: 308, y: 58, w: 4, h: 150 }
      ];
      const rooms = [], names = ['TRIAGE', 'PHARMACY', 'IMAGING', 'WARD A', 'WARD B', 'NURSES'];
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          const left = 12 + col * 100, center = left + 48, wallY = row ? 150 : 112;
          rooms.push({ x: center, y: row ? 180 : 86, name: names[row * 3 + col], left, top: row ? 154 : 62 });
          walls.push({ x: left, y: wallY, w: 35, h: 4 }, { x: left + 61, y: wallY, w: 39, h: 4 });
          if (col > 0) walls.push({ x: left - 4, y: row ? 154 : 62, w: 4, h: row ? 50 : 50 });
        }
      }
      const order = rooms.map((r, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]];
      }
      const aps = order.slice(0, level > 1 ? 3 : 1).map((roomId, i) => ({
        x: rooms[roomId].x + (Math.random() < 0.5 ? -22 : 22),
        y: rooms[roomId].y + (Math.random() < 0.5 ? -8 : 8),
        rogue: i === 0, unplugged: false, seen: false
      }));
      const source = aps[0];
      const routes = [
        [[42, 134], [278, 134]],
        [[160, 88], [160, 134], [260, 134], [260, 180], [260, 134], [160, 134]],
        [[60, 180], [60, 134], [160, 134], [160, 180], [160, 134], [60, 134]]
      ];
      const guards = routes.slice(0, level).map((route, i) => ({ route, target: 1, x: route[0][0], y: route[0][1], dx: 1, dy: 0, speed: (18 + level * 3 + i * 2) * (api.boss ? 1.3 : 1) }));
      const ghost = { x: 270, y: 132 }, particles = [];
      let px = 24, py = 134, time = limit, elapsed = 0, done = false, penalties = 0;
      let immune = 2, shake = 0, beep = 0, meterClock = 0, signal = 0, scrambled = false, unplug = 0;
      let message = 'FIND THE UNAUTHORIZED SIGNAL', messageTime = 3;
      function collides(x, y) {
        return walls.some(w => x + 4 > w.x && x - 4 < w.x + w.w && y + 5 > w.y && y - 5 < w.y + w.h);
      }
      function clearRay(ax, ay, bx, by) {
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
        for (let i = 1; i < steps; i++) {
          const x = ax + (bx - ax) * i / steps, y = ay + (by - ay) * i / steps;
          if (walls.some(w => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h)) return false;
        }
        return true;
      }
      function finish(success) {
        if (done) return;
        done = true;
        api.finish({ success, quality: success ? Math.max(0, Math.min(1, time / limit - penalties * 0.025)) : 0 });
      }
      function penalty(seconds, label) {
        time = Math.max(0, time - seconds); penalties++; shake = 0.4; immune = 2.5;
        message = label; messageTime = 2; PQ.sfx('error');
        for (let i = 0; i < 12; i++) particles.push({ x: px, y: py, vx: (Math.random() - 0.5) * 70, vy: (Math.random() - 0.5) * 70, life: 0.5 });
      }
      function move(dx, dy) {
        // Small axis-separated steps prevent tunnelling through the thin walls.
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2));
        for (let i = 0; i < steps; i++) {
          if (!collides(px + dx / steps, py)) px += dx / steps;
          if (!collides(px, py + dy / steps)) py += dy / steps;
        }
      }
      return {
        update(dt) {
          if (done) return;
          dt = Math.max(0, Math.min(dt, 0.05)); elapsed += dt; time = Math.max(0, time - dt);
          if (time <= 0) { finish(false); return; }
          immune = Math.max(0, immune - dt); shake = Math.max(0, shake - dt); messageTime -= dt;
          particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
          for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
          const I = PQ.input;
          let dx = (I.down('ArrowRight') || I.down('KeyD') ? 1 : 0) - (I.down('ArrowLeft') || I.down('KeyA') ? 1 : 0);
          let dy = (I.down('ArrowDown') || I.down('KeyS') ? 1 : 0) - (I.down('ArrowUp') || I.down('KeyW') ? 1 : 0);
          const length = Math.hypot(dx, dy) || 1;
          move(dx / length * 44 * dt, dy / length * 44 * dt);
          for (const guard of guards) {
            const target = guard.route[guard.target], gx = target[0] - guard.x, gy = target[1] - guard.y;
            const dist = Math.hypot(gx, gy);
            if (dist <= guard.speed * dt) { guard.x = target[0]; guard.y = target[1]; guard.target = (guard.target + 1) % guard.route.length; }
            else { guard.dx = gx / dist; guard.dy = gy / dist; guard.x += guard.dx * guard.speed * dt; guard.y += guard.dy * guard.speed * dt; }
            const vx = px - guard.x, vy = py - guard.y, distance = Math.hypot(vx, vy);
            if (immune <= 0 && distance < 37 + level * 5 && (distance < 9 || (vx * guard.dx + vy * guard.dy) / distance > 0.72) && clearRay(guard.x, guard.y, px, py)) {
              penalty(10, 'SECURITY SPOTTED YOU! -10s');
              move(-guard.dx * 24, -guard.dy * 24);
            }
          }
          ghost.x = 160 + Math.cos(elapsed * 0.45) * 110;
          ghost.y = 133 + Math.sin(elapsed * 0.9) * 8;
          scrambled = Math.hypot(px - ghost.x, py - ghost.y) < (api.boss ? 54 : 42);
          meterClock -= dt;
          if (meterClock <= 0) {
            const distance = Math.hypot(px - source.x, py - source.y);
            signal = scrambled ? Math.random() : Math.max(0, 1 - distance / 290);
            meterClock = 0.18;
          }
          beep -= dt;
          if (beep <= 0) { PQ.sfx('beep'); beep = 0.12 + (1 - signal) * 1.15; }
          aps.forEach(ap => { if (Math.hypot(px - ap.x, py - ap.y) < 29 && clearRay(px, py, ap.x, ap.y)) ap.seen = true; });
          const nearby = aps.filter(ap => !ap.unplugged && Math.hypot(px - ap.x, py - ap.y) <= reach && clearRay(px, py, ap.x, ap.y)).sort((a, b) => Math.hypot(px - a.x, py - a.y) - Math.hypot(px - b.x, py - b.y))[0];
          if (nearby && (I.pressed('Space') || (api.boss && I.down('Space')))) {
            if (!nearby.rogue) { nearby.unplugged = true; penalty(8, 'LEGIT AP! USERS OFFLINE: -8s'); }
            else if (!api.boss) { nearby.unplugged = true; PQ.sfx('success'); finish(time > 0); }
            else {
              unplug += dt; message = 'CUTTING ROGUE SHIELD...'; messageTime = 0.3;
              if (unplug >= 1.3) { nearby.unplugged = true; PQ.sfx('success'); finish(time > 0); }
            }
          } else if (unplug > 0) unplug = Math.max(0, unplug - dt * 0.5);
          if (time <= 0) finish(false);
        },
        draw(g) {
          PQ.rect(g, 0, 16, 320, 224, C.black);
          if (api.boss) {
            PQ.text(g, 'PHANTOM AP HP', 8, 19, C.red, { size: 6 });
            PQ.rect(g, 100, 19, 212, 6, C.dgrey); PQ.rect(g, 100, 19, 212 * Math.max(0, 1 - unplug / 1.3), 6, C.red);
          }
          PQ.text(g, 'WARD RF SWEEP', 8, 31, C.cyan);
          PQ.text(g, Math.ceil(time) + 's', 312, 31, time < 20 ? C.red : C.yellow, { align: 'right' });
          PQ.text(g, messageTime > 0 ? message : 'SPACE: UNPLUG   AVOID GUARD CONES', 160, 46, messageTime > 0 ? C.yellow : C.grey, { size: 6, align: 'center' });
          const sx = shake > 0 ? Math.round(Math.sin(elapsed * 100) * 3) : 0;
          PQ.rect(g, 12 + sx, 62, 296, 142, C.navy);
          PQ.rect(g, 12 + sx, 116, 296, 34, C.dgrey);
          rooms.forEach(room => {
            PQ.text(g, room.name, room.left + 6 + sx, room.top + 4, C.grey, { size: 6 });
            // Beds and equipment are floor markings, keeping door routes open.
            PQ.rect(g, room.left + 6 + sx, room.top + 20, 12, 20, C.blue);
            PQ.rect(g, room.left + 7 + sx, room.top + 21, 10, 5, C.ice);
            PQ.rect(g, room.left + 76 + sx, room.top + 23, 12, 12, C.blue);
            PQ.rect(g, room.left + 79 + sx, room.top + 27, 6, 3, C.cyan);
          });
          for (const guard of guards) {
            const radius = 37 + level * 5;
            // Pixel stippling shows the same wall-occluded cone used for detection.
            for (let d = 10; d < radius; d += 5) {
              for (let side = -0.65; side <= 0.66; side += 0.26) {
                const vx = guard.dx - guard.dy * side, vy = guard.dy + guard.dx * side;
                const tx = guard.x + vx * d, ty = guard.y + vy * d;
                if (Math.hypot(tx - guard.x, ty - guard.y) < radius && clearRay(guard.x, guard.y, tx, ty) && tx > 12 && tx < 306 && ty > 62 && ty < 201) PQ.rect(g, tx + sx, ty, 2, 2, C.brown);
              }
            }
          }
          walls.forEach(w => PQ.rect(g, w.x + sx, w.y, w.w, w.h, C.sky));
          aps.forEach(ap => {
            if (!ap.seen) return;
            PQ.rect(g, ap.x - 5 + sx, ap.y - 3, 10, 6, ap.unplugged ? C.dgrey : C.ice);
            PQ.rect(g, ap.x - 4 + sx, ap.y - 7, 2, 4, C.cyan); PQ.rect(g, ap.x + 3 + sx, ap.y - 7, 2, 4, C.cyan);
            PQ.rect(g, ap.x - 1 + sx, ap.y - 1, 2, 2, ap.unplugged ? C.red : C.green);
            PQ.text(g, ap.unplugged && !ap.rogue ? 'LEGIT' : '? AP', ap.x + sx, ap.y + 7, ap.unplugged ? C.red : C.yellow, { size: 6, align: 'center' });
          });
          guards.forEach(guard => {
            PQ.rect(g, guard.x - 4 + sx, guard.y - 5, 8, 10, C.royal);
            PQ.rect(g, guard.x - 3 + sx, guard.y - 7, 6, 4, C.ice);
            PQ.rect(g, guard.x + guard.dx * 5 - 1 + sx, guard.y + guard.dy * 5 - 1, 3, 3, C.red);
          });
          PQ.rect(g, ghost.x - 7 + sx, ghost.y - 6, 14, 11, C.purple);
          PQ.rect(g, ghost.x - 5 + sx, ghost.y - 4, 8, 6, C.black); PQ.rect(g, ghost.x + 4 + sx, ghost.y - 3, 2, 2, C.yellow);
          PQ.rect(g, ghost.x - 5 + sx, ghost.y + 7 + Math.sin(elapsed * 7) * 2, 10, 2, C.purple);
          if (!(immune > 0 && Math.floor(elapsed * 10) % 2)) {
            PQ.rect(g, px - 4 + sx, py - 2, 8, 8, C.green);
            PQ.rect(g, px - 3 + sx, py - 7, 6, 5, C.ice);
            PQ.rect(g, px + 4 + sx, py, 3, 4, C.yellow);
          }
          particles.forEach(p => { if (p.y > 62 && p.y < 204) PQ.rect(g, p.x + sx, p.y, 2, 2, C.red); });
          PQ.text(g, scrambled ? 'RF JAM!' : 'RF', 8, 216, scrambled ? C.purple : C.cyan, { size: 6 });
          PQ.rect(g, 54, 214, 168, 9, C.navy);
          for (let i = 0; i < Math.round(signal * 24); i++) PQ.rect(g, 55 + i * 7, 215, 5, 7, scrambled ? C.purple : signal > 0.8 ? C.green : C.yellow);
          PQ.text(g, Math.round(-82 + signal * 52) + ' dBm', 312, 215, C.ice, { size: 6, align: 'right' });
          PQ.text(g, scrambled ? 'INTERFERENCE GHOST: METER UNRELIABLE' : 'ARROWS/WASD MOVE   SPACE UNPLUG', 160, 231, scrambled ? C.purple : C.grey, { size: 6, align: 'center' });
        }
      };
    }
  });
})();
