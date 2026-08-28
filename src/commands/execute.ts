/**
 * execute.ts — The single place where commands mutate state.
 *
 * Runs inside Immer's `produceWithPatches` (see dispatcher.ts), so every
 * mutation here is recorded as forward + inverse patches. Executors
 * mutate the draft in place via the tree helpers.
 *
 * VALIDATION POLICY: invalid commands (unknown ids, drops into a moved
 * subtree, mismatched column sets, illegal reparents) leave the draft
 * untouched — the dispatcher sees zero patches and records no undo
 * entry. Guards for UI affordances (e.g. "can I drop here?") belong in
 * the interaction layer; these checks are the last line of defense that
 * keeps state consistent.
 *
 * Reparent legality is the one rule deliberately owned HERE rather than
 * mirrored per gesture (docs/13 v2): v1's cross-chain guard lived in the
 * canvas drag handler, so the sidebar shipped without it and committed
 * the very move the canvas refused. Both drag layers are now messaging
 * over this check.
 *
 * INVARIANT maintained by every executor (property-tested):
 * - `columns` contains exactly the document's section ids, once each
 * - every `cardDepths` key is a live section id
 */

import { chainKey, chainPathKey } from "@/model/selectors";
import type {
  Section,
  SectionId,
  TocDocument,
  Topic,
  TopicDisplacement,
  TopicId,
} from "@/model/types";
import {
  createSection,
  createSectionByUnwrapping,
  findSection,
  findTopic,
  insertTopic,
  locateTopicInDocument,
  removeTopicFromDocument,
  renameSection,
  renameTopic,
  subtreeContains,
} from "@/model/tree";
import { newId } from "@/model/id";
import { isPinned } from "@/model/locks";
import {
  addHeadingRefusal,
  cardChainRefused,
  placementOf,
  removeHeadingRefusal,
  topicMoveRefusal,
} from "./guards";
import { insertCard, moveCardToColumn, removeCard } from "@/layout/columns";
import type { AnimationHints, Command, EditorState } from "./types";
import { resolveBirth } from "@/model/bearing";
import type { BirthShape } from "@/model/birth";

// ── Shared helpers ──────────────────────────────────────────

/**
 * Normalize a selection to its top-most topics, in document order:
 * unknown ids are dropped; ids nested inside another selected id's
 * subtree are dropped (they travel with their ancestor).
 */
function normalizeSelection(doc: TocDocument, topicIds: TopicId[]): Topic[] {
  const wanted = new Set(topicIds);
  const picked: Topic[] = [];
  const walk = (t: Topic) => {
    if (wanted.has(t.id)) {
      picked.push(t); // don't descend — children travel with the subtree
      return;
    }
    t.children.forEach(walk);
  };
  for (const s of doc.sections) s.topics.forEach(walk);
  return picked;
}

/**
 * Where a row sits right now, in the shape a displacement record wants.
 *
 * A top-level row's container is its CARD — one idea, two shapes, which
 * is the same normalization `validate.ts` performs at its own classifier
 * (a card's own container is the document). Both producers of a
 * `displaced` record therefore agree about what "parent" means.
 */
function originOf(doc: TocDocument, topicId: TopicId): TopicDisplacement | null {
  const at = locateTopicInDocument(doc, topicId);
  if (!at) return null;
  const container = at.parent ?? at.section;
  return {
    // A NODE ID, deliberately, and the same one `validate.ts` writes.
    // Decision 3's natural-key amendment governs the DERIVED reading,
    // which compares a live document against a RE-PARSED snapshot where
    // `newId()` has reminted everything. This record never crosses a
    // parse: it is written into the live document and read back out of
    // it by `putBackTopic` and the projection, both of which resolve it
    // as an id. A natural key here would make every hand-displaced row
    // un-put-backable.
    parentId: container.id,
    parentTitle: container.title,
    index: at.index,
    kind: "pin",
  };
}

