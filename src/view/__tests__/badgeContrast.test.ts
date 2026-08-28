/**
 * badgeContrast.test.ts — computed contrast for every chrome numeral.
 *
 * The carried Impeccable finding was white-on-hue order badges at
 * 3.7:1 (blue) and 2.3:1 (green) — detector receipts, two critiques
 * running. The fix is dark-on-tint; this test is what "fixed" MEANS:
 * every numeral ≥ 4.5:1 against the exact fill it renders on, computed
 * here rather than eyeballed, for the full 12-hue palette plus orphan
 * — not just the hues the reference corpus happens to use.
 */

import { describe, expect, it } from "vitest";
import { ORPHAN_COLOR, SECTION_COLORS } from "@/model/palette";
import { contrastRatio, flattenOverWhite } from "../contrast";
import { BADGE_NUMERAL, badgeFill, badgeNumeral } from "../canvas/badgeColors";
import { LEVEL_CHIPS, LEVEL_CHIP_ALPHA } from "../canvas/SectionCard";

describe("order badges", () => {
  it("has a numeral for every palette hue and the orphan", () => {
    for (const color of [...SECTION_COLORS, ORPHAN_COLOR]) {
      expect(BADGE_NUMERAL[color.name], `numeral for ${color.name}`).toBeDefined();
    }
  });

  it.each([...SECTION_COLORS, ORPHAN_COLOR].map((c) => [c.name, c] as const))(
    "renders ≥ 4.5:1 on %s",
    (_name, color) => {
      const ratio = contrastRatio(badgeNumeral(color), badgeFill(color));
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("still answers for a card with no palette entry", () => {
    expect(
      contrastRatio(badgeNumeral(undefined), badgeFill(undefined)),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe("card header ink (docs/05, dated amendment 2026-08-18)", () => {
  // The card title, count pill and card glyph render badgeNumeral, not
  // palette `text` — five of the twelve `text` shades sit at 3.1–4.4:1
  // on their own tints. The ink must hold on BOTH fills it renders on.
  it.each([...SECTION_COLORS, ORPHAN_COLOR].map((c) => [c.name, c] as const))(
    "%s ink reads ≥ 4.5:1 on the header tint and on white",
    (_name, color) => {
      const ink = badgeNumeral(color);
      expect(contrastRatio(ink, color.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(ink, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("level chips", () => {
  it.each(LEVEL_CHIPS.map((c, i) => [i + 1, c] as const))(
    "L%i text reads ≥ 4.5:1 on its composited tint",
    (_level, chip) => {
      // The fill the user SEES is the tint at its alpha over the white
      // card, not the tint's own hex — measure the painted color.
      const painted = flattenOverWhite(chip.tint, LEVEL_CHIP_ALPHA);
      expect(contrastRatio(chip.text, painted)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("the warning token", () => {
  it("holds ≥ 4.5:1 on white, so it works as text and as a glyph", () => {
    // --color-warning in index.css; the error tier's color (locks.ts).
    expect(contrastRatio("#b45309", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the intent token (docs/05, dated amendment 2026-08-19)", () => {
  // A THIRD tone, authorized at gate 1 (R2). The tier-membership test
  // puts an aspirational move embarrassingly close to the error tier —
  // it DOES mean something in the files should change — so the split is
  // carried by the two-sentence test instead: "the warning token marks a
  // FAULT in the corpus" / "the intent token marks a MOVE AWAITING YOUR
  // HAND". Painting an intention in the fault's tone would spend the
  // error tier's jump, which is the same economy that keeps six lock
  // kinds monochrome.
  const INTENT = "#6d28d9"; // --color-intent, index.css

  it("reads ≥ 4.5:1 on white — the card body the rows sit on", () => {
    expect(contrastRatio(INTENT, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it.each([...SECTION_COLORS, ORPHAN_COLOR].map((c) => [c.name, c] as const))(
    "reads ≥ 4.5:1 on the %s tint too",
    (_name, color) => {
      // Asserted on every hue rather than on the ones a corpus happens
      // to use: a badge that only fails on lime is a badge that fails
      // for one user and nobody else.
      expect(contrastRatio(INTENT, color.bg)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("is a different HUE from the warning token, not a shade of it", () => {
    // Two severities of one thing is exactly the reading the split
    // exists to prevent. Distinguishable by hue, never by lightness
    // alone — the same rule the seven lock glyphs follow by silhouette.
    expect(contrastRatio(INTENT, "#b45309")).toBeLessThan(2);
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r!, g!, b!);
      const min = Math.min(r!, g!, b!);
      if (max === min) return 0;
      const d = max - min;
      const h =
        max === r!
          ? (g! - b!) / d + (g! < b! ? 6 : 0)
          : max === g!
            ? (b! - r!) / d + 2
            : (r! - g!) / d + 4;
      return h * 60;
    };
    expect(Math.abs(hue(INTENT) - hue("#b45309"))).toBeGreaterThan(60);
  });
});
