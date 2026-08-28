/**
 * columns.ts — The explicit column model (docs/03).
 *
 * Columns are first-class state: an ordered list of columns, each an
 * ordered list of SECTION IDS top-to-bottom (ids, never indices — index
 * addressing forces id-shifting fixups through every mutation).
 *
 * All helpers are pure — they return new arrays and never mutate input.
 * Commands assign the result onto the Immer draft, which records patches.
 *
 * Positioning arithmetic and bin-packing (`distributeIntoColumns`) arrive
 * with the canvas in M3; the mutation model lands here in M2 because card
 * reordering must be a command from day one.
 */

import type { SectionId, TocDocument } from "@/model/types";

export type Columns = SectionId[][];

/**
 * Flatten columns into a single section order (left-to-right,
 * top-to-bottom). This is the logical order used for connector lines and
 * YAML export.
 */
export function deriveSectionOrder(columns: Columns): SectionId[] {
  return columns.flat();
}

/** Find which column and position a section lives in. */
export function findCard(
  columns: Columns,
  sectionId: SectionId,
): { colIndex: number; cardIndex: number } | null {
  for (let colIndex = 0; colIndex < columns.length; colIndex++) {
    const cardIndex = columns[colIndex]!.indexOf(sectionId);
    if (cardIndex >= 0) return { colIndex, cardIndex };
  }
  return null;
}

/**
 * Remove trailing empty columns, but preserve intermediate empty columns
 * (gaps) the user created. Always keeps at least one column if any exist.
 */
function trimTrailingEmpty(columns: Columns): Columns {
  let end = columns.length;
  while (end > 0 && columns[end - 1]!.length === 0) end--;
  return columns.slice(0, Math.max(end, 1));
}

/**
 * Move a card to a position in a column (removing it from wherever it
 * currently is). Creates intermediate columns as needed.
 */
export function moveCardToColumn(
  columns: Columns,
  sectionId: SectionId,
  targetColIndex: number,
  insertIndex: number,
): Columns {
  const next = columns.map((col) => col.filter((id) => id !== sectionId));
  while (next.length <= targetColIndex) next.push([]);
  const target = next[targetColIndex]!;
  target.splice(Math.max(0, Math.min(insertIndex, target.length)), 0, sectionId);
  return trimTrailingEmpty(next);
}

/** Insert a new card (assumed absent) at a column position. */
export function insertCard(
  columns: Columns,
  sectionId: SectionId,
  colIndex: number,
  insertIndex: number,
): Columns {
  const next = columns.map((col) => [...col]);
  while (next.length <= colIndex) next.push([]);
  const col = next[colIndex]!;
  col.splice(Math.max(0, Math.min(insertIndex, col.length)), 0, sectionId);
  return next;
}

/** Remove a card. Drops columns that become empty. */
export function removeCard(columns: Columns, sectionId: SectionId): Columns {
  return columns
    .map((col) => col.filter((id) => id !== sectionId))
    .filter((col) => col.length > 0);
}

/**
 * Starting columns for a freshly opened document: one column in document
 * order. Replaced by real bin-packing (`distributeIntoColumns`) in M3.
 */
export function initialColumns(doc: TocDocument): Columns {
  return doc.sections.length ? [doc.sections.map((s) => s.id)] : [];
}
