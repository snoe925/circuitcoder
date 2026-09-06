import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { devicePins, pinAnchor, buildEngineNet, CMOS_SIZE } from "../src/cmos-ui.js";
import { simulateCmos } from "../src/cmos.js";

describe("CMOS geometry", () => {
  it("pin sets per kind", () => {
    assert.deepEqual(devicePins("NMOS"), ["G", "A", "B"]);
    assert.deepEqual(devicePins("NPN"), ["G", "A", "B"]);
    assert.deepEqual(devicePins("DIODE"), ["A", "K"]);
    assert.deepEqual(devicePins("PROBE"), ["A"]);
    for (const k of ["PULLUP", "VDD", "GND", "IN"]) assert.deepEqual(devicePins(k), ["Y"]);
  });

  it("anchors match the documented layout", () => {
    assert.deepEqual(pinAnchor("NMOS", "G"), { x: 0, y: 52 });
    assert.deepEqual(pinAnchor("NMOS", "A"), { x: 42, y: 0 });
    assert.deepEqual(pinAnchor("NMOS", "B"), { x: 42, y: 104 });
    assert.deepEqual(pinAnchor("DIODE", "K"), { x: 84, y: 26 });
    assert.deepEqual(pinAnchor("RESISTOR", "A"), { x: 0, y: 22 });
    assert.deepEqual(pinAnchor("RESISTOR", "B"), { x: 84, y: 22 });
    assert.deepEqual(pinAnchor("IN", "Y"), { x: 92, y: 26 });
    assert.deepEqual(pinAnchor("PROBE", "A"), { x: 0, y: 26 });
    assert.ok(CMOS_SIZE.NMOS.h === 104 && CMOS_SIZE.IN.w === 92);
  });
});

describe("buildEngineNet", () => {
  it("merges wired pins into one net, isolates the rest", () => {
    const devs = {
      a: { id: "a", kind: "IN", x: 0, y: 0 },
      n: { id: "n", kind: "NMOS", x: 0, y: 0 },
    };
    const { net, endpointNet } = buildEngineNet(devs, {
      s1: { id: "s1", from: { dev: "a", pin: "Y" }, to: { dev: "n", pin: "G" } },
    });
    assert.equal(endpointNet["a:Y"], endpointNet["n:G"]);
    assert.notEqual(endpointNet["n:A"], endpointNet["n:G"]);
    assert.equal(net.devices.n.gate, endpointNet["a:Y"]);
  });

  it("built inverter netlist inverts", () => {
    const devices = {
      v: { id: "v", kind: "VDD", x: 0, y: 0 },
      g: { id: "g", kind: "GND", x: 0, y: 0 },
      a: { id: "a", kind: "IN", x: 0, y: 0 },
      p: { id: "p", kind: "PMOS", x: 0, y: 0 },
      n: { id: "n", kind: "NMOS", x: 0, y: 0 },
      y: { id: "y", kind: "PROBE", x: 0, y: 0 },
    };
    const S = (f, t) => ({ from: f, to: t });
    const segs = {
      s1: { id: "s1", ...S({ dev: "v", pin: "Y" }, { dev: "p", pin: "A" }) },
      s2: { id: "s2", ...S({ dev: "a", pin: "Y" }, { dev: "p", pin: "G" }) },
      s3: { id: "s3", ...S({ dev: "a", pin: "Y" }, { dev: "n", pin: "G" }) },
      s4: { id: "s4", ...S({ dev: "p", pin: "B" }, { dev: "y", pin: "A" }) },
      s5: { id: "s5", ...S({ dev: "n", pin: "A" }, { dev: "y", pin: "A" }) },
      s6: { id: "s6", ...S({ dev: "n", pin: "B" }, { dev: "g", pin: "Y" }) },
    };
    const { net, endpointNet } = buildEngineNet(devices, segs);
    for (const bit of [0, 1]) {
      const sim = simulateCmos(net, { a: bit });
      assert.equal(sim.status, "STABLE");
      assert.equal(sim.states[endpointNet["y:A"]].v, bit ? 0 : 1);
    }
  });
});
