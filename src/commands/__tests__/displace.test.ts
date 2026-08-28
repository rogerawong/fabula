/**
 * displace.test.ts — the FORWARD half of the displacing act (docs/21,
 * Decision 3; arc 2's Decision 9).
 *
 * ARC 1 BUILT ONLY THE INVERSE. `putBackTopic` returns a row home and
 * erases its record; `execMoveTopics`' clearing clause already said
 * "putting a thing back is not a displacement, whoever does it". The
 * half that WRITES the record had no producer outside `validate.ts`, so
 * a hand that moved a pinned row would have produced an unbadged,
 * unprojectable displacement — the silent downgrade the design forbids.
 *
 * NOT A NEW COMMAND, AND THE REASON IS THE SITE. The forward rule is the
 * exact mirror of the clearing rule, and the clearing rule already lives
 * inside `execMoveTopics`. A `displace: true` flag on the command would
 * be an optional field whose forgetting fails SILENTLY and in the
 * dangerous direction (a pinned row moved with no record cannot be
 * projected home), and a second command type would be a second copy of
 * the move executor. So the executor answers it from the document: a
 * PINNED row whose PARENT changed is displaced, whoever asked. The
 * gesture layer's job is consent — whether the move happens at all —
 * never whether it is recorded.
 *
 * ONE COMMAND, TWO EFFECTS, ONE UNDO, exactly as `putBack.test.ts`
 * asserts for the inverse: the move and the record ride one Immer patch
 * set, so undo removes both by inversion and redo restores both.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import { recordedLedger } from "@/model/ledger";
import type { TocDocument } from "@/model/types";
import { applyRedo, applyUndo, runCommand } from "../dispatcher";
import type { EditorState } from "../types";

/**
 * Getting started → [Intro, (pinned) Using the Project Manager];
 * Tutorials → [First tutorial]
 *
 * The MINIMAL PAIR: one pinned row and one plain row in one document, so
 * a test can show that the boring case is treated differently rather
 * than merely that the interesting one works.
 */
function fixture(): {
  state: EditorState;
  pinnedId: string;
  plainId: string;
  fromId: string;
  toId: string;
} {
  const d: TocDocument = doc([
    section("Getting started", [topic("Intro")]),
    section("Tutorials", [topic("First tutorial")]),
  ]);
  const from = d.sections[0]!;
  const pinned = {
    ...topic("Using the Project Manager"),
    lock: { kind: "outside-region" as const },
  };
  from.topics.push(pinned);
  return {
    state: {
      document: d,
      columns: [[from.id, d.sections[1]!.id]],
      view: { globalDepth: 2, cardDepths: {} },
    },
    pinnedId: pinned.id,
    plainId: from.topics[0]!.id,
    fromId: from.id,
    toId: d.sections[1]!.id,
  };
}

const moveTo = (topicIds: string[], toSectionId: string, toIndex = 0) =>
  ({
    type: "moveTopics",
    topicIds,
    toSectionId,
    toParentTopicId: null,
    toIndex,
  }) as const;

