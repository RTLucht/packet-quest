> Grok design brief (2026-10-01). Numbers/ideas adopted into js/config.js. File layout section is superseded by CLAUDE.md.

# PACKET QUEST: The Tech$$$ Run — build contract

Vanilla JS + Canvas. No build step, no ES modules, no CDN, no webfont. Double-click `index.html` must work on `file://`.

```
index.html
(no bitmaps; bills are drawn in code)
css/game.css
js/data.js              (map, tips, config bank, prices, palette)
js/audio.js
js/engine.js            (loop, input, save, economy, overworld, shop, tickets, enemies)
js/minigames.js         (all 7 games, each a function of a config object)
js/bosses.js            (phase lists that call those functions)
```

Script order: data, audio, minigames, bosses, engine. One global `G`. `requestAnimationFrame`, clamp dt to 0.05s.

Canvas internal **320×224**, CSS ×3 → 960×672, `image-rendering: pixelated`. Tile 16px. Font: `ui-monospace` 8px. Only the 16 palette hexes below go into `fillStyle`.

**Hard rule:** bosses are configs passed into the same 7 game functions (`onWin`, `onFail` callbacks). Do not fork a second copy of a game for a boss.

**Two clocks, always.** Outer SLA starts when the ticket is taken and runs through the walk and the puzzle. Inner bar is the puzzle fail clock. Outer expiry mid-puzzle shows `SLA BREACHED` and the puzzle continues.

**Cut order if the session slips:** title melody → leaderboard panel → Auditor → Great Outage → Rogue AP → cosmetics. Never cut movement, tickets, the payout formula, VLAN, Cable, Config, the shop, or Loopmaster.

---

## 1. MVP scope

Ship all 7. Each round is about 45–80s. Level is not a menu: `level = clamp(1 + floor(ticketsClosed / 6), 1, 3)`.

### Shared shell

HUD on every puzzle: mission name, inner bar, outer SLA seconds, lives, stamina, T$. Esc pauses. Click or the keys below both work. 3 lives. Puzzle fail: pay 0, lives −1, ticket cancelled, dumped on that site's mat. 0 lives: warp to `(6,9)`, lives = 3, `cash = floor(cash * 0.9)`, ticket dropped.

**It was DNS.** A 46×14 button, bottom-right, palette slot 15, label `DNS?`. Hidden until 2 strikes or 20s with no board change, then it lights (slot 10). Key `F` or click. Clears the current puzzle or boss phase. Pay for a normal ticket becomes **exactly 1**. Trombone. Counts as a close for unlock counters. CCIE does not multiply it. Drone and DNS cannot both be used on the same phase.

**Pager.** While a non-boss ticket is open, arm once at random 40–70s. Beep + banner `ACK THE PAGE` for 8s. `P` acks: **+5 T$**. Miss: outer SLA −15s. No page if SLA left < 20s. No page on bosses.

### Payout (every normal ticket)

```
base = cable 10, ap 20, vlan 20, packet 50, config 50, rogue 50, stp 100
raw  = floor(base * levelMult[level] * urgencyMult[urgency])
levelMult   = {1: 1, 2: 1.5, 3: 2}
urgencyMult = {green: 1, yellow: 1.25, red: 1.5}

win and SLA still running:
  bonus = floor(raw * (slaLeft / slaMax) * 0.5)    # 0 to 50%
  pay   = raw + bonus
win and SLA already 0:
  pay   = floor(raw * 0.5)                         # no bonus
fail:   pay = 0
DNS:    pay = 1

if CCIE owned and pay > 1: pay = floor(pay * 1.1)
```

Worked example: Cable, L2, yellow → `floor(10 * 1.5 * 1.25) = 18`. Finish with 40s of 110 left → `floor(18 * 40/110 * 0.5) = 3`, pay 21. With CCIE, `floor(21 * 1.1) = 23`. SLA already dead → 9.

Drone success pays `raw` (bonus 0, SLA not breached), then the CCIE ×1.1. Bosses pay flat and skip this formula.

Outer SLA by urgency: **green 150s, yellow 110s, red 85s.** Inner clocks below are shorter than red on purpose.

### Cable Chaos — 10 T$

