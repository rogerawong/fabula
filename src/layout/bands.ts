/**
 * bands.ts — Which container each column belongs to (docs/13 v2).
 *
 * In reparent-world a container is a drop target, so it has to be
 * visible when the canvas is tidy. A band is claimed only over a column
 * whose cards all share one container: cards are freely positioned, and
 * a band spanning a mixed column would be a lie about where a drop
 * lands. That is also why containers are drawn as lanes rather than as
 * hulls around their cards — a hull on a freeform layout either overlaps
 * its neighbours or excludes its own members.
 */

import { containerFor } from "@/model/containers";
import { chainKey } from "@/model/selectors";
import type { SectionId, TocDocument } from "@/model/types";

/** The container label per column, or null where a column has no single one. */
export function columnBands(
  doc: TocDocument,
  columns: readonly (readonly SectionId[])[],
): (string | null)[] {
  if (!doc.containers || doc.containers.length === 0) {
    return columns.map(() => null);
  }
  const byId = new Map(doc.sections.map((s) => [s.id, s]));
  return columns.map((column) => {
    const keys = new Set(
      column.map((id) => {
        const section = byId.get(id);
        return section ? chainKey(section) : null;
      }),
    );
    if (keys.size !== 1) return null;
    const only = [...keys][0];
    if (only === null || only === undefined) return null;
    return containerFor(doc, only)?.label ?? null;
  });
}
