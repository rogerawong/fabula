/**
 * remainderConsent.test.ts — the two predicates OR-3 widens (docs/22,
 * Decision 7).
 *
 * ONE CONSENT, ONE WIDENED MEANING: "this tab may hold arrangements the
 * app cannot write, labeled." Two consents would put a second
 * indistinguishable toggle on the tab and force the seam to say which
 * kind of imagination it was asking about.
 *
 * BOTH PREDICATES RIDE THAT RULING, and they have to, or the state
 * contradicts its own facts:
 *
 * - THE BIRTH RULE. A GROUNDED run on a Sphinx tab can hoist a leaf —
 *   the validator opens it deliberately, and the pinned net is
 *   parent-change-only — so the result holds a creation record with an
 *   EMPTY row ledger. Under the unwidened rule it would be born Grounded
 *   while holding structure the app cannot write.
 * - G1'S SWITCH BACK. "Grounded" is a promise a tab holding remainders
 *   cannot make, whatever kind of remainder it holds.
 *
 * THE TRADE IS RECORDED AND ACCEPTED AT GATE: consent given at one seam
 * licenses later imagined structure on that tab without a fresh seam,
 * and the mark, the checklist and the Overview carry the visibility.
 */

import { describe, expect, it } from "vitest";
import { aspirationalControl } from "../aspirationalControl";
import { hasStructuralRemainders } from "@/model/remainders";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { TocDocument, Topic } from "@/model/types";

const pinned = (t: Topic): Topic => ({ ...t, lock: { kind: "outside-region" } });

/** A tab-shaped document holding one pinned row and nothing else. */
function withPin(): TocDocument {
  return doc([section("Guides", [pinned(topic("Install")), topic("Usage")])]);
}

describe("G1 — the switch back is empty ledger AND empty report", () => {
  it("offers the switch back on a tab holding neither", () => {
    const control = aspirationalControl({ aspirational: true }, withPin());
    expect(control?.next).toBe(false);
    expect(control?.disabledReason).toBeUndefined();
  });

  it("is disabled with a reason while the tab holds a displaced row", () => {
    const d = withPin();
    d.sections[0]!.topics[0]!.displaced = {
      parentId: "elsewhere",
      parentTitle: "Elsewhere",
      index: 0,
      kind: "pin",
    };
    const control = aspirationalControl({ aspirational: true }, d);
    expect(control?.disabledReason).toContain("Put back");
  });

  it("is disabled with a reason while the tab holds a STRUCTURAL remainder", () => {
    // The widening. Nothing is displaced here; the tab holds a card the
    // write path cannot record, and "Grounded" is a promise it cannot
    // make either.
    const d = withPin();
    const control = aspirationalControl({ aspirational: true }, d, [
      {
        kind: "creation",
        sectionId: d.sections[0]!.id,
        title: "Workflow",
        species: "section",
        ownKey: "~Workflow",
        memberKeys: [],
      },
    ]);
    expect(control?.disabledReason).toBeDefined();
  });

  it("NAMES BOTH WAYS BACK, so the reason is a signpost with a road", () => {
    // Put back for displaced rows; for a created card, deleting it or
    // re-homing its rows. A reason naming only the first would send the
    // user looking for a badge that is not there.
    const d = withPin();
    const control = aspirationalControl({ aspirational: true }, d, [
      {
        kind: "creation",
        sectionId: d.sections[0]!.id,
        title: "Workflow",
        species: "section",
        ownKey: "~Workflow",
        memberKeys: [],
      },
    ]);
    const reason = control!.disabledReason!;
    expect(reason).toMatch(/delete|re-home|rows back/i);
    expect(reason).toContain("Workflow");
  });

  it("counts the two kinds SEPARATELY, with their units", () => {
    const d = withPin();
    d.sections[0]!.topics[0]!.displaced = {
      parentId: "elsewhere",
      parentTitle: "Elsewhere",
      index: 0,
      kind: "pin",
    };
    const reason = aspirationalControl({ aspirational: true }, d, [
      {
        kind: "creation",
        sectionId: d.sections[0]!.id,
        title: "Workflow",
        species: "section",
        ownKey: "~Workflow",
        memberKeys: [],
      },
    ])!.disabledReason!;
    expect(reason).toMatch(/1 imagined move/);
    expect(reason).toMatch(/1 imagined card/);
  });

  it("turning it ON is still never gated", () => {
    const control = aspirationalControl({}, withPin(), [
      {
        kind: "card-order",
        moved: [{ sectionId: "s1", title: "Guides", from: 0, to: 1 }],
      },
    ]);
    expect(control?.next).toBe(true);
    expect(control?.disabledReason).toBeUndefined();
  });

  it("a caller passing no report gets exactly the shipped behaviour", () => {
    const d = withPin();
    expect(aspirationalControl({ aspirational: true }, d)).toEqual(
      aspirationalControl({ aspirational: true }, d, []),
    );
  });
});

describe("the birth rule's widened first clause", () => {
  it("hasStructuralRemainders answers for a document with no source", () => {
    // DECLARED INPUTS: a format tab keeps no snapshot, so there is
    // nothing to compare against and the answer is no — not "unknown"
    // dressed as yes.
    expect(hasStructuralRemainders(withPin(), {}, [])).toBe(false);
  });
});
