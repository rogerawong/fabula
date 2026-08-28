/**
 * diff.ts — Line-based Myers diff + unified/git patch rendering for
 * the change-review dialog and the .patch download. No dependencies;
 * files in a docs collection are small enough for the classic
 * O((N+M)·D) greedy algorithm.
 */

import { navTailOf } from "./navTail";
import type { FileChange } from "./types";

type Op = { kind: "same" | "del" | "add"; line: string };

/** Myers greedy diff over line arrays. */
export function diffLines(before: string[], after: string[]): Op[] {
  const n = before.length;
  const m = after.length;
  const max = n + m;
  if (max === 0) return [];
  const offset = max;
  const v = new Array<number>(2 * max + 1).fill(0);
  const trace: number[][] = [];

  outer: for (let d = 0; d <= max; d++) {
    trace.push([...v]);
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
          ? v[offset + k + 1]!
          : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && before[x] === after[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) break outer;
    }
  }

  // backtrack
  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const prev = trace[d]!;
    const k = x - y;
    const prevK =
      k === -d || (k !== d && prev[offset + k - 1]! < prev[offset + k + 1]!)
        ? k + 1
        : k - 1;
    const prevX = prev[offset + prevK]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ kind: "same", line: before[x - 1]! });
      x--;
      y--;
    }
    if (x === prevX) {
      ops.push({ kind: "add", line: after[y - 1]! });
      y--;
    } else {
      ops.push({ kind: "del", line: before[x - 1]! });
      x--;
    }
  }
  while (x > 0 && y > 0) {
    ops.push({ kind: "same", line: before[x - 1]! });
    x--;
    y--;
  }
  while (x > 0) {
    ops.push({ kind: "del", line: before[--x]! });
  }
  while (y > 0) {
    ops.push({ kind: "add", line: after[--y]! });
  }
  return ops.reverse();
}

/** Unified-diff hunks with `context` lines of context. */
/**
 * Text as LINES, where empty text is ZERO lines.
 *
 * `"".split("\n")` is `[""]` — one empty line — so an empty side looked
 * like a file containing a blank line, and the differ dutifully deleted
 * or added it. On the patch path that produced `@@ -1,1 +1,3 @@` for a
 * page GAINING front matter: a hunk claiming to remove a line the file
 * does not have, which `git apply` refuses outright.
 *
 * The distinction this preserves, and the reason it is not a `trim`: no
 * content and one empty line are different things. `""` is zero lines;
 * `"\n"` is one empty line followed by a terminator. Collapsing them
 * would trade this defect for its mirror image.
 */
function toLines(text: string): string[] {
  return text === "" ? [] : text.split("\n");
}

/**
 * A region anchored at EOF: where it starts, and whether its last line
 * carries a terminator.
 *
 * Its PRESENCE is the signal, not a boolean field — passing it says
 * "these bytes run to the end of their file", which is what makes the
 * terminator state real. A `navHead` deliberately excludes its closing
 * terminator (docs/15), so every head ends without a newline; detecting
 * that as an unterminated FILE would stamp `\ No newline at end of file`
 * onto every Hugo and Docusaurus patch in the repo.
 */
export interface TailRegion {
  /** Lines preceding this region in its file. The hunk offset. */
  linesBefore: number;
}

const NO_NEWLINE = "\\ No newline at end of file";
/** Marks an unterminated LAST line so it cannot match a terminated one.
 *  A NUL cannot occur in a text line, so it can never collide. */
const NO_EOL_TAG = "\u0000no-eol";

/**
 * An EOF-anchored region as LINES, with its terminator state.
 *
 * `"a\nb\n"` is two lines, terminated; `"a\nb"` is two lines, not.
 * Keeping the trailing `""` that `split` produces would make every tail
 * hunk claim one line more than the file has — and the COUNT is what
 * git checks, so the patch would be refused rather than merely ugly.
 */
function regionLines(text: string): { lines: string[]; terminated: boolean } {
  if (text === "") return { lines: [], terminated: true };
  const parts = text.split("\n");
  if (parts[parts.length - 1] === "") {
    parts.pop();
    return { lines: parts, terminated: true };
  }
  return { lines: parts, terminated: false };
}

