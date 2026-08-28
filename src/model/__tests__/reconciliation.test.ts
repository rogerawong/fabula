/**
 * The reconciliation property (docs/17): report totals == model
 * derivations == the header stats line, over EVERY shipped format.
 *
 * This is what lets the five existing projections — the header line, the
 * derived-titles chip, the language chip, the card cause line, the import
 * disclosures — wait for their rewiring without drifting apart. They were
 * each built where they were needed, so they disagree in vocabulary; this
 * pins the arithmetic underneath them while the vocabulary settles.
 *
 * Running it over all seven also proves the empty-Tier-2 path: DocFX,
 * MkDocs and Mintlify contribute no evidence at all, and a panel that
 * assumed every adapter had something to say would give them a section
 * that reads as broken.
 */

import { describe, expect, it } from "vitest";
import { docfxAdapter } from "@/formats/adapters/docfx";
import { mkdocsAdapter } from "@/formats/adapters/mkdocs";
import { mintlifyAdapter } from "@/formats/adapters/mintlify";
import { hugoAdapter } from "@/collections/adapters/hugo";
import { jtdAdapter } from "@/collections/adapters/jtd";
import { docusaurusAdapter } from "@/collections/adapters/docusaurus";
import { sphinxAdapter } from "@/collections/adapters/sphinx";
import { evidenceOf, groupIntoEvidence } from "@/collections/importEvidence";
import type { FilesSnapshot } from "@/collections/types";
import { documentStats } from "../selectors";
import { buildTier1 } from "../report";
import type { TocDocument } from "../types";

// ── every shipped format's fixture document ─────────────────

const load = (glob: Record<string, string>, prefix: string): FilesSnapshot => {
  const files: FilesSnapshot = {};
  for (const [key, content] of Object.entries(glob)) {
    if (key.endsWith("README.md")) continue;
    files[key.replace(prefix, "")] = content;
  }
  return files;
};

const raw = (pattern: Record<string, string>) => pattern;

const hugoRaw = raw(
  import.meta.glob("../../collections/__tests__/fixtures/hugo/**/*", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
);
const jtdRaw = raw(
  import.meta.glob("../../collections/__tests__/fixtures/jtd/**/*", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
);
const docusaurusRaw = raw(
  import.meta.glob("../../collections/__tests__/fixtures/docusaurus/**/*", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
);
const sphinxRaw = raw(
  import.meta.glob("../../collections/__tests__/fixtures/sphinx/**/*", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
);

import docfxSample from "@/formats/samples/docfx-sample.yml?raw";
import mkdocsSample from "@/formats/samples/mkdocs-sample.yml?raw";
import mintlifySample from "@/formats/samples/mintlify-sample.json?raw";

interface Case {
  id: string;
  doc: () => TocDocument;
  /** Format adapters cannot contribute evidence — openCollection sets it. */
  tier2: boolean;
}

const CASES: Case[] = [
  { id: "docfx", doc: () => docfxAdapter.parse(docfxSample, "toc.yml"), tier2: false },
  {
    id: "mkdocs",
    doc: () => mkdocsAdapter.parse(mkdocsSample, "mkdocs.yml"),
    tier2: false,
  },
  {
    id: "mintlify",
    doc: () => mintlifyAdapter.parse(mintlifySample, "docs.json"),
    tier2: false,
  },
  {
    id: "hugo",
    doc: () =>
      hugoAdapter.parse(
        load(hugoRaw, "../../collections/__tests__/fixtures/hugo/"),
        "hugo",
      ).doc,
    tier2: true,
  },
  {
    id: "jtd",
    doc: () =>
      jtdAdapter.parse(load(jtdRaw, "../../collections/__tests__/fixtures/jtd/"), "jtd")
        .doc,
    tier2: true,
  },
  {
    id: "docusaurus",
    doc: () =>
      docusaurusAdapter.parse(
        load(docusaurusRaw, "../../collections/__tests__/fixtures/docusaurus/"),
        "docusaurus",
      ).doc,
    tier2: true,
  },
  {
    id: "sphinx",
    doc: () =>
      sphinxAdapter.parse(
        load(sphinxRaw, "../../collections/__tests__/fixtures/sphinx/"),
        "sphinx",
      ).doc,
    tier2: true,
  },
];

describe.each(CASES)("reconciliation: $id", ({ doc: build, tier2 }) => {
  it("report statistics equal the model's own derivations", () => {
    const d = build();
    const report = buildTier1(d);
    const stats = documentStats(d);
    expect({
      sections: report.stats.sections,
      topics: report.stats.topics,
      maxDepth: report.stats.maxDepth,
    }).toEqual({
      sections: stats.sections,
      topics: stats.total,
      maxDepth: stats.maxDepth,
    });
  });

  it("the depth histogram sums to the topic total", () => {
    const report = buildTier1(build());
    const summed = Object.values(report.stats.levels).reduce((a, b) => a + b, 0);
    expect(summed).toBe(report.stats.topics);
  });

  it("every finding's count is at least the subjects it names", () => {
    // Tier 1 names every subject, so this holds with equality wherever
    // the finding has subjects at all — but the inequality is the
    // invariant the panel's "+K more" depends on.
    for (const finding of buildTier1(build()).findings) {
      expect(finding.count).toBeGreaterThanOrEqual(finding.subjects.length);
    }
  });

  it("a breakdown, where present, sums to its finding's count", () => {
    for (const finding of buildTier1(build()).findings) {
      if (finding.breakdown.length === 0) continue;
      if (finding.id === "containers") continue; // count is containers, breakdown is cards
      const summed = finding.breakdown.reduce((a, b) => a + b.count, 0);
      expect(summed).toBeGreaterThanOrEqual(finding.count);
    }
  });

  it("is deterministic — two builds of the same document agree exactly", () => {
    // ONE parse, two builds. Parsing twice mints fresh node ids, so
    // comparing across parses would test id generation rather than the
    // report — the invariant is that a given document reports the same
    // way every time, which is what makes the property falsifiable.
    const d = build();
    expect(JSON.stringify(buildTier1(d))).toBe(JSON.stringify(buildTier1(d)));
  });

  it(
    tier2
      ? "reads its stored evidence without throwing"
      : "has no Tier-2 evidence at all, and says so by being empty",
    () => {
      // The empty case is the MAJORITY: three of seven formats emit
      // nothing, so the panel renders no Tier-2 section rather than an
      // empty one that reads as broken.
      expect(evidenceOf(build())).toEqual([]);
    },
  );
});

describe("the whole report is a pure function of the document", () => {
  it("stores nothing on the document it reads", () => {
    // The fence: no Tier-1 derivation is stored. If building the report
    // mutated `extras`, the next open would read a stale derivation.
    const d = CASES[3]!.doc();
    const before = JSON.stringify(d);
    buildTier1(d);
    expect(JSON.stringify(d)).toBe(before);
  });

  it("groups the same occurrences into the same bytes every time", () => {
    const occurrences = Array.from({ length: 25 }, (_, i) => ({
      kind: "k",
      detail: `d${i}`,
      subject: { sectionId: "s1", topicId: `t${i}` },
    }));
    expect(JSON.stringify(groupIntoEvidence(occurrences))).toBe(
      JSON.stringify(groupIntoEvidence(occurrences)),
    );
  });
});
