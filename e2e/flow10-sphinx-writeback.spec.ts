/**
 * Flow 10 — Sphinx write-back (docs/19), through the REAL folder-import
 * path: `webkitdirectory` on a temp project, ingest → detect → parse →
 * drag → plan → Review.
 *
 * VERIFY THE PAINT, NOT JUST THE STATE. The unit suite proves the
 * planner declares an entry move; it cannot prove anyone can see it. A
 * row can be present, correctly sized, `toBeVisible()`-passing and still
 * invisible — the language picker rendered inside a 21px
 * `overflow-hidden` chip and every text assertion passed. So the move
 * row gets a HIT TEST: `elementFromPoint` at its centre must land inside
 * it.
 *
 * The move here is CROSS-FILE by construction — `install` leaves
 * `guides/index.rst` and arrives in `index.rst` — which is the shape the
 * whole step exists for: one gesture, two `navTail` edits, one row.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { watchConsole } from "./helpers";

const PROJECT: Record<string, string> = {
  "conf.py": 'master_doc = "index"\nsource_suffix = ".rst"\n',
  "index.rst": [
    "Docs",
    "====",
    "",
    "Prose above the nav, which the region does not own.",
    "",
    ".. toctree::",
    "   :caption: Guides",
    "",
    "   guides/index",
    "",
    ".. toctree::",
    "   :caption: Reference",
    "",
    "   reference/api",
    "",
  ].join("\n"),
  "guides/index.rst": [
    "Guides",
    "======",
    "",
    ".. toctree::",
    "",
    "   install",
    "   usage",
    "",
  ].join("\n"),
  "guides/install.rst": "Installing\n==========\n\nbody\n",
  "guides/usage.rst": "Using It\n========\n\nbody\n",
  "reference/api.rst": "API\n===\n\nbody\n",
};

let folder: string;

test.beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "toc-sphinx-"));
  for (const [path, content] of Object.entries(PROJECT)) {
    const abs = join(folder, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
});

const sectionCard = (page: Page, title: string): Locator =>
  page
    .locator('[data-card-variant="section"]')
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });

/**
 * Drag from a CONTENT anchor, never a row's centre: a row's centre is
 * empty trailing space that rubber-bands into a selection box instead of
 * dragging, which reads as a feature that does not work.
 *
 * Boxes are read IMMEDIATELY BEFORE USE. A box captured earlier points
 * at whatever slid into those coordinates after the first layout change.
 */
async function drag(page: Page, from: Locator, to: Locator) {
  const f = (await from.boundingBox())!;
  const t = (await to.boundingBox())!;
  const sx = f.x + f.width / 2;
  const sy = f.y + f.height / 2;
  // The row's TOP EDGE, which drop resolution reads as "before this
  // row" — a SIBLING. Aiming at the middle makes it a CHILD, and a
  // child of a page that hosts no toctree has nowhere to be written:
  // the first run of this spec landed there and crashed the planner,
  // which is now a named refusal and a unit test of its own.
  const tx = t.x + t.width / 2;
  const ty = t.y + 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 6 });
  await page.mouse.move(tx, ty, { steps: 10 });
  await page.mouse.up();
}

test("flow 10: a cross-file entry move reviews as ONE row", async ({ page }) => {
  const console_ = watchConsole(page);

  // The webkitdirectory fallback — the real Safari and Firefox path, and
  // the branch most likely to rot unseen.
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
  });
  await page.goto("/");
  await page.getByTestId("empty-open-dialog").click();
  await page.getByTestId("load-folder-input").setInputFiles(folder);

  const guides = sectionCard(page, "Guides");
  const reference = sectionCard(page, "Reference");
  await expect(guides).toBeVisible();
  await expect(reference).toBeVisible();

  // WRITE-BACK IS ON. Phase 1 disabled this button with a reason; the
  // capability is the planner's presence, so defining it enables this.
  const review = page.getByTestId("review-changes-button");
  await expect(review).toBeEnabled();

  await guides.getByText("Installing", { exact: true }).click();
  // Boxes are read inside `drag`, immediately before use — the click
  // above expands nothing here, but a batch of boxes captured up front
  // is how the docs/16 reparent spec grabbed the wrong row.
  await drag(
    page,
    guides.getByText("Installing", { exact: true }),
    reference.getByText("API", { exact: true }),
  );
  await expect(reference.getByText("Installing", { exact: true })).toBeVisible();

  await review.click();
  await expect(page.getByTestId("changes-dialog")).toBeVisible();

  // ONE row for the gesture, naming the entry and both cards.
  const move = page.getByTestId("entry-move");
  await expect(move).toHaveCount(1);
  await expect(move).toContainText("Installing");
  await expect(move).toContainText("Guides");
  await expect(move).toContainText("Reference");
  await expect(move).toContainText("2 files");

  // THE PAINT, not the predicate: presence and size prove the code ran,
  // which was never in doubt. This asks whether anything is on top of it.
  const painted = await move.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return { ok: false, why: "zero-size" };
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { ok: hit !== null && (el === hit || el.contains(hit)), why: "hit-test" };
  });
  expect(painted).toEqual({ ok: true, why: "hit-test" });

  // And the file rows STAY: the summary collapses on purpose and says so,
  // it does not replace the answer to what will be written.
  const list = page.getByTestId("changes-list");
  await expect(list).toContainText("index.rst");
  await expect(list).toContainText("guides/index.rst");

  console_.assertClean();
});
