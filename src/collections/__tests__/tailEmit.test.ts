/**
 * Re-emitting a `navTail` region with a new entry set (docs/19 step 3).
 *
 * This is the only place phase 2 writes bytes into a `.rst` file, so the
 * governing rule is stated as an absence: EVERYTHING THAT IS NOT AN ENTRY
 * LINE IS COPIED VERBATIM. Markers, option lines, section headings,
 * comments, blank separators, the file's terminator — the region is
 * mostly nav, not entirely nav, and the difference is bytes we do not own.
 *
 * DISCOVERED BY MEASUREMENT, not by the note: 48 blocks across the four
 * corpora separate groups of entries with INTERIOR BLANK LINES, and two
 * of them are root documents — godot's `index.rst` (25 entries in two
 * groups) and cpython's `contents.rst` (16 in two). A re-emitter that
 * wrote entries contiguously would delete those separators: silent byte
 * corruption in the reference corpus's own nav, the same class step 1
 * fixed for tabs.
 *
 * THE SEPARATOR RULE, settled here because it is a byte-writing choice
 * the note does not cover: a blank line inside a block OPENS A GROUP, so
 * it is anchored to the entry that FOLLOWS it and travels with that entry
 * within its block. An entry that leaves the block does not take the
 * separator with it, and a separator never lands first in a block. For an
 * unchanged block the whole question is moot — the lines are copied — so
 * the fixpoint law is byte-identical by construction rather than by care.
 */

import { describe, expect, it } from "vitest";
import { emitRegion, navTailOf } from "../navTail";
import { scanToctrees } from "../rst";

const lines = (...l: string[]) => l.join("\n");

/** A region with two blocks, a heading between them, and a group split. */
const HOST = lines(
  ".. toctree::",
  "   :maxdepth: 2",
  "   :caption: Guides",
  "",
  "   alpha",
  "   beta",
  "",
  "   gamma",
  "",
  "Reference",
  "---------",
  "",
  ".. toctree::",
  "",
  "   delta",
  "",
);

const regionOf = (text: string) => {
  const r = navTailOf(text);
  if (!r.ok) throw new Error(`no region: ${r.reason}`);
  return r;
};

