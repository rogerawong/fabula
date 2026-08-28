/**
 * `planChanges`, moves-only (docs/19 step 3).
 *
 * Phase 1 omitted this method ENTIRELY, and its absence WAS the read-only
 * capability — `supportsWriteBack` reads it, so the Review button
 * disabled itself with a reason rather than needing a flag. Defining it
 * is what un-encodes read-only, which is why the capability flip and its
 * copy sweep ride step 6 rather than arriving here by accident.
 *
 * A move relocates an ENTRY LINE between blocks, possibly in two files.
 * There is no file relocation and no directory: `reparentMovesFiles:
 * false` already carried that reasoning and it is as true of phase 2 as
 * of phase 1.
 *
 * THE ONE PLACE A MOVE EDITS TEXT is a cross-FILE move, because a
 * relative docname resolves against its containing document's DIRECTORY
 * (`docname_join` pops the base document's own basename). An entry moved
 * from `guides/index.rst` to `index.rst` must be rewritten or it points
 * somewhere else — and "somewhere else" is usually nowhere, so the
 * failure is a broken nav rather than a wrong one.
 */

import { describe, expect, it } from "vitest";
import { sphinxAdapter } from "../adapters/sphinx";
import { applyChanges, simulatePlan } from "../verify";
import type { FilesSnapshot } from "../types";
import type { TocDocument } from "@/model/types";

const CONF = 'master_doc = "index"\nsource_suffix = ".rst"\n';

/** Two cards at the root, one nested host. */
const PROJECT: FilesSnapshot = {
  "conf.py": CONF,
  "index.rst": [
    "Docs",
    "====",
    "",
    "Prose above the nav.",
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
    "   install",
    "   usage",
    "",
  ].join("\n"),
  "guides/install.rst": "Install\n=======\n\nbody\n",
  "guides/usage.rst": "Usage\n=====\n\nbody\n",
  "reference/api.rst": "API\n===\n\nbody\n",
  "reference/cli.rst": "CLI\n===\n\nbody\n",
};

const parse = (files: FilesSnapshot = PROJECT) => sphinxAdapter.parse(files, "proj");
const order = (doc: TocDocument) => doc.sections.map((s) => s.id);
const plan = (doc: TocDocument, files: FilesSnapshot = PROJECT) =>
  sphinxAdapter.planChanges!(files, doc, order(doc));

const clone = <T>(v: T): T => structuredClone(v);

describe("write-back exists at all", () => {
  it("declares planChanges, which is what un-encodes read-only", () => {
    expect(typeof sphinxAdapter.planChanges).toBe("function");
  });

  it("plans NOTHING when the model is unedited — the round-trip law", () => {
    const { doc } = parse();
    expect(plan(doc).changes).toEqual([]);
  });
});

describe("a reorder rewrites one region and nothing else", () => {
  it("swaps two entries inside one block", () => {
    const { doc } = parse();
    const edited = clone(doc);
    const ref = edited.sections[1]!;
    ref.topics = [ref.topics[1]!, ref.topics[0]!];

    const { changes } = plan(edited);
    expect(changes).toHaveLength(1);
    const change = changes[0]!;
    expect(change.kind).toBe("edit");
    expect(change.region).toBe("navTail");
    expect(change.kind === "edit" && change.path).toBe("index.rst");
    // The prose above the region is not in the change at all.
    expect(change.newContent).not.toContain("Prose above the nav.");
    expect(change.newContent.indexOf("cli")).toBeLessThan(
      change.newContent.indexOf("api"),
    );
  });

  it("survives simulation — re-parsing reproduces the edited model", () => {
    const { doc } = parse();
    const edited = clone(doc);
    const ref = edited.sections[1]!;
    ref.topics = [ref.topics[1]!, ref.topics[0]!];
    const { changes } = plan(edited);
    expect(simulatePlan(sphinxAdapter, PROJECT, edited, order(edited), changes).ok).toBe(
      true,
    );
  });

  it("leaves every byte outside the entry lines identical", () => {
    const { doc } = parse();
    const edited = clone(doc);
    const ref = edited.sections[1]!;
    ref.topics = [ref.topics[1]!, ref.topics[0]!];
    const patched = applyChanges(PROJECT, plan(edited).changes);
    const before = PROJECT["index.rst"]!.split("\n");
    const after = patched["index.rst"]!.split("\n");
    expect(after.length).toBe(before.length);
    const differing = before
      .map((l, i) => (l === after[i] ? null : l.trim()))
      .filter((l): l is string => l !== null)
      .sort();
    expect(differing).toEqual(["reference/api", "reference/cli"]);
  });
});

