import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createCircuit,
  addNode,
  addWire,
  evaluateLevel,
  countGates,
} from "../src/engine.js";
import { LEVELS, starsFor } from "../src/levels.js";

function W(c, from, to, toPin = 0) {
  const r = addWire(c, from, to, toPin, 0);
  assert.equal(r.ok, true, `wire ${from}->${to}:${toPin} failed: ${r.error}`);
}

function terminals(c, nIn, nOut) {
  const ins = [];
  const outs = [];
  for (let i = 0; i < nIn; i++) ins.push(addNode(c, "INPUT", 0, 0, { name: "I" + i }).id);
  for (let i = 0; i < nOut; i++) outs.push(addNode(c, "OUTPUT", 0, 0, { name: "O" + i }).id);
  return { ins, outs };
}

function G(c, type) {
  return addNode(c, type, 0, 0).id;
}

/** Reference solution per level id. Returns { circuit, inputIds, outputIds }. */
function buildReference(levelId) {
  const c = createCircuit();
  switch (levelId) {
    case "not": {
      const { ins, outs } = terminals(c, 1, 1);
      const g = G(c, "NOT");
      W(c, ins[0], g, 0);
      W(c, g, outs[0], 0);
      return { circuit: c, inputIds: ins, outputIds: outs };
    }
    case "and":
    case "or": {
      const type = levelId === "and" ? "AND" : "OR";
      const { ins, outs } = terminals(c, 2, 1);
      const g = G(c, type);
      W(c, ins[0], g, 0);
      W(c, ins[1], g, 1);
      W(c, g, outs[0], 0);
      return { circuit: c, inputIds: ins, outputIds: outs };
    }
    case "xor": {
      // (A & ~B) | (~A & B)
      const { ins, outs } = terminals(c, 2, 1);
      const [A, B] = ins;
      const nA = G(c, "NOT"), nB = G(c, "NOT");
      const t1 = G(c, "AND"), t2 = G(c, "AND"), o = G(c, "OR");
      W(c, A, nA, 0); W(c, B, nB, 0);
      W(c, A, t1, 0); W(c, nB, t1, 1);
      W(c, nA, t2, 0); W(c, B, t2, 1);
      W(c, t1, o, 0); W(c, t2, o, 1);
      W(c, o, outs[0], 0);
      return { circuit: c, inputIds: ins, outputIds: outs };
    }
    case "nand": {
      const { ins, outs } = terminals(c, 2, 1);
      const [A, B] = ins;
      const d = G(c, "NAND"), e = G(c, "NAND"), f = G(c, "NAND"), y = G(c, "NAND");
      W(c, A, d, 0); W(c, B, d, 1);
      W(c, A, e, 0); W(c, d, e, 1);
      W(c, B, f, 0); W(c, d, f, 1);
      W(c, e, y, 0); W(c, f, y, 1);
      W(c, y, outs[0], 0);
      return { circuit: c, inputIds: ins, outputIds: outs };
    }
    case "nor": {
      const { ins, outs } = terminals(c, 2, 1);
      const [A, B] = ins;
      const nA = G(c, "NOR"), nB = G(c, "NOR");
      const t1 = G(c, "NOR"), t2 = G(c, "NOR");
      const p = G(c, "NOR"), y = G(c, "NOR");
      W(c, A, nA, 0); W(c, A, nA, 1);
      W(c, B, nB, 0); W(c, B, nB, 1);
      W(c, nA, t1, 0); W(c, B, t1, 1);
      W(c, A, t2, 0); W(c, nB, t2, 1);
      W(c, t1, p, 0); W(c, t2, p, 1);
      W(c, p, y, 0); W(c, p, y, 1);
      W(c, y, outs[0], 0);
      return { circuit: c, inputIds: ins, outputIds: outs };
    }
    case "xnor": {
      // (A&B) | (~A&~B)
      const { ins, outs } = terminals(c, 2, 1);
      const [A, B] = ins;
      const nA = G(c, "NOT"), nB = G(c, "NOT");
      const t1 = G(c, "AND"), t2 = G(c, "AND"), o = G(c, "OR");
      W(c, A, nA, 0); W(c, B, nB, 0);
      W(c, A, t1, 0); W(c, B, t1, 1);
      W(c, nA, t2, 0); W(c, nB, t2, 1);
      W(c, t1, o, 0); W(c, t2, o, 1);
      W(c, o, outs[0], 0);
      return { circuit: c, inputIds: ins, outputIds: outs };
    }
    case "halfadder": {
      const { ins, outs } = terminals(c, 2, 2);
      const s = G(c, "XOR"), carry = G(c, "AND");
      W(c, ins[0], s, 0); W(c, ins[1], s, 1);
      W(c, ins[0], carry, 0); W(c, ins[1], carry, 1);
      W(c, s, outs[0], 0); W(c, carry, outs[1], 0);
      return { circuit: c, inputIds: ins, outputIds: outs };
    }
    case "fulladder": {
      const { ins, outs } = terminals(c, 3, 2);
      const [A, B, Cin] = ins;
      const t = G(c, "XOR"), s = G(c, "XOR");
      const c1 = G(c, "AND"), c2 = G(c, "AND"), co = G(c, "OR");
      W(c, A, t, 0); W(c, B, t, 1);
      W(c, t, s, 0); W(c, Cin, s, 1);
      W(c, A, c1, 0); W(c, B, c1, 1);
      W(c, t, c2, 0); W(c, Cin, c2, 1);
      W(c, c1, co, 0); W(c, c2, co, 1);
      W(c, s, outs[0], 0); W(c, co, outs[1], 0);
      return { circuit: c, inputIds: ins, outputIds: outs };
    }
    case "mux": {
      // inputs A,B,S
      const { ins, outs } = terminals(c, 3, 1);
      const [A, B, S] = ins;
      const nS = G(c, "NOT"), t1 = G(c, "AND"), t2 = G(c, "AND"), o = G(c, "OR");
      W(c, S, nS, 0);
      W(c, nS, t1, 0); W(c, A, t1, 1);
      W(c, S, t2, 0); W(c, B, t2, 1);
      W(c, t1, o, 0); W(c, t2, o, 1);
      W(c, o, outs[0], 0);
      return { circuit: c, inputIds: ins, outputIds: outs };
    }
    case "majority": {
      const { ins, outs } = terminals(c, 3, 1);
      const [A, B, C] = ins;
      const t1 = G(c, "AND"), t2 = G(c, "AND"), t3 = G(c, "AND");
      const o1 = G(c, "OR"), o2 = G(c, "OR");
      W(c, A, t1, 0); W(c, B, t1, 1);
      W(c, A, t2, 0); W(c, C, t2, 1);
      W(c, B, t3, 0); W(c, C, t3, 1);
      W(c, t1, o1, 0); W(c, t2, o1, 1);
      W(c, o1, o2, 0); W(c, t3, o2, 1);
      W(c, o2, outs[0], 0);
      return { circuit: c, inputIds: ins, outputIds: outs };
    }
    case "compare": {
      // a1,a0,b1,b0
      const { ins, outs } = terminals(c, 4, 1);
      const [a1, a0, b1, b0] = ins;
      const x1 = G(c, "XOR"), x0 = G(c, "XOR");
      const n1 = G(c, "NOT"), n0 = G(c, "NOT"), eq = G(c, "AND");
      W(c, a1, x1, 0); W(c, b1, x1, 1);
      W(c, a0, x0, 0); W(c, b0, x0, 1);
      W(c, x1, n1, 0); W(c, x0, n0, 0);
      W(c, n1, eq, 0); W(c, n0, eq, 1);
      W(c, eq, outs[0], 0);
      return { circuit: c, inputIds: ins, outputIds: outs };
    }
    default:
      throw new Error("no reference for " + levelId);
  }
}

