/**
 * ZoomControls.tsx — Bottom-left zoom cluster (docs/02 §2): −/+ with
 * 10% snapping, a continuous slider for coarse travel on big canvases
 * presets 50/75/100%, fit-to-view, and a
 * fullscreen toggle. All real buttons, keyboard reachable and labeled.
 */

import { useEffect, useState } from "react";
import { Expand, Maximize, Minus, Plus, Shrink } from "lucide-react";
import type { CanvasLayout } from "@/layout/positions";
import {
  MAX_SCALE,
  MIN_SCALE,
  clampToContentOrigin,
  fitToBounds,
  snapScale,
  zoomAt,
} from "@/interaction/transform";
import { useAppStore, type TabState } from "@/store";
import { useCanvasSize } from "./canvasSize";

const PRESETS = [0.5, 0.75, 1];

export function ZoomControls({ tab, layout }: { tab: TabState; layout: CanvasLayout }) {
  const setViewport = useAppStore((s) => s.setViewport);
  const { width, height } = useCanvasSize();
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const zoomTo = (scale: number) => {
    // Zoom around the viewport center so the view doesn't jump; clamp so
    // zooming out never strands blank space above/left of the content.
    setViewport(
      tab.id,
      clampToContentOrigin(zoomAt(tab.viewport, { x: width / 2, y: height / 2 }, scale)),
    );
  };
  const step = (dir: 1 | -1) => zoomTo(snapScale(tab.viewport.scale + dir * 0.1));
  const fit = () =>
    setViewport(
      tab.id,
      fitToBounds(
        { width: layout.totalWidth, height: layout.totalHeight },
        { width, height },
      ),
    );
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  };

  const pct = Math.round(tab.viewport.scale * 100);
  const btn =
    "flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[12px] font-medium text-neutral-600 hover:bg-neutral-100";

  return (
    <div
      // stopPropagation: clicks here must not start a canvas pan (the
      // container's pointer capture would retarget and eat the click)
      className="absolute bottom-4 left-4 flex items-center gap-0.5 rounded-lg border border-neutral-200 bg-white p-1 shadow-sm"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Zoom out"
        className={btn}
        onClick={() => step(-1)}
      >
        <Minus size={14} />
      </button>
      <input
        type="range"
        aria-label="Zoom"
        data-testid="zoom-slider"
        className="h-1 w-24 cursor-pointer accent-neutral-600"
        min={MIN_SCALE * 100}
        max={MAX_SCALE * 100}
        step={5}
        value={Math.min(MAX_SCALE * 100, Math.max(MIN_SCALE * 100, pct))}
        onChange={(e) => zoomTo(Number(e.target.value) / 100)}
      />
      <span className="min-w-11 text-center text-[12px] tabular-nums text-neutral-700">
        {pct}%
      </span>
      <button type="button" aria-label="Zoom in" className={btn} onClick={() => step(1)}>
        <Plus size={14} />
      </button>
      <div className="mx-0.5 h-4 w-px bg-neutral-200" />
      {PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          aria-label={`Zoom ${p * 100}%`}
          className={btn}
          onClick={() => zoomTo(p)}
        >
          {p * 100}
        </button>
      ))}
      <button type="button" aria-label="Fit to view" className={btn} onClick={fit}>
        <Maximize size={14} />
      </button>
      <div className="mx-0.5 h-4 w-px bg-neutral-200" />
      <button
        type="button"
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        className={btn}
        onClick={toggleFullscreen}
      >
        {isFullscreen ? <Shrink size={14} /> : <Expand size={14} />}
      </button>
    </div>
  );
}