describe("a cross-file move REWRITES the entry for its new document", () => {
  it("moves a nested page up to a root card, rewriting the target", () => {
    const { doc } = parse();
    const edited = clone(doc);
    const guides = edited.sections[0]!.topics[0]!;
    const install = guides.children[0]!;
    guides.children = guides.children.slice(1);
    edited.sections[1]!.topics.push(install);

    const { changes } = plan(edited);
    // Two files: the source block loses a line, the destination gains one.
    expect(changes.map((c) => (c.kind === "edit" ? c.path : "")).sort()).toEqual([
      "guides/index.rst",
      "index.rst",
    ]);
    const root = changes.find((c) => c.kind === "edit" && c.path === "index.rst")!;
    // `install` was written relative to `guides/index`; from `index` the
    // same document is `guides/install`.
    expect(root.newContent).toContain("guides/install");
    expect(root.newContent).not.toMatch(/^\s+install$/m);
  });

  it("survives simulation, which is what proves the rewrite correct", () => {
    const { doc } = parse();
    const edited = clone(doc);
    const guides = edited.sections[0]!.topics[0]!;
    const install = guides.children[0]!;
    guides.children = guides.children.slice(1);
    edited.sections[1]!.topics.push(install);
    const { changes } = plan(edited);
    expect(simulatePlan(sphinxAdapter, PROJECT, edited, order(edited), changes).ok).toBe(
      true,
    );
  });

  it("moves a root page DOWN into a nested host, rewriting the other way", () => {
    const { doc } = parse();
    const edited = clone(doc);
    const api = edited.sections[1]!.topics[0]!;
    edited.sections[1]!.topics = edited.sections[1]!.topics.slice(1);
    edited.sections[0]!.topics[0]!.children.push(api);

    const { changes } = plan(edited);
    const nested = changes.find(
      (c) => c.kind === "edit" && c.path === "guides/index.rst",
    )!;
    // From `guides/index`, the document `reference/api` is `../reference/api`.
    expect(nested.newContent).toContain("../reference/api");
    expect(simulatePlan(sphinxAdapter, PROJECT, edited, order(edited), changes).ok).toBe(
      true,
    );
  });
});

describe("idempotence: replanning an applied plan yields nothing", () => {
  it("returns [] the second time round", () => {
    const { doc } = parse();
    const edited = clone(doc);
    const ref = edited.sections[1]!;
    ref.topics = [ref.topics[1]!, ref.topics[0]!];
    const patched = applyChanges(PROJECT, plan(edited).changes);
    const again = sphinxAdapter.parse(patched, "proj");
    expect(
      sphinxAdapter.planChanges!(patched, again.doc, order(again.doc)).changes,
    ).toEqual([]);
  });
});

