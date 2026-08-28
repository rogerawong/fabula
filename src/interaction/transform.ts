/**
 * transform.ts — The ONE place for viewport coordinate math (docs/03:
 * "all coordinate math goes through one screenToCanvas transform
 * module"). Every gesture, hit-test, and control converts through these
 * helpers; nothing else multiplies by scale.
 *
 * Convention: `screen = canvas * scale + offset` where offset (x, y) is
 * the canvas origin's position in screen space.
 */

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 2;
export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Snap to the nearest 10% (zoom buttons, docs/02 §2). */
export function snapScale(scale: number): number {
  return clampScale(Math.round(scale * 10) / 10);
}

export function canvasToScreen(v: Viewport, p: Point): Point {
  return { x: p.x * v.scale + v.x, y: p.y * v.scale + v.y };
}

export function screenToCanvas(v: Viewport, p: Point): Point {
  return { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
}

/**
 * Change scale while keeping the canvas point under `screenPoint`
 * stationary (zoom centers on cursor, docs/05).
 */
export function zoomAt(v: Viewport, screenPoint: Point, newScale: number): Viewport {
  const scale = clampScale(newScale);
  const anchor = screenToCanvas(v, screenPoint);
  return {
    scale,
    x: screenPoint.x - anchor.x * scale,
    y: screenPoint.y - anchor.y * scale,
  };
}

export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, x: v.x + dx, y: v.y + dy };
}

/**
 * Forbid viewing past the content origin: the viewport window's
 * top-left, in canvas coords, stays ≥ (0, 0) — no blank space above or
 * left of the content, at ANY zoom level. (`screenToCanvas(v, {0,0}) =
 * (-x/s, -y/s)`, so the constraint is simply x ≤ 0 and y ≤ 0 in screen
 * px, which makes the bound zoom-independent by construction.)
 */
export function clampToContentOrigin(v: Viewport): Viewport {
  return { ...v, x: Math.min(v.x, 0), y: Math.min(v.y, 0) };
}

/**
 * Rubber-band variant of the origin clamp: overshoot past the bound is
 * allowed but asymptotically resisted (never exceeding `give` SCREEN
 * px — visually identical at every zoom level), so a drag past the
 * limit "pulls" and then snaps back on release instead of hitting a
 * wall.
 */
export function rubberBandPastOrigin(v: Viewport, give: number = 96): Viewport {
  const resist = (value: number) =>
    value <= 0 ? value : (give * value) / (value + give);
  return { ...v, x: resist(v.x), y: resist(v.y) };
}

/**
 * Fit content bounds into the viewport with padding, anchored top-left
 * (the content's own layout padding provides the visual margin).
 * Anchoring — rather than centering — keeps fit inside the pan bound
 * (offset ≤ 0), so fitting and clamping agree at every zoom level and
 * no blank space ever opens above/left of the content.
 * Never zooms IN past 100% — fitting a small doc shouldn't blow it up.
 */
export function fitToBounds(
  content: Bounds,
  viewport: Bounds,
  padding: number = 40,
): Viewport {
  if (content.width <= 0 || content.height <= 0) return DEFAULT_VIEWPORT;
  const scale = clampScale(
    Math.min(
      (viewport.width - padding * 2) / content.width,
      (viewport.height - padding * 2) / content.height,
      1,
    ),
  );
  return { scale, x: 0, y: 0 };
}
