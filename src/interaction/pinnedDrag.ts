/**
 * pinnedDrag.ts — the pinned drag's rule and its voice (docs/21,
 * Decision 9).
 *
 * A pin is a WRITE permission, and it used to wear a thinking
 * restriction's clothes: `topicDrag.ts` declined to start a drag on a
 * pinned row at all, silently, the one drag surface in the app that
 * refused without a sentence. Arc 2 gives each its own clothes. The pin
 * keeps absolute authority over what is WRITTEN — no byte this app
 * emits can encode a displaced pinned row (the applyable projection, and
 * the adapters' own refusals underneath it) — and loses its authority
 * over what may be IMAGINED, provided the imagining is labeled.
 *
 * THE GESTURE'S CONSENT LIVES IN THE TAB STATE, and this file is where
 * that is read. Three facts, three homes (Decision 7): the run MODE is
 * immutable provenance about one call, the LEDGER is what the apply
 * surfaces read, and the tab STATE is what a gesture asks. None of the
 * three is derivable from another, and a helper taking
 * `aspirational: boolean` without saying WHICH aspirational is the
 * conflation this project pays for — so the gate takes the tab's own
 * two optional fields and nothing that could be mistaken for a mode.
 *
 * PURE, and separate from the pointer handler, for the reason
 * `moveLabel.ts` gives: vitest runs in node, so a rule living inside a
 * drag handler is a rule only e2e can check.
 *
 * NOTHING FORMAT-SHAPED reaches this file — the fence in
 * `aspirationalFences.test.ts` says so on the construction. Its inputs
 * are a document, a selection, a target and the tab's two fields.
 */

import { isPinned, LOCK_LABEL } from "@/model/locks";
import type { TocDocument, Topic } from "@/model/types";
import { placementOf } from "@/commands/guards";
import { locateTopicInDocument } from "@/model/tree";

/** Where a drop would land, in `guards.ts`' own shape. `null` is the
 *  empty-canvas drop — a new parent by definition. */
export interface MoveTarget {
  sectionId: string;
  parentTopicId: string | null;
}

/**
 * The tab facts a gesture may consult — the STATE, and only the state.
 *
 * Structurally typed against `TabState`'s two optional fields rather
 * than importing the store: the rule is about consent, not about where
 * consent is stored, and a signature naming `TabState` would invite the
 * run mode in beside it.
 */
export interface TabConsent {
  aspirational?: true;
  seamDeclined?: true;
}

export type PinnedGateVerdict = "commit" | "seam" | "refuse";

/**
 * WHY THIS DROP NEEDS CONSENT — the two causes, in one value
 * (docs/22, Decision 7).
 *
 * TWO CAUSES, ONE GATE, because there is ONE consent (OR-3): the tab's
 * `aspirational` state licenses "arrangements the app cannot write,
 * labeled", of every kind. A second gate would put a second
 * indistinguishable toggle on the tab and force the seam to say which
 * kind of imagination it was asking about. What the causes DO differ in
 * is the sentence, which is why they arrive here as two named fields
 * rather than as one boolean somebody would have to decode.
 */
export interface SeamCause {
  /** Rows in this move the SOURCE pins — docs/21's original cause. */
  pinnedCount: number;
  /**
   * This drop MAKES structure the write path cannot record: a card on a
   * `createCards: false` document.
   *
   * A BOOLEAN AND NOT A COUNT, deliberately — one gesture births one
   * card, and a count of one is the degenerate case of a measurement
   * nobody took.
   */
  creates: boolean;
}

/**
 * Which rows in this move are pinned AND would change parent.
 *
 * PARENT CHANGE ONLY, the same scope as the validator's net and the
 * executor's recorder. A within-parent reorder of a pinned row is not a
 * displacement: it writes no record, and the seam's opening claim — "the
 * app can't write it" — would be false for it. The Sphinx frozen-block
 * case, where a reorder really cannot be written, is Decision 8's
 * plan-time surface and not this one's.
 *
 * Rows the document does not contain are skipped rather than assumed
 * moved: a guard consumes DECLARED inputs.
 */
