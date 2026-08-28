/**
 * sphinxRemainders.test.ts — FENCE 1, the derivation oracle (docs/22,
 * Decision 3).
 *
 * THE DISPLAY IS ITS OWN ORACLE, wired. The structure report and the
 * planner's three refusals are two readings of ONE comparison, so the
 * planner is the oracle: the report is empty exactly when `planChanges`
 * raises none of `section-set-changed` / `card-reordered` / a
 * frozen-block warning, and each kind's presence predicts exactly its
 * refusal. A wrong derivation shows up as a wrong count on screen rather
 * than as nothing at all.
 *
 * WHY THE ORACLE IS THE PLANNER AND NOT A SECOND COMPARISON. Re-deriving
 * these three facts approximately in the neutral layer from locks and
 * keys would be a second copy of a rule — the drift `guards.ts` exists to
 * prevent. The derivation is the adapter's, extracted: one pure predicate
 * per kind, `planChanges` enforces on it, the hook shows it.
 *
 * WHAT THIS DOES NOT ENFORCE. Deletion is visible to the same comparison
 * and is deliberately not a kind (docs/22, OR-4), so the arrangements
 * generated here create, move and reorder — never delete. A generator
 * that deleted a card would refuse at `section-set-changed` with an empty
 * report, and that is the ruled behavior rather than a defect.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { sphinxAdapter } from "../adapters/sphinx";
import { filesOf, type FilesSnapshot } from "../types";
import { structureReport } from "@/model/remainders";
import { buildChecklist } from "@/model/ledger";
import { createSection } from "@/model/tree";
import type { SectionId, TocDocument } from "@/model/types";

const CONF = 'master_doc = "index"\nsource_suffix = ".rst"\n';

/** Two captioned root blocks; one nested host; one frozen (above-prose)
 *  block on that host, so every kind has a producer in one project. */
const PROJECT: FilesSnapshot = {
  "conf.py": CONF,
  "index.rst": [
    "Docs",
    "====",
    "",
    ".. toctree::",
    "   :caption: Guides",
    "",
    "   guides/index",
    "",
    ".. toctree::",
    "   :caption: Reference",
    "",
    "   reference/api",
    "   reference/cli",
    "",
  ].join("\n"),
  "guides/index.rst": [
    "Guides",
    "======",
    "",
    ".. toctree::",
    "",
    "   frozen-a",
    "   frozen-b",
    "",
    "Prose terminates the sequence, so the block above is outside the region.",
    "",
    ".. toctree::",
    "",
    "   install",
    "   usage",
    "",
  ].join("\n"),
  "guides/frozen-a.rst": "Frozen A\n========\n\nbody\n",
  "guides/frozen-b.rst": "Frozen B\n========\n\nbody\n",
  "guides/install.rst": "Install\n=======\n\nbody\n",
  "guides/usage.rst": "Usage\n=====\n\nbody\n",
  "reference/api.rst": "API\n===\n\nbody\n",
  "reference/cli.rst": "CLI\n===\n\nbody\n",
};

const parse = (files: FilesSnapshot = PROJECT): TocDocument =>
  sphinxAdapter.parse(files, "proj").doc;
const order = (doc: TocDocument): SectionId[] => doc.sections.map((s) => s.id);
const clone = <T>(v: T): T => structuredClone(v);

/** The three refusals this report is the other reading of. */
const REFUSALS = ["section-set-changed", "card-reordered"] as const;
const FROZEN = ["outside-region", "generated-block"] as const;

function refusalKinds(doc: TocDocument, ids: SectionId[]): string[] {
  const result = sphinxAdapter.planChanges!(filesOf(doc), doc, ids);
  return result.warnings.filter((w) => w.blocking).map((w) => w.kind);
}

function report(doc: TocDocument, ids: SectionId[] = order(doc)) {
  return structureReport(doc, filesOf(doc), ids);
}

const guidesHost = (d: TocDocument) =>
  d.sections.find((s) => s.title === "Guides")!.topics[0]!;

describe("the hook exists and is the adapter's own", () => {
  it("Sphinx implements structuralRemainders", () => {
    expect(typeof sphinxAdapter.structuralRemainders).toBe("function");
  });
});

