#!/usr/bin/env node
/**
 * kmap.mjs — level-authoring CLI: K-map, minimization, cover JSON, estimate.
 *
 *   node scripts/kmap.mjs --on 0,2,3,5,6,7,8,9 --dc 10-15 --vars w,x,y,z
 *   node scripts/kmap.mjs --expr "(~x & ~z) | y" --vars w,x,y,z
 */
import { parseExpr, exprVars, exprToTests } from "../src/expr.js";
import { minimize, kmapString, coverString } from "../src/minimize.js";
import { estimateGates } from "../src/synth.js";

function usage() {
  return `usage:
  node scripts/kmap.mjs --on 0,2,3 --dc 10-15 --vars w,x,y,z
  node scripts/kmap.mjs --expr "(~x & ~z) | y" [--vars w,x,y,z]

options:
  --on    minterms where output is 1 (comma list, ranges a-b allowed)
  --dc    don't-care minterms (same format, default none)
  --vars  comma variable names, first = MSB (required with --on;
          inferred alphabetically with --expr unless given)
  --expr  boolean expression (~ ! & && | || ^, parens, 0/1, unicode ¬∧∨⊕)
  --help  this text`;
}

function parseNums(spec) {
  const out = [];
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d+)-(\d+)$/.exec(part);
    if (m) {
      const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
      if (a > b) throw new Error(`bad range '${part}'`);
      for (let i = a; i <= b; i++) out.push(i);
    } else if (/^\d+$/.test(part)) {
      out.push(parseInt(part, 10));
    } else {
      throw new Error(`bad minterm '${part}'`);
    }
  }
  return [...new Set(out)].sort((x, y) => x - y);
}

function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") { console.log(usage()); return; }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
      args[key] = val;
    } else {
      throw new Error(`unexpected argument '${a}' (see --help)`);
    }
  }

  let vars, on;
  if (args.expr) {
    const ast = parseExpr(args.expr);
    vars = args.vars ? args.vars.split(",").map((s) => s.trim()).filter(Boolean) : exprVars(ast);
    on = exprToTests(ast, vars).filter((t) => t.out[0] === 1)
      .map((t) => parseInt(t.in.join(""), 2));
    console.log(`expr : ${args.expr}`);
  } else if (args.on) {
    if (!args.vars) throw new Error("--vars is required with --on");
    vars = args.vars.split(",").map((s) => s.trim()).filter(Boolean);
    on = parseNums(args.on);
  } else {
    throw new Error("need --expr or --on (see --help)");
  }
  if (vars.length < 1 || vars.length > 6) throw new Error("need 1–6 vars");
  const dc = args.dc ? parseNums(args.dc) : [];

  const { cover, constant } = minimize({ on, dc, vars });
  const est = estimateGates(cover);

  if (vars.length >= 2 && vars.length <= 4) {
    console.log(`vars : ${vars.join(",")}   (1 = on, d = don't-care)`);
    console.log(kmapString({ on, dc, vars }));
    console.log("");
  }
  console.log(`min  : Y = ${coverString(cover)}${constant !== null ? `   [constant-${constant}]` : ""}`);
  console.log(`cover: ${JSON.stringify(cover)}`);
  console.log(`gates: NOT×${est.NOT} AND×${est.AND} OR×${est.OR} = ${est.total} (suggested allowed/par)`);
}

try {
  main(process.argv.slice(2));
} catch (e) {
  console.error(`kmap: ${e.message}`);
  process.exit(1);
}
