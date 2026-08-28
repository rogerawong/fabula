/**
 * The `navTail` region — docs/19's mirror of docs/15's `navHead`.
 *
 * Same use, opposite ends: a head is the bytes before the body, a tail is
 * the bytes after it. The note's two-sentence test passes, and it also
 * warns that the regions are NOT the same shape — a head is entirely nav,
 * a tail is MOSTLY nav and must reproduce the rest verbatim.
 *
 * THE BOUNDARY LAW, settled by entry coverage rather than by symmetry:
 * the region runs from the first directive of the trailing SEQUENCE to
 * EOF, where a sequence may be interrupted by a SECTION HEADING. The
 * strict reading — blocks separated only by blanks — leaves 24% of
 * godot's entries editable against 94%, because godot's dominant idiom is
 * `heading + toctree` repeated.
 *
 * Its complement is the refusal set, and the three causes get three names
 * rather than one "no tail": a carrier with no blocks at all, a carrier
 * whose last block does not reach EOF (mid-file), and a carrier with
 * PROSE between blocks of the trailing sequence. Only the third is about
 * bytes the region would have to reproduce without owning them.
 */

import { describe, expect, it } from "vitest";
import { navTailOf, spliceNavTail } from "../navTail";

const lines = (...l: string[]) => l.join("\n");

describe("the region runs from the trailing sequence's first directive to EOF", () => {
  it("takes a lone tail block with its heading left outside", () => {
    const text = lines(
      "Title",
      "=====",
      "",
      "Body prose.",
      "",
      ".. toctree::",
      "",
      "   a",
      "   b",
      "",
    );
    const tail = navTailOf(text);
    expect(tail.ok).toBe(true);
    if (!tail.ok) return;
    expect(tail.text).toBe(lines(".. toctree::", "", "   a", "   b", ""));
    expect(tail.startLine).toBe(5);
  });

  it("EXTENDS ACROSS a section heading — the law's whole point", () => {
    // godot's `tutorials/2d/index.rst` shape: heading, block, heading,
    // block. Under the strict rule only the last block is editable.
    const text = lines(
      "Drivers",
      "=======",
      "",
      "Intro prose.",
      "",
      "Video",
      "-----",
      "",
      ".. toctree::",
      "",
      "   bttv",
      "",
      "Digital TV",
      "----------",
      "",
      ".. toctree::",
      "",
      "   dvb",
      "",
    );
    const tail = navTailOf(text);
    expect(tail.ok).toBe(true);
    if (!tail.ok) return;
    // Starts at the FIRST block of the sequence, not the last.
    expect(tail.startLine).toBe(8);
    expect(tail.text.startsWith(".. toctree::")).toBe(true);
    expect(tail.text).toContain("bttv");
    expect(tail.text).toContain("dvb");
    // The heading between them is INSIDE the region, owned as a label
    // and reproduced verbatim.
    expect(tail.text).toContain("Digital TV");
  });

  it("PROSE TERMINATES THE SEQUENCE — the region is what follows it", () => {
    // The boundary law applied to itself, rather than a second rule
    // bolted beside it. An earlier cut refused the whole carrier when
    // prose appeared between blocks, which cost 49 of godot's entries
    // for a document whose trailing run was perfectly writable.
    //
    // A sequence is a run of blocks separated only by blanks, inert
    // markup and section HEADINGS. Prose is none of those, so it ENDS
    // the sequence — and the region is the last maximal sequence that
    // reaches EOF. Blocks before the prose are outside it and lock.
    const text = lines(
      "T",
      "=",
      "",
      ".. toctree::",
      "",
      "   a",
      "",
      "Some prose between the blocks.",
      "",
      ".. toctree::",
      "",
      "   b",
      "",
    );
    const tail = navTailOf(text);
    expect(tail.ok).toBe(true);
    if (!tail.ok) return;
    // Starts at the SECOND block, not the first, and claims none of the
    // prose above it.
    expect(tail.text).toBe(lines(".. toctree::", "", "   b", ""));
    expect(tail.fromBlock).toBe(1);
    expect(tail.text).not.toContain("Some prose");
  });

  it("keeps ALL blocks when only headings interrupt them", () => {
    // The complement, and the half a "prose ends it" rule could break
    // silently: a heading must still be crossable or the law collapses
    // back to the strict reading it replaced.
    const text = lines(
      "T",
      "=",
      "",
      ".. toctree::",
      "",
      "   a",
      "",
      "Second",
      "------",
      "",
      ".. toctree::",
      "",
      "   b",
      "",
    );
    const tail = navTailOf(text);
    expect(tail.ok).toBe(true);
    if (!tail.ok) return;
    expect(tail.fromBlock).toBe(0);
  });

  it("refuses a carrier whose last block does not reach EOF", () => {
    const text = lines(
      "T",
      "=",
      "",
      ".. toctree::",
      "",
      "   a",
      "",
      "Trailing prose.",
      "",
    );
    const tail = navTailOf(text);
    expect(tail.ok).toBe(false);
    if (tail.ok) return;
    expect(tail.reason).toBe("mid-file");
  });

  it("names a document with no toctree at all separately", () => {
    const tail = navTailOf(lines("T", "=", "", "Just prose.", ""));
    expect(tail.ok).toBe(false);
    if (tail.ok) return;
    expect(tail.reason).toBe("no-toctree");
  });

  it("treats a trailing COMMENT as inert, not as prose", () => {
    // The census's primary reading: a maintainer note under the nav does
    // not make the carrier mid-file.
    const text = lines(
      "T",
      "=",
      "",
      ".. toctree::",
      "",
      "   a",
      "",
      ".. keep these sorted",
      "",
    );
    const tail = navTailOf(text);
    expect(tail.ok).toBe(true);
  });

  it("refuses a trailing RENDERING directive — the reader sees it", () => {
    const text = lines(
      "T",
      "=",
      "",
      ".. toctree::",
      "",
      "   a",
      "",
      ".. note::",
      "",
      "   Hi.",
      "",
    );
    const tail = navTailOf(text);
    expect(tail.ok).toBe(false);
    if (tail.ok) return;
    expect(tail.reason).toBe("mid-file");
  });
});

