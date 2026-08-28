/**
 * THE SEAM'S SECOND CAUSE (docs/22, Decision 7).
 *
 * docs/21's seam asks about a ROW the source owns. This one asks about
 * STRUCTURE the format cannot record — different in KIND, which is what
 * the second-producer discipline wants of a mechanism that was, until
 * now, parameterised by exactly one caller.
 *
 * ONE CONSENT, WIDENED (OR-3). The verdict function gains the structural
 * cause ALONGSIDE the pinned count rather than beside it in a second
 * gate: two gates would be two indistinguishable toggles on the tab, and
 * would force the seam to say which kind of imagination it is asking
 * about. So `aspirational` licenses both, `seamDeclined` refuses both,
 * and the COPY is what names the cause.
 *
 * PURE, for the reason `moveLabel.ts` gives: a rule inside a pointer
 * handler is a rule only e2e can check.
 */

import { describe, expect, it } from "vitest";
import {
  consentGate,
  seamCopy,
  seamRefusalSentence,
  type SeamCause,
} from "../pinnedDrag";

const NOTHING: SeamCause = { pinnedCount: 0, creates: false };
const PINNED: SeamCause = { pinnedCount: 1, creates: false };
const CREATES: SeamCause = { pinnedCount: 0, creates: true };
const BOTH: SeamCause = { pinnedCount: 1, creates: true };

describe("the gate answers for both causes through one consent", () => {
  it("commits when neither cause is present, in every tab state", () => {
    expect(consentGate({}, NOTHING)).toBe("commit");
    expect(consentGate({ seamDeclined: true }, NOTHING)).toBe("commit");
    expect(consentGate({ aspirational: true }, NOTHING)).toBe("commit");
  });

  it("opens the seam for a STRUCTURE-MAKING drop on a Grounded-unasked tab", () => {
    expect(consentGate({}, CREATES)).toBe("seam");
  });

  it("refuses a structure-making drop on a DECLINED tab — the decline answered the mode", () => {
    expect(consentGate({ seamDeclined: true }, CREATES)).toBe("refuse");
  });

  it("commits a structure-making drop on an Aspirational tab, no second prompt", () => {
    expect(consentGate({ aspirational: true }, CREATES)).toBe("commit");
  });

  it("asks ONCE when a drop carries both causes — one gesture, one consent", () => {
    expect(consentGate({}, BOTH)).toBe("seam");
    expect(consentGate({ aspirational: true }, BOTH)).toBe("commit");
    expect(consentGate({ seamDeclined: true }, BOTH)).toBe("refuse");
  });
});

describe("the copy names its cause", () => {
  it("keeps docs/21's pinned words exactly, so the first seam did not move", () => {
    expect(seamCopy(PINNED, 1).headline).toBe(
      "This move includes a pinned row — the app can't write it.",
    );
  });

  it("names the CREATION cause, in the format's own noun for a card", () => {
    expect(seamCopy(CREATES, 1, "toctree block").headline).toBe(
      "This creates a card — here, cards are toctree blocks, and the app can't write a new one.",
    );
  });

  it("still says something true where the adapter names no noun", () => {
    // A guard consumes declared inputs, applied to copy: the sentence
    // degrades rather than acquiring a hole.
    const headline = seamCopy(CREATES, 1).headline;
    expect(headline).toContain("This creates a card");
    expect(headline).not.toContain("undefined");
  });

  it("names BOTH counts when one drop carries both facts", () => {
    // Decision 7's interaction fact, stated so it is a sentence rather
    // than a discovery: a pinned row may seed a creation only through
    // the seam, and both facts ride one consent.
    const headline = seamCopy(BOTH, 1, "toctree block").headline;
    expect(headline).toContain("creates a card");
    expect(headline).toContain("pinned");
  });

  it("offers a MODE choice on both options, never a move confirmation", () => {
    const copy = seamCopy(CREATES, 1, "toctree block");
    expect(copy.proceed.label).toBe("Switch this tab to Aspirational and make it");
    expect(copy.proceed.detail).toBe(
      "The card is labeled for your hands; everything else stays writable and verified as normal.",
    );
    expect(copy.decline.label).toBe("Keep this tab Grounded");
    expect(copy.decline.detail).toBe(
      "Nothing changes. You can switch later from the tab menu.",
    );
  });
});

describe("the declined refusal names the escape hatch, per cause", () => {
  it("keeps the pinned sentence docs/21 ruled", () => {
    expect(seamRefusalSentence(PINNED)).toBe(
      "Pinned rows stay put while this tab is Grounded — switch the tab to Aspirational to move them (tab menu).",
    );
  });

  it("says what a creation refusal is about, and where the way out is", () => {
    const sentence = seamRefusalSentence(CREATES);
    expect(sentence).toContain("Aspirational");
    expect(sentence).toContain("tab menu");
    expect(sentence.toLowerCase()).toContain("card");
  });
});
