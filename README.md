# Packet Quest: The Tech$$$ Run

An 8-bit top-down network engineering adventure. You are a junior network engineer in The Enterprise: take tickets at HQ, walk to the site, fix the problem in a mini-game before the SLA runs out, and earn **Tech$$$** (10s, 20s, 50s, and the rare 100). Rank up from Tier 1 Tech to Principal of the Packet Realm and survive The Great Outage.

Built by a three-model team: Claude (architecture, engine, overworld, flow, 3 mini-games), Codex (4 mini-games), and Grok (design brief, economy, tips, review).

## Play

Open `index.html` in a browser. No install, no build, no server. Progress saves to `localStorage`.

| Key | Action |
|---|---|
| Arrows / WASD | Move |
| Shift | Run (uses stamina) |
| E / Enter | Interact (doors, terminal, shop, chests) |
| Space | Zap enemies with your console cable |
| C | Drink coffee (refill stamina) |
| P | Acknowledge the on-call pager |
| D | Send the AI drone (on a mission intro, if owned) |
| M | Mute |
| Esc | Bail out of a mini-game / menu |

## The loop

1. **HQ terminal**: pick a ticket. Urgency (green/yellow/red) sets the SLA (150/110/85 s) and payout multiplier.
2. **Travel** to the site. The SLA clock runs the whole time. Gremlins steal T$, the Interference Ghost slows you and doubles SLA drain, Shadow IT Slime splits when zapped, and the Change Window Phantom haunts 2–4 AM.
3. **Mini-game**: fix it. Payout = base × level × urgency, plus up to +50% for SLA time left. A blown SLA halves pay. Fail costs a life (3 lives; burnout = 10% T$ tax).
4. **Supply Depot**: console cable, coffee, Golden Label Maker, CCNA/CCNP/CCIE cert scrolls (unlock ticket types), AI drone, cosmetics.

## Mini-games

| Mission | Gameplay | Base |
|---|---|---|
| Cable Chaos | Rotate patch-cable tiles to connect ports before the closet overheats. Swat gremlins. | 10 |
| AP Placement | Place APs so the coverage heatmap is green with no dead zones. Walls and the MRI suite eat signal. | 20 |
| VLAN Sorter | Devices fall; drop each into the right VLAN bucket. | 20 |
| Packet Tracer Run | Side-scroller: you are the packet. Jump ACL walls, keep your TTL up. | 50 |
| Config Commit | Find the typos in a scrolling IOS config before it commits. Wrong flag = rollback. | 50 |
| Rogue AP Hunt | Stealth: follow the RF meter to the rogue AP, avoid patrols. | 50 |
| Spanning Tree Siege | Block links until the topology is a loop-free spanning tree before the storm melts it. | 100 |

## Bosses

- **The Loopmaster** (Branch Clinic): broadcast-storm hydra.
- **Lord BGP Flap** (Data Center): withdraws routes mid-fight.
- **The Auditor** (HQ Tower): only weak if your sites are documented.
- **The Great Outage** (NOC War Room): triage four sites on running timers, then find the root cause.

## Fun touches

- Hidden **dns** button in a mini-game's HUD corner after 20 s. It solves the puzzle, pays 1 T$, and plays a sad trombone.
- On-call pager interrupts mid-mission.
- Real networking tips on every loading screen.
- Local leaderboard (top 8 lifetime Tech$$$).

## Development

- `dev.html` is a harness that launches any mini-game at any level or in boss mode.
- Architecture and the mini-game contract are in `CLAUDE.md`. Tunable numbers are in `js/config.js`.
- Grok's original design brief is in `docs/grok-design-brief.md`.
