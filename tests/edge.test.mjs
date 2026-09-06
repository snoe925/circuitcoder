import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  createCircuit, addNode, addWire, validateWire, removeNode,
  simulate, deserializeCircuit,
} from "../src/engine.js";
import { parseExpr, evalExpr, ExprError } from "../src/expr.js";
import { minimize, kmapString, coverString } from "../src/minimize.js";
import { estimateGates, compileExpr } from "../src/synth.js";
import { createNet, addNetNode, addDevice, mergeNets, simulateCmos } from "../src/cmos.js";
import { buildAnalogSpec, evaluateAnalog } from "../src/analog.js";
import { simulateClocked } from "../src/clocked.js";

// localStorage stub (store.js only touches it inside functions)
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
  clear: () => { for (const k of Object.keys(mem)) delete mem[k]; },
};
const { loadSave, persistSave, defaultSave } = await import("../src/store.js");

describe("engine hostility", () => {
  it("deserializes garbage into empty circuits", () => {
    assert.deepEqual(Object.keys(deserializeCircuit(null).nodes).length, 0);
    assert.deepEqual(Object.keys(deserializeCircuit("junk").nodes).length, 0);
    assert.deepEqual(Object.keys(deserializeCircuit({}).nodes).length, 0);
  });
  it("drops wires pointing at missing nodes", () => {
    const c = deserializeCircuit({
      nodes: [{ id: "n1", type: "INPUT", x: 0, y: 0 }],
      wires: [{ id: "w1", from: "n1", fromPin: 0, to: "ghost", toPin: 0 }],
      seq: 2,
    });
    assert.equal(Object.keys(c.wires).length, 0);
  });
  it("low seq on import cannot clobber existing nodes", () => {
    const c = deserializeCircuit({
      nodes: [{ id: "n9", type: "AND", x: 0, y: 0 }],
      wires: [], seq: 1,
    });
    const g = addNode(c, "OR", 0, 0);
    assert.notEqual(g.id, "n9");
    assert.equal(Object.keys(c.nodes).length, 2);
  });
  it("rejects nonsense wires", () => {
    const c = createCircuit();
    const a = addNode(c, "INPUT", 0, 0).id;
    const b = addNode(c, "INPUT", 0, 0).id;
    const y = addNode(c, "OUTPUT", 0, 0).id;
    const z = addNode(c, "OUTPUT", 0, 0).id;
    assert.equal(validateWire(c, a, a, 0).ok, false); // self
    assert.equal(validateWire(c, a, b, 0).ok, false); // INPUT has no input
    assert.equal(validateWire(c, y, z, 0).ok, false); // OUTPUT has no output
    assert.equal(validateWire(c, a, y, 5).ok, false); // bad pin
    assert.equal(validateWire(c, a, y, 0, 3).ok, false); // bad source pin
    assert.equal(removeNode(c, "nope"), false);
  });
  it("unconnected OUTPUT reads 0, never crashes", () => {
    const c = createCircuit();
    const y = addNode(c, "OUTPUT", 0, 0).id;
    const s = simulate(c, {});
    assert.equal(s.nodeOutputs[y], 0);
    assert.equal(s.status, "STABLE");
  });
});

describe("expr hostility", () => {
  it("rejects malformed input with positions", () => {
    for (const bad of ["", "   ", "A&&&B", "()", "(A", "A)", "A B", "12", "A&", "|A", "A^^B"]) {
      assert.throws(() => parseExpr(bad), ExprError, JSON.stringify(bad));
    }
  });
  it("survives deep nesting", () => {
    const src = "~".repeat(60) + "A";
    const ast = parseExpr(src);
    assert.equal(evalExpr(ast, { A: 1 }), 1); // even number of NOTs
    assert.equal(evalExpr(ast, { A: 0 }), 0);
  });
});

describe("minimize hostility", () => {
  it("tolerates duplicate and overlapping minterms", () => {
    const norm = (cover) =>
      cover.map((t) => t.map(([v, p]) => `${v}${p}`).sort().join("&")).sort();
    assert.deepEqual(norm(minimize({ on: [3, 3, 2, 1], dc: [], vars: ["A", "B"] }).cover), ["A1", "B1"]);
    assert.deepEqual(norm(minimize({ on: [3, 1], dc: [1, 2], vars: ["A", "B"] }).cover), ["B1"]);
  });
  it("single minterm stays a full product", () => {
    const r = minimize({ on: [5], vars: ["w", "x", "y", "z"] });
    assert.equal(r.cover.length, 1);
    assert.equal(r.cover[0].length, 4);
  });
  it("3-var maps have 2 rows of 4", () => {
    const s = kmapString({ on: [0, 7], vars: ["a", "b", "c"] });
    const rows = s.split("\n").filter((l) => l.includes("|"));
    assert.equal(rows.length, 2);
    assert.ok(rows.every((l) => (l.match(/\|/g) || []).length >= 4));
  });
  it("coverString of singletons", () => {
    assert.equal(coverString([[["q", 1]]]), "q");
    assert.equal(coverString([[["q", 0]]]), "¬q");
  });
});

describe("synth hostility", () => {
  it("empty cover estimates zeros", () => {
    assert.deepEqual(estimateGates([]), { NOT: 0, AND: 0, OR: 0, total: 0 });
  });
  it("compiles deep NOT chains in all families", () => {
    for (const target of ["aon", "nand", "nor"]) {
      const c = createCircuit();
      const a = addNode(c, "INPUT", 0, 0).id;
      const o = addNode(c, "OUTPUT", 0, 0).id;
      compileExpr(c, "~~~A", { A: a }, o, { target });
    }
  });
});

