import { test, expect } from "@playwright/test";

/** Fresh game state for every test (no stars / unlocks leaking between tests). */
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#level-name")).toContainText("1. NOT Trader");
});

async function nodeId(page, selector, index = 0) {
  return await page.locator(selector).nth(index).getAttribute("data-id");
}

/** Click output pin of one node, then input pin of another. */
async function wire(page, fromId, toId, toPin = 0) {
  await page.locator(`.node[data-id="${fromId}"] .pin.out`).click();
  await page.locator(`.node[data-id="${toId}"] .pin.in[data-pin="${toPin}"]`).click();
}

async function solveLevel1(page) {
  await page.locator('.pal-btn[data-type="NOT"]').click();
  const inId = await nodeId(page, ".node.type-INPUT");
  const outId = await nodeId(page, ".node.type-OUTPUT");
  const notId = await nodeId(page, ".node.type-NOT");
  await wire(page, inId, notId, 0);
  await wire(page, notId, outId, 0);
  await page.locator("#check-btn").click();
  await expect(page.locator("#check-results")).toContainText("Solved!");
  return { inId, outId, notId };
}

test("level list shows the full campaign with progression lock", async ({ page }) => {
  const cards = page.locator(".level-card");
  await expect(cards).toHaveCount(112);
  await expect(cards.nth(0)).toBeEnabled();
  await expect(cards.nth(0)).toContainText("NOT Trader");
  // Fresh save: only level 1 unlocked
  await expect(cards.nth(1)).toBeDisabled();
  await expect(cards.nth(111)).toContainText("Flipped Parity");
});

test("level 1 renders palette budget and truth table", async ({ page }) => {
  await expect(page.locator("#level-brief")).not.toBeEmpty();
  await expect(page.locator("#level-budget")).toContainText("NOT×1");
  await expect(page.locator("#level-budget")).toContainText("Par: 1");
  // header + 2 rows for 1 input
  await expect(page.locator("#truth-table tr")).toHaveCount(3);
  await expect(page.locator("#truth-table")).toContainText("live");
});

test("empty circuit fails check with helpful message", async ({ page }) => {
  await page.locator("#check-btn").click();
  await expect(page.locator("#check-results")).toContainText("Not yet");
});

test("solve level 1 end-to-end: place, wire, check, unlock level 2", async ({
  page,
}) => {
  await solveLevel1(page);
  // Palette budget consumed
  await expect(page.locator('.pal-btn[data-type="NOT"]')).toBeDisabled();
  // Check table shows pass marks
  await expect(page.locator("#truth-table")).toContainText("✓");
  // Level 2 unlocked and starred save persisted across reload
  await expect(page.locator(".level-card").nth(1)).toBeEnabled();
  await page.reload();
  await expect(page.locator(".level-card").nth(1)).toBeEnabled();
  await expect(page.locator(".level-card").nth(0)).toContainText("★★★");
});

test("challenge palette always shows every gate (unavailable ones locked)", async ({
  page,
}) => {
  const buttons = page.locator('#palette .pal-btn');
  await expect(buttons).toHaveCount(8);
  await expect(page.locator('.pal-btn[data-type="NOT"]')).toBeEnabled();
  // AND is not part of level 1 — visible but locked, not vanished
  await expect(page.locator('.pal-btn[data-type="AND"]')).toBeDisabled();
  await expect(page.locator('.pal-btn[data-type="AND"]')).toContainText("locked");
  await expect(page.locator("#palette-label")).toContainText("budget");
});

