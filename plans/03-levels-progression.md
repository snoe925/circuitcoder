# 03 — Levels Progression

Par = reference gate count for ★★★ (excluding INPUT/OUTPUT terminals).

| # | id | Name | Allowed (budget) | Par | Spec |
|---|----|------|------------------|-----|------|
| 1 | `not` | NOT Trader | NOT ×1 | 1 | Y = ¬A |
| 2 | `and` | AND Gate | AND ×1 | 1 | Y = A∧B |
| 3 | `or` | OR Gate | OR ×1 | 1 | Y = A∨B |
| 4 | `xor` | XOR From Scratch | AND,OR,NOT ∞ | 5 | Y = A⊕B (classic 5-gate build) |
| 5 | `nand` | NAND Only | NAND ×4 | 4 | Y = A⊕B built from NANDs only |
| 6 | `nor` | NOR Logic | NOR ×6 | 6 | Y = A⊕B from NORs only (NOT = NOR-tied) |
| 7 | `xnor` | Equivalence | AND,OR,NOT ∞ (alt: XNOR×1 warmup? no — must build) | 5 | Y = ¬(A⊕B) |
| 8 | `halfadder` | Half Adder | AND,OR,NOT,XOR ∞ | 2 | S = A⊕B, C = A∧B |
| 9 | `fulladder` | Full Adder | AND,OR,NOT,XOR ∞ | 5 | S = A⊕B⊕Cin, Cout = maj() |
| 10 | `mux` | 2:1 MUX | AND,OR,NOT ∞ | 4 | Y = (¬S∧A)∨(S∧B) |
| 11 | `majority` | Majority Vote | AND,OR,NOT ∞ | 5 | Y = maj(A,B,C) ≥2 ones |
| 12 | `compare` | 2-bit Equality | AND,OR,NOT,XOR ∞ | 6 | EQ = ¬(a1⊕b1)∧¬(a0⊕b0) simplified to XNOR-AND form |

Notes:
- L4 reference: `n1=¬A, n2=¬B, o1=A∧n2, o2=n1∧B, Y=o1∨o2` (5 gates).
- L5 NAND-XOR reference (4 NANDs): standard construction.
- L9 reference minimal: 2 XOR + 2 AND + 1 OR = 5 (uses A⊕B intermediate).
- L12 reference: 2 XOR + 2 NOT + 1 AND(2-in for the pair) — but our AND is 2-input so `a=b AND c=d` then AND = 5 gates + outputs; par set to 6 to allow two-stage AND. Tests accept any solution that passes truth table within budget.
- All levels: exhaustive test cases generated programmatically (2^n rows) in `src/levels.js` via helper `allCombos(n)` + spec function, so tables can't drift.
- Sandbox unlocks after L1 (or immediately — decision: immediately, to encourage play; campaign locks still apply).

Star rule: pass at/under par → ★★★, within par+2 → ★★, otherwise ★ (all require passing). Implemented as `starsFor()` in `src/levels.js`.
