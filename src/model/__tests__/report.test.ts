/**
 * Tier 1 — the model-derived half of the Overview report (docs/17).
 *
 * Never stored: every line here is recomputed from the model on open,
 * which is what keeps the fence intact while Tier 2 stores evidence. And
 * never sampled: Tier-1 subjects are COMPLETE by construction, because
 * the model is entirely present. The 20-exemplar bound is a Tier-2
 * STORAGE property and must not leak into a selector that has no reason
 * to sample.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "./fixtures";
import { documentStats } from "../selectors";
import { buildTier1, groupFindings } from "../report";
import type { Section, TocDocument, Topic } from "../types";

const reason = (label: string) => ({ label, note: `${label} does a thing` });

const hiddenOwn = (title: string, ...labels: string[]): Topic => ({
  ...topic(title, [], `${title}.md`),
  unlisted: { reasons: labels.map(reason) },
});

const hiddenVia = (title: string, via: string): Topic => ({
  ...topic(title, [], `${title}.md`),
  unlisted: { reasons: [], inheritedFrom: { via, reasons: [reason("toc_hide")] } },
});

/** Both flags at once — the pair the collapse dropped a fact from. */
const hiddenBoth = (title: string, via: string): Topic => ({
  ...topic(title, [], `${title}.md`),
  unlisted: {
    reasons: [reason("headless")],
    inheritedFrom: { via, reasons: [reason("toc_hide")] },
  },
});

const find = (report: ReturnType<typeof buildTier1>, id: string) =>
  report.findings.find((f) => f.id === id);

describe("vital statistics reconcile with the model", () => {
  it("reports exactly what documentStats derives", () => {
    const d = doc([
      section("Guide", [topic("A", [topic("A1")]), topic("B")]),
      section("Reference", [topic("C")]),
    ]);
    const report = buildTier1(d);
    const stats = documentStats(d);
    expect(report.stats.sections).toBe(stats.sections);
    expect(report.stats.topics).toBe(stats.total);
    expect(report.stats.maxDepth).toBe(stats.maxDepth);
  });

  it("carries the depth histogram, which is the only line that reveals a lone deep branch", () => {
    const deep = topic("L1", [topic("L2", [topic("L3")])]);
    const report = buildTier1(doc([section("Guide", [deep, topic("Flat")])]));
    expect(report.stats.levels).toEqual({ 1: 2, 2: 1, 3: 1 });
  });
});

describe("hidden is three lines, never one", () => {
  // Collapsing them is the error docs/14 already made once: nine pages
  // are headless AND inside a toc_hide'd section, and only the first
  // fact reached the canvas.
  const d = (): TocDocument =>
    doc([
      section("Guide", [
        hiddenOwn("own-a", "toc_hide"),
        hiddenOwn("own-b", "headless"),
        hiddenOwn("own-c", "toc_hide"),
        hiddenVia("inh-a", "Kubeadm Generated"),
        hiddenVia("inh-b", "Kubeadm Generated"),
        hiddenVia("inh-c", "Definitions"),
        hiddenBoth("both-a", "Definitions"),
      ]),
    ]);

  it("counts own flags BY KIND rather than summing them", () => {
    const own = find(buildTier1(d()), "hidden-own");
    // Ties break alphabetically, matching the shipped
    // hiddenSubtreeSummary — a stable order, so two runs agree.
    expect(own?.breakdown).toEqual([
      { key: "headless", count: 2 },
      { key: "toc_hide", count: 2 },
    ]);
  });

  it("counts inherited as its own total", () => {
    expect(find(buildTier1(d()), "hidden-inherited")?.count).toBe(4);
  });

  it("counts a page carrying BOTH facts under both lines", () => {
    // Orthogonal by design. A page that is headless and inside a hidden
    // section is two true statements, and dropping either is the bug.
    const report = buildTier1(d());
    expect(find(report, "hidden-own")?.count).toBe(4);
    expect(find(report, "hidden-inherited")?.count).toBe(4);
  });

  it("breaks inherited down per ancestor, largest first", () => {
    const per = find(buildTier1(d()), "hidden-via");
    expect(per?.breakdown).toEqual([
      { key: "Definitions", count: 2 },
      { key: "Kubeadm Generated", count: 2 },
    ]);
  });

  it("says nothing at all about a document with nothing hidden", () => {
    const report = buildTier1(doc([section("Guide", [topic("A")])]));
    expect(find(report, "hidden-own")).toBeUndefined();
    expect(find(report, "hidden-inherited")).toBeUndefined();
    expect(find(report, "hidden-via")).toBeUndefined();
    expect(find(report, "hidden-any")).toBeUndefined();
  });
});

