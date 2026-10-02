// CONFIG COMMIT: spot the typos in a scrolling IOS config before the commit timer fires. Wrong flag = rollback (lose a life).
(function () {
  'use strict';
  const PQ = window.PQ;
  const C = PQ.C;

  // [good line, bad variant, why] - bad variants are the typos you hunt.
  const BLOCKS = [
    [
      ['hostname IDF-2B-ACC01'],
      ['ip domain-name corp.example.org', 'ip domian-name corp.example.org', 'domain typo'],
      ['ntp server 10.10.0.123', 'ntp server 10.10.0.323', 'bad octet'],
    ],
    [
      ['vlan 10'], [' name DATA'],
      ['vlan 20'], [' name VOICE'],
      ['vlan 30', 'vlan 4097', 'VLAN > 4094'],
      [' name IOT'],
    ],
    [
      ['interface GigabitEthernet1/0/1'],
      [' description Nurse Station PC'],
      [' switchport mode access', ' swithport mode access', 'switchport typo'],
      [' switchport access vlan 10'],
      [' switchport voice vlan 20', ' switchport voice vlan 2O', 'letter O not zero'],
      [' spanning-tree portfast', ' spanning-tree portfast trunkk', 'keyword typo'],
      [' no shutdown', ' no shutdwon', 'shutdown typo'],
    ],
    [
      ['interface GigabitEthernet1/0/48'],
      [' description UPLINK-TO-CORE'],
      [' switchport mode trunk'],
      [' switchport trunk allowed vlan 10,20,30', ' switchport trunk allowed vlan 10,20,,30', 'double comma'],
      [' channel-group 1 mode active', ' channel-group 1 mode actve', 'LACP typo'],
    ],
    [
      ['interface Vlan99'],
      [' ip address 10.99.0.2 255.255.255.0', ' ip address 10.99.0.2 255.255.255.300', 'mask octet > 255'],
      [' ip helper-address 10.10.0.50', ' ip helper-adress 10.10.0.50', 'address typo'],
    ],
    [
      ['router ospf 1'],
      [' router-id 10.255.0.2'],
      [' network 10.99.0.0 0.0.0.255 area 0', ' network 10.99.0.0 255.255.255.0 area 0', 'mask, not wildcard'],
      [' passive-interface default'],
      [' no passive-interface Vlan99', ' no pasive-interface Vlan99', 'passive typo'],
    ],
    [
      ['ip access-list extended GUEST-IN'],
      [' deny ip any 10.0.0.0 0.255.255.255'],
      [' permit udp any any eq 53', ' permit udp any any eq 35', 'DNS is port 53!'],
      [' permit tcp any any eq 443'],
    ],
    [
      ['snmp-server community R3adOnly RO 10', 'snmp-server community R3adOnly RW 10', 'RW community!'],
      ['logging host 10.10.0.60'],
      ['line vty 0 15'],
      [' transport input ssh', ' transport input telnet', 'telnet in prod?!'],
      [' login local'],
      ['end'],
    ],
  ];

  function build(nTypos) {
    const lines = [];
    BLOCKS.forEach((b) => {
      b.forEach((l) => lines.push({ good: l[0], bad: l[1], why: l[2], typo: false, found: false, wrong: 0 }));
      lines.push({ good: '!', typo: false, found: false, wrong: 0 });
    });
    const cands = lines.map((l, i) => (l.bad ? i : -1)).filter((i) => i >= 0);
    PQ.shuffle(cands).slice(0, nTypos).forEach((i) => { lines[i].typo = true; });
    return lines;
  }

  PQ.registerMinigame({
    id: 'config',
    title: 'CONFIG COMMIT',
    payout: 50,
    help: [
      'Change window is open. Review',
      'the config before it commits!',
      'Find every TYPO line.',
      'UP/DOWN or MOUSE = pick line',
      'SPACE / CLICK = flag as typo',
      'Wrong flag = ROLLBACK (-1 life)',
      '3 rollbacks and you are out.',
    ],
    create(api) {
      const lvl = api.boss ? 3 : api.level;
      const nTypos = [2, 3, 4][lvl - 1] + (api.boss ? 1 : 0);
      const limit = [60, 55, 50][lvl - 1] + (api.boss ? 15 : 0);
      const scrollSpeed = [6, 9, 12][lvl - 1];
      const lines = build(nTypos);
      const LH = 12, VIEW_Y = 40, VIEW_H = 168, VISIBLE = Math.floor(VIEW_H / LH);
      let scroll = 0, sel = 0, lives = 3, found = 0, t = 0, done = false, shake = 0, msg = null, autoScroll = true;
      const maxScroll = Math.max(0, lines.length * LH - VIEW_H);

      function finish(success) {
        if (done) return;
        done = true;
        api.finish({ success, quality: success ? PQ.clamp(0.3 + 0.5 * (1 - t / limit) + 0.1 * (lives - 1), 0.1, 1) : 0 });
      }
      function flag(i) {
        const l = lines[i];
        if (!l || l.found) return;
        if (l.typo) {
          l.found = true; found++; PQ.sfx('coin');
          msg = { s: 'FIXED: ' + l.why, t: 1.5, col: C.green };
          if (found === nTypos) { PQ.sfx('cash'); finish(true); }
        } else {
          l.wrong = 1; lives--; shake = 0.4; PQ.sfx('error');
          msg = { s: 'ROLLBACK! That line was fine', t: 1.5, col: C.red };
          if (lives <= 0) finish(false);
        }
      }

      return {
        update(dt) {
          if (done) return;
          t += dt;
          shake = Math.max(0, shake - dt);
          if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
          lines.forEach((l) => { if (l.wrong) l.wrong = Math.max(0, l.wrong - dt); });
          if (t >= limit) { PQ.sfx('boom'); finish(false); return; }

          const I = PQ.input, m = I.mouse;
          if (autoScroll) {
            scroll += scrollSpeed * dt;
            if (scroll >= maxScroll) { scroll = maxScroll; autoScroll = false; }
          }
          if (I.pressed('ArrowDown') || I.pressed('KeyS')) { sel = Math.min(lines.length - 1, sel + 1); autoScroll = false; PQ.sfx('blip'); }
          if (I.pressed('ArrowUp') || I.pressed('KeyW')) { sel = Math.max(0, sel - 1); autoScroll = false; PQ.sfx('blip'); }
          if (I.pressed('PageDown')) { sel = Math.min(lines.length - 1, sel + VISIBLE); autoScroll = false; }
          if (I.pressed('PageUp')) { sel = Math.max(0, sel - VISIBLE); autoScroll = false; }
          if (!autoScroll) {
            if (sel * LH < scroll) scroll = sel * LH;
            if (sel * LH > scroll + VIEW_H - LH) scroll = sel * LH - VIEW_H + LH;
          } else {
            sel = PQ.clamp(sel, Math.ceil(scroll / LH), Math.floor((scroll + VIEW_H - LH) / LH));
          }
          if (PQ.inRect(m, 8, VIEW_Y, 304, VIEW_H)) {
            const hov = Math.floor((m.y - VIEW_Y + scroll) / LH);
            if (hov >= 0 && hov < lines.length && m.clicked) { sel = hov; flag(hov); }
          }
          if (I.pressed('Space') || I.pressed('Enter')) flag(sel);
          scroll = PQ.clamp(scroll, 0, maxScroll);
        },
        draw(g) {
          const sx = shake > 0 ? PQ.randi(-3, 3) : 0;
          g.save(); g.translate(sx, 0);
          PQ.rect(g, -4, 16, 328, 224, C.black);
          const left = limit - t;
          PQ.text(g, 'COMMIT IN ' + PQ.fmtTime(left), 8, 22, left < 10 ? (Math.floor(t * 6) % 2 ? C.red : C.yellow) : C.ice, { size: 6 });
          PQ.text(g, 'TYPOS ' + found + '/' + nTypos, 160, 22, C.green, { size: 6, align: 'center' });
          for (let i = 0; i < 3; i++) PQ.rect(g, 286 + i * 10, 22, 7, 7, i < lives ? C.red : C.dgrey);
          if (api.boss) PQ.text(g, (api.bossName || 'BOSS') + ' IS WATCHING', 160, 31, C.red, { size: 6, align: 'center' });
          PQ.box(g, 4, VIEW_Y - 4, 312, VIEW_H + 8, C.black);
          g.save(); g.beginPath(); g.rect(8, VIEW_Y, 304, VIEW_H); g.clip();
          const first = Math.max(0, Math.floor(scroll / LH));
          const hov = PQ.inRect(PQ.input.mouse, 8, VIEW_Y, 304, VIEW_H) ? Math.floor((PQ.input.mouse.y - VIEW_Y + scroll) / LH) : -1;
          for (let i = first; i < Math.min(lines.length, first + VISIBLE + 2); i++) {
            const l = lines[i], y = VIEW_Y + i * LH - scroll;
            if (i === sel) PQ.rect(g, 8, y - 1, 304, LH, C.blue);
            else if (i === hov) PQ.rect(g, 8, y - 1, 304, LH, C.navy);
            if (l.wrong) PQ.rect(g, 8, y - 1, 304, LH, C.red);
            const s = l.typo ? (l.found ? l.good : l.bad) : l.good;
            const col = l.found ? C.green : s === '!' ? C.dgrey : /^\S/.test(s) ? C.cyan : C.ice;
            PQ.text(g, String(i + 1).padStart(2, ' '), 10, y + 1, C.grey, { size: 9, font: PQ.MONO, shadow: false });
            PQ.text(g, s, 26, y + 1, col, { size: 10, font: PQ.MONO, shadow: false });
            if (l.found) PQ.text(g, 'OK', 306, y, C.green, { size: 6, align: 'right', shadow: false });
          }
          g.restore();
          const sbH = VIEW_H * Math.min(1, VIEW_H / (lines.length * LH));
          PQ.rect(g, 313, VIEW_Y + (VIEW_H - sbH) * (maxScroll ? scroll / maxScroll : 0), 2, sbH, C.sky);
          if (msg) { PQ.rect(g, 0, 212, 320, 12, C.navy); PQ.text(g, msg.s, 160, 214, msg.col, { size: 6, align: 'center' }); }
          else PQ.text(g, 'SW# copy run start  (pending)', 160, 214, C.dgrey, { size: 6, align: 'center' });
          g.restore();
        },
      };
    },
  });
})();