describe("an unedited arrangement reports nothing and plans cleanly", () => {
  it("both readings are empty", () => {
    const doc = parse();
    expect(report(doc)).toEqual([]);
    expect(refusalKinds(doc, order(doc))).toEqual([]);
  });
});

describe("creation", () => {
  it("a created card reports one creation record and refuses section-set-changed", () => {
    const doc = clone(parse());
    const born = createSection("Workflow", [
      { id: "t-new", title: "Usage", path: "guides/usage", children: [] },
    ]);
    // The row is MOVED, not copied: a created card holds rows the source
    // already had, which is the only shape a createCards:false document
    // can reach.
    const guides = doc.sections.find((s) => s.title === "Guides")!;
    const host = guides.topics[0]!;
    host.children = host.children.filter((t) => t.path !== "guides/usage");
    doc.sections.push(born);

    const records = report(doc);
    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record!.kind).toBe("creation");
    expect(refusalKinds(doc, order(doc))).toContain("section-set-changed");
  });

  it("names the created card's species and its members' natural keys", () => {
    const doc = clone(parse());
    const born = createSection("Workflow", [
      { id: "t-new", title: "Usage", path: "guides/usage", children: [] },
    ]);
    const guides = doc.sections.find((s) => s.title === "Guides")!;
    guides.topics[0]!.children = guides.topics[0]!.children.filter(
      (t) => t.path !== "guides/usage",
    );
    doc.sections.push(born);
    const record = report(doc)[0]!;
    if (record.kind !== "creation") throw new Error("expected a creation record");
    expect(record.title).toBe("Workflow");
    expect(record.species).toBe("section");
    expect(record.memberKeys).toEqual(["guides/usage"]);
    expect(record.sectionId).toBe(born.id);
  });
});

describe("card order", () => {
  it("a swapped card order reports one card-order record and refuses card-reordered", () => {
    const doc = parse();
    const ids = order(doc);
    const swapped = [ids[1]!, ids[0]!];
    const records = report(doc, swapped);
    expect(records).toHaveLength(1);
    expect(records[0]!.kind).toBe("card-order");
    expect(refusalKinds(doc, swapped)).toContain("card-reordered");
  });

  it("ONE record for a permutation, however many cards moved", () => {
    const doc = parse();
    const ids = order(doc);
    const records = report(doc, [ids[1]!, ids[0]!]);
    const cardOrder = records.filter((r) => r.kind === "card-order");
    expect(cardOrder).toHaveLength(1);
    if (cardOrder[0]!.kind !== "card-order") throw new Error("kind");
    expect(cardOrder[0]!.moved.length).toBeGreaterThan(0);
  });
});

describe("row order", () => {
  it("a reorder inside a frozen block reports row-order and refuses outside-region", () => {
    const doc = clone(parse());
    const guides = doc.sections.find((s) => s.title === "Guides")!;
    const host = guides.topics[0]!;
    const frozen = host.children.filter((t) => t.lock?.kind === "outside-region");
    expect(frozen.length).toBe(2);
    const rest = host.children.filter((t) => t.lock?.kind !== "outside-region");
    host.children = [frozen[1]!, frozen[0]!, ...rest];

    const records = report(doc);
    expect(records).toHaveLength(1);
    const record = records[0]!;
    if (record.kind !== "row-order") throw new Error("expected a row-order record");
    expect(record.lockKind).toBe("outside-region");
    expect(record.carrierPath).toBe("guides/index");
    expect(record.rows.map((r) => r.title)).toEqual(["Frozen B", "Frozen A"]);
    expect(refusalKinds(doc, order(doc))).toContain("outside-region");
  });

  it("an unfrozen reorder reports NOTHING and plans a real change", () => {
    // THE EXCLUSION, asserted. Reordering rows inside the writable run is
    // ordinary work; a report that named it would turn every legal edit
    // into a remainder.
    const doc = clone(parse());
    const host = doc.sections.find((s) => s.title === "Guides")!.topics[0]!;
    const writable = host.children.filter((t) => t.lock === undefined);
    expect(writable.length).toBe(2);
    const frozen = host.children.filter((t) => t.lock !== undefined);
    host.children = [...frozen, writable[1]!, writable[0]!];

    expect(report(doc)).toEqual([]);
    const result = sphinxAdapter.planChanges!(filesOf(doc), doc, order(doc));
    expect(result.warnings.filter((w) => w.blocking)).toEqual([]);
    expect(result.changes.length).toBeGreaterThan(0);
  });
});

