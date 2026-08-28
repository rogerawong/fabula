/**
 * hugo.ts — Collection adapter for Hugo section trees, Docsy convention
 * (docs/14).
 *
 * NAV MODEL: there is no navigation artifact. Hugo has no nav file, no
 * toctree, no docs.json — the sidebar IS the content directory tree and
 * the theme decides how to render it. A directory holding `_index.md` is
 * a SECTION and that file is the section's own landing page; every other
 * `.md` is a PAGE, except inside a leaf bundle. Display name is
 * `linkTitle`/`linktitle` (both spellings occur in the wild, 11 and 7
 * times on the reference corpus) falling back to `title`.
 *
 * THE ORDERING LAW is what makes this adapter unlike every prior one:
 * the published order is COMPUTED, not stored. Hugo's default page sort
 * is weight ascending — with unweighted pages AFTER every weighted one —
 * then date descending, then linkTitle/title ascending, then path. So
 * parse must reproduce the sort or the canvas shows an order that
 * disagrees with the published sidebar. The date tier is deliberately
 * unimplemented: `date:` appears on 1 of 1,535 pages in the corpus and
 * the date would not be in a nav-head snapshot anyway (docs/14).
 *
 * TWO HAZARDS THE SURVEY FOUND, both guarded here:
 * - LEAF BUNDLES. A directory whose index file is `index.md` (not
 *   `_index.md`) is a single page; its sibling `.md` files are Hugo page
 *   RESOURCES. A scanner that treats every `.md` as a topic invents 629
 *   phantom topics on kubernetes/website.
 * - `card.weight`. 37 pages carry a `card:` mapping with its own
 *   `weight`. Only the top-level `weight` orders anything.
 *
 * Snapshot ownership is docs/15: the kept set is nav heads, so page
 * bodies never enter the session and a body edited after load survives
 * save by construction.
 */

import yaml from "js-yaml";
import { newId } from "@/model/id";
import type {
  Section,
  TocDocument,
  Topic,
  TopicUnlisted,
  UnlistedReason,
} from "@/model/types";
import { deriveTitleFromPath } from "@/model/naming";
import { applyFrontmatterEdits, dumpScalar, type FrontmatterEdits } from "../frontmatter";
import { navHeadOf, toNavHeads } from "../navHead";
import {
  buildLinkIndex,
  UNSTAMPED,
  type LinkIndex,
  type LinkSpecies,
} from "../linkIndex";
import type { ImportOccurrence } from "../importEvidence";
import type {
  CollectionAdapter,
  CollectionParseResult,
  CollectionPlanOptions,
  CollectionPlanResult,
  CollectionWarning,
  FileChange,
  FilesSnapshot,
} from "../types";

export const HUGO_FORMAT_ID = "hugo";

/**
 * Content files Hugo renders as pages.
 *
 * `.html` is included because Hugo treats a front-mattered `.html` under
 * `content/` as a page exactly like a `.md` — kubernetes/website has six
 * (the Katacoda "interactive-gone" tutorials). Scanning `.md` only made
 * those six invisible, and they were all `toc_hide` so nothing LOOKED
 * wrong; a missing page is a missing branch whether or not the corpus
 * happens to hide it (PRODUCT.md principle 6).
 *
 * Bundle markers stay `index.md` / `_index.md`. Hugo's bundle rules key
 * on the base name rather than the extension, so `index.html` is
 * plausible in principle — but NO corpus we hold contains one, so
 * treating it as a bundle marker would be a rendering claim with no
 * receipt behind it (CLAUDE.md, published-rendering fidelity). An
 * `index.html` therefore reads as an ordinary page today. Revisit when a
 * corpus produces one.
 *
 * Other content formats Hugo accepts (`.adoc`, `.org`, `.rst`, `.pandoc`)
 * are KNOWN-UNSUPPORTED, not overlooked — none appears in either corpus,
 * and each needs its own front-matter and bundle handling.
 */
const CONTENT_RE = /\.(md|html)$/i;
const BOM = "﻿";

// ── Front matter, read forgivingly ──────────────────────────

/**
 * Hugo's own parser accepts a closing fence with trailing whitespace;
 * the shipped `frontmatter.ts` requires exactly `---` and therefore
 * returns null for one real page in the corpus, silently losing its
 * title (issue #1). Reading is done here so this adapter does not
 * inherit that bug. WRITING still goes through frontmatter.ts, which is
 * byte-preserving — this is a read-side tolerance, not a second writer.
 */
interface Fm {
  data: Record<string, unknown>;
  /** TOML/JSON front matter: present but not YAML. */
  foreign: "toml" | "json" | null;
}

function readFrontmatter(content: string): Fm | null {
  const body = content.startsWith(BOM) ? content.slice(1) : content;
  if (/^\+\+\+[ \t]*\r?\n/.test(body)) return { data: {}, foreign: "toml" };
  if (/^\{[ \t]*\r?\n/.test(body)) return { data: {}, foreign: "json" };
  if (!/^---[ \t]*\r?\n/.test(body)) return null;
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const lines = body.split(eol).slice(1);
  const close = lines.findIndex((l) => l.trimEnd() === "---");
  if (close < 0) return null;
  try {
    const parsed = yaml.load(lines.slice(0, close).join("\n"), { json: true });
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return { data: parsed as Record<string, unknown>, foreign: null };
    }
    return { data: {}, foreign: null };
  } catch {
    return null;
  }
}

/** Only a TOP-LEVEL numeric weight orders anything (`card.weight` is a
 *  decoy carried by 37 corpus pages). */
function weightOf(data: Record<string, unknown>): number | undefined {
  const w = data.weight;
  if (typeof w === "number") return w;
  if (typeof w === "string" && w.trim() !== "" && Number.isFinite(Number(w))) {
    return Number(w);
  }
  return undefined;
}

/**
 * Flags that genuinely take a page out of the published navigation,
 * each with a receipt from the Docsy templates.
 *
 * `no_list` is DELIBERATELY ABSENT and this is the whole point of the
 * list. It reads like a visibility flag and is not one: it selects how a
 * landing page renders its own child list (`section-index.html:11`),
 * while the sidebar filters on `toc_hide` alone
 * (`sidebar-tree.html:87`). A page with `no_list` is in the sidebar,
 * reachable, and perfectly normal. Deriving a mark from it mislabelled
 * **77 pages** of kubernetes/website, `setup/production-environment`
 * among them.
 *
 * Corpus counts: toc_hide 3, headless 9 — and one page carries both.
 */
const UNLISTED_FLAGS: [string, string][] = [
  // Cause AND remedy, and the distinction between them is the point:
  // toc_hide still SERVES the page, headless does not build one at all.
  [
    "toc_hide",
    "Not in the site's sidebar — still published at its URL. Remove `toc_hide` to list it.",
  ],
  [
    "headless",
    "Not published at all — Hugo builds no URL for it. Remove `headless` to publish it.",
  ],
];

/** Only `toc_hide` removes a SUBTREE: Docsy filters the union of Pages
 *  and Sections on that key alone (`sidebar-tree.html:87`). `headless`
 *  describes the node itself, so it never propagates. */
const SUBTREE_FLAG = "toc_hide";

function unlistedOf(data: Record<string, unknown>): TopicUnlisted | undefined {
  const reasons = UNLISTED_FLAGS.filter(
    ([key]) => data[key] === true || data[key] === "true",
  ).map(([label, note]) => ({ label, note }));
  return reasons.length > 0 ? { reasons } : undefined;
}

