/**
 * survey-hugo.ts — Corpus survey behind docs/14 (Hugo section tree).
 *
 * Committed so the note's figures are RE-RUNNABLE rather than asserted.
 * The first draft of docs/14 carried numbers from a throwaway sandbox
 * script; an adversarial review found ten of them wrong, and there was no
 * way to tell without re-measuring from scratch. A survey that decides a
 * design ships with the design.
 *
 *   pnpm exec vite-node scripts/survey-hugo.ts ~/k8s-website
 *
 * Read-only. Never writes to the corpus.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import yaml from "js-yaml";

const root = process.argv[2];
if (!root) {
  console.error("usage: vite-node scripts/survey-hugo.ts <path-to-hugo-repo>");
  process.exit(1);
}
const contentDir = join(root, "content/en/docs");

interface Page {
  path: string;
  depth: number;
  bytes: number;
  fm: Record<string, unknown> | null;
  /** Front matter present but only readable with a trimmed close fence. */
  looseFence: boolean;
  /** No front matter at all. */
  none: boolean;
}

/** Mirrors src/collections/frontmatter.ts: the closer must be exactly "---". */
function strictBlock(raw: string): string | null {
  const body = raw.startsWith("﻿") ? raw.slice(1) : raw;
  if (!body.startsWith("---\n") && !body.startsWith("---\r\n")) return null;
  const eol = body.startsWith("---\r\n") ? "\r\n" : "\n";
  const lines = body.slice(3 + eol.length).split(eol);
  const idx = lines.findIndex((l) => l === "---");
  return idx < 0 ? null : lines.slice(0, idx).join("\n");
}

/** The forgiving variant — what every other tool in the ecosystem accepts. */
function looseBlock(raw: string): string | null {
  const body = raw.startsWith("﻿") ? raw.slice(1) : raw;
  if (!/^---[ \t]*\r?\n/.test(body)) return null;
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const lines = body.split(eol).slice(1);
  const idx = lines.findIndex((l) => l.trimEnd() === "---");
  return idx < 0 ? null : lines.slice(0, idx).join("\n");
}

const pages: Page[] = [];
function walk(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(md|html)$/i.test(entry)) continue;
    const raw = readFileSync(full, "utf8");
    const rel = relative(contentDir, full);
    const strict = strictBlock(raw);
    const loose = looseBlock(raw);
    let fm: Record<string, unknown> | null = null;
    const block = strict ?? loose;
    if (block !== null) {
      const parsed = yaml.load(block, { json: true });
      fm =
        typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
    }
    pages.push({
      path: rel,
      depth: rel.split("/").length,
      bytes: Buffer.byteLength(raw),
      fm,
      looseFence: strict === null && loose !== null,
      none: strict === null && loose === null,
    });
  }
}
walk(contentDir);

const has = (p: Page, key: string) => p.fm !== null && p.fm[key] !== undefined;
const count = (key: string) => pages.filter((p) => has(p, key)).length;
const withFm = pages.filter((p) => p.fm !== null);

// ── front-matter block bytes: the kept-set arithmetic docs/14 rests on ──
let fmBytes = 0;
for (const p of pages) {
  if (p.fm === null) continue;
  const raw = readFileSync(join(contentDir, p.path), "utf8");
  const idx = raw.indexOf("\n---", 3);
  if (idx > 0) fmBytes += Buffer.byteLength(raw.slice(0, idx + 4));
}

const sections = new Map<string, { files: number; bytes: number }>();
for (const p of pages) {
  const top = p.path.split("/")[0] ?? "(root)";
  const key = p.path.includes("/") ? top : "(root)";
  const acc = sections.get(key) ?? { files: 0, bytes: 0 };
  acc.files += 1;
  acc.bytes += p.bytes;
  sections.set(key, acc);
}

/** Direct children of a top-level section: pages plus md-bearing subdirs. */
function directChildren(section: string): number {
  const dir = join(contentDir, section);
  let n = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const holdsMd = readdirSync(full).some((f) => f.endsWith(".md"));
      if (holdsMd) n += 1;
    } else if (entry.endsWith(".md") && entry !== "_index.md") {
      n += 1;
    }
  }
  return n;
}

const leafBundles = pages
  .filter((p) => basename(p.path) === "index.md")
  .map((p) => {
    const dir = join(contentDir, p.path, "..");
    const siblings = readdirSync(dir).filter(
      (f) => f.endsWith(".md") && f !== "index.md",
    ).length;
    return { path: p.path, siblings };
  })
  .sort((a, b) => b.siblings - a.siblings);

