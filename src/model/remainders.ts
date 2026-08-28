/**
 * remainders.ts — STRUCTURE the app can display and cannot write
 * (docs/22, Decision 3).
 *
 * THE SIBLING OF THE ROW LEDGER, not a widening of it. `ledger.ts` is
 * topic-anchored by construction — every `LedgerRecord` names a row — and
 * `emptiedNeverEmpty` already models the exception correctly: a fact
 * about a CONTAINER derives from the document rather than being forced
 * into a row record. The three kinds here follow that precedent. Each is
 * anchored to the thing it is ABOUT (a card, the card sequence, a frozen
 * block), which is why widening `LedgerRecord` with an anchor
 * discriminant was rejected: every existing consumer — badge, checklist,
 * projection, oracle — would grow branches for records that are not rows.
 *
 * DERIVED, NEVER RECORDED. Recomputed from (document, source) like
 * `derivedPinRecords`, so they survive undo by construction and no
 * producer has to remember to write anything. There is no journal
 * (docs/11's founding law) and nothing new persists — the no-journal
 * fence asserts both on the construction rather than on vocabulary.
 *
 * THE DERIVATION IS THE ADAPTER'S, EXTRACTED. `planChanges` already
 * computes exactly these three facts to refuse on them
 * (`section-set-changed`, `card-reordered`, the frozen-block checks).
 * Re-deriving them approximately here from locks and keys would be a
 * second copy of a rule — the drift `guards.ts` exists to prevent — so
 * this module OWNS THE VOCABULARY and owns nothing else: the comparison
 * lives behind `CollectionAdapter.structuralRemainders`, one pure
 * predicate per kind, shared by the planner that enforces and the hook
 * that shows.
 *
 * A GUARD CONSUMES DECLARED INPUTS: an adapter with no hook reports
 * nothing rather than having its remainders guessed at from the neutral
 * layer. Sphinx implements it; Hugo, JTD and Docusaurus need none
 * (`createCards` and `reorderCards` true, no frozen blocks).
 *
 * SINGLE PRODUCER, PRE-DECLARED (the docs/13 discipline): the mechanism
 * is STAGED until a second structurally-different producer exists, and
 * `sphinxRemainders.test.ts`'s derivation oracle is the guard meanwhile.
 */

import { getCollectionAdapter } from "@/collections/registry";
import type { FilesSnapshot } from "@/collections/types";
import type { DisplacementKind, LockKind, SectionId, TocDocument } from "./types";

/**
 * The format's own words for the things a structural remedy names.
 *
 * COPY ONLY, NEVER BEHAVIOR — the `ContainerDescriptor.kind` precedent
 * verbatim, and for the same reason: a remedy that cannot say "add a
 * toctree block in index.rst" says "edit the source yourself", which is
 * not the smallest real act and is barely a remedy at all. Nothing
 * branches on either field.
 *
 * OPTIONAL, AND ABSENT IS ANSWERED. An adapter that names no noun gets a
 * sentence that is still true rather than one with a hole in it — a
 * guard consumes declared inputs, applied to copy.
 */
interface StructuralCopy {
  /** What a card IS in this system: "toctree block". */
  cardNoun?: string;
  /** The file whose own layout holds the card set or the card order. */
  carrierPath?: string;
}

/**
 * One card the source does not have.
 *
 * `memberKeys` are the NATURAL keys of the card's top-level rows — what
 * makes the projection (Decision 4) and the transform verb derivable
 * without a second walk of the document.
 *
 * `untitled` ARRIVED WITH ITS PRODUCER, in arc 2, exactly as arc 1 said
 * it would: `Section.untitled` now exists, so a record field reading it
 * has something behind it. It rides the record rather than being looked
 * up again at the checklist, because the remedy is composed from the
 * record alone and a consumer reaching back into the document for one
 * more field is a second walk nobody needs.
 */
