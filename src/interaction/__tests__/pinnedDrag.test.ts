/**
 * pinnedDrag.test.ts — the seam's rule and its voice (docs/21, Decision 9
 * and gate 2's G1).
 *
 * PURE, AND SEPARATE FROM THE DRAG HANDLER, for the reason `moveLabel.ts`
 * says at its own docblock: vitest runs in node, so a rule that lives
 * inside a pointer handler is a rule only e2e can check. Everything here
 * — which rows a drop would displace, what the tab's state says about
 * it, and every sentence the user reads — is a function of values.
 *
 * THE GATE READS THE TAB STATE AND NOTHING ELSE. Not the run mode, which
 * is immutable provenance about one call and has no business in a
 * gesture; not the ledger, which is what the APPLY surfaces read. Three
 * facts, three homes (Decision 7), and this file owns the gesture's one.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { TocDocument, Topic } from "@/model/types";
import {
  pinnedDropConsequence,
  pinnedGate,
  pinnedInMove,
  pinnedRefusalSentence,
  seamCopy,
} from "../pinnedDrag";

// The pinned cause, spelled the widened way (docs/22, Decision 7). These
// tests assert docs/21's ruled words UNCHANGED, which is the point: the
// second cause arrived beside the first without moving it.

/** A → [Intro, (pinned) Manager, (pinned) Export]; B → [] */
function fixture(): { d: TocDocument; plain: Topic; pinned: Topic; pinned2: Topic } {
  const d = doc([section("Getting started", [topic("Intro")]), section("Tutorials", [])]);
  const pinned: Topic = {
    ...topic("Using the Project Manager"),
    lock: { kind: "outside-region" },
  };
  const pinned2: Topic = { ...topic("Exporting"), lock: { kind: "reference" } };
  d.sections[0]!.topics.push(pinned, pinned2);
  return { d, plain: d.sections[0]!.topics[0]!, pinned, pinned2 };
}

const into = (d: TocDocument, i: number) => ({
  sectionId: d.sections[i]!.id,
  parentTopicId: null,
});

describe("which rows a drop would displace", () => {
  it("names the pinned rows whose PARENT would change", () => {
    const { d, pinned } = fixture();
    expect(pinnedInMove(d, [pinned.id], into(d, 1)).map((t) => t.title)).toEqual([
      "Using the Project Manager",
    ]);
  });

  it("names none for a WITHIN-PARENT reorder, in any tab state", () => {
    // A reorder is not a displacement: it writes no record, and the
    // seam's opening claim ("the app can't write it") would be false for
    // it. The Sphinx frozen-block case where a reorder really cannot be
    // written stays Decision 8's plan-time surface.
    const { d, pinned } = fixture();
    expect(pinnedInMove(d, [pinned.id], into(d, 0))).toEqual([]);
  });

  it("names none for an unpinned row, however far it travels", () => {
    const { d, plain } = fixture();
    expect(pinnedInMove(d, [plain.id], into(d, 1))).toEqual([]);
  });

  it("counts only the pinned members of a mixed selection", () => {
    const { d, plain, pinned, pinned2 } = fixture();
    expect(pinnedInMove(d, [plain.id, pinned.id, pinned2.id], into(d, 1))).toHaveLength(
      2,
    );
  });

  it("treats a NEW-PARENT-BY-DEFINITION drop as a parent change", () => {
    // `to === null` is the empty-canvas drop. It used to be refused
    // elsewhere for pinned rows (`guards.ts`, `pinned-to-card`, retired
    // by docs/22 arc 2) and the predicate answered anyway rather than
    // assuming its caller — which is why the retirement needed no change
    // here: the answer was already the right one for a drop that now
    // happens.
    const { d, pinned } = fixture();
    expect(pinnedInMove(d, [pinned.id], null)).toHaveLength(1);
  });
});

