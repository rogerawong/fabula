/**
 * DragOverlay.tsx — Screen-space drag visuals: the floating ghost chip
 * (card/topic drags) and the box-select rectangle. The ONLY component
 * that subscribes to the high-frequency pointer position, so pointermove
 * storms rerender exactly one tiny element (docs/03).
 * pointer-events-none throughout — hit-testing must see through it.
 */

import { useDragStore } from "@/interaction/dragStore";

export function DragOverlay() {
  const kind = useDragStore((s) => s.kind);
  const pointer = useDragStore((s) => s.pointer);
  const label = useDragStore((s) => s.ghostLabel);
  const box = useDragStore((s) => s.boxRect);
  const refusal = useDragStore((s) => s.refusal);
  const dropLabel = useDragStore((s) => s.dropLabel);
  const dropDetail = useDragStore((s) => s.dropDetail);
  const dropConsequence = useDragStore((s) => s.dropConsequence);

  if (kind === "box" && box) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed z-50 rounded-sm border border-sky-400 bg-sky-400/10"
        style={box}
      />
    );
  }

  if ((kind === "topics" || kind === "card") && pointer) {
    return (
      <div
        aria-hidden="true"
        data-testid="drag-ghost"
        className={`pointer-events-none fixed z-50 max-w-72 rounded-md border-2 border-dashed bg-white/90 px-2.5 py-1 text-[12px] font-medium shadow-md ${
          refusal
            ? "border-red-400 text-red-700"
            : dropLabel
              ? "border-amber-400 text-amber-800"
              : "border-neutral-400 text-neutral-700"
        }`}
        style={{ left: pointer.x + 12, top: pointer.y + 8 }}
      >
        <span className="block truncate">{label}</span>
        {/* What this position MEANS, before the release: consent lives in
            the gesture, so the gesture has to say what it will do
            (docs/13 v2). Silent for a same-container reorder. */}
        {dropLabel && !refusal && (
          <span
            data-testid="drag-drop-label"
            className="mt-0.5 block truncate text-[11px] font-normal"
          >
            {dropLabel}
          </span>
        )}
        {/* The cost, under the destination — the order the user cares
            about is WHERE first, then what it costs. Absent when
            nothing was measured: a missing measurement drawn as "0
            inbound links" is a number lying by omission. */}
        {dropDetail && !refusal && (
          <span
            data-testid="drag-drop-detail"
            className="block truncate text-[11px] font-normal text-neutral-500"
          >
            {dropDetail}
          </span>
        )}
        {/* What it costs the USER rather than the disk (docs/21). The
            INTENT tone, not the warning one: a fault in the corpus and a
            move awaiting your hand are different kinds of thing, and
            painting intention in the fault's tone spends the error
            tier's jump. Its own element, because the spans above
            truncate and a truncation wrapper holds one line. */}
        {dropConsequence && !refusal && (
          <span
            data-testid="drag-drop-consequence"
            className="block truncate text-[11px] font-normal text-intent"
          >
            {dropConsequence}
          </span>
        )}
        {/* The refusal travels with the ghost so the reason arrives where
            the user is looking, before they release (docs/13). */}
        {refusal && (
          <span
            data-testid="drag-refusal"
            className="mt-0.5 block text-[11px] font-normal leading-snug"
          >
            {refusal}
          </span>
        )}
      </div>
    );
  }

  return null;
}
