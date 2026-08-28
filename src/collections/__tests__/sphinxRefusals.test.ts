/**
 * The Sphinx refusal set (docs/19 step 3) and the conflation it fixes.
 *
 * A BLOCK LOCK IS ENFORCEMENT; AN ENTRY KIND IS LABELING. Whether a line
 * may be rewritten belongs to its BLOCK — a globbing block builds its
 * list from patterns, so no line in it is one the planner may touch, and
 * that refusal is answered once, for the block. What a line IS belongs to
 * the line, and exists to tell the reader what they are looking at.
 *
 * Collapsing them made the block's enforcement wear the line's
 * vocabulary: a plain docname sitting in a `:glob:` block rendered with
 * an asterisk, in monospace, badged "Pattern" — a description false about
 * it, standing in for a refusal that was true of its block.
 */

import { describe, expect, it } from "vitest";
import { sphinxAdapter } from "../adapters/sphinx";
import type { FilesSnapshot } from "../types";
import type { Topic } from "@/model/types";

const CONF = 'master_doc = "index"\nsource_suffix = ".rst"\n';

const rowsOf = (files: FilesSnapshot): Topic[] => {
  const { doc } = sphinxAdapter.parse(files, "t");
  return doc.sections.flatMap((s) => s.topics);
};

describe("a globbed block locks its lines without relabelling them", () => {
  const globbed: FilesSnapshot = {
    "conf.py": CONF,
    "index.rst": [
      "Docs",
      "====",
      "",
      ".. toctree::",
      "   :glob:",
      "",
      "   about",
      "   tutorials/*",
      "",
    ].join("\n"),
    "about.rst": "About\n=====\n\nbody\n",
  };

  it("locks a plain docname for its BLOCK's reason, not the line's", () => {
    const [about] = rowsOf(globbed);
    expect(about!.title).toBe("About");
    expect(about!.lock?.kind).toBe("globbed");
  });

  it("still labels an actual wildcard a pattern", () => {
    const rows = rowsOf(globbed);
    expect(rows[1]!.lock?.kind).toBe("pattern");
  });

  it("leaves an identical docname unlocked outside a globbed block", () => {
    // The COMPLEMENT. A net is pinned only when both its answers are:
    // without this, a predicate that locked everything would pass.
    const plain: FilesSnapshot = {
      ...globbed,
      "index.rst": globbed["index.rst"]!.replace("   :glob:\n", ""),
    };
    const [about] = rowsOf(plain);
    expect(about!.title).toBe("About");
    expect(about!.lock).toBeUndefined();
  });

  it("reads a document behind a globbed entry rather than hiding it", () => {
    // Shape fidelity: the entry is uneditable, not invisible, and its
    // real title is a fact about the corpus the reader is owed.
    const [about] = rowsOf(globbed);
    expect(about!.path).toBe("about");
    expect(about!.titleDerived).toBe(false);
  });
});

describe("MyST is recognized and deferred, never silently unsupported", () => {
  /**
   * ZERO CORPUS COVERAGE, which makes this a caveat rather than a result:
   * the recognizer is verified synthetically because none of the four
   * corpora contains a MyST toctree.
   *
   * IT MUST NOT KEY ON `.md` PRESENCE. godot has 8 `.md` files and zero
   * MyST, so that heuristic false-positives on the ONE corpus of the four
   * that has any markdown at all — the reference corpus, refusing itself.
   * The three real signals are a `{toctree}` fence, `myst_parser` in
   * `extensions`, and `.md` in `source_suffix`.
   */
  const evidenceKinds = (files: FilesSnapshot): string[] =>
    sphinxAdapter.parse(files, "t").evidence?.map((e) => e.kind) ?? [];

  const base: FilesSnapshot = {
    "conf.py": CONF,
    "index.rst": "Docs\n====\n\n.. toctree::\n\n   about\n",
    "about.rst": "About\n=====\n\nbody\n",
  };

  it("does NOT fire on markdown files alone", () => {
    // The complement, and the one that matters: godot's shape.
    const withMd: FilesSnapshot = { ...base, "notes.md": "# Notes\n" };
    expect(evidenceKinds(withMd)).not.toContain("myst-unsupported");
  });

  it("fires on a {toctree} fence", () => {
    const fenced: FilesSnapshot = {
      ...base,
      "guide.md": "# Guide\n\n```{toctree}\n:maxdepth: 1\n\nintro\n```\n",
    };
    expect(evidenceKinds(fenced)).toContain("myst-unsupported");
  });

  it("fires on myst_parser in extensions", () => {
    const ext: FilesSnapshot = {
      ...base,
      "conf.py": `${CONF}extensions = ["myst_parser", "sphinx.ext.autodoc"]\n`,
    };
    expect(evidenceKinds(ext)).toContain("myst-unsupported");
  });

  it("fires on .md in source_suffix", () => {
    const suffix: FilesSnapshot = {
      ...base,
      "conf.py": 'master_doc = "index"\nsource_suffix = [".rst", ".md"]\n',
    };
    expect(evidenceKinds(suffix)).toContain("myst-unsupported");
  });

  it("stays quiet on an ordinary reStructuredText project", () => {
    expect(evidenceKinds(base)).not.toContain("myst-unsupported");
  });
});