/**
 * THE FORWARD HALF OF THE DISPLACING ACT (docs/21, Decision 3).
 *
 * Arc 1 built only the inverse — `putBackTopic`, and the clearing clause
 * below. This is its mirror, and it lives at the same site for the same
 * reason: a rule with one enforcement site is a rule the other site
 * disagrees with.
 *
 * ASKED OF THE DOCUMENT, NEVER OF THE CALLER. There is no `displace`
 * flag on the command, because forgetting one would fail SILENTLY and in
 * the dangerous direction: a pinned row moved with no record is a
 * displacement the badge cannot show, the checklist cannot list and the
 * projection cannot return home — so a plan could be computed from an
 * arrangement nobody agreed to write. Consent is the GESTURE layer's
 * question (whether the move happens at all); whether it is recorded is
 * a fact about the row and its new parent.
 *
 * PARENT CHANGE ONLY, matching the net it mirrors (`validate.ts`): no
 * lock kind says anything about POSITION, so a pinned row reordered
 * among its own siblings has displaced nothing.
 */
function captureOrigins(
  doc: TocDocument,
  moving: readonly Topic[],
): Map<TopicId, TopicDisplacement> {
  const out = new Map<TopicId, TopicDisplacement>();
  for (const t of moving) {
    if (t.lock === undefined) continue;
    const origin = originOf(doc, t.id);
    if (origin) out.set(t.id, origin);
  }
  return out;
}

/**
 * Settle one moved row's record against the parent it just landed in.
 *
 * Three answers, in this order:
 * - landed HOME → clear (putting a thing back is not a displacement,
 *   whoever does it);
 * - already displaced → leave it (the origin does not change because the
 *   row moved twice — a drifting record would launder a pinned move into
 *   a shorter one on every subsequent move);
 * - pinned and the parent changed → write the origin captured before the
 *   removal.
 */
function settleDisplacement(
  row: Topic,
  homeId: string,
  origins: ReadonlyMap<TopicId, TopicDisplacement>,
): void {
  if (row.displaced?.parentId === homeId) {
    delete row.displaced;
    return;
  }
  if (row.displaced !== undefined) return;
  const origin = origins.get(row.id);
  if (origin && origin.parentId !== homeId) row.displaced = origin;
}

/** Remove sections that are empty orphan husks after a topic removal —
 *  an orphan card IS its single entry; without it the husk would
 *  serialize as a duplicate leaf. Patch-based undo restores them. */
function pruneEmptyOrphans(state: EditorState, hints: AnimationHints): void {
  const empty = state.document.sections.filter(
    (s) => s.isOrphan && s.topics.length === 0,
  );
  for (const husk of empty) {
    state.document.sections.splice(
      state.document.sections.findIndex((s) => s.id === husk.id),
      1,
    );
    state.columns = removeCard(state.columns, husk.id);
    delete state.view.cardDepths[husk.id];
    (hints.removedSectionIds ??= []).push(husk.id);
  }
}

// ── Executors ───────────────────────────────────────────────

