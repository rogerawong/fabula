/**
 * canvasSize.ts — Tiny shared store for the canvas container's pixel
 * size. Written by Canvas (ResizeObserver), read by the minimap and
 * zoom controls, which live outside the canvas subtree. Transient.
 */

import { create } from "zustand";

interface CanvasSizeState {
  width: number;
  height: number;
  set: (width: number, height: number) => void;
}

export const useCanvasSize = create<CanvasSizeState>((set) => ({
  width: 0,
  height: 0,
  set: (width, height) => set({ width, height }),
}));
