/**
 * bearing.ts — what a HOME holds, from declared data (docs/22,
 * Decision 2's per-home bearing; O2 adopted).
 *
 * ONE PRODUCER FOR ONE QUESTION, and the order is the point: a
 * container the document DECLARES answers for itself, and the adapter's
 * `rootBearing` is what a format with no containers has INSTEAD — never
 * a second opinion sitting beside a descriptor, which is how two
 * derivations of one rule start disagreeing (`guards.ts`'s founding
 * story, one layer over).
 *
 * A GUARD CONSUMES DECLARED INPUTS, and the fall-through says so. A
 * chain no descriptor claims is NOT MEASURED — not "bears nothing" —
 * because refusing a drop on a fact nobody stated produces a refusal
 * nobody can act on, which is worse than the hazard it imagines. The
 * write path's own refusal (`refuseUnhousedSections`) is the floor
 * underneath either way (R5).
 *
 * SEPARATE FROM `birth.ts` because they answer different questions with
 * different dependencies: the TABLE is pure model and reconstruction
 * imports it, while this reaches the adapter registries. Keeping them
 * apart is what lets the table be shared by two arrival paths that
 * obtain their bearing differently.
 */

import { getCollectionAdapter } from "@/collections/registry";
import { FORMAT_ADAPTERS } from "@/formats/registry";
import {
  birthShape,
  homeChainAt,
  type Bearing,
  type BirthShape,
  type MovingEntry,
} from "./birth";
import { containerFor } from "./containers";
import { chainPathKey } from "./selectors";
import type { SectionId, TocDocument } from "./types";

/**
 * Nothing was declared about this home. Permissive on purpose — see the
 * declared-inputs paragraph above.
 */
const NOT_MEASURED: Bearing = { sections: true, orphans: true };

/** What the home at this chain holds, in this document. */
export function bearingOf(doc: TocDocument, chain: readonly string[]): Bearing {
  const declared = containerFor(doc, chainPathKey(chain));
  if (declared) return { ...declared.accepts };
  // A NON-ROOT chain with no descriptor is the unhoused case, which the
  // write path already owns; a ROOT with none is a format that declares
  // no containers at all, and its adapter answers.
  const adapter =
    getCollectionAdapter(doc.formatId) ??
    FORMAT_ADAPTERS.find((a) => a.id === doc.formatId);
  if (!adapter) return NOT_MEASURED;
  return chain.length === 0 ? { ...adapter.rootBearing } : NOT_MEASURED;
}

/**
 * WHERE A BIRTH LANDS AND WHAT IT MAKES — the one answer the executor
 * and the drag layer share (docs/22, Decision 2).
 *
 * ONE FUNCTION BECAUSE A BIRTH HAS THREE SEPARABLE QUESTIONS — which
 * home does this slot name, what does that home bear, what does that
 * make of these rows — and three questions answered in two places is
 * three chances to disagree. `guards.ts` exists because a second copy of
 * a rule let the sidebar commit the move the canvas refused;
 * this is that lesson applied before the second copy is written.
 *
 * TAKES COLUMN IDS, NOT A LAYOUT. The drop position is the arrangement's
 * own fact, and passing the one column keeps this file free of the
 * layout module — the model may not depend on where cards are drawn.
 */
export interface Birth {
  /** The home the drop names; empty is the root. */
  chain: readonly string[];
  shape: BirthShape;
}

export function resolveBirth(
  doc: TocDocument,
  columnIds: readonly SectionId[],
  cardIndex: number,
  moving: readonly MovingEntry[],
): Birth {
  const chainOf = (id: SectionId) => doc.sections.find((s) => s.id === id)?.chain;
  const chain = homeChainAt(columnIds, cardIndex, chainOf);
  return { chain, shape: birthShape(bearingOf(doc, chain), moving) };
}
