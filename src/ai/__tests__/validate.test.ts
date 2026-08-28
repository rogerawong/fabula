/** Reconstruction — the confidence core (plan step 2). */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { doc, sampleDoc, section, topic } from "@/model/__tests__/fixtures";
import { chainPathKey } from "@/model/selectors";
import { countTopics } from "@/model/selectors";
import type { Section, TocDocument, Topic } from "@/model/types";
import { buildOutline } from "../outline";
import { parseResponse } from "../parse";
import { reconstructDocument } from "../validate";
import type { ResultNode } from "../contract";

const OPTS = {
  mode: "grounded" as const,
  scopeSectionIds: null as string[] | null,
  allowRenames: false,
  allowNewSections: true,
  allowFileMoves: false,
  folderHints: false,
  granularity: "full" as const,
};

/** Parse a response against the sample doc's outline and reconstruct. */
function run(doc: TocDocument, response: string, options: Partial<typeof OPTS> = {}) {
  const merged = { ...OPTS, ...options };
  const outline = buildOutline(doc, merged);
  const parsed = parseResponse(response, new Set(outline.idMap.keys()));
  expect(parsed.errors).toEqual([]);
  return reconstructDocument({
    doc,
    nodes: parsed.nodes,
    idMap: outline.idMap,
    options: merged,
  });
}

function allTopicUuids(sections: Section[]): string[] {
  const out: string[] = [];
  const walk = (t: Topic) => {
    out.push(t.id);
    t.children.forEach(walk);
  };
  for (const s of sections) s.topics.forEach(walk);
  return out.sort();
}

// Sample outline reminder:
// s1 Guide [t1 Intro, t2 Setup [t3 Install, t4 Config], t5 Advanced]
// s2 Reference [t6 API [t7 Core, t8 Plugins]]
// t9 FAQ (orphan)

describe("children-follow semantics", () => {
  it("a listed node without children keeps its originals", () => {
    const d = sampleDoc();
    const { doc } = run(d, "s2\ns1\nt9");
    expect(doc.sections.map((s) => s.title)).toEqual(["Reference", "Guide", "FAQ"]);
    const guide = doc.sections[1]!;
    expect(guide.topics.map((t) => t.title)).toEqual(["Intro", "Setup", "Advanced"]);
    expect(guide.topics[1]!.children.map((t) => t.title)).toEqual(["Install", "Config"]);
  });

  it("a child placed elsewhere is subtracted from its implicit parent", () => {
    const d = sampleDoc();
    // move Install (t3) under Reference; Setup keeps only Config
    const { doc, summary } = run(d, "s1\ns2\n  t3\nt9");
    const setup = doc.sections[0]!.topics[1]!;
    expect(setup.children.map((t) => t.title)).toEqual(["Config"]);
    const ref = doc.sections[1]!;
    expect(ref.topics.map((t) => t.title)).toEqual(["Install", "API"]);
    expect(summary.moved).toBe(1);
  });

  it("a parent moved without listing children carries them along", () => {
    const d = sampleDoc();
    const { doc } = run(d, "s1\ns2\n  t2\nt9");
    const ref = doc.sections[1]!;
    const setup = ref.topics.find((t) => t.title === "Setup")!;
    expect(setup.children.map((t) => t.title)).toEqual(["Install", "Config"]);
    // and Guide no longer has it
    expect(doc.sections[0]!.topics.map((t) => t.title)).toEqual(["Intro", "Advanced"]);
  });

  it("a cycle attempt (parent under its own descendant) cannot duplicate", () => {
    const d = sampleDoc();
    // t2 (Setup) placed under t3 (Install, its own child) — t3 explicit
    // under s2, t2 under t3; t2's implicit expansion excludes t3
    const { doc } = run(d, "s1\ns2\n  t3\n    t2\nt9");
    const uuidCounts = allTopicUuids(doc.sections);
    expect(new Set(uuidCounts).size).toBe(uuidCounts.length);
    const install = doc.sections[1]!.topics[0]!;
    expect(install.title).toBe("Install");
    expect(install.children[0]!.title).toBe("Setup");
    expect(install.children[0]!.children.map((t) => t.title)).toEqual(["Config"]);
  });
});

describe("omission recovery", () => {
  it("an omitted subtree returns to its original section", () => {
    const d = sampleDoc();
    // response drops t2 (Setup) entirely
    const { doc, summary } = run(d, "s1\n  t1\n  t5\ns2\nt9");
    const guide = doc.sections[0]!;
    expect(guide.topics.map((t) => t.title)).toEqual(["Intro", "Advanced", "Setup"]);
    expect(guide.topics[2]!.children).toHaveLength(2);
    expect(summary.recovered).toBe(1); // Setup itself (children implicit)
  });

  it("a dropped section is recreated for its recovered topics", () => {
    const d = sampleDoc();
    // response omits s2 and its subtree entirely
    const { doc, summary } = run(d, "s1\nt9");
    const ref = doc.sections.find((s) => s.title === "Reference")!;
    expect(countTopics(ref.topics).total).toBe(3);
    expect(summary.recovered).toBe(1); // API; children follow implicitly
  });
});

