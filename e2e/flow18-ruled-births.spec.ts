/**
 * Flow 18 — the HAND: what a drag-out makes, what the seam asks, and
 * what the placeholder says (docs/22 arc 2, Decisions 2 and 7).
 *
 * THE SAME SYNTHETIC SPHINX PROJECT flows 14–17 use, deliberately: five
 * specs can only disagree about the corpus if one of them is wrong. What
 * differs is the CLAIM — flow 17 watched a created card get labeled;
 * this one watches the gesture that creates it acquire a question first,
 * and watches the two ruled birth shapes come out different.
 *
 * WHAT THIS FILE'S GREEN MEANS, end to end: a canvas drop on a
 * `createCards: false` document OPENS THE SEAM instead of committing;
 * the seam's headline names its own cause in the format's own noun;
 * consenting flips the tab and lands a marked card; the checklist names
 * the remedy AND the placeholder; and the writable part of the plan
 * still applies underneath. It needs no provider — the seam is pure
 * interaction and nothing here makes a model call.
 *
 * WHAT IT SAYS NOTHING ABOUT: bytes on disk. No `.patch` is written and
 * no File System Access handle is used; the write-safety line is
 * `sphinx-corpus.spec`'s and the adapters' unit suites.
 *
 * WHICH ORACLE EACH CHECK USES, stated per assertion so a green result
 * cannot quietly mean the weaker one ran:
 *   - HIT TEST at the element's own pixels wherever it participates in
 *     hit testing — the strong oracle, and the one that answers the
 *     question a paint claim really makes.
 *   - RENDERED-NESS (non-zero box + visibility + display + opacity) for
 *     anything `pointer-events: none`, where `elementFromPoint` can
 *     never return the element and would report "occluded" for something
 *     plainly on screen.
 *
 * PROBE DISCIPLINE, inherited from flow 16 and not re-learned: geometry
 * is re-read immediately before each use and only after every running
 * animation has settled, and every grab ASSERTS that the point it is
 * about to press belongs to the row it means to press — a harness that
 * pressed the wrong row would report a product bug that is not there.
 * Grabs land on a row's TITLE, never its centre, because a row's centre
 * is trailing space that rubber-bands instead of dragging.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { watchConsole } from "./helpers";

/** Absence is an ANSWER here; it must not cost thirty seconds to give. */
const ABSENT = { timeout: 2000 };

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
    // A SECOND BLOCK, so the corpus has a second CARD. Without one there
    // is no writable move available at all, and "the writable part still
    // applies" would be asserted over an arrangement that has no
    // writable part — a claim that can only be vacuous or wrong.
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
  "guides/install.rst": "Install\n=======\n\nbody\n",
  "guides/usage.rst": "Usage\n=====\n\nbody\n",
  "reference/api.rst": "API\n===\n\nbody\n",
};

let folder: string;

test.beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "toc-ruled-births-"));
  for (const [path, content] of Object.entries(PROJECT)) {
    const abs = join(folder, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
});

/** THE HIT-TEST ORACLE — valid only for hit-test PARTICIPANTS. */
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

async function importProject(page: Page): Promise<void> {
  // The webkitdirectory fallback — the real Safari/Firefox path, and the
  // branch most likely to rot unseen.
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
  });
  await page.goto("/");
  await page.getByTestId("empty-open-dialog").click();
  await page.getByTestId("load-folder-input").setInputFiles(folder);
  await expect(page.getByTestId("card").first()).toBeVisible({ timeout: 15_000 });
}

/** The app FLIP-animates structural mutations, so a box read mid-flight
 *  reports where a row IS rather than where it is going. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
  );
}

const row = (page: Page, title: string): Locator =>
  page.locator("[data-topic-row]").filter({ hasText: title }).last();

/** Drag one row's TITLE to a point, asserting the grab lands where it
 *  means to. A grab on the wrong row reports the wrong finding. */
