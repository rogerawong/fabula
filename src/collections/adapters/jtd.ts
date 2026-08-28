/**
 * jtd.ts — Collection adapter for Just the Docs (Jekyll theme).
 * https://just-the-docs.com/docs/navigation/
 *
 * NAV MODEL (verified against the theme's own docs, incl. its
 * ambiguity test pages): navigation is assembled from per-page
 * frontmatter — `title` is the LINKAGE KEY; `parent`/`grand_parent`
 * reference titles (never paths; directory layout is officially
 * irrelevant); `nav_order` sorts siblings (numbers first, then
 * title-alphabetical case-sensitive); Liquid-truthy `nav_exclude`
 * hides a page (the string "false" is truthy!).
 *
 * planChanges emits minimal frontmatter edits (see frontmatter.ts):
 * - reorder → renumber the affected sibling group's nav_order (1..n)
 *   only when the induced order differs; untouched groups untouched
 * - rename → cascade to children's `parent:` and grandchildren's
 *   `grand_parent:` — on the RESOLVED tree, never by text matching
 * - move → parent/grand_parent rewrite + children's grand_parent;
 *   moves to root REMOVE children's grand_parent (a stale value hides
 *   pages in JTD)
 * - removal from the model → nav_exclude: true (files are never
 *   deleted)
 * - new in-app nodes → stub file creation
 * Ambiguity newly created by edits is auto-resolved by adding
 * grand_parent where that disambiguates; otherwise a blocking warning.
 */

import { newId } from "@/model/id";
import type { Section, TocDocument, Topic } from "@/model/types";
import {
  applyFrontmatterEdits,
  dumpScalar,
  parseFrontmatter,
  type FrontmatterEdits,
} from "../frontmatter";
import { slugify, targetFromModel, type TargetNode } from "../target";
import { navHeadOf, toNavHeads } from "../navHead";
import type {
  CollectionAdapter,
  CollectionParseResult,
  CollectionPlanResult,
  CollectionWarning,
  FileChange,
  FilesSnapshot,
} from "../types";

export const JTD_FORMAT_ID = "jtd";

// ── Page extraction ─────────────────────────────────────────

interface NavPage {
  path: string;
  title: string;
  parent?: string;
  grandParent?: string;
  /** Modern JTD: `ancestor` matches ANY ancestor title (the general
   *  form of grand_parent — seen in the theme's own test pages). */
  ancestor?: string;
  navOrder?: number | string;
  hasGrandParentKey: boolean;
  hasAncestorKey: boolean;
  hasNavOrderKey: boolean;
}

interface Extraction {
  pages: NavPage[];
  warnings: CollectionWarning[];
}

function extractPages(files: FilesSnapshot): Extraction {
  const warnings: CollectionWarning[] = [];
  const pages: NavPage[] = [];

  for (const path of Object.keys(files).sort()) {
    const block = parseFrontmatter(files[path]!);
    if (!block) continue; // not a nav page (no frontmatter) — silent
    if (block.data === null) {
      warnings.push({ kind: "skipped-file", detail: `${path}: unparsable frontmatter` });
      continue;
    }
    const fm = block.data;
    if (fm.title === undefined || fm.title === null) {
      warnings.push({ kind: "skipped-file", detail: `${path}: no title` });
      continue;
    }
    // Liquid truthiness: everything except false/nil excludes
    if (fm.nav_exclude !== undefined && fm.nav_exclude !== false) continue;

    pages.push({
      path,
      title: String(fm.title),
      parent: fm.parent != null ? String(fm.parent) : undefined,
      grandParent: fm.grand_parent != null ? String(fm.grand_parent) : undefined,
      ancestor: fm.ancestor != null ? String(fm.ancestor) : undefined,
      navOrder:
        typeof fm.nav_order === "number" || typeof fm.nav_order === "string"
          ? fm.nav_order
          : undefined,
      hasGrandParentKey: fm.grand_parent !== undefined,
      hasAncestorKey: fm.ancestor !== undefined,
      hasNavOrderKey: fm.nav_order !== undefined,
    });
  }
  return { pages, warnings };
}

