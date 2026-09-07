import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCircuit, addNode, addWire } from "../src/engine.js";
import { evaluateClocked } from "../src/clocked.js";
import { LEVELS_CLOCKED } from "../src/clocked-levels.js";
import { starsFor } from "../src/levels.js";

function W(c, from, to, toPin = 0, fromPin = 0) {
  const r = addWire(c, from, to, toPin, fromPin);
  assert.equal(r.ok, true, JSON.stringify(r));
}
function IN(c, name) { return addNode(c, "INPUT", 0, 0, { name }).id; }
function CLK(c, name = "CLK", period = 2) { return addNode(c, "CLOCK", 0, 0, { name, period }).id; }
function OUT(c, name) { return addNode(c, "OUTPUT", 0, 0, { name }).id; }
function G(c, type) { return addNode(c, type, 0, 0).id; }
// wire all CLK pins (1) of the given flops to a clock net
function clockAll(c, clkNet, ...flops) {
  for (const f of flops) W(c, clkNet, f, 1);
}

const R = {};
const ref = (id, fn) => { R[id] = fn; };

ref("k-blink", () => {
  const c = createCircuit();
  const k = CLK(c);
  const y = OUT(c, "Y");
  W(c, k, y, 0);
  return { circuit: c, names: { CLK: k, Y: y } };
});
ref("k-delay", () => {
  const c = createCircuit();
  const d = IN(c, "D"), k = CLK(c);
  const d1 = G(c, "DELAY"), d2 = G(c, "DELAY"), y = OUT(c, "Y");
  W(c, d, d1, 0); W(c, d1, d2, 0); W(c, d2, y, 0);
  return { circuit: c, names: { D: d, CLK: k, Y: y } };
});
ref("k-dcap", () => {
  const c = createCircuit();
  const d = IN(c, "D"), k = CLK(c);
  const f = G(c, "DFF"), y = OUT(c, "Q");
  W(c, d, f, 0); W(c, k, f, 1); W(c, f, y, 0);
  return { circuit: c, names: { D: d, CLK: k, Q: y } };
});
ref("k-div2", () => {
  const c = createCircuit();
  const hi = IN(c, "HI"), k = CLK(c);
  const t = G(c, "TFF"), y = OUT(c, "Q");
  W(c, hi, t, 0); W(c, k, t, 1); W(c, t, y, 0);
  return { circuit: c, names: { HI: hi, CLK: k, Q: y } };
});
ref("k-div4", () => {
  const c = createCircuit();
  const hi = IN(c, "HI"), k = CLK(c);
  const t0 = G(c, "TFF"), t1 = G(c, "TFF");
  const y0 = OUT(c, "Q0"), y1 = OUT(c, "Q1");
  W(c, hi, t0, 0); W(c, k, t0, 1);
  W(c, hi, t1, 0); W(c, t0, t1, 1, 1); // Q0b -> CLK1 (falling-edge style)
  W(c, t0, y0, 0); W(c, t1, y1, 0);
  return { circuit: c, names: { HI: hi, CLK: k, Q0: y0, Q1: y1 } };
});
ref("k-count3", () => {
  const c = createCircuit();
  const hi = IN(c, "HI"), k = CLK(c);
  const t0 = G(c, "TFF"), t1 = G(c, "TFF"), t2 = G(c, "TFF");
  const a = G(c, "AND");
  const y0 = OUT(c, "Q0"), y1 = OUT(c, "Q1"), y2 = OUT(c, "Q2");
  W(c, hi, t0, 0);
  W(c, t0, t1, 0);
  W(c, t0, a, 0); W(c, t1, a, 1); W(c, a, t2, 0);
  clockAll(c, k, t0, t1, t2);
  W(c, t0, y0, 0); W(c, t1, y1, 0); W(c, t2, y2, 0);
  return { circuit: c, names: { HI: hi, CLK: k, Q0: y0, Q1: y1, Q2: y2 } };
});
ref("k-shift", () => {
  const c = createCircuit();
  const d = IN(c, "D"), k = CLK(c);
  const f0 = G(c, "DFF"), f1 = G(c, "DFF"), f2 = G(c, "DFF");
  const y0 = OUT(c, "Q0"), y1 = OUT(c, "Q1"), y2 = OUT(c, "Q2");
  W(c, d, f0, 0); W(c, f0, f1, 0); W(c, f1, f2, 0);
  clockAll(c, k, f0, f1, f2);
  W(c, f0, y0, 0); W(c, f1, y1, 0); W(c, f2, y2, 0);
  return { circuit: c, names: { D: d, CLK: k, Q0: y0, Q1: y1, Q2: y2 } };
});
ref("k-latch", () => {
  const c = createCircuit();
  const d = IN(c, "D"), e = IN(c, "EN"), k = CLK(c);
  const l = G(c, "DLATCH"), y = OUT(c, "Y");
  W(c, d, l, 0); W(c, e, l, 1); W(c, l, y, 0);
  return { circuit: c, names: { D: d, EN: e, CLK: k, Y: y } };
});
ref("k-div3", () => {
  const c = createCircuit();
  const hi = IN(c, "HI"), k = CLK(c);
  const t0 = G(c, "TFF"), t1 = G(c, "TFF"), a = G(c, "AND");
  const y0 = OUT(c, "Q0"), y1 = OUT(c, "Q1");
  W(c, hi, t0, 0); W(c, t0, t1, 0);
  W(c, t0, a, 0); W(c, t1, a, 1);
  W(c, a, t0, 2); W(c, a, t1, 2);
  clockAll(c, k, t0, t1);
  W(c, t0, y0, 0); W(c, t1, y1, 0);
  return { circuit: c, names: { HI: hi, CLK: k, Q0: y0, Q1: y1 } };
});
ref("k-div5", () => {
  const c = createCircuit();
  const hi = IN(c, "HI"), k = CLK(c);
  const t0 = G(c, "TFF"), t1 = G(c, "TFF"), t2 = G(c, "TFF");
  const g1 = G(c, "AND"), g2 = G(c, "AND");
  const y0 = OUT(c, "Q0"), y1 = OUT(c, "Q1"), y2 = OUT(c, "Q2");
  W(c, hi, t0, 0); W(c, t0, t1, 0);
  W(c, t0, g1, 0); W(c, t1, g1, 1); W(c, g1, t2, 0);
  W(c, t2, g2, 0); W(c, t0, g2, 1);
  W(c, g2, t0, 2); W(c, g2, t1, 2); W(c, g2, t2, 2);
  clockAll(c, k, t0, t1, t2);
  W(c, t0, y0, 0); W(c, t1, y1, 0); W(c, t2, y2, 0);
  return { circuit: c, names: { HI: hi, CLK: k, Q0: y0, Q1: y1, Q2: y2 } };
});
ref("k-johnson", () => {
  const c = createCircuit();
  const k = CLK(c);
  const f0 = G(c, "DFF"), f1 = G(c, "DFF"), f2 = G(c, "DFF");
  const n = G(c, "NOT");
  const y0 = OUT(c, "Q0"), y1 = OUT(c, "Q1"), y2 = OUT(c, "Q2");
  W(c, f2, n, 0); W(c, n, f0, 0);
  W(c, f0, f1, 0); W(c, f1, f2, 0);
  clockAll(c, k, f0, f1, f2);
  W(c, f0, y0, 0); W(c, f1, y1, 0); W(c, f2, y2, 0);
  return { circuit: c, names: { CLK: k, Q0: y0, Q1: y1, Q2: y2 } };
});
ref("k-pwm", () => {
  const c = createCircuit();
  const hi = IN(c, "HI"), d1 = IN(c, "D1"), d0 = IN(c, "D0"), k = CLK(c);
  const t0 = G(c, "TFF"), t1 = G(c, "TFF");
  W(c, hi, t0, 0); W(c, t0, t1, 0);
  clockAll(c, k, t0, t1);
  // OUT = (¬C1∧D1) ∨ (¬(C1⊕D1) ∧ ¬C0∧D0)
  const n1 = G(c, "NOT"), a1 = G(c, "AND"), e = G(c, "XNOR");
  const n0 = G(c, "NOT"), g1 = G(c, "AND"), a2 = G(c, "AND"), y = G(c, "OR");
  const o = OUT(c, "OUT");
  W(c, t1, n1, 0); W(c, n1, a1, 0); W(c, d1, a1, 1);
  W(c, t1, e, 0); W(c, d1, e, 1);
  W(c, t0, n0, 0); W(c, e, g1, 0); W(c, n0, g1, 1);
  W(c, g1, a2, 0); W(c, d0, a2, 1);
  W(c, a1, y, 0); W(c, a2, y, 1); W(c, y, o, 0);
  return { circuit: c, names: { HI: hi, D1: d1, D0: d0, CLK: k, OUT: o } };
});

