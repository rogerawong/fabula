/**
 * ghosts.ts — Fading shells for removed cards (docs/05 rule 3): when a
 * mutation makes a card vanish (delete, orphan-husk prune, undo of a
 * section-create), a fixed-position dashed outline fades at its old
 * rect while any surviving topics fly home via FLIP.
 */

import { create } from "zustand";
import { prefersReducedMotion } from "./flip";

export const GHOST_MS = 420;

export interface Ghost {
  key: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface GhostState {
  ghosts: Ghost[];
  add: (rect: { left: number; top: number; width: number; height: number }) => void;
}

let nextKey = 1;

export const useGhostStore = create<GhostState>((set) => ({
  ghosts: [],
  add: (rect) => {
    if (prefersReducedMotion()) return;
    const key = nextKey++;
    set((s) => ({ ghosts: [...s.ghosts, { key, ...rect }] }));
    setTimeout(() => {
      set((s) => ({ ghosts: s.ghosts.filter((g) => g.key !== key) }));
    }, GHOST_MS + 80);
  },
}));

/** Spawn ghosts for every card present in `before` but gone from the DOM. */
export function ghostVanishedCards(before: Map<string, DOMRect>): void {
  for (const [id, rect] of before) {
    if (!id.startsWith("card:")) continue;
    if (document.querySelector(`[data-flip-id="${CSS.escape(id)}"]`)) continue;
    useGhostStore.getState().add({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
  }
}
