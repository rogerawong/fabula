/**
 * scopeNotice.test.ts — the dialog's notice for a document that can
 * barely be reorganized at all (docs/21 Decision 8; docs/22's extension).
 *
 * DISABLED-WITH-A-REASON IS THE WRONG SEAM HERE, and it stays wrong for
 * the reason it was wrong before: grounded is not useless on such a
 * corpus. Within-card reorder of unfrozen rows is real work, and
 * docs/19's blast-radius measurement is the receipt — refusing to run
 * would freeze 5 of the kernel's 8 cards and make cpython entirely
 * un-reorganizable. So the dialog STATES the situation and runs.
 *
 * THE EXTENSION IS ONE SENTENCE, not a second notice. Where the rows are
 * frozen AND the system can neither add a card nor record a card order,
 * a grounded run has almost nothing left to propose, and saying so is
 * what stops the user reading an empty result as a broken app.
 */

import { describe, expect, it } from "vitest";
import { scopeNoticeText } from "../reorganize/scopeNotice";

const capable = { createCards: true, reorderCards: true };
const refusing = { createCards: false, reorderCards: false };

describe("no notice where there is nothing to say", () => {
  it("is absent when the rows are not all pinned", () => {
    expect(scopeNoticeText({ entirelyPinned: false, ...capable })).toBeNull();
  });

  it("is absent on a capability-false document whose rows are free", () => {
    // The card capabilities alone are NOT this notice's subject: moving
    // rows between existing cards is exactly what such a run is for.
    expect(scopeNoticeText({ entirelyPinned: false, ...refusing })).toBeNull();
  });
});

describe("the shipped sentence, unchanged", () => {
  it("reads exactly as docs/21 shipped it", () => {
    expect(scopeNoticeText({ entirelyPinned: true, ...capable })).toBe(
      "Every row in scope is pinned. A Grounded run can only reorder within sections; " +
        "Aspirational proposes freely and hands you the changes as a checklist.",
    );
  });
});

describe("the extension — rows frozen AND no card edits recordable", () => {
  it("says what is left, which is nearly nothing", () => {
    const text = scopeNoticeText({ entirelyPinned: true, ...refusing })!;
    expect(text).toContain("Every row in scope is pinned");
    expect(text).toMatch(/cannot add a card or record a card order/i);
    expect(text).toContain("Aspirational");
  });

  it("still names Aspirational as the door, never a refusal to run", () => {
    const text = scopeNoticeText({ entirelyPinned: true, ...refusing })!;
    expect(text).toMatch(/checklist/i);
    expect(text).not.toMatch(/cannot run|disabled|unavailable/i);
  });

  it("extends for ONE false capability too, naming only that one", () => {
    // Two facts, never one flag: a system that adds cards happily may
    // still have no card order to write.
    const noCreate = scopeNoticeText({
      entirelyPinned: true,
      createCards: false,
      reorderCards: true,
    })!;
    expect(noCreate).toMatch(/cannot add a card\b/i);
    expect(noCreate).not.toMatch(/record a card order/i);

    const noOrder = scopeNoticeText({
      entirelyPinned: true,
      createCards: true,
      reorderCards: false,
    })!;
    expect(noOrder).toMatch(/cannot record a card order/i);
    expect(noOrder).not.toMatch(/add a card/i);
  });
});
