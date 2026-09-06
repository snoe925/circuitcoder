/**
 * Level catalogue. Truth tables are generated programmatically so they
 * cannot drift from the spec functions.
 */
import { allCombos, buildTests } from "./engine.js";
import { LEVELS_PACK2 } from "./pack2.js";

export { allCombos, buildTests };

const xor2 = ([a, b]) => [a ^ b];
const specNot = ([a]) => [a ? 0 : 1];
const specAnd = ([a, b]) => [a & b];
const specOr = ([a, b]) => [a | b];
const specXnor = ([a, b]) => [(a ^ b) ? 0 : 1];
const specHalf = ([a, b]) => [a ^ b, a & b];
const specFull = ([a, b, c]) => {
  const s = a ^ b ^ c;
  const cout = (a & b) | (c & (a ^ b));
  return [s, cout];
};
const specMux = ([a, b, s]) => [(s ? b : a)];
const specMaj = ([a, b, c]) => [(a + b + c >= 2 ? 1 : 0)];
const specEq2 = ([a1, a0, b1, b0]) => [
  a1 === b1 && a0 === b0 ? 1 : 0,
];

const LEVELS_PACK1 = [
  {
    id: "not",
    name: "NOT Trader",
    tag: "Invert it",
    briefing: "A single input A. Output Y must be the opposite. Place one NOT gate and wire A → NOT → Y.",
    allowed: { NOT: 1 },
    par: 1,
    inputs: ["A"],
    outputs: ["Y"],
    tests: buildTests(1, specNot),
  },
  {
    id: "and",
    name: "AND Gate",
    tag: "Both on",
    briefing: "Y is 1 only when A and B are both 1. Place AND and wire both inputs.",
    allowed: { AND: 1 },
    par: 1,
    inputs: ["A", "B"],
    outputs: ["Y"],
    tests: buildTests(2, specAnd),
  },
  {
    id: "or",
    name: "OR Gate",
    tag: "Either on",
    briefing: "Y is 1 when at least one input is 1. Place OR.",
    allowed: { OR: 1 },
    par: 1,
    inputs: ["A", "B"],
    outputs: ["Y"],
    tests: buildTests(2, specOr),
  },
  {
    id: "xor",
    name: "XOR From Scratch",
    tag: "Exclusive",
    briefing:
      "Y = A ⊕ B using only AND / OR / NOT. Hint: (A ∧ ¬B) ∨ (¬A ∧ B). That's 2 NOT + 2 AND + 1 OR.",
    allowed: { AND: 4, OR: 2, NOT: 4 },
    par: 5,
    inputs: ["A", "B"],
    outputs: ["Y"],
    tests: buildTests(2, xor2),
  },
  {
    id: "nand",
    name: "NAND Only",
    tag: "Universal",
    briefing:
      "Build XOR from 4 NAND gates only. NAND is universal! Hint: D=A⊼B, E=A⊼D, F=B⊼D, Y=E⊼F.",
    allowed: { NAND: 4 },
    par: 4,
    inputs: ["A", "B"],
    outputs: ["Y"],
    tests: buildTests(2, xor2),
  },
  {
    id: "nor",
    name: "NOR Logic",
    tag: "Universal II",
    briefing:
      "Build XOR from 6 NOR gates only. Remember NOT X = X NOR X, and A∧B = (¬A) NOR (¬B).",
    allowed: { NOR: 6 },
    par: 6,
    inputs: ["A", "B"],
    outputs: ["Y"],
    tests: buildTests(2, xor2),
  },
  {
    id: "xnor",
    name: "Equivalence",
    tag: "Both equal",
    briefing: "Y = 1 when A equals B. That's NOT-XOR. Build it from AND / OR / NOT (par 5).",
    allowed: { AND: 4, OR: 2, NOT: 4 },
    par: 5,
    inputs: ["A", "B"],
    outputs: ["Y"],
    tests: buildTests(2, specXnor),
  },
  {
    id: "halfadder",
    name: "Half Adder",
    tag: "Add 1-bit",
    briefing:
      "Add two bits: S = A⊕B (sum), C = A∧B (carry). You may use XOR directly now.",
    allowed: { AND: 2, OR: 2, NOT: 2, XOR: 2 },
    par: 2,
    inputs: ["A", "B"],
    outputs: ["S", "C"],
    tests: buildTests(2, specHalf),
  },
  {
    id: "fulladder",
    name: "Full Adder",
    tag: "Add with carry",
    briefing:
      "Add three bits: S = A⊕B⊕Cin, Cout = majority-ish carry. Hint: compute T=A⊕B first, then S=T⊕Cin, Cout=(A∧B)∨(Cin∧T).",
    allowed: { AND: 4, OR: 2, NOT: 2, XOR: 3 },
    par: 5,
    inputs: ["A", "B", "Cin"],
    outputs: ["S", "Cout"],
    tests: buildTests(3, specFull),
  },
  {
    id: "mux",
    name: "2:1 MUX",
    tag: "Choose",
    briefing:
      "Multiplexer: S=0 picks A, S=1 picks B. Y = (¬S∧A) ∨ (S∧B). Inputs order: A, B, S.",
    allowed: { AND: 4, OR: 2, NOT: 2 },
    par: 4,
    inputs: ["A", "B", "S"],
    outputs: ["Y"],
    tests: buildTests(3, specMux),
  },
  {
    id: "majority",
    name: "Majority Vote",
    tag: "2 of 3",
    briefing:
      "Y = 1 when at least two of A,B,C are 1. Hint: (A∧B)∨(A∧C)∨(B∧C) — needs two 2-input ORs chained.",
    allowed: { AND: 4, OR: 3, NOT: 2 },
    par: 5,
    inputs: ["A", "B", "C"],
    outputs: ["Y"],
    tests: buildTests(3, specMaj),
  },
  {
    id: "compare",
    name: "2-bit Equality",
    tag: "Comparator",
    briefing:
      "EQ = 1 when two 2-bit numbers match (a1a0 == b1b0). Hint: XNOR each pair, AND the results. Inputs order: a1,a0,b1,b0.",
    allowed: { AND: 3, OR: 3, NOT: 4, XOR: 3 },
    par: 5,
    inputs: ["a1", "a0", "b1", "b0"],
    outputs: ["EQ"],
    tests: buildTests(4, specEq2),
  },
];

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id);
}

/** Stars: 3 at/under par, 2 within par+2, else 1 (all require passing). */
export function starsFor(level, gatesUsed) {
  if (gatesUsed <= level.par) return 3;
  if (gatesUsed <= level.par + 2) return 2;
  return 1;
}

/** Full campaign: Pack 1 (12) + Pack 2 N01–N100. */
for (const l of LEVELS_PACK1) l.chapter ??= "Pack 1 · First Sparks";
export const LEVELS = [...LEVELS_PACK1, ...LEVELS_PACK2];
