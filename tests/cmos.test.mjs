import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createNet, addNetNode, addDevice, removeDevice, mergeNets,
  countCmosParts, simulateCmos, evaluateCmos,
  serializeNet, deserializeNet,
} from "../src/cmos.js";

function rails(net) {
  const vdd = addNetNode(net, "VDD"), gnd = addNetNode(net, "GND");
  addDevice(net, "VDD", { net: vdd });
  addDevice(net, "GND", { net: gnd });
  return { vdd, gnd };
}
function input(net, name) {
  const n = addNetNode(net, name);
  const d = addDevice(net, "IN", { net: n });
  return { net: n, id: d.id };
}
function probe(net, targetNet) {
  addDevice(net, "PROBE", { net: targetNet });
}

describe("switches", () => {
  it("NMOS conducts iff gate=1", () => {
    for (const g of [0, 1]) {
      const net = createNet();
      const { vdd } = rails(net);
      const A = input(net, "A"), Y = addNetNode(net, "Y");
      addDevice(net, "NMOS", { gate: A.net, a: vdd, b: Y });
      probe(net, Y);
      const s = simulateCmos(net, { [A.id]: g });
      assert.equal(s.states[Y].v, g === 1 ? 1 : "X");
    }
  });

  it("PMOS conducts iff gate=0", () => {
    for (const g of [0, 1]) {
      const net = createNet();
      const { vdd } = rails(net);
      const A = input(net, "A"), Y = addNetNode(net, "Y");
      addDevice(net, "PMOS", { gate: A.net, a: vdd, b: Y });
      probe(net, Y);
      const s = simulateCmos(net, { [A.id]: g });
      // gate=0 -> conducts VDD (strong 1); gate=1 -> off (float, no pull)
      assert.equal(s.states[Y].v, g === 0 ? 1 : "X");
    }
  });

  it("NPN behaves like NMOS (base=gate)", () => {
    const net = createNet();
    const { gnd } = rails(net);
    const A = input(net, "A"), Y = addNetNode(net, "Y");
    addDevice(net, "NPN", { base: A.net, c: Y, e: gnd });
    addDevice(net, "PULLUP", { net: Y });
    assert.equal(simulateCmos(net, { [A.id]: 1 }).states[Y].v, 0);
    assert.equal(simulateCmos(net, { [A.id]: 0 }).states[Y].v, 1);
  });
});

describe("gates from transistors", () => {
  function inverter() {
    const net = createNet();
    const { vdd, gnd } = rails(net);
    const A = input(net, "A"), Y = addNetNode(net, "Y");
    addDevice(net, "PMOS", { gate: A.net, a: vdd, b: Y });
    addDevice(net, "NMOS", { gate: A.net, a: Y, b: gnd });
    probe(net, Y);
    return { net, A, Y };
  }
  it("CMOS inverter", () => {
    const { net, A, Y } = inverter();
    assert.equal(simulateCmos(net, { [A.id]: 0 }).states[Y].v, 1);
    assert.equal(simulateCmos(net, { [A.id]: 1 }).states[Y].v, 0);
  });

  it("CMOS NAND (parallel PMOS, series NMOS)", () => {
    const net = createNet();
    const { vdd, gnd } = rails(net);
    const A = input(net, "A"), B = input(net, "B"), Y = addNetNode(net, "Y");
    const mid = addNetNode(net, "mid");
    addDevice(net, "PMOS", { gate: A.net, a: vdd, b: Y });
    addDevice(net, "PMOS", { gate: B.net, a: vdd, b: Y });
    addDevice(net, "NMOS", { gate: A.net, a: Y, b: mid });
    addDevice(net, "NMOS", { gate: B.net, a: mid, b: gnd });
    probe(net, Y);
    for (const [a, b, exp] of [[0, 0, 1], [0, 1, 1], [1, 0, 1], [1, 1, 0]]) {
      const s = simulateCmos(net, { [A.id]: a, [B.id]: b });
      assert.equal(s.status, "STABLE");
      assert.equal(s.states[Y].v, exp, `NAND ${a},${b}`);
    }
  });

  it("weak pull loses to strong drive (no false short)", () => {
    const net = createNet();
    const { vdd } = rails(net);
    const Y = addNetNode(net, "Y");
    addDevice(net, "PULLDOWN", { net: Y });
    addDevice(net, "PMOS", { gate: vdd, a: vdd, b: Y }); // gate=1 -> OFF
    const s = simulateCmos(net, {});
    assert.equal(s.states[Y].v, 0);
    assert.equal(s.short, false);
  });
});

