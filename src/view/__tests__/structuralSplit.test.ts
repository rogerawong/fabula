/**
 * structuralSplit.test.ts — the result view's split sentence, extended
 * to the structural kinds (docs/22, Decision 5).
 *
 * THE SPLIT IS SAID BEFORE THE TAB OPENS. A user about to accept a
 * proposal learns here how much of it the app can write — and after
 * docs/22 "how much" has a second half: rows the app will not move, and
 * STRUCTURE it cannot record.
 *
 * EACH NUMBER SAYS WHAT IT COUNTS, still. The first clause counts ROWS,
 * the second counts CARDS and BLOCKS, and Review's checklist counts
 * ITEMS. Printed as bare integers they look like one measurement gone
 * wrong; with their units they read as the different questions they are.
 *
 * A CARD ORDER IS NOT A COUNT. A permutation is one fact however many
 * cards moved, so it is named rather than numbered — "the card order",
 * never "3 card orders".
 */

import { describe, expect, it } from "vitest";
import { aspirationalSplitText } from "../reorganize/aspirationalSplit";

const base = { moves: 14, needsHand: 3, needsConsent: 0 };

describe("the shipped sentence is unchanged where there is no structure", () => {
  it("reads exactly as it did", () => {
    expect(aspirationalSplitText(base)).toBe(
      "14 moves — 11 the app can write, 3 rows need your hand",
    );
  });

  it("an all-zero structural block adds nothing", () => {
    expect(
      aspirationalSplitText({
        ...base,
        structural: { createdCards: 0, cardOrderChanged: false, frozenBlocks: 0 },
      }),
    ).toBe(aspirationalSplitText(base));
  });
});

describe("the structural clause", () => {
  it("names a created card and the card order together, at Review", () => {
    expect(
      aspirationalSplitText({
        ...base,
        structural: { createdCards: 1, cardOrderChanged: true, frozenBlocks: 0 },
      }),
    ).toBe(
      "14 moves — 11 the app can write, 3 rows need your hand; " +
        "1 created card and the card order need your hand at Review",
    );
  });

  it("counts cards in the plural and blocks separately", () => {
    expect(
      aspirationalSplitText({
        ...base,
        structural: { createdCards: 2, cardOrderChanged: false, frozenBlocks: 3 },
      }),
    ).toContain("2 created cards and 3 frozen blocks");
  });

  it("says 'the card order', never a count of them", () => {
    const text = aspirationalSplitText({
      ...base,
      structural: { createdCards: 0, cardOrderChanged: true, frozenBlocks: 0 },
    });
    expect(text).toContain("the card order");
    expect(text).not.toMatch(/\d+ card orders?/);
  });

  it("stands alone when the run displaced no rows at all", () => {
    // A GROUNDED run can still hoist a leaf or reorder cards — the
    // validator opens both — so the structural clause has to read on its
    // own, with an empty row half.
    const text = aspirationalSplitText({
      moves: 4,
      needsHand: 0,
      needsConsent: 0,
      structural: { createdCards: 1, cardOrderChanged: false, frozenBlocks: 0 },
    });
    expect(text).toBe(
      "4 moves — 4 the app can write; 1 created card needs your hand at Review",
    );
  });
});
