/**
 * M5 feedback layer (docs/07: e2e asserts END STATES, not frames):
 * toasts with working Undo actions, ghost shells on section removal,
 * reduced-motion still lands in the right end state.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import { watchConsole } from "./helpers";

test.use({ viewport: { width: 1600, height: 1000 } });

async function loadSample(page: Page) {
  await page.goto("/");
  await page.getByTestId("empty-load-sample-docfx").click();
  await expect(page.getByTestId("card")).toHaveCount(8);
}

function sectionCard(page: Page, title: string): Locator {
  return page
    .locator('[data-card-variant="section"]')
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

async function drag(
  page: Page,
  from: Locator,
  to: Locator,
  offset: { xr: number; yr: number } = { xr: 0.5, yr: 0.5 },
) {
  const f = (await from.boundingBox())!;
  const t = (await to.boundingBox())!;
  const sx = f.x + f.width / 2;
  const sy = f.y + f.height / 2;
  const tx = t.x + t.width * offset.xr;
  const ty = t.y + t.height * offset.yr;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 6 });
  await page.mouse.move(tx, ty, { steps: 10 });
  await page.mouse.up();
}

test("a move shows a toast whose Undo reverts the operation", async ({ page }) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  const guides = sectionCard(page, "Guides");
  const tutorials = sectionCard(page, "Tutorials");
  await drag(
    page,
    guides.getByText("Versioning", { exact: true }),
    tutorials.getByText("Build Your First Site", { exact: true }),
    { xr: 0.5, yr: 0.15 },
  );
  await expect(tutorials.getByText("Versioning", { exact: true })).toBeVisible();

  // toast with the command label + Undo action. Exact title match — the
  // later "Undone: …" confirmation must not satisfy this.
  //
  // This drag crosses cards, so it is a REPARENT and the toast NAMES it
  // (docs/16): restructures arrive in bursts, and "Move 1 topic" beside
  // the fortieth undo step says nothing about which one is about to be
  // reverted. A reorder keeps the count.
  const toast = page
    .locator("[data-sonner-toast]")
    .filter({ has: page.getByText('Move "Versioning"', { exact: true }) });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();

  await expect(guides.getByText("Versioning", { exact: true })).toBeVisible();
  await expect(tutorials.getByText("Versioning", { exact: true })).toBeHidden();
  // the operation toast dismissed itself before undoing (stable ids per entity)
  await expect(toast).toBeHidden();
  await expect(
    page.locator("[data-sonner-toast]", { hasText: 'Undone: Move "Versioning"' }),
  ).toBeVisible();

  console_.assertClean();
});

test("undoing a section-create leaves a fading ghost at the card's rect", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  const gettingStarted = sectionCard(page, "Getting Started");
  await drag(
    page,
    gettingStarted.getByText("Installation", { exact: true }),
    page.getByTestId("canvas"),
    { xr: 0.97, yr: 0.4 },
  );
  await expect(page.getByTestId("card")).toHaveCount(9);

  await page.keyboard.press("Control+z");
  // ghost shell appears immediately with the undo…
  await expect(page.getByTestId("ghost-card")).toBeVisible();
  // …and burns out on its own
  await expect(page.getByTestId("ghost-card")).toHaveCount(0, { timeout: 2000 });
  await expect(page.getByTestId("card")).toHaveCount(8);

  console_.assertClean();
});

test("reduced motion: no ghosts, same end states", async ({ page }) => {
  const console_ = watchConsole(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loadSample(page);

  const gettingStarted = sectionCard(page, "Getting Started");
  await drag(
    page,
    gettingStarted.getByText("Installation", { exact: true }),
    page.getByTestId("canvas"),
    { xr: 0.97, yr: 0.4 },
  );
  await expect(page.getByTestId("card")).toHaveCount(9);

  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("card")).toHaveCount(8);
  // motion collapsed: the ghost never spawns
  await expect(page.getByTestId("ghost-card")).toHaveCount(0);
  await expect(gettingStarted.getByText("Installation", { exact: true })).toBeVisible();

  console_.assertClean();
});

test("undo/redo via keyboard show confirmation toasts", async ({ page }) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  await page.getByRole("heading", { name: "Guides", exact: true }).dblclick();
  await page.getByTestId("inline-edit").fill("Handbook");
  await page.getByTestId("inline-edit").press("Enter");
  await expect(
    page.locator("[data-sonner-toast]", { hasText: "Rename section" }),
  ).toBeVisible();

  await page.keyboard.press("Control+z");
  await expect(
    page.locator("[data-sonner-toast]", { hasText: "Undone: Rename section" }),
  ).toBeVisible();

  await page.keyboard.press("Control+Shift+z");
  await expect(
    page.locator("[data-sonner-toast]", { hasText: "Redone: Rename section" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Handbook" })).toBeVisible();

  console_.assertClean();
});
