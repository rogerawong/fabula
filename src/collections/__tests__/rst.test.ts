/**
 * reStructuredText scanner conformance, against the VENDORED REAL FILES
 * from godot-docs (docs/12). The counts asserted here are the corpus
 * survey's numbers, so a scanner regression shows up as a disagreement
 * with the document that justified the design.
 *
 * The load-bearing test is the last one: re-emitting every entry at its
 * block's own indent must reproduce the source line byte-for-byte. That
 * is what makes phase-1 serialization moves-only by construction.
 */

import { describe, expect, it } from "vitest";
import {
  documentTitle,
  emitEntry,
  resolveDocname,
  scanToctrees,
  isGlobbed,
  type ToctreeBlock,
} from "../rst";

const raw = import.meta.glob("./fixtures/sphinx/**/*.rst", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function fixture(name: string): string {
  const key = `./fixtures/sphinx/${name}`;
  const text = raw[key];
  if (text === undefined) throw new Error(`missing fixture ${name}`);
  return text;
}

const captionsOf = (blocks: ToctreeBlock[]) =>
  blocks.map((b) =>
    b.options
      .find((o) => o.startsWith(":caption:"))
      ?.slice(9)
      .trim(),
  );

describe("scanToctrees — root index", () => {
  const blocks = scanToctrees(fixture("index.rst"));

  it("finds the six captioned sidebar groups", () => {
    expect(blocks).toHaveLength(6);
    expect(captionsOf(blocks)).toEqual([
      "About",
      "Getting started",
      "Manual",
      "Engine details",
      "Community",
      "Class reference",
    ]);
  });

  it("records entry counts matching the survey", () => {
    expect(blocks.map((b) => b.entries.length)).toEqual([7, 4, 25, 6, 4, 1]);
  });

  it("records options verbatim and in source order", () => {
    expect(blocks[0]!.options).toEqual([
      ":hidden:",
      ":maxdepth: 1",
      ":caption: About",
      ":name: sec-general",
    ]);
  });

  it("uses a 3-space content indent", () => {
    expect(blocks.map((b) => b.contentIndent)).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it("does not mistake a comment for a directive", () => {
    // The root index carries `.. Below is the main table-of-content tree…`
    // and `.. Sections below are split into two groups…` between blocks.
    expect(fixture("index.rst")).toContain(".. Below is the main table-of-content");
    expect(blocks).toHaveLength(6);
  });

  it("classifies every entry as a movable doc", () => {
    expect(blocks.flatMap((b) => b.entries).every((e) => e.kind === "doc")).toBe(true);
    expect(blocks[0]!.entries[0]!.target).toBe("about/introduction");
  });
});

describe("scanToctrees — per-block indent is never normalized", () => {
  it("reads 4 spaces in tutorials/index.rst", () => {
    const blocks = scanToctrees(fixture("tutorials/index.rst"));
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.contentIndent)).toEqual([4, 4]);
    expect(captionsOf(blocks)).toEqual([undefined, undefined]);
  });

  it("reads 4 spaces in tutorials/io/index.rst but 3 in tutorials/2d/index.rst", () => {
    // Both live under tutorials/ — indent is a per-block property.
    expect(scanToctrees(fixture("tutorials/io/index.rst"))[0]!.contentIndent).toBe(4);
    expect(scanToctrees(fixture("tutorials/2d/index.rst"))[0]!.contentIndent).toBe(3);
  });
});

describe("scanToctrees — entry shapes", () => {
  const blocks = scanToctrees(fixture("synthetic-explicit-titles.rst"));

  it("splits the explicit-title form", () => {
    const entry = blocks[0]!.entries[0]!;
    expect(entry.title).toBe("Getting started with 2D");
    expect(entry.target).toBe("tutorials/2d/index");
    expect(entry.kind).toBe("doc");
  });

  it("leaves a plain entry untitled", () => {
    const entry = blocks[0]!.entries[1]!;
    expect(entry.title).toBeUndefined();
    expect(entry.target).toBe("about/introduction");
  });

  it("classifies self and external URLs as locked kinds", () => {
    const kinds = blocks[1]!.entries.map((e) => e.kind);
    expect(kinds).toEqual(["self", "external", "external", "doc"]);
  });

  // THE SPLIT docs/19 asks for, and this test used to assert the defect:
  // "treats every entry in a :glob: block as globbed, wildcard or not"
  // was a true description of the code and a false claim about the
  // documents. Two referents under one name — "this LINE contains a
  // glob" and "this line LIVES IN a globbing block" — and only the
  // second is true of all of them.
  //
  // A block lock is ENFORCEMENT; an entry kind is LABELING. Whether a
  // line may be rewritten belongs to its BLOCK, which generates its
  // list; what a line IS belongs to the line.
  it("labels an entry by the LINE, not by the block it sits in", () => {
    const globBlocks = scanToctrees(fixture("synthetic-glob.rst"));
    expect(globBlocks[0]!.entries.map((e) => e.kind)).toEqual(["glob", "glob"]);
    // `about/introduction` is a plain docname and says so, even though
    // its block is globbed and therefore uneditable.
    expect(globBlocks[1]!.entries[0]!.target).toBe("about/introduction");
    expect(globBlocks[1]!.entries[0]!.kind).toBe("doc");
    expect(globBlocks[1]!.entries[1]!.kind).toBe("glob");
  });

  it("carries the enforcement on the block", () => {
    const globBlocks = scanToctrees(fixture("synthetic-glob.rst"));
    expect(globBlocks.map(isGlobbed)).toEqual([true, true]);
    expect(isGlobbed(scanToctrees(fixture("index.rst"))[0]!)).toBe(false);
  });
});

describe("documentTitle", () => {
  it("skips a field list, comments and a label", () => {
    expect(documentTitle(fixture("about/introduction.rst"))).toBe("Introduction");
    expect(documentTitle(fixture("getting_started/introduction/index.rst"))).toBe(
      "Introduction",
    );
  });

  it("finds a title that follows prose", () => {
    // tutorials/2d/index.rst opens with three paragraphs before `2D`.
    expect(documentTitle(fixture("tutorials/2d/index.rst"))).toBe("2D");
  });

  it("reads an :orphan: document's title", () => {
    expect(documentTitle(fixture("tutorials/index.rst"))).toBe("Tutorials");
  });

  it("handles a short underline equal to the title length", () => {
    expect(documentTitle("AB\n==\n\nbody\n")).toBe("AB");
  });

  it("handles the overline form", () => {
    expect(documentTitle("====\nHi\n====\n")).toBe("Hi");
  });

  it("returns undefined when there is no section title", () => {
    expect(documentTitle(":orphan:\n\njust prose, no heading\n")).toBeUndefined();
  });
});

describe("resolveDocname", () => {
  it("resolves relative to the referring document's directory", () => {
    expect(resolveDocname("canvas_layers", "tutorials/2d/index")).toBe(
      "tutorials/2d/canvas_layers",
    );
    expect(resolveDocname("2d/index", "tutorials/index")).toBe("tutorials/2d/index");
  });

  it("treats a leading slash as source-root absolute", () => {
    expect(resolveDocname("/about/introduction", "tutorials/2d/index")).toBe(
      "about/introduction",
    );
  });

  it("collapses . and .. segments", () => {
    expect(resolveDocname("../io/index", "tutorials/2d/index")).toBe(
      "tutorials/io/index",
    );
  });

  it("resolves against a root-level document", () => {
    expect(resolveDocname("about/introduction", "index")).toBe("about/introduction");
  });
});

describe("emitEntry reproduces the source byte-for-byte", () => {
  it("holds for every entry of every vendored fixture", () => {
    const checked: string[] = [];
    for (const [key, text] of Object.entries(raw)) {
      const lines = text.split("\n");
      for (const block of scanToctrees(text)) {
        for (const entry of block.entries) {
          expect(emitEntry(block, entry), `${key}:${entry.line + 1}`).toBe(
            lines[entry.line],
          );
          checked.push(`${key}:${entry.line}`);
        }
      }
    }
    // Guard against the assertion silently covering nothing.
    expect(checked.length).toBeGreaterThan(60);
  });
});

// ── Spec-derived pass ───────────────────────────────────────
// Written from docs/12's claims and RST semantics rather than from
// rst.ts, to cover what tests-written-after-the-code are biased away
// from: cases the implementation never considered.

describe("corpus fidelity — the survey claims docs/12 rests on", () => {
  const corpus = Object.entries(raw).filter(([k]) => !k.includes("/synthetic-"));
  const blocksOf = (text: string) => scanToctrees(text);

  it("gives every vendored block a :maxdepth: 1 and a :name:", () => {
    for (const [key, text] of corpus) {
      for (const block of blocksOf(text)) {
        expect(block.options, key).toContain(":maxdepth: 1");
        expect(
          block.options.some((o) => o.startsWith(":name:")),
          key,
        ).toBe(true);
      }
    }
  });

  it("finds :caption: and :hidden: only in the root index", () => {
    for (const [key, text] of corpus) {
      for (const block of blocksOf(text)) {
        const decorated = block.options.some(
          (o) => o.startsWith(":caption:") || o.startsWith(":hidden:"),
        );
        expect(decorated, key).toBe(key.endsWith("/sphinx/index.rst"));
      }
    }
  });

  it("contains no explicit-title, external, glob or self entries", () => {
    // The corpus is 1678 plain docnames — which is why renames and locked
    // nodes get synthetic fixtures instead of claimed coverage.
    for (const [key, text] of corpus) {
      for (const block of blocksOf(text)) {
        for (const entry of block.entries) {
          expect(entry.kind, `${key}:${entry.line + 1}`).toBe("doc");
          expect(entry.title, `${key}:${entry.line + 1}`).toBeUndefined();
        }
      }
    }
  });
});

describe("block boundaries", () => {
  it("does not let entries bleed past the heading that follows a block", () => {
    // tutorials/index.rst: two blocks under separate H2s ("General",
    // "Topics"). A scanner that runs to the next directive would merge them.
    const [general, topics] = scanToctrees(fixture("tutorials/index.rst"));
    expect(general!.entries.map((e) => e.target)).toEqual([
      "best_practices/index",
      "editor/index",
      "migrating/index",
      "troubleshooting",
    ]);
    expect(topics!.entries.map((e) => e.target)).toContain("2d/index");
    expect(general!.entries.map((e) => e.target)).not.toContain("2d/index");
  });

  it("treats an option-shaped line after the entries as an entry", () => {
    // RST options come first; once content starts, `:name:` is content.
    const [block] = scanToctrees(
      ".. toctree::\n   :maxdepth: 1\n\n   intro\n   :name: x\n",
    );
    expect(block!.options).toEqual([":maxdepth: 1"]);
    expect(block!.entries.map((e) => e.raw)).toEqual(["intro", ":name: x"]);
  });

  it("round-trips a block that has options but no entries", () => {
    const [block] = scanToctrees(".. toctree::\n   :maxdepth: 1\n   :glob:\n");
    expect(block!.entries).toEqual([]);
    expect(block!.options).toEqual([":maxdepth: 1", ":glob:"]);
  });

  it("scans a toctree nested inside another directive body", () => {
    const text = ".. only:: html\n\n   .. toctree::\n      :maxdepth: 1\n\n      intro\n";
    const [block] = scanToctrees(text);
    expect(block!.markerIndent).toBe(3);
    expect(block!.contentIndent).toBe(6);
    expect(block!.entries.map((e) => e.target)).toEqual(["intro"]);
  });

  it("does not match a directive that carries an argument", () => {
    expect(scanToctrees(".. toctree:: notanoption\n\n   intro\n")).toEqual([]);
  });
});

describe("CRLF sources", () => {
  // Fixtures are `-text` in .gitattributes precisely because a format pass
  // once LF-normalized a CRLF fixture. A Windows-authored Sphinx project is
  // an ordinary input, and byte-identical re-emission has to survive it.
  const CRLF = ".. toctree::\r\n   :maxdepth: 1\r\n\r\n   intro\r\n   guide\r\n";

  it("reads entries without carrying the carriage return into the target", () => {
    const [block] = scanToctrees(CRLF);
    expect(block!.entries.map((e) => e.target)).toEqual(["intro", "guide"]);
  });

  it("re-emits CRLF entry lines byte-for-byte", () => {
    const lines = CRLF.split("\n");
    const [block] = scanToctrees(CRLF);
    for (const entry of block!.entries) {
      expect(emitEntry(block!, entry)).toBe(lines[entry.line]);
    }
  });
});

describe("source-suffix stripping (Sphinx compatibility)", () => {
  // Sphinx strips a configured source suffix from an entry before
  // resolving it. `TocTree.parse_content`, sphinx-doc/sphinx master:
  //
  //     # remove suffixes (backwards compatibility)
  //     for suffix in suffixes:
  //         if docname.endswith(suffix):
  //             docname = docname.removesuffix(suffix)
  //             break
  //
  // CPython's documentation writes EVERY entry that way — 526 of 526,
  // measured — so a resolver that does not strip resolves
  // `library/index.rst` to a file `library/index.rst.rst`, finds
  // nothing, and renders the whole corpus as `missing` rows.
  it("strips the configured suffix before resolving", () => {
    expect(resolveDocname("library/index.rst", "contents", [".rst"])).toBe(
      "library/index",
    );
  });

  it("strips it on an ABSOLUTE entry too", () => {
    expect(resolveDocname("/dev/index.rst", "a/b/c", [".rst"])).toBe("dev/index");
  });

  it("strips only a TRAILING suffix, never one inside the path", () => {
    // `.rst` occurring mid-path is part of the name, not a suffix.
    expect(resolveDocname("guides/rst.tips", "index", [".rst"])).toBe("guides/rst.tips");
  });

  it("strips the FIRST matching suffix and stops, as Sphinx does", () => {
    expect(resolveDocname("page.txt", "index", [".rst", ".txt"])).toBe("page");
  });

  it("leaves a suffixless entry alone", () => {
    expect(resolveDocname("about/introduction", "index", [".rst"])).toBe(
      "about/introduction",
    );
  });

  it("defaults to Sphinx's own default suffix when none is given", () => {
    // Sphinx's default source_suffix is {'.rst': 'restructuredtext'}.
    expect(resolveDocname("library/index.rst", "contents")).toBe("library/index");
  });
});
