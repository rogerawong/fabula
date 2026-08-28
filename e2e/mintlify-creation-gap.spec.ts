/**
 * mintlify-creation-gap.spec.ts — the write path refuses a card that is
 * not inside any navigation container, and says so on screen.
 *
 * WHY AN e2e AND NOT ONLY A UNIT TEST. The refusal is thrown by the
 * adapter, but the person it is written for reads it in a toast. A
 * message asserted only in a unit test is one that could be clipped,
 * occluded or never rendered at all with every assertion green — three
 * defects in this repo were exactly that. So the refusal gets a HIT
 * TEST at a content anchor, not a `toBeVisible()`.
 *
 * The bundled sample is tabs-rooted, which is the shape with the gap:
 * its top level holds containers, so a card in none of them has nowhere
 * legal to go.
 *
 * ONE HARNESS DEFECT, RECORDED BECAUSE IT NEARLY SHIPPED AS A PRODUCT
 * FINDING. Measured mid-run, this toast's box read y≈695→807 against a
 * 720px viewport, and the short card-creation toast read 696→754 — a
 * control group that appeared to confirm an app-wide clipping bug. It
 * was the PROBE: sonner translates a toast in from below, so a box read
 * while the entry animation is still running reports the position the
 * toast is LEAVING. Settled, the same toast measures y=585→697, wholly
 * inside the viewport. Nothing is clipped and nothing was ever wrong.
 *
 * Hence `settleToast` below. A geometry assertion on an animated
 * element is a measurement of the animation unless it waits, and the
 * screenshot that finally exposed this showed a half-transparent toast
 * — mid-flight, which is what a translucent element in a paint check
 * usually means.
 */

import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { watchConsole } from "./helpers";

/** Wait until the toast has stopped moving — see the docblock. */
async function settleToast(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const t = document.querySelector('[data-sonner-toast][data-type="error"]');
      if (!t) return false;
      const top = t.getBoundingClientRect().top;
      const w = window as unknown as { __toastTop?: number };
      const previous = w.__toastTop;
      w.__toastTop = top;
      return previous !== undefined && Math.abs(previous - top) < 0.5;
    },
    null,
    { timeout: 5_000 },
  );
}

/** Where the refusal's title text is painted, and what is on top of it. */
async function titlePaint(
  page: Page,
  title: string,
): Promise<{ onScreen: boolean; hit: boolean }> {
  return page.evaluate((needle) => {
    const toast = document.querySelector('[data-sonner-toast][data-type="error"]');
    if (!toast) return { onScreen: false, hit: false };
    const walker = document.createTreeWalker(toast, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent?.indexOf(needle) ?? -1;
      if (i < 0) continue;
      const range = document.createRange();
      range.setStart(n, i);
      range.setEnd(n, i + needle.length);
      const box = range.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return { onScreen: false, hit: false };
      // The title's own glyphs, at the top edge of its line box.
      const x = box.left + 2;
      const y = box.top + box.height / 2;
      const onScreen =
        y >= 0 && y < window.innerHeight && x >= 0 && x < window.innerWidth;
      const el = onScreen ? document.elementFromPoint(x, y) : null;
      return {
        onScreen,
        hit: el !== null && (toast === el || toast.contains(el)),
      };
    }
    return { onScreen: false, hit: false };
  }, title);
}

/**
 * A docs.json THAT ALREADY HOLDS AN UNHOUSED CARD, and the reason it has
 * to (docs/22 arc 2).
 *
 * These two tests used to produce the state with the row menu: a card
 * created on canvas took no chain, landed in the ROOT queue, and a
 * tabs-rooted root bears nothing. Arc 2 ruled that away — the drop
 * position NAMES the home, so a born card takes a chain that bears it,
 * and Decision 2's contrapositive refuses any drop whose home bears
 * neither species. "Nothing is born unhoused" is now true of every
 * gesture, which is the whole point of the earlier door.
 *
 * The FLOOR still has to be pinned (R5), so the producer moved rather
 * than the claim: a hand-edited docs.json with a bare page string in its
 * `tabs` array. MEASURED — that parses as an UNSEALED standalone at the
 * root chain and `unhousedSections` names it, which is exactly the state
 * M1 found writes schema-invalid bytes unrefused.
 *
 * The tab's child array is `pages` rather than `groups`, and that is not
 * decoration: `pages` BEARS standalone entries and `groups` does not, so
 * without it the second test's "place it somewhere legal" would have
 * nowhere legal to go. (Both cannot sit at one level — Mintlify allows
 * one kind of child per container, and the adapter refuses the file that
 * breaks that rule, which is how this fixture found its shape.)
 */