function execMoveTopics(
  state: EditorState,
  cmd: Extract<Command, { type: "moveTopics" }>,
): AnimationHints {
  const doc = state.document;
  const toSection = findSection(doc, cmd.toSectionId);
  if (!toSection) return {};

  const moving = normalizeSelection(doc, cmd.topicIds);
  if (moving.length === 0) return {};

  // The ONE discriminant, shared with the drag layer and the
  // new-section executor. Four reasons, not one: capability, leaf
  // bundle, subsection, path collision.
  if (
    topicMoveRefusal(
      doc,
      moving.map((t) => t.id),
      {
        sectionId: cmd.toSectionId,
        parentTopicId: cmd.toParentTopicId,
      },
    ) !== null
  ) {
    return {};
  }

  // Target parent must exist in the target section and must not be part
  // of (or inside) anything being moved — no drops into your own subtree.
  if (cmd.toParentTopicId !== null) {
    const parentId = cmd.toParentTopicId;
    if (moving.some((t) => t.id === parentId || subtreeContains(t, parentId))) return {};
    if (!findTopic(toSection, parentId)) return {};
  }

  // Captured BEFORE the removal: afterwards there is nothing left to
  // read the title from, and `placementOf` can no longer say where the
  // rows used to be.
  //
  // Only a REPARENT is named. A reorder keeps its count, because
  // "Move 1 topic" is exactly right for a row that stayed put in the
  // tree — naming every move would change forty toasts to fix one.
  const reparenting = moving.some((t) => {
    const at = placementOf(doc, t.id);
    return (
      at !== null &&
      (at.sectionId !== cmd.toSectionId || at.parentTopicId !== cmd.toParentTopicId)
    );
  });
  const movedTitle = reparenting && moving.length === 1 ? moving[0]!.title : undefined;
  // Captured BEFORE the removal, for the same reason the title is: after
  // it there is no placement left to read.
  const origins = captureOrigins(doc, moving);
  const removed = moving.map((t) => removeTopicFromDocument(doc, t.id)!);

  // Insert BEFORE pruning orphan husks: if the target is an orphan that
  // was just emptied by the removal (same-section reorder), inserting
  // first refills it — pruning first would delete the target and lose
  // the moved topics. The parent (validated above) survives removals:
  // it's in the target section and outside every moved subtree.
  for (let i = 0; i < removed.length; i++) {
    // BOTH HALVES OF THE DISPLACING ACT, at one site: cleared when the
    // row lands home, written when a pinned row lands anywhere else.
    // The rule does not live only in the convenient gesture, where the
    // other site would quietly disagree with it.
    settleDisplacement(removed[i]!, cmd.toParentTopicId ?? cmd.toSectionId, origins);
    insertTopic(toSection, removed[i]!, cmd.toParentTopicId, cmd.toIndex + i);
  }

  // THE SECOND DROP'S COMMITMENT (docs/22, Decision 2). A standalone is
  // R3's deferred commitment, and this drop is what reveals which shape
  // was meant — in the SAME command, so one undo restores the standalone
  // and the row's origin together.
  convertOnArrival(toSection);

  const hints: AnimationHints = {
    movedTopicIds: removed.map((t) => t.id),
    // The toast NAMES the move (docs/16). "Undo move" beside forty
    // undo-able steps says nothing about which one; the title does.
    movedTopicTitle: movedTitle,
  };
  pruneEmptyOrphans(state, hints);
  return hints;
}

/**
 * A standalone that has just received a row is no longer a standalone
 * (docs/22, Decision 2 — the second drag).
 *
 * TWO DROP GEOMETRIES, TWO RULED MEANINGS, both read off the ARRANGEMENT
 * rather than off the drop that produced it — the same discipline the
 * displacing half follows two functions up. A flag saying "this was a
 * child drop" would be a fact the executor could be lied to about; the
 * card's own shape cannot be.
 *
 * - a SIBLING landed beside the entry ⇒ the card now has two top-level
 *   entries, which is a section. The heading is the placeholder, because
 *   nobody has chosen a name for the thing the two rows are now part of.
 * - a CHILD landed under the entry ⇒ the entry is PARENTED, and a
 *   parented top-level entry IS the promoted section (OR-5b's own
 *   invariant): the heading becomes the entry's name, its children
 *   become the rows.
 * - unless the entry is PINNED, where promotion would erase the pin, so
 *   the card WRAPS instead (OR-5c) and the entry stays a row.
 *
 * WITHOUT THIS the states are reachable and illegal. `isOrphan` promises
 * "a top-level TOC entry with no children", and both drops broke it —
 * MkDocs then wrote the child-drop shape as a bare path and lost the
 * children entirely.
 */
function convertOnArrival(section: Section): void {
  if (!section.isOrphan) return;
  const entry = section.topics[0];
  if (!entry) return;
  const siblings = section.topics.length > 1;
  if (!siblings && entry.children.length === 0) return; // nothing arrived

  delete section.isOrphan;
  if (!siblings && !isPinned(entry)) {
    // PROMOTE: the entry becomes the face. Its own title and path are
    // already the card's — the standalone mirrored them — so what
    // changes is that the children become the rows.
    section.extras = entry.extras;
    section.titleDerived = entry.titleDerived;
    section.topics = entry.children;
    return;
  }
  // WRAP: a heading over rows that stay rows. The card stops addressing
  // the entry's page, so its own path goes with the species.
  delete section.path;
  delete section.titleDerived;
  section.title = PLACEHOLDER_TITLE;
  section.untitled = true;
}

