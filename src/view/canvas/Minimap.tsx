/**
 * Minimap.tsx — Clickable, draggable overview (docs/02 §2). Scaled card
 * rects in their section colors + the current viewport window.
 *
 * - Click: jump-center the view on that point.
 * - Drag the window (or press anywhere and drag): the window follows
 *   the pointer and the MAIN CANVAS pans live, so you can see exactly
 *   when to stop.
 * - The window can't be dragged past the canvas's top-left corner —
 *   overshoot is rubber-banded (resisted while dragging, snapping back
 *   on release). Escape cancels the drag and returns to the origin view.
 */

import { useMemo, useRef } from "react";
import type { CanvasLayout } from "@/layout/positions";
import { sectionColorMap, ORPHAN_COLOR } from "@/model/palette";
import {
  clampToContentOrigin,
  rubberBandPastOrigin,
  screenToCanvas,
  type Viewport,
} from "@/interaction/transform";
import { startDragGesture } from "@/interaction/gesture";
import { tweenViewport, type TweenHandle } from "@/animation/viewportTween";
import { useAppStore, type TabState } from "@/store";
import { useCanvasSize } from "./canvasSize";

const MAP_WIDTH = 208;
const MAP_MAX_HEIGHT = 160;

export function Minimap({ tab, layout }: { tab: TabState; layout: CanvasLayout }) {
  const setViewport = useAppStore((s) => s.setViewport);
  const canvas = useCanvasSize();
  const colors = useMemo(
    () => sectionColorMap(tab.editor.document),
    [tab.editor.document],
  );
  const justDragged = useRef(false);
  const tween = useRef<TweenHandle | null>(null);

  if (layout.cards.length === 0) return null;

  const scale = Math.min(
    MAP_WIDTH / layout.totalWidth,
    MAP_MAX_HEIGHT / layout.totalHeight,
  );
  const mapW = layout.totalWidth * scale;
  const mapH = layout.totalHeight * scale;

  // Current viewport window in canvas coords → minimap coords
  const tl = screenToCanvas(tab.viewport, { x: 0, y: 0 });
  const br = screenToCanvas(tab.viewport, { x: canvas.width, y: canvas.height });

  /** Viewport centered on a minimap point, clamped at the origin. */
  const centerOn = (mapX: number, mapY: number, v: Viewport): Viewport =>
    clampToContentOrigin({
      ...v,
      x: canvas.width / 2 - (mapX / scale) * v.scale,
      y: canvas.height / 2 - (mapY / scale) * v.scale,
    });

  const freshViewport = (): Viewport =>
    useAppStore.getState().tabs.find((t) => t.id === tab.id)?.viewport ?? tab.viewport;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    tween.current?.cancel();
    const bounds = e.currentTarget.getBoundingClientRect();
    const press = { x: e.clientX - bounds.left, y: e.clientY - bounds.top };
    const pressedWindow =
      press.x >= tl.x * scale &&
      press.x <= br.x * scale &&
      press.y >= tl.y * scale &&
      press.y <= br.y * scale;

    const original = tab.viewport;
    const start = { x: e.clientX, y: e.clientY };
    let v0 = original;

    startDragGesture(e, {
      onStart: () => {
        justDragged.current = true;
        if (!pressedWindow) {
          // grabbed empty map: put the window under the pointer first
          v0 = centerOn(press.x, press.y, v0);
          setViewport(tab.id, v0);
        }
      },
      onMove: (ev) => {
        // Δ minimap px → Δ/scale canvas px → × viewport scale screen px
        const dx = ((ev.clientX - start.x) / scale) * v0.scale;
        const dy = ((ev.clientY - start.y) / scale) * v0.scale;
        // live update, with resisted overshoot past the origin
        setViewport(tab.id, rubberBandPastOrigin({ ...v0, x: v0.x - dx, y: v0.y - dy }));
      },
      onEnd: (cancelled) => {
        // the click that follows pointerup must not ALSO jump the view;
        // it fires synchronously, before this timeout clears the flag
        setTimeout(() => (justDragged.current = false), 0);
        const current = freshViewport();
        const target = cancelled ? original : clampToContentOrigin(current);
        if (target.x !== current.x || target.y !== current.y) {
          tween.current = tweenViewport(tab.id, current, target);
        }
      },
    });
  };

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    const bounds = e.currentTarget.getBoundingClientRect();
    setViewport(
      tab.id,
      centerOn(e.clientX - bounds.left, e.clientY - bounds.top, tab.viewport),
    );
  };

  return (
    <div
      data-testid="minimap"
      role="button"
      aria-label="Minimap — click to jump, drag the window to pan the view"
      className="relative cursor-pointer overflow-hidden rounded-md border border-neutral-200 bg-white"
      style={{ width: mapW, height: mapH }}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {layout.cards.map((card) => (
        <div
          key={card.sectionId}
          className="absolute rounded-[2px]"
          style={{
            left: card.x * scale,
            top: card.y * scale,
            width: card.width * scale,
            height: card.height * scale,
            backgroundColor: (colors.get(card.sectionId) ?? ORPHAN_COLOR).border + "55",
          }}
        />
      ))}
      <div
        data-testid="minimap-viewport"
        className="absolute cursor-grab border border-neutral-500/70 bg-neutral-500/10"
        style={{
          left: tl.x * scale,
          top: tl.y * scale,
          width: (br.x - tl.x) * scale,
          height: (br.y - tl.y) * scale,
        }}
      />
    </div>
  );
}