// ── Tree assembly ───────────────────────────────────────────

interface ResolvedTree {
  roots: NavPage[];
  childrenOf: Map<NavPage, NavPage[]>;
  parentOf: Map<NavPage, NavPage>;
  warnings: CollectionWarning[];
}

/** The JTD sibling comparator (also the planner's no-op oracle). */
function compareSiblings(a: NavPage, b: NavPage): number {
  const ao = a.navOrder;
  const bo = b.navOrder;
  if (ao !== undefined && bo === undefined) return -1;
  if (ao === undefined && bo !== undefined) return 1;
  if (ao !== undefined && bo !== undefined) {
    const an = typeof ao === "number";
    const bn = typeof bo === "number";
    if (an && !bn) return -1;
    if (!an && bn) return 1;
    if (ao < bo) return -1;
    if (ao > bo) return 1;
  } else {
    if (a.title < b.title) return -1;
    if (a.title > b.title) return 1;
  }
  return a.path < b.path ? -1 : 1;
}

function assembleTree(pages: NavPage[]): ResolvedTree {
  const warnings: CollectionWarning[] = [];
  const byTitle = new Map<string, NavPage[]>();
  for (const p of pages) byTitle.set(p.title, [...(byTitle.get(p.title) ?? []), p]);

  for (const [title, list] of byTitle) {
    if (list.length > 1) {
      warnings.push({
        kind: "duplicate-title",
        detail: `"${title}" is used by ${list.map((p) => p.path).join(", ")}`,
      });
    }
  }

  // Iterative resolution: `ancestor` filters by the candidate's whole
  // chain, which depends on OTHER resolutions — run passes until the
  // links stabilize (3 passes suffice in practice; chains are shallow).
  let parentOf = new Map<NavPage, NavPage>();
  const chainTitles = (page: NavPage, links: Map<NavPage, NavPage>): Set<string> => {
    const titles = new Set<string>();
    const seen = new Set<NavPage>([page]);
    let cursor = links.get(page);
    while (cursor && !seen.has(cursor)) {
      titles.add(cursor.title);
      seen.add(cursor);
      cursor = links.get(cursor);
    }
    return titles;
  };

  const resolveOnce = (
    prev: Map<NavPage, NavPage>,
    emitWarnings: boolean,
  ): Map<NavPage, NavPage> => {
    const links = new Map<NavPage, NavPage>();
    for (const page of pages) {
      if (page.parent === undefined) continue;
      let candidates = (byTitle.get(page.parent) ?? []).filter((c) => c !== page);
      if (page.grandParent !== undefined) {
        candidates = candidates.filter((c) => c.parent === page.grandParent);
      }
      if (page.ancestor !== undefined && candidates.length > 1) {
        const filtered = candidates.filter(
          (c) => c.parent === page.ancestor || chainTitles(c, prev).has(page.ancestor!),
        );
        if (filtered.length > 0) candidates = filtered;
      }
      if (candidates.length === 0) {
        if (emitWarnings) {
          warnings.push({
            kind: "unknown-parent",
            detail: `${page.path}: parent "${page.parent}" not found — shown at top level`,
          });
        }
        continue;
      }
      if (candidates.length > 1) {
        candidates.sort((a, b) => (a.path < b.path ? -1 : 1));
        if (emitWarnings) {
          warnings.push({
            kind: "ambiguous-parent",
            detail: `${page.path}: parent "${page.parent}" matches multiple pages — attached under ${candidates[0]!.path}`,
          });
        }
      }
      links.set(page, candidates[0]!);
    }
    return links;
  };

  parentOf = resolveOnce(new Map(), false);
  parentOf = resolveOnce(parentOf, false);
  parentOf = resolveOnce(parentOf, true);

  // cycle pass: chains that never reach a root break at the page itself
  for (const page of pages) {
    const seen = new Set<NavPage>([page]);
    let cursor = parentOf.get(page);
    while (cursor) {
      if (seen.has(cursor)) {
        warnings.push({
          kind: "parent-cycle",
          detail: `${page.path}: circular parent chain — shown at top level`,
        });
        parentOf.delete(page);
        break;
      }
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }
  }

  const childrenOf = new Map<NavPage, NavPage[]>();
  const roots: NavPage[] = [];
  for (const page of pages) {
    const parent = parentOf.get(page);
    if (parent) {
      childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), page]);
    } else {
      roots.push(page);
    }
  }
  roots.sort(compareSiblings);
  for (const list of childrenOf.values()) list.sort(compareSiblings);

  return { roots, childrenOf, parentOf, warnings };
}

