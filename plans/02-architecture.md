# 02 — Architecture

## Principles
- **Engine is pure.** `src/engine.js` has zero DOM imports; importable from Node tests and browser.
- **No dependencies, no bundler.** ES modules via `<script type="module">`. Tests use `node:test` + `node:assert/strict`.
- **Single source of truth:** `Circuit` object `{ nodes: Map, wires: Map }`; UI mutates it, then calls `simulate(circuit, inputVector)`.

## Data model
```js
// Node
{ id: 'n3', type: 'AND', x: 120, y: 80, name?: 'A' }
// types: INPUT | OUTPUT | AND | OR | NOT | NAND | NOR | XOR | XNOR
// INPUT has runtime toggle stored separately in ui state or node.value

// Wire
{ id: 'w7', from: 'n1', fromPin: 0, to: 'n3', toPin: 1 }
// from must be an output pin, to must be an input pin.
// invariant: at most one wire per (to, toPin).
```

Pin counts (`GATE_DEFS`):
| type | inputs | outputs |
|------|--------|---------|
| INPUT | 0 | 1 |
| OUTPUT | 1 | 0 |
| NOT | 1 | 1 |
| AND/OR/NAND/NOR/XOR/XNOR | 2 | 1 |

## Simulation (`simulate`)
```
simulate(circuit, inputValues: Map<nodeId, 0|1>) -> { values: Map<wireKey|nodeOut, 0|1>, nodeOutputs: Map<nodeId,0|1>, inputPinValues: Map<`${nodeId}:${pin}`,0|1>, status: 'STABLE'|'UNSTABLE', ticks }
```
Algorithm: fixed-point iteration (≤ N+1 passes, N = gate count).
- Seed INPUT nodes from inputValues, constants.
- Repeat: evaluate every gate from current input-pin values; if any output changed, iterate.
- If not settled after N+1 passes → cycle/oscillation → `UNSTABLE`.
- Unconnected input pin = 0.
- Gate functions per boolean algebra; XOR = parity of 2 inputs.

Complexity O(passes × (nodes+wires)) — trivial for <200 nodes, runs per keystroke.

`evaluateLevel(circuit, level)` runs `simulate` for each `testCase`, compares outputs, returns `{ passed, results: [{inputs, expected, actual, ok}], unstable }`.

Also exports: `createCircuit()`, `addNode()`, `removeNode()`, `addWire()` (validates pin kinds + dedup), `removeWire()`, `validateWire()`, `truthTable()` helper, `GATE_DEFS`, `computeGate()`.

## UI (`src/app.js`)
- State: `currentMode: 'challenge'|'sandbox'`, `levelIndex`, `circuit`, `inputStates: Map`, `selected`, `pendingWire`.
- Rendering: one SVG layer (wires as `<path>` cubic beziers) + one HTML layer (nodes as `<div>`). Re-render wires on every state change; node positions updated via transform during drag (no full rerender).
- Live sim after every mutation; wire `data-v` attribute drives CSS color.
- No framework; ~700 lines, sectioned: store, palette, canvas, wiring, sim bridge, verification, level select, sandbox.

## Persistence (`src/store.js`)
- Key `circuitcoder.v1`: `{ unlocked: number, stars: {levelId: 0..3}, sandbox: {nodes, wires} }`.
- Defensive JSON parse; version check.

## Levels (`src/levels.js`)
- `LEVELS: [{ id, name, tag, briefing, allowed: {AND:2,...}, par: number, inputs: ['A','B',...], outputs: ['Y',...], tests: [{in:[0,1], out:[1]}] }]`.
- Tests reference-solve each level at test time (see `tests/levels.test.mjs`) so an unsolvable level fails CI.

## Testing strategy
- `tests/engine.test.mjs`: truth tables for all 6 gates + NOT, unconnected→0, fanout, deletion, cycle→UNSTABLE, addWire validation, 100-gate chain perf sanity.
- `tests/levels.test.mjs`: every level has ≥1 test case, allowed parts can realize solution (builds reference circuit programmatically per level, runs `evaluateLevel`, asserts pass), budgets non-negative, par ≥ minimal gates.
- UI is not unit-tested (DOM); verified manually via checklist in README.

## v2 extensions (not now)
Sub-circuits, 3+ input gates, buses, sequential elements, share links (URL-encoded circuits), sound.