describe("the refusal set blocks a plan rather than writing a wrong one", () => {
  const blocking = (files: FilesSnapshot, mutate: (d: TocDocument) => void) => {
    const { doc } = sphinxAdapter.parse(files, "p");
    const edited = clone(doc);
    mutate(edited);
    const result = sphinxAdapter.planChanges!(files, edited, order(edited));
    return result.warnings.filter((w) => w.blocking).map((w) => w.kind);
  };

  it("refuses when a MyST declaration is present", () => {
    const myst: FilesSnapshot = {
      ...PROJECT,
      "conf.py": `${CONF}extensions = ["myst_parser"]\n`,
    };
    const kinds = blocking(myst, (d) => {
      const ref = d.sections[1]!;
      ref.topics = [ref.topics[1]!, ref.topics[0]!];
    });
    expect(kinds).toContain("myst-unsupported");
  });

  it("refuses to touch a host with no navTail", () => {
    const midFile: FilesSnapshot = {
      ...PROJECT,
      "guides/index.rst": [
        "Guides",
        "======",
        "",
        ".. toctree::",
        "",
        "   install",
        "   usage",
        "",
        "Trailing prose the region cannot own.",
        "",
      ].join("\n"),
    };
    const kinds = blocking(midFile, (d) => {
      const guides = d.sections[0]!.topics[0]!;
      guides.children = [guides.children[1]!, guides.children[0]!];
    });
    expect(kinds).toContain("region-unavailable");
  });

  it("lets an unaffected host stay unplanned while another is refused", () => {
    // The COMPLEMENT: a refusal keyed on the wrong thing would block a
    // document merely for CONTAINING a mid-file carrier.
    const midFile: FilesSnapshot = {
      ...PROJECT,
      "guides/index.rst": `${PROJECT["guides/index.rst"]!}\nTrailing prose.\n`,
    };
    const { doc } = sphinxAdapter.parse(midFile, "p");
    const edited = clone(doc);
    const ref = edited.sections[1]!;
    ref.topics = [ref.topics[1]!, ref.topics[0]!];
    const result = sphinxAdapter.planChanges!(midFile, edited, order(edited));
    expect(result.warnings.filter((w) => w.blocking)).toEqual([]);
    expect(result.changes).toHaveLength(1);
  });

  it("refuses to move a line out of a globbed block", () => {
    const globbed: FilesSnapshot = {
      ...PROJECT,
      "guides/index.rst": [
        "Guides",
        "======",
        "",
        ".. toctree::",
        "   :glob:",
        "",
        "   install",
        "   usage",
        "",
      ].join("\n"),
    };
    const kinds = blocking(globbed, (d) => {
      const guides = d.sections[0]!.topics[0]!;
      guides.children = [guides.children[1]!, guides.children[0]!];
    });
    expect(kinds).toContain("generated-block");
  });
});

describe("a cross-file move is ONE move spread over two files", () => {
  /**
   * GROUP BY DECLARED RELATIONSHIP, NEVER BY INVENTED CATEGORY. Two
   * `edit` changes are halves of one gesture, and only the PLANNER knows
   * that — a dialog inferring it from paths, titles or adjacency would be
   * guessing, and would guess wrong the first time an unrelated file was
   * edited in the same plan.
   *
   * So the relationship is declared. `entryMoves` is NOT `FileChange`'s
   * `move` kind and the names are kept apart deliberately: that one says
   * A FILE goes from one path to another, this one says AN ENTRY goes
   * from one card to another WHILE NO FILE MOVES AT ALL. One word, two
   * referents, which is this project's house failure mode.
   */
  const moveInstallUp = (d: TocDocument) => {
    const guides = d.sections[0]!.topics[0]!;
    const install = guides.children[0]!;
    guides.children = guides.children.slice(1);
    d.sections[1]!.topics.push(install);
  };

  it("declares the move, its cards, and the files it spans", () => {
    const { doc } = parse();
    const edited = clone(doc);
    moveInstallUp(edited);
    const { entryMoves } = plan(edited);
    expect(entryMoves).toHaveLength(1);
    expect(entryMoves![0]).toMatchObject({
      title: "Install",
      from: "Guides",
      to: "Reference",
    });
    expect(entryMoves![0]!.paths.sort()).toEqual(["guides/index.rst", "index.rst"]);
  });

  it("declares NOTHING for a reorder inside one block", () => {
    // The complement. A net is pinned only when both its answers are:
    // a producer that emitted a move for every plan would pass the test
    // above and be useless.
    const { doc } = parse();
    const edited = clone(doc);
    const ref = edited.sections[1]!;
    ref.topics = [ref.topics[1]!, ref.topics[0]!];
    expect(plan(edited).entryMoves ?? []).toEqual([]);
  });

  it("names no file that the plan does not change", () => {
    const { doc } = parse();
    const edited = clone(doc);
    moveInstallUp(edited);
    const { changes, entryMoves } = plan(edited);
    const touched = new Set(changes.map((c) => (c.kind === "edit" ? c.path : "")));
    for (const path of entryMoves![0]!.paths) expect(touched.has(path)).toBe(true);
  });
});

