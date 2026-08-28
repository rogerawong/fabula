/**
 * reviewHeadline.ts — Review's status line, as one decision.
 *
 * ONE HEADLINE, FOUR STATES, NONE CONTRADICTING ANOTHER. The line used to
 * be a chain of ternaries in the dialog, ordered emptiness-first, and
 * that ordering shipped a lie: an empty plan plus a blocking warning
 * rendered *"The canvas matches the imported files — there is nothing to
 * save"* directly above a red warning saying the plan had been refused
 * (docs/10's oracle log, 2026-08-19 — the model created four cards on a
 * system that writes none).
 *
 * Both sentences were true of their own variable. The plan really was
 * empty; the canvas really did not match. What made them jointly a lie is
 * that an empty plan means "nothing to do" only when nothing was
 * REFUSED — so the refusal has to speak first.
 *
 * BLOCKED OUTRANKS EVERYTHING, including the ledgered copy of docs/21's
 * Decision 4: "these changes reproduce the applyable part of your canvas"
 * is a promise about a plan that will be written, and a blocked plan
 * will not be.
 *
 * PURE, and out of the component, so the ordering is a rule with a test
 * rather than a line-order somebody could helpfully rearrange. Its
 * inputs are counts and booleans — nothing here knows what an adapter,
 * a warning or a record IS.
 */

export type ReviewHeadlineKind = "clean" | "blocked" | "unverified" | "verified";

export interface ReviewHeadline {
  kind: ReviewHeadlineKind;
  text: string;
}

export function reviewHeadline(state: {
  /** How many file changes the plan holds. */
  changes: number;
  /** Any blocking warning present. */
  blocked: boolean;
  /** Remainder items left for the user's hand (docs/21, Decision 4). */
  checklist: number;
  /** Did simulation reproduce the edited structure? */
  simOk: boolean;
  simDetail?: string;
}): ReviewHeadline {
  // FIRST, because a refusal is a fact about the plan that emptiness
  // cannot explain away, and because everything below it is a promise
  // about bytes that are not going to be written.
  if (state.blocked) {
    return {
      kind: "blocked",
      text:
        state.changes === 0
          ? // TWO FACTS, NEITHER INFERRED FROM THE OTHER. "Saving is
            // disabled" alone implies there was something to save;
            // "nothing to save" alone is the sentence this fixes.
            "There is nothing here to save, and the issues below are unresolved — nothing will be written until they are."
          : "Saving is disabled until the blocking issues below are resolved on the canvas.",
    };
  }
  if (!state.simOk) {
    return {
      kind: "unverified",
      text: `Verification failed: ${
        state.simDetail ?? "the plan does not reproduce the edited structure"
      }. Please report this — nothing will be saved.`,
    };
  }
  if (state.changes === 0) {
    return {
      kind: "clean",
      text: "The canvas matches the imported files — there is nothing to save.",
    };
  }
  const n = state.changes;
  const plural = n === 1 ? "" : "s";
  // A CAPABILITY FLIP OBLIGATES A COPY SWEEP: "reproduces your canvas
  // exactly" became false the moment the plan reproduces the PROJECTION
  // instead — the canvas holds moves these changes do not (docs/21,
  // Decision 4, invariant 4).
  if (state.checklist > 0) {
    const k = state.checklist;
    return {
      kind: "verified",
      text: `Verified: these ${n} file change${plural} reproduce the applyable part of your canvas — ${k} aspirational move${
        k === 1 ? " is" : "s are"
      } left to you, below.`,
    };
  }
  return {
    kind: "verified",
    text: `Verified: re-parsing these ${n} file change${plural} reproduces your canvas exactly.`,
  };
}