describe("the gate — gesture consent comes from the TAB STATE", () => {
  it("commits an ordinary drag whatever the state says", () => {
    // Nothing pinned in the move: the seam is not a thing that happens
    // to every drag on an unasked tab.
    expect(pinnedGate({}, 0)).toBe("commit");
    expect(pinnedGate({ seamDeclined: true }, 0)).toBe("commit");
    expect(pinnedGate({ aspirational: true }, 0)).toBe("commit");
  });

  it("opens the seam on a Grounded-UNASKED tab", () => {
    expect(pinnedGate({}, 1)).toBe("seam");
  });

  it("commits directly on an Aspirational tab — consent was given for the tab", () => {
    // Re-asking per move would be the forty-modals failure docs/16
    // measured.
    expect(pinnedGate({ aspirational: true }, 1)).toBe("commit");
  });

  it("refuses on a Grounded-DECLINED tab, and the decline is sticky", () => {
    expect(pinnedGate({ seamDeclined: true }, 1)).toBe("refuse");
    // Asked twice, answered the same: nothing about the gate is
    // one-shot, so a second pinned drag cannot re-seam.
    expect(pinnedGate({ seamDeclined: true }, 1)).toBe("refuse");
  });

  it("lets Aspirational win over a stale decline, rather than reading both", () => {
    // The store clears `seamDeclined` when it turns the tab
    // Aspirational, so the pair cannot occur — but a predicate that
    // depends on its caller having tidied up is a predicate that is
    // wrong the day someone doesn't.
    expect(pinnedGate({ aspirational: true, seamDeclined: true }, 1)).toBe("commit");
  });
});

describe("what the gesture SAYS", () => {
  it("previews the consequence at the pointer, naming the kind", () => {
    const { pinned } = fixture();
    expect(pinnedDropConsequence([pinned])).toBe(
      "→ needs your hand — pinned (above prose)",
    );
  });

  it("counts rather than lists when several rows are pinned", () => {
    const { pinned, pinned2 } = fixture();
    expect(pinnedDropConsequence([pinned, pinned2])).toBe(
      "→ 2 rows need your hand — pinned",
    );
  });

  it("says nothing when nothing is pinned — silence is the ordinary case", () => {
    expect(pinnedDropConsequence([])).toBeNull();
  });

  it("names the escape hatch in the declined refusal", () => {
    // THE STICKY DECLINE NEVER READS AS BREAKAGE. The sentence carries
    // the way out, per the ruling.
    const sentence = pinnedRefusalSentence();
    expect(sentence).toBe(
      "Pinned rows stay put while this tab is Grounded — switch the tab to Aspirational to move them (tab menu).",
    );
  });
});

describe("the seam's copy is a MODE choice, never a move confirmation", () => {
  it("states the split for a single pinned row", () => {
    const copy = seamCopy({ pinnedCount: 1, creates: false }, 1);
    expect(copy.headline).toBe(
      "This move includes a pinned row — the app can't write it.",
    );
    expect(copy.proceed.label).toBe("Switch this tab to Aspirational and make the move");
    expect(copy.decline.label).toBe("Keep this tab Grounded");
  });

  it("COUNTS the pinned rows in a multi-select", () => {
    // One seam for the set, because the gesture is one gesture —
    // per-row seams would be the modal-per-move failure again.
    expect(seamCopy({ pinnedCount: 2, creates: false }, 5).headline).toContain(
      "2 of the 5 rows in this move are pinned",
    );
  });

  it("promises the split, never a vanishing", () => {
    // "No guarantee anything writes back" is the opposite lie and is
    // ruled out: the tab keeps full verification on the applyable part.
    const copy = seamCopy({ pinnedCount: 1, creates: false }, 1);
    expect(copy.proceed.detail).toContain("everything else stays writable");
  });

  it("tells a multi-row decline the truth: the whole drop is off", () => {
    // "The row stays put" is false about the four unpinned rows in the
    // same gesture. One gesture, one answer.
    expect(seamCopy({ pinnedCount: 1, creates: false }, 1).decline.detail).toContain(
      "The row stays put",
    );
    expect(seamCopy({ pinnedCount: 2, creates: false }, 5).decline.detail).toContain(
      "Nothing moves",
    );
  });

  it("points the decline at the control that undoes it", () => {
    expect(seamCopy({ pinnedCount: 1, creates: false }, 1).decline.detail).toContain(
      "tab menu",
    );
  });
});