test("input/output terminals are visible inside the canvas", async ({ page }) => {
  const canvas = await page.locator("#canvas").boundingBox();
  for (const sel of [".node.type-INPUT", ".node.type-OUTPUT"]) {
    const box = await page.locator(sel).first().boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(canvas.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
    expect(box.y).toBeGreaterThanOrEqual(canvas.y - 1);
    expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height + 1);
  }
});
test("wiring works input-pin-first too, and solves the level", async ({
  page,
}) => {
  await page.locator('.pal-btn[data-type="NOT"]').click();
  const inId = await nodeId(page, ".node.type-INPUT");
  const outId = await nodeId(page, ".node.type-OUTPUT");
  const notId = await nodeId(page, ".node.type-NOT");
  // Start from the gate's input pin, finish at the INPUT terminal's output
  await page.locator(`.node[data-id="${notId}"] .pin.in[data-pin="0"]`).click();
  await expect(page.locator("#status")).toContainText("now click an output pin");
  await page.locator(`.node[data-id="${inId}"] .pin.out`).click();
  await expect(page.locator("#status")).toContainText("Wired.");
  // Finish the second wire in the usual direction
  await page.locator(`.node[data-id="${notId}"] .pin.out`).click();
  await page.locator(`.node[data-id="${outId}"] .pin.in[data-pin="0"]`).click();
  await page.locator("#check-btn").click();
  await expect(page.locator("#check-results")).toContainText("Solved!");
});

test("toggling an INPUT flips its lamp", async ({ page }) => {
  const lamp = page.locator(".node.type-INPUT .node-lamp").first();
  await expect(lamp).toHaveText("0");
  await page.locator(".node.type-INPUT").first().click();
  await expect(lamp).toHaveText("1");
  await page.locator(".node.type-INPUT").first().click();
  await expect(lamp).toHaveText("0");
});

test("live simulation lights the output lamp after wiring", async ({
  page,
}) => {
  await solveLevel1(page);
  // INPUT=0 -> NOT -> OUTPUT=1
  await expect(page.locator(".node.type-OUTPUT .node-lamp").first()).toHaveText("1");
  const inId = await nodeId(page, ".node.type-INPUT");
  void inId;
  await page.locator(".node.type-INPUT").first().click(); // INPUT=1
  await expect(page.locator(".node.type-OUTPUT .node-lamp").first()).toHaveText("0");
});

test("rewiring an occupied input replaces the wire instead of duplicating", async ({
  page,
}) => {
  await page.locator('.pal-btn[data-type="NOT"]').click();
  const inId = await nodeId(page, ".node.type-INPUT");
  const outId = await nodeId(page, ".node.type-OUTPUT");
  const notId = await nodeId(page, ".node.type-NOT");
  await wire(page, inId, notId, 0);
  await wire(page, notId, outId, 0);
  const wiresBefore = await page.locator("#wires path.wire").count();
  expect(wiresBefore).toBe(2);
  // Rewire same input pin again — setInputWire replaces, count must not grow
  await wire(page, inId, notId, 0);
  await expect(page.locator("#wires path.wire")).toHaveCount(2);
  await expect(page.locator("#status")).toContainText("Wired.");
});

test("sandbox mode unlocks all parts and can place gates", async ({ page }) => {
  await page.locator("#mode-sandbox").click();
  await expect(page.locator("#spec-sandbox")).toBeVisible();
  await expect(page.locator(".pal-btn")).toHaveCount(10);
  for (const t of ["AND", "XOR", "OUTPUT"]) {
    await expect(page.locator(`.pal-btn[data-type="${t}"]`)).toBeEnabled();
  }
  await page.locator('.pal-btn[data-type="AND"]').click();
  await expect(page.locator(".node.type-AND")).toHaveCount(1);
  await expect(page.locator("#sandbox-info")).toContainText("Gates: 1");
});

test("gates render traditional symbols (NOT triangle+bubble, D-shaped AND)", async ({
  page,
}) => {
  await page.locator("#mode-sandbox").click();
  for (const t of ["AND", "OR", "NOT", "XOR"]) {
    await page.locator(`.pal-btn[data-type="${t}"]`).click();
  }
  for (const t of ["AND", "OR", "NOT", "XOR"]) {
    await expect(page.locator(`.node.type-${t} svg.gate`)).toHaveCount(1);
  }
  // inversion bubbles only on NOT here
  await expect(page.locator('.node.type-NOT svg.gate circle')).toHaveCount(1);
  await expect(page.locator('.node.type-AND svg.gate circle')).toHaveCount(0);
});

test("help modal opens and closes", async ({ page }) => {
  await page.locator("#help-btn").click();
  await expect(page.locator("#help-modal")).toBeVisible();
  await expect(page.locator("#help-modal")).toContainText("Gate cheat-sheet");
  await page.locator("#help-close").click();
  await expect(page.locator("#help-modal")).toBeHidden();
});