describe("an unchanged region re-emits byte-identically", () => {
  it("is the identity when every block keeps its entries", () => {
    const region = regionOf(HOST);
    const same = emitRegion(HOST, [["alpha", "beta", "gamma"], ["delta"]]);
    expect(same).toBe(region.text);
  });

  it("holds for every vendored fixture that has a region", () => {
    const rst = import.meta.glob("./fixtures/sphinx*/**/*.rst", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    let checked = 0;
    for (const [key, text] of Object.entries(rst)) {
      const region = navTailOf(text);
      if (!region.ok) continue;
      // IN-REGION blocks only: a carrier whose sequence starts at its
      // second block keeps the first one out of reach entirely.
      const blocks = scanToctrees(text)
        .slice(region.fromBlock)
        .map((b) => b.entries.map((e) => e.raw));
      expect(emitRegion(text, blocks), key).toBe(region.text);
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
  });
});

describe("only entry lines change", () => {
  it("reorders within a block and touches nothing else", () => {
    const out = emitRegion(HOST, [["beta", "alpha", "gamma"], ["delta"]]);
    expect(out).toContain("   :maxdepth: 2");
    expect(out).toContain("   :caption: Guides");
    expect(out).toContain("Reference");
    expect(out).toContain("---------");
    expect(out.indexOf("   beta")).toBeLessThan(out.indexOf("   alpha"));
  });

  it("keeps the interior blank that separates the groups", () => {
    const out = emitRegion(HOST, [["beta", "alpha", "gamma"], ["delta"]]);
    // `gamma` opened the second group and still does.
    expect(out).toContain(lines("   alpha", "", "   gamma"));
  });

  it("carries a separator with the entry that owns it", () => {
    // `gamma` moves to the front of its block; the group it opens moves
    // with it, and no blank is left leading the block.
    const out = emitRegion(HOST, [["gamma", "alpha", "beta"], ["delta"]]);
    const body = out.split("\n");
    const first = body.indexOf("   gamma");
    expect(body[first - 1]).toBe("");
    expect(body[first - 2]).toBe("   :caption: Guides");
  });

  it("drops a separator whose entry left the block", () => {
    const out = emitRegion(HOST, [
      ["alpha", "beta"],
      ["gamma", "delta"],
    ]);
    // The separator gamma opened is gone with it, and exactly one blank
    // — the one that always separated the block from the heading below —
    // remains. Asserted as the whole sequence, because "contains a blank"
    // cannot tell one blank from two.
    expect(out).toContain(lines("   alpha", "   beta", "", "Reference"));
  });

  it("adds an entry at its block's own indent, tabs included", () => {
    const tabbed = lines(".. toctree::", "\t:maxdepth: 1", "", "\talpha", "");
    const out = emitRegion(tabbed, [["alpha", "beta"]]);
    expect(out).toBe(
      lines(".. toctree::", "\t:maxdepth: 1", "", "\talpha", "\tbeta", ""),
    );
  });

  it("removes an entry without disturbing the option run", () => {
    const out = emitRegion(HOST, [["alpha"], ["delta"]]);
    expect(out).toContain(lines("   :caption: Guides", "", "   alpha", ""));
    expect(out).not.toContain("beta");
  });
});

describe("the file's own conventions survive", () => {
  it("preserves CRLF line endings on every rewritten line", () => {
    const crlf = ".. toctree::\r\n\r\n   alpha\r\n   beta\r\n";
    const out = emitRegion(crlf, [["beta", "alpha"]]);
    expect(out).toBe(".. toctree::\r\n\r\n   beta\r\n   alpha\r\n");
  });

  it("preserves a missing trailing newline", () => {
    const bare = ".. toctree::\n\n   alpha\n   beta";
    const out = emitRegion(bare, [["beta", "alpha"]]);
    expect(out).toBe(".. toctree::\n\n   beta\n   alpha");
    expect(out.endsWith("\n")).toBe(false);
  });

  it("writes an explicit-title entry back verbatim", () => {
    const titled = lines(".. toctree::", "", "   Get Started <intro>", "   guide", "");
    const out = emitRegion(titled, [["guide", "Get Started <intro>"]]);
    expect(out).toBe(lines(".. toctree::", "", "   guide", "   Get Started <intro>", ""));
  });
});

describe("a separator is BYTES, not a flag", () => {
  /**
   * Found on the corpus, not in a fixture, and it is step 1's lesson
   * again one layer up: a boolean "is there a blank before this entry?"
   * cannot say HOW MANY there were, so two blank lines came back as one.
   *
   * The subject is real — `arch/arm/index.rst` in the kernel puts a
   * double blank after `pxa/mfp` — and it was the ONLY file of 424
   * regions across four corpora that failed byte-identical re-emission.
   * A fixture set would not have contained it; the corpus did.
   */
  it("preserves a DOUBLE blank between entries", () => {
    const text = lines(".. toctree::", "", "   alpha", "", "", "   beta", "");
    const out = emitRegion(text, [["alpha", "beta"]]);
    expect(out).toBe(text);
  });

  it("carries both blanks when their entry moves within the block", () => {
    const text = lines(".. toctree::", "", "   alpha", "", "", "   beta", "   gamma", "");
    const out = emitRegion(text, [["alpha", "gamma", "beta"]]);
    expect(out).toBe(
      lines(".. toctree::", "", "   alpha", "   gamma", "", "", "   beta", ""),
    );
  });
});

describe("a separator belongs to its BLOCK, not to its entry's journey", () => {
  /**
   * SETTLE ITEM, stated and tested rather than left implicit: an interior
   * blank is anchored to the entry that follows it, so does it TRAVEL
   * with that entry when the entry moves?
   *
   * Within its own block, yes — that is what "anchored" means, and a
   * reorder that left the group markers behind would scramble a grouping
   * the author chose.
   *
   * Out of the block, NO. A separator is a fact about how THIS block is
   * grouped; carrying it into another block — or another file — would
   * import a grouping decision that block's author never made, and would
   * do it invisibly, one blank line at a time. So an entry arrives
   * plain, and the destination's own grouping is untouched.
   */
  const grouped = lines(".. toctree::", "", "   alpha", "", "   beta", "   gamma", "");
  const plain = lines(".. toctree::", "", "   gamma", "");

  it("keeps the separator when its entry moves WITHIN the block", () => {
    // `beta` opens the second group. Moved to the end, the group opens
    // there instead — the marker follows its entry rather than staying
    // at a line number.
    const out = emitRegion(grouped, [["alpha", "gamma", "beta"]]);
    expect(out).toBe(
      lines(".. toctree::", "", "   alpha", "   gamma", "", "   beta", ""),
    );
  });

  it("drops a separator that would land FIRST in a block", () => {
    // A leading blank between the options and the first entry is the
    // option run's, not an entry's, and emitting a second one would open
    // a group with nothing above it.
    const out = emitRegion(grouped, [["beta", "alpha", "gamma"]]);
    expect(out).toBe(lines(".. toctree::", "", "   beta", "   alpha", "   gamma", ""));
  });

  it("does NOT carry a separator into another block", () => {
    // `beta` opened a group where it came from; it arrives plain.
    const out = emitRegion(plain, [["gamma", "beta"]]);
    expect(out).toBe(lines(".. toctree::", "", "   gamma", "   beta", ""));
  });

  it("leaves the source block's remaining grouping alone", () => {
    const out = emitRegion(grouped, [["alpha", "gamma"]]);
    expect(out).toBe(lines(".. toctree::", "", "   alpha", "   gamma", ""));
  });
});
