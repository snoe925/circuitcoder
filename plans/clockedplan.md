# Clocked Mode Plan — sequential logic, traces, dividers

Design for a fourth bench, **Clocked**, bringing synchronous sequential
logic to Circuit Coder: flip-flops, clocks, delay lines, ripple counters,
shift registers, and a timing-diagram trace viewer. Design-only; no code.

## Why this shape

The gate engine settles combinational clouds to a fixed point and calls
feedback UNSTABLE. Clocked logic needs the opposite: feedback *through a
clock edge* is the whole game (counters, memory). So the clocked bench
reuses the gate **netlist and artwork** (AND/OR/NOT/… wires look identical)
but runs a **tick simulator** where flop outputs are pseudo-inputs and
edges advance state. One bench, two simulators, zero new wiring UX to learn.

## Simulation model (`src/clocked.js`, pure, tested)

Discrete ticks. Each tick: drive inputs + clock sources, settle the
combinational cloud (bounded passes, flops frozen), detect rising edges,
capture next flop states, record one sample per traced net.

- Elements (all ideal, zero setup/hold):
  - `CLOCK(period, duty=50%)`: auto-toggles by tick; the time base.
  - `DFF(D, CLK, R?)`: Q←D on rising edge; async R forces Q=0 (priority).
  - `TFF(T, CLK, R?)`: Q←Q⊕T on rising edge (the divider primitive).
  - `DLATCH(D, EN)`: transparent while EN=1, holds otherwise.
  - `DELAY(x)`: 1-tick shift (explicit delay part + waveform teaching aid).
  - Gates AND/OR/NOT/NAND/NOR/XOR/XNOR: same `computeGate`, settled per tick.
- State: flop/latch outputs persist across ticks (init 0 unless `init` set).
- Edges: rising = prev 0 → cur 1, tracked per clock net (multiple clocks
  allowed; each flop listens to its own CLK net).
- Result: `{ traces: {netId: bit[]}, final: {...}, status }`. Statuses:
  `OK` | `UNSETTLED` (cloud didn't settle within the bound — real
  combinational loop, still illegal) | `RACY`? No — out of scope; ideal.
- Verification: level tests are **scenarios**
  `{ in: {static inputs}, ticks: n, expect: { probe: [waveform…] } }`.
  Waveforms are verbose but exact, and references prove them in tests.

## Parts & art

- DFF: rectangle, D left-top, CLK left-bottom with edge triangle `>`,
  Q right-top, Qb right-bottom, optional R pin. TFF: same box, `T>` in.
  DLATCH: box with EN + transparency note. CLOCK: circle with `CLK` +
  period label. DELAY: box `Δ1`.
- Wire colors as today; flop Q outputs glow like any driven net.

## Trace viewer (the headline UI)

- Timing-diagram SVG under the bench: one lane per probe (+ clock lanes),
  step-waveform polylines over N ticks, tick ruler on top.
- Transport: `|◀ ▶▶ Run N ▶ play/pause` + speed slider. Play uses a timer
  advancing the scrub position; history is precomputed so scrubbing back
  is free and exact.
- Clicking a probe (or any wire?) toggles its trace lane. Keep: probes +
  clocks always traced; gates traceable via clip-on PROBE (reuse!).
- Verification runs the scenario ticks and diffs waveforms; failures name
  the first diverging tick (`Q differs at t=5: expected 1 got 0`).

## Clocked cookbook levels (K1–K12)