test("narrow screens keep a usable canvas (scrolls instead of shrinking pins)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const canvasWidth = await page.evaluate(
    () => document.querySelector("#canvas").clientWidth
  );
  // min-width:640px minus 2px of border — key point is it no longer
  // shrinks to the 390px viewport
  expect(canvasWidth).toBeGreaterThanOrEqual(630);
  const pin = await page.locator(".pin.out").first().boundingBox();
  expect(pin.width).toBeGreaterThanOrEqual(12);
});

test("level select groups 112 levels into chapters", async ({ page }) => {
  await expect(page.locator(".level-card")).toHaveCount(112);
  const chapters = page.locator(".lvl-chapter");
  await expect(chapters).toHaveCount(11);
  await expect(page.locator(".lvl-chapter").first()).toContainText("Pack 1");
});

async function unlockAll(page) {
  await page.evaluate(() =>
    localStorage.setItem(
      "circuitcoder.v1",
      JSON.stringify({
        unlocked: 500, stars: {}, sandbox: null,
        cmos: { unlocked: 500, stars: {}, playground: null },
        analog: { unlocked: 500, stars: {}, playground: null },
        clocked: { unlocked: 500, stars: {} },
      })
    )
  );
  await page.reload();
  await expect(page.locator("#level-name")).not.toBeEmpty();
}

test("pack2 level solves end-to-end (Meet NAND)", async ({ page }) => {
  await unlockAll(page);
  await page.locator(".level-card", { hasText: "Meet NAND" }).click();
  await expect(page.locator("#level-name")).toContainText("Meet NAND");
  await page.locator('.pal-btn[data-type="NAND"]').click();
  const ids = await page.locator("#nodes .node").evaluateAll((els) =>
    els.map((e) => [e.dataset.id, e.className])
  );
  const idOf = (frag) => ids.find(([, c]) => c.includes(frag))[0];
  const in0 = (await page.locator(".node.type-INPUT").evaluateAll((els) => els.map((e) => e.dataset.id)))[0];
  void in0;
  const inputs = await page.locator(".node.type-INPUT").evaluateAll((els) => els.map((e) => e.dataset.id));
  const nand = idOf("type-NAND");
  const out = idOf("type-OUTPUT");
  await page.locator(`.node[data-id="${inputs[0]}"] .pin.out`).click();
  await page.locator(`.node[data-id="${nand}"] .pin.in[data-pin="0"]`).click();
  await page.locator(`.node[data-id="${inputs[1]}"] .pin.out`).click();
  await page.locator(`.node[data-id="${nand}"] .pin.in[data-pin="1"]`).click();
  await page.locator(`.node[data-id="${nand}"] .pin.out`).click();
  await page.locator(`.node[data-id="${out}"] .pin.in[data-pin="0"]`).click();
  await page.locator("#check-btn").click();
  await expect(page.locator("#check-results")).toContainText("Solved!");
});

test("debug ward level loads its buggy prefill (unfinished wiring)", async ({ page }) => {
  await unlockAll(page);
  await page.locator(".level-card", { hasText: "Broken Inverter" }).click();
  await expect(page.locator("#level-name")).toContainText("Broken Inverter");
  await expect(page.locator(".node.type-NOT")).toHaveCount(1);
  // The prefill is broken: checking now must fail
  await page.locator("#check-btn").click();
  await expect(page.locator("#check-results")).toContainText("Not yet");
  // Finish the job: wire NOT -> Y
  const not = (await page.locator(".node.type-NOT").evaluateAll((els) => els.map((e) => e.dataset.id)))[0];
  const outp = (await page.locator(".node.type-OUTPUT").evaluateAll((els) => els.map((e) => e.dataset.id)))[0];
  await page.locator(`.node[data-id="${not}"] .pin.out`).click();
  await page.locator(`.node[data-id="${outp}"] .pin.in[data-pin="0"]`).click();
  await page.locator("#check-btn").click();
  await expect(page.locator("#check-results")).toContainText("Solved!");
});

