/**
 * contrast.ts — WCAG 2.x contrast arithmetic, pure and DOM-free.
 *
 * Exists so color choices can be ASSERTED instead of eyeballed: the
 * order-badge and level-chip numerals carry unit tests demanding
 * ≥ 4.5:1 against the exact fills they render on (the carried
 * Impeccable finding was white-on-hue at 3.7:1 and 2.3:1 — receipts
 * from the detector, closed this pass). Vitest runs in node; this file
 * is why that is enough.
 */

/** #rgb / #rrggbb → [r, g, b] in 0–255. */
function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** WCAG relative luminance of a hex color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors, ≥ 1. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The color an alpha tint actually PAINTS: `hex` at `alpha` composited
 * over white. Chip fills like `${hue}1a` are this — contrast against
 * the tint's own hex would measure a color nobody sees.
 */
export function flattenOverWhite(hex: string, alpha: number): string {
  const flat = channels(hex).map((c) => Math.round(255 - (255 - c) * alpha));
  return `#${flat.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
