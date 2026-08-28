/**
 * paint-check.mjs — Put a REAL corpus on screen and photograph what the
 * app paints (docs/17, and the verify-the-paint convention).
 *
 * Unit tests assert state, and state can be perfectly correct while
 * nothing reaches the screen. This drives the shipped app against a
 * local clone, opens Overview, and captures the panel end to end so the
 * wall-of-doors question is answered with screenshots rather than
 * predictions.
 *
 * Usage:
 *   pnpm dev                                   # in another shell
 *   PAINT_CORPUS=~/k8s-website node scripts/paint-check.mjs
 *
 * Never runs in CI and hardcodes no path: unset PAINT_CORPUS and it
 * says what it wanted and exits 0.
 *
 * It imports through the WEBKITDIRECTORY FALLBACK, forced by deleting
 * `showDirectoryPicker` before the app loads. That is not a workaround
 * for the harness — it is the real Safari and Firefox source path, so
 * the check covers the branch most likely to rot unseen.
 *
 * ## Four rules this harness paid for
 *
 * Each was a harness defect that reported a WORKING feature as broken,
 * which is the most expensive way for a paint check to be wrong: it
 * spends the session diagnosing product code that was fine.
 *
 * 1. **Occlusion probes answer for PARTICIPANTS ONLY.**
 *    `elementFromPoint` can never return an element the pointer passes
 *    through, so hit-testing anything `pointer-events: none` reports
 *    "occluded" for something plainly on screen. The stated limit: this
 *    technique answers *is something on top of this?* and cannot answer
 *    *is this visible?* for a non-participant. The alternate oracle for
 *    those is rendered-ness — non-zero box, `visibility`, `display`,
 *    `opacity` — which is what `painted()` falls back to, and it says
 *    which one it used via `hitTested`.
 * 2. **Grab CONTENT ANCHORS, never centres.** A row's centre is empty
 *    trailing space that rubber-bands instead of dragging; the title is
 *    the handle. A centre-grab produces a selection box and no gesture,
 *    which reads as "the feature does not paint".
 * 3. **Re-query geometry after layout- AND scroll-mutating steps.** The
 *    door sweep pans the canvas to sixty rows and leaves it at the last
 *    one, so coordinates taken afterwards can sit outside the viewport
 *    entirely. Scrolling counts: nothing about the DOM changed and every
 *    box was still wrong.
 * 4. **Absence assertions fast-fail.** Several of these lines are
 *    legitimately absent — an unmeasured corpus has no inbound line — so
 *    a default 30s wait turns "correctly absent" into a minute of stall.
 *    Short timeouts, because absence is an ANSWER here, not a failure.
 */

import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const corpusArg = process.env.PAINT_CORPUS;
if (!corpusArg) {
  console.log(
    "paint-check: set PAINT_CORPUS to a local docs clone, e.g.\n" +
      "  PAINT_CORPUS=~/k8s-website node scripts/paint-check.mjs\n" +
      "Skipping.",
  );
  process.exit(0);
}

const corpus = resolve(corpusArg.replace(/^~/, homedir()));
if (!existsSync(corpus)) {
  console.error(`paint-check: no such folder: ${corpus}`);
  process.exit(1);
}

const APP_URL = process.env.APP_URL ?? "http://localhost:5173/";
const OUT = process.env.PAINT_OUT ?? join(process.cwd(), ".paint-check");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const errors: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

// Force the fallback branch: the File System Access button is gated on
// `showDirectoryPicker`, and the fallback is what Safari and Firefox get.
await page.addInitScript(() => {
  // Deleting a real capability on purpose, to reach the fallback.
  delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
});

try {
  await page.goto(APP_URL, { timeout: 15000 });
} catch {
  console.error(`paint-check: nothing serving at ${APP_URL} — run \`pnpm dev\` first.`);
  await browser.close();
  process.exit(1);
}

const log: Record<string, unknown> = {};

// ── import ─────────────────────────────────────────────────
await page.getByTestId("empty-open-dialog").click();
const importStart = Date.now();
await page.getByTestId("load-folder-input").setInputFiles(corpus);
await page.getByTestId("card").first().waitFor({ state: "visible", timeout: 300000 });
log.importMs = Date.now() - importStart;
log.docStats = await page.getByTestId("doc-stats").innerText();

