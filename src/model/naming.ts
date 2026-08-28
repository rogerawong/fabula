/**
 * naming.ts — Shared title/name derivation helpers.
 * Used by the model and by format adapters (e.g. deriving display titles
 * for name-less nodes, flagged `titleDerived`).
 */

/** "quick-start" / "quick_start" → "Quick Start" */
export function titleize(stem: string): string {
  return stem.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Derive a human-readable document name from a file name */
export function deriveDocumentName(fileName: string): string {
  return titleize(fileName.replace(/\.ya?ml$/i, ""));
}

/**
 * Derive a display title from a link path, e.g.
 * "guides/quick-start.md" → "Quick Start". Used by adapters for
 * name-less nodes (flagged `titleDerived`).
 */
export function deriveTitleFromPath(path: string): string {
  // Strip trailing slash (directory refs), then take the last segment
  const trimmed = path.replace(/\/+$/, "");
  const base = trimmed.split("/").pop() || trimmed;
  const stem = base.replace(/\.(md|ya?ml|html?)$/i, "");
  if (!stem) return path;
  return titleize(stem);
}

/**
 * The pre-save notice for headings nobody has named (docs/22,
 * Decision 5).
 *
 * A NOTICE, NEVER A REFUSAL. Export writes the text happily — the bytes
 * are legal and the name is merely nobody's — so this exists purely so
 * the fact is said before Save rather than discovered in the file, or
 * worse, by the reviewer who was shown a structure they did not build
 * (PRODUCT.md's third audience).
 *
 * ABSENT WHEN THERE IS NOTHING TO SAY, never "0 sections": not measured
 * ≠ zero, and a clean document gets no line rather than a page of
 * zeroes — the same rule the Overview follows.
 *
 * COUNTS WITH ITS UNIT, because every count in this app does.
 */
export function untitledNotice(doc: {
  sections: readonly { untitled?: true }[];
}): string | null {
  const n = doc.sections.filter((s) => s.untitled === true).length;
  if (n === 0) return null;
  return n === 1
    ? "1 section still has a placeholder name"
    : `${n} sections still have a placeholder name`;
}
