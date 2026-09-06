import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseExpr, evalExpr, exprVars, exprToTests, exprToCover, ExprError } from "../src/expr.js";

describe("parseExpr", () => {
  it("parses precedence: NOT > AND > XOR > OR", () => {
    assert.deepEqual(parseExpr("A|B&C"), {
      t: "or", a: { t: "var", name: "A" },
      b: { t: "and", a: { t: "var", name: "B" }, b: { t: "var", name: "C" } },
    });
    assert.deepEqual(parseExpr("~A&B"), {
      t: "and", a: { t: "not", x: { t: "var", name: "A" } }, b: { t: "var", name: "B" },
    });
    assert.deepEqual(parseExpr("A^B&C|D"), {
      t: "or",
      a: { t: "xor", a: { t: "var", name: "A" }, b: { t: "and", a: { t: "var", name: "B" }, b: { t: "var", name: "C" } } },
      b: { t: "var", name: "D" },
    });
  });

  it("accepts aliases, constants, parens, multi-char names", () => {
    assert.deepEqual(parseExpr("A && B"), parseExpr("A&B"));
    assert.deepEqual(parseExpr("A || B"), parseExpr("A|B"));
    assert.deepEqual(parseExpr("¬A∧B∨C⊕D"), parseExpr("~A&B|C^D"));
    assert.deepEqual(parseExpr("(A)"), { t: "var", name: "A" });
    assert.deepEqual(parseExpr("S1 & 1"), {
      t: "and", a: { t: "var", name: "S1" }, b: { t: "const", v: 1 },
    });
    assert.deepEqual(parseExpr("~~A"), { t: "not", x: { t: "not", x: { t: "var", name: "A" } } });
  });

  it("throws ExprError with position on bad input", () => {
    for (const bad of ["", "   ", "A&", "&A", "A B", "(A", "A)", "A||", "3A"]) {
      assert.throws(() => parseExpr(bad), ExprError, JSON.stringify(bad));
    }
    try { parseExpr("A&"); assert.fail("should throw"); }
    catch (e) { assert.equal(e.index, 2); }
  });
});

describe("evalExpr / exprVars / exprToTests", () => {
  it("evaluates IMPLY and unknown vars read as 0", () => {
    const ast = parseExpr("~A|B");
    assert.equal(evalExpr(ast, { A: 1, B: 0 }), 0);
    assert.equal(evalExpr(ast, { A: 1, B: 1 }), 1);
    assert.equal(evalExpr(ast, {}), 1);
  });

  it("lists sorted unique vars", () => {
    assert.deepEqual(exprVars(parseExpr("C1 & A | C1 ^ b2")), ["A", "C1", "b2"]);
  });

  it("tabulates XOR correctly", () => {
    assert.deepEqual(exprToTests(parseExpr("A^B"), ["A", "B"]), [
      { in: [0, 0], out: [0] }, { in: [0, 1], out: [1] },
      { in: [1, 0], out: [1] }, { in: [1, 1], out: [0] },
    ]);
  });

  it("derives a minimal cover for AND", () => {
    const { cover } = exprToCover(parseExpr("A&B"), ["A", "B"]);
    assert.deepEqual(cover, [[["A", 1], ["B", 1]]]);
  });
});
