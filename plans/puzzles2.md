# Puzzles 2 — 100-Puzzle Master Plan

100 new puzzles for Circuit Coder, all designed for the **current engine**
(combinational only, 2-input gates, `evaluateLevel` over arbitrary test
lists). Numbered **N01–N100** so they can be built in any order. Pack 1
(levels 1–12) and `plans/puzzles.md` (Pack 2, levels 13+) are untouched;
these slot in as levels 14+ after Pack 2, or interleaved by difficulty.

## Global conventions

- `Allowed` = parts box; `Par` = reference gate count (3 stars at/under par,
  existing `starsFor` rule, no change).
- Test policy: exhaustive truth tables up to 5 inputs (32 rows). The two
  puzzles marked `sampled` (N87, N99-seg is custom-10) use hand-picked
  vectors instead — the engine already supports arbitrary test lists.
- Every puzzle needs a coded reference solution in `tests/levels.test.mjs`
  (same acceptance bar as Pack 1). Pars below come from standard
  constructions; anywhere marked `~` must be confirmed by K-map at build time.
- Suggested build order: A → E → D → F → B/C → G → H → I (easy first).

## A. Fluency warmups (N01–N12)

Single gates to place, wider AND/OR chains, and the two forgotten gates.

| # | id | Name | Allowed | Par | Spec |
|---|----|------|---------|-----|------|
| N01 | `nand1` | Meet NAND | NAND ×1 | 1 | Y = ¬(A∧B) |
| N02 | `nor1` | Meet NOR | NOR ×1 | 1 | Y = ¬(A∨B) |
| N03 | `xor1` | Meet XOR | XOR ×1 | 1 | Y = A⊕B |
| N04 | `xnor1` | Meet XNOR | XNOR ×1 | 1 | Y = ¬(A⊕B) |
| N05 | `and3` | AND ×3 | AND ×2 | 2 | Y = A∧B∧C (chain two 2-ANDs) |
| N06 | `or3` | OR ×3 | OR ×2 | 2 | Y = A∨B∨C |
| N07 | `and4` | AND ×4 | AND ×3 | 3 | 4-input AND tree |
| N08 | `or4` | OR ×4 | OR ×3 | 3 | 4-input OR tree |
| N09 | `and5` | AND ×5 | AND ×4 | 4 | 5-input AND tree (32 exhaustive rows) |
| N10 | `or5` | OR ×5 | OR ×4 | 4 | 5-input OR tree (32 rows) |
| N11 | `imply` | IMPLY | NOT ×1, OR ×1 | 2 | A→B = ¬A∨B |
| N12 | `nimply` | NIMPLY | NOT ×1, AND ×1 | 2 | A↛B = A∧¬B |

## B. NAND workshop (N13–N20) — NAND is universal

| # | id | Name | Allowed | Par | Spec / reference |
|---|----|------|---------|-----|------------------|
| N13 | `not-nand` | NOT from NAND | NAND ×1 | 1 | Tie both inputs: Y = A⊼A |
| N14 | `and-nand` | AND from NAND | NAND ×2 | 2 | NAND then tied-NOT |
| N15 | `or-nand` | OR from NAND | NAND ×3 | 3 | (¬A)⊼(¬B): two tied-NOTs + 1 |
| N16 | `xnor-nand` | XNOR from NAND | NAND ×5 | 5 | 4-NAND XOR + tied-NOT |
| N17 | `mux-nand` | MUX from NAND | NAND ×8 | 8 | AND→2 each (×2), OR→3, NOT→1 |
| N18 | `demux-nand` | DEMUX from NAND | NAND ×5 | 5 | NOT→1, ANDs→2 each |
| N19 | `ha-nand` | Half Adder from NAND | NAND ×6 | 6 | XOR→4, AND→2 |
| N20 | `and3-nand` | AND×3 from NAND | NAND ×4 | 4 | A∧B via NAND+NOT (2), ∧C via NAND+NOT (2) |

## C. NOR workshop (N21–N27) — NOR is universal too

| # | id | Name | Allowed | Par | Spec / reference |
|---|----|------|---------|-----|------------------|
| N21 | `not-nor` | NOT from NOR | NOR ×1 | 1 | Y = A⊽A |
| N22 | `or-nor` | OR from NOR | NOR ×2 | 2 | NOR then tied-NOT |
| N23 | `and-nor` | AND from NOR | NOR ×3 | 3 | (¬A)⊽(¬B): A∧B = ¬(¬A∨¬B) |
| N24 | `xnor-nor` | XNOR from NOR | NOR ×7 | 7 | 6-NOR XOR + tied-NOT |
| N25 | `mux-nor` | MUX from NOR | NOR ×9 | 9 | NOT→1, ANDs→3 each, OR→2 |
| N26 | `demux-nor` | DEMUX from NOR | NOR ×7 | 7 | NOT→1, ANDs→3 each |
| N27 | `ha-nor` | Half Adder from NOR | NOR ×9 | 9 | XOR→6, AND→3 |