describe("the fourth line: how many nodes, not how many facts", () => {
  // The three lines above answer "in what way", and they overlap on
  // purpose. None of them answers "how many rows does a reader not
  // reach", which is the question a stranger asks first. Adding a line
  // is not the collapse the three-lines rule forbids — collapsing them
  // into one is.
  const d = (): TocDocument =>
    doc([
      section("Guide", [
        hiddenOwn("own-a", "toc_hide"),
        hiddenOwn("own-b", "headless"),
        hiddenOwn("own-c", "toc_hide"),
        hiddenVia("inh-a", "Kubeadm Generated"),
        hiddenVia("inh-b", "Kubeadm Generated"),
        hiddenVia("inh-c", "Definitions"),
        hiddenBoth("both-a", "Definitions"),
      ]),
    ]);

  it("counts each node once, however many ways it is hidden", () => {
    // own 4 + inherited 4 − both 1. Summing the lines would say 8 of 7.
    expect(find(buildTier1(d()), "hidden-any")?.count).toBe(7);
  });

  it("agrees with the union recounted independently from the model", () => {
    // The invariant, not the arithmetic: whatever the lines above say,
    // the total is |own ∪ inherited| over the same document. Recounted
    // here by walking the tree, so a change to either line that broke
    // the identity fails on the identity rather than on a literal.
    const document = d();
    const union = new Set<string>();
    const note = (u: Section["unlisted"], key: string): void => {
      if (u && (u.reasons.length > 0 || u.inheritedFrom !== undefined)) union.add(key);
    };
    const walk = (topics: readonly Topic[]): void => {
      for (const t of topics) {
        note(t.unlisted, t.id);
        walk(t.children);
      }
    };
    for (const s of document.sections) {
      note(s.unlisted, s.id);
      walk(s.topics);
    }

    const report = buildTier1(document);
    const own = find(report, "hidden-own")?.count ?? 0;
    const inherited = find(report, "hidden-inherited")?.count ?? 0;
    expect(find(report, "hidden-any")?.count).toBe(union.size);
    // …and the inclusion–exclusion the receipt prints is the same set.
    expect(own + inherited - 1).toBe(union.size);
  });

  it("prints its derivation inline, so the total can be checked against the lines above", () => {
    // A total whose parts are three lines away is a number a reader has
    // to take on trust. The receipt carries every term.
    expect(find(buildTier1(d()), "hidden-any")?.receipt).toBe(
      "own 4 + inherited 4 − both 1",
    );
  });

  it("offers nothing to focus, because every node it counts is reachable above", () => {
    // A third fold over the same rows is noise, not an affordance.
    expect(find(buildTier1(d()), "hidden-any")?.subjects).toEqual([]);
  });

  it("heads a cluster, with the lines it totals nested beneath it", () => {
    // Adjacency by STRUCTURE, not by placement: the terms are inside
    // the cluster, so no unrelated finding can rank its way between the
    // total and the numbers its receipt cites. The previous rule put
    // the total after its last term and left that property at the mercy
    // of whatever else the document happened to contain.
    const { attention, observations } = groupFindings(buildTier1(d()).findings);
    const cluster = [...attention, ...observations].find(
      (c) => c.head.id === "hidden-any",
    );
    expect(cluster).toBeDefined();
    expect(cluster!.terms.map((f) => f.id)).toEqual([
      "hidden-own",
      "hidden-inherited",
      "hidden-via",
    ]);
  });

  it("nests its terms in DECLARED order, which is how the receipt names them", () => {
    // Not by count. Ranking is for choosing where to look among facts
    // that compete; inside a cluster the terms do not compete — they are
    // the derivation of the line above, and "own 17 + inherited 207"
    // reads as a derivation only if own comes first.
    const { attention, observations } = groupFindings(buildTier1(d()).findings);
    const cluster = [...attention, ...observations].find(
      (c) => c.head.id === "hidden-any",
    );
    expect(cluster!.head.summarises).toEqual(cluster!.terms.map((f) => f.id));
  });

  it("never leaves a term loose at top level as well", () => {
    // A term rendered both inside the cluster and beside it would show
    // the same fact twice on one screen.
    const { attention, observations } = groupFindings(buildTier1(d()).findings);
    const heads = [...attention, ...observations].map((c) => c.head.id);
    for (const id of ["hidden-own", "hidden-inherited", "hidden-via"]) {
      expect(heads).not.toContain(id);
    }
  });

  it("ranks the cluster by its HEAD's count, among the section's other clusters", () => {
    // The cluster is ONE entry in the ranking, so count-ranking is
    // preserved — at cluster granularity rather than line granularity.
    const flagged: Section = {
      ...section("Definitions", [
        hiddenVia("gen-a", "Definitions"),
        hiddenVia("gen-b", "Definitions"),
      ]),
      unlisted: { reasons: [reason("toc_hide")] },
    };
    const { attention } = groupFindings(
      buildTier1(
        doc([
          section("Guide", [hiddenOwn("own-a", "headless")]),
          flagged,
          {
            ...section(
              "Orphanage",
              Array.from({ length: 9 }, (_, i) => topic(`o${i}`)),
            ),
            isOrphan: true,
          },
        ]),
      ).findings,
    );
    // own 2 + inherited 2 − both 0 = 4, the biggest number here.
    expect(attention[0]?.head.id).toBe("hidden-any");
    expect(attention[0]?.head.count).toBe(4);
  });

  it("lands in the section its TERMS did, carrying them there", () => {
    // The head is stat-only, so the affordance rule alone would file
    // the whole cluster under Observations while its focusable terms
    // belong in Attention. The terms decide, and the cluster travels
    // intact.
    const flagged: Section = {
      ...section("Definitions", [hiddenVia("gen-a", "Definitions")]),
      unlisted: { reasons: [reason("toc_hide")] },
    };
    const { attention, observations } = groupFindings(
      buildTier1(doc([section("Guide", [hiddenOwn("own-a", "headless")]), flagged]))
        .findings,
    );
    expect(attention.map((c) => c.head.id)).toContain("hidden-any");
    expect(observations.map((c) => c.head.id)).not.toContain("hidden-any");
    expect(attention[0]?.head.subjects).toEqual([]);
  });

  it("gives an ordinary finding a cluster of its own with no terms", () => {
    // One shape reaches the panel, so the renderer has no second path
    // to get wrong: a lone line is a cluster whose terms are empty.
    const { attention } = groupFindings(
      buildTier1(doc([section("Guide", [hiddenOwn("a", "toc_hide")])])).findings,
    );
    expect(attention.length).toBeGreaterThan(0);
    for (const cluster of attention) expect(cluster.terms).toEqual([]);
  });

  it("says nothing when only one of the two ways is present", () => {
    // A union equal to a line already on screen is a restatement, and
    // the panel's rule is that a document without the fact gets no line.
    const ownOnly = buildTier1(doc([section("G", [hiddenOwn("a", "toc_hide")])]));
    expect(find(ownOnly, "hidden-own")?.count).toBe(1);
    expect(find(ownOnly, "hidden-any")).toBeUndefined();
  });
});

