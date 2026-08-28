/**
 * Flow 16 — the hand: a pinned row drags, the seam asks, and the tab
 * remembers (docs/21, Decision 9 and gate 2's G1).
 *
 * THE SAME SYNTHETIC SPHINX PROJECT flows 14 and 15 use, deliberately:
 * prose between two toctree blocks locks the block above it, so two rows
 * arrive pinned, and three specs can only disagree about the corpus if
 * one of them is wrong. What differs is the PRODUCER — flow 15 watches
 * the model displace a pinned row; this one watches a hand do it.
 *
 * WHAT THIS FILE'S GREEN MEANS: a pinned drag STARTS (before arc 2 it
 * did not, silently), the release opens the seam instead of committing,
 * proceeding flips the tab and badges the move, declining sticks and the
 * next attempt refuses with the escape hatch on screen, the tab menu's
 * switch-back is gated on an empty ledger and names Put back, and undo
 * takes the move and the mark together. It needs no provider: the seam
 * is pure interaction, and nothing here makes a model call.
 *
 * WHAT IT SAYS NOTHING ABOUT: anything on disk. No plan is computed and
 * no bytes are written — the write-safety line is `sphinx-corpus.spec`'s
 * and the adapters' unit suites, and this arc did not move it.
 *
 * PROBE DISCIPLINE, and one defect this file cost to learn. Row boxes are
 * re-read immediately before each use — a box captured before a drag
 * points at whatever slid into those coordinates afterwards. That is not
 * enough here: this app FLIP-animates every structural mutation, so a
 * box read straight after a move is the box of a row still travelling,
 * and the grab lands on whichever row has slid into those coordinates by
 * the time the pointer arrives. The second drag in this file silently
 * grabbed the row above and the failure read as "the seam did not fire"
 * — a product bug that was not there. So `settle()` awaits every running
 * animation before any geometry is read, and `dragTitleTo` ASSERTS that the
 * point it is about to press belongs to the row it means to press,
 * failing loudly as a harness defect rather than pressing something else.
 * Mutation-verified in both directions: with the settles removed, two
 * tests go red naming the wrong row rather than reporting a missing
 * badge — and one of those two had been PASSING while grabbing the wrong
 * row, which is a scenario passing for a reason nobody chose.
 *
 * Grabs land on the row's TITLE, never its centre — a row's centre is
 * empty trailing space that rubber-bands instead of dragging. Absence
 * assertions carry short timeouts, because absence is a legitimate
 * answer here and a 30s wait would turn "correctly absent" into a stall.
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

let folder: string;

test.beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "toc-pinned-seam-"));
  for (const [path, content] of Object.entries(PROJECT)) {
    const abs = join(folder, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
});

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
}

/** The row whose title is `title` — the pinned ones are "Early" and
 *  "Using It" on this corpus. */
const row = (page: Page, title: string): Locator =>
  page.locator("[data-topic-row]").filter({ hasText: title }).last();

/**
 * Wait for every running animation to finish.
 *
 * The app FLIP-animates structural mutations, and a `getBoundingClientRect`
 * taken mid-flight reports where a row IS rather than where it is going.
 * Reading geometry before this has settled is how a probe presses the
 * wrong row and reports the wrong finding.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
  );
}

/**
 * Drag one row's TITLE onto a target box.
 *
 * The title, not the row: a row is full width and its trailing space
 * bubbles to the card's box-select, so a centre grab produces a
 * selection rectangle and no gesture at all — which reads as a feature
 * that does not work.
 */
async function dragTitleTo(
  page: Page,
  title: string,
  to: { x: number; y: number },
  opts: { release?: boolean } = {},
) {
  await settle(page);
  const handle = row(page, title).getByText(title, { exact: true });
  // Re-read immediately before use, and after the animations settled.
  const f = (await handle.boundingBox())!;
  const sx = f.x + f.width / 2;
  const sy = f.y + f.height / 2;

  // THE INSTRUMENT REPORTS ITS OWN HEALTH, separately from its
  // measurement: if this point does not belong to the row we mean to
  // grab, the run is INDETERMINATE — a harness defect — and must say so
  // rather than pressing whatever is there and calling the result a
  // product finding.
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
  if (opts.release !== false) await page.mouse.up();
}