describe("cmos hostility", () => {
  it("mergeNets rejects bad merges", () => {
    const net = createNet();
    const a = addNetNode(net, "a");
    assert.equal(mergeNets(net, a, a), false);
    assert.equal(mergeNets(net, a, "ghost"), false);
    assert.equal(mergeNets(net, "ghost", a), false);
  });
  it("X-gated transistor stays off (fail-closed float)", () => {
    const net = createNet();
    const vdd = addNetNode(net, "vdd"), gnd = addNetNode(net, "gnd");
    addDevice(net, "VDD", { net: vdd });
    addDevice(net, "GND", { net: gnd });
    const g = addNetNode(net, "gate"); // undriven -> X
    const y = addNetNode(net, "Y");
    addDevice(net, "NMOS", { gate: g, a: vdd, b: y });
    addDevice(net, "PROBE", { net: y });
    const s = simulateCmos(net, {});
    assert.equal(s.states[y].v, "X");
    assert.equal(s.status, "FLOAT");
  });
  it("forward diode straight across rails flags SHORT (locked-in behavior)", () => {
    const net = createNet();
    const vdd = addNetNode(net, "vdd"), gnd = addNetNode(net, "gnd");
    addDevice(net, "VDD", { net: vdd });
    addDevice(net, "GND", { net: gnd });
    addDevice(net, "DIODE", { anode: vdd, cathode: gnd });
    const s = simulateCmos(net, {});
    assert.equal(s.short, true);
  });
});

describe("analog tolerance boundary", () => {
  function divider() {
    const devices = {
      v: { id: "v", kind: "VSRC", x: 0, y: 0 },
      r1: { id: "r1", kind: "RES", x: 0, y: 0, r: 1000 },
      r2: { id: "r2", kind: "RES", x: 0, y: 0, r: 1000 },
      g: { id: "g", kind: "GND", x: 0, y: 0 },
      p: { id: "p", kind: "PROBE", x: 0, y: 0 },
    };
    const segs = {
      s1: { id: "s1", from: { dev: "v", pin: "P" }, to: { dev: "r1", pin: "A" } },
      s2: { id: "s2", from: { dev: "r1", pin: "B" }, to: { dev: "r2", pin: "A" } },
      s3: { id: "s3", from: { dev: "r1", pin: "B" }, to: { dev: "p", pin: "S" } },
      s4: { id: "s4", from: { dev: "r2", pin: "B" }, to: { dev: "g", pin: "S" } },
      s5: { id: "s5", from: { dev: "v", pin: "M" }, to: { dev: "g", pin: "S" } },
    };
    return { devices, segs };
  }
  it("exact tolerance passes, just-over fails", () => {
    const level = { tests: [{ in: [10], out: [5.5] }] };
    const run = (tol) => {
      const { devices, segs } = divider();
      return evaluateAnalog(
        (iv) => buildAnalogSpec(devices, segs, iv),
        level, ["v"], ["p:S"], tol
      );
    };
    assert.equal(run(0.5).passed, true);  // |5-5.5| = 0.5 <= tol
    assert.equal(run(0.499).passed, false);
  });
});

describe("clocked program edge", () => {
  it("short programs hold their last value", () => {
    const c = createCircuit();
    const d = addNode(c, "INPUT", 0, 0).id;
    const k = addNode(c, "CLOCK", 0, 0, { period: 2 }).id;
    const f = addNode(c, "DFF", 0, 0).id;
    addWire(c, d, f, 0, 0); addWire(c, k, f, 1, 0);
    const s = simulateClocked(c, { [d]: [1] }, 4);
    assert.deepEqual(s.traces[f], [0, 1, 1, 1]);
  });
});

describe("store hostility", () => {
  before(() => { localStorage.clear(); });
  it("defaults on empty or corrupt storage", () => {
    localStorage.clear();
    assert.deepEqual(loadSave(), defaultSave());
    localStorage.setItem("circuitcoder.v1", "{{{nope");
    assert.deepEqual(loadSave(), defaultSave());
    localStorage.setItem("circuitcoder.v1", "[1,2]");
    assert.deepEqual(loadSave(), defaultSave());
  });
  it("clamps and strict-checks fields", () => {
    localStorage.setItem("circuitcoder.v1", JSON.stringify({
      unlocked: 999, stars: "x", freePlay: "yes",
      sandboxBench: "bogus", mode: "bogus",
      cmos: { unlocked: -5 },
    }));
    const s = loadSave();
    assert.equal(s.unlocked, 500);
    assert.deepEqual(s.stars, {});
    assert.equal(s.freePlay, false);
    assert.equal(s.sandboxBench, "gates");
    assert.equal(s.mode, "challenge");
    assert.equal(s.cmos.unlocked, 1);
  });
  it("round-trips a full save", () => {
    const s = defaultSave();
    s.unlocked = 42; s.freePlay = true; s.sandboxBench = "analog";
    s.cmos.unlocked = 7;
    persistSave(s);
    const back = loadSave();
    assert.equal(back.unlocked, 42);
    assert.equal(back.freePlay, true);
    assert.equal(back.sandboxBench, "analog");
    assert.equal(back.cmos.unlocked, 7);
  });
});
