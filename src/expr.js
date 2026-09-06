/**
 * Boolean expression sublanguage: parse, evaluate, tabulate.
 *
 * Grammar (ASCII-first, ¬∧∨⊕ and && || accepted as aliases):
 *   expr    := or
 *   or      := xor (("|" | "||" | "∨") xor)*
 *   xor     := and (("^" | "⊕") and)*
 *   and     := unary (("&" | "&&" | "∧") unary)*
 *   unary   := ("~" | "!" | "¬") unary | primary
 *   primary := NAME | "0" | "1" | "(" expr ")"
 *   NAME    := [A-Za-z][A-Za-z0-9_]*
 */
import { allCombos } from "./engine.js";
import { minimize } from "./minimize.js";

export class ExprError extends Error {
  constructor(message, index) {
    super(`${message} at index ${index}`);
    this.name = "ExprError";
    this.index = index;
  }
}

function tokenize(str) {
  const toks = [];
  let i = 0;
  const push = (kind, value, index) => toks.push({ kind, value, index });
  while (i < str.length) {
    const ch = str[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (str.startsWith("&&", i)) { push("and", "&&", i); i += 2; continue; }
    if (str.startsWith("||", i)) { push("or", "||", i); i += 2; continue; }
    if ("&∧".includes(ch)) { push("and", ch, i); i++; continue; }
    if ("|∨".includes(ch)) { push("or", ch, i); i++; continue; }
    if ("^⊕".includes(ch)) { push("xor", ch, i); i++; continue; }
    if ("~!¬".includes(ch)) { push("not", ch, i); i++; continue; }
    if (ch === "(") { push("lparen", ch, i); i++; continue; }
    if (ch === ")") { push("rparen", ch, i); i++; continue; }
    if (ch === "0" || ch === "1") { push("const", ch === "1" ? 1 : 0, i); i++; continue; }
    const m = /^[A-Za-z][A-Za-z0-9_]*/.exec(str.slice(i));
    if (m) { push("name", m[0], i); i += m[0].length; continue; }
    throw new ExprError(`unexpected character '${ch}'`, i);
  }
  push("eof", null, i);
  return toks;
}

/** Parse an expression string into an AST. Throws ExprError. */
export function parseExpr(str) {
  if (!str || !str.trim()) throw new ExprError("empty expression", 0);
  const toks = tokenize(str);
  let pos = 0;
  const peek = () => toks[pos];
  const eat = (kind) => {
    const t = toks[pos];
    if (t.kind !== kind) throw new ExprError(`expected ${kind}, found ${t.kind}`, t.index);
    pos++;
    return t;
  };
  const parseOr = () => {
    let left = parseXor();
    while (peek().kind === "or") { pos++; const right = parseXor(); left = { t: "or", a: left, b: right }; }
    return left;
  };
  const parseXor = () => {
    let left = parseAnd();
    while (peek().kind === "xor") { pos++; const right = parseAnd(); left = { t: "xor", a: left, b: right }; }
    return left;
  };
  const parseAnd = () => {
    let left = parseUnary();
    while (peek().kind === "and") { pos++; const right = parseUnary(); left = { t: "and", a: left, b: right }; }
    return left;
  };
  const parseUnary = () => {
    if (peek().kind === "not") { pos++; return { t: "not", x: parseUnary() }; }
    return parsePrimary();
  };
  const parsePrimary = () => {
    const t = peek();
    if (t.kind === "lparen") { pos++; const e = parseOr(); eat("rparen"); return e; }
    if (t.kind === "const") { pos++; return { t: "const", v: t.value }; }
    if (t.kind === "name") { pos++; return { t: "var", name: t.value }; }
    throw new ExprError(`expected variable, constant or '('`, t.index);
  };
  const ast = parseOr();
  if (peek().kind !== "eof") throw new ExprError(`unexpected trailing input`, peek().index);
  return ast;
}

/** Evaluate an AST under env: Record<name, 0|1>. Unknown vars read as 0. */
export function evalExpr(ast, env = {}) {
  switch (ast.t) {
    case "const": return ast.v ? 1 : 0;
    case "var": return env[ast.name] ? 1 : 0;
    case "not": return evalExpr(ast.x, env) ? 0 : 1;
    case "and": return evalExpr(ast.a, env) & evalExpr(ast.b, env) ? 1 : 0;
    case "or": return evalExpr(ast.a, env) | evalExpr(ast.b, env) ? 1 : 0;
    case "xor": return evalExpr(ast.a, env) ^ evalExpr(ast.b, env) ? 1 : 0;
    default: throw new Error(`evalExpr: unknown node ${ast.t}`);
  }
}

/** Sorted unique variable names in an AST. */
export function exprVars(ast, into = new Set()) {
  if (ast.t === "var") into.add(ast.name);
  else {
    if (ast.x) exprVars(ast.x, into);
    if (ast.a) exprVars(ast.a, into);
    if (ast.b) exprVars(ast.b, into);
  }
  return [...into].sort();
}

/** Exhaustive [{in, out}] tests for an AST (varOrder[0] = MSB). */
export function exprToTests(ast, varOrder = exprVars(ast)) {
  if (varOrder.length > 8) throw new Error("exprToTests: max 8 vars (256 rows)");
  return allCombos(varOrder.length).map((row) => {
    const env = Object.fromEntries(varOrder.map((v, i) => [v, row[i]]));
    return { in: row, out: [evalExpr(ast, env)] };
  });
}

/** Minimized cover ([[[var, polarity]]]) for an AST. */
export function exprToCover(ast, varOrder = exprVars(ast)) {
  if (varOrder.length > 6) throw new Error("exprToCover: max 6 vars");
  const on = [];
  for (const row of allCombos(varOrder.length)) {
    const env = Object.fromEntries(varOrder.map((v, i) => [v, row[i]]));
    if (evalExpr(ast, env)) on.push(parseInt(row.join(""), 2));
  }
  return minimize({ on, dc: [], vars: varOrder });
}
