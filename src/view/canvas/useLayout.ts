/**
 * useLayout.ts — Derive card rects from column state + reported heights.
 * Measured heights win; estimation seeds cards that haven't rendered yet.
 * `computeLayout` is the pure core — drag gestures call it directly to
 * hit-test against the same rects the canvas renders.
 */

import { useMemo } from "react";
import { CARD_MIN_HEIGHT, estimateCardHeight, positionCards } from "@/layout/positions";
import type { CanvasLayout } from "@/layout/positions";
import type { Columns } from "@/layout/columns";
import type { TabState } from "@/store";

export function computeLayout(tab: TabState, columnsOverride?: Columns): CanvasLayout {
  const { document: doc, view } = tab.editor;
  const columns = columnsOverride ?? tab.editor.columns;
  const heights = tab.measuredHeights;
  const byId = new Map(doc.sections.map((s) => [s.id, s]));

  return positionCards(columns, (id) => {
    const measured = heights[id];
    if (measured !== undefined) return measured;
    const section = byId.get(id);
    if (!section) return CARD_MIN_HEIGHT;
    return estimateCardHeight(section, view.cardDepths[id] ?? view.globalDepth);
  });
}

export function useLayout(
  tab: TabState | null,
  columnsOverride?: Columns,
): CanvasLayout | null {
  // tab state is immutably updated, so tab identity covers every input
  return useMemo(
    () => (tab ? computeLayout(tab, columnsOverride) : null),
    [tab, columnsOverride],
  );
}
