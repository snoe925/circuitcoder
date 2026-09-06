import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createNet, addNetNode, addDevice, simulateCmos, evaluateCmos, countCmosParts,
} from "../src/cmos.js";
import { LEVELS_CMOS } from "../src/cmos-levels.js";
import { starsFor } from "../src/levels.js";

function base() {
  const net = createNet();
  const vdd = addNetNode(net, "VDD"), gnd = addNetNode(net, "GND");
  addDevice(net, "VDD", { net: vdd });
  addDevice(net, "GND", { net: gnd });
  return { net, vdd, gnd };
}
function mkInputs(net, names) {
  return names.map((name) => {
    const n = addNetNode(net, name);
    return { net: n, id: addDevice(net, "IN", { net: n }).id };
  });
}
function inverter(net, vdd, gnd, gateNet, outNet) {
  addDevice(net, "PMOS", { gate: gateNet, a: vdd, b: outNet });
  addDevice(net, "NMOS", { gate: gateNet, a: outNet, b: gnd });
}
function nand2(net, vdd, gnd, a, b, out) {
  const mid = addNetNode(net, "mid");
  addDevice(net, "PMOS", { gate: a, a: vdd, b: out });
  addDevice(net, "PMOS", { gate: b, a: vdd, b: out });
  addDevice(net, "NMOS", { gate: a, a: out, b: mid });
  addDevice(net, "NMOS", { gate: b, a: mid, b: gnd });
}

const R = {};
const ref = (id, fn) => { R[id] = fn; };

ref("c-power", () => {
  // Free rail taps straight to the lamps (rails/IN/PROBE are infrastructure).
  const net = createNet();
  const p1 = addNetNode(net, "P1"), p2 = addNetNode(net, "P2");
  addDevice(net, "VDD", { net: p1 });
  addDevice(net, "GND", { net: p2 });
  return { net, inIds: [], probeNets: [p1, p2] };
});
ref("c-nmos", () => {
  const { net, vdd } = base();
  const [A] = mkInputs(net, ["A"]);
  const Y = addNetNode(net, "Y");
  addDevice(net, "NMOS", { gate: A.net, a: vdd, b: Y });
  addDevice(net, "PULLDOWN", { net: Y });
  return { net, inIds: [A.id], probeNets: [Y] };
});
ref("c-pmos", () => {
  const { net, vdd } = base();
  const [A] = mkInputs(net, ["A"]);
  const Y = addNetNode(net, "Y");
  addDevice(net, "PMOS", { gate: A.net, a: vdd, b: Y });
  addDevice(net, "PULLDOWN", { net: Y });
  return { net, inIds: [A.id], probeNets: [Y] };
});
ref("c-rtl", () => {
  const { net, gnd } = base();
  const [A] = mkInputs(net, ["A"]);
  const Y = addNetNode(net, "Y");
  addDevice(net, "PULLUP", { net: Y });
  addDevice(net, "NMOS", { gate: A.net, a: Y, b: gnd });
  return { net, inIds: [A.id], probeNets: [Y] };
});
ref("c-inv", () => {
  const { net, vdd, gnd } = base();
  const [A] = mkInputs(net, ["A"]);
  const Y = addNetNode(net, "Y");
  inverter(net, vdd, gnd, A.net, Y);
  return { net, inIds: [A.id], probeNets: [Y] };
});
ref("c-nand", () => {
  const { net, vdd, gnd } = base();
  const [A, B] = mkInputs(net, ["A", "B"]);
  const Y = addNetNode(net, "Y");
  nand2(net, vdd, gnd, A.net, B.net, Y);
  return { net, inIds: [A.id, B.id], probeNets: [Y] };
});
ref("c-nor", () => {
  const { net, vdd, gnd } = base();
  const [A, B] = mkInputs(net, ["A", "B"]);
  const Y = addNetNode(net, "Y");
  const mid = addNetNode(net, "mid");
  addDevice(net, "PMOS", { gate: A.net, a: vdd, b: mid });
  addDevice(net, "PMOS", { gate: B.net, a: mid, b: Y });
  addDevice(net, "NMOS", { gate: A.net, a: Y, b: gnd });
  addDevice(net, "NMOS", { gate: B.net, a: Y, b: gnd });
  return { net, inIds: [A.id, B.id], probeNets: [Y] };
});
ref("c-and", () => {
  const { net, vdd, gnd } = base();
  const [A, B] = mkInputs(net, ["A", "B"]);
  const Y = addNetNode(net, "Y"), m = addNetNode(net, "m");
  nand2(net, vdd, gnd, A.net, B.net, m);
  inverter(net, vdd, gnd, m, Y);
  return { net, inIds: [A.id, B.id], probeNets: [Y] };
});
ref("c-diode", () => {
  const { net } = base();
  const [A, B] = mkInputs(net, ["A", "B"]);
  const Y = addNetNode(net, "Y");
  addDevice(net, "DIODE", { anode: Y, cathode: A.net });
  addDevice(net, "DIODE", { anode: Y, cathode: B.net });
  addDevice(net, "PULLUP", { net: Y });
  return { net, inIds: [A.id, B.id], probeNets: [Y] };
});
ref("c-dtl", () => {
  const { net, gnd } = base();
  const [A, B] = mkInputs(net, ["A", "B"]);
  const M = addNetNode(net, "M"), Y = addNetNode(net, "Y");
  addDevice(net, "DIODE", { anode: M, cathode: A.net });
  addDevice(net, "DIODE", { anode: M, cathode: B.net });
  addDevice(net, "PULLUP", { net: M });
  addDevice(net, "NPN", { base: M, c: Y, e: gnd });
  addDevice(net, "PULLUP", { net: Y });
  return { net, inIds: [A.id, B.id], probeNets: [Y] };
});
ref("c-tgate", () => {
  const { net, vdd, gnd } = base();
  const [A, S] = mkInputs(net, ["A", "S"]);
  const Y = addNetNode(net, "Y"), nS = addNetNode(net, "nS");
  inverter(net, vdd, gnd, S.net, nS);
  addDevice(net, "NMOS", { gate: S.net, a: A.net, b: Y });
  addDevice(net, "PMOS", { gate: nS, a: A.net, b: Y });
  return { net, inIds: [A.id, S.id], probeNets: [Y] };
});
ref("c-sr", () => {
  const { net, vdd, gnd } = base();
  const [S, R] = mkInputs(net, ["S", "R"]);
  const Q = addNetNode(net, "Q"), Qb = addNetNode(net, "Qb");
  const nor = (x, y, o) => {
    const mid = addNetNode(net, "mid");
    addDevice(net, "PMOS", { gate: x, a: vdd, b: mid });
    addDevice(net, "PMOS", { gate: y, a: mid, b: o });
    addDevice(net, "NMOS", { gate: x, a: o, b: gnd });
    addDevice(net, "NMOS", { gate: y, a: o, b: gnd });
  };
  nor(R.net, Qb, Q);
  nor(S.net, Q, Qb);
  return { net, inIds: [S.id, R.id], probeNets: [Q, Qb] };
});

