/**
 * survey-unread.ts — The UNREAD-FILE MAP behind docs/18 (section reparenting).
 *
 * docs/16 shipped single-page moves. docs/18 asks the harder version: what
 * happens when a whole SECTION DIRECTORY moves. A page move carries one
 * file (or one leaf bundle); a section move carries a directory, and a
 * directory contains files the app has never seen — images, SVGs, OWNERS,
 * a stray script. They produce nothing on the canvas, they are absent from
 * the snapshot, and they must still travel, or the move silently breaks
 * the site.
 *
 *   pnpm exec vite-node scripts/survey-unread.ts ~/k8s-website
 *   pnpm exec vite-node scripts/survey-unread.ts ~/k8s-website --content content/en/docs
 *
 * THE PREDICATE IS IMPORTED, NOT RESTATED. `ingestible` and
 * `shouldSkipPath` come from the driver itself and `readHugoConfig` parses
 * the corpus's own `ignoreFiles`, so this survey cannot drift from the app
 * the way a hand-copied regex would. That matters more than usual here:
 * every number below is a count of what the predicate REJECTS, so a
 * predicate that is merely close produces a file map that is confidently
 * wrong.
 *
 * THE SPLIT THIS SCRIPT REFUSES TO COLLAPSE (CLAUDE.md: conflation is the
 * house failure mode). Three populations look alike from the canvas —
 * every one of them shows no card — and they are three different problems:
 *
 *   UNREAD          the driver never opened it (not ingestible, or under a
 *                   skipped path). Absent from the snapshot entirely. A
 *                   move must carry it and nothing in the session knows
 *                   it exists.
 *   READ, PAGE-LESS ingested and KEPT as a nav head, but the site's own
 *                   `ignoreFiles` excludes it, so it makes no card. A move
 *                   carries it already — it is in the snapshot.
 *   FOLDED          ingested, kept, and part of a leaf bundle's page
 *                   rather than a card of its own. Not page-less: its
 *                   bundle has a card.
 *
 * Only the first is UNREAD. Counting the second with the first would
 * overstate the gap docs/18 has to close; counting it separately is what
 * makes the gap actionable.
 *
 * Read-only. Never writes to the corpus, never fetches.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { MAX_TOTAL_BYTES, ingestible, shouldSkipPath } from "@/view/loadCollection";
import { hugoAdapter, readHugoConfig } from "@/collections/adapters/hugo";
import { filesOf, type FilesSnapshot } from "@/collections/types";

const root = process.argv[2];
const contentFlag = process.argv.indexOf("--content");
const CONTENT_REL = contentFlag > 0 ? process.argv[contentFlag + 1]! : "content/en/docs";

if (!root) {
  console.error(
    "usage: vite-node scripts/survey-unread.ts <hugo-repo> [--content <rel-dir>]",
  );
  process.exit(1);
}

const CONTENT_ROOT = join(root, CONTENT_REL);
if (!existsSync(CONTENT_ROOT)) {
  console.error(`no such directory: ${CONTENT_ROOT}`);
  process.exit(1);
}

// ── corpus walk ──────────────────────────────────────────────

/**
 * EVERY file, including dotfiles and build directories. The driver's walk
 * prunes those before they become candidates, so a survey that pruned them
 * too could never report them — and "the app skipped 400 files in a dot
 * directory" is exactly the kind of fact a reparent has to know. They are
 * classified below, not filtered out here.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function walkDirs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    out.push(full);
    walkDirs(full, out);
  }
  return out;
}

const toPosix = (p: string) => p.split("\\").join("/");
/** Path as the CORPUS sees it: relative to the repo root, which is what a
 *  whole-repo import produces and what `ignoreFiles` patterns are written
 *  against. */
const repoRel = (full: string) => toPosix(relative(root, full));
/** Path as this SURVEY reports it: relative to the content root. */
const contentRel = (full: string) => toPosix(relative(CONTENT_ROOT, full));

const allFiles = walk(CONTENT_ROOT);
const allDirs = walkDirs(CONTENT_ROOT);

// ── the predicate, as the app applies it ─────────────────────

const configPath = ["hugo.toml", "hugo.yaml", "config.toml", "config.yaml"]
  .map((n) => join(root, n))
  .find((p) => existsSync(p));
