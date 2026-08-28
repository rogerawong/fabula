/**
 * dropMath.ts — Pure drop-target arithmetic for drag gestures.
 * DOM hit-testing lives in the gesture modules; everything that can be
 * a pure function over model/layout state lives (and is tested) here.
 */

import type { Columns } from "@/layout/columns";
import type { CardRect } from "@/layout/positions";
import { CARD_WIDTH, GAP_X, PADDING_LEFT } from "@/layout/positions";
import type { SectionId, TopicId } from "@/model/types";

/**
 * Which (column, index) a canvas point targets for a card drop.
 * `excludeId` (the dragged card) is ignored when counting positions.
 * The column may equal `columns.length` — meaning "start a new column".
 */
export function cardDropPosition(
  columns: Columns,
  rects: Map<SectionId, CardRect>,
  canvasPoint: { x: number; y: number },
  excludeId: SectionId | null,
): { colIndex: number; cardIndex: number } {
  const stride = CARD_WIDTH + GAP_X;
  const colIndex = Math.min(
    Math.max(0, Math.floor((canvasPoint.x - PADDING_LEFT + GAP_X / 2) / stride)),
    columns.length,
  );

  const column = (columns[colIndex] ?? []).filter((id) => id !== excludeId);
  let cardIndex = 0;
  for (const id of column) {
    const rect = rects.get(id);
    if (!rect) continue;
    if (canvasPoint.y > rect.y + rect.height / 2) cardIndex++;
  }
  return { colIndex, cardIndex };
}

/**
 * Convert a UI insertion index (computed against the CURRENT sibling
 * list) into the command's post-removal index: moved ids sitting before
 * the insertion point no longer occupy slots once removed.
 */
export function adjustIndexAfterRemoval(
  siblingIds: TopicId[],
  index: number,
  movingIds: ReadonlySet<TopicId>,
): number {
  let adjusted = index;
  for (let i = 0; i < index && i < siblingIds.length; i++) {
    if (movingIds.has(siblingIds[i]!)) adjusted--;
  }
  return Math.max(0, adjusted);
}

/**
 * Map a sidebar-list drop ("place dragged before/after target row")
 * onto the column model. Positions are computed on the columns WITHOUT
 * the dragged card — matching moveCardToColumn's remove-then-insert.
 * Returns null when the target isn't in the columns.
 */
export function sidebarDropToColumnPos(
  columns: Columns,
  draggedId: SectionId,
  targetId: SectionId,
  position: "before" | "after",
): { colIndex: number; cardIndex: number } | null {
  const without = columns.map((col) => col.filter((id) => id !== draggedId));
  for (let c = 0; c < without.length; c++) {
    const i = without[c]!.indexOf(targetId);
    if (i >= 0) {
      return { colIndex: c, cardIndex: position === "before" ? i : i + 1 };
    }
  }
  return null;
}

/**
 * Would dropping `dragged` at this slot land it among cards from a
 * DIFFERENT navigation container (docs/13)?
 *
 * Containers sit above the card level and have no card of their own, so
 * the serializer partitions by chain and any position is technically
 * writable — which is exactly the trap. A cross-chain drop would appear
 * to work and change nothing on export. Refusing it while dragging makes
 * the limitation visible instead of silent.
 *
 * Inert for every format whose cards are top level: with no chains, no
 * neighbour can differ.
 */
/**
 * How a drop position reads (docs/13 v2). Three outcomes, decided by
 * the same post-removal neighbours the refusal used to consult:
 *
 * - `reorder` — both neighbours are mine, or there are none. Nothing
 *   about the container changes.
 * - `reparent` — EVERY neighbour belongs to another container, so the
 *   drop is unambiguously inside that one. It commits directly; asking
 *   would be asking about a position with only one reading.
 * - `seam` — one neighbour mine and one not. Reorder-within and
 *   move-between are the same pixel, and there is no defensible
 *   default, so this is the only case that asks.
 */
export type DropClass =
  | { kind: "reorder" }
  | { kind: "reparent"; chainKey: string }
  | { kind: "seam"; chainKey: string; keepKey: string };

export function classifyDrop(
  columns: Columns,
  chainOf: (id: SectionId) => string,
  dragged: SectionId,
  target: { colIndex: number; cardIndex: number },
): DropClass {
  const mine = chainOf(dragged);
  const column = (columns[target.colIndex] ?? []).filter((id) => id !== dragged);
  const neighbours = [column[target.cardIndex - 1], column[target.cardIndex]].filter(
    (id): id is SectionId => id !== undefined,
  );
  if (neighbours.length === 0) return { kind: "reorder" };

  const foreign = neighbours.filter((id) => chainOf(id) !== mine);
  if (foreign.length === 0) return { kind: "reorder" };
  if (foreign.length === neighbours.length) {
    return { kind: "reparent", chainKey: chainOf(foreign[0]!) };
  }
  return { kind: "seam", chainKey: chainOf(foreign[0]!), keepKey: mine };
}

export function crossChainDrop(
  columns: Columns,
  chainOf: (id: SectionId) => string,
  dragged: SectionId,
  target: { colIndex: number; cardIndex: number },
): boolean {
  const mine = chainOf(dragged);
  const column = (columns[target.colIndex] ?? []).filter((id) => id !== dragged);
  const before = column[target.cardIndex - 1];
  const after = column[target.cardIndex];
  const neighbours = [before, after].filter((id): id is SectionId => id !== undefined);
  // A slot with no neighbours cannot be inside anyone's run.
  if (neighbours.length === 0) return false;
  return neighbours.every((id) => chainOf(id) !== mine);
}
