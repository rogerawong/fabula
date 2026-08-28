/**
 * gesture.ts — The shared press→threshold→drag→drop/cancel machine
 * (docs/03 "Interaction layer"). Every drag gesture in the app (card,
 * topic, box-select, sidebar row) runs through this one utility:
 *
 *   idle → pressed (below threshold) → dragging → drop | cancel
 *
 * Rules encoded here, learned the hard way:
 * - Machines emit commands only on completion — callbacks receive a
 *   `cancelled` flag and must not mutate anything before onEnd.
 * - Escape always cancels (a window-level listener lives exactly as
 *   long as the gesture).
 * - Listeners attach to window, not the source element — live layout
 *   previews may unmount the element mid-drag.
 * - Text selection is suppressed for the duration.
 */

export interface GestureCallbacks {
  /** Threshold crossed — the drag is real. Set up transient state here. */
  onStart: (e: PointerEvent) => void;
  /** Every pointermove while dragging. */
  onMove: (e: PointerEvent) => void;
  /**
   * Gesture over. `cancelled` is true for Escape / lost pointer.
   * Always called exactly once after onStart (never before onStart —
   * a below-threshold release is a click, not a drag, and ends silently).
   */
  onEnd: (cancelled: boolean) => void;
}

export const DRAG_THRESHOLD_PX = 4;

export function startDragGesture(
  down: { clientX: number; clientY: number; pointerId: number },
  callbacks: GestureCallbacks,
  threshold: number = DRAG_THRESHOLD_PX,
): void {
  const start = { x: down.clientX, y: down.clientY };
  let started = false;
  let done = false;

  const finish = (cancelled: boolean) => {
    if (done) return;
    done = true;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKeyDown, true);
    document.body.style.userSelect = "";
    if (started) callbacks.onEnd(cancelled);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== down.pointerId) return;
    if (!started) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < threshold) return;
      started = true;
      document.body.style.userSelect = "none";
      callbacks.onStart(e);
    }
    callbacks.onMove(e);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== down.pointerId) return;
    finish(false);
  };
  const onCancel = () => finish(true);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      finish(true);
    }
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  // capture: beat the app-level Escape handler (clear-selection)
  window.addEventListener("keydown", onKeyDown, true);
}