/** Unified-diff hunks with `context` lines of context. */
export function unifiedHunks(
  before: string,
  after: string,
  context: number = 3,
  tail?: TailRegion,
): string[] {
  const oldSide = tail
    ? regionLines(before)
    : { lines: toLines(before), terminated: true };
  const newSide = tail ? regionLines(after) : { lines: toLines(after), terminated: true };

  // AN UNTERMINATED LAST LINE IS DIFFERENT CONTENT, and tagging it is
  // what makes the differ agree with git.
  //
  // The marker cannot ride a shared CONTEXT line unless BOTH sides end
  // there: `-lint / fmt(no newline) / +lint` claims the old file ends at
  // `fmt` and the new one continues past it, which is a contradiction —
  // `git apply` resolved it by joining the lines and produced
  // `   fmt   lint`. Measured, on a real swap at the end of an
  // unterminated file: git splits the pair into `-lint -fmt / +fmt
  // +lint` rather than sharing the context line.
  //
  // Tagging reproduces that without a special case. A tagged line can
  // never match an untagged one, so a last line that stops being last
  // becomes a change by construction; and where BOTH sides end on the
  // same tagged line it stays context and carries ONE marker, which is
  // also what git emits.
  const tagged = (side: { lines: string[]; terminated: boolean }): string[] =>
    side.terminated || side.lines.length === 0
      ? side.lines
      : side.lines.map((l, i) => (i === side.lines.length - 1 ? l + NO_EOL_TAG : l));
  const ops = diffLines(tagged(oldSide), tagged(newSide));

  const hunks: string[] = [];
  let i = 0;
  const from = tail ? tail.linesBefore + 1 : 1;
  let oldLine = from;
  let newLine = from;

  while (i < ops.length) {
    if (ops[i]!.kind === "same") {
      oldLine++;
      newLine++;
      i++;
      continue;
    }
    // found a change; expand to a hunk with context
    const start = i;
    let contextBefore = 0;
    let scanBack = start - 1;
    while (scanBack >= 0 && contextBefore < context && ops[scanBack]!.kind === "same") {
      contextBefore++;
      scanBack--;
    }
    let end = start;
    let sinceChange = 0;
    while (end < ops.length && sinceChange < context * 2 + 1) {
      if (ops[end]!.kind === "same") sinceChange++;
      else sinceChange = 0;
      end++;
    }
    // trim trailing context to `context`
    let trailing = 0;
    while (trailing < end - start && ops[end - 1 - trailing]!.kind === "same") trailing++;
    end -= Math.max(0, trailing - context);

    const hunkOps = ops.slice(start - contextBefore, end);
    const oldCount = hunkOps.filter((o) => o.kind !== "add").length;
    const newCount = hunkOps.filter((o) => o.kind !== "del").length;
    // A ZERO-LENGTH side starts one line EARLIER, because the number
    // then names the line AFTER WHICH content goes rather than the first
    // line covered — so a pure insertion at the top of a file is
    // `-0,0`, which is what `git diff` itself emits and what
    // `git apply` requires. Getting the count right was not enough:
    // `@@ -1,0 +1,3 @@` has correct counts and git still refuses it.
    const oldStart = Math.max(0, oldLine - contextBefore - (oldCount === 0 ? 1 : 0));
    const newStart = Math.max(0, newLine - contextBefore - (newCount === 0 ? 1 : 0));

    const body: string[] = [];
    for (const o of hunkOps) {
      const carries = o.line.endsWith(NO_EOL_TAG);
      const text = carries ? o.line.slice(0, -NO_EOL_TAG.length) : o.line;
      body.push(
        o.kind === "same" ? ` ${text}` : o.kind === "del" ? `-${text}` : `+${text}`,
      );
      if (carries) body.push(NO_NEWLINE);
    }
    hunks.push(
      `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n${body.join("\n")}`,
    );

    for (const o of ops.slice(i, end)) {
      if (o.kind !== "add") oldLine++;
      if (o.kind !== "del") newLine++;
    }
    i = end;
  }
  return hunks;
}
/**
 * The two texts a change's hunks compare, and where they sit in the file.
 *
 * `null` means THERE IS NOTHING TO DIFF — the original carries no region
 * of the kind the change names. Both writers answer that the same way
 * (the splice returns the file unchanged, this returns no hunks), and
 * the agreement is deliberate: the differential oracle only means
 * something while the two writers can be compared, and a throw on one
 * side against a no-op on the other is not a comparison.
 */
function sidesFor(
  change: FileChange,
  before: string,
): { before: string; after: string; tail?: TailRegion } | null {
  if (change.region === "navTail") {
    // The ORIGINAL is the whole host file (Sphinx keeps hosts whole,
    // because a re-parse has to find the document's title above the
    // nav), while `newContent` is the region alone. So the region is
    // re-derived here rather than carried on the change — one function
    // answering for the planner, the splice and the patch alike.
    const region = navTailOf(before);
    if (!region.ok) return null;
    return {
      before: region.text,
      after: change.newContent,
      tail: { linesBefore: region.startLine },
    };
  }
  if (change.region === "navHead") {
    return { before: asFileHasIt(before), after: asFileHasIt(change.newContent) };
  }
  return { before, after: change.newContent };
}