describe("renames × titleDerived", () => {
  it("echoed titles are not renames; explicit differing titles are (when allowed)", () => {
    const d = sampleDoc();
    d.sections[0]!.topics[0]!.titleDerived = true; // Intro derived
    const { doc, summary } = run(d, "s1\n  t1 Intro\n  t2 ~ Getting Set Up\nt9\ns2", {
      allowRenames: true,
    });
    const guide = doc.sections[0]!;
    expect(guide.topics[0]!.title).toBe("Intro");
    expect(guide.topics[0]!.titleDerived).toBe(true); // echo → untouched
    expect(guide.topics[1]!.title).toBe("Getting Set Up");
    expect(guide.topics[1]!.titleDerived).toBe(false); // real rename clears
    expect(summary.renamed).toBe(1);
  });

  it("renames are ignored entirely when disallowed", () => {
    const d = sampleDoc();
    const { doc, summary } = run(d, "s1\n  t1 ~ Welcome\ns2\nt9", {
      allowRenames: false,
    });
    expect(doc.sections[0]!.topics[0]!.title).toBe("Intro");
    expect(summary.renamed).toBe(0);
  });
});

describe("orphans, promotion, demotion", () => {
  it("an orphan left at root re-wraps with its original section id", () => {
    const d = sampleDoc();
    const faqSectionId = d.sections[2]!.id;
    const { doc } = run(d, "t9\ns1\ns2");
    const faq = doc.sections[0]!;
    expect(faq.id).toBe(faqSectionId);
    expect(faq.isOrphan).toBe(true);
    expect(faq.topics).toHaveLength(1);
  });

  it("a topic moved to root with children is promoted to a section (unwrap)", () => {
    const d = sampleDoc();
    const setupUuid = d.sections[0]!.topics[1]!.id;
    const { doc, summary } = run(d, "s1\nt2\ns2\nt9");
    const promoted = doc.sections[1]!;
    expect(promoted.title).toBe("Setup");
    expect(promoted.topics.map((t) => t.title)).toEqual(["Install", "Config"]);
    expect(summary.promoted).toBe(1);
    // the promoted topic uuid is accounted for, not lost
    expect(allTopicUuids(doc.sections)).not.toContain(setupUuid);
  });

  it("a leaf topic moved to root is wrapped, keeping its id", () => {
    const d = sampleDoc();
    const introUuid = d.sections[0]!.topics[0]!.id;
    const { doc } = run(d, "t1\ns1\ns2\nt9");
    const wrapped = doc.sections[0]!;
    expect(wrapped.isOrphan).toBe(true);
    expect(wrapped.topics[0]!.id).toBe(introUuid);
  });

  it("a section id nested under another section is demoted to a topic (merge)", () => {
    const d = sampleDoc();
    // explicit children replace — list Guide's topics + the merged section
    const { doc, summary } = run(d, "s1\n  t1\n  t2\n  t5\n  s2\nt9");
    expect(doc.sections.map((s) => s.title)).toEqual(["Guide", "FAQ"]);
    const merged = doc.sections[0]!.topics.at(-1)!;
    expect(merged.title).toBe("Reference");
    expect(merged.children.map((t) => t.title)).toEqual(["API"]);
    expect(summary.demoted).toBe(1);
  });

  it("partial explicit children drop nothing — the rest is recovered", () => {
    const d = sampleDoc();
    // model lists ONLY the merged section under s1 (sloppy but common)
    const { doc } = run(d, "s1\n  s2\nt9");
    const guide = doc.sections[0]!;
    // Reference merged in; Guide's own topics recovered after it
    expect(guide.topics.map((t) => t.title)).toEqual([
      "Reference",
      "Intro",
      "Setup",
      "Advanced",
    ]);
  });
});