/** The card's header strip — chrome, so the drop resolves as
 *  "append to this card's top level", which for a nested row is a
 *  PARENT CHANGE. Re-read at every call. */
async function cardChrome(page: Page): Promise<{ x: number; y: number }> {
  await settle(page);
  const box = (await page.getByTestId("card").first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + 10 };
}

/** Is this element the thing at its own centre? Answers *is something on
 *  top of this?*, which is the question a paint claim really makes. */
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

async function openTabMenu(page: Page) {
  await page.getByTestId("tab").first().click({ button: "right" });
  await expect(page.getByTestId("context-menu")).toBeVisible();
}

/** Drag the pinned row out from under its parent and answer the seam. */
async function seamAndChoose(page: Page, choice: "proceed" | "decline") {
  await dragTitleTo(page, "Early", await cardChrome(page));
  const menu = page.getByTestId("context-menu");
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("context-menu-header")).toContainText("pinned");
  await menu
    .getByRole("menuitem", {
      name: choice === "proceed" ? /Switch this tab to Aspirational/ : /Keep this tab/,
    })
    .click();
}

test("a pinned row drags, and the release ASKS instead of committing", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await openProject(page);

  // The corpus really does pin rows — otherwise everything below is
  // green about nothing.
  await expect(page.getByTestId("lock-glyph")).not.toHaveCount(0);

  await dragTitleTo(page, "Early", await cardChrome(page), { release: false });
  // THE DRAG STARTED. Before arc 2 this row refused to move at all, and
  // said nothing about it. The ghost is the proof the gesture is live.
  await expect(page.getByTestId("drag-ghost")).toBeVisible();
  // …and it says what the drop will cost, while the drop is still live.
  await expect(page.getByTestId("drag-drop-consequence")).toContainText(
    "needs your hand",
  );
  await page.mouse.up();

  // Held, not committed: the seam is open and nothing has moved yet.
  await expect(page.getByTestId("context-menu")).toBeVisible();
  await expect(page.getByTestId("aspirational-badge")).toHaveCount(0, ABSENT);

  console_.assertClean();
});

