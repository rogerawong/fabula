/**
 * ledger.test.ts — what THIS ARRANGEMENT has displaced (docs/21,
 * Decision 3).
 *
 * A LEDGER IS A FACT ABOUT THE ARRANGEMENT, and the arrangement changes.
 * The first draft stored the classification once at tab creation,
 * run-stamped; gate 1 killed that design, because with the manual
 * gesture in scope a hand can displace a fourth row a week after the tab
 * was born and every consumer of a stored count starts lying the moment
 * it does. So: derived where derivable, recorded where it is not, and
 * cross-checked where both exist.
 *
 * THE ORACLE IS THE POINT of the collection-tab tests below. On a
 * collection tab both sources exist — the snapshot yields original
 * placement, and producers write `displaced` uniformly — so a
 * disagreement names a producer that forgot to write or a carry path
 * that dropped the field. Caught as a red check instead of a wrong
 * badge (the display-is-its-own-oracle rule, docs/19's reach label).
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "./fixtures";
import type { Section, TocDocument, Topic } from "../types";
import {
  applyableProjection,
  type LedgerRecord,
  hasDisplacements,
  ledgerOf,
  recordedLedger,
} from "../ledger";

function pinned(
  t: Topic,
  kind: "outside-region" | "reference" = "outside-region",
): Topic {
  return { ...t, lock: { kind } };
}

/**
 * ONE source, cloned per test. The fixtures mint fresh ids on every
 * call, and the whole derivation compares placement BY ID — so two
 * independently built "identical" documents would share no row, and the
 * derived reading would be vacuously empty while looking green.
 */
const SOURCE: TocDocument = doc([
  section("Getting started", [
    pinned(topic("Using the Project Manager")),
    topic("Other"),
  ]),
  section("Tutorials", [topic("First tutorial")]),
]);

/** A → [pinned "Project Manager", "Other"], B → ["First tutorial"] */
function sourceDoc(): TocDocument {
  return structuredClone(SOURCE);
}

/** The same document with the pinned row imagined under "Tutorials". */
function displacedDoc(): TocDocument {
  const d = sourceDoc();
  const [from, to] = d.sections as [Section, Section];
  const moved = from.topics.shift()!;
  to.topics.push({
    ...moved,
    displaced: {
      parentId: from.id,
      parentTitle: from.title,
      index: 0,
      kind: "pin",
    },
  });
  return d;
}

describe("recordedLedger — the field on the row", () => {
  it("is empty for a document nobody displaced", () => {
    expect(recordedLedger(sourceDoc())).toEqual([]);
    expect(hasDisplacements(sourceDoc())).toBe(false);
  });

  it("reads one record per displaced row, carrying the lock kind", () => {
    const records = recordedLedger(displacedDoc());
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      kind: "pin",
      lockKind: "outside-region",
      originalParentTitle: "Getting started",
      originalIndex: 0,
      title: "Using the Project Manager",
    });
    expect(hasDisplacements(displacedDoc())).toBe(true);
  });

  it("names no carrier it cannot read — absent, never guessed", () => {
    // A format tab has no snapshot behind the pin, so nothing can say
    // which file's construct pins the row. Absence is the answer.
    expect(recordedLedger(displacedDoc())[0]!.carrier).toBeUndefined();
  });

  it("finds records on nested rows, not just top-level ones", () => {
    const d = sourceDoc();
    const parent = d.sections[1]!.topics[0]!;
    parent.children.push({
      ...pinned(topic("Deep row")),
      displaced: { parentId: "s-old", parentTitle: "Elsewhere", index: 3, kind: "pin" },
    });
    expect(recordedLedger(d)).toHaveLength(1);
  });
});