Pipe tiles on a grid. Each tile is a 4-bit mask, N=1 E=2 S=4 W=8. Types: straight and corner. L2+ adds one T. Source is the west edge of `(0, mid)`. Sink is the east edge of `(cols-1, mid)`. All tiles start randomly rotated.

Flow is **recomputed from the source every frame** through matching ports (no marching water blob). The live path pulses slot 4. Win the instant the sink is reached. Heat bar is the inner clock; it only rises with time. Rotate during flow as much as you want.

| | L1 | L2 | L3 |
|---|---|---|---|
| Grid | 5×5, straight+corner | 6×6, one T (unused arm is fine) | 6×6, two sinks (both must connect) |
| Heat | 80s | 65s | 55s |
| Extra | — | — | one tile cracks to mask 0 after it has been on the live path for 2s continuous; route around it |

Controls: arrows / WASD move the cursor. Space or left-click rotates CW. `R` or right-click rotates CCW.
Win: sink connected. Lose: heat hits 100 (life −1).

### AP Placement — 20 T$

Floorplan grid. Cells: wall, floor, void. Click a floor cell to place or pick up an AP. Coverage = BFS through floor (walls block) up to R steps. Must-cover = every floor cell. Submit with Enter.

| | L1 | L2 | L3 |
|---|---|---|---|
| Grid | 8×6, no internal walls | 10×8, one corridor wall | 10×8, one walled-off stair cell plus a 4-cell records room |
| APs / R | 2 / 3 | 3 / 2 | 3 / 2 |
| Inner | 80s | 70s | 60s |
| Extra | — | — | records-room floor is **forbidden**: if any of it is covered, submit fails with `guest signal in the records room` |

Controls: click toggle, or arrows + Space. `Z` lifts the last AP. Enter submits.
Win: every must-cover cell covered, no forbidden cell covered, APs used ≤ budget.
Lose: inner timer 0, or 3 bad submits (a bad submit is a strike, not a life, until the third).

### VLAN Sorter — 20 T$

One device falls in the center. Four buckets along the bottom. Steer the highlight before it lands.

| Icon | Lands in |
|---|---|
| PC, PRN | VLAN 10 DATA |
| PHONE, BADGE | VLAN 20 VOICE |
| GUEST, BYOD | VLAN 30 GUEST |
| IOT, ??? | VLAN 99 QUARANTINE |

| | L1 | L2 | L3 |
|---|---|---|---|
| Buckets | 10 and 20 only | +30 | all four |
| Devices | 16, fall 2.0s, gap 0.45s | 20, fall 1.5s, gap 0.35s | 24, fall 1.15s, gap 0.3s |
| Misses allowed | 3 | 3 | 2 |
| Extra | — | — | 20% show a sticky with the wrong VLAN number. Banner: `Trust the device, not the sticky.` Icon is truth |

A miss is a strike. Down / Space drops the device now. Round length is the content (~50–70s). Inner backstop 70 / 60 / 55 if they stall.
Controls: Left/Right or A/D move the highlight. Keys `1`–`4` snap to a bucket. Click a bucket.
Win: queue empty and misses ≤ limit. Lose: misses over the limit, or backstop.

### Packet Tracer Run — 50 T$

Not a platformer. Three lanes, the packet stays at x=80, the world scrolls left. No gravity.

Obstacle kinds: `acl` (one lane, touch = −2 TTL and a 0.5s stun), `ttl` (one lane, touch = −1 TTL), `router` (one lane, touch = refill TTL to max), `denyall` (every lane; the right edge flashes slot 10 for 0.8s, then it spawns).

| | L1 | L2 | L3 |
|---|---|---|---|
| Scroll | 40 obstacles, one every 1.3s (~52s) | 45 every 1.1s (~50s) | 50 every 0.95s (~48s) |
| TTL max | 10 | 8 | 6 |
| Routers | every 15th obstacle | every 18th | every 20th |
| Extra | only one lane blocked at a time | from obstacle 10, two lanes can be blocked | a `denyall` every 12s |

Start TTL = max. Inner clock = the scroll duration; also fail instantly at TTL 0.
Controls: Up/Down or W/S change lane, clamped 0..2. Click a lane to move there. No left/right.
Win: last obstacle scrolls off and TTL > 0. Lose: TTL 0.

### Config Commit — 50 T$

Ticket banner is one line and is the spec. Body is 8–16 monospace lines. Exactly one token is wrong, and it contradicts the banner. Flag that token.

