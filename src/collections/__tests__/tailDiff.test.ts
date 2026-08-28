/**
 * Patch rendering for a SUFFIX region (docs/19 step 2).
 *
 * `navHead` is a PREFIX, so a diff between two heads is positionally
 * valid for the whole file and needs no arithmetic. `navTail` is a
 * SUFFIX, and two things follow that the head never had to answer:
 *
 *  - **Line numbering.** The region's first line is not the file's first
 *    line, so every hunk header must be offset by the lines before it.
 *  - **The EOF terminator.** The region ends at EOF, so it is the one
 *    region that can carry "this file has no trailing newline" — and
 *    that state is part of the patch's context contract.
 *
 * MEASURED AGAINST REAL GIT, not reasoned about (`scratchpad/gitexp`):
 *
 *  - A hunk anchored at the region's own first line, claiming NO context
 *    above it, is ACCEPTED by `git apply`. The docs/15 boundary rule and
 *    git's requirements do not conflict here.
 *  - `\ No newline at end of file` attaches to the trailing CONTEXT line
 *    when the edit never touched the last line — a writer tracking only
 *    "did I touch the last line?" gets it wrong.
 *  - STRIPPING that marker makes `git apply` REFUSE the hunk outright.
 *    It is not decoration.
 *
 * AND THE INSTRUMENT'S OWN LIMIT, which is why the numbering is asserted
 * here rather than left to the receipt script: NEITHER `git apply` NOR
 * GNU `patch` enforces the hunk's start line. Both search by context and
 * accept a header off by one without a murmur. An apply-based oracle
 * therefore FALSE-PASSES on wrong numbering — it agrees with a straw man
 * — so the exact headers are pinned by unit assertion.
 */

import { describe, expect, it } from "vitest";
import { unifiedHunks } from "../diff";

const lines = (...l: string[]) => l.join("\n");

describe("a tail region's hunks are numbered from where the region starts", () => {
  // The file is `Title / ===== / (blank) / Body prose here. / (blank)`
  // then the block: five lines before the region, so it begins at line 6.
  const before = lines(".. toctree::", "", "   alpha", "   beta", "");
  const after = lines(".. toctree::", "", "   beta", "   alpha", "");

  it("offsets the header by the lines that precede it", () => {
    const [hunk] = unifiedHunks(before, after, 3, { linesBefore: 5 });
    expect(hunk!.split("\n")[0]).toBe("@@ -6,4 +6,4 @@");
  });

  it("numbers from line 1 when nothing precedes it", () => {
    const [hunk] = unifiedHunks(before, after, 3, { linesBefore: 0 });
    expect(hunk!.split("\n")[0]).toBe("@@ -1,4 +1,4 @@");
  });

  it("counts a terminated region's real lines, not the phantom one", () => {
    // `"a\nb\n".split("\n")` is `["a","b",""]`. Counting that third
    // element makes every tail hunk claim one line more than the file
    // has, and the COUNT is what git checks — so the patch is refused,
    // not merely ugly.
    //
    // Asserted on a region with NO internal blank line, so the claim is
    // unambiguous: a genuine blank renders as a bare " " context line and
    // is indistinguishable from a phantom one by shape alone.
    const b = lines("   alpha", "   beta", "");
    const a = lines("   beta", "   alpha", "");
    const [hunk] = unifiedHunks(b, a, 3, { linesBefore: 5 });
    expect(hunk!.split("\n")[0]).toBe("@@ -6,2 +6,2 @@");
    expect(hunk!.split("\n")).toHaveLength(4);
  });
});