describe("ledgerOf — the selector of record", () => {
  it("derives pin records from the original where one is available", () => {
    // Producer-blind: the comparison is placement-vs-placement, so it is
    // true whether the model or the hand displaced the row.
    const records = ledgerOf(displacedDoc(), sourceDoc());
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      kind: "pin",
      lockKind: "outside-region",
      originalParentTitle: "Getting started",
      originalIndex: 0,
    });
  });

  it("derives a record for a row the RECORD is missing from", () => {
    // The oracle's whole job: a producer that forgot to write `displaced`
    // still shows up in the derived reading, which is what makes the
    // disagreement visible instead of silently absent.
    const d = displacedDoc();
    delete d.sections[1]!.topics[1]!.displaced;
    expect(recordedLedger(d)).toHaveLength(0);
    expect(ledgerOf(d, sourceDoc())).toHaveLength(1);
  });

  it("derived and recorded PIN records agree when the producer wrote", () => {
    const d = displacedDoc();
    const derived = ledgerOf(d, sourceDoc()).filter((r) => r.kind === "pin");
    const recorded = recordedLedger(d).filter((r) => r.kind === "pin");
    expect(derived.map((r) => r.topicId).sort()).toEqual(
      recorded.map((r) => r.topicId).sort(),
    );
    expect(derived[0]!.originalParentId).toBe(recorded[0]!.originalParentId);
    expect(derived[0]!.originalIndex).toBe(recorded[0]!.originalIndex);
  });

  it("never derives a CONSENT record — placement cannot carry who consented", () => {
    // The same placement fact means different things depending on the
    // producer, so consent records are recorded-only by design and the
    // oracle deliberately does not cover them.
    const d = sourceDoc();
    const moved = d.sections[0]!.topics.pop()!; // "Other" — unpinned
    d.sections[1]!.topics.push({
      ...moved,
      displaced: {
        parentId: d.sections[0]!.id,
        parentTitle: "Getting started",
        index: 1,
        kind: "consent",
      },
    });
    const derived = ledgerOf(d, sourceDoc());
    expect(derived.filter((r) => r.kind === "consent")).toHaveLength(1);
    // …and it came from the RECORD, not from the comparison: an
    // identical arrangement with no record derives nothing.
    const noRecord = sourceDoc();
    noRecord.sections[1]!.topics.push(noRecord.sections[0]!.topics.pop()!);
    expect(ledgerOf(noRecord, sourceDoc())).toEqual([]);
  });

  it("ignores an unpinned row that merely moved", () => {
    const d = sourceDoc();
    d.sections[1]!.topics.push(d.sections[0]!.topics.pop()!); // "Other"
    expect(ledgerOf(d, sourceDoc())).toEqual([]);
  });

  it("ignores a pinned row that only changed its index among siblings", () => {
    // No lock kind says anything about POSITION (docs/19's promise
    // analysis) — which is why the net is parent-change only.
    const d = sourceDoc();
    d.sections[0]!.topics.reverse();
    expect(ledgerOf(d, sourceDoc())).toEqual([]);
  });

  it("names the carrier from the original parent's path when it has one", () => {
    const original = sourceDoc();
    original.sections[0]!.path = "getting_started/index.rst";
    const d = displacedDoc();
    expect(ledgerOf(d, original)[0]!.carrier).toBe("getting_started/index.rst");
  });

  it("falls back to the recorded reading when there is no original", () => {
    expect(ledgerOf(displacedDoc(), null)).toEqual(recordedLedger(displacedDoc()));
  });
});

/** The projection's ROW half, which is what this file is about: the
 *  structural clauses have their own file and their own fixtures. */
const project = (d: TocDocument, records: readonly LedgerRecord[]): TocDocument =>
  applyableProjection({ doc: d, sectionOrder: d.sections.map((s) => s.id) }, { records })
    .doc;