describe("new sections and empty sections", () => {
  it("+ creates a new section when allowed", () => {
    const d = sampleDoc();
    const { doc, summary } = run(d, "s1\n+ Basics\n  t1\n  t5\ns2\nt9");
    const basics = doc.sections[1]!;
    expect(basics.title).toBe("Basics");
    expect(basics.topics.map((t) => t.title)).toEqual(["Intro", "Advanced"]);
    expect(summary.newSections).toBe(1);
  });

  it("+ at root when disallowed is skipped; its topics are recovered", () => {
    const d = sampleDoc();
    const { doc, summary } = run(d, "s1\n+ Basics\n  t1\ns2\nt9", {
      allowNewSections: false,
      allowFileMoves: false,
    });
    expect(doc.sections.map((s) => s.title)).toEqual(["Guide", "Reference", "FAQ"]);
    // Intro recovered into Guide
    expect(doc.sections[0]!.topics.map((t) => t.title)).toContain("Intro");
    expect(summary.warnings.join(" ")).toContain("Basics");
  });

  it("a section emptied by moves is dropped and counted", () => {
    const d = sampleDoc();
    // move Reference's only topic into Guide; s2 listed but empty
    const { doc, summary } = run(d, "s1\n  t6\ns2\nt9");
    expect(doc.sections.map((s) => s.title)).toEqual(["Guide", "FAQ"]);
    expect(summary.emptySectionsDropped).toBe(1);
  });
});

describe("a new section in a SCOPED run slots within the scope", () => {
  /**
   * The settle-during-implementation item from docs/16, and it turned
   * out to be already true by construction — `builtSections` walks the
   * proposal in order, and the pass-through inserts the whole in-scope
   * block at the FIRST in-scope position. So this asserts a property
   * rather than adding one, which is the point: nothing pinned it, and
   * a later change to the assembly could append without failing a test.
   *
   * Why it must slot rather than append, in contract terms and not only
   * perceptual ones: scope is a PROMISE that out-of-scope cards are
   * untouched. Appending a new heading after them changes their
   * relative position in the document, so the result impersonates an
   * out-of-scope reorder — a change the run was told it could not make,
   * arriving in a shape the user cannot distinguish from one the model
   * chose. The perception is bad; the contract violation is the reason.
   */
  const scopedRun = (response: string) => {
    const d = sampleDoc();
    const guideId = d.sections[0]!.id;
    const merged = { ...OPTS, scopeSectionIds: [guideId] };
    const outline = buildOutline(d, merged);
    const parsed = parseResponse(response, new Set(outline.idMap.keys()));
    expect(parsed.errors).toEqual([]);
    return reconstructDocument({
      doc: d,
      nodes: parsed.nodes,
      idMap: outline.idMap,
      options: merged,
    }).doc;
  };

  it("places a new section BEFORE the out-of-scope cards, not after them", () => {
    // Scope is Guide (index 0). Reference and FAQ follow it and were
    // never in the run.
    const doc = scopedRun("+ Getting Started\n  t1\ns1\n  t2\n  t5");
    expect(doc.sections.map((s) => s.title)).toEqual([
      "Getting Started",
      "Guide",
      "Reference",
      "FAQ",
    ]);
  });

  it("keeps the model's own position for the new section inside the block", () => {
    // After s1 this time. Still inside the scoped block, still before
    // the untouched cards.
    const doc = scopedRun("s1\n  t2\n  t5\n+ Appendix\n  t1");
    expect(doc.sections.map((s) => s.title)).toEqual([
      "Guide",
      "Appendix",
      "Reference",
      "FAQ",
    ]);
  });

  it("never appends it past a card the run was told to leave alone", () => {
    // The invariant, stated as the thing that must not happen: no new
    // section may land after the first out-of-scope card, because that
    // silently moves that card.
    for (const response of [
      "+ First\n  t1\ns1\n  t2\n  t5",
      "s1\n  t2\n  t5\n+ Last\n  t1",
    ]) {
      const titles = scopedRun(response).sections.map((s) => s.title);
      const firstOutOfScope = titles.indexOf("Reference");
      const created = titles.findIndex((t) => t === "First" || t === "Last");
      expect(created).toBeGreaterThanOrEqual(0);
      expect(created).toBeLessThan(firstOutOfScope);
    }
  });
});

describe("scope pass-through", () => {
  it("unscoped sections are untouched and hold their positions", () => {
    const d = sampleDoc();
    const guideId = d.sections[0]!.id;
    const refBefore = JSON.stringify(d.sections[1]);
    const faqBefore = JSON.stringify(d.sections[2]);

    // scope = Guide only; reverse its topics
    const merged = { ...OPTS, scopeSectionIds: [guideId] };
    const outline = buildOutline(d, merged);
    const parsed = parseResponse("s1\n  t5\n  t2\n  t1", new Set(outline.idMap.keys()));
    expect(parsed.errors).toEqual([]);
    const { doc, summary } = reconstructDocument({
      doc: d,
      nodes: parsed.nodes,
      idMap: outline.idMap,
      options: merged,
    });

    expect(doc.sections.map((s) => s.title)).toEqual(["Guide", "Reference", "FAQ"]);
    expect(doc.sections[0]!.topics.map((t) => t.title)).toEqual([
      "Advanced",
      "Setup",
      "Intro",
    ]);
    expect(JSON.stringify(doc.sections[1])).toBe(refBefore);
    expect(JSON.stringify(doc.sections[2])).toBe(faqBefore);
    expect(summary.scopedSections).toBe(1);
  });
});

