/**
 * The reparent choke point (docs/14 Decision 3).
 *
 * The predicate is the PARENT, not the directory. In a path-addressed
 * system, nesting a page under a sibling in the same folder still moves
 * the file, so a directory-equality test would wave intra-card
 * re-nesting straight through — which is the case these tests exist to
 * pin.
 *
 * **[amended for docs/16] Hugo is no longer the refusing side.** It was
 * the only shipped adapter declaring `supportsReparent: false`, and step
 * 3 flipped it, so NO shipped adapter answers false today. The
 * mechanism stays because it is the contract point where a future
 * adapter declares which side of membership-is-path it is on — but a
 * mechanism with no producer is exactly what docs/13 warns reads as
 * shipped without being exercised. So the false side gets a FIXTURE
 * producer here, registered for these tests, and the true side is now
 * asserted against real Hugo.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { applyUndo, runCommand } from "../dispatcher";
import { randomCommand } from "./arbitraries";
import { topicReparentRefused } from "../guards";
import type { EditorState } from "../types";
import { initialColumns } from "@/layout/columns";
import { newId } from "@/model/id";
import type { TocDocument } from "@/model/types";
import { REFUSING } from "./refusingAdapter";
function docWith(formatId: string): TocDocument {
  const child = { id: newId(), title: "Child", path: "d/child.md", children: [] };
  const sibling = { id: newId(), title: "Sibling", path: "d/sibling.md", children: [] };
  const other = { id: newId(), title: "Other", path: "e/other.md", children: [] };
  return {
    id: newId(),
    name: "Doc",
    formatId,
    sections: [
      { id: newId(), title: "D", path: "d/_index.md", topics: [child, sibling] },
      { id: newId(), title: "E", path: "e/_index.md", topics: [other] },
    ],
  };
}

const stateOf = (doc: TocDocument): EditorState => ({
  document: doc,
  columns: initialColumns(doc),
  view: { globalDepth: 3, cardDepths: {} },
});

describe("a system that CANNOT reparent (a fixture adapter)", () => {
  it("refuses a cross-card move", () => {
    const doc = docWith(REFUSING);
    const state = stateOf(doc);
    const moving = doc.sections[0]!.topics[0]!;
    const { next, entry } = runCommand(state, {
      type: "moveTopics",
      topicIds: [moving.id],
      toSectionId: doc.sections[1]!.id,
      toParentTopicId: null,
      toIndex: 0,
    });
    expect(entry).toBeNull(); // no-op, nothing to undo
    expect(next).toBe(state);
  });

  it("refuses INTRA-CARD re-nesting — the case a directory test misses", () => {
    const doc = docWith(REFUSING);
    const state = stateOf(doc);
    const section = doc.sections[0]!;
    const { entry } = runCommand(state, {
      type: "moveTopics",
      topicIds: [section.topics[0]!.id],
      toSectionId: section.id,
      toParentTopicId: section.topics[1]!.id, // nest under its sibling
      toIndex: 0,
    });
    expect(entry).toBeNull();
  });

  it("refuses a drag to the canvas (a new section is a new parent)", () => {
    const doc = docWith(REFUSING);
    const state = stateOf(doc);
    const { entry } = runCommand(state, {
      type: "moveTopicsToNewSection",
      topicIds: [doc.sections[0]!.topics[0]!.id],
      toColumn: 0,
      toIndexInColumn: 0,
    });
    expect(entry).toBeNull();
  });

  it("ALLOWS a reorder — same parent, different index", () => {
    const doc = docWith(REFUSING);
    const state = stateOf(doc);
    const section = doc.sections[0]!;
    const { entry, next } = runCommand(state, {
      type: "moveTopics",
      topicIds: [section.topics[1]!.id],
      toSectionId: section.id,
      toParentTopicId: null,
      toIndex: 0,
    });
    expect(entry).not.toBeNull();
    expect(next.document.sections[0]!.topics.map((t) => t.title)).toEqual([
      "Sibling",
      "Child",
    ]);
  });
});

describe("Hugo, which now CAN reparent (docs/16 step 3)", () => {
  // The flip, asserted through the same wiring that used to refuse it.
  // Hugo's membership is its path, so this move relocates a file — the
  // consequence is disclosed at Review and mitigated by an alias, never
  // gated on an inbound-link count.
  it("allows a cross-card move", () => {
    const doc = docWith("hugo");
    const state = stateOf(doc);
    const { entry } = runCommand(state, {
      type: "moveTopics",
      topicIds: [doc.sections[0]!.topics[0]!.id],
      toSectionId: doc.sections[1]!.id,
      toParentTopicId: null,
      toIndex: 0,
    });
    expect(entry).not.toBeNull();
  });

  it("allows intra-card re-nesting, which also moves the file", () => {
    const doc = docWith("hugo");
    const state = stateOf(doc);
    const section = doc.sections[0]!;
    const { entry } = runCommand(state, {
      type: "moveTopics",
      topicIds: [section.topics[0]!.id],
      toSectionId: section.id,
      toParentTopicId: section.topics[1]!.id,
      toIndex: 0,
    });
    expect(entry).not.toBeNull();
  });
});

describe("a system that CAN reparent (docfx)", () => {
  it("allows the same cross-card move", () => {
    const doc = docWith("docfx");
    const state = stateOf(doc);
    const { entry } = runCommand(state, {
      type: "moveTopics",
      topicIds: [doc.sections[0]!.topics[0]!.id],
      toSectionId: doc.sections[1]!.id,
      toParentTopicId: null,
      toIndex: 0,
    });
    expect(entry).not.toBeNull();
  });
});

describe("the guard does not break undo", () => {
  // HEAVY, NOT SLOW. Times out at the default 5s only under whole-suite
  // parallelism on a loaded machine (measured at load average 19);
  // passes in isolation every time. Same class and same remedy as the
  // budgets above — a timeout carries no fast-check seed, so the
  // explicit budget is what stops the diagnosis being redone.
  it(
    "PROPERTY: any refused-or-applied sequence still undoes to pristine",
    { timeout: 20000 },
    () => {
      // The load-bearing invariant of the whole command layer, re-run on a
      // document whose adapter refuses reparents. A guard that returned a
      // half-mutated draft instead of a clean no-op would show up here and
      // nowhere else.
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 0, max: 9999 }), { maxLength: 25 }),
          (seeds) => {
            const doc = docWith(REFUSING);
            const pristine = JSON.stringify(doc);
            let state = stateOf(doc);
            const entries = [];
            for (const seed of seeds) {
              const command = randomCommand(state, seed);
              if (!command) continue;
              const { next, entry } = runCommand(state, command);
              state = next;
              if (entry) entries.push(entry);
            }
            for (const entry of entries.reverse()) state = applyUndo(state, entry);
            expect(JSON.stringify(state.document)).toBe(pristine);
            return true;
          },
        ),
      );
    },
  );
});

describe("one predicate, two consumers (cursor is its costume)", () => {
  // The drag layer paints `not-allowed` from topicReparentRefused and the
  // executor refuses from the SAME function. These assert the predicate
  // directly, because that is the thing both read — a test of the cursor
  // string would pin the costume and miss the body underneath.
  //
  // Hand-verification of the cursor itself is an Impeccable follow-up:
  // pointer state is not something a screenshot captures.
  const hugo = () => docWith(REFUSING);
  const docfx = () => docWith("docfx");

  it("refuses exactly the drops the executor refuses", () => {
    const doc = hugo();
    const [d, e] = doc.sections;
    const child = d!.topics[0]!;
    const sibling = d!.topics[1]!;

    // cross-card, intra-card re-nest, and drag-to-canvas: all refused
    expect(
      topicReparentRefused(doc, [child.id], { sectionId: e!.id, parentTopicId: null }),
    ).toBe(true);
    expect(
      topicReparentRefused(doc, [child.id], {
        sectionId: d!.id,
        parentTopicId: sibling.id,
      }),
    ).toBe(true);
    expect(topicReparentRefused(doc, [child.id], null)).toBe(true);

    // a reorder keeps its parent, so it is allowed and the cursor stays normal
    expect(
      topicReparentRefused(doc, [child.id], { sectionId: d!.id, parentTopicId: null }),
    ).toBe(false);
  });

  it("never refuses on a system that can reparent", () => {
    const doc = docfx();
    const [d, e] = doc.sections;
    expect(
      topicReparentRefused(doc, [d!.topics[0]!.id], {
        sectionId: e!.id,
        parentTopicId: null,
      }),
    ).toBe(false);
    expect(topicReparentRefused(doc, [d!.topics[0]!.id], null)).toBe(false);
  });

  it("agrees with the executor on every case above", () => {
    // the guarantee that matters: predicate true ⟺ command is a no-op
    const doc = hugo();
    const [d, e] = doc.sections;
    const child = d!.topics[0]!;
    for (const [to, cmd] of [
      [
        { sectionId: e!.id, parentTopicId: null },
        { toSectionId: e!.id, toParentTopicId: null },
      ],
      [
        { sectionId: d!.id, parentTopicId: d!.topics[1]!.id },
        { toSectionId: d!.id, toParentTopicId: d!.topics[1]!.id },
      ],
    ] as const) {
      const state = stateOf(docWith(REFUSING));
      const section = state.document.sections;
      const refused = topicReparentRefused(doc, [child.id], to);
      const { entry } = runCommand(state, {
        type: "moveTopics",
        topicIds: [section[0]!.topics[0]!.id],
        toSectionId: cmd.toSectionId === e!.id ? section[1]!.id : section[0]!.id,
        toParentTopicId: cmd.toParentTopicId ? section[0]!.topics[1]!.id : null,
        toIndex: 0,
      });
      expect(refused).toBe(true);
      expect(entry).toBeNull();
    }
  });
});
