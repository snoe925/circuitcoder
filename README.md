# Circuit Coder — browser remake

An iPad-style logic-circuit challenge game for the browser. Build combinational
circuits from gates, watch live signal flow, and solve 112 truth-table
challenges across 11 chapters plus a free sandbox. No dependencies, no build step.

## Play

```bash
npm run serve   # then open http://localhost:8000
# or: npx serve . / python3 -m http.server 8000
# (ES modules need http:// — file:// won't load them)
```

- **Challenges:** pick a level → add gates from the palette → click an output
  pin then an input pin to wire → click INPUTs to toggle → **Check solution**.
- **fx: expressions** toggle shows each output as a live boolean formula.
- **Hint: Karnaugh map** under the truth table (2–4 input levels) regroups
  expected outputs to help plan gates.
- **Sandbox:** everything unlocked, autosaved to `localStorage`.
- Wires glow green for 1; lamps show 0/1 text too (color is never the only cue).
- Progress + stars persist in `localStorage` (`circuitcoder.v1`).

## Modes

- **Gates:** 112 challenges (Pack 1 + Pack 2) + Sandbox.
- **CMOS Lab:** 12 challenges (rails → transistors → CMOS gates → DTL →
  transmission gate → SR latch) + Playground. Transistors are
  voltage-controlled switches: amber wires float, red means short.
- **Op-Amp Lab:** 8 challenges (follower → comparator → amps → summer →
  Schmitt → difference → clipping) + Playground. Ideal op-amps (±11V
  rails, tolerance-checked), gradient wires, voltmeter probes, transfer
  curve, source sliders, click-to-step resistors.

## Gates levels (112)

Pack 1: NOT → AND → OR → XOR-from-scratch → NAND-only XOR → NOR-only XOR →
XNOR → Half Adder → Full Adder → 2:1 MUX → Majority → 2-bit Equality.
Pack 2 (N01–N100, `src/pack2.js`): Fluency → NAND/NOR Workshops → De Morgan &
Parity → Everyday Logic stories → Routing → Arithmetic → Codes & Detectors →
Seven Segments → Debug Ward (fix-the-circuit via `prefill`).
Details: `plans/03-levels-progression.md`, `plans/puzzles.md`, `plans/puzzles2.md`.

## Code layout

```
index.html  css/styles.css
src/engine.js  # pure simulation (tested, zero DOM)
src/gates.js   # traditional ANSI gate symbols as inline SVG (tested)
src/levels.js  # Pack 1 catalogue + campaign merge (tested)
src/pack2.js   # Pack 2: N01–N100 catalogue (tested)
src/cmos.js    # CMOS switch-level simulator (tested; bench UI next)
src/cmos-levels.js # CMOS Lab C1–C12 catalogue (tested)
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
- `levels.test.mjs`: Pack 1 — exhaustive tables; a coded reference
  solution for each level passes within budget at par (proves solvability);
  a wrong-circuit sanity check fails as expected.
- `pack2.test.mjs`: same bar for all 100 Pack 2 levels (budgets, par, 3 stars).
- `cmos.test.mjs` + `cmos-levels.test.mjs`: switch truths, CMOS NAND/NOR,
  FLOAT/SHORT faults, diode AND, stateful SR latch, and all 12 CMOS Lab
  references at par (bench UI still to come — see `plans/cmosplan.md`).
- `gates.test.mjs`: every gate renders an SVG sized to its node box with
  leads reaching the pins, bubbles only on inverters, XOR pre-curve present.
- `e2e/game.spec.js` (Playwright, 10 tests): level locks, palette/truth-table
  render, empty-check failure, full Level-1 solve → unlock + persist across
  reload, input toggling, live output lamp, wire replacement, sandbox palette,
  help modal, reset. Run with `npm run test:e2e` (first run:
  `npx playwright install chromium`).

## Designing a level (authoring tools)

```bash
node scripts/kmap.mjs --on 0,2,6,8 --dc 10-15 --vars w,x,y,z
node scripts/kmap.mjs --expr "(~x & ~z) | (y & ~z)" --vars w,x,y,z
```

Prints the K-map, minimized expression, cover JSON, and a gate estimate —
paste those into a `src/pack2.js` entry (`cover`/`allowed`/`par`), add a
reference build with `buildSOP` from `src/synth.js`, and `npm test` proves
solvability. Library modules: `src/expr.js` (expression parser),
`src/minimize.js` (Quine–McCluskey + K-maps), `src/synth.js` (SOP builder,
gate estimator, NAND/NOR-only compiler). Full plan: `plans/boolean-tools.md`.

## Manual UI checklist (now automated in e2e)

- [ ] Level 1 solvable by wiring A→NOT→Y; Check gives 3 stars, unlocks L2.
- [ ] Rewiring an occupied input replaces the wire, no error trap.
- [ ] Feedback loop shows "loop"/UNSTABLE warning and fails Check.
- [ ] Refresh keeps stars/unlocks; Sandbox circuit persists.
- [ ] Touch: tap output pin → tap input pin wires; drag moves gates.
