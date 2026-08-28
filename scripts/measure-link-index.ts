/**
 * measure-link-index.ts — what the docs/16 link index actually costs.
 *
 * The note budgets ~170 KB worst case for a 5,000-page corpus against
 * 2.6 MB of snapshot headroom, and predicts 40 KB counts-only / 56 KB
 * with exemplars for kubernetes/website. Measured here rather than
 * asserted, on BOTH reference corpora, BEFORE anything consumes the
 * index — a budget verified after the feature depends on it is a budget
 * nobody can act on.
 *
 *   pnpm exec vite-node scripts/measure-link-index.ts ~/k8s-website
 *   pnpm exec vite-node scripts/measure-link-index.ts ~/godot-docs
 *
 * Read-only. Never writes to the corpus.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { COLLECTION_ADAPTERS } from "@/collections/registry";
import type { FilesSnapshot } from "@/collections/types";
import type { LinkIndex } from "@/collections/linkIndex";

const root = process.argv[2];
if (!root) {
  console.error("usage: vite-node scripts/measure-link-index.ts <corpus>");
  process.exit(1);
}

/** Mirrors the importer's own limits closely enough to be comparable. */
const SKIP = /(^|\/)(\.|node_modules$|_site$|vendor$|public$|resources$)/;

function walk(dir: string, base: string, out: FilesSnapshot): void {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const rel = relative(base, abs);
    if (SKIP.test(rel)) continue;
    const stat = statSync(abs);
    if (stat.isDirectory()) walk(abs, base, out);
    else if (
      /\.(md|html|toml|ya?ml|json|rst|txt)$/i.test(entry) &&
      stat.size < 2_000_000
    ) {
      out[rel] = readFileSync(abs, "utf8");
    }
  }
}

const files: FilesSnapshot = {};
walk(root, root, files);

const adapter = COLLECTION_ADAPTERS.map((a) => ({ a, score: a.detect(files) })).sort(
  (x, y) => y.score - x.score,
)[0];

if (!adapter || adapter.score === 0) {
  console.error(`no adapter recognises ${root}`);
  process.exit(1);
}

const started = Date.now();
const result = adapter.a.parse(files, root);
const parseMs = Date.now() - started;

const bytes = (value: unknown): number =>
  value === undefined ? 0 : new TextEncoder().encode(JSON.stringify(value)).length;

const snapshot = result.doc.extras?.files;
const index = result.doc.extras?.linkIndex as LinkIndex | undefined;

const kb = (n: number) => `${(n / 1024).toFixed(2)} KB`;

console.log(`corpus        ${root}`);
console.log(`adapter       ${adapter.a.id} (confidence ${adapter.score})`);
console.log(`files read    ${Object.keys(files).length}`);
console.log(`parse         ${parseMs} ms`);
console.log(`snapshot      ${kb(bytes(snapshot))}`);

if (!index) {
  // Absence is a legible state, never zero — the whole point of the
  // "not measured" rule. A corpus whose adapter has no harvester is
  // correct, not broken.
  console.log("linkIndex     NOT MEASURED (adapter declares no species)");
  process.exit(0);
}

const targets = Object.entries(index.targets);
const edges = targets.reduce((sum, [, t]) => sum + t.n, 0);
const exemplars = targets.reduce((sum, [, t]) => sum + t.from.length, 0);
const counts = targets.map(([, t]) => t.n).sort((a, b) => a - b);
const at = (q: number) =>
  counts[Math.min(counts.length - 1, Math.floor(counts.length * q))] ?? 0;

const countsOnly = bytes({
  observedAt: index.observedAt,
  species: index.species,
  targets: Object.fromEntries(targets.map(([k, t]) => [k, { n: t.n }])),
});
const naive = bytes({
  ...index,
  paths: undefined,
  targets: Object.fromEntries(
    targets.map(([k, t]) => [k, { n: t.n, from: t.from.map((i) => index.paths[i]) }]),
  ),
});

console.log(`species       ${index.species.join(", ")}`);
console.log(`targets       ${targets.length} pages with >=1 inbound link`);
console.log(`edges         ${edges} resolved link instances`);
console.log(`exemplars     ${exemplars} stored source references`);
console.log(`path table    ${index.paths.length} distinct source paths`);
console.log(
  `inbound       median ${at(0.5)} · p90 ${at(0.9)} · max ${counts.at(-1) ?? 0}`,
);
console.log(`--`);
console.log(`counts only   ${kb(countsOnly)}`);
console.log(`AS STORED     ${kb(bytes(index))}   <- the number that matters`);
console.log(`naive paths   ${kb(naive)}`);
console.log(
  `share of snapshot  ${((bytes(index) / Math.max(1, bytes(snapshot))) * 100).toFixed(1)}%`,
);