describe("document payload carry-over", () => {
  it("doc extras and formatId survive (the MkDocs config lifeline)", () => {
    const d = sampleDoc();
    d.formatId = "mkdocs";
    d.extras = { config: { site_name: "X", nav: [] } };
    const { doc } = run(d, "s1\ns2\nt9");
    expect(doc.formatId).toBe("mkdocs");
    expect(doc.extras).toEqual({ config: { site_name: "X", nav: [] } });
    expect(doc.extras).not.toBe(d.extras); // cloned, not shared
  });

  it("warns when an MkDocs page gains children (path lost on export)", () => {
    const d = sampleDoc();
    d.formatId = "mkdocs";
    // nest Advanced (t5, leaf with path) under… give t1 a child
    const { summary } = run(d, "s1\n  t1\n    t5\ns2\nt9");
    expect(summary.warnings.join(" ")).toContain("lose their link");
  });
});

describe("granularity: hidden subtrees move atomically", () => {
  it("moving a truncated topic carries its hidden descendants", () => {
    const d = sampleDoc();
    const merged = { ...OPTS, granularity: "two" as const };
    const outline = buildOutline(d, merged);
    // t2 = Setup (+2 topics). Move it under Reference (s2).
    const parsed = parseResponse("s1\ns2\n  t2\nt3", new Set(outline.idMap.keys()));
    expect(parsed.errors).toEqual([]);
    const { doc } = reconstructDocument({
      doc: d,
      nodes: parsed.nodes,
      idMap: outline.idMap,
      options: merged,
    });
    const ref = doc.sections[1]!;
    const setup = ref.topics.find((t) => t.title === "Setup")!;
    expect(setup.children.map((t) => t.title)).toEqual(["Install", "Config"]);
  });
});

describe("property: the multiset invariant", () => {
  it("any valid permutation preserves every topic id (or accounts it as promoted)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000 }), (seed) => {
        const d = sampleDoc();
        const outline = buildOutline(d, OPTS);
        const ids = [...outline.idMap.keys()];

        // deterministic pseudo-random shuffle + partial structure
        let x = seed;
        const rnd = () => {
          x = (x * 48271) % 0x7fffffff;
          return x;
        };
        const shuffled = [...ids].sort(() => (rnd() % 2 === 0 ? -1 : 1));
        const take = 1 + (rnd() % shuffled.length);
        const chosen = shuffled.slice(0, take);
        const nodes: ResultNode[] = chosen.map((id) => ({ id }));
        // randomly nest some nodes under the previous one
        const roots: ResultNode[] = [];
        for (const node of nodes) {
          const prev = roots.at(-1);
          if (prev && rnd() % 3 === 0) {
            (prev.children ??= []).push(node);
          } else {
            roots.push(node);
          }
        }

        const before = allTopicUuids(d.sections);
        const { doc, summary } = reconstructDocument({
          doc: d,
          nodes: roots,
          idMap: outline.idMap,
          options: OPTS,
        });
        const after = allTopicUuids(doc.sections);

        // reconstruct throws on violation; also assert directly:
        // after − demoted-section-ids + promoted == before (multisets)
        expect(after.length - summary.demoted + summary.promoted).toBe(before.length);
        expect(new Set(after).size).toBe(after.length);
      }),
      { numRuns: 60 },
    );
  });
});

describe("rename capability is enforced per node kind", () => {
  // The prompt asks the model not to rename; this is the layer that makes
  // it true regardless (docs/13). Enforcement sits beside the topic-id
  // multiset guard for the same reason: an invariant cannot be talked
  // out of it, and a rename the adapter cannot serialize must never land.
  const withFormat = (formatId: string): TocDocument => ({
    ...doc([section("Guide", [topic("Install", [], "install.md")])]),
    formatId,
  });

  it("applies both renames when the adapter restricts neither kind", () => {
    const { doc: out } = run(
      withFormat("docfx"),
      "s1 ~ Renamed section\n  t1 ~ Renamed topic",
      {
        allowRenames: true,
      },
    );
    expect(out.sections[0]!.title).toBe("Renamed section");
    expect(out.sections[0]!.topics[0]!.title).toBe("Renamed topic");
  });

  it("applies a section rename and refuses a topic one for the mixed capability", () => {
    // mintlify declares { sections: true, topics: false } — the shape an
    // inverted or half-applied check would bite on, and the only one the
    // all-true and all-false cases cannot catch.
    const { doc: out } = run(
      withFormat("mintlify"),
      "s1 ~ Renamed section\n  t1 ~ Renamed topic",
      {
        allowRenames: true,
      },
    );
    expect(out.sections[0]!.title).toBe("Renamed section");
    expect(out.sections[0]!.topics[0]!.title).toBe("Install");
  });

  it("refuses both renames for an adapter that declares neither kind renameable", () => {
    // sphinx declares { sections: false, topics: false }
    const { doc: out } = run(
      withFormat("sphinx"),
      "s1 ~ Renamed section\n  t1 ~ Renamed topic",
      {
        allowRenames: true,
      },
    );
    expect(out.sections[0]!.title).toBe("Guide");
    expect(out.sections[0]!.topics[0]!.title).toBe("Install");
  });
});