export function pinnedInMove(
  doc: TocDocument,
  topicIds: readonly string[],
  to: MoveTarget | null,
): Topic[] {
  const out: Topic[] = [];
  for (const id of topicIds) {
    const at = placementOf(doc, id);
    if (!at) continue;
    if (
      to !== null &&
      at.sectionId === to.sectionId &&
      at.parentTopicId === to.parentTopicId
    ) {
      continue;
    }
    const row = locateTopicInDocument(doc, id)?.topic;
    if (row && isPinned(row)) out.push(row);
  }
  return out;
}

/**
 * What this tab's state says about a drop that would displace pinned
 * rows.
 *
 * The state machine, whole:
 * - nothing pinned in the move → `commit`, whatever the state. The seam
 *   is not a thing that happens to every drag on an unasked tab.
 * - Aspirational → `commit`, badged. Consent was given once, for the
 *   tab; re-asking per move would be the forty-modals failure docs/16
 *   measured.
 * - Grounded-DECLINED → `refuse`, with a sentence naming the escape
 *   hatch. Sticky by ruling: "no" answered the MODE, not the move.
 * - Grounded-UNASKED → `seam`.
 *
 * Aspirational is tested BEFORE the decline although the store clears
 * `seamDeclined` when it turns a tab Aspirational, so the pair cannot
 * occur. A predicate that depends on its caller having tidied up is a
 * predicate that is wrong the day someone doesn't.
 */
export function consentGate(consent: TabConsent, cause: SeamCause): PinnedGateVerdict {
  if (cause.pinnedCount === 0 && !cause.creates) return "commit";
  if (consent.aspirational) return "commit";
  if (consent.seamDeclined) return "refuse";
  return "seam";
}

/** The pinned-only costume, for the many callers that ask about rows.
 *  Never a second opinion — derived from the one gate. */
export function pinnedGate(consent: TabConsent, pinnedCount: number): PinnedGateVerdict {
  return consentGate(consent, { pinnedCount, creates: false });
}

/**
 * The consequence, at the pointer, before release (docs/16's pattern).
 *
 * Its own line rather than an appendix to `moveLabel`'s destination: a
 * truncation wrapper owns SINGLE-LINE TEXT ONLY, and a file-relocating
 * drop of a pinned row genuinely has two things to say.
 *
 * NAMES THE KIND for one row, COUNTS for several — the same economy as
 * the ghost's own label. Seven kinds listed at a pointer would be a
 * paragraph nobody reads mid-gesture; the badge and the checklist carry
 * the per-kind detail where there is room for it.
 */
export function pinnedDropConsequence(rows: readonly Topic[]): string | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) {
    const kind = rows[0]!.lock?.kind;
    const label = kind ? ` (${LOCK_LABEL[kind].toLowerCase()})` : "";
    return `→ needs your hand — pinned${label}`;
  }
  return `→ ${rows.length} rows need your hand — pinned`;
}

/**
 * The Grounded-declined refusal, through the existing refusal channel
 * (`dragStore.refusal` → the red pointer sentence the reparent refusals
 * already use).
 *
 * NAMES THE ESCAPE HATCH, per the ruling: a sticky decline that only
 * stated a wall would read as breakage, and the way out is one menu
 * away.
 */
export function pinnedRefusalSentence(): string {
  return "Pinned rows stay put while this tab is Grounded — switch the tab to Aspirational to move them (tab menu).";
}

/**
 * The declined refusal for whichever cause this drop carries
 * (docs/22, Decision 7).
 *
 * PER CAUSE, because the two walls are about different things and a
 * sentence about pinned rows told to someone dragging out a new card is
 * a sentence they cannot act on. Both name the escape hatch, per the
 * ruling — a sticky decline that only stated a wall would read as
 * breakage.
 *
 * THE PIN LEADS WHERE BOTH ARE PRESENT: it is the fact about the SOURCE,
 * which is the one the user did not choose and cannot see coming.
 */
