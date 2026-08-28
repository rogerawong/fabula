/**
 * aspirationalValidate.test.ts — Decision 6's table, both columns
 * (docs/21).
 *
 * THE ARMS REPLACE THROWS AT THE SAME SITES, in the same order. The
 * grounded column is today's semantics verbatim and every row of it is
 * asserted here beside its aspirational twin, because "classify instead
 * of discard" is a claim about a PAIR — a test that only exercised the
 * new arm would pass just as happily if the old one had been deleted.
 *
 * MULTISET FIRST, ALWAYS. A document that fails the multiset net is
 * discarded before any record is written, so a fabricated arrangement
 * can never arrive wearing badges. Imagination never licenses dropped or
 * duplicated topics — that is a proposal-constraint, binding in both
 * modes, and the property test in `aspirationalInvariants.test.ts` runs
 * the same corpus through both.
 *
 * THE FIRST CLASSIFIER TO CLAIM A ROW NAMES IT. The order-is-load-bearing
 * comment at the directory net keeps its meaning under classify
 * semantics: a directory-move demotion is recorded as THAT, not as N
 * pinned-row displacements, because only one of those names the actual
 * obstacle.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { TocDocument, Topic } from "@/model/types";
import { recordedLedger } from "@/model/ledger";
import { AiError, type IdMap, type ReorganizeOptions, type RunMode } from "../contract";
import { buildOutline } from "../outline";
import { reconstructDocument } from "../validate";

const OPTIONS = (
  mode: RunMode,
  over: Partial<ReorganizeOptions> = {},
): ReorganizeOptions => ({
  mode,
  scopeSectionIds: null,
  allowRenames: false,
  allowNewSections: false,
  allowFileMoves: false,
  folderHints: false,
  granularity: "full",
  ...over,
});

function pinned(
  title: string,
  kind: "outside-region" | "reference" = "outside-region",
): Topic {
  return { ...topic(title), lock: { kind } };
}

function run(
  d: TocDocument,
  nodes: Parameters<typeof reconstructDocument>[0]["nodes"],
  mode: RunMode,
  over: Partial<ReorganizeOptions> = {},
): { doc: TocDocument; idMap: IdMap } {
  const options = OPTIONS(mode, over);
  const outline = buildOutline(d, options);
  const result = reconstructDocument({ doc: d, nodes, idMap: outline.idMap, options });
  return { doc: result.doc, idMap: outline.idMap };
}

// ── pinned rows ─────────────────────────────────────────────

const PINNED_DOC = (): TocDocument =>
  doc([
    section("Getting started", [topic("Intro"), pinned("Using the Project Manager")]),
    section("Tutorials", [topic("First tutorial")]),
  ]);

/** t2 (pinned) listed under s2 — a parent change. */
const MOVE_PINNED = [
  { id: "s1", children: [{ id: "t1" }] },
  { id: "s2", children: [{ id: "t3" }, { id: "t2" }] },
];

describe("pinned rows: throw, then classify", () => {
  it("GROUNDED discards, with the branch-aware copy intact", () => {
    expect(() => run(PINNED_DOC(), MOVE_PINNED, "grounded")).toThrow(AiError);
    try {
      run(PINNED_DOC(), MOVE_PINNED, "grounded");
    } catch (err) {
      expect((err as AiError).message).toContain("The request marks every pinned row");
    }
  });

  it("ASPIRATIONAL opens the proposal and records the displacement", () => {
    const { doc: result } = run(PINNED_DOC(), MOVE_PINNED, "aspirational");
    expect(result.sections[1]!.topics.map((t) => t.title)).toEqual([
      "First tutorial",
      "Using the Project Manager",
    ]);
    const records = recordedLedger(result);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      kind: "pin",
      lockKind: "outside-region",
      originalParentTitle: "Getting started",
      originalIndex: 1,
      title: "Using the Project Manager",
    });
  });

  it("records NOTHING for a pinned row the proposal left alone", () => {
    const { doc: result } = run(
      PINNED_DOC(),
      [{ id: "s1" }, { id: "s2" }],
      "aspirational",
    );
    expect(recordedLedger(result)).toEqual([]);
  });

  it("records nothing for a pinned row that only changed sibling order", () => {
    // No lock kind promises POSITION (docs/19), so a reorder is not a
    // displacement — the same scope the grounded net has always had.
    const { doc: result } = run(
      PINNED_DOC(),
      [{ id: "s1", children: [{ id: "t2" }, { id: "t1" }] }, { id: "s2" }],
      "aspirational",
    );
    expect(recordedLedger(result)).toEqual([]);
  });
});

// ── a demoted section is a directory move ───────────────────