describe("navigation containers survive reconstruction", () => {
  // Chains are invisible to the outline, so a proposal can never name one.
  // Reconstruction must therefore carry each card's own container across
  // unchanged — dropping it would silently flatten every tab into the
  // root container on the next export (docs/13).
  const chained = (chain: readonly string[], title: string, path: string): Section => ({
    ...section(title, [topic(`${title} page`, [], path)]),
    chain,
  });
  const DOCS = ["en", "Documentation"];
  const API = ["en", "API reference"];

  const twoTabs = (): TocDocument => ({
    ...doc([
      chained(DOCS, "Get started", "index"),
      chained(DOCS, "Operate", "operate/deploy"),
      chained(API, "Endpoints", "api/launches"),
    ]),
    formatId: "mintlify",
  });

  it("keeps each card's container when the proposal reorders within one", () => {
    const { doc: out } = run(twoTabs(), "s2\ns1\ns3");
    expect(out.sections.map((s) => [s.title, s.chain])).toEqual([
      ["Operate", DOCS],
      ["Get started", DOCS],
      ["Endpoints", API],
    ]);
  });

  it("keeps the container and the seal of a card rebuilt from an orphan wrapper", () => {
    // A Mintlify $ref card: an orphan wrapper inside a language
    // container, whose contents really do live in another file.
    const withRef = (): TocDocument => ({
      ...doc([
        chained(DOCS, "Get started", "index"),
        {
          ...section("./fr.json", [topic("./fr.json", [], undefined)]),
          chain: ["en"],
          isOrphan: true,
          sealed: { source: "./fr.json" },
        },
      ]),
      formatId: "mintlify",
    });
    const { doc: out } = run(withRef(), "s1\nt2");
    const ref = out.sections.find((s) => s.title === "./fr.json")!;
    expect(ref.chain).toEqual(["en"]);
    expect(ref.sealed).toEqual({ source: "./fr.json" });
  });

  it("lets a new card adopt the container of the card above it", () => {
    const { doc: out } = run(twoTabs(), "s1\n+ Extra\n  t2\ns3", {
      allowNewSections: true,
      allowFileMoves: false,
    });
    const extra = out.sections.find((s) => s.title === "Extra")!;
    expect(extra.chain).toEqual(DOCS);
  });

  it("lets a card promoted out of a section adopt the container above it", () => {
    // Promotion mints a section from a topic, so there is no original
    // section to copy a container from — it inherits, like a new card.
    const withNested = (): TocDocument => ({
      ...doc([
        {
          ...section("Get started", [
            topic("Install", [topic("Windows", [], "install/windows")], "install"),
            topic("Setup", [], "setup"),
          ]),
          chain: DOCS,
        },
        chained(API, "Endpoints", "api/launches"),
      ]),
      formatId: "mintlify",
    });
    const { doc: out } = run(withNested(), "s1\nt1\n  t2\ns2");
    const promoted = out.sections.find((s) => s.title === "Install")!;
    expect(promoted.chain).toEqual(DOCS);
  });

  it("gives a card promoted out of a chained section a container to live in", () => {
    // Without one the serializer has nowhere to put it but the container
    // array itself, which writes a page path where only tabs are legal.
    const { doc: out } = run(twoTabs(), "s1\nt1\ns2\ns3");
    const promoted = out.sections.find((s) => s.title === "Get started page")!;
    expect(promoted.chain).toEqual(DOCS);
  });

  it("keeps a locked row locked through a proposal that moves nothing", () => {
    // Reconstruction rebuilds topics field by field, so a dropped lock
    // turns an external link into an ordinary group on the next export.
    const withLock = (): TocDocument => ({
      ...doc([
        {
          ...section("Guides", [
            topic("Install", [], "install"),
            { ...topic("Status", [], undefined), lock: { kind: "external" } },
          ]),
          chain: DOCS,
        },
      ]),
      formatId: "mintlify",
    });
    // Children listed explicitly, which is what an echoed outline does —
    // an unlisted section clones its rows and never exercises the rebuild.
    const { doc: out } = run(withLock(), "s1\n  t1\n  t2");
    const rows = out.sections[0]!.topics;
    expect(rows.find((t) => t.title === "Status")?.lock).toEqual({ kind: "external" });
  });

  it("warns when a proposal places a card among another container's cards", () => {
    // The serializer partitions by container, so this arrangement cannot
    // be exported. Saying so beats exporting a silent no-op.
    const { summary } = run(twoTabs(), "s1\ns3\ns2");
    expect(summary.warnings.join(" ")).toMatch(/container/i);
    expect(summary.warnings.join(" ")).toContain("Documentation");
  });

  it("stays quiet when a scoped run changes nothing", () => {
    // The scope pass-through hoists the whole in-scope block to where the
    // first scoped card was, which can split a container in the ASSEMBLED
    // document even though the proposal moved nothing. The warning is
    // about what the model proposed, so it must not read the assembly.
    const d = twoTabs();
    const scopeSectionIds = [d.sections[0]!.id, d.sections[2]!.id];
    const options = { scopeSectionIds };
    const echoed = buildOutline(d, { ...OPTS, ...options }).text;
    const { summary } = run(d, echoed, options);
    expect(summary.warnings.filter((w) => /container/i.test(w))).toEqual([]);
  });

  it("warns when a proposal reorders whole containers, not just interleaves them", () => {
    // Each container stays contiguous, so a contiguity check alone sees
    // nothing — but the order OF containers comes from the file, so this
    // arrangement cannot be exported either.
    const { summary } = run(twoTabs(), "s3\ns1\ns2");
    expect(summary.warnings.join(" ")).toMatch(/container/i);
  });

  it("stays quiet when every container's cards remain contiguous", () => {
    const { summary } = run(twoTabs(), "s2\ns1\ns3");
    expect(summary.warnings.filter((w) => /container/i.test(w))).toEqual([]);
  });

  it("stays quiet for a document with no containers at all", () => {
    const { summary } = run(sampleDoc(), "s2\ns1\nt9");
    expect(summary.warnings.filter((w) => /container/i.test(w))).toEqual([]);
  });

  // ── the never-empty guarantee, on the AI path ─────────────
  //
  // `mayEmpty: false` was enforced on the drag path only: the predicate
  // existed and had no call site here, so a proposal that drained a tab
  // dropped its last card and exported `groups: []` against a schema
  // requiring `minItems: 1` — silently. Reachable without any new
  // capability, because cards carry their chains across a proposal and
  // topics do not.
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

  const twoTabsDeclared = (apiMayEmpty = false): TocDocument => ({
    ...twoTabs(),
    containers: [
      declared(DOCS, "Documentation", 0, false),
      declared(API, "API reference", 1, apiMayEmpty),
    ],
  });

  // s3's only topic is placed under s1, so s3 empties and is dropped —
  // taking the API tab's last card with it.
  const DRAIN = "s1\n  t1\n  t3\ns2\ns3";

  it("refuses a proposal that would leave a never-empty container with no cards", () => {
    expect(() => run(twoTabsDeclared(), DRAIN)).toThrow(/API reference/);
  });

  it("names the container so the retry can act on it", () => {
    expect(() => run(twoTabsDeclared(), DRAIN)).toThrow(/tab 'API reference'/);
  });

  it("allows the same drain where the format lets that container empty", () => {
    const { doc: out } = run(twoTabsDeclared(true), DRAIN);
    expect(out.sections.map((s) => s.title)).toEqual(["Get started", "Operate"]);
  });

  it("carries the container registry into the reorganized document", () => {
    // Sections carry their own `chain`, so the EXPORT survived without
    // this — which is why it went unnoticed. What did not survive is the
    // registry the guards read: lanes, chips, `cardChainRefused` and the
    // net below all consult `doc.containers`, and a result without it is
    // a tab that quietly lost its protections.
    const { doc: out } = run(twoTabsDeclared(), "s2\ns1\ns3");
    expect(out.containers?.map((c) => c.label)).toEqual([
      "Documentation",
      "API reference",
    ]);
  });

  it("still refuses a drain when the document is ITSELF a reorganize result", () => {
    // The guarantee has to survive the operation that produces the tab.
    // Reorganize opens its result as a new tab, and reorganizing that
    // tab is the ordinary next gesture.
    const once = run(twoTabsDeclared(), "s2\ns1\ns3").doc;
    expect(() => run(once, DRAIN)).toThrow(/API reference/);
  });

  it("does not refuse a proposal for a container that ARRIVED empty", () => {
    // Adapters declare a descriptor for every container they find,
    // including one that legally bears cards and holds none. Refusing on
    // emptiness rather than on EMPTYING would make every edit to such a
    // document illegal, forever, for a state the user did not cause.
    const withGhost = (): TocDocument => ({
      ...twoTabs(),
      containers: [
        declared(DOCS, "Documentation", 0, false),
        declared(API, "API reference", 1, false),
        declared(["en", "Changelog"], "Changelog", 2, false),
      ],
    });
    const { doc: out } = run(withGhost(), "s2\ns1\ns3");
    expect(out.sections.map((s) => s.title)).toEqual([
      "Operate",
      "Get started",
      "Endpoints",
    ]);
  });

  it("leaves a container alone when the drained card was its only EMPTY one", () => {
    // The guard is about the container's population, not about drops:
    // dropping a card from a tab that keeps others is ordinary merging.
    const { doc: out } = run(twoTabsDeclared(), "s1\n  t1\n  t2\ns2\ns3");
    expect(out.sections.map((s) => s.title)).toEqual(["Get started", "Endpoints"]);
  });
});