## D. De Morgan & parity (N28–N35)

| # | id | Name | Allowed | Par | Spec |
|---|----|------|---------|-----|------|
| N28 | `or-aoi` | OR the De Morgan Way | AND ×1, NOT ×3 | 4 | A∨B = ¬(¬A∧¬B) (2 NOTs in, 1 AND, 1 NOT out — par 4 honest) |
| N29 | `and-oai` | AND the De Morgan Way | OR ×1, NOT ×3 | 4 | A∧B = ¬(¬A∨¬B) |
| N30 | `xnor-x` | XNOR via XOR | XOR ×1, NOT ×1 | 2 | Same function as N04, tighter box |
| N31 | `xor3` | 3-way Parity | XOR ×2 | 2 | P = A⊕B⊕C |
| N32 | `xnor3` | Evenness of 3 | XOR ×2, NOT ×1 | 3 | Y = ¬(A⊕B⊕C) |
| N33 | `parity4` | Nibble Parity | XOR ×3 | 3 | P = A⊕B⊕C⊕D |
| N34 | `parity5` | Byte-lane Parity | XOR ×4 | 4 | 5-bit parity (32 rows) |
| N35 | `nand5` | NAND ×5 | AND ×4, NOT ×1 | 5 | 5-AND tree + output NOT |

## E. Everyday logic stories (N36–N50)

| # | id | Name | Allowed | Par | Story → logic |
|---|----|------|---------|-----|---------------|
| N36 | `twokey` | Two-Key Launch | AND ×1 | 1 | Launch = KeyA ∧ KeyB |
| N37 | `porch` | Porch Light | AND ×1, NOT ×1 | 2 | On = motion ∧ ¬daylight |
| N38 | `greenhouse` | Greenhouse Fan | AND ×1, OR ×1 | 2 | Fan = (hot ∧ occupied) ∨ override |
| N39 | `crosswalk` | Crosswalk | AND ×1, NOT ×1 | 2 | Walk = button ∧ ¬traffic |
| N40 | `alarm` | Burglar Alarm | AND ×1, OR ×1 | 2 | Y = armed ∧ (door ∨ window) |
| N41 | `sprinkler` | Sprinkler | AND ×1, OR ×1 | 2 | Y = (hot ∧ dry) ∨ manual |
| N42 | `elevator` | Elevator Door | AND ×1, OR ×1 | 2 | Open = (atFloor ∧ stopped) ∨ attendant |
| N43 | `museum` | Museum Case | AND ×1, OR ×2 | 3 | Alarm = armed ∧ (glass ∨ motion ∨ pressure) |
| N44 | `sump` | Sump Pump | AND ×1, OR ×1, NOT ×1 | 3 | Pump = (high ∧ ¬service) ∨ test |
| N45 | `coop` | Coop Door | AND ×1, OR ×1, NOT ×1 | 3 | Open = dawn ∧ (¬rain ∨ manual) |
| N46 | `fridge` | Fridge Beep | AND ×1, OR ×1 | 2 | Beep = doorOpen ∧ (night ∨ longOpen) |
| N47 | `fire` | Fire Panel | AND ×1, OR ×1, NOT ×1 | 3 | Alarm = smoke ∨ (heat ∧ ¬testMode) |
| N48 | `safe` | Safe Lock | AND ×3, OR ×1, NOT ×1 | 4 | Open = (A∧B) ∨ (C∧¬B) |
| N49 | `buzz` | Quiz Buzzer | AND ×1, OR ×2, NOT ×1 | 4 | Buzz = (A∨B∨C) ∧ ¬lockout |
| N50 | `veto` | Veto Vote | AND ×4, OR ×3, NOT ×1 | 7 | Pass = maj(A,B,C) ∧ ¬veto |

## F. Routing: mux, demux, decoders (N51–N59)

