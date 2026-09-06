# Pack 2 proposal (alternate sketches — mostly superseded)

> NOTE: implemented instead was `plans/puzzles2.md` (100 puzzles N01–N100,
> shipped as levels 13–112 in `src/pack2.js`). This doc is kept for its
> alternate briefings and the v2 teaser section below.

Proposed follow-up content for Circuit Coder. All puzzles are designed for the
**current engine** (combinational only, 2-input gates, `evaluateLevel` with
arbitrary test lists), so each can ship with a coded reference solution in
`tests/levels.test.mjs` proving solvability — same bar as Pack 1.

## Design rules for new puzzles

1. **Engine-compatible:** no clocks/latches; single output per gate; fanout OK
   (needed for NOT-from-NAND etc.); feedback loops stay illegal.
2. **Canvas fit:** reference uses ≤ ~12 gates (playable on the 960×540 bench).
3. **Table size:** prefer ≤ 4 inputs (16 exhaustive rows); 5 inputs (32 rows)
   only for capstones. Non-exhaustive custom test lists allowed (e.g. BCD).
4. **Each puzzle ships:** `id`, name, tag, briefing with hint, `allowed`
   budgets, `par` (= reference gate count), `tests`, and a reference build
   in the levels test.
5. **Numbering:** Pack 1 stays 1–12 untouched; new campaign chapters become
   levels 13+. Two easy inserts are marked optional (`*`) if we ever reorder.

## Chapter 4 — Universal Workshop (levels 13–16)

Teaches that NAND is universal by rebuilding basics, *before* the big XOR.

| # | id | Name | Allowed | Par | Spec |
|---|----|------|---------|-----|------|
| 13 | `not-nand` | NOT from NAND | NAND ×1 | 1 | Y = ¬A by tying both NAND inputs to A |
| 14 | `and-nand` | AND from NAND | NAND ×2 | 2 | Y = A∧B via NAND then NOT-from-NAND |
| 15 | `or-nand` | OR from NAND | NAND ×3 | 3 | Y = A∨B = (¬A)⊼(¬B): two tied-NOTs + 1 NAND |
| 16 | `demorgan` | De Morgan | AND ×1, NOT ×3 | 4 | Y = A∨B built as ¬(¬A∧¬B); teaches the law directly |

Reference sketches: L13 `Y=A⊼A`; L14 `t=A⊼B, Y=t⊼t`; L15
`nA=A⊼A, nB=B⊼B, Y=nA⊼nB`; L16 `nA=¬A, nB=¬B, t=nA∧nB, Y=¬t`.

## Chapter 5 — Everyday Logic (levels 17–20)

Word-problem framing of small circuits. Same skills, more charm.

| # | id | Name | Allowed | Par | Spec (story → logic) |
|---|----|------|---------|-----|----------------------|
| 17 | `alarm` | Burglar Alarm | AND ×1, OR ×1 | 2 | Armed AND (door OR window): `Y=M∧(D∨W)` |
| 18 | `sprinkler` | Sprinkler | AND ×1, OR ×1 | 2 | Water when (hot AND dry) OR manual: `Y=(H∧D)∨O` |
| 19 | `safe` | Safe Lock | AND ×3, OR ×1, NOT ×1 | 4 | Opens on (A∧B)∨(C∧¬B): two codes, second needs C without B |
| 20 | `veto` | Veto Vote | AND ×4, OR ×3, NOT ×1 | 7 | Pass = majority-of-3 AND no veto: `Y=maj(A,B,C)∧¬V` (maj reuses the L11 pattern + 1 NOT + 1 AND) |

## Chapter 6 — Numbers & Codes (levels 21–27)

