/**
 * measure-constraint-cost.ts — what constraint communication COSTS, in
 * tokens, on a real corpus (docs/10 amendment 2026-08-19).
 *
 * The parity arc marks every pinned row in the outline it sends. That is
 * a per-row cost paid on every request for the life of the feature, so
 * it gets a number rather than an assurance — and the number is taken
 * THROUGH THE SHIPPED SERIALIZER, never from a formula about it.
 *
 * ONE IMPLEMENTATION, ONE COUNT, the rule `survey-navtail.ts` records:
 * the "before" figure is the shipped outline with its markers removed,
 * not a second serializer run in a different mode. A counterfactual
 * computed from the real artifact cannot drift from it.
 *
 *   pnpm measure-constraint-cost ~/godot-docs
 *   pnpm measure-constraint-cost ~/linux-docs --sub Documentation
 *
 * No key, no network, no browser.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { sphinxAdapter } from "@/collections/adapters/sphinx";
import type { FilesSnapshot } from "@/collections/types";
import { buildConstraints, PINNED_MARKER, pinnedRowCount } from "@/ai/constraints";
import { buildOutline } from "@/ai/outline";
import { buildSystemMessage } from "@/ai/prompt";
import { neverEmptyGroups } from "@/ai/outline";
import { nodesNeedTargets } from "@/ai/permissions";
import type { Granularity, ReorganizeOptions } from "@/ai/contract";
import { countTopics } from "@/model/selectors";
import { LOCK_KINDS } from "@/model/locks";
import type { Topic } from "@/model/types";

const argv = process.argv.slice(2);
const rootArg = argv[0];
if (rootArg === undefined) {
  console.error("usage: vite-node scripts/measure-constraint-cost.ts <root> [--sub d]");
  process.exit(1);
}
const subIndex = argv.indexOf("--sub");
const sub = subIndex === -1 ? "" : (argv[subIndex + 1] ?? "");
const root = join(resolve(rootArg.replace(/^~/, homedir())), sub);

/** Everything a Sphinx project could want. The app's import caps bound
 *  a BROWSER scan; this reads from disk and is bounded by the corpus. */
function readCorpus(dir: string): FilesSnapshot {
  const files: FilesSnapshot = {};
  const walk = (at: string): void => {
    for (const entry of readdirSync(at)) {
      if (entry.startsWith(".") || entry === "node_modules") continue;
      const full = join(at, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(rst|md|py)$/.test(entry)) {
        files[relative(dir, full)] = readFileSync(full, "utf8");
      }
    }
  };
  walk(dir);
  return files;
}

const started = Date.now();
const files = readCorpus(root);
const { doc } = sphinxAdapter.parse(files, "");
const readMs = Date.now() - started;

const OPTIONS = (granularity: Granularity): ReorganizeOptions => ({
  mode: "grounded" as const,
  scopeSectionIds: null,
  allowRenames: false,
  allowNewSections: true,
  allowFileMoves: false,
  folderHints: false,
  granularity,
});

console.log(`corpus     ${root}`);
console.log(`files      ${Object.keys(files).length} read in ${readMs}ms`);
console.log(
  `document   ${doc.sections.length} sections, ` +
    `${countTopics(doc.sections.flatMap((s) => s.topics)).total} topics\n`,
);

// ── the measurement is its own oracle ──────────────────────
//
// At FULL granularity every topic gets a compact id, so the constraint
// builder's pinned count must equal the number of locked topics in the
// document. Two independent walks — one over the id map, one over the
// tree — and a disagreement means the id map lost rows or the predicate
// drifted. Wiring the check costs a line and buys a standing assertion,
// which is cheaper than discovering the drift from a wrong prompt.
const byKind = new Map<string, number>();
let lockedInTree = 0;
const countLocks = (nodes: Topic[]): void => {
  for (const t of nodes) {
    if (t.lock) {
      lockedInTree += 1;
      byKind.set(t.lock.kind, (byKind.get(t.lock.kind) ?? 0) + 1);
    }
    countLocks(t.children);
  }
};
for (const section of doc.sections) countLocks(section.topics);

const fullOptions = OPTIONS("full");
const fullOutline = buildOutline(doc, fullOptions);
const fullPinned = pinnedRowCount(buildConstraints(doc, fullOptions, fullOutline.idMap));
console.log(
  `locks      ${lockedInTree} in the tree, ${fullPinned} marked at full granularity` +
    (lockedInTree === fullPinned ? " ✓ agree" : " ✗ DISAGREE"),
);
console.log(
  `  by kind  ` +
    LOCK_KINDS.filter((k) => byKind.has(k))
      .map((k) => `${k} ${byKind.get(k)}`)
      .join(", ") +
    "\n",
);
if (lockedInTree !== fullPinned) {
  console.error(
    "the id map and the tree disagree about which rows are pinned — one of",
    "the two walks is wrong, and the prompt is built from the first.",
  );
  process.exit(1);
}

const rows: string[][] = [
  [
    "granularity",
    "rows",
    "pinned",
    "outline B",
    "marks B",
    "block B",
    "added %",
    "tok +",
  ],
];

for (const granularity of ["full", "two", "top"] as const) {
  const options = OPTIONS(granularity);
  const outline = buildOutline(doc, options);
  const constraints = buildConstraints(doc, options, outline.idMap);
  const pinned = pinnedRowCount(constraints);

  // The counterfactual, derived FROM the shipped artifact: the same
  // string with the marks taken back out. A second serializer run in a
  // "no marks" mode would be a second implementation to keep in step.
  const withoutMarks = outline.text.replaceAll(` ${PINNED_MARKER}`, "");
  const markBytes = outline.text.length - withoutMarks.length;

  // The explanatory block is O(1) — it does not scale with the corpus,
  // which is the whole reason the ids are NOT listed in the message.
  const withBlock = buildSystemMessage(
    options,
    false,
    neverEmptyGroups(doc, outline.idMap),
    constraints,
    nodesNeedTargets(doc),
  );
  const withoutBlock = buildSystemMessage(
    options,
    false,
    neverEmptyGroups(doc, outline.idMap),
    constraints.filter((c) => c.kind !== "pinned-rows"),
    nodesNeedTargets(doc),
  );
  const blockBytes = withBlock.length - withoutBlock.length;

  const baseline = withoutMarks.length + withoutBlock.length;
  const added = markBytes + blockBytes;
  rows.push([
    granularity,
    String(outline.stats.topics),
    String(pinned),
    String(withoutMarks.length),
    String(markBytes),
    String(blockBytes),
    `${((added / baseline) * 100).toFixed(2)}%`,
    // the same chars/4 heuristic the payload guard upstream uses
    `+${Math.round(added / 4)}`,
  ]);
}

const width = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
for (const [index, row] of rows.entries()) {
  console.log(row.map((cell, i) => cell.padStart(width[i]!)).join("  "));
  if (index === 0) console.log(width.map((w) => "─".repeat(w)).join("  "));
}
