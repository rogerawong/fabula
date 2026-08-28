/**
 * boxSelect.ts — Rubber-band multi-select within one card's tree
 * (docs/02 §3). Selection updates live during the drag; the box exists
 * only in the drag store and vanishes on release.
 */

import type { SectionId } from "@/model/types";
import { useAppStore } from "@/store";
import { startDragGesture } from "./gesture";
import { useDragStore } from "./dragStore";

export function beginBoxSelect(
  down: React.PointerEvent,
  tabId: string,
  sectionId: SectionId,
  cardEl: HTMLElement,
): void {
  const tab = useAppStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab || tab.topicsLocked) return;

  const start = { x: down.clientX, y: down.clientY };
  const drag = useDragStore.getState();

  startDragGesture(down, {
    onStart: () => {
      drag.set({
        kind: "box",
        boxRect: { left: start.x, top: start.y, width: 0, height: 0 },
      });
      useAppStore.getState().setTopicSelection([]);
    },
    onMove: (e) => {
      const box = {
        left: Math.min(start.x, e.clientX),
        top: Math.min(start.y, e.clientY),
        width: Math.abs(e.clientX - start.x),
        height: Math.abs(e.clientY - start.y),
      };
      drag.set({ boxRect: box });

      const hit: string[] = [];
      for (const row of cardEl.querySelectorAll<HTMLElement>(
        `[data-topic-row][data-section-id="${sectionId}"]`,
      )) {
        const r = row.getBoundingClientRect();
        const overlaps =
          r.left < box.left + box.width &&
          r.right > box.left &&
          r.top < box.top + box.height &&
          r.bottom > box.top;
        if (overlaps) hit.push(row.getAttribute("data-topic-id")!);
      }
      useAppStore.getState().setTopicSelection(hit);
    },
    onEnd: (cancelled) => {
      drag.reset();
      if (cancelled) useAppStore.getState().setTopicSelection([]);
      // on drop: selection simply stays
    },
  });
}