export interface CreationRemainder extends StructuralCopy {
  kind: "creation";
  sectionId: SectionId;
  title: string;
  /** Which species the card is: `isOrphan` is the standalone shape. */
  species: "section" | "standalone";
  /**
   * The card's OWN natural key — what separates a promotion (the entry
   * became the heading) from a wrap (a new name over existing rows), and
   * what the projection dissolves a promoted card back ONTO.
   *
   * SPECIES-AWARE, because the two species keep their identity in
   * different places: a section's key is its own `path ?? ~title`, while
   * a STANDALONE card IS its single childless entry and its key is that
   * entry's. Derived once by the adapter that holds the section rather
   * than re-derived by each consumer — two derivations of one idea would
   * be two things to keep in step.
   */
  ownKey: string;
  memberKeys: string[];
  /**
   * The card's heading is still the placeholder a gesture gave it
   * (`Section.untitled`). Appends one clause to the remedy — the person
   * carrying this out by hand has to invent the name either way, and
   * being told so beats discovering it in the file.
   *
   * NEVER SET BY THE AI PATH: reconstruction titles a wrap after its
   * entry with `titleDerived`, because nobody is present mid-run to
   * answer a placeholder.
   */
  untitled?: true;
}

/**
 * The top-level card sequence differs from the source's.
 *
 * AT MOST ONE PER DOCUMENT, and the reason is the counts: a permutation
 * is ONE edit for the hand, and N per-card records would make "1 card
 * order" read as "6 things to do".
 */
export interface CardOrderRemainder extends StructuralCopy {
  kind: "card-order";
  moved: { sectionId: SectionId; title: string; from: number; to: number }[];
}

/**
 * One frozen block whose internal row sequence differs from the source's.
 *
 * `row-order`, NOT `order` — docs/21 Decision 8 priced this kind under
 * the shorter name, and "order" alone would be one name for two referents
 * (cards, rows), which is the house failure mode. Renamed in the split
 * this note forces.
 *
 * `lockKind` selects the remedy sentence, and it is the BLOCK's property:
 * whether these lines may be rewritten is a fact about the block, not
 * about any line in it (docs/19's classify/enforce split).
 */
export interface RowOrderRemainder extends StructuralCopy {
  kind: "row-order";
  /** The card or row the frozen block hangs under — what focus opens. */
  parentId: string;
  parentTitle: string;
  rows: { topicId: string; title: string }[];
  lockKind: LockKind;
}

export type StructuralRemainder =
  CreationRemainder | CardOrderRemainder | RowOrderRemainder;

export type RemainderKind = StructuralRemainder["kind"];

/**
 * THE REPORT SELECTOR.
 *
 * INPUTS ARE (DOCUMENT, SOURCE) AND THE ARRANGEMENT'S CARD ORDER — never
 * the tab state and never the run mode. That is the whole of docs/21's
 * "the gate keys on the document" applied one layer over: two tabs
 * differing only in `aspirational`/`seamDeclined` produce byte-identical
 * reports, so a grounded tab gets the projection and the checklist by
 * construction rather than by a second code path.
 *
 * `sectionOrder` is here for the same reason `planChanges` takes it: card
 * order is a LAYOUT fact, and a document alone cannot answer "in what
 * order are the cards?". It is part of the arrangement, not a posture.
 *
 * COLLECTION TABS ONLY, and the scope is stated rather than implied: all
 * three kinds exist only where a SOURCE exists to compare against. A
 * format tab has no snapshot, and measured at `a8f28cf` no format adapter
 * answers `createCards` or `reorderCards` false, so nothing is lost. A
 * future format adapter answering false owes the same hook.
 */
export function structureReport(
  doc: TocDocument,
  source: FilesSnapshot,
  sectionOrder: readonly SectionId[],
): StructuralRemainder[] {
  const adapter = getCollectionAdapter(doc.formatId);
  // DECLARED INPUTS: no adapter, no hook, or no snapshot ⇒ no report.
  // Not "no remainders" as a claim about the arrangement — nothing was
  // measured, and an unmeasured count is its own state.
  if (!adapter?.structuralRemainders) return [];
  if (Object.keys(source).length === 0) return [];
  return adapter.structuralRemainders(source, doc, [...sectionOrder]);
}

