/** uiStore.ts — Tiny app-chrome state (dialog visibility, canvas
 *  context menu). Transient. */

import { create } from "zustand";
import type { SeamCause } from "@/interaction/pinnedDrag";

export interface CanvasMenuState {
  x: number;
  y: number;
  target:
    | { kind: "card"; sectionId: string }
    | { kind: "topics"; sectionId: string; topicIds: string[] };
}

/**
 * A card drop that reads both ways — between the last card of one
 * container and the first of another. Held so the release can ask which
 * was meant, rather than guess or refuse (docs/13 v2).
 */
export interface SeamMenuState {
  x: number;
  y: number;
  sectionId: string;
  target: { colIndex: number; cardIndex: number };
  /** The container the card would move INTO. */
  chain: readonly string[];
  into: string;
  keep: string;
}

/**
 * A topic drop that would displace a pinned row on a Grounded-UNASKED
 * tab (docs/21, Decision 9).
 *
 * HELD RATHER THAN COMMITTED, exactly like the card seam above: two
 * readings are genuinely live — this tab may hold imagined arrangements,
 * or it may not — and there is no defensible default, so the release
 * asks. What it asks is a MODE choice, never a move confirmation: a
 * "confirm move?" dialog would read as authorization, and there is
 * nothing to authorize, because the move is thought rather than action.
 *
 * The drop is kept as the three values `moveTopics` needs rather than as
 * a `TopicDropTarget`, so app chrome does not acquire a dependency on
 * the drag layer's shapes.
 */
export interface PinnedSeamState {
  x: number;
  y: number;
  tabId: string;
  topicIds: string[];
  /**
   * Where the drop would land, or NULL for a canvas BIRTH — the seam's
   * second cause (docs/22, Decision 7), where there is no destination
   * card because the drop makes one.
   *
   * The birth's own coordinates travel beside it rather than inside it:
   * a card position and a row position are two shapes, and one field
   * carrying both is the conflation this project pays for.
   */
  drop: { sectionId: string; parentTopicId: string | null; index: number } | null;
  /** The birth's column slot, present exactly when `drop` is null. */
  birth?: { toColumn: number; toIndexInColumn: number };
  /** WHY this drop needs consent — pinned rows, new structure, or both. */
  cause: SeamCause;
  /** What a card IS in this system, for the creation headline. Absent
   *  where the adapter names no noun; the sentence degrades. */
  cardNoun?: string;
  movingCount: number;
}

interface UiState {
  loadDialogOpen: boolean;
  aiDialogOpen: boolean;
  /** Collection docs: per-file change review (replaces Export). */
  changesDialogOpen: boolean;
  /** Right-click menu over a card / topic rows (null = closed). */
  canvasMenu: CanvasMenuState | null;
  /** The Overview drawer (docs/17). Stays open across focuses. */
  overviewOpen: boolean;
  /** Two-option menu for a seam drop (null = closed). */
  seamMenu: SeamMenuState | null;
  /** Two-option menu for a pinned topic drop (null = closed). */
  pinnedSeam: PinnedSeamState | null;
  setLoadDialogOpen: (open: boolean) => void;
  setAiDialogOpen: (open: boolean) => void;
  setChangesDialogOpen: (open: boolean) => void;
  setCanvasMenu: (menu: CanvasMenuState | null) => void;
  setOverviewOpen: (open: boolean) => void;
  setSeamMenu: (menu: SeamMenuState | null) => void;
  setPinnedSeam: (seam: PinnedSeamState | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  loadDialogOpen: false,
  aiDialogOpen: false,
  changesDialogOpen: false,
  overviewOpen: false,
  seamMenu: null,
  pinnedSeam: null,
  canvasMenu: null,
  setLoadDialogOpen: (open) => set({ loadDialogOpen: open }),
  setAiDialogOpen: (open) => set({ aiDialogOpen: open }),
  setChangesDialogOpen: (open) => set({ changesDialogOpen: open }),
  setCanvasMenu: (menu) => set({ canvasMenu: menu }),
  setOverviewOpen: (open) => set({ overviewOpen: open }),
  setSeamMenu: (menu) => set({ seamMenu: menu }),
  setPinnedSeam: (seam) => set({ pinnedSeam: seam }),
}));