test("expression view shows live formulas per output", async ({ page }) => {
  await expect(page.locator("#expr-view")).toBeHidden();
  await page.locator("#expr-toggle").click();
  await expect(page.locator("#expr-view")).toBeVisible();
  await expect(page.locator("#expr-view")).toContainText("Y = 0");
  // Wire up NOT and watch the formula update
  await page.locator('.pal-btn[data-type="NOT"]').click();
  const inp = (await page.locator(".node.type-INPUT").evaluateAll((els) => els.map((e) => e.dataset.id)))[0];
  const not = (await page.locator(".node.type-NOT").evaluateAll((els) => els.map((e) => e.dataset.id)))[0];
  const outp = (await page.locator(".node.type-OUTPUT").evaluateAll((els) => els.map((e) => e.dataset.id)))[0];
  await page.locator(`.node[data-id="${inp}"] .pin.out`).click();
  await page.locator(`.node[data-id="${not}"] .pin.in[data-pin="0"]`).click();
  await page.locator(`.node[data-id="${not}"] .pin.out`).click();
  await page.locator(`.node[data-id="${outp}"] .pin.in[data-pin="0"]`).click();
  await expect(page.locator("#expr-view")).toContainText("Y = ¬A");
  await page.locator("#expr-toggle").click();
  await expect(page.locator("#expr-view")).toBeHidden();
});

test("K-map hint shows on 2-input levels, hides on 1-input", async ({ page }) => {
  // Level 1 has a single input: no map
  await expect(page.locator("#hint-details")).toBeHidden();
  await unlockAll(page);
  await page.locator(".level-card", { hasText: "AND Gate" }).click();
  await expect(page.locator("#hint-details")).toBeVisible();
  await page.locator("#hint-details summary").click();
  await expect(page.locator("#kmap-pre")).toContainText("Y:");
  await expect(page.locator("#kmap-pre")).toContainText("1");
});

test("CMOS Lab tab shows terminals and budgeted palette", async ({ page }) => {
  await page.locator("#mode-cmos").click();
  await expect(page.locator("#level-name")).toContainText("C1. Power It Up");
  await expect(page.locator('.cdev[data-name="P1"]')).toBeVisible();
  await expect(page.locator('.cdev[data-name="VDD"]')).toBeVisible();
  await expect(page.locator('.cdev[data-name="GND"]')).toBeVisible();
  // C1 budgets nothing: all parts locked but visible
  await expect(page.locator("#palette .pal-btn")).toHaveCount(5);
  await expect(page.locator('.pal-btn[data-type="NMOS"]')).toBeDisabled();
});

test("CMOS inverter solves end-to-end (place, wire, check)", async ({ page }) => {
  await unlockAll(page);
  await page.locator("#mode-cmos").click();
  await page.locator(".level-card", { hasText: "CMOS Inverter" }).click();
  await expect(page.locator("#level-name")).toContainText("CMOS Inverter");
  await page.locator('.pal-btn[data-type="PMOS"]').click();
  await page.locator('.pal-btn[data-type="NMOS"]').click();
  const pin = (name, p) => page.locator(`.cdev[data-name="${name}"] .pin[data-pin="${p}"]`);
  const gatePin = (kind, p, n = 0) => page.locator(`.cdev.kind-${kind} >> nth=${n} >> .pin[data-pin="${p}"]`);
  // VDD->PMOS.A, A->PMOS.G, A->NMOS.G, PMOS.B->Y, NMOS.A->Y, NMOS.B->GND
  const wire2 = async (a, b) => { await a.click(); await b.click(); };
  await wire2(pin("VDD", "Y"), gatePin("PMOS", "A"));
  await wire2(pin("A", "Y"), gatePin("PMOS", "G"));
  await wire2(pin("A", "Y"), gatePin("NMOS", "G"));
  await wire2(gatePin("PMOS", "B"), pin("Y", "A"));
  await wire2(gatePin("NMOS", "A"), pin("Y", "A"));
  await wire2(gatePin("NMOS", "B"), pin("GND", "Y"));
  await expect(page.locator("#wires path.wire:not(.wire-hit)")).toHaveCount(6);
  await page.locator("#check-btn").click();
  await expect(page.locator("#check-results")).toContainText("Solved!");
  await expect(page.locator(".level-card", { hasText: "CMOS NAND" })).toBeEnabled();
});

