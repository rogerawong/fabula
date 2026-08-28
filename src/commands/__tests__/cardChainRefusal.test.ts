/**
 * The card axis of the drop-legality rule, as ONE implementation
 * (docs/16 sequencing step 1).
 *
 * `guards.ts` opens "the predicate lives here and both callers import
 * it". That was true of the topic axis and false of this one: the drag
 * layer re-composed `accepts` + `wouldEmptyContainer` itself and omitted
 * the third clause, inside the very file written to prevent exactly that
 * (the sidebar hole). No live defect — `classifyDrop` returns
 * `reorder` when a document has no chains, so the missing clause was
 * unreachable — but two implementations of one rule, in the file whose
 * whole job is that there be one.
 *
 * The fold keeps the drag layer's specific sentences by having the
 * predicate answer WHICH refusal applies. The boolean is its costume.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { ContainerDescriptor, Section, TocDocument } from "@/model/types";
import { cardChainRefusal, cardChainRefused } from "../guards";

const container = (
  chainKey: string,
  label: string,
  order: number,
  accepts: { sections: boolean; orphans: boolean },
  mayEmpty = true,
): ContainerDescriptor => ({ chainKey, label, order, accepts, mayEmpty });

const carded = (title: string, chain: readonly string[], orphan = false): Section => ({
  ...section(title, [topic(`${title} page`, [], title.toLowerCase())]),
  chain,
  ...(orphan ? { isOrphan: true } : {}),
});

/** Two card-bearing tabs that may not be emptied, plus an orphan lane. */
const twoTabs = (): TocDocument => ({
  ...doc([
    carded("Get started", ["Guides"]),
    carded("Operate", ["Guides"]),
    carded("Endpoints", ["API"]),
    carded("Status", ["global"], true),
  ]),
  containers: [
    container("Guides", "Guides", 0, { sections: true, orphans: false }, false),
    container("API", "API", 1, { sections: true, orphans: false }, false),
    container("global", "global", 2, { sections: false, orphans: true }),
  ],
});

const find = (d: TocDocument, title: string): Section =>
  d.sections.find((s) => s.title === title)!;

describe("the predicate answers WHICH refusal applies", () => {
  it("allows a move a container accepts", () => {
    const d = twoTabs();
    expect(cardChainRefusal(d, find(d, "Get started"), ["API"])).toBeNull();
  });

  it("is not a reparent at all when the chain is unchanged", () => {
    const d = twoTabs();
    expect(cardChainRefusal(d, find(d, "Get started"), ["Guides"])).toBeNull();
  });

  it("names the container that does not hold cards like this one", () => {
    const d = twoTabs();
    expect(cardChainRefusal(d, find(d, "Get started"), ["global"])).toBe("not-accepted");
  });

  it("names an unknown chain as unaccepted rather than as a crash", () => {
    const d = twoTabs();
    expect(cardChainRefusal(d, find(d, "Get started"), ["nope"])).toBe("not-accepted");
  });

  it("names the emptying of a container that may not be left empty", () => {
    const d = twoTabs();
    // "Endpoints" is API's only card, and API declares mayEmpty: false.
    expect(cardChainRefusal(d, find(d, "Endpoints"), ["Guides"])).toBe("would-empty");
  });

  it("refuses on a document that declares no containers", () => {
    // THE CLAUSE THE DRAG LAYER OMITTED. Unreachable through
    // classifyDrop, which returns `reorder` when no chains differ — but
    // the predicate is the invariant and answers for itself.
    const d = doc([section("Guide", [topic("A")])]);
    expect(cardChainRefusal(d, d.sections[0]!, ["anything"])).toBe("no-containers");
  });
});

describe("the boolean is the costume, never a second opinion", () => {
  it("agrees with the reason on every case above", () => {
    const d = twoTabs();
    const cases: [Section, string[]][] = [
      [find(d, "Get started"), ["API"]],
      [find(d, "Get started"), ["Guides"]],
      [find(d, "Get started"), ["global"]],
      [find(d, "Endpoints"), ["Guides"]],
    ];
    for (const [s, chain] of cases) {
      expect(cardChainRefused(d, s, chain)).toBe(cardChainRefusal(d, s, chain) !== null);
    }
  });

  it("agrees on the no-containers document too", () => {
    const d = doc([section("Guide", [topic("A")])]);
    expect(cardChainRefused(d, d.sections[0]!, ["x"])).toBe(true);
  });
});

describe("the rule is not re-composed outside guards.ts", () => {
  // The absence test the fence needs. Prose cannot hold this: rebuilding
  // the rule at a call site is three convenient lines that pass their
  // own tests, which is exactly how the two implementations arose.
  const source = (path: string): string => readFileSync(path, "utf8");

  it("leaves the drag layer importing the predicate, not its ingredients", () => {
    const drag = source("src/interaction/cardDrag.ts");
    expect(drag).toContain("cardChainRefusal");
    // `accepts` and `wouldEmptyContainer` ARE the rule. A call site
    // holding both is a call site re-deriving it.
    const ingredients = ["accepts", "wouldEmptyContainer"].filter((name) =>
      new RegExp(`\\b${name}\\b[^\\n]*from "@/model/containers"`).test(drag),
    );
    expect(ingredients).toEqual([]);
  });

  it("keeps the executor on the same predicate", () => {
    expect(source("src/commands/execute.ts")).toContain("cardChainRefused");
  });

  it("holds the whole rule in guards.ts, clauses and all", () => {
    const guards = source("src/commands/guards.ts");
    for (const clause of ["no-containers", "not-accepted", "would-empty"]) {
      expect(guards).toContain(clause);
    }
  });
});

describe("no executor re-derives refusal logic locally", () => {
  // The sidebar-hole fence, generalised past the two entry points that
  // exist. The first cut shipped a canvas check and a sidebar that committed what
  // the canvas refused (the sidebar hole); docs/16 found the same shape
  // prospectively in `execMoveTopicsToNewSection`, which consulted the
  // capability alone while the cross-card path had grown four reasons.
  //
  // Asserted on the SOURCE because the defect is structural: entry
  // point five will be written by someone who has not read this file,
  // and the only thing that stops them re-deriving is a red suite.
  const executor = readFileSync("src/commands/execute.ts", "utf8");

  it("routes every move refusal through the shared discriminant", () => {
    // Two call sites today — cross-card and new-section — and both go
    // through the one name.
    const calls = executor.match(/topicMoveRefusal\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("holds no refusal INGREDIENT of its own", () => {
    // Asserted on the CONSTRUCTION, not the word: a re-derivation needs
    // these as literals or calls, and scanning for the bare token
    // flagged this fix's own explanatory comment. A test that fails on
    // its subject being discussed is a test nobody keeps — the same
    // lesson the linkIndex fence learned about `blocking`.
    // Quotes only, not backticks: this file's comments cite `_index.md`
    // in markdown, and a scan that cannot tell a code literal from prose
    // fails on its own explanation.
    expect(executor).not.toMatch(/["']_?index\.md["']/);
    expect(executor).not.toMatch(/\breparentCapability\s*\(/);
    expect(executor).not.toMatch(/\bfilesOf\s*\(/);
  });

  it("keeps the sentences out of the command layer", () => {
    // Discriminants here, copy at the drag layer. A sentence in the
    // executor is a second voice that will drift from the first.
    expect(executor).not.toMatch(/Not in this version|whole folder|already there/);
  });
});
