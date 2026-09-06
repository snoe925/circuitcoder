# Boolean Tools Plan — expressions, K-map reduction, circuit synthesis

Coding plan for developer tooling (and later player-facing aids) around
boolean expressions. Motivated by Pack 2 authoring: the 7-seg covers were
minimized with a throwaway Quine–McCluskey script in `/tmp` — this plan
promotes that into tested, reusable modules plus an expression sublanguage
so future levels can be authored as **write expr → minimize → emit level**.

Nothing here changes the game engine or UI (all additive, dev-facing first).

> SHIPPED player-facing (separate track, now in game): `circuitExpr` /
> `outputExprs` in `src/synth.js` power the **fx: expressions** toggle, and
> `kmapString` powers the per-level **Hint: Karnaugh map** panel
> (2–4 inputs, exhaustive tables only). No minimized-answer spoiler is shown.

## Part 1 — Boolean expression sublanguage (`src/expr.js`)

### Grammar (ASCII-first, `¬∧∨⊕` aliases accepted)

```
expr    := or
or      := xor (("|" | "∨" | "v") xor)*
xor     := and (("^" | "⊕") and)*
and     := unary (("&" | "∧") unary)*
unary   := ("~" | "!" | "¬") unary | primary
primary := NAME | "0" | "1" | "(" expr ")"
NAME    := [A-Za-z][A-Za-z0-9_]*   // w, x, S1, Cin …
```

Precedence (high→low): NOT, AND, XOR, OR. `^` binds tighter than `|`
(matches `+`/parity convention used in level briefings). Whitespace ignored.

### API

```js
parseExpr(str) -> AST                    // throws ExprError with position on bad input
evalExpr(ast, env: Record<name, 0|1>) -> 0|1
exprVars(ast) -> string[]                // sorted unique vars
exprToTests(ast, varOrder?) -> [{in, out}]  // via engine allCombos
exprToCover(ast, varOrder?) -> Cover     // brute-force minterms → minimize.js
```

`Cover` = the format Pack 2 already uses: `[[[var, polarity]]]` with
polarity `1` = true, `0` = complemented. Reuse it so output plugs straight
into level entries (`cover` field) and the SOP builder.

### Edge cases

- Unknown/empty input, trailing operators, unbalanced parens → `ExprError`
  with index + `expected …` message (unit-tested).
- Constants `0`/`1` allowed (useful for half-tied gates, e.g. FA Cin=0).
- Names are case-sensitive; single letters preferred for K-map display.

## Part 2 — K-map / logic minimization (`src/minimize.js`)

### Algorithm: Quine–McCluskey + essential-prime cover

The `/tmp` prototype proved this works (all 7 segments verified 0–9).
Productize it:

```js
minimize({ on: number[], dc?: number[], vars: string[] })
  -> { cover: Cover, terms: Term[] }     // Term = { mask, vals, covers }
```

- `on`/`dc` are minterm indices; `vars.length` = 2–6 (QM is exponential —
  cap at 6 vars / 64 minterms, throw beyond).
- Selection: take all essentials first, then greedy largest-coverage
  (optimal for our sizes; optionally exact via Petrick if a counterexample
  ever appears — note as future switch, not now).
- Single-literal and empty covers handled (constant-1 function → empty cover
  means "wire HIGH"… engine has no VCC terminal: emit as `A∨¬A`? No —
  flag it: such levels must avoid constant outputs in specs).

### ASCII K-map rendering (the actual "planning" view)

```js
kmapString({ on, dc, vars }) -> string   // 2–4 vars; Gray-code order
```

Example (3 vars, `Y = Σm(1,2,4,7)`):

```
      BC  00 01 11 10
     A +---+---+---+---+
     0 | 0 | 1 | 0 | 1 |
       +---+---+---+---+
     1 | 1 | 0 | 1 | 0 |
       +---+---+---+---+
```

- `1` = on, `d` = don't-care, `0` = off. 2-var = 2×2, 4-var = 4×4
  (AB rows, CD cols, Gray order 00 01 11 10). 5–6 vars: refuse rendering
  (tables still work), suggest splitting.