function execMoveTopicsToNewSection(
  state: EditorState,
  cmd: Extract<Command, { type: "moveTopicsToNewSection" }>,
): AnimationHints {
  const doc = state.document;
  const moving = normalizeSelection(doc, cmd.topicIds);
  if (moving.length === 0) return {};

  // A new section is by definition a new parent, so EVERY refusal that
  // applies to a cross-card drop applies here. This used to consult the
  // capability alone — a second entry point enforcing a subset of the
  // first's rules, which is the shape that once let the sidebar commit
  // the move the canvas refused. Here the silent-allow had disk
  // consequences: a created section containing a subsection's
  // `_index.md`, relocated illegally.
  const ids = moving.map((t) => t.id);

  /**
   * WHAT THIS DRAG-OUT MAKES (docs/22, Decision 2; OR-5's ruling).
   *
   * Resolved ONCE, from the columns as they stand — before any removal,
   * because the drop position meant the arrangement the user was looking
   * at. The same function answers for the drag layer, so the cursor and
   * the commit cannot disagree about what a slot means.
   */
  const birth = resolveBirth(
    doc,
    state.columns[cmd.toColumn] ?? [],
    cmd.toIndexInColumn,
    moving.map((t) => ({
      childless: t.children.length === 0,
      pinned: t.lock !== undefined,
    })),
  );

  // THE COLLISION CHECK ONLY APPLIES TO A WRAP. A standalone and a
  // promotion both carry the ENTRY's own path, so no directory is
  // created for them and there is nothing for an `_index.md` to collide
  // with; supplying a title there would invent a slug the plan never
  // writes. Declared inputs, applied to a guard's own argument.
  const wrapTitle =
    birth.shape.kind === "wrap"
      ? (cmd.title ?? (moving.length === 1 ? moving[0]!.title : PLACEHOLDER_TITLE))
      : undefined;
  if (
    topicMoveRefusal(doc, ids, null, wrapTitle, {
      columnIds: state.columns[cmd.toColumn] ?? [],
      cardIndex: cmd.toIndexInColumn,
    }) !== null
  ) {
    return {};
  }

  // Captured BEFORE the removal, for the reason `execMoveTopics` gives
  // at its own call: afterwards `placementOf` can no longer say where
  // the rows used to be, and there is no title left to read.
  const origins = captureOrigins(doc, moving);
  const removed = moving.map((t) => removeTopicFromDocument(doc, t.id)!);

  const hints: AnimationHints = { movedTopicIds: removed.map((t) => t.id) };
  pruneEmptyOrphans(state, hints);

  // The REMOVED node, not the pre-removal one: `moving` above answered
  // the refusal question before anything was detached, and reusing it
  // here would read a stale subtree.
  const detached = removed.length === 1 ? removed[0] : undefined;
  const section = bornSection(birth.shape, removed, detached, cmd.title);
  if (section === null) return {};
  if (birth.chain.length > 0) section.chain = [...birth.chain];

  state.document.sections.push(section);
  state.columns = insertCard(
    state.columns,
    section.id,
    cmd.toColumn,
    cmd.toIndexInColumn,
  );

  /**
   * BOTH HALVES OF THE DISPLACING ACT, at the birth too (docs/22,
   * Decision 7). A pinned row that lands inside a born card has changed
   * parent exactly as one dropped on an existing card has, so it records
   * exactly the same way — `captureOrigins`/`settleDisplacement`, the
   * badge, Put back, the projection.
   *
   * A PROMOTION RECORDS NOTHING, and that is not an omission. The
   * promoted entry did not move INTO a parent, it BECAME the card: one
   * referent, two roles (Decision 1), so its children are still under
   * it and nothing has been displaced. A pinned entry never reaches this
   * branch — the table wraps it — which is exactly why the pin survives.
   */
  for (const row of section.topics) {
    settleDisplacement(row, section.id, origins);
  }

  (hints.createdSectionIds ??= []).push(section.id);
  return hints;
}

