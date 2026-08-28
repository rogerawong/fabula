/**
 * sphinxProjection.test.ts — FENCES 2 and 3, the projection extended
 * (docs/22, Decision 4).
 *
 * PLAN THE PROJECTION, NEVER FILTER THE PLAN — docs/21's law, unmoved.
 * The projection is a REAL document plus the card order that goes with
 * it; the existing pipeline runs on it unmodified; the adapters' own
 * refusals stay live underneath as the outer layer.
 *
 * FENCE 2 — COMPLETENESS is what "the report is complete" MEANS, and it
 * is testable against the planner itself: a projected plan never refuses
 * `section-set-changed` or `card-reordered` and never carries a
 * frozen-block blocking warning. Plus docs/21's invariant 3 extended:
 * plan(projection) is byte-identical to plan(the same arrangement built
 * directly), so no residue of the imagined structure reaches the bytes.
 *
 * FENCE 3 — PASS ORDER, pinned by a minimal pair. Membership first, then
 * husk pruning, then card order, then row order. Each later pass reads
 * the earlier passes' output; the reverse order restores indices against
 * lists whose membership is about to change. Mutating the order fails
 * this file.
 *
 * Driven against the REAL Sphinx planner and real fixture text, never a
 * simulation: an oracle that agrees with a straw man certifies nothing.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { sphinxAdapter } from "../adapters/sphinx";
import { filesOf, type FilesSnapshot } from "../types";
import {
  applyableProjection,
  ledgerOf,
  projectCardOrder,
  projectRowOrder,
} from "@/model/ledger";
import { structureReport } from "@/model/remainders";
import { createSection } from "@/model/tree";
import type { SectionId, TocDocument, Topic } from "@/model/types";

const CONF = 'master_doc = "index"\nsource_suffix = ".rst"\n';

const PROJECT: FilesSnapshot = {
  "conf.py": CONF,
  "index.rst": [
    "Docs",
    "====",
    "",
    ".. toctree::",
    "   :caption: Guides",
    "",
    "   guides/index",
    "",
    ".. toctree::",
    "   :caption: Reference",
    "",
    "   reference/api",
    "   reference/cli",
    "",
  ].join("\n"),
  "guides/index.rst": [
    "Guides",
    "======",
    "",
    ".. toctree::",
    "",
    "   frozen-a",
    "   frozen-b",
    "",
    "Prose terminates the sequence, so the block above is outside the region.",
    "",
    ".. toctree::",
    "",
    "   install",
    "   usage",
    "",
  ].join("\n"),
  "guides/frozen-a.rst": "Frozen A\n========\n\nbody\n",
  "guides/frozen-b.rst": "Frozen B\n========\n\nbody\n",
  "guides/install.rst": "Install\n=======\n\nbody\n",
  "guides/usage.rst": "Usage\n=====\n\nbody\n",
  "reference/api.rst": "API\n===\n\nbody\n",
  "reference/cli.rst": "CLI\n===\n\nbody\n",
};

const parse = (files: FilesSnapshot = PROJECT): TocDocument =>
  sphinxAdapter.parse(files, "proj").doc;
const order = (doc: TocDocument): SectionId[] => doc.sections.map((s) => s.id);
const clone = <T>(v: T): T => structuredClone(v);
const source = (): TocDocument => parse();

const planOf = (doc: TocDocument, ids: readonly SectionId[]) =>
  sphinxAdapter.planChanges!(filesOf(doc), doc, [...ids]);

/** The projection, with everything this arc's clauses need. */
function project(doc: TocDocument, ids: readonly SectionId[] = order(doc)) {
  return applyableProjection(
    { doc, sectionOrder: ids },
    {
      records: ledgerOf(doc, source()),
      remainders: structureReport(doc, filesOf(doc), ids),
      source: source(),
    },
  );
}

const guidesHost = (doc: TocDocument): Topic =>
  doc.sections.find((s) => s.title === "Guides")!.topics[0]!;