// A handle-less source cannot reopen a sibling language: the doors are
// shown disabled WITH A REASON rather than hidden or offered blindly.
// The picker only appears when a sibling language exists to offer.
const picker = page.getByTestId("language-open-another");
if ((await picker.count()) > 0) {
  await picker.click();
  // OCCLUSION-AWARE: the panel was once rendered inside a 21px
  // overflow-hidden chip — present in the DOM, readable by every
  // assertion, and invisible on screen. Hit-testing its centre is the
  // only check that would have failed.
  log.languagePanelPainted = await page
    .locator('[data-testid^="language-entry-"]')
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && el.contains(hit);
    });
}
log.languageDoors = await page
  .locator('[data-testid^="language-entry-"]')
  .evaluateAll((els) =>
    els.map((e) => ({
      key: e.getAttribute("data-testid"),
      state: e.getAttribute("data-state"),
      disabled:
        (e as HTMLButtonElement).disabled || e.getAttribute("aria-disabled") === "true",
      // The reason renders VISIBLY in the entry (native title retired,
      // polish-glyphs) — read the text the user reads.
      reason: (e.textContent ?? "").trim().slice(0, 120),
    })),
  );

// ── open Overview, and time it ─────────────────────────────
const openStart = Date.now();
await page.getByTestId("overview-button").click();
await page.getByTestId("overview-panel").waitFor({ state: "visible", timeout: 30000 });
log.panelOpenMs = Date.now() - openStart;

// ── per-line affordance counts ─────────────────────────────
log.findings = await page.locator('[data-testid="overview-finding"]').evaluateAll((els) =>
  els.map((e) => ({
    id: e.getAttribute("data-finding-id"),
    affordances: e.querySelectorAll('[data-testid="overview-focus"]').length,
    folded: e.querySelector("[data-fold-toggle]") !== null,
    text: (e.textContent ?? "").replace(/\s+/g, " ").slice(0, 140),
  })),
);
log.evidence = await page
  .locator('[data-testid="overview-evidence"]')
  .evaluateAll((els) =>
    els.map((e) => ({
      kind: e.getAttribute("data-evidence-kind"),
      text: (e.textContent ?? "").replace(/\s+/g, " ").slice(0, 140),
    })),
  );
log.totalAffordances = await page.locator('[data-testid="overview-focus"]').count();

// ── photograph the panel, top to bottom ────────────────────
const panel = page.getByTestId("overview-panel");
const scroller = panel
  .locator("div")
  .filter({ has: page.locator("dl") })
  .first();
const shots: string[] = [];
const height = await scroller.evaluate((el) => el.scrollHeight);
const step = 900;
for (let offset = 0, i = 0; offset < height; offset += step, i++) {
  await scroller.evaluate((el, y) => el.scrollTo(0, y), offset);
  await page.waitForTimeout(120);
  const file = join(OUT, `panel-${String(i).padStart(2, "0")}.png`);
  await panel.screenshot({ path: file });
  shots.push(file);
}
log.panelScrollHeight = height;
log.shots = shots;

// ── focus a DEEP subject and prove it landed ───────────────
await scroller.evaluate((el) => el.scrollTo(0, 0));
const deep = page
  .locator('[data-testid="overview-finding"][data-finding-id="hidden-via"]')
  .locator('[data-testid="overview-focus"]')
  .first();
if ((await deep.count()) > 0) {
  const label = await deep.innerText();
  await deep.click();
  try {
    await page.waitForSelector('[data-focus-flash="true"]', { timeout: 5000 });
    log.focus = {
      clicked: label,
      landed: await page
        .locator('[data-focus-flash="true"]')
        .first()
        .evaluate((el) => ({
          topic: el.getAttribute("data-topic-id"),
          card: el.getAttribute("data-card-id"),
          shadow: getComputedStyle(el).boxShadow.slice(0, 44),
        })),
    };
  } catch {
    log.focus = { clicked: label, landed: "NO FLASH APPEARED" };
  }
  await page.screenshot({ path: join(OUT, "focus-landed.png"), fullPage: false });
} else {
  log.focus = "no hidden-via affordance to click";
}