describe("FENCE 1 — report ⇔ plan, over generated arrangements", () => {
  it("the report is empty iff the plan raises none of the three", () => {
    fc.assert(
      fc.property(
        // create? / swap cards? / reorder frozen rows? / reorder free rows?
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (create, swapCards, frozenReorder, freeReorder) => {
          const doc = clone(parse());
          const guides = doc.sections.find((s) => s.title === "Guides")!;
          const host = guides.topics[0]!;
          const frozen = host.children.filter((t) => t.lock?.kind === "outside-region");
          const free = host.children.filter((t) => t.lock === undefined);

          const frozenRows = frozenReorder ? [frozen[1]!, frozen[0]!] : frozen;
          const freeRows = freeReorder ? [free[1]!, free[0]!] : free;
          host.children = [...frozenRows, ...freeRows];

          if (create) {
            const moved = freeRows[0]!;
            host.children = host.children.filter((t) => t.id !== moved.id);
            doc.sections.push(createSection("Workflow", [moved]));
          }
          let ids = order(doc);
          if (swapCards) ids = [ids[1]!, ids[0]!, ...ids.slice(2)];

          const records = structureReport(doc, filesOf(doc), ids);
          const kinds = refusalKinds(doc, ids);
          const refused = kinds.some(
            (k) =>
              (REFUSALS as readonly string[]).includes(k) ||
              (FROZEN as readonly string[]).includes(k),
          );
          expect(records.length > 0).toBe(refused);
          return true;
        },
      ),
      { numRuns: 40 },
    );
  });

  it("each kind's presence predicts exactly its own refusal", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (create, swap, frozenR) => {
        const doc = clone(parse());
        const guides = doc.sections.find((s) => s.title === "Guides")!;
        const host = guides.topics[0]!;
        const frozen = host.children.filter((t) => t.lock?.kind === "outside-region");
        const free = host.children.filter((t) => t.lock === undefined);
        host.children = [...(frozenR ? [frozen[1]!, frozen[0]!] : frozen), ...free];
        if (create) {
          const moved = free[0]!;
          host.children = host.children.filter((t) => t.id !== moved.id);
          doc.sections.push(createSection("Workflow", [moved]));
        }
        let ids = order(doc);
        if (swap) ids = [ids[1]!, ids[0]!, ...ids.slice(2)];

        const records = structureReport(doc, filesOf(doc), ids);
        const kinds = refusalKinds(doc, ids);
        const has = (k: string) => records.some((r) => r.kind === k);

        // The planner returns at its FIRST refusal, so it names one kind
        // where the report names all of them. The implication that holds
        // in both directions is: a refusal of kind K is raised only when
        // the report holds K, and the report holding K means the plan is
        // refused (by K or by one the planner reached first).
        if (kinds.includes("section-set-changed")) expect(has("creation")).toBe(true);
        if (kinds.includes("card-reordered")) expect(has("card-order")).toBe(true);
        if (kinds.includes("outside-region")) expect(has("row-order")).toBe(true);
        if (has("creation")) expect(kinds.length).toBeGreaterThan(0);
        if (has("card-order")) expect(kinds.length).toBeGreaterThan(0);
        if (has("row-order")) expect(kinds.length).toBeGreaterThan(0);
        return true;
      }),
      { numRuns: 40 },
    );
  });
});