async function dragTitleTo(page: Page, title: string, to: { x: number; y: number }) {
  await settle(page);
  const handle = row(page, title).getByText(title, { exact: true });
  const f = (await handle.boundingBox())!;
  const sx = f.x + f.width / 2;
  const sy = f.y + f.height / 2;
  const landed = await page.evaluate(
    ([x, y]) =>
      document
        .elementFromPoint(x as number, y as number)
        ?.closest("[data-topic-row]")
        ?.textContent?.trim() ?? null,
    [sx, sy],
  );
  expect(landed, `grab point for "${title}" landed on ${landed}`).toContain(title);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move((sx + to.x) / 2, (sy + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

/**
 * An empty patch of canvas that nothing else is sitting on.
 *
 * TWO CONDITIONS, AND THE SECOND WAS LEARNED HERE. "Not a card" is not
 * enough: the app's toast region lives in the bottom-right at
 * `z-index: 999999999`, so a drop point chosen below the lowest card can
 * land under a live toast — and the seam menu then opens beneath it. The
 * first draft of this helper did exactly that, and the hit test failed
 * naming an `LI` the menu did not contain, which reads as "the seam is
 * occluded" and is really "the probe chose the corner where chrome
 * lives".
 *
 * (The underlying interaction is real and is reported as a finding: a
 * seam opened at a release point under a toast is a question the user
 * cannot click. It is not this helper's to fix, and a probe that tested
 * it by accident would be measuring the toast layer instead of the
 * seam.)
 *
 * So candidates are tried in order and the first one that is TRULY the
 * canvas — `elementFromPoint` returns the canvas itself — wins. If none
 * is, the run is INDETERMINATE: a harness defect, said out loud, rather
 * than a product finding.
 */
async function emptyCanvas(page: Page): Promise<{ x: number; y: number }> {
  await settle(page);
  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  let right = canvas.x;
  for (const card of await page.getByTestId("card").all()) {
    const b = await card.boundingBox();
    if (b) right = Math.max(right, b.x + b.width);
  }
  // To the RIGHT of every card and high in the viewport: clear of the
  // cards, and clear of the toast region in the opposite corner.
  const candidates = [
    { x: right + 140, y: canvas.y + 90 },
    { x: right + 140, y: canvas.y + 200 },
    { x: canvas.x + canvas.width - 160, y: canvas.y + 90 },
  ].filter((p) => p.x < canvas.x + canvas.width - 20);

  for (const point of candidates) {
    const clear = await page.evaluate(
      ([x, y]) => {
        const at = document.elementFromPoint(x as number, y as number);
        return at !== null && at.getAttribute("data-testid") === "canvas";
      },
      [point.x, point.y],
    );
    if (clear) return point;
  }
  throw new Error(
    "INDETERMINATE: no empty canvas point free of chrome — fix the instrument",
  );
}

test("flow 18: a canvas drop on a Sphinx tab ASKS before it makes a card", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await importProject(page);

  const before = await page.getByTestId("card").count();
  await dragTitleTo(page, "Install", await emptyCanvas(page));

  // ── THE SEAM FIRED, and nothing committed while it was open ──
  const menu = page.getByTestId("context-menu");
  await expect(menu).toBeVisible();
  expect(await hitTest(menu), "the seam menu must be topmost at its own pixels").toBe(
    true,
  );
  await expect(page.getByTestId("card")).toHaveCount(before);

  // ── IT NAMES ITS OWN CAUSE, in the format's own noun ─────────
  const header = page.getByTestId("context-menu-header");
  await expect(header).toContainText("creates a card");
  await expect(header).toContainText("toctree block");
  // NOT the pinned cause: this drop displaces no row, and a headline
  // about pinned rows here would be a sentence the user cannot act on.
  await expect(header).not.toContainText("pinned");

  // ── AND IT IS A MODE CHOICE, never a move confirmation ───────
  await expect(
    menu.getByRole("menuitem", { name: /Switch this tab to Aspirational/ }),
  ).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: /Keep this tab Grounded/ }),
  ).toBeVisible();

  console_.assertClean();
});

