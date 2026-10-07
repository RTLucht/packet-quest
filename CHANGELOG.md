# Changelog

## [0.2.1] - 2026-10-07

### Changed
- Renamed the Packet Tracer Run mini-game to TTL Run (Packet Tracer is a Cisco product name).
- README: copyright notice (all rights reserved) and trademark disclaimer.

## [0.2.0] - 2026-10-06

### Changed
- Mini-games now unlock across all three cert scrolls, like Uptime Quest. Free: Cable Chaos, VLAN Sorter. CCNA: AP Placement, Config Commit. CCNP: Packet Tracer, Rogue AP. CCIE: Spanning Tree Siege (plus +10% pay). Existing saves keep their certs; some ticket types now need a higher cert.
- Tech$$$ bills recolored teal and amber to match the Server Room Arcade site.

## [0.1.2] - 2026-10-02

### Changed
- Currency renamed to Tech$$$ (abbreviated T$).
- Bill art is drawn in code only; the original bill image and concept doc are no longer in the repo.
- Added an "All games" link to the landing page at https://rtlucht.github.io/.

## [0.1.1] - 2026-10-02

### Changed
- Config Commit uses a readable monospace font (Consolas) at a larger size.
- Canvas renders at 3x backing resolution so all text is crisp; game logic stays 320x240.

## [0.1.0] - 2026-10-01

### Added
- Core engine: 320x240 pixel canvas, WebAudio chiptune music and SFX, input, scenes, localStorage save.
- Overworld "The Enterprise": hub (HQ, Supply Depot, NOC), three worlds gated by rank, data-stream rivers, day/night clock.
- Enemies: Gremlins, Interference Ghost, Shadow IT Slime, Change Window Phantom, Firmware Mimic chests.
- Ticket system: urgency, SLA timer, speed bonus, clean-close streak, lives and burnout.
- Seven mini-games: Cable Chaos, AP Placement, Config Commit (Claude); VLAN Sorter, Packet Tracer Run, Rogue AP Hunt, Spanning Tree Siege (Codex).
- Supply Depot with certs, tools, AI drone, cosmetics.
- Bosses: The Loopmaster, Lord BGP Flap, The Auditor (documentation check), The Great Outage (triage board + DNS finale).
- "It was DNS" button, on-call pager, loading-screen networking tips, local leaderboard.
- Economy, tips, and boss design from Grok's design brief.
