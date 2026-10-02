# Packet Quest: The Tech$$$ Run

**Mission:** 8-bit top-down network-engineer adventure where you close tickets via mini-games to earn Tech$$$, rank up, and beat The Great Outage.

## Stack / architecture
- Vanilla JS + HTML5 Canvas 2D. No build step, no dependencies. Open `index.html` directly (works from `file://`).
- Classic `<script>` tags (not ES modules — modules break on `file://`). Everything hangs off the global `PQ` namespace.
- Logical resolution **320x240**, integer-scaled, `image-rendering: pixelated`. All drawing in logical pixels.
- Audio: WebAudio oscillators only (square/triangle/noise). No audio files.
- Persistence: `localStorage` key `pq.save.v1` (game state) and `pq.board.v1` (leaderboard).

## Files
| File | Role |
|------|------|
| `index.html` | canvas + script load order |
| `js/core.js` | `PQ` namespace: palette, input, audio, draw helpers, scene manager, save |
| `js/config.js` | all tunable numbers (payouts, SLA, prices, ranks, tips) |
| `js/minigame-host.js` | wraps a mini-game: intro card, HUD/SLA bar, DNS button, result card, payout |
| `js/minigames/*.js` | one file per mini-game, each calls `PQ.registerMinigame({...})` |
| `js/overworld.js` | tile map, player, sites, roaming enemies |
| `js/scenes.js` | title, HQ ticket queue, Supply Depot, boss gauntlets, ending, leaderboard |
| `js/main.js` | boot + game loop |

## Mini-game contract
```js
PQ.registerMinigame({
  id: 'cable', title: 'CABLE CHAOS', payout: 10,
  help: ['Line 1 of instructions', 'Line 2'],   // shown on intro card, <= 36 chars/line
  create(api) {            // api: { level:1..3, boss:bool, perks:{reach,drone,...}, finish(result) }
    return {
      update(dt) {},       // dt in seconds
      draw(g) {},          // g = CanvasRenderingContext2D, area y=16..240 (top 16px = host HUD)
    };
  }
});
// finish({ success: bool, quality: 0..1 })  -> call exactly once
```
Input: `PQ.input.down(k)`, `PQ.input.pressed(k)` (edge, this frame), `PQ.input.mouse {x,y,down,clicked,rclicked}`. Keys use `KeyboardEvent.code` (`ArrowLeft`, `KeyA`, `Space`, `Enter`, ...).
Draw: `PQ.C.<color>`, `PQ.text(g,s,x,y,col,{size,align})`, `PQ.rect(g,x,y,w,h,col)`, `PQ.box(g,x,y,w,h)` (panel), `PQ.sfx(name)`.

## Conventions
- camelCase JS, 2-space indent, `'use strict'` IIFE per file.
- Palette only from `PQ.C` (16-color Tech$$$ blue set).
- Numbers live in `js/config.js`, not scattered in code.

## Non-goals
- No multiplayer/backend. Leaderboard is local (export hook only).
- No external assets beyond the Press Start 2P Google Font (falls back to monospace).
