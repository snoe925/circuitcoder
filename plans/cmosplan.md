# CMOS Lab (+ Op-Amp Lab) — New Play Mode Plan

Proposal for a second play mode family next to the binary gate bench:
**CMOS Lab** (build gates from transistors, diodes, resistors) first,
**Op-Amp Lab** (analog, idealized) second. This doc is design-only; no code.

## Why this mode, why this order

- The current game answers *"what does it compute?"*. CMOS Lab answers
  *"what is it made of?"* — players rebuild the very gates they already
  mastered (INV → NAND → NOR → latch) from NMOS/PMOS, and meet the
  pre-history (diode/resistor logic) on the way. Strong narrative arc,
  reuses earned intuition.
- CMOS stays in the **event-driven, pure-JS simulator lineage**: transistors
  are voltage-controlled switches, solvable by fixed-point relaxation like
  `simulate()` today. Low engine risk.
- Op-amps need a **continuous solver** (nodal analysis, saturation,
  transfer curves) — a genuinely new engine. Phase it second, DC-only.

## Mode select UX

Top bar gains a third tab: `Gates | CMOS Lab | (Op-Amp Lab, later)`.
Each mode has its own chapter list, `allowed` parts, and progress
(`save.cmos = { unlocked, stars }`, same shape as today). Shared: stars,
palette/budget UI, truth-table panel style, sandbox per mode.

## Phase 1 — CMOS Lab (switch-level, binary + X)

### Simulation model (`src/cmos.js`, pure, tested)

Switch-level network with three node states and two strengths:

- Node state: `1` / `0` / `X` (unknown/floating). Drivers carry strength
  `strong` (rails, driven inputs, ON transistor channel) or `weak`
  (pull-up/pull-down resistors).
- Devices:
  - `NMOS(gate, a, b)`: conducts a↔b when gate = 1.
  - `PMOS(gate, a, b)`: conducts a↔b when gate = 0. (Source/drain symmetric.)
  - `NPN(base, c, e)`: like NMOS (for the DTL chapter).
  - `DIODE(anode, cathode)`: conducts anode→cathode when anode = 1-ish
    (ideal: pulls cathode toward anode unless cathode strongly driven).
  - `RESISTOR(a, b)`: honest weak link both ways — a floating far end
    follows weakly, a strongly driven end wins locally. A resistor straight
    across the rails reads fine on both ends and never flags SHORT (like
    real life, it just wastes power). No magic one-pin pulls: players wire
    both ends to rails themselves.
  - `VDD` / `GND` terminals: fixed strong 1 / 0. `IN` switches, `PROBE`
    output lamps (also flag `X`).
- Solver: seed rails/inputs, iterate conduction + strength resolution to a
  fixed point (bounded passes, same pattern as `simulate()`).
  Resolution per node: strongest driver wins; equal-strength conflict →
  `X`; **strong-1 vs strong-0 → `SHORT` status** (VDD–GND path).
