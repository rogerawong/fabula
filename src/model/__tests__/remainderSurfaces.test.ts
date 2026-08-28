/**
 * remainderSurfaces.test.ts — the Overview lines and the unhoused
 * predicate (docs/22, Decision 5).
 *
 * ONE PREDICATE, THREE CONSUMERS. "Does this card have a home this
 * format can write?" was computed in three places that could disagree:
 * `lintContainers` returned it on the before-state and every caller was
 * a test, the Mintlify write path recomputed it at serialize, and no
 * product surface asked it at all. It becomes one selector here, with
 * the write path and the Overview as its two product consumers — the
 * drift `guards.ts` exists to prevent, one layer up.
 *
 * THE EXPORT REFUSAL STAYS THE FLOOR AND STOPS BEING THE FIRST NOTICE.
 * A card with no home is visible on the canvas the whole time; being
 * told about it only at Save is being told at the worst moment.
 *
 * A FACT THE DOCUMENT LACKS EMITS NO FINDING — the selector's own rule.
 * A line per kind would give a clean document a page of zeroes, and "0
 * imagined cards" reads as a fact somebody measured.
 */

import { describe, expect, it } from "vitest";
import { buildTier1 } from "../report";
import { unhousedSections } from "../containers";
import { doc, section, topic } from "./fixtures";
import type { ContainerDescriptor, Section, TocDocument } from "../types";
import type { StructuralRemainder } from "../remainders";

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
    kind: "tab",
    order: 1,
    accepts: { sections: true, orphans: false },
    mayEmpty: false,
  },
];

function docWith(sections: Section[]): TocDocument {
  return { ...doc(sections), containers: CONTAINERS };
}

const chained = (s: Section, chain: string[]): Section => ({ ...s, chain });

describe("the unhoused predicate", () => {
  it("names a section sitting in a container that bears none", () => {
    const stray = section("Install", [topic("a")]);
    const found = unhousedSections(docWith([stray]));
    expect(found.map((s) => s.title)).toEqual(["Install"]);
  });

  it("says nothing about a card in a home that bears it", () => {
    const housed = chained(section("Install", [topic("a")]), ["Guides"]);
    expect(unhousedSections(docWith([housed]))).toEqual([]);
  });

  it("carves out SEALED standalones — the $ref case, same rule as the write path", () => {
    const ref: Section = {
      ...section("./fr.json", [topic("fr")]),
      isOrphan: true,
      sealed: { source: "./fr.json" },
    };
    expect(unhousedSections(docWith([ref]))).toEqual([]);
  });

  it("does NOT carve out an unsealed standalone", () => {
    const stray: Section = { ...section("Standalone", [topic("a")]), isOrphan: true };
    expect(unhousedSections(docWith([stray])).map((s) => s.title)).toEqual([
      "Standalone",
    ]);
  });

  it("checks nothing where the document declares no containers", () => {
    // A GUARD CONSUMES DECLARED INPUTS. A document that declared nothing
    // is not one whose homes bear nothing.
    const stray = section("Install", [topic("a")]);
    expect(unhousedSections(doc([stray]))).toEqual([]);
  });
});

