/**
 * The two stored shapes the panel has to render honestly (docs/17).
 *
 * Both are about a record saying what it is: a sampled one must not look
 * complete, and a legacy one must not look broken. Asserted against the
 * SHIPPED reader (`evidenceOf`) and the shipped grouping, so these test
 * the path the panel takes rather than a parallel one.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import {
  evidenceOf,
  groupIntoEvidence,
  MAX_EXEMPLARS,
  type ImportOccurrence,
} from "@/collections/importEvidence";
import type { TocDocument } from "@/model/types";

const stored = (extras: Record<string, unknown>): TocDocument => ({
  ...doc([section("Guide", [topic("Intro", [], "intro.md")])]),
  extras,
});

describe("a sampled record never looks complete", () => {
  // 25 occurrences of one kind, each naming a node.
  const occurrences: ImportOccurrence[] = Array.from({ length: 25 }, (_, i) => ({
    kind: "duplicate-title",
    detail: "pages sharing a title with another page",
    receipt: "frontmatter title",
    subject: { sectionId: "s1", topicId: `t${i}` },
  }));

  it("stores twenty exemplars and counts twenty-five", () => {
    const [record] = groupIntoEvidence(occurrences);
    expect(record?.count).toBe(25);
    expect(record?.exemplars).toHaveLength(MAX_EXEMPLARS);
  });

  it("survives a round trip through storage unchanged", () => {
    const evidence = groupIntoEvidence(occurrences);
    const reread = evidenceOf(stored({ importEvidence: evidence }));
    expect(reread[0]?.count).toBe(25);
    expect(reread[0]?.exemplars).toHaveLength(20);
  });

  it("leaves the panel five to declare — the +K the render shows", () => {
    // The panel prints "first 20 · +5 more" from exactly this
    // difference. A record whose count equalled its exemplars would
    // print nothing, which is correct for an unsampled one.
    const [record] = groupIntoEvidence(occurrences);
    expect(record!.count - record!.exemplars.length).toBe(5);
  });

  it("says nothing extra when the record is not sampled", () => {
    const [record] = groupIntoEvidence(occurrences.slice(0, 3));
    expect(record!.count - record!.exemplars.length).toBe(0);
  });
});

describe("a legacy document renders as it always did", () => {
  // Written before the rename. It must load, not merely typecheck: the
  // one reshape this project got wrong was neither readable nor
  // version-bumped, and it blanked the app.
  const legacy = () =>
    stored({
      importWarnings: [
        { kind: "sibling-languages", detail: "17 languages declared · English loaded" },
        { kind: "frontmatter-created", detail: "created front matter for 3 pages" },
        { kind: "page-hidden", detail: "one page is hidden from navigation" },
      ],
    });

  it("reads every record through the alias", () => {
    expect(evidenceOf(legacy())).toHaveLength(3);
  });

  it("reads each as a single occurrence, so no count suffix is drawn", () => {
    // The review dialog appends "· N occurrences" only above one. At
    // count 1 the line is exactly what it was before the rename.
    for (const record of evidenceOf(legacy())) {
      expect(record.count).toBe(1);
    }
  });

  it("keeps the prose the dialog prints", () => {
    expect(evidenceOf(legacy())[0]?.detail).toBe(
      "17 languages declared · English loaded",
    );
  });

  it("offers no focus affordance, having no exemplars to name", () => {
    for (const record of evidenceOf(legacy())) {
      expect(record.exemplars).toEqual([]);
    }
  });

  it("totals occurrences the same way the new shape does", () => {
    // The dialog's summary counts occurrences, not kinds, in both shapes.
    const total = evidenceOf(legacy()).reduce((sum, e) => sum + e.count, 0);
    expect(total).toBe(3);
  });
});
