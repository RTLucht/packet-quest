(function () {
  'use strict';
  const PQ = window.PQ, C = PQ.C;
  PQ.registerMinigame({
    id: 'tracer', title: 'PACKET TRACER RUN', payout: 50,
    help: [
      'Your packet runs to 10.0.0.53.',
      'UP / W / SPACE: jump; hold higher.',
      'Press again in air to double jump.',
      'Clear gaps and red ACL walls.',
      'Router pickups +3 TTL; blobs -2.',
      'TTL loses 1 every four seconds.',
      'Level 1: two checkpoint retries.'
    ],
    create(api) {
      const level = api.boss ? 3 : Math.max(1, Math.min(3, api.level || 1));
      const speed = [0, 46, 55, 64][level] * (api.boss ? 1.1 : 1);
      const duration = [0, 60, 75, 90][level] * (api.boss ? 1.3 : 1);
      const start = 60, destination = start + duration * speed;
      const floor = 198, maxRetries = level === 1 ? 2 : 0;
      const platforms = [], hazards = [], routers = [], particles = [];
      let end = 0, index = 0;
      // Each gap is reachable with a held jump and a second jump.
      // Every landing has a safe run-up before its next obstacle.
      while (end < destination + 340) {
        const width = index === 0 ? 290 : 180 + Math.random() * 45;
        const p = { x: end, w: width, index };
        platforms.push(p);
        routers.push({ x: end + width - 38, y: floor - 17, taken: false });
        if (index > 0) hazards.push({ x: end + width * 0.43, w: 16, h: index % 3 === 0 ? 10 : 22 + level * 3, kind: index % 3 === 0 ? 'drain' : 'wall', hit: false });
        end += width + 34 + level * 6 + Math.random() * 9;
        index++;
      }
      // A generous final landing carries the destination server.
      const finalPlatform = platforms.find(p => destination >= p.x && destination <= p.x + p.w);
      if (!finalPlatform) platforms.push({ x: destination - 40, w: 170, index: -1 });
      hazards.forEach(h => { if (Math.abs(h.x - destination) < 90) h.hit = true; });
      let x = start, y = floor - 12, vy = 0, jumps = 0, grounded = true;
      let ttl = 8, ttlClock = 0, elapsed = 0, retries = maxRetries, checkpoint = start;
      let done = false, shake = 0, invincible = 0, message = 'DESTINATION: 10.0.0.53', messageTime = 3;
      function finish(success) {
        if (done) return;
        done = true;
        const hearts = (retries + 1) / (maxRetries + 1);
        api.finish({ success, quality: success ? Math.min(1, 0.8 * ttl / 8 + 0.2 * hearts) : 0 });
      }
      function burst(px, py, color) {
        for (let i = 0; i < 12; i++) particles.push({ x: px, y: py, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90, life: 0.55, color });
      }
      function die(reason) {
        shake = 0.4; PQ.sfx('hit'); burst(x, Math.min(y, 208), C.red);
        if (retries <= 0) { finish(false); return; }
        retries--; x = checkpoint; y = floor - 12; vy = 0; jumps = 0; grounded = true;
        ttl = 8; ttlClock = 0; invincible = 1.5;
        routers.forEach(r => { if (r.x >= checkpoint) r.taken = false; });
        message = reason + ' - CHECKPOINT RETRY'; messageTime = 2;
      }
      return {
        update(dt) {
          if (done) return;
          dt = Math.max(0, Math.min(dt, 0.05)); elapsed += dt;
          shake = Math.max(0, shake - dt); invincible = Math.max(0, invincible - dt); messageTime -= dt;
          particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
          for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
          ttlClock += dt;
          if (ttlClock >= 4) {
            ttlClock -= 4; ttl--;
            if (ttl <= 0) { die('TTL EXPIRED'); return; }
            if (ttl <= 2) PQ.sfx('beep');
          }
          const I = PQ.input;
          const jump = I.pressed('ArrowUp') || I.pressed('KeyW') || I.pressed('Space');
          const held = I.down('ArrowUp') || I.down('KeyW') || I.down('Space');
          if (jump && jumps < 2) {
            vy = -190; jumps++; grounded = false; PQ.sfx('blip'); burst(x, y + 12, C.cyan);
          }
          // Releasing the key cuts ascent, making jump height controllable.
          if (!held && vy < -65) vy = -65;
          const oldBottom = y + 12;
          x += speed * dt; vy += 360 * dt; y += vy * dt;
          grounded = false;
          for (const p of platforms) {
            if (x + 10 > p.x && x < p.x + p.w && vy >= 0 && oldBottom <= floor + 1 && y + 12 >= floor) {
              y = floor - 12; vy = 0; jumps = 0; grounded = true;
              if (p.index > 0 && p.index % 4 === 0 && x > p.x + 16 && x < p.x + 55 && checkpoint < p.x) {
                checkpoint = p.x + 20; message = 'CHECKPOINT SAVED'; messageTime = 1.6; PQ.sfx('select');
              }
              break;
            }
          }
          if (!grounded && jumps === 0) jumps = 1;
          for (const h of hazards) {
            if (!h.hit && invincible <= 0 && x + 10 > h.x && x < h.x + h.w && y + 12 > floor - h.h && y < floor) {
              h.hit = true; ttl -= h.kind === 'wall' ? 3 : 2;
              shake = 0.3; invincible = 0.8; PQ.sfx('zap'); burst(x, y, C.orange);
              message = h.kind === 'wall' ? 'ACL HIT: -3 TTL' : 'TTL DRAIN: -2 TTL'; messageTime = 1.6;
              if (ttl <= 0) { die('PACKET DROPPED'); return; }
            }
          }
          for (const r of routers) {
            if (!r.taken && Math.abs(x + 5 - r.x) < 16 && Math.abs(y + 6 - r.y) < 24) {
              r.taken = true; ttl = Math.min(8, ttl + 3); PQ.sfx('coin'); burst(r.x, r.y, C.green);
              message = 'ROUTER: +3 TTL'; messageTime = 1.3;
            }
          }
          if (y > 237) { die('GAP'); return; }
          if (x >= destination && grounded) finish(true);
        },
        draw(g) {
          PQ.rect(g, 0, 16, 320, 224, C.black);
          if (api.boss) {
            PQ.text(g, 'TTL REAPER HP', 8, 19, C.red, { size: 6 });
            PQ.rect(g, 100, 19, 212, 6, C.dgrey);
            PQ.rect(g, 100, 19, 212 * Math.max(0, (destination - x) / (destination - start)), 6, C.red);
          }
          PQ.text(g, 'TTL ' + ttl, 8, 31, ttl <= 2 ? C.red : C.cyan);
          PQ.text(g, 'HP ' + (retries + 1), 90, 31, C.green);
          PQ.text(g, Math.floor(elapsed) + 's', 172, 31, C.ice);
          PQ.text(g, Math.min(100, Math.floor((x - start) / (destination - start) * 100)) + '%', 312, 31, C.yellow, { align: 'right' });
          PQ.rect(g, 8, 43, 304, 3, C.navy);
          PQ.rect(g, 8, 43, 304 * Math.min(1, (x - start) / (destination - start)), 3, C.cyan);
          for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 9; col++) {
              const bx = ((col * 44 - x * (0.12 + row * 0.035)) % 396 + 396) % 396 - 44;
              PQ.text(g, (row + col) % 2 ? '101' : '010', bx, 68 + row * 23, row % 2 ? C.blue : C.navy, { size: 6 });
            }
          }
          const shakeX = shake > 0 ? Math.round(Math.sin(elapsed * 110) * 3) : 0;
          const camera = x - 65 - shakeX;
          for (const p of platforms) {
            const px = p.x - camera;
            if (px > 320 || px + p.w < 0) continue;
            PQ.rect(g, Math.max(0, px), floor, Math.min(320, px + p.w) - Math.max(0, px), 28, C.navy);
            PQ.rect(g, Math.max(0, px), floor, Math.min(320, px + p.w) - Math.max(0, px), 3, C.cyan);
            for (let j = 0; j < p.w - 18; j += 24) {
              if (px + j < -24 || px + j > 320) continue;
              PQ.rect(g, px + j + 3, floor + 7, 17, 9, C.blue);
              PQ.rect(g, px + j + 5, floor + 10, 3, 3, C.green);
            }
            if (p.index > 0 && p.index % 4 === 0) PQ.text(g, 'SAVE', px + 12, floor + 19, C.green, { size: 6 });
          }
          hazards.forEach(h => {
            const hx = h.x - camera;
            if (hx < -45 || hx > 330 || h.hit) return;
            const color = h.kind === 'wall' ? C.red : C.purple;
            PQ.rect(g, hx, floor - h.h, h.w, h.h, color);
            for (let j = 3; j < h.h; j += 7) PQ.rect(g, hx + 3, floor - h.h + j, h.w - 6, 2, C.black);
            PQ.text(g, h.kind === 'wall' ? 'ACL WALL' : 'DRAIN', hx + 8, floor - h.h - 10, color, { size: 6, align: 'center' });
          });
          routers.forEach(r => {
            const rx = r.x - camera;
            if (r.taken || rx < -30 || rx > 350) return;
            PQ.rect(g, rx - 8, r.y - 4, 16, 9, C.green);
            PQ.rect(g, rx - 6, r.y - 10, 2, 6, C.cyan); PQ.rect(g, rx + 4, r.y - 10, 2, 6, C.cyan);
            PQ.rect(g, rx - 4, r.y - 1, 2, 2, C.black); PQ.rect(g, rx + 2, r.y - 1, 2, 2, C.black);
            PQ.text(g, '+TTL', rx, r.y - 20, C.green, { size: 6, align: 'center' });
          });
          const serverX = destination - camera;
          if (serverX < 360 && serverX > -100) {
            PQ.box(g, serverX, floor - 42, 24, 42, C.blue);
            for (let j = 0; j < 3; j++) { PQ.rect(g, serverX + 4, floor - 36 + j * 11, 16, 6, C.dgrey); PQ.rect(g, serverX + 6, floor - 34 + j * 11, 3, 2, C.green); }
            PQ.text(g, 'SERVER 10.0.0.53', Math.max(95, Math.min(224, serverX)), floor - 54, C.yellow, { align: 'center', size: 6 });
          }
          particles.forEach(p => { if (p.y >= 51 && p.y < 225) PQ.rect(g, p.x - camera, p.y, 2, 2, p.color); });
          if (y >= 51 && y < 225 && !(invincible > 0 && Math.floor(elapsed * 14) % 2)) {
            const px = x - camera;
            PQ.rect(g, px - 2, y - 2, 14, 16, C.blue);
            PQ.rect(g, px, y, 10, 12, C.ice);
            PQ.rect(g, px + 1, y + 2, 2, 2, C.royal); PQ.rect(g, px + 7, y + 2, 2, 2, C.royal);
            PQ.rect(g, px + 3, y + 4, 4, 2, C.royal);
            PQ.text(g, String(ttl), px + 5, y - 11, C.yellow, { size: 6, align: 'center' });
          }
          if (messageTime > 0) PQ.text(g, message, 160, 52, C.yellow, { size: 6, align: 'center' });
          PQ.text(g, 'UP/W/SPACE JUMP   AGAIN: DOUBLE', 160, 231, C.grey, { size: 6, align: 'center' });
        }
      };
    }
  });
})();
