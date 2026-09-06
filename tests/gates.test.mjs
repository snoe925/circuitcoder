import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gateSVG, GATE_ART_HEIGHT } from "../src/gates.js";

const ALL = ["AND", "OR", "NOT", "NAND", "NOR", "XOR", "XNOR"];

describe("gateSVG", () => {
  it("renders an SVG sized to the node box for every gate", () => {
    for (const t of ALL) {
      const svg = gateSVG(t);
      const h = GATE_ART_HEIGHT[t];
      assert.match(svg, /<svg class="gate"/);
      assert.ok(svg.includes(`viewBox="0 0 92 ${h}"`), `${t} viewBox`);
    }
    assert.equal(GATE_ART_HEIGHT.NOT, 52);
  });

  it("output leads reach the right edge at mid-height", () => {
    for (const t of ALL) {
      const svg = gateSVG(t);
      const y = t === "NOT" ? 26 : 34;
      assert.ok(svg.includes(`H92`), `${t} lead reaches x=92`);
      assert.ok(svg.includes(`${y}H92`) || svg.includes(`M67 26H92`), `${t} lead at y=${y}`);
    }
  });

  it("only inverting gates get a bubble circle", () => {
    for (const t of ["NOT", "NAND", "NOR", "XNOR"]) {
      assert.match(gateSVG(t), /<circle/, `${t} has bubble`);
    }
    for (const t of ["AND", "OR", "XOR"]) {
      assert.doesNotMatch(gateSVG(t), /<circle/, `${t} has no bubble`);
    }
  });

  it("XOR/XNOR have the extra input curve; AND/NAND use the D-shape arc", () => {
    assert.match(gateSVG("XOR"), /M17 12C25 24 25 44 17 56/);
    assert.match(gateSVG("XNOR"), /M17 12C25 24 25 44 17 56/);
    assert.doesNotMatch(gateSVG("OR"), /M17 12/);
    assert.match(gateSVG("AND"), /A20 20/);
    assert.match(gateSVG("NAND"), /A20 20/);
    assert.match(gateSVG("NOT"), /M26 12L26 40L58 26Z/);
  });

  it("throws for terminals and unknown types", () => {
    assert.throws(() => gateSVG("INPUT"));
    assert.throws(() => gateSVG("OUTPUT"));
    assert.throws(() => gateSVG("FLIPFLOP"));
  });
});
