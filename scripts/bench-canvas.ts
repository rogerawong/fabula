/**
 * bench-canvas.ts — Canvas performance at whole-site scale (docs/14
 * Decision 2, docs/02's non-functional requirement).
 *
 *   pnpm build && pnpm exec vite-node scripts/bench-canvas.ts
 *
 * docs/02 asks for 60fps pan at "50 cards / 1,000 topics" and docs/08's
 * M3 done-when cites a 1,000-topic fixture. src/dev/largeSample.ts is
 * that fixture and it had a Load-menu entry, but no harness ever put a
 * NUMBER against it — the gate was eyeballed. Decision 2 turns on whether
 * a whole-site load stays usable, so it needs the number.
 *
 * Both fixtures are measured, because the comparison is the finding:
 * largeSample is 44 even cards (the easy case the requirement describes)
 * and k8sSilhouette is 7 wildly uneven ones, 1,163 topics in a single
 * card. If only the second is slow, the cost is lopsidedness, not volume.
 *
 * Measured against the PRODUCTION bundle, deliberately. The dev Load-menu
 * entries are compiled out of it, so the fixtures are serialized through
 * the docfx adapter and pasted in — the same module the menu uses, so
 * there is one source of truth for the shape.
 *
 * Serves dist/ on 4174 to avoid colliding with the e2e server on 4173.
 * Read-only; writes nothing.
 */

import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium, type ConsoleMessage, type Page } from "@playwright/test";
import { makeK8sSilhouette } from "@/dev/k8sSilhouette";
import { makeLargeSample } from "@/dev/largeSample";
import { getAdapter } from "@/formats/registry";
import type { TocDocument } from "@/model/types";

const DIST = resolve("dist");
if (!existsSync(DIST)) {
  console.error("dist/ missing — run `pnpm build` first.");
  process.exit(1);
}

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};
const server = createServer((req, res) => {
  const url = (req.url ?? "/").split("?")[0] ?? "/";
  let file = join(DIST, url === "/" ? "index.html" : decodeURIComponent(url));
  if (!existsSync(file) || !extname(file)) file = join(DIST, "index.html");
  res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "text/plain" });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(4174, () => r()));

function serialize(doc: TocDocument): string {
  const adapter = getAdapter(doc.formatId)!;
  return adapter.serialize(
    doc,
    doc.sections.map((s) => s.id),
  );
}

interface Result {
  loadMs: number;
  cards: number;
  rows: number;
  expandMs: number;
  rowsExpanded: number;
  medianMs: number;
  p95Ms: number;
  worstMs: number;
  medianExpMs: number;
  p95ExpMs: number;
  worstExpMs: number;
  errors: string[];
}

