import { test, expect } from "@playwright/test";
import fs from "node:fs";

// Generates docs/gameplay.png: solves 7-seg C end-to-end, sets digit 6,
// and screenshots the full bench. Runs in-suite; output is committed.
test.use({ viewport: { width: 1400, height: 1000 } });

test("capture README gameplay screenshot", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "circuitcoder.v1",
      JSON.stringify({ unlocked: 500, stars: {}, sandbox: null })
    )
  );
  await page.reload();
  await page.locator(".level-card", { hasText: "7-seg C" }).click();
  await expect(page.locator("#level-name")).toContainText("7-seg C");
  await page.locator('.pal-btn[data-type="NOT"]').click();
  await page.locator('.pal-btn[data-type="OR"]').click();
  await page.locator('.pal-btn[data-type="OR"]').click();
  const inIds = await page.locator(".node.type-INPUT").evaluateAll((els) => els.map((e) => e.dataset.id));
  const [, xId, yId, zId] = inIds; // inputs order w,x,y,z
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
  // show digit 6 (0110): toggle x and y on (w,z stay 0)
  await page.locator(`.node[data-id="${xId}"]`).click();
  await page.locator(`.node[data-id="${yId}"]`).click();
  await expect(page.locator("#seg-display")).toContainText("input digit: 6");
  // freeze animations for a deterministic shot
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important}",
  });
  await page.waitForTimeout(200);
  fs.mkdirSync("docs", { recursive: true });
  await page.screenshot({ path: "docs/gameplay.png", fullPage: true });
});
