/**
 * Tooltip.tsx — the app's one tooltip surface.
 *
 * Native `title` was the recorded defect class (Impeccable P1→P2:
 * right words, weakest surface — OS delay, unstyled, touch-invisible,
 * zero affordance), so every tooltip in the app rides through here and
 * `title=` does not appear in src/view outside this comment. The copy
 * convention is the lock legend's: first line is the heading, the rest
 * cause → consequence → remedy (src/model/locks.ts).
 *
 * A HOOK rather than a wrapper component, deliberately: the trigger
 * keeps its own element, classes and layout — a wrapper span inside a
 * truncating flex row would be exactly the composed-content-in-a-
 * truncation-wrapper mistake the conventions warn about. Spread
 * `props` on the trigger, render `node` beside it.
 *
 * The tip itself is `pointer-events: none`, so it is NOT a hit-test
 * participant: paint checks must use the rendered-ness oracle on it,
 * never `elementFromPoint` (CLAUDE.md, occlusion probes).
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const OPEN_DELAY_MS = 350;
/** Gap between anchor and tip, and the viewport margin tips respect. */
const OFFSET = 6;
const MARGIN = 8;

export interface TooltipTrigger {
  onPointerEnter: (e: React.PointerEvent) => void;
  onPointerLeave: () => void;
  onFocus: (e: React.FocusEvent) => void;
  onBlur: () => void;
}

/**
 * Attach a styled tooltip to one element. `lines` may be null/empty to
 * render nothing (hooks cannot be conditional; the content can be).
 */
export function useTooltip(lines: readonly string[] | null | undefined): {
  props: TooltipTrigger;
  node: React.ReactNode;
} {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const timer = useRef<number>(0);

  const open = (target: Element): void => {
    // The rect is read synchronously — currentTarget is gone once the
    // handler returns — and applied after the hover has earned it.
    const rect = target.getBoundingClientRect();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAnchor(rect), OPEN_DELAY_MS);
  };
  const close = (): void => {
    window.clearTimeout(timer.current);
    setAnchor(null);
  };

  // A tip pinned to viewport coordinates goes stale the moment the
  // canvas pans, zooms or scrolls under it — close on the gestures that
  // move the world, and on Escape for keyboard users.
  useEffect(() => {
    if (anchor === null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("wheel", close, { capture: true, passive: true });
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("wheel", close, { capture: true });
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [anchor]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const content = (lines ?? []).filter((l) => l.length > 0);
  const props: TooltipTrigger = {
    onPointerEnter: (e) => {
      if (content.length > 0) open(e.currentTarget);
    },
    onPointerLeave: close,
    onFocus: (e) => {
      if (content.length > 0) open(e.currentTarget);
    },
    onBlur: close,
  };

  return {
    props,
    node:
      anchor !== null && content.length > 0
        ? createPortal(<TipBox anchor={anchor} lines={content} />, document.body)
        : null,
  };
}

function TipBox({ anchor, lines }: { anchor: DOMRect; lines: readonly string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  // Measured placement, two-pass: above and centered where it fits,
  // clamped to the viewport, flipped below when the top is tight.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.min(
      Math.max(MARGIN, anchor.left + anchor.width / 2 - width / 2),
      window.innerWidth - width - MARGIN,
    );
    const above = anchor.top - height - OFFSET;
    const top = above >= MARGIN ? above : anchor.bottom + OFFSET;
    setPos({ left, top });
  }, [anchor]);

  return (
    <div
      ref={ref}
      role="tooltip"
      data-testid="styled-tooltip"
      className="pointer-events-none fixed z-[60] max-w-[300px] rounded-md bg-neutral-800 px-2.5 py-2 text-[12px] leading-snug shadow-lg"
      style={pos ?? { left: -9999, top: -9999 }}
    >
      <p className="font-medium text-white">{lines[0]}</p>
      {lines.slice(1).map((line, i) => (
        <p key={i} className="mt-1 text-neutral-300">
          {line}
        </p>
      ))}
    </div>
  );
}