| # | id | Name | Allowed | Par | Spec |
|---|----|------|---------|-----|------|
| N51 | `demux12` | 1:2 DEMUX | AND ×2, NOT ×1 | 3 | Y0=¬S∧D, Y1=S∧D |
| N52 | `enc42` | 4-to-2 Encoder | OR ×2 | 2 | Y1=I3∨I2, Y0=I3∨I1 (one-hot in) |
| N53 | `prienc` | Priority Encoder | OR ×2, AND ×1, NOT ×1 | 4 | Y1=I3∨I2, Y0=I3∨(¬I2∧I1) |
| N54 | `dec24` | 2-to-4 Decoder | AND ×4, NOT ×2 | 6 | Yi = minterm i of (A,B) |
| N55 | `mux41` | 4:1 MUX | AND ×8, OR ×3, NOT ×2 | 13 | Four 3-ANDs (2 gates each) + 3-OR + 2 NOTs |
| N56 | `crossbar` | 2×2 Crossbar | AND ×4, OR ×2, NOT ×1 | 8 | Two 2:1 MUXes sharing S (straight/cross) |
| N57 | `aoi` | AND-OR-Invert | AND ×1, OR ×1, NOT ×1 | 3 | Y = ¬((A∧B)∨C) |
| N58 | `oai` | OR-AND-Invert | AND ×1, OR ×1, NOT ×1 | 3 | Y = ¬((A∨B)∧C) |
| N59 | `dec24en` | Decoder with Enable | AND ×8, NOT ×2 | 10 | 2-to-4 minterms (4 AND) each ANDed with E (4 AND) |

## G. Arithmetic (N60–N75)

| # | id | Name | Allowed | Par | Spec |
|---|----|------|---------|-----|------|
| N60 | `gt1` | Greater Than (1-bit) | AND ×1, NOT ×1 | 2 | A>B = A∧¬B |
| N61 | `lt1` | Less Than (1-bit) | AND ×1, NOT ×1 | 2 | A<B = ¬A∧B |
| N62 | `eq1b` | Equal (1-bit, built) | AND ×2, OR ×1, NOT ×2 | 5 | (A∧B)∨(¬A∧¬B), no XNOR allowed |
| N63 | `comp1` | 1-bit Comparator | AND ×2, NOT ×2, XNOR ×1 | 5 | GT, EQ, LT together |
| N64 | `ha-noxor` | Half Adder, No XOR | AND ×3, OR ×1, NOT ×2 | 6 | S via 5-gate XOR + C via AND |
| N65 | `halfsub` | Half Subtractor | XOR ×1, AND ×1, NOT ×1 | 3 | D=A⊕B, Bout=¬A∧B |
| N66 | `fullsub` | Full Subtractor | XOR ×2, AND ×2, NOT ×2, OR ×1 | 7 | S=A⊕B⊕Bin, Bout=(¬A∧B)∨(¬(A⊕B)∧Bin) |
| N67 | `gt2` | 2-bit Greater-Than | AND ×4, OR ×1, NOT ×3, XOR ×1 | 8 | (a1∧¬b1)∨(¬(a1⊕b1)∧a0∧¬b0) |
| N68 | `lt2` | 2-bit Less-Than | AND ×4, OR ×1, NOT ×3, XOR ×1 | 8 | Mirror of N67 |
| N69 | `eq3` | 3-bit Equality | XOR ×3, NOT ×3, AND ×2 | 8 | AND of three per-bit XNORs |
| N70 | `neg2` | Negate (2-bit) | XOR ×1 | 1 | Two's complement: n0=b0 (wire!), n1=b1⊕b0 |
| N71 | `cla1` | Carry Lookahead Bit | XOR ×1, AND ×2, OR ×1 | 4 | C1=(A∧B)∨((A⊕B)∧C0) |
| N72 | `inc4` | Nibble Incrementer | XOR ×3, AND ×2, NOT ×1 | 6 | +1 on 4 bits: s0=¬b0, s1=b1⊕b0, t1=b1∧b0, s2=b2⊕t1, t2=t1∧b2, s3=b3⊕t2 |
| N73 | `addsub2` | 2-bit Subtractor | XOR ×3, AND ×3, NOT ×3, OR ×1 | 10 | Half-sub bit0 + full-sub bit1 |
| N74 | `mul2` | 2×2 Multiplier | AND ×6, XOR ×2 | 8 | 4 partial products + HA-style combine (m1,m2,m3) |
| N75 | `add3s` | 3-bit Adder (`sampled`) | AND ×4, OR ×2, XOR ×5 | 12 | HA+FA+FA; 24 hand-picked vectors (exhaustive 64 is too many table rows) |

## H. Codes & detectors (N76–N90)

