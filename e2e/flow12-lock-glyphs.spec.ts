/**
 * Flow 12 — the lock glyph system at rest and on hover (polish-glyphs).
 *
 * A synthetic Sphinx project whose one child document produces four
 * lock kinds — outside-region (a block above prose), pattern + globbed
 * (a `:glob:` block holding a pattern line and a plain docname),
 * missing (an entry naming no file) — plus the error tier's second
 * door in the Overview.
 *
 * Three claims the unit suite cannot make:
 * - the glyph and its STYLED tooltip actually paint on hover (native
 *   `title` is retired — the tooltip is a DOM element we can assert);
 * - the text chips are ABSENT — retired chrome is a claim about the
 *   build, and only a browser can show nothing renders;
 * - the Overview's missing line arrives as an attention line with the
 *   docname as its subject.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { expect, test } from "@playwright/test";
import { watchConsole } from "./helpers";

const PROJECT: Record<string, string> = {
  "conf.py": 'master_doc = "index"\nsource_suffix = ".rst"\n',
  "index.rst": ["Docs", "====", "", ".. toctree::", "", "   guides/index", ""].join("\n"),
  "guides/index.rst": [
    "Guides",
    "======",
    "",
    ".. toctree::",
    "",
    "   early",
    "",
    "Prose between the blocks, which terminates the trailing sequence,",
    "so the block above locks as outside-region.",
    "",
    ".. toctree::",
    "   :glob:",
    "",
    "   auto/*",
    "   usage",
    "",
    ".. toctree::",
    "",
    "   install",
    "   ghost",
    "",
  ].join("\n"),
  "guides/early.rst": "Early\n=====\n\nbody\n",
  "guides/usage.rst": "Using It\n========\n\nbody\n",
  "guides/install.rst": "Installing\n==========\n\nbody\n",
  "guides/auto/one.rst": "One\n===\n\nbody\n",
};

let folder: string;

test.beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "toc-glyphs-"));
  for (const [path, content] of Object.entries(PROJECT)) {
    const abs = join(folder, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
});

test("flow 12: glyphs replace chips, tooltips are styled, missing gets a second door", async ({
  page,
}) => {
  const console_ = watchConsole(page);

  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
  });
  await page.goto("/");
  await page.getByTestId("empty-open-dialog").click();
  await page.getByTestId("load-folder-input").setInputFiles(folder);
  await page.getByTestId("card").first().waitFor({ state: "visible" });

  // ── resting state: one glyph per locked row, per kind ─────
  for (const kind of ["outside-region", "pattern", "globbed", "missing"]) {
    await expect(
      page.locator(`[data-lock-kind="${kind}"]`).first(),
      `a ${kind} glyph renders`,
    ).toBeVisible();
  }
  // The tiers: missing is the error tier, everything else is state.
  await expect(page.locator('[data-lock-kind="missing"]').first()).toHaveAttribute(
    "data-lock-tier",
    "error",
  );
  await expect(page.locator('[data-lock-kind="outside-region"]').first()).toHaveAttribute(
    "data-lock-tier",
    "state",
  );

  // ── the chips are RETIRED — assert the absence, fast ──────
  // Absence is the expected answer, so these do not wait 30 seconds
  // for something that must never come.
  for (const chip of ["Above prose", "Glob block", "Missing", "Pattern"]) {
    expect(
      await page.locator("[data-topic-row]").getByText(chip, { exact: true }).count(),
      `chip text "${chip}" must not render on any row`,
    ).toBe(0);
  }

  // ── hover: the styled tooltip, not native title ───────────
  const glyph = page.locator('[data-lock-kind="outside-region"]').first();
  await expect(glyph).not.toHaveAttribute("title", /./);
  await glyph.hover();
  const tip = page.getByTestId("styled-tooltip");
  await expect(tip).toBeVisible();
  // "Above prose" is the first line; the remedy names the fix.
  await expect(tip).toContainText("Above prose");
  await expect(tip).toContainText("move the toctree to the file's end");
  // The tip is pointer-events: none — NOT a hit-test participant — so
  // the oracle here is rendered-ness: a real box on screen, unclipped.
  const box = await tip.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(40);
  await page.mouse.move(10, 10); // leave — the tip must clear
  await expect(tip).toHaveCount(0);

  // ── the missing tooltip states cause and remedy ───────────
  await page.locator('[data-lock-kind="missing"]').first().hover();
  await expect(page.getByTestId("styled-tooltip")).toContainText(
    "does not exist in the project",
  );
  await page.mouse.move(10, 10);

  // ── Overview: the error tier's second door ────────────────
  await page.getByTestId("overview-button").click();
  const missingLine = page.locator('[data-finding-id="missing-targets"]');
  await expect(missingLine).toBeVisible();
  await expect(missingLine).toHaveAttribute("data-severity", "warning");
  // The docname is the subject — a door onto the canvas. (The label is
  // the derived title, "Ghost" — titled from the path, as all missing
  // targets are.)
  await expect(missingLine.getByTestId("overview-focus")).toContainText(/ghost/i);
  // And the above-prose line names its carrier file.
  const aboveLine = page.locator('[data-finding-id="above-prose"]');
  await expect(aboveLine).toBeVisible();
  await expect(aboveLine.getByTestId("overview-focus").first()).toContainText("Guides");

  console_.assertClean();
});
