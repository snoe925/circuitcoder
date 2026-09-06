import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createCircuit, addNode, addWire, validateWire, simulate, GATE_DEFS,
} from "../src/engine.js";
import { parseExpr, evalExpr, exprVars, exprToCover } from "../src/expr.js";
import { buildSOP } from "../src/synth.js";
import {
  createNet, addNetNode, addDevice, simulateCmos,
} from "../src/cmos.js";
import { solveDC, simulateAnalog } from "../src/analog.js";
import { simulateClocked } from "../src/clocked.js";

// Deterministic PRNG (mulberry32) — same bugs found on every run.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length) % arr.length];

describe("fuzz: random combinational circuits always settle or flag", () => {
  for (const seed of [1, 7, 42]) {
    it(`seed ${seed}: 150 builds never throw or hang`, () => {
      const rand = rng(seed);
      const kinds = ["AND", "OR", "NOT", "NAND", "NOR", "XOR", "XNOR"];
      for (let iter = 0; iter < 150; iter++) {
        const c = createCircuit();
        const ins = [addNode(c, "INPUT", 0, 0).id, addNode(c, "INPUT", 0, 0).id];
        const outs = [addNode(c, "OUTPUT", 0, 0).id];
        const gates = [];
        const n = 1 + Math.floor(rand() * 8);
        for (let i = 0; i < n; i++) gates.push(addNode(c, pick(rand, kinds), 0, 0).id);
        // random legal-ish wires (validation decides; both outcomes fine)
        for (let i = 0; i < n * 2; i++) {
          const from = pick(rand, [...ins, ...gates]);
          const to = pick(rand, [...gates, ...outs]);
          const k = GATE_DEFS[c.nodes[to].type].inputs;
          if (k === 0) continue;
          addWire(c, from, to, Math.floor(rand() * k), 0);
        }
        const vals = {};
        for (const id of ins) vals[id] = rand() < 0.5 ? 1 : 0;
        const s = simulate(c, vals);
        assert.ok(s.status === "STABLE" || s.status === "UNSTABLE", `seed ${seed} iter ${iter}`);
        for (const v of Object.values(s.nodeOutputs)) assert.ok(v === 0 || v === 1);
      }
    });
  }
});

describe("fuzz: expression round-trips (parse->cover->build->simulate)", () => {
  function randExpr(rand, vars, depth) {
    if (depth <= 0 || rand() < 0.35) {
      const r = rand();
      if (r < 0.15) return rand() < 0.5 ? "0" : "1";
      return pick(rand, vars);
    }
    const op = pick(rand, ["&", "|", "^", "~"]);
    if (op === "~") return `~(${randExpr(rand, vars, depth - 1)})`;
    return `(${randExpr(rand, vars, depth - 1)}${op}${randExpr(rand, vars, depth - 1)})`;
  }
  it("100 random exprs over ≤3 vars agree end to end", () => {
    const rand = rng(99);
    for (let iter = 0; iter < 100; iter++) {
      const nvars = 1 + Math.floor(rand() * 3);
      const vars = ["A", "B", "C"].slice(0, nvars);
      const src = randExpr(rand, vars, 3);
      const ast = parseExpr(src);
      assert.deepEqual(exprVars(ast).every((v) => vars.includes(v)), true);
      const { cover, constant } = exprToCover(ast, vars);
      if (constant !== null) continue; // nothing to build
      const c = createCircuit();
      const ins = {};
      for (const v of vars) ins[v] = addNode(c, "INPUT", 0, 0).id;
      const out = addNode(c, "OUTPUT", 0, 0).id;
      buildSOP(c, ins, cover, out);
      for (let i = 0; i < 2 ** nvars; i++) {
        const row = vars.map((_, b) => (i >> (nvars - 1 - b)) & 1);
        const env = Object.fromEntries(vars.map((v, k) => [v, row[k]]));
        const vals = Object.fromEntries(vars.map((v, k) => [ins[v], row[k]]));
        const s = simulate(c, vals);
        assert.equal(s.status, "STABLE", `expr ${src} row ${row}`);
        assert.equal(s.nodeOutputs[out], evalExpr(ast, env), `expr ${src} row ${row}`);
      }
    }
  });
});

describe("fuzz: random CMOS nets terminate with a valid status", () => {
  it("200 nets: no throw, no hang, sane states", () => {
    const rand = rng(13);
    for (let iter = 0; iter < 200; iter++) {
      const net = createNet();
      const nets = [];
      const nn = 2 + Math.floor(rand() * 4);
      for (let i = 0; i < nn; i++) nets.push(addNetNode(net, `n${i}`));
      addDevice(net, "VDD", { net: nets[0] });
      addDevice(net, "GND", { net: nets[1] });
      const inIds = [];
      for (let i = 0; i < 2; i++) {
        const id = addDevice(net, "IN", { net: pick(rand, nets) }).id;
        inIds.push(id);
      }
      const kinds = ["NMOS", "PMOS", "NPN", "DIODE", "RESISTOR"];
      for (let i = 0; i < 6; i++) {
        const k = pick(rand, kinds);
        const a = pick(rand, nets), b = pick(rand, nets), g = pick(rand, nets);
        if (k === "NMOS" || k === "PMOS") addDevice(net, k, { gate: g, a, b });
        else if (k === "NPN") addDevice(net, k, { base: g, c: a, e: b });
        else if (k === "DIODE") addDevice(net, k, { anode: a, cathode: b });
        else addDevice(net, k, { a, b });
      }
      const vals = {};
      for (const id of inIds) vals[id] = rand() < 0.5 ? 1 : 0;
      const s = simulateCmos(net, vals);
      assert.ok(["STABLE", "SHORT", "FLOAT", "UNSTABLE"].includes(s.status), `iter ${iter}: ${s.status}`);
      for (const st of Object.values(s.states)) {
        assert.ok(st.v === 0 || st.v === 1 || st.v === "X");
        assert.ok(st.s === 0 || st.s === 1 || st.s === 2);
      }
    }
  });
});