Hardcode these 8. L1 draws from 1–4, banner restates the bad idea in plain words. L2 draws from 1–6. L3 draws from 5–8 and adds one decoy misspelling inside a `!` comment; the comment is never the answer.

| # | Banner | Bad token |
|---|---|---|
| 1 | Uplink Gi1/0/1 must be 1000/full and up | `speed 10` or `duplex half` or `shutdown` |
| 2 | User access VLAN is 20. VLAN 1 is not allowed | `switchport access vlan 1` |
| 3 | Telnet is forbidden. SSH only | `permit tcp any any eq 23` |
| 4 | Voice pool is 10.20.20.0/24. Gateway must be inside it | `default-router 10.10.10.1` |
| 5 | SNMP must not use a default community | `snmp-server community public RO` |
| 6 | The /31 is 10.0.0.0/31. 10.0.0.5 is not on it | `ip address 10.0.0.5 255.255.255.254` |
| 7 | Rapid PVST is the standard | `spanning-tree mode pvst` |
| 8 | Guest VLAN 30 must not be the trunk native VLAN | `switchport trunk native vlan 30` |

| | L1 | L2 | L3 |
|---|---|---|---|
| Lines | 8, static | 12, scroll 1 line / 2s | 16, scroll 1 line / 1.2s |
| Inner | 60s | 50s | 42s |
| Strikes | 3 | 2 | 2 |

Controls: Up/Down lines, Left/Right tokens, Enter flags. Click a word to flag it.
Win: the bad token. Lose: strikes exhausted, or inner timer 0 (rollback). Either is a life.

### Rogue AP Hunt — 50 T$

Room of floor and wall. Rogue is hidden. RSSI `= -30 - (manhattan * 7)`, drawn as a number. Beep interval `= 160 + manhattan * 120` ms, square 880 Hz, 40 ms, gain 0.08. Walls block walking and guard vision. Walls do **not** change RSSI.

Guards patrol a polyline loop, one tile every 600ms. Vision = the next 2 tiles in front, cardinal only. Player on a vision tile: alarms +1, rogue jumps to a random floor tile at manhattan ≥ 4, guards reset to their start. Capture = stand on the rogue tile and press E / click it.

| | L1 | L2 | L3 |
|---|---|---|---|
| Room | 7×7 open | 9×9, a few walls | 9×9, walls |
| Guards | 1, horizontal patrol | 2 | 2 |
| Inner | 70s | 60s | 50s |
| Extra | beep + RSSI | beep + RSSI | rogue steps one random floor tile every 8s. Beep only while the player stands still 0.5s. RSSI always updates |

Controls: WASD / arrows step. E captures. Click an adjacent floor tile to step there.
Win: capture. Lose: 2 alarms, or inner timer 0.

### Spanning Tree Siege — 100 T$

Nodes and edges drawn as a graph, not creeps. Click an edge to toggle BLOCK. After every toggle, test the open graph:

- connected (BFS from root reaches every node), and
- `openEdges == nodes - 1` (a tree), and
- on L3 the gold uplink is still open.

All three true → auto-win. No Enter.

The storm bar **is** the inner clock.

```
base = 100 / innerSeconds
extra = max(0, openEdges - (nodes - 1))
rate  = base * (1 + extra)          # per second
if not connected: rate = base * 3
```

| | L1 | L2 | L3 |
|---|---|---|---|
| Graph | 4 nodes, 4 edges | 6 nodes, 8 edges | 6 nodes, 9 edges, edge A–B is gold |
| Inner | 65s | 55s | 45s |

L1 adjacency, root A: `A-B, A-C, B-C, C-D`. The only cycle is A-B-C. Blocking `C-D` isolates D, so it will not win.
L2: root A, nodes A–F, edges `A-B, A-C, B-C, B-D, C-E, D-E, E-F, D-F`.
L3: L2 plus `A-D`. Gold `A-B` must stay open. Blocking it can still make a tree; show `uplink blocked` and do not win.

Controls: click an edge. Tab cycles edges, Space toggles the selected one.
Win: tree (plus gold rule). Lose: bar hits 100.

---

## 2. Overworld

One room, **20×14**, no camera. Solid: `# S B M D i`. `H` is the terminal mat (walkable). `G` is a gremlin spawn marker, drawn as floor. Everything else is floor.

