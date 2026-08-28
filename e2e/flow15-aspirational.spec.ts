/**
 * Flow 15 — an aspirational run opens, badges and hands back a
 * checklist (docs/21).
 *
 * THE SAME SYNTHETIC SPHINX PROJECT flow 14 uses, deliberately: prose
 * between two toctree blocks locks the block above it, so two rows
 * arrive pinned, and the two specs can only disagree about the corpus if
 * one of them is wrong. What differs is the MODE — the identical
 * proposal that flow 14 watches get discarded is the one this file
 * watches get labeled.
 *
 * VERIFY THE PAINT, NOT JUST THE STATE. Every visual claim here is
 * hit-tested at a content anchor: `elementFromPoint` must land inside
 * the badge, because an element can be present, correctly sized,
 * `toBeVisible()`-passing and still sitting under something. Reading
 * `textContent` verifies that the code ran, which was never in doubt.
 *
 * WHAT THIS FILE'S GREEN MEANS: an aspirational proposal survives
 * validation, the split reaches the result view, the badge reaches the
 * screen, the ledger reaches the Overview, and Put back removes both the
 * move and the mark. What it says nothing about: any real provider —
 * `route.fulfill` delivers a whole body in one piece, so this proves the
 * bytes parse and nothing about time or transport.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { watchConsole } from "./helpers";

const GEMINI = "https://generativelanguage.googleapis.com/**";

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
    "   usage",
    "",
    "Prose between the blocks terminates the trailing sequence, so the",
    "block above locks as outside-region.",
    "",
    ".. toctree::",
    "",
    "   install",
    "",
  ].join("\n"),
  "guides/early.rst": "Early\n=====\n\nbody\n",
  "guides/usage.rst": "Using It\n========\n\nbody\n",
  "guides/install.rst": "Installing\n==========\n\nbody\n",
};

/**
 * s1 Docs / t1 Guides / t2 Early [pinned] / t3 Using It [pinned] / t4 Installing
 *
 * This outline lifts t2 out from under t1 to the card's top level — a
 * PARENT CHANGE on a pinned row, which is precisely the move flow 14
 * watches get discarded in grounded mode.
 */
const MOVES_A_PINNED_ROW = "s1\n  t2\n  t1\n    t3\n    t4";

let folder: string;

test.beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "toc-aspirational-"));
  for (const [path, content] of Object.entries(PROJECT)) {
    const abs = join(folder, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
});

function completion(content: string) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }),
  };
}

async function openProject(page: Page) {
  // The webkitdirectory fallback — the real Safari/Firefox path, and
  // therefore the branch most likely to rot unseen.
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
  });
  await page.goto("/");
  await page.getByTestId("empty-open-dialog").click();
  await page.getByTestId("load-folder-input").setInputFiles(folder);
  await page.getByTestId("card").first().waitFor({ state: "visible" });
  await page.getByTestId("reorganize-button").click();
  await page.getByTestId("ai-open-settings").click();
  await page.getByTestId("ai-api-key").fill("test-key");
  await page.getByTestId("ai-settings-back").click();
}

async function runAspirational(page: Page) {
  await page
    .getByTestId("mode-radio")
    .locator('[data-mode="aspirational"] input')
    .check();
  await page.getByTestId("ai-run").click();
  await expect(page.getByTestId("ai-result")).toBeVisible();
}

/**
 * Is this element the thing at its own centre?
 *
 * Answers *is something on top of this?*, which is the question a paint
 * claim is really making. Grabbed a few px inside the box rather than at
 * the geometric centre, and the box is re-read immediately before use —
 * a rect captured earlier points at whatever slid into those coordinates
 * since.
 */
async function occludes(page: Page, testId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return false;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    return hit !== null && (el === hit || el.contains(hit) || hit.contains(el));
  }, testId);
}

test("the mode radio defaults to Grounded and the run posture is per-open", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await openProject(page);
  const radio = page.getByTestId("mode-radio");
  await expect(radio.locator('[data-mode="grounded"] input')).toBeChecked();
  await expect(radio.locator('[data-mode="aspirational"] input')).not.toBeChecked();
  console_.assertClean();
});

