/**
 * Flow 17 — structural remainders, PAINTED (docs/22, Decisions 3–5).
 *
 * VERIFY THE PAINT, NOT JUST THE STATE. Every surface this arc adds is a
 * claim about what a person SEES: a mark on a card, a line in the
 * Overview, an item in Review's checklist. Each of those can be present,
 * correctly sized, `toBeVisible()`-passing and still invisible — three
 * defects in this repo were exactly that, and the language picker
 * rendered inside a 21px `overflow-hidden` chip with every text
 * assertion green.
 *
 * WHICH ORACLE EACH CHECK USED, stated per assertion because a green
 * result must not be able to quietly mean the weaker check ran:
 *
 *   - HIT TEST (`elementFromPoint` at the element's own pixels) wherever
 *     the element participates in hit testing. This answers "is anything
 *     on top of this?" and it is the strong oracle.
 *   - RENDERED-NESS (non-zero box + visibility + display + opacity) for
 *     anything the pointer passes through. `elementFromPoint` can never
 *     return a `pointer-events: none` element, so probing one reports
 *     "occluded" for something plainly on screen.
 *
 * The Sphinx project is imported through the REAL folder path with
 * `showDirectoryPicker` deleted — the webkitdirectory fallback, which is
 * the branch most likely to rot unseen.
 *
 * NO PROVIDER, NO KEY. Every remainder here is produced by a HAND
 * gesture on a `createCards: false` document, which was exactly the
 * Substrate's finding: the canvas COMMITTED an arrangement Review had to
 * refuse. Arc 1 made that arrangement legible; arc 2 put a question in
 * front of the gesture, so `moveRowToNewCard` now answers a seam before
 * a card exists. Nothing this file asserts moved with it — every claim
 * here is about what happens after.
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
    ".. toctree::",
    "   :caption: Guides",
    "",
    "   guides/index",
    "",
    ".. toctree::",
    "   :caption: Reference",
    "",
    "   reference/api",
    "   reference/cli",
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
  "guides/install.rst": "Install\n=======\n\nbody\n",
  "guides/usage.rst": "Usage\n=====\n\nbody\n",
  "reference/api.rst": "API\n===\n\nbody\n",
  "reference/cli.rst": "CLI\n===\n\nbody\n",
};

let folder: string;

test.beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "toc-remainders-"));
  for (const [path, content] of Object.entries(PROJECT)) {
    const abs = join(folder, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
});

/**
 * THE HIT-TEST ORACLE. Answers "is this element the topmost thing at its
 * own pixels?" — only valid for hit-test PARTICIPANTS.
 */
async function hitTest(target: Locator): Promise<boolean> {
  return target.evaluate((el) => {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    if (y < 0 || y >= window.innerHeight || x < 0 || x >= window.innerWidth) return false;
    const at = document.elementFromPoint(x, y);
    return at !== null && (at === el || el.contains(at) || at.contains(el));
  });
}

/**
 * THE RENDERED-NESS ORACLE, for anything the pointer passes through.
 * Weaker than a hit test and reported as such wherever it is used.
 */
async function rendered(target: Locator): Promise<boolean> {
  return target.evaluate((el) => {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    const style = getComputedStyle(el);
    return (
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity) > 0.05
    );
  });
}

