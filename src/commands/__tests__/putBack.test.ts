/**
 * putBack.test.ts — returning one displaced row home (docs/21,
 * Decision 3).
 *
 * ONE COMMAND, TWO EFFECTS, ONE UNDO. The move and the record's erasure
 * ride the same Immer patch set, so undo removes both by inversion and
 * there is nothing to keep in step. That is the whole reason `displaced`
 * is model data rather than a side table.
 *
 * LEGAL BY CONSTRUCTION. `commands/` has never enforced locks — the
 * enforcement sites are the drag, the keyboard and the AI net — so this
 * needs no exemption to move a pinned row. And it is safe by DIRECTION:
 * restoring the pin's truth cannot create a write hazard, which is why
 * it deliberately does not consult `topicMoveRefusal`. Routing it
 * through that discriminant would refuse the one gesture whose whole
 * purpose is to undo a refusal-class arrangement.
 *
 * THE CONVENIENT GESTURE, NOT THE ONLY ONE. Any move that lands a row
 * back at its origin clears the record — putting a thing back is not a
 * displacement, whoever does it — and that half is asserted here too,
 * because a rule with one enforcement site is a rule the other site
 * disagrees with.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import { recordedLedger } from "@/model/ledger";
import type { TocDocument } from "@/model/types";
import { applyUndo, labelFor, runCommand } from "../dispatcher";
import type { EditorState, UndoEntry } from "../types";
import { randomCommand } from "./arbitraries";
import { ledgeredEditor } from "./helpers";

/** Getting started → [Intro, (pinned) Project Manager]; Tutorials → [First] */
function ledgered(): { state: EditorState; movedId: string; homeId: string } {
  const d: TocDocument = doc([
    section("Getting started", [topic("Intro")]),
    section("Tutorials", [topic("First tutorial")]),
  ]);
  const home = d.sections[0]!;
  const moved = {
    ...topic("Using the Project Manager"),
    lock: { kind: "outside-region" as const },
    displaced: {
      parentId: home.id,
      parentTitle: home.title,
      index: 1,
      kind: "pin" as const,
    },
  };
  d.sections[1]!.topics.push(moved);
  return {
    state: {
      document: d,
      columns: [[d.sections[0]!.id, d.sections[1]!.id]],
      view: { globalDepth: 2, cardDepths: {} },
    },
    movedId: moved.id,
    homeId: home.id,
  };
}

describe("putBackTopic", () => {
  it("returns the row to its original parent at its original index", () => {
    const { state, movedId } = ledgered();
    const { next } = runCommand(state, { type: "putBackTopic", topicId: movedId });
    expect(next.document.sections[0]!.topics.map((t) => t.title)).toEqual([
      "Intro",
      "Using the Project Manager",
    ]);
    expect(next.document.sections[1]!.topics.map((t) => t.title)).toEqual([
      "First tutorial",
    ]);
  });

  it("clears the record in the same command", () => {
    const { state, movedId } = ledgered();
    const { next } = runCommand(state, { type: "putBackTopic", topicId: movedId });
    expect(recordedLedger(next.document)).toEqual([]);
  });

  it("undoes the move and the erasure together", () => {
    const { state, movedId } = ledgered();
    const { next, entry } = runCommand(state, {
      type: "putBackTopic",
      topicId: movedId,
    });
    const back = applyUndo(next, entry!);
    expect(back.document.sections[1]!.topics.map((t) => t.title)).toEqual([
      "First tutorial",
      "Using the Project Manager",
    ]);
    expect(recordedLedger(back.document)).toHaveLength(1);
  });

  it("moves a PINNED row, which no other command path would", () => {
    // The drag refuses a locked row and the AI net refuses a locked
    // move; this one restores the pin's own truth, so the direction is
    // what makes it safe.
    const { state, movedId } = ledgered();
    const { entry } = runCommand(state, { type: "putBackTopic", topicId: movedId });
    expect(entry).not.toBeNull();
  });

  it("carries the row's subtree with it", () => {
    const { state, movedId } = ledgered();
    const row = state.document.sections[1]!.topics[1]!;
    row.children.push(topic("child"));
    const { next } = runCommand(state, { type: "putBackTopic", topicId: movedId });
    expect(next.document.sections[0]!.topics[1]!.children.map((t) => t.title)).toEqual([
      "child",
    ]);
  });

  it("restores under an original PARENT TOPIC, not just a card", () => {
    const d: TocDocument = doc([
      section("A", [{ ...topic("Parent"), children: [topic("kept")] }]),
      section("B", []),
    ]);
    const parent = d.sections[0]!.topics[0]!;
    const moved = {
      ...topic("Wanderer"),
      displaced: {
        parentId: parent.id,
        parentTitle: "Parent",
        index: 0,
        kind: "pin" as const,
      },
    };
    d.sections[1]!.topics.push(moved);
    const state: EditorState = {
      document: d,
      columns: [[d.sections[0]!.id, d.sections[1]!.id]],
      view: { globalDepth: 2, cardDepths: {} },
    };
    const { next } = runCommand(state, { type: "putBackTopic", topicId: moved.id });
    expect(next.document.sections[0]!.topics[0]!.children.map((t) => t.title)).toEqual([
      "Wanderer",
      "kept",
    ]);
  });

  it("is a no-op on a row with no record — nothing to put back", () => {
    const { state } = ledgered();
    const plain = state.document.sections[0]!.topics[0]!.id;
    expect(runCommand(state, { type: "putBackTopic", topicId: plain }).entry).toBeNull();
  });

  it("is a no-op when the original parent is gone", () => {
    // A guard consumes DECLARED inputs: with nowhere to restore
    // membership to, this does nothing rather than inventing a home.
    const { state, movedId } = ledgered();
    state.document.sections.splice(0, 1);
    expect(
      runCommand(state, { type: "putBackTopic", topicId: movedId }).entry,
    ).toBeNull();
  });

  it("names the row in its undo label", () => {
    const { state, movedId } = ledgered();
    const { entry } = runCommand(state, { type: "putBackTopic", topicId: movedId });
    expect(entry!.label).toBe('Put "Using the Project Manager" back');
    expect(labelFor({ type: "putBackTopic", topicId: movedId }, {})).toContain(
      "Put back",
    );
  });
});

