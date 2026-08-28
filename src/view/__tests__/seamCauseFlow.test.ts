/**
 * FENCE 8 — the seam clause, through the store (docs/22, Decision 7).
 *
 * WHAT THIS FILE'S GREEN MEANS: the creation seam's STATE MACHINE is
 * right — which drops ask, which commit, which refuse; that one consent
 * answers for both causes; and that POSTURE INVARIANCE still holds, so
 * two tabs differing only in `aspirational`/`seamDeclined` produce
 * byte-identical reports, checklists and projections.
 *
 * WHAT IT SAYS NOTHING ABOUT: pointers, pixels, or the wrapper that
 * joins a release to `commitSeamDrop` — vitest runs in node. `e2e/flow18`
 * drives real pointers at real pixels for that. Named rather than
 * implied, because an instrument that ACCEPTS is not an instrument that
 * CHECKS.
 */

import { describe, expect, it } from "vitest";
import { sphinxAdapter } from "@/collections/adapters/sphinx";
import { hugoAdapter } from "@/collections/adapters/hugo";
import { consentGate, type SeamCause } from "@/interaction/pinnedDrag";
import { createCards } from "@/formats/registry";
import { buildChecklist, applyableProjection } from "@/model/ledger";
import { structureReport } from "@/model/remainders";
import { filesOf } from "@/collections/types";
import { addHeadingRefusal } from "@/commands/guards";
import { runCommand } from "@/commands/dispatcher";
import type { EditorState } from "@/commands/types";
import type { FilesSnapshot } from "@/collections/types";
import type { TocDocument, Topic } from "@/model/types";

const SPHINX: FilesSnapshot = {
  "conf.py": 'master_doc = "index"\nsource_suffix = ".rst"\n',
  "index.rst": [
    "Docs",
    "====",
    "",
    ".. toctree::",
    "   :caption: Guides",
    "",
    "   guides/index",
    "",
  ].join("\n"),
  "guides/index.rst": "Guides\n======\n\n.. toctree::\n\n   install\n   tour\n",
  "guides/install.rst": "Install\n=======\n\nbody\n",
  "guides/tour.rst": "Tour\n====\n\nbody\n",
};