const HUGO_DOC = (): TocDocument => ({
  ...doc([
    section("Tasks", [topic("Provision swap")]),
    section("Tutorials", [topic("First tutorial")]),
  ]),
  formatId: "hugo",
});

/** s2 nested under s1's first topic — a whole card inside another. */
const DEMOTE = [{ id: "s1", children: [{ id: "t1" }, { id: "s2" }] }];

describe("a demoted section: throw, then classify as directory-move", () => {
  it("GROUNDED discards", () => {
    expect(() => run(HUGO_DOC(), DEMOTE, "grounded", { allowFileMoves: true })).toThrow(
      /move its whole folder/,
    );
  });

  it("ASPIRATIONAL records the demotion as its own kind", () => {
    const { doc: result } = run(HUGO_DOC(), DEMOTE, "aspirational");
    const records = recordedLedger(result);
    expect(records.map((r) => r.kind)).toEqual(["directory-move"]);
    expect(records[0]!.title).toBe("Tutorials");
  });

  it("names the demotion ONCE rather than as N pinned displacements", () => {
    // The first classifier to claim a row names it. A card full of
    // pinned rows demoted whole is one obstacle, not one per row.
    const d = HUGO_DOC();
    d.sections[1]!.topics = [pinned("A"), pinned("B")];
    const { doc: result } = run(d, DEMOTE, "aspirational");
    expect(recordedLedger(result).map((r) => r.kind)).toEqual(["directory-move"]);
  });
});

// ── a block is not an entry ─────────────────────────────────

const SPHINX_DOC = (): TocDocument => {
  const d = doc([
    section("Manual", [topic("Install")]),
    section("Contributing", [topic("Ways to contribute")]),
  ]);
  d.sections[1]!.path = undefined;
  return { ...d, formatId: "sphinx" };
};

describe("a pageless card nested: throw, then classify as block-entry", () => {
  it("GROUNDED discards", () => {
    expect(() => run(SPHINX_DOC(), DEMOTE, "grounded")).toThrow(/not a page/);
  });

  it("ASPIRATIONAL records it as block-entry, not directory-move", () => {
    // Different formats, different obstacles: Sphinx nests no directory,
    // it just has no line to write.
    const { doc: result } = run(SPHINX_DOC(), DEMOTE, "aspirational");
    expect(recordedLedger(result).map((r) => r.kind)).toEqual(["block-entry"]);
  });
});

// ── the reparent conjunction ────────────────────────────────

describe("reparent: throw, then classify as consent", () => {
  const MOVE_TOPIC = [
    { id: "s1", children: [] as { id: string }[] },
    { id: "s2", children: [{ id: "t2" }, { id: "t1" }] },
  ];

  it("GROUNDED discards when the toggle is off", () => {
    expect(() => run(HUGO_DOC(), MOVE_TOPIC, "grounded")).toThrow(
      /Moving pages between sections was left off/,
    );
  });

  it("ASPIRATIONAL records a CONSENT record — the permission moved to apply", () => {
    const { doc: result } = run(HUGO_DOC(), MOVE_TOPIC, "aspirational");
    const records = recordedLedger(result);
    expect(records.map((r) => r.kind)).toEqual(["consent"]);
    expect(records[0]!.title).toBe("Provision swap");
    expect(records[0]!.originalParentTitle).toBe("Tasks");
  });

  it("records NOTHING on a nav-owned format, where nothing moves on disk", () => {
    // A capability is a fact about the format; a permission gates a
    // consequence. No consequence, nothing to consent to — and no record.
    const { doc: result } = run(
      doc([section("A", [topic("one")]), section("B", [])]),
      [
        { id: "s1", children: [] },
        { id: "s2", children: [{ id: "t1" }] },
      ],
      "aspirational",
    );
    expect(recordedLedger(result)).toEqual([]);
  });

  it("records nothing when the grounded toggle already consented", () => {
    // A grounded run's moves were dialog-consented, so no second control
    // may appear at apply — which is exactly "no consent records".
    const { doc: result } = run(HUGO_DOC(), MOVE_TOPIC, "grounded", {
      allowFileMoves: true,
    });
    expect(recordedLedger(result)).toEqual([]);
  });
});

// ── never-empty containers ──────────────────────────────────

