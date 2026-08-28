/**
 * projection.test.ts — the apply path's four invariants (docs/21,
 * Decision 4).
 *
 * PLAN THE PROJECTION, NEVER FILTER THE PLAN. A plan is not separable
 * per change — ordering, renumbering and cross-file edits interdepend —
 * so a filtered plan is a document nobody verified. The projection keeps
 * the verification story whole: the plan is computed from a REAL
 * document and simulated against it, exactly as every plan today.
 *
 * The equivalence below is the invariant that makes that claim
 * checkable: `plan(projection) ≡ plan(the same arrangement built
 * directly)`. If they ever differ, the projection is carrying some
 * residue of the displaced arrangement into the bytes — which is the one
 * thing invariant 3 forbids.
 *
 * Driven against the real Hugo planner and real fixture files, because
 * a simulated planner would be an oracle agreeing with a straw man
 * (docs/16's receipt for exactly that mistake).
 */

import { describe, expect, it } from "vitest";
import { hugoAdapter } from "../adapters/hugo";
import { deriveSectionOrder, initialColumns } from "@/layout/columns";
import {
  applyableProjection,
  buildChecklist,
  checklistText,
  ledgerOf,
  recordedLedger,
  type LedgerRecord,
} from "@/model/ledger";
import { renderPatch } from "../diff";
import { originalDocumentOf } from "../original";
import type { Section, TocDocument, Topic } from "@/model/types";
import type { FilesSnapshot } from "../types";

const raw = import.meta.glob("./fixtures/hugo-moves/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function snapshot(): FilesSnapshot {
  const files: FilesSnapshot = {};
  for (const [key, content] of Object.entries(raw)) {
    if (key.endsWith("README.md")) continue;
    files[key.replace("./fixtures/hugo-moves/", "")] = content;
  }
  return files;
}

const load = () => {
  const files = snapshot();
  const { doc } = hugoAdapter.parse(files, "moves");
  return { files, doc };
};

const card = (doc: TocDocument, title: string): Section =>
  doc.sections.find((s) => s.title === title)!;

/** Move a row between cards. `record` writes the displacement the AI
 *  classifier would have written; omit it for an ordinary hand move. */
function moveRow(
  doc: TocDocument,
  fromCard: string,
  rowTitle: string,
  toCard: string,
  record?: Topic["displaced"],
): TocDocument {
  const next: TocDocument = structuredClone(doc);
  const source = card(next, fromCard);
  const row = source.topics.find((t) => t.title === rowTitle)!;
  source.topics = source.topics.filter((t) => t.id !== row.id);
  card(next, toCard).topics.unshift(record ? { ...row, displaced: record } : row);
  return next;
}

function planOf(files: FilesSnapshot, doc: TocDocument) {
  return hugoAdapter.planChanges!(files, doc, deriveSectionOrder(initialColumns(doc)), {
    writeAliases: true,
  });
}

/** The projection's ROW half, which is what this file is about (docs/21):
 *  the structural clauses are Sphinx's producers and live beside them. */
const project = (d: TocDocument, records: readonly LedgerRecord[]): TocDocument =>
  applyableProjection(
    { doc: d, sectionOrder: deriveSectionOrder(initialColumns(d)) },
    { records },
  ).doc;

describe("invariant 3 — nothing written references the imagined state", () => {
  it("plan(projection) is byte-identical to plan(the same arrangement directly)", () => {
    const { files, doc } = load();
    const from = doc.sections[0]!;
    const to = doc.sections[1]!;
    const row = from.topics[0]!;

    // The displaced document: the row is imagined under `to`, with the
    // record the classifier writes.
    const displaced = moveRow(doc, from.title, row.title, to.title, {
      parentId: from.id,
      parentTitle: from.title,
      index: 0,
      kind: "pin",
    });
    const projection = project(displaced, recordedLedger(displaced));

    // The same arrangement built directly: the original, untouched.
    const direct = doc;

    expect(renderPatch(planOf(files, projection).changes, files)).toBe(
      renderPatch(planOf(files, direct).changes, files),
    );
  });

  it("holds when other, UNRELATED edits ride along", () => {
    // The projection returns the displaced rows and touches nothing
    // else, so an arrangement with real work in it must plan the same
    // either way. A projection that rebuilt more than it had to would
    // fail here and nowhere else.
    const { files, doc } = load();
    const other = doc.sections[1]!;
    const reordered: TocDocument = structuredClone(doc);
    card(reordered, other.title).topics.reverse();

    const from = reordered.sections[0]!;
    const displaced = moveRow(reordered, from.title, from.topics[0]!.title, other.title, {
      parentId: from.id,
      parentTitle: from.title,
      index: 0,
      kind: "pin",
    });

    expect(
      renderPatch(
        planOf(files, project(displaced, recordedLedger(displaced))).changes,
        files,
      ),
    ).toBe(renderPatch(planOf(files, reordered).changes, files));
  });

  it("plans exactly what the UNTOUCHED document plans, when the only edit is a displacement", () => {
    // docs/11's "the plan visibly collapses", holding with a remainder
    // on screen: nothing NEW left for the app, one thing left for the
    // hand.
    //
    // Compared against the pristine plan rather than against `[]`,
    // because this fixture's pristine plan is not empty — it carries one
    // `_build.list: never` disclosure edit. Asserting emptiness would
    // have been a claim about the fixture wearing the projection's name.
    const { files, doc } = load();
    const from = doc.sections[0]!;
    const displaced = moveRow(
      doc,
      from.title,
      from.topics[0]!.title,
      doc.sections[1]!.title,
      {
        parentId: from.id,
        parentTitle: from.title,
        index: 0,
        kind: "pin",
      },
    );
    const projection = project(displaced, recordedLedger(displaced));
    expect(planOf(files, projection).changes).toEqual(planOf(files, doc).changes);
    // …and the displaced document really would have written the move,
    // so the projection is doing work rather than agreeing vacuously.
    expect(planOf(files, displaced).changes.some((c) => c.kind === "move")).toBe(true);
  });
});