describe("the splice re-anchors by SCANNING, never by a stored offset", () => {
  // docs/15's rule, inherited: the snapshot is not a disk mirror, so the
  // file at save time may have a body edited since load. An offset
  // captured at load points at whatever slid into those bytes; scanning
  // re-derives the region from the CURRENT content.
  it("replaces the region and leaves every earlier byte identical", () => {
    const before = lines(
      "T",
      "=",
      "",
      "Body.",
      "",
      ".. toctree::",
      "",
      "   a",
      "   b",
      "",
    );
    const next = spliceNavTail(before, lines(".. toctree::", "", "   b", "   a", ""));
    expect(next).toBe(
      lines("T", "=", "", "Body.", "", ".. toctree::", "", "   b", "   a", ""),
    );
  });

  it("splices into a body EDITED since load", () => {
    const atLoad = lines(
      "T",
      "=",
      "",
      "Old body.",
      "",
      ".. toctree::",
      "",
      "   a",
      "   b",
      "",
    );
    const onDisk = lines(
      "T",
      "=",
      "",
      "A rewritten body, longer now.",
      "",
      "More.",
      "",
      ".. toctree::",
      "",
      "   a",
      "   b",
      "",
    );
    const tail = navTailOf(atLoad);
    expect(tail.ok).toBe(true);
    if (!tail.ok) return;
    const next = spliceNavTail(onDisk, lines(".. toctree::", "", "   b", "   a", ""));
    expect(next).toContain("A rewritten body, longer now.");
    expect(next).toContain("More.");
    expect(next.endsWith(lines(".. toctree::", "", "   b", "   a", ""))).toBe(true);
  });

  it("preserves a MISSING trailing newline", () => {
    // Terminator fidelity: the region ends at EOF, so it is the one
    // region that can carry the file's terminator state.
    const before = ".. toctree::\n\n   a\n   b";
    expect(before.endsWith("\n")).toBe(false);
    const next = spliceNavTail(before, ".. toctree::\n\n   b\n   a");
    expect(next).toBe(".. toctree::\n\n   b\n   a");
    expect(next.endsWith("\n")).toBe(false);
  });

  it("leaves a file with no region untouched", () => {
    const text = lines("T", "=", "", "Just prose.", "");
    expect(spliceNavTail(text, ".. toctree::\n")).toBe(text);
  });
});

describe("CRLF sources", () => {
  const CRLF = "T\r\n=\r\n\r\nBody.\r\n\r\n.. toctree::\r\n\r\n   a\r\n   b\r\n";

  it("finds the region without carrying a stray carriage return", () => {
    const tail = navTailOf(CRLF);
    expect(tail.ok).toBe(true);
    if (!tail.ok) return;
    expect(tail.text).toBe(".. toctree::\r\n\r\n   a\r\n   b\r\n");
  });

  it("round-trips a CRLF region byte-for-byte", () => {
    const tail = navTailOf(CRLF);
    expect(tail.ok).toBe(true);
    if (!tail.ok) return;
    expect(spliceNavTail(CRLF, tail.text)).toBe(CRLF);
  });
});

describe("round-trip is the identity on every vendored fixture", () => {
  const rst = import.meta.glob("./fixtures/sphinx*/**/*.rst", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  it("re-splicing a region unchanged reproduces the file exactly", () => {
    let regions = 0;
    for (const [key, text] of Object.entries(rst)) {
      const tail = navTailOf(text);
      if (!tail.ok) continue;
      regions++;
      expect(spliceNavTail(text, tail.text), key).toBe(text);
    }
    // Not an empty loop.
    expect(regions).toBeGreaterThan(3);
  });
});
