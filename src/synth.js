/**
 * Circuit synthesis: build engine circuits from minimized covers or
 * boolean expressions, in AND-OR-NOT, NAND-only, or NOR-only families.
 */
import { addNode, addWire } from "./engine.js";
import { parseExpr, exprToCover } from "./expr.js";

function wire(c, from, to, toPin = 0) {
  const r = addWire(c, from, to, toPin, 0);
  if (!r.ok) throw new Error(`synth wire ${from}->${to}:${toPin}: ${r.error}`);
  return r.wire;
}
function gate(c, type) {
  return addNode(c, type, 0, 0).id;
}

/**
 * Wire a sum-of-products cover ([[[var, polarity]]]) with shared NOTs.
 * Throws on constant-0 covers and constant-1 terms (no VCC/GND terminals).
 */
export function buildSOP(circuit, insByVar, cover, outId) {
  if (cover.length === 0) throw new Error("buildSOP: constant-0 cover needs no circuit (wire nothing)");
  const notFor = {};
  for (const t of cover) {
    if (t.length === 0) throw new Error("buildSOP: constant-1 term needs VCC (unsupported)");
    for (const [v, pol] of t) {
      if (!pol && !notFor[v]) {
        const g = gate(circuit, "NOT");
        wire(circuit, need(insByVar, v), g, 0);
        notFor[v] = g;
      }
    }
  }
  const terms = cover.map((t) => {
    const srcs = t.map(([v, pol]) => (pol ? need(insByVar, v) : notFor[v]));
    let cur = srcs[0];
    for (let i = 1; i < srcs.length; i++) {
      const g = gate(circuit, "AND");
      wire(circuit, cur, g, 0); wire(circuit, srcs[i], g, 1);
      cur = g;
    }
    return cur;
  });
  let out = terms[0];
  for (let i = 1; i < terms.length; i++) {
    const g = gate(circuit, "OR");
    wire(circuit, out, g, 0); wire(circuit, terms[i], g, 1);
    out = g;
  }
  wire(circuit, out, outId, 0);
}
function need(insByVar, v) {
  if (!(v in insByVar)) throw new Error(`buildSOP: unknown variable '${v}'`);
  return insByVar[v];
}

/** Gate estimate for a cover: m-lit term → m−1 ANDs, shared NOTs. */
export function estimateGates(cover) {
  const nots = new Set();
  let ands = 0;
  for (const t of cover) {
    for (const [v, pol] of t) if (!pol) nots.add(v);
    if (t.length > 1) ands += t.length - 1;
  }
  const ors = Math.max(0, cover.length - 1);
  return { NOT: nots.size, AND: ands, OR: ors, total: nots.size + ands + ors };
}

// ---- single-family gate constructors (De Morgan tech-mapping) ----
function tied(c, type, x) {
  const g = gate(c, type);
  wire(c, x, g, 0); wire(c, x, g, 1);
  return g;
}
function xorNand(c, A, B) {
  const d = gate(c, "NAND"), e = gate(c, "NAND"), f = gate(c, "NAND"), y = gate(c, "NAND");
  wire(c, A, d, 0); wire(c, B, d, 1);
  wire(c, A, e, 0); wire(c, d, e, 1);
  wire(c, B, f, 0); wire(c, d, f, 1);
  wire(c, e, y, 0); wire(c, f, y, 1);
  return y;
}
function xorNor(c, A, B) {
  const nA = tied(c, "NOR", A), nB = tied(c, "NOR", B);
  const t1 = gate(c, "NOR"), t2 = gate(c, "NOR"), p = gate(c, "NOR"), y = gate(c, "NOR");
  wire(c, nA, t1, 0); wire(c, B, t1, 1);
  wire(c, A, t2, 0); wire(c, nB, t2, 1);
  wire(c, t1, p, 0); wire(c, t2, p, 1);
  wire(c, p, y, 0); wire(c, p, y, 1);
  return y;
}
const FAMILY = {
  aon: {
    not: (c, x) => { const g = gate(c, "NOT"); wire(c, x, g, 0); return g; },
    and: (c, x, y) => { const g = gate(c, "AND"); wire(c, x, g, 0); wire(c, y, g, 1); return g; },
    or: (c, x, y) => { const g = gate(c, "OR"); wire(c, x, g, 0); wire(c, y, g, 1); return g; },
    xor: (c, x, y) => { const g = gate(c, "XOR"); wire(c, x, g, 0); wire(c, y, g, 1); return g; },
  },
  nand: {
    not: (c, x) => tied(c, "NAND", x),
    and: (c, x, y) => { const t = gate(c, "NAND"); wire(c, x, t, 0); wire(c, y, t, 1); return tied(c, "NAND", t); },
    or: (c, x, y) => { const nx = tied(c, "NAND", x), ny = tied(c, "NAND", y);
      const t = gate(c, "NAND"); wire(c, nx, t, 0); wire(c, ny, t, 1); return t; },
    xor: xorNand,
  },
  nor: {
    not: (c, x) => tied(c, "NOR", x),
    or: (c, x, y) => { const t = gate(c, "NOR"); wire(c, x, t, 0); wire(c, y, t, 1); return tied(c, "NOR", t); },
    and: (c, x, y) => { const nx = tied(c, "NOR", x), ny = tied(c, "NOR", y);
      const t = gate(c, "NOR"); wire(c, nx, t, 0); wire(c, ny, t, 1); return t; },
    xor: xorNor,
  },
};

