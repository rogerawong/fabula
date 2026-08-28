/**
 * flip.ts — THE shared FLIP utility (docs/05 rule 2: one utility, no
 * per-feature reimplementations).
 *
 * Elements opt in with `data-flip-id="card:<id>"` / `"topic:<id>"`.
 * `snapshotFlipRects` captures screen rects BEFORE a mutation;
 * `playFlip` runs synchronously AFTER the DOM has updated (the caller
 * guarantees this with flushSync) and applies WAAPI animations from the
 * inverted delta to identity. Because everything happens in the same
 * task as the mutation — before the browser paints — the first painted
 * frame already carries the starting transform. No flash-then-animate,
 * by construction (docs/05 rule 1).
 *
 * Nested flips compose: a topic row inside a moving card subtracts its
 * card's delta, so cross-card flights read correctly instead of
 * double-translating.
 */

export type RectMap = Map<string, DOMRect>;

export const FLIP_MS = 350;
export const ENTER_MS = 250;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function snapshotFlipRects(): RectMap {
  const map: RectMap = new Map();
  for (const el of document.querySelectorAll<HTMLElement>("[data-flip-id]")) {
    const id = el.dataset.flipId;
    if (id) map.set(id, el.getBoundingClientRect());
  }
  return map;
}

/**
 * Animate every flip element from its `before` rect to its current one.
 * `scale` is the canvas zoom — rect deltas are screen-space, transforms
 * apply in (scaled) local space.
 */
export function playFlip(before: RectMap, scale: number): void {
  if (prefersReducedMotion()) return;
  const s = scale || 1;

  // Pass 1: cards — collect their deltas so rows can subtract them.
  const cardDelta = new Map<HTMLElement, { dx: number; dy: number }>();
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-flip-id]"));

  for (const el of els) {
    const id = el.dataset.flipId!;
    if (!id.startsWith("card:")) continue;
    const prev = before.get(id);
    if (!prev) {
      // new card → entrance
      el.animate(
        [
          { opacity: 0, transform: "scale(0.96)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: ENTER_MS, easing: "ease-out" },
      );
      continue;
    }
    const next = el.getBoundingClientRect();
    const dx = (prev.left - next.left) / s;
    const dy = (prev.top - next.top) / s;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    cardDelta.set(el, { dx, dy });
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
      duration: FLIP_MS,
      easing: EASE_OUT,
    });
  }

  // Pass 2: topic rows — deltas relative to their (possibly moving) card.
  for (const el of els) {
    const id = el.dataset.flipId!;
    if (!id.startsWith("topic:")) continue;
    const card = el.closest<HTMLElement>('[data-flip-id^="card:"]');
    const prev = before.get(id);
    if (!prev) {
      // Row newly visible. Skip the fade when its whole card is entering
      // (the card's entrance already covers it).
      const cardIsNew = card ? !before.has(card.dataset.flipId!) : false;
      if (!cardIsNew) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: ENTER_MS,
          easing: "ease-out",
        });
      }
      continue;
    }
    const next = el.getBoundingClientRect();
    const ancestor = card ? (cardDelta.get(card) ?? { dx: 0, dy: 0 }) : { dx: 0, dy: 0 };
    const dx = (prev.left - next.left) / s - ancestor.dx;
    const dy = (prev.top - next.top) / s - ancestor.dy;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
      duration: FLIP_MS,
      easing: EASE_OUT,
    });
  }
}