// ── every door, post-fold ──────────────────────────────────
// A focus link is a DOOR, and a true count beside it says nothing
// about whether it opens: the subject list is built by the selector
// from model ids, while the landing needs that id to be IN THE DOM
// after expansion. Those two can disagree silently — the count still
// reads right. So every door is opened, none sampled, and the label
// is compared with what actually lit up.
await scroller.evaluate((el) => el.scrollTo(0, 0));
let unfolded = 0;
for (let guard = 0; guard < 40; guard++) {
  const fold = page.getByTestId("overview-fold").first();
  if ((await fold.count()) === 0) break;
  await fold.scrollIntoViewIfNeeded();
  await fold.click();
  unfolded++;
}
log.foldsOpened = unfolded;

// Photograph the UNFOLDED panel too. The folded shots above show "17
// nodes ▸" where the signage is, so a label defect — a wall of
// identical names, a disambiguator that did not appear — is invisible
// in them. This is the state a reader reaches by clicking.
const openHeight = await scroller.evaluate((el) => el.scrollHeight);
const openShots: string[] = [];
for (let offset = 0, i = 0; offset < openHeight; offset += step, i++) {
  await scroller.evaluate((el, y) => el.scrollTo(0, y), offset);
  await page.waitForTimeout(120);
  const file = join(OUT, `panel-open-${String(i).padStart(2, "0")}.png`);
  await panel.screenshot({ path: file });
  openShots.push(file);
}
log.openShots = openShots;
await scroller.evaluate((el) => el.scrollTo(0, 0));

const doors = page.locator('[data-testid="overview-focus"]');
const doorCount = await doors.count();
log.doorsTried = doorCount; // no cap: the sweep is the point
const doorLog: Record<string, unknown>[] = [];
const labelsByFinding: Record<string, string[]> = {};
for (let i = 0; i < doorCount; i++) {
  const door = doors.nth(i);
  // Title and disambiguator separately: the label is the node's own
  // title, and a collision appends secondary text that the ROW does
  // not carry. Comparing the whole button against the row would read
  // every disambiguated door as mis-addressed.
  const { label, detail, finding } = await door.evaluate((el) => {
    const extra = el.getAttribute("data-focus-detail") ?? undefined;
    const whole = (el.textContent ?? "").trim();
    return {
      label: (extra && whole.endsWith(extra)
        ? whole.slice(0, whole.length - extra.length)
        : whole
      ).trim(),
      detail: extra,
      finding: el.closest("[data-finding-id]")?.getAttribute("data-finding-id") ?? "?",
    };
  });
  // A flash still burning from the previous door would read as this
  // one landing. Wait it out before clicking.
  await page
    .waitForSelector('[data-focus-flash="true"]', {
      state: "detached",
      timeout: 3000,
    })
    .catch(() => {});
  await door.scrollIntoViewIfNeeded();
  await door.click();
  try {
    const lit = await page.waitForSelector('[data-focus-flash="true"]', {
      timeout: 2000,
    });
    const on = await lit.evaluate((el) => ({
      topic: el.getAttribute("data-topic-id"),
      card: el.getAttribute("data-card-id"),
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48),
    }));
    doorLog.push({ finding, label, detail, ...on, opened: true });
  } catch {
    doorLog.push({ finding, label, detail, opened: false });
  }
}
log.doorsOpened = doorLog.filter((d) => d.opened).length;
// The SIGNAGE, not just the count: a door that opens can still be
// labelled with something a reader cannot act on. Grouped by the line
// it sits under, so a label that reads as a filename is visible as
// such next to the ones that read as titles.
for (const d of doorLog) {
  const key = String(d.finding);
  (labelsByFinding[key] ??= []).push(
    d.detail === undefined ? String(d.label) : `${d.label} · ${d.detail}`,
  );
}
log.doorLabels = labelsByFinding;
// Landing on SOMETHING is not landing on the right thing: a door whose
// label and lit row disagree is a mis-address, which reads as success.
log.doorsMisaddressed = doorLog.filter(
  (d) => d.opened && typeof d.text === "string" && !d.text.includes(String(d.label)),
);
log.doorsShut = doorLog.filter((d) => !d.opened);

