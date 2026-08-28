/**
 * Flow 1 (docs/07 Layer 5): Load sample → cards render, counts match
 * the fixture. Fixture facts are asserted literally against the DocFX
 * sample (src/formats/samples/docfx-sample.yml):
 *   8 top-level entries → 8 cards (5 regular sections, 3 orphans:
 *   Overview, FAQ, Release Notes); Getting Started holds 9 topics.
 */

import { expect, test } from "@playwright/test";
import { watchConsole } from "./helpers";

test("load sample renders cards with correct counts", async ({ page }) => {
  const console_ = watchConsole(page);
  await page.goto("/");

  // Empty state → load the DocFX sample
  await page.getByTestId("empty-load-sample-docfx").click();

  // Header reflects the loaded document
  await expect(page.getByTestId("doc-name")).toHaveText("Toc");
  await expect(page.getByTestId("doc-stats")).toContainText("8 sections");
  await expect(page.getByTestId("doc-stats")).toContainText("35 topics");

  // 8 cards: 5 regular + 3 orphan (compact)
  const cards = page.getByTestId("card");
  await expect(cards).toHaveCount(8);
  await expect(page.locator('[data-card-variant="section"]')).toHaveCount(5);
  await expect(page.locator('[data-card-variant="orphan"]')).toHaveCount(3);

  // Per-card topic counts match the fixture
  const cardByTitle = (title: string) =>
    page.locator('[data-card-variant="section"]', { hasText: title });
  await expect(cardByTitle("Getting Started").getByTestId("topic-count")).toHaveText("9");
  await expect(cardByTitle("Tutorials").getByTestId("topic-count")).toHaveText("4");
  await expect(cardByTitle("API Reference").getByTestId("topic-count")).toHaveText("7");

  // Orphan cards render compact with their titles
  await expect(page.locator('[data-card-variant="orphan"]')).toContainText([
    "Overview",
    "FAQ",
    "Release Notes",
  ]);

  // Sidebar lists all sections in order; minimap is present
  await expect(page.getByTestId("section-list").locator("li")).toHaveCount(8);
  await expect(page.getByTestId("minimap")).toBeVisible();

  // The nested-TOC badge appears (Reference TOCs → nested/toc.yml)
  await expect(
    page.getByTestId("card").getByText("TOC", { exact: true }).first(),
  ).toBeVisible();

  console_.assertClean();
});

test("depth controls and selection routing work", async ({ page }) => {
  const console_ = watchConsole(page);
  await page.goto("/");
  await page.getByTestId("empty-load-sample-docfx").click();

  // Global: collapse all → level-2 topics hidden (level-1 rows stay)
  await expect(page.getByTestId("depth-scope")).toContainText("all cards");
  const level2Row = page.getByText("Markdown Syntax", { exact: true });
  await expect(level2Row).toBeVisible();
  await page.getByRole("button", { name: "Collapse all" }).click();
  await expect(level2Row).toBeHidden();
  await expect(page.getByText("Installation", { exact: true })).toBeVisible();

  // Select a card → routing switches to the selected card
  await page.locator('[data-card-variant="section"]', { hasText: "Guides" }).click();
  await expect(page.getByTestId("depth-scope")).toContainText("selected card");

  // Escape clears the selection
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("depth-scope")).toContainText("all cards");

  console_.assertClean();
});

test("zoom controls clamp and fit", async ({ page }) => {
  const console_ = watchConsole(page);
  await page.goto("/");
  await page.getByTestId("empty-load-sample-docfx").click();

  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(page.locator("text=90%")).toBeVisible();
  await page.getByRole("button", { name: "Zoom 50%" }).click();
  await expect(page.locator("text=50%")).toBeVisible();
  // the slider drives continuous zoom
  await page.getByTestId("zoom-slider").fill("150");
  await expect(page.locator("text=150%")).toBeVisible();
  await page.getByRole("button", { name: "Fit to view" }).click();
  // fit never zooms in past 100%
  const pct = await page.getByText(/^\d+%$/).textContent();
  expect(Number(pct!.replace("%", ""))).toBeLessThanOrEqual(100);

  console_.assertClean();
});
