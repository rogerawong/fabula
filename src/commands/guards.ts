/**
 * guards.ts — Drop legality, in ONE place.
 *
 * Every refusal in the app has to be answerable twice: once by the
 * command executor, which is the invariant, and once by the drag layer,
 * which is the message. v1 of the container guard learned this the hard
 * way — the check sat in the canvas handler and the sidebar committed
 * the move the canvas refused.
 *
 * So the predicate lives here and both callers import it. The cursor is
 * this function's COSTUME, not a second opinion: if these ever disagree,
 * a user is told a drop is fine and then watches it do nothing.
 *
 * **True on BOTH axes as of docs/16 step 1**, and it was not before: the
 * card axis had `cardChainRefused` here with one importer (the executor)
 * while `cardDrag.ts` re-composed the same rule from `accepts` +
 * `wouldEmptyContainer` to get its wording, omitting the no-containers
 * clause. Nothing was reachable through it, and that is not the point —
 * this is the file written because a second copy of a rule is how the
 * sidebar committed the move the canvas refused. Dated rather than
 * quietly corrected: the sentence is true now, and a sentence that
 * becomes true was still a sentence that was wrong.
 *
 * An axis with more than one refusal returns a REASON (see
 * `CardChainRefusal`); the boolean is derived from it. Sentences belong
 * to the drag layer, discriminants to this file.
 */

import { accepts, containerFor, wouldEmptyContainer } from "@/model/containers";

/**
 * Which of the card axis's three refusals applies. A DISCRIMINANT, not
 * copy — the drag layer maps these to sentences, the executor maps them
 * to a boolean, and neither re-derives the rule that produced them.
 */
export type CardChainRefusal = "no-containers" | "not-accepted" | "would-empty";
import { chainKey, chainPathKey } from "@/model/selectors";
import type { Section, TocDocument, Topic } from "@/model/types";
import { reparentCapability } from "@/formats/registry";
import { getCollectionAdapter } from "@/collections/registry";
import { filesOf } from "@/collections/types";
import { locateTopicInDocument } from "@/model/tree";
import { bearingOf, resolveBirth } from "@/model/bearing";
import { bearsSpecies, type WantedSpecies } from "@/model/birth";

/** Where a topic currently sits: its section, and its parent topic
 *  (null at a card's top level). */
export function placementOf(
  doc: TocDocument,
  topicId: string,
): { sectionId: string; parentTopicId: string | null } | null {
  for (const section of doc.sections) {
    let found: { sectionId: string; parentTopicId: string | null } | null = null;
    const walk = (nodes: Topic[], parentId: string | null): boolean => {
      for (const node of nodes) {
        if (node.id === topicId) {
          found = { sectionId: section.id, parentTopicId: parentId };
          return true;
        }
        if (walk(node.children, node.id)) return true;
      }
      return false;
    };
    if (walk(section.topics, null)) return found;
  }
  return null;
}

/**
 * Would moving these topics to `to` change any of their parents on a
 * system that cannot record that? `to === null` means a NEW section,
 * which is a new parent by definition.
 *
 * The predicate is the PARENT, not the directory: nesting a page under a
 * sibling in the same folder moves the file just as surely as dragging
 * it to another card.
 */
export function topicReparentRefused(
  doc: TocDocument,
  topicIds: readonly string[],
  to: { sectionId: string; parentTopicId: string | null } | null,
): boolean {
  if (reparentCapability(doc)) return false;
  if (to === null) return topicIds.length > 0;
  return topicIds.some((id) => {
    const at = placementOf(doc, id);
    if (!at) return false;
    return at.sectionId !== to.sectionId || at.parentTopicId !== to.parentTopicId;
  });
}

/**
 * Why moving this card into `chain` is refused, or null when it is
 * allowed (docs/13).
 *
 * Returns the REASON rather than a bare boolean, because this axis has
 * three of them and the drag layer has to name which one applies. That
 * is what lets the sentence be composed from one rule instead of beside
 * a second copy of it: `cardDrag.ts` used to re-derive `accepts` +
 * `wouldEmptyContainer` to get its wording, and dropped a clause on the
 * way (docs/16 sequencing step 1).
 *
 * The reasons are discriminants, never copy. The sentences live at the
 * drag layer with the rest of the voice.
 */
export function cardChainRefusal(
  doc: TocDocument,
  section: Section,
  chain: readonly string[],
): CardChainRefusal | null {
  // A document with no declared containers cannot express a chain
  // change at all. Unreachable through `classifyDrop`, which returns
  // `reorder` when no neighbour's chain differs — but the predicate is
  // the invariant, so it answers rather than assuming its caller.
  if (!doc.containers || doc.containers.length === 0) return "no-containers";
  const key = chainPathKey(chain);
  if (key === chainKey(section)) return null; // not a reparent at all
  const target = containerFor(doc, key);
  if (!target || !accepts(target, section)) return "not-accepted";
  if (wouldEmptyContainer(doc, section)) return "would-empty";
  return null;
}