log.panelStillOpen = await panel.isVisible();

// ── the docs/16 move, on a real corpus ─────────────────────
// Scripted end to end: drag a row across cards, read what the gesture
// SAYS, then take it through Review to a .patch. Occlusion-aware at
// every claim — `elementFromPoint` at the element's centre — because
// a presence assertion verifies that the code ran, which was never in
// doubt. The failure this guards against is content rendered into a
// clipping wrapper: present in the DOM, readable by every assertion,
// and invisible on screen.
await page.getByTestId("overview-close").click();

// RESET THE VIEWPORT before measuring a gesture. The door sweep above
// panned the canvas to sixty different rows and left it at the last
// one, so coordinates taken from a card afterwards can sit outside the
// viewport entirely — `elementFromPoint` then returns null and the
// pointer lands on nothing. That failure reads as "the feature does
// not paint", which is the most expensive way to be wrong about a
// paint check. Reloading restores the persisted session at its default
// viewport.
await page.reload();
await page.getByTestId("card").first().waitFor({ state: "visible", timeout: 300000 });

/**
 * Every INDETERMINATE reading, collected so the run can fail on them.
 *
 * A probe that could not answer is a HARNESS defect, and it must not
 * be reported as a product one — that is the direction this check keeps
 * failing in.
 */
const indeterminate: { testId: string; because: string }[] = [];

/**
 * THREE VERDICTS, never two:
 *
 * - `present` — the element was found and measured.
 * - `absent` — it is genuinely not in the DOM. A legitimate ANSWER: an
 *   unmeasured corpus has no inbound line, and a nav-owned adapter has
 *   no alias row.
 * - `indeterminate` — the probe could not tell. A locator error, a
 *   strict-mode ambiguity, an evaluate that threw. This fails the run.
 *
 * Collapsing the third into the second is what made a strict-mode error
 * on a derived document — two move rows where generation 1 had one —
 * report an on-screen row as missing. The instrument reports its own
 * HEALTH separately from its MEASUREMENT.
 */
async function painted(testId: string): Promise<Record<string, unknown>> {
  const locator = page.getByTestId(testId);
  let count: number;
  try {
    // Short timeout on purpose: absence is an answer here, so waiting
    // 30s for it turns "correctly absent" into a minute of stall.
    count = await locator.count();
  } catch (error) {
    indeterminate.push({ testId, because: `count failed: ${String(error)}` });
    return { verdict: "indeterminate", because: "count failed" };
  }
  if (count === 0) return { verdict: "absent" };

  try {
    const measured = await locator.first().evaluate(
      (el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0)
          return { visible: false, reason: "zero-size" };
        // An element the pointer passes THROUGH can never be returned by
        // elementFromPoint — that is what `pointer-events: none` means.
        // Occlusion is only a meaningful question for elements that
        // participate in hit-testing; for the rest, ask whether they
        // are rendered, and SAY which oracle answered.
        const style = getComputedStyle(el);
        const hitTestable =
          style.pointerEvents !== "none" &&
          el.closest('[data-testid="drag-ghost"]') === null;
        const hit = hitTestable
          ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          : null;
        return {
          hitTested: hitTestable,
          visible: hitTestable
            ? hit !== null && (el.contains(hit) || el === hit)
            : style.visibility !== "hidden" &&
              style.display !== "none" &&
              Number(style.opacity) > 0,
          clipped: el.scrollWidth > el.clientWidth + 1,
          text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
        };
      },
      undefined,
      { timeout: 3000 },
    );
    // `matches` is reported because first-of-N is a SAMPLE: a derived
    // document has several move rows and the reader has to know that.
    return { verdict: "present", matches: count, ...measured };
  } catch (error) {
    indeterminate.push({ testId, because: `evaluate failed: ${String(error)}` });
    return { verdict: "indeterminate", matches: count, because: "evaluate failed" };
  }
}

// The row's TITLE, not the row: a drag from a row's empty trailing
// space rubber-bands instead of dragging (there is an e2e pinning that
// exactly), so grabbing the row's centre silently produced a selection
// box and no move at all.
const rowsIn = (cardIndex: number) =>
  page.getByTestId("card").nth(cardIndex).locator("[data-topic-id]");