describe("the consent control decides what projects, and nothing else does", () => {
  const consented = () => {
    const { files, doc } = load();
    const from = doc.sections[0]!;
    const displaced = moveRow(
      doc,
      from.title,
      from.topics[0]!.title,
      doc.sections[1]!.title,
      {
        parentId: from.id,
        parentTitle: from.title,
        index: 0,
        kind: "consent",
      },
    );
    return { files, doc, displaced, records: recordedLedger(displaced) };
  };

  it("OFF projects the consent move home — the plan moves no file", () => {
    const { files, doc, displaced, records } = consented();
    const off = records.filter((r) => r.kind === "pin" || r.kind === "consent");
    const changes = planOf(files, project(displaced, off)).changes;
    expect(changes.some((c) => c.kind === "move")).toBe(false);
    expect(changes).toEqual(planOf(files, doc).changes);
  });

  it("ON leaves it in the arrangement — the plan moves the file", () => {
    const { files, displaced, records } = consented();
    const on = records.filter((r) => r.kind === "pin");
    const changes = planOf(files, project(displaced, on)).changes;
    expect(changes.some((c) => c.kind === "move")).toBe(true);
  });

  it("lists a declined move as DECLINED, never as a wall", () => {
    const { displaced, records } = consented();
    const declined = buildChecklist(displaced, records, { consentDeclined: true });
    expect(declined.map((i) => i.group)).toEqual(["declined"]);
    expect(checklistText(declined).join("\n")).toContain("DECLINED THIS RUN");
  });

  it("drops it from the checklist entirely once it is included", () => {
    // Saying "left to you" about a change the plan is about to write
    // would be the list contradicting the file rows beside it.
    const { displaced, records } = consented();
    expect(buildChecklist(displaced, records, { consentDeclined: false })).toEqual([]);
  });
});

describe("the tab STATE never gates a write — the LEDGER keys the apply surfaces", () => {
  it("takes no tab-state parameter at all (the construction assertion)", () => {
    // A plan is a function of (files, document, order). There is no
    // parameter a tab state could arrive through, which is a stronger
    // guarantee than any assertion about its value.
    expect(hugoAdapter.planChanges!.length).toBeLessThanOrEqual(4);
    expect(applyableProjection.length).toBe(2);
    expect(buildChecklist.length).toBe(3);
  });

  it("two tabs identical in document and ledger plan byte-identically", () => {
    // The states differ; nothing downstream can see them. Modelled as
    // two independent documents because that is what two tabs hold —
    // the state lives on the TAB, and neither the projection nor the
    // planner is ever handed one.
    const { files, doc } = load();
    const from = doc.sections[0]!;
    const record: Topic["displaced"] = {
      parentId: from.id,
      parentTitle: from.title,
      index: 0,
      kind: "pin",
    };
    const aspirationalTab = moveRow(
      doc,
      from.title,
      from.topics[0]!.title,
      doc.sections[1]!.title,
      record,
    );
    const groundedTab = moveRow(
      doc,
      from.title,
      from.topics[0]!.title,
      doc.sections[1]!.title,
      record,
    );

    const planFor = (d: TocDocument) =>
      renderPatch(
        planOf(files, project(d, recordedLedger(d))).changes,
        files,
        checklistText(buildChecklist(d, recordedLedger(d), { consentDeclined: true })),
      );
    expect(planFor(aspirationalTab)).toBe(planFor(groundedTab));
  });
});

