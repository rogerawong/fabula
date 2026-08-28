/**
 * dragStore.ts — Transient drag/gesture state, ISOLATED from the main
 * app store (docs/03: high-frequency drag state must not rerender the
 * world). Only drag visuals (ghost, indicators, previews, box overlay)
 * subscribe here. Reset on every gesture end; never persisted.
 */

import { create } from "zustand";
import type { Columns } from "@/layout/columns";
import type { SectionId, TopicId } from "@/model/types";

/** Where a topic drag would drop right now (null = invalid, no indicator). */
export type TopicDropTarget =
  | {
      kind: "topic";
      sectionId: SectionId;
      parentTopicId: TopicId | null;
      /** Insert index, already adjusted for post-removal semantics. */
      index: number;
      /** What the tree should highlight. */
      indicator: { topicId: TopicId; position: "before" | "after" | "child" };
    }
  | {
      /** Card body/header (not a row): append to the section's top level. */
      kind: "section-end";
      sectionId: SectionId;
      index: number;
    }
  | {
      /** Empty canvas: create a new section at this column position. */
      kind: "canvas";
      toColumn: number;
      toIndexInColumn: number;
    };

interface DragStoreState {
  kind: null | "card" | "topics" | "box";
  /** Screen-space pointer, for the floating ghost. */
  pointer: { x: number; y: number } | null;

  // card drag
  cardId: SectionId | null;
  previewColumns: Columns | null;
  cardTarget: { colIndex: number; cardIndex: number } | null;
  /** Set when the current position is refused, with the reason to show.
   *  A refused drag previews nothing and commits nothing (docs/13). */
  refusal: string | null;
  /**
   * What this position MEANS, shown on the ghost while dragging: a
   * same-container slot says nothing, a cross-container one names where
   * the card would land. Consent lives in the gesture, so the gesture
   * has to say what it is about to do (docs/13 v2).
   */
  dropLabel: string | null;
  /**
   * The consequence's SECOND line — "12 inbound links, as of import".
   *
   * Its own field rather than a newline inside `dropLabel`, because the
   * overlay truncates that span: a joined string would have rendered as
   * one clipped line and the count would have been silently invisible.
   * Null means UNMEASURED, and the line is then absent, never zero.
   */
  dropDetail: string | null;
  /**
   * What this drop costs the USER rather than the disk — "needs your
   * hand", for a drop that displaces a pinned row (docs/21, Decision 9).
   *
   * ITS OWN FIELD, for the reason `dropDetail` is: the overlay truncates
   * each of these spans, and a truncation wrapper owns single-line text
   * only. Joining it onto the destination would render one clipped line
   * with the consequence silently invisible — which is the failure that
   * minted the rule.
   *
   * Null is the ordinary case. A pinned row REORDERED among its own
   * siblings says nothing here, because it displaces nothing.
   */
  dropConsequence: string | null;
  /**
   * The container this drop would move the card into, or null for an
   * ordinary reorder. Read at release, so the commit and the label can
   * never disagree.
   */
  dropChain: readonly string[] | null;
  /**
   * A drop whose position reads both ways — between the last card of
   * one container and the first of another. Held rather than committed:
   * release opens the two-option menu instead of guessing.
   */
  seam: { chain: readonly string[]; into: string; keep: string } | null;

  // topic drag
  topicIds: TopicId[];
  ghostLabel: string;
  dropTarget: TopicDropTarget | null;
  /**
   * Cards this drag may legally land on, or null when nothing is being
   * dragged. Computed ONCE at drag start: the document does not change
   * mid-gesture, so eligibility cannot either, and recomputing per
   * pointer move would run the whole predicate on every frame.
   *
   * Highlighting the eligible targets rather than dimming the refused
   * ones is deliberate: on a document where most cards are eligible,
   * dimming paints almost nothing, and on one where most are refused it
   * paints a wall. The affirmative set is the smaller, truer signal.
   */
  eligibleSectionIds: string[] | null;

  // box select
  boxRect: { left: number; top: number; width: number; height: number } | null;

  set: (partial: Partial<Omit<DragStoreState, "set" | "reset">>) => void;
  reset: () => void;
}

const IDLE = {
  kind: null,
  pointer: null,
  refusal: null,
  dropLabel: null,
  dropDetail: null,
  dropConsequence: null,
  dropChain: null,
  seam: null,
  cardId: null,
  previewColumns: null,
  cardTarget: null,
  topicIds: [],
  ghostLabel: "",
  dropTarget: null,
  eligibleSectionIds: null,
  boxRect: null,
} satisfies Partial<DragStoreState>;

export const useDragStore = create<DragStoreState>((set) => ({
  ...IDLE,
  kind: null,
  set: (partial) => set(partial),
  reset: () => set(IDLE),
}));
