import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createCircuit,
  addNode,
  addWire,
  evaluateLevel,
  countGates,
} from "../src/engine.js";
import { LEVELS_PACK2 } from "../src/pack2.js";
import { starsFor } from "../src/levels.js";

function W(c, from, to, toPin = 0) {
  const r = addWire(c, from, to, toPin, 0);
  assert.equal(r.ok, true, `wire ${from}->${to}:${toPin} failed: ${r.error}`);
}
function terminals(c, nIn, nOut) {
  const ins = [], outs = [];
  for (let i = 0; i < nIn; i++) ins.push(addNode(c, "INPUT", 0, 0).id);
  for (let i = 0; i < nOut; i++) outs.push(addNode(c, "OUTPUT", 0, 0).id);
  return { ins, outs };
}
function G(c, type) { return addNode(c, type, 0, 0).id; }

// ---- universal-gate helpers ----
function notNand(c, x) { const g = G(c, "NAND"); W(c, x, g, 0); W(c, x, g, 1); return g; }
function andNand(c, x, y) { const t = G(c, "NAND"); W(c, x, t, 0); W(c, y, t, 1); return notNand(c, t); }
function orNand(c, x, y) { const nx = notNand(c, x), ny = notNand(c, y); const t = G(c, "NAND"); W(c, nx, t, 0); W(c, ny, t, 1); return t; }
function notNor(c, x) { const g = G(c, "NOR"); W(c, x, g, 0); W(c, x, g, 1); return g; }
function orNor(c, x, y) { const t = G(c, "NOR"); W(c, x, t, 0); W(c, y, t, 1); return notNor(c, t); }
function andNor(c, x, y) { const nx = notNor(c, x), ny = notNor(c, y); const t = G(c, "NOR"); W(c, nx, t, 0); W(c, ny, t, 1); return t; }
function xorNand(c, A, B) {
  const d = G(c, "NAND"), e = G(c, "NAND"), f = G(c, "NAND"), y = G(c, "NAND");
  W(c, A, d, 0); W(c, B, d, 1);
  W(c, A, e, 0); W(c, d, e, 1);
  W(c, B, f, 0); W(c, d, f, 1);
  W(c, e, y, 0); W(c, f, y, 1);
  return y;
}
function xorNor(c, A, B) {
  const nA = G(c, "NOR"), nB = G(c, "NOR");
  const t1 = G(c, "NOR"), t2 = G(c, "NOR"), p = G(c, "NOR"), y = G(c, "NOR");
  W(c, A, nA, 0); W(c, A, nA, 1);
  W(c, B, nB, 0); W(c, B, nB, 1);
  W(c, nA, t1, 0); W(c, B, t1, 1);
  W(c, A, t2, 0); W(c, nB, t2, 1);
  W(c, t1, p, 0); W(c, t2, p, 1);
  W(c, p, y, 0); W(c, p, y, 1);
  return y;
}
function xorClassic(c, A, B) {
  const nA = G(c, "NOT"), nB = G(c, "NOT");
  const t1 = G(c, "AND"), t2 = G(c, "AND"), o = G(c, "OR");
  W(c, A, nA, 0); W(c, B, nB, 0);
  W(c, A, t1, 0); W(c, nB, t1, 1);
  W(c, nA, t2, 0); W(c, B, t2, 1);
  W(c, t1, o, 0); W(c, t2, o, 1);
  return o;
}
// Generic sum-of-products builder from a cover: [[[var, polarity]]].
function buildSOP(c, insByVar, cover, outId) {
  const notFor = {};
  for (const t of cover) for (const [v, pol] of t) {
    if (!pol && !notFor[v]) { const g = G(c, "NOT"); W(c, insByVar[v], g, 0); notFor[v] = g; }
  }
  const terms = cover.map((t) => {
    const srcs = t.map(([v, pol]) => (pol ? insByVar[v] : notFor[v]));
    let cur = srcs[0];
    for (let i = 1; i < srcs.length; i++) {
      const g = G(c, "AND"); W(c, cur, g, 0); W(c, srcs[i], g, 1); cur = g;
    }
    return cur;
  });
  let out = terms[0];
  for (let i = 1; i < terms.length; i++) {
    const g = G(c, "OR"); W(c, out, g, 0); W(c, terms[i], g, 1); out = g;
  }
  W(c, out, outId, 0);
}

const R = {};
function ref(id, fn) { R[id] = fn; }

