(function () {
  'use strict';
  const PQ = window.PQ, C = PQ.C;
  const BUCKETS = [
    { id: '10', name: 'DATA', color: C.green },
    { id: '20', name: 'VOICE', color: C.yellow },
    { id: '30', name: 'IOT', color: C.purple },
    { id: '99', name: 'GUEST', color: C.orange },
    { id: '40', name: 'MGMT', color: C.cyan }
  ];
  const DEVICES = [
    ['PC', 0, 'screen'], ['PRINTER', 0, 'printer'],
    ['IP PHONE', 1, 'phone'], ['BADGE RDR', 2, 'sensor'],
    ['IV PUMP', 2, 'sensor'], ['CAMERA', 2, 'camera'],
    ['THERMOSTAT', 2, 'sensor'], ['LAPTOP-GUEST', 3, 'screen'],
    ['SWITCH', 4, 'router'], ['AP', 4, 'router']
  ];
  PQ.registerMinigame({
    id: 'vlan', title: 'VLAN SORTER', payout: 20,
    help: [
      'LEFT/RIGHT or A/D: choose a lane',
      'DOWN/S: soft drop. SPACE: drop.',
      'Or click a lane. Three strikes lose.',
      '10 DATA: PC, printer. 20: IP phone.',
      '30 IOT: badge, pump, camera, thermo.',
      '99 GUEST: guest laptop.',
      'Level 3: 40 MGMT = switch or AP.'
    ],
    create(api) {
      const level = api.boss ? 3 : Math.max(1, Math.min(3, api.level || 1));
      const buckets = BUCKETS.slice(0, level === 3 ? 5 : 4);
      const devices = DEVICES.filter(d => d[1] < buckets.length);
      const goal = [0, 12, 16, 20][level] + (api.boss ? 6 : 0);
      const limit = api.boss ? 120 : 110;
      const width = 300 / buckets.length, particles = [];
      let done = false, elapsed = 0, sorted = 0, strikes = 0;
      let falling, pause = 0, shake = 0, flash = 0, notice = 'MATCH DEVICE TO VLAN';
      let repeat = 0, lastDir = 0, bag = [];
      function spawn() {
        if (!bag.length) {
          bag = devices.slice();
          for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
          }
        }
        falling = { device: bag.pop(), lane: Math.floor(buckets.length / 2), y: 78 };
      }
      function finish(success) {
        if (done) return;
        done = true;
        const speed = 0.7 + 0.3 * Math.max(0, 1 - elapsed / limit);
        api.finish({ success, quality: success ? (1 - strikes / 3 * 0.6) * speed : 0 });
      }
      function land() {
        const right = falling.lane === falling.device[1];
        const x = 10 + (falling.lane + 0.5) * width;
        const color = right ? C.green : C.red;
        for (let i = 0; i < 14; i++) particles.push({ x, y: 198, vx: (Math.random() - 0.5) * 80, vy: -20 - Math.random() * 75, life: 0.7, color });
        if (right) { sorted++; PQ.sfx('coin'); notice = 'ROUTED TO VLAN ' + buckets[falling.lane].id; }
        else {
          strikes++; shake = 0.35; PQ.sfx('error');
          notice = falling.device[0] + ' -> VLAN ' + buckets[falling.device[1]].id;
        }
        flash = 0.6; pause = right ? 0.32 : 1.2; falling = null;
        if (strikes >= 3) finish(false);
        else if (sorted >= goal) finish(true);
      }
      spawn();
      return {
        update(dt) {
          if (done) return;
          dt = Math.max(0, Math.min(dt, 0.05)); elapsed += dt;
          shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt);
          for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt;
            if (p.life <= 0) particles.splice(i, 1);
          }
          if (elapsed >= limit) { finish(false); return; }
          if (!falling) { pause -= dt; if (pause <= 0) spawn(); return; }
          const I = PQ.input;
          const dir = (I.down('ArrowRight') || I.down('KeyD') ? 1 : 0) - (I.down('ArrowLeft') || I.down('KeyA') ? 1 : 0);
          repeat -= dt;
          const edge = I.pressed('ArrowLeft') || I.pressed('KeyA') || I.pressed('ArrowRight') || I.pressed('KeyD');
          if (dir && (dir !== lastDir || repeat <= 0 || edge)) {
            falling.lane = Math.max(0, Math.min(buckets.length - 1, falling.lane + dir));
            repeat = dir !== lastDir ? 0.23 : 0.13; PQ.sfx('blip');
          }
          lastDir = dir;
          if (I.mouse.clicked && I.mouse.y >= 70 && I.mouse.y < 230 && I.mouse.x >= 10 && I.mouse.x < 310) {
            falling.lane = Math.floor((I.mouse.x - 10) / width); PQ.sfx('select');
          }
          let speed = [0, 18, 25, 32][level] + sorted * 0.65;
          if (api.boss) speed *= 1.12;
          if (I.down('ArrowDown') || I.down('KeyS')) speed *= 4;
          falling.y += speed * dt;
          if (I.pressed('Space')) { falling.y = 187; PQ.sfx('step'); }
          if (falling.y >= 187) land();
        },
        draw(g) {
          PQ.rect(g, 0, 16, 320, 224, C.black);
          if (api.boss) {
            PQ.text(g, 'TAG TYRANT HP', 8, 19, C.red, { size: 6 });
            PQ.rect(g, 100, 19, 212, 6, C.dgrey);
            PQ.rect(g, 100, 19, 212 * (1 - sorted / goal), 6, C.red);
          }
          PQ.text(g, 'SORT ' + sorted + '/' + goal, 8, 31, C.ice);
          PQ.text(g, 'X ' + strikes + '/3', 132, 31, strikes ? C.red : C.grey);
          PQ.text(g, Math.ceil(Math.max(0, limit - elapsed)) + 's', 310, 31, C.yellow, { align: 'right' });
          PQ.text(g, notice, 160, 46, flash && strikes ? C.yellow : C.grey, { size: 6, align: 'center' });
          if (falling) PQ.text(g, falling.device[0], 160, 59, C.white, { align: 'center' });
          const sx = shake > 0 ? Math.round(Math.sin(elapsed * 100) * 3) : 0;
          buckets.forEach((b, i) => {
            const x = 10 + i * width + sx;
            PQ.rect(g, x, 73, width - 2, 127, C.navy);
            for (let y = 81; y < 195; y += 16) PQ.rect(g, x + width / 2 - 1, y, 1, 5, C.blue);
            PQ.box(g, x, 201, width - 3, 27, C.navy);
            PQ.rect(g, x + 3, 201, width - 9, 3, b.color);
            PQ.text(g, b.id, x + (width - 3) / 2, 207, b.color, { align: 'center' });
            PQ.text(g, b.name, x + (width - 3) / 2, 219, C.ice, { size: 6, align: 'center' });
          });
          if (falling) {
            const d = falling.device, x = 10 + (falling.lane + 0.5) * width + sx, y = falling.y;
            const col = api.perks.label ? buckets[d[1]].color : C.cyan;
            PQ.stroke(g, x - 19, 177, 38, 21, C.dgrey);
            PQ.rect(g, x - 16, y, 32, 18, C.blue);
            PQ.rect(g, x - 12, y + 2, 24, 11, col);
            if (d[2] === 'screen') {
              PQ.rect(g, x - 9, y + 4, 18, 7, C.navy);
              PQ.rect(g, x - 2, y + 13, 4, 2, col); PQ.rect(g, x - 7, y + 15, 14, 2, col);
            } else if (d[2] === 'phone') {
              PQ.rect(g, x - 8, y + 5, 4, 9, C.navy); PQ.rect(g, x + 2, y + 5, 6, 3, C.navy);
            } else {
              for (let j = 0; j < 3; j++) PQ.rect(g, x - 8 + j * 7, y + 7, 3, 3, C.navy);
              if (d[2] === 'router') PQ.rect(g, x + 10, y - 4, 2, 6, col);
            }
          }
          particles.forEach(p => { if (p.y >= 73 && p.y < 228) PQ.rect(g, p.x, p.y, 3, 3, p.color); });
          PQ.text(g, 'A/D MOVE   S SOFT   SPACE DROP', 160, 233, C.grey, { size: 6, align: 'center' });
        }
      };
    }
  });
})();
