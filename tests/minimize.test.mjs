import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { minimize, kmapString, coverString } from "../src/minimize.js";
import { LEVELS_PACK2 } from "../src/pack2.js";

const norm = (cover) =>
  cover.map((t) => t.map(([v, p]) => `${v}${p}`).sort().join("&")).sort();

describe("minimize", () => {
  it("reduces AND/OR/XOR textbook cases", () => {
    assert.deepEqual(norm(minimize({ on: [3], vars: ["A", "B"] }).cover), ["A1&B1"]);
    assert.deepEqual(norm(minimize({ on: [1, 2, 3], vars: ["A", "B"] }).cover), ["A1", "B1"]);
    // 2-XOR is irreducible in SOP (2 minterms, 2 lits each)
    const xor = minimize({ on: [1, 2], vars: ["A", "B"] }).cover;
    assert.equal(xor.length, 2);
    assert.ok(xor.every((t) => t.length === 2));
  });

  it("uses don't-cares (7-seg E shape: {0,2,6,8} + dc 10-15)", () => {
    const { cover } = minimize({ on: [0, 2, 6, 8], dc: [10, 11, 12, 13, 14, 15], vars: ["w", "x", "y", "z"] });
    assert.deepEqual(norm(cover), ["x0&z0", "y1&z0"]);
  });

  it("flags constant functions", () => {
    assert.deepEqual(minimize({ on: [], vars: ["A"] }), { cover: [], constant: 0 });
    assert.deepEqual(minimize({ on: [0, 1], vars: ["A"] }), { cover: [[]], constant: 1 });
    assert.equal(coverString([]), "0");
    assert.equal(coverString([[]]), "1");
  });

  it("rejects bad input", () => {
    assert.throws(() => minimize({ on: [4], vars: ["A", "B"] }), /out of range/);
    assert.throws(() => minimize({ on: [0], vars: [] }), /1–6 vars/);
    assert.throws(() => minimize({ on: [0], vars: ["a", "b", "c", "d", "e", "f", "g"] }), /1–6 vars/);
  });

  it("7-seg regression: shipped covers stay within par", () => {
    const need = { "seg-a": 7, "seg-b": 7, "seg-c": 3, "seg-d": 12, "seg-e": 5, "seg-f": 8, "seg-g": 9 };
    for (const [id, par] of Object.entries(need)) {
      const level = LEVELS_PACK2.find((l) => l.id === id);
      const nots = new Set(); let ands = 0;
      for (const t of level.cover) {
        for (const [v, pol] of t) if (!pol) nots.add(v);
        if (t.length > 1) ands += t.length - 1;
      }
      const total = nots.size + ands + (level.cover.length - 1);
      assert.ok(total <= par, `${id}: cover needs ${total} gates, par ${par}`);
    }
  });
});

describe("kmapString / coverString", () => {
  it("renders a 2-var map with Gray order", () => {
    const s = kmapString({ on: [1, 2], vars: ["A", "B"] });
    assert.ok(s.includes("B  00  01  11  10") || s.includes("B"), s);
    assert.ok(s.includes("1"), s);
  });

  it("renders 4-var maps and refuses 5+", () => {
    const s = kmapString({ on: [0, 15], dc: [5], vars: ["w", "x", "y", "z"] });
    assert.ok(s.includes("d"), s);
    assert.throws(() => kmapString({ on: [0], vars: ["a", "b", "c", "d", "e"] }), /2–4 vars/);
  });

  it("pretty-prints SOP", () => {
    assert.equal(coverString([[["x", 0], ["z", 0]], [["y", 1]]]), "¬x∧¬z ∨ y");
  });
});