function displayTitle(data: Record<string, unknown>): string | undefined {
  for (const key of ["linkTitle", "linktitle", "title"]) {
    const v = data[key];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return undefined;
}

// ── Config ──────────────────────────────────────────────────

export interface HugoConfig {
  /**
   * OBSERVED ONLY, and it does not mean what its name suggests: the
   * setting stops Hugo generating redirect HTML stubs, while
   * `Page.Aliases` stays available to templates. Both real sites that
   * set it pair it with a redirects output format. Reported at Review,
   * never used to refuse (docs/16).
   */
  disableAliases: boolean;
  /** Where content lives, e.g. "content/en". */
  contentDir: string;
  /** Regexes from `ignoreFiles`, applied to the path. */
  ignore: RegExp[];
  /** Declared languages, in config order. DECLARED, not present — the
   *  reference clone declares 17 and carries 1 on disk. */
  languages: HugoLanguage[];
  defaultLanguage: string | null;
  /** True when a Hugo config file was actually found. */
  found: boolean;
}

export interface HugoLanguage {
  /** The config key: `en`, `zh-cn`. */
  key: string;
  /** `languageName` if declared, else the key — never invented, and
   *  never assumed to be English (the config names its own primary). */
  label: string;
  /** Where this language's content lives, if declared. */
  contentDir: string | null;
}

const CONFIG_RE = /^(hugo|config)\.(toml|yaml|yml|json)$/i;

/**
 * Read the bits of hugo.toml this adapter needs. TOML is read by
 * targeted line matching rather than a parser: three scalar keys, one
 * array and one table-name sweep do not justify a dependency, and the
 * corpus's 17 KB config is mostly params we must not interpret.
 */
export function readHugoConfig(files: FilesSnapshot): HugoConfig {
  const cfg: HugoConfig = {
    disableAliases: false,
    contentDir: "content",
    ignore: [],
    languages: [],
    defaultLanguage: null,
    found: false,
  };
  const path = Object.keys(files).find((p) => CONFIG_RE.test(baseOf(p)));
  if (!path) return cfg;
  cfg.found = true;
  const raw = files[path]!;

  const scalar = (key: string): string | null => {
    const m = new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']`, "m").exec(raw);
    return m?.[1] ?? null;
  };
  cfg.contentDir = scalar("contentDir") ?? cfg.contentDir;
  cfg.disableAliases = /^\s*disableAliases\s*[:=]\s*true/m.test(raw);
  cfg.defaultLanguage = scalar("defaultContentLanguage");

  for (const pattern of tomlStringArray(raw, "ignoreFiles")) {
    try {
      cfg.ignore.push(new RegExp(pattern));
    } catch {
      // an unparseable ignore pattern is not worth failing an import
    }
  }

  // Each `[languages.xx]` table runs until the next table header, so the
  // keys inside it are read from that slice rather than globally —
  // otherwise every language inherits the first one's contentDir.
  const headers = [...raw.matchAll(/^[ \t]*\[languages\.([A-Za-z0-9_-]+)\][ \t]*$/gm)];
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i]![1]!;
    if (cfg.languages.some((l) => l.key === key)) continue;
    const from = headers[i]!.index! + headers[i]![0].length;
    const next = raw.indexOf("\n[", from);
    const block = raw.slice(from, next < 0 ? raw.length : next);
    const pick = (name: string): string | null =>
      new RegExp(`^[ \\t]*${name}[ \\t]*=[ \\t]*["']([^"']+)["']`, "m").exec(
        block,
      )?.[1] ?? null;
    cfg.languages.push({
      key,
      label: pick("languageName") ?? key,
      contentDir: pick("contentDir"),
    });
  }
  if (!cfg.defaultLanguage && cfg.languages.length > 0) {
    cfg.defaultLanguage = cfg.languages[0]!.key;
  }
  // The DEFAULT language usually declares no contentDir of its own — the
  // top-level one is its. kubernetes/website is exactly this: root
  // `contentDir = "content/en"`, and only the other sixteen spell theirs
  // out. Without this the default language reads as "not present" and the
  // picker would offer to open the tree already on screen.
  const fallback = cfg.languages.find((l) => l.key === cfg.defaultLanguage);
  if (fallback && fallback.contentDir === null) fallback.contentDir = cfg.contentDir;
  return cfg;
}

/**
 * Extract a TOML array-of-strings by key.
 *
 * Scanned character by character rather than matched with a regex,
 * because the values here are THEMSELVES regexes and routinely contain
 * `[` and `]`. The real corpus's list is
 * `[ "(?:^|/)OWNERS$", "README[-]+[a-z]*\\.md", …, "content/en/docs/doc-contributor-tools" ]`
 * and a non-greedy `\[([\s\S]*?)\]` terminates at the `]` inside `[-]`,
 * keeping the first pattern and silently discarding the rest. The list
 * then looks honoured while three quarters of it is gone — which is how
 * an ignored directory ended up on the canvas.
 */