describe("FENCE 2 — a projected plan never hits the three refusals", () => {
  it("dissolves a created card so the plan stops refusing section-set-changed", () => {
    const doc = clone(parse());
    const host = guidesHost(doc);
    const moved = host.children.find((t) => t.path === "guides/usage")!;
    host.children = host.children.filter((t) => t.id !== moved.id);
    doc.sections.push(createSection("Workflow", [moved]));

    // The raw arrangement is refused outright today.
    expect(planOf(doc, order(doc)).warnings.map((w) => w.kind)).toContain(
      "section-set-changed",
    );

    const projected = project(doc);
    const result = planOf(projected.doc, projected.sectionOrder);
    expect(result.warnings.filter((w) => w.blocking)).toEqual([]);
    // The row went home, so there is nothing left to write either.
    expect(result.changes).toEqual([]);
  });

  it("restores the source card order so the plan stops refusing card-reordered", () => {
    const doc = parse();
    const swapped = [order(doc)[1]!, order(doc)[0]!];
    expect(planOf(doc, swapped).warnings.map((w) => w.kind)).toContain("card-reordered");

    const projected = project(doc, swapped);
    expect(planOf(projected.doc, projected.sectionOrder).warnings).toEqual([]);
  });

  it("restores a frozen block's rows so the plan stops refusing outside-region", () => {
    const doc = clone(parse());
    const host = guidesHost(doc);
    const frozen = host.children.filter((t) => t.lock?.kind === "outside-region");
    const rest = host.children.filter((t) => t.lock?.kind !== "outside-region");
    host.children = [frozen[1]!, frozen[0]!, ...rest];
    expect(planOf(doc, order(doc)).warnings.map((w) => w.kind)).toContain(
      "outside-region",
    );

    const projected = project(doc);
    const result = planOf(projected.doc, projected.sectionOrder);
    expect(result.warnings.filter((w) => w.blocking)).toEqual([]);
    expect(
      guidesHost(projected.doc)
        .children.filter((t) => t.lock?.kind === "outside-region")
        .map((t) => t.title),
    ).toEqual(["Frozen A", "Frozen B"]);
  });

  it("PROPERTY: no generated arrangement projects into a blocking plan", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (create, swapCards, frozenReorder, freeReorder) => {
          const doc = clone(parse());
          const host = guidesHost(doc);
          const frozen = host.children.filter((t) => t.lock?.kind === "outside-region");
          const free = host.children.filter((t) => t.lock === undefined);
          host.children = [
            ...(frozenReorder ? [frozen[1]!, frozen[0]!] : frozen),
            ...(freeReorder ? [free[1]!, free[0]!] : free),
          ];
          if (create) {
            const moved = host.children.find((t) => t.lock === undefined)!;
            host.children = host.children.filter((t) => t.id !== moved.id);
            doc.sections.push(createSection("Workflow", [moved]));
          }
          let ids = order(doc);
          if (swapCards) ids = [ids[1]!, ids[0]!, ...ids.slice(2)];

          const projected = project(doc, ids);
          const result = planOf(projected.doc, projected.sectionOrder);
          const blocking = result.warnings.filter((w) => w.blocking).map((w) => w.kind);
          expect(blocking).toEqual([]);
          return true;
        },
      ),
      { numRuns: 40 },
    );
  });

  it("PROJECTION EQUIVALENCE: plan(projection) is byte-identical to plan(that arrangement built directly)", () => {
    // docs/21's invariant 3, extended to the structural kinds. If the two
    // ever differ, the projection is carrying residue of the imagined
    // structure into the bytes.
    const doc = clone(parse());
    const host = guidesHost(doc);
    // A real, writable edit rides alongside the imagined one, so the
    // comparison is not between two empty plans.
    const usage = host.children.find((t) => t.path === "guides/usage")!;
    host.children = host.children.filter((t) => t.id !== usage.id);
    doc.sections.find((s) => s.title === "Reference")!.topics.push(usage);
    const install = host.children.find((t) => t.path === "guides/install")!;
    host.children = host.children.filter((t) => t.id !== install.id);
    doc.sections.push(createSection("Workflow", [install]));

    const projected = project(doc);
    const viaProjection = planOf(projected.doc, projected.sectionOrder);

    // The same arrangement built directly: usage moved, no created card.
    const direct = clone(parse());
    const dHost = guidesHost(direct);
    const dUsage = dHost.children.find((t) => t.path === "guides/usage")!;
    dHost.children = dHost.children.filter((t) => t.id !== dUsage.id);
    direct.sections.find((s) => s.title === "Reference")!.topics.push(dUsage);

    expect(viaProjection.changes).toEqual(planOf(direct, order(direct)).changes);
  });
});