- `coverString(cover)` pretty-prints the minimized SOP, e.g.
  `Y = ¬x∧¬z ∨ y ∨ x∧z ∨ w` — the exact hint text level briefings want.

### CLI (`scripts/kmap.mjs`)

```bash
node scripts/kmap.mjs --on 0,2,3,5,6,7,8,9 --dc 10-15 --vars w,x,y,z
# prints: K-map, minimized expr, cover JSON, gate estimate
node scripts/kmap.mjs --expr "(~x & ~z) | y" --vars w,x,y,z
```

Exit non-zero on parse errors. This is the level-authoring entry point.

## Part 3 — Synthesis helpers (`src/synth.js`)

Promote `buildSOP` from `tests/pack2.test.mjs` into a real module so game
code, tests, and authors share one builder:

```js
buildSOP(circuit, insByVar, cover, outId)   // AND-OR-NOT, shared NOTs
estimateGates(cover) -> { NOT, AND, OR, total }  // m-lit term → m-1 ANDs…
mapToNand(circuit, …) / mapToNor(…)          // De Morgan tech-map:
                                             // NOT→tied gate, AND→…, OR→…
compileExpr(circuit, exprStr, insByVar, outId, { target: "aon"|"nand"|"nor" })
```

- `estimateGates` sets `allowed` + `par` when authoring (no more hand-count!).
- `compileExpr` is the one-call path: expression → minimized cover →
  wired circuit in the requested gate family. NAND/NOR workshop references
  (currently hand-built in tests) become one-liners.
- Out of scope: multi-level optimization (factoring, sharing between
  outputs), sequential logic.

## Authoring workflow (the payoff)

```
1. node scripts/kmap.mjs --on … --dc … --vars …   # get expr + cover + estimate
2. paste cover/allowed/par into src/pack2.js entry # tests: buildSOP ref
3. npm test                                        # reference proves solvability
```

Later (player-facing, separate plan): "expression view" toggle on the bench
and a K-map hint panel per level — both can consume these same modules.

## File layout

```
src/expr.js        # parser + eval + exprToTests/exprToCover
src/minimize.js    # QM + kmapString + coverString
src/synth.js       # buildSOP + estimateGates + NAND/NOR mapping + compileExpr
scripts/kmap.mjs   # CLI authoring tool
tests/expr.test.mjs
tests/minimize.test.mjs   # incl. 7-seg regression (covers from pack2 must be optimal-or-equal)
tests/synth.test.mjs      # compiled circuits pass their own expr tables; NAND/NOR maps verified
```

## Test plan

- Parser: precedence/associativity table, error positions, aliases, constants.
- Minimizer: textbook answers (e.g. `Σm(0,1,2,3)→1`-flag case, 2-var AND/OR
  shapes, XOR-3 stays 2 XOR? No — QM gives SOP: A⊕B⊕C = 4 minterms, no
  reduction; assert exact known SOP sizes for a fixed corpus).
- 7-seg regression: `minimize` on each segment's on-set must yield gate
  counts ≤ the shipped pars (a≤7, b≤7, c≤3, d≤12, e≤5, f≤8, g≤9).
- Round-trip fuzz (≤4 vars, random on/dc sets): `exprToCover` → `buildSOP`
  → `simulate` agrees with brute-force table on all rows.
- Tech-map: NAND/NOR-compiled references for all Pack-1 gates pass;
  gate counts match workshop pars.

## Acceptance & order

1. `src/expr.js` + tests (no dependencies beyond engine).
2. `src/minimize.js` + tests (port `/tmp` QM, add kmapString/coverString).
3. `scripts/kmap.mjs` wired to both.
4. `src/synth.js` (move `buildSOP`, add estimator + NAND/NOR maps);
   migrate `tests/pack2.test.mjs` helpers onto it (tests stay green).
5. Docs: README authoring section ("designing a level with kmap.mjs").

Done = `npm test` green + authoring a new level end-to-end via the CLI
in under 5 minutes.