describe("the Overview's unhoused attention line", () => {
  it("appears with the two-remedy copy, in-app remedy first", () => {
    const stray = section("Install", [topic("a")]);
    const report = buildTier1(docWith([stray]));
    const line = report.findings.find((f) => f.id === "unhoused");
    expect(line).toBeDefined();
    expect(line!.count).toBe(1);
    // IN-APP REMEDY FIRST, by-hand second, blaming neither.
    expect(line!.receipt).toMatch(/drag/i);
    expect(line!.receipt).toMatch(/yourself|by hand/i);
  });

  it("focuses the card, because the card is on screen", () => {
    const stray = section("Install", [topic("a")]);
    const report = buildTier1(docWith([stray]));
    const line = report.findings.find((f) => f.id === "unhoused")!;
    expect(line.subjects).toHaveLength(1);
    expect(line.subjects[0]!.sectionId).toBe(stray.id);
    expect(line.subjects[0]!.topicId).toBeUndefined();
  });

  it("means the FILES should change, so it earns the error tier", () => {
    // The tier-membership test: a card with no home is not a boundary of
    // the app's editing model — it is a state the user has to resolve,
    // in the app or in the file.
    const stray = section("Install", [topic("a")]);
    const report = buildTier1(docWith([stray]));
    // ASSERTED ON THE DECLARED FIELD. The first version of this test read
    // `.attention`, which `ReportFinding` does not have — it passed on
    // `undefined === undefined` until the compiler was asked.
    expect(report.findings.find((f) => f.id === "unhoused")!.severity).toBe("warning");
  });

  it("is ABSENT from a document with every card housed", () => {
    const housed = chained(section("Install", [topic("a")]), ["Guides"]);
    const report = buildTier1(docWith([housed]));
    expect(report.findings.find((f) => f.id === "unhoused")).toBeUndefined();
  });
});

describe("the Overview's structural lines", () => {
  const D = doc([section("Guides", [topic("Install")])]);
  const remainders: StructuralRemainder[] = [
    {
      kind: "creation",
      sectionId: D.sections[0]!.id,
      title: "Workflow",
      species: "section",
      ownKey: "~Workflow",
      memberKeys: ["guides/install"],
    },
    { kind: "card-order", moved: [{ sectionId: "s1", title: "Guides", from: 0, to: 1 }] },
    {
      kind: "row-order",
      parentId: D.sections[0]!.id,
      parentTitle: "Guides",
      rows: [{ topicId: "t", title: "Install" }],
      lockKind: "outside-region",
    },
  ];

  it("gives creation its own line, focusable on the card", () => {
    const line = buildTier1(D, remainders).findings.find((f) => f.id === "created-cards");
    expect(line).toBeDefined();
    expect(line!.count).toBe(1);
    expect(line!.subjects[0]!.sectionId).toBe(D.sections[0]!.id);
  });

  it("gives card order its own line, and it is NOT a per-card count", () => {
    const line = buildTier1(D, remainders).findings.find((f) => f.id === "card-order");
    expect(line).toBeDefined();
    // ONE FACT. The receipt may name how many cards moved; the count is
    // the number of things to do, which is one.
    expect(line!.count).toBe(1);
  });

  it("gives row order a line that focuses its CARRIER card", () => {
    const line = buildTier1(D, remainders).findings.find((f) => f.id === "row-order");
    expect(line).toBeDefined();
    expect(line!.subjects[0]!.sectionId).toBe(D.sections[0]!.id);
  });

  it("emits no structural lines at all for a clean arrangement", () => {
    const clean = buildTier1(D, []);
    for (const id of ["created-cards", "card-order", "row-order"]) {
      expect(
        clean.findings.find((f) => f.id === id),
        id,
      ).toBeUndefined();
    }
  });

  it("a caller passing no report gets exactly the shipped panel", () => {
    expect(buildTier1(D)).toEqual(buildTier1(D, []));
  });
});

describe("the salience economy — one warning tone, spent once", () => {
  it("the structural lines stay QUIET; only the unhoused line is a warning", () => {
    // Spending the warning tone on a boundary of the app's editing model
    // would cost the error tier its jump (docs/19). A created card is
    // not a corpus defect; a card with nowhere to go blocks the export.
    const D = doc([section("Guides", [topic("Install")])]);
    const report = buildTier1(D, [
      {
        kind: "creation",
        sectionId: D.sections[0]!.id,
        title: "Workflow",
        species: "section",
        ownKey: "~Workflow",
        memberKeys: [],
      },
      {
        kind: "row-order",
        parentId: D.sections[0]!.id,
        parentTitle: "Guides",
        rows: [],
        lockKind: "outside-region",
      },
    ]);
    for (const id of ["created-cards", "card-order", "row-order"]) {
      expect(report.findings.find((f) => f.id === id)?.severity, id).toBeUndefined();
    }
  });
});
