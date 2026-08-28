/**
 * depth.ts — Depth-routing helpers (docs/02 §2: depth commands apply to
 * the selected card when one is selected, globally otherwise).
 */

import { documentStats } from "@/model/selectors";
import type { SectionId } from "@/model/types";
import type { TabState } from "@/store";

export const MIN_DEPTH = 1;

export function effectiveDepth(tab: TabState, sectionId: SectionId): number {
  return tab.editor.view.cardDepths[sectionId] ?? tab.editor.view.globalDepth;
}

export function docMaxDepth(tab: TabState): number {
  return Math.max(MIN_DEPTH, documentStats(tab.editor.document).maxDepth);
}
