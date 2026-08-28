/**
 * useFocusScroll.ts — Bringing a focused subject into view, and flashing
 * it (docs/17).
 *
 * The third of focus's three jobs, and the two that are not expansion.
 * Deliberately OUTSIDE the topic tree: the tree owns its overrides map
 * and nothing else, and moving the viewport is the canvas's business.
 *
 * Waits on the APPLIED signal rather than on the request. Expansion
 * changes layout — a card grows as its path opens — so measuring before
 * the card has applied would pan to where the node used to be. The
 * channel publishes `applied` only once the owning card acknowledges,
 * which is what makes the measurement honest.
 */

import { useEffect } from "react";
import { tweenViewport } from "@/animation/viewportTween";
import { clampToContentOrigin } from "@/interaction/transform";
import { useAppStore } from "@/store";
import { useFocusStore } from "../focusStore";

/** How long the subject stays lit. Long enough to find, short enough to leave. */
const FLASH_MS = 1200;

function elementFor(sectionId: string, topicId?: string): HTMLElement | null {
  const selector =
    topicId === undefined
      ? `[data-card-id="${CSS.escape(sectionId)}"]`
      : `[data-topic-id="${CSS.escape(topicId)}"]`;
  return document.querySelector<HTMLElement>(selector);
}

export function useFocusScroll(tabId: string): void {
  const applied = useFocusStore((s) => s.applied);

  useEffect(() => {
    if (!applied) return;
    // One frame after the ack so the expanded rows have been laid out —
    // the ack says the state is written, not that the browser has
    // reflowed to match it.
    const raf = requestAnimationFrame(() => {
      const el = elementFor(applied.sectionId, applied.target);
      if (!el) return;

      const canvas = document.querySelector<HTMLElement>('[data-testid="canvas"]');
      if (canvas) {
        const bounds = canvas.getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        // Centre the subject without changing zoom: focus orients, it
        // does not reframe.
        const current = useAppStore.getState().tabs.find((t) => t.id === tabId)?.viewport;
        if (current) {
          const dx = bounds.left + bounds.width / 2 - (rect.left + rect.width / 2);
          const dy = bounds.top + bounds.height / 3 - (rect.top + rect.height / 2);
          const target = clampToContentOrigin({
            ...current,
            x: current.x + dx,
            y: current.y + dy,
          });
          tweenViewport(tabId, current, target);
        }
      }

      el.setAttribute("data-focus-flash", "true");
      window.setTimeout(() => el.removeAttribute("data-focus-flash"), FLASH_MS);
    });
    return () => cancelAnimationFrame(raf);
  }, [applied, tabId]);
}