describe("cmos catalogue", () => {
  it("has 12 levels with sane tables and budgets", () => {
    assert.equal(LEVELS_CMOS.length, 12);
    for (const l of LEVELS_CMOS) {
      assert.ok(l.mode === "cmos" && l.chapter === "CMOS Lab");
      assert.ok(l.tests.length >= 1);
      for (const t of l.tests) {
        assert.equal(t.in.length, l.inputs.length);
        assert.equal(t.out.length, l.probes.length);
      }
    }
  });

  it("every CMOS level is solvable within budget at par", () => {
    assert.equal(Object.keys(R).length, 12);
    for (const level of LEVELS_CMOS) {
      assert.ok(R[level.id], `missing reference for ${level.id}`);
      const { net, inIds, probeNets } = R[level.id]();
      const used = countCmosParts(net);
      for (const [kind, n] of Object.entries(used)) {
        assert.ok((level.allowed[kind] ?? 0) >= n,
          `${level.id}: uses ${n}x ${kind}, budget ${level.allowed[kind] ?? 0}`);
      }
      const total = Object.values(used).reduce((a, b) => a + b, 0);
      const { passed, results } = evaluateCmos(net, level, inIds, probeNets);
      assert.equal(passed, true,
        `${level.id} reference failed: ${JSON.stringify(results.filter((r) => !r.ok))}`);
      assert.ok(total <= level.par, `${level.id}: uses ${total} parts, par ${level.par}`);
      assert.equal(starsFor(level, total), 3);
    }
  });
});