test("flow 18: consenting lands a MARKED card carrying a placeholder heading", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await importProject(page);

  const before = await page.getByTestId("card").count();
  await dragTitleTo(page, "Install", await emptyCanvas(page));
  await page
    .getByTestId("context-menu")
    .getByRole("menuitem", { name: /Switch this tab to Aspirational/ })
    .click();

  await expect(page.getByTestId("card")).toHaveCount(before + 1);

  // ── THE MARK, hit-tested ─────────────────────────────────────
  const mark = page.getByTestId("card-mark-created");
  await expect(mark).toHaveCount(1);
  expect(await hitTest(mark), "the created mark must be topmost at its own pixels").toBe(
    true,
  );

  // ── THE PLACEHOLDER, and it READS as one ─────────────────────
  //
  // Sphinx's root bears sections and no standalone — every entry lives
  // inside a toctree block — so a childless drag-out WRAPS with a
  // placeholder heading rather than becoming a bare top-level entry.
  const heading = page.locator("h3[data-untitled='true']");
  await expect(heading).toHaveCount(1);
  await expect(heading).toHaveText("New section");
  expect(
    await hitTest(heading),
    "the placeholder heading must be topmost at its own pixels",
  ).toBe(true);
  // THE PAINT, read back — not the predicate. A muted italic heading is
  // the claim; `toHaveText` would pass on a heading rendered in the
  // ordinary weight and prove nothing about what anybody sees.
  const style = await heading.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.fontStyle, opacity: Number(s.opacity) };
  });
  expect(style.style, "the placeholder is italic").toBe("italic");
  expect(style.opacity, "the placeholder is muted").toBeLessThan(1);

  // AND THE ENTRY IS STILL AN ENTRY — a heading was added over it, not
  // substituted for it.
  const card = page.getByTestId("card").filter({ hasText: "New section" });
  await expect(
    card.locator("[data-topic-row]").filter({ hasText: "Install" }),
  ).toHaveCount(1);

  console_.assertClean();
});

test("flow 18: the checklist names the remedy AND the unnamed heading", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await importProject(page);

  // A WRITABLE MOVE FIRST, so "the writable part still applies" has a
  // writable part to be about. Without it the projection dissolves the
  // creation back to the source arrangement and an empty plan is the
  // CORRECT answer — which would make the assertion below pass or fail
  // for reasons that have nothing to do with the split.
  const reference = page.getByTestId("card").filter({ hasText: "Api" }).first();
  const target = (await reference.boundingBox())!;
  await dragTitleTo(page, "Usage", { x: target.x + target.width / 2, y: target.y + 12 });
  await expect(
    reference.locator("[data-topic-row]").filter({ hasText: "Usage" }),
  ).toHaveCount(1);

  await dragTitleTo(page, "Install", await emptyCanvas(page));
  await page
    .getByTestId("context-menu")
    .getByRole("menuitem", { name: /Switch this tab to Aspirational/ })
    .click();
  await expect(page.getByTestId("card-mark-created")).toHaveCount(1);

  await page.getByTestId("review-changes-button").click();
  const dialog = page.getByTestId("changes-dialog");
  await expect(dialog).toBeVisible();

  const checklist = dialog.getByTestId("aspirational-checklist");
  await expect(checklist).toBeVisible();
  const item = checklist.getByTestId("checklist-item").first();
  expect(await hitTest(item), "the checklist item must be topmost at its pixels").toBe(
    true,
  );

  // THE REMEDY NAMES THE SMALLEST REAL ACT, in the format's own words —
  // and then names the one thing this particular card also needs.
  await expect(checklist).toContainText("toctree block");
  await expect(checklist).toContainText("give it a name");
  await expect(checklist).toContainText("placeholder");

  // ── AND THE PRE-SAVE NOTICE, its own line ────────────────────
  const notice = dialog.getByTestId("untitled-notice");
  await expect(notice).toHaveText(/1 section still has a placeholder name/);
  expect(await hitTest(notice), "the notice must be topmost at its own pixels").toBe(
    true,
  );

  // ── AND THE PROJECTION, which is what makes the split real ───
  //
  // Without it the whole plan dies at `section-set-changed` and the user
  // gets a nicer error message instead of their work. The chain this
  // flow asserts end to end is drop → gate → consent → marked card →
  // checklist → PROJECTION, and this is its last link: the writable part
  // of the arrangement still produces file changes underneath the card
  // the app will not write.
  const rows = dialog.getByTestId("changes-list").locator("li");
  expect(
    await rows.count(),
    "the writable part of the plan must survive the imagined card",
  ).toBeGreaterThan(0);

  console_.assertClean();
});