describe("a sealed card is not an empty one", () => {
  // Zero rows and generated-elsewhere are opposites. The empty-drop pass
  // cannot tell them apart by counting rows, which is the whole reason
  // Section.sealed is declared rather than derived (docs/13).
  const sealedDoc = (): TocDocument => ({
    ...doc([
      section("Guide", [topic("Install", [], "install")]),
      {
        ...section("API reference", []),
        sealed: { source: "OpenAPI /openapi.json" },
      },
    ]),
    formatId: "mintlify",
  });

  it("keeps a sealed card that has no rows, and its source label", () => {
    const { doc: out } = run(sealedDoc(), "s2\ns1");
    const sealed = out.sections.find((s) => s.title === "API reference");
    expect(sealed?.sealed).toEqual({ source: "OpenAPI /openapi.json" });
  });

  it("keeps a sealed card the proposal never mentions", () => {
    // Its rows are generated elsewhere, so recovery cannot rebuild it
    // from omitted topics and the multiset net cannot see it missing.
    // Omission would delete a nav entry with nothing said.
    const { doc: out } = run(sealedDoc(), "s1");
    expect(out.sections.map((s) => s.title)).toContain("API reference");
  });

  it("refuses to merge a sealed card into another, rather than emptying it", () => {
    // A topic has nowhere to carry a seal, so demoting one would export
    // `pages: []` over content the adapter never read.
    const { doc: out, summary } = run(sealedDoc(), "s1\n  s2");
    const sealed = out.sections.find((s) => s.title === "API reference");
    expect(sealed?.sealed).toEqual({ source: "OpenAPI /openapi.json" });
    expect(summary.warnings.join(" ")).toMatch(/API reference/);
  });

  it("still drops a genuinely empty card", () => {
    const withEmpty = (): TocDocument => ({
      ...doc([
        section("Guide", [topic("Install", [], "install")]),
        section("Coming soon", []),
      ]),
      formatId: "mintlify",
    });
    const { doc: out, summary } = run(withEmpty(), "s2\ns1");
    expect(out.sections.map((s) => s.title)).toEqual(["Guide"]);
    expect(summary.emptySectionsDropped).toBe(1);
  });
});

