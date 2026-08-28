/**
 * birth.ts — the species-at-birth table (docs/22, Decision 2).
 *
 * ONE TABLE, TWO ARRIVAL PATHS, and that is the whole point of the file
 * existing at all. The canvas gesture and AI reconstruction both mint
 * cards, and pre-mortem 4's demand was one vocabulary rather than two
 * derivations that agree today — the drift `guards.ts` exists to
 * prevent, one layer up.
 *
 * IT ANSWERS WHAT THE HOME BEARS AND NEVER WHAT TO DO ABOUT IT. The
 * third verdict is `unhoused`, and its DISPOSITION belongs to the
 * caller, deliberately asymmetric (docs/22, Decision 2): the gesture
 * REFUSES with a sentence naming the lanes that do bear cards, because a
 * hand mid-gesture can act on that sentence now; reconstruction mints
 * the card CHAINLESS and lets Decision 5's unhoused surfacing own it,
 * because a model mid-outline cannot. Folding either disposition in here
 * would make one path's answer wrong.
 *
 * THE BEARING COMES FROM DECLARED DATA, never from a per-format boolean
 * and never from a second table: a container's own `accepts` where the
 * home is a declared container, and the adapter's `rootBearing` where
 * the format has no containers at all (`formats/registry.ts`).
 */

import type { SectionId } from "./types";

/**
 * What a home may hold — the shape `ContainerDescriptor.accepts` already
 * uses, reused rather than re-spelled.
 *
 * `orphans` is the INTERNAL word for the standalone species and stays
 * internal (OR-1): "standalone entry" is what the user reads, "orphan"
 * is what `isOrphan` has always been called, and one vocabulary per side
 * of that line is cheaper than a translation layer.
 */
export interface Bearing {
  sections: boolean;
  orphans: boolean;
}

/** What the ENTRY asks to become. A childless entry asks for the
 *  standalone (promotion of a leaf IS the standalone); a parented one —
 *  and a PINNED parented one, which wraps rather than promotes — asks
 *  for a section. */
export type WantedSpecies = "standalone" | "section";

/** What is born, or `unhoused` when this home bears neither shape. */
export type BirthVerdict = "standalone" | "section" | "unhoused";

/**
 * Decision 2's four regimes, as one total function.
 *
 * The asymmetry between the two rows is the format's, not a policy: a
 * childless entry has a fallback shape (a `groups` array holds group
 * objects, not paths, so the entry is WRAPPED), while a section has
 * none — an `anchors` array holds page strings, and there is no way to
 * spell a heading in it at all.
 */
export function speciesAtBirth(bears: Bearing, wants: WantedSpecies): BirthVerdict {
  if (wants === "standalone") {
    if (bearsSpecies(bears, "standalone")) return "standalone";
    // R3's exception: no neutral state to defer to, so the entry is
    // wrapped in a section at birth rather than left in a shape the
    // home cannot hold.
    return bearsSpecies(bears, "section") ? "section" : "unhoused";
  }
  return bearsSpecies(bears, "section") ? "section" : "unhoused";
}

/**
 * Does this home hold that species AT ALL?
 *
 * SPLIT FROM `speciesAtBirth`, AND THE SPLIT IS LOAD-BEARING. That one
 * answers *what does a BIRTH make here*, and its answer includes a
 * SUBSTITUTION: a childless entry in a sections-only home is wrapped
 * rather than refused, because the birth has a shape to fall back to.
 *
 * A SPECIES COMMAND has no such fallback. "Remove heading" on a card in
 * a sections-only lane would produce a standalone the lane cannot hold,
 * and there is nothing to wrap it in — the card already IS the wrapper.
 * Asking the birth table there returns "section", which reads as "fine"
 * and is the opposite of the truth.
 *
 * Found by a test that expected the refusal and got null. Two questions,
 * two names — the house rule, applied the moment one function was about
 * to answer both.
 */
export function bearsSpecies(bears: Bearing, species: WantedSpecies): boolean {
  return species === "standalone" ? bears.orphans : bears.sections;
}

/**
 * The chain a card born at this slot takes — the drop position names the
 * HOME (R2).
 *
 * NEIGHBOUR LOGIC, the same reading `classifyDrop` gives a card drag,
 * with one difference that removes its third case: a card being MOVED
 * has a chain of its own that a seam could offer to keep, and a card
 * being BORN has none. So there is nothing to ask about — the birth is
 * an APPEND into the run above it, and the neighbour above names that
 * run. Falling through to the neighbour BELOW covers the top of a
 * column; falling through to root covers an empty one.
 */
export function homeChainAt(
  columnIds: readonly SectionId[],
  cardIndex: number,
  chainOf: (id: SectionId) => readonly string[] | undefined,
): readonly string[] {
  const above = columnIds[cardIndex - 1];
  const below = columnIds[cardIndex];
  const neighbour = above ?? below;
  if (neighbour === undefined) return [];
  return chainOf(neighbour) ?? [];
}

/**
 * What a drag-out MAKES — the species-at-birth table read against an
 * actual selection (docs/22, Decision 2's table; OR-5b/c/d).
 *
 * FOUR SHAPES, and the three that build something are three different
 * arrangements of the same rows rather than three flags:
 * - `standalone` — the entry IS the card, wrapped in nothing;
 * - `promote` — the entry becomes the card's FACE, its children the rows
 *   (the shipped unwrap, now ruled as the gesture's meaning);
 * - `wrap` — a heading over the entries, which stay rows;
 * - `unhoused` — this home holds neither species, and the caller says so.
 *
 * THE PIN DOES NOT CHANGE THE SPECIES, only the arrangement. A pinned
 * parented entry still births a SECTION; what changes is that the entry
 * stays a ROW inside it, because `Section` has no lock and promotion
 * would erase the pin, leaving a displacement the badge cannot show, the
 * checklist cannot list and the projection cannot return home. That is
 * the addendum's own canon, applied at birth.
 *
 * A MULTI-DRAG IS ALWAYS A WRAP, and needs no rule of its own: several
 * rows cannot be one entry, so the only shape available is a heading
 * over them. Stated here rather than special-cased at the call site,
 * because the call site is where a special case turns into a second
 * table.
 */
export type BirthShape =
  { kind: "standalone" } | { kind: "promote" } | { kind: "wrap" } | { kind: "unhoused" };

/** What each moving row is, as far as the table is concerned. */
export interface MovingEntry {
  childless: boolean;
  pinned: boolean;
}

export function birthShape(bears: Bearing, moving: readonly MovingEntry[]): BirthShape {
  // Declared inputs: an empty selection is not a drag-out whose species
  // anybody can answer.
  if (moving.length === 0) return { kind: "unhoused" };

  const single = moving.length === 1 ? moving[0]! : undefined;
  const wants: WantedSpecies = single?.childless === true ? "standalone" : "section";
  const born = speciesAtBirth(bears, wants);
  if (born === "unhoused") return { kind: "unhoused" };
  if (born === "standalone") return { kind: "standalone" };
  // A SECTION, three ways in: a childless entry the home cannot hold
  // bare, a multi-drag, or a promotion — and a pinned promotion is the
  // one that must stay a row.
  if (single === undefined || single.childless || single.pinned) {
    return { kind: "wrap" };
  }
  return { kind: "promote" };
}