describe("a pinned row that changes parent is recorded as displaced", () => {
  it("writes the record naming the parent it left, and where in it", () => {
    const { state, pinnedId, toId, fromId } = fixture();
    const { next } = runCommand(state, moveTo([pinnedId], toId));
    const ledger = recordedLedger(next.document);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.topicId).toBe(pinnedId);
    expect(ledger[0]!.kind).toBe("pin");
    expect(ledger[0]!.originalParentId).toBe(fromId);
    expect(ledger[0]!.originalParentTitle).toBe("Getting started");
    // Its position among the siblings it left — a recorded MEASUREMENT
    // of a past arrangement, which the projection uses once to place a
    // restoration and nothing ever looks a node up by.
    expect(ledger[0]!.originalIndex).toBe(1);
  });

  it("leaves an UNPINNED row alone — the hand's consent is the gesture", () => {
    // The minimal pair's boring half. A manual reparent carries its
    // consent in the gesture (docs/16), so it records nothing; a
    // `consent` record is written only by a RUN that had none to give.
    const { state, plainId, toId } = fixture();
    const { next } = runCommand(state, moveTo([plainId], toId));
    expect(recordedLedger(next.document)).toEqual([]);
  });

  it("leaves a pinned row alone when only its INDEX changed", () => {
    // PARENT CHANGE ONLY, matching the net it mirrors: no lock kind says
    // anything about POSITION, so a reorder among a row's own siblings
    // has displaced nothing.
    const { state, pinnedId, fromId } = fixture();
    const { next } = runCommand(state, moveTo([pinnedId], fromId, 0));
    expect(next.document.sections[0]!.topics.map((t) => t.title)).toEqual([
      "Using the Project Manager",
      "Intro",
    ]);
    expect(recordedLedger(next.document)).toEqual([]);
  });

  it("records only the pinned members of a mixed selection", () => {
    const { state, pinnedId, plainId, toId } = fixture();
    const { next } = runCommand(state, moveTo([plainId, pinnedId], toId));
    expect(recordedLedger(next.document).map((r) => r.topicId)).toEqual([pinnedId]);
  });

  it("NEVER OVERWRITES an origin: a row that moved twice still came from the source", () => {
    // A record that drifted would launder a pinned move into a shorter
    // one on every subsequent move — `validate.ts` says the same thing
    // at its own classifier, and the two sites must not disagree.
    const { state, pinnedId, toId, fromId } = fixture();
    const once = runCommand(state, moveTo([pinnedId], toId)).next;
    const twice = runCommand(once, moveTo([pinnedId], fromId, 0)).next;
    // Landing at index 0 of its ORIGINAL parent is landing home, so this
    // second move clears rather than rewrites — assert the third case.
    expect(recordedLedger(twice.document)).toEqual([]);
  });

  it("keeps the original origin when the row moves on to a THIRD parent", () => {
    const d: TocDocument = doc([
      section("A", [{ ...topic("row"), lock: { kind: "outside-region" as const } }]),
      section("B", []),
      section("C", []),
    ]);
    const state: EditorState = {
      document: d,
      columns: [d.sections.map((s) => s.id)],
      view: { globalDepth: 2, cardDepths: {} },
    };
    const rowId = d.sections[0]!.topics[0]!.id;
    const one = runCommand(state, moveTo([rowId], d.sections[1]!.id)).next;
    const two = runCommand(one, moveTo([rowId], d.sections[2]!.id)).next;
    expect(recordedLedger(two.document)[0]!.originalParentTitle).toBe("A");
  });

  it("RECORDS a pinned row dragged out to a card, which it used to refuse", () => {
    /**
     * THE REFUSAL THIS TEST USED TO ASSERT IS GONE (docs/22, arc 2 —
     * OR-5c). It read "refuses to turn a pinned row into a CARD, rather
     * than recording it", and its stated reason was structural: every
     * `LedgerRecord` names a ROW, `Section` has no `lock`, so a promoted
     * pinned row would be a displacement the badge could not show, the
     * checklist could not list and the projection could not return home.
     *
     * OR-5c makes that reason FALSE BY CONSTRUCTION rather than
     * overriding it: a pinned parented entry is now WRAPPED instead of
     * promoted, so the entry stays a ROW inside the born card, the pin
     * rides with it, and the displacement is an ordinary cross-parent
     * one. The old claim was right about promotion and is simply no
     * longer about this gesture.
     *
     * Rewritten rather than deleted, because the claim that replaces it
     * is the same claim inverted, and a deleted test leaves nothing
     * asserting the new one.
     */
    const { state, pinnedId, fromId } = fixture();
    const { next, entry } = runCommand(state, {
      type: "moveTopicsToNewSection",
      topicIds: [pinnedId],
      title: "New card",
      toColumn: 0,
      toIndexInColumn: 0,
    });
    expect(entry).not.toBeNull();
    expect(next.document.sections).toHaveLength(3);

    // THIS ROW IS CHILDLESS, so the birth is the STANDALONE — where the
    // pin survives on `topics[0]` exactly as it does inside any card,
    // and the supplied title is ignored because the card IS its entry.
    // (The pinned PARENTED entry takes the wrap branch instead; that
    // half lives in `ruledBirths.test.ts` with the rest of fence 6.)
    const born = next.document.sections.find((s) => s.isOrphan)!;
    expect(born.title).toBe("Using the Project Manager");
    const row = born.topics.find((t) => t.id === pinnedId)!;
    expect(row.lock).toBeDefined();
    // AND THE LEDGER NAMES IT — the fact the old refusal said could not
    // exist.
    const ledger = recordedLedger(next.document);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.topicId).toBe(pinnedId);
    expect(ledger[0]!.originalParentTitle).toBe(
      state.document.sections.find((s) => s.id === fromId)!.title,
    );
  });

  it("still lets an UNPINNED row become a card — the complement", () => {
    // A NET IS PINNED ONLY WHEN BOTH ITS ANSWERS ARE. Without this, a
    // predicate inverted to refuse every new-section drop would pass the
    // block above and nothing would contradict it.
    const { state, plainId } = fixture();
    const { next, entry } = runCommand(state, {
      type: "moveTopicsToNewSection",
      topicIds: [plainId],
      title: "New card",
      toColumn: 0,
      toIndexInColumn: 0,
    });
    expect(entry).not.toBeNull();
    expect(next.document.sections).toHaveLength(3);
  });
});

describe("the move and the record are ONE undoable unit", () => {
  it("undo restores the move AND erases the record; redo restores both", () => {
    const { state, pinnedId } = fixture();
    const displaced = runCommand(
      state,
      moveTo([pinnedId], state.document.sections[1]!.id),
    );
    expect(recordedLedger(displaced.next.document)).toHaveLength(1);

    const undone = applyUndo(displaced.next, displaced.entry!);
    expect(recordedLedger(undone.document)).toEqual([]);
    expect(undone.document.sections[0]!.topics.map((t) => t.title)).toEqual([
      "Intro",
      "Using the Project Manager",
    ]);

    const redone = applyRedo(undone, displaced.entry!);
    expect(recordedLedger(redone.document)).toHaveLength(1);
    expect(redone.document.sections[1]!.topics.map((t) => t.title)).toEqual([
      "Using the Project Manager",
      "First tutorial",
    ]);
  });
});