| # | id | Name | Allowed | Par | Spec |
|---|----|------|---------|-----|------|
| N76 | `gray2` | Gray Code (2-bit) | XOR ×1 | 1 | g1=b1 (wire), g0=b1⊕b0 |
| N77 | `gray3` | Gray Code (3-bit) | XOR ×2 | 2 | g2=b2, g1=b2⊕b1, g0=b1⊕b0 |
| N78 | `parity3` | Odd Parity (3-bit) | XOR ×2 | 2 | P=A⊕B⊕C (remix of N31 with new briefing — keep one, see note) |
| N79 | `parity4` | Nibble Parity | XOR ×3 | 3 | (remix of N33 — keep one, see note) |
| N80 | `parity5` | 5-bit Parity | XOR ×4 | 4 | 32 exhaustive rows |
| N81 | `onehot3` | Exactly-One Detector | XOR ×2, AND ×4, OR ×2, NOT ×1 | 9 | Y = parity ∧ ¬(any pair): (A⊕B⊕C)∧¬((A∧B)∨(A∧C)∨(B∧C)) |
| N82 | `zero4` | All-Zero Detector | OR ×3, NOT ×1 | 4 | Y=1 iff ABCD=0000 (NOR4) |
| N83 | `allone4` | All-One Detector | AND ×3 | 3 | Y=1 iff ABCD=1111 |
| N84 | `seg-a` | 7-seg A (BCD) | `custom-10` | ~6 | Segment A on for {0,2,3,5,6,7,8,9} — par by K-map at build |
| N85 | `seg-b` | 7-seg B (BCD) | `custom-10` | ~5 | On for {0,1,2,3,4,7,8,9} |
| N86 | `seg-c` | 7-seg C (BCD) | `custom-10` | ~5 | On for {0,1,3,4,5,6,7,8,9} |
| N87 | `seg-d` | 7-seg D (BCD) | `custom-10` | ~6 | On for {0,2,3,5,6,8,9} |
| N88 | `seg-e` | 7-seg E (BCD) | `custom-10` | ~4 | On for {0,2,6,8} |
| N89 | `seg-f` | 7-seg F (BCD) | `custom-10` | ~5 | On for {0,4,5,6,8,9} |
| N90 | `seg-g` | 7-seg G (BCD) | `custom-10` | ~6 | On for {2,3,4,5,6,8,9} |

Notes: `custom-10` = BCD digits 0–9 as 10 hand-written test vectors
(4-bit input, invalid codes 10–15 untested). N78/N79 intentionally overlap
N31/N33 as "same circuit, new story" bonus levels — drop them if strict
uniqueness is preferred (that would cut the count to 98; replacements:
`even3` = XNOR3-with-XOR par 3, and `nor4` detector par 4 — wait, `nor4` =
N82. Use `xnor4` chain? 4-bit XNOR cascade = 3 XNORs par 3. Fine.)

## I. Debug ward (N91–N100) — needs `prefill` support

New level field: `prefill: { nodes, wires }` loaded editable on the bench;
player fixes the bug, then Check passes. Small loader addition, no engine
change (verification is still truth-table based).

| # | id | Name | Bug | Fix size |
|---|----|------|-----|----------|
| N91 | `dbg-not` | Broken Inverter | NOT output wired back to its own input (loop!) | Move 1 wire |
| N92 | `dbg-swap` | AND/OR Swap | AND gate where OR belongs (L: OR task, prefilled AND) | Swap 1 gate |
| N93 | `dbg-notmiss` | Missing Inverter | XOR built without the two NOTs (direct A,B into ANDs) | Add 2 NOTs + rewire |
| N94 | `dbg-tied` | Tied Inputs | Both AND inputs fed by A (B left dangling) | Move 1 wire |
| N95 | `dbg-carry` | Swapped Sum/Carry | HA outputs S↔C crossed | Swap 2 wires |
| N96 | `dbg-nandx` | NAND-XOR Fault | One NAND fed B,B instead of B,D | Move 1 wire |
| N97 | `dbg-maj` | Missing Term | Majority missing the B∧C term (2 ANDs + OR only) | Add 1 AND + OR rewire |
| N98 | `dbg-muxsel` | Inverted Select | MUX ¬S/S legs swapped (picks B when S=0) | Swap 2 wires |
| N99 | `dbg-dec` | Decoder Typo | Y2 minterm uses ¬A instead of A | Move 1 wire |
| N100 | `dbg-par` | Flipped Parity | Extra NOT on parity output | Delete 1 gate |

## Build batches & acceptance

1. **Batch 1 (no code changes):** A, D, E, F, G, H-codes — pure `levels.js` data.
2. **Batch 2:** B, C (verify NAND/NOR reference builds in tests first).
3. **Batch 3:** H 7-seg — K-map minimization per segment, attach minimized
   reference + set final par from the reference count.
4. **Batch 4 (tiny loader feature):** I — add `prefill` to the level schema,
   loader places it, everything else unchanged.
5. Per-puzzle acceptance (from `plans/puzzles.md`): catalogue entry, budgets,
   par, reference build passing in `tests/levels.test.mjs`, 3-stars-at-par,
   phone playtest. Showcase e2e solves for N50, N55, N74, N91.