describe("faults", () => {
  it("VDD-GND short flags SHORT", () => {
    const net = createNet();
    const { vdd, gnd } = rails(net);
    const A = input(net, "A");
    addDevice(net, "NMOS", { gate: A.net, a: vdd, b: gnd });
    const s = simulateCmos(net, { [A.id]: 1 });
    assert.equal(s.short, true);
    assert.equal(s.status, "SHORT");
  });

  it("floating probe flags FLOAT", () => {
    const net = createNet();
    const Y = addNetNode(net, "Y");
    probe(net, Y);
    const s = simulateCmos(net, {});
    assert.equal(s.status, "FLOAT");
    assert.deepEqual(s.floatNets, [Y]);
  });

  it("diode AND pulls low through the weak pull-up", () => {
    const net = createNet();
    const A = input(net, "A"), B = input(net, "B"), Y = addNetNode(net, "Y");
    addDevice(net, "DIODE", { anode: Y, cathode: A.net });
    addDevice(net, "DIODE", { anode: Y, cathode: B.net });
    addDevice(net, "PULLUP", { net: Y });
    probe(net, Y);
    for (const [a, b, exp] of [[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 1]]) {
      const s = simulateCmos(net, { [A.id]: a, [B.id]: b });
      assert.equal(s.states[Y].v, exp, `diode-AND ${a},${b}`);
    }
  });
});

describe("stateful SR latch", () => {
  function srLatch() {
    const net = createNet();
    const { vdd, gnd } = rails(net);
    const S = input(net, "S"), R = input(net, "R");
    const Q = addNetNode(net, "Q"), Qb = addNetNode(net, "Qb");
    const nor = (x, y, o) => {
      const mid = addNetNode(net, "mid");
      addDevice(net, "PMOS", { gate: x, a: vdd, b: mid });
      addDevice(net, "PMOS", { gate: y, a: mid, b: o });
      addDevice(net, "NMOS", { gate: x, a: o, b: gnd });
      addDevice(net, "NMOS", { gate: y, a: o, b: gnd });
    };
    nor(R.net, Qb, Q); // Q = ¬(R ∨ Qb)
    nor(S.net, Q, Qb); // Qb = ¬(S ∨ Q)
    return { net, S, R, Q, Qb };
  }

  it("set, hold, reset, hold via carried state", () => {
    const { net, S, R, Q, Qb } = srLatch();
    const level = {
      stateful: true,
      tests: [
        { in: [1, 0], out: [1, 0], fresh: true }, // set
        { in: [0, 0], out: [1, 0] },              // hold
        { in: [0, 1], out: [0, 1], fresh: true }, // reset
        { in: [0, 0], out: [0, 1] },              // hold
      ],
    };
    const r = evaluateCmos(net, level, [S.id, R.id], [Q, Qb]);
    assert.equal(r.passed, true, JSON.stringify(r.results.filter((x) => !x.ok)));
  });
});

describe("netlist editing", () => {
  it("mergeNets rewires terminals and drops the old net", () => {
    const net = createNet();
    const a = addNetNode(net, "a"), b = addNetNode(net, "b");
    const d = addDevice(net, "NMOS", { gate: a, a, b });
    void d;
    assert.equal(mergeNets(net, a, b), true);
    assert.ok(!net.nets[b]);
    assert.equal(mergeNets(net, a, b), false);
  });

  it("removeDevice, part counts, unknown kinds, serialize round-trip", () => {
    const net = createNet();
    const n = addNetNode(net, "n");
    const d = addDevice(net, "NMOS", { gate: n, a: n, b: n });
    addDevice(net, "VDD", { net: n });
    assert.deepEqual(countCmosParts(net), { NMOS: 1 });
    assert.equal(removeDevice(net, d.id), true);
    assert.equal(removeDevice(net, d.id), false);
    assert.throws(() => addDevice(net, "TRIAC", {}), /Unknown CMOS kind/);
    const back = deserializeNet(serializeNet(net));
    assert.equal(Object.keys(back.nets).length, 1);
    assert.deepEqual(countCmosParts(back), {});
  });
});
