/**
 * containers.ts — The navigation container registry (docs/13 v2).
 *
 * A container sits ABOVE the card and has no card of its own — a
 * Mintlify tab or language, later an mdBook part or a DITA branch. The
 * adapter DECLARES one descriptor per container at parse time; the core
 * reads them to draw lanes, label drop zones, and decide whether a
 * reparent is legal.
 *
 * Declared, never derived. "What does this container accept" looks
 * answerable from the cards inside it, and that answer is wrong in three
 * ways the `sealed` decision already taught: a container that legally
 * bears sections but holds none reads as bearing nothing, so it refuses
 * a legal move and draws no lane; the first card of a new container can
 * never be placed, because nothing is there to infer from; and format
 * law gets re-derived from instance state on every edit.
 *
 * What survives of that instinct is `lintContainers`, below: like-joins
 * -like is a good way to catch a DECLARATION that disagrees with the
 * cards, which is an adapter bug — it is just not the source of truth.
 */

import { chainKey } from "./selectors";
import type { ContainerDescriptor, Section, TocDocument } from "./types";

/** The container a chain key belongs to, or undefined if none declares it. */
export function containerFor(
  doc: TocDocument,
  key: string,
): ContainerDescriptor | undefined {
  return doc.containers?.find((c) => c.chainKey === key);
}

/** The container a section lives in. */
export function containerOf(
  doc: TocDocument,
  section: Section,
): ContainerDescriptor | undefined {
  return containerFor(doc, chainKey(section));
}

/**
 * Declared containers in declared order — for lanes, bands and menus.
 * The order comes from the source, never from where member cards
 * happen to sit: deriving it from card positions is action-at-a-distance,
 * where dragging one card silently reorders a container nobody edited.
 */
export function containersInOrder(doc: TocDocument): readonly ContainerDescriptor[] {
  return [...(doc.containers ?? [])].sort((a, b) => a.order - b.order);
}

/**
 * A container named for use INSIDE a sentence: "Move to tab 'API'".
 * Uses the format's own noun when it declared one, and degrades to the
 * label alone when it did not. Copy only — nothing branches on this.
 */
export function containerPhrase(
  container: ContainerDescriptor | undefined,
): string | undefined {
  if (!container) return undefined;
  return container.kind ? `${container.kind} '${container.label}'` : container.label;
}

/**
 * The same name standing alone, for a tooltip. The CHIP still shows the
 * container's name and never a bare format noun — "tab" collides with
 * the app's own document tabs — but a tooltip has room for the term to
 * earn its keep.
 */
export function containerTooltip(
  container: ContainerDescriptor | undefined,
): string | undefined {
  const phrase = containerPhrase(container);
  if (phrase === undefined) return undefined;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** May this container hold this card? Declared, so an empty one still can. */
export function accepts(container: ContainerDescriptor, section: Section): boolean {
  return section.isOrphan ? container.accepts.orphans : container.accepts.sections;
}

/**
 * Never-empty containers this ARRANGEMENT would leave with no cards.
 *
 * Declarations come from `doc`; the arrangement is passed separately, so
 * the same rule answers two questions that were being asked in two
 * places. The drag path asks about removing one card. Reconstruction
 * asks about a whole proposed arrangement — and had no answer at all
 * until this existed, which is how a proposal that drained a Mintlify
 * tab exported `groups: []` against a `minItems: 1` schema.
 *
 * Occupied-BEFORE is part of the predicate on purpose. An adapter
 * declares a descriptor for every container it finds, including one that
 * legally bears cards and holds none, so a container that arrived empty
 * must not make every later edit illegal. This refuses EMPTYING, not
 * emptiness.
 */
export function emptiedContainers(
  doc: TocDocument,
  arrangement: readonly Section[],
): ContainerDescriptor[] {
  if (!doc.containers || doc.containers.length === 0) return [];
  const before = new Set(doc.sections.map(chainKey));
  const after = new Set(arrangement.map(chainKey));
  return doc.containers.filter(
    (c) => !c.mayEmpty && before.has(c.chainKey) && !after.has(c.chainKey),
  );
}

/**
 * Would moving this card out leave its container empty, when the format
 * requires an entry? Mintlify's `tabs.groups` has `minItems: 1`
 * (schema-verified), so emptying a tab writes a file Mintlify rejects.
 */
export function wouldEmptyContainer(doc: TocDocument, section: Section): boolean {
  const key = chainKey(section);
  const without = doc.sections.filter((s) => s.id !== section.id);
  return emptiedContainers(doc, without).some((c) => c.chainKey === key);
}

/**
 * Cards this arrangement leaves with no home the format can write.
 *
 * ONE PREDICATE, THREE CONSUMERS, and it exists because there were
 * nearly three DERIVATIONS. `lintContainers` below computes exactly this
 * and returns it on the before-state, but every caller of that is a
 * test; the Mintlify write path recomputed it at serialize; and no
 * product surface asked it at all, so a card with no home stayed
 * invisible until Save. The refusal is the FLOOR (docs/22, R5) and the
 * Overview line and the card mark are the earlier doors — all three off
 * one answer, which is the drift `guards.ts` exists to prevent.
 *
 * SEALED STANDALONES ARE CARVED OUT, and the carve-out is exactly its
 * own justification: a `$ref` card's contents really are generated
 * elsewhere and it legitimately sits in a container array that bears no
 * cards. An UNSEALED standalone in such a home has no legitimate
 * producer at parse and writes bytes the format rejects (docs/22, M1).
 *
 * A GUARD CONSUMES DECLARED INPUTS: a document that declares no
 * containers said nothing about bearing, so this checks nothing rather
 * than calling every card homeless.
 */
export function unhousedSections(doc: TocDocument): Section[] {
  if (!doc.containers || doc.containers.length === 0) return [];
  return doc.sections.filter((section) => {
    if (section.isOrphan && section.sealed !== undefined) return false;
    const home = containerFor(doc, chainKey(section));
    return home !== undefined && !accepts(home, section);
  });
}

/**
 * Declarations that disagree with the cards. Every finding is a bug in
 * the adapter, not in the user's file, so this is a lint for the
 * conformance suite rather than a refusal at load.
 */
export function lintContainers(doc: TocDocument): string[] {
  if (!doc.containers || doc.containers.length === 0) return [];
  const out: string[] = [];
  for (const s of doc.sections) {
    // SECTION cards only. An orphan may legitimately sit in a container
    // that bears none: Mintlify's `navigation.languages` holds language
    // objects and `$ref` pointers, and the `$ref`s render as orphan
    // cards nobody can drop anything beside. Declaring that array
    // bears neither is correct, and flagging its own contents would be
    // the lint disagreeing with the format rather than with the adapter.
    //
    // NOT THE SAME PREDICATE AS `unhousedSections` ABOVE, and the two
    // must not be read as one rule (docs/22). That one asks about an
    // ARRANGEMENT a user edited and carves out only SEALED standalones,
    // because an unsealed one there is a defect. This asks about a
    // DECLARATION at parse, where no unsealed standalone can be sitting
    // in such a home yet — M1's finding is that no producer at parse
    // makes one. Same shape, two questions, two answers.
    if (s.isOrphan) continue;
    const key = chainKey(s);
    const home = containerFor(doc, key);
    if (!home) {
      out.push(`section "${s.title}" has chain "${key}", which no container declares`);
      continue;
    }
    if (!accepts(home, s)) {
      out.push(
        `section "${s.title}" sits in container "${home.label}", which declares it bears no sections`,
      );
    }
  }
  return out;
}