describe("the checklist travels with the bytes", () => {
  it("renders the remainder as a comment block in the .patch preamble", () => {
    const { files, doc } = load();
    const from = doc.sections[0]!;
    const displaced = moveRow(
      doc,
      from.title,
      from.topics[0]!.title,
      doc.sections[1]!.title,
      {
        parentId: from.id,
        parentTitle: from.title,
        index: 0,
        kind: "pin",
      },
    );
    // A real plan to carry the block: reorder something else too.
    const withWork: TocDocument = structuredClone(displaced);
    withWork.sections[1]!.topics.reverse();
    const records = recordedLedger(withWork);
    const text = renderPatch(
      planOf(files, project(withWork, records)).changes,
      files,
      checklistText(buildChecklist(withWork, records, { consentDeclined: true })),
    );
    // The header states its UNIT since Ruling A (2026-08-19): this list
    // counts ITEMS and its items are not all rows, so a bare "(1)"
    // beside the result view's row count read as one measurement gone
    // wrong. The patch preamble renders the same words as the panel and
    // the clipboard — one source, three surfaces.
    expect(text).toContain("# ASPIRATIONAL — needs your hand (1 row)");
    for (const line of text.split("\n")) {
      if (line.includes("needs your hand")) expect(line.startsWith("#")).toBe(true);
    }
  });

  it("adds no block at all when there is no remainder", () => {
    // An empty heading over nothing is a stale warning about a state
    // that passed.
    const { files, doc } = load();
    const reordered: TocDocument = structuredClone(doc);
    reordered.sections[1]!.topics.reverse();
    const text = renderPatch(planOf(files, reordered).changes, files, checklistText([]));
    expect(text).not.toContain("ASPIRATIONAL");
    expect(text).toBe(renderPatch(planOf(files, reordered).changes, files));
  });
});

describe("the ledger's derived reading agrees with the recorded one (the oracle)", () => {
  /**
   * REGRESSION, and the reason this fixture parses TWICE.
   *
   * `newId()` is a random uuid and every parse mints fresh ones
   * (deliberately — random, never sequential). The first cut of the derived reading
   * compared placements BY MODEL ID, so against a genuinely re-parsed
   * snapshot it matched nothing and silently returned an empty ledger:
   * every badge, every checklist line and the whole projection vanished
   * on exactly the tabs the derivation exists for.
   *
   * A `structuredClone` of the parsed document hides it — the clone
   * shares ids, so the comparison passes for a reason nobody chose. Two
   * independent parses is what production actually does, and
   * `originalDocumentOf` is the function it calls.
   */
  const twoParses = () => {
    const files = snapshot();
    const doc = hugoAdapter.parse(files, "moves").doc;
    // The snapshot rides `extras.files`, which is what
    // `originalDocumentOf` re-parses — a SECOND parse, fresh ids.
    const original = originalDocumentOf(doc);
    return { files, doc, original };
  };

  it("re-parses to a document whose ids share nothing with the tab's", () => {
    // The premise, asserted rather than assumed: if these ever agreed,
    // the regression below would be testing nothing.
    const { doc, original } = twoParses();
    expect(original).not.toBeNull();
    const ids = new Set(doc.sections.flatMap((s) => s.topics.map((t) => t.id)));
    const reparsed = original!.sections.flatMap((s) => s.topics.map((t) => t.id));
    expect(reparsed.length).toBeGreaterThan(0);
    expect(reparsed.some((id) => ids.has(id))).toBe(false);
  });

  it("finds the same pinned displacement both ways, across a real re-parse", () => {
    const { doc, original } = twoParses();
    const from = doc.sections[0]!;
    const row = from.topics[0]!;
    // Pinned in the TAB's document; the snapshot behind it is untouched,
    // exactly as a Sphinx corpus arrives.
    row.lock = { kind: "outside-region" };
    const displaced = moveRow(doc, from.title, row.title, doc.sections[1]!.title, {
      parentId: from.id,
      parentTitle: from.title,
      index: 0,
      kind: "pin",
    });

    const derived = ledgerOf(displaced, original).filter((r) => r.kind === "pin");
    const recorded = recordedLedger(displaced).filter((r) => r.kind === "pin");
    expect(derived).toHaveLength(1);
    expect(derived.map((r: LedgerRecord) => r.topicId)).toEqual(
      recorded.map((r) => r.topicId),
    );
    // …and it resolves the original parent back into THIS document, so
    // the projection has an address it can actually use.
    expect(derived[0]!.originalParentId).toBe(recorded[0]!.originalParentId);
    expect(derived[0]!.originalIndex).toBe(recorded[0]!.originalIndex);
  });

  it("projects home from the DERIVED record, not only from the recorded one", () => {
    const { files, doc, original } = twoParses();
    const from = doc.sections[0]!;
    from.topics[0]!.lock = { kind: "outside-region" };
    const displaced = moveRow(
      doc,
      from.title,
      from.topics[0]!.title,
      doc.sections[1]!.title,
      { parentId: from.id, parentTitle: from.title, index: 0, kind: "pin" },
    );
    const projection = project(displaced, ledgerOf(displaced, original));
    expect(planOf(files, projection).changes.some((c) => c.kind === "move")).toBe(false);
  });
});
