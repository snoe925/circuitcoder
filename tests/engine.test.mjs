import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GATE_DEFS,
  createCircuit,
  addNode,
  removeNode,
  addWire,
  setInputWire,
  removeWire,
  validateWire,
  computeGate,
  simulate,
  countGates,
  serializeCircuit,
  deserializeCircuit,
} from "../src/engine.js";

function wire2(c, from, to, toPin = 0) {
  const r = addWire(c, from, to, toPin, 0);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.wire;
}

describe("computeGate truth tables", () => {
  it("AND/OR/NOT", () => {
    assert.equal(computeGate("AND", [1, 1]), 1);
    assert.equal(computeGate("AND", [1, 0]), 0);
    assert.equal(computeGate("OR", [0, 0]), 0);
    assert.equal(computeGate("OR", [0, 1]), 1);
    assert.equal(computeGate("NOT", [0]), 1);
    assert.equal(computeGate("NOT", [1]), 0);
  });
  it("NAND/NOR/XOR/XNOR exhaustive", () => {
    const cases = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
    const nand = [1, 1, 1, 0];
    const nor = [1, 0, 0, 0];
    const xor = [0, 1, 1, 0];
    const xnor = [1, 0, 0, 1];
    cases.forEach((c, i) => {
      assert.equal(computeGate("NAND", c), nand[i]);
      assert.equal(computeGate("NOR", c), nor[i]);
      assert.equal(computeGate("XOR", c), xor[i]);
      assert.equal(computeGate("XNOR", c), xnor[i]);
    });
  });
});

describe("simulate basics", () => {
  it("single NOT inverts", () => {
    const c = createCircuit();
    const a = addNode(c, "INPUT", 0, 0, { name: "A" });
    const g = addNode(c, "NOT", 0, 0);
    const y = addNode(c, "OUTPUT", 0, 0, { name: "Y" });
    wire2(c, a.id, g.id, 0);
    wire2(c, g.id, y.id, 0);
    assert.equal(simulate(c, { [a.id]: 0 }).nodeOutputs[y.id], 1);
    assert.equal(simulate(c, { [a.id]: 1 }).nodeOutputs[y.id], 0);
  });

  it("unconnected inputs read as 0", () => {
    const c = createCircuit();
    const g = addNode(c, "AND", 0, 0);
    const y = addNode(c, "OUTPUT", 0, 0);
    wire2(c, g.id, y.id, 0);
    const s = simulate(c, {});
    assert.equal(s.nodeOutputs[y.id], 0);
    assert.equal(s.status, "STABLE");
  });

  it("supports fanout from one output to two inputs", () => {
    const c = createCircuit();
    const a = addNode(c, "INPUT", 0, 0);
    const g1 = addNode(c, "NOT", 0, 0);
    const g2 = addNode(c, "NOT", 0, 0);
    const y1 = addNode(c, "OUTPUT", 0, 0);
    const y2 = addNode(c, "OUTPUT", 0, 0);
    wire2(c, a.id, g1.id, 0);
    wire2(c, a.id, g2.id, 0);
    wire2(c, g1.id, y1.id, 0);
    wire2(c, g2.id, y2.id, 0);
    const s = simulate(c, { [a.id]: 1 });
    assert.equal(s.nodeOutputs[y1.id], 0);
    assert.equal(s.nodeOutputs[y2.id], 0);
  });

  it("100-gate NOT chain evaluates (perf sanity)", () => {
    const c = createCircuit();
    const a = addNode(c, "INPUT", 0, 0);
    let prev = a.id;
    for (let i = 0; i < 100; i++) {
      const g = addNode(c, "NOT", 0, 0);
      wire2(c, prev, g.id, 0);
      prev = g.id;
    }
    const y = addNode(c, "OUTPUT", 0, 0);
    wire2(c, prev, y.id, 0);
    const s = simulate(c, { [a.id]: 0 });
    assert.equal(s.status, "STABLE");
    assert.equal(s.nodeOutputs[y.id], 0); // even count inverts back
  });

  it("feedback loop is UNSTABLE, not hang", () => {
    const c = createCircuit();
    const a = addNode(c, "INPUT", 0, 0);
    const g1 = addNode(c, "NOT", 0, 0);
    const g2 = addNode(c, "NOT", 0, 0);
    wire2(c, a.id, g1.id, 0);
    wire2(c, g1.id, g2.id, 0);
    // g2 feeds back into g1's occupied pin via replace
    const r = setInputWire(c, g2.id, g1.id, 0, 0);
    assert.equal(r.ok, true);
    const s = simulate(c, { [a.id]: 1 });
    assert.equal(s.status, "UNSTABLE");
  });
});

describe("circuit editing", () => {
  it("rejects bad wires", () => {
    const c = createCircuit();
    const a = addNode(c, "INPUT", 0, 0);
    const y = addNode(c, "OUTPUT", 0, 0);
    assert.equal(validateWire(c, y.id, a.id).ok, false); // OUTPUT has no out
    assert.equal(validateWire(c, a.id, a.id).ok, false); // self
    wire2(c, a.id, y.id, 0);
    assert.equal(validateWire(c, a.id, y.id, 0).ok, false); // occupied
  });

  it("removeNode cleans wires; removeWire works; countGates excludes terminals", () => {
    const c = createCircuit();
    const a = addNode(c, "INPUT", 0, 0);
    const g = addNode(c, "AND", 0, 0);
    const y = addNode(c, "OUTPUT", 0, 0);
    assert.equal(countGates(c), 1);
    wire2(c, a.id, g.id, 0);
    assert.equal(removeNode(c, g.id), true);
    assert.equal(Object.keys(c.wires).length, 0);
    const g2 = addNode(c, "OR", 0, 0);
    const w = wire2(c, a.id, g2.id, 1);
    assert.equal(removeWire(c, w.id), true);
  });

  it("serialize round-trips", () => {
    const c = createCircuit();
    const a = addNode(c, "INPUT", 5, 6, { name: "A" });
    const g = addNode(c, "NOT", 7, 8);
    wire2(c, a.id, g.id, 0);
    const d = deserializeCircuit(serializeCircuit(c));
    assert.equal(Object.keys(d.nodes).length, 2);
    assert.equal(Object.keys(d.wires).length, 1);
    assert.equal(d.nodes[a.id].x, 5);
  });

  it("unknown gate type throws", () => {
    const c = createCircuit();
    assert.throws(() => addNode(c, "FLIPFLOP", 0, 0));
  });
});