describe("fuzz: random analog nets solve or fail cleanly", () => {
  it("150 resistive/source nets: finite voltages when ok", () => {
    const rand = rng(21);
    for (let iter = 0; iter < 150; iter++) {
      const nets = ["gnd", "a", "b", "c"];
      const spec = { nets, ground: ["gnd"], resistors: [], vsrcs: [], opamps: [] };
      for (let i = 0; i < 4; i++) {
        spec.resistors.push({
          a: pick(rand, nets), b: pick(rand, nets),
          r: pick(rand, [1000, 10000, 100000]),
        });
      }
      spec.vsrcs.push({ id: "v", p: "a", m: "gnd", v: (rand() * 24 - 12) });
      const r = solveDC(spec);
      assert.equal(typeof r.ok, "boolean");
      if (r.ok) {
        for (const v of r.voltages.values()) assert.ok(Number.isFinite(v), `iter ${iter}`);
      }
    }
  });
  it("80 nets with a random op-amp: bounded saturation, finite when ok", () => {
    const rand = rng(34);
    for (let iter = 0; iter < 80; iter++) {
      const nets = ["gnd", "in", "m", "out"];
      const spec = {
        nets, ground: ["gnd"],
        resistors: [
          { a: "in", b: "m", r: 1000 },
          { a: "out", b: "m", r: pick(rand, [1000, 10000]) },
        ],
        vsrcs: [{ id: "v", p: "in", m: "gnd", v: rand() * 4 - 2 }],
        opamps: [{ out: "out", vp: rand() < 0.5 ? "in" : "gnd", vm: "m" }],
      };
      const r = simulateAnalog(spec, 11);
      assert.equal(typeof r.ok, "boolean");
      if (r.ok) {
        for (const v of r.voltages.values()) assert.ok(Number.isFinite(v), `iter ${iter}`);
        assert.ok(r.ticks <= 2 * 1 + 3);
      }
    }
  });
});

describe("fuzz: random clocked nets terminate with full-length traces", () => {
  it("120 builds: OK or UNSTABLE, traces match tick count", () => {
    const rand = rng(55);
    for (let iter = 0; iter < 120; iter++) {
      const c = createCircuit();
      const d = addNode(c, "INPUT", 0, 0).id;
      const k = addNode(c, "CLOCK", 0, 0, { period: pick(rand, [2, 4]) }).id;
      const flops = [];
      for (let i = 0; i < 3; i++) {
        const f = addNode(c, pick(rand, ["DFF", "TFF", "DLATCH", "DELAY"]), 0, 0).id;
        flops.push(f);
      }
      const outs = [addNode(c, "OUTPUT", 0, 0).id];
      const pins = (id) => {
        const t = c.nodes[id].type;
        if (t === "DFF" || t === "TFF") return [[id, 0], [id, 1], [id, 2]];
        if (t === "DLATCH" || t === "DELAY") return [[id, 0]];
        return [];
      };
      for (const f of flops) {
        for (const [nid, pin] of pins(f)) {
          void nid;
          const src = pick(rand, [d, k, ...flops]);
          if (src !== f) addWire(c, src, f, pin, 0);
        }
      }
      for (const o of outs) addWire(c, pick(rand, [d, k, ...flops]), o, 0, 0);
      const ticks = 6;
      const s = simulateClocked(c, { [d]: rand() < 0.5 ? 1 : 0 }, ticks);
      assert.ok(s.status === "OK" || s.status === "UNSTABLE", `iter ${iter}`);
      for (const [id, wave] of Object.entries(s.traces)) {
        assert.ok(wave.length <= ticks, `${id} too long`);
        for (const b of wave) assert.ok(b === 0 || b === 1, `${id} bad bit`);
      }
    }
  });
}); 

describe("fuzz: validateWire agrees with addWire", () => {
  it("no disagreement across random pairs", () => {
    const rand = rng(5);
    for (let iter = 0; iter < 300; iter++) {
      const c = createCircuit();
      const ids = [];
      for (const t of ["INPUT", "AND", "OR", "NOT", "OUTPUT", "PROBE"]) {
        ids.push(addNode(c, t, 0, 0).id);
      }
      const from = pick(rand, ids), to = pick(rand, ids);
      const v = validateWire(c, from, to, 0, 0);
      const before = Object.keys(c.wires).length;
      const r = addWire(c, from, to, 0, 0);
      assert.equal(r.ok, v.ok, `validate/addWire disagree ${from}->${to}: ${v.error}`);
      assert.equal(Object.keys(c.wires).length, before + (r.ok ? 1 : 0));
    }
  });
});
