/**
 * badgeColors.ts — dark-on-tint numerals for the order badges.
 *
 * The 12-hue palette is normative and does not change (palette.ts, "do
 * not refresh") — but its `text` shades were picked for 14px card
 * titles on the card tint and several sit near 3:1, and the badges'
 * old white-on-hue numerals measured 3.7:1 on blue and 2.3:1 on green
 * (detector receipts, two critiques running). So the badge derives a
 * DARKER numeral per hue, same family, on the palette's own `bg` tint:
 * the hue identity stays in the border ring and halo, the number
 * becomes readable. Every entry is unit-asserted ≥ 4.5:1 against its
 * `bg` (badgeContrast.test.ts) — add a palette hue and the test names
 * the numeral you owe.
 */

import { ORPHAN_COLOR, SECTION_COLORS, type SectionColor } from "@/model/palette";

/** Numeral color per palette hue name, keyed to SECTION_COLORS. */
export const BADGE_NUMERAL: Record<string, string> = {
  blue: "#1e40af",
  green: "#166534",
  teal: "#115e59",
  orange: "#92400e",
  red: "#991b1b",
  indigo: "#3730a3",
  pink: "#9d174d",
  purple: "#6b21a8",
  lime: "#3f6212",
  amber: "#78350f",
  cyan: "#155e75",
  slate: "#1e293b",
  [ORPHAN_COLOR.name]: "#374151",
};

/** The badge's numeral for a section color (orphan fallback included). */
export function badgeNumeral(color: SectionColor | undefined): string {
  return BADGE_NUMERAL[(color ?? ORPHAN_COLOR).name] ?? "#1e293b";
}

/** The badge's fill for a section color. */
export function badgeFill(color: SectionColor | undefined): string {
  return (color ?? ORPHAN_COLOR).bg;
}

// Referenced here so the test can iterate the full palette without a
// side import: every SECTION_COLORS name must appear above.
export const BADGE_HUES: readonly string[] = [
  ...SECTION_COLORS.map((c) => c.name),
  ORPHAN_COLOR.name,
];
