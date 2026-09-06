import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCircuit, addNode, addWire, simulate, countGates } from "../src/engine.js";
import { parseExpr, evalExpr, exprVars } from "../src/expr.js";
import { buildSOP, estimateGates, compileExpr, compileMinimized, circuitExpr, outputExprs } from "../src/synth.js";

function harness(nIn) {
  const c = createCircuit();
  const ins = [];
  for (let i = 0; i < nIn; i++) ins.push(addNode(c, "INPUT", 0, 0).id);
  const out = addNode(c, "OUTPUT", 0, 0).id;
  return { c, ins, out };
}
function agreeWithTable(c, ins, out, ast, vars) {
  for (let i = 0; i < 2 ** vars.length; i++) {
    const row = vars.map((_, b) => (i >> (vars.length - 1 - b)) & 1);
    const env = Object.fromEntries(vars.map((v, k) => [v, row[k]]));
    const sim = simulate(c, Object.fromEntries(ins.map((id, k) => [id, row[k]])));
    assert.equal(sim.nodeOutputs[out], evalExpr(ast, env), `row ${row}`);
  }
}

describe("buildSOP / estimateGates", () => {
  it("builds a shared-NOT SOP matching its table", () => {
    const { c, ins, out } = harness(3);
    const cover = [[["A", 0], ["B", 1]], [["A", 1], ["C", 1]]];
    buildSOP(c, { A: ins[0], B: ins[1], C: ins[2] }, cover, out);
    assert.equal(countGates(c), 4); // 1 NOT + 2 AND + 1 OR
    agreeWithTable(c, ins, out, parseExpr("~A&B|A&C"), ["A", "B", "C"]);
  });

  it("estimates shared NOTs and multi-literal ANDs", () => {
    assert.deepEqual(estimateGates([[["x", 0], ["z", 0]], [["y", 1], ["z", 0]]]),
      { NOT: 2, AND: 2, OR: 1, total: 5 });
    assert.deepEqual(estimateGates([[["A", 1]]]), { NOT: 0, AND: 0, OR: 0, total: 0 });
  });

  it("rejects constants and unknown vars", () => {
    const { c, ins, out } = harness(1);
    assert.throws(() => buildSOP(c, { A: ins[0] }, [], out), /constant-0/);
    assert.throws(() => buildSOP(c, { A: ins[0] }, [[]], out), /VCC/);
    assert.throws(() => buildSOP(c, { A: ins[0] }, [[["Q", 1]]], out), /unknown variable/);
  });
});

describe("compileExpr", () => {
  for (const target of ["aon", "nand", "nor"]) {
    it(`target ${target} matches the expression table`, () => {
      for (const src of ["A&B|C", "~A^B", "(A|B)&~(C^D)"]) {
        const ast = parseExpr(src);
        const vars = exprVars(ast);
        const { c, ins, out } = harness(vars.length);
        compileExpr(c, src, Object.fromEntries(vars.map((v, i) => [v, ins[i]])), out, { target });
        assert.equal(simulate(c, {}).status, "STABLE");
        agreeWithTable(c, ins, out, ast, vars);
      }
    });
  }

  it("uses 4 NANDs / 6 NORs for XOR", () => {
    for (const [target, n] of [["nand", 4], ["nor", 6]]) {
      const { c, ins, out } = harness(2);
      compileExpr(c, "A^B", { A: ins[0], B: ins[1] }, out, { target });
      assert.equal(countGates(c), n);
    }
  });

  it("rejects bad targets, vars, constants", () => {
    const { c, ins, out } = harness(1);
    assert.throws(() => compileExpr(c, "A", { A: ins[0] }, out, { target: "ttl" }), /unknown target/);
    assert.throws(() => compileExpr(c, "Q", { A: ins[0] }, out), /unknown variable/);
    assert.throws(() => compileExpr(c, "A&1", { A: ins[0] }, out), /VCC\/GND/);
  });
});