const FREE = new Set(["INPUT", "OUTPUT", "PROBE", "CLOCK"]);

describe("clocked catalogue", () => {
  it("has 12 levels with sane scenarios and budgets", () => {
    assert.equal(LEVELS_CLOCKED.length, 12);
    const ids = new Set();
    for (const l of LEVELS_CLOCKED) {      assert.ok(l.mode === "clocked" && l.chapter === "Clocked");
      assert.ok(!ids.has(l.id));
      ids.add(l.id);
      assert.ok(l.ticks >= 1 && l.tests.length >= 1);
      for (const t of l.tests) {
        for (const [pname, wave] of Object.entries(t.expect)) {
          assert.ok(l.probes.includes(pname), `${l.id} probe ${pname}`);
          assert.equal(wave.length, l.ticks, `${l.id} waveform length`);
        }
      }
      assert.ok(l.par >= 0 && l.par <= 9, `${l.id} par range`);
      // input/clock/probe names share one namespace in nameToId — a
      // collision silently shadows (this caught k-blink's CLK/CLK).
      const names = [...l.inputs, ...(l.clocks ?? []), ...l.probes];
      assert.equal(new Set(names).size, names.length, `${l.id} duplicate terminal names`);
    }
  });

  it("every clocked level is solvable within budget at par", () => {
    assert.equal(Object.keys(R).length, 12);
    for (const level of LEVELS_CLOCKED) {
      assert.ok(R[level.id], `missing reference for ${level.id}`);
      const { circuit, names } = R[level.id]();
      const used = {};
      for (const n of Object.values(circuit.nodes)) {
        if (FREE.has(n.type)) continue;
        used[n.type] = (used[n.type] ?? 0) + 1;
      }
      for (const [type, n] of Object.entries(used)) {
        assert.ok((level.allowed[type] ?? 0) >= n,
          `${level.id}: uses ${n}x ${type}, budget ${level.allowed[type] ?? 0}`);
      }
      const total = Object.values(used).reduce((a, b) => a + b, 0);
      const { passed, results, error } = evaluateClocked(circuit, level, names);
      assert.equal(error, undefined, `${level.id}: ${error}`);
      assert.equal(passed, true, `${level.id} failed: ${JSON.stringify(results)}`);
      assert.ok(total <= level.par, `${level.id}: uses ${total} parts, par ${level.par}`);
      assert.equal(starsFor(level, total), 3);
    }
  });
});