const cfg = readHugoConfig(
  configPath
    ? { [toPosix(relative(root, configPath))]: readFileSync(configPath, "utf8") }
    : {},
);

/** hugo.ts `scan()`: patterns are written relative to the PROJECT root but
 *  the importer strips whatever prefix the user picked, so both forms are
 *  tested. Copied in behaviour from the adapter, applied to the same
 *  RegExp objects the adapter built. */
const hugoIgnored = (path: string) =>
  cfg.ignore.some((re) => re.test(path) || re.test(`${cfg.contentDir}/${path}`));

type Class = "unread-skipped" | "unread-not-ingestible" | "read-pageless" | "page";

function classify(full: string): Class {
  const path = repoRel(full);
  if (shouldSkipPath(path)) return "unread-skipped";
  if (!ingestible(path)) return "unread-not-ingestible";
  if (hugoIgnored(path)) return "read-pageless";
  return "page";
}

const classOf = new Map<string, Class>();
for (const full of allFiles) classOf.set(full, classify(full));

const isUnread = (c: Class) => c === "unread-skipped" || c === "unread-not-ingestible";
const unread = allFiles.filter((f) => isUnread(classOf.get(f)!));
const pages = allFiles.filter((f) => classOf.get(f) === "page");
const readPageless = allFiles.filter((f) => classOf.get(f) === "read-pageless");

console.log(`\ncorpus   ${CONTENT_ROOT}`);
console.log(`config   ${configPath ? repoRel(configPath) : "(none found)"}`);

console.log("\n═══ A. THE PREDICATE (imported from the app, not restated) ═══");
console.log("  ingestible = any registered CollectionAdapter's `ingests`:");
console.log("    jtd         .md .markdown | _config.yml");
console.log("    docusaurus  .md .mdx      | _category_.json|.yml|.yaml");
console.log("    sphinx      .rst          | conf.py");
console.log("    hugo        .md .html     | hugo|config .toml|.yaml|.yml|.json");
console.log("  shouldSkipPath = any segment is a dot-dir, node_modules, _site, vendor");
console.log(
  `  hugo ignoreFiles (${cfg.ignore.length}) = ${cfg.ignore.map((r) => r.source).join("  |  ") || "(none)"}`,
);
console.log(`  contentDir = ${cfg.contentDir}`);

console.log("\n  census of every file under the content root:");
console.log(`    files walked                 ${allFiles.length}`);
console.log(`    → pages (card-bearing)       ${pages.length}`);
console.log(
  `    → read but PAGE-LESS         ${readPageless.length}   (ingested + kept, excluded by ignoreFiles)`,
);
console.log(
  `    → UNREAD, not ingestible     ${allFiles.filter((f) => classOf.get(f) === "unread-not-ingestible").length}`,
);
console.log(
  `    → UNREAD, skipped path       ${allFiles.filter((f) => classOf.get(f) === "unread-skipped").length}`,
);
console.log(`    UNREAD TOTAL                 ${unread.length}`);