/** The boolean costume of `cardChainRefusal`, for the executor's
 *  invariant. Never a second opinion — derived from the one rule. */
export function cardChainRefused(
  doc: TocDocument,
  section: Section,
  chain: readonly string[],
): boolean {
  return cardChainRefusal(doc, section, chain) !== null;
}

/**
 * Which of the move axis's refusals applies to a topic drag, or null
 * when the move is allowed (docs/16).
 *
 * A DISCRIMINANT, like `CardChainRefusal`. The sentences live at the
 * drag layer; the rule lives here, so the drag and the planner cannot
 * drift into telling the user two different things. `capability` is the
 * v1 refusal, unchanged and still first: a system that cannot express a
 * parent change refuses before any path question arises.
 */
export type TopicMoveRefusal =
  | "capability"
  | "leaf-bundle"
  | "path-collision"
  | "subsection"
  | "no-nav-list"
  /**
   * THE HOME THIS DROP NAMES DOES NOT HOLD WHAT THE DROP WOULD MAKE
   * (docs/22, Decision 2's fourth regime; its second where a parented
   * entry meets a standalones-only lane; and the same lane refusing a
   * drop INTO a standalone, because that conversion makes a section too).
   *
   * "SPECIES", NOT "BIRTH", because the same fact refuses two gestures:
   * a card born with nowhere to live, and a card CONVERTED into a
   * species its lane cannot hold. One idea, one name — a second member
   * would be the same rule twice.
   *
   * REPLACES `pinned-to-card`, which retired with this arc. That clause
   * refused a pinned row the empty-canvas drop because promotion erased
   * the pin and left a displacement nothing could name — and OR-5c makes
   * the reason false by construction: a pinned parented entry now WRAPS,
   * so the entry stays a row, the lock survives and the displacement
   * records exactly as any other cross-parent move. What remains
   * genuinely unbuildable is a card with nowhere to live, which is a
   * fact about the FILE's shape and not about any row.
   */
  | "unhoused-species";

/**
 * A leaf bundle is a page whose basename is `index.md` — derivable from
 * the snapshot, which is why the line is drawn here rather than at
 * "directories containing unread files". That predicate would need an
 * evidence channel built to serve one refusal.
 */
function leafBundle(path: string | undefined): boolean {
  return path !== undefined && path.slice(path.lastIndexOf("/") + 1) === "index.md";
}

/**
 * A row that IS a section index (`_index.md`) represents a DIRECTORY,
 * not a page — moving it moves the directory and everything under it.
 *
 * That is docs/16's designed absence, deferred with its unlock named: a
 * directory's membership includes files `ingestible()` filtered out
 * before any adapter saw them, so the honest version needs the driver to
 * retain per-directory unread-file counts.
 *
 * It gets its OWN reason because the alternative was already happening:
 * every destination directory has an `_index.md`, so the path check
 * caught it and said "a page with this filename is already there" — a
 * sentence that sends the user off to rename a file, when no filename
 * would have helped. Found by the corpus paint check on a real
 * subsection ("Learning environment").
 */
function subsectionIndex(path: string | undefined): boolean {
  return path !== undefined && path.slice(path.lastIndexOf("/") + 1) === "_index.md";
}

/** The directory a section's rows live in, from its own index page. */
function sectionDir(section: Section): string | null {
  if (!section.path) return null;
  const i = section.path.lastIndexOf("/");
  return i < 0 ? "" : section.path.slice(0, i);
}

