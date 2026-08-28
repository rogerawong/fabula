/**
 * rowMenu.ts — which row-menu commands a selection may have, and why not
 * (docs/21, arc 2).
 *
 * PURE, so the rule is unit-testable: a rule living inside a menu
 * component is a rule only e2e can check (the `moveLabel.ts` precedent).
 *
 * Both answers come from predicates that already exist — `anyTopicLocked`
 * is the one `useKeyboard.ts` uses for the same question, and
 * `topicMoveRefusal` is THE move discriminant. Nothing here re-derives a
 * rule; this file only decides which of the two a menu item owes and
 * supplies the deletion sentence, which had no home because until now
 * the deletion refusal was silent everywhere.
 */

import { refusalSentence, type RefusalContext } from "@/interaction/moveLabel";
import { resolveBirth } from "@/model/bearing";
import { topicMoveRefusal } from "@/commands/guards";
import { anyTopicLocked } from "@/model/selectors";
import { locateTopicInDocument } from "@/model/tree";
import type { TocDocument } from "@/model/types";

export interface RowMenuRefusals {
  /** Present ⇒ Remove is disabled, and this says why. */
  remove?: string;
  /** Present ⇒ Move to new card is disabled, and this says why. */
  moveToNewCard?: string;
}

export function rowMenuRefusals(
  doc: TocDocument,
  topicIds: readonly string[],
  /**
   * WHERE the new card would land (docs/22, Decision 2) — the column it
   * joins and its index in it.
   *
   * The menu computes this position anyway, to dispatch with; passing it
   * to the question as well is what keeps the menu from offering a birth
   * the executor refuses, which is the shape that once let the sidebar
   * commit the move the canvas would not. Absent means the home question
   * is skipped rather than guessed.
   */
  birthAt?: { columnIds: readonly string[]; cardIndex: number },
): RowMenuRefusals {
  const out: RowMenuRefusals = {};

  // DELETION IS NOT DISPLACEMENT. The seam licenses imagination about
  // PLACEMENT; `Topic.lock`'s contract still says a pinned node cannot
  // be deleted, and `useKeyboard.ts` enforces the same rule on the same
  // predicate. The whole gesture is refused rather than narrowed to the
  // unpinned rows: a partial delete is a silent downgrade.
  if (anyTopicLocked(doc, topicIds)) {
    out.remove =
      topicIds.length === 1
        ? "This row is pinned by its source, so it can't be deleted here."
        : "One of these rows is pinned by its source, so they can't be deleted here.";
  }

  // THE ONE DISCRIMINANT, asked exactly as the executor asks it — same
  // arguments, including the single row's title, so the menu cannot
  // offer what the command would refuse.
  const single =
    topicIds.length === 1
      ? locateTopicInDocument(doc, topicIds[0]!)?.topic.title
      : undefined;
  const reason = topicMoveRefusal(doc, topicIds, null, single, birthAt);
  if (reason !== null) {
    out.moveToNewCard = refusalSentence(reason, birthContext(doc, topicIds, birthAt));
  }

  return out;
}

/**
 * The values the unhoused-species sentence names, or undefined for every
 * other reason.
 *
 * The same composition `topicDrag.ts` performs at the pointer — one
 * sentence with one set of inputs, so the menu and the drag cannot name
 * different homes for the same drop.
 */
function birthContext(
  doc: TocDocument,
  topicIds: readonly string[],
  birthAt: { columnIds: readonly string[]; cardIndex: number } | undefined,
): RefusalContext | undefined {
  if (!birthAt) return undefined;
  const moving = topicIds
    .map((id) => locateTopicInDocument(doc, id)?.topic)
    .filter((t) => t !== undefined);
  const { chain } = resolveBirth(
    doc,
    birthAt.columnIds,
    birthAt.cardIndex,
    moving.map((t) => ({
      childless: t.children.length === 0,
      pinned: t.lock !== undefined,
    })),
  );
  return {
    doc,
    chain,
    wants:
      moving.length === 1 && moving[0]!.children.length === 0 ? "standalone" : "section",
  };
}