- Statuses: `STABLE` | `SHORT` ("🔥 short circuit — power rails connected!")
  | `FLOAT` (a probed node stayed `X` — hint: "add a pull-up/pull-down or
  complete the path"). Verification compares probed states per test vector;
  `X` never equals an expected bit (teaches why floating is a bug).

### Parts & rendering

- Transistor SVG: classic MOSFET symbol — vertical channel bar,
  gate terminal left, source/drain top/bottom, bubble on the gate for PMOS.
  3 pins (G left, S top, D bottom), draggable like gates.
- Rails: VDD bar (top, red tint) and GND bar (bottom) as fixed terminals.
- Wire colors: green = 1, slate = 0 (as today), **amber dashed = X**,
  **red pulse = SHORT path**. Probes show `1`/`0`/`?`.
- NPN + diode + resistor (zigzag) symbols for the DTL prelude.

### CMOS Lab chapters (12 levels)

| # | id | Name | Parts | Tests |
|---|----|------|-------|-------|
| C1 | `power` | Power It Up | VDD, GND, probe | Wire VDD→lamp (1), GND→lamp (0). Learn rails. |
| C2 | `nmos-sw` | NMOS Switch | NMOS, VDD/GND, IN | Pass VDD to lamp only when gate IN=1. |
| C3 | `pmos-sw` | PMOS Switch | PMOS… | Pass only when gate IN=0. |
| C4 | `rtl-inv` | Resistor Inverter | PULLUP, NMOS | Pull-up + pull-down: Y=¬A (RTL style, meets `X` if pull-up missing — first FLOAT lesson). |
| C5 | `cmos-inv` | CMOS Inverter | PMOS+NMOS | The 2-transistor classic. Pull-up network ↔ pull-down network. |
| C6 | `cmos-nand` | CMOS NAND | 2 PMOS (parallel) + 2 NMOS (series) | 4T NAND. |
| C7 | `cmos-nor` | CMOS NOR | 2 PMOS (series) + 2 NMOS (parallel) | 4T NOR. |
| C8 | `cmos-and` | AND from NAND+INV | 6T | Reuse pattern: NAND then inverter. |
| C9 | `diode-and` | Diode AND | 2 diodes + PULLUP | Pre-history: wired-AND pulls low; needs the pull-up (FLOAT lesson again). |
| C10 | `dtl-nand` | DTL NAND | Diode AND + NPN inverter | Diode logic drives a transistor — the 1960s. |
| C11 | `tgate` | Transmission Gate | NMOS+PMOS parallel, complementary gates | Pass A when S=1 (S to NMOS, ¬S to PMOS — needs an inverter, 3 parts + INV). |
| C12 | `sr-latch` | SR Latch (capstone) | 2× CMOS NOR (8T) | Cross-coupled NORs; tests: set, reset, hold (fixed-point stable states — no clocks needed). |

Par = transistor/resistor counts above; budgets exact-fit early, +1–2 later.

### CMOS level format (extends today's schema)

```js
{ id, mode: "cmos", name, briefing, allowed: { NMOS: 2, … }, par,
  inputs: ["A"], probes: ["Y"],
  tests: [{ in: [0], expect: { Y: 1 } }],   // expect values 0|1; X always fails
  prefill?: { …same shape as Debug Ward… } }
```

`evaluateCmos(netlist, level)` mirrors `evaluateLevel`. Prefill reused for
"broken inverter (missing pull-up)" style debug levels later.

Stateful levels (the SR latch): `stateful: true` carries net states across
test vectors, except vectors marked `{ fresh: true }` which reset first.
Driven transitions (set/reset) start from unknown; hold vectors verify
memory. Rationale: an ideal switch model flags a legal reset-after-hold
as contention (held pull-up vs fresh pull-down), so each driven edge gets
a fresh start — physically honest (power-on with inputs asserted).

## Phase 2 — Op-Amp Lab (analog DC, idealized)

### Simulation model (`src/analog.js`, pure, tested) — DC only

- Modified nodal analysis for resistors + independent sources; **ideal
  op-amp**: `V+ ≈ V−` while the computed output lies within rails,
  else saturate at `±Vsat` (iterate: solve linear → clamp → re-solve,
  bounded; Schmitt/hysteresis handled as two-threshold checks, not
  transient).
- Parts: ideal op-amp (5 pins: out, −, +, V+, V− — rails pre-wired to
  ±12V to keep benches simple), resistor (value dialog: 1k/10k/100k),
  voltage source (slider −12…+12V), ground, voltmeter probe.
- Node display: wire color on a blue(−)→black(0)→red(+) gradient +
  numeric probe readouts in volts.
- Killer feature: **transfer-curve mini-plot** — sweep the source over
  21 points, SVG polyline of Vout. One glance teaches gain/saturation.
- Verification with tolerance: `|Vout − expected| ≤ tol` per test
  (`{ vin, expect: { OUT: 11.9 }, tol: 0.3 }`).

### Op-Amp Lab chapters (8 levels, DC only)

| # | id | Name | Circuit | Lesson |
|---|----|------|---------|--------|
| O1 | `follow` | Voltage Follower | Out↔−, source→+ | Buffers; Vout=Vin. |
| O2 | `comp` | Comparator | Open loop, Vref divider | Bang-bang at threshold; saturation. |
| O3 | `noninv` | Non-inverting Amp | Rf/R1 network, G=1+Rf/R1=11 | Gain from resistors; read the curve slope. |
| O4 | `inv` | Inverting Amp | G=−Rf/R1=−10 | Sign flip + gain. |
| O5 | `sum` | Summing Amp | Two inputs, weighted | Superposition made tangible. |
| O6 | `schmitt` | Schmitt Trigger | Positive feedback | Two thresholds; hysteresis loop on the plot. |
| O7 | `diff` | Difference Amp | 4-resistor | Amplifies (A−B); common-mode rejection idea. |
| O8 | `clip` | Clipping Lab (capstone) | Amp driven into rails | Design gain so a 2V sine-DC sweep clips exactly at ±Vsat. |

Non-goals (explicit): no capacitors/inductors, no transient/AC analysis,
no non-ideal specs (offset, slew, GBW) — "ideal + rails" only.

## Shared UI/UX notes

- Bench power aesthetic: CMOS bench gets top VDD / bottom GND rails and a
  **SHORT alarm banner**; analog bench gets the transfer-curve panel and
  voltmeter probes. Palette/budget/check-results patterns reused as-is.
- Stars/progress per mode; Sandbox per mode with all parts.
- Expression view: CMOS mode shows switch formulas (`Y = ¬(A∧B)` still
  derivable from pull-down network — reuse `circuitExpr` where possible,
  mark X/analog as future).
- Help modal gains per-mode cheat-sheets (transistor conduction table;
  golden rules + gain formulas).

## Test plan

- `tests/cmos.test.mjs`: NMOS/PMOS truth under all gate/source combos;
  inverter/NAND/NOR netlists exhaustive; FLOAT on missing pull-up;
  SHORT on VDD–GND path; diode directionality; SR latch set/reset/hold;
  every CMOS level solvable at par (reference netlists, same bar as Pack 2).
- `tests/analog.test.mjs`: divider, follower, both gains, summer,
  comparator threshold, Schmitt thresholds, saturation clamp; tolerance
  checks; transfer-curve monotonicity smoke test.
- E2E: CMOS inverter solve; SHORT banner appears on deliberate short;
  follower solve + curve renders.

## Build order & acceptance

1. [x] `src/cmos.js` + tests (solver first, netlists second).
2. [x] CMOS parts art + bench rails + X/SHORT wire states + probes
   (`src/cmos-ui.js`: MOSFET/diode/pull/rail art, amber `?` wires, SHORT
   and FLOAT banners, grid placement so devices never bury pins).
3. [x] C1–C12 levels + references (`src/cmos-levels.js`,
   `tests/cmos-levels.test.mjs` — all at par); progress plumbing per mode
   (`save.cmos`, mode tab, chapter list, CMOS Playground card).
4. Op-amp: `src/analog.js` (MNA + saturation) + tests, then bench UI
   (gradient wires, probes, transfer plot), then O1–O8.
5. E2E + docs (README modes section, help cheat-sheets).

Status: Phase 1 (CMOS) and Phase 2 bench shipped — `src/analog.js` (MNA +
consistency-search saturation + hysteresis sweep), O1–O8 catalogue with
references at par, analog bench (`src/analog-ui.js`: gradient wires,
voltmeter probes, transfer-curve plot, source sliders, click-to-step
resistors), per-mode progress, playgrounds, help cheat-sheets.
Remaining: CMOS debug-prefill levels.

Done = new tab(s) playable end-to-end with the same quality bar:
exhaustive or sampled tests per level, reference builds in-repo, stars,
sandbox, and no regressions (`npm run test:all` green).