describe("the adapter supplies the format's own words for the remedy", () => {
  it("names what a card IS here and which file holds the card set", () => {
    // COPY ONLY, NEVER BEHAVIOR. Nothing branches on either field; they
    // exist so the checklist can say "add a toctree block in index"
    // rather than "edit the source yourself", which is not a remedy.
    const doc = clone(parse());
    const host = guidesHost(doc);
    const moved = host.children.find((t) => t.path === "guides/usage")!;
    host.children = host.children.filter((t) => t.id !== moved.id);
    doc.sections.push(createSection("Workflow", [moved]));

    const record = report(doc)[0]!;
    if (record.kind !== "creation") throw new Error("expected a creation");
    expect(record.cardNoun).toBe("toctree block");
    expect(record.carrierPath).toBe("index");
  });

  it("the card-order record carries them too", () => {
    const doc = parse();
    const ids = order(doc);
    const record = report(doc, [ids[1]!, ids[0]!])[0]!;
    if (record.kind !== "card-order") throw new Error("expected a card-order");
    expect(record.cardNoun).toBe("toctree block");
    expect(record.carrierPath).toBe("index");
  });

  it("the checklist turns them into a remedy naming the real act", () => {
    // THE END-TO-END CLAIM, and the reason the fields exist at all.
    const doc = clone(parse());
    const host = guidesHost(doc);
    const moved = host.children.find((t) => t.path === "guides/usage")!;
    host.children = host.children.filter((t) => t.id !== moved.id);
    doc.sections.push(createSection("Workflow", [moved]));

    const [item] = buildChecklist(doc, [], {
      consentDeclined: false,
      remainders: report(doc),
    });
    expect(item!.cause).toContain("toctree block");
    expect(item!.remedy).toContain("add a toctree block in index");
    expect(item!.remedy).toContain("guides/usage");
  });
});

describe("REGRESSION — row-order is about ORDER, never about membership", () => {
  /**
   * FOUND BY AN EXISTING e2e (flow 15), not by this file. An aspirational
   * run moved a PINNED row out of a frozen block, and the checklist grew
   * a SECOND item saying "rows under Guides imagined in a different
   * order" beside the pin record that already described the same move,
   * with the same remedy, in the same words.
   *
   * TWO SENTENCES, TWO REFERENTS: "this block's rows are in a different
   * order" and "this block's membership changed" are different facts,
   * and the second belongs to the ledger — the pin record owns it, the
   * projection returns the row home, and the block's order is then
   * exactly the source's.
   *
   * The PLANNER still refuses either way, and must: its flat prefix
   * comparison is what stops a membership change reaching the bytes. Only
   * the report's half narrows, which is what the two named fields on the
   * shared predicate are for.
   */
  it("a row LEAVING a frozen block reports no row-order record", () => {
    const doc = clone(parse());
    const host = guidesHost(doc);
    const frozen = host.children.filter((t) => t.lock?.kind === "outside-region");
    const leaving = frozen[0]!;
    host.children = host.children.filter((t) => t.id !== leaving.id);
    doc.sections.find((s) => s.title === "Reference")!.topics.push(leaving);

    expect(report(doc).filter((r) => r.kind === "row-order")).toEqual([]);
  });

  it("but the PLANNER still refuses it — the enforcement side does not move", () => {
    const doc = clone(parse());
    const host = guidesHost(doc);
    const frozen = host.children.filter((t) => t.lock?.kind === "outside-region");
    const leaving = frozen[0]!;
    host.children = host.children.filter((t) => t.id !== leaving.id);
    doc.sections.find((s) => s.title === "Reference")!.topics.push(leaving);

    expect(refusalKinds(doc, order(doc))).toContain("outside-region");
  });

  it("a row ARRIVING in a frozen block reports no row-order record either", () => {
    const doc = clone(parse());
    const host = guidesHost(doc);
    const free = host.children.find((t) => t.lock === undefined)!;
    const rest = host.children.filter((t) => t.id !== free.id);
    host.children = [rest[0]!, free, ...rest.slice(1)];

    expect(report(doc).filter((r) => r.kind === "row-order")).toEqual([]);
  });

  it("a genuine REORDER of the surviving rows is still reported", () => {
    // THE COMPLEMENT. A predicate narrowed until it reports nothing would
    // pass all three assertions above.
    const doc = clone(parse());
    const host = guidesHost(doc);
    const frozen = host.children.filter((t) => t.lock?.kind === "outside-region");
    const rest = host.children.filter((t) => t.lock?.kind !== "outside-region");
    host.children = [frozen[1]!, frozen[0]!, ...rest];

    expect(report(doc).filter((r) => r.kind === "row-order")).toHaveLength(1);
  });
});
