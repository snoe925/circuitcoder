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

test("level list shows 12 challenges with progression lock", async ({ page }) => {
  const cards = page.locator(".level-card");
  await expect(cards).toHaveCount(12);
  await expect(cards.nth(0)).toBeEnabled();
  await expect(cards.nth(0)).toContainText("NOT Trader");
  // Fresh save: only level 1 unlocked
  await expect(cards.nth(1)).toBeDisabled();
  await expect(cards.nth(11)).toContainText("2-bit Equality");
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
  await expect(buttons).toHaveCount(7);
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
  await expect(page.locator(".pal-btn")).toHaveCount(9);
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

test("reset button clears a placed gate", async ({ page }) => {
  await page.locator('.pal-btn[data-type="NOT"]').click();
  await expect(page.locator(".node.type-NOT")).toHaveCount(1);
  await page.locator("#reset-btn").click();
  await expect(page.locator(".node.type-NOT")).toHaveCount(0);
  await expect(page.locator("#level-budget")).toContainText("Gates used: 0");
});
