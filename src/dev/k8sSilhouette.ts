/**
 * k8sSilhouette.ts — Deterministic whole-site fixture in the SHAPE of
 * kubernetes/website (docs/14 Decision 2, docs/15).
 *
 * Sibling to largeSample.ts rather than a replacement: that one is the
 * docs/08 M3 gate (1,012 topics, evenly spread, 44 cards) and stays the
 * floor. This one is the ceiling, and the difference between them IS the
 * measurement — an even spread is the case the layout engine finds easy.
 *
 * The real corpus, surveyed (scripts/survey-hugo.ts):
 *
 *   1,672 pages · 183 directories holding .md · 5 levels of directory
 *   nesting · and a distribution that is nothing like even —
 *   reference alone is 1,163 pages, 70% of the site, while three
 *   top-level directories hold five pages between them.
 *
 * That lopsidedness is the whole point. Decision 2 asks whether a
 * whole-site load stays usable; a fixture with 239 topics per card would
 * answer a question nobody asked. Here one card carries 1,163 topics
 * beside six that carry 5–220.
 *
 * Dev-only, like its sibling: wired into the Load menu behind
 * import.meta.env.DEV, which Vite folds to `false` and tree-shakes, so
 * neither the menu item nor this module reaches a production bundle.
 */

import { newId } from "@/model/id";
import type { Section, TocDocument, Topic } from "@/model/types";

/** Pages per top-level section, from the survey. The three near-empty
 *  directories fold into Home exactly as kubernetes.io/docs presents
 *  them, giving the seven sections a reader actually sees. */
const SHAPE: [string, number][] = [
  ["Home", 5],
  ["Setup", 22],
  ["Concepts", 176],
  ["Tasks", 220],
  ["Tutorials", 43],
  ["Reference", 1163],
  ["Contribute", 43],
];

export const K8S_TOPIC_COUNT = SHAPE.reduce((n, [, c]) => n + c, 0); // 1,672
export const K8S_MAX_DEPTH = 5;

/** Directories holding .md in the corpus. The ratio that matters is
 *  1,672 pages / 183 dirs ≈ 9 pages per directory: the tree is deep but
 *  each directory is FLAT. A generator that branches at every level
 *  produces four times as many containers and a shape the corpus does
 *  not have — the first draft of this file did exactly that. */
const CORPUS_CONTAINERS = 183;
/** How much of a level's directory budget is spent AT that level; the
 *  rest recurses. Low enough that the tree reaches the corpus's five
 *  levels instead of spending the budget breadth-first at level 1. */
const DIR_FANOUT = 6;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function node(title: string, path: string, children: Topic[] = []): Topic {
  return { id: newId(), title, path, children };
}

/**
 * Lay out `n` container nodes as a directory tree no deeper than
 * `maxDepth`, collecting every one into `sink` so leaves can be hung off
 * them afterwards. Deterministic: no randomness anywhere, so a change in
 * the numbers is a change in the code.
 */
function directories(
  n: number,
  depth: number,
  maxDepth: number,
  path: string,
  sink: Topic[],
): Topic[] {
  if (n <= 0) return [];
  // At the depth limit the remaining budget is spent as SIBLINGS, not
  // dropped. Dropping it silently cost 52 of 183 directories and showed
  // up only because the corpus count is asserted.
  const atLimit = depth >= maxDepth;
  const here = atLimit ? n : Math.min(n, Math.max(1, Math.ceil(n / DIR_FANOUT)));
  const below = n - here;
  const out: Topic[] = [];
  for (let i = 0; i < here; i++) {
    // share the remaining budget across this level's directories
    const share = atLimit ? 0 : Math.floor(below / here) + (i < below % here ? 1 : 0);
    const dir = node(`Group ${depth}.${i}`, `${path}/g${i}/_index.md`);
    sink.push(dir);
    dir.children = directories(share, depth + 1, maxDepth, `${path}/g${i}`, sink);
    out.push(dir);
  }
  return out;
}

/** One section: a directory tree, then its pages spread across it. */
function buildSection(count: number, containerBudget: number, path: string): Topic[] {
  const dirs: Topic[] = [];
  // Containers sit at depths 1..maxDepth-1 so their pages land within it.
  const roots = directories(
    Math.min(containerBudget, Math.max(0, count - 1)),
    1,
    K8S_MAX_DEPTH - 1,
    path,
    dirs,
  );
  const leaves = count - dirs.length;
  // Spread pages over the directories; anything left over sits at the
  // section's top level, as _index-less pages do in the real tree.
  const buckets = dirs.length + 1;
  for (let i = 0; i < leaves; i++) {
    const b = i % buckets;
    const page = node(`Page ${i}`, `${path}/p${i}.md`);
    if (b === 0) roots.push(page);
    else dirs[b - 1]!.children.push(page);
  }
  return roots;
}

export function makeK8sSilhouette(): TocDocument {
  const sections: Section[] = SHAPE.map(([title, count]) => ({
    id: newId(),
    title,
    topics: buildSection(
      count,
      // containers proportional to the section's share of the corpus
      Math.max(1, Math.round((CORPUS_CONTAINERS * count) / K8S_TOPIC_COUNT)),
      slug(title),
    ),
  }));
  return {
    id: newId(),
    name: "k8s silhouette (1,672 topics)",
    formatId: "docfx",
    extras: { rootStyle: "items" },
    sections,
  };
}
