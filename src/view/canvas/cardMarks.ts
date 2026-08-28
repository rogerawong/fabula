/**
 * cardMarks.ts — the card-level marks for structure the write path
 * cannot express (docs/22, Decision 5).
 *
 * TWO MARKS, TWO TONES, AND THE TONES ARE THE TIER. The salience economy
 * (docs/19, `model/locks.ts`) asks one question of every mark: does this
 * mean something in the FILES should change?
 *
 * - `created` — no. A card the format cannot record is a boundary of the
 *   app's editing model, not a defect in the corpus. It wears the INTENT
 *   tone (`--color-intent`, docs/21 R2's token) — the same tone the
 *   displaced-row badge uses, because it says the same thing: this is
 *   imagined, and labeled.
 * - `unhoused` — yes. A card with no container that can hold it BLOCKS
 *   the export, and the resolution is either a drag or an edit to the
 *   navigation file. It wears the WARNING tone, and it is the only card
 *   mark that does.
 *
 * Spending the warning tone on the first would cost the second its jump,
 * which is the whole reason the tiers are two.
 *
 * THE MARKS ARE DERIVED, never stored. `created` reads the structure
 * report; `unhoused` reads `unhousedSections` — the same predicate the
 * write path refuses on, so the mark and the refusal cannot disagree
 * about which cards are in trouble.
 *
 * ORDER IS DECIDED HERE, not by the renderer: a card can be both (a
 * created card that also has no home), and the one that BLOCKS is the
 * one worth showing. Two marks on one card would be two competing calls
 * to action for one thing to do.
 */

import { CirclePlus, TriangleAlert, type LucideIcon } from "lucide-react";
import { unhousedSections } from "@/model/containers";
import type { StructuralRemainder } from "@/model/remainders";
import type { SectionId, TocDocument } from "@/model/types";

export type CardMarkKind = "created" | "unhoused";

export interface CardMark {
  kind: CardMarkKind;
  glyph: LucideIcon;
  /** The CSS custom property this tone reads. Never a literal colour:
   *  docs/05's palette and tokens are the single source. */
  tone: string;
  /** Cause → consequence → remedy, the grammar every mark here speaks. */
  tooltip: string;
  testid: string;
}

const CREATED = (title: string, species: "section" | "standalone"): CardMark => ({
  kind: "created",
  glyph: CirclePlus,
  tone: "var(--color-intent)",
  // "STANDALONE ENTRY", never "orphan" (OR-1): a writer did not orphan
  // anything, they placed a page at top level.
  tooltip:
    `"${title}" is imagined as ${species === "standalone" ? "a standalone entry" : "a new card"}. ` +
    "This system's navigation cannot record it, so the app will not write it — " +
    "Review changes lists what would.",
  testid: "card-mark-created",
});

const UNHOUSED = (title: string): CardMark => ({
  kind: "unhoused",
  glyph: TriangleAlert,
  tone: "var(--color-warning)",
  // TWO REMEDIES, in-app first, by-hand second, blaming neither.
  tooltip:
    `"${title}" has no home this navigation file can write. ` +
    "Drag it into a container that holds cards, or add a container for it in the " +
    "file yourself — the app never edits containers.",
  testid: "card-mark-unhoused",
});

/**
 * Every marked card in this arrangement, by section id.
 *
 * COMPUTED ONCE PER ARRANGEMENT rather than per card: both inputs are
 * whole-document questions, and asking them inside a card component
 * would be O(cards²) and would put a document-shaped derivation on a
 * render path that runs during a drag.
 */
export function cardMarks(
  doc: TocDocument,
  remainders: readonly StructuralRemainder[],
): Map<SectionId, CardMark> {
  const out = new Map<SectionId, CardMark>();
  for (const record of remainders) {
    if (record.kind !== "creation") continue;
    out.set(record.sectionId, CREATED(record.title, record.species));
  }
  // LAST WINS, deliberately: a card that is both created and unhoused
  // shows the mark that blocks the export, because that is the one thing
  // to do about it.
  for (const section of unhousedSections(doc)) {
    out.set(section.id, UNHOUSED(section.title));
  }
  return out;
}