describe("D4 — a section nested under a section is a directory move", () => {
  // THE PIN, written before the fix and asserting TODAY's behaviour.
  // The claim under test came from reading validate.ts, not from running
  // it, and a code receipt that was read rather than executed is a
  // hypothesis. So this file first records what happens, and the
  // assertion is flipped only once the drop is confirmed.
  //
  // Why it would be invisible: the parentage net keys its map by TOPIC
  // id (`walk(s.topics, s.id)`), so a section id is only ever a VALUE.
  // Demoting a section makes its id a key in `now`, but `was.has(id)` is
  // false — and the filter drops it.
  const hugoDoc = (): TocDocument => ({
    ...doc([
      section("Guide", [topic("Intro", [], "content/docs/guide/intro.md")]),
      section("Reference", [topic("API", [], "content/docs/reference/api.md")]),
    ]),
    formatId: "hugo",
  });

  // PINNED FIRST, then flipped [2026-08-17]. The pin asserted today's
  // behaviour on this exact fixture and PASSED twice: the nesting
  // arrives as a demotion (Guide keeps a "Reference" row carrying
  // "API"), and with the toggle off nothing threw — Hugo's capability
  // true, a whole directory changing parents, no objection. That is the
  // silent drop, reproduced by EXECUTION rather than by reading the
  // filter and reasoning about it.
  //
  // The pin is retired rather than kept: it asserted the defect, so
  // leaving it would assert the defect back. What survives it is the
  // mechanism test at the bottom of this block — the same demotion, on
  // a nav-owned format, where it is legal and still works.

  it("is REFUSED with the toggle off", () => {
    expect(() => run(hugoDoc(), "s1\n  t1\n  s2", { allowFileMoves: false })).toThrow(
      /whole folder/i,
    );
  });

  it("is REFUSED with the toggle ON — the toggle is not the question", () => {
    // A directory move is not something ANY version does, so unlike a
    // page move this refusal does not turn on consent. It matches the
    // canvas, where `topicMoveRefusal` answers "subsection" for an
    // `_index.md` row regardless of the toggle. One truth, three
    // surfaces.
    expect(() => run(hugoDoc(), "s1\n  t1\n  s2", { allowFileMoves: true })).toThrow(
      /whole folder/i,
    );
  });

  it("names the redistribution path, the same one the drag overlay names", () => {
    expect(() => run(hugoDoc(), "s1\n  t1\n  s2", { allowFileMoves: true })).toThrow(
      /individually/i,
    );
  });

  it("THE COMPLEMENT: an ordinary Hugo reorganize is untouched by this net", () => {
    // Found by mutation-checking, not by review. Negating the predicate
    // (`!nowTopic.has(id)`) survived all 53 tests: it still refused the
    // nesting cases above, and nothing anywhere asserted that a Hugo
    // document WITHOUT a demotion is allowed through. A net is only
    // pinned when both of its answers are.
    const { doc: out } = run(hugoDoc(), "s2\ns1", { allowFileMoves: true });
    expect(out.sections.map((s) => s.title)).toEqual(["Reference", "Guide"]);
  });

  it("still MERGES a section on a nav-owned format — nothing about MkDocs changes", () => {
    // The shipped merge behaviour. A nav-owned format expresses this as
    // a nav edit with nothing on disk to move, so refusing it here would
    // be borrowing Hugo's constraint for a format that does not have it.
    const navOwned = (): TocDocument => ({
      ...doc([
        section("Guide", [topic("Intro", [], "guide/intro.md")]),
        section("Reference", [topic("API", [], "reference/api.md")]),
      ]),
      formatId: "mkdocs",
    });
    const { doc: out } = run(navOwned(), "s1\n  t1\n  s2");
    expect(out.sections.map((s) => s.title)).toEqual(["Guide"]);
    expect(out.sections[0]!.topics.at(-1)!.title).toBe("Reference");
  });
});