describe("levels catalogue", () => {
  it("has 12 levels with exhaustive tests and sane budgets", () => {
    assert.equal(LEVELS.length, 12);
    for (const l of LEVELS) {
      assert.ok(l.id && l.name && l.briefing);
      assert.ok(l.inputs.length >= 1 && l.outputs.length >= 1);
      assert.equal(l.tests.length, 2 ** l.inputs.length);
      for (const t of l.tests) {
        assert.equal(t.in.length, l.inputs.length);
        assert.equal(t.out.length, l.outputs.length);
      }
      for (const [type, n] of Object.entries(l.allowed)) {
        assert.ok(n > 0, `${l.id}: budget for ${type} must be > 0`);
      }
      assert.ok(l.par >= 1 && l.par <= 8, `${l.id}: par out of range`);
    }
  });

  it("every level is solvable within budget (reference solutions pass)", () => {
    for (const level of LEVELS) {
      const { circuit, inputIds, outputIds } = buildReference(level.id);
      const gates = countGates(circuit);
      // budget check
      const used = {};
      for (const n of Object.values(circuit.nodes)) {
        if (n.type === "INPUT" || n.type === "OUTPUT") continue;
        used[n.type] = (used[n.type] ?? 0) + 1;
      }
      for (const [type, n] of Object.entries(used)) {
        assert.ok(
          (level.allowed[type] ?? 0) >= n,
          `${level.id}: reference uses ${n}x ${type}, budget ${level.allowed[type] ?? 0}`
        );
      }
      const { passed, results } = evaluateLevel(circuit, level, inputIds, outputIds);
      assert.equal(passed, true, `${level.id} reference failed: ${JSON.stringify(results.filter((r) => !r.ok))}`);
      assert.ok(gates <= level.par + 1, `${level.id}: reference uses ${gates} gates, par ${level.par}`);
      assert.equal(starsFor(level, gates), 3);
    }
  });

  it("wrong circuits fail (sanity: AND level with OR gate)", () => {
    const level = LEVELS.find((l) => l.id === "and");
    const c = createCircuit();
    const { ins, outs } = (() => {
      const ii = [], oo = [];
      for (let i = 0; i < 2; i++) ii.push(addNode(c, "INPUT", 0, 0).id);
      oo.push(addNode(c, "OUTPUT", 0, 0).id);
      return { ins: ii, outs: oo };
    })();
    const g = addNode(c, "OR", 0, 0).id;
    W(c, ins[0], g, 0); W(c, ins[1], g, 1); W(c, g, outs[0], 0);
    const { passed } = evaluateLevel(c, level, ins, outs);
    assert.equal(passed, false);
  });
});
