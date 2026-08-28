/**
 * viewportTween.ts — Short ease-out viewport animation (rubber-band
 * snap-back, cancelled-drag restore). Drives the store, so the canvas
 * AND the minimap window move together. Reduced motion jumps straight
 * to the target.
 */

import type { Viewport } from "@/interaction/transform";
import { useAppStore } from "@/store";
import { prefersReducedMotion } from "./flip";

export interface TweenHandle {
  cancel: () => void;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export function tweenViewport(
  tabId: string,
  from: Viewport,
  to: Viewport,
  ms: number = 280,
): TweenHandle {
  const set = (v: Viewport) => useAppStore.getState().setViewport(tabId, v);
  if (ms <= 0 || prefersReducedMotion()) {
    set(to);
    return { cancel: () => {} };
  }

  let raf = 0;
  const startAt = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - startAt) / ms);
    const k = easeOutCubic(t);
    set({
      x: from.x + (to.x - from.x) * k,
      y: from.y + (to.y - from.y) * k,
      scale: from.scale + (to.scale - from.scale) * k,
    });
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return { cancel: () => cancelAnimationFrame(raf) };
}