/**
 * Compile an expression string straight into a circuit (structure-preserving,
 * no minimization) in one gate family. Returns the output node id.
 */
export function compileExpr(circuit, exprStr, insByVar, outId, { target = "aon" } = {}) {
  const fam = FAMILY[target];
  if (!fam) throw new Error(`compileExpr: unknown target '${target}' (aon|nand|nor)`);
  const build = (ast) => {
    switch (ast.t) {
      case "var":
        if (!(ast.name in insByVar)) throw new Error(`compileExpr: unknown variable '${ast.name}'`);
        return insByVar[ast.name];
      case "const":
        throw new Error("compileExpr: constants need VCC/GND (unsupported)");
      case "not": return fam.not(circuit, build(ast.x));
      case "and": return fam.and(circuit, build(ast.a), build(ast.b));
      case "or": return fam.or(circuit, build(ast.a), build(ast.b));
      case "xor": return fam.xor(circuit, build(ast.a), build(ast.b));
      default: throw new Error(`compileExpr: unknown node ${ast.t}`);
    }
  };
  const out = build(parseExpr(exprStr));
  wire(circuit, out, outId, 0);
  return out;
}

/** Minimize an expression, then build the SOP. Returns { cover, estimate }. */
export function compileMinimized(circuit, exprStr, insByVar, outId, varOrder) {
  const ast = parseExpr(exprStr);
  const vars = varOrder ?? [...Object.keys(insByVar)].sort();
  const { cover, constant } = exprToCover(ast, vars);
  if (constant === 0) throw new Error("compileMinimized: constant-0 function (nothing to build)");
  buildSOP(circuit, insByVar, cover, outId);
  return { cover, estimate: estimateGates(cover) };
}

// ---------- circuit -> expression (player-facing "expression view") ----------

// Precedence mirrors src/expr.js: NOT > AND > XOR > OR.
const PREC = { or: 1, xor: 2, and: 3, not: 4, atom: 5 };
const paren = (s, childPrec, opPrec) => (childPrec < opPrec ? `(${s})` : s);

/**
 * Derive the boolean expression driving a node by walking backwards.
 * INPUTs render as their names, unconnected pins as 0, loops as ⟳.
 * Returns { text, prec }. Pure (reads circuit only).
 */
export function circuitExpr(circuit, nodeId, names = {}, path = new Set()) {
  const n = circuit.nodes[nodeId];
  if (!n) return { text: "?", prec: PREC.atom };
  if (n.type === "INPUT") return { text: names[nodeId] ?? n.name ?? nodeId, prec: PREC.atom };
  if (path.has(nodeId)) return { text: "⟳", prec: PREC.atom };
  path.add(nodeId);
  const feed = (pin) => {
    const w = Object.values(circuit.wires).find((x) => x.to === nodeId && x.toPin === pin);
    return w ? circuitExpr(circuit, w.from, names, path) : { text: "0", prec: PREC.atom };
  };
  const bin = (sym, prec) => {
    const l = feed(0), r = feed(1);
    return { text: `${paren(l.text, l.prec, prec)} ${sym} ${paren(r.text, r.prec, prec)}`, prec };
  };
  const neg = (sym) => {
    const l = feed(0), r = feed(1);
    return { text: `¬(${l.text} ${sym} ${r.text})`, prec: PREC.not };
  };
  let out;
  switch (n.type) {
    case "OUTPUT": out = feed(0); break;
    case "NOT": {
      const v = feed(0);
      out = v.prec < PREC.not
        ? { text: `¬(${v.text})`, prec: PREC.not }
        : { text: `¬${v.text}`, prec: PREC.not };
      break;
    }
    case "AND": out = bin("∧", PREC.and); break;
    case "OR": out = bin("∨", PREC.or); break;
    case "XOR": out = bin("⊕", PREC.xor); break;
    case "NAND": out = neg("∧"); break;
    case "NOR": out = neg("∨"); break;
    case "XNOR": out = neg("⊕"); break;
    default: out = { text: "?", prec: PREC.atom };
  }
  path.delete(nodeId);
  return out;
}

/** { outputName: expression } for every output terminal. */
export function outputExprs(circuit, outputIds, names = {}) {
  const result = {};
  for (const id of outputIds) {
    const node = circuit.nodes[id];
    result[names[id] ?? node?.name ?? id] = circuitExpr(circuit, id, names).text;
  }
  return result;
}
