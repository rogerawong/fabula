/**
 * paint-glyphs.ts — the lock-glyph system, painted at corpus scale.
 *
 *   GLYPH_CORPUS=~/linux-docs/Documentation pnpm paint-glyphs
 *
 * Drives the shipped app against a real Sphinx checkout (the kernel is
 * the intended corpus — the lock-heavy view: above-prose, reference,
 * glob, atomic, missing all occur) through the webkitdirectory
 * fallback, and answers what the unit suite cannot:
 *
 * - per-kind glyph COUNTS from the live DOM, after Expand All, with
 *   three verdicts (MEASURED-PRESENT / MEASURED-ABSENT /
 *   INDETERMINATE) — absent is an answer, a probe exception is a
 *   harness defect and fails the RUN;
 * - occlusion-aware HIT TESTS on one glyph per present kind (glyphs
 *   are hit-test participants), panning the canvas to each first and
 *   re-querying geometry after every pan;
 * - the styled tooltip on hover, judged by the RENDERED-NESS oracle —
 *   the tip is pointer-events: none, NOT a participant, and the log
 *   names which oracle answered;
 * - full-canvas captures at 100% and ~50% zoom, because a shape that
 *   only classifies at 100% is a shape that fails the design.
 *
 * Unset GLYPH_CORPUS ⇒ skips with its reason. Never runs in CI. No API
 * keys, no network beyond the local app.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Locator } from "@playwright/test";
import { LOCK_KINDS } from "../src/model/locks";

const corpusArg = process.env.GLYPH_CORPUS;
if (!corpusArg) {
  console.log(
    "paint-glyphs: set GLYPH_CORPUS to a local Sphinx checkout, e.g.\n" +
      "  GLYPH_CORPUS=~/linux-docs/Documentation pnpm paint-glyphs\n" +
      "Skipping.",
  );
  process.exit(0);
}
const corpus = resolve(corpusArg.replace(/^~/, homedir()));
if (!existsSync(corpus)) {
  console.error(`paint-glyphs: no such folder: ${corpus}`);
  process.exit(1);
}

const APP_URL = process.env.APP_URL ?? "http://localhost:5173/";
const OUT = process.env.PAINT_OUT ?? join(process.cwd(), ".paint-check", "glyphs");
mkdirSync(OUT, { recursive: true });

const VIEW = { width: 1600, height: 1000 };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEW });

const errors: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.addInitScript(() => {
  // Force the webkitdirectory fallback — the Safari/Firefox path.
  delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
});

try {
  await page.goto(APP_URL, { timeout: 15000 });
} catch {
  console.error(`paint-glyphs: nothing serving at ${APP_URL} — run \`pnpm dev\` first.`);
  await browser.close();
  process.exit(1);
}

const log: Record<string, unknown> = {};
const indeterminate: string[] = [];

// ── import (root picker answered by REACH, logged) ─────────
await page.getByTestId("empty-open-dialog").click();
const importStart = Date.now();
await page.getByTestId("load-folder-input").setInputFiles(corpus);

const picker = page.getByTestId("root-picker");
try {
  await picker.waitFor({ state: "visible", timeout: 120000 });
  const options = await page.getByTestId("root-candidate").allInnerTexts();
  // Biggest reach wins — the label is the walk's own oracle (docs/19).
  const reachOf = (s: string): number =>
    Number(s.match(/([\d,]+)\s+(?:docs|documents|pages)/)?.[1]?.replace(/,/g, "") ?? 0);
  const best = options.reduce((a, b) => (reachOf(b) > reachOf(a) ? b : a));
  log.rootCandidates = options;
  log.rootChosen = best;
  await page
    .getByTestId("root-candidate")
    .filter({ hasText: best.split("\n")[0]! })
    .first()
    .click();
} catch {
  log.rootCandidates = "picker did not appear (unambiguous root)";
}

await page.getByTestId("card").first().waitFor({ state: "visible", timeout: 300000 });
log.importMs = Date.now() - importStart;
log.docStats = await page.getByTestId("doc-stats").innerText();

// ── expand all: census counts are corpus-wide, and rows inside
//    collapsed parents are not in the DOM ─────────────────────
await page.getByRole("button", { name: "Expand all" }).click();
await page.waitForTimeout(1500);

// ── per-kind counts, three verdicts ────────────────────────
const kindCounts: Record<string, number | string> = {};
for (const kind of LOCK_KINDS) {
  try {
    const n = await page.locator(`[data-lock-kind="${kind}"]`).count();
    kindCounts[kind] = n;
    console.log(
      `  ${kind.padEnd(15)} ${n > 0 ? `MEASURED-PRESENT ×${n}` : "MEASURED-ABSENT"}`,
    );
  } catch (e) {
    kindCounts[kind] = "INDETERMINATE";
    indeterminate.push(`count(${kind}): ${String(e)}`);
  }
}
log.kindCounts = kindCounts;

// Chips are retired — assert the absence at corpus scale, fast.
for (const chip of ["Above prose", "Glob block"]) {
  const n = await page
    .locator("[data-topic-row]")
    .getByText(chip, { exact: true })
    .count();
  if (n > 0) {
    console.error(`  RETIRED CHIP RENDERS: "${chip}" ×${n}`);
    errors.push(`retired chip text "${chip}" rendered ${n} times`);
  }
}

// ── pan the canvas until a locator is inside the viewport ──
// Wheel pans (Canvas.tsx); geometry is RE-QUERIED after every pan,
// because a box captured before a scroll points at nothing.
async function panTo(
  target: Locator,
): Promise<"in-view" | "unreachable" | "indeterminate"> {
  // 250 × 1200px covers the kernel's expanded canvas — the first cap
  // (60 × 500) reported atomic and external "unreachable" on a canvas
  // they were plainly on, which was the probe failing, not the paint.
  for (let i = 0; i < 250; i++) {
    let box;
    try {
      box = await target.boundingBox();
    } catch (e) {
      indeterminate.push(`panTo: ${String(e)}`);
      return "indeterminate";
    }
    if (!box) return "unreachable";
    const inView =
      box.x >= 90 &&
      box.y >= 140 &&
      box.x + box.width <= VIEW.width - 40 &&
      box.y + box.height <= VIEW.height - 40;
    if (inView) return "in-view";
    await page.mouse.move(VIEW.width / 2, VIEW.height / 2);
    const dx = Math.max(-1200, Math.min(1200, box.x + box.width / 2 - VIEW.width / 2));
    const dy = Math.max(-1200, Math.min(1200, box.y + box.height / 2 - VIEW.height / 2));
    await page.mouse.wheel(dx, dy);
    await page.waitForTimeout(40);
  }
  return "unreachable";
}

// ── hit test one glyph per present kind + its styled tooltip ──
const glyphPaint: Record<string, unknown> = {};
for (const kind of LOCK_KINDS) {
  if (kindCounts[kind] === 0 || kindCounts[kind] === "INDETERMINATE") continue;
  const glyph = page.locator(`[data-lock-kind="${kind}"]`).first();
  const reach = await panTo(glyph);
  if (reach !== "in-view") {
    glyphPaint[kind] = {
      verdict: reach === "indeterminate" ? "INDETERMINATE" : "unreachable-by-pan",
    };
    if (reach === "indeterminate") indeterminate.push(`glyph(${kind}) unreadable`);
    continue;
  }
  try {
    // The glyph is a hit-test PARTICIPANT (cursor-help span) — the
    // occlusion probe is the right oracle here, and this log says so.
    const hit = await glyph.evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return { verdict: "zero-size" };
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        verdict: at !== null && (el === at || el.contains(at)) ? "painted" : "occluded",
        oracle: "elementFromPoint (participant)",
      };
    });
    // Hover → styled tooltip. The TIP is pointer-events:none — a
    // non-participant — so its oracle is RENDERED-NESS, and the log
    // names the switch.
    await glyph.hover();
    const tip = page.getByTestId("styled-tooltip");
    await tip.waitFor({ state: "visible", timeout: 3000 });
    const tipPaint = await tip.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        rendered:
          r.width > 0 &&
          r.height > 0 &&
          cs.visibility !== "hidden" &&
          cs.display !== "none" &&
          Number(cs.opacity) > 0.9,
        oracle: "rendered-ness (pointer-events:none non-participant)",
        firstLine: (el.firstElementChild?.textContent ?? "").slice(0, 60),
      };
    });
    await page.mouse.move(10, 10);
    await tip.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
    glyphPaint[kind] = { ...hit, tooltip: tipPaint };
    console.log(
      `  glyph ${kind.padEnd(15)} ${hit.verdict}; tooltip ${
        tipPaint.rendered ? "rendered" : "NOT RENDERED"
      } — "${tipPaint.firstLine}"`,
    );
  } catch (e) {
    glyphPaint[kind] = { verdict: "INDETERMINATE" };
    indeterminate.push(`hit(${kind}): ${String(e)}`);
  }
}
log.glyphPaint = glyphPaint;

// ── Overview: the two doors, at scale ──────────────────────
await page.getByTestId("overview-button").click();
await page.getByTestId("overview-panel").waitFor({ state: "visible", timeout: 30000 });
log.findings = await page.locator('[data-testid="overview-finding"]').evaluateAll((els) =>
  els.map((el) => ({
    id: el.getAttribute("data-finding-id"),
    severity: el.getAttribute("data-severity"),
    text: (el.textContent ?? "").slice(0, 160),
  })),
);
await page.screenshot({ path: join(OUT, "kernel-overview.png") });
// Display cross-check: the above-prose finding's count must equal the
// DOM's outside-region glyph count — one fact, two independent walks
// (report.ts groups by parent; the DOM renders per row).
const above = (log.findings as { id: string | null; text: string }[]).find(
  (f) => f.id === "above-prose",
);
if (above) {
  const shown = Number(above.text.match(/^(\d[\d,]*)/)?.[1]?.replace(/,/g, "") ?? -1);
  log.aboveProseCrossCheck = { panel: shown, dom: kindCounts["outside-region"] };
  if (shown !== kindCounts["outside-region"]) {
    errors.push(
      `above-prose panel count ${shown} != DOM glyph count ${String(kindCounts["outside-region"])}`,
    );
  }
}
await page.getByTestId("overview-close").click();

// ── captures: 100% and ~50% ────────────────────────────────
await page.screenshot({ path: join(OUT, "kernel-100.png") });
const scaleOf = () =>
  page
    .getByTestId("canvas-world")
    .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
// The app ships zoom PRESETS — click "50" for an exact 0.5. The first
// cut re-derived zoom with a wheel loop and sailed past to 0.20, which
// made "the 50% capture" a lie with a green filename (and the second
// cut quantized to 0.449) — the mechanism already existed; use it.
// Wheel fallback only if the preset is not on screen.
const fifty = page.getByRole("button", { name: "50", exact: true });
if ((await fifty.count()) > 0) {
  await fifty.click();
  await page.waitForTimeout(200);
} else {
  await page.mouse.move(VIEW.width / 2, VIEW.height / 2);
  for (let i = 0; i < 120; i++) {
    const s = await scaleOf();
    if (s >= 0.44 && s <= 0.56) break;
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, s > 0.56 ? 40 : -40);
    await page.keyboard.up("Control");
    await page.waitForTimeout(30);
  }
}
// The EXACT scale is logged and enforced — a capture labeled 50% taken
// at some other zoom is a wrong claim in a filename.
log.zoomedScale = await scaleOf();
if ((log.zoomedScale as number) < 0.44 || (log.zoomedScale as number) > 0.56) {
  errors.push(`50% capture taken at scale ${String(log.zoomedScale)} — not 50%`);
}
await page.screenshot({ path: join(OUT, "kernel-50.png") });

// A 50% capture of a lock-dense region: pan to the first outside-region
// glyph again (geometry re-queried — the zoom moved everything).
if (kindCounts["outside-region"] !== 0) {
  await panTo(page.locator('[data-lock-kind="outside-region"]').first());
  await page.screenshot({ path: join(OUT, "kernel-50-locks.png") });
}

// ── verdict ────────────────────────────────────────────────
log.consoleErrors = errors;
log.indeterminate = indeterminate;
writeFileSync(join(OUT, "log.json"), JSON.stringify(log, null, 2));
console.log(`\npaint-glyphs: log + captures in ${OUT}`);

if (indeterminate.length > 0) {
  console.error(
    `paint-glyphs: ${indeterminate.length} INDETERMINATE reading(s) — a harness defect, not a product finding:`,
  );
  for (const line of indeterminate) console.error(`  ${line}`);
  await browser.close();
  process.exit(1);
}
if (errors.length > 0) {
  console.error(`paint-glyphs: FAIL — ${errors.length} error(s):`);
  for (const line of errors) console.error(`  ${line}`);
  await browser.close();
  process.exit(1);
}
console.log("paint-glyphs: OK");
await browser.close();
