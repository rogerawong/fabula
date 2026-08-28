/**
 * reviewHeadline.test.ts — Review's status line, which may never
 * contradict the warning sitting under it (oracle log, 2026-08-19).
 *
 * THE LIVE ENTRY: *"Review then refused: the model had created four cards
 * … and the dialog's headline claimed 'the canvas matches the imported
 * files' beside the blocking warning saying otherwise."*
 *
 * The two statements were both rendered, both true of their own variable,
 * and jointly a lie: the plan was empty because the planner REFUSED
 * everything, and "the canvas matches the imported files" is what an
 * empty plan means only when nothing was refused. The headline branched
 * on `changes.length` before it branched on the warnings, so the
 * emptiness spoke first and the reason never spoke at all.
 *
 * ONE HEADLINE, THREE STATES, NONE CONTRADICTING ANOTHER — and the third
 * is Decision 4's, so this reconciles with docs/21 rather than replacing
 * it: clean (nothing to save, nothing refused), ledgered (verified, with
 * a remainder for the hand), blocked (nothing will be written until the
 * issues below are resolved). Blocked outranks the other two, because a
 * refusal is a fact about the plan that emptiness cannot explain away.
 */

import { describe, expect, it } from "vitest";
import { reviewHeadline } from "../reviewHeadline";

describe("clean", () => {
  it("says the canvas matches only when nothing was refused", () => {
    const state = reviewHeadline({
      changes: 0,
      blocked: false,
      checklist: 0,
      simOk: true,
    });
    expect(state.kind).toBe("clean");
    expect(state.text).toContain("The canvas matches the imported files");
  });
});

describe("blocked", () => {
  it("NEVER claims the canvas matches, even with an empty plan", () => {
    /**
     * THE REGRESSION, in one assertion. An empty plan plus a blocking
     * warning is exactly the live run: four cards the planner would not
     * write, so no file change to show and every reason to explain why.
     */
    const state = reviewHeadline({
      changes: 0,
      blocked: true,
      checklist: 0,
      simOk: true,
    });
    expect(state.kind).toBe("blocked");
    expect(state.text).not.toContain("The canvas matches the imported files");
  });

  it("says there is nothing to save AND that the issues are unresolved", () => {
    // Both facts, neither inferred from the other. "Saving is disabled"
    // alone implies there was something to save; "nothing to save" alone
    // is the lie this fixes.
    const state = reviewHeadline({
      changes: 0,
      blocked: true,
      checklist: 0,
      simOk: true,
    });
    expect(state.text).toContain("nothing");
    expect(state.text).toContain("below");
  });

  it("keeps the non-empty blocked sentence it already had", () => {
    const state = reviewHeadline({
      changes: 3,
      blocked: true,
      checklist: 0,
      simOk: true,
    });
    expect(state.kind).toBe("blocked");
    expect(state.text).toContain("Saving is disabled");
  });

  it("outranks a ledgered remainder too", () => {
    // A tab with aspirational moves AND a blocking warning must not be
    // told its changes are verified — Decision 4's copy is about a plan
    // that will be written, and this one will not.
    expect(
      reviewHeadline({ changes: 3, blocked: true, checklist: 2, simOk: true }).kind,
    ).toBe("blocked");
  });
});

describe("verified", () => {
  it("reproduces the canvas exactly when there is no remainder", () => {
    const state = reviewHeadline({
      changes: 2,
      blocked: false,
      checklist: 0,
      simOk: true,
    });
    expect(state.kind).toBe("verified");
    expect(state.text).toContain("reproduces your canvas exactly");
  });

  it("reproduces the APPLYABLE PART when the ledger holds a remainder", () => {
    // docs/21, Decision 4, invariant 4 — unchanged by this fix, and
    // asserted here so the reconciliation is visible rather than assumed.
    const state = reviewHeadline({
      changes: 2,
      blocked: false,
      checklist: 3,
      simOk: true,
    });
    expect(state.kind).toBe("verified");
    expect(state.text).toContain("the applyable part");
    expect(state.text).toContain("3 aspirational moves are left to you");
  });

  it("counts one remainder in the singular", () => {
    expect(
      reviewHeadline({ changes: 1, blocked: false, checklist: 1, simOk: true }).text,
    ).toContain("1 aspirational move is left to you");
  });
});

describe("verification failure keeps its own state", () => {
  it("is neither clean nor verified", () => {
    const state = reviewHeadline({
      changes: 2,
      blocked: false,
      checklist: 0,
      simOk: false,
      simDetail: "the plan does not reproduce the edited structure",
    });
    expect(state.kind).toBe("unverified");
    expect(state.text).toContain("Verification failed");
  });
});

describe("the states are exhaustive and mutually exclusive", () => {
  it("returns exactly one kind for every combination of inputs", () => {
    // A HEADLINE THAT COULD RENDER TWO STATES IS THE DEFECT ITSELF. The
    // whole 2x2x2x2 is driven, so a future branch that overlaps has
    // nowhere to hide.
    const kinds = new Set<string>();
    for (const changes of [0, 3]) {
      for (const blocked of [false, true]) {
        for (const checklist of [0, 2]) {
          for (const simOk of [true, false]) {
            const state = reviewHeadline({ changes, blocked, checklist, simOk });
            expect(
              typeof state.text,
              JSON.stringify({ changes, blocked, checklist }),
            ).toBe("string");
            expect(state.text.length).toBeGreaterThan(0);
            kinds.add(state.kind);
          }
        }
      }
    }
    expect([...kinds].sort()).toEqual(["blocked", "clean", "unverified", "verified"]);
  });
});