export function tomlStringArray(raw: string, key: string): string[] {
  const start = new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*\\[`, "m").exec(raw);
  if (!start) return [];
  const out: string[] = [];
  let i = start.index + start[0].length;
  let quote: string | null = null;
  let current = "";
  for (; i < raw.length; i++) {
    const ch = raw[i]!;
    if (quote) {
      if (ch === "\\" && quote === '"') {
        // TOML basic strings escape with backslash; keep the escaped
        // character so `\\.` survives into the RegExp as `\.`
        current += raw[++i] ?? "";
        continue;
      }
      if (ch === quote) {
        out.push(current);
        current = "";
        quote = null;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "]") break; // only reachable outside a quoted string
  }
  return out;
}

function baseOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

// ── Scanner ─────────────────────────────────────────────────

interface Page {
  path: string;
  dir: string;
  data: Record<string, unknown>;
  title: string;
  titleDerived: boolean;
  weight: number | undefined;
  unlisted: TopicUnlisted | undefined;
  /** Directory this page IS the index of (`_index.md` or a bundle). */
  indexOf: string | null;
}

interface Scan {
  /** dir → its section index page, when one exists. */
  indexByDir: Map<string, Page>;
  /** dir → ordinary pages directly inside it. */
  pagesByDir: Map<string, Page[]>;
  /** every directory that participates in the nav. */
  dirs: Set<string>;
  warnings: CollectionWarning[];
  /**
   * What this scan observed and DISCARDED (docs/17). Only facts about
   * files the snapshot will not hold: skipped, folded, refused. The
   * implicit sections and tied weights this same pass computes stay
   * OUT — the snapshot keeps those paths and those weights, so they are
   * selectors, and noticing them here first does not make them evidence.
   */
  evidence: ImportOccurrence[];
}

function scan(files: FilesSnapshot, cfg: HugoConfig): Scan {
  const warnings: CollectionWarning[] = [];
  const evidence: ImportOccurrence[] = [];
  // `ignoreFiles` patterns are written relative to the PROJECT root, but
  // the importer strips whatever prefix the user picked — so a pattern
  // like `content/en/docs/doc-contributor-tools` never matches a
  // snapshot rooted at `content/en`. Test both forms rather than
  // silently ignoring the ignore list.
  const ignored = (path: string) =>
    cfg.ignore.some((re) => re.test(path) || re.test(`${cfg.contentDir}/${path}`));

  const contentPaths = Object.keys(files)
    .filter((p) => CONTENT_RE.test(p))
    .sort();
  const mdPaths = contentPaths.filter((p) => !ignored(p));
  for (const path of contentPaths) {
    if (!ignored(path)) continue;
    // The site excludes these on purpose and the snapshot never keeps
    // them, so nothing downstream could ever recount them.
    evidence.push({
      kind: "hugo-ignored",
      detail:
        "pages excluded by the site" + String.fromCharCode(8217) + "s own ignore rules",
      receipt: "ignoreFiles: " + cfg.ignore.map((re) => re.source).join(", "),
    });
  }

  // Leaf bundles first: a directory whose index file is `index.md`
  // (not `_index.md`) is a SINGLE page and its `.md` siblings are page
  // resources. Detect them before anything else claims those files.
  const bundleDirs = new Set<string>();
  for (const p of mdPaths) {
    if (baseOf(p) === "index.md") bundleDirs.add(dirOf(p));
  }

  const indexByDir = new Map<string, Page>();
  const pagesByDir = new Map<string, Page[]>();
  const dirs = new Set<string>();

  for (const path of mdPaths) {
    const dir = dirOf(path);
    const base = baseOf(path);
    // resource inside a leaf bundle — not a page at all
    if (bundleDirs.has(dir) && base !== "index.md") {
      evidence.push({
        kind: "hugo-bundle-resource",
        detail: "files folded into a leaf bundle rather than kept as pages",
        receipt: "leaf bundle: a directory whose index file is index.md",
      });
      continue;
    }

    const fm = readFrontmatter(files[path]!);
    if (fm?.foreign) {
      warnings.push({
        kind: `${fm.foreign}-frontmatter`,
        detail: `${path}: ${fm.foreign.toUpperCase()} front matter is not read; this page keeps a path-derived title and is never rewritten.`,
      });
    }
    const data = fm?.data ?? {};
    const explicit = displayTitle(data);
    const page: Page = {
      path,
      dir,
      data,
      title: explicit ?? deriveTitleFromPath(path),
      titleDerived: explicit === undefined,
      weight: weightOf(data),
      unlisted: unlistedOf(data),
      indexOf: base === "_index.md" ? dir : base === "index.md" ? dir : null,
    };

    if (base === "_index.md") {
      indexByDir.set(dir, page);
      dirs.add(dir);
      continue;
    }
    if (base === "index.md") {
      // the bundle itself is a page of its PARENT directory
      const parent = dirOf(dir);
      pagesByDir.set(parent, [...(pagesByDir.get(parent) ?? []), page]);
      dirs.add(parent);
      continue;
    }
    pagesByDir.set(dir, [...(pagesByDir.get(dir) ?? []), page]);
    dirs.add(dir);
  }

  // A directory holding pages but no `_index.md` is still a section —
  // Hugo renders it, so hiding it would truncate shape (PRODUCT.md 6).
  // Register every ancestor, all the way up. This used to stop at
  // `cfg.contentDir`, which is a GUESS when no config was found — and
  // the guess left the directories above the content tree unregistered,
  // so the root-finder had nothing to descend through and produced an
  // empty document instead of a wrong one.
  for (const dir of [...dirs]) {
    let cursor = dirOf(dir);
    while (cursor) {
      dirs.add(cursor);
      cursor = dirOf(cursor);
    }
  }
  return { indexByDir, pagesByDir, dirs, warnings, evidence };
}

/**
 * Where the documentation tree starts inside this snapshot.
 *
 * The user may point the importer at three different levels and all
 * three are legitimate, so this is derived rather than assumed:
 *
 *   repo root        → `hugo.toml` names `contentDir` ("content/en"),
 *                      and Docsy puts the docs section beneath it
 *   `content/en`     → no config in the snapshot; `docs/` is right there
 *   `content/en/docs`→ no config, no `docs/`; the snapshot IS the root
 *
 * Descending into `docs/` is a DOCSY convention, not a Hugo one, which
 * is exactly the scope this adapter claims. It matters because
 * `content/en` also holds `blog/` and `case-studies/` — site areas that
 * are not documentation navigation, and that a naive "sections are the
 * immediate subdirectories" rule would silently mix into the canvas.
 */
export function navRootOf(
  files: FilesSnapshot,
  cfg: HugoConfig,
  dirs: Set<string>,
): string {
  const has = (dir: string) =>
    dirs.has(dir) || Object.keys(files).some((p) => p.startsWith(dir + "/"));

  // The config's contentDir is authoritative only when it is actually in
  // this snapshot. Opening a SIBLING language hands us `content/de` while
  // the config still says `content/en`, so trusting it blindly walks to a
  // directory that is not here and yields one bogus root.
  const configPoints = cfg.found && has(cfg.contentDir);
  let base = configPoints ? cfg.contentDir : "";

  // No config to point the way: descend through single-child directory
  // chains, which is how `content/en/docs` is found when the user picked
  // a folder above it. Stopping at the first branch is the point —
  // that branch is the section list. Without this the tree came back
  // EMPTY rather than wrong, which is the worse failure: an empty canvas
  // reads as "this site has no docs".
  if (!configPoints) {
    for (;;) {
      const children = [...dirs].filter((d) => dirOf(d) === base && d !== base);
      const pagesHere = Object.keys(files).some(
        (p) => dirOf(p) === base && CONTENT_RE.test(p),
      );
      if (pagesHere || children.length !== 1) break;
      // Do not descend into the last section: a single child with no
      // subdirectories of its own IS the section list, so stepping into
      // it leaves zero roots and the document parses empty.
      const only = children[0]!;
      if (![...dirs].some((d) => dirOf(d) === only)) break;
      base = only;
    }
  }

  const docs = base === "" ? "docs" : `${base}/docs`;
  if (has(docs)) return docs;
  return base;
}

/**
 * Split declared languages into those whose content is actually in the
 * granted folder and those that are not.
 *
 * DECLARED ≠ PRESENT, and the reference corpus is the proof: `hugo.toml`
 * declares 17 languages and the clone carries one. The disclosure counts
 * what the site declares — that is the true fact about the site — while
 * the picker can only open what was granted, so it has to say which is
 * which rather than offering seventeen doors that lead nowhere.
 */
export function partitionLanguages(
  cfg: HugoConfig,
  files: FilesSnapshot,
): { present: HugoLanguage[]; absent: HugoLanguage[] } {
  const paths = Object.keys(files);
  const present: HugoLanguage[] = [];
  const absent: HugoLanguage[] = [];
  for (const lang of cfg.languages) {
    const dir = lang.contentDir;
    const here = dir !== null && paths.some((p) => p === dir || p.startsWith(dir + "/"));
    (here ? present : absent).push(lang);
  }
  return { present, absent };
}

/** The snapshot for a loaded docs tree is that tree, and the config that
 *  described it — nothing from sibling site areas. */
function underNavRoot(files: FilesSnapshot, navRoot: string): FilesSnapshot {
  const out: FilesSnapshot = {};
  for (const [path, content] of Object.entries(files)) {
    const inTree = navRoot === "" || path.startsWith(navRoot + "/");
    if (inTree || CONFIG_RE.test(baseOf(path))) out[path] = content;
  }
  return out;
}

// ── The ordering law ────────────────────────────────────────

interface Sortable {
  weight: number | undefined;
  title: string;
  path: string;
}

/**
 * Hugo's default page sort. Weight ascending, but UNWEIGHTED SORTS LAST
 * — the trap that makes this worth a named function: a naive
 * `(a.weight ?? 0) - (b.weight ?? 0)` puts unweighted pages first, which
 * is the opposite of what Hugo publishes.
 */
export function byHugoOrder(a: Sortable, b: Sortable): number {
  const aw = a.weight;
  const bw = b.weight;
  if (aw !== undefined && bw !== undefined && aw !== bw) return aw - bw;
  if (aw !== undefined && bw === undefined) return -1;
  if (aw === undefined && bw !== undefined) return 1;
  // date tier deliberately absent (docs/14): 1 page of 1,535 carries one
  const byTitle = a.title.localeCompare(b.title);
  return byTitle !== 0 ? byTitle : a.path.localeCompare(b.path);
}

// ── parse ───────────────────────────────────────────────────

// ── Links, harvested once at import (docs/16) ───────────────

/**
 * A page's site URL, Hugo's default permalink.
 *
 * `content/en/docs/tasks/foo.md` → `/docs/tasks/foo/`, i.e. the path
 * relative to the CONTENT root, extension dropped, wrapped in slashes.
 * An `_index.md` addresses its own directory. A `slug:` replaces the
 * final segment — 7 corpus pages set one.
 *
 * Verified against the corpus rather than assumed: real links like
 * `/docs/tasks/configure-pod-container/assign-memory-resource/` resolve
 * to the file of that name under `content/en`.
 */
function permalinkOf(path: string, contentRoot: string, slug?: string): string {
  const rel = contentRoot === "" ? path : path.slice(contentRoot.length + 1);
  const noExt = rel.replace(/\.(md|html)$/i, "");
  const asDir = noExt.replace(/(^|\/)_index$/, "");
  const segments = asDir.split("/").filter(Boolean);
  if (slug && segments.length > 0) segments[segments.length - 1] = slug;
  return segments.length === 0 ? "/" : `/${segments.join("/")}/`;
}

/**
 * The content root a URL is relative to — the nav root's parent when
 * the config's `contentDir` is not what this snapshot actually holds.
 * Opening a sibling language hands us `content/de` while the config
 * still says `content/en`, the same trap `navRootOf` already documents.
 */
function contentRootFor(navRoot: string, cfg: HugoConfig): string {
  const declared = cfg.contentDir;
  if (declared && (navRoot === declared || navRoot.startsWith(declared + "/"))) {
    return declared;
  }
  return dirOf(navRoot);
}

/**
 * The two species a Hugo move affects, counted together and named
 * separately.
 *
 * Together because they answer one question — how many links point
 * here — and the survey's 8,002 edges are their sum. Separately
 * because they BREAK differently, and the index records what it
 * recognised so a reader can tell a real zero from an unmeasured one:
 *
 * - absolute site paths (5,796 in the corpus) break SILENTLY, a 404,
 *   and are the species alias-on-move repairs outright;
 * - `{{< ref >}}` (2,583, of which 99% sit in generated API reference)
 *   resolves by content path, not URL, so an alias cannot help it —
 *   but Hugo FAILS THE BUILD on an unresolvable ref, so that breakage
 *   already shouts.
 *
 * Relative `.md` links are a third species with zero instances in this
 * corpus and no recogniser here; their absence from `species` is what
 * makes that legible rather than silent.
 */
function hugoLinkSpecies(pages: readonly Page[], contentRoot: string): LinkSpecies[] {
  const byUrl = new Map<string, string>();
  const byContentPath = new Map<string, string>();
  for (const page of pages) {
    const slug = typeof page.data.slug === "string" ? page.data.slug : undefined;
    byUrl.set(permalinkOf(page.path, contentRoot, slug), page.path);
    byContentPath.set(page.path, page.path);
    const rel = contentRoot === "" ? page.path : page.path.slice(contentRoot.length + 1);
    byContentPath.set(rel, page.path);
  }

  return [
    {
      name: "absolute-site-path",
      // Markdown links and bare href/src attributes, rooted at the site.
      find: (body) => [
        ...[...body.matchAll(/\]\((\/[^)\s"']*)\)/g)].map((m) => m[1]!),
        ...[...body.matchAll(/(?:href|src)=["'](\/[^"'\s]*)["']/g)].map((m) => m[1]!),
      ],
      resolve: (raw) => {
        // Anchors and queries address the same page.
        const clean = raw.split("#")[0]!.split("?")[0]!;
        if (clean === "") return null;
        const withSlash = clean.endsWith("/") ? clean : clean + "/";
        return byUrl.get(withSlash) ?? null;
      },
    },
    {
      name: "ref-shortcode",
      find: (body) =>
        [...body.matchAll(/\{\{<\s*(?:ref|relref)\s+"?([^"\s>]+)"?[^>]*>\}\}/g)].map(
          (m) => m[1]!,
        ),
      resolve: (raw, fromPath) => {
        const clean = raw.split("#")[0]!;
        if (clean === "") return null;
        // A ref resolves by content path: absolute from the content
        // root, or relative to the linking page's own directory.
        const direct = byContentPath.get(clean.replace(/^\//, ""));
        if (direct) return direct;
        const sibling = `${dirOf(fromPath)}/${clean}`;
        return byContentPath.get(sibling) ?? null;
      },
    },
  ];
}
/**
 * When this import was observed.
 *
 * Taken ONCE per parse and threaded, rather than read at each display:
 * a count rendered against the current clock would drift away from the
 * bytes it describes. Callers pass it in so `parse` stays a pure
 * function of its input — a clock read inside would make two parses of
 * the same files differ and take the fixpoint suites red with it.
 */
function parse(files: FilesSnapshot, rootName: string): CollectionParseResult {
  const cfg = readHugoConfig(files);
  const scanned = scan(files, cfg);
  const { indexByDir, pagesByDir, dirs, warnings } = scanned;

  const childDirs = (dir: string): string[] => [...dirs].filter((d) => dirOf(d) === dir);

  const sortableOf = (p: Page): Sortable => ({
    weight: p.weight,
    title: p.title,
    path: p.path,
  });

  /** A subdirectory becomes a topic; its pages and subdirs its children. */
  const topicForDir = (dir: string): Topic => {
    const index = indexByDir.get(dir);
    const kids: { node: Topic; sort: Sortable }[] = [];
    for (const page of pagesByDir.get(dir) ?? []) {
      kids.push({
        node: {
          id: newId(),
          title: page.title,
          path: page.path,
          ...(page.titleDerived ? { titleDerived: true } : {}),
          ...(page.unlisted ? { unlisted: page.unlisted } : {}),
          children: [],
        },
        sort: sortableOf(page),
      });
    }
    for (const sub of childDirs(dir)) {
      const subIndex = indexByDir.get(sub);
      kids.push({
        node: topicForDir(sub),
        sort: subIndex
          ? sortableOf(subIndex)
          : { weight: undefined, title: deriveTitleFromPath(sub), path: sub },
      });
    }
    kids.sort((a, b) => byHugoOrder(a.sort, b.sort));
    return {
      id: newId(),
      title: index?.title ?? deriveTitleFromPath(dir),
      path: index?.path ?? dir,
      ...(index === undefined || index.titleDerived ? { titleDerived: true } : {}),
      ...(index?.unlisted ? { unlisted: index.unlisted } : {}),
      children: kids.map((k) => k.node),
    };
  };

  /**
   * Mark every descendant of a `toc_hide`'d node as INHERITED-hidden.
   *
   * The receipt is the same one the whole feature rests on: Docsy filters
   * `union .Pages .Sections` on `toc_hide` (`sidebar-tree.html:87`), so
   * a hidden node takes its subtree with it. Without this pass those
   * pages render as ordinary published rows — 199 of 1,038 on
   * kubernetes/website — which is a false PRESENCE claim, the more
   * misleading direction of the two.
   *
   * A node with its own flag keeps its own reasons: "this section is
   * hidden" and "this page has no URL" are two different true facts and
   * the second is not implied by the first.
   */
  const propagate = (
    nodes: Topic[],
    from: { title: string; reasons: UnlistedReason[] } | null,
  ): void => {
    for (const node of nodes) {
      const own = node.unlisted?.reasons ?? [];
      if (from) {
        // Recorded whether or not the page carries a flag of its own.
        // "This page has no URL" and "this page is inside a section the
        // sidebar drops" are two different true facts; showing only the
        // first is what made nine Tasks rows read as ordinary members of
        // a visible section.
        node.unlisted = {
          reasons: own,
          inheritedFrom: { via: from.title, reasons: from.reasons },
        };
      }
      const hidesSubtree = own.some((r) => r.label === SUBTREE_FLAG);
      propagate(node.children, hidesSubtree ? { title: node.title, reasons: own } : from);
    }
  };

  const navRoot = navRootOf(files, cfg, dirs);
  // Top level: the directories directly under the nav root.
  const roots = [...dirs].filter((d) => dirOf(d) === navRoot);
  const sections: Section[] = roots
    .map((dir) => {
      const index = indexByDir.get(dir);
      const topic = topicForDir(dir);
      return {
        section: {
          id: newId(),
          title: topic.title,
          path: topic.path,
          // Same derivation as a topic: a card IS a directory here, and
          // `toc_hide` on its `_index.md` removes it from the published
          // sidebar together with everything under it.
          ...(index?.unlisted ? { unlisted: index.unlisted } : {}),
          topics: topic.children,
        } as Section,
        sort: index
          ? sortableOf(index)
          : { weight: undefined, title: deriveTitleFromPath(dir), path: dir },
      };
    })
    .sort((a, b) => byHugoOrder(a.sort, b.sort))
    .map((s) => s.section);

  for (const section of sections) {
    const hides = section.unlisted?.reasons.some((r) => r.label === SUBTREE_FLAG);
    propagate(
      section.topics,
      hides ? { title: section.title, reasons: section.unlisted!.reasons } : null,
    );
  }

  if (!cfg.found) {
    // The config sits ABOVE the content tree, so importing `content/en`
    // or lower cannot see it — and then `ignoreFiles` and the language
    // table are simply unknown. Say so rather than pretending: no
    // hardcoded fallback list, because guessing which directories a site
    // excludes is how a canvas quietly gains pages the site never
    // publishes.
    warnings.push({
      kind: "hugo-config-missing",
      detail:
        "No hugo.toml in this folder — ignore rules and language info unavailable. Pick the repository root for best results; Fabula descends to the docs tree on its own.",
    });
  }

  const langs = partitionLanguages(cfg, files);
  // Which language did we actually load? The one whose contentDir the
  // nav root sits under — corroborated from the tree rather than assumed
  // from `defaultContentLanguage`, and never assumed to be English.
  const loadedLanguage =
    cfg.languages.find(
      (l) => l.contentDir !== null && navRoot.startsWith(l.contentDir),
    ) ??
    cfg.languages.find((l) => l.key === cfg.defaultLanguage) ??
    null;
  if (cfg.languages.length > 1) {
    warnings.push({
      kind: "sibling-languages",
      detail: `${cfg.languages.length} languages declared · ${loadedLanguage?.label ?? cfg.defaultLanguage ?? "default"} loaded · ${langs.present.length - 1 > 0 ? `${langs.present.length - 1} more in this folder` : "no others in this folder"}.`,
    });
  }

  // Harvest links HERE, and only here. `parse` already holds every
  // whole body — `toNavHeads` is applied on the line below, inside
  // this function — so the read is free and touches no law. The fence
  // is the other half of the split that docs/16 named: no STORED
  // bodies (docs/15) and no POST-IMPORT body reads. Re-reading at move
  // time would be drift detection wearing a hat, and would make the
  // answer depend on disk state the app does not own.
  const contentRoot = contentRootFor(navRoot, cfg);
  const harvested: Page[] = [
    ...[...indexByDir.values()],
    ...[...pagesByDir.values()].flat(),
  ].filter((page) => navRoot === "" || page.path.startsWith(navRoot + "/"));
  // TARGETS are pages in the loaded tree; SOURCES are every body the
  // importer read. A blog post linking into `docs/` breaks exactly as a
  // sibling page does, and scoping the harvest to the nav root hid 38%
  // of the corpus's edges (4,952 found against the survey's 8,002).
  // This is why the index carries its own path table: a `from` here can
  // name a file the snapshot does not keep.
  const linkIndex: LinkIndex = buildLinkIndex({
    bodies: Object.entries(files).filter(([path]) => CONTENT_RE.test(path)),
    species: hugoLinkSpecies(harvested, contentRoot),
    // Stamped by the loader: `parse` must not read the clock, or two
    // parses of the same bytes differ and every purity claim in this
    // file stops being checkable.
    observedAt: UNSTAMPED,
  });

  return {
    doc: {
      id: newId(),
      name: rootName,
      formatId: HUGO_FORMAT_ID,
      // Keep the nav, not the file (docs/15) — and only the nav of the
      // tree that was actually loaded. `content/en` also holds `blog/`
      // and `case-studies/`; carrying their heads would inflate the
      // snapshot with files no plan can ever touch.
      extras: {
        files: toNavHeads(underNavRoot(files, navRoot)),
        // Beside the snapshot it was observed from, and stamped, so a
        // count is never displayed without "as of import".
        linkIndex,
        hugo: {
          contentDir: cfg.contentDir,
          navRoot,
          languages: cfg.languages,
          loadedLanguage: loadedLanguage?.key ?? null,
          presentLanguages: langs.present.map((l) => l.key),
        },
      },
      sections,
    },
    warnings,
    evidence: [
      ...scanned.evidence,
      // DECLARED languages stay a selector: the config that declares them
      // is kept, so the panel can recount them on open. PRESENCE was
      // observed against a folder the app no longer holds, and nothing
      // downstream can tell an absent language from one never declared.
      ...langs.absent.map((lang) => ({
        kind: "hugo-language-absent",
        detail:
          "languages this site declares whose content was not in the imported folder",
        receipt: "hugo.toml [languages." + lang.key + "]",
      })),
    ],
  };
}

// ── planChanges ─────────────────────────────────────────────

/** The gapped-by-10 convention the corpus overwhelmingly uses (336 of
 *  the gaps between distinct sibling weights are exactly 10). */
const WEIGHT_STEP = 10;

interface Placed {
  /** ORIGINAL path — the key into the snapshot. Never the destination. */
  path: string;
  /**
   * Where this page ends up. Equal to `path` unless the model moved it.
   *
   * Two fields because they answer two questions and one name serving
   * both is how this planner would silently look up a moved page's
   * bytes at an address that does not exist yet.
   */
  toPath: string;
  title: string;
  /** Index among its siblings in the EDITED model. */
  index: number;
}

/** One page changing parent: its old path, its new one, and the
 *  directories either side. */
interface MovePlan {
  path: string;
  from: string;
  to: string;
  toPath: string;
}

/**
 * A leaf bundle is a page whose basename is `index.md`.
 *
 * DERIVABLE FROM THE SNAPSHOT, which is the whole reason the refusal is
 * drawn here rather than at "directories containing unread files": that
 * line would need an evidence channel built to serve one predicate. Its
 * directory holds resources the app never read — 42 of the corpus's 60
 * non-content files sit in one bundled tutorial app — so moving the page
 * alone strands them.
 */
function isLeafBundle(path: string): boolean {
  return baseOf(path) === "index.md";
}

/**
 * Walk the edited model and record, per directory, the order its pages
 * are meant to appear in — with each page bucketed where it LANDS, so a
 * moved page's weight is solved among its new neighbours (docs/16).
 */
/**
 * The directory a NEW section would occupy: a sibling of the existing
 * ones, named from its title (docs/16 step 6c).
 *
 * Slugged the way Hugo itself addresses a directory — lowercase,
 * non-alphanumerics to hyphens — because the directory name IS the URL
 * segment, so an unslugged title would publish at a path nobody typed.
 */
export function newSectionSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function targetByDir(
  doc: TocDocument,
  sectionOrder: string[],
  /**
   * Where a section with NO backing file will live. Supplied by
   * `planChanges`, which is the layer that knows the nav root — this
   * function only needs to be told, and a section absent from the map
   * keeps its old behaviour of ordering at the root.
   */
  dirForNew: ReadonlyMap<string, string>,
): {
  byDir: Map<string, Placed[]>;
  pathOf: Map<string, string>;
  moved: MovePlan[];
} {
  const byDir = new Map<string, Placed[]>();
  const pathOf = new Map<string, string>();
  const moved: MovePlan[] = [];
  const ordered = sectionOrder
    .map((id) => doc.sections.find((s) => s.id === id))
    .filter((s): s is Section => Boolean(s));

  /**
   * Which directory's ordering does this page participate in?
   *
   * A page orders among the other pages of its own directory — EXCEPT a
   * section index, which represents the directory itself and therefore
   * orders among its PARENT's children. Keying `_index.md` by its own
   * directory puts every section index alone in a bucket, where nothing
   * ever needs reordering and a subsection can never be moved.
   */
  const orderingDir = (path: string): string => {
    const base = baseOf(path);
    // `_index.md` REPRESENTS its directory and `index.md` represents a
    // leaf bundle, so both belong to the directory ABOVE their own.
    // Using two different notions of "which directory is this page in"
    // is what made every leaf bundle look like a cross-directory move.
    return base === "_index.md" || base === "index.md" ? dirOf(dirOf(path)) : dirOf(path);
  };

  /** The directory a node's children must live in, given where the node
   *  itself lives. `dir/_index.md` owns `dir`; a bare directory owns
   *  itself. */
  const ownedDir = (path: string): string =>
    baseOf(path) === "_index.md" || baseOf(path) === "index.md" ? dirOf(path) : path;

  const visit = (nodes: Topic[], expected: string): void => {
    const seen = new Map<string, number>();
    for (const node of nodes) {
      if (node.path) {
        // Hugo's membership IS the path, so a drop into another card
        // means the FILE has to move. v1 cannot do that (link handling —
        // docs/16), and refusing loudly is the point: grouping the node
        // under its old directory anyway would make the drag look
        // accepted and then quietly do nothing on save.
        const home = orderingDir(node.path);
        const isMove = home !== expected;
        // The destination path keeps the FILENAME: this is a move, not a
        // slug rename. Those are two operations, the survey counts 368
        // of the latter, and naming the difference here is what stops a
        // later reader folding them together because both emit
        // `FileChange.move`.
        const toPath = isMove ? `${expected}/${baseOf(node.path)}` : node.path;
        if (isMove) {
          moved.push({ path: node.path, from: home, to: expected, toPath });
        }
        // Bucketed by where it LANDS, so the destination's ordering is
        // computed with the page in it. Bucketing by its old home is
        // what made a moved page's weight get solved among neighbours it
        // was leaving.
        const dir = expected;
        const n = seen.get(dir) ?? 0;
        seen.set(dir, n + 1);
        byDir.set(dir, [
          ...(byDir.get(dir) ?? []),
          { path: node.path, toPath, title: node.title, index: n },
        ]);
        pathOf.set(node.id, node.path);
      }
      if (node.children.length > 0) {
        visit(node.children, node.path ? ownedDir(node.path) : expected);
      }
    }
  };
  for (const section of ordered) {
    // The section's own `_index.md` is not a row on its card, but it is
    // very much still present — without this it reads as removed and the
    // planner writes `_build.list: never` onto every section landing
    // page on a document nobody edited.
    if (section.path) pathOf.set(section.id, section.path);
    // A section with no file is one the canvas just created. Its topics
    // belong in the directory it is ABOUT to occupy, not at the root —
    // ordering them at "" made every one of them read as a move to the
    // nav root, which is a plan nobody asked for.
    const own = section.path ? ownedDir(section.path) : (dirForNew.get(section.id) ?? "");
    visit(section.topics, own);
  }
  return { byDir, pathOf, moved };
}

/**
 * Weights for one directory's target order.
 *
 * The no-touch law drives this: a page keeps its weight whenever the
 * order still works, so a page that merely SHIFTED because a neighbour
 * left is untouched. Only pages whose position genuinely disagrees with
 * their weight get rewritten, and gap arithmetic is preferred so most
 * insertions stay one-file edits.
 */
export function weightsFor(target: Sortable[]): Map<string, number> {
  const writes = new Map<string, number>();
  if (target.length < 2) return writes;

  // Where does Hugo's own sort stop agreeing with the target order?
  // Nothing before that point needs touching, which is what keeps a
  // reorder from rewriting weights the user never disturbed.
  let firstBreak = -1;
  for (let i = 1; i < target.length; i++) {
    if (byHugoOrder(target[i - 1]!, target[i]!) > 0) {
      firstBreak = i;
      break;
    }
  }
  if (firstBreak < 0) return writes; // already correct — no plan at all

  // Back up over any unweighted run immediately before the break. An
  // unweighted page sorts AFTER every weighted one, so a page cannot be
  // placed after it by weight: the run itself has to gain weights, or
  // the order stays expressible only by title — which is not something
  // this app may edit.
  let start = firstBreak;
  while (start > 0 && target[start - 1]!.weight === undefined) start--;

  const floor = start > 0 ? (target[start - 1]!.weight ?? 0) : 0;
  // Prefer the existing gap so the corpus's 10-step convention survives
  // and a single insertion stays a single-file edit.
  let ceiling: number | undefined;
  for (let j = firstBreak; j < target.length; j++) {
    const w = target[j]!.weight;
    if (w !== undefined && w > floor) ceiling = w;
  }
  const span = target.length - start;
  const step =
    ceiling !== undefined && ceiling - floor > span
      ? Math.floor((ceiling - floor) / (span + 1))
      : WEIGHT_STEP;

  for (let i = start; i < target.length; i++) {
    writes.set(target[i]!.path, floor + step * (i - start + 1));
  }
  return writes;
}

/**
 * Why an alias must not be written, or null when it is sound.
 *
 * The five conditions are not invented here: kubernetes/website's own
 * `layouts/index.redirects` template ERRORS THE BUILD on each of them,
 * which makes it a specification for this planner. All five are
 * answerable from the snapshot — aliases are front matter, so they are
 * in the nav heads already kept. No new reads, no new storage.
 *
 * A colliding alias is NOT written and the move says why. The move
 * itself still happens: the alias is the mitigation, not the
 * permission.
 */
type AliasRefusal =
  "whitespace" | "self" | "page-permalink" | "other-alias" | "crosses-language";

function aliasRefusal(
  alias: string,
  newPermalink: string,
  permalinks: ReadonlyMap<string, string[]>,
  aliasesInUse: ReadonlyMap<string, string>,
  ownPath: string,
): AliasRefusal | null {
  if (/\s/.test(alias)) return "whitespace";
  if (alias === newPermalink) return "self";
  if ((permalinks.get(alias) ?? []).some((path) => path !== ownPath)) {
    return "page-permalink";
  }
  const claimant = aliasesInUse.get(alias);
  if (claimant !== undefined && claimant !== ownPath) return "other-alias";
  // Localisation: the first segment of a Hugo multilingual URL is the
  // language key. Sibling-language documents are independent documents
  // (docs/14), so an alias that changes language is a cross-document
  // claim this app has no standing to make.
  const lang = (url: string): string => url.split("/")[1] ?? "";
  if (lang(alias) !== lang(newPermalink)) return "crosses-language";
  return null;
}

const ALIAS_REASON: Record<AliasRefusal, string> = {
  whitespace: "the old URL contains whitespace",
  self: "the old and new URLs are the same",
  "page-permalink": "another page already publishes at the old URL",
  "other-alias": "another page already redirects from the old URL",
  "crosses-language": "the old and new URLs are in different languages",
};
function planChanges(
  files: FilesSnapshot,
  doc: TocDocument,
  sectionOrder: string[],
  options?: CollectionPlanOptions,
): CollectionPlanResult {
  // Plan-level, default ON: the survey found restructures arrive in
  // bursts — 141 moves in 2018, 168 in 2024 — so a per-move decision
  // would be forty decisions in an afternoon. One toggle for the plan.
  const writeAliases = options?.writeAliases ?? true;
  const warnings: CollectionWarning[] = [];
  const changes: FileChange[] = [];
  const cfg = readHugoConfig(files);
  const scanned = scan(files, cfg);
  const { indexByDir, pagesByDir } = scanned;

  const original = new Map<string, Page>();
  for (const page of indexByDir.values()) original.set(page.path, page);
  for (const list of pagesByDir.values()) {
    for (const page of list) original.set(page.path, page);
  }

  // ── cross-directory moves: planned, with three refusals ───
  // ── new sections: create the _index.md, then populate it ──
  // ONE PLAN, because a section's purpose is receiving topics: shipping
  // the create without the moves produces a card that exists and can
  // never be filled (docs/14 settled item 5), and shipping the moves
  // without the create writes pages into a directory with no landing
  // page, which Hugo renders as an unnamed section.
  const navRootDir = navRootOf(files, cfg, scanned.dirs);
  const dirForNew = new Map<string, string>();
  for (const section of doc.sections) {
    if (section.path) continue;
    const slug = newSectionSlug(section.title);
    if (slug === "") {
      warnings.push({
        kind: "new-section-unnameable",
        blocking: true,
        detail: `"${section.title}" has no characters a directory name can use, so there is nowhere to create it. Rename the card and try again.`,
      });
      continue;
    }
    const dir = navRootDir === "" ? slug : `${navRootDir}/${slug}`;
    // The created file is a collision candidate: overwriting a real
    // landing page is the one thing a "create" must never do.
    if (files[`${dir}/_index.md`] !== undefined) {
      warnings.push({
        kind: "new-section-collision",
        blocking: true,
        detail: `${dir}/_index.md already exists, so "${section.title}" cannot be created there. Rename the card, or move its topics into the existing section instead.`,
      });
      continue;
    }
    dirForNew.set(section.id, dir);
  }

  const { byDir, pathOf, moved } = targetByDir(doc, sectionOrder, dirForNew);

  // Refuse before planning anything: a plan that silently dropped a
  // move would save cleanly and change nothing the user asked for.
  //
  // These are BLOCKING invariants. Two of the three are also knowable
  // at drag time and get a sentence there (docs/16 consent surface);
  // the drag-time check is the costume, exactly as with
  // `topicReparentRefused`. Neither may cite an inbound link count —
  // the index informs and never gates, and its absence tests are what
  // hold that.
  const claimed = new Map<string, string>();
  const planned: MovePlan[] = [];
  for (const m of moved) {
    if (isLeafBundle(m.path)) {
      warnings.push({
        kind: "leaf-bundle-move",
        blocking: true,
        detail: `${m.path} is a leaf bundle: its directory holds page resources this app never read, so moving the page alone would strand them. Move the whole directory by hand, or undo.`,
      });
      continue;
    }
    // Path collision — against a file that exists, or against another
    // move landing on the same name in the same plan. The second is
    // not hypothetical: two same-named pages dragged into one card is
    // one gesture repeated.
    const occupied = files[m.toPath] !== undefined && m.toPath !== m.path;
    const alsoClaimed = claimed.get(m.toPath);
    if (occupied || alsoClaimed !== undefined) {
      warnings.push({
        kind: "move-path-collision",
        blocking: true,
        detail: occupied
          ? `${m.toPath} already exists, so moving ${m.path} there would overwrite another page. Rename one of them by hand, or undo.`
          : `${m.path} and ${alsoClaimed} would both become ${m.toPath}. Only one page can hold a path.`,
      });
      continue;
    }
    claimed.set(m.toPath, m.path);
    planned.push(m);
  }

  // URL collision WITHOUT path collision: a `slug:` elsewhere already
  // publishes at the address this page would land on. Plan-time only —
  // it is rare (7 corpus pages set a slug) and needs the whole
  // document, which the drag does not have.
  const contentRoot = contentRootFor(navRootOf(files, cfg, scanned.dirs), cfg);
  // url -> EVERY page publishing there, not one.
  //
  // A Map keeping a single holder made the answer depend on iteration
  // order, and the case that matters is precisely the one with two:
  // when `tasks/other.md` sets `slug: beta`, it and `tasks/beta.md`
  // both publish at /docs/tasks/beta/. After beta moves away, `other`
  // legitimately owns that URL — so an alias back to it would re-shadow
  // a live page. Collapsing the duplicates hid the only case the check
  // exists for.
  const permalinks = new Map<string, string[]>();
  for (const page of original.values()) {
    const slug = typeof page.data.slug === "string" ? page.data.slug : undefined;
    const url = permalinkOf(page.path, contentRoot, slug);
    permalinks.set(url, [...(permalinks.get(url) ?? []), page.path]);
  }
  for (const m of planned) {
    const landing = permalinkOf(m.toPath, contentRoot);
    const holder = (permalinks.get(landing) ?? []).find((path) => path !== m.path);
    if (holder !== undefined) {
      warnings.push({
        kind: "move-url-collision",
        blocking: true,
        detail: `${m.path} would publish at ${landing}, which ${holder} already claims through its slug. Change one of them by hand, or undo.`,
      });
    }
  }
  // The create itself. Front matter carries the title and a weight, so
  // the new section lands where the user put it rather than sorting
  // last by title — the same ordering law every other card obeys.
  for (const [sectionId, dir] of dirForNew) {
    const at = doc.sections.findIndex((sec) => sec.id === sectionId);
    const section = doc.sections[at];
    if (!section) continue;
    const lines = [`title: ${dumpScalar(section.title)}`];
    const weight = (at + 1) * WEIGHT_STEP;
    lines.push(`weight: ${weight}`);
    changes.push({
      kind: "create",
      path: `${dir}/_index.md`,
      newContent: `---\n${lines.join("\n")}\n---\n`,
    });
  }

  const movesByPath = new Map(planned.map((m) => [m.path, m]));

  // ── alias-on-move (docs/16 option 2.5) ───────────────────
  // A Hugo alias is FRONT MATTER: it lives inside the ownership law,
  // on the moved page's own file, in the same nav-head edit the move
  // already makes for its weight. Zero body reads, zero foreign files
  // touched, zero new FileChange kinds, zero new regions.
  //
  // It repairs the dominant species outright — 5,796 absolute site
  // paths break because a move changes a page's URL, and an alias
  // restores the old URL as a 301. It does NOT repair `{{< ref >}}`,
  // which resolves by content path; that breakage fails the build
  // loudly and is what the INFORM count is for.
  const aliasesInUse = new Map<string, string>();
  for (const page of original.values()) {
    const declared = page.data.aliases;
    if (!Array.isArray(declared)) continue;
    for (const alias of declared) {
      if (typeof alias === "string") aliasesInUse.set(alias, page.path);
    }
  }

  const aliasWrites = new Map<string, string>();
  if (writeAliases) {
    for (const m of planned) {
      const page = original.get(m.path);
      const slug = typeof page?.data.slug === "string" ? page.data.slug : undefined;
      const oldUrl = permalinkOf(m.path, contentRoot, slug);
      const newUrl = permalinkOf(m.toPath, contentRoot, slug);
      const refusal = aliasRefusal(oldUrl, newUrl, permalinks, aliasesInUse, m.path);
      if (refusal !== null) {
        warnings.push({
          kind: "alias-not-written",
          detail: `${m.toPath}: no redirect from ${oldUrl} — ${ALIAS_REASON[refusal]}. The move still happens; links to the old URL will 404.`,
        });
        continue;
      }
      aliasWrites.set(m.path, oldUrl);
      aliasesInUse.set(oldUrl, m.path);
    }
  }

  /**
   * One change for one file, as a move when the file travels.
   *
   * Both emission sites go through here so the `move` decision is made
   * once. `region: "navHead"` is preserved ACROSS the move, which is the
   * seam docs/16 step 8 targets: at save time the writer splices this
   * head into the bytes it reads — and it must read them at the OLD
   * path, because the new one does not exist yet.
   */
  const emit = (path: string, newContent: string, move?: MovePlan): FileChange =>
    move === undefined
      ? { kind: "edit", path, newContent, region: "navHead" }
      : {
          kind: "move",
          fromPath: move.path,
          toPath: move.toPath,
          newContent,
          region: "navHead",
        };

  const edits = new Map<string, FrontmatterEdits>();
  const editFor = (path: string): FrontmatterEdits => {
    let e = edits.get(path);
    if (!e) {
      e = { set: {}, remove: [] };
      edits.set(path, e);
    }
    return e;
  };

  // ── renames ───────────────────────────────────────────────
  for (const list of byDir.values()) {
    for (const placed of list) {
      const page = original.get(placed.path);
      if (!page) {
        // No backing file: an `_index.md`-less directory has nowhere to
        // put a title. Same refusal as a position it cannot record —
        // dropping it silently made the rename stick on the canvas and
        // vanish at save.
        if (placed.title !== deriveTitleFromPath(placed.path)) {
          warnings.push({
            kind: "no-index-file",
            blocking: true,
            detail: `${placed.path} has no _index.md, so a new title cannot be written. This directory already exists on disk; the create-plus-move path (docs/16) makes an _index.md for a card the CANVAS created, not for a directory that is already there. Add one by hand, or undo the rename.`,
          });
        }
        continue;
      }
      if (placed.title === page.title) continue;
      // A page whose title was DERIVED from its path is exactly the one
      // a rename must write for — skipping it makes the rename appear to
      // work on the canvas and vanish on save. The derived flag is a
      // statement about the file, not a refusal (CONTRIBUTING).
      // Write the key the page already uses, so a site that standardised
      // on linkTitle keeps doing so and the diff stays one line.
      const key =
        page.data.linkTitle !== undefined
          ? "linkTitle"
          : page.data.linktitle !== undefined
            ? "linktitle"
            : "title";
      editFor(placed.path).set![key] = placed.title;
    }
  }

  // ── ordering ──────────────────────────────────────────────
  for (const [dir, list] of byDir) {
    const target: Sortable[] = [...list]
      .sort((a, b) => a.index - b.index)
      .map((p) => ({
        path: p.path,
        weight: original.get(p.path)?.weight,
        title: p.title,
      }));
    if (target.length < 2) continue;
    for (const [path, weight] of weightsFor(target)) {
      editFor(path).set!.weight = weight;
    }
    void dir;
  }

  // ── removals: hide, never delete ──────────────────────────
  const kept = new Set<string>(pathOf.values());
  for (const list of byDir.values()) for (const p of list) kept.add(p.path);
  for (const path of original.keys()) {
    if (kept.has(path)) continue;
    // `_build.list: never` removes the page from every list while
    // leaving it reachable by URL — the same contract as JTD's
    // nav_exclude and Docusaurus's unlisted. `draft: true` would
    // UNPUBLISH it, which a nav edit must never do (docs/14).
    editFor(path).set!["_build.list"] = "never";
    warnings.push({
      kind: "page-hidden",
      detail: `${path}: removed from navigation with \`_build.list: never\` — the page stays reachable by URL and the file is not deleted.`,
    });
  }

  // The all-unweighted destination is the case that bites: dropping
  // into a section where nothing carries a weight, at any position but
  // first, forces weights onto pages that had none — because a weighted
  // page sorts before every unweighted one. That is a real multi-file
  // edit and it is disclosed as one. Each forced file is already its own
  // change; this names WHY they appeared, so the extra rows do not read
  // as the planner touching files at random.
  if (planned.length > 0) {
    const forced = [...edits.entries()]
      .filter(([path, edit]) => {
        if (movesByPath.has(path)) return false;
        if (edit.set?.weight === undefined) return false;
        return original.get(path)?.weight === undefined;
      })
      .map(([path]) => path);
    if (forced.length > 0) {
      warnings.push({
        kind: "weights-forced-by-move",
        detail: `${forced.length} page${forced.length === 1 ? "" : "s"} in the destination had no weight and must gain one for the new order to be expressible: ${forced.join(", ")}. A weighted page sorts before every unweighted one, so the order cannot be recorded otherwise.`,
      });
    }
  }

  // ── dissolution: emptied sections PERSIST ─────────────────
  // Files are never deleted, and a section IS a directory with an
  // `_index.md`, so dissolution has nothing to delete. The emptied
  // section stays on the canvas as a genuinely-empty card, which is
  // honest because the directory is genuinely still there — a section
  // that vanished from the canvas while its directory survived on disk
  // would be the canvas lying about the file tree.
  //
  // Deleting it is the user's act, on the git side, where deletion
  // belongs. The asymmetry is real and worth stating: the same AI
  // proposal leaves eleven cards on MkDocs and thirteen on Hugo, and
  // both are correct. This line is where that gets explained.
  for (const section of doc.sections) {
    if (!section.path || section.topics.length > 0) continue;
    const dir = dirOf(section.path);
    const hadPages = (pagesByDir.get(dir) ?? []).length > 0;
    if (!hadPages) continue; // arrived empty; nothing was dissolved
    warnings.push({
      kind: "section-emptied",
      detail: `section emptied — directory retained\n${dir}/`,
    });
  }

  // ── materialise ───────────────────────────────────────────
  // Every planned move needs an entry even with nothing to write: the
  // file travels whether or not its front matter changes, and a move
  // that never reached `edits` would be dropped silently — the exact
  // failure the old blanket refusal existed to make loud.
  for (const m of planned) {
    const edit = editFor(m.path);
    const alias = aliasWrites.get(m.path);
    // PREPENDED, never replacing: a page may already declare redirects,
    // and the fixture tree has one that does. Overwriting them would
    // silently retire someone else's 301.
    if (alias !== undefined) edit.prepend = { aliases: [alias] };
  }

  // Observed, not inferred. `disableAliases = true` does NOT disable
  // aliases — Hugo's docs say it only stops the physical HTML stubs,
  // and both real sites that set it pair it with a redirects output
  // format that reads Page.Aliases. The app cannot verify that, because
  // layouts/ is not ingested, so it reports what it saw and says an
  // unconsumed alias is inert rather than broken.
  if (cfg.disableAliases && aliasWrites.size > 0) {
    warnings.push({
      kind: "aliases-disabled-in-config",
      detail: `hugo.toml sets disableAliases = true, so Hugo will not generate redirect stubs itself. The aliases are still written to front matter: sites that set this typically consume Page.Aliases from a redirects template instead. An unconsumed alias is an inert front-matter key, never a broken one.`,
    });
  }

  for (const [path, edit] of edits) {
    const isMove = movesByPath.has(path);
    const hasWork =
      isMove || Object.keys(edit.set ?? {}).length > 0 || (edit.remove ?? []).length > 0;
    if (!hasWork) continue;
    const existing = files[path];
    if (existing === undefined) {
      // A directory with pages but no `_index.md` is a real section with
      // NO FILE to carry front matter, so its position cannot be
      // recorded. Creating the `_index.md` is section creation, which v1
      // refuses (Decision 5). Refuse loudly: the previous behaviour
      // skipped silently and emitted weights for the OTHER siblings,
      // producing a plan that saved cleanly and did not reorder
      // anything.
      warnings.push({
        kind: "no-index-file",
        blocking: true,
        detail: `${path} has no _index.md, so there is nowhere to record its position. This directory already exists on disk; the create-plus-move path (docs/16) makes an _index.md for a card the CANVAS created, not for a directory that is already there. Add one by hand, or undo this move.`,
      });
      continue;
    }

    // A page with NO front matter cannot be edited in place — there is
    // no block to operate on. It can still legally gain one: Hugo pages
    // routinely start bare, and giving a moved page a `weight:` is the
    // minimal honest edit (docs/14). Build the head; splice-on-save
    // inserts it and leaves the body untouched.
    if (navHeadOf(existing) === "") {
      const lines = Object.entries(edit.set ?? {}).map(
        ([k, v]) => `${k}: ${dumpScalar(v)}`,
      );
      // A bare page that is only moving still travels — with an empty
      // head, so the splice writes nothing and the body is untouched.
      if (lines.length === 0 && !isMove) continue;
      if (lines.length === 0) {
        changes.push(emit(path, "", movesByPath.get(path)));
        continue;
      }
      changes.push(emit(path, `---\n${lines.join("\n")}\n---`, movesByPath.get(path)));
      warnings.push({
        kind: "frontmatter-created",
        detail: `${path}: had no front matter; adding ${lines.map((l) => l.split(":")[0]).join(", ")} so its position can be expressed.`,
      });
      continue;
    }

    const { content, refused } = applyFrontmatterEdits(existing, edit);
    for (const key of refused) {
      warnings.push({
        kind: "unmergeable-frontmatter",
        blocking: true,
        detail: `${path}: "${key}" uses YAML syntax the planner won't rewrite — edit by hand`,
      });
    }
    // A MOVE is still a change even when the nav head is untouched: the
    // file has to travel. Only a non-move may be skipped for having
    // nothing to say.
    const move = movesByPath.get(path);
    if (content === existing && move === undefined) continue;
    changes.push(emit(path, navHeadOf(content), move));
  }

  return { changes, warnings };
}