/** Does this arrangement hold any structural remainder at all?
 *
 *  The BIRTH RULE's widened first clause (docs/22, Decision 7, riding
 *  OR-3): a tab holding remainders cannot honestly wear the Grounded
 *  promise, whatever run produced it — exactly as `hasDisplacements`
 *  answers for the row ledger. */
export function hasStructuralRemainders(
  doc: TocDocument,
  source: FilesSnapshot,
  sectionOrder: readonly SectionId[],
): boolean {
  return structureReport(doc, source, sectionOrder).length > 0;
}

/**
 * WHAT HAPPENED, as a verb (docs/22, Decision 3).
 *
 * The queued comparison-as-motion work needs to say what happened, not
 * just that something did. This designs the DERIVATION; the animation is
 * docs/08's feature and reads this.
 *
 * A TOTAL FUNCTION over kinds AND evidence combinations, which is what
 * the totality fence pins. The compiler holds one half — an exhaustive
 * switch with no default means a new union member fails `pnpm check`
 * here and at the checklist renderer — and the fence holds the other: a
 * switch can be exhaustive over its input and still fold two acts into
 * one verb, which no type can see.
 */
export type TransformVerb =
  | "hoist"
  | "promote"
  | "wrap"
  | "unwrap"
  | "reorder-cards"
  | "reorder-rows"
  | "displace"
  | "restore";

/**
 * The evidence a verb reads — each term a fact somebody measured rather
 * than a flag somebody set.
 *
 * `ownKeyInSource` is the card's OWN natural key (`path ?? ~title`,
 * derivable from the section itself) found in the source. It is what
 * separates a PROMOTION (the entry became the heading) from a WRAP (a
 * new name over existing rows) — a created card can be three different
 * acts wearing one record kind, and the record alone cannot say which.
 */
export type VerbEvidence =
  | { of: "creation"; species: "section" | "standalone"; ownKeyInSource: boolean }
  /** The inverse comparison: a card the source holds as a SECTION that
   *  the arrangement holds as a standalone. */
  | { of: "despeciated" }
  | { of: "card-order" }
  | { of: "row-order" }
  | { of: "ledger"; kind: DisplacementKind; cleared: boolean };

export function transformVerb(evidence: VerbEvidence): TransformVerb {
  switch (evidence.of) {
    case "creation":
      // THE OWN-KEY QUESTION DISCRIMINATES THE SECTION SPECIES ONLY, and
      // the certified table says so by listing it on the two section
      // rows. A standalone card IS its single childless entry, so the
      // promotion of a leaf is exactly a hoist whether or not the source
      // spells that entry the same way. One branch rather than two
      // identical ones, with the reason here so nobody "completes" the
      // table into a fourth verb that means the same thing.
      if (evidence.species === "standalone") return "hoist";
      return evidence.ownKeyInSource ? "promote" : "wrap";
    case "despeciated":
      return "unwrap";
    case "card-order":
      return "reorder-cards";
    case "row-order":
      return "reorder-rows";
    case "ledger":
      // Putting a thing back is not a displacement, whoever does it —
      // the ledger's own clearing rule, read as a verb.
      return evidence.cleared ? "restore" : "displace";
  }
}

/**
 * The verb for one structural remainder.
 *
 * The source-key term arrives as a PREDICATE rather than as a set,
 * because the only layer that can answer "was this key in the source?"
 * is the one holding the snapshot, and this module deliberately holds
 * nothing.
 */
export function verbOf(
  record: StructuralRemainder,
  ownKeyInSource: (key: string) => boolean,
): TransformVerb {
  switch (record.kind) {
    case "creation":
      return transformVerb({
        of: "creation",
        species: record.species,
        ownKeyInSource: ownKeyInSource(record.ownKey),
      });
    case "card-order":
      return transformVerb({ of: "card-order" });
    case "row-order":
      return transformVerb({ of: "row-order" });
  }
}