async function measure(page: Page, doc: TocDocument, cards: number): Promise<Result> {
  const errors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e: Error) => errors.push(String(e)));

  await page.goto("http://localhost:4174/");
  await page.getByTestId("load-menu").click();
  await page.getByTestId("load-open-dialog").click();
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await page.getByTestId("load-paste-input").fill(serialize(doc));

  const t0 = Date.now();
  await page.getByRole("button", { name: "Load pasted TOC" }).click();
  await page.waitForFunction(
    (n: number) => document.querySelectorAll('[data-testid="card"]').length >= n,
    cards,
    { timeout: 120_000 },
  );
  const loadMs = Date.now() - t0;
  // Default depth is 2, so most of a deep tree is NOT in the DOM. Report
  // it: "1,672 topics" would otherwise imply 1,672 rendered rows.
  const rows = await page.locator("[data-topic-row]").count();

  // rAF deltas across a real pointer-driven pan
  await page.evaluate(() => {
    const w = window as unknown as { __f: number[] };
    w.__f = [];
    let last = performance.now();
    const tick = (t: number) => {
      w.__f.push(t - last);
      last = t;
      if (w.__f.length < 300) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const box = (await page.getByTestId("canvas").boundingBox()) ?? {
    x: 300,
    y: 300,
    width: 900,
    height: 500,
  };
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 80; i++) await page.mouse.move(cx - i * 8, cy - i * 4);
  await page.mouse.up();
  await page.waitForTimeout(500);

  const frames: number[] = await page.evaluate(
    () => (window as unknown as { __f: number[] }).__f,
  );
  const sorted = frames.filter((f) => f > 0.5).sort((a, b) => a - b);
  const at = (xs: number[], p: number) =>
    xs[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0;

  // ── Expand all: every topic in the DOM, the honest worst case ──
  const t1 = Date.now();
  await page.getByRole("button", { name: "Expand all" }).click();
  await page.waitForFunction(
    (n: number) => document.querySelectorAll("[data-topic-row]").length > n,
    rows,
    { timeout: 120_000 },
  );
  const expandMs = Date.now() - t1;
  const rowsExpanded = await page.locator("[data-topic-row]").count();

  await page.evaluate(() => {
    const w = window as unknown as { __g: number[] };
    w.__g = [];
    let last = performance.now();
    const tick = (t: number) => {
      w.__g.push(t - last);
      last = t;
      if (w.__g.length < 300) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 80; i++) await page.mouse.move(cx - i * 8, cy - i * 4);
  await page.mouse.up();
  await page.waitForTimeout(500);
  const gframes: number[] = await page.evaluate(
    () => (window as unknown as { __g: number[] }).__g,
  );
  const gsorted = gframes.filter((f) => f > 0.5).sort((a, b) => a - b);

  return {
    loadMs,
    cards: await page.getByTestId("card").count(),
    rows,
    expandMs,
    rowsExpanded,
    medianMs: at(sorted, 0.5),
    p95Ms: at(sorted, 0.95),
    worstMs: sorted.at(-1) ?? 0,
    medianExpMs: at(gsorted, 0.5),
    p95ExpMs: at(gsorted, 0.95),
    worstExpMs: gsorted.at(-1) ?? 0,
    errors,
  };
}

const browser = await chromium.launch();
const fps = (ms: number) => (ms > 0 ? (1000 / ms).toFixed(0) : "—");

for (const [label, doc, cards] of [
  ["largeSample  (44 even cards, 1,012 topics, depth 3)", makeLargeSample(), 44],
  ["k8sSilhouette (7 uneven cards, 1,672 topics, depth 5)", makeK8sSilhouette(), 7],
] as const) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const r = await measure(page, doc, cards);
  console.log(`\n── ${label} ──`);
  console.log(`  load → all cards painted   ${r.loadMs} ms   (${r.cards} cards)`);
  console.log(`  rows in DOM at depth 2     ${r.rows}`);
  console.log(
    `  pan median                 ${r.medianMs.toFixed(1)} ms  (${fps(r.medianMs)} fps)`,
  );
  console.log(
    `  pan p95                    ${r.p95Ms.toFixed(1)} ms  (${fps(r.p95Ms)} fps)`,
  );
  console.log(`  pan worst frame            ${r.worstMs.toFixed(1)} ms`);
  console.log(`  ── expand all ──`);
  console.log(
    `  expand → repaint           ${r.expandMs} ms   (${r.rowsExpanded} rows in DOM)`,
  );
  console.log(
    `  pan median                 ${r.medianExpMs.toFixed(1)} ms  (${fps(r.medianExpMs)} fps)`,
  );
  console.log(
    `  pan p95                    ${r.p95ExpMs.toFixed(1)} ms  (${fps(r.p95ExpMs)} fps)`,
  );
  console.log(`  pan worst frame            ${r.worstExpMs.toFixed(1)} ms`);
  console.log(`  console errors             ${r.errors.length}`);
  for (const e of r.errors.slice(0, 3)) console.log(`    ${e}`);
  await page.close();
}

await browser.close();
server.close();
