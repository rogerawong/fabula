/**
 * cardMarks.test.ts — the card-level marks, and the tier they wear
 * (docs/22, Decision 5).
 *
 * THE TONES ARE THE TIER, and the test is the membership question
 * itself: does this mean something in the FILES should change? A created
 * card is a boundary of the app's editing model and stays in the intent
 * tone; a card with no home blocks the export and is the only card mark
 * that earns the warning token. Asserting that keeps the economy from
 * being eroded one sympathetic mark at a time.
 */

import { describe, expect, it } from "vitest";
import { cardMarks } from "../cardMarks";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { ContainerDescriptor, Section, TocDocument } from "@/model/types";
import type { StructuralRemainder } from "@/model/remainders";

const CONTAINERS: ContainerDescriptor[] = [
  {
    chainKey: "",
    label: "Top level",
    order: 0,
    accepts: { sections: false, orphans: false },
    mayEmpty: true,
  },
  {
    chainKey: "Guides",
    label: "Guides",
    order: 1,
    accepts: { sections: true, orphans: false },
    mayEmpty: false,
  },
];

const withContainers = (sections: Section[]): TocDocument => ({
  ...doc(sections),
  containers: CONTAINERS,
});

const creation = (
  id: string,
  title: string,
  species: "section" | "standalone" = "section",
) =>
  ({
    kind: "creation",
    sectionId: id,
    title,
    species,
    ownKey: `~${title}`,
    memberKeys: [],
  }) as StructuralRemainder;

describe("the created mark", () => {
  it("marks the created card in the INTENT tone", () => {
    const card = section("Workflow", [topic("a")]);
    const marks = cardMarks(doc([card]), [creation(card.id, "Workflow")]);
    expect(marks.get(card.id)?.kind).toBe("created");
    expect(marks.get(card.id)?.tone).toBe("var(--color-intent)");
  });

  it("says STANDALONE ENTRY, never orphan", () => {
    const card = section("Install", [topic("a")]);
    const marks = cardMarks(doc([card]), [creation(card.id, "Install", "standalone")]);
    const tip = marks.get(card.id)!.tooltip;
    expect(tip.toLowerCase()).toContain("standalone entry");
    expect(tip.toLowerCase()).not.toContain("orphan");
  });

  it("names the cause and points at the surface that lists the remedy", () => {
    const card = section("Workflow", [topic("a")]);
    const tip = cardMarks(doc([card]), [creation(card.id, "Workflow")]).get(
      card.id,
    )!.tooltip;
    expect(tip).toContain("cannot record");
    expect(tip).toContain("Review changes");
  });

  it("marks NOTHING where the arrangement holds no creations", () => {
    const card = section("Guides", [topic("a")]);
    expect(cardMarks(doc([card]), []).size).toBe(0);
  });
});

describe("the unhoused mark", () => {
  it("is the ONE card mark in the warning tone", () => {
    const stray = section("Install", [topic("a")]);
    const marks = cardMarks(withContainers([stray]), []);
    expect(marks.get(stray.id)?.kind).toBe("unhoused");
    expect(marks.get(stray.id)?.tone).toBe("var(--color-warning)");
  });

  it("states the in-app remedy FIRST and the by-hand remedy second", () => {
    const stray = section("Install", [topic("a")]);
    const tip = cardMarks(withContainers([stray]), []).get(stray.id)!.tooltip;
    expect(tip.indexOf("Drag")).toBeLessThan(tip.indexOf("yourself"));
    expect(tip).toContain("never edits containers");
  });

  it("says nothing about a card that has a home", () => {
    const housed: Section = { ...section("Install", [topic("a")]), chain: ["Guides"] };
    expect(cardMarks(withContainers([housed]), []).size).toBe(0);
  });
});

describe("a card that is BOTH shows the one that blocks", () => {
  it("prefers unhoused over created — one thing to do, one mark", () => {
    // Two marks on one card would be two competing calls to action for
    // one problem, and the one that stops the export is the one worth
    // showing.
    const stray = section("Workflow", [topic("a")]);
    const marks = cardMarks(withContainers([stray]), [creation(stray.id, "Workflow")]);
    expect(marks.size).toBe(1);
    expect(marks.get(stray.id)?.kind).toBe("unhoused");
  });
});

describe("THE TIER, asserted as the membership question", () => {
  it("exactly one mark kind means the FILES should change", () => {
    // The created card is HOUSED, or it would be unhoused too — which is
    // the ruling the previous block asserts and would make this fixture
    // measure the wrong thing.
    const created: Section = {
      ...section("Workflow", [topic("a")]),
      chain: ["Guides"],
    };
    const stray = section("Install", [topic("b")]);
    const housed: Section = { ...section("Ok", [topic("c")]), chain: ["Guides"] };
    const marks = cardMarks(withContainers([created, stray, housed]), [
      creation(created.id, "Workflow"),
    ]);
    const warning = [...marks.values()].filter((m) => m.tone === "var(--color-warning)");
    expect(warning).toHaveLength(1);
    expect(warning[0]!.kind).toBe("unhoused");
  });

  it("the two marks have different SILHOUETTES, not just different colours", () => {
    // Distinguishable at 50% canvas zoom and to a reader who cannot tell
    // the tones apart — the lock legend's own rule, one layer up.
    const created: Section = {
      ...section("Workflow", [topic("a")]),
      chain: ["Guides"],
    };
    const stray = section("Install", [topic("b")]);
    const marks = cardMarks(withContainers([created, stray]), [
      creation(created.id, "Workflow"),
    ]);
    expect(marks.get(created.id)!.glyph).not.toBe(marks.get(stray.id)!.glyph);
  });
});
