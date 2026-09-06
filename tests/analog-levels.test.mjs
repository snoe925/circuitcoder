import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAnalogSpec, evaluateAnalog, countAnalogParts } from "../src/analog.js";
import { LEVELS_ANALOG } from "../src/analog-levels.js";
import { starsFor } from "../src/levels.js";

// Bench-state builders: devices + segs in UI shape.
let seq = 0;
const nid = (p) => `${p}${seq++}`;
function dev(devices, kind, extra = {}) {
  const id = nid("d");
  devices[id] = { id, kind, x: 0, y: 0, ...extra };
  return id;
}
function wire(segs, a, b) {
  const id = nid("w");
  segs[id] = { id, from: a, to: b };
}
function setup() { seq = 0; return { devices: {}, segs: {} }; }
function rails(st, volts = [12, -12]) {
  const out = {};
  for (const v of volts) {
    const id = dev(st.devices, "SUP", { volts: v });
    out[v] = id;
  }
  const g = dev(st.devices, "GND", {});
  return { ...out, gnd: g };
}
function vsrc(st, name) {
  const id = dev(st.devices, "VSRC", { name });
  return id;
}
function op(st) { return dev(st.devices, "OPAMP", {}); }
function res(st, r) { return dev(st.devices, "RES", { r }); }
function at(dev, pin) { return { dev, pin }; }
// connect device pins by merging: helper wires pin->pin
function join(st, d1, p1, d2, p2) { wire(st.segs, at(d1, p1), at(d2, p2)); }
function gndRet(st, vsrcId) {
  const g = dev(st.devices, "GND", {});
  join(st, vsrcId, "M", g, "S");
  return g;
}

const R = {};
const ref = (id, fn) => { R[id] = fn; };

