/**
 * The unified-hunk builder's ZERO BOUNDARY (docs/16 step 8, finding 2).
 *
 * The header arithmetic is the part that lies: a hunk whose counts are
 * wrong is a patch `git apply` refuses, or worse, applies somewhere
 * else. So the assertions here are on the HEADERS, in both directions.
 */

import { describe, expect, it } from "vitest";
import { headPrependPaths, renderPatch, unifiedHunks } from "../diff";
import type { FileChange } from "../types";

describe("the zero boundary: an empty side is ZERO lines, not one", () => {
  /**
   * `"".split("\n")` is `[""]` — one empty line — so an empty side looked
   * like a file containing a blank line, and the differ dutifully
   * deleted or added it. On the patch path that produced a hunk claiming
   * to remove a line the file does not have, which `git apply` refuses.
   *
   * Found by the docs/16 step-8 receipt on `bare.md`: a page with no
   * front matter that gains a weight. Pre-existing, and reachable on the
   * real corpus — kubernetes/website has 142 pages with no front matter,
   * any of which gains a weight when its directory is reordered.
   *
   * The minimal pair is BOTH directions, asserted in the HEADERS,
   * because the header arithmetic is the part that lies.
   */
  const header = (hunks: string[]) => hunks[0]?.split("\n")[0] ?? "(no hunk)";

  it("CREATION (-0,0): inserting into an empty side removes nothing", () => {
    // `-0,0`, not `-1,0`: with a zero-length side the number names the
    // line AFTER WHICH content goes. Correct counts were not enough —
    // `@@ -1,0 +1,3 @@` has them and real `git apply` still refuses,
    // which is why the receipt script exists and this literal came from
    // git rather than from reasoning.
    const hunks = unifiedHunks("", "---\nweight: 42\n---");
    expect(header(hunks)).toBe("@@ -0,0 +1,3 @@");
    expect(hunks[0]).not.toMatch(/^-/m);
  });

  it("REMOVAL (+0,0): emptying a side adds nothing", () => {
    const hunks = unifiedHunks("---\nweight: 42\n---", "");
    expect(header(hunks)).toBe("@@ -1,3 +0,0 @@");
    expect(hunks[0]).not.toMatch(/^\+/m);
  });

  it("both sides empty is no hunk at all", () => {
    expect(unifiedHunks("", "")).toEqual([]);
  });

  it("a genuinely blank line is still one line, not zero", () => {
    // The distinction the fix must preserve: "" is no content, "\n" is
    // one empty line followed by a terminator. Collapsing them would
    // trade this defect for its mirror image.
    const hunks = unifiedHunks("\n", "x\n");
    expect(header(hunks)).toBe("@@ -1,2 +1,2 @@");
  });

  it("counts every line of a multi-line insertion into empty", () => {
    const hunks = unifiedHunks("", "a\nb\nc\nd\ne");
    expect(header(hunks)).toBe("@@ -0,0 +1,5 @@");
  });
});

describe("the header's START offsets, which nothing was pinning", () => {
  /**
   * Found by mutation while fixing the zero boundary: deleting
   * `- contextBefore` from either start survived all 927 tests in the
   * repo. Nothing asserted where a hunk CLAIMS to begin, only how many
   * lines it covers — and a start that is off by the context width is a
   * patch that applies at the wrong place or not at all.
   *
   * In scope for that fix rather than scope creep: same function, same
   * arithmetic, and the repro is a surviving mutant rather than a
   * suspicion.
   */
  const header = (hunks: string[]) => hunks[0]?.split("\n")[0] ?? "(no hunk)";

  it("starts the hunk at the first CONTEXT line, not the first change", () => {
    // The change is on line 5; three lines of context precede it, so the
    // hunk begins at line 2 on both sides.
    const before = "a\nb\nc\nd\nX\nf\ng\nh";
    const after = "a\nb\nc\nd\nY\nf\ng\nh";
    expect(header(unifiedHunks(before, after))).toBe("@@ -2,7 +2,7 @@");
  });

  it("clamps to line 1 when the change is at the top", () => {
    expect(header(unifiedHunks("X\nb\nc", "Y\nb\nc"))).toBe("@@ -1,3 +1,3 @@");
  });

  it("tracks the two sides SEPARATELY once they diverge in length", () => {
    // An insertion in an EARLIER hunk pushes the new side's numbering
    // past the old side's, which a single shared counter would get
    // wrong. Asserted as the INVARIANT rather than as literal headers:
    // the offset between the two starts of a later hunk must equal the
    // net lines inserted before it. Literals here would be a guess
    // fitted to the output, and the first attempt at this test guessed
    // two hunks where the builder correctly emits one.
    const middle = Array.from({ length: 12 }, (_, i) => `s${i}`).join("\n");
    const before = `a\nb\nc\nX\n${middle}\nY\nz`;
    const after = `a\nb\nc\nX\nNEW\n${middle}\nY2\nz`;
    const hunks = unifiedHunks(before, after);
    expect(hunks.length).toBeGreaterThan(1);

    const parse = (hunk: string) => {
      const m = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/.exec(hunk.split("\n")[0]!)!;
      return { oldStart: Number(m[1]), newStart: Number(m[3]) };
    };
    const first = parse(hunks[0]!);
    const last = parse(hunks[hunks.length - 1]!);
    // One line was inserted in the first hunk, so every later hunk sits
    // one further along on the new side than on the old.
    expect(first.newStart - first.oldStart).toBe(0);
    expect(last.newStart - last.oldStart).toBe(1);
  });
});