/** Render a whole change plan as one git-style multi-file patch. */
/**
 * A nav head as the FILE has it, for diffing only.
 *
 * `navHeadOf` deliberately excludes the closing fence's line terminator
 * (docs/15: a head must never claim diff context it did not read). On LF
 * that is invisible — the terminator IS the newline, so the head's last
 * line and the file's last line are both `---`. On CRLF it is not: the
 * excluded terminator is `\r\n`, so the head's last line becomes `---`
 * while the file's is `---\r`, and `git apply` refuses the hunk with
 * "while searching for: ---".
 *
 * So restore the `\r` — the part of the terminator that belongs to the
 * LINE — and nothing else. Appending the full `\r\n` would add a
 * trailing empty line and make the hunk claim a line beyond the head,
 * which is the very thing the boundary rule exists to prevent.
 *
 * Found by the docs/16 step-8 adversarial pass, on a PURE REORDER: this
 * predates moves and affects every navHead edit on a CRLF file.
 */
/**
 * KNOWN DEFECT, open — the ZERO-BOUNDARY twin of the fix below.
 *
 * An EMPTY nav head splits into one empty line, not zero, so a page that
 * gains front matter emits a hunk that DELETES a line the file does not
 * have:
 *
 *     @@ -1,1 +1,3 @@
 *     -
 *     +---
 *     +weight: 42
 *     +---
 *
 * It should be `@@ -1,0 +1,3 @@` — insertion only. Repro:
 * `bash scripts/receipt-move-patch.sh`, scenario `adversarial-swap`, on
 * `content/docs/tasks/bare.md`.
 *
 * Same FAMILY as `asFileHasIt` below and as docs/15's splice fix: every
 * one of them is a boundary at zero — an absent terminator, an absent
 * head, an absent line. Reachable on the real corpus, not a synthetic
 * curiosity: kubernetes/website has 142 pages with no front matter, any
 * of which gains a weight when its directory is reordered.
 *
 * **[2026-08-17] The arithmetic is FIXED; a deeper limit remains.**
 * Two real defects were found and corrected — `""` counted as one line
 * (`toLines`), and a zero-length side starting one line too late
 * (`-1,0` where git requires `-0,0`). Eight tests, five mutations
 * killed, and the second literal came from real `git apply` rather than
 * from reasoning: `@@ -1,0 +1,3 @@` has correct COUNTS and git refuses
 * it anyway.
 *
 * What remains is not arithmetic. A pure PREPEND to an existing file
 * needs trailing context to anchor against — `git diff` emits
 * `@@ -1,3 +1,6 @@` with the following body lines — and a nav-head diff
 * cannot supply them, because docs/15 forbids a head from claiming
 * context it did not read. So the `.patch` writer cannot express "give
 * this bare page front matter" at all, while the File System Access
 * writer handles it correctly by splicing bytes.
 *
 * That is a DESIGN question (refuse the case in the patch path with a
 * reason? carry one anchor line? something else), not a bug fix, and it
 * is the last red scenario in `receipt-move-patch.sh`.
 */
function asFileHasIt(content: string): string {
  if (!content.includes("\r\n")) return content;
  return content.endsWith("\r") ? content : content + "\r";
}

/**
 * Does this change PREPEND a nav head to a file that already has a body?
 *
 * The hunk-mode classifier. Such a change has no owned context to anchor
 * against: the head is empty, the body is not ours to claim (docs/15),
 * and `git diff` would anchor a prepend with the following body lines.
 * So it is emitted as a ZERO-CONTEXT hunk — `@@ -0,0 +1,N @@`, additions
 * only — which is a documented unified-diff mode rather than a
 * malformed patch, and which `git apply --unidiff-zero` accepts.
 *
 * Deliberately narrow. A whole-file change has context. A `create` has
 * its own path (`new file mode`, `/dev/null`) and applies with no flag.
 * Only this one shape needs the mode, and confining it is what keeps the
 * flag off the common patch.
 */
