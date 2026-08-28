/**
 * prototype-jtd.ts — Step 0 of the collection-adapters milestone
 * (plan: prototype the Just the Docs parser against the REAL repo).
 *
 * Fetches github.com/just-the-docs/just-the-docs/tree/main/docs via the
 * GitHub API (1 tree call; raw fetches are not API-metered), assembles
 * the nav tree with the exact algorithm specified in the plan, prints
 * it alongside warnings, and prints a sample change plan for one
 * synthetic move — a throwaway harness for the real adapter's logic.
 *
 * Run: pnpm vite-node scripts/prototype-jtd.ts
 * (network required; not part of CI)
 */

import yaml from "js-yaml";

const OWNER = "just-the-docs";
const REPO = "just-the-docs";
const REF = "main";
const SUBDIR = "docs";

// ── Fetch ───────────────────────────────────────────────────

async function fetchFiles(): Promise<Record<string, string>> {
  const treeRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${REF}?recursive=1`,
  );
  if (!treeRes.ok) throw new Error(`tree fetch: ${treeRes.status}`);
  const tree = (await treeRes.json()) as {
    truncated: boolean;
    tree: { path: string; type: string }[];
  };
  if (tree.truncated) throw new Error("tree truncated");

  const paths = tree.tree
    .filter(
      (t) =>
        t.type === "blob" &&
        t.path.startsWith(`${SUBDIR}/`) &&
        /\.(md|markdown)$/i.test(t.path),
    )
    .map((t) => t.path);

  const files: Record<string, string> = {};
  const queue = [...paths];
  const workers = Array.from({ length: 6 }, async () => {
    for (;;) {
      const path = queue.shift();
      if (!path) return;
      const res = await fetch(
        `https://raw.githubusercontent.com/${OWNER}/${REPO}/${REF}/${path}`,
      );
      if (!res.ok) throw new Error(`${path}: ${res.status}`);
      // store collection-relative paths
      files[path.slice(SUBDIR.length + 1)] = await res.text();
    }
  });
  await Promise.all(workers);
  return files;
}

// ── Parse (the plan's assembly algorithm, prototype form) ───

interface Page {
  path: string;
  title: string;
  parent?: string;
  grandParent?: string;
  navOrder?: number | string;
  children: Page[];
}

interface Warning {
  kind: string;
  detail: string;
}

function parseCollection(files: Record<string, string>): {
  roots: Page[];
  warnings: Warning[];
} {
  const warnings: Warning[] = [];
  const pages: Page[] = [];

  for (const [path, content] of Object.entries(files)) {
    const m = content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
    if (!m) {
      warnings.push({ kind: "skipped-file", detail: `${path}: no frontmatter` });
      continue;
    }
    let fm: Record<string, unknown>;
    try {
      fm = (yaml.load(m[1]!, { json: true }) ?? {}) as Record<string, unknown>;
    } catch {
      warnings.push({ kind: "skipped-file", detail: `${path}: bad YAML` });
      continue;
    }
    if (fm.title === undefined || fm.title === null) {
      warnings.push({ kind: "skipped-file", detail: `${path}: no title` });
      continue;
    }
    // Liquid truthiness: any value except false/nil excludes
    if (fm.nav_exclude !== undefined && fm.nav_exclude !== false) {
      warnings.push({ kind: "skipped-file", detail: `${path}: nav_exclude` });
      continue;
    }
    pages.push({
      path,
      title: String(fm.title),
      parent: fm.parent !== undefined ? String(fm.parent) : undefined,
      grandParent: fm.grand_parent !== undefined ? String(fm.grand_parent) : undefined,
      navOrder:
        typeof fm.nav_order === "number" || typeof fm.nav_order === "string"
          ? fm.nav_order
          : undefined,
      children: [],
    });
  }

  // duplicate titles
  const byTitle = new Map<string, Page[]>();
  for (const p of pages) {
    byTitle.set(p.title, [...(byTitle.get(p.title) ?? []), p]);
  }
  for (const [title, list] of byTitle) {
    if (list.length > 1) {
      warnings.push({
        kind: "duplicate-title",
        detail: `"${title}" used by ${list.map((p) => p.path).join(", ")}`,
      });
    }
  }

  // resolve parents
  const parentOf = new Map<Page, Page>();
  for (const page of pages) {
    if (page.parent === undefined) continue;
    let candidates = byTitle.get(page.parent) ?? [];
    if (page.grandParent !== undefined) {
      candidates = candidates.filter((c) => c.parent === page.grandParent);
    }
    candidates = candidates.filter((c) => c !== page);
    if (candidates.length === 0) {
      warnings.push({
        kind: "unknown-parent",
        detail: `${page.path}: parent "${page.parent}" not found — promoted to top level`,
      });
      continue;
    }
    if (candidates.length > 1) {
      warnings.push({
        kind: "ambiguous-parent",
        detail: `${page.path}: parent "${page.parent}" matches ${candidates.length} pages`,
      });
      candidates.sort((a, b) => (a.path < b.path ? -1 : 1));
    }
    parentOf.set(page, candidates[0]!);
  }

  // cycle pass
  for (const page of pages) {
    const seen = new Set<Page>([page]);
    let cursor = parentOf.get(page);
    while (cursor) {
      if (seen.has(cursor)) {
        warnings.push({
          kind: "parent-cycle",
          detail: `${page.path}: ancestor cycle — promoted to top level`,
        });
        parentOf.delete(page);
        break;
      }
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }
  }

  for (const page of pages) {
    const parent = parentOf.get(page);
    if (parent) parent.children.push(page);
  }

  // JTD sibling sort: nav_order'd first (numbers before strings, numeric
  // asc), then no-order alphabetical (case-sensitive), path tiebreak
  const sortSiblings = (list: Page[]) => {
    list.sort((a, b) => {
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
    });
    list.forEach((p) => sortSiblings(p.children));
  };

  const roots = pages.filter((p) => !parentOf.get(p));
  sortSiblings(roots);
  for (const r of roots) sortSiblings(r.children);

  return { roots, warnings };
}

// ── Report ──────────────────────────────────────────────────

function printTree(pages: Page[], depth: number): void {
  for (const p of pages) {
    const order = p.navOrder !== undefined ? ` [${p.navOrder}]` : "";
    console.log(`${"  ".repeat(depth)}${p.title}${order}  (${p.path})`);
    printTree(p.children, depth + 1);
  }
}

async function main() {
  console.log(`Fetching ${OWNER}/${REPO}/${SUBDIR} @ ${REF}…`);
  const files = await fetchFiles();
  console.log(`${Object.keys(files).length} markdown files\n`);

  const { roots, warnings } = parseCollection(files);
  console.log("── Assembled nav tree ──");
  printTree(roots, 0);

  console.log(`\n── Warnings (${warnings.length}) ──`);
  for (const w of warnings) console.log(`  [${w.kind}] ${w.detail}`);

  // sample change plan: pretend the user moved "Buttons" under "Utilities"
  console.log("\n── Sample change plan: move 'Buttons' under 'Utilities' ──");
  console.log(`  edit ui-components/buttons.md:`);
  console.log(`    parent: UI Components  →  parent: Utilities`);
  console.log(`  edit siblings of Utilities' children: renumber nav_order 1..n`);
  console.log("  (real planner lands in src/collections/adapters/jtd.ts)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