describe("subjects are complete, never sampled", () => {
  it("names every subject even past the Tier-2 exemplar bound", () => {
    // 25 > 20. The bound is a STORAGE property of parse evidence; a
    // selector reads a model that is entirely present and has no reason
    // to sample.
    const many = Array.from({ length: 25 }, (_, i) => hiddenOwn(`h${i}`, "toc_hide"));
    const report = buildTier1(doc([section("Guide", many)]));
    const own = find(report, "hidden-own");
    expect(own?.count).toBe(25);
    expect(own?.subjects).toHaveLength(25);
  });

  it("points a per-ancestor line at the flagged ancestor, not at its members", () => {
    // "199 rows hidden via Kubeadm Generated" answers "why", and the
    // answer is ONE node. Selecting 199 rows would be a selection.
    const ancestor: Section = {
      ...section("Kubeadm Generated", [hiddenVia("child", "Kubeadm Generated")]),
      unlisted: { reasons: [reason("toc_hide")] },
    };
    const report = buildTier1(doc([ancestor]));
    const per = find(report, "hidden-via");
    expect(per?.subjects).toEqual([{ sectionId: ancestor.id }]);
  });
});

describe("the rest of the table", () => {
  it("counts orphan cards", () => {
    const orphan: Section = { ...section("Loose", [topic("x")]), isOrphan: true };
    expect(
      find(buildTier1(doc([orphan, section("Real", [topic("y")])])), "orphans")?.count,
    ).toBe(1);
  });

  it("counts derived titles for topics and sections separately", () => {
    const derivedTopic: Topic = { ...topic("T"), titleDerived: true };
    const derivedSection: Section = {
      ...section("S", [derivedTopic]),
      titleDerived: true,
    };
    const report = buildTier1(doc([derivedSection]));
    expect(find(report, "derived-titles")?.breakdown).toEqual([
      { key: "topics", count: 1 },
      { key: "sections", count: 1 },
    ]);
  });

  it("counts locked nodes by kind, in the legend's vocabulary", () => {
    const locked = (kind: "atomic" | "external"): Topic => ({
      ...topic(kind),
      lock: { kind },
    });
    const report = buildTier1(
      doc([section("S", [locked("atomic"), locked("external")])]),
    );
    // LABELS, not union members: "kept whole", never "atomic" — the
    // breakdown speaks the same vocabulary as the row glyphs (locks.ts).
    expect(find(report, "locked")?.breakdown).toEqual([
      { key: "external", count: 1 },
      { key: "kept whole", count: 1 },
    ]);
  });

  it("gives missing targets their own attention line — the error tier's second door", () => {
    // MINIMAL PAIR: a missing row and a plain row in one document, so
    // the finding provably keys on the lock and not on the walk.
    const missing: Topic = {
      ...topic("Ghost", [], "ghost.md"),
      lock: { kind: "missing" },
    };
    const report = buildTier1(doc([section("S", [missing, topic("Real")])]));
    const line = find(report, "missing-targets");
    expect(line?.severity).toBe("warning");
    expect(line?.count).toBe(1);
    // Docnames as subjects: the missing rows themselves, complete.
    expect(line?.subjects).toEqual([
      { sectionId: expect.any(String), topicId: missing.id },
    ]);
    // Both doors declared: the locked line still carries its share.
    expect(find(report, "locked")?.breakdown).toContainEqual({
      key: "missing",
      count: 1,
    });
    // And a clean document emits no line at all.
    expect(
      find(buildTier1(doc([section("S", [topic("Real")])])), "missing-targets"),
    ).toBeUndefined();
  });

  it("groups above-prose entries by their carrier, hidden-via's shape", () => {
    const lockedRow = (title: string): Topic => ({
      ...topic(title, [], `${title}.md`),
      lock: { kind: "outside-region" },
    });
    // Two carriers: a hub topic holding two locked entries plus a plain
    // one (the minimal pair inside the carrier), and the section root
    // holding one locked entry directly.
    const hub = topic("Hub", [lockedRow("A"), lockedRow("B"), topic("C")], "hub.md");
    const d = doc([section("Root", [hub, lockedRow("D")])]);
    const line = find(buildTier1(d), "above-prose");
    // Count = ENTRIES (block counts are not derivable from the model).
    expect(line?.count).toBe(3);
    expect(line?.breakdown).toEqual([
      { key: "Hub", count: 2 },
      { key: "Root", count: 1 },
    ]);
    // Subjects are the CARRIERS, ranked with the breakdown: the hub
    // topic, then the card itself (no topicId — the card is the file).
    expect(line?.subjects).toEqual([
      { sectionId: expect.any(String), topicId: hub.id },
      { sectionId: expect.any(String) },
    ]);
    // Carriers have rows, so the line lands in Attention.
    const { attention } = groupFindings(buildTier1(d).findings);
    expect(attention.some((c) => c.head.id === "above-prose")).toBe(true);
  });

  it("counts sealed sections and names their declared source", () => {
    const sealed: Section = {
      ...section("API", []),
      sealed: { source: "OpenAPI /openapi.json" },
    };
    const report = buildTier1(doc([sealed]));
    expect(find(report, "sealed")?.count).toBe(1);
    expect(find(report, "sealed")?.receipt).toContain("OpenAPI /openapi.json");
  });

  it("counts cards per container", () => {
    const carded = (title: string, chain: string[]): Section => ({
      ...section(title, [topic(title)]),
      chain,
    });
    const d: TocDocument = {
      ...doc([carded("a", ["Guides"]), carded("b", ["Guides"]), carded("c", ["API"])]),
      containers: [
        {
          chainKey: "Guides",
          label: "Guides",
          order: 0,
          accepts: { sections: true, orphans: false },
          mayEmpty: true,
        },
        {
          chainKey: "API",
          label: "API",
          order: 1,
          accepts: { sections: true, orphans: false },
          mayEmpty: true,
        },
      ],
    };
    expect(find(buildTier1(d), "containers")?.breakdown).toEqual([
      { key: "Guides", count: 2 },
      { key: "API", count: 1 },
    ]);
  });

  it("counts empty sections", () => {
    expect(find(buildTier1(doc([section("Empty", [])])), "empty-sections")?.count).toBe(
      1,
    );
  });

  it("every finding carries a receipt, inline", () => {
    // The panel is read by someone who never opens the app, and a
    // screenshot of it has to carry its evidence.
    const d = doc([
      { ...section("Loose", [topic("x")]), isOrphan: true },
      section("Empty", []),
    ]);
    for (const finding of buildTier1(d).findings) {
      expect(finding.receipt.length).toBeGreaterThan(0);
    }
  });

  it("emits no finding for a fact the document does not have", () => {
    // An empty section for every line would read as broken.
    const clean = doc([section("Guide", [topic("A")])]);
    expect(buildTier1(clean).findings.map((f) => f.id)).toEqual([]);
  });
});