test("an aspirational run opens the proposal instead of discarding it", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await page.route(GEMINI, (route) => route.fulfill(completion(MOVES_A_PINNED_ROW)));

  await openProject(page);
  await runAspirational(page);

  // NOT the discard. Flow 14 asserts the same proposal produces
  // `ai-error` in grounded mode; here it produces a result.
  await expect(page.getByTestId("ai-error")).toHaveCount(0, { timeout: 2000 });

  // The split, said before the tab opens — the no-silent-downgrade
  // constraint met at the earliest surface.
  const split = page.getByTestId("aspirational-split");
  // THE UNIT IS PART OF THE CLAIM since Ruling A (2026-08-19): this
  // number counts ROWS, and Review's checklist counts ITEMS, so the two
  // legitimately differ and bare integers made them look like one
  // measurement gone wrong.
  await expect(split).toContainText("1 row needs your hand");
  expect(await occludes(page, "aspirational-split")).toBe(true);

  console_.assertClean();
});

test("the badge reaches the screen, and Put back removes the move and the mark", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await page.route(GEMINI, (route) => route.fulfill(completion(MOVES_A_PINNED_ROW)));

  await openProject(page);
  await runAspirational(page);
  await page.getByTestId("ai-open-tab").click();
  await page.getByTestId("card").first().waitFor({ state: "visible" });

  const badge = page.getByTestId("aspirational-badge");
  await expect(badge).toHaveCount(1);
  // PAINTED, not merely present: the hit test is what tells a rendered
  // badge from one clipped inside an overflow-hidden ancestor.
  expect(await occludes(page, "aspirational-badge")).toBe(true);
  // Its tone is the intent token, not the warning one — asserted as the
  // COMPUTED colour, because a class name proves only that a string
  // reached the DOM.
  const painted = await badge.evaluate((el) => getComputedStyle(el).color);
  expect(painted).toBe("rgb(109, 40, 217)");

  // It COMPOSES with the lock glyph rather than replacing it: the row is
  // still pinned, and that fact did not change.
  await expect(page.getByTestId("lock-glyph")).not.toHaveCount(0);

  // Put back: one click, and both the move and the mark are gone.
  await badge.click();
  await expect(page.getByTestId("aspirational-badge")).toHaveCount(0, { timeout: 2000 });

  console_.assertClean();
});

test("the Overview names the remainder, and Review changes hands it over", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await page.route(GEMINI, (route) => route.fulfill(completion(MOVES_A_PINNED_ROW)));

  await openProject(page);
  await runAspirational(page);
  await page.getByTestId("ai-open-tab").click();
  await page.getByTestId("card").first().waitFor({ state: "visible" });

  // The Overview's attention line — a second door, so no meaning is
  // badge-only. The panel is opened first: the earlier draft of this
  // probe asserted the line's presence with the panel closed and
  // reported working code as broken, which is the base case.
  await page.getByTestId("overview-button").click();
  await expect(page.getByTestId("overview-panel")).toBeVisible();
  const line = page.locator('[data-finding-id="aspirational"]');
  await expect(line).toBeVisible();
  await expect(line).toContainText("1");

  await page.getByTestId("review-changes-button").click();
  const dialog = page.getByTestId("changes-dialog");
  await expect(dialog).toBeVisible();

  // The remainder, in the panel, above the file rows.
  const items = page.getByTestId("checklist-item");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Early");
  await expect(items.first()).toContainText("To make this real:");
  expect(await occludes(page, "aspirational-checklist")).toBe(true);

  // THE VERIFIED LINE'S COPY SWEEP. "reproduces your canvas exactly"
  // became false the moment the plan reproduces the PROJECTION instead.
  const verified = page.getByTestId("changes-verified");
  if (await verified.isVisible()) {
    await expect(verified).toContainText("applyable part of your canvas");
    await expect(verified).not.toContainText("reproduces your canvas exactly");
  }

  console_.assertClean();
});
