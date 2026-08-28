/**
 * The godot corpus, painted — docs/19 step 8's corpus check.
 *
 * OPT-IN, and it says why when it skips: this drives a real 1,594-document
 * checkout and there is none in CI.
 *
 *   SPHINX_CORPUS=~/godot-docs pnpm e2e e2e/sphinx-corpus.spec.ts
 *
 * BOTH GENERATIONS. Generation 1 is the import as it lands; generation 2
 * is the canvas after a real move, which is a DIFFERENT INPUT SPECIES for
 * the harness as much as for the product — accumulation pluralizes
 * selectors that generation 1 kept singular.
 *
 * VERIFY THE PAINT. godot is the corpus where the new lock kinds
 * actually occur — 46 rows lock as `outside-region`, one as `atomic` —
 * so this is the only place a badge that renders inside a clipped
 * wrapper would show. Presence assertions prove the code ran, which was
 * never in doubt; the hit test asks whether anything is on top of it.
 */

import { expect, test } from "@playwright/test";
import { watchConsole } from "./helpers";

const CORPUS = process.env.SPHINX_CORPUS;

test.describe("godot corpus", () => {
  test.skip(!CORPUS, "set SPHINX_CORPUS=~/godot-docs to run; there is no corpus in CI");

  test("imports, renders and survives a move", async ({ page }) => {
    test.setTimeout(300_000);
    const console_ = watchConsole(page);

    // The webkitdirectory fallback — the real Safari and Firefox path.
    await page.addInitScript(() => {
      delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
    });
    await page.goto("/");
    await page.getByTestId("empty-open-dialog").click();
    await page.getByTestId("load-folder-input").setInputFiles(CORPUS!);
    await page
      .getByTestId("card")
      .first()
      .waitFor({ state: "visible", timeout: 280_000 });

    // ── generation 1 ────────────────────────────────────────
    //
    // SCALE IS ASSERTED, because a check that passes on a tiny import is
    // a check that passes for a reason nobody chose. godot parses to 6
    // cards and 515 placed rows; anything much smaller means the walk
    // stopped early and every assertion below would still be green.
    const cards = await page.getByTestId("card").count();
    expect(cards).toBe(6);
    // Matched on the LABEL, not on position: the first number in
    // "6 sections · 515 topics · depth 5" is the section count, and a
    // positional match asserted 6 > 400 and failed for the right reason
    // by luck rather than by design.
    const stats = await page.getByTestId("doc-stats").innerText();
    const placed = Number(
      stats.match(/(\d[\d,]*)\s+topics/)?.[1]?.replace(/,/g, "") ?? 0,
    );
    expect(placed).toBeGreaterThan(400);

    // A locked row's GLYPH must be ON SCREEN, not merely in the DOM. A
    // truncation wrapper eats composed content while every text
    // assertion passes — the language picker did exactly that inside a
    // 21px chip. (The text chips are retired — polish-glyphs; the
    // right-margin glyph is the mark now, and flow12 pins the chips'
    // absence.)
    const badge = page.locator('[data-lock-kind="outside-region"]').first();
    const painted = await badge.evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return { verdict: "zero-size" };
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        verdict:
          hit !== null && (el === hit || el.contains(hit)) ? "painted" : "occluded",
        clipped: el.scrollWidth > el.clientWidth + 1,
      };
    });
    expect(painted).toEqual({ verdict: "painted", clipped: false });

    // Write-back is on, and the button says so by being usable.
    await expect(page.getByTestId("review-changes-button")).toBeEnabled();

    // ── generation 2 ────────────────────────────────────────
    // A move, then Review. The point is that a 1,594-document corpus
    // plans in the same shape a five-file fixture does.
    const first = page.getByTestId("card").first();
    const rows = first.locator("[data-topic-row]");
    const count = await rows.count();
    expect(count).toBeGreaterThan(1);

    // Boxes read immediately before use, never batched: a box captured
    // earlier points at whatever slid into those coordinates.
    const from = rows.nth(1);
    const to = rows.nth(0);
    const f = (await from.boundingBox())!;
    const t = (await to.boundingBox())!;
    // A CONTENT anchor, not the row's centre — the centre is empty
    // trailing space that rubber-bands into a selection box.
    await page.mouse.move(f.x + 24, f.y + f.height / 2);
    await page.mouse.down();
    await page.mouse.move(t.x + 24, t.y + 2, { steps: 10 });
    await page.mouse.up();

    await page.getByTestId("review-changes-button").click();
    await expect(page.getByTestId("changes-dialog")).toBeVisible();
    // Either a plan or a NAMED refusal — never a silent nothing, and
    // never the generic simulation message, which would mean a
    // discriminant did not fire where it should have.
    const dialog = page.getByTestId("changes-dialog");
    await expect(dialog).not.toContainText("does not reproduce the edited structure");

    console_.assertClean();
  });
});
