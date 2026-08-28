/**
 * THE RULED BIRTHS (docs/22, Decision 2; OR-5's ruling of record) —
 * fence 6's three named birth assertions plus the regression the
 * Substrate's receipt owes.
 *
 * THE RULING, VERBATIM: *"Dragging a topic out to the canvas must always
 * be interpreted as user intent to promote a topic/topic tree to the
 * top-level."* One gesture meaning, two birth shapes, decided by the
 * ENTRY — and the shipped childless wrap was the misreading of that
 * motive, not a second meaning.
 *
 * DRIVEN THROUGH THE COMMAND, never through the drag handler: vitest
 * runs in node, `execMoveTopicsToNewSection` is the invariant, and
 * `e2e/flow18` drives real pointers at the rest.
 */

import { describe, expect, it } from "vitest";
import { produce } from "immer";
import { sphinxAdapter } from "@/collections/adapters/sphinx";
import { hugoAdapter } from "@/collections/adapters/hugo";
import { executeCommand } from "../execute";
import { initialColumns } from "@/layout/columns";
import { DEFAULT_GLOBAL_DEPTH } from "@/store";
import type { EditorState } from "../types";
import type { FilesSnapshot } from "@/collections/types";
import type { Section, TocDocument, Topic } from "@/model/types";

const CONF = 'master_doc = "index"\nsource_suffix = ".rst"\n';
const SPHINX: FilesSnapshot = {
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
    "",
  ].join("\n"),
  "guides/index.rst": "Guides\n======\n\n.. toctree::\n\n   install\n   tour\n",
  "guides/install.rst": "Install\n=======\n\nbody\n",
  "guides/tour.rst": "Tour\n====\n\nbody\n",
  "reference/api.rst": "API\n===\n\nbody\n",
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

function editorFor(doc: TocDocument): EditorState {
  return {
    document: doc,
    columns: initialColumns(doc),
    view: { globalDepth: DEFAULT_GLOBAL_DEPTH, cardDepths: {} },
  };
}
function rowByTitle(doc: TocDocument, title: string): Topic {
  for (const s of doc.sections) {
    const walk = (ts: Topic[]): Topic | null => {
      for (const t of ts) {
        if (t.title === title) return t;
        const r = walk(t.children);
        if (r) return r;
      }
      return null;
    };
    const r = walk(s.topics);
    if (r) return r;
  }
  throw new Error(`no row "${title}"`);
}
/** Drag these rows out to the END of the first column. */
function dragOut(state: EditorState, ids: string[]): EditorState {
  return produce(state, (draft) => {
    executeCommand(draft, {
      type: "moveTopicsToNewSection",
      topicIds: ids,
      toColumn: 0,
      toIndexInColumn: draft.columns[0]?.length ?? 0,
    });
  });
}
const bornIn = (before: EditorState, after: EditorState): Section | undefined =>
  after.document.sections.find(
    (s) => !before.document.sections.some((o) => o.id === s.id),
  );

describe("fence 6 — a CHILDLESS drag-out births the standalone", () => {
  it("mints the standalone on a home that bears one, and the old wrap is gone", () => {
    /**
     * THE REGRESSION, AGAINST THE SUBSTRATE'S MEASURED RECEIPT. At the
     * base SHA this gesture minted `{ title: "Alpha", topics: [Alpha] }`
     * — a NON-orphan one-entry group whose heading duplicated the
     * entry's name, from `createSection(detached.title, removed)`. That
     * shape is what must no longer appear.
     */
    const { doc } = hugoAdapter.parse(hugoFiles(), "hm");
    const before = editorFor(doc);
    const after = dragOut(before, [rowByTitle(doc, "Alpha").id]);
    const born = bornIn(before, after)!;

    expect(born.isOrphan).toBe(true);
    expect(born.topics.map((t) => t.title)).toEqual(["Alpha"]);
    // The card IS its entry, so it mirrors the entry's path — the shape
    // every adapter's parse already mints for a top-level leaf.
    expect(born.path).toBe(rowByTitle(doc, "Alpha").path);
    // The measured old shape, named so the regression cannot be read as
    // a general "not a group" claim: a NON-orphan section titled after
    // its single entry.
    expect(born.isOrphan === undefined && born.title === born.topics[0]!.title).toBe(
      false,
    );
  });

  it("the born standalone EXPORTS as the bare entry, not as a group wrapping one page", () => {
    // The species is observable in the bytes, which is the only place it
    // matters: a group wrapping one page and a page at top level are two
    // different navigations.
    const { doc } = hugoAdapter.parse(hugoFiles(), "hm");
    const before = editorFor(doc);
    const after = dragOut(before, [rowByTitle(doc, "Alpha").id]);
    const born = bornIn(before, after)!;
    const plan = hugoAdapter.planChanges!(
      hugoFiles(),
      after.document,
      after.columns.flat(),
    );
    // No directory is created for it — the page simply relocates to the
    // content root, which is where Docsy renders a top-level page.
    expect(
      plan.changes.some(
        (c) => c.kind === "create" && (c.path ?? "").endsWith(`/${"alpha"}/_index.md`),
      ),
    ).toBe(false);
    expect(born.isOrphan).toBe(true);
  });
});