// ── parse → model ───────────────────────────────────────────

function toTopic(page: NavPage, tree: ResolvedTree): Topic {
  return {
    id: newId(),
    title: page.title,
    path: page.path,
    children: (tree.childrenOf.get(page) ?? []).map((c) => toTopic(c, tree)),
  };
}

function parse(files: FilesSnapshot, rootName: string): CollectionParseResult {
  const { pages, warnings: extractWarnings } = extractPages(files);
  const tree = assembleTree(pages);

  const sections: Section[] = tree.roots.map((root) => {
    const children = tree.childrenOf.get(root) ?? [];
    if (children.length === 0) {
      // top-level leaf → orphan card (the mkdocs/docfx pattern)
      return {
        id: newId(),
        title: root.title,
        path: root.path,
        isOrphan: true,
        topics: [toTopic(root, tree)],
      };
    }
    return {
      id: newId(),
      title: root.title,
      path: root.path,
      topics: children.map((c) => toTopic(c, tree)),
    };
  });

  return {
    doc: {
      id: newId(),
      name: rootName,
      formatId: JTD_FORMAT_ID,
      // Keep the nav, not the file (docs/15): page bodies never enter the
      // session, so a body edited after load has nothing stale to
      // overwrite it at save time.
      extras: { files: toNavHeads(files) },
      sections,
    },
    warnings: [...extractWarnings, ...tree.warnings],
  };
}

// ── planChanges ─────────────────────────────────────────────