const hugoRaw = import.meta.glob("@/collections/__tests__/fixtures/hugo-moves/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const hugoFiles = (): FilesSnapshot => {
  const f: FilesSnapshot = {};
  for (const [k, c] of Object.entries(hugoRaw)) {
    if (k.endsWith("README.md")) continue;
    f[k.replace(/^.*fixtures\/hugo-moves\//, "")] = c;
  }
  return f;
};

/** A row by title, WHEREVER it sits — the card's own entry nests its
 *  children, so a top-level-only search finds the wrong things or
 *  nothing at all. */
const rowByTitle = (doc: TocDocument, title: string): Topic => {
  const walk = (ts: readonly Topic[]): Topic | null => {
    for (const t of ts) {
      if (t.title === title) return t;
      const found = walk(t.children);
      if (found) return found;
    }
    return null;
  };
  for (const s of doc.sections) {
    const found = walk(s.topics);
    if (found) return found;
  }
  throw new Error(`no row "${title}"`);
};
const editorFor = (doc: TocDocument): EditorState => ({
  document: doc,
  columns: [doc.sections.map((s) => s.id)],
  view: { globalDepth: 2, cardDepths: {} },
});

describe("the creation seam fires only where the write path cannot record a card", () => {
  it("a Sphinx canvas drop needs consent — its cards are toctree blocks", () => {
    const { doc } = sphinxAdapter.parse(SPHINX, "p");
    const cause: SeamCause = { pinnedCount: 0, creates: !createCards(doc) };
    expect(cause.creates).toBe(true);
    expect(consentGate({}, cause)).toBe("seam");
  });

  it("a HUGO canvas drop does not — the exclusion, asserted", () => {
    // Narrowing a classifier obligates the other side's receipt: a seam
    // on every canvas drop would be the forty-modals failure.
    const { doc } = hugoAdapter.parse(hugoFiles(), "hm");
    const cause: SeamCause = { pinnedCount: 0, creates: !createCards(doc) };
    expect(cause.creates).toBe(false);
    expect(consentGate({}, cause)).toBe("commit");
  });

  it("fires ONCE: an answered tab never seams again, for either cause", () => {
    const creates: SeamCause = { pinnedCount: 0, creates: true };
    const pinnedAndCreates: SeamCause = { pinnedCount: 2, creates: true };
    for (const cause of [creates, pinnedAndCreates]) {
      expect(consentGate({ aspirational: true }, cause)).toBe("commit");
      expect(consentGate({ seamDeclined: true }, cause)).toBe("refuse");
    }
  });
});

describe("POSTURE INVARIANCE holds for the creation the seam licensed", () => {
  /**
   * docs/21's fence, extended to arc 2's gesture: the apply surfaces key
   * on the DOCUMENT, never on the tab's consent. Two tabs identical in
   * document and differing only in state must produce byte-identical
   * reports, checklists and projections — which is what makes a grounded
   * tab get the projection by construction rather than by a second code
   * path.
   */
  function withCreation(): { doc: TocDocument; order: string[] } {
    const { doc } = sphinxAdapter.parse(SPHINX, "p");
    const state = editorFor(doc);
    const { next } = runCommand(state, {
      type: "moveTopicsToNewSection",
      topicIds: [rowByTitle(doc, "Install").id],
      toColumn: 0,
      toIndexInColumn: 1,
    });
    return { doc: next.document, order: next.columns.flat() };
  }

  it("the report is the same whatever the tab consented to", () => {
    const { doc, order } = withCreation();
    const report = structureReport(doc, filesOf(doc), order);
    // The creation IS there — a vacuous invariance over an empty report
    // would pass for the wrong reason.
    expect(report.filter((r) => r.kind === "creation")).toHaveLength(1);
    // And the selector has no parameter a tab state could arrive through.
    expect(structureReport.length).toBe(3);
  });

  it("the checklist and the projection are byte-identical across states", () => {
    const { doc, order } = withCreation();
    const sourceDoc = sphinxAdapter.parse(SPHINX, "p").doc;
    const remainders = structureReport(doc, filesOf(doc), order);
    const checklist = buildChecklist(doc, [], { consentDeclined: false, remainders });
    expect(checklist.some((i) => i.id.startsWith("creation:"))).toBe(true);
    // Run it twice: nothing about either call names a tab, so the only
    // way they could differ is a hidden read.
    expect(buildChecklist(doc, [], { consentDeclined: false, remainders })).toEqual(
      checklist,
    );
    // THE PROJECTION TOO — and with the remainders actually supplied, so
    // the assertion is over a projection that DOES something. A vacuous
    // pair of no-ops would agree for the wrong reason.
    const arrangement = { doc, sectionOrder: order };
    const project = () =>
      applyableProjection(arrangement, {
        records: [],
        remainders,
        source: sourceDoc,
      });
    expect(project().doc.sections.map((s) => s.title)).not.toEqual(
      doc.sections.map((s) => s.title),
    );
    expect(project()).toEqual(project());
  });
});

describe("Add heading has no producer on a createCards:false document", () => {
  /**
   * DESIGNED ABSENCE WITH ITS UNLOCK NAMED, not a gap. Decision 7 names
   * "a canvas drop (or 'Add heading') on a `createCards: false`
   * document" as the gated pair, and the second half has no reachable
   * producer at this build: "Add heading" is offered on STANDALONE cards
   * only, Sphinx is the only adapter answering `createCards: false`, and
   * Sphinx's root bears no standalone — so no Sphinx document can hold
   * one to add a heading to.
   *
   * ASSERTED RATHER THAN ASSUMED, over every producer that could mint
   * one. The unlock is the first `createCards: false` adapter whose root
   * DOES bear standalones; the day it registers, this goes red and the
   * gate is owed.
   */
  it("no Sphinx producer mints a standalone, so the command is never offered", () => {
    const { doc } = sphinxAdapter.parse(SPHINX, "p");
    // PARSE: no orphan producer at all.
    expect(doc.sections.some((s) => s.isOrphan)).toBe(false);

    // THE CANVAS BIRTH: wraps, per the root's declared bearing.
    const state = editorFor(doc);
    const { next } = runCommand(state, {
      type: "moveTopicsToNewSection",
      topicIds: [rowByTitle(doc, "Install").id],
      toColumn: 0,
      toIndexInColumn: 1,
    });
    expect(next.document.sections.some((s) => s.isOrphan)).toBe(false);

    // And every card therefore refuses the command by species, before
    // any consent question could arise.
    for (const card of next.document.sections) {
      expect(addHeadingRefusal(next.document, card)).toBe("not-standalone");
    }
  });
});
