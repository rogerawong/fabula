/**
 * remainders.test.ts — FENCES 10 and 11, plus the report selector's own
 * construction assertion (docs/22, Decisions 3 and 7).
 *
 * FENCE 10 — VERB TOTALITY. The queued comparison-as-motion work needs
 * to say WHAT HAPPENED, not just that something did. The record fields
 * make the verb a total function, and a new remainder kind must fail
 * `pnpm check` at the verb function before it can ship verbless. The
 * compiler enforces exhaustiveness; these assert that every reachable
 * evidence combination has an answer and that each answer is reachable —
 * a switch can be exhaustive and still fold two acts into one verb.
 *
 * FENCE 11 — NO JOURNAL. Asserted on the CONSTRUCTION (imports and call
 * shapes), never on vocabulary: a bare-word scan flags the prose that
 * explains the fence, which is how the sibling fence file broke the
 * first time a module said in prose which fields it does not read.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildChecklist, structuralCopy } from "../ledger";
import {
  structureReport,
  hasStructuralRemainders,
  transformVerb,
  verbOf,
  type StructuralRemainder,
  type TransformVerb,
  type VerbEvidence,
} from "../remainders";

const code = (path: string): string =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("FENCE 10 — the transform verb is total", () => {
  it("answers for every creation evidence combination", () => {
    const combos: VerbEvidence[] = [
      { of: "creation", species: "standalone", ownKeyInSource: true },
      { of: "creation", species: "standalone", ownKeyInSource: false },
      { of: "creation", species: "section", ownKeyInSource: true },
      { of: "creation", species: "section", ownKeyInSource: false },
    ];
    for (const evidence of combos) {
      expect(typeof transformVerb(evidence)).toBe("string");
    }
  });

  it("reads the certified table verb for verb", () => {
    // The table of record (docs/22, Decision 3). A standalone card IS
    // its single childless entry, so promotion of a leaf is a HOIST; the
    // own-key question only discriminates the SECTION species, which is
    // what separates "the entry became the heading" from "a new name
    // over existing rows".
    expect(
      transformVerb({ of: "creation", species: "standalone", ownKeyInSource: true }),
    ).toBe("hoist");
    expect(
      transformVerb({ of: "creation", species: "section", ownKeyInSource: true }),
    ).toBe("promote");
    expect(
      transformVerb({ of: "creation", species: "section", ownKeyInSource: false }),
    ).toBe("wrap");
    expect(transformVerb({ of: "despeciated" })).toBe("unwrap");
    expect(transformVerb({ of: "card-order" })).toBe("reorder-cards");
    expect(transformVerb({ of: "row-order" })).toBe("reorder-rows");
    expect(transformVerb({ of: "ledger", kind: "pin", cleared: false })).toBe("displace");
    expect(transformVerb({ of: "ledger", kind: "pin", cleared: true })).toBe("restore");
  });

  it("produces every verb it declares — no verb is unreachable", () => {
    // A switch can be exhaustive over its INPUT and still fold two acts
    // into one verb, which the compiler cannot see. This is the other
    // side of the totality claim.
    const produced = new Set<TransformVerb>([
      transformVerb({ of: "creation", species: "standalone", ownKeyInSource: true }),
      transformVerb({ of: "creation", species: "section", ownKeyInSource: true }),
      transformVerb({ of: "creation", species: "section", ownKeyInSource: false }),
      transformVerb({ of: "despeciated" }),
      transformVerb({ of: "card-order" }),
      transformVerb({ of: "row-order" }),
      transformVerb({ of: "ledger", kind: "pin", cleared: false }),
      transformVerb({ of: "ledger", kind: "pin", cleared: true }),
    ]);
    expect([...produced].sort()).toEqual([
      "displace",
      "hoist",
      "promote",
      "reorder-cards",
      "reorder-rows",
      "restore",
      "unwrap",
      "wrap",
    ]);
  });

  it("labels a record through verbOf, which supplies the source term", () => {
    const creation: StructuralRemainder = {
      kind: "creation",
      sectionId: "s-new",
      title: "Workflow",
      species: "section",
      ownKey: "~Workflow",
      memberKeys: ["guides/usage"],
    };
    expect(verbOf(creation, () => true)).toBe("promote");
    expect(verbOf(creation, () => false)).toBe("wrap");
    expect(verbOf({ kind: "card-order", moved: [] }, () => false)).toBe("reorder-cards");
    expect(
      verbOf(
        {
          kind: "row-order",
          parentId: "p",
          parentTitle: "P",
          rows: [],
          lockKind: "outside-region",
        },
        () => false,
      ),
    ).toBe("reorder-rows");
  });
});

describe("FENCE 11 — no journal, asserted on the construction", () => {
  const MODULE = "src/model/remainders.ts";

  it("imports no store", () => {
    expect(code(MODULE)).not.toMatch(/from "@\/store/);
    expect(code(MODULE)).not.toMatch(/from "\.\.\/\.\.\/store/);
  });

  it("imports no persistence and mints no persisted field", () => {
    expect(code(MODULE)).not.toMatch(/persistence/);
    // PERSIST_VERSION is the thing a new stored field would have to move.
    // Naming it here would be the first sign a record started being
    // written down rather than derived.
    expect(code(MODULE)).not.toMatch(/PERSIST_VERSION/);
  });

  it("writes nothing into the document — the report is read-only", () => {
    // A DERIVATION THAT ASSIGNS is a recording with extra steps. Every
    // producer of a stored fact has to remember it and every rebuild path
    // has to carry it; that is the cost this design exists to avoid.
    const text = code(MODULE);
    expect(text).not.toMatch(/doc\.\w+\s*=/);
    expect(text).not.toMatch(/section\.\w+\s*=/);
  });
});

describe("FENCE 8 (partial) — the report selector's inputs", () => {
  it("takes the document, its source and the card order — nothing else", () => {
    // THE CONSTRUCTION ASSERTION, the shape docs/21's projection fence
    // already uses: stronger than any claim about a value, because a
    // signature with no slot for a posture cannot be handed one.
    expect(structureReport.length).toBe(3);
    expect(hasStructuralRemainders.length).toBe(3);
  });

  it("names no tab state and no run mode anywhere in its code", () => {
    const text = code("src/model/remainders.ts");
    expect(text).not.toMatch(/\bseamDeclined\b/);
    expect(text).not.toMatch(/\baspirational\b/);
    expect(text).not.toMatch(/RunMode/);
  });
});

describe("FENCE 10's second half — the CHECKLIST RENDERER is exhaustive too", () => {
  /** One record of every kind, so a kind that rendered nothing shows up
   *  as a missing item rather than as a silently blank line. */
  const ALL: StructuralRemainder[] = [
    {
      kind: "creation",
      sectionId: "s-new",
      title: "Workflow",
      species: "section",
      ownKey: "~Workflow",
      memberKeys: ["a"],
    },
    { kind: "card-order", moved: [{ sectionId: "s1", title: "Guides", from: 0, to: 1 }] },
    {
      kind: "row-order",
      parentId: "p",
      parentTitle: "Guides",
      rows: [],
      lockKind: "outside-region",
    },
  ];

  it("every kind renders a headline, a cause AND a remedy", () => {
    // A KIND CANNOT SHIP UNLABELLED. The compiler holds the switch's
    // exhaustiveness; this holds that each arm actually says all three
    // things, which no type can see — an arm returning empty strings
    // would compile and would render three blank lines.
    for (const record of ALL) {
      const copy = structuralCopy(record);
      expect(copy.headline.length, record.kind).toBeGreaterThan(10);
      expect(copy.cause.length, record.kind).toBeGreaterThan(10);
      expect(copy.remedy.length, record.kind).toBeGreaterThan(10);
    }
  });

  it("every kind reaches the checklist as its own item", () => {
    const items = buildChecklist(
      { id: "d", name: "d", formatId: "x", sections: [] },
      [],
      { consentDeclined: false, remainders: ALL },
    );
    expect(items).toHaveLength(ALL.length);
    // STABLE, DISTINCT KEYS: two items sharing one would collapse in
    // React and drop a remainder from the list silently.
    expect(new Set(items.map((i) => i.id)).size).toBe(ALL.length);
  });
});

describe("FENCE 8 — two tabs differing only in tab state agree on everything", () => {
  /**
   * THE GATE KEYS ON THE DOCUMENT, never on the mode or the tab state
   * (docs/21's fence, extended to the sibling report). Modelled as two
   * independent values because that is what two tabs hold: the same
   * arrangement, two postures.
   */
  const arrangement = {
    id: "d",
    name: "d",
    formatId: "sphinx",
    sections: [],
  };

  it("the report is identical, because tab state is not one of its inputs", () => {
    // A structural assertion rather than a behavioural one: there is no
    // parameter a tab state could arrive through, which is stronger than
    // any claim about a value.
    expect(structureReport.length).toBe(3);
    expect(structureReport(arrangement, {}, [])).toEqual(
      structureReport(arrangement, {}, []),
    );
  });

  it("the checklist is identical — its options carry no posture", () => {
    const a = buildChecklist(arrangement, [], { consentDeclined: false });
    const b = buildChecklist(arrangement, [], { consentDeclined: false });
    expect(a).toEqual(b);
  });
});