export function seamRefusalSentence(cause: SeamCause): string {
  if (cause.pinnedCount > 0) return pinnedRefusalSentence();
  return "New cards stay unmade while this tab is Grounded — switch the tab to Aspirational to imagine one (tab menu).";
}

export interface SeamOption {
  label: string;
  detail: string;
}

export interface SeamCopy {
  headline: string;
  proceed: SeamOption;
  decline: SeamOption;
}

/**
 * The seam's words (docs/21, Decision 9, quoted).
 *
 * A MODE CHOICE, NEVER A MOVE CONFIRMATION. A "confirm move?" dialog
 * would read as authorization and there is nothing to authorize — the
 * move is thought, not action. So both options are sentences about the
 * TAB.
 *
 * IT STATES THE SPLIT, NEVER A VANISHING. "No guarantee anything writes
 * back" is the opposite lie and is ruled out: the tab keeps full
 * verification on its applyable part, and copy implying otherwise would
 * spend the product's honesty to dramatize a boundary.
 *
 * ONE SEAM FOR THE SET, COUNTING. The gesture is one gesture; per-row
 * seams would be the modal-per-move failure again. And the multi-row
 * decline says the whole drop is off, because "the row stays put" is
 * false about the four unpinned rows travelling with it.
 *
 * CAUSE-NAMED (docs/22, Decision 7). The seam has a second producer now
 * — a drop that MAKES structure the format cannot record — and the two
 * sentences are different because the two facts are: one is about a row
 * the source owns, the other about the shape of the file. The pinned
 * branch below is docs/21's ruled words, unchanged to the byte, because
 * the first seam did not move.
 */
export function seamCopy(
  cause: SeamCause,
  movingCount: number,
  /**
   * What a card IS in this system — "toctree block" (docs/22's
   * `StructuralCopy` noun, one producer, declared by the adapter).
   *
   * COPY ONLY, NEVER BEHAVIOR, and ABSENT IS ANSWERED: an adapter that
   * names no noun gets a sentence that is still true rather than one
   * with a hole in it. A guard consumes declared inputs, applied to
   * copy.
   */
  cardNoun?: string,
): SeamCopy {
  const single = movingCount === 1;
  const pinnedPart = single
    ? "includes a pinned row"
    : `includes ${cause.pinnedCount} pinned rows of the ${movingCount} moving`;
  const cardsAre = cardNoun
    ? ` — here, cards are ${cardNoun}s,`
    : " — here, the navigation cannot record one,";

  if (cause.creates) {
    return {
      // BOTH FACTS, WHERE BOTH ARE PRESENT (Decision 7's interaction
      // fact): a pinned row may seed a creation only through the seam,
      // and the copy names both counts because one consent answers for
      // both. Naming only the creation would let a user agree to a card
      // without being told a pin travelled with it.
      headline:
        cause.pinnedCount > 0
          ? `This creates a card${cardsAre} and it ${pinnedPart} — the app can't write either.`
          : `This creates a card${cardsAre} and the app can't write a new one.`,
      proceed: {
        label: "Switch this tab to Aspirational and make it",
        detail:
          "The card is labeled for your hands; everything else stays writable and verified as normal.",
      },
      decline: {
        label: "Keep this tab Grounded",
        detail: "Nothing changes. You can switch later from the tab menu.",
      },
    };
  }

  return {
    headline: single
      ? "This move includes a pinned row — the app can't write it."
      : `${cause.pinnedCount} of the ${movingCount} rows in this move are pinned — the app can't write those moves.`,
    proceed: {
      label: "Switch this tab to Aspirational and make the move",
      detail:
        "Pinned moves are labeled for your hands; everything else stays writable and verified as normal.",
    },
    decline: {
      label: "Keep this tab Grounded",
      detail: single
        ? "The row stays put. You can switch later from the tab menu."
        : "Nothing moves. You can switch later from the tab menu.",
    },
  };
}