function isHeadPrepend(change: FileChange, originals: Record<string, string>): boolean {
  if (change.region !== "navHead") return false;
  // KEYED ON THE CHANGE, not on the mechanism.
  //
  // This read `kind !== "edit"` and cited a measurement for it: "a MOVE
  // that also prepends applies under DEFAULT `git apply` — the rename
  // header gives git an anchor". Measured again, on the change rather
  // than on the header, that is FALSE. `git apply` refuses it
  // (`patch failed: …:0`) and `--unidiff-zero` accepts it, exactly as
  // for the in-place edit. A rename header self-anchors the FILE; it
  // does not give a zero-context hunk the context it lacks.
  //
  // The earlier receipt was not wrong, it was narrow: it compared HEADER
  // FORMS, and a header experiment cannot size a class of CHANGES. The
  // class is "the head was empty and is about to not be", whatever
  // mechanism carries it.
  //
  // `create` stays out because it genuinely has another path
  // (`new file mode`, `/dev/null`) and applies with no flag.
  if (change.kind === "create") return false;
  const from = change.kind === "move" ? change.fromPath : change.path;
  // Both halves are load-bearing. Empty-to-empty writes no hunk at all,
  // so flagging it would make the patch name a flag it does not need —
  // and the receipt asserts that default apply REFUSES every flagged
  // patch, so that lie fails the suite rather than shipping.
  return (originals[from] ?? "") === "" && change.newContent !== "";
}

/**
 * The files a plan will prepend a nav head onto, in plan order.
 *
 * Exported because three surfaces need the same answer and must not each
 * re-derive it: the patch's own comment block, the Review dialog's
 * marker, and the receipt script's assertions.
 */
export function headPrependPaths(
  changes: readonly FileChange[],
  originals: Record<string, string>,
): string[] {
  return changes
    .filter((change) => isHeadPrepend(change, originals))
    .map((change) => (change.kind === "move" ? change.toPath : change.path));
}

export function renderPatch(
  changes: FileChange[],
  originals: Record<string, string>,
  /**
   * The aspirational remainder, as comment lines (docs/21, Decision 4).
   *
   * THE INSTRUCTION TRAVELS WITH THE BYTES — the self-documenting-patch
   * precedent from docs/16. A user who applies this file weeks later, on
   * another machine, from a code review, sees the same list the dialog
   * showed. Optional: a plan with no remainder carries none, and an empty
   * block would be a heading over nothing.
   */
  checklist: readonly string[] = [],
): string {
  const parts: string[] = [];
  for (const change of changes) {
    if (change.kind === "create") {
      const lines = change.newContent.split("\n");
      parts.push(
        `diff --git a/${change.path} b/${change.path}\n` +
          `new file mode 100644\n--- /dev/null\n+++ b/${change.path}\n` +
          `@@ -0,0 +1,${lines.length} @@\n` +
          lines.map((l) => `+${l}`).join("\n"),
      );
    } else if (change.kind === "move") {
      const sides = sidesFor(change, originals[change.fromPath] ?? "");
      const hunks = sides ? unifiedHunks(sides.before, sides.after, 3, sides.tail) : [];
      parts.push(
        `diff --git a/${change.fromPath} b/${change.toPath}\n` +
          `rename from ${change.fromPath}\nrename to ${change.toPath}\n` +
          (hunks.length
            ? `--- a/${change.fromPath}\n+++ b/${change.toPath}\n${hunks.join("\n")}`
            : ""),
      );
    } else {
      const sides = sidesFor(change, originals[change.path] ?? "");
      const hunks = sides ? unifiedHunks(sides.before, sides.after, 3, sides.tail) : [];
      parts.push(
        `diff --git a/${change.path} b/${change.path}\n` +
          (hunks.length
            ? `--- a/${change.path}\n+++ b/${change.path}\n${hunks.join("\n")}`
            : ""),
      );
    }
  }
  const prepends = headPrependPaths(changes, originals);
  const touched = new Set(changes.map((c) => (c.kind === "move" ? c.toPath : c.path)));
  const remainder =
    checklist.length > 0
      ? checklist.map((line) => (line ? `# ${line}` : "#")).join("\n") + "\n#\n"
      : "";
  return (
    preamble(prepends, renamedPaths(changes), touched.size) +
    remainder +
    parts.join("\n") +
    "\n"
  );
}