async function importProject(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
  });
  await page.goto("/");
  await page.getByTestId("empty-open-dialog").click();
  await page.getByTestId("load-folder-input").setInputFiles(folder);
  await expect(page.getByTestId("card").first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Create a card from the first row of a named card, through the shipped
 * gesture.
 *
 * ARC 2 PUT A QUESTION IN FRONT OF IT (docs/22, Decision 7). This
 * document answers `createCards: false`, so a structure-MAKING gesture
 * now opens the consent seam before it makes anything — including this
 * menu command, which goes through the same gate as the drag for the
 * reason `birthOrSeam` gives at its own declaration. Answering it is
 * part of the gesture now, not part of the assertion: everything this
 * file claims is about what happens AFTER a card exists.
 */
async function moveRowToNewCard(page: Page, rowTitle: string): Promise<void> {
  const row = page.locator("[data-topic-row]").filter({ hasText: rowTitle }).first();
  await row.click();
  await row.click({ button: "right" });
  await expect(page.getByTestId("context-menu")).toBeVisible();
  await page.getByRole("menuitem", { name: /Move to new card/ }).click();
  const seam = page.getByTestId("context-menu");
  await expect(seam).toBeVisible();
  await seam.getByRole("menuitem", { name: /Switch this tab to Aspirational/ }).click();
}

test("flow 17: a created card wears the intent mark, and the mark is PAINTED", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await importProject(page);

  const before = await page.getByTestId("card").count();
  await moveRowToNewCard(page, "Api");
  await expect(page.getByTestId("card")).toHaveCount(before + 1);

  // ── the mark exists, and it is the CREATED one ────────────
  const mark = page.getByTestId("card-mark-created");
  await expect(mark).toHaveCount(1);
  await expect(mark).toHaveAttribute("data-card-mark", "created");

  // ORACLE: hit test. The mark is an ordinary inline span in the card
  // header and participates in hit testing, so the strong oracle applies
  // — presence would only prove the code ran, which was never in doubt.
  expect(await hitTest(mark), "the created mark must be topmost at its own pixels").toBe(
    true,
  );

  // ── the TONE is the intent token, read back from the paint ─
  const color = await mark.evaluate((el) => getComputedStyle(el).color);
  const intent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--color-intent").trim(),
  );
  // Compared as RENDERED values: the element reports rgb(), the token is
  // authored as a hex literal, so the token is resolved through the same
  // engine rather than string-matched.
  const asRgb = await page.evaluate((hex) => {
    const probe = document.createElement("span");
    probe.style.color = hex;
    document.body.append(probe);
    const out = getComputedStyle(probe).color;
    probe.remove();
    return out;
  }, intent);
  expect(color, "the created mark wears --color-intent").toBe(asRgb);

  console_.assertClean();
});

test("flow 17: the Overview names the imagined card, and the line is PAINTED", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await importProject(page);
  await moveRowToNewCard(page, "Api");

  await page.getByTestId("overview-button").click();
  const panel = page.getByTestId("overview-panel");
  await expect(panel).toBeVisible();

  const line = panel.getByText(/Cards imagined that this system cannot record/);
  await expect(line).toHaveCount(1);

  // ORACLE: hit test. The panel line is ordinary text in an ordinary
  // list item; nothing about it is pointer-transparent.
  expect(await hitTest(line), "the Overview line must be topmost at its own pixels").toBe(
    true,
  );

  // COMPOSED CONTENT ESCAPES ITS WRAPPER: the receipt is a second line
  // under the label, and a single truncating span would eat it while
  // every text assertion passed.
  const receipt = panel.getByText(/the checklist says what would/);
  expect(
    await rendered(receipt),
    "ORACLE: rendered-ness — the receipt must have a real box",
  ).toBe(true);

  console_.assertClean();
});

test("flow 17: Review lists the remainder with its remedy, and applies the rest", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await importProject(page);

  // A REAL, WRITABLE EDIT rides alongside the imagined one, so the split
  // is between something and something — not between nothing and one
  // refusal, which any implementation would pass.
  //
  // GRAB A CONTENT ANCHOR, NEVER A ROW'S CENTRE. A row's centre is empty
  // trailing space that rubber-bands into a selection box instead of
  // dragging — which produces no gesture at all and reads, downstream,
  // as an empty plan. The first version of this test did exactly that
  // and the zero it produced looked like a projection defect.
  const guidesCard = page
    .locator('[data-card-variant="section"]')
    .filter({ has: page.getByRole("heading", { name: "Guides", exact: true }) });
  // THE ROW'S TITLE SPAN, located through the row rather than by exact
  // text: `hasText` is a case-insensitive substring match while
  // `getByText(..., { exact: true })` is neither, and these titles come
  // from each document's own H1 ("CLI", not "Cli"). Reading the title
  // back from the row is what makes the anchor independent of that.
  const cliRow = page.locator("[data-topic-row]").filter({ hasText: "cli" }).first();
  const cliText = cliRow.locator("span.truncate").first();
  await cliText.click();
  // Boxes read IMMEDIATELY BEFORE USE: one captured earlier points at
  // whatever slid into those coordinates after the click's layout pass.
  const from = (await cliText.boundingBox())!;
  const target = guidesCard.locator("[data-topic-row]").first();
  const to = (await target.boundingBox())!;
  const sx = from.x + from.width / 2;
  const sy = from.y + from.height / 2;
  // The row's TOP EDGE, which drop resolution reads as "before this row"
  // — a SIBLING. Aiming at the middle makes it a CHILD.
  const tx = to.x + to.width / 2;
  const ty = to.y + 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 6 });
  await page.mouse.move(tx, ty, { steps: 10 });
  await page.mouse.up();

  // THE DRAG ACTUALLY MOVED SOMETHING — asserted before anything is
  // concluded from a count of zero. A drag that silently rubber-banded
  // would make an empty plan look like a projection defect.
  await expect(
    guidesCard.locator("[data-topic-row]").filter({ hasText: "Cli" }),
  ).toHaveCount(1);

  await moveRowToNewCard(page, "Api");

  await page.getByTestId("review-changes-button").click();
  const dialog = page.getByTestId("changes-dialog");
  await expect(dialog).toBeVisible();

  // ── the checklist item, painted ───────────────────────────
  const checklist = dialog.getByTestId("aspirational-checklist");
  await expect(checklist).toBeVisible();
  const item = checklist.getByTestId("checklist-item").first();
  // ORACLE: hit test.
  expect(await hitTest(item), "the checklist item must be topmost at its pixels").toBe(
    true,
  );

  // THE REMEDY NAMES THE SMALLEST REAL ACT, in the format's own words.
  await expect(checklist).toContainText("toctree block");
  await expect(checklist).toContainText("index");

  // ── the counts say their units ────────────────────────────
  await expect(checklist).toContainText(/new card/);

  // ── AND THE WRITABLE PART STILL APPLIES. Without the projection the
  //    whole plan dies at `section-set-changed`; this is the assertion
  //    that the split is real rather than a nicer error message.
  const rows = dialog.getByTestId("changes-list").locator("li");
  expect(
    await rows.count(),
    "the writable part of the plan must survive the remainder",
  ).toBeGreaterThan(0);

  console_.assertClean();
});

