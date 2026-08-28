/**
 * survey-reparent.ts — Corpus survey behind docs/16 (reparenting).
 *
 * docs/16 has to decide what happens to INBOUND LINKS when a page moves
 * to another section. Three options were on the table — rewrite them,
 * refuse the move, or disclose and let review catch it — and the choice
 * turns on numbers nobody had measured: how often a real docs project
 * moves pages across directories, what its links are actually made of,
 * and how big a link index would be if we kept one.
 *
 *   pnpm exec vite-node scripts/survey-reparent.ts ~/k8s-website
 *   pnpm exec vite-node scripts/survey-reparent.ts ~/k8s-website --history ~/some/full-clone
 *
 * The reference corpora are shallow (depth 1), so the move-demand and
 * join sections need a second clone carrying history. Blobless is enough
 * and costs ~90 MB:
 *
 *   git clone --filter=blob:none --no-checkout --single-branch \
 *     https://github.com/kubernetes/website.git /tmp/k8s-history
 *
 * Without --history those sections SKIP with that message rather than
 * silently reporting zero — a shallow clone answers "no renames ever",
 * which is the most confidently wrong number in this file.
 *
 * Read-only. Never writes to the corpus, never fetches.
 *
 * The fence this script sits outside of: the APP may not read page
 * bodies at move time (docs/15 keeps nav heads only). A SURVEY reads
 * whatever it likes — its output is a number in a design note, not a
 * mechanism in the product. The whole point is to find out what the app
 * would be giving up.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, posix, relative } from "node:path";

const root = process.argv[2];
const historyFlag = process.argv.indexOf("--history");
const historyRepo = historyFlag > 0 ? process.argv[historyFlag + 1] : undefined;

if (!root) {
  console.error(
    "usage: vite-node scripts/survey-reparent.ts <hugo-repo> [--history <repo-with-history>]",
  );
  process.exit(1);
}

const CONTENT_ROOT = join(root, "content/en/docs");
const URL_PREFIX = "/docs";

// ── corpus walk ──────────────────────────────────────────────

/** hugo.toml ignoreFiles for this corpus — pages Hugo never builds, so
 *  they are neither link sources nor link targets. */
const IGNORE = [/(?:^|\/)OWNERS$/, /README[-]+[a-z]*\.md/, /^node_modules$/];