test("proceeding flips the tab, badges the move, and does not ask again", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await openProject(page);
  await seamAndChoose(page, "proceed");

  const badge = page.getByTestId("aspirational-badge");
  await expect(badge).toHaveCount(1);
  // PAINTED, not merely present — the hit test is what tells a rendered
  // badge from one clipped inside an overflow-hidden ancestor.
  expect(await occludes(page, "aspirational-badge")).toBe(true);

  // The tab now wears the state: its menu offers the way BACK.
  await openTabMenu(page);
  await expect(
    page.getByRole("menuitem", { name: "Make this tab Grounded" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // A SECOND pinned drop does not re-ask — consent was given for the
  // tab, and re-asking per move is the failure docs/16 measured.
  await dragTitleTo(page, "Using It", await cardChrome(page));
  await expect(page.getByTestId("context-menu")).toHaveCount(0, ABSENT);
  await expect(badge).toHaveCount(2);

  console_.assertClean();
});

test("declining is sticky, and the refusal names the way back", async ({ page }) => {
  const console_ = watchConsole(page);
  await openProject(page);
  await seamAndChoose(page, "decline");

  // Nothing moved, and nothing is badged.
  await expect(page.getByTestId("aspirational-badge")).toHaveCount(0, ABSENT);

  // The next attempt refuses DURING the drag, with the escape hatch in
  // the sentence — a sticky decline that only stated a wall would read
  // as breakage.
  await dragTitleTo(page, "Early", await cardChrome(page), { release: false });
  const refusal = page.getByTestId("drag-refusal");
  await expect(refusal).toContainText("Pinned rows stay put while this tab is Grounded");
  await expect(refusal).toContainText("tab menu");
  await page.mouse.up();

  // …and it did not re-seam.
  await expect(page.getByTestId("context-menu")).toHaveCount(0, ABSENT);
  await expect(page.getByTestId("aspirational-badge")).toHaveCount(0, ABSENT);

  console_.assertClean();
});

test("G1: switch-back waits for an empty ledger, then lands UNASKED", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await openProject(page);
  await seamAndChoose(page, "proceed");
  await expect(page.getByTestId("aspirational-badge")).toHaveCount(1);

  // While a record remains, the switch back is DISABLED WITH A REASON,
  // and the reason names the affordance that empties the ledger.
  await openTabMenu(page);
  const reason = page.getByTestId("menu-item-reason");
  await expect(reason).toContainText("Put back");
  await expect(reason).toContainText("1 imagined move");
  // Visible rather than hover-only: a disabled control swallows the
  // pointer events a tooltip needs.
  expect(await occludes(page, "menu-item-reason")).toBe(true);
  await page.keyboard.press("Escape");

  // Put the row back — one click on the badge.
  await page.getByTestId("aspirational-badge").click();
  await expect(page.getByTestId("aspirational-badge")).toHaveCount(0, ABSENT);

  // Now the switch back is live.
  await openTabMenu(page);
  await expect(page.getByTestId("menu-item-reason")).toHaveCount(0, ABSENT);
  await page.getByRole("menuitem", { name: "Make this tab Grounded" }).click();

  // GROUNDED-UNASKED, not declined: a deliberate switch-back is not a
  // seam decline, so the seam may offer again. Asserted by asking.
  await dragTitleTo(page, "Early", await cardChrome(page));
  await expect(page.getByTestId("context-menu-header")).toContainText("pinned");

  console_.assertClean();
});

test("undo takes the move and the mark together; redo restores both", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await openProject(page);
  await seamAndChoose(page, "proceed");
  await expect(page.getByTestId("aspirational-badge")).toHaveCount(1);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("aspirational-badge")).toHaveCount(0, ABSENT);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByTestId("aspirational-badge")).toHaveCount(1);

  // The tab state did NOT ride the undo: view and consent state never
  // enter undo history, so the tab is still Aspirational and its menu
  // still offers the way back.
  await openTabMenu(page);
  await expect(
    page.getByRole("menuitem", { name: "Make this tab Grounded" }),
  ).toBeVisible();

  console_.assertClean();
});

test("a multi-row drag raises ONE seam, and it counts the pinned rows", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await openProject(page);

  // Shift-click from the first sibling to the last: three rows under
  // "Guides", two of them pinned. A pinned row has to be SELECTABLE for
  // this to be possible at all — before arc 2 it was not, which is why
  // the count had no way to be anything but one.
  await settle(page);
  await row(page, "Early").getByText("Early", { exact: true }).click();
  await row(page, "Installing")
    .getByText("Installing", { exact: true })
    .click({ modifiers: ["Shift"] });

  await dragTitleTo(page, "Early", await cardChrome(page), { release: false });
  // The ghost counts the whole gesture; the consequence line counts what
  // it costs.
  await expect(page.getByTestId("drag-drop-consequence")).toContainText(
    "2 rows need your hand",
  );
  await page.mouse.up();

  // ONE seam for the set — per-row seams would be the modal-per-move
  // failure docs/16 measured — and it states the split by counting.
  await expect(page.getByTestId("context-menu")).toHaveCount(1);
  await expect(page.getByTestId("context-menu-header")).toContainText(
    "2 of the 3 rows in this move are pinned",
  );

  console_.assertClean();
});

test("a WITHIN-PARENT reorder of a pinned row never seams", async ({ page }) => {
  const console_ = watchConsole(page);
  await openProject(page);

  // "Early" onto the top edge of "Using It" — both sit under "Guides",
  // so this is a reorder among siblings. It displaces nothing, writes no
  // record, and the seam's opening claim would be false for it.
  await settle(page);
  const target = (await row(page, "Using It").boundingBox())!;
  await dragTitleTo(page, "Early", { x: target.x + target.width / 2, y: target.y + 2 });

  await expect(page.getByTestId("context-menu")).toHaveCount(0, ABSENT);
  await expect(page.getByTestId("aspirational-badge")).toHaveCount(0, ABSENT);

  console_.assertClean();
});