describe("a page that hosts no toctree is not a place to drop a row", () => {
  /**
   * A NEW INPUT SPECIES, and it arrived as a CRASH. `distribute` maps its
   * output over the host's blocks, so a host with ZERO blocks produced an
   * empty array and the first assignment threw
   * `Cannot read properties of undefined`.
   *
   * Found by the e2e, not by the unit suite — the drop landed on a ROW
   * inside the destination card rather than on the card itself, which is
   * an ordinary thing for a pointer to do and a shape no unit fixture had
   * constructed. That is the paint gate earning its place: the planner
   * was green on every structure I thought to write down.
   *
   * The right answer is a refusal, not a repair. Adding a page under
   * `reference/api` means giving `api.rst` a toctree it does not have,
   * and creating blocks is not something moves-only write-back does.
   */
  const dropUnderLeaf = (d: TocDocument) => {
    const guides = d.sections[0]!.topics[0]!;
    const install = guides.children[0]!;
    guides.children = guides.children.slice(1);
    d.sections[1]!.topics[0]!.children.push(install);
  };

  it("refuses instead of throwing", () => {
    const { doc } = parse();
    const edited = clone(doc);
    dropUnderLeaf(edited);
    const result = plan(edited);
    expect(result.warnings.filter((w) => w.blocking).map((w) => w.kind)).toEqual([
      "no-toctree-in-target",
    ]);
    expect(result.changes).toEqual([]);
  });

  it("names the page, so the reason is actionable", () => {
    const { doc } = parse();
    const edited = clone(doc);
    dropUnderLeaf(edited);
    expect(plan(edited).warnings[0]!.detail).toContain("reference/api.rst");
  });

  it("still allows the SAME row onto the card itself", () => {
    // The complement, and the distinction the refusal turns on: the card
    // is backed by `index.rst`, which has a toctree; the row inside it is
    // backed by `reference/api.rst`, which does not.
    const { doc } = parse();
    const edited = clone(doc);
    const guides = edited.sections[0]!.topics[0]!;
    const install = guides.children[0]!;
    guides.children = guides.children.slice(1);
    edited.sections[1]!.topics.push(install);
    const result = plan(edited);
    expect(result.warnings.filter((w) => w.blocking)).toEqual([]);
    expect(result.changes).toHaveLength(2);
  });
});

describe("reordering cards is refused BY NAME, not by simulation", () => {
  /**
   * A Sphinx card IS a toctree block in the root document, and a block's
   * CAPTION stays with the block. So dragging card B above card A does
   * not move the blocks — it swaps their contents, and "Guides" ends up
   * listing the reference pages.
   *
   * Simulation caught that, which is why it was never going to be
   * written to disk. But it caught it as *"re-parsing the planned
   * changes does not reproduce the edited structure"* — a sentence that
   * names no cause and suggests no action, arriving after the user has
   * done the work. That is the deferred lie in its purest form: the app
   * knew at drag time and said so at Review, in the wrong words.
   */
  const twoCards: FilesSnapshot = {
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
    "guides/index.rst": "Guides\n======\n\nbody\n",
    "reference/api.rst": "API\n===\n\nbody\n",
  };

  it("names the cause instead of writing a swap", () => {
    const { doc } = sphinxAdapter.parse(twoCards, "p");
    const swapped = [doc.sections[1]!.id, doc.sections[0]!.id];
    const result = sphinxAdapter.planChanges!(twoCards, doc, swapped);
    expect(result.warnings.filter((w) => w.blocking).map((w) => w.kind)).toEqual([
      "card-reordered",
    ]);
    expect(result.changes).toEqual([]);
    expect(result.warnings[0]!.detail).toMatch(/caption|order|stays/i);
  });

  it("still plans normally in the DECLARED order", () => {
    // The complement, and the one that would go unnoticed: a check
    // comparing the wrong two things refuses every plan, and every other
    // test in this file passes a document in declared order.
    const { doc } = sphinxAdapter.parse(twoCards, "p");
    const edited = clone(doc);
    edited.sections[0]!.topics = [];
    edited.sections[1]!.topics.push(doc.sections[0]!.topics[0]!);
    const result = sphinxAdapter.planChanges!(
      twoCards,
      edited,
      edited.sections.map((s) => s.id),
    );
    expect(result.warnings.filter((w) => w.blocking)).toEqual([]);
    expect(result.changes).toHaveLength(1);
  });
});