describe("FENCE 3 — the pass order, pinned by the minimal pair", () => {
  /**
   * ONE DOCUMENT holding all three interacting facts: a pin record, a
   * creation whose member IS that pinned row, and a row-order record on
   * the block the pin came out of.
   *
   * Membership first (the pinned row goes home and the creation
   * dissolves), then husk pruning, then card order, then row order —
   * order restoration on a set whose membership just changed would
   * restore the positions of rows that are no longer there.
   */
  function minimalPair() {
    const doc = clone(parse());
    const host = guidesHost(doc);
    const frozen = host.children.filter((t) => t.lock?.kind === "outside-region");
    const free = host.children.filter((t) => t.lock === undefined);

    // The pinned row leaves its frozen block for a card that does not
    // exist in the source, carrying its displacement record.
    const pinned = frozen[0]!;
    const stayed = frozen[1]!;
    host.children = [stayed, ...free];
    const born = createSection("Workflow", [
      {
        ...pinned,
        displaced: {
          parentId: host.id,
          parentTitle: host.title,
          index: 0,
          kind: "pin" as const,
        },
      },
    ]);
    doc.sections.push(born);
    return { doc, born, pinnedTitle: pinned.title, stayedTitle: stayed.title };
  }

  it("restores membership, prunes the husk, and restores order on the survivors", () => {
    const { doc, born, pinnedTitle, stayedTitle } = minimalPair();
    const projected = project(doc);

    // The created card is gone from both halves of the arrangement.
    expect(projected.doc.sections.some((s) => s.id === born.id)).toBe(false);
    expect(projected.sectionOrder).not.toContain(born.id);

    // The pinned row is home, and the frozen block reads in SOURCE order
    // — which is only true if order ran after membership.
    const rows = guidesHost(projected.doc)
      .children.filter((t) => t.lock?.kind === "outside-region")
      .map((t) => t.title);
    expect(rows).toEqual([pinnedTitle, stayedTitle]);
  });

  it("the projected plan is clean — which is the whole point of the order", () => {
    const { doc } = minimalPair();
    const projected = project(doc);
    const result = planOf(projected.doc, projected.sectionOrder);
    expect(result.warnings.filter((w) => w.blocking)).toEqual([]);
    expect(result.changes).toEqual([]);
  });

  it("prunes a standalone husk emptied by a pin projection, with no creation record", () => {
    // WITHOUT THIS CLAUSE the projection would hand the planner a card
    // count its block count refuses — the projection CREATING the
    // refusal it exists to clear.
    //
    // THE REMAINDERS ARE EMPTY ON PURPOSE. Written the obvious way, this
    // scenario passes through the CREATION pass instead: a standalone the
    // source does not have is a creation record, and dissolving it
    // removes the card for a reason that has nothing to do with pruning.
    // A scenario that passes for a reason nobody chose is not covering
    // what its name says, so the husk here is handed to the projection
    // with no record naming it.
    const doc = clone(parse());
    const host = guidesHost(doc);
    const row = host.children.find((t) => t.lock?.kind === "outside-region")!;
    host.children = host.children.filter((t) => t.id !== row.id);
    const husk = {
      ...createSection(row.title, [
        {
          ...row,
          displaced: {
            parentId: host.id,
            parentTitle: host.title,
            index: 0,
            kind: "pin" as const,
          },
        },
      ]),
      isOrphan: true,
    };
    doc.sections.push(husk);

    const projected = applyableProjection(
      { doc, sectionOrder: order(doc) },
      { records: ledgerOf(doc, source()), remainders: [], source: source() },
    );
    expect(projected.doc.sections.some((s) => s.id === husk.id)).toBe(false);
    expect(projected.sectionOrder).not.toContain(husk.id);
  });

  it("reads the created card AFTER the row pass, so a pinned member is not restored twice", () => {
    // MEMBERSHIP BEFORE DISSOLUTION, the boundary that actually bites: a
    // created card holding a pinned row must give that row up before it
    // is taken apart, or the creation pass re-homes a row the ledger pass
    // has already re-homed and the document gains a duplicate.
    const { doc, pinnedTitle } = minimalPair();
    const projected = project(doc);
    const titles = guidesHost(projected.doc).children.map((t) => t.title);
    expect(titles.filter((t) => t === pinnedTitle)).toHaveLength(1);
  });
});