```
####################
#SS.......ii..BBBB.#
#SS.......ii..BBBB.#
####..........BBBB.#
#...............BB.#
#..######..........#
#..#H...#....G.....#
#..#....#..........#
#..###.##..........#
#..................#
#MMMM.........DDD..#
#MMMM.........DDD..#
#..M...........D...#
####################
```

Reachable as drawn. Checked.

| Mat | Tile (col, row) | What E / Space / click does |
|---|---|---|
| Player start | (6, 9) | just south of the HQ door |
| HQ door | (6, 8) | gap in the south wall |
| Terminal | (4, 6) | take the offered ticket, or abandon the open one for 0 |
| Shop | stand (3, 2), counter is the `S` at (2, 2) | open the shop list |
| Clinic | (13, 3) | start the ticket if its site is Clinic |
| Data Center | (13, 10) | same, site DC. Door stays shut until CCNA |
| Campus MDF | (5, 10) | same, site Campus. Door stays shut until CCNP |

Wrong site: banner `Ticket is for the CLINIC` (or DC / CAMPUS). No start. No ticket: banner shows the site name and whether its boss door is lit. Boss doors use the same mat, but only when that boss is unlocked; the banner then says `BOSS` and E starts the fight.

Movement: 4-dir, arrows or WASD, no diagonal. Hold repeats at **110ms** per step. Collision cancels the step. Shift does nothing (do not build a sprint). Mouse: click an adjacent walkable tile to step.

### Tickets

One open ticket. The terminal offers exactly one, rolled on interact:

- Site and mission come from the unlock pool.
- Urgency weights by level: L1 **50/35/15**, L2 **30/40/30**, L3 **15/35/50** (green/yellow/red).
- SLA from the urgency table. Level does not change SLA.

| Owned | Missions | Sites |
|---|---|---|
| start | Cable, AP, VLAN | Clinic only |
| CCNA | + Packet, Config, Rogue | Clinic + DC. Rogue is DC only |
| CCNP | + STP | all three. STP prefers Campus (70% Campus, else either open site) |

Abandon at the terminal: ticket dies, no pay, no close credit.

### Enemies

No overworld death. Touch = penalties. Cap checked every 20s after the first ticket exists. They never enter solid tiles or the HQ interior (cols 4–7, rows 6–7).

**Gremlins** (cap 2). Spawns `(12,6)` and `(16,9)`. Random 4-dir step every 700ms. Same tile as the player: stamina −25, and if a ticket is open SLA −12s, then that gremlin despawns. Facing one and pressing E (range 1, or 2 with the cable) shoos it with no penalty.

**Interference Ghost** (cap 1). Locked to the four `i` tiles `(9,1) (10,1) (9,2) (10,2)` and drifts one of those tiles every 2s. `i` tiles are solid (the microwave). While the player is Chebyshev ≤ 2 from the ghost: step cooldown becomes 200ms. If the open ticket is AP or Rogue, SLA drains ×1.5. No contact damage. You do not kill it.

**Shadow IT Slime** (cap 1). Homes on `(10,9)`, stationary, blocks the tile. E in range: it becomes floor and stays gone 45s. A second E within 3s spawns two child blockers on adjacent floor tiles for 8s, then all three despawn. One squish is the right play.

Label Maker removal, permanent for that quadrant:

- Clinic labeled → ghost gone
- Campus labeled → slime gone
- DC labeled → gremlins gone

Change Window Phantom and Firmware Mimic are not in this build. The pager is the phantom. The mimic is optional idea 1.

---

## 3. Economy

Lifetime T$ (sum of pays, never reduced by spending) sets rank. Cash is the wallet.

| Rank | Lifetime T$ | HUD |
|---|---|---|
| Tier 1 Tech | 0 | T1 |
| Field Engineer | 150 | FE |
| Network Engineer | 450 | NE |
| Senior Engineer | 900 | SE |
| Architect | 1500 | AR |
| Principal of the Packet Realm | 2500 **and** Great Outage won | PR |

A cheese path (DNS = 1 T$ plus the four boss flats 100+200+350+1000) tops out near 1700 and does **not** make Principal. Do not "fix" that.

Shop list. Up/Down, Enter buys, Esc closes. Can't afford: row in slot 15, Enter buzzes (square 110 Hz, 80 ms).