/**
 * The placeholder a wrap wears until somebody names it (docs/22,
 * Decision 2).
 *
 * THE GESTURE BIRTHS THE PLACEHOLDER, the AI path does not: the user is
 * one click from naming it, and a silently entry-titled group would be
 * the duplicate-name wart committed without consent. Reconstruction has
 * nobody present to answer, so it titles a wrap after its entry with
 * `titleDerived` instead (`validate.ts`).
 */
const PLACEHOLDER_TITLE = "New section";

/**
 * The card this drag-out makes, per the ruled shape.
 *
 * `unhoused` returns null and nothing is born — the refusal above has
 * already declined it, and this answers rather than assuming its caller
 * (the `cardChainRefusal` discipline).
 */
function bornSection(
  shape: BirthShape,
  removed: readonly Topic[],
  detached: Topic | undefined,
  title: string | undefined,
): Section | null {
  switch (shape.kind) {
    case "unhoused":
      return null;
    case "standalone": {
      // THE CARD IS ITS ENTRY, so it mirrors the entry outright — the
      // same shape every adapter's parse mints for a top-level leaf, and
      // the shape `sectionToNode` unwraps back to the bare entry on
      // export. Today's `createSection(detached.title, removed)` built a
      // GROUP around it, which is the misreading of the ruled motive.
      const only = detached!;
      return {
        id: newId(),
        title: only.title,
        ...(only.titleDerived !== undefined ? { titleDerived: only.titleDerived } : {}),
        ...(only.path !== undefined ? { path: only.path } : {}),
        isOrphan: true,
        topics: [only],
      };
    }
    case "promote":
      // The shipped unwrap, kept — and now the ruling rather than an
      // accident: a parented entry's card IS the promoted entry.
      return createSectionByUnwrapping(detached!);
    case "wrap": {
      const named = title ?? PLACEHOLDER_TITLE;
      const born = createSection(named, [...removed]);
      // UNTITLED IS ABOUT WHO CHOSE THE NAME, not about where it came
      // from. A caller-supplied title is somebody's choice; the
      // placeholder is nobody's.
      if (title === undefined) born.untitled = true;
      return born;
    }
  }
}

/**
 * A NEW GROUP OVER THE CARD'S CONTENT (docs/22, Decision 2).
 *
 * The card stops being its entry and starts being a heading with the
 * entry beneath it, so `isOrphan` clears and the card's own `path` goes
 * with it: a section that is not its entry does not address the entry's
 * page, and leaving the path behind would make the card a promoted entry
 * that nobody promoted.
 *
 * THE HEADING IS THE PLACEHOLDER, for the reason Decision 2 gives at the
 * birth rule: the user is one click from naming it, and a silently
 * entry-titled group would be the duplicate-name wart committed without
 * consent.
 */
function execAddHeading(
  state: EditorState,
  cmd: Extract<Command, { type: "addHeading" }>,
): AnimationHints {
  const section = findSection(state.document, cmd.sectionId);
  if (!section) return {};
  // The invariant, from the ONE discriminant — the menu's
  // disabled-with-a-reason is this function's costume, never a second
  // opinion.
  if (addHeadingRefusal(state.document, section) !== null) return {};
  delete section.isOrphan;
  delete section.path;
  delete section.titleDerived;
  section.title = PLACEHOLDER_TITLE;
  section.untitled = true;
  return {};
}

/**
 * O1's RETURN TO NEUTRAL (docs/22, Decision 2), scoped to pure names.
 *
 * What the removal yields is what the ENTRY dictates — the same
 * invariant as the child drop: a childless entry gives the standalone, a
 * parented entry gives the promoted section, heading gone and entry as
 * the face. Every other shape is refused with its own sentence rather
 * than approximated here.
 */
