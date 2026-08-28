/**
 * linkIndex.ts — inbound link counts, observed once at import (docs/16).
 *
 * EVIDENCE, NOT A SELECTOR. docs/17's classifier decides this without a
 * new framework: *can it be recomputed from the kept snapshot?* No —
 * bodies are gone after import (docs/15) — so it is Tier 2, written once
 * at import, stored, bounded, provenance-stamped.
 *
 * **It INFORMS and it never GATES.** Bodies change after import; that is
 * docs/15's baseline-is-not-a-mirror ruling working as designed, not a
 * bug. A refusal citing an inbound count would be a refusal claiming
 * authority the evidence cannot back — the exact shape of the sealed /
 * all-rows-locked defect this project already paid for (docs/13). Gating
 * would also refuse 92% of real moves, which is not a capability.
 *
 * The fence has absence tests beside it (`__tests__/linkIndex.test.ts`):
 * `guards.ts` and `execute.ts` import nothing from here, and no blocking
 * warning is constructed in this module. Prose cannot enforce a fence —
 * the violating line is one line, and convenient.
 *
 * **Where it is computed:** inside each adapter's `parse`, where whole
 * bodies are already in hand (`hugo.ts` applies `toNavHeads` INSIDE
 * parse). Harvesting there reads nothing new, costs no I/O and touches
 * no law. The fence that does apply is the other half of the split:
 * **no stored bodies** (docs/15) and **no post-import body reads** —
 * re-reading at move time would be drift detection wearing a hat.
 *
 * **What it never holds:** link text, anchors, or any body substring. It
 * holds counts and source paths. *Guidance here because this is where
 * the temptation is: the paths are already ours; the prose is not.*
 */

/** Shared with Tier-2 evidence — one bound, not a second constant. */
export { MAX_EXEMPLARS } from "./importEvidence";
import { MAX_EXEMPLARS } from "./importEvidence";

/**
 * One kind of link, as an adapter recognises and resolves it.
 *
 * The species is where the adapter-specific knowledge lives — Hugo and
 * Docusaurus derive addresses differently — and the harvest loop below
 * is the same for both. That is what lets Docusaurus's generic warning
 * become specific with no second implementation.
 */
export interface LinkSpecies {
  /** Recorded in the index so a reader can tell what is NOT counted. */
  name: string;
  /** Every raw target this species finds in one body. */
  find(body: string): string[];
  /** Raw target → the page path it addresses, or null if unresolvable. */
  resolve(raw: string, fromPath: string): string | null;
}

export interface LinkIndex {
  /** Which import produced it — every display of a count is stamped
   *  "as of import" from here. */
  observedAt: string;
  /** Species the harvester recognised, so a reader can tell what is NOT
   *  counted rather than reading 0 as "no links". */
  species: string[];
  /**
   * Source paths, referenced by index from `targets[].from`.
   *
   * The note allows storing `from` as indices because the snapshot
   * already keeps every source path. It carries its OWN table rather
   * than indexing the snapshot's key order: an index into an external
   * list silently repoints every exemplar the day anything filters the
   * kept set, and a wrong exemplar looks exactly like a right one.
   */
  paths: string[];
  /**
   * Target page path → inbound edges.
   *
   * `n` counts resolved link INSTANCES, matching the survey's 8,002
   * edges and the label's "12 inbound links". `from` answers the
   * different question of WHICH pages, deduplicated and capped — two
   * questions, two fields, deliberately not one number.
   */
  targets: Record<string, { n: number; from: number[] }>;
}

/**
 * The stamp `parse` writes, for the loader to replace.
 *
 * `parse` is pure and must stay that way — a clock read inside makes two
 * parses of the same bytes differ, and every purity claim resting on it
 * stops being checkable. So the harvest happens in `parse`, where the
 * bodies are, and the STAMP happens at the loader, which is the layer
 * that knows when the import occurred.
 *
 * An index still carrying this when it reaches a display is a bug, not a
 * blank: `stampLinkIndex` is called on every load path, and a test
 * asserts no stored index escapes unstamped.
 */
export const UNSTAMPED = "";

/** Fill in when the import happened. Returns a new index; never mutates. */
export function stampLinkIndex(index: LinkIndex, observedAt: string): LinkIndex {
  return { ...index, observedAt };
}

export interface LinkIndexInput {
  /** `[path, whole body]`, as `parse` already holds them. */
  bodies: Iterable<readonly [string, string]>;
  species: readonly LinkSpecies[];
  /** ISO stamp of this import. */
  observedAt: string;
}

/**
 * Harvest inbound links from bodies that are already in memory.
 *
 * Deterministic: sources are visited in sorted path order and exemplars
 * are kept in that order, so the same input files produce a
 * byte-identical index and the fixpoint and idempotence suites cover it
 * for free.
 *
 * Exemplar ordering is DOCUMENT ORDER, the existing convention
 * (`MAX_EXEMPLARS`, docs/17). Whether the 20 shown would be more useful
 * as the nearest-in-tree sources is a legibility question docs/16 leaves
 * open for a real Review dialog to answer; it is a sort key here, not a
 * shape change.
 */
export function buildLinkIndex(input: LinkIndexInput): LinkIndex {
  const bodies = [...input.bodies].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const counts = new Map<string, number>();
  const sources = new Map<string, string[]>();

  for (const [fromPath, body] of bodies) {
    // Deduplicated per (source, target): a page that links twice adds
    // two to `n` but appears once in `from`.
    const seen = new Set<string>();
    for (const species of input.species) {
      for (const raw of species.find(body)) {
        const target = species.resolve(raw, fromPath);
        if (target === null) continue;
        // A self-link is not an inbound edge from elsewhere, and a move
        // does not break it — the link travels with the file.
        if (target === fromPath) continue;
        counts.set(target, (counts.get(target) ?? 0) + 1);
        if (!seen.has(target)) {
          seen.add(target);
          const list = sources.get(target) ?? [];
          if (list.length < MAX_EXEMPLARS) list.push(fromPath);
          sources.set(target, list);
        }
      }
    }
  }

  // One shared table, so `from` costs an integer per edge rather than a
  // path — the difference between the survey's 56 KB and its 223 KB.
  const paths: string[] = [];
  const indexOf = new Map<string, number>();
  const idx = (path: string): number => {
    const found = indexOf.get(path);
    if (found !== undefined) return found;
    const at = paths.length;
    paths.push(path);
    indexOf.set(path, at);
    return at;
  };

  const targets: LinkIndex["targets"] = {};
  for (const target of [...counts.keys()].sort()) {
    targets[target] = {
      n: counts.get(target)!,
      from: (sources.get(target) ?? []).map(idx),
    };
  }

  return {
    observedAt: input.observedAt,
    species: input.species.map((s) => s.name),
    paths,
    targets,
  };
}

/**
 * How many pages link here, or null when nothing was measured.
 *
 * **Null is not zero**, and callers must render it as such — "not
 * measured" rather than "0 inbound links". An adapter without a harvest
 * is correct, not broken, and a missing measurement displayed as zero is
 * a number lying by omission (the `+K more` discipline of docs/17
 * applied to a count).
 */
export function inboundCount(index: LinkIndex | undefined, path: string): number | null {
  if (!index) return null;
  return index.targets[path]?.n ?? 0;
}