const nonReference = pages.filter((p) => !p.path.startsWith("reference/"));

console.log(`corpus: ${contentDir}`);
console.log(`\n── totals ──`);
console.log(`  content files (.md/.html) ${pages.length}`);
console.log(
  `  bytes                     ${(pages.reduce((n, p) => n + p.bytes, 0) / 1024 / 1024).toFixed(2)} MB`,
);
console.log(`  with front matter         ${withFm.length}`);
console.log(`  without front matter      ${pages.filter((p) => p.none).length}`);
console.log(
  `  needing a TRIMMED fence   ${pages.filter((p) => p.looseFence).length}  <- dropped by the shipped scanner (issue #1)`,
);
pages.filter((p) => p.looseFence).forEach((p) => console.log(`     ${p.path}`));

console.log(`\n── front-matter flags ──`);
for (const key of [
  "weight",
  "linktitle",
  "linkTitle",
  "no_list",
  "toc_hide",
  "headless",
  "draft",
  "cascade",
  "date",
  "card",
]) {
  console.log(`  ${key.padEnd(24)} ${count(key)}`);
}

console.log(`\n── scale ──`);
for (const [name, acc] of [...sections].sort((a, b) => b[1].files - a[1].files)) {
  const kids = name === "(root)" ? 0 : directChildren(name);
  console.log(
    `  ${name.padEnd(26)} ${String(acc.files).padStart(5)} files  ${String(Math.round(acc.bytes / 1024)).padStart(6)} KB  direct children: ${kids}`,
  );
}
console.log(
  `\n  non-reference: ${nonReference.length} files / ${(nonReference.reduce((n, p) => n + p.bytes, 0) / 1024 / 1024).toFixed(2)} MB` +
    `   (kept caps are 500 files / 3 MB)`,
);
console.log(`  all front-matter blocks: ${(fmBytes / 1024).toFixed(1)} KB`);

// ── sibling ordering sets: what decides the tie-handling law ──
const bundleDirs = new Set(
  pages
    .filter((p) => basename(p.path) === "index.md")
    .map((p) => p.path.split("/").slice(0, -1).join("/")),
);
const siblingSets = new Map<string, Page[]>();
for (const p of pages) {
  const dir = p.path.split("/").slice(0, -1).join("/");
  if (basename(p.path) === "_index.md") continue;
  // Inside a leaf bundle the siblings are RESOURCES, not ordering peers.
  if (bundleDirs.has(dir) && basename(p.path) !== "index.md") continue;
  const bucket = siblingSets.get(dir) ?? [];
  bucket.push(p);
  siblingSets.set(dir, bucket);
}
const sets = [...siblingSets.values()].filter((v) => v.length >= 2);
const weightOf = (p: Page) => {
  const w = p.fm?.weight;
  return typeof w === "number" ? w : typeof w === "string" ? Number(w) : undefined;
};
let dupes = 0;
let mixed = 0;
let unweighted = 0;
const gaps = new Map<number, number>();
for (const set of sets) {
  const ws = set.map(weightOf);
  const present = ws.filter((w): w is number => w !== undefined);
  if (present.length === 0) unweighted += 1;
  else if (present.length !== ws.length) mixed += 1;
  if (new Set(present).size !== present.length) dupes += 1;
  const sorted = [...present].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i]! - sorted[i - 1]!;
    if (gap > 0) gaps.set(gap, (gaps.get(gap) ?? 0) + 1);
  }
}
console.log(`\n── sibling ordering sets (n >= 2) ──`);
console.log(`  sets                      ${sets.length}`);
console.log(
  `  with duplicate weights    ${dupes}  (${((dupes / sets.length) * 100).toFixed(0)}%)`,
);
console.log(`  mixed weighted/unweighted ${mixed}`);
console.log(`  entirely unweighted       ${unweighted}`);
console.log(
  `  weight gaps               ` +
    [...gaps]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([g, n]) => `${g}x${n}`)
      .join("  "),
);

console.log(`\n── leaf bundles (index.md dirs) ──`);
leafBundles.forEach((b) =>
  console.log(`  ${String(b.siblings).padStart(4)} sibling .md   ${b.path}`),
);
console.log(
  `  phantom topics a naive scanner would invent: ${leafBundles.reduce((n, b) => n + b.siblings, 0)}`,
);
