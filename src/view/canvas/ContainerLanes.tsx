/**
 * ContainerLanes.tsx — Container lanes and their label bands (docs/13 v2).
 *
 * A container has no card of its own, so before v2 it was visible only
 * as a chip on each member card. Now it is a DROP TARGET, and a target
 * you cannot see is one you cannot aim at — the depiction is what the
 * consent model plays on, which is why it ships with reparent rather
 * than after it.
 *
 * A lane is claimed only over a column whose cards all share one
 * container (`columnBands`). Cards are freely positioned, so a band over
 * a mixed column would be a lie about where a drop lands — the same
 * reason containers are drawn as lanes rather than as hulls around their
 * members, which on a freeform layout either overlap their neighbours or
 * exclude their own members.
 */

import { columnBands } from "@/layout/bands";
import type { Columns } from "@/layout/columns";
import { CARD_WIDTH, columnX, PADDING_TOP } from "@/layout/positions";
import { useDragStore } from "@/interaction/dragStore";
import type { TocDocument } from "@/model/types";

const BAND_HEIGHT = 22;

export function ContainerLanes({
  doc,
  columns,
  height,
}: {
  doc: TocDocument;
  columns: Columns;
  height: number;
}) {
  const dragKind = useDragStore((s) => s.kind);
  const target = useDragStore((s) => s.cardTarget);
  const bands = columnBands(doc, columns);
  if (bands.every((band) => band === null)) return null;

  const dragging = dragKind === "card";

  // One band per CONTAINER, not per column: a container wide enough to
  // need eight columns is still one place, and repeating its name over
  // each of them reads as eight containers.
  const runs: { band: string; from: number; to: number }[] = [];
  bands.forEach((band, col) => {
    if (band === null) return;
    const last = runs[runs.length - 1];
    if (last && last.band === band && last.to === col - 1) last.to = col;
    else runs.push({ band, from: col, to: col });
  });

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {runs.map(({ band, from, to }) => {
        // While a card is in flight the lane it would land in comes
        // forward and the rest recede, so the drop reads before release.
        const aimed =
          dragging && target !== null && target.colIndex >= from && target.colIndex <= to;
        return (
          <div
            key={`${band}-${from}`}
            data-testid="container-lane"
            data-container-label={band}
            className={`absolute rounded-lg border transition-opacity ${
              aimed
                ? "border-amber-300 bg-amber-50/50 opacity-100"
                : dragging
                  ? "border-neutral-200 bg-neutral-50/40 opacity-40"
                  : "border-neutral-200 bg-neutral-50/40 opacity-100"
            }`}
            style={{
              left: columnX(from) - 10,
              top: PADDING_TOP - BAND_HEIGHT - 12,
              width: columnX(to) - columnX(from) + CARD_WIDTH + 20,
              height: Math.max(height - PADDING_TOP + BAND_HEIGHT + 24, BAND_HEIGHT),
            }}
          >
            <span
              className={`absolute left-2.5 top-1 truncate text-[11px] font-medium tracking-wide ${
                aimed ? "text-amber-800" : "text-neutral-500"
              }`}
              style={{ maxWidth: CARD_WIDTH }}
            >
              {band}
            </span>
          </div>
        );
      })}
    </div>
  );
}