describe("locked rows are pinned against the AI, not only against the drag", () => {
  // PINNED FIRST [2026-08-17]. `Topic.lock`'s own docblock says locked
  // nodes "cannot be dragged, deleted or renamed, and planners never
  // rewrite their lines". The drag enforces it — `topicDrag.ts:175`
  // refuses the gesture through `anyTopicLocked`. Nothing in
  // `commands/`, `guards.ts` or `ai/validate.ts` consulted it, and the
  // pin confirmed the consequence by execution: an `external`-locked
  // row was relocated to another section, no throw.
  //
  // Two entry points, one rule, one enforcer — the sidebar hole again,
  // and the same shape as the section-demotion net.
  const lockedDoc = (): TocDocument => ({
    ...doc([
      section("Guide", [
        topic("Intro", [], "guide/intro"),
        { ...topic("Spec", [], "https://example.com/spec"), lock: { kind: "external" } },
      ]),
      section("Reference", [topic("API", [], "reference/api")]),
    ]),
  });

  it("refuses a proposal that moves a locked row to another section", () => {
    expect(() => run(lockedDoc(), "s1\n  t1\ns2\n  t3\n  t2")).toThrow(/pinned|locked/i);
  });

  it("names the row, so the retry can act on it", () => {
    expect(() => run(lockedDoc(), "s1\n  t1\ns2\n  t3\n  t2")).toThrow(/Spec/);
  });

  it("THE COMPLEMENT: a proposal that leaves the locked row alone passes", () => {
    // Without this, a net inverted to refuse everything would pass every
    // test in this block — the D4 lesson, applied on the way in.
    const { doc: out } = run(lockedDoc(), "s2\n  t3\ns1\n  t1\n  t2");
    expect(out.sections.map((s) => s.title)).toEqual(["Reference", "Guide"]);
    expect(out.sections[1]!.topics.map((t) => t.title)).toEqual(["Intro", "Spec"]);
  });

  it("does not fire for a document with no locks at all", () => {
    const { doc: out } = run(sampleDoc(), "s2\ns1\nt9");
    expect(out.sections).toHaveLength(3);
  });
});
