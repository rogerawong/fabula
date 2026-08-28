/**
 * FENCE 7 — the species predicates' MINIMAL PAIRS, in one document each
 * (docs/22, the state/transition conflation rule).
 *
 * A PREDICATE THAT DISTINGUISHES A STATE FROM A TRANSITION INTO IT gets
 * its fixture built as a pair, because the two read identically and a
 * fixture holding only the interesting case cannot show that the boring
 * one is treated differently — it is VACUOUS rather than wrong, and a
 * passing suite says nothing.
 *
 * Three pairs are owed. `standalone / promoted / wrapped` and
 * `untitled / renamed` live with their producers
 * (`ruledBirths.test.ts`, `untitled.test.ts`); this file carries the
 * third — BORN versus CONVERTED — which has no other home because it is
 * the one pair whose two halves are produced by two different gestures.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "./fixtures";
import { runCommand } from "@/commands/dispatcher";
import type { EditorState } from "@/commands/types";
import type { Section, TocDocument } from "../types";

/**
 * ONE DOCUMENT, TWO CARDS, ONE OF EACH.
 *
 * `Lonely` is a standalone that will be BORN into a section by a drag —
 * a card that did not exist before the gesture. `Wrapper` is a
 * standalone that will be CONVERTED by a second drop — a card that
 * existed and changed species. The observable difference is what the
 * arrangement holds afterwards, and the point of the pair is that
 * neither predicate may answer by counting rows.
 */
function pair(): {
  state: EditorState;
  d: TocDocument;
  lonely: Section;
  wrapper: Section;
} {
  const lonely: Section = {
    ...section("Lonely", [{ ...topic("Lonely"), path: "lonely.md" }]),
    path: "lonely.md",
    isOrphan: true,
  };
  const wrapper: Section = {
    ...section("Wrapper", [{ ...topic("Wrapper"), path: "wrapper.md" }]),
    path: "wrapper.md",
    isOrphan: true,
  };
  const d = doc([lonely, wrapper, section("Source", [topic("Mover")])]);
  return {
    state: {
      document: d,
      columns: [d.sections.map((s) => s.id)],
      view: { globalDepth: 2, cardDepths: {} },
    },
    d,
    lonely: d.sections[0]!,
    wrapper: d.sections[1]!,
  };
}

describe("BORN versus CONVERTED — two gestures, one observable species", () => {
  it("a birth adds a card; a conversion does not", () => {
    const { state, d, wrapper } = pair();
    const mover = d.sections[2]!.topics[0]!.id;

    const born = runCommand(state, {
      type: "moveTopicsToNewSection",
      topicIds: [mover],
      toColumn: 0,
      toIndexInColumn: 3,
    }).next;
    expect(born.document.sections).toHaveLength(4);

    const converted = runCommand(state, {
      type: "moveTopics",
      topicIds: [mover],
      toSectionId: wrapper.id,
      toParentTopicId: null,
      toIndex: 1,
    }).next;
    expect(converted.document.sections).toHaveLength(3);
  });

  it("BOTH end as sections wearing a placeholder — species is not provenance", () => {
    /**
     * THE POINT OF THE PAIR. A born wrap and a converted standalone are
     * the SAME species: has-heading, placeholder, entries beneath. No
     * motive is recorded anywhere (R4), so nothing downstream may branch
     * on which gesture produced the card — and a predicate that could
     * tell them apart would be storing the motive by accident.
     */
    const { state, d, wrapper } = pair();
    const mover = d.sections[2]!.topics[0]!.id;

    const converted = runCommand(state, {
      type: "moveTopics",
      topicIds: [mover],
      toSectionId: wrapper.id,
      toParentTopicId: null,
      toIndex: 1,
    }).next.document.sections.find((s) => s.id === wrapper.id)!;

    // BY IDENTITY, NOT BY INDEX. Dragging the Lonely standalone's only
    // row out empties it and `pruneEmptyOrphans` removes the husk, so
    // the born card's index is not the one it was dropped at — the same
    // re-query-after-a-mutation rule the paint checks follow, applied to
    // a fixture.
    const before = new Set(state.document.sections.map((s) => s.id));
    const bornWrap = runCommand(state, {
      type: "moveTopicsToNewSection",
      topicIds: [mover, d.sections[0]!.topics[0]!.id],
      toColumn: 0,
      toIndexInColumn: 3,
    }).next.document.sections.find((s) => !before.has(s.id))!;

    for (const card of [converted, bornWrap]) {
      expect(card.isOrphan).toBeUndefined();
      expect(card.title).toBe("New section");
      expect(card.untitled).toBe(true);
      expect(card.path).toBeUndefined();
    }
  });

  it("the UNCHANGED standalone beside them stays a standalone", () => {
    // The boring half of the pair, in the same document: a fixture with
    // only the interesting cases cannot show that an untouched card is
    // treated differently.
    const { state, d, wrapper } = pair();
    const mover = d.sections[2]!.topics[0]!.id;
    const after = runCommand(state, {
      type: "moveTopics",
      topicIds: [mover],
      toSectionId: wrapper.id,
      toParentTopicId: null,
      toIndex: 1,
    }).next.document;
    const untouched = after.sections.find((s) => s.id === d.sections[0]!.id)!;
    expect(untouched.isOrphan).toBe(true);
    expect(untouched.untitled).toBeUndefined();
    expect(untouched.title).toBe("Lonely");
  });
});
