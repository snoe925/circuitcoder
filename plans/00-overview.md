# Circuit Coder (Browser Remake) — Overview Plan

## Goal
Recreate the iPad classic **Circuit Coder / Circuitry-style** game for the browser:
build small combinational logic circuits and solve truth-table challenges.

No build step. No dependencies. Open `index.html` (via local server) and play.
`node --test` for logic tests.

## What "full game" means here (scope)
- **Campaign:** 12 progressive challenge levels (gates → adders → mux → comparator).
- **Sandbox:** free playground with all unlocked parts.
- **Builder:** place / move / delete gates, click-drag wiring, toggle inputs, live simulation.
- **Win condition:** circuit matches all hidden truth-table test cases + respects parts budget.
- **Persistence:** progress + stars + sandbox autosave in `localStorage`.
- **Quality bar:** pure simulation engine fully unit-tested; levels validated by tests; accessible keyboard/mouse/touch UI.

## Non-goals (v1)
- Sequential logic (clocks, latches, flip-flops, oscillators). Combinational only — same as original game's core.
- Multi-bit buses, 7400-series packaging, user sub-circuits, multiplayer, backend.
- These are listed as v2 extensions in `plans/02-architecture.md`.

## Inspiration / research
- Circuitry (iPad): 21 logic challenges, 28 elements, playground mode.
- Circuit Snap: start with 2 gates, unlock complex circuits, 100+ puzzles, combinational only, sandbox mode.
- Circuit Scramble (web): 135+ puzzles, real-time signal viz, star ratings.

Our remake borrows: progressive unlock, truth-table verification, live wire colors, playground.

## Deliverables
```
plans/00-overview.md (this file)
plans/01-game-design.md
plans/02-architecture.md
plans/03-levels-progression.md
index.html
css/styles.css
src/engine.js      # pure simulation, zero DOM
src/levels.js      # level catalogue + truth tables
src/store.js       # localStorage persistence
src/app.js         # UI: palette, canvas, wiring, verification
tests/engine.test.mjs
tests/levels.test.mjs
package.json
README.md
```

## Success criteria
1. All 12 levels solvable with allowed parts (proven by reference solutions in tests).
2. Engine handles: unconnected pins, cycles, deletion, 100+ gates at 60fps evaluation.
3. `npm test` green on Node 20+.
4. Playable with mouse + touch, keyboard-accessible inputs.
