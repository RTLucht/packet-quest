(function () {
  'use strict';
  const PQ = window.PQ, C = PQ.C;
  PQ.registerMinigame({
    id: 'stp', title: 'SPANNING TREE SIEGE', payout: 100,
    help: [
      'Click a cable to block / unblock.',
      'Keep EVERY switch linked to ROOT.',
      'Break all loops: N switches need',
      'exactly N-1 active links.',
      'Hold a valid tree for 5 seconds.',
      'Loops + isolated users feed STORM.',
      '100% storm = meltdown. Clear waves.'
    ],
    create(api) {
      const level = api.boss ? 3 : Math.max(1, Math.min(3, api.level || 1));
      const waveCount = level + (api.boss ? 1 : 0), particles = [], packets = [];
      let nodes = [], links = [], reachable = [], cycles = 0, isolated = 0, active = 0;
      let wave = 0, storm = 18, hold = 0, elapsed = 0, integral = 0, sampledTime = 0;
      let done = false, shake = 0, pause = 0, spawnClock = 0, selected = 0;
      let message = 'REMOVE LOOPS. KEEP EVERY SWITCH.', messageTime = 3;
      function analyze() {
        const visited = new Set(), fromRoot = new Set([0]), queue = [0];
        const adjacent = nodes.map(() => []);
        active = 0;
        links.forEach(e => { if (!e.blocked) { adjacent[e.a].push(e.b); adjacent[e.b].push(e.a); active++; } });
        while (queue.length) {
          const n = queue.shift();
          adjacent[n].forEach(next => { if (!fromRoot.has(next)) { fromRoot.add(next); queue.push(next); } });
        }
        let components = 0;
        nodes.forEach((node, i) => {
          if (visited.has(i)) return;
          components++; const stack = [i]; visited.add(i);
          while (stack.length) {
            adjacent[stack.pop()].forEach(next => { if (!visited.has(next)) { visited.add(next); stack.push(next); } });
          }
        });
        reachable = nodes.map((n, i) => fromRoot.has(i));
        isolated = nodes.length - fromRoot.size;
        // The cycle rank works even when blocking splits the graph into components.
        cycles = Math.max(0, active - nodes.length + components);
      }
      function nextWave() {
        const count = Math.min(9, 5 + level + wave);
        nodes = [];
        for (let i = 0; i < count; i++) nodes.push({ x: 48 + i % 3 * 112, y: count <= 6 ? 87 + Math.floor(i / 3) * 96 : 82 + Math.floor(i / 3) * 53 });
        links = [];
        function add(a, b) {
          if (a < count && b < count && !links.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a))) links.push({ a, b, blocked: false });
        }
        for (let i = 0; i < count; i++) {
          if (i % 3 < 2) add(i, i + 1);
          add(i, i + 3);
        }
        // Alternate diagonals each wave; no overlapping cables or hidden crossings.
        const diagonals = wave % 2 ? [[1, 3], [2, 4], [4, 6], [5, 7]] : [[0, 4], [1, 5], [3, 7], [4, 8]];
        diagonals.slice(0, level - 1).forEach(pair => add(pair[0], pair[1]));
        storm = 18; hold = 0; selected = 0; packets.length = 0; spawnClock = 0;
        analyze();
      }
      function finish(success) {
        if (done) return;
        done = true;
        api.finish({ success, quality: success ? Math.max(0, Math.min(1, 1 - integral / Math.max(0.01, sampledTime) / 100)) : 0 });
      }
      function burst(x, y, color) {
        for (let i = 0; i < 12; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90, life: 0.65, color });
      }
      function toggle(index) {
        const e = links[index];
        if (!e) return;
        const oldIsolated = isolated;
        e.blocked = !e.blocked; selected = index; hold = 0; analyze();
        const a = nodes[e.a], b = nodes[e.b];
        burst((a.x + b.x) / 2, (a.y + b.y) / 2, isolated ? C.red : C.cyan);
        if (isolated > oldIsolated) {
          shake = 0.35; PQ.sfx('error'); message = 'USERS: MY NETWORK IS DOWN!';
        } else { PQ.sfx('select'); message = isolated ? 'RESTORE THE ISOLATED SWITCHES' : cycles ? 'LOOPS REMAIN: ' + cycles : 'TREE FOUND! HOLD FOR 5s'; }
        messageTime = 2;
      }
      function linkDistance(mx, my, e) {
        const a = nodes[e.a], b = nodes[e.b], dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((mx - a.x) * dx + (my - a.y) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(mx - a.x - dx * t, my - a.y - dy * t);
      }
      nextWave();
      return {
        update(dt) {
          if (done) return;
          dt = Math.max(0, Math.min(dt, 0.05)); elapsed += dt;
          shake = Math.max(0, shake - dt); messageTime -= dt;
          particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
          for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
          if (pause > 0) {
            pause -= dt;
            if (pause <= 0) { nextWave(); message = 'NEW TOPOLOGY: CHECK ALL LINKS'; messageTime = 2; }
            return;
          }
          const I = PQ.input;
          if (I.pressed('ArrowRight') || I.pressed('KeyD') || I.pressed('ArrowDown') || I.pressed('KeyS')) selected = (selected + 1) % links.length;
          if (I.pressed('ArrowLeft') || I.pressed('KeyA') || I.pressed('ArrowUp') || I.pressed('KeyW')) selected = (selected + links.length - 1) % links.length;
          if (I.pressed('Space') || I.pressed('Enter')) toggle(selected);
          if (I.mouse.clicked && I.mouse.y >= 65 && I.mouse.y < 204 && !nodes.some(n => Math.abs(I.mouse.x - n.x) < 21 && Math.abs(I.mouse.y - n.y) < 11)) {
            let closest = -1, distance = 8;
            links.forEach((e, i) => { const d = linkDistance(I.mouse.x, I.mouse.y, e); if (d < distance) { distance = d; closest = i; } });
            if (closest >= 0) toggle(closest);
          }
          const valid = cycles === 0 && isolated === 0;
          const pressure = cycles * (0.44 + level * 0.11) + isolated * 2.1;
          storm = Math.max(0, Math.min(100, storm + (valid ? -9 : pressure * (api.boss ? 1.3 : 1)) * dt));
          integral += storm * dt; sampledTime += dt;
          if (storm >= 100) { PQ.sfx('boom'); shake = 0.5; finish(false); return; }
          hold = valid ? hold + dt : 0;
          if (hold >= 5) {
            wave++; PQ.sfx('success'); burst(160, 122, C.green);
            if (wave >= waveCount) { finish(true); return; }
            pause = 1.5; message = 'WAVE CLEARED!'; messageTime = 1.5;
          }
          spawnClock -= dt;
          if (spawnClock <= 0) {
            spawnClock = cycles > 0 ? Math.max(0.12, 0.65 - storm / 200) : 1.2;
            const open = links.filter(e => !e.blocked);
            if (open.length && packets.length < 80) {
              const e = open[Math.floor(Math.random() * open.length)]; packets.push({ e, from: e.a, t: 0 });
            }
          }
          const count = packets.length;
          for (let i = count - 1; i >= 0; i--) {
            const packet = packets[i], e = packet.e;
            if (e.blocked) { packets.splice(i, 1); continue; }
            const a = nodes[e.a], b = nodes[e.b];
            packet.t += dt * (55 + level * 15) / Math.hypot(b.x - a.x, b.y - a.y);
            if (packet.t >= 1) {
              const at = packet.from === e.a ? e.b : e.a;
              const next = links.filter(other => other !== e && !other.blocked && (other.a === at || other.b === at));
              packets.splice(i, 1);
              if (next.length) {
                const chosen = next[Math.floor(Math.random() * next.length)];
                packets.push({ e: chosen, from: at, t: 0 });
                if (cycles > 0 && next.length > 1 && packets.length < 80) {
                  const branch = next.find(other => other !== chosen);
                  packets.push({ e: branch, from: at, t: 0 });
                }
              }
            }
          }
        },
        draw(g) {
          PQ.rect(g, 0, 16, 320, 224, C.black);
          if (api.boss) {
            PQ.text(g, 'LOOP LEVIATHAN HP', 8, 19, C.red, { size: 6 });
            PQ.rect(g, 120, 19, 192, 6, C.dgrey);
            const progress = done ? wave : wave + (pause > 0 ? 0 : hold / 5);
            PQ.rect(g, 120, 19, 192 * Math.max(0, 1 - progress / waveCount), 6, C.red);
          }
          PQ.text(g, 'WAVE ' + Math.min(waveCount, wave + 1) + '/' + waveCount, 8, 31, C.ice);
          PQ.text(g, Math.floor(elapsed) + 's', 312, 31, C.grey, { align: 'right' });
          PQ.text(g, 'STORM', 8, 45, storm > 75 ? C.red : C.orange, { size: 6 });
          PQ.rect(g, 45, 44, 170, 8, C.navy); PQ.rect(g, 45, 44, storm * 1.7, 8, storm > 75 ? C.red : C.orange);
          PQ.text(g, Math.floor(storm) + '%', 221, 45, C.orange, { size: 6 });
          PQ.text(g, active + '/' + (nodes.length - 1) + ' LINKS', 312, 57, C.cyan, { size: 6, align: 'right' });
          PQ.text(g, 'ROOT', nodes[0].x, nodes[0].y - 24, C.yellow, { size: 6, align: 'center' });
          const sx = shake > 0 ? Math.round(Math.sin(elapsed * 110) * 3) : 0;
          links.forEach((e, index) => {
            const a = nodes[e.a], b = nodes[e.b], length = Math.hypot(b.x - a.x, b.y - a.y);
            const hot = index === selected || linkDistance(PQ.input.mouse.x, PQ.input.mouse.y, e) < 6;
            // Rasterized cables use the shared rectangle helper and palette only.
            for (let d = 0; d <= length; d += 2) {
              if (e.blocked && Math.floor(d / 6) % 2) continue;
              PQ.rect(g, a.x + (b.x - a.x) * d / length + sx, a.y + (b.y - a.y) * d / length, hot ? 3 : 2, hot ? 3 : 2, e.blocked ? C.orange : hot ? C.cyan : C.blue);
            }
            if (e.blocked) PQ.text(g, 'X', (a.x + b.x) / 2 + sx, (a.y + b.y) / 2 - 3, C.orange, { align: 'center' });
          });
          packets.forEach(packet => {
            const a = nodes[packet.from], b = nodes[packet.from === packet.e.a ? packet.e.b : packet.e.a];
            PQ.rect(g, a.x + (b.x - a.x) * packet.t - 2 + sx, a.y + (b.y - a.y) * packet.t - 2, 4, 4, cycles ? C.red : C.green);
          });
          nodes.forEach((node, i) => {
            const bad = !reachable[i], blink = Math.floor(elapsed * 6) % 2;
            PQ.box(g, node.x - 20 + sx, node.y - 10, 40, 20, bad && blink ? C.red : C.navy);
            PQ.text(g, 'SW' + (i + 1), node.x + sx, node.y - 5, i === 0 ? C.yellow : C.ice, { align: 'center' });
            PQ.rect(g, node.x - 14 + sx, node.y + 5, 3, 2, bad ? C.red : C.green);
            if (bad && blink) PQ.text(g, 'ISOLATED', node.x + sx, node.y + 12, C.red, { size: 6, align: 'center' });
            if (i === 0) {
              PQ.rect(g, node.x - 7 + sx, node.y - 15, 14, 3, C.yellow);
              for (let j = 0; j < 3; j++) PQ.rect(g, node.x - 7 + j * 6 + sx, node.y - 19, 2, 5, C.yellow);
            }
          });
          particles.forEach(p => { if (p.y > 64 && p.y < 208) PQ.rect(g, p.x + sx, p.y, 3, 3, p.color); });
          PQ.text(g, messageTime > 0 ? message : 'LOOPS ' + cycles + '   ISOLATED ' + isolated, 160, 208, isolated ? C.red : C.yellow, { size: 6, align: 'center' });
          PQ.rect(g, 8, 219, 304, 4, C.navy); PQ.rect(g, 8, 219, 304 * Math.min(1, hold / 5), 4, C.green);
          PQ.text(g, hold > 0 ? 'STABILIZING ' + Math.min(5, hold).toFixed(1) + '/5s' : 'CLICK LINK / ARROWS SELECT + SPACE', 160, 230, hold > 0 ? C.green : C.grey, { size: 6, align: 'center' });
        }
      };
    }
  });
})();