test("NMOS switch solves with a resistor down to GND", async ({ page }) => {
  await unlockAll(page);
  await page.locator("#mode-cmos").click();
  await page.locator(".level-card", { hasText: "NMOS Switch" }).click();
  await expect(page.locator("#level-name")).toContainText("NMOS Switch");
  await page.locator('.pal-btn[data-type="NMOS"]').click();
  await page.locator('.pal-btn[data-type="RESISTOR"]').click();
  const pin = (name, p) => page.locator(`.cdev[data-name="${name}"] .pin[data-pin="${p}"]`);
  const nPin = (p) => page.locator(`.cdev.kind-NMOS .pin[data-pin="${p}"]`);
  const rPin = (p) => page.locator(`.cdev.kind-RESISTOR .pin[data-pin="${p}"]`);
  const wire2 = async (a, b) => { await a.click(); await b.click(); };
  await wire2(pin("VDD", "Y"), nPin("A"));
  await wire2(pin("A", "Y"), nPin("G"));
  await wire2(nPin("B"), pin("Y", "A"));
  await wire2(rPin("A"), nPin("B"));
  await wire2(rPin("B"), pin("GND", "Y"));
  await page.locator("#check-btn").click();
  await expect(page.locator("#check-results")).toContainText("Solved!");
});

test("master sandbox switches benches and persists", async ({ page }) => {
  await page.locator("#mode-sandbox").click();
  await expect(page.locator(".level-card[data-bench]")).toHaveCount(4);
  // transistor bench: free CMOS parts
  await page.locator('.level-card[data-bench="cmos"]').click();
  await expect(page.locator('.pal-btn[data-type="NMOS"]')).toBeEnabled();
  await expect(page.locator('.pal-btn[data-type="IN"]')).toBeEnabled();
  await page.locator('.pal-btn[data-type="NMOS"]').click();
  await expect(page.locator(".cdev.kind-NMOS")).toHaveCount(1);
  // analog bench: free analog parts
  await page.locator("#mode-sandbox").click();
  await page.locator('.level-card[data-bench="analog"]').click();
  await expect(page.locator('.pal-btn[data-type="VSRC"]')).toBeEnabled();
  await page.locator('.pal-btn[data-type="OPAMP"]').click();
  await expect(page.locator(".cdev.kind-OPAMP")).toHaveCount(1);
  // gates bench still fine, and the pick persists across reload
  await page.locator("#mode-sandbox").click();
  await page.locator('.level-card[data-bench="gates"]').click();
  await page.locator('.pal-btn[data-type="AND"]').click();
  await expect(page.locator(".node.type-AND")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("#mode-sandbox")).toHaveClass(/active/);
  await expect(page.locator('.level-card[data-bench="gates"]')).toHaveClass(/active/);
  await expect(page.locator(".node.type-AND")).toHaveCount(1);
});

test("Op-Amp Lab tab shows sources, rails and budgeted palette", async ({ page }) => {
  await page.locator("#mode-analog").click();
  await expect(page.locator("#level-name")).toContainText("O1. Voltage Follower");
  await expect(page.locator('.cdev[data-name="Vin"]')).toBeVisible();
  await expect(page.locator('.cdev[data-name="+12V"]')).toBeVisible();
  await expect(page.locator('.cdev[data-name="GND"]')).toBeVisible();
  await expect(page.locator("#palette .pal-btn")).toHaveCount(2);
  await expect(page.locator('.pal-btn[data-type="OPAMP"]')).toBeEnabled();
});