function execRemoveHeading(
  state: EditorState,
  cmd: Extract<Command, { type: "removeHeading" }>,
): AnimationHints {
  const section = findSection(state.document, cmd.sectionId);
  if (!section) return {};
  if (removeHeadingRefusal(state.document, section) !== null) return {};
  const entry = section.topics[0]!;
  delete section.untitled;
  section.title = entry.title;
  if (entry.titleDerived !== undefined) section.titleDerived = entry.titleDerived;
  else delete section.titleDerived;
  if (entry.path !== undefined) section.path = entry.path;
  else delete section.path;

  if (entry.children.length === 0) {
    // THE STANDALONE: the card IS its entry, which stays in `topics[0]`.
    section.isOrphan = true;
    return {};
  }
  // THE PROMOTED SECTION: the entry becomes the face, its children
  // become the rows — `createSectionByUnwrapping`'s shape, reached by the
  // other gesture.
  section.extras = entry.extras;
  section.topics = entry.children;
  return {};
}

function execInsertTopic(
  state: EditorState,
  cmd: Extract<Command, { type: "insertTopic" }>,
): AnimationHints {
  const section = findSection(state.document, cmd.sectionId);
  if (!section) return {};
  const topic: Topic = {
    id: newId(),
    title: cmd.title,
    path: cmd.path,
    children: [],
  };
  if (!insertTopic(section, topic, cmd.parentTopicId, cmd.index)) return {};
  return { movedTopicIds: [topic.id] };
}

/**
 * Put one displaced row back where its record says it came from.
 *
 * DELIBERATELY NOT ROUTED THROUGH `topicMoveRefusal`. That discriminant
 * exists to refuse arrangements the app cannot write, and a pinned row
 * is exactly what it refuses — so consulting it here would decline the
 * one gesture whose whole purpose is to UNDO a refusal-class
 * arrangement. Safe by DIRECTION: restoring the pin's own truth cannot
 * create a write hazard, which is the property that licenses the
 * exemption. Nothing in `commands/` has ever enforced locks anyway; the
 * enforcement sites are the drag, the keyboard and the AI net.
 */
function execPutBackTopic(
  state: EditorState,
  cmd: Extract<Command, { type: "putBackTopic" }>,
): AnimationHints {
  const doc = state.document;
  const found = locateTopicInDocument(doc, cmd.topicId);
  const record = found?.topic.displaced;
  if (!found || !record) return {};

  // Resolve the destination BEFORE removing anything: a failed lookup
  // after the removal would leave the row nowhere at all.
  const home =
    doc.sections.find((s) => s.id === record.parentId) ??
    locateTopicInDocument(doc, record.parentId);
  if (!home) return {};
  const section = "topics" in home ? home : home.section;
  const parentTopicId = "topics" in home ? null : record.parentId;
  // Its own subtree is not a legal home, and a record naming it would
  // mean the row was displaced into itself.
  if (parentTopicId !== null && subtreeContains(found.topic, parentTopicId)) return {};

  const title = found.topic.title;
  const removed = removeTopicFromDocument(doc, cmd.topicId)!;
  // The record and the move leave together: the row is no longer
  // displaced, and a record on a row sitting at home would describe an
  // arrangement the document does not have.
  delete removed.displaced;
  insertTopic(section, removed, parentTopicId, record.index);
  const hints: AnimationHints = { movedTopicIds: [removed.id], movedTopicTitle: title };
  pruneEmptyOrphans(state, hints);
  return hints;
}

function execRemoveTopics(
  state: EditorState,
  cmd: Extract<Command, { type: "removeTopics" }>,
): AnimationHints {
  const moving = normalizeSelection(state.document, cmd.topicIds);
  if (moving.length === 0) return {};
  const hints: AnimationHints = { removedTopicIds: [] };
  for (const t of moving) {
    removeTopicFromDocument(state.document, t.id);
    hints.removedTopicIds!.push(t.id);
  }
  pruneEmptyOrphans(state, hints);
  return hints;
}

function execRemoveSection(
  state: EditorState,
  cmd: Extract<Command, { type: "removeSection" }>,
): AnimationHints {
  const idx = state.document.sections.findIndex((s) => s.id === cmd.sectionId);
  if (idx < 0) return {};
  state.document.sections.splice(idx, 1);
  state.columns = removeCard(state.columns, cmd.sectionId);
  delete state.view.cardDepths[cmd.sectionId];
  return { removedSectionIds: [cmd.sectionId] };
}