| Item | Price | Effect |
|---|---|---|
| Console Cable | 40, permanent | Interact range Chebyshev ≤ 2 (doors, terminal, shop, shoo, slime). No effect inside puzzles |
| Coffee | 15, consumable, cap 3 | `C` drinks. Stamina +50, max 100. Mistakes, strikes, and gremlin touches cost 25. At stamina ≤ 25, step cooldown is 200ms (stacks with the ghost to 280ms) |
| Golden Label Maker | 120, 3 charges | `L` on a site mat. That site never rolls red, and its enemy leaves (table above) |
| CCNA | 80 | Unlocks Packet, Config, Rogue, and the DC door |
| CCNP | 200 | Unlocks STP and the Campus door |
| CCIE | 400 | +10% on ticket pays after bonus, `floor`, and only when pay > 1. Does not scale boss flats. Required for the Outage door |
| AI Drone | 500, 3 charges | `Q` in a puzzle wins that phase now for `raw` (then CCIE). Refused on Outage phase 4. One use per phase |
| Hard hat | 25 | Palette swap on the player. No stats |
| Hi-vis vest | 40 | same |
| Migration shirt | 75 | same. Equip in the shop. Leaderboard shows the equipped name |

Stamina starts at 100. Coffee is the only heal.

Save key `pq_save`: cash, lifetime, ticketsClosed, per-site closes, inventory, charges, labeled sites, bosses, certs, lives, stamina, cosmetic, open ticket or null. Write on close, purchase, label, boss end, life loss.

A competent clear is about 8 Clinic tickets, Loopmaster, 4 DC tickets, Lord BGP, a few STP, Auditor, then the Outage: roughly 25–40 minutes, lifetime landing around 2900 if they actually play.

---

## 4. Bosses

Flat pay. No outer SLA. 2 failed phases = attempt over, warp to `(6,9)`, boss stays alive, retry immediately. DNS clears one phase and subtracts 50 from the flat pay (minimum 50). Drone clears one phase for free and does not subtract.

| Boss | Where | Unlock | Flat pay |
|---|---|---|---|
| Loopmaster | Clinic mat | 5 Clinic closes **and** rank ≥ FE | 100 |
| Lord BGP Flap | DC mat | CCNA, Loopmaster dead, 4 DC closes, rank ≥ NE | 200 |
| The Auditor | Campus mat | CCNP, BGP dead, ≥1 site labeled, 3 Campus closes, rank ≥ SE | 350 |
| The Great Outage | Terminal, banner becomes `OUTAGE` | all 3 bosses dead, CCIE owned, rank ≥ AR | 1000 if phase 4 is on time, else 400 |

### Loopmaster — STP hydra, then a patch

1. STP L2 graph. Auto-win on a tree.
2. Same graph, but every 5s one blocked edge reopens. Re-tree it **3 times**. The storm bar does not reset between regrowths; inner 40s.
3. Cable on a 4×4, heat 25s, one tile rotates itself 90° every 4s. One sink.

### Lord BGP Flap — routes disappear

1. Packet L2, but each `acl` is telegraphed 0.8s early (the lane flashes) because the route just withdrew. Distance 30 obstacles.
2. VLAN, two buckets only: `ADVERTISE` and `WITHDRAW`. 10 prefixes, fall 1.2s, 2 misses. Rule on the banner, evaluated in order, first match wins: withdraw if the prefix contains `down`; else advertise if it is a `/24`; else withdraw. Icons: a `/24`, a `/16`, a `/24` with the word `down`.
3. Packet again: TTL 6, 24 obstacles, one `denyall`.

### The Auditor — docs or nothing

1. Config L3 rules (bugs 5–8, one decoy comment).
2. Three rows: Clinic, DC, Campus, each already filled from the save as DOCUMENTED or NOT. Confirm with Space only on DOCUMENTED rows. Confirming a NOT row is a strike. 3 strikes fail the phase. Win = every DOCUMENTED row confirmed and no NOT row confirmed. **If zero sites are labeled, the rows are sealed:** no confirm works. DNS is the only clear, and the −50 still applies. This is the weak-spot rule.
3. AP L3: staff floor must be green **and** the records room must stay uncovered. 50s, 3 APs, R=2.

### The Great Outage — triage, then DNS