describe("never-empty containers: throw, then classify (R5)", () => {
  const CONTAINED = (): TocDocument => {
    const d = doc([section("Guides", [topic("one")]), section("Other", [topic("two")])]);
    d.sections[0]!.chain = ["API"];
    d.containers = [
      {
        chainKey: "API",
        label: "API",
        kind: "tab",
        order: 0,
        accepts: { sections: true, orphans: false },
        mayEmpty: false,
      },
      {
        chainKey: "",
        label: "Docs",
        order: 1,
        accepts: { sections: true, orphans: true },
        mayEmpty: true,
      },
    ];
    return d;
  };
  // s1's only topic moves to s2, so s1 drops as empty and the API tab
  // has no cards left.
  const DRAIN = [
    { id: "s1", children: [] as { id: string }[] },
    { id: "s2", children: [{ id: "t2" }, { id: "t1" }] },
  ];

  it("GROUNDED discards", () => {
    expect(() => run(CONTAINED(), DRAIN, "grounded")).toThrow(/requires at least one/);
  });

  it("ASPIRATIONAL opens the proposal", () => {
    // The display cost — a card-less container lane — was accepted at
    // gate; a container that vanished from the canvas while the file
    // still requires it would be the canvas lying about the file.
    const { doc: result } = run(CONTAINED(), DRAIN, "aspirational");
    expect(result.sections.map((s) => s.title)).toEqual(["Other"]);
    expect(result.containers?.map((c) => c.chainKey)).toEqual(["API", ""]);
  });
});

// ── proposal-constraints stay binding in BOTH modes ─────────

describe("proposal-constraints are identical in both modes", () => {
  it("scope pass-through leaves out-of-scope cards untouched in aspirational mode", () => {
    const d = PINNED_DOC();
    const { doc: result } = run(d, [{ id: "s1" }], "aspirational", {
      scopeSectionIds: [d.sections[0]!.id],
    });
    expect(result.sections[1]!.topics.map((t) => t.title)).toEqual(["First tutorial"]);
  });

  it("a sealed card is restored with its warning in aspirational mode", () => {
    const d = doc([section("Generated", []), section("Manual", [topic("one")])]);
    d.sections[0]!.sealed = { source: "OpenAPI /openapi.json" };
    const options = OPTIONS("aspirational");
    const outline = buildOutline(d, options);
    const { doc: result, summary } = reconstructDocument({
      doc: d,
      nodes: [{ id: "s2", children: [{ id: "s1" }] }],
      idMap: outline.idMap,
      options,
    });
    expect(result.sections.map((s) => s.title)).toContain("Generated");
    expect(summary.warnings.join(" ")).toContain("could not be merged");
  });
});

// ── the carry sweep ─────────────────────────────────────────

describe("`displaced` is carried by every path that rebuilds a topic", () => {
  /** A document already holding a record, re-run through reconstruction —
   *  the grounded-run-on-a-ledgered-tab case (re-decision 6). */
  const LEDGERED = (): TocDocument => {
    const d = PINNED_DOC();
    const moved = d.sections[0]!.topics.pop()!;
    d.sections[1]!.topics.push({
      ...moved,
      displaced: {
        parentId: d.sections[0]!.id,
        parentTitle: "Getting started",
        index: 1,
        kind: "pin",
      },
    });
    return d;
  };

  it("carries a record through the EXPLICIT build site", () => {
    const { doc: result } = run(
      LEDGERED(),
      [
        { id: "s1", children: [{ id: "t1" }] },
        { id: "s2", children: [{ id: "t2" }, { id: "t3" }] },
      ],
      "grounded",
    );
    expect(recordedLedger(result)).toHaveLength(1);
  });

  it("carries a record through the IMPLICIT (children-follow) build site", () => {
    // s2 listed with no children: its rows ride along untouched.
    const { doc: result } = run(LEDGERED(), [{ id: "s1" }, { id: "s2" }], "grounded");
    expect(recordedLedger(result)).toHaveLength(1);
  });

  it("carries a record through the RECOVERY path", () => {
    // s2 omitted entirely: its rows are recovered into their original
    // section, rebuilt from the ORIGINAL objects by id.
    const { doc: result } = run(LEDGERED(), [{ id: "s1" }], "grounded");
    expect(recordedLedger(result)).toHaveLength(1);
  });

  it("carries a record through the ORPHAN-WRAP path", () => {
    // An UNPINNED row carrying a consent record, promoted to root. A
    // pinned one cannot be used here: promoting it is a parent change,
    // which the grounded net correctly refuses — the scenario would test
    // the throw rather than the carry.
    const d = doc([section("A", [topic("x")]), section("B", [topic("y")])]);
    d.sections[0]!.topics[0]!.displaced = {
      parentId: "s-old",
      parentTitle: "Elsewhere",
      index: 0,
      kind: "consent",
    };
    const { doc: result } = run(d, [{ id: "t1" }, { id: "s2" }], "grounded");
    expect(result.sections[0]!.isOrphan).toBe(true);
    expect(recordedLedger(result)).toHaveLength(1);
  });

  /**
   * The SLOW branch of `implicitTopics`: a parent that is NOT explicitly
   * listed but whose subtree holds a row that is. The fast branch clones
   * and carries everything; this one rebuilds a literal, and a literal
   * carries only the fields somebody remembered.
   */
  const SPLIT_SUBTREE = () => {
    const d = doc([
      section("A", [{ ...pinned("Parent"), children: [topic("child")] }]),
      section("B", []),
    ]);
    d.sections[0]!.topics[0]!.displaced = {
      parentId: "s-old",
      parentTitle: "Elsewhere",
      index: 0,
      kind: "pin",
    };
    // s1 unlisted (children follow); t2 ("child") explicitly moved to s2,
    // so t1 ("Parent") takes the literal branch.
    return { d, nodes: [{ id: "s1" }, { id: "s2", children: [{ id: "t2" }] }] };
  };

  it("carries a LOCK through the implicit build site's literal branch", () => {
    // REGRESSION (defect found in this arc, pre-existing): that branch
    // built a topic literal WITHOUT `lock`, so a pinned parent whose
    // subtree held an explicitly-placed row came back UNPINNED — and an
    // unpinned row is one the adapter will rewrite. Same shape as the
    // docs/13 chain-carry lesson, one field over.
    const { d, nodes } = SPLIT_SUBTREE();
    const { doc: result } = run(d, nodes, "grounded");
    expect(result.sections[0]!.topics[0]!.title).toBe("Parent");
    expect(result.sections[0]!.topics[0]!.lock).toEqual({ kind: "outside-region" });
  });

  it("carries a RECORD through the same literal branch", () => {
    const { d, nodes } = SPLIT_SUBTREE();
    const { doc: result } = run(d, nodes, "grounded");
    expect(recordedLedger(result)).toHaveLength(1);
  });
});