describe("an include-routed block is recognized", () => {
  /**
   * ZERO measured across four corpora, in BOTH directions — no carrier is
   * included elsewhere, and no included file hosts a block. Fenced rather
   * than assumed absent: the file of record and the page of display would
   * differ, so a splice would edit bytes that render somewhere else.
   */
  const base: FilesSnapshot = {
    "conf.py": CONF,
    "index.rst": "Docs\n====\n\n.. include:: shared/nav.rst\n",
    "shared/nav.rst": ".. toctree::\n\n   about\n",
    "about.rst": "About\n=====\n\nbody\n",
  };

  it("names the included carrier", () => {
    const kinds = sphinxAdapter.parse(base, "t").evidence?.map((e) => e.kind) ?? [];
    expect(kinds).toContain("include-routed-nav");
  });

  it("stays quiet when the include names a file that hosts no nav", () => {
    const plain: FilesSnapshot = {
      ...base,
      "shared/nav.rst": "Some shared prose.\n",
    };
    const kinds = sphinxAdapter.parse(plain, "t").evidence?.map((e) => e.kind) ?? [];
    expect(kinds).not.toContain("include-routed-nav");
  });
});

describe("blocks above prose lock, and the carrier still works below", () => {
  /**
   * Q1 as adopted: prose TERMINATES a sequence rather than condemning
   * the carrier. The region is the last maximal heading-interrupted
   * sequence reaching EOF; blocks above the prose are outside it and
   * lock as `outside-region`.
   *
   * That is the boundary law applied to itself rather than a second rule
   * beside it, and it buys back 49 of godot's entries — carriers whose
   * trailing run was always perfectly writable.
   */
  const split: FilesSnapshot = {
    "conf.py": CONF,
    "index.rst": [
      "Docs",
      "====",
      "",
      ".. toctree::",
      "",
      "   above",
      "",
      "Prose between the blocks, which this app does not own.",
      "",
      ".. toctree::",
      "",
      "   below",
      "",
    ].join("\n"),
    "above.rst": "Above\n=====\n\nbody\n",
    "below.rst": "Below\n=====\n\nbody\n",
  };

  it("locks the entries above the prose", () => {
    const { doc } = sphinxAdapter.parse(split, "t");
    const above = doc.sections[0]!.topics[0]!;
    expect(above.title).toBe("Above");
    expect(above.lock?.kind).toBe("outside-region");
  });

  it("leaves the entries below it unlocked", () => {
    // The complement. A predicate that locked the whole carrier would
    // pass the assertion above and undo the ruling.
    const { doc } = sphinxAdapter.parse(split, "t");
    const below = doc.sections[1]!.topics[0]!;
    expect(below.title).toBe("Below");
    expect(below.lock).toBeUndefined();
  });

  it("plans a reorder in the writable run", () => {
    const withTwo: FilesSnapshot = {
      ...split,
      "index.rst": split["index.rst"]!.replace("   below\n", "   below\n   second\n"),
      "second.rst": "Second\n======\n\nbody\n",
    };
    const { doc } = sphinxAdapter.parse(withTwo, "t");
    const edited = structuredClone(doc);
    const card = edited.sections[1]!;
    card.topics = [card.topics[1]!, card.topics[0]!];
    const result = sphinxAdapter.planChanges!(
      withTwo,
      edited,
      edited.sections.map((s) => s.id),
    );
    expect(result.warnings.filter((w) => w.blocking)).toEqual([]);
    expect(result.changes).toHaveLength(1);
  });

  it("refuses a move that would rewrite a line above the prose", () => {
    const { doc } = sphinxAdapter.parse(split, "t");
    const edited = structuredClone(doc);
    const above = edited.sections[0]!.topics[0]!;
    edited.sections[0]!.topics = [];
    edited.sections[1]!.topics.push(above);
    const result = sphinxAdapter.planChanges!(
      split,
      edited,
      edited.sections.map((s) => s.id),
    );
    expect(result.warnings.filter((w) => w.blocking).map((w) => w.kind)).toEqual([
      "outside-region",
    ]);
  });
});