Four cards, timers start together. Click one to play it. Finish → back to the board, card stays green, its timer stops. A card whose timer hits 0 before you start it is dead and unpickable. You need **3** greens. Two dead cards = attempt failed.

| Card | Board timer | What you play |
|---|---|---|
| Remote closet | 22s | STP L1 graph, inner bar 12s |
| Clinic | 32s | VLAN, 8 devices, buckets 10 and 20, fall 1.0s, 1 miss |
| Data Center | 42s | Packet, 18 obstacles every 0.7s, TTL 5 |
| Campus | 55s | Config, 6 static lines, bug #3 (telnet), 1 strike, 12s |

Do the 22s card first. Doing Campus first loses the closet.

Phase 4, only after 3 greens: the DNS button is forced visible and is the **only** control. Press in **10s** → pay 1000, trombone then the victory arpeggio. Later than 10s → still a win, pay 400. Phase 4 cannot fail. Principal checks after this pay is banked.

---

## 5. Fun touches

DNS and the pager are specified in §1. Both are in the MVP, not polish.

**Leaderboard.** Key `pq_board`, top 5 `{name, lifetime, rank, cosmetic, date}`. Name entry only when rank changes to PR, or from the terminal when no ticket is open. Name ≤ 12 chars, default `tech`. Sort by lifetime desc. Draw it under the terminal. No network.

**Loading tip.** On every puzzle entry, 400ms of binary rain plus one tip, skippable with any key. 30 tips, all under 90 chars:

1. Ethernet has no TTL. A switching loop floods until STP blocks a port.
2. STP root is the lowest bridge ID: priority first, then MAC address.
3. PortFast skips Listening and Learning. Never face it toward a switch.
4. BPDU Guard err-disables a port that receives a BPDU. Pair it with PortFast.
5. A VLAN is one broadcast domain. Other VLANs need a router to talk.
6. An access port carries one untagged VLAN. A trunk carries many, tagged.
7. Voice VLAN is the common exception: a second, tagged VLAN on an access port.
8. 802.1Q inserts 4 bytes. A max-size frame grows from 1518 to 1522 bytes.
9. Native VLAN frames are untagged. Mismatch it and traffic leaks across VLANs.
10. ACL wildcards are inverted. 0.0.0.255 means match only the last octet.
11. Longest prefix match wins. A /32 beats a /24, and both beat 0.0.0.0/0.
12. ip default-gateway is for the switch itself, not for the hosts behind it.
13. OSPF router-id: manual if set, else highest loopback, else highest up IP.
14. Cisco BGP checks weight, then local preference, before AS-path length.
15. iBGP does not re-advertise iBGP routes. That is why route reflectors exist.
16. DHCP Discover is a broadcast. Cross-VLAN needs a relay: ip helper-address.
17. ARP maps IPv4 to a MAC on the local subnet only. It stops at the router.
18. Hosts should gateway to the HSRP or VRRP virtual IP, not a physical IP.
19. Channels 1, 6, and 11 do not overlap as 20 MHz channels in 2.4 GHz.
20. A rogue AP is a radio you do not control. Copying your SSID changes nothing.
21. SNMP v2c is cleartext. The community public is a default, not a secret.
22. Telnet sends passwords in cleartext. Use SSH for management access.
23. Duplex mismatch: CRC errors, plus late collisions on the half-duplex side.
24. Hard-set speed facing auto usually fails to negotiate. Set both ends.
25. PAT hides many hosts behind one public IP by rewriting source ports.
26. An ACL that denies ICMP does not mean the host is down. Ping was filtered.
27. Small pings work but apps hang? Suspect MTU. A large DF-bit ping proves it.
28. A /31 mask is valid on a point-to-point link. That is RFC 3021.
29. DNS TTL is in seconds. After you fix a record, caches keep the old one.
30. Err-disable is the switch protecting you. Read why, then shut/no shut.

---

## 6. 8-bit look and sound

16 colors. Sampled off the original bill art (the art clusters at `#102050`, `#204080`, `#305090`, `#5070b0`). Gold and the status colors are added so a bill-blue game stays readable. Index order is the NES order; do not reorder.