const byExt = new Map<string, number>();
for (const f of unread) {
  const base = toPosix(f).slice(toPosix(f).lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  const ext = dot <= 0 ? "(extensionless)" : base.slice(dot).toLowerCase();
  byExt.set(ext, (byExt.get(ext) ?? 0) + 1);
}
console.log("\n  unread by extension:");
for (const [ext, n] of [...byExt.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(5)}  ${ext}`);
}

// ── B. every unread file ─────────────────────────────────────

console.log("\n═══ B. EVERY UNREAD FILE (full path, relative to the content root) ═══");
for (const f of [...unread].sort((a, b) => contentRel(a).localeCompare(contentRel(b)))) {
  console.log(`  ${contentRel(f)}`);
}

// ── C. grouped by containing directory ───────────────────────

const dirOfRel = (rel: string) => {
  const i = rel.lastIndexOf("/");
  return i < 0 ? "." : rel.slice(0, i);
};

const unreadByDir = new Map<string, string[]>();
for (const f of unread) {
  const d = dirOfRel(contentRel(f));
  if (!unreadByDir.has(d)) unreadByDir.set(d, []);
  unreadByDir.get(d)!.push(contentRel(f));
}

console.log("\n═══ C. UNREAD FILES BY CONTAINING DIRECTORY (count desc) ═══");
console.log("  count  directory");
for (const [d, fs] of [...unreadByDir.entries()].sort(
  (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
)) {
  console.log(`  ${String(fs.length).padStart(5)}  ${d === "." ? "(content root)" : d}`);
}

// ── D. per top-level section ─────────────────────────────────

const topLevel = readdirSync(CONTENT_ROOT)
  .filter((n) => statSync(join(CONTENT_ROOT, n)).isDirectory())
  .sort();
const rootFiles = allFiles.filter((f) => !contentRel(f).includes("/"));

const under = (list: string[], top: string) =>
  list.filter((f) => contentRel(f).startsWith(top + "/"));

console.log("\n═══ D. PER TOP-LEVEL SECTION (enumerated from disk, not assumed) ═══");
console.log(
  `  ${topLevel.length} directories + ${rootFiles.length} files at the content root\n`,
);
console.log("  section                unread   dirs-with-unread   pages   page-less?");
for (const top of topLevel) {
  const u = under(unread, top);
  const dirsWithUnread = new Set(u.map((f) => dirOfRel(contentRel(f)))).size;
  const p = under(pages, top).length;
  console.log(
    `  ${top.padEnd(22)} ${String(u.length).padStart(6)}   ${String(dirsWithUnread).padStart(16)}   ${String(p).padStart(5)}   ${p === 0 ? "YES — no card at all" : ""}`,
  );
}
{
  const u = rootFiles.filter((f) => isUnread(classOf.get(f)!));
  console.log(
    `  ${"(content root files)".padEnd(22)} ${String(u.length).padStart(6)}   ${String(u.length > 0 ? 1 : 0).padStart(16)}   ${String(rootFiles.filter((f) => classOf.get(f) === "page").length).padStart(5)}`,
  );
}
const withStragglers = topLevel.filter((t) => under(unread, t).length > 0);
console.log(
  `\n  top-level directories with ≥1 unread file below   ${withStragglers.length} of ${topLevel.length}   (${withStragglers.join(", ")})`,
);
const cardBearing = topLevel.filter((t) => under(pages, t).length > 0);
const cardBearingWithStragglers = cardBearing.filter((t) => under(unread, t).length > 0);
console.log(
  `  of the ${cardBearing.length} that bear cards, ${cardBearingWithStragglers.length} carry unread files below`,
);
console.log(
  `  the ${topLevel.length - cardBearing.length} with no card (${topLevel.filter((t) => !cardBearing.includes(t)).join(", ")}) are invisible to a canvas-driven reparent`,
);

// ── E. directory census ──────────────────────────────────────

const dirsWithUnread = new Set(unread.map((f) => dirOfRel(contentRel(f))));
console.log("\n═══ E. DIRECTORY CENSUS ═══");
console.log(`  directories under the content root   ${allDirs.length}`);
console.log(`  + the content root itself            ${allDirs.length + 1}`);
console.log(
  `  containing ≥1 unread file            ${dirsWithUnread.size}  (${((dirsWithUnread.size / (allDirs.length + 1)) * 100).toFixed(1)}% of ${allDirs.length + 1})`,
);

// ── F. page-less subtrees ────────────────────────────────────

/**
 * A directory with ZERO card-bearing pages anywhere below it. Nothing of
 * it reaches the canvas, so a reparent that reasons from the canvas alone
 * cannot see it — and it still has to travel.
 *
 * Reported as MAXIMAL roots with their nested members underneath. The
 * roots compete for the reader's attention (each is a separate thing that
 * must travel) so they sort by count; the members underneath COLLABORATE
 * with their root to describe one subtree, so they sort by path.
 */
const pagesBelow = new Map<string, number>();
const filesBelow = new Map<string, number>();
const unreadBelow = new Map<string, number>();
for (const d of allDirs) {
  const rel = contentRel(d);
  const inside = (f: string) => contentRel(f).startsWith(rel + "/");
  pagesBelow.set(rel, pages.filter(inside).length);
  filesBelow.set(rel, allFiles.filter(inside).length);
  unreadBelow.set(rel, unread.filter(inside).length);
}

const pageLess = allDirs.map(contentRel).filter((d) => pagesBelow.get(d) === 0);
const maximal = pageLess.filter(
  (d) => !pageLess.some((other) => other !== d && d.startsWith(other + "/")),
);

console.log(
  "\n═══ F. PAGE-LESS SUBTREES (produce nothing on the canvas, must travel) ═══",
);
console.log("  files  unread  subtree");
for (const m of maximal.sort(
  (a, b) => filesBelow.get(b)! - filesBelow.get(a)! || a.localeCompare(b),
)) {
  console.log(
    `  ${String(filesBelow.get(m)).padStart(5)}  ${String(unreadBelow.get(m)).padStart(6)}  ${m}/`,
  );
  for (const nested of pageLess
    .filter((d) => d.startsWith(m + "/"))
    .sort((a, b) => a.localeCompare(b))) {
    console.log(
      `  ${String(filesBelow.get(nested)).padStart(5)}  ${String(unreadBelow.get(nested)).padStart(6)}    └ ${nested}/`,
    );
  }
}
console.log(
  `\n  maximal page-less subtrees ${maximal.length}, page-less directories in total ${pageLess.length}`,
);
const pageLessAllUnread = maximal.filter((m) => unreadBelow.get(m) === filesBelow.get(m));
console.log(
  `  of the maximal ones, ${pageLessAllUnread.length} hold ONLY unread files (invisible to the session end to end)`,
);
for (const m of maximal) {
  if (unreadBelow.get(m) !== filesBelow.get(m)) {
    console.log(
      `  mixed: ${m}/ holds ${filesBelow.get(m)! - unreadBelow.get(m)!} read-but-page-less file(s) — already in the snapshot`,
    );
  }
}

// ── G. extensionless files and root strays ───────────────────

console.log("\n═══ G. EXTENSIONLESS FILES AND CONTENT-ROOT STRAYS ═══");
const extensionless = allFiles.filter((f) => {
  const base = toPosix(f).slice(toPosix(f).lastIndexOf("/") + 1);
  return !base.slice(1).includes(".");
});
console.log(`  extensionless files  ${extensionless.length}`);
for (const f of extensionless) {
  console.log(`    ${contentRel(f).padEnd(46)} ${classOf.get(f)}`);
}
console.log(`\n  files directly at the content root  ${rootFiles.length}`);
for (const f of rootFiles.sort((a, b) => contentRel(a).localeCompare(contentRel(b)))) {
  console.log(`    ${contentRel(f).padEnd(46)} ${classOf.get(f)}`);
}

// ── H. read-but-page-less (the split, stated) ────────────────

console.log("\n═══ H. READ BUT PAGE-LESS (ignoreFiles — NOT unread, already kept) ═══");
console.log(`  files  ${readPageless.length}`);
for (const f of readPageless) {
  console.log(`    ${contentRel(f)}`);
}
console.log("  These are in the snapshot as nav heads, so a move already carries them.");

// ── I. manifest storage arithmetic ───────────────────────────

const flat = unread.map(contentRel).sort();
const nested: Record<string, string[]> = {};
for (const rel of flat) {
  const d = dirOfRel(rel);
  (nested[d] ??= []).push(rel.slice(d === "." ? 0 : d.length + 1));
}
const flatJson = JSON.stringify(flat);
const nestedJson = JSON.stringify(nested);

console.log("\n═══ I. MANIFEST STORAGE ARITHMETIC ═══");
console.log(
  `  flat  JSON array of full paths       ${flatJson.length} bytes  (${(flatJson.length / 1024).toFixed(2)} KB)`,
);
console.log(
  `  nested {dir: [names]}                ${nestedJson.length} bytes  (${(nestedJson.length / 1024).toFixed(2)} KB)`,
);
console.log(
  `  nested saves                         ${flatJson.length - nestedJson.length} bytes  (${(((flatJson.length - nestedJson.length) / flatJson.length) * 100).toFixed(1)}%)`,
);
console.log(
  `  per unread file, flat / nested       ${(flatJson.length / flat.length).toFixed(1)} / ${(nestedJson.length / flat.length).toFixed(1)} bytes`,
);

/**
 * The kept snapshot, MEASURED rather than quoted. docs/15 and CLAUDE.md
 * both carry a figure for this corpus; a survey that repeated it would
 * be citing a claim, not producing a receipt. `enforceStorageCaps` sums
 * `content.length` (UTF-16 code units), so this sums the same thing.
 */
const snapshot: FilesSnapshot = {};
for (const f of allFiles) {
  const path = repoRel(f);
  if (shouldSkipPath(path) || !ingestible(path)) continue;
  snapshot[path] = readFileSync(f, "utf8");
}
if (configPath)
  snapshot[toPosix(relative(root, configPath))] = readFileSync(configPath, "utf8");

const t0 = Date.now();
const parsed = hugoAdapter.parse(snapshot, "website");
const parseMs = Date.now() - t0;
const kept = filesOf(parsed.doc);
let keptBytes = 0;
for (const content of Object.values(kept)) keptBytes += content.length;
let readBytes = 0;
for (const content of Object.values(snapshot)) readBytes += content.length;

/** Reconciliation, because two published figures for this corpus differ
 *  and only one of them is what the cap counts. `enforceStorageCaps` sums
 *  CONTENT only; docs/15 quotes content + path keys. Both are printed so
 *  neither can be read as the other. */
const parts = new Map<string, { n: number; bytes: number }>();
let keyBytesRepoRel = 0;
let keyBytesContentRel = 0;
for (const [path, content] of Object.entries(kept)) {
  const kind = /\.md$/i.test(path)
    ? "markdown nav heads"
    : /\.html?$/i.test(path)
      ? "html nav heads"
      : "config files (whole)";
  const slot = parts.get(kind) ?? { n: 0, bytes: 0 };
  slot.n += 1;
  slot.bytes += content.length;
  parts.set(kind, slot);
  if (kind === "markdown nav heads") {
    keyBytesRepoRel += path.length;
    keyBytesContentRel += path.replace(`${CONTENT_REL}/`, "").length;
  }
}

console.log("\n  ── the budget this manifest would be charged against ──");
console.log(
  `  files READ (ingestible, unskipped)   ${Object.keys(snapshot).length}   ${(readBytes / 1024 / 1024).toFixed(2)} MB`,
);
console.log(
  `  files KEPT in the snapshot           ${Object.keys(kept).length}   ${(keptBytes / 1024).toFixed(1)} KB   (measured, parse took ${parseMs} ms)`,
);
for (const [kind, slot] of parts) {
  console.log(
    `    ${kind.padEnd(34)} ${String(slot.n).padStart(5)}   ${(slot.bytes / 1024).toFixed(1)} KB`,
  );
}
console.log(
  `    markdown path keys, content-rel        ${(keyBytesContentRel / 1024).toFixed(1)} KB   (repo-rel ${(keyBytesRepoRel / 1024).toFixed(1)} KB)`,
);
console.log(
  `  → heads + content-rel paths          ${((parts.get("markdown nav heads")!.bytes + keyBytesContentRel) / 1024).toFixed(1)} KB   ← the docs/15 accounting`,
);
console.log(
  `  → content only, what the cap counts  ${(keptBytes / 1024).toFixed(1)} KB   ← what enforceStorageCaps sums`,
);
console.log(
  `  → JSON.stringify(kept), on disk      ${(JSON.stringify(kept).length / 1024).toFixed(1)} KB   ← what localStorage holds`,
);
console.log(
  `  repo's claimed figure                445 KB / 1,672 pages (CLAUDE.md), 446 KB / 1,672 files (docs/15: 347.8 heads + 97.7 paths)`,
);
console.log(
  `  MAX_TOTAL_BYTES                      ${(MAX_TOTAL_BYTES / 1024).toFixed(0)} KB`,
);
console.log(
  `  top-level cards the adapter produced ${parsed.doc.sections.length}   (${parsed.doc.sections.map((s) => s.title).join(", ")})`,
);
const headroom = MAX_TOTAL_BYTES - keptBytes;
console.log(
  `  headroom after the kept snapshot     ${(headroom / 1024).toFixed(1)} KB  (${(headroom / 1024 / 1024).toFixed(2)} MB)`,
);
console.log(
  `  a flat manifest would consume        ${((flatJson.length / headroom) * 100).toFixed(3)}% of that headroom`,
);
console.log(
  `  headroom / flat manifest             ${Math.floor(headroom / flatJson.length)}× — the manifest is not a budget question`,
);

console.log("");