describe("mixed-mode: zero-context hunks, confined and documented", () => {
  /**
   * A bare page gaining front matter has NO owned context to anchor
   * against — the head is empty and the body is not ours to claim
   * (docs/15). So that one hunk is emitted zero-context, which is a
   * documented unified-diff mode rather than a malformed patch, and the
   * patch says so in its own bytes.
   */
  const head = (patch: string, path: string) => {
    const at = patch.indexOf(`a/${path}`);
    const rest = patch.slice(at);
    return /@@[^\n]*@@/.exec(rest)?.[0] ?? "(no hunk)";
  };

  const bareEdit: FileChange[] = [
    {
      kind: "edit",
      path: "docs/bare.md",
      newContent: "---\nweight: 42\n---",
      region: "navHead",
    },
  ];
  const normalEdit: FileChange[] = [
    {
      kind: "edit",
      path: "docs/has.md",
      newContent: "---\ntitle: A\nweight: 20\n---",
      region: "navHead",
    },
  ];

  it("emits EXACTLY -0,0 for a head prepend", () => {
    // Pinned LITERALLY because `-1,0` is tool-divergent: git treats it
    // as beginning-of-file under the flag while GNU patch inserts AFTER
    // line 1. A landmine that silently regresses into a wrong-place
    // write, so the header is asserted rather than the behaviour.
    const patch = renderPatch(bareEdit, { "docs/bare.md": "" });
    expect(head(patch, "docs/bare.md")).toBe("@@ -0,0 +1,3 @@");
  });

  it("carries no context lines in that hunk", () => {
    const patch = renderPatch(bareEdit, { "docs/bare.md": "" });
    const body = patch.slice(patch.indexOf("@@ -0,0")).split("\n").slice(1, 4);
    expect(body.every((l) => l.startsWith("+"))).toBe(true);
  });

  it("keeps every OTHER change on context hunks, exactly as before", () => {
    const patch = renderPatch(normalEdit, {
      "docs/has.md": "---\ntitle: A\nweight: 10\n---",
    });
    expect(head(patch, "docs/has.md")).toMatch(/@@ -1,\d+ \+1,\d+ @@/);
    expect(patch).toMatch(/^ ---$/m); // a context line, unprefixed
  });

  it("names the paths that need the mode", () => {
    expect(headPrependPaths(bareEdit, { "docs/bare.md": "" })).toEqual(["docs/bare.md"]);
    expect(headPrependPaths(normalEdit, { "docs/has.md": "---\ntitle: A\n---" })).toEqual(
      [],
    );
  });

  it("INCLUDES a MOVE that also gains front matter [corrected 2026-08-17]", () => {
    // This test asserted the OPPOSITE, and said "measured, not assumed"
    // while doing it. What had been measured was HEADER FORMS — whether
    // `-0,0` and `-1,0` behave alike across tools — and that experiment
    // cannot answer a question about a class of CHANGES. Re-measured on
    // the change itself, through the shipped writer and real git:
    //
    //   git apply                 → error: patch failed: …bare.md:0   (exit 1)
    //   git apply --unidiff-zero  → applies, body intact              (exit 0)
    //
    // A rename header self-anchors the FILE; it does not give a
    // zero-context hunk the context it lacks. So the classifier keys on
    // the CHANGE — empty original head, non-empty new head — and the
    // mechanism carrying it is irrelevant.
    const moved: FileChange[] = [
      {
        kind: "move",
        fromPath: "docs/a/bare.md",
        toPath: "docs/b/bare.md",
        newContent: "---\nweight: 10\n---",
        region: "navHead",
      },
    ];
    expect(headPrependPaths(moved, { "docs/a/bare.md": "" })).toEqual(["docs/b/bare.md"]);
  });

  it("excludes an empty-to-empty navHead change, which writes no hunk", () => {
    // The other half of the classifier. Without it, a change from no
    // head to no head would be flagged, the patch would name a flag it
    // does not need, and the receipt's "default apply must REFUSE every
    // flagged patch" would fail — the instruction becoming a lie in the
    // opposite direction.
    const noop: FileChange[] = [
      {
        kind: "move",
        fromPath: "docs/a/bare.md",
        toPath: "docs/b/bare.md",
        newContent: "",
        region: "navHead",
      },
    ];
    expect(headPrependPaths(noop, { "docs/a/bare.md": "" })).toEqual([]);
  });

  it("excludes a CREATE, which has its own flag-free path", () => {
    const created: FileChange[] = [
      { kind: "create", path: "docs/new/_index.md", newContent: "---\ntitle: N\n---\n" },
    ];
    expect(headPrependPaths(created, {})).toEqual([]);
  });
});

describe("the patch documents itself, iff it needs to", () => {
  const bareEdit: FileChange[] = [
    {
      kind: "edit",
      path: "docs/bare.md",
      newContent: "---\nweight: 42\n---",
      region: "navHead",
    },
  ];

  it("leads with the apply instructions when a zero-context hunk is present", () => {
    // A patch that needs a flag it does not name fails for a reason the
    // user cannot see. `git apply` tolerates leading text — that is how
    // format-patch carries mail headers — so the instruction travels
    // with the bytes rather than in a dialog the file outlives.
    const patch = renderPatch(bareEdit, { "docs/bare.md": "" });
    expect(patch.startsWith("#")).toBe(true);
    expect(patch).toContain("git apply --unidiff-zero");
    expect(patch).toContain("patch -p1 <");
    expect(patch).toContain("gains front matter: docs/bare.md");
  });

  it("says NOTHING when no hunk needs it — the common patch is unchanged", () => {
    const patch = renderPatch(
      [
        {
          kind: "edit",
          path: "docs/has.md",
          newContent: "---\ntitle: A\nweight: 20\n---",
          region: "navHead",
        },
      ],
      { "docs/has.md": "---\ntitle: A\nweight: 10\n---" },
    );
    expect(patch.startsWith("diff --git")).toBe(true);
    expect(patch).not.toContain("unidiff-zero");
  });
});
