/**
 * lockGlyphs.ts — the lock legend's view half: one mark per kind.
 *
 * Seven kinds, seven SHAPES — distinguishable by silhouette, never by
 * color alone, and chosen to still classify at 50% canvas zoom (the
 * zoom trial is part of the design; a shape that fails it gets fixed
 * here, not excused). The words live in src/model/locks.ts; this table
 * only says what the mark looks like. Keyed on LockKind, so an eighth
 * kind fails `pnpm check` here until it gets a shape.
 *
 * Each entry quotes its kind's promise from the docs/19 table — the
 * shape is chosen to draw that promise, and a reader questioning a
 * mark starts from the sentence it stands for.
 */

import {
  ArrowUpRight,
  Asterisk,
  Braces,
  Layers,
  Pilcrow,
  Pin,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { LockKind } from "@/model/types";

export const LOCK_GLYPH: Record<LockKind, LucideIcon> = {
  // "I did not descend; this subtree is N deep" — about SIZE. A stack:
  // folded layers riding behind one row. Never a chevron, which would
  // invite a click that cannot work.
  atomic: Layers,
  // "this is a second listing; another is primary" — about IDENTITY.
  // A pin: this copy stays put.
  reference: Pin,
  // "this line is a pattern, not a docname" — about SYNTAX. The glob
  // character itself.
  pattern: Asterisk,
  // block lock worn by the line: the entry list is GENERATED, so no
  // line in it is editable. Braces: template, not content — and a
  // different silhouette from the asterisk it was once conflated with.
  globbed: Braces,
  // "the block is fine; its POSITION is the problem" — prose follows
  // it. A pilcrow: the paragraph mark IS the reason.
  "outside-region": Pilcrow,
  // "this target is outside the project" — about TARGET. The outbound
  // arrow, alone — the boxed variant muddies at 50%.
  external: ArrowUpRight,
  // "this target does not exist" — about TARGET, and the only kind
  // that is a FAULT rather than a decision: the error tier's triangle,
  // in the warning token (tier test: src/model/locks.ts).
  missing: TriangleAlert,
};
