# Circuit Coder — browser remake

An iPad-style logic-circuit challenge game for the browser. Build combinational
circuits from gates, watch live signal flow, and solve 12 truth-table challenges
plus a free sandbox. No dependencies, no build step.

## Play

```bash
npm run serve   # then open http://localhost:8000
# or: npx serve . / python3 -m http.server 8000
# (ES modules need http:// — file:// won't load them)
```

- **Challenges:** pick a level → add gates from the palette → click an output
  pin then an input pin to wire → click INPUTs to toggle → **Check solution**.
- **Sandbox:** everything unlocked, autosaved to `localStorage`.
- Wires glow green for 1; lamps show 0/1 text too (color is never the only cue).
- Progress + stars persist in `localStorage` (`circuitcoder.v1`).

## Levels (12)

NOT → AND → OR → XOR-from-scratch → NAND-only XOR → NOR-only XOR → XNOR →
Half Adder → Full Adder → 2:1 MUX → Majority → 2-bit Equality.
Details: `plans/03-levels-progression.md`.

## Code layout

```
index.html  css/styles.css
src/engine.js  # pure simulation (tested, zero DOM)
src/gates.js   # traditional ANSI gate symbols as inline SVG (tested)
src/levels.js  # catalogue; truth tables generated, can't drift
src/store.js   # localStorage persistence
src/app.js     # UI: palette/canvas/wiring/verification
tests/engine.test.mjs  tests/levels.test.mjs
plans/00-overview.md 01-game-design.md 02-architecture.md 03-levels-progression.md
```

## Tests

```bash
npm test        # unit: node --test tests/ (Node 20+)
npm run test:e2e # e2e: playwright test (Chromium, auto-serves :8000)
npm run test:all # both
```

- `engine.test.mjs`: gate truth tables, unconnected→0, fanout, 100-gate chain,
  cycle→UNSTABLE, wire validation, serialize round-trip.
- `levels.test.mjs`: every level has exhaustive tests; a coded reference
  solution for each level passes within budget at par (proves solvability);
  a wrong-circuit sanity check fails as expected.
- `gates.test.mjs`: every gate renders an SVG sized to its node box with
  leads reaching the pins, bubbles only on inverters, XOR pre-curve present.
- `e2e/game.spec.js` (Playwright, 10 tests): level locks, palette/truth-table
  render, empty-check failure, full Level-1 solve → unlock + persist across
  reload, input toggling, live output lamp, wire replacement, sandbox palette,
  help modal, reset. Run with `npm run test:e2e` (first run:
  `npx playwright install chromium`).

## Manual UI checklist (now automated in e2e)

- [ ] Level 1 solvable by wiring A→NOT→Y; Check gives 3 stars, unlocks L2.
- [ ] Rewiring an occupied input replaces the wire, no error trap.
- [ ] Feedback loop shows "loop"/UNSTABLE warning and fails Check.
- [ ] Refresh keeps stars/unlocks; Sandbox circuit persists.
- [ ] Touch: tap output pin → tap input pin wires; drag moves gates.