describe("applyableProjection — membership exact, position derived-or-clamped", () => {
  it("returns a displaced pinned row to its original parent", () => {
    const d = displacedDoc();
    const projected = project(d, ledgerOf(d, sourceDoc()));
    expect(projected.sections[0]!.topics.map((t) => t.title)).toEqual([
      "Using the Project Manager",
      "Other",
    ]);
    expect(projected.sections[1]!.topics.map((t) => t.title)).toEqual(["First tutorial"]);
  });

  it("leaves everything else exactly as arranged", () => {
    const d = displacedDoc();
    d.sections[1]!.topics.unshift(d.sections[0]!.topics.pop()!); // "Other" moves too
    const projected = project(d, ledgerOf(d, sourceDoc()));
    // "Other" is unpinned and stays where the user put it.
    expect(projected.sections[1]!.topics.map((t) => t.title)).toEqual([
      "Other",
      "First tutorial",
    ]);
  });

  it("clamps a recorded index past the current sibling count", () => {
    const d = sourceDoc();
    const moved = d.sections[0]!.topics.shift()!;
    d.sections[1]!.topics.push({
      ...moved,
      displaced: {
        parentId: d.sections[0]!.id,
        parentTitle: "Getting started",
        index: 99,
        kind: "pin",
      },
    });
    const projected = project(d, recordedLedger(d));
    expect(projected.sections[0]!.topics.map((t) => t.title)).toEqual([
      "Other",
      "Using the Project Manager",
    ]);
  });

  it("carries no displacement record into the projection", () => {
    // The projection is the document the planner sees. A record on it
    // would be a fact about an arrangement the projection does not hold.
    const d = displacedDoc();
    const projected = project(d, ledgerOf(d, sourceDoc()));
    expect(hasDisplacements(projected)).toBe(false);
  });

  it("is the identity on a document with an empty ledger", () => {
    const d = sourceDoc();
    expect(project(d, [])).toEqual(d);
  });

  it("restores a nested row under its original PARENT TOPIC", () => {
    const original = sourceDoc();
    original.sections[0]!.topics[1]!.children.push(pinned(topic("Nested")));
    const d = structuredClone(original);
    const moved = d.sections[0]!.topics[1]!.children.pop()!;
    d.sections[1]!.topics.push(moved);
    const projected = project(d, ledgerOf(d, original));
    expect(projected.sections[0]!.topics[1]!.children.map((t) => t.title)).toEqual([
      "Nested",
    ]);
    expect(projected.sections[1]!.topics).toHaveLength(1);
  });

  it("leaves a row alone when its original parent is gone", () => {
    // A guard consumes DECLARED inputs: with no parent to restore
    // membership to, the projection checks nothing rather than inventing
    // a home. The adapters' refusals are still live underneath.
    const d = displacedDoc();
    d.sections.splice(0, 1);
    const projected = project(d, recordedLedger(d));
    expect(projected.sections[0]!.topics.map((t) => t.title)).toEqual([
      "First tutorial",
      "Using the Project Manager",
    ]);
  });
});

describe("restoring SEVERAL rows to one parent (regression)", () => {
  /**
   * Every projected row is stripped before any is restored, so a parent
   * regaining three of them inserts into a list shorter than the indices
   * were measured against. Restored in arbitrary order, the high indices
   * clamp down and interleave with the rows that never moved: a
   * three-row restore came back "first, second, keep, third".
   *
   * A single-row fixture cannot show this — which is why the minimal
   * pair here is three displaced rows AND one that stayed.
   */
  function threeAway(): TocDocument {
    const d = doc([section("Home", [topic("keep")]), section("Away", [])]);
    const home = d.sections[0]!;
    for (const [index, title] of [
      [2, "third"],
      [0, "first"],
      [1, "second"],
    ] as const) {
      d.sections[1]!.topics.push({
        ...pinned(topic(title)),
        displaced: { parentId: home.id, parentTitle: "Home", index, kind: "pin" },
      });
    }
    return d;
  }

  it("restores them in their original order, ahead of the row that stayed", () => {
    const d = threeAway();
    const projected = project(d, recordedLedger(d));
    expect(projected.sections[0]!.topics.map((t) => t.title)).toEqual([
      "first",
      "second",
      "third",
      "keep",
    ]);
  });

  it("does not depend on the order the records arrive in", () => {
    // The records come from a walk of the arrangement, which has no
    // reason to visit them in origin order — so the projection must not
    // depend on it.
    const d = threeAway();
    const shuffled = [...recordedLedger(d)].reverse();
    expect(project(d, shuffled).sections[0]!.topics.map((t) => t.title)).toEqual([
      "first",
      "second",
      "third",
      "keep",
    ]);
  });
});