// ── Adapter ─────────────────────────────────────────────────

export const hugoAdapter: CollectionAdapter = {
  id: HUGO_FORMAT_ID,
  label: "Hugo (section tree, Docsy)",
  ingests: (path) => CONTENT_RE.test(path) || CONFIG_RE.test(baseOf(path)),
  detect: (files) => {
    const cfg = readHugoConfig(files);
    if (!cfg.found) return 0;
    const paths = Object.keys(files);
    const hasIndex = paths.some((p) => baseOf(p) === "_index.md");
    if (!hasIndex) return 0;
    // A Hugo config plus section index files is unambiguous; nothing
    // else in the registry writes `_index.md`.
    return 0.9;
  },
  supportsRename: { sections: true, topics: true },
  /**
   * **[amended 2026-08-17] This now reads TRUE.** Hugo changes a topic's
   * parent as of docs/16; the reasoning below is why it could not
   * before. Hugo's membership IS the path, so
   * a new parent means moving the file, and a moved file changes its own
   * URL — which is what breaks inbound links. Refused at the drag, in the
   * planner, and in the AI validator (docs/14 Decision 3). **docs/16
   * shipped the unlock on 2026-08-17** and this flag is now true; the
   * paragraph below is kept because it records why the flag exists and
   * what the premise correction was.
   *
   * This comment previously reasoned that `disableAliases = true` left the
   * corpus with no redirect mitigation. That premise is FALSE and the
   * correction is upward — it restores a capability the reasoning had
   * written off. Receipts, per docs/16:
   *
   * - Hugo's own docs on the setting: it *only prevents generation of
   *   the physical HTML files; the `Aliases` method on a `Page` object
   *   remains available for use in your configuration templates*.
   * - kubernetes/website does exactly that: `hugo.toml` declares a
   *   REDIRECTS output format and `layouts/index.redirects` iterates
   *   `$page.Aliases` into a Netlify `_redirects` file. The setting signals
   *   that redirects moved SERVER-SIDE, not that they were switched off.
   * - Five public Docsy sites surveyed; aliases work on 5 of 5.
   *
   * So an alias IS available as the mitigation when this flips, and
   * `disableAliases` is a disclosure to make, never a reason to refuse.
   */
  supportsReparent: true,
  // Membership IS the path: a new parent means a new directory, so the
  // file relocates and its URL changes with it.
  reparentMovesFiles: true,
  // TRUE: a canvas-created card becomes a directory with an `_index.md`
  // this planner writes (docs/16's create-plus-move), collisions and
  // unnameable slugs refused by name.
  createCards: true,
  // FALSE, and it surprised this arc: a section's own `_index.md` never
  // enters the per-directory ordering pass, so no weight is written for a
  // top-level card. Hugo can EXPRESS the order — the parse reads it back
  // from that same key — this planner simply does not write it, which is
  // exactly the distinction between a format's capability and an
  // adapter's. The one weight a card ever gets is on creation.
  reorderCards: false,
  // A section is a DIRECTORY, and Docsy's sidebar walks
  // `union .Pages .Sections` — a directory with no `_index.md` still
  // renders as a node. So a node needs no page of its own.
  nodesNeedTargets: false,
  /**
   * BOTH. A bare `.md` at the content root is a top-level PAGE, and
   * Docsy's sidebar renders it as a top-level link.
   *
   * METHOD — published-rendering fidelity, from the theme's own
   * template: `sidebar-tree.html` builds each level's child list as
   * `where (union $s.Pages $s.Sections).ByWeight ".Params.toc_hide" "!="
   * true`, so a section's regular PAGES are unioned with its
   * SUBSECTIONS at every level including the nav root, and the same
   * template branches `{{ if $s.IsPage }} td-sidebar-link__page {{ else
   * }} td-sidebar-link__section` — a page and a section are both nav
   * nodes and a childless one simply renders `without-child`. (Retrieved
   * from google/docsy@main, `theme/layouts/_partials/sidebar-tree.html`,
   * 2026-08-21; the same file and the same line docs/14 reads
   * `toc_hide` off.)
   *
   * VERIFIED AGAINST THIS PLANNER, never copied: hoisting
   * `content/docs/tasks/alpha.md` out of its card and into a standalone
   * at root plans exactly one `move` plus the root `_index.md` nav-head
   * edit — no directory, no `_index.md` for the born card — while the
   * WRAP shape additionally plans `create content/docs/<slug>/_index.md`.
   * Both are writable; the standalone is the one Docsy renders as the
   * hoisted page rather than as a folder wearing its name.
   */
  rootBearing: { sections: true, orphans: true },
  parse,
  planChanges,
};
