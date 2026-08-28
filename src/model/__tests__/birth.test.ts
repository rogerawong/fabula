/**
 * The species-at-birth table (docs/22, Decision 2 — OR-5b/c/d).
 *
 * ONE TABLE, TWO ARRIVAL PATHS. The gesture and reconstruction must
 * speak one rule, which is the drift `guards.ts` exists to prevent — so
 * the table is asserted here as a pure function and both callers are
 * asserted to route through it, never beside it.
 *
 * THE DISPOSITION OF `unhoused` IS THE CALLER'S, deliberately: a hand
 * mid-gesture can be handed a sentence naming real homes and act on it
 * now, a model mid-outline cannot (docs/22, Decision 2's asymmetry
 * paragraph). So the table answers WHAT the home bears and never what to
 * do about a home that bears nothing.
 */

import { describe, expect, it } from "vitest";
import { birthShape, homeChainAt, speciesAtBirth, type Bearing } from "../birth";

const BEARS = {
  both: { sections: true, orphans: true } satisfies Bearing,
  sectionsOnly: { sections: true, orphans: false } satisfies Bearing,
  standalonesOnly: { sections: false, orphans: true } satisfies Bearing,
  neither: { sections: false, orphans: false } satisfies Bearing,
};

describe("speciesAtBirth — Decision 2's four regimes", () => {
  it("bears both: a childless entry births the standalone", () => {
    expect(speciesAtBirth(BEARS.both, "standalone")).toBe("standalone");
  });

  it("bears both: a parented entry births the promoted section", () => {
    expect(speciesAtBirth(BEARS.both, "section")).toBe("section");
  });

  it("standalones only: a childless entry births the standalone", () => {
    expect(speciesAtBirth(BEARS.standalonesOnly, "standalone")).toBe("standalone");
  });

  it("standalones only: a parented entry is UNHOUSED — promotion births a section and this home bears none (OR-5d)", () => {
    expect(speciesAtBirth(BEARS.standalonesOnly, "section")).toBe("unhoused");
  });

  it("sections only: a childless entry is WRAPPED — a bare entry is not a legal child here", () => {
    expect(speciesAtBirth(BEARS.sectionsOnly, "standalone")).toBe("section");
  });

  it("sections only: a parented entry births the promoted section", () => {
    expect(speciesAtBirth(BEARS.sectionsOnly, "section")).toBe("section");
  });

  it("bears neither: both entry shapes are unhoused", () => {
    expect(speciesAtBirth(BEARS.neither, "standalone")).toBe("unhoused");
    expect(speciesAtBirth(BEARS.neither, "section")).toBe("unhoused");
  });
});

describe("homeChainAt — the drop position names the home (R2)", () => {
  const chains = new Map<string, readonly string[]>([
    ["a", ["Guides"]],
    ["b", ["Guides"]],
    ["c", ["Reference"]],
  ]);
  // `chainless` is DELIBERATELY absent from the map: `Section.chain` is
  // optional and absent for every format whose cards are top level, so
  // "no chain" means `undefined` here and not an empty array. A fixture
  // that spelled it `[]` would pass whether or not the code handled the
  // real case — measured: it let a `chainOf(n)!` mutant live.
  const chainOf = (id: string) => chains.get(id);

  it("an empty column births at root", () => {
    expect(homeChainAt([], 0, chainOf)).toEqual([]);
  });

  it("between two cards of one container, the birth joins that container", () => {
    expect(homeChainAt(["a", "b"], 1, chainOf)).toEqual(["Guides"]);
  });

  it("at the TOP of a column the neighbour BELOW names the home — there is nothing above to append to", () => {
    expect(homeChainAt(["c", "a"], 0, chainOf)).toEqual(["Reference"]);
  });

  it("at a boundary the run ABOVE wins: a birth is an append, and a born card has no chain of its own to keep", () => {
    // `classifyDrop` would call this a seam, because a card being MOVED
    // could stay in its own container. A born card cannot: there is no
    // second reading to ask about.
    expect(homeChainAt(["a", "c"], 1, chainOf)).toEqual(["Guides"]);
  });

  it("a CHAINLESS neighbour names the root", () => {
    expect(homeChainAt(["chainless"], 1, chainOf)).toEqual([]);
  });
});

describe("birthShape — what the drag-out MAKES (OR-5b/c)", () => {
  const leaf = { childless: true, pinned: false };
  const parent = { childless: false, pinned: false };
  const pinnedLeaf = { childless: true, pinned: true };
  const pinnedParent = { childless: false, pinned: true };

  it("one childless entry, a home that bears standalones: the STANDALONE", () => {
    // Promotion of a leaf IS the standalone. Today's group duplicating
    // the entry's name is the misreading of the ruled motive.
    expect(birthShape(BEARS.both, [leaf])).toEqual({ kind: "standalone" });
  });

  it("one PARENTED entry: the PROMOTED section — the entry becomes the face", () => {
    expect(birthShape(BEARS.both, [parent])).toEqual({ kind: "promote" });
  });

  it("one pinned PARENTED entry WRAPS instead — the pin cannot survive promotion", () => {
    // `Section` has no lock, so promotion would erase the pin and leave
    // a displacement nothing can name. The entry stays a ROW.
    expect(birthShape(BEARS.both, [pinnedParent])).toEqual({ kind: "wrap" });
  });

  it("one pinned CHILDLESS entry still births the standalone — the pin rides topics[0]", () => {
    expect(birthShape(BEARS.both, [pinnedLeaf])).toEqual({ kind: "standalone" });
  });

  it("several entries WRAP, whatever they are — one heading over the set", () => {
    expect(birthShape(BEARS.both, [leaf, parent])).toEqual({ kind: "wrap" });
    expect(birthShape(BEARS.both, [leaf, leaf])).toEqual({ kind: "wrap" });
  });

  it("a sections-only home wraps a childless entry rather than leaving it bare", () => {
    expect(birthShape(BEARS.sectionsOnly, [leaf])).toEqual({ kind: "wrap" });
  });

  it("a standalones-only home REFUSES a parented entry (OR-5d)", () => {
    expect(birthShape(BEARS.standalonesOnly, [parent])).toEqual({ kind: "unhoused" });
  });

  it("a standalones-only home refuses a PINNED parented entry identically — a wrap is a section too", () => {
    expect(birthShape(BEARS.standalonesOnly, [pinnedParent])).toEqual({
      kind: "unhoused",
    });
  });

  it("a standalones-only home refuses a multi-drag, which can only be a section", () => {
    expect(birthShape(BEARS.standalonesOnly, [leaf, leaf])).toEqual({ kind: "unhoused" });
  });

  it("a home that bears neither refuses every shape", () => {
    for (const moving of [[leaf], [parent], [pinnedParent], [leaf, parent]]) {
      expect(birthShape(BEARS.neither, moving)).toEqual({ kind: "unhoused" });
    }
  });

  it("nothing moving births nothing", () => {
    // A guard consumes declared inputs: an empty selection is not a
    // drag-out whose species anyone can answer.
    expect(birthShape(BEARS.both, [])).toEqual({ kind: "unhoused" });
  });
});