function planChanges(
  files: FilesSnapshot,
  doc: TocDocument,
  sectionOrder: string[],
): CollectionPlanResult {
  const warnings: CollectionWarning[] = [];
  const { pages } = extractPages(files);
  const originalTree = assembleTree(pages);
  const pageByPath = new Map(pages.map((p) => [p.path, p]));

  const targetRoots = targetFromModel(doc, sectionOrder);

  // Assign paths to created nodes; collect per-node target parent info.
  interface Placed {
    node: TargetNode;
    path: string;
    parent: Placed | null;
    created: boolean;
  }
  const placed: Placed[] = [];
  const usedPaths = new Set(Object.keys(files));

  const placedPaths = new Set<string>();
  const place = (node: TargetNode, parent: Placed | null): Placed => {
    let path = node.path;
    let created = false;
    if (path !== null && placedPaths.has(path)) {
      // the same page referenced twice in the model (edge shapes from
      // exotic edit sequences) — back the second reference with a stub
      path = null;
    }
    if (path === null || !pageByPath.has(path)) {
      // in-app node without a backing nav page → stub
      let candidate = `${slugify(node.title)}.md`;
      let n = 2;
      while (usedPaths.has(candidate)) candidate = `${slugify(node.title)}-${n++}.md`;
      path = candidate;
      usedPaths.add(path);
      created = true;
    }
    placedPaths.add(path);
    const entry: Placed = { node, path, parent, created };
    placed.push(entry);
    for (const child of node.children) place(child, entry);
    return entry;
  };
  for (const root of targetRoots) place(root, null);

  const placedByPath = new Map(placed.map((p) => [p.path, p]));

  // ── target title index (for ambiguity management) ─────────
  const titleCount = new Map<string, number>();
  for (const p of placed) {
    titleCount.set(p.node.title, (titleCount.get(p.node.title) ?? 0) + 1);
  }

  // per-file accumulated edits
  const editsByPath = new Map<string, FrontmatterEdits>();
  const editFor = (path: string): FrontmatterEdits => {
    let e = editsByPath.get(path);
    if (!e) {
      e = { set: {}, remove: [] };
      editsByPath.set(path, e);
    }
    return e;
  };

  // ── titles, parents, disambiguation keys ──────────────────
  // Original placements (path → parent path) let us leave pages whose
  // attachment is UNCHANGED completely untouched — pre-existing
  // ambiguity in a repo is a parse warning, never a plan edit or a
  // blocking condition.
  const targetChainTitles = (p: Placed): string[] => {
    const titles: string[] = [];
    let cursor = p.parent;
    while (cursor) {
      titles.push(cursor.node.title);
      cursor = cursor.parent;
    }
    return titles;
  };

  /** Would the parser, over the TARGET title-space, attach this page to
   *  exactly `p.parent` using its EXISTING keys? Only then may the
   *  planner leave the linkage lines untouched — this is what catches
   *  stale grand_parent/ancestor keys on the children of moved pages. */
  const resolvesCorrectly = (p: Placed, original: NavPage): boolean => {
    if (p.parent === null) return original.parent === undefined;
    if (original.parent !== p.parent.node.title) return false;
    let candidates = placed.filter((q) => q !== p && q.node.title === original.parent);
    if (original.grandParent !== undefined) {
      candidates = candidates.filter(
        (q) => q.parent?.node.title === original.grandParent,
      );
    }
    if (original.ancestor !== undefined && candidates.length > 1) {
      const filtered = candidates.filter(
        (q) =>
          q.parent?.node.title === original.ancestor ||
          targetChainTitles(q).includes(original.ancestor!),
      );
      if (filtered.length > 0) candidates = filtered;
    }
    if (candidates.length === 0) return false;
    candidates.sort((a, b) => (a.path < b.path ? -1 : 1));
    return candidates[0] === p.parent;
  };

  for (const p of placed) {
    const original = pageByPath.get(p.path);
    if (original && original.title !== p.node.title) {
      editFor(p.path).set!.title = p.node.title;
    }

    const parentTitle = p.parent?.node.title;
    if (original !== undefined && resolvesCorrectly(p, original)) {
      continue; // existing linkage keys still resolve correctly — untouched
    }

    if (p.parent === null) {
      if (original?.parent !== undefined) editFor(p.path).remove!.push("parent");
      if (original?.hasGrandParentKey) editFor(p.path).remove!.push("grand_parent");
      if (original?.hasAncestorKey) editFor(p.path).remove!.push("ancestor");
      continue;
    }

    if (original?.parent !== parentTitle) {
      editFor(p.path).set!.parent = parentTitle!;
    }

    // Disambiguation: needed iff the parent's title collides in the
    // TARGET nav. Prefer grand_parent (the classic key) when the
    // grandparent's title distinguishes; else the nearest ancestor
    // title absent from every rival's chain; else blocking.
    const rivals = placed.filter((q) => q !== p.parent && q.node.title === parentTitle);
    const wanted: { key: "grand_parent" | "ancestor"; value: string } | null = (() => {
      if (rivals.length === 0) return null;
      const grandTitle = p.parent!.parent?.node.title;
      if (
        grandTitle !== undefined &&
        !rivals.some((r) => r.parent?.node.title === grandTitle)
      ) {
        return { key: "grand_parent", value: grandTitle };
      }
      const rivalChains = rivals.map((r) => new Set(targetChainTitles(r)));
      for (const title of targetChainTitles(p.parent!)) {
        if (!rivalChains.some((chain) => chain.has(title))) {
          return { key: "ancestor", value: title };
        }
      }
      warnings.push({
        kind: "unresolvable-ambiguity",
        blocking: true,
        detail:
          `${p.path}: parent "${parentTitle}" cannot be disambiguated — ` +
          `rename one of the "${parentTitle}" pages`,
      });
      return null;
    })();

    if (wanted) {
      const current =
        wanted.key === "grand_parent" ? original?.grandParent : original?.ancestor;
      if (current !== wanted.value) editFor(p.path).set![wanted.key] = wanted.value;
      const other = wanted.key === "grand_parent" ? "ancestor" : "grand_parent";
      const otherPresent =
        other === "ancestor" ? original?.hasAncestorKey : original?.hasGrandParentKey;
      if (otherPresent) editFor(p.path).remove!.push(other);
    } else {
      if (original?.hasGrandParentKey) editFor(p.path).remove!.push("grand_parent");
      if (original?.hasAncestorKey) editFor(p.path).remove!.push("ancestor");
    }
  }

  // ── nav_order per sibling group ───────────────────────────
  const groups: Placed[][] = [];
  const rootGroup = placed.filter((p) => p.parent === null);
  groups.push(rootGroup);
  for (const p of placed) {
    const children = placed.filter((q) => q.parent === p);
    if (children.length > 0) groups.push(children);
  }

  for (const group of groups) {
    // induced order: sort by CURRENT keys (with post-rename titles for
    // the alphabetical fallback — that's what Jekyll would see)
    const asNav: { placed: Placed; nav: NavPage }[] = group.map((p) => {
      const original = pageByPath.get(p.path);
      return {
        placed: p,
        nav: {
          path: p.path,
          title: p.node.title,
          navOrder: original?.navOrder,
          hasNavOrderKey: original?.hasNavOrderKey ?? false,
          hasGrandParentKey: false,
          hasAncestorKey: false,
        },
      };
    });
    const induced = [...asNav].sort((a, b) => compareSiblings(a.nav, b.nav));
    const matches = induced.every((entry, i) => entry.placed === group[i]);
    if (matches) continue;

    group.forEach((p, i) => {
      const original = pageByPath.get(p.path);
      const target = i + 1;
      if (original?.navOrder !== target) {
        editFor(p.path).set!.nav_order = target;
      }
    });
  }

  // ── removals → nav_exclude on every removed page ──────────
  const walkOriginal = (page: NavPage): void => {
    if (!placedByPath.has(page.path)) {
      editFor(page.path).set!.nav_exclude = true;
    }
    for (const child of originalTree.childrenOf.get(page) ?? []) walkOriginal(child);
  };
  for (const root of originalTree.roots) walkOriginal(root);

  // ── materialize changes ───────────────────────────────────
  const changes: FileChange[] = [];
  for (const [path, edits] of editsByPath) {
    const hasWork =
      Object.keys(edits.set ?? {}).length > 0 || (edits.remove ?? []).length > 0;
    if (!hasWork) continue;

    const existing = files[path];
    if (existing === undefined) continue; // creates handled below
    const { content, refused } = applyFrontmatterEdits(existing, edits);
    for (const key of refused) {
      warnings.push({
        kind: "unmergeable-frontmatter",
        blocking: true,
        detail: `${path}: "${key}" uses YAML syntax the planner won't rewrite — edit by hand`,
      });
    }
    if (content === existing) continue;
    // Emit the NAV HEAD, never the file. navHeadOf is applied rather than
    // assumed so the plan is correct whether `files` arrived already
    // sliced (the runtime path) or whole (a caller passing raw fixtures);
    // on an already-sliced entry it is the identity.
    changes.push({
      kind: "edit",
      path,
      newContent: navHeadOf(content),
      region: "navHead",
    });
  }

  for (const p of placed) {
    if (!p.created) continue;
    // the stub carries EVERY planned key for this path — including the
    // grand_parent/ancestor disambiguators the linkage pass computed
    const edits = editsByPath.get(p.path);
    const kv: Record<string, string | number | boolean> = {
      title: p.node.title,
      ...(p.parent ? { parent: p.parent.node.title } : {}),
      ...(edits?.set ?? {}),
    };
    const lines = Object.entries(kv).map(([k, v]) => `${k}: ${dumpScalar(v)}`);
    changes.push({
      kind: "create",
      path: p.path,
      newContent: `---\n${lines.join("\n")}\n---\n\n# ${p.node.title}\n`,
    });
    warnings.push({
      kind: "stub-created",
      detail: `${p.path}: new page stub for "${p.node.title}" (add real content)`,
    });
  }

  return { changes, warnings };
}