| # | id | Name | Parts | Scenario |
|---|----|------|-------|----------|
| K1 | `k-blink` | Blink | CLOCK + probe | 8 ticks of the raw clock; learn traces/transport. |
| K2 | `k-delay` | Delay Line | 2× DELAY | Input pulse reappears 2 ticks later; read the shift. |
| K3 | `k-dcap` | D Capture | DFF + CLOCK | D=1 sampled on edges; Q follows with one-tick latency. |
| K4 | `k-div2` | Divide by 2 | TFF (T=1) | Q = 00110011… over 8 ticks. The fundamental divider. |
| K5 | `k-div4` | Divide by 4 | 2× TFF ripple | Second flop clocked by first Q. |
| K6 | `k-count3` | 3-bit Counter | 3× TFF ripple, probes Q2Q1Q0 | 000→111 binary count over 8 ticks. |
| K7 | `k-shift` | Shift Register | 3× DFF chain | Serial pattern 101 walks through; parallel probes. |
| K8 | `k-latch` | Gated Latch | DLATCH | Transparent when EN=1, frozen when 0 (two phases). |
| K9 | `k-div3` | Divide by 3 | 2 flops + NAND reset | Count 00,01,10, reset on 11 — self-starting ÷3. |
| K10 | `k-div5` | Decade-ish ÷5 | 3 flops + reset at 101 | 000→100 then reset; first programmable divider. |
| K11 | `k-johnson` | Johnson Counter | 3× DFF twisted ring (Qb fed back) | 6-state ÷6 one-hot-ish sequence. |
| K12 | `k-pwm` | PWM Generator (capstone) | Counter + compare logic | 2-bit duty input → 25/50/75% waveforms on the trace. |

Par = flop/gate counts; budgets exact-fit early. K9/K10 teach reset-driven
modulo (the "LSI cookbook" core: 7490/7493 style). K12 reuses compare
thinking from the gates pack.

## Level format

```js
{ id, mode: "clocked", chapter: "Clocked", name, briefing,
  allowed: { DFF: 3, AND: 1, … }, par,
  inputs: ["D"], clocks: ["CLK"], probes: ["Q"],
  ticks: 8,
  tests: [{ in: { D: [0,1,1,…] or scalar }, expect: { Q: [0,0,1,…] } }] }
```

`in` values may be per-tick arrays or scalars (held). `clocks` are just
named nets driven by CLOCK parts (or toggled inputs for hand-stepping —
allow manual clocking: an IN wired to CLK advances on toggle; same engine).

## Test plan

- `tests/clocked.test.mjs`: DFF edge table (no-edge hold, edge capture,
  async reset priority), TFF toggle/hold, latch transparency windows,
  delay shift, UNSETTLED on pure combinational loop, multi-clock edges.
- `tests/clocked-levels.test.mjs`: reference build per K-level, waveforms
  asserted tick-for-tick, budgets/pars/stars as usual.
- E2E: divider solve (place TFF, wire clock, run, check passes), transport
  play/pause + scrub, trace lanes render.

## Build order & acceptance

1. [x] `src/clocked.js` + tests (solver first: edges, flops, traces).
   Shipped with reset-propagation semantics (captured 11-states force
   synchronously-transparent reset before recording) and lazy first-edge
   init (no spurious t0 edges on Qb-clocked ripple stages).
2. [x] Parts art (DFF/TFF/LATCH/CLOCK/DELAY) on the gates bench renderer
   (`src/gates.js`: flop box with edge triangle, Qb second pin).
3. [x] Trace viewer + transport + verification diffing (step-waveform SVG,
   Run/Play/scrub, first-diverging-tick messages).
4. [x] K1–K12 + references (`src/clocked-levels.js`,
   `tests/clocked-levels.test.mjs` — all at par); `save.clock` progress;
   Clocked mode tab + master-sandbox bench.
   Counters are synchronous (T0=HI, T1=Q0, T2=Q0∧Q1) except the K4/K5
   ripple pair, which is Qb-clocked falling-edge style.
5. [x] E2E + docs (README modes, help sequential cheat-sheet).

Done = fifth tab playable with the house bar: exact waveform tests per
level, in-repo references, stars, playground, `test:all` green. Deliberate
non-goals: setup/hold/metastability, async ripple hazards analysis,
multi-phase clocks, RAM/ROM parts (a later cookbook).
