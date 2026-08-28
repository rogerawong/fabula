/**
 * types.ts — Commands: every mutation of a tab's editable state.
 *
 * A command describes intent with ids and indices; execution happens in
 * one place (execute.ts) inside an Immer `produceWithPatches`, so undo
 * and redo are derived patches — never hand-written reversals
 * (docs/03-architecture.md; inverses are derived, never hand-written).
 *
 * Compound gestures (multi-topic drag = N removes + N inserts + maybe a
 * section create) are ONE command → one undo step by construction.
 */

import type { Patch } from "immer";
import type { SectionId, TocDocument, TopicId } from "@/model/types";
import type { Columns } from "@/layout/columns";

/** Undoable per-tab view state (depth routing, docs/02 §2). */
export interface ViewState {
  globalDepth: number;
  /** Per-card overrides; absence = follow globalDepth */
  cardDepths: Record<SectionId, number>;
}

/** The undoable substate of a tab. Transient state (selection, viewport,
 *  drag, topics-lock) lives elsewhere and is never part of undo. */
export interface EditorState {
  document: TocDocument;
  columns: Columns;
  view: ViewState;
}

export type Command =
  /**
   * Move topics (with their subtrees) to a target position: under
   * `toParentTopicId` in `toSectionId` (null = section top level) at
   * `toIndex`. `toIndex` addresses the target list AFTER the moved
   * topics have been removed from it (relevant for same-list reorders).
   * Nested selections are normalized: ids inside another moved id's
   * subtree travel with it. Invalid targets (inside a moved subtree,
   * unknown ids) make the command a no-op.
   */
  | {
      type: "moveTopics";
      topicIds: TopicId[];
      toSectionId: SectionId;
      toParentTopicId: TopicId | null;
      toIndex: number;
    }
  /**
   * Drag-to-canvas: remove topics from their sections and wrap them in a
   * new section, inserted into the given column position. A single moved
   * topic that has children is "unwrapped": it becomes the section
   * itself (title/path/extras) and its children become the top level.
   */
  | {
      type: "moveTopicsToNewSection";
      topicIds: TopicId[];
      /** Title for multi-topic sections; ignored when unwrapping. */
      title?: string;
      toColumn: number;
      toIndexInColumn: number;
    }
  | {
      type: "insertTopic";
      sectionId: SectionId;
      parentTopicId: TopicId | null;
      index: number;
      title: string;
      path?: string;
    }
  | { type: "removeTopics"; topicIds: TopicId[] }
  /**
   * Return ONE displaced row to the parent its `displaced` record names,
   * and clear the record — both in one command, so undo removes both by
   * inversion (docs/21, Decision 3).
   *
   * Reads the record for its target rather than taking one, because that
   * is the affordance: the user should not have to find "home" by eye.
   * A row with no record is a no-op, and so is one whose original parent
   * has since gone — a guard consumes DECLARED inputs.
   */
  | { type: "putBackTopic"; topicId: TopicId }
  | { type: "renameTopic"; sectionId: SectionId; topicId: TopicId; title: string }
  | { type: "renameSection"; sectionId: SectionId; title: string }
  /**
   * THE SPECIES COMMANDS, both directions (docs/22, Decision 2).
   *
   * `addHeading` WRAPS A NEW GROUP around a standalone card's content:
   * the entry stays an entry and a heading appears over it. That is the
   * deliberate new-byte-shape, and it is distinct from promotion, where
   * the entry BECOMES the face.
   *
   * `removeHeading` is O1's return to neutral, scoped to headings that
   * are PURE NAMES: on exactly one top-level entry it yields what the
   * entry dictates — childless gives the standalone, parented gives the
   * promoted section. Every other case is a refusal with its own
   * sentence (`guards.ts`, `HeadingRefusal`).
   *
   * EXPLICIT COMMANDS RATHER THAN AN INFERENCE FROM ROW COUNT: species
   * derived from aggregate state is hidden state, which is the
   * `sealed`/empty mistake one level up — and both of these are
   * undoable, which is what makes the transition safe to offer at all.
   */
  | { type: "addHeading"; sectionId: SectionId }
  | { type: "removeHeading"; sectionId: SectionId }
  | { type: "removeSection"; sectionId: SectionId }
  /** Multi-card delete (Delete key on a card multi-selection) — one
   *  command, one undo entry. */
  | { type: "removeSections"; sectionIds: SectionId[] }
  | {
      type: "reorderCard";
      sectionId: SectionId;
      toColumn: number;
      toIndexInColumn: number;
      /**
       * Present makes this a REPARENT: the card's chain becomes this one
       * (docs/13 v2). Absent is an ordinary reorder within its own
       * container.
       *
       * Explicit rather than derived from the drop position, because the
       * seam menu's two options must produce different results at the
       * SAME position — "keep in A" and "move to B" are the same pixel,
       * so the position alone cannot say which was meant.
       */
      chain?: readonly string[];
    }
  /** Wholesale column replacement (auto-arrange / restore-layout). Must
   *  contain exactly the document's section ids or the command no-ops. */
  | { type: "setColumns"; columns: Columns }
  | { type: "setGlobalDepth"; depth: number }
  /** depth: null clears the per-card override */
  | { type: "setCardDepth"; sectionId: SectionId; depth: number | null };

/**
 * Hints for the animation layer (M5): which ids moved/appeared/vanished,
 * so FLIP snapshots know what to track. Execution fills these; they are
 * NOT part of state and never persisted.
 */
export interface AnimationHints {
  movedTopicIds?: TopicId[];
  /**
   * The single moved topic's title, for the toast. Absent for a
   * multi-row drag, where a count reads better than one name standing
   * in for several.
   */
  movedTopicTitle?: string;
  removedTopicIds?: TopicId[];
  createdSectionIds?: SectionId[];
  removedSectionIds?: SectionId[];
}

/** One undo step: label for toasts + forward/inverse patches. */
export interface UndoEntry {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
}

export interface CommandResult {
  next: EditorState;
  /** null when the command was a no-op (nothing changed, nothing to undo) */
  entry: UndoEntry | null;
  hints: AnimationHints;
}