test("flow 17: a card with nowhere to go wears the WARNING mark, painted", async ({
  page,
}) => {
  /**
   * A DIFFERENT DOCUMENT AND A DIFFERENT TIER, deliberately. A
   * tabs-rooted docs.json holds containers at its top level, so a card in
   * none of them has nowhere legal to go — and unlike an imagined card,
   * that state BLOCKS the export. It is the one card mark that earns the
   * warning token, and the salience economy only works if that stays
   * true.
   *
   * The refusal at Save is the FLOOR and stops being the first notice:
   * this mark is on screen from the moment the card exists.
   *
   * THE PRODUCER MOVED IN ARC 2, and the claim did not. This used to
   * create the state with the row menu — a card created on canvas took
   * no chain, landed in the root queue, and a tabs root bears nothing.
   * docs/22's Decision 2 ruled that away: the drop position NAMES the
   * home, so a born card takes a chain that bears it, and any drop whose
   * home bears neither species is refused outright ("nothing is born
   * unhoused"). The state is still reachable from a FILE — a hand-edited
   * docs.json with a bare page string in `tabs`, which is exactly what
   * M1 measured as writing schema-invalid bytes unrefused — so the
   * fixture supplies it rather than a gesture that can no longer make
   * one.
   */
  const console_ = watchConsole(page);
  const STRAY = JSON.stringify(
    {
      name: "Stray",
      navigation: { tabs: [{ tab: "Guides", pages: ["intro", "setup"] }, "stray-page"] },
    },
    null,
    2,
  );
  await page.goto("/");
  await page.getByTestId("empty-open-dialog").click();
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await page.getByTestId("load-paste-input").fill(STRAY);
  await page.getByRole("button", { name: "Load pasted TOC" }).click();
  await expect(page.getByTestId("card").first()).toBeVisible();

  const mark = page.getByTestId("card-mark-unhoused");
  await expect(mark).toHaveCount(1);

  // ORACLE: hit test — the mark is an ordinary span in the card header.
  expect(await hitTest(mark), "the unhoused mark must be topmost at its pixels").toBe(
    true,
  );

  // THE TIER, read back from the paint rather than from the source.
  const color = await mark.evaluate((el) => getComputedStyle(el).color);
  const warning = await page.evaluate(() => {
    const hex = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-warning")
      .trim();
    const probe = document.createElement("span");
    probe.style.color = hex;
    document.body.append(probe);
    const out = getComputedStyle(probe).color;
    probe.remove();
    return out;
  });
  expect(color, "the unhoused mark wears --color-warning").toBe(warning);

  // AND IT IS THE ONLY ONE: a created card that is also unhoused shows
  // the mark that blocks, never both.
  await expect(page.getByTestId("card-mark-created")).toHaveCount(0);

  console_.assertClean();
});