describe("fence 6 — a PINNED PARENTED drag-out births the WRAP", () => {
  it("keeps the entry a row, the pin intact, and records the displacement", () => {
    const { doc } = sphinxAdapter.parse(SPHINX, "p");
    // "Guides" is a parented entry inside the Guides card; pin it.
    const entry = rowByTitle(doc, "Guides");
    expect(entry.children.length).toBeGreaterThan(0);
    entry.lock = { kind: "outside-region" };

    const before = editorFor(doc);
    const after = dragOut(before, [entry.id]);
    const born = bornIn(before, after)!;

    // WRAPPED, not promoted: the entry is still a ROW.
    expect(born.topics.map((t) => t.title)).toEqual(["Guides"]);
    expect(born.isOrphan).toBeUndefined();
    const row = born.topics[0]!;
    expect(row.lock).toEqual({ kind: "outside-region" });
    expect(row.children.map((t) => t.title)).toEqual(["Install", "Tour"]);
    // AND THE DISPLACEMENT RECORDS — an ordinary cross-parent move.
    expect(row.displaced?.kind).toBe("pin");
    expect(row.displaced?.parentTitle).toBe("Guides");
  });

  it("an UNPINNED parented drag-out still promotes — the shipped unwrap, now ruled", () => {
    // The minimal pair: one node in each state. A fixture with only the
    // interesting case cannot show that the boring one is treated
    // differently.
    const { doc } = sphinxAdapter.parse(SPHINX, "p");
    const entry = rowByTitle(doc, "Guides");
    const before = editorFor(doc);
    const after = dragOut(before, [entry.id]);
    const born = bornIn(before, after)!;

    expect(born.title).toBe("Guides");
    expect(born.path).toBe(entry.path);
    expect(born.topics.map((t) => t.title)).toEqual(["Install", "Tour"]);
  });
});

describe("fence 6 — a parented drop on an ANCHORS lane refuses (OR-5d)", () => {
  it("births nothing where the home bears standalones only", () => {
    const { doc } = sphinxAdapter.parse(SPHINX, "p");
    const entry = rowByTitle(doc, "Guides");
    // An anchors-shaped home: bears standalones, bears no sections.
    const withAnchors: TocDocument = {
      ...doc,
      containers: [
        {
          chainKey: "",
          label: "Top level",
          order: 0,
          accepts: { sections: false, orphans: true },
          mayEmpty: true,
        },
      ],
    };
    const before = editorFor(withAnchors);
    const after = dragOut(before, [entry.id]);
    expect(after.document.sections).toHaveLength(before.document.sections.length);
    expect(bornIn(before, after)).toBeUndefined();
  });

  it("but a CHILDLESS entry lands there happily — the exclusion, asserted", () => {
    // Narrowing a classifier obligates the other side's receipt.
    const { doc } = sphinxAdapter.parse(SPHINX, "p");
    const leaf = rowByTitle(doc, "Install");
    const withAnchors: TocDocument = {
      ...doc,
      containers: [
        {
          chainKey: "",
          label: "Top level",
          order: 0,
          accepts: { sections: false, orphans: true },
          mayEmpty: true,
        },
      ],
    };
    const before = editorFor(withAnchors);
    const after = dragOut(before, [leaf.id]);
    expect(bornIn(before, after)?.isOrphan).toBe(true);
  });
});