const STRAY_DOC =
  '{\n  "name": "Stray",\n  "navigation": {\n    "tabs": [\n      {\n        "tab": "Guides",\n        "pages": [\n          "intro",\n          "setup"\n        ]\n      },\n      "stray-page"\n    ]\n  }\n}';

/** The stray card's title, as the adapter derives it from the page path. */
const STRAY_TITLE = "Stray Page";

async function loadStray(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("empty-open-dialog").click();
  await expect(page.getByTestId("load-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await page.getByTestId("load-paste-input").fill(STRAY_DOC);
  await page.getByRole("button", { name: "Load pasted TOC" }).click();
  await expect(page.getByTestId("card").first()).toBeVisible();
  // THE FIXTURE REALLY DOES HOLD THE STATE — asserted before anything is
  // concluded from a refusal, because a fixture that lost the stray page
  // would make every check below green about nothing.
  await expect(page.getByTestId("card-mark-unhoused")).toHaveCount(1);
}

test("a card outside every container refuses export, and says which card", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await loadStray(page);
  const title = STRAY_TITLE;

  // ── the refusal, on screen ────────────────────────────────
  await page.getByTestId("export-button").click();

  // The card-creation toast is still up, so an unqualified
  // `[data-sonner-toast]` is strict-mode ambiguous — a harness defect
  // that reads exactly like a missing refusal.
  const toast = page.locator('[data-sonner-toast][data-type="error"]');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(title);
  await expect(toast).toContainText(/[Dd]rag/);
  await expect(toast).toContainText("navigation container");

  await settleToast(page);

  // PAINTED, not merely present.
  const paint = await titlePaint(page, title);
  expect(paint.onScreen, "the refused card's title must be within the viewport").toBe(
    true,
  );
  expect(paint.hit, "the title must be the topmost thing at its own pixels").toBe(true);

  // NO BYTES. The refusal is not a warning beside a download.
  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  expect(downloads).toEqual([]);

  console_.assertClean();
});

test("the same card exports once it is placed somewhere that bears it", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await loadStray(page);
  const cardCount = await page.getByTestId("card").count();

  const stray = page.getByTestId("card").filter({ hasText: STRAY_TITLE }).first();
  await expect(stray).toBeVisible();

  // DROP IT INTO A LANE THAT BEARS ITS SPECIES. This tab's child array
  // is `pages`, which bears standalone entries; a `groups` array does
  // not. The target is asked of the SPECIES rather than picked for being
  // nearby — offering a groups lane to a standalone would be advice that
  // produces this same refusal again.
  const target = page.getByTestId("card").filter({ hasText: "Intro" }).first();
  await expect(target).toBeVisible();

  // Geometry re-read immediately before use: a box captured earlier
  // points at whatever slid into those coordinates since.
  const from = (await stray.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 12 });
  await page.mouse.up();

  // A seam offers both readings; take the one that moves it in.
  const menu = page.getByTestId("context-menu");
  if (await menu.isVisible().catch(() => false)) {
    await menu.getByRole("menuitem").first().click();
  }

  // FALSE-PASS FENCE. If the drag had grabbed a ROW instead of the CARD,
  // the card would have been pruned as an empty husk and export would
  // succeed because there was nothing unhoused left — green for the
  // wrong reason.
  await expect(page.getByTestId("card")).toHaveCount(cardCount);
  await expect(page.getByTestId("card-mark-unhoused")).toHaveCount(0, {
    timeout: 2_000,
  });

  const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
  await page.getByTestId("export-button").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);

  // WRITTEN INSIDE THE CONTAINER, as a page of the anchor rather than as
  // a bare entry beside the containers — which is all this pair claims.
  const written = JSON.parse(readFileSync((await download.path())!, "utf8")) as {
    navigation: { tabs: unknown[] };
  };
  const tab = written.navigation.tabs.find(
    (t): t is { tab: string; pages?: unknown[] } =>
      typeof t === "object" && t !== null && "tab" in t,
  );
  expect(tab, "the tab survived the round trip").toBeDefined();
  expect(
    JSON.stringify(tab!.pages ?? []),
    "the standalone is written inside the tab",
  ).toContain("stray-page");
  expect(
    written.navigation.tabs.some((t) => typeof t === "string"),
    "and no bare page string is left beside the containers",
  ).toBe(false);

  // and no refusal was raised
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0, {
    timeout: 2_000,
  });

  console_.assertClean();
});
