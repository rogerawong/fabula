/**
 * remainderChecklist.test.ts — the checklist and its counts, extended to
 * the three structural kinds (docs/22, Decision 5).
 *
 * ONE GRAMMAR, KIND-SPECIFIC REMEDIES. Every item reads cause →
 * consequence → remedy, the grammar the lock legend already speaks, and
 * each remedy names the SMALLEST REAL ACT — not "fix your files" but the
 * one edit that would make this arrangement writable.
 *
 * COUNTS SPLIT BY KIND, WITH THEIR UNITS. These are different questions
 * and a bare sum reads as one measurement gone wrong: three displaced
 * rows, one imagined card and two frozen blocks are not "six things",
 * they are six items of four kinds with four different remedies.
 *
 * FENCE 10's SECOND HALF: the renderer switches exhaustively over the
 * remainder kinds, so a new kind fails `pnpm check` here as well as at
 * the verb function — a kind cannot ship unlabelled.
 */

import { describe, expect, it } from "vitest";
import { buildChecklist, checklistText } from "../ledger";
import { doc, section, topic } from "./fixtures";
import type { StructuralRemainder } from "../remainders";
import type { TocDocument } from "../types";

const DOC: TocDocument = doc([
  section("Guides", [topic("Install"), topic("Usage")]),
  section("Reference", [topic("API")]),
]);

const creation = (over: Partial<StructuralRemainder> = {}): StructuralRemainder =>
  ({
    kind: "creation",
    sectionId: "s-new",
    title: "Workflow",
    species: "section",
    ownKey: "~Workflow",
    memberKeys: ["guides/install", "guides/usage"],
    cardNoun: "toctree block",
    carrierPath: "index",
    ...over,
  }) as StructuralRemainder;

const cardOrder: StructuralRemainder = {
  kind: "card-order",
  moved: [{ sectionId: "s1", title: "Guides", from: 0, to: 1 }],
  cardNoun: "toctree block",
  carrierPath: "index",
};

const rowOrder = (lockKind: "outside-region" | "globbed"): StructuralRemainder => ({
  kind: "row-order",
  carrierPath: "guides/index",
  parentId: "t-host",
  parentTitle: "Guides",
  rows: [
    { topicId: "a", title: "Frozen A" },
    { topicId: "b", title: "Frozen B" },
  ],
  lockKind,
});

const items = (remainders: StructuralRemainder[]) =>
  buildChecklist(DOC, [], { consentDeclined: false, remainders });

describe("the creation item", () => {
  it("names the card, the consequence and the smallest real act", () => {
    const [item] = items([creation()]);
    expect(item!.headline).toContain("Workflow");
    expect(item!.headline).toMatch(/imagined as a new card/i);
    expect(item!.cause).toContain("toctree block");
    expect(item!.remedy).toContain("index");
  });

  it("lists the members by their natural keys, so the remedy is actionable", () => {
    const [item] = items([creation()]);
    expect(item!.remedy).toContain("guides/install");
    expect(item!.remedy).toContain("guides/usage");
  });

  it("says STANDALONE ENTRY rather than orphan for the other species", () => {
    // OR-1: "orphan" names a parse mechanism, not a thing a writer chose
    // to make. The user-facing word is the ruled one.
    const [item] = items([creation({ species: "standalone" })]);
    expect(item!.headline.toLowerCase()).not.toContain("orphan");
    expect(item!.headline.toLowerCase()).toContain("standalone");
  });

  it("degrades without the format's noun rather than inventing one", () => {
    // A GUARD CONSUMES DECLARED INPUTS, applied to copy: an adapter that
    // names no noun gets a sentence that is still true.
    const [item] = items([creation({ cardNoun: undefined, carrierPath: undefined })]);
    expect(item!.cause).not.toContain("undefined");
    expect(item!.remedy).not.toContain("undefined");
  });
});

describe("the card-order item", () => {
  it("is ONE item however many cards moved", () => {
    const many: StructuralRemainder = {
      kind: "card-order",
      moved: [
        { sectionId: "s1", title: "Guides", from: 0, to: 2 },
        { sectionId: "s2", title: "Reference", from: 1, to: 0 },
        { sectionId: "s3", title: "API", from: 2, to: 1 },
      ],
      cardNoun: "toctree block",
      carrierPath: "index",
    };
    expect(items([many])).toHaveLength(1);
  });

  it("names the by-hand edit and the caption that travels with a block", () => {
    const [item] = items([cardOrder]);
    expect(item!.headline).toMatch(/different order/i);
    expect(item!.remedy).toContain("index");
    expect(item!.remedy).toMatch(/caption/i);
  });
});

describe("the row-order item speaks the lock legend's own unbolt words", () => {
  it("outside-region names moving the run to the end of the file", () => {
    const [item] = items([rowOrder("outside-region")]);
    expect(item!.cause).toContain("guides/index");
    expect(item!.remedy).toContain("move the toctree run to the end of guides/index");
    expect(item!.remedy).toMatch(/re-import/);
  });

  it("globbed names replacing the pattern", () => {
    const [item] = items([rowOrder("globbed")]);
    expect(item!.remedy).toMatch(/pattern/i);
  });

  it("ONE item per frozen block, and it names the block's carrier card", () => {
    const two = [rowOrder("outside-region"), rowOrder("globbed")];
    expect(items(two)).toHaveLength(2);
    expect(items(two)[0]!.headline).toContain("Guides");
  });
});

describe("the counts split by kind, with their units", () => {
  it("names each kind rather than summing them", () => {
    const lines = checklistText(
      items([creation(), cardOrder, rowOrder("outside-region"), rowOrder("globbed")]),
    );
    const head = lines[0]!;
    expect(head).toContain("4 items");
    expect(head).toContain("1 new card");
    expect(head).toContain("1 card order");
    expect(head).toContain("2 blocks");
  });

  it("keeps the shipped row/group units alongside the new ones", () => {
    // The two questions the split already answered do not move: this is
    // an extension, not a replacement.
    const lines = checklistText(items([creation()]));
    expect(lines[0]).toMatch(/needs your hand/i);
  });

  it("says nothing about a kind the arrangement does not hold", () => {
    // A line per kind would give a clean document a page of zeroes, and
    // "0 new cards" reads as a fact somebody measured.
    const lines = checklistText(items([rowOrder("outside-region")]));
    expect(lines[0]).not.toContain("new card");
    expect(lines[0]).not.toContain("card order");
  });

  it("a single item of one kind reads in the singular", () => {
    const lines = checklistText(items([rowOrder("outside-region")]));
    expect(lines[0]).toContain("1 block");
    expect(lines[0]).not.toContain("1 blocks");
  });
});

describe("every structural item lands in NEEDS-HAND, never DECLINED", () => {
  it("declined is for a choice the user made, not a wall", () => {
    // "The app cannot write this" and "you chose not to write this
    // today" are different facts, and a structural remainder is never
    // the second one.
    for (const item of items([creation(), cardOrder, rowOrder("globbed")])) {
      expect(item.group).toBe("needs-hand");
    }
  });
});

describe("ABSENT REMAINDERS CHANGE NOTHING", () => {
  it("a caller that passes none gets exactly the shipped checklist", () => {
    expect(buildChecklist(DOC, [], { consentDeclined: false })).toEqual(
      buildChecklist(DOC, [], { consentDeclined: false, remainders: [] }),
    );
  });
});