test("Voltage follower solves end-to-end (place, wire, check)", async ({ page }) => {
  await unlockAll(page);
  await page.locator("#mode-analog").click();
  await page.locator("#mode-analog").click();
  await expect(page.locator("#level-name")).toContainText("O1. Voltage Follower");
  await page.locator('.pal-btn[data-type="OPAMP"]').click();
  const pin = (name, p) => page.locator(`.cdev[data-name="${name}"] .pin[data-pin="${p}"]`);
  const opPin = (p) => page.locator(`.cdev.kind-OPAMP .pin[data-pin="${p}"]`);
  const wire2 = async (a, b) => { await a.click(); await b.click(); };
  await wire2(pin("Vin", "P"), opPin("+"));
  await wire2(opPin("OUT"), opPin("-"));
  await wire2(opPin("OUT"), pin("Out", "S"));
  await wire2(pin("Vin", "M"), pin("GND", "S"));
  await expect(page.locator("#wires path.wire:not(.wire-hit)")).toHaveCount(4);
  await page.locator("#check-btn").click();
  await expect(page.locator("#check-results")).toContainText("Solved!");
  await expect(page.locator("#xfer path")).not.toHaveCount(0);
  await expect(page.locator(".level-card", { hasText: "Comparator" })).toBeEnabled();
});

test("free play opens every level and persists", async ({ page }) => {
  await expect(page.locator(".level-card").nth(1)).toBeDisabled();
  await page.locator("#freeplay").check();
  await expect(page.locator(".level-card").nth(1)).toBeEnabled();
  await expect(page.locator(".level-card").nth(111)).toBeEnabled();
  await page.locator(".level-card").nth(111).click();
  await expect(page.locator("#level-name")).toContainText("Flipped Parity");
  // CMOS Lab honors it too
  await page.locator("#mode-cmos").click();
  await expect(page.locator(".level-card", { hasText: "SR Latch" })).toBeEnabled();
  await page.locator(".level-card", { hasText: "SR Latch" }).click();
  await expect(page.locator("#level-name")).toContainText("SR Latch");
  // Op-Amp Lab too
  await page.locator("#mode-analog").click();
  await expect(page.locator(".level-card", { hasText: "Clipping Lab" })).toBeEnabled();
  // turning it off re-locks, and the flag survives reload
  await page.locator("#freeplay").uncheck();
  await page.locator("#mode-challenge").click();
  await expect(page.locator(".level-card").nth(1)).toBeDisabled();
  await page.locator("#freeplay").check();
  await page.reload();
  await expect(page.locator("#freeplay")).toBeChecked();
  await expect(page.locator(".level-card").nth(1)).toBeEnabled();
});

test("mode tabs switch cleanly with exactly one active", async ({ page }) => {
  const tabs = ["#mode-challenge", "#mode-cmos", "#mode-analog", "#mode-sandbox"];
  const activeCount = async () =>
    page.evaluate(() => document.querySelectorAll(".mode-btn.active").length);
  // Analog -> CMOS: the reported stickiness (tab highlight + transfer plot)
  await page.locator("#mode-analog").click();
  await expect(page.locator("#xfer-wrap")).toBeVisible();
  await page.locator("#mode-cmos").click();
  await expect(page.locator("#mode-analog")).not.toHaveClass(/active/);
  await expect(page.locator("#mode-cmos")).toHaveClass(/active/);
  await expect(page.locator("#xfer-wrap")).toBeHidden();
  await expect(await activeCount()).toBe(1);
  // full cycle back through every mode
  for (const tab of tabs) {
    await page.locator(tab).click();
    await expect(page.locator(tab)).toHaveClass(/active/);
    await expect(await activeCount()).toBe(1);
  }
  await expect(page.locator("#xfer-wrap")).toBeHidden();
});

test("logic probe watches a net live without affecting the solve", async ({ page }) => {
  // sandbox: probe follows the input toggle, on and off states obvious
  await page.locator("#mode-sandbox").click();
  await page.locator('.pal-btn[data-type="INPUT"]').click();
  await page.locator('.pal-btn[data-type="PROBE"]').click();
  const inp = (await page.locator(".node.type-INPUT").evaluateAll((els) => els.map((e) => e.dataset.id)))[0];
  const probe = (await page.locator(".node.type-PROBE").evaluateAll((els) => els.map((e) => e.dataset.id)))[0];
  await page.locator(`.node[data-id="${inp}"] .pin.out`).click();
  await page.locator(`.node[data-id="${probe}"] .pin.in[data-pin="0"]`).click();
  const lamp = page.locator(".node.type-PROBE .probe-led");
  await expect(lamp).toHaveText("0");
  await expect(page.locator(".node.type-PROBE")).not.toHaveClass(/on/);
  await page.locator(".node.type-INPUT").first().click();
  await expect(lamp).toHaveText("1");
  await expect(page.locator(".node.type-PROBE")).toHaveClass(/on/);
});

