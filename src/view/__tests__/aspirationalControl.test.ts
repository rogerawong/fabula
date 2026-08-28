/**
 * aspirationalControl.test.ts — the deliberate per-tab switch, and G1's
 * ruled shape (docs/21, Decision 9; gate 2, ruled 2026-08-19).
 *
 * A SWITCH THAT DOES NOT NEED THE GESTURE. The seam is how a tab usually
 * becomes Aspirational, but a user who knows what they want should not
 * have to perform a drag to say so — and a user who declined should not
 * be stuck. So the tab menu carries the control, and the declined
 * refusal's sentence points straight at it.
 *
 * G1 — SWITCH-BACK IS EMPTY-LEDGER ONLY, and the reason is that
 * "Grounded" is a PROMISE (everything here is applyable) which a tab
 * holding displacements cannot make. A state contradicting its own facts
 * is the conflation this project pays for, and the alternative —
 * switch-back-anytime — mints a third de-facto state ("Grounded with
 * displacements") nobody can define. While records remain the control is
 * disabled-with-a-reason naming the Put back path.
 *
 * A SWITCHED-BACK TAB LANDS GROUNDED-UNASKED, not declined: a deliberate
 * switch-back is not a seam decline, so the seam may offer again. That
 * half is the store's (`aspirationalState.test.ts`); this file owns the
 * control's own answers.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { TocDocument } from "@/model/types";
import { aspirationalControl } from "../aspirationalControl";

/** A card with one plain row, and nothing pinned anywhere. */
const plainDoc = (): TocDocument => doc([section("Guides", [topic("Intro")])]);

/** The same, with the second row pinned by its source. */
function pinnedDoc(): TocDocument {
  const d = plainDoc();
  d.sections[0]!.topics.push({
    ...topic("Installing"),
    lock: { kind: "outside-region" },
  });
  return d;
}

/** The same again, with that pinned row displaced — a live ledger. */
function ledgeredDoc(): TocDocument {
  const d = pinnedDoc();
  d.sections[0]!.topics[1]!.displaced = {
    parentId: "other-card",
    parentTitle: "Getting started",
    index: 0,
    kind: "pin",
  };
  return d;
}

describe("visibility — a control that can do nothing for this document is noise", () => {
  it("is absent on a Grounded-unasked tab with no pinned row", () => {
    expect(aspirationalControl({}, plainDoc())).toBeNull();
  });

  it("appears as soon as the document holds ANY pinned row", () => {
    expect(aspirationalControl({}, pinnedDoc())).not.toBeNull();
  });

  it("appears on a tab whose state is non-default, pinned rows or not", () => {
    // BOTH DIRECTIONS. A tab that was switched or declined must be able
    // to say so and be switched back, even on a document where nothing
    // is pinned any more — otherwise the state is unreachable.
    expect(aspirationalControl({ aspirational: true }, plainDoc())).not.toBeNull();
    expect(aspirationalControl({ seamDeclined: true }, plainDoc())).not.toBeNull();
  });
});

describe("Grounded → Aspirational", () => {
  it("offers the switch, enabled, on an unasked tab", () => {
    const control = aspirationalControl({}, pinnedDoc())!;
    expect(control.label).toBe("Make this tab Aspirational");
    expect(control.next).toBe(true);
    expect(control.disabledReason).toBeUndefined();
  });

  it("offers it on a DECLINED tab — the decline is sticky, not permanent", () => {
    // The refusal sentence names this control as the escape hatch, so a
    // declined tab that could not reach it would be a dead end wearing a
    // signpost.
    const control = aspirationalControl({ seamDeclined: true }, pinnedDoc())!;
    expect(control.next).toBe(true);
    expect(control.disabledReason).toBeUndefined();
  });
});

describe("G1 — Aspirational → Grounded, empty-ledger only", () => {
  it("offers the switch back while the ledger is empty", () => {
    // An Aspirational tab with an empty ledger behaves at apply exactly
    // like a Grounded one, which is why there is nothing to stop.
    const control = aspirationalControl({ aspirational: true }, pinnedDoc())!;
    expect(control.label).toBe("Make this tab Grounded");
    expect(control.next).toBe(false);
    expect(control.disabledReason).toBeUndefined();
  });

  it("disables it while records remain, and NAMES the Put back path", () => {
    const control = aspirationalControl({ aspirational: true }, ledgeredDoc())!;
    expect(control.next).toBe(false);
    expect(control.disabledReason).toBeDefined();
    expect(control.disabledReason).toContain("Put back");
  });

  it("counts the displacements in the reason rather than saying 'some'", () => {
    const control = aspirationalControl({ aspirational: true }, ledgeredDoc())!;
    expect(control.disabledReason).toContain("1 imagined move");
  });

  it("pluralizes the count", () => {
    const d = ledgeredDoc();
    d.sections[0]!.topics.push({
      ...topic("Exporting"),
      lock: { kind: "reference" },
      displaced: {
        parentId: "other-card",
        parentTitle: "Getting started",
        index: 1,
        kind: "pin",
      },
    });
    expect(aspirationalControl({ aspirational: true }, d)!.disabledReason).toContain(
      "2 imagined moves",
    );
  });
});