const moveStart = Date.now();
const source = rowsIn(0).first();
const destination = page.getByTestId("card").nth(1);
const from = await source.boundingBox();
const onto = await destination.boundingBox();
if (from && onto) {
  // Grab the row's LEFT edge, where the title is. A drag from a row's
  // empty trailing space rubber-bands instead of dragging — there is an
  // e2e pinning exactly that — so grabbing the row's CENTRE silently
  // produced a selection box and no move, which then read as "the
  // feature does not paint" rather than "the harness missed".
  const grabX = from.x + 28;
  const grabY = from.y + from.height / 2;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + 12, grabY + 8, { steps: 3 });
  await page.mouse.move(onto.x + onto.width / 2, onto.y + 60, { steps: 10 });

  log.move = {
    // What the pointer actually landed on, so a missed grab is
    // distinguishable from a feature that does not paint.
    grabbed: await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x as number, y as number);
        return el === null
          ? "nothing"
          : `${el.tagName}${el.closest("[data-topic-id]") ? " (in a row)" : " (NOT in a row)"}`;
      },
      [grabX, grabY],
    ),
    ghostVisible: await page
      .getByTestId("drag-ghost")
      .isVisible()
      .catch(() => "no ghost testid"),
    eligibleCards: await page.locator("[data-drop-eligible]").count(),
    totalCards: await page.getByTestId("card").count(),
    label: await painted("drag-drop-label"),
    detail: await painted("drag-drop-detail"),
  };
  await page.screenshot({ path: join(OUT, "move-drag.png") });
  await page.mouse.up();
  log.moveMs = Date.now() - moveStart;

  // ── Review, where the disk consequence lives ─────────────
  await page.getByTestId("review-changes-button").click();
  await page.getByTestId("changes-dialog").waitFor({ state: "visible", timeout: 30000 });
  log.review = {
    changes: await page.getByTestId("changes-list").locator("> li").count(),
    moveRow: await painted("change-move"),
    alias: await painted("change-move-alias"),
    inbound: await painted("change-move-inbound"),
    warnings: await page
      .getByTestId("plan-warnings")
      .locator("li")
      .evaluateAll((els) => els.map((e) => (e.textContent ?? "").slice(0, 90)))
      .catch(() => []),
  };
  await page
    .getByTestId("changes-dialog")
    .screenshot({ path: join(OUT, "move-review.png") });

  // The .patch writer, which is the path most users take.
  const download = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
  await page
    .getByTestId("download-patch-button")
    .click()
    .catch(() => {});
  const patch = await download;
  log.patch = patch === null ? "NO DOWNLOAD" : await patch.suggestedFilename();
} else {
  log.move = "no card pair to drag between";
}

// ── second generation: a document that has already moved ───
// The handoff's lesson was that a fix can hold on a first-generation
// tab and fail on a derived one. The derived document HERE is the
// corpus after a move: the model has a row whose path no longer matches
// where the snapshot keeps it, and the next gesture has to reckon with
// that rather than with the pristine import.
//
// A reorganize result would be the other second generation and this
// harness cannot reach it: that needs a live provider and a key, which
// an unattended script must not carry. Named so the gap is legible
// rather than assumed covered.
// Reload rather than Escape: it clears the modal AND resets the
// viewport in one step, which is the same pair of problems generation 1
// hit. The session persists, so the moved document survives — which is
// exactly what makes this a second generation rather than a rerun.
await page.reload();
await page.getByTestId("card").first().waitFor({ state: "visible", timeout: 300000 });
// The first card may now be EMPTY — the first move took its only row,
// and on Hugo an emptied section persists as a genuinely-empty card
// because the directory is genuinely still there. That is the designed
// behaviour, not a missing card.
//
// And the row has to be a PLAIN PAGE. A subsection (`_index.md`) or a
// leaf bundle is refused on every target, which is correct and which
// makes it useless for exercising a SUCCESSFUL move — the last run
// grabbed "Learning environment" and measured the refusal path twice.
//
// Rather than guess from titles, use the app's own answer: begin a drag
// and count eligible cards. More than one means this row can actually
// go somewhere, which is exactly the property needed. Self-verifying,
// deterministic, and it reports what it skipped so a corpus of nothing
// but subsections cannot look like a pass.
const cardCount = await page.getByTestId("card").count();
const rejected: string[] = [];
let sourceCard = -1;
let sourceRowBox: { x: number; y: number; width: number; height: number } | null = null;
let sourceRowTitle = "(none)";
for (let i = 0; i < cardCount && sourceCard < 0; i++) {
  const rows = await rowsIn(i).count();
  for (let r = 0; r < Math.min(rows, 6); r++) {
    const probe = await rowsIn(i).nth(r).boundingBox();
    if (!probe) continue;
    const px = probe.x + 28;
    const py = probe.y + probe.height / 2;
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.move(px + 12, py + 8, { steps: 3 });
    const eligible = await page.locator("[data-drop-eligible]").count();
    const title = await rowsIn(i)
      .nth(r)
      .evaluate((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40));
    await page.mouse.up();
    if (eligible > 1) {
      sourceCard = i;
      sourceRowBox = probe;
      sourceRowTitle = title;
      break;
    }
    rejected.push(`${title} (eligible ${eligible})`);
  }
}
log.secondGenerationSourceCard = sourceCard;
log.secondGenerationSkipped = rejected;
const secondFrom = sourceRowBox;
const secondOnto = await page
  .getByTestId("card")
  .nth(sourceCard === 2 ? 3 : 2)
  .boundingBox()
  .catch(() => null);
