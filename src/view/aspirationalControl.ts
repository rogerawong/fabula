/**
 * aspirationalControl.ts — the deliberate per-tab switch (docs/21,
 * Decision 9 and gate 2's G1).
 *
 * The seam is how a tab usually enters Aspirational; this is the door for
 * everyone else — the user who knows what they want before dragging
 * anything, and the user who declined and changed their mind. The
 * declined refusal's sentence names this control by name, so it is a
 * signpost with a road behind it rather than a dead end.
 *
 * PURE, so both its rules are unit-testable: which label to show and
 * whether the switch back is available are decisions, and a decision
 * living inside a menu component is one only e2e can check.
 *
 * G1: THE SWITCH BACK IS EMPTY LEDGER **AND EMPTY REPORT** (widened by
 * docs/22's OR-3). "Grounded" is a PROMISE — everything here is
 * applyable — and a tab holding displacements cannot make it. Neither
 * can one holding a card the write path cannot record: the promise is
 * about the ARRANGEMENT, and both kinds of remainder are facts about it.
 * Offering the switch anyway would mint a third de-facto state,
 * "Grounded with remainders", that nothing in the design defines.
 *
 * So while either remains the control is disabled WITH A REASON, and the
 * reason NAMES BOTH WAYS BACK: Put back for a displaced row, and for an
 * imagined card, deleting it or re-homing its rows. A reason naming only
 * the first would send a user hunting for a badge that is not there.
 *
 * READS THE LEDGER, NEVER GATES A WRITE WITH IT. The ledger decides
 * whether a STATE CHANGE is offered, which is a fact about the tab's own
 * honesty; nothing here reaches a plan, a checklist or a save.
 */

import { hasPinnedRow } from "@/model/selectors";
import { recordedLedger } from "@/model/ledger";
import type { TabConsent } from "@/interaction/pinnedDrag";
import type { StructuralRemainder } from "@/model/remainders";
import type { TocDocument } from "@/model/types";

export interface AspirationalControl {
  label: string;
  /** The state the control would set — `setTabAspirational`'s argument. */
  next: boolean;
  /** Present ⇒ the control is disabled, and this says why (G1). */
  disabledReason?: string;
}

/**
 * The control for this tab, or null when it should not be shown.
 *
 * SHOWN WHEN THE DOCUMENT HAS ANY PINNED ROW OR THE STATE IS ALREADY
 * NON-DEFAULT — a control that can do nothing for this document is
 * noise. The second clause is not decoration: without it a tab that was
 * switched or declined on a document whose pinned rows have since gone
 * would have no way back to the default.
 */
export function aspirationalControl(
  consent: TabConsent,
  doc: TocDocument,
  /**
   * The structure report for this arrangement (docs/22). ABSENT MEANS
   * NOT MEASURED — a caller with no report gets exactly the shipped
   * behaviour, which is what keeps a format tab (no snapshot, nothing to
   * compare against) out of a state it cannot be in.
   */
  remainders: readonly StructuralRemainder[] = [],
): AspirationalControl | null {
  const nonDefault = consent.aspirational === true || consent.seamDeclined === true;
  if (!nonDefault && !hasPinnedRow(doc)) return null;

  if (!consent.aspirational) {
    // Turning it ON is never gated. It clears the decline too — the
    // decline answered the SEAM, and a deliberate switch supersedes it
    // (the store owns that half).
    return { label: "Make this tab Aspirational", next: true };
  }

  const held = recordedLedger(doc).length;
  const imagined = remainders.length;
  return {
    label: "Make this tab Grounded",
    next: false,
    ...(held > 0 || imagined > 0
      ? { disabledReason: switchBackReason(held, remainders) }
      : {}),
  };
}

/**
 * Why the switch back is unavailable, and what to do about it.
 *
 * COUNTS SPLIT BY KIND, WITH THEIR UNITS — the house rule. "2 things"
 * over one displaced row and one imagined card would name a quantity of
 * nothing in particular, and the two have different remedies.
 *
 * NAMES THE CARD. A remedy that says "delete the imagined card" without
 * saying which one is a remedy the user has to go looking for.
 */
function switchBackReason(
  held: number,
  remainders: readonly StructuralRemainder[],
): string {
  const parts: string[] = [];
  const ways: string[] = [];
  if (held > 0) {
    parts.push(`${held} imagined move${held === 1 ? "" : "s"}`);
    ways.push(
      held === 1
        ? "Put back the row — the badge beside it"
        : "Put back those rows — the badge beside each",
    );
  }
  const created = remainders.filter((r) => r.kind === "creation");
  if (created.length > 0) {
    parts.push(`${created.length} imagined card${created.length === 1 ? "" : "s"}`);
    const named = created
      .map((r) => `"${(r as { title: string }).title}"`)
      .slice(0, 2)
      .join(" and ");
    ways.push(`delete ${named} or re-home its rows`);
  }
  const others = remainders.length - created.length;
  if (others > 0) {
    parts.push(`${others} imagined order${others === 1 ? "" : "s"}`);
    ways.push("put the affected cards and rows back where the source has them");
  }
  return (
    `This tab holds ${parts.join(" and ")}. ` +
    `${ways.join("; ")} — and this tab can be Grounded again.`
  );
}
