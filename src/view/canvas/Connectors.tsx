/**
 * Connectors.tsx — Sequence badges + connector lines tracing reading
 * order (docs/02 §2, docs/05).
 *
 * Badges are NODES ON THE PATH (metro-map geometry, docs/05): a solid
 * circle in the section color, centered on the card's top edge.
 * Same-column connectors run port-to-port: bottom-center of card n
 * into the top of card n+1's badge, vertical tangents. Cross-column
 * connectors run EDGE TO EDGE: out of the side edge facing the
 * next card, into the next card's near edge just below its top —
 * both attachment points visible, so the hand-off between columns
 * reads at a glance. (Bottom-center exits doubled back under tall
 * cards; center entries vanished behind the card.) Order = cards
 * array order, which positionCards emits in column-flat (reading)
 * order.
 */

import { memo } from "react";
import type { CanvasLayout } from "@/layout/positions";
import type { SectionColor } from "@/model/palette";
import type { SectionId } from "@/model/types";
import { badgeFill, badgeNumeral } from "./badgeColors";

const BADGE_R = 12;

function path(
  a: CanvasLayout["cards"][number],
  b: CanvasLayout["cards"][number],
): string {
  // port in: top of b's badge (always)
  const x2 = b.x + b.width / 2;
  const y2 = b.y - BADGE_R;

  if (a.x === b.x) {
    // same column: bottom-center of a straight down into the badge
    const x1 = a.x + a.width / 2;
    const y1 = a.y + a.height;
    if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const reach = Math.max(28, Math.min(96, Math.hypot(x2 - x1, y2 - y1) / 3));
    return `M ${x1} ${y1} C ${x1} ${y1 + reach}, ${x2} ${y2 - reach}, ${x2} ${y2}`;
  }

  // cross-column: side edge of a → near edge of b, just below b's top
  const rightward = b.x > a.x;
  const xOut = rightward ? a.x + a.width : a.x;
  const xIn = rightward ? b.x : b.x + b.width;
  const yIn = Math.min(b.y + 24, b.y + b.height - 20);
  const yOut = Math.min(Math.max(yIn, a.y + 20), a.y + a.height - 20);
  // tangent reach: the horizontal gap carries most of it, with a mild
  // vertical contribution so tall hops keep a visible sweep — capped
  // below the gutter-invading sizes that pure distance scaling gave
  const reach = Math.max(
    20,
    Math.min(64, Math.abs(xIn - xOut) / 2 + Math.abs(yIn - yOut) / 10),
  );
  const out = rightward ? reach : -reach;
  // horizontal tangents both ends — the line leaves one edge and
  // arrives at the other, never diving behind a card
  return `M ${xOut} ${yOut} C ${xOut + out} ${yOut}, ${xIn - out} ${yIn}, ${xIn} ${yIn}`;
}

export const Connectors = memo(function Connectors({
  layout,
  colors,
}: {
  layout: CanvasLayout;
  colors: Map<SectionId, SectionColor>;
}) {
  const { cards, totalWidth, totalHeight } = layout;
  if (cards.length === 0) return null;

  return (
    <>
      <svg
        className="pointer-events-none absolute left-0 top-0 overflow-visible"
        width={totalWidth}
        height={totalHeight}
        aria-hidden="true"
      >
        {cards.slice(0, -1).map((card, i) => (
          <path
            key={card.sectionId}
            d={path(card, cards[i + 1]!)}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        ))}
      </svg>
      {cards.map((card, i) => {
        const color = colors.get(card.sectionId);
        return (
          <div
            key={card.sectionId}
            aria-hidden="true"
            // z-10: badges straddle card borders and must paint OVER the
            // cards (which are later siblings) — connectors stay under
            className="pointer-events-none absolute z-10 flex items-center justify-center rounded-full text-chrome font-semibold"
            style={{
              left: card.x + card.width / 2 - BADGE_R,
              top: card.y - BADGE_R,
              width: BADGE_R * 2,
              height: BADGE_R * 2,
              // Dark-on-tint (the L-chips' move): the numeral carries the
              // reading, the ring and halo keep the hue identity. White-
              // on-hue measured 3.7:1 on blue and 2.3:1 on green — the
              // carried detector finding this closes. Numerals are unit-
              // asserted ≥ 4.5:1 on this fill (badgeContrast.test.ts).
              backgroundColor: badgeFill(color),
              color: badgeNumeral(color),
              boxShadow: `inset 0 0 0 1.5px ${color?.border ?? "#9ca3af"}, 0 0 0 2px #ffffff, 0 0 0 6px ${color?.border ?? "#9ca3af"}33`,
            }}
          >
            {i + 1}
          </div>
        );
      })}
    </>
  );
});