if (secondFrom && secondOnto) {
  const gx = secondFrom.x + 28;
  const gy = secondFrom.y + secondFrom.height / 2;
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx + 12, gy + 8, { steps: 3 });
  await page.mouse.move(secondOnto.x + secondOnto.width / 2, secondOnto.y + 60, {
    steps: 10,
  });
  log.secondGeneration = {
    // The row the PROBE chose, captured at selection time. Logging
    // `rowsIn(card).first()` here named a row that had been skipped for
    // being a subsection — the harness reporting the opposite of what it
    // measured.
    row: sourceRowTitle,
    eligibleCards: await page.locator("[data-drop-eligible]").count(),
    label: await painted("drag-drop-label"),
    detail: await painted("drag-drop-detail"),
  };
  await page.mouse.up();
  await page.getByTestId("review-changes-button").click();
  await page
    .getByTestId("changes-dialog")
    .waitFor({ state: "visible", timeout: 30000 })
    .catch(() => {});
  log.secondGenerationReview = {
    changes: await page.getByTestId("changes-list").locator("> li").count(),
    moves: await page.getByTestId("change-move").count(),
    // Occlusion-aware on the derived document too: the whole point of a
    // second generation is that a surface can be correct on a fresh
    // import and wrong on one that has already been edited.
    moveRow: await painted("change-move"),
    alias: await painted("change-move-alias"),
    inbound: await painted("change-move-inbound"),
  };
  const gen2Download = page
    .waitForEvent("download", { timeout: 30000 })
    .catch(() => null);
  await page
    .getByTestId("download-patch-button")
    .click()
    .catch(() => {});
  const gen2Patch = await gen2Download;
  log.secondGenerationPatch =
    gen2Patch === null ? "NO DOWNLOAD" : await gen2Patch.suggestedFilename();
} else {
  log.secondGeneration = {
    reason: "no card pair reachable",
    cards: await page.getByTestId("card").count(),
    sourceCard,
    firstRowBox: secondFrom,
    thirdCardBox: secondOnto,
  };
}

log.consoleErrorsAfterMove = errors.length ? errors.slice(0, 5) : "none";
log.consoleErrors = errors.length ? errors.slice(0, 5) : "none";

// A probe that could not answer fails the RUN, separately from
// anything it was measuring. Six instrument defects in this build
// arrived as product findings; this is the line that stops the
// seventh from doing so.
log.harnessHealth = indeterminate.length === 0 ? "ok" : indeterminate;

console.log(JSON.stringify(log, null, 2));
if (indeterminate.length > 0) {
  console.error(
    `paint-check: ${indeterminate.length} INDETERMINATE reading(s) — the probe could not answer, ` +
      "which is a harness defect and not a product finding.",
  );
  await browser.close();
  process.exit(1);
}
await browser.close();
