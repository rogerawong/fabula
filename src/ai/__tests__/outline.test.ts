import { describe, expect, it } from "vitest";
import { doc, sampleDoc, section, topic } from "@/model/__tests__/fixtures";
import { chainPathKey } from "@/model/selectors";
import type { Section, TocDocument } from "@/model/types";
import { buildOutline, neverEmptyGroups } from "../outline";

const ALL = {
  mode: "grounded" as const,
  scopeSectionIds: null,
  allowRenames: false,
  allowNewSections: true,
  allowFileMoves: false,
  folderHints: false,
  granularity: "full" as const,
};

describe("buildOutline", () => {
  it("emits titles-only indented text with deterministic compact ids", () => {
    const d = sampleDoc(); // Guide, Reference, FAQ(orphan)
    const { text, idMap, stats } = buildOutline(d, ALL);

    expect(text).toBe(
      [
        "s1 Guide",
        "  t1 Intro",
        "  t2 Setup",
        "    t3 Install",
        "    t4 Config",
        "  t5 Advanced",
        "s2 Reference",
        "  t6 API",
        "    t7 Core",
        "    t8 Plugins",
        "t9 FAQ",
      ].join("\n"),
    );
    // no UUIDs, no paths leak
    expect(text).not.toMatch(/[0-9a-f]{8}-/);
    expect(text).not.toContain(".md");
    expect(stats).toMatchObject({ scopedSections: 3, totalSections: 3, topics: 9 });
    expect(idMap.get("t9")!.kind).toBe("topic");
  });

  it("orphans carry their wrapper section in the id map", () => {
    const d = sampleDoc();
    const { idMap } = buildOutline(d, ALL);
    const faq = idMap.get("t9");
    expect(faq?.kind === "topic" && faq.orphanSection?.isOrphan).toBe(true);
  });

  it("folder hints append directory prefixes only, never basenames", () => {
    const d = sampleDoc();
    const { text } = buildOutline(d, { ...ALL, folderHints: true });
    // Setup has path "setup/" → dir prefix; Intro is "intro.md" → no dir
    expect(text).toContain("t2 Setup");
    expect(text).not.toContain("intro.md");
    expect(text).not.toContain("install.md");
  });

  it("granularity 'two' truncates below L1 with counts; hidden topics get no ids", () => {
    const d = sampleDoc();
    const { text, idMap, stats } = buildOutline(d, { ...ALL, granularity: "two" });
    // hidden topics consume no ids → numbering stays dense
    expect(text).toContain("t2 Setup (+2 topics)");
    expect(text).toContain("t4 API (+2 topics)");
    expect(text).not.toContain("Install");
    // Install/Config/Core/Plugins hidden → 4 fewer ids, same topic count
    expect([...idMap.keys()].filter((k) => k.startsWith("t"))).toHaveLength(5);
    expect(stats.topics).toBe(9);
  });

  it("granularity 'top' lists only root entries", () => {
    const d = sampleDoc();
    const { text } = buildOutline(d, { ...ALL, granularity: "top" });
    expect(text).toBe(
      ["s1 Guide (+5 topics)", "s2 Reference (+3 topics)", "t1 FAQ"].join("\n"),
    );
  });

  it("scoping emits ids for scoped sections only + an id-less context line", () => {
    const d = sampleDoc();
    const guideId = d.sections[0]!.id;
    const { text, contextLine, stats } = buildOutline(d, {
      ...ALL,
      mode: "grounded" as const,
      scopeSectionIds: [guideId],
    });
    expect(text).toContain("s1 Guide");
    expect(text).not.toContain("Reference");
    expect(contextLine).toContain("context only");
    expect(contextLine).toContain("Reference");
    expect(contextLine).toContain("FAQ");
    expect(contextLine).not.toMatch(/\b[st]\d+\b/); // no ids in context
    expect(stats.scopedSections).toBe(1);
  });
});

describe("neverEmptyGroups", () => {
  // The bridge between a container registry the model cannot see and a
  // constraint it can act on. Ids, not labels, are the actionable part.
  const chained = (chain: readonly string[], title: string): Section => ({
    ...section(title, [topic(`${title} page`, [], title.toLowerCase())]),
    chain,
  });
  const DOCS = ["en", "Documentation"];
  const API = ["en", "API reference"];
  const declared = (
    chain: readonly string[],
    label: string,
    order: number,
    mayEmpty: boolean,
  ) => ({
    chainKey: chainPathKey(chain),
    label,
    kind: "tab",
    order,
    accepts: { sections: true, orphans: false },
    mayEmpty,
  });
  const tabbed = (): TocDocument => ({
    ...doc([chained(DOCS, "Guide"), chained(DOCS, "Operate"), chained(API, "Endpoints")]),
    formatId: "mintlify",
    containers: [
      declared(DOCS, "Documentation", 0, false),
      declared(API, "API reference", 1, false),
    ],
  });
  const OPTS = {
    mode: "grounded" as const,
    scopeSectionIds: null as string[] | null,
    allowRenames: false,
    allowNewSections: true,
    allowFileMoves: false,
    folderHints: false,
    granularity: "full" as const,
  };

  it("groups the outline ids of each never-empty container's sections", () => {
    const d = tabbed();
    const groups = neverEmptyGroups(d, buildOutline(d, OPTS).idMap);
    expect(groups).toEqual([
      { label: "Documentation", ids: ["s1", "s2"] },
      { label: "API reference", ids: ["s3"] },
    ]);
  });

  it("skips a container the format lets empty", () => {
    const d = tabbed();
    d.containers = [{ ...d.containers![0]!, mayEmpty: true }, d.containers![1]!];
    const groups = neverEmptyGroups(d, buildOutline(d, OPTS).idMap);
    expect(groups.map((g) => g.label)).toEqual(["API reference"]);
  });

  it("omits a container whose cards are all out of scope", () => {
    // A proposal that may not mention those ids cannot empty it, so a
    // line naming them would be a constraint the model cannot act on.
    const d = tabbed();
    const options = { ...OPTS, scopeSectionIds: [d.sections[0]!.id, d.sections[1]!.id] };
    const groups = neverEmptyGroups(d, buildOutline(d, options).idMap);
    expect(groups.map((g) => g.label)).toEqual(["Documentation"]);
  });

  it("returns nothing for a document with no containers", () => {
    const d = sampleDoc();
    expect(neverEmptyGroups(d, buildOutline(d, OPTS).idMap)).toEqual([]);
  });
});