describe("a promoted creation dissolves as ONE UNIT", () => {
  it("returns the entry WITH its subtree to the entry's source placement", () => {
    // The card's own key IS the entry and its members are the children,
    // so the children must not scatter to their own source rows.
    const doc = clone(parse());
    const guides = doc.sections.find((s) => s.title === "Guides")!;
    const hostRow = guides.topics[0]!;
    // Promote `guides/index` out of its card: the entry becomes the card
    // face, its children become the rows — the shipped unwrap shape.
    guides.topics = guides.topics.filter((t) => t.id !== hostRow.id);
    doc.sections.push({
      ...createSection(hostRow.title, hostRow.children),
      path: hostRow.path,
    });

    const projected = project(doc);
    const back = projected.doc.sections
      .find((s) => s.title === "Guides")!
      .topics.find((t) => t.path === "guides/index");
    expect(back).toBeDefined();
    expect(back!.children.map((c) => c.title)).toEqual(
      hostRow.children.map((c) => c.title),
    );
  });
});

describe("FENCE 8 — two tabs differing only in posture agree byte-for-byte", () => {
  /**
   * THE GATE KEYS ON THE DOCUMENT (docs/21's fence, extended to the
   * sibling report). Modelled as two independent arrangements because
   * that is what two tabs hold: the same document, two postures. The
   * postures are not passed to anything below — they cannot be, which
   * the construction assertions in `remainders.test.ts` pin — so this
   * asserts the CONSEQUENCE: nothing downstream can tell them apart.
   */
  function arranged(): TocDocument {
    const d = clone(parse());
    const host = guidesHost(d);
    const moved = host.children.find((t) => t.path === "guides/usage")!;
    host.children = host.children.filter((t) => t.id !== moved.id);
    d.sections.push(createSection("Workflow", [moved]));
    return d;
  }

  it("identical reports, projections and plans", () => {
    const grounded = arranged();
    const aspirational = arranged();
    // The only difference two tabs would have is a field neither of
    // these functions takes.
    const ids = (d: TocDocument) => order(d);

    const reportA = structureReport(grounded, filesOf(grounded), ids(grounded));
    const reportB = structureReport(
      aspirational,
      filesOf(aspirational),
      ids(aspirational),
    );
    expect(reportA.map((r) => r.kind)).toEqual(reportB.map((r) => r.kind));

    const projA = project(grounded);
    const projB = project(aspirational);
    expect(projA.doc.sections.map((s) => s.title)).toEqual(
      projB.doc.sections.map((s) => s.title),
    );

    const planA = planOf(projA.doc, projA.sectionOrder);
    const planB = planOf(projB.doc, projB.sectionOrder);
    expect(planA.changes).toEqual(planB.changes);
    expect(planA.warnings).toEqual(planB.warnings);
  });

  it("a GROUNDED arrangement gets the projection too, by construction", () => {
    // Not a second code path: a grounded run can hoist a leaf or reorder
    // cards — the validator opens both — and after docs/22 that tab gets
    // the same projection and the same checklist as any other.
    const d = arranged();
    const projected = project(d);
    expect(planOf(projected.doc, projected.sectionOrder).warnings).toEqual([]);
  });
});