// ── Adapter ─────────────────────────────────────────────────

export const jtdAdapter: CollectionAdapter = {
  id: JTD_FORMAT_ID,
  // Parentage is FRONT MATTER (`parent` / `grand_parent`), so a reparent
  // is a metadata edit with a child cascade and no file ever moves.
  reparentMovesFiles: false,
  // Both true: a pathless top-level card is stubbed as a new root page
  // (no `parent:` key, `stub-created` warning), and the root sibling
  // group is renumbered 1..n through `nav_order` whenever the canvas
  // order disagrees with the file's.
  createCards: true,
  reorderCards: true,
  // Parentage is front matter, so every node IS a page carrying its own
  // `parent:` key. There is nowhere for a pageless group to live.
  nodesNeedTargets: true,
  /**
   * BOTH. Parentage here is front matter, and a page with no `parent:`
   * is a top-level nav node whether or not anything names it as parent —
   * which is what this adapter's own parse already mints as a standalone
   * ("top-level leaf → orphan card").
   *
   * METHOD — published-rendering fidelity, from the theme's own
   * includes: `_includes/components/nav/pages.html` groups every titled
   * page `by: "parent"` and takes the group whose name is `''` as
   * `nav_top_nodes`; `_includes/components/nav/links.html` then renders
   * each of those as `<li class="nav-list-item"><a …>{{ node.title }}</a>`,
   * with the expander button and the nested `<ul>` appearing only
   * `{%- if nav_children.size >= 1 -%}`. A childless top-level page is a
   * plain nav link. (Retrieved from
   * just-the-docs/just-the-docs@main, 2026-08-21.)
   *
   * VERIFIED AGAINST THIS PLANNER: hoisting a childless row to a
   * standalone at root plans nav-head edits only — the page loses its
   * `parent:` key and the siblings renumber. The WRAP shape instead
   * plans `create <slug>.md` with a `stub-created` warning, because
   * `nodesNeedTargets` is true here and a heading has to BE a page. Both
   * are writable; only one of them invents a file.
   */
  rootBearing: { sections: true, orphans: true },
  label: "Just the Docs (frontmatter nav)",
  ingests: (path) => /\.(md|markdown)$/i.test(path) || /(^|\/)_config\.yml$/.test(path),
  detect: (files) => {
    const paths = Object.keys(files);
    const config = paths.find((p) => /(^|\/)_config\.yml$/.test(p));
    if (config && /just-the-docs/.test(files[config]!)) return 0.95;
    const mdPaths = paths.filter((p) => /\.(md|markdown)$/i.test(p));
    if (mdPaths.length === 0) return 0;
    let navish = 0;
    for (const p of mdPaths) {
      const block = parseFrontmatter(files[p]!);
      const data = block?.data;
      if (
        data?.title !== undefined &&
        (data.parent !== undefined || data.nav_order !== undefined)
      ) {
        navish++;
      }
    }
    return navish >= Math.max(2, mdPaths.length * 0.3) ? 0.8 : 0;
  },
  parse,
  planChanges,
};