test("flow 18: declining sticks, and the refusal names the way back", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await importProject(page);

  const before = await page.getByTestId("card").count();
  await dragTitleTo(page, "Install", await emptyCanvas(page));
  await page
    .getByTestId("context-menu")
    .getByRole("menuitem", { name: /Keep this tab Grounded/ })
    .click();

  // NOTHING WAS MADE. "No" answered the MODE, and the drop simply did
  // not happen.
  await expect(page.getByTestId("card")).toHaveCount(before);
  await expect(page.getByTestId("card-mark-created")).toHaveCount(0, ABSENT);

  // ── THE NEXT ATTEMPT REFUSES, WITH THE ESCAPE HATCH ON SCREEN ─
  await settle(page);
  const handle = row(page, "Usage").getByText("Usage", { exact: true });
  const f = (await handle.boundingBox())!;
  const to = await emptyCanvas(page);
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });

  const refusal = page.getByTestId("drag-refusal");
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText("Aspirational");
  await expect(refusal).toContainText("tab menu");
  // ORACLE: RENDERED-NESS. The drag overlay is `pointer-events: none`,
  // so `elementFromPoint` can never return it and a hit test would
  // report "occluded" for something plainly on screen.
  const shown = await refusal.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return (
      box.width > 0 &&
      box.height > 0 &&
      s.visibility !== "hidden" &&
      s.display !== "none" &&
      Number(s.opacity) > 0.05
    );
  });
  expect(shown, "the refusal sentence must be rendered (pointer-events: none)").toBe(
    true,
  );

  await page.mouse.up();
  await expect(page.getByTestId("card")).toHaveCount(before);

  console_.assertClean();
});

test("flow 18: a drop with nowhere to live is REFUSED, naming the lanes that bear cards", async ({
  page,
}) => {
  /**
   * DECISION 2's FOURTH REGIME, painted. R2's "root is a legitimate home
   * wherever the format bears it" has a contrapositive, and this is it:
   * a tabs-rooted docs.json holds containers at its top level, so a card
   * born there would have nowhere to go — and unlike every other
   * remainder in this design an unhoused card has no projection home, so
   * the whole export would wedge behind it. Nothing is born unhoused.
   *
   * THE SENTENCE IS THE POINT, not the refusal. A wall the user cannot
   * act on is what this project keeps refusing to ship, so the copy has
   * to name the lanes that DO bear the card — and it is asserted here
   * rather than only at the unit, because the wiring that supplies those
   * lanes is exactly what silently degraded once already (a stringly
   * typed comparison that stopped matching after a rename; the sentence
   * stayed true and stopped being useful).
   */
  const console_ = watchConsole(page);
  const TABS = JSON.stringify(
    {
      name: "Tabs",
      navigation: {
        tabs: [
          {
            tab: "Guides",
            groups: [
              {
                group: "Get started",
                // A NESTED group makes a PARENTED row, which is what
                // this test needs: a parented entry asks to be born a
                // SECTION, and this file has a lane that bears sections
                // ("Guides"). A childless entry would ask for a
                // standalone, which NOTHING here bears — and the
                // sentence would correctly fall through to the by-hand
                // remedy, testing the opposite branch by accident.
                pages: [{ group: "Deep", pages: ["a", "b"] }, "intro"],
              },
            ],
          },
        ],
      },
    },
    null,
    2,
  );
  await page.goto("/");
  await page.getByTestId("empty-open-dialog").click();
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await page.getByTestId("load-paste-input").fill(TABS);
  await page.getByRole("button", { name: "Load pasted TOC" }).click();
  await expect(page.getByTestId("card").first()).toBeVisible();

  const before = await page.getByTestId("card").count();

  // Drag toward the ROOT lane — the first column, above every card,
  // which is the top level this file's `tabs` array bears nothing in.
  await settle(page);
  const handle = row(page, "Deep").getByText("Deep", { exact: true });
  const f = (await handle.boundingBox())!;
  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  const to = { x: canvas.x + canvas.width - 160, y: canvas.y + 90 };
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });

  const refusal = page.getByTestId("drag-refusal");
  await expect(refusal).toBeVisible();
  // THE FACT, then the WAY ROUND IT — and the way round names a real
  // lane out of this document, not a rule.
  await expect(refusal).toContainText("holds containers only");
  await expect(refusal).toContainText('"Guides"');

  // ORACLE: RENDERED-NESS. The drag overlay is `pointer-events: none`,
  // so a hit test would report "occluded" for something plainly there.
  const shown = await refusal.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return (
      box.width > 0 &&
      box.height > 0 &&
      s.visibility !== "hidden" &&
      s.display !== "none" &&
      Number(s.opacity) > 0.05
    );
  });
  expect(shown, "the refusal sentence must be rendered").toBe(true);

  await page.mouse.up();
  // AND NOTHING WAS BORN — the refusal holds at the commit, not only in
  // the cursor. A commit predicate that trusted a visual is the shape
  // that once let the sidebar commit the move the canvas refused.
  await expect(page.getByTestId("card")).toHaveCount(before, ABSENT);

  console_.assertClean();
});