| # | Hex | Use |
|---|---|---|
| 0 | `#0B1020` | outline, void |
| 1 | `#102050` | walls |
| 2 | `#1A3A80` | royal field, bill body, HQ |
| 3 | `#2E5EAA` | doors, panels |
| 4 | `#7EC8E3` | cyan highlight, binary rain, live path |
| 5 | `#E7EEF8` | text |
| 6 | `#8EADD4` | shaded floor |
| 7 | `#D8B15A` | gold, T$, the 100 |
| 8 | `#2FCE7A` | SLA safe, coverage, win |
| 9 | `#E0A106` | yellow urgency, telegraph |
| 10 | `#D64545` | red urgency, storm, fail |
| 11 | `#7DCE4A` | gremlin |
| 12 | `#2F8F6B` | slime |
| 13 | `#C4843A` | wood, coffee |
| 14 | `#D5D8E0` | floor |
| 15 | `#6A7080` | disabled row, shadow |

Binary rain: 40 glyphs of `0`/`1` in slot 4, `globalAlpha = 0.35`, falling 30px/s logical. That is the only alpha.

Sprites are rects and 8×8 blits drawn in code. Player is a 8×8 in slot 5 with the equipped cosmetic as a 2px band (hat slot 7, vest slot 9, shirt slot 4).

### WebAudio

One `AudioContext`, resumed on the first key or click. Master gain **0.18**.

Voice helper: oscillator → gain. Attack 0.01s linear. Release exponential to 0.0001 over the note length. Types: `square` lead and beeps, `triangle` bass and trombone. No samples, no noise buffer required.

A4 = 440, equal temperament.

**Title loop**, 120 BPM, D minor (i–VII–III–i). Square lead gain 0.07, triangle bass gain 0.05, both looping. Lead is eighth notes, 4 bars:

```
D4 F4 A4 F4  A4 F4 D4 A3
C4 E4 G4 E4  G4 E4 C4 G3
F4 A4 C5 A4  C5 A4 F4 C4
A4 F4 E4 D4  F4 E4 D4 D4
```

Bass, one whole note per bar: `D2  C2  F2  D2`.

**Pager** (square, gain 0.12), play twice:

```
1760 Hz 90ms, rest 50, 1760 90ms, rest 50, 1760 90ms, rest 200, 1397 Hz 200ms
```

**Trombone** (triangle, gain 0.14), 160ms each, no gap: `Bb3 A3 G3 F3 Eb3 D3` (233, 220, 196, 175, 156, 147 Hz).

**Victory** (square, gain 0.1), 120ms each: `C5 E5 G5 C6`.

Shop buzz: square 110 Hz, 80ms, gain 0.08.

---

## 7. Five cheap extras

Build these only after Loopmaster is winnable. Each is data plus a few branches.

1. **Firmware Mimic crate.** Shop row, 10 T$. 70%: a sticker, no stat, title prefix `STICKER`. 30%: lose 25 T$ and the banner `it was a firmware mimic`. One random roll.
2. **Flavor line on the ticket.** A 20-string table keyed by mission (`users say Wi-Fi died when the microwave moved` → AP or Rogue). Drawn under the payout. No new rules.
3. **Clean-close chain.** HUD number. 3 ticket wins in a row with no fail and no DNS: the third pay ×1.25 after CCIE, `floor`. Any fail, DNS, or abandon resets to 0.
4. **Close line.** On a real win, one sentence from the rule you just used, under the T$ count. Examples: `A tree has N-1 links.` / `The icon was right. The sticky was lying.` / `Ethernet has no TTL. The ACL was the wall.` String table, ~15 lines, keyed by mission.
5. **Repeat the break.** The mission you last failed gets +1 weight in the terminal roller until you close one of that mission. One integer in the save.

---

## Locked numbers (do not retune mid-build)

- SLA 150 / 110 / 85. Inner clocks as tabulated. Bonus `floor(raw * left/max * 0.5)`. Breach pays `floor(raw * 0.5)`. DNS pays 1.
- Ranks at lifetime 0 / 150 / 450 / 900 / 1500 / 2500+Outage.
- Shop: cable 40, coffee 15, label 120, CCNA 80, CCNP 200, CCIE 400, drone 500, hats 25 / 40 / 75.
- Boss flats 100 / 200 / 350 / 1000 (or 400 if DNS was late).
- Lives 3. Death tax 10% cash. Stamina 100, coffee +50, hit −25.
- Step 110ms. Ghost and low stamina 200ms. Stack 280ms.