describe("the summary states the split before the tab opens", () => {
  it("is all zeros for a grounded run — a grounded run cannot classify", () => {
    const options = OPTIONS("grounded");
    const d = PINNED_DOC();
    const outline = buildOutline(d, options);
    const { summary } = reconstructDocument({
      doc: d,
      nodes: [{ id: "s1" }, { id: "s2" }],
      idMap: outline.idMap,
      options,
    });
    expect(summary.aspirational).toEqual({ needsHand: 0, needsConsent: 0, moves: 0 });
  });

  it("counts a pinned displacement against the moves it is drawn from", () => {
    const options = OPTIONS("aspirational");
    const d = PINNED_DOC();
    const outline = buildOutline(d, options);
    const { summary } = reconstructDocument({
      doc: d,
      nodes: MOVE_PINNED,
      idMap: outline.idMap,
      options,
    });
    expect(summary.aspirational.needsHand).toBe(1);
    expect(summary.aspirational.needsConsent).toBe(0);
    expect(summary.aspirational.moves).toBe(1);
  });

  it("keeps consent separate from needs-your-hand", () => {
    // Two different sentences with two different remedies. Summing them
    // would blame the format for a choice the user has not yet made.
    const options = OPTIONS("aspirational");
    const d = HUGO_DOC();
    const outline = buildOutline(d, options);
    const { summary } = reconstructDocument({
      doc: d,
      nodes: [
        { id: "s1", children: [] },
        { id: "s2", children: [{ id: "t2" }, { id: "t1" }] },
      ],
      idMap: outline.idMap,
      options,
    });
    expect(summary.aspirational).toEqual({ needsHand: 0, needsConsent: 1, moves: 1 });
  });

  it("counts a demoted card, which `moved` cannot see", () => {
    const options = OPTIONS("aspirational");
    const d = HUGO_DOC();
    const outline = buildOutline(d, options);
    const { summary } = reconstructDocument({
      doc: d,
      nodes: DEMOTE,
      idMap: outline.idMap,
      options,
    });
    expect(summary.moved).toBe(0);
    expect(summary.aspirational).toEqual({ needsHand: 1, needsConsent: 0, moves: 1 });
  });

  it("never claims more classified moves than moves", () => {
    // The arithmetic the result view prints: writable = moves −
    // needsHand − needsConsent, which must never go negative.
    const options = OPTIONS("aspirational");
    const d = PINNED_DOC();
    const outline = buildOutline(d, options);
    const { summary } = reconstructDocument({
      doc: d,
      nodes: MOVE_PINNED,
      idMap: outline.idMap,
      options,
    });
    const { needsHand, needsConsent, moves } = summary.aspirational;
    expect(needsHand + needsConsent).toBeLessThanOrEqual(moves);
  });
});
