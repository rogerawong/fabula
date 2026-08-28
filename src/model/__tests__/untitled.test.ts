/**
 * THE PLACEHOLDER HEADING, and every surface that has to say so
 * (docs/22, Decision 2's placeholder rule and Decision 5's notice).
 *
 * `Section.untitled` is a fact about WHO CHOSE THE NAME, and its whole
 * job is pre-save legibility: export writes the text happily — the bytes
 * are legal, the name is merely nobody's — so no surface here refuses
 * anything. What they all do is say it out loud before Save, because a
 * card called "New section" that reaches a colleague's review is a card
 * nobody named and everybody assumed somebody had.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "./fixtures";
import { renameSection } from "../tree";
import { structuralCopy } from "../ledger";
import { untitledNotice } from "../naming";
import type { CreationRemainder } from "../remainders";
import type { Section } from "../types";

const creation = (over: Partial<CreationRemainder> = {}): CreationRemainder => ({
  kind: "creation",
  sectionId: "s1",
  title: "New section",
  species: "section",
  ownKey: "~New section",
  memberKeys: ["a", "b"],
  cardNoun: "toctree block",
  carrierPath: "index",
  ...over,
});

describe("an explicit rename clears the placeholder", () => {
  it("clears `untitled` — the name is now somebody's", () => {
    const s: Section = { ...section("New section", [topic("a")]), untitled: true };
    renameSection(s, "Deployment");
    expect(s.title).toBe("Deployment");
    expect(s.untitled).toBeUndefined();
  });

  it("leaves an ordinary card alone — the minimal pair's boring half", () => {
    const s: Section = section("Guides", [topic("a")]);
    renameSection(s, "Guides & tutorials");
    expect(s.untitled).toBeUndefined();
    expect(s.titleDerived).toBe(false);
  });
});

describe("the checklist appends the naming ask, and only where it is true", () => {
  it("adds the sentence for an untitled creation", () => {
    const copy = structuralCopy(creation({ untitled: true }));
    expect(copy.remedy).toContain("give it a name");
    expect(copy.remedy).toContain("placeholder");
  });

  it("says nothing about naming for a card the user or the model named", () => {
    // The exclusion asserted, not just the inclusion: a remedy that
    // always asked for a name would be telling a user to rename a card
    // they already named.
    expect(structuralCopy(creation()).remedy).not.toContain("give it a name");
  });
});

describe("the pre-save notice counts placeholders, and stays a notice", () => {
  it("names one", () => {
    const d = doc([
      { ...section("New section", [topic("a")]), untitled: true },
      section("Guides", [topic("b")]),
    ]);
    expect(untitledNotice(d)).toBe("1 section still has a placeholder name");
  });

  it("counts several, with the unit", () => {
    const d = doc([
      { ...section("New section", [topic("a")]), untitled: true },
      { ...section("New section", [topic("b")]), untitled: true },
    ]);
    expect(untitledNotice(d)).toBe("2 sections still have a placeholder name");
  });

  it("is ABSENT when nothing is unnamed — never '0 sections'", () => {
    // Not measured ≠ zero, and a clean document gets no line rather than
    // a page of zeroes (the Overview's own rule).
    expect(untitledNotice(doc([section("Guides", [topic("a")])]))).toBeNull();
  });
});