| # | id | Name | Allowed | Par | Spec |
|---|----|------|---------|-----|------|
| 21 | `gray` | Gray Code | XOR ×1 | 1 | 2-bit binary→Gray: `g1=b1, g0=b1⊕b0` (single-output level: EQ-style, output is g0 given b1,b0? Better: inputs b1,b0, outputs g1,g0 — 1 XOR + direct wire) |
| 22 | `parity3` | Odd Parity | XOR ×2 | 2 | `P=A⊕B⊕C` (chain two XORs) |
| 23 | `halfsub` | Half Subtractor | XOR ×1, AND ×1, NOT ×1 | 3 | `D=A⊕B, Bout=¬A∧B` |
| 24 | `enc42` | 4-to-2 Encoder | OR ×2 | 2 | One-hot I3..I0 → `Y1=I3∨I2, Y0=I3∨I1`. Elegant 2-gate puzzle |
| 25 | `dec24` | 2-to-4 Decoder | AND ×4, NOT ×2 | 6 | `Yi` = minterm i of (A,B): 2 NOTs + 4 ANDs |
| 26 | `gt2` | 2-bit Greater-Than | AND ×4, OR ×1, NOT ×3, XOR ×1 | 8 | `GT=(a1∧¬b1)∨(¬(a1⊕b1)∧a0∧¬b0)`; reference: x1, nb1, g1, eq1=¬x1, nb0, t=eq1∧a0, g0=t∧¬b0, Y=g1∨g0 |
| 27 | `add2` | 2-bit Ripple Adder (capstone) | AND ×4, OR ×2, NOT ×2, XOR ×3 | 7 | Add a1a0+b1b0 → s1s0 + carry: bit0 half-adder (XOR+AND), bit1 full-adder (2 XOR + 2 AND + 1 OR). 4 inputs, 3 outputs, 16 rows |

Note on L21: one output is a direct wire (`g1=b1`) — legal and instructive
(wiring alone is a valid "gate-free" solution for that bit).

## Expert Annex (optional, levels 28–30)

Bigger benches for veterans; verify canvas comfort in playtesting.

| # | id | Name | Allowed | Par | Spec |
|---|----|------|---------|-----|------|
| 28 | `mux41` | 4:1 MUX | AND ×8, OR ×3, NOT ×2 | 13 | `Y=(¬S1¬S0∧A)∨(¬S1S0∧B)∨(S1¬S0∧C)∨(S1S0∧D)`; each 3-AND from two 2-ANDs |
| 29 | `prienc` | Priority Encoder | OR ×2, AND ×1, NOT ×1 | 4 | 4-to-2, highest input wins: `Y1=I3∨I2, Y0=I3∨(¬I2∧I1)` |
| 30 | `seg-e` | 7-seg Segment E (BCD) | AND/OR/NOT/XOR ∞ | ~6 | Custom (non-exhaustive) tests: BCD 0–9 in, segment E on for {0,2,6,8}. Reference via minterms/K-map; exact par set after K-map minimization |

## Bonus thematic reskins (cheap, optional)

- `stairs` (*): staircase light = XOR framed as two switches, one lamp
  (reskin of L4 with new briefing; consider "same circuit, new story" bonus).
- `imply`: `A→B = ¬A∨B` (NOT+OR, par 2) — matches Circuit Snap's IMPLY/NIMPLY set.
- `nand-mux`: 2:1 MUX from NANDs only (8 NANDs, cf. L16 pattern) — expert alt.

## Ordering & difficulty curve

13–14 warmups → 15–16 De Morgan thinking → 17–18 easy word problems →
19–20 multi-gate stories → 21–23 codes/arithmetic ramp → 24–25 encoder/
decoder pair → 26–27 comparators/adders peak → 28–30 experts. Par ladder:
1,2,3,4,2,2,4,7,1,2,3,2,6,8,7,13,4,~6 — no spike wider than +2 except the
deliberate capstones (27, 28).

## Acceptance checklist (per puzzle)

- [ ] Entry in `src/levels.js` with briefing, budgets, par, generated tests.
- [ ] Reference build in `tests/levels.test.mjs` passes within budget at par.
- [ ] `starsFor` gives 3 stars at par (existing rule, no change).
- [ ] Playtest: solvable on a 13" laptop and a phone (canvas scrolls).
- [ ] E2E: at least the chapter showcase levels (16, 20, 27) get a solve test.

## v2 teasers (NOT this pack — engine work required)

Sequential (SR latch, D flip-flop, ripple counter), multi-bit buses to shrink
adders/decoders, and player sub-circuits (reusable "chips" like Circuit Snap).
