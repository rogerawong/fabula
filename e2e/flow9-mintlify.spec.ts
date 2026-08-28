/**
 * The third format adapter, end to end: the Mintlify sample loads,
 * renders its navigation containers as chips, says that its page titles
 * came from paths, and exports byte-identical to the file it was read
 * from — the round-trip bar docs/13 sets, asserted through the app
 * rather than in a unit test.
 */

import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { watchConsole } from "./helpers";

const SAMPLE = readFileSync("src/formats/samples/mintlify-sample.json", "utf8");

async function dragTo(page: Page, from: Locator, to: Locator, yr = 0.5) {
  const f = (await from.boundingBox())!;
  const t = (await to.boundingBox())!;
  const sx = f.x + f.width / 2;
  const sy = f.y + f.height / 2;
  const tx = t.x + t.width / 2;
  const ty = t.y + t.height * yr;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 6 });
  await page.mouse.move(tx, ty, { steps: 10 });
  return async () => {
    await page.mouse.up();
  };
}

test("mintlify sample loads, shows its containers, and exports byte-identical", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await page.goto("/");
  await page.getByTestId("empty-load-sample-mintlify").click();

  // Two tabs and a global anchor: 3 group cards + 1 orphan for the anchor.
  await expect(page.getByTestId("card")).toHaveCount(4);
  await expect(page.locator('[data-card-variant="section"]')).toHaveCount(3);
  await expect(page.locator('[data-card-variant="orphan"]')).toHaveCount(1);
  await expect(page.getByTestId("doc-stats")).toContainText("4 sections");
  await expect(page.getByTestId("doc-stats")).toContainText("15 topics");

  // A card names the container it lives in; without it, two cards from
  // different tabs sitting side by side are unexplained (docs/13).
  await expect(page.locator('[data-card-variant="section"]').first()).toContainText(
    "Guides",
  );
  await expect(page.locator('[data-card-variant="section"]').last()).toContainText(
    "API reference",
  );

  // Every row is labelled from a file path, so the canvas says so once.
  await expect(page.getByTestId("derived-titles-note")).toContainText(
    "Page titles from paths",
  );

  // Derived row titles come from the path, not from any name in the file.
  await expect(
    page.locator('[data-card-variant="section"]', { hasText: "Get started" }),
  ).toContainText("First Launch");

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-button").click();
  const download = await downloadPromise;
  const exported = readFileSync((await download.path())!, "utf8");
  expect(exported).toBe(SAMPLE);

  console_.assertClean();
});

test("a drop between two containers asks which move was meant", async ({ page }) => {
  // v2 supersedes v1's refusal: the drop means what it looks like. At a
  // SEAM it looks like both things, so the release asks — two options,
  // never a proceed/cancel modal, which would presume the answer at
  // exactly the position where it is least certain (docs/13 v2).
  const console_ = watchConsole(page);
  await page.goto("/");
  await page.getByTestId("empty-load-sample-mintlify").click();

  const rows = page.getByTestId("section-list").locator("[data-sidebar-row]");
  await expect(rows.nth(0)).toContainText("Get started");
  await expect(rows.nth(2)).toContainText("Endpoints");

  // Endpoints is the only card in "API reference": moving it out would
  // empty a tab, which `tabs.groups` minItems:1 forbids. The reason
  // arrives on the ghost, before the release.
  const release = await dragTo(page, rows.nth(2), rows.nth(0), 0.85);
  await expect(page.getByTestId("drag-refusal")).toContainText("empty");
  await release();

  // Refused: nothing moved, and the export is byte-identical.
  await expect(rows.nth(0)).toContainText("Get started");
  await expect(rows.nth(2)).toContainText("Endpoints");

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-button").click();
  const download = await downloadPromise;
  expect(readFileSync((await download.path())!, "utf8")).toBe(SAMPLE);

  console_.assertClean();
});
