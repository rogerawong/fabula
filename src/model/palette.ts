/**
 * palette.ts — The 12-hue section palette (normative — see
 * docs/05-interaction-and-ui.md, "do not refresh").
 *
 * Assignment is derived, not stored: regular sections take palette slots
 * round-robin in document order; orphan cards use the neutral fallback
 * and don't consume a slot.
 */

import type { SectionId, TocDocument } from "./types";

export interface SectionColor {
  name: string;
  border: string;
  bg: string;
  text: string;
}

export const SECTION_COLORS: readonly SectionColor[] = [
  { name: "blue", border: "#3b82f6", bg: "#eff6ff", text: "#2563eb" },
  { name: "green", border: "#22c55e", bg: "#f0fdf4", text: "#16a34a" },
  { name: "teal", border: "#14b8a6", bg: "#f0fdfa", text: "#0d9488" },
  { name: "orange", border: "#f59e0b", bg: "#fffbeb", text: "#d97706" },
  { name: "red", border: "#ef4444", bg: "#fef2f2", text: "#dc2626" },
  { name: "indigo", border: "#6366f1", bg: "#eef2ff", text: "#4f46e5" },
  { name: "pink", border: "#ec4899", bg: "#fdf2f8", text: "#db2777" },
  { name: "purple", border: "#a855f7", bg: "#faf5ff", text: "#9333ea" },
  { name: "lime", border: "#84cc16", bg: "#f7fee7", text: "#65a30d" },
  { name: "amber", border: "#d97706", bg: "#fffbeb", text: "#b45309" },
  { name: "cyan", border: "#06b6d4", bg: "#ecfeff", text: "#0891b2" },
  { name: "slate", border: "#64748b", bg: "#f8fafc", text: "#475569" },
];

export const ORPHAN_COLOR: SectionColor = {
  name: "neutral",
  border: "#9ca3af",
  bg: "#f3f4f6",
  text: "#6b7280",
};

/** Palette color per section id (orphans map to the neutral fallback). */
export function sectionColorMap(doc: TocDocument): Map<SectionId, SectionColor> {
  const map = new Map<SectionId, SectionColor>();
  let slot = 0;
  for (const s of doc.sections) {
    if (s.isOrphan) {
      map.set(s.id, ORPHAN_COLOR);
    } else {
      // Length is a non-empty constant; the modulo access always hits.
      map.set(s.id, SECTION_COLORS[slot % SECTION_COLORS.length] as SectionColor);
      slot++;
    }
  }
  return map;
}
