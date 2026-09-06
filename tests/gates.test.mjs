import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gateSVG, GATE_ART_HEIGHT, SEG_DIGITS, sevenSegSVG } from "../src/gates.js";

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

  it("renders clocked parts (flop box, clock circle, delay)", () => {
    const dff = gateSVG("DFF");
    assert.match(dff, /<rect/);
    assert.ok(dff.includes(">D<") || dff.includes(">D</text>"), "D label");
    assert.ok(dff.includes("Qb"), "Qb label");
    assert.match(dff, /<polygon/, "clock triangle");
    assert.match(gateSVG("TFF"), /T<\/text>/);
    assert.match(gateSVG("CLOCK"), /<circle/);
    assert.match(gateSVG("DELAY"), /Δ1/);
    assert.match(gateSVG("DLATCH"), /EN/);
  });
});

describe("sevenSegSVG", () => {
  const EXPECTED = {
    0: ["a", "b", "c", "d", "e", "f"],
    1: ["b", "c"],
    2: ["a", "b", "g", "e", "d"],
    3: ["a", "b", "c", "d", "g"],
    4: ["f", "g", "b", "c"],
    5: ["a", "f", "g", "c", "d"],
    6: ["a", "f", "g", "e", "c", "d"],
    7: ["a", "b", "c"],
    8: ["a", "b", "c", "d", "e", "f", "g"],
    9: ["a", "b", "c", "d", "f", "g"],
  };
  it("encodes all ten digits with standard segments", () => {
    assert.deepEqual(SEG_DIGITS, EXPECTED);
  });
  it("lights the right polygons and outlines the target", () => {
    const svg = sevenSegSVG(2, "e");
    for (const s of ["a", "b", "g", "e", "d"]) {
      assert.match(svg, new RegExp(`data-seg="${s}"[^>]*seg-on`), `${s} lit for 2`);
    }
    for (const s of ["c", "f"]) {
      assert.match(svg, new RegExp(`data-seg="${s}"[^>]*seg-off`), `${s} dark for 2`);
    }
    assert.match(svg, /data-seg="e"[^>]*seg-target/, "target outlined");
    assert.ok(!/data-seg="a"[^>]*seg-target/.test(svg), "non-target not outlined");
  });
  it("blanks on invalid BCD", () => {
    for (const bad of [null, 10, 15, -1]) {
      const svg = sevenSegSVG(bad, "a");
      assert.ok(!svg.includes("seg-on"), `blank for ${bad}`);
      assert.match(svg, /aria-label="seven segment display blank"/);
    }
  });
});
