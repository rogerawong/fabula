/**
 * positions.ts — Pure layout arithmetic (docs/03 "Layout").
 *
 * `positionCards` turns explicit column state + per-card heights into
 * rects — no bin-packing, just arithmetic. `distributeIntoColumns` is
 * the bin-packing algorithm, used ONLY on document load and explicit
 * Auto-arrange. Card heights come from content measurement reported
 * upward (store.measuredHeights); `estimateCardHeight` seeds layout
 * before the first measurement and drives bin-packing.
 *
 * The explicit first-class column model (docs/03), keyed by section ids.
 */

import { chainKey } from "@/model/selectors";
import type { ContainerDescriptor, Section, SectionId } from "@/model/types";
import type { Columns } from "./columns";

// ── Constants (visual language, docs/05) ────────────────────

export const CARD_WIDTH = 320;
export const CARD_HEADER_HEIGHT = 72;
export const TOPIC_LINE_HEIGHT = 24;
export const GAP_X = 32;
export const GAP_Y = 32;
export const PADDING_TOP = 40;
export const PADDING_LEFT = 24;
export const CONTENT_PADDING = 24;
export const ORPHAN_CARD_HEIGHT = 64;
export const CARD_MIN_HEIGHT = 120;
const MIN_COLUMN_BUDGET = 800;

// ── Types ───────────────────────────────────────────────────

export interface CardRect {
  sectionId: SectionId;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasLayout {
  cards: CardRect[];
  byId: Map<SectionId, CardRect>;
  totalWidth: number;
  totalHeight: number;
}

// ── Height estimation ───────────────────────────────────────

function countVisibleLines(
  topics: Section["topics"],
  currentDepth: number,
  expandDepth: number,
): number {
  let lines = 0;
  for (const t of topics) {
    lines++;
    if (t.children.length > 0 && currentDepth < expandDepth) {
      lines += countVisibleLines(t.children, currentDepth + 1, expandDepth);
    }
  }
  return lines;
}

export function estimateCardHeight(section: Section, expandDepth: number = 2): number {
  if (section.isOrphan) return ORPHAN_CARD_HEIGHT;
  const visibleLines = countVisibleLines(section.topics, 1, expandDepth);
  const contentHeight = visibleLines * TOPIC_LINE_HEIGHT + CONTENT_PADDING;
  return Math.max(CARD_MIN_HEIGHT, CARD_HEADER_HEIGHT + contentHeight);
}

// ── Positioning (pure arithmetic) ───────────────────────────

export function columnX(colIndex: number): number {
  return PADDING_LEFT + colIndex * (CARD_WIDTH + GAP_X);
}

export function positionCards(
  columns: Columns,
  getHeight: (sectionId: SectionId) => number,
): CanvasLayout {
  const cards: CardRect[] = [];
  const byId = new Map<SectionId, CardRect>();
  let maxX = 0;
  let maxY = 0;

  for (let colIndex = 0; colIndex < columns.length; colIndex++) {
    const x = columnX(colIndex);
    let curY = PADDING_TOP;

    for (const sectionId of columns[colIndex]!) {
      const height = getHeight(sectionId);
      const rect: CardRect = { sectionId, x, y: curY, width: CARD_WIDTH, height };
      cards.push(rect);
      byId.set(sectionId, rect);
      curY += height + GAP_Y;
    }

    const right = x + CARD_WIDTH;
    if (right > maxX) maxX = right;
    if (curY > maxY) maxY = curY;
  }

  return {
    cards,
    byId,
    totalWidth: maxX + PADDING_LEFT,
    totalHeight: maxY + PADDING_TOP,
  };
}

// ── Distribution (bin-packing: load + Auto-arrange only) ────

/**
 * Distribute sections into columns with a height-budget bin-pack.
 * Preserves the given order exactly (deriveSectionOrder of the result
 * equals the input order) — it only chooses the column breaks.
 */
export function distributeIntoColumns(
  sections: Section[],
  opts?: {
    order?: SectionId[];
    globalDepth?: number;
    cardDepths?: Record<SectionId, number>;
    viewportHeight?: number;
    /**
     * Declared containers (docs/13 v2). When present, each container's
     * cards are packed into their OWN columns, in declared order — a
     * container is a drop target now, and a tidy canvas that interleaved
     * them would leave its lanes unseeable and unaimable.
     */
    containers?: readonly ContainerDescriptor[];
  },
): Columns {
  if (sections.length === 0) return [];

  if (opts?.containers && opts.containers.length > 0) {
    const byId = new Map(sections.map((s) => [s.id, s]));
    const order = (opts.order ?? sections.map((s) => s.id)).filter((id) => byId.has(id));
    const groups = new Map<string, SectionId[]>();
    for (const id of order) {
      const key = chainKey(byId.get(id)!);
      const bucket = groups.get(key);
      if (bucket) bucket.push(id);
      else groups.set(key, [id]);
    }
    // Declared order, then any chain no container declares — never the
    // order the cards happen to sit in.
    const declared = [...opts.containers]
      .sort((a, b) => a.order - b.order)
      .map((c) => c.chainKey)
      .filter((key) => groups.has(key));
    const undeclared = [...groups.keys()].filter((key) => !declared.includes(key));
    return [...declared, ...undeclared].flatMap((key) => {
      const ids = groups.get(key)!;
      return distributeIntoColumns(
        ids.map((id) => byId.get(id)!),
        { ...opts, order: ids, containers: undefined },
      );
    });
  }

  const globalDepth = opts?.globalDepth ?? 2;
  const byId = new Map(sections.map((s) => [s.id, s]));
  const order = (opts?.order ?? sections.map((s) => s.id)).filter((id) => byId.has(id));

  const heightOf = new Map<SectionId, number>();
  for (const id of order) {
    const depth = opts?.cardDepths?.[id] ?? globalDepth;
    heightOf.set(id, estimateCardHeight(byId.get(id)!, depth));
  }

  // Column budget: fit the viewport when known, clamped to [MIN_COLUMN_BUDGET,
  // 2× tallest card] so columns neither explode nor degenerate.
  const heights = order.map((id) => heightOf.get(id)!);
  const tallest = Math.max(...heights);
  const maxBudget = tallest * 2 + GAP_Y;

  let budget: number;
  if (opts?.viewportHeight && opts.viewportHeight > 0) {
    budget = Math.max(
      MIN_COLUMN_BUDGET,
      Math.min(opts.viewportHeight - PADDING_TOP, maxBudget),
    );
  } else {
    const sorted = [...heights].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const perColumn = order.length <= 6 ? 2 : 3;
    budget = Math.max(
      MIN_COLUMN_BUDGET,
      Math.min(median * perColumn + GAP_Y * (perColumn - 1), maxBudget),
    );
  }

  const columns: Columns = [[]];
  let curY = PADDING_TOP;
  let cardsInColumn = 0;

  for (const id of order) {
    const h = heightOf.get(id)!;

    if (cardsInColumn > 0 && curY + h > budget + PADDING_TOP) {
      columns.push([]);
      curY = PADDING_TOP;
      cardsInColumn = 0;
    }

    columns[columns.length - 1]!.push(id);
    curY += h + GAP_Y;
    cardsInColumn++;

    // An oversized card fills its column; the next card starts fresh.
    if (h > budget) {
      columns.push([]);
      curY = PADDING_TOP;
      cardsInColumn = 0;
    }
  }

  if (columns.length > 0 && columns[columns.length - 1]!.length === 0) {
    columns.pop();
  }

  return columns;
}