ref("o-follow", () => {
  const st = setup(); rails(st);
  const v = vsrc(st, "Vin"), o = op(st);
  gndRet(st, v);
  join(st, v, "P", o, "+"); join(st, o, "OUT", o, "-");
  return { st, inIds: [v], probeKeys: [[o, "OUT"]] };
});
ref("o-comp", () => {
  const st = setup(); const r = rails(st);
  const v = vsrc(st, "Vin"), o = op(st);
  gndRet(st, v);
  const r1 = res(st, 10000), r2 = res(st, 10000);
  join(st, r[12], "S", r1, "A"); join(st, r1, "B", r2, "A"); join(st, r2, "B", r.gnd, "S");
  join(st, v, "P", o, "+"); join(st, r1, "B", o, "-");
  return { st, inIds: [v], probeKeys: [[o, "OUT"]] };
});
ref("o-noninv", () => {
  const st = setup(); rails(st);
  const v = vsrc(st, "Vin"), o = op(st);
  gndRet(st, v);
  const r1 = res(st, 1000), rf = res(st, 10000);
  const g = dev(st.devices, "GND", {});
  join(st, v, "P", o, "+");
  join(st, r1, "A", o, "-"); join(st, r1, "B", g, "S");
  join(st, rf, "A", o, "-"); join(st, rf, "B", o, "OUT");
  return { st, inIds: [v], probeKeys: [[o, "OUT"]] };
});
ref("o-inv", () => {
  const st = setup(); rails(st);
  const v = vsrc(st, "Vin"), o = op(st);
  gndRet(st, v);
  const rin = res(st, 1000), rf = res(st, 10000);
  const g = dev(st.devices, "GND", {});
  join(st, v, "P", rin, "A"); join(st, rin, "B", o, "-");
  join(st, rf, "A", o, "-"); join(st, rf, "B", o, "OUT");
  join(st, g, "S", o, "+");
  return { st, inIds: [v], probeKeys: [[o, "OUT"]] };
});
ref("o-sum", () => {
  const st = setup(); rails(st);
  const va = vsrc(st, "Va"), vb = vsrc(st, "Vb"), o = op(st);
  gndRet(st, va); gndRet(st, vb);
  const r1 = res(st, 10000), r2 = res(st, 10000), rf = res(st, 10000);
  const g = dev(st.devices, "GND", {});
  join(st, va, "P", r1, "A"); join(st, r1, "B", o, "-");
  join(st, vb, "P", r2, "A"); join(st, r2, "B", o, "-");
  join(st, rf, "A", o, "-"); join(st, rf, "B", o, "OUT");
  join(st, g, "S", o, "+");
  return { st, inIds: [va, vb], probeKeys: [[o, "OUT"]] };
});
ref("o-schmitt", () => {
  const st = setup(); rails(st);
  const v = vsrc(st, "Vin"), o = op(st);
  gndRet(st, v);
  const r1 = res(st, 1000), rf = res(st, 10000);
  const g = dev(st.devices, "GND", {});
  join(st, v, "P", r1, "A"); join(st, r1, "B", o, "+");
  join(st, rf, "A", o, "+"); join(st, rf, "B", o, "OUT");
  join(st, g, "S", o, "-");
  return { st, inIds: [v], probeKeys: [[o, "OUT"]] };
});
ref("o-diff", () => {
  const st = setup(); rails(st);
  const va = vsrc(st, "Va"), vb = vsrc(st, "Vb"), o = op(st);
  gndRet(st, va); gndRet(st, vb);
  const r1 = res(st, 10000), rf = res(st, 10000), r3 = res(st, 10000), r4 = res(st, 10000);
  const g = dev(st.devices, "GND", {});
  join(st, va, "P", r1, "A"); join(st, r1, "B", o, "-");
  join(st, rf, "A", o, "-"); join(st, rf, "B", o, "OUT");
  join(st, vb, "P", r3, "A"); join(st, r3, "B", o, "+");
  join(st, r4, "A", o, "+"); join(st, r4, "B", g, "S");
  return { st, inIds: [va, vb], probeKeys: [[o, "OUT"]] };
});
ref("o-clip", () => {
  const st = setup(); rails(st);
  const v = vsrc(st, "Vin"), o = op(st);
  gndRet(st, v);
  const r1 = res(st, 1000), rf = res(st, 10000);
  const g = dev(st.devices, "GND", {});
  join(st, v, "P", o, "+");
  join(st, r1, "A", o, "-"); join(st, r1, "B", g, "S");
  join(st, rf, "A", o, "-"); join(st, rf, "B", o, "OUT");
  return { st, inIds: [v], probeKeys: [[o, "OUT"]] };
});

describe("analog catalogue", () => {
  it("has 8 levels with sane vectors and budgets", () => {
    assert.equal(LEVELS_ANALOG.length, 8);
    for (const l of LEVELS_ANALOG) {
      assert.ok(l.mode === "analog" && l.chapter === "Op-Amp Lab" && l.tol > 0);
      for (const t of l.tests) {
        assert.equal(t.in.length, l.inputs.length);
        assert.equal(t.out.length, l.probes.length);
      }
    }
  });

  it("every analog level is solvable within budget at par", () => {
    assert.equal(Object.keys(R).length, 8);
    for (const level of LEVELS_ANALOG) {
      assert.ok(R[level.id], `missing reference for ${level.id}`);
      const { st, inIds, probeKeys } = R[level.id]();
      const used = countAnalogParts(st.devices);
      for (const [kind, n2] of Object.entries(used)) {
        assert.ok((level.allowed[kind] ?? 0) >= n2,
          `${level.id}: uses ${n2}x ${kind}, budget ${level.allowed[kind] ?? 0}`);
      }
      const total = Object.values(used).reduce((a, b) => a + b, 0);
      const build = (inputValues) => buildAnalogSpec(st.devices, st.segs, inputValues);
      const pks = probeKeys.map(([dev, pin]) => `${dev}:${pin}`);
      const { passed, results } = evaluateAnalog(build, level, inIds, pks, level.tol);
      assert.equal(passed, true,
        `${level.id} reference failed: ${JSON.stringify(results.filter((r) => !r.ok))}`);
      assert.ok(total <= level.par, `${level.id}: uses ${total} parts, par ${level.par}`);
      assert.equal(starsFor(level, total), 3);
    }
  });
});
