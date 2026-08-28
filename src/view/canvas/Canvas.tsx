/**
 * Canvas.tsx — The infinite canvas: pan (drag empty space / trackpad),
 * zoom (wheel/pinch centered on cursor), cards + connectors in a single
 * transformed world layer. Layout arrives as a prop (the Workspace owns
 * it, drag previews included).
 */

import { useEffect, useMemo, useRef } from "react";
import { cardMarks } from "./cardMarks";
import { filesOf } from "@/collections/types";
import { structureReport } from "@/model/remainders";
import { deriveSectionOrder } from "@/layout/columns";
import { renameCapability } from "@/formats/registry";
import { sectionColorMap, ORPHAN_COLOR } from "@/model/palette";
import { useAppStore, type TabState } from "@/store";
import {
  clampScale,
  clampToContentOrigin,
  panBy,
  rubberBandPastOrigin,
  zoomAt,
  type Viewport,
} from "@/interaction/transform";
import { tweenViewport, type TweenHandle } from "@/animation/viewportTween";
import { useDragStore } from "@/interaction/dragStore";
import type { CanvasLayout } from "@/layout/positions";
import { CARD_WIDTH, GAP_Y, PADDING_TOP, columnX } from "@/layout/positions";
import type { Columns } from "@/layout/columns";
import { effectiveDepth } from "@/view/depth";
import { useCanvasSize } from "./canvasSize";
import { SectionCard } from "./SectionCard";
import { containerOf, containerTooltip } from "@/model/containers";
import { ContainerLanes } from "./ContainerLanes";
import { useFocusScroll } from "./useFocusScroll";
import { Connectors } from "./Connectors";
import { ZoomControls } from "./ZoomControls";

/** Pointer movement below this is a click (deselect), not a pan. */
const CLICK_SLOP_PX = 3;

/** Dashed slot shown where "drag to canvas" would create a section. */
function NewSectionSlot({
  columns,
  layout,
  slot,
}: {
  columns: Columns;
  layout: CanvasLayout;
  slot: string;
}) {
  const [col = 0, idx = 0] = slot.split(":").map(Number);
  const colIds = columns[col] ?? [];
  let y = PADDING_TOP;
  if (idx > 0 && colIds.length > 0) {
    const prev = layout.byId.get(colIds[Math.min(idx, colIds.length) - 1]!);
    if (prev) y = prev.y + prev.height + GAP_Y / 2 - 24;
  }
  return (
    <div
      aria-hidden="true"
      data-testid="new-section-slot"
      className="pointer-events-none absolute flex h-12 items-center justify-center rounded-lg border-2 border-dashed border-sky-400 bg-sky-50/60 text-[12px] font-medium text-sky-600"
      style={{ left: columnX(col), top: y, width: CARD_WIDTH }}
    >
      New section
    </div>
  );
}