describe("the EOF terminator is part of the context contract", () => {
  const unterminated = lines(".. toctree::", "", "   alpha", "   beta", "   gamma");
  const edited = lines(".. toctree::", "", "   ALPHA", "   beta", "   gamma");

  it("marks a trailing CONTEXT line the edit never touched", () => {
    // git's own output for exactly this edit. A writer that asked "did I
    // touch the last line?" would emit nothing here and `git apply`
    // would refuse the hunk — measured, not assumed.
    const [hunk] = unifiedHunks(unterminated, edited, 3, { linesBefore: 5 });
    expect(hunk).toBe(
      lines(
        "@@ -6,5 +6,5 @@",
        " .. toctree::",
        " ",
        "-   alpha",
        "+   ALPHA",
        "    beta",
        "    gamma",
        "\\ No newline at end of file",
      ),
    );
  });

  it("emits no marker when the file ends with a newline", () => {
    const terminated = unterminated + "\n";
    const editedT = edited + "\n";
    const [hunk] = unifiedHunks(terminated, editedT, 3, { linesBefore: 5 });
    expect(hunk).not.toContain("No newline");
  });

  it("marks BOTH sides when the last line itself changes", () => {
    const next = lines(".. toctree::", "", "   alpha", "   beta", "   GAMMA");
    const [hunk] = unifiedHunks(unterminated, next, 3, { linesBefore: 5 });
    const marks = hunk!.split("\n").filter((l) => l.startsWith("\\ No newline"));
    expect(marks).toHaveLength(2);
    // Each marker follows its own side's final line.
    const body = hunk!.split("\n");
    expect(body[body.indexOf("\\ No newline at end of file") - 1]).toBe("-   gamma");
    expect(body[body.lastIndexOf("\\ No newline at end of file") - 1]).toBe("+   GAMMA");
  });
});

describe("whole-file and prefix rendering are untouched", () => {
  // The absence half of the rule. `navHead` deliberately excludes its
  // closing terminator, so every head "ends without a newline" — and
  // auto-detecting that as an unterminated FILE would stamp a marker on
  // every Hugo and Docusaurus patch in the repo. The tail option is
  // opt-in for exactly that reason.
  const head = lines("---", "title: A", "---");
  const next = lines("---", "title: B", "---");

  it("emits no terminator marker without the tail option", () => {
    const [hunk] = unifiedHunks(head, next);
    expect(hunk).not.toContain("No newline");
    expect(hunk!.split("\n")[0]).toBe("@@ -1,3 +1,3 @@");
  });

  it("still starts a zero-length old side at line 0", () => {
    // docs/16's D1 arithmetic, unchanged by any of this.
    const [hunk] = unifiedHunks("", lines("---", "title: A", "---"));
    expect(hunk!.split("\n")[0]).toBe("@@ -0,0 +1,3 @@");
  });
});

describe("an unterminated LAST line cannot be shared context", () => {
  /**
   * FOUND BY THE RECEIPT, not by this suite — `git apply` produced
   * `   fmt   lint` on ONE line from a patch every test here accepted.
   *
   * The old emitter kept `fmt` as a context line and stamped it
   * `\ No newline at end of file` because it was the last line of the
   * OLD side. But the NEW side continues past it, so the hunk claimed
   * the old file ends at `fmt` while the new one does not — a
   * contradiction git resolved by joining the lines.
   *
   * Measured against git's own output for exactly this edit: it does not
   * share the context line at all, it splits the pair. Reproduced here
   * by tagging an unterminated last line so it can never match a
   * terminated one.
   */
  const before = lines("   lint", "   fmt");
  const after = lines("   fmt", "   lint");

  it("splits the pair instead of sharing a context line", () => {
    const [hunk] = unifiedHunks(before, after, 3, { linesBefore: 2 });
    const body = hunk!.split("\n").slice(1);
    // No line survives as context — git's own choice for this edit.
    expect(body.filter((l) => l.startsWith(" "))).toEqual([]);
    expect(body).toEqual([
      "-   lint",
      "-   fmt",
      "\\ No newline at end of file",
      "+   fmt",
      "+   lint",
      "\\ No newline at end of file",
    ]);
  });

  it("still shares the line when BOTH sides end on it unchanged", () => {
    // The complement, and the reason the fix is a tag rather than "never
    // share": where the last line really is last on both sides, git
    // emits ONE marker after the context line, and so must we.
    const a = lines("   lint", "   fmt", "   keep");
    const b = lines("   fmt", "   lint", "   keep");
    const [hunk] = unifiedHunks(a, b, 3, { linesBefore: 2 });
    const marks = hunk!.split("\n").filter((l) => l.startsWith("\\ No newline"));
    expect(marks).toHaveLength(1);
    expect(hunk).toContain("    keep\n\\ No newline at end of file");
  });
});
