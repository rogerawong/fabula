/**
 * M7: the second adapter proves the plugin story end-to-end — the
 * MkDocs sample loads, renders, and exports through the app with the
 * surrounding config intact.
 */

import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { expect, test } from "@playwright/test";
import { watchConsole } from "./helpers";

test("mkdocs sample loads, renders, and exports with config preserved", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await page.goto("/");
  await page.getByTestId("empty-load-sample-mkdocs").click();

  // 7 top-level nav entries → 4 sections + 3 orphans
  await expect(page.getByTestId("card")).toHaveCount(7);
  await expect(page.locator('[data-card-variant="section"]')).toHaveCount(4);
  await expect(page.locator('[data-card-variant="orphan"]')).toHaveCount(3);
  await expect(page.getByTestId("doc-stats")).toContainText("7 sections");
  await expect(page.getByTestId("doc-stats")).toContainText("21 topics");
  // bare-path entries render with derived titles
  await expect(
    page.locator('[data-card-variant="orphan"]', { hasText: "Changelog" }),
  ).toBeVisible();

  // export keeps the surrounding mkdocs config
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-button").click();
  const download = await downloadPromise;
  const parsed = yaml.load(readFileSync((await download.path())!, "utf8")) as Record<
    string,
    unknown
  >;
  expect(parsed.site_name).toBe("Fable Docs");
  expect(Array.isArray(parsed.nav)).toBe(true);
  expect(parsed.plugins).toEqual(["search", "tags"]);

  console_.assertClean();
});
