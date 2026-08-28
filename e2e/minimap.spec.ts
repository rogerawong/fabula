/**
 * Minimap drag behavior: dragging the viewport window pans the main
 * canvas LIVE; movement past the top-left corner rubber-bands and
 * snaps back on release; plain click still jump-centers.
 */

import { expect, test, type Page } from "@playwright/test";
import { watchConsole } from "./helpers";

test.use({ viewport: { width: 1600, height: 1000 } });

/** The canvas world transform's translate, parsed. */
async function worldOffset(page: Page): Promise<{ x: number; y: number }> {
  const transform = await page
    .getByTestId("canvas-world")
    .evaluate((el) => (el as HTMLElement).style.transform);
  const m = transform.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/);
  if (!m) throw new Error(`unparsable transform: ${transform}`);
  return { x: Number(m[1]), y: Number(m[2]) };
}

async function loadSample(page: Page) {
  await page.goto("/");
  await page.getByTestId("empty-load-sample-docfx").click();
  await expect(page.getByTestId("card")).toHaveCount(8);
}

test("dragging the minimap window pans the canvas live and follows the pointer", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  expect(await worldOffset(page)).toEqual({ x: 0, y: 0 });
  const windowBox = (await page.getByTestId("minimap-viewport").boundingBox())!;
  const grab = {
    x: windowBox.x + windowBox.width / 2,
    y: windowBox.y + windowBox.height / 2,
  };

  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 25, grab.y + 15, { steps: 5 });

  // LIVE mid-drag, before release: canvas moved (view right/down → world
  // translated negative) and the window itself moved with the pointer
  const during = await worldOffset(page);
  expect(during.x).toBeLessThan(0);
  expect(during.y).toBeLessThan(0);
  const windowDuring = (await page.getByTestId("minimap-viewport").boundingBox())!;
  expect(windowDuring.x).toBeGreaterThan(windowBox.x);

  await page.mouse.up();
  // end state holds — no snap-back needed for an in-bounds drag
  const after = await worldOffset(page);
  expect(after.x).toBeCloseTo(during.x, 0);
  expect(after.y).toBeCloseTo(during.y, 0);

  console_.assertClean();
});

test("dragging past the top-left corner rubber-bands and snaps back", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  const windowBox = (await page.getByTestId("minimap-viewport").boundingBox())!;
  const grab = {
    x: windowBox.x + windowBox.width / 2,
    y: windowBox.y + windowBox.height / 2,
  };

  // yank hard toward the top-left, far past the bound
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x - 300, grab.y - 300, { steps: 8 });
  const during = await worldOffset(page);
  await page.mouse.up();

  // overshoot existed, was give-capped, and snapped back to exactly
  // the content origin
  await page.waitForTimeout(500);
  const settled = await worldOffset(page);
  expect(during.x).toBeGreaterThan(0);
  expect(during.x).toBeLessThan(100);
  expect(during.y).toBeGreaterThan(0);
  expect(during.y).toBeLessThan(100);
  expect(settled).toEqual({ x: 0, y: 0 });

  console_.assertClean();
});

test("canvas drag past the top-left rubber-bands and snaps back — even zoomed out", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  // zoom OUT first: the bound and the give must be zoom-independent
  // (regression: the relaxed bound once allowed hundreds of px of
  // blank space at low zoom)
  await page.getByRole("button", { name: "Zoom 50%" }).click();

  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  const empty = { x: canvas.x + canvas.width - 60, y: canvas.y + canvas.height - 60 };
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await page.mouse.move(empty.x + 400, empty.y + 400, { steps: 8 });
  const during = await worldOffset(page);
  await page.mouse.up();

  await page.waitForTimeout(500);
  const settled = await worldOffset(page);
  // overshoot capped at the SCREEN-px give regardless of zoom, then
  // snapped back to exactly the content origin
  expect(during.x).toBeGreaterThan(0);
  expect(during.x).toBeLessThan(100);
  expect(during.y).toBeGreaterThan(0);
  expect(during.y).toBeLessThan(100);
  expect(settled).toEqual({ x: 0, y: 0 });

  console_.assertClean();
});

test("wheel pan hard-clamps at the same top-left bound the drag snaps to", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  await page.getByTestId("canvas").hover();
  // scroll hard toward the top-left (negative deltas pan the view up-left)
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(-400, -400);
  }
  const clamped = await worldOffset(page);
  // further scrolling cannot move past the bound
  await page.mouse.wheel(-400, -400);
  expect(await worldOffset(page)).toEqual(clamped);

  // and panning back into content still works
  await page.mouse.wheel(300, 300);
  const after = await worldOffset(page);
  expect(after.x).toBeLessThan(clamped.x);
  expect(after.y).toBeLessThan(clamped.y);

  console_.assertClean();
});

test("plain click still jump-centers without drifting afterwards", async ({ page }) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  const map = (await page.getByTestId("minimap").boundingBox())!;
  // click near the bottom-right of the minimap → view moves there
  await page.mouse.click(map.x + map.width * 0.9, map.y + map.height * 0.9);
  const after = await worldOffset(page);
  expect(after.x).toBeLessThan(0);
  expect(after.y).toBeLessThan(0);

  console_.assertClean();
});