/**
 * The patch's own instructions, when it needs any.
 *
 * A zero-context hunk requires `--unidiff-zero`, and a patch that needs
 * a flag it does not name is a patch that fails for a reason the user
 * cannot see. `git apply` tolerates leading text — that is how
 * `format-patch` output carries mail headers — so the explanation
 * travels WITH the bytes rather than in a dialog the file outlives.
 *
 * ABSENT when the patch needs no instruction, which is the common case:
 * the ordinary edit-only patch stays exactly what it was.
 *
 * **`patch -p1` is offered ONLY when the patch contains no renames**,
 * and that condition is the whole of D2. Measured on Apple patch
 * 2.0-12u11: given a `rename from` / `rename to` entry carrying a hunk,
 * GNU patch prints `patching file 'old/a.md'`, exits 0, applies the hunk
 * AT THE OLD PATH, and never creates the destination. It does not fail —
 * it succeeds at the wrong thing, which is the worst class of defect
 * this project recognises, and it did so because THIS FILE told the user
 * to run it. Given a HUNKLESS rename it is merely loud (`exit 2`,
 * "I can't seem to find a patch in there anywhere").
 *
 * We cannot fix GNU patch. We can stop recommending it into a trap.
 */
function preamble(
  prepends: readonly string[],
  renames: readonly string[],
  files: number,
): string {
  // THREE reasons a patch needs instructions, not two. The third is new
  // with docs/19 and it was NOT already covered: a plan with no
  // zero-context hunks and no renames emitted nothing at all, which is
  // exactly the shape of the common phase-2 patch.
  const split = files > 1;
  if (prepends.length === 0 && renames.length === 0 && !split) return "";
  const lines: string[] = [];
  const n = prepends.length;

  if (n > 0) {
    lines.push(
      `# ${n} file${n === 1 ? " gains" : "s gain"} front matter and ${n === 1 ? "has" : "have"} no existing`,
      `# front matter to anchor against, so ${n === 1 ? "that hunk" : "those hunks"} carr${n === 1 ? "ies" : "y"} no context`,
      `# lines.`,
    );
  }
  if (renames.length > 0) {
    lines.push(
      `# ${renames.length} file${renames.length === 1 ? " is" : "s are"} renamed by this patch.`,
      `#`,
      `# GNU \`patch\` CANNOT apply a rename. It applies any hunks at the`,
      `# OLD path and reports success, so the files would be edited in`,
      `# place and never moved. Use git:`,
    );
  } else if (split) {
    // GNU `patch` IS NOT ATOMIC ACROSS FILES — docs/18 D2's second,
    // independent receipt. It matters more here than there: a cross-file
    // toctree move is MULTI-ENTRY BY CONSTRUCTION, one file losing an
    // entry line and another gaining it, so a half-applied patch does
    // not leave the navigation slightly wrong. It drops the page out of
    // the navigation altogether, and leaves a `.rej` beside a file that
    // reports success.
    // Worded for the MECHANISM, not for Sphinx. This branch fires for
    // every multi-file plan — a Hugo reorder touches dozens of pages and
    // no entry travels between them — so a sentence about entries moving
    // between files would be false on most of the patches that carry it.
    // Same sweep the Review-changes button needed: copy naming one
    // adapter, rendered for all of them.
    lines.push(
      `# This patch edits ${files} files that belong to ONE change.`,
      `# Applying only some of them leaves the navigation in a state`,
      `# nobody asked for. Use git, which refuses the whole patch if any`,
      `# part does not apply:`,
    );
  } else {
    lines.push(`# Apply with:`);
  }

  lines.push(
    `#`,
    `#   git apply${n > 0 ? " --unidiff-zero" : ""} <this-file>.patch`,
    `#`,
  );

  // Only where nothing is renamed AND the patch touches one file is the
  // flag-free alternative honest. It was offered on the rename check
  // alone, so a multi-file plan carrying a prepend recommended the one
  // tool that would apply it by halves.
  if (renames.length === 0 && !split && n > 0) {
    lines.push(
      `# or, without needing the flag:`,
      `#`,
      `#   patch -p1 < <this-file>.patch`,
      `#`,
    );
  }

  if (renames.length > 0) {
    lines.push(
      `# Do NOT add --3way. It reads the pre-image from the index, so a`,
      `# file you deleted from your working tree is silently restored at`,
      `# the new path, and the patch stops being all-or-nothing.`,
      `#`,
    );
  }

  for (const path of prepends) lines.push(`#   gains front matter: ${path}`);
  for (const path of renames) lines.push(`#   renamed: ${path}`);
  return lines.join("\n") + "\n\n";
}

/** The destination path of every rename this patch carries, in plan order. */
export function renamedPaths(changes: readonly FileChange[]): string[] {
  return changes
    .filter(
      (change): change is Extract<FileChange, { kind: "move" }> => change.kind === "move",
    )
    .map((change) => `${change.fromPath} → ${change.toPath}`);
}