export function topicMoveRefusal(
  doc: TocDocument,
  topicIds: readonly string[],
  to: { sectionId: string; parentTopicId: string | null } | null,
  /**
   * The title a NEW section would take, when `to` is null.
   *
   * Needed only to know which directory it would create, and therefore
   * whether that directory's `_index.md` already exists. Absent means
   * the check is skipped rather than guessed — a refusal invented from
   * a title nobody supplied would be worse than the collision it
   * imagines.
   */
  newSectionTitle?: string,
  /**
   * WHERE a new card would land, when `to` is null — the column it joins
   * and its index in it.
   *
   * Needed to know which HOME the drop names, and therefore whether that
   * home bears the species the entry would be born as. Absent means the
   * check is skipped rather than guessed: a refusal invented from a
   * position nobody supplied would be worse than the hazard it imagines.
   */
  birthAt?: { columnIds: readonly string[]; cardIndex: number },
): TopicMoveRefusal | null {
  if (topicReparentRefused(doc, topicIds, to)) return "capability";

  /**
   * NOTHING IS BORN UNHOUSED (docs/22, Decision 2).
   *
   * R2's "root is a legitimate home wherever the format bears it" has a
   * contrapositive, and this is it: a home holding neither species has
   * no place to put the card, and unlike every other remainder in this
   * design an unhoused card has no projection home to be dissolved
   * against — the whole export would wedge behind it (R5's floor). The
   * fact is about the file's shape, not about imagination, so the
   * refusal holds in EVERY tab state, Aspirational included.
   *
   * A GUARD CONSUMES DECLARED INPUTS. With no drop position supplied
   * there is no home to ask about, so this checks nothing rather than
   * refusing on a guessed one — the same discipline `newSectionTitle`
   * follows two clauses down.
   *
   * WHERE `pinned-to-card` USED TO STAND, and deliberately in its place:
   * a pinned row can now become part of a card (wrapped, OR-5c), and
   * what a drop still cannot do is land somewhere the format has no
   * shape for.
   */
  if (to === null && birthAt !== undefined) {
    const moving = topicIds
      .map((id) => locateTopicInDocument(doc, id)?.topic)
      .filter((t): t is Topic => t !== undefined)
      .map((t) => ({ childless: t.children.length === 0, pinned: t.lock !== undefined }));
    if (
      resolveBirth(doc, birthAt.columnIds, birthAt.cardIndex, moving).shape.kind ===
      "unhoused"
    ) {
      return "unhoused-species";
    }
  }

  /**
   * A DROP INTO A STANDALONE CONVERTS IT (docs/22, Decision 2's second
   * drag), and every geometry converts it into a SECTION: a sibling
   * makes a placeholder heading over two rows, a child makes the entry
   * the face, a child under a PINNED entry makes a wrap. So the lane's
   * bearing is asked once, of the one species all three produce.
   *
   * Decision 2's regime-2 row is exactly this: on a standalones-only
   * home "a later section-conversion is unwritable HERE, so that drop
   * refuses with a sentence naming the homes that bear sections".
   */
  if (to !== null) {
    const target_ = doc.sections.find((s) => s.id === to.sectionId);
    const arriving = topicIds.some((id) => placementOf(doc, id) !== null);
    if (
      target_?.isOrphan === true &&
      arriving &&
      !bearsSpecies(bearingOf(doc, target_.chain ?? []), "section")
    ) {
      return "unhoused-species";
    }
  }

  // THE DESTINATION MAY NOT BE ABLE TO HOLD ANYTHING. Per-page rather
  // than per-format, so it is asked of the adapter rather than derived
  // here — and asked at DRAG TIME from the same predicate the planner
  // uses, because a drop the planner can only refuse at Review is a lie
  // told by the gesture.
  //
  // Skipped, not guessed, where the adapter declares no rule.
  if (to !== null && to.parentTopicId !== null) {
    const adapter = getCollectionAdapter(doc.formatId);
    const parentPath = pathOfTopic(doc, to.parentTopicId);
    if (
      adapter?.canHostChildren !== undefined &&
      parentPath !== undefined &&
      !adapter.canHostChildren(filesOf(doc), parentPath)
    ) {
      return "no-nav-list";
    }
  }

  // A NEW SECTION is a new parent by definition, so every rule that
  // applies to a cross-card drop applies here too. Returning null for
  // `to === null` was the sidebar hole prospectively: a second entry
  // point enforcing a subset of the first's rules, which is how the
  // canvas and the sidebar once disagreed (the sidebar hole). Its silent-allow
  // has DISK consequences — a created section containing a subsection's
  // `_index.md`, moved illegally.
  const target =
    to === null ? null : (doc.sections.find((s) => s.id === to.sectionId) ?? null);
  if (to !== null && target === null) return null;

  const dir = to === null ? newSectionDir(doc) : sectionDir(target!);
  const files = filesOf(doc);
  const claimed = new Set<string>();

  for (const id of topicIds) {
    const at = placementOf(doc, id);
    if (!at) continue;
    // Not a reparent at all — nothing to refuse. A new section is
    // always a new parent, so this never short-circuits there.
    if (
      to !== null &&
      at.sectionId === to.sectionId &&
      at.parentTopicId === to.parentTopicId
    ) {
      continue;
    }
    const path = pathOfTopic(doc, id);
    // BEFORE the path check, which would otherwise catch this and give
    // the wrong reason.
    if (subsectionIndex(path)) return "subsection";
    if (leafBundle(path)) return "leaf-bundle";
    if (path === undefined || dir === null) continue;
    // Into an existing card the page keeps its filename; into a NEW one
    // the page keeps its filename too, but the section's own
    // `_index.md` is created alongside — and that file is a collision
    // candidate of its own, checked below.
    const base = path.slice(path.lastIndexOf("/") + 1);
    const landing = `${dir}/${base}`;
    // Against the snapshot, and against the other rows of this same
    // gesture: dragging two same-named pages into one card is one
    // gesture repeated, not a hypothetical.
    if ((files[landing] !== undefined && landing !== path) || claimed.has(landing)) {
      return "path-collision";
    }
    claimed.add(landing);
  }

  // The created section's own index file. Near-vacuous for an existing
  // card — nothing new is created — but a new section materialises
  // `dir/_index.md`, and a plan that overwrote an existing one would
  // destroy a real landing page.
  if (to === null && dir !== null && newSectionTitle !== undefined) {
    const slug = newSectionTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (slug !== "" && files[`${dir}/${slug}/_index.md`] !== undefined) {
      return "path-collision";
    }
  }
  return null;
}