/**
 * May this card move into this container? Two refusals, both type
 * errors rather than questions worth asking the user (docs/13 v2):
 *
 * - the target does not bear this KIND of card — dropping a group into
 *   a lane of anchors is not a move;
 * - the move would empty a container the format requires filled.
 *
 * Judged from the DECLARED registry, so a container that bears sections
 * and holds none still takes the first card dropped into it. Inert for
 * every document that declares no containers.
 */

function columnsEqual(a: SectionId[][], b: SectionId[][]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (col, i) => col.length === b[i]!.length && col.every((id, j) => id === b[i]![j]),
    )
  );
}

function execSetColumns(
  state: EditorState,
  cmd: Extract<Command, { type: "setColumns" }>,
): AnimationHints {
  // Guard: the new arrangement must contain exactly the live section ids.
  const proposed = cmd.columns.flat().sort();
  const live = state.document.sections.map((s) => s.id).sort();
  if (proposed.length !== live.length || proposed.some((id, i) => id !== live[i])) {
    return {};
  }
  // Identical arrangement → no-op, no undo entry.
  if (columnsEqual(cmd.columns, state.columns)) return {};
  state.columns = cmd.columns.map((col) => [...col]);
  return {};
}

export function executeCommand(state: EditorState, command: Command): AnimationHints {
  switch (command.type) {
    case "moveTopics":
      return execMoveTopics(state, command);
    case "moveTopicsToNewSection":
      return execMoveTopicsToNewSection(state, command);
    case "insertTopic":
      return execInsertTopic(state, command);
    case "removeTopics":
      return execRemoveTopics(state, command);
    case "putBackTopic":
      return execPutBackTopic(state, command);
    case "renameTopic": {
      const loc = locateTopicInDocument(state.document, command.topicId);
      if (!loc || loc.section.id !== command.sectionId) return {};
      renameTopic(loc.section, command.topicId, command.title);
      return {};
    }
    case "renameSection": {
      const section = findSection(state.document, command.sectionId);
      if (!section) return {};
      renameSection(section, command.title);
      return {};
    }
    case "addHeading":
      return execAddHeading(state, command);
    case "removeHeading":
      return execRemoveHeading(state, command);
    case "removeSection":
      return execRemoveSection(state, command);
    case "removeSections": {
      const removedSectionIds: SectionId[] = [];
      for (const sectionId of command.sectionIds) {
        const hints = execRemoveSection(state, { type: "removeSection", sectionId });
        removedSectionIds.push(...(hints.removedSectionIds ?? []));
      }
      return removedSectionIds.length > 0 ? { removedSectionIds } : {};
    }
    case "reorderCard": {
      const section = findSection(state.document, command.sectionId);
      if (!section) return {};
      // THE choke point for reparent legality (docs/13 v2). Every
      // gesture funnels through this command, so the check lives here
      // once and the drag layers become messaging over it — the lesson
      // from v1, whose guard sat in the canvas handler and let the
      // sidebar commit the move the canvas refused.
      if (command.chain && cardChainRefused(state.document, section, command.chain)) {
        return {};
      }
      const next = moveCardToColumn(
        state.columns,
        command.sectionId,
        command.toColumn,
        command.toIndexInColumn,
      );
      const moved = !columnsEqual(next, state.columns);
      // Same-slot drop → no-op, no undo entry. A reparent to the same
      // slot is still a change, so it does not count as one.
      if (moved) state.columns = next;
      if (command.chain && chainKey(section) !== chainPathKey(command.chain)) {
        section.chain = [...command.chain];
      }
      return {};
    }
    case "setColumns":
      return execSetColumns(state, command);
    case "setGlobalDepth": {
      state.view.globalDepth = Math.max(0, Math.floor(command.depth));
      return {};
    }
    case "setCardDepth": {
      if (!findSection(state.document, command.sectionId)) return {};
      if (command.depth === null) {
        delete state.view.cardDepths[command.sectionId];
      } else {
        state.view.cardDepths[command.sectionId] = Math.max(0, Math.floor(command.depth));
      }
      return {};
    }
  }
}