test("probes are free: unlimited and star-neutral in challenges", async ({ page }) => {
  await page.locator('.pal-btn[data-type="NOT"]').click();
  await page.locator('.pal-btn[data-type="PROBE"]').click();
  await page.locator('.pal-btn[data-type="PROBE"]').click();
  await expect(page.locator(".node.type-PROBE")).toHaveCount(2);
  await expect(page.locator('.pal-btn[data-type="PROBE"]')).toBeEnabled();
  // solve level 1 around the probes: A -> NOT -> Y, probe tapped on NOT
  const inId = await page.locator(".node.type-INPUT").first().getAttribute("data-id");
  const outId = await page.locator(".node.type-OUTPUT").first().getAttribute("data-id");
  const notId = await page.locator(".node.type-NOT").getAttribute("data-id");
  const probeId = await page.locator(".node.type-PROBE").first().getAttribute("data-id");
  const wire = async (a, b) => { await a.click(); await b.click(); };
  await wire(page.locator(`.node[data-id="${inId}"] .pin.out`), page.locator(`.node[data-id="${notId}"] .pin.in[data-pin="0"]`));
  await wire(page.locator(`.node[data-id="${notId}"] .pin.out`), page.locator(`.node[data-id="${outId}"] .pin.in[data-pin="0"]`));
  await wire(page.locator(`.node[data-id="${notId}"] .pin.out`), page.locator(`.node[data-id="${probeId}"] .pin.in[data-pin="0"]`));
  await page.locator("#check-btn").click();
  await expect(page.locator("#check-results")).toContainText("★★★");
});

test("Clocked tab shows clock terminals and traces", async ({ page }) => {
  await page.locator("#mode-clocked").click();
  await expect(page.locator("#level-name")).toContainText("K1. Blink");
  await expect(page.locator("#nodes .node.type-CLOCK")).toHaveCount(1);
  await expect(page.locator("#trace-view")).toBeVisible();
  await expect(page.locator("#traces path")).not.toHaveCount(0);
  await expect(page.locator("#t-scrub")).toBeVisible();
});

test("Divide-by-2 solves end-to-end (toggle HI, wire, check)", async ({ page }) => {
  await unlockAll(page);
  await page.locator("#mode-clocked").click();
  await page.locator(".level-card", { hasText: "Divide by 2" }).click();
  await expect(page.locator("#level-name")).toContainText("Divide by 2");
  // HI is the logic-high input: toggle it to 1
  await page.locator('.node[data-id]').first().waitFor();
  const hiId = await page.locator(".node.type-INPUT").getAttribute("data-id");
  await page.locator(`.node[data-id="${hiId}"]`).click();
  await page.locator('.pal-btn[data-type="TFF"]').click();
  const tffId = await page.locator(".node.type-TFF").getAttribute("data-id");
  const outId = await page.locator(".node.type-OUTPUT").getAttribute("data-id");
  const clkId = await page.locator(".node.type-CLOCK").getAttribute("data-id");
  const wire = async (a, b) => { await a.click(); await b.click(); };
  await wire(
    page.locator(`.node[data-id="${hiId}"] .pin.out`),
    page.locator(`.node[data-id="${tffId}"] .pin.in[data-pin="0"]`)
  );
  await wire(
    page.locator(`.node[data-id="${clkId}"] .pin.out`),
    page.locator(`.node[data-id="${tffId}"] .pin.in[data-pin="1"]`)
  );
  await wire(
    page.locator(`.node[data-id="${tffId}"] .pin.out[data-pin="0"]`),
    page.locator(`.node[data-id="${outId}"] .pin.in[data-pin="0"]`)
  );
  await page.locator("#check-btn").click();
  await expect(page.locator("#check-results")).toContainText("Solved!");
  await expect(page.locator(".level-card", { hasText: "Divide by 4" })).toBeEnabled();
});