// A. fluency
ref("nand1", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  const g = G(c, "NAND"); W(c, ins[0], g, 0); W(c, ins[1], g, 1); W(c, g, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("nor1", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  const g = G(c, "NOR"); W(c, ins[0], g, 0); W(c, ins[1], g, 1); W(c, g, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("xor1", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  const g = G(c, "XOR"); W(c, ins[0], g, 0); W(c, ins[1], g, 1); W(c, g, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("xnor1", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  const g = G(c, "XNOR"); W(c, ins[0], g, 0); W(c, ins[1], g, 1); W(c, g, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
function andTree(n) {
  return () => { const c = createCircuit(); const { ins, outs } = terminals(c, n, 1);
    let cur = ins[0];
    for (let i = 1; i < n; i++) { const g = G(c, "AND"); W(c, cur, g, 0); W(c, ins[i], g, 1); cur = g; }
    W(c, cur, outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; };
}
function orTree(n) {
  return () => { const c = createCircuit(); const { ins, outs } = terminals(c, n, 1);
    let cur = ins[0];
    for (let i = 1; i < n; i++) { const g = G(c, "OR"); W(c, cur, g, 0); W(c, ins[i], g, 1); cur = g; }
    W(c, cur, outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; };
}
ref("and3", andTree(3)); ref("or3", orTree(3));
ref("and4", andTree(4)); ref("or4", orTree(4));
ref("and5", andTree(5)); ref("or5", orTree(5));
ref("imply", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  const n = G(c, "NOT"), o = G(c, "OR"); W(c, ins[0], n, 0); W(c, n, o, 0); W(c, ins[1], o, 1); W(c, o, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("nimply", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  const n = G(c, "NOT"), a = G(c, "AND"); W(c, ins[1], n, 0); W(c, ins[0], a, 0); W(c, n, a, 1); W(c, a, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });

// B. NAND workshop
ref("not-nand", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 1, 1);
  W(c, notNand(c, ins[0]), outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("and-nand", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  W(c, andNand(c, ins[0], ins[1]), outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("or-nand", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  W(c, orNand(c, ins[0], ins[1]), outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("xnor-nand", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  W(c, notNand(c, xorNand(c, ins[0], ins[1])), outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("mux-nand", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 3, 1);
  const [A, B, S] = ins; const nS = notNand(c, S);
  const t1 = andNand(c, nS, A), t2 = andNand(c, S, B);
  W(c, orNand(c, t1, t2), outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("demux-nand", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 2);
  const [D, S] = ins; const nS = notNand(c, S);
  W(c, andNand(c, nS, D), outs[0], 0); W(c, andNand(c, S, D), outs[1], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("ha-nand", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 2);
  W(c, xorNand(c, ins[0], ins[1]), outs[0], 0); W(c, andNand(c, ins[0], ins[1]), outs[1], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("and3-nand", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 3, 1);
  const t = G(c, "NAND"); W(c, ins[0], t, 0); W(c, ins[1], t, 1);
  const ab = notNand(c, t); const u = G(c, "NAND"); W(c, ab, u, 0); W(c, ins[2], u, 1);
  W(c, notNand(c, u), outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });

// C. NOR workshop
ref("not-nor", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 1, 1);
  W(c, notNor(c, ins[0]), outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("or-nor", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  W(c, orNor(c, ins[0], ins[1]), outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("and-nor", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  W(c, andNor(c, ins[0], ins[1]), outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("xnor-nor", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  W(c, notNor(c, xorNor(c, ins[0], ins[1])), outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("mux-nor", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 3, 1);
  const [A, B, S] = ins; const nS = notNor(c, S);
  const t1 = andNor(c, nS, A), t2 = andNor(c, S, B);
  W(c, orNor(c, t1, t2), outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("demux-nor", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 2);
  const [D, S] = ins; const nS = notNor(c, S);
  W(c, andNor(c, nS, D), outs[0], 0); W(c, andNor(c, S, D), outs[1], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("ha-nor", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 2);
  W(c, xorNor(c, ins[0], ins[1]), outs[0], 0); W(c, andNor(c, ins[0], ins[1]), outs[1], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });

// D. De Morgan & parity
ref("or-aoi", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  const nA = G(c, "NOT"), nB = G(c, "NOT"), t = G(c, "AND"), y = G(c, "NOT");
  W(c, ins[0], nA, 0); W(c, ins[1], nB, 0); W(c, nA, t, 0); W(c, nB, t, 1); W(c, t, y, 0); W(c, y, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("and-oai", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  const nA = G(c, "NOT"), nB = G(c, "NOT"), t = G(c, "OR"), y = G(c, "NOT");
  W(c, ins[0], nA, 0); W(c, ins[1], nB, 0); W(c, nA, t, 0); W(c, nB, t, 1); W(c, t, y, 0); W(c, y, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("xnor-x", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  const x = G(c, "XOR"), n = G(c, "NOT");
  W(c, ins[0], x, 0); W(c, ins[1], x, 1); W(c, x, n, 0); W(c, n, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
function xorChain(n) {
  return () => { const c = createCircuit(); const { ins, outs } = terminals(c, n, 1);
    let cur = ins[0];
    for (let i = 1; i < n; i++) { const g = G(c, "XOR"); W(c, cur, g, 0); W(c, ins[i], g, 1); cur = g; }
    W(c, cur, outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; };
}
ref("xor3", xorChain(3)); ref("parity4", xorChain(4)); ref("parity5", xorChain(5));
ref("xnor3", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 3, 1);
  const x1 = G(c, "XOR"), x2 = G(c, "XOR"), n = G(c, "NOT");
  W(c, ins[0], x1, 0); W(c, ins[1], x1, 1); W(c, x1, x2, 0); W(c, ins[2], x2, 1);
  W(c, x2, n, 0); W(c, n, outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("nand5", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 5, 1);
  let cur = ins[0];
  for (let i = 1; i < 5; i++) { const g = G(c, "AND"); W(c, cur, g, 0); W(c, ins[i], g, 1); cur = g; }
  const n = G(c, "NOT"); W(c, cur, n, 0); W(c, n, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });

// E. stories
function story2op(build) {
  return () => { const c = createCircuit(); const { ins, outs } = terminals(c, build.n, 1);
    W(c, build.fn(c, ins), outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; };
}
ref("twokey", story2op({ n: 2, fn: (c, [a, b]) => { const g = G(c, "AND"); W(c, a, g, 0); W(c, b, g, 1); return g; } }));
ref("porch", story2op({ n: 2, fn: (c, [m, l]) => { const n = G(c, "NOT"), g = G(c, "AND"); W(c, l, n, 0); W(c, m, g, 0); W(c, n, g, 1); return g; } }));
ref("greenhouse", story2op({ n: 3, fn: (c, [h, occ, m]) => { const a = G(c, "AND"), o = G(c, "OR"); W(c, h, a, 0); W(c, occ, a, 1); W(c, a, o, 0); W(c, m, o, 1); return o; } }));
ref("crosswalk", story2op({ n: 2, fn: (c, [b, t]) => { const n = G(c, "NOT"), g = G(c, "AND"); W(c, t, n, 0); W(c, b, g, 0); W(c, n, g, 1); return g; } }));
ref("alarm", story2op({ n: 3, fn: (c, [m, d, w]) => { const o = G(c, "OR"), a = G(c, "AND"); W(c, d, o, 0); W(c, w, o, 1); W(c, m, a, 0); W(c, o, a, 1); return a; } }));
ref("sprinkler", story2op({ n: 3, fn: (c, [h, d, o]) => { const a = G(c, "AND"), r = G(c, "OR"); W(c, h, a, 0); W(c, d, a, 1); W(c, a, r, 0); W(c, o, r, 1); return r; } }));
ref("elevator", story2op({ n: 3, fn: (c, [f, d, a]) => { const g = G(c, "AND"), o = G(c, "OR"); W(c, f, g, 0); W(c, d, g, 1); W(c, g, o, 0); W(c, a, o, 1); return o; } }));
ref("museum", story2op({ n: 4, fn: (c, [m, g, o, p]) => {
  const o1 = G(c, "OR"), o2 = G(c, "OR"), a = G(c, "AND");
  W(c, g, o1, 0); W(c, o, o1, 1); W(c, o1, o2, 0); W(c, p, o2, 1); W(c, m, a, 0); W(c, o2, a, 1); return a; } }));
ref("sump", story2op({ n: 3, fn: (c, [h, m, t]) => {
  const n = G(c, "NOT"), a = G(c, "AND"), o = G(c, "OR");
  W(c, m, n, 0); W(c, h, a, 0); W(c, n, a, 1); W(c, a, o, 0); W(c, t, o, 1); return o; } }));
ref("coop", story2op({ n: 3, fn: (c, [d, r, m]) => {
  const n = G(c, "NOT"), o = G(c, "OR"), a = G(c, "AND");
  W(c, r, n, 0); W(c, n, o, 0); W(c, m, o, 1); W(c, d, a, 0); W(c, o, a, 1); return a; } }));
ref("fridge", story2op({ n: 3, fn: (c, [d, n2, t]) => {
  const o = G(c, "OR"), a = G(c, "AND");
  W(c, n2, o, 0); W(c, t, o, 1); W(c, d, a, 0); W(c, o, a, 1); return a; } }));
ref("fire", story2op({ n: 3, fn: (c, [s, h, t]) => {
  const n = G(c, "NOT"), a = G(c, "AND"), o = G(c, "OR");
  W(c, t, n, 0); W(c, h, a, 0); W(c, n, a, 1); W(c, a, o, 0); W(c, s, o, 1); return o; } }));
ref("safe", story2op({ n: 3, fn: (c, [a, b, q]) => {
  const n = G(c, "NOT"), t1 = G(c, "AND"), t2 = G(c, "AND"), o = G(c, "OR");
  W(c, b, n, 0); W(c, a, t1, 0); W(c, b, t1, 1); W(c, q, t2, 0); W(c, n, t2, 1);
  W(c, t1, o, 0); W(c, t2, o, 1); return o; } }));
ref("buzz", story2op({ n: 4, fn: (c, [a, b, q, l]) => {
  const o1 = G(c, "OR"), o2 = G(c, "OR"), n = G(c, "NOT"), g = G(c, "AND");
  W(c, a, o1, 0); W(c, b, o1, 1); W(c, o1, o2, 0); W(c, q, o2, 1);
  W(c, l, n, 0); W(c, o2, g, 0); W(c, n, g, 1); return g; } }));
ref("veto", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 4, 1);
  const [A, B, C, V] = ins;
  const t1 = G(c, "AND"), t2 = G(c, "AND"), t3 = G(c, "AND");
  const o1 = G(c, "OR"), o2 = G(c, "OR"), n = G(c, "NOT"), y = G(c, "AND");
  W(c, A, t1, 0); W(c, B, t1, 1); W(c, A, t2, 0); W(c, C, t2, 1); W(c, B, t3, 0); W(c, C, t3, 1);
  W(c, t1, o1, 0); W(c, t2, o1, 1); W(c, o1, o2, 0); W(c, t3, o2, 1);
  W(c, V, n, 0); W(c, o2, y, 0); W(c, n, y, 1); W(c, y, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });

// F. routing
ref("demux12", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 2);
  const [D, S] = ins; const n = G(c, "NOT"), t0 = G(c, "AND"), t1 = G(c, "AND");
  W(c, S, n, 0); W(c, n, t0, 0); W(c, D, t0, 1); W(c, S, t1, 0); W(c, D, t1, 1);
  W(c, t0, outs[0], 0); W(c, t1, outs[1], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("enc42", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 4, 2);
  const o1 = G(c, "OR"), o0 = G(c, "OR");
  W(c, ins[0], o1, 0); W(c, ins[1], o1, 1); W(c, ins[0], o0, 0); W(c, ins[2], o0, 1);
  W(c, o1, outs[0], 0); W(c, o0, outs[1], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("prienc", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 4, 2);
  const [I3, I2, I1] = ins; const o1 = G(c, "OR"), n = G(c, "NOT"), t = G(c, "AND"), o0 = G(c, "OR");
  W(c, I3, o1, 0); W(c, I2, o1, 1); W(c, I2, n, 0); W(c, n, t, 0); W(c, I1, t, 1);
  W(c, I3, o0, 0); W(c, t, o0, 1); W(c, o1, outs[0], 0); W(c, o0, outs[1], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("dec24", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 4);
  const [A, B] = ins; const nA = G(c, "NOT"), nB = G(c, "NOT");
  W(c, A, nA, 0); W(c, B, nB, 0);
  const ms = [[nA, nB], [nA, B], [A, nB], [A, B]].map(([x, y]) => {
    const g = G(c, "AND");
    W(c, x, g, 0); W(c, y, g, 1); return g; });
  ms.forEach((g, i) => W(c, g, outs[i], 0));
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("mux41", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 6, 1);
  const [A, B, C, D, S1, S0] = ins;
  const n1 = G(c, "NOT"), n0 = G(c, "NOT"); W(c, S1, n1, 0); W(c, S0, n0, 0);
  const term = (x, y, d) => { const p = G(c, "AND"), g = G(c, "AND");
    W(c, x, p, 0); W(c, y, p, 1); W(c, p, g, 0); W(c, d, g, 1); return g; };
  const tA = term(n1, n0, A), tB = term(n1, S0, B), tC = term(S1, n0, C), tD = term(S1, S0, D);
  const o1 = G(c, "OR"), o2 = G(c, "OR"), y = G(c, "OR");
  W(c, tA, o1, 0); W(c, tB, o1, 1); W(c, tC, o2, 0); W(c, tD, o2, 1);
  W(c, o1, y, 0); W(c, o2, y, 1); W(c, y, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("crossbar", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 3, 2);
  const [A, B, S] = ins; const n = G(c, "NOT"); W(c, S, n, 0);
  const t0 = G(c, "AND"), t1 = G(c, "AND"), y0 = G(c, "OR");
  W(c, n, t0, 0); W(c, A, t0, 1); W(c, S, t1, 0); W(c, B, t1, 1);
  W(c, t0, y0, 0); W(c, t1, y0, 1);
  const u0 = G(c, "AND"), u1 = G(c, "AND"), y1 = G(c, "OR");
  W(c, n, u0, 0); W(c, B, u0, 1); W(c, S, u1, 0); W(c, A, u1, 1);
  W(c, u0, y1, 0); W(c, u1, y1, 1);
  W(c, y0, outs[0], 0); W(c, y1, outs[1], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("aoi", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 3, 1);
  const a = G(c, "AND"), o = G(c, "OR"), n = G(c, "NOT");
  W(c, ins[0], a, 0); W(c, ins[1], a, 1); W(c, a, o, 0); W(c, ins[2], o, 1);
  W(c, o, n, 0); W(c, n, outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("oai", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 3, 1);
  const o = G(c, "OR"), a = G(c, "AND"), n = G(c, "NOT");
  W(c, ins[0], o, 0); W(c, ins[1], o, 1); W(c, o, a, 0); W(c, ins[2], a, 1);
  W(c, a, n, 0); W(c, n, outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("dec24en", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 3, 4);
  const [A, B, E] = ins; const nA = G(c, "NOT"), nB = G(c, "NOT");
  W(c, A, nA, 0); W(c, B, nB, 0);
  [[nA, nB], [nA, B], [A, nB], [A, B]].forEach(([x, y], i) => {
    const m = G(c, "AND"), g = G(c, "AND");
    W(c, x, m, 0); W(c, y, m, 1); W(c, E, g, 0); W(c, m, g, 1); W(c, g, outs[i], 0); });
  return { circuit: c, inputIds: ins, outputIds: outs }; });

// G. arithmetic
ref("gt1", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  const n = G(c, "NOT"), g = G(c, "AND"); W(c, ins[1], n, 0); W(c, ins[0], g, 0); W(c, n, g, 1); W(c, g, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("lt1", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  const n = G(c, "NOT"), g = G(c, "AND"); W(c, ins[0], n, 0); W(c, n, g, 0); W(c, ins[1], g, 1); W(c, g, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("eq1b", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  const nA = G(c, "NOT"), nB = G(c, "NOT"), t1 = G(c, "AND"), t2 = G(c, "AND"), o = G(c, "OR");
  W(c, ins[0], nA, 0); W(c, ins[1], nB, 0);
  W(c, ins[0], t1, 0); W(c, ins[1], t1, 1); W(c, nA, t2, 0); W(c, nB, t2, 1);
  W(c, t1, o, 0); W(c, t2, o, 1); W(c, o, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("comp1", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 3);
  const [A, B] = ins; const nA = G(c, "NOT"), nB = G(c, "NOT");
  W(c, A, nA, 0); W(c, B, nB, 0);
  const gt = G(c, "AND"), lt = G(c, "AND"), eq = G(c, "XNOR");
  W(c, A, gt, 0); W(c, nB, gt, 1); W(c, nA, lt, 0); W(c, B, lt, 1);
  W(c, A, eq, 0); W(c, B, eq, 1);
  W(c, gt, outs[0], 0); W(c, eq, outs[1], 0); W(c, lt, outs[2], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("ha-noxor", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 2);
  W(c, xorClassic(c, ins[0], ins[1]), outs[0], 0);
  const a = G(c, "AND"); W(c, ins[0], a, 0); W(c, ins[1], a, 1); W(c, a, outs[1], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("halfsub", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 2);
  const [A, B] = ins; const x = G(c, "XOR"), n = G(c, "NOT"), a = G(c, "AND");
  W(c, A, x, 0); W(c, B, x, 1); W(c, A, n, 0); W(c, n, a, 0); W(c, B, a, 1);
  W(c, x, outs[0], 0); W(c, a, outs[1], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("fullsub", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 3, 2);
  const [A, B, Bin] = ins;
  const t = G(c, "XOR"), s = G(c, "XOR");
  const nA = G(c, "NOT"), b1 = G(c, "AND"), nt = G(c, "NOT"), b2 = G(c, "AND"), bo = G(c, "OR");
  W(c, A, t, 0); W(c, B, t, 1); W(c, t, s, 0); W(c, Bin, s, 1);
  W(c, A, nA, 0); W(c, nA, b1, 0); W(c, B, b1, 1);
  W(c, t, nt, 0); W(c, nt, b2, 0); W(c, Bin, b2, 1);
  W(c, b1, bo, 0); W(c, b2, bo, 1);
  W(c, s, outs[0], 0); W(c, bo, outs[1], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
function gt2build(mirror) {
  return () => { const c = createCircuit(); const { ins, outs } = terminals(c, 4, 1);
    const [a1, a0, b1, b0] = ins;
    const x = G(c, "XOR");
    W(c, a1, x, 0); W(c, b1, x, 1);
    const hiT = mirror ? b1 : a1, hiF = mirror ? a1 : b1;
    const loT = mirror ? b0 : a0, loF = mirror ? a0 : b0;
    const nHi = G(c, "NOT"), g1 = G(c, "AND"), eq = G(c, "NOT");
    const nLo = G(c, "NOT"), t = G(c, "AND"), g0 = G(c, "AND"), y = G(c, "OR");
    W(c, hiF, nHi, 0); W(c, hiT, g1, 0); W(c, nHi, g1, 1);
    W(c, x, eq, 0); W(c, loF, nLo, 0);
    W(c, eq, t, 0); W(c, loT, t, 1); W(c, t, g0, 0); W(c, nLo, g0, 1);
    W(c, g1, y, 0); W(c, g0, y, 1); W(c, y, outs[0], 0);
    return { circuit: c, inputIds: ins, outputIds: outs }; };
}
ref("gt2", gt2build(false)); ref("lt2", gt2build(true));
ref("eq3", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 6, 1);
  const xs = [0, 1, 2].map((i) => { const g = G(c, "XOR"); W(c, ins[i], g, 0); W(c, ins[i + 3], g, 1); return g; });
  const ns = xs.map((x) => { const g = G(c, "NOT"); W(c, x, g, 0); return g; });
  const t = G(c, "AND"), y = G(c, "AND");
  W(c, ns[0], t, 0); W(c, ns[1], t, 1); W(c, t, y, 0); W(c, ns[2], y, 1);
  W(c, y, outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("neg2", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 2);
  const x = G(c, "XOR"); W(c, ins[0], x, 0); W(c, ins[1], x, 1);
  W(c, x, outs[0], 0); W(c, ins[1], outs[1], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("cla1", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 3, 1);
  const [A, B, C0] = ins; const p = G(c, "XOR"), g = G(c, "AND"), t = G(c, "AND"), y = G(c, "OR");
  W(c, A, p, 0); W(c, B, p, 1); W(c, A, g, 0); W(c, B, g, 1);
  W(c, p, t, 0); W(c, C0, t, 1); W(c, g, y, 0); W(c, t, y, 1); W(c, y, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("inc4", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 4, 4);
  const [b3, b2, b1, b0] = ins;
  const n0 = G(c, "NOT"), s1 = G(c, "XOR"), t1 = G(c, "AND");
  const s2 = G(c, "XOR"), t2 = G(c, "AND"), s3 = G(c, "XOR");
  W(c, b0, n0, 0);
  W(c, b1, s1, 0); W(c, b0, s1, 1); W(c, b1, t1, 0); W(c, b0, t1, 1);
  W(c, b2, s2, 0); W(c, t1, s2, 1); W(c, t1, t2, 0); W(c, b2, t2, 1);
  W(c, b3, s3, 0); W(c, t2, s3, 1);
  W(c, s3, outs[0], 0); W(c, s2, outs[1], 0); W(c, s1, outs[2], 0); W(c, n0, outs[3], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("addsub2", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 4, 3);
  const [a1, a0, b1, b0] = ins;
  const d0 = G(c, "XOR"), na0 = G(c, "NOT"), bo0 = G(c, "AND");
  W(c, a0, d0, 0); W(c, b0, d0, 1); W(c, a0, na0, 0); W(c, na0, bo0, 0); W(c, b0, bo0, 1);
  const T = G(c, "XOR"), d1 = G(c, "XOR");
  const na1 = G(c, "NOT"), q1 = G(c, "AND"), nT = G(c, "NOT"), q2 = G(c, "AND"), bo1 = G(c, "OR");
  W(c, a1, T, 0); W(c, b1, T, 1); W(c, T, d1, 0); W(c, bo0, d1, 1);
  W(c, a1, na1, 0); W(c, na1, q1, 0); W(c, b1, q1, 1);
  W(c, T, nT, 0); W(c, nT, q2, 0); W(c, bo0, q2, 1);
  W(c, q1, bo1, 0); W(c, q2, bo1, 1);
  W(c, d1, outs[0], 0); W(c, d0, outs[1], 0); W(c, bo1, outs[2], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("mul2", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 4, 4);
  const [a1, a0, b1, b0] = ins;
  const p0 = G(c, "AND"), p1 = G(c, "AND"), p2 = G(c, "AND"), p3 = G(c, "AND");
  W(c, a0, p0, 0); W(c, b0, p0, 1); W(c, a1, p1, 0); W(c, b0, p1, 1);
  W(c, a0, p2, 0); W(c, b1, p2, 1); W(c, a1, p3, 0); W(c, b1, p3, 1);
  const m1 = G(c, "XOR"), c1 = G(c, "AND"), m2 = G(c, "XOR"), m3 = G(c, "AND");
  W(c, p1, m1, 0); W(c, p2, m1, 1); W(c, p1, c1, 0); W(c, p2, c1, 1);
  W(c, p3, m2, 0); W(c, c1, m2, 1); W(c, p3, m3, 0); W(c, c1, m3, 1);
  W(c, m3, outs[0], 0); W(c, m2, outs[1], 0); W(c, m1, outs[2], 0); W(c, p0, outs[3], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
function faBlock(c, A, B, Cin) {
  const t = G(c, "XOR"), s = G(c, "XOR"), c1 = G(c, "AND"), c2 = G(c, "AND"), co = G(c, "OR");
  W(c, A, t, 0); W(c, B, t, 1); W(c, t, s, 0); W(c, Cin, s, 1);
  W(c, A, c1, 0); W(c, B, c1, 1); W(c, t, c2, 0); W(c, Cin, c2, 1);
  W(c, c1, co, 0); W(c, c2, co, 1);
  return { s, co };
}
ref("add3s", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 6, 4);
  const [a2, a1, a0, b2, b1, b0] = ins;
  const s0 = G(c, "XOR"), c0 = G(c, "AND");
  W(c, a0, s0, 0); W(c, b0, s0, 1); W(c, a0, c0, 0); W(c, b0, c0, 1);
  const r1 = faBlock(c, a1, b1, c0), r2 = faBlock(c, a2, b2, r1.co);
  W(c, r2.s, outs[0], 0); W(c, r1.s, outs[1], 0); W(c, s0, outs[2], 0); W(c, r2.co, outs[3], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });

// H. codes
ref("gray2", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 2);
  const x = G(c, "XOR"); W(c, ins[0], x, 0); W(c, ins[1], x, 1);
  W(c, ins[0], outs[0], 0); W(c, x, outs[1], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("gray3", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 3, 3);
  const x1 = G(c, "XOR"), x0 = G(c, "XOR");
  W(c, ins[0], x1, 0); W(c, ins[1], x1, 1); W(c, ins[1], x0, 0); W(c, ins[2], x0, 1);
  W(c, ins[0], outs[0], 0); W(c, x1, outs[1], 0); W(c, x0, outs[2], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("even3", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 3, 1);
  const x1 = G(c, "XOR"), x2 = G(c, "XOR"), n = G(c, "NOT");
  W(c, ins[0], x1, 0); W(c, ins[1], x1, 1); W(c, x1, x2, 0); W(c, ins[2], x2, 1);
  W(c, x2, n, 0); W(c, n, outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("xnor4chain", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 4, 1);
  const x1 = G(c, "XNOR"), x2 = G(c, "XNOR"), x3 = G(c, "XNOR");
  W(c, ins[0], x1, 0); W(c, ins[1], x1, 1); W(c, x1, x2, 0); W(c, ins[2], x2, 1);
  W(c, x2, x3, 0); W(c, ins[3], x3, 1); W(c, x3, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("busparity", xorChain(5));
ref("onehot3", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 3, 1);
  const [A, B, C] = ins;
  const x1 = G(c, "XOR"), p = G(c, "XOR");
  W(c, A, x1, 0); W(c, B, x1, 1); W(c, x1, p, 0); W(c, C, p, 1);
  const t1 = G(c, "AND"), t2 = G(c, "AND"), t3 = G(c, "AND");
  W(c, A, t1, 0); W(c, B, t1, 1); W(c, A, t2, 0); W(c, C, t2, 1); W(c, B, t3, 0); W(c, C, t3, 1);
  const o1 = G(c, "OR"), o2 = G(c, "OR"), n = G(c, "NOT"), y = G(c, "AND");
  W(c, t1, o1, 0); W(c, t2, o1, 1); W(c, o1, o2, 0); W(c, t3, o2, 1);
  W(c, o2, n, 0); W(c, p, y, 0); W(c, n, y, 1); W(c, y, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("zero4", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 4, 1);
  const o1 = G(c, "OR"), o2 = G(c, "OR"), o3 = G(c, "OR"), n = G(c, "NOT");
  W(c, ins[0], o1, 0); W(c, ins[1], o1, 1); W(c, ins[2], o2, 0); W(c, ins[3], o2, 1);
  W(c, o1, o3, 0); W(c, o2, o3, 1); W(c, o3, n, 0); W(c, n, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("allone4", andTree(4));
for (const seg of ["a", "b", "c", "d", "e", "f", "g"]) {
  ref(`seg-${seg}`, () => {
    const c = createCircuit(); const { ins, outs } = terminals(c, 4, 1);
    const level = LEVELS_PACK2.find((l) => l.id === `seg-${seg}`);
    buildSOP(c, { w: ins[0], x: ins[1], y: ins[2], z: ins[3] }, level.cover, outs[0]);
    return { circuit: c, inputIds: ins, outputIds: outs };
  });
}

// I. debug ward — reference = the fixed circuit
ref("dbg-not", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 1, 1);
  const g = G(c, "NOT"); W(c, ins[0], g, 0); W(c, g, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("dbg-swap", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  const g = G(c, "OR"); W(c, ins[0], g, 0); W(c, ins[1], g, 1); W(c, g, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("dbg-notmiss", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  W(c, xorClassic(c, ins[0], ins[1]), outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("dbg-tied", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  const g = G(c, "AND"); W(c, ins[0], g, 0); W(c, ins[1], g, 1); W(c, g, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("dbg-carry", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 2);
  const x = G(c, "XOR"), a = G(c, "AND");
  W(c, ins[0], x, 0); W(c, ins[1], x, 1); W(c, ins[0], a, 0); W(c, ins[1], a, 1);
  W(c, x, outs[0], 0); W(c, a, outs[1], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("dbg-nandx", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 1);
  W(c, xorNand(c, ins[0], ins[1]), outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("dbg-maj", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 3, 1);
  const [A, B, C] = ins;
  const t1 = G(c, "AND"), t2 = G(c, "AND"), t3 = G(c, "AND");
  const o1 = G(c, "OR"), o2 = G(c, "OR");
  W(c, A, t1, 0); W(c, B, t1, 1); W(c, A, t2, 0); W(c, C, t2, 1); W(c, B, t3, 0); W(c, C, t3, 1);
  W(c, t1, o1, 0); W(c, t2, o1, 1); W(c, o1, o2, 0); W(c, t3, o2, 1);
  W(c, o2, outs[0], 0); return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("dbg-muxsel", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 3, 1);
  const [A, B, S] = ins; const n = G(c, "NOT");
  const t1 = G(c, "AND"), t2 = G(c, "AND"), o = G(c, "OR");
  W(c, S, n, 0); W(c, n, t1, 0); W(c, A, t1, 1); W(c, S, t2, 0); W(c, B, t2, 1);
  W(c, t1, o, 0); W(c, t2, o, 1); W(c, o, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("dbg-dec", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 2, 4);
  const [A, B] = ins; const nA = G(c, "NOT"), nB = G(c, "NOT");
  W(c, A, nA, 0); W(c, B, nB, 0);
  [[nA, nB], [nA, B], [A, nB], [A, B]].forEach(([x, y], i) => {
    const g = G(c, "AND"); W(c, x, g, 0); W(c, y, g, 1); W(c, g, outs[i], 0); });
  return { circuit: c, inputIds: ins, outputIds: outs }; });
ref("dbg-par", () => { const c = createCircuit(); const { ins, outs } = terminals(c, 4, 1);
  const x1 = G(c, "XOR"), x2 = G(c, "XOR"), x3 = G(c, "XOR");
  W(c, ins[0], x1, 0); W(c, ins[1], x1, 1); W(c, x1, x2, 0); W(c, ins[2], x2, 1);
  W(c, x2, x3, 0); W(c, ins[3], x3, 1); W(c, x3, outs[0], 0);
  return { circuit: c, inputIds: ins, outputIds: outs }; });

describe("pack2 catalogue", () => {
  it("has exactly 100 levels with sane tables and budgets", () => {
    assert.equal(LEVELS_PACK2.length, 100);
    const ids = new Set();
    for (const l of LEVELS_PACK2) {
      assert.ok(l.id && l.name && l.briefing && l.chapter, l.id);
      assert.ok(!ids.has(l.id), `duplicate ${l.id}`);
      ids.add(l.id);
      assert.ok(l.tests.length >= 2, `${l.id} needs tests`);
      for (const t of l.tests) {
        assert.equal(t.in.length, l.inputs.length, `${l.id} test input width`);
        assert.equal(t.out.length, l.outputs.length, `${l.id} test output width`);
      }
      for (const [type, n] of Object.entries(l.allowed)) assert.ok(n > 0, `${l.id} budget ${type}`);
      assert.ok(l.par >= 1 && l.par <= 14, `${l.id} par range`);
      if (l.prefill) {
        for (const n of l.prefill.nodes) assert.ok(n.key && n.type, `${l.id} prefill node`);
      }
    }
  });

  it("every pack2 level is solvable within budget at par", () => {
    assert.equal(Object.keys(R).length, 100);
    for (const level of LEVELS_PACK2) {
      assert.ok(R[level.id], `missing reference for ${level.id}`);
      const { circuit, inputIds, outputIds } = R[level.id]();
      const used = {};
      for (const n of Object.values(circuit.nodes)) {
        if (n.type === "INPUT" || n.type === "OUTPUT") continue;
        used[n.type] = (used[n.type] ?? 0) + 1;
      }
      for (const [type, n] of Object.entries(used)) {
        assert.ok((level.allowed[type] ?? 0) >= n,
          `${level.id}: uses ${n}x ${type}, budget ${level.allowed[type] ?? 0}`);
      }
      const gates = countGates(circuit);
      const { passed, results } = evaluateLevel(circuit, level, inputIds, outputIds);
      assert.equal(passed, true,
        `${level.id} reference failed: ${JSON.stringify(results.filter((r) => !r.ok))}`);
      assert.ok(gates <= level.par, `${level.id}: uses ${gates} gates, par ${level.par}`);
      assert.equal(starsFor(level, gates), 3);
    }
  });
});
