/**
 * countUnits.test.ts — the two "needs your hand" numbers, each saying
 * what it counts (Ruling A, 2026-08-19).
 *
 * TWO SURFACES, TWO MEASUREMENTS, ONE LABEL. The result view says how
 * many MOVES need a hand, counted from the records reconstruction wrote.
 * Review's checklist says how many ITEMS are left for the hand, counted
 * from the ledger at apply time — and its items are not all rows: an
 * emptied never-empty container earns a line of its own, because the fact
 * is about a CONTAINER and every ledger record names a row.
 *
 * So the two can legitimately disagree, and printed as bare integers they
 * look like the same number gone wrong. The house rule covers it twice
 * over — measurements publish with stated units, and counts split by kind
 * rather than summing into one — so each number now says what it is.
 *
 * This is a copy fix, not an arithmetic one: neither count changes.
 */

import { describe, expect, it } from "vitest";
import { buildChecklist, checklistText } from "@/model/ledger";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { LedgerRecord } from "@/model/ledger";
import type { ContainerDescriptor, TocDocument } from "@/model/types";
import { aspirationalSplitText } from "../reorganize/aspirationalSplit";

const record = (id: string, title: string): LedgerRecord => ({
  topicId: id,
  title,
  kind: "pin",
  lockKind: "outside-region",
  originalParentId: "home",
  originalParentTitle: "Getting started",
  originalIndex: 0,
});

/** A document whose declared container has been left with no cards. */
function emptiedContainerDoc(): TocDocument {
  const d = doc([]);
  const container: ContainerDescriptor = {
    chainKey: "Guides",
    label: "Guides",
    kind: "tab",
    accepts: { sections: true, orphans: true },
    mayEmpty: false,
    order: 0,
  };
  d.containers = [container];
  return d;
}

describe("the result view's split names its unit", () => {
  it("counts MOVES, and says so", () => {
    const text = aspirationalSplitText({ moves: 100, needsHand: 12, needsConsent: 0 });
    expect(text).toContain("100 moves");
    expect(text).toContain("88 the app can write");
  });

  it("says the hand's number is a count of ROWS", () => {
    // 12 records, one per displaced row — which is a different quantity
    // from the checklist's item count, and saying so is the whole fix.
    expect(
      aspirationalSplitText({ moves: 100, needsHand: 12, needsConsent: 0 }),
    ).toContain("12 rows need your hand");
  });

  it("keeps consent as its own number, never summed into the hand's", () => {
    const text = aspirationalSplitText({ moves: 10, needsHand: 3, needsConsent: 2 });
    expect(text).toContain("3 rows need your hand");
    expect(text).toContain("2 rows need your consent");
    expect(text).toContain("5 the app can write");
  });

  it("counts one row in the singular", () => {
    expect(aspirationalSplitText({ moves: 2, needsHand: 1, needsConsent: 0 })).toContain(
      "1 row needs your hand",
    );
  });
});

describe("the checklist names its unit, and splits it by kind", () => {
  it("says ROWS where every item is a row", () => {
    const d = doc([section("A", [topic("x")])]);
    const items = buildChecklist(d, [record("t1", "One"), record("t2", "Two")], {
      consentDeclined: false,
    });
    expect(checklistText(items)[0]).toContain("2 rows");
    // …and no "items:" prefix, because there is only one kind in the
    // list. A split shown where nothing is split is noise.
    expect(checklistText(items)[0]).not.toContain("items");
  });

  it("SPLITS BY KIND where a container is in the list", () => {
    /**
     * COUNTS SPLIT BY KIND, NEVER SUMMED INTO ONE. A bare "(3)" beside
     * the result view's "12" reads as the same measurement gone wrong;
     * "3 items: 2 rows, 1 group" says why they are different numbers.
     */
    const d = emptiedContainerDoc();
    const items = buildChecklist(d, [record("t1", "One"), record("t2", "Two")], {
      consentDeclined: false,
    });
    const header = checklistText(items)[0]!;
    expect(header).toContain("3 items");
    expect(header).toContain("2 rows");
    expect(header).toContain("1 group");
  });

  it("counts one row in the singular too", () => {
    const d = doc([section("A", [topic("x")])]);
    const items = buildChecklist(d, [record("t1", "One")], { consentDeclined: false });
    expect(checklistText(items)[0]).toContain("1 row");
  });
});

describe("the declined group keeps its own unit", () => {
  it("counts declined consent records as rows", () => {
    // "You chose not to write this" is a different fact from "the app
    // cannot", and its list is a list of rows either way.
    const d = doc([section("A", [topic("x")])]);
    const consent: LedgerRecord = { ...record("t9", "Moved page"), kind: "consent" };
    const items = buildChecklist(d, [consent], { consentDeclined: true });
    const text = checklistText(items).join("\n");
    expect(text).toContain("DECLINED THIS RUN (1 row)");
  });
});