export function Canvas({ tab, layout }: { tab: TabState; layout: CanvasLayout }) {
  const setViewport = useAppStore((s) => s.setViewport);
  const selectSection = useAppStore((s) => s.selectSection);
  const setCanvasSize = useCanvasSize((s) => s.set);
  // Pan and flash live out here: the tree owns its overrides map and
  // nothing else, and this waits on the APPLIED signal so it measures a
  // layout that has already expanded (docs/17).
  useFocusScroll(tab.id);
  const draggingCardId = useDragStore((s) => (s.kind === "card" ? s.cardId : null));
  const canvasSlot = useDragStore((s) =>
    s.kind === "topics" && s.dropTarget?.kind === "canvas"
      ? `${s.dropTarget.toColumn}:${s.dropTarget.toIndexInColumn}`
      : null,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const tween = useRef<TweenHandle | null>(null);
  // Event handlers read the freshest viewport from the store, not from a
  // captured prop (wheel/pan handlers outlive many renders).
  const tabId = tab.id;
  const getViewport = (): Viewport =>
    useAppStore.getState().tabs.find((t) => t.id === tabId)?.viewport ?? tab.viewport;

  const colors = useMemo(
    () => sectionColorMap(tab.editor.document),
    [tab.editor.document],
  );

  // Container size → shared store (minimap, zoom controls, fit)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const report = () => setCanvasSize(el.clientWidth, el.clientHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [setCanvasSize]);

  // Wheel: pan, or zoom-at-cursor with ctrl/cmd (pinch). Needs a
  // non-passive listener to preventDefault browser zoom/scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = useAppStore.getState().tabs.find((t) => t.id === tabId)?.viewport;
      if (!v) return;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const factor = Math.exp(-e.deltaY * 0.01);
        // clamp after zoom: zooming out near the corner must not strand
        // blank space above/left of the content
        setViewport(
          tabId,
          clampToContentOrigin(zoomAt(v, point, clampScale(v.scale * factor))),
        );
      } else {
        // wheel has no "release" to snap back from → hard clamp at the
        // top-left bound (same bound the minimap enforces)
        setViewport(tabId, clampToContentOrigin(panBy(v, -e.deltaX, -e.deltaY)));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [tabId, setViewport]);

  // Drag empty space to pan; a motionless press-release deselects.
  // Overshoot past the top-left bound rubber-bands and snaps back on
  // release — the same feel as dragging the minimap window.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = containerRef.current;
    if (!el) return;
    tween.current?.cancel();
    el.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    const v0 = getViewport();
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < CLICK_SLOP_PX) return;
      moved = true;
      // anchored to the gesture start so resistance never compounds
      setViewport(tabId, rubberBandPastOrigin({ ...v0, x: v0.x + dx, y: v0.y + dy }));
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      if (!moved) {
        selectSection(null);
        return;
      }
      const current = getViewport();
      const target = clampToContentOrigin(current);
      if (target.x !== current.x || target.y !== current.y) {
        tween.current = tweenViewport(tabId, current, target);
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  const { x, y, scale } = tab.viewport;
  const sectionsById = useMemo(
    () => new Map(tab.editor.document.sections.map((s) => [s.id, s])),
    [tab.editor.document],
  );
  /**
   * Card marks, computed ONCE per arrangement (docs/22, Decision 5).
   *
   * Both inputs are whole-document questions, so asking them inside a
   * card component would be O(cards²) on a path that re-renders during a
   * drag. Memoized on the document and the card order, which is what the
   * structure report is a function of.
   */
  const marks = useMemo(() => {
    const doc = tab.editor.document;
    return cardMarks(
      doc,
      structureReport(doc, filesOf(doc), deriveSectionOrder(tab.editor.columns)),
    );
  }, [tab.editor.document, tab.editor.columns]);

  return (
    <div
      ref={containerRef}
      data-testid="canvas"
      className="relative flex-1 touch-none overflow-hidden bg-neutral-50"
      style={{
        backgroundImage: "radial-gradient(circle, #d4d4d4 1px, transparent 1px)",
        backgroundSize: `${24 * scale}px ${24 * scale}px`,
        backgroundPosition: `${x}px ${y}px`,
      }}
      onPointerDown={onPointerDown}
    >
      <div
        data-testid="canvas-world"
        className="absolute left-0 top-0"
        style={{
          transform: `translate(${x}px, ${y}px) scale(${scale})`,
          transformOrigin: "0 0",
          width: layout.totalWidth,
          height: layout.totalHeight,
        }}
      >
        <ContainerLanes
          doc={tab.editor.document}
          columns={tab.editor.columns}
          height={layout.totalHeight}
        />
        <Connectors layout={layout} colors={colors} />
        {layout.cards.map((rect) => {
          const section = sectionsById.get(rect.sectionId);
          if (!section) return null;
          return (
            <SectionCard
              key={section.id}
              tabId={tab.id}
              section={section}
              formatId={tab.editor.document.formatId}
              color={colors.get(section.id) ?? ORPHAN_COLOR}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              depth={effectiveDepth(tab, section.id)}
              selected={tab.selectedSectionIds.includes(section.id)}
              locked={tab.topicsLocked}
              renameable={renameCapability(tab.editor.document)}
              containerTooltip={containerTooltip(
                containerOf(tab.editor.document, section),
              )}
              mark={marks.get(section.id)}
              dragging={draggingCardId === section.id}
              previewing={draggingCardId !== null}
              selectedTopicIds={tab.selectedTopicIds}
            />
          );
        })}
        {canvasSlot && (
          <NewSectionSlot
            columns={tab.editor.columns}
            layout={layout}
            slot={canvasSlot}
          />
        )}
      </div>
      <ZoomControls tab={tab} layout={layout} />
    </div>
  );
}
