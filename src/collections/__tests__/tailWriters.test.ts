/**
 * Both writers on a `navTail` change (docs/19 step 2).
 *
 * `FileRegion` gained its second member, and widening a union that is
 * consumed by `if (region !== "navHead")` is the dangerous direction:
 * `pnpm check` stayed green while both writers would have written a tail
 * region as the WHOLE FILE, truncating every byte of prose above it.
 * TypeScript cannot see it — the checks are inequalities, not exhaustive
 * switches — so the tests are the enforcement and they are written first.
 *
 * THE TWO WRITERS MUST AGREE, and their agreement is the oracle of record
 * (docs/16 step 8): a simulation that agrees with itself is not a
 * receipt. Here that means an absent region has ONE answer, not two —
 * both writers no-op, so the differential check stays meaningful instead
 * of comparing a no-op against a throw.
 */

import { describe, expect, it } from "vitest";
import { renderPatch } from "../diff";
import { saveChanges } from "../fsAccess";
import type { FileChange, FilesSnapshot } from "../types";

const HOST = [
  "Drivers",
  "=======",
  "",
  "Prose the region does not own.",
  "",
  ".. toctree::",
  "",
  "   alpha",
  "   beta",
  "",
].join("\n");

/** The same host with its two entries swapped — the region only. */
const NEW_TAIL = [".. toctree::", "", "   beta", "   alpha", ""].join("\n");

const tailEdit: FileChange = {
  kind: "edit",
  path: "guides/index.rst",
  newContent: NEW_TAIL,
  region: "navTail",
};

async function writeThrough(files: FilesSnapshot, changes: FileChange[]) {
  const memory: FilesSnapshot = { ...files };
  await saveChanges(
    {
      readFile: (p) => Promise.resolve(memory[p] ?? null),
      writeFile: (p, c) => {
        memory[p] = c;
        return Promise.resolve();
      },
      removeFile: (p) => {
        delete memory[p];
        return Promise.resolve();
      },
    },
    changes,
  );
  return memory;
}

describe("the File System Access writer splices, never overwrites", () => {
  it("keeps every byte above the region", async () => {
    const out = await writeThrough({ "guides/index.rst": HOST }, [tailEdit]);
    expect(out["guides/index.rst"]).toBe(
      HOST.replace("   alpha\n   beta", "   beta\n   alpha"),
    );
    expect(out["guides/index.rst"]).toContain("Prose the region does not own.");
  });

  it("splices into a body EDITED since load", async () => {
    // docs/15's whole reason for the region model, inherited: the
    // snapshot is what the app loaded, never a disk mirror.
    const onDisk = HOST.replace(
      "Prose the region does not own.",
      "Prose rewritten by someone else, at length.",
    );
    const out = await writeThrough({ "guides/index.rst": onDisk }, [tailEdit]);
    expect(out["guides/index.rst"]).toContain("Prose rewritten by someone else");
    expect(out["guides/index.rst"]).toContain("   beta\n   alpha");
  });

  it("no-ops on a file with no region rather than truncating it", async () => {
    const bare = "Just prose.\n";
    const out = await writeThrough({ "guides/index.rst": bare }, [tailEdit]);
    expect(out["guides/index.rst"]).toBe(bare);
  });
});

describe("the patch writer offsets its hunks by the lines above the region", () => {
  it("numbers from the region's own first line", () => {
    const patch = renderPatch([tailEdit], { "guides/index.rst": HOST });
    expect(patch).toContain("@@ -6,4 +6,4 @@");
    // And it claims NO context above the region — docs/15's boundary rule
    // at the other end of the file.
    expect(patch).not.toContain("Prose the region does not own.");
  });

  it("emits a hunk that is about the entries and nothing else", () => {
    const patch = renderPatch([tailEdit], { "guides/index.rst": HOST });
    expect(patch).toContain("-   alpha");
    expect(patch).toContain("+   alpha");
    expect(patch).toContain("diff --git a/guides/index.rst b/guides/index.rst");
  });

  it("writes no hunks for a file with no region — the writers agree", () => {
    const patch = renderPatch([tailEdit], { "guides/index.rst": "Just prose.\n" });
    expect(patch).not.toContain("@@");
  });

  it("carries the EOF terminator state of the real file", () => {
    const unterminated = HOST.slice(0, -1);
    expect(unterminated.endsWith("\n")).toBe(false);
    const patch = renderPatch([{ ...tailEdit, newContent: NEW_TAIL.slice(0, -1) }], {
      "guides/index.rst": unterminated,
    });
    expect(patch).toContain("\\ No newline at end of file");
  });
});

describe("a tail change needs no --unidiff-zero preamble", () => {
  // docs/19's first inverted expectation, and the fence that keeps it
  // honest. The flag's class is POSITION ZERO, not "no owned anchor":
  // `@@ -0,0 +1,6 @@` is refused by default `git apply` and
  // `@@ -6,0 +7,6 @@` is accepted, same payload, same file. A tail is
  // the far end of the same file and anchors on its own context.
  it("names no flag for an ordinary tail edit", () => {
    const patch = renderPatch([tailEdit], { "guides/index.rst": HOST });
    expect(patch).not.toContain("--unidiff-zero");
  });
});

describe("a multi-file plan says which tool can apply it", () => {
  /**
   * GNU `patch` IS NOT ATOMIC ACROSS FILES — docs/18 D2's second,
   * independent receipt, and decisive here because a cross-file toctree
   * move is MULTI-ENTRY BY CONSTRUCTION: the source block loses a line
   * and the destination gains one, so a half-applied patch does not
   * leave the nav slightly wrong, it DROPS THE PAGE from navigation
   * entirely. `git apply` refuses the pair in both directions.
   *
   * The preamble did not cover this. Its two triggers were zero-context
   * hunks and renames, and a plan with neither emitted NOTHING — so the
   * common phase-2 patch named no tool at all and a user reaching for
   * `patch -p1` would find out the hard way. Verified rather than
   * assumed, which is what the note asked: it did NOT already exclude
   * multi-file plans, so it is extended here.
   */
  const twoFiles: FileChange[] = [
    { kind: "edit", path: "index.rst", newContent: NEW_TAIL, region: "navTail" },
    { kind: "edit", path: "guides/index.rst", newContent: NEW_TAIL, region: "navTail" },
  ];
  const originals = { "index.rst": HOST, "guides/index.rst": HOST };

  it("names git apply and the reason, with no flag it does not need", () => {
    const patch = renderPatch(twoFiles, originals);
    expect(patch).toContain("git apply");
    // Asserted on phrases that are actually on ONE line: the preamble
    // wraps at comment width, so a claim spanning a line break is a
    // test that fails on the formatting rather than on the content.
    expect(patch).toContain("belong to ONE change");
    expect(patch).toContain("refuses the whole patch");
    expect(patch).not.toContain("--unidiff-zero");
  });

  it("does not offer patch -p1, which would apply this one by halves", () => {
    expect(renderPatch(twoFiles, originals)).not.toContain("patch -p1");
  });

  it("stays SILENT for a single-file plan that needs nothing", () => {
    // The complement. A preamble on every patch is a preamble nobody
    // reads, and the existing behaviour for the simple case is correct.
    const patch = renderPatch([twoFiles[0]!], { "index.rst": HOST });
    expect(patch.startsWith("diff --git")).toBe(true);
  });
});