describe("circuitExpr / outputExprs", () => {
  function wired(build) {
    const c = createCircuit();
    const ins = [addNode(c, "INPUT", 0, 0, { name: "A" }).id, addNode(c, "INPUT", 0, 0, { name: "B" }).id];
    const out = addNode(c, "OUTPUT", 0, 0, { name: "Y" }).id;
    build(c, ins, out);
    return { c, ins, out };
  }

  it("renders wire-through, NOT, and unconnected pins", () => {
    let t = wired((c, [a], out) => {
      const res = addWire(c, a, out, 0, 0); assert.equal(res.ok, true);
    });
    assert.equal(circuitExpr(t.c, t.out, { [t.ins[0]]: "A" }).text, "A");
    t = wired((c, [a], out) => {
      const g = addNode(c, "NOT", 0, 0).id;
      addWire(c, a, g, 0, 0); addWire(c, g, out, 0, 0);
    });
    assert.equal(circuitExpr(t.c, t.out, { [t.ins[0]]: "A" }).text, "¬A");
    t = wired(() => {});
    assert.equal(circuitExpr(t.c, t.out, {}).text, "0");
  });

  it("parenthesizes by precedence and inverts compounds", () => {
    // (A∧B)∨C needs no parens; A∧(B∨C) does
    const c = createCircuit();
    const [A, B, C] = ["A", "B", "C"].map((n) => addNode(c, "INPUT", 0, 0, { name: n }).id);
    const o1 = addNode(c, "OUTPUT", 0, 0, { name: "Y1" }).id;
    const o2 = addNode(c, "OUTPUT", 0, 0, { name: "Y2" }).id;
    const a1 = addNode(c, "AND", 0, 0).id, r1 = addNode(c, "OR", 0, 0).id;
    addWire(c, A, a1, 0, 0); addWire(c, B, a1, 1, 0); addWire(c, a1, r1, 0, 0); addWire(c, C, r1, 1, 0);
    addWire(c, r1, o1, 0, 0);
    const a2 = addNode(c, "AND", 0, 0).id, r2 = addNode(c, "OR", 0, 0).id;
    addWire(c, B, r2, 0, 0); addWire(c, C, r2, 1, 0); addWire(c, A, a2, 0, 0); addWire(c, r2, a2, 1, 0);
    addWire(c, a2, o2, 0, 0);
    const names = { [A]: "A", [B]: "B", [C]: "C" };
    assert.equal(circuitExpr(c, o1, names).text, "A ∧ B ∨ C");
    assert.equal(circuitExpr(c, o2, names).text, "A ∧ (B ∨ C)");
    const n = addNode(c, "NAND", 0, 0).id, o3 = addNode(c, "OUTPUT", 0, 0, { name: "Y3" }).id;
    addWire(c, A, n, 0, 0); addWire(c, B, n, 1, 0); addWire(c, n, o3, 0, 0);
    assert.equal(circuitExpr(c, o3, names).text, "¬(A ∧ B)");
  });

  it("marks loops and names outputs", () => {
    const c = createCircuit();
    const g = addNode(c, "NOT", 0, 0).id;
    c.wires.w9 = { id: "w9", from: g, fromPin: 0, to: g, toPin: 0 };
    assert.equal(circuitExpr(c, g, {}).text, "¬⟳");
    const out = addNode(c, "OUTPUT", 0, 0, { name: "Y" }).id;
    addWire(c, g, out, 0, 0);
    assert.deepEqual(outputExprs(c, [out], {}), { Y: "¬⟳" });
  });
});

describe("compileMinimized", () => {
  it("minimizes then builds (MUX briefing shape)", () => {
    const { c, ins, out } = harness(3);
    const { cover, estimate } = compileMinimized(c, "~S&A|S&B", { A: ins[0], B: ins[1], S: ins[2] }, out, ["A", "B", "S"]);
    assert.equal(cover.length, 2);
    assert.deepEqual(estimate, { NOT: 1, AND: 2, OR: 1, total: 4 });
    agreeWithTable(c, ins, out, parseExpr("~S&A|S&B"), ["A", "B", "S"]);
  });
});