test("Clocked bench appears in master sandbox", async ({ page }) => {
  await page.locator("#mode-sandbox").click();
  await page.locator('.level-card[data-bench="clocked"]').click();
  await expect(page.locator('.pal-btn[data-type="DFF"]')).toBeEnabled();
  await expect(page.locator("#trace-view")).toBeVisible();
  await page.locator('.pal-btn[data-type="CLOCK"]').click();
  await expect(page.locator(".node.type-CLOCK")).toHaveCount(1);
});

test("7-seg display tracks the BCD input digit", async ({ page }) => {
  await unlockAll(page);
  await page.locator("#mode-challenge").click();
  await page.locator(".level-card", { hasText: "7-seg E" }).click();
  await expect(page.locator("#level-name")).toContainText("7-seg E");
  await expect(page.locator("#seg-display")).toBeVisible();
  // inputs default 0000 -> digit 0; E is on for 0
  await expect(page.locator('#seg-display [data-seg="e"]')).toHaveClass(/seg-on/);
  await expect(page.locator('#seg-display [data-seg="e"]')).toHaveClass(/seg-target/);
  await expect(page.locator("#seg-display")).toContainText("input digit: 0");
  // toggle w (8s) -> digit 8; E is on for 8
  const wId = await page.locator(".node.type-INPUT").first().getAttribute("data-id");
  await page.locator(`.node[data-id="${wId}"]`).click();
  await expect(page.locator("#seg-display")).toContainText("input digit: 8");
  await expect(page.locator('#seg-display [data-seg="e"]')).toHaveClass(/seg-on/);
  // toggle x too -> digit 12 (invalid BCD) -> blank
  const xId = await page.locator(".node.type-INPUT").nth(1).getAttribute("data-id");
  await page.locator(`.node[data-id="${xId}"]`).click();
  await expect(page.locator("#seg-display")).toContainText("invalid BCD");
  await expect(page.locator('#seg-display [data-seg="e"]')).toHaveClass(/seg-off/);
});

test("7-seg C solves end-to-end (¬y ∨ z ∨ x)", async ({ page }) => {
  await unlockAll(page);
  await page.locator("#mode-challenge").click();
  await page.locator(".level-card", { hasText: "7-seg C" }).click();
  await page.locator('.pal-btn[data-type="NOT"]').click();
  await page.locator('.pal-btn[data-type="OR"]').click();
  await page.locator('.pal-btn[data-type="OR"]').click();
  const inIds = await page.locator(".node.type-INPUT").evaluateAll((els) => els.map((e) => e.dataset.id));
  const [wId, xId, yId, zId] = inIds; // inputs order w,x,y,z
  void wId;
  const outId = await page.locator(".node.type-OUTPUT").getAttribute("data-id");
  const notId = await page.locator(".node.type-NOT").getAttribute("data-id");
  const orIds = await page.locator(".node.type-OR").evaluateAll((els) => els.map((e) => e.dataset.id));
  const wire = async (a, b) => { await a.click(); await b.click(); };
  const outPin = (id) => page.locator(`.node[data-id="${id}"] .pin.out`);
  const inPin = (id, p) => page.locator(`.node[data-id="${id}"] .pin.in[data-pin="${p}"]`);
  await wire(outPin(yId), inPin(notId, 0));
  await wire(outPin(notId), inPin(orIds[0], 0));
  await wire(outPin(zId), inPin(orIds[0], 1));
  await wire(outPin(orIds[0]), inPin(orIds[1], 0));
  await wire(outPin(xId), inPin(orIds[1], 1));
  await wire(outPin(orIds[1]), inPin(outId, 0));
  await page.locator("#check-btn").click();
  await expect(page.locator("#check-results")).toContainText("Solved!");
});

test("reset button clears a placed gate", async ({ page }) => {
  await page.locator('.pal-btn[data-type="NOT"]').click();
  await expect(page.locator(".node.type-NOT")).toHaveCount(1);
  await page.locator("#reset-btn").click();
  await expect(page.locator(".node.type-NOT")).toHaveCount(0);
  await expect(page.locator("#level-budget")).toContainText("Gates used: 0");
});
