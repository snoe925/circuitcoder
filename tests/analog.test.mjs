import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { solveDC, simulateAnalog, sweepTransfer } from "../src/analog.js";

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

function divider() {
  return {
    nets: ["in", "mid", "gnd"], ground: ["gnd"],
    resistors: [{ a: "in", b: "mid", r: 1000 }, { a: "mid", b: "gnd", r: 1000 }],
    vsrcs: [{ id: "v", p: "in", m: "gnd", v: 10 }],
    opamps: [],
  };
}

describe("solveDC", () => {
  it("voltage divider halves", () => {
    const r = solveDC(divider());
    assert.equal(r.ok, true);
    close(r.voltages.get("mid"), 5);
    close(r.voltages.get("in"), 10);
  });

  it("voltage follower copies", () => {
    const r = solveDC({
      nets: ["in", "out", "gnd"], ground: ["gnd"],
      resistors: [], vsrcs: [{ id: "v", p: "in", m: "gnd", v: 3.3 }],
      opamps: [{ out: "out", vp: "in", vm: "out" }],
    });
    assert.equal(r.ok, true);
    close(r.voltages.get("out"), 3.3);
  });

  it("non-inverting amp gain 11", () => {
    const r = solveDC({
      nets: ["in", "out", "m", "gnd"], ground: ["gnd"],
      resistors: [{ a: "m", b: "gnd", r: 1000 }, { a: "out", b: "m", r: 10000 }],
      vsrcs: [{ id: "v", p: "in", m: "gnd", v: 1 }],
      opamps: [{ out: "out", vp: "in", vm: "m" }],
    });
    close(r.voltages.get("out"), 11);
  });

  it("inverting amp gain -10", () => {
    const r = solveDC({
      nets: ["in", "out", "m", "gnd"], ground: ["gnd"],
      resistors: [{ a: "in", b: "m", r: 1000 }, { a: "out", b: "m", r: 10000 }],
      vsrcs: [{ id: "v", p: "in", m: "gnd", v: 1 }],
      opamps: [{ out: "out", vp: "gnd", vm: "m" }],
    });
    close(r.voltages.get("out"), -10);
  });

  it("returns ok:false on singular systems", () => {
    const r = solveDC({ nets: ["a"], ground: [], resistors: [], vsrcs: [], opamps: [] });
    assert.equal(r.ok, false);
  });
});

describe("simulateAnalog saturation", () => {
  function openLoop() {
    return {
      nets: ["in", "out", "gnd"], ground: ["gnd"],
      resistors: [], vsrcs: [{ id: "v", p: "in", m: "gnd", v: 5 }],
      opamps: [{ out: "out", vp: "in", vm: "gnd" }],
    };
  }
  it("comparator rails at ±Vsat", () => {
    const hi = simulateAnalog(openLoop(), 11);
    assert.equal(hi.ok, true);
    close(hi.voltages.get("out"), 11);
    assert.deepEqual(hi.saturated, ["out"]);
    const lo = simulateAnalog({
      ...openLoop(),
      vsrcs: [{ id: "v", p: "in", m: "gnd", v: -5 }],
    }, 11);
    close(lo.voltages.get("out"), -11);
  });

  it("linear amp does not saturate", () => {
    const r = simulateAnalog({
      nets: ["in", "out", "gnd"], ground: ["gnd"],
      resistors: [], vsrcs: [{ id: "v", p: "in", m: "gnd", v: 2 }],
      opamps: [{ out: "out", vp: "in", vm: "out" }],
    }, 11);
    close(r.voltages.get("out"), 2);
    assert.deepEqual(r.saturated, []);
  });
});

describe("sweepTransfer", () => {
  it("follower sweep is a straight line", () => {
    const spec = {
      nets: ["in", "out", "gnd"], ground: ["gnd"],
      resistors: [], vsrcs: [{ id: "v", p: "in", m: "gnd", v: 0 }],
      opamps: [{ out: "out", vp: "in", vm: "out" }],
    };
    const pts = sweepTransfer(spec, "v", "out", 5, 11, -10, 10);
    assert.equal(pts.length, 5);
    for (const p of pts) close(p.vout, p.vin, 1e-4);
  });

  it("non-inverting Schmitt plots hysteresis (different trip points each way)", () => {
    // V+ node: vin via R1, out via Rf (positive feedback); V− grounded.
    // Trips: ascending −1.1, descending +1.1.
    const spec = {
      nets: ["in", "out", "p", "gnd"], ground: ["gnd"],
      resistors: [{ a: "in", b: "p", r: 1000 }, { a: "out", b: "p", r: 10000 }],
      vsrcs: [{ id: "v", p: "in", m: "gnd", v: 0 }],
      opamps: [{ out: "out", vp: "p", vm: "gnd" }],
    };
    const pts = sweepTransfer(spec, "v", "out", 41, 11, -5, 5);
    const at = (arr, vin) => arr.reduce((best, p) => (Math.abs(p.vin - vin) < Math.abs(best.vin - vin) ? p : best)).vout;
    close(at(pts, -5), -11, 0.5);  // driven negative: saturated low
    close(at(pts, 5), 11, 0.5);    // driven positive: saturated high
    close(at(pts, -3), -11, 0.5);  // still low before the +1.1 trip…
    close(at(pts, 0), -11, 0.5);   // …and at mid-ascending
    // …while a descending sweep through the same band still holds HIGH
    const down = sweepTransfer(spec, "v", "out", 41, 11, 5, -5);
    close(at(down, 3), 11, 0.5);
    close(at(down, 0), 11, 0.5);
    close(at(down, -3), -11, 0.5);
  });
});