describe("THE CONFLUENCE that licenses the pass-order deviation", () => {
  /**
   * WHY THIS TEST EXISTS, and what it licenses.
   *
   * docs/22's fence 3 says "mutating the pass order fails it". Five of
   * the six boundaries are mutation-killed and one is not: passes 3 and 4
   * are CONFLUENT, so no mutant can express their order because swapping
   * them changes nothing. A deviation that cannot be caught by a mutant
   * has to be pinned by an assertion instead, or it is a claim resting on
   * a comment.
   *
   * THE INVARIANT BEHIND IT is the LOCKED PREFIX. Pass 4 sorts frozen
   * rows into the positions they ALREADY OCCUPY, and frozen entries
   * always occupy the front of a host's list, so no unlocked row can
   * interleave with them and the answer never depends on whether an
   * earlier pass has put a row back yet. Pass 3 writes only the card
   * SEQUENCE and pass 4 writes only rows WITHIN cards — disjoint outputs
   * over a shared input neither of them changes for the other.
   *
   * AN INDEX-SPLICE REIMPLEMENTATION BREAKS THIS, which is what makes
   * the second assertion non-vacuous: placing each frozen row at its
   * ABSOLUTE source index makes the result depend on how many rows are
   * in the list when the pass runs, and the membership passes are what
   * change that. VERIFIED: mutating pass 4 to splice by absolute index
   * turns "ROW ORDER RUN EARLY" red and leaves the six pass-order kills
   * green.
   *
   * WHAT EACH HALF PINS, AND WHAT IT DOES NOT — stated because an
   * instrument that accepts is not an instrument that checks:
   *
   *   - "ROW ORDER RUN EARLY" pins the boundary the prefix-invariant
   *     reasoning is about (membership ↔ row order) and is
   *     mutation-verified above.
   *   - "PASSES 3 AND 4 SWAPPED" pins the DIRECTED claim, and its
   *     independence turns out to be STRUCTURAL rather than incidental:
   *     pass 3 writes only the card sequence and reads only SECTION
   *     natural keys, which pass 4 — which reorders rows inside cards —
   *     never changes. Three mutants were tried against it (pass 3
   *     sorting on a card's first row, on its first frozen child, and on
   *     the whole permuted row sequence) and none of them separated the
   *     two orders on this corpus, because the one card whose rows move
   *     compares the same way against a card with none either side of
   *     the pass. So this half is a REGRESSION GUARD on that
   *     independence — it fails the day pass 3 starts reading row state
   *     — rather than a demonstration that the order matters today. Both
   *     halves are recorded that way in docs/22's fence-3 amendment.
   */
  /**
   * A THREE-ROW FROZEN BLOCK, and its own project files.
   *
   * The shared fixture above cannot discriminate here and that is a fact
   * about the fixture, not about the property: with two frozen rows at
   * positions 0 and 1 whose source indices are also 0 and 1, a
   * position-preserving sort and an absolute-index splice agree by
   * coincidence. Three rows, one of them DISPLACED out of the block, is
   * the minimal shape where the two implementations diverge — which is
   * the shape the confluence claim is actually about.
   */
  const THREE: FilesSnapshot = {
    ...PROJECT,
    "guides/index.rst": [
      "Guides",
      "======",
      "",
      ".. toctree::",
      "",
      "   frozen-a",
      "   frozen-b",
      "   frozen-c",
      "",
      "Prose terminates the sequence, so the block above is outside the region.",
      "",
      ".. toctree::",
      "",
      "   install",
      "   usage",
      "",
    ].join("\n"),
    "guides/frozen-c.rst": "Frozen C\n========\n\nbody\n",
  };

  const arrangements = (): { doc: TocDocument; files: FilesSnapshot }[] => {
    const out: { doc: TocDocument; files: FilesSnapshot }[] = [];
    for (const create of [false, true]) {
      for (const frozenReorder of [false, true]) {
        for (const freeReorder of [false, true]) {
          const d = clone(parse());
          const host = guidesHost(d);
          const frozen = host.children.filter((t) => t.lock?.kind === "outside-region");
          const free = host.children.filter((t) => t.lock === undefined);
          host.children = [
            ...(frozenReorder ? [frozen[1]!, frozen[0]!] : frozen),
            ...(freeReorder ? [free[1]!, free[0]!] : free),
          ];
          if (create) {
            const moved = host.children.find((t) => t.lock === undefined)!;
            host.children = host.children.filter((t) => t.id !== moved.id);
            d.sections.push(createSection("Workflow", [moved]));
          }
          out.push({ doc: d, files: PROJECT });
        }
      }
    }

    // THE DISCRIMINATING ARRANGEMENT: a PINNED frozen row displaced into
    // a created card while the two that remain are reordered. Membership
    // changes inside the frozen run, which is exactly what an
    // absolute-index splice would read differently depending on when it
    // ran.
    for (const reorderRest of [false, true]) {
      const d = clone(parse(THREE));
      const host = guidesHost(d);
      const frozen = host.children.filter((t) => t.lock?.kind === "outside-region");
      const free = host.children.filter((t) => t.lock === undefined);
      const [a, b, c] = frozen;
      const rest = reorderRest ? [c!, b!] : [b!, c!];
      host.children = [...rest, ...free];
      d.sections.push(
        createSection("Workflow", [
          {
            ...a!,
            displaced: {
              parentId: host.id,
              parentTitle: host.title,
              index: 0,
              kind: "pin" as const,
            },
          },
        ]),
      );
      out.push({ doc: d, files: THREE });
    }
    return out;
  };

  it("PASSES 3 AND 4 SWAPPED produce a byte-identical arrangement", () => {
    // THE DIRECTED ASSERTION, composed from the state the two passes
    // ACTUALLY SEE: after membership and husk pruning, before either
    // order pass has run.
    //
    // Getting that state is what makes the test non-vacuous. Composing
    // off the fully projected arrangement instead — the obvious way —
    // feeds both orders sections pass 4 has already touched, so pass 4
    // is a no-op in both and any implementation passes. Withholding the
    // two order kinds from the projection call no-ops passes 3 and 4
    // inside it and changes nothing else.
    for (const swapCards of [false, true]) {
      for (const { doc, files } of arrangements()) {
        let ids = order(doc);
        if (swapCards) ids = [ids[1]!, ids[0]!, ...ids.slice(2)];
        const src = parse(files);
        const remainders = structureReport(doc, filesOf(doc), ids);
        const membershipOnly = applyableProjection(
          { doc, sectionOrder: ids },
          {
            records: ledgerOf(doc, src),
            remainders: remainders.filter((r) => r.kind === "creation"),
            source: src,
          },
        );
        const base = membershipOnly.doc.sections;
        const order0 = membershipOnly.sectionOrder;

        // Shipped: card order, then row order.
        const shippedOrder = projectCardOrder(base, order0, src, remainders);
        const shippedRows = projectRowOrder(base, src, remainders);
        // Swapped: row order, then card order.
        const swappedRows = projectRowOrder(base, src, remainders);
        const swappedOrder = projectCardOrder(swappedRows, order0, src, remainders);

        expect(JSON.stringify(swappedRows)).toBe(JSON.stringify(shippedRows));
        expect(swappedOrder).toEqual(shippedOrder);
      }
    }
  });

  it("ROW ORDER RUN EARLY, INSTEAD OF LAST, changes nothing", () => {
    // THE BOUNDARY THE MUTANTS COULD NOT NAME, and the one the
    // prefix-invariant reasoning is actually about: the surviving
    // mutation moved pass 4 ahead of pass 1. Expressed as a composition
    // rather than as a mutant, since the whole point is that no mutant
    // can show it.
    //
    // THE LATE PASS IS SUPPRESSED, and that is what makes this an ORDER
    // test rather than an IDEMPOTENCE one. Written the obvious way —
    // run pass 4 first and then the whole pipeline — the pipeline runs
    // pass 4 again at the end and normalises the difference away, so
    // every implementation passes. Withholding the `row-order` records
    // from the second call no-ops pass 4 inside it and changes nothing
    // else: they have no other consumer in the projection.
    for (const { doc, files } of arrangements()) {
      const ids = order(doc);
      const src = parse(files);
      const remainders = structureReport(doc, filesOf(doc), ids);
      const records = ledgerOf(doc, src);

      const shipped = applyableProjection(
        { doc, sectionOrder: ids },
        { records, remainders, source: src },
      );
      const early: TocDocument = {
        ...doc,
        sections: projectRowOrder(doc.sections, src, remainders),
      };
      const swapped = applyableProjection(
        { doc: early, sectionOrder: ids },
        {
          records: ledgerOf(early, src),
          remainders: remainders.filter((r) => r.kind !== "row-order"),
          source: src,
        },
      );

      expect(JSON.stringify(swapped.doc.sections)).toBe(
        JSON.stringify(shipped.doc.sections),
      );
      expect(swapped.sectionOrder).toEqual(shipped.sectionOrder);
    }
  });
});