describe("any move that lands a row home clears its record", () => {
  it("clears when an ordinary drag returns the row to its origin", () => {
    // Putting a thing back is not a displacement, whoever does it — so
    // the rule cannot live only in the convenient gesture.
    const { state, movedId, homeId } = ledgered();
    const { next } = runCommand(state, {
      type: "moveTopics",
      topicIds: [movedId],
      toSectionId: homeId,
      toParentTopicId: null,
      toIndex: 1,
    });
    expect(next.document.sections[0]!.topics.map((t) => t.title)).toContain(
      "Using the Project Manager",
    );
    expect(recordedLedger(next.document)).toEqual([]);
  });

  it("KEEPS the record when the row moves somewhere else again", () => {
    // The origin does not change because the row moved twice. A record
    // that drifted would launder a displacement into a shorter one.
    const { state, movedId } = ledgered();
    const d = state.document;
    d.sections.push({ id: "s3", title: "Third", topics: [] });
    state.columns = [[d.sections[0]!.id, d.sections[1]!.id, "s3"]];
    const { next } = runCommand(state, {
      type: "moveTopics",
      topicIds: [movedId],
      toSectionId: "s3",
      toParentTopicId: null,
      toIndex: 0,
    });
    const records = recordedLedger(next.document);
    expect(records).toHaveLength(1);
    expect(records[0]!.originalParentTitle).toBe("Getting started");
  });
});

describe("undo totality holds with put-back in the sequence (property)", () => {
  // HEAVY, NOT SLOW. The same property `undo-invariants.test.ts` runs,
  // over a LEDGERED document, because `randomCommand` can now generate
  // `putBackTopic` and on a document holding no records every such
  // command is a no-op — a branch that would look like coverage and be
  // vacuity. Shorter sequences than the main property: this is about
  // one command's two simultaneous mutations, not about the whole
  // command space.
  it("undoing every command restores the initial state", { timeout: 20000 }, () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 0x7fffffff }), {
          minLength: 0,
          maxLength: 12,
        }),
        (seeds) => {
          const initial = ledgeredEditor();
          let state = initial;
          const entries: UndoEntry[] = [];
          for (const seed of seeds) {
            const cmd = randomCommand(state, seed);
            if (!cmd) continue;
            const { next, entry } = runCommand(state, cmd);
            state = next;
            if (entry) entries.push(entry);
          }
          for (let i = entries.length - 1; i >= 0; i--) {
            state = applyUndo(state, entries[i]!);
          }
          expect(state).toEqual(initial);
        },
      ),
    );
  });

  it("the fixture really holds records — the branch is not vacuous", () => {
    expect(recordedLedger(ledgeredEditor().document).length).toBeGreaterThan(0);
  });
});