interface Page {
  /** Repo-relative path, e.g. content/en/docs/concepts/overview.md */
  path: string;
  /** Path relative to CONTENT_ROOT. */
  rel: string;
  /** Rendered URL, e.g. /docs/concepts/overview/ */
  url: string;
  kind: "branch" | "leaf" | "page";
  ext: string;
  bytes: number;
  raw: string;
  fm: string | null;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (IGNORE.some((re) => re.test(name))) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Front matter block, tolerant of a trailing-space close fence — the
 *  same tolerance src/collections/frontmatter.ts ships (issue #1). */
function frontMatter(raw: string): string | null {
  const body = raw.startsWith("\ufeff") ? raw.slice(1) : raw;
  if (!body.startsWith("---\n") && !body.startsWith("---\r\n")) return null;
  const eol = body.startsWith("---\r\n") ? "\r\n" : "\n";
  const lines = body.slice(3 + eol.length).split(eol);
  const idx = lines.findIndex((l) => l.trimEnd() === "---");
  return idx < 0 ? null : lines.slice(0, idx).join("\n");
}

function fmScalar(fm: string | null, key: string): string | null {
  if (!fm) return null;
  const m = new RegExp(`^${key}:[ \\t]*(.+)$`, "m").exec(fm);
  if (!m) return null;
  return m[1]!.trim().replace(/^["']|["']$/g, "");
}

/**
 * Hugo's URL for a content file, for THIS corpus's configuration
 * (no permalinks overrides in hugo.toml, defaultContentLanguage in root).
 *
 *   a/b.md         → /docs/a/b/
 *   a/_index.md    → /docs/a/            (branch bundle)
 *   a/b/index.md   → /docs/a/b/          (leaf bundle)
 *   slug: x        → last segment replaced by x
 *
 * Receipt for the leaf-bundle rule: gohugo.io/content-management/
 * page-bundles/ — "index.md ... the bundle's directory is its URL".
 */
function urlOf(rel: string, fm: string | null): { url: string; kind: Page["kind"] } {
  const base = basename(rel);
  const stem = base.replace(/\.(md|html)$/i, "");
  const dir = dirname(rel) === "." ? "" : dirname(rel);
  const slug = fmScalar(fm, "slug");

  if (stem === "_index") {
    const segs = dir ? dir.split("/") : [];
    if (slug && segs.length > 0) segs[segs.length - 1] = slug;
    return { url: posix.join(URL_PREFIX, ...segs) + "/", kind: "branch" };
  }
  if (stem === "index") {
    const segs = dir ? dir.split("/") : [];
    if (slug && segs.length > 0) segs[segs.length - 1] = slug;
    return { url: posix.join(URL_PREFIX, ...segs) + "/", kind: "leaf" };
  }
  const segs = (dir ? dir.split("/") : []).concat(slug ?? stem);
  return { url: posix.join(URL_PREFIX, ...segs) + "/", kind: "page" };
}

const allFiles = walk(CONTENT_ROOT);
const pages: Page[] = [];
const resources: string[] = [];

for (const full of allFiles) {
  const rel = relative(CONTENT_ROOT, full).split("\\").join("/");
  const ext = extname(full).toLowerCase();
  if (ext !== ".md" && ext !== ".html") {
    resources.push(rel);
    continue;
  }
  const raw = readFileSync(full, "utf8");
  const fm = frontMatter(raw);
  const { url, kind } = urlOf(rel, fm);
  pages.push({
    path: relative(root, full).split("\\").join("/"),
    rel,
    url,
    kind,
    ext,
    bytes: Buffer.byteLength(raw),
    raw,
    fm,
  });
}

const byUrl = new Map<string, Page>();
for (const p of pages) byUrl.set(p.url, p);
const byRel = new Map<string, Page>();
for (const p of pages) byRel.set(p.rel, p);

// ── A. bundle census ─────────────────────────────────────────

const leafDirs = new Set(
  pages.filter((p) => p.kind === "leaf").map((p) => dirname(p.rel)),
);
const resourcesInBundles = resources.filter((r) => leafDirs.has(dirname(r)));

console.log("\n═══ A. BUNDLE CENSUS (what a move has to carry) ═══");
console.log(`  content files              ${pages.length}`);
console.log(
  `    branch bundles (_index)  ${pages.filter((p) => p.kind === "branch").length}   → a SECTION move: directory travels`,
);
console.log(
  `    leaf bundles (index)     ${pages.filter((p) => p.kind === "leaf").length}   → a TOPIC move: directory travels (resources ride along)`,
);
console.log(
  `    plain pages              ${pages.filter((p) => p.kind === "page").length}   → a TOPIC move: one file`,
);
console.log(
  `  .html content pages        ${pages.filter((p) => p.ext === ".html").length}`,
);
console.log(`  non-content files          ${resources.length}`);
console.log(
  `    inside a leaf bundle     ${resourcesInBundles.length}   ← these are the ones that must travel with the page`,
);

// ── B. link anatomy census ───────────────────────────────────

type Species =
  | "absolute"
  | "relative-md"
  | "relative-dir"
  | "ref-shortcode"
  | "anchor-only"
  | "external"
  | "other";

interface Edge {
  from: Page;
  species: Species;
  target: string;
  resolved: string | null;
}

/** Strip fenced blocks and inline code: a link inside a sample is not a
 *  link. Counting them would inflate every number below. */
function stripCode(raw: string): string {
  return raw
    .replace(/^([ \t]*)(`{3,}|~{3,})[\s\S]*?^\1\2[ \t]*$/gm, "")
    .replace(/`[^`\n]*`/g, "");
}

const MD_LINK = /\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
const REF_DEF = /^\[[^\]]+\]:[ \t]*(\S+)/gm;
const SHORTCODE = /\{\{[<%]\s*(rel)?ref\s+"?([^"\s>%}]+)"?\s*[>%]\}\}/g;

/**
 * `{{< ref >}}` resolution, per gohugo.io/methods/page/ref/:
 *
 *   "Paths without a leading slash (/) are resolved first relative to the
 *    current page, and then relative to the rest of the site."
 *
 * and, decisively for docs/16:
 *
 *   "By default, Hugo will throw an error and fail the build if it cannot
 *    resolve the path."
 *
 * So a `ref` left dangling by a move is a BUILD FAILURE, not a 404 — the
 * loudest breakage species in the corpus, and the one least in need of
 * our warning.
 */
function resolveRef(from: Page, arg: string): string | null {
  const clean = arg.split("#")[0]!;
  if (clean === "") return from.url;
  if (clean.startsWith("/")) {
    const asUrl = resolveAbsolute(clean);
    if (asUrl) return asUrl;
    return candidates(clean.replace(/^\//, ""));
  }
  const near = candidates(posix.normalize(posix.join(dirname(from.rel), clean)));
  if (near) return near;
  // "…and then relative to the rest of the site": a bare filename match
  // anywhere. Hugo's own lookup is broader than this; a miss here is
  // counted as unresolved rather than guessed at.
  const stem = basename(clean);
  const hits = pages.filter((p) => basename(p.rel).replace(/\.(md|html)$/i, "") === stem);
  return hits.length === 1 ? hits[0]!.url : null;
}

function candidates(target: string): string | null {
  const t = target.replace(/^\.\//, "").replace(/\/$/, "");
  for (const suffix of ["", ".md", ".html", "/_index.md", "/index.md"]) {
    const hit = byRel.get(t + suffix);
    if (hit) return hit.url;
  }
  return null;
}

function classify(href: string): Species {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return "external";
  if (href.startsWith("#")) return "anchor-only";
  if (href.startsWith("/")) return "absolute";
  if (/\.(md|html)(#|$)/i.test(href)) return "relative-md";
  if (/^[.\w]/.test(href)) return "relative-dir";
  return "other";
}

/** Absolute site path → the page that owns it. Hugo serves /docs/a/b/
 *  and /docs/a/b interchangeably; anchors and query strings are dropped. */
function resolveAbsolute(href: string): string | null {
  const clean = href.split("#")[0]!.split("?")[0]!;
  if (!clean.startsWith(URL_PREFIX)) return null;
  const withSlash = clean.endsWith("/") ? clean : clean + "/";
  return byUrl.has(withSlash) ? withSlash : null;
}

/** Relative .md link → target page, resolved against the SOURCE's
 *  directory (Hugo leaves these to the renderer; the file-system reading
 *  is the one a moved file would break). */
function resolveRelativeMd(from: Page, href: string): string | null {
  const clean = href.split("#")[0]!.split("?")[0]!;
  const baseDir = from.kind === "page" ? dirname(from.rel) : dirname(from.rel);
  const target = posix.normalize(posix.join(baseDir, clean));
  const hit = byRel.get(target.replace(/^\.\//, ""));
  return hit ? hit.url : null;
}

const edges: Edge[] = [];
const speciesCount = new Map<Species, number>();
const speciesFiles = new Map<Species, Set<string>>();

for (const p of pages) {
  const text = stripCode(p.raw);
  const found: string[] = [];
  for (const m of text.matchAll(MD_LINK)) found.push(m[1]!);
  for (const m of text.matchAll(REF_DEF)) found.push(m[1]!);

  for (const href of found) {
    const species = classify(href);
    speciesCount.set(species, (speciesCount.get(species) ?? 0) + 1);
    if (!speciesFiles.has(species)) speciesFiles.set(species, new Set());
    speciesFiles.get(species)!.add(p.rel);
    const resolved =
      species === "absolute"
        ? resolveAbsolute(href)
        : species === "relative-md"
          ? resolveRelativeMd(p, href)
          : null;
    edges.push({ from: p, species, target: href, resolved });
  }

  for (const m of text.matchAll(SHORTCODE)) {
    speciesCount.set("ref-shortcode", (speciesCount.get("ref-shortcode") ?? 0) + 1);
    if (!speciesFiles.has("ref-shortcode")) speciesFiles.set("ref-shortcode", new Set());
    speciesFiles.get("ref-shortcode")!.add(p.rel);
    const href = m[2]!;
    edges.push({
      from: p,
      species: "ref-shortcode",
      target: href,
      resolved: resolveRef(p, href),
    });
  }
}

console.log("\n═══ B. LINK ANATOMY CENSUS (what a regex would have to harvest) ═══");
const order: Species[] = [
  "absolute",
  "relative-md",
  "ref-shortcode",
  "relative-dir",
  "anchor-only",
  "external",
  "other",
];
console.log("  species          links   files   resolved  breaks on a file move?");
for (const s of order) {
  const n = speciesCount.get(s) ?? 0;
  if (n === 0 && s === "other") continue;
  const res = edges.filter((e) => e.species === s && e.resolved).length;
  const breaks =
    s === "absolute"
      ? "YES (URL changes)"
      : s === "relative-md"
        ? "YES (path changes)"
        : s === "ref-shortcode"
          ? "YES (build error)"
          : s === "relative-dir"
            ? "yes, if in-corpus"
            : "no";
  console.log(
    `  ${s.padEnd(15)} ${String(n).padStart(5)}   ${String(speciesFiles.get(s)?.size ?? 0).padStart(5)}   ${String(res).padStart(8)}  ${breaks}`,
  );
}

// Where does each breakable species LIVE? A species concentrated in one
// generated subtree is a different design problem from one spread across
// hand-written prose: nobody drags generated API reference in a TOC tool.
console.log("\n  concentration of the breakable species (top subtree):");
for (const s of ["absolute", "ref-shortcode"] as const) {
  const dirs = new Map<string, number>();
  for (const e of edges.filter((x) => x.species === s)) {
    const key = e.from.rel.split("/").slice(0, 2).join("/");
    dirs.set(key, (dirs.get(key) ?? 0) + 1);
  }
  const top = [...dirs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const total = [...dirs.values()].reduce((a, b) => a + b, 0);
  console.log(
    `    ${s.padEnd(14)} ${top.map(([d, n]) => `${d} ${((n / total) * 100).toFixed(0)}%`).join("   ")}`,
  );
}
const absUnresolved = edges.filter((e) => e.species === "absolute" && !e.resolved);
console.log(
  `\n  absolute links that resolve to NO page   ${absUnresolved.length}  (other sections, other languages, or already broken)`,
);
for (const e of absUnresolved.slice(0, 3)) console.log(`    e.g. ${e.target}`);

// ── C. inbound-edge distribution ─────────────────────────────

const inbound = new Map<string, Edge[]>();
for (const e of edges) {
  if (!e.resolved) continue;
  if (!inbound.has(e.resolved)) inbound.set(e.resolved, []);
  inbound.get(e.resolved)!.push(e);
}

const counts = [...inbound.values()].map((v) => v.length).sort((a, b) => b - a);
const totalEdges = counts.reduce((a, b) => a + b, 0);
const linkedPages = counts.length;
const bucket = (lo: number, hi: number) =>
  counts.filter((c) => c >= lo && c <= hi).length;

console.log("\n═══ C. INBOUND-EDGE DISTRIBUTION (how much a move actually breaks) ═══");
console.log(`  resolved in-corpus edges     ${totalEdges}`);
console.log(
  `  pages with ≥1 inbound link   ${linkedPages} of ${pages.length}  (${((linkedPages / pages.length) * 100).toFixed(1)}%)`,
);
console.log(
  `  pages with ZERO inbound      ${pages.length - linkedPages}  (${(((pages.length - linkedPages) / pages.length) * 100).toFixed(1)}%)`,
);
console.log(`  max inbound on one page      ${counts[0] ?? 0}`);
console.log(
  `  median / p90 (linked pages)  ${counts[Math.floor(linkedPages / 2)] ?? 0} / ${counts[Math.floor(linkedPages * 0.1)] ?? 0}`,
);
console.log("  histogram:");
for (const [lo, hi, label] of [
  [1, 1, "1"],
  [2, 4, "2–4"],
  [5, 9, "5–9"],
  [10, 24, "10–24"],
  [25, 99, "25–99"],
  [100, 1e9, "100+"],
] as const) {
  console.log(
    `    ${String(label).padStart(6)} inbound  ${String(bucket(lo, hi)).padStart(5)} pages`,
  );
}
console.log("  most-linked targets:");
for (const [url, es] of [...inbound.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 5)) {
  console.log(`    ${String(es.length).padStart(4)}  ${url}`);
}

// storage arithmetic — per-target counts + bounded exemplars
const MAX_EXEMPLARS = 20;
const asStored = [...inbound.entries()].map(([url, es]) => ({
  t: byUrl.get(url)!.rel,
  n: es.length,
  x: [...new Set(es.map((e) => e.from.rel))].slice(0, MAX_EXEMPLARS),
}));
const storedJson = JSON.stringify(asStored);
const compact = JSON.stringify(
  asStored.map((r) => [r.t, r.n, r.x.map((p) => pages.findIndex((q) => q.rel === p))]),
);
const KEPT_SNAPSHOT = 445 * 1024; // measured, docs/15
const CEILING = 3 * 1024 * 1024; // MAX_TOTAL_BYTES
console.log("\n  storage arithmetic (per-target counts + ≤20 exemplars):");
console.log(`    naive JSON (paths)         ${(storedJson.length / 1024).toFixed(0)} KB`);
console.log(`    exemplars as path indices  ${(compact.length / 1024).toFixed(0)} KB`);
console.log(
  `    counts only, no exemplars  ${(JSON.stringify(asStored.map((r) => [r.t, r.n])).length / 1024).toFixed(0)} KB`,
);
console.log(`    kept snapshot today        ${(KEPT_SNAPSHOT / 1024).toFixed(0)} KB`);
console.log(
  `    MAX_TOTAL_BYTES ceiling    ${(CEILING / 1024).toFixed(0)} KB  → headroom ${((CEILING - KEPT_SNAPSHOT) / 1024).toFixed(0)} KB`,
);

// ── D. alias facts ───────────────────────────────────────────

const fmAliases = pages.filter((p) => p.fm && /^aliases:/m.test(p.fm));
const hugoToml = existsSync(join(root, "hugo.toml"))
  ? readFileSync(join(root, "hugo.toml"), "utf8")
  : "";
console.log("\n═══ D. ALIAS FACTS (is alias-on-move addressable here?) ═══");
console.log(
  `  disableAliases in hugo.toml  ${/^disableAliases\s*=\s*true/m.test(hugoToml) ? "TRUE" : "false/absent"}`,
);
console.log(
  `  REDIRECTS output format      ${/\[outputFormats\.REDIRECTS\]/.test(hugoToml) ? "present — aliases feed layouts/index.redirects" : "absent"}`,
);
console.log(`  pages with front-matter aliases  ${fmAliases.length}`);
for (const p of fmAliases) console.log(`    ${p.rel}`);
console.log(
  `  URLs already owned (pages)   ${byUrl.size}  ← an alias colliding with one of these fails the build`,
);

// ── E + F. move demand, and the join ─────────────────────────

console.log("\n═══ E. MOVE DEMAND (git history) ═══");
if (!historyRepo || !existsSync(join(historyRepo, ".git"))) {
  console.log("  SKIPPED — pass --history <repo-with-full-history>.");
  console.log("  The reference corpora are depth-1 clones; running this against one");
  console.log("  reports 'no page has ever moved', which is false and convincing.");
} else {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", historyRepo, ...args], {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
    });

  // Exact renames only (--find-renames=100%): detectable from tree object
  // ids alone, so a blobless clone answers without fetching a byte. It is
  // a LOWER BOUND — a move that also edited the page is invisible here,
  // which is why the A+D pass below runs too.
  const renameLog = git(
    "log",
    "--full-history",
    "--no-merges",
    "--diff-filter=R",
    "--find-renames=100%",
    "--name-status",
    "--format=C|%H|%ad",
    "--date=short",
    "--",
    "content/en/docs",
  );

  interface Move {
    from: string;
    to: string;
    date: string;
    exact: boolean;
  }
  const moves: Move[] = [];
  let date = "";
  for (const line of renameLog.split("\n")) {
    if (line.startsWith("C|")) {
      date = line.split("|")[2] ?? "";
      continue;
    }
    if (!line.startsWith("R")) continue;
    const [, from, to] = line.split("\t");
    if (from && to) moves.push({ from, to, date, exact: true });
  }

  // Path-only inference for content-edited moves: an add and a delete in
  // the SAME commit sharing a basename. No blobs, no similarity index —
  // deliberately crude and deliberately stated, because the alternative
  // (git's -M50%) needs file contents a blobless clone does not have.
  const rawLog = git(
    "log",
    "--full-history",
    "--no-merges",
    "--no-renames",
    "--name-status",
    "--format=C|%H|%ad",
    "--date=short",
    "--",
    "content/en/docs",
  );
  const inferred: Move[] = [];
  {
    let d = "";
    let adds: string[] = [];
    let dels: string[] = [];
    const flush = () => {
      const delByBase = new Map<string, string[]>();
      for (const p of dels) {
        const b = basename(p);
        if (!delByBase.has(b)) delByBase.set(b, []);
        delByBase.get(b)!.push(p);
      }
      for (const a of adds) {
        const cands = delByBase.get(basename(a));
        if (!cands || cands.length === 0) continue;
        const from = cands.shift()!;
        if (dirname(from) !== dirname(a)) {
          inferred.push({ from, to: a, date: d, exact: false });
        }
      }
      adds = [];
      dels = [];
    };
    for (const line of rawLog.split("\n")) {
      if (line.startsWith("C|")) {
        flush();
        d = line.split("|")[2] ?? "";
        continue;
      }
      const [st, path] = line.split("\t");
      if (!path) continue;
      if (st === "A") adds.push(path);
      else if (st === "D") dels.push(path);
    }
    flush();
  }

  // `--no-renames` re-reports every exact rename as an A + D pair, so the
  // inferred pass rediscovers all 489 of them. Union, not sum: the first
  // draft of this script printed 1,066 moves, which was 489 of them
  // counted twice.
  const seen = new Set(moves.map((m) => `${m.from} ${m.to}`));
  const all = [...moves, ...inferred.filter((m) => !seen.has(`${m.from} ${m.to}`))];
  const kindOf = (m: Move) =>
    dirname(m.from) !== dirname(m.to) && basename(m.from) !== basename(m.to)
      ? "both"
      : dirname(m.from) !== dirname(m.to)
        ? "move"
        : "slug";

  const crossDir = all.filter((m) => kindOf(m) !== "slug");
  console.log(
    `  history: ${git("rev-list", "--count", "HEAD").trim()} commits, from ${git("log", "--reverse", "--format=%ad", "--date=short", "--", "content/en/docs").split("\n")[0]}`,
  );
  console.log(`  exact renames (R100)                  ${moves.length}`);
  console.log(
    `  inferred moves (A+D, same name)       ${inferred.length}  of which ${inferred.length - (all.length - moves.length)} duplicate an exact rename`,
  );
  console.log(`  union                                 ${all.length}`);
  console.log(`  ── classified ──`);
  for (const k of ["move", "slug", "both"] as const) {
    const n = all.filter((m) => kindOf(m) === k).length;
    const label =
      k === "move"
        ? "directory changed, filename kept   (REPARENT)"
        : k === "slug"
          ? "filename changed, directory kept   (slug rename — out of scope)"
          : "both changed                       (reparent + rename)";
    console.log(`    ${String(n).padStart(5)}  ${label}`);
  }
  console.log("  cross-directory moves per year:");
  const perYear = new Map<string, number>();
  for (const m of crossDir) {
    const y = m.date.slice(0, 4);
    perYear.set(y, (perYear.get(y) ?? 0) + 1);
  }
  for (const y of [...perYear.keys()].sort()) {
    const n = perYear.get(y)!;
    console.log(
      `    ${y}  ${String(n).padStart(5)}  ${"█".repeat(Math.min(60, Math.ceil(n / 8)))}`,
    );
  }
  const commitsWithMoves = new Set(crossDir.map((m) => m.date)).size;
  console.log(`  distinct days with a cross-directory move: ${commitsWithMoves}`);

  // ── F. the join ────────────────────────────────────────────
  console.log("\n═══ F. MOVE × LINK JOIN (would these moves have broken links?) ═══");
  console.log("  HEAD-LINKS APPROXIMATION: inbound counts come from the corpus as it");
  console.log("  stands today, not as it stood when each move happened. It answers");
  console.log("  'how linked are the KINDS of page that get moved', not 'what broke'.");
  const recent = crossDir.filter((m) => m.date >= "2023-01-01");
  const scored = recent.map((m) => {
    const relTo = m.to.replace(/^content\/en\/docs\//, "");
    const page = byRel.get(relTo);
    const n = page ? (inbound.get(page.url)?.length ?? 0) : -1;
    return { m, n, present: !!page };
  });
  const present = scored.filter((s) => s.present);
  const withLinks = present.filter((s) => s.n > 0);
  console.log(`  cross-directory moves since 2023-01-01   ${recent.length}`);
  console.log(`  whose target still exists at HEAD        ${present.length}`);
  console.log(
    `  of those, ≥1 inbound link today          ${withLinks.length}  (${present.length ? ((withLinks.length / present.length) * 100).toFixed(0) : "—"}%)`,
  );
  const linkSum = withLinks.reduce((a, s) => a + s.n, 0);
  console.log(
    `  total inbound edges across them          ${linkSum}   (mean ${withLinks.length ? (linkSum / withLinks.length).toFixed(1) : "—"} per linked page)`,
  );

  // THE CONTROL. Without it "6% of moved pages had inbound links" is a
  // number with nothing to be small compared to. A defect report without
  // a control group is a hypothesis (CLAUDE.md); so is a survey finding.
  console.log("\n  ── control: how linked is a page picked at random? ──");
  console.log(
    `  ALL pages with ≥1 inbound link          ${linkedPages} of ${pages.length}  (${((linkedPages / pages.length) * 100).toFixed(0)}%)`,
  );
  const olderScored = crossDir
    .filter((m) => m.date < "2023-01-01")
    .map((m) => byRel.get(m.to.replace(/^content\/en\/docs\//, "")))
    .filter((p): p is Page => !!p);
  const olderLinked = olderScored.filter((p) => (inbound.get(p.url)?.length ?? 0) > 0);
  console.log(
    `  pages moved BEFORE 2023, still present  ${olderScored.length}, of which ${olderLinked.length} linked (${olderScored.length ? ((olderLinked.length / olderScored.length) * 100).toFixed(0) : "—"}%)`,
  );
  // What dominates the recent moves? If one generated subtree supplies
  // most of them, the low breakage rate is about THAT subtree, not about
  // moving pages in general.
  const bySubtree = new Map<string, number>();
  for (const s of present) {
    const key = s.m.to
      .replace(/^content\/en\/docs\//, "")
      .split("/")
      .slice(0, 2)
      .join("/");
    bySubtree.set(key, (bySubtree.get(key) ?? 0) + 1);
  }
  console.log("  where the recent moves landed:");
  for (const [d, n] of [...bySubtree.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) {
    console.log(`    ${String(n).padStart(4)}  ${d}`);
  }

  // The cut that decides the design. Everything under reference/ in this
  // corpus is machine-generated or machine-adjacent (kubernetes-api,
  // kubectl, setup-tools, generated) and churns on its own schedule; a
  // person dragging a card in this app is moving PROSE. Measure that
  // population separately or the generated churn hides it.
  const prose = (p: string) => !p.startsWith("reference/");
  const proseMoves = crossDir
    .map((m) => ({ m, rel: m.to.replace(/^content\/en\/docs\//, "") }))
    .filter((x) => prose(x.rel))
    .map((x) => ({ ...x, page: byRel.get(x.rel) }))
    .filter((x): x is typeof x & { page: Page } => !!x.page);
  const proseLinked = proseMoves.filter(
    (x) => (inbound.get(x.page.url)?.length ?? 0) > 0,
  );
  const proseCounts = proseLinked
    .map((x) => inbound.get(x.page.url)!.length)
    .sort((a, b) => a - b);
  console.log("\n  ── the cut that decides it: PROSE moves only (outside reference/) ──");
  console.log(
    `  cross-directory prose moves, target still present   ${proseMoves.length}`,
  );
  console.log(
    `  of those, ≥1 inbound link today                     ${proseLinked.length}  (${proseMoves.length ? ((proseLinked.length / proseMoves.length) * 100).toFixed(0) : "—"}%)`,
  );
  console.log(
    `  median inbound on a moved prose page                ${proseCounts[Math.floor(proseCounts.length / 2)] ?? 0}`,
  );
  console.log(
    `  total inbound edges those moves put at risk         ${proseCounts.reduce((a, b) => a + b, 0)}`,
  );

  // The price of option 1 (rewrite inbound links), stated as the thing it
  // would actually have to do: open other people's page BODIES and edit
  // them. Counting the distinct source files is counting the files the
  // ownership law would have to stop protecting.
  const sourceFiles = new Set<string>();
  for (const x of proseLinked) {
    for (const e of inbound.get(x.page.url)!) sourceFiles.add(e.from.rel);
  }
  console.log(
    `  → option 1 would edit BODIES of                     ${sourceFiles.size} distinct files (${((sourceFiles.size / pages.length) * 100).toFixed(0)}% of the corpus)`,
  );
  const perMove = proseLinked.map(
    (x) => new Set(inbound.get(x.page.url)!.map((e) => e.from.rel)).size,
  );
  console.log(
    `  → per single move, body edits in                    median ${perMove.sort((a, b) => a - b)[Math.floor(perMove.length / 2)] ?? 0} files, max ${Math.max(...perMove, 0)}`,
  );
  console.log("  worst offenders (inbound links on a page that was moved):");
  for (const s of [...withLinks].sort((a, b) => b.n - a.n).slice(0, 5)) {
    console.log(
      `    ${String(s.n).padStart(4)}  ${s.m.to.replace(/^content\/en\/docs\//, "")}`,
    );
  }
}

console.log("");