/**
 * Where a new section's directory would be created: a SIBLING of the
 * existing ones.
 *
 * Derived from the model rather than from a format's config, so this
 * file stays format-agnostic — sections are siblings on every
 * directory-shaped system, which is the only fact needed to know where
 * a new one lands.
 */
function newSectionDir(doc: TocDocument): string | null {
  for (const section of doc.sections) {
    const dir = sectionDir(section);
    if (dir === null) continue;
    const i = dir.lastIndexOf("/");
    return i < 0 ? "" : dir.slice(0, i);
  }
  return null;
}

/** A topic's own path, wherever it sits in the tree. */
function pathOfTopic(doc: TocDocument, topicId: string): string | undefined {
  for (const section of doc.sections) {
    let found: string | undefined;
    const walk = (nodes: Topic[]): void => {
      for (const node of nodes) {
        if (node.id === topicId) found = node.path;
        else walk(node.children);
        if (found !== undefined) return;
      }
    };
    walk(section.topics);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Why a SPECIES COMMAND is refused, or null when it is allowed
 * (docs/22, Decision 2's explicit species commands).
 *
 * A DISCRIMINANT, like the two above. The sentences live at the view
 * layer with the rest of the voice; the rule lives here, so the menu
 * that OFFERS a command and the executor that runs it cannot drift into
 * telling the user two different things.
 */
export type HeadingRefusal =
  /** "Add heading" on a card that already has one. */
  | "not-standalone"
  /** "Remove heading" on a card that has none to remove. */
  | "not-a-section"
  /**
   * The heading IS the page (a PROMOTED entry, one referent in two
   * roles). Removing it would be topic deletion wearing a species
   * command's clothes — forced by OR-5b, which makes a path-bearing card
   * face an ENTRY rather than a label.
   */
  | "path-bearing"
  /** More than one top-level entry: a heading over several entries IS a
   *  section, and breaking it up is the drag path (OR-2). */
  | "multi-entry"
  /** The home bears neither the species the command would produce. */
  | "unhoused-species";

/** The species this card would become if its heading were removed —
 *  what the entry dictates, which is the same invariant as the child
 *  drop (Decision 2). */
function speciesAfterRemoval(section: Section): WantedSpecies {
  return (section.topics[0]?.children.length ?? 0) === 0 ? "standalone" : "section";
}

export function addHeadingRefusal(
  doc: TocDocument,
  section: Section,
): HeadingRefusal | null {
  // ADDING A HEADING IS A STANDALONE'S COMMAND. A card that already
  // shows one has nothing to add — species is HAS-HEADING (O1), and
  // there is no second heading to stack.
  if (!section.isOrphan) return "not-standalone";
  // THE BEARING, not the birth table: a species command has no
  // substitution to fall back on (see `bearsSpecies`).
  return bearsSpecies(bearingOf(doc, section.chain ?? []), "section")
    ? null
    : "unhoused-species";
}

export function removeHeadingRefusal(
  doc: TocDocument,
  section: Section,
): HeadingRefusal | null {
  if (section.isOrphan) return "not-a-section";
  // SCOPED TO PURE NAMES. A card face with a path is an ENTRY, and
  // removing it would delete a page — checked BEFORE the entry count,
  // because it is the more specific fact and the count's sentence would
  // send the user off to drag rows that are not the problem.
  if (section.path !== undefined) return "path-bearing";
  if (section.topics.length !== 1) return "multi-entry";
  // THE RESULTING species, not the current one: a promoted entry is a
  // section, which a sections-only lane bears happily. Asking about the
  // card as it stands would refuse real work.
  return bearsSpecies(bearingOf(doc, section.chain ?? []), speciesAfterRemoval(section))
    ? null
    : "unhoused-species";
}
