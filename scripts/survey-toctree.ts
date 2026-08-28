/**
 * survey-toctree.ts — The TOCTREE BLOCK CENSUS behind docs/19 (Sphinx phase 2).
 *
 * docs/12 shipped phase 1 read-only and surveyed ONE corpus (godot-docs) for
 * what the nav IS. Phase 2 has to WRITE, and writing asks a different
 * question: where in a file does a toctree block SIT? A planner that may
 * rewrite entry lines needs to know whether the blocks it edits are the last
 * thing in their file (append/rewrite at the tail is cheap and the diff
 * context is trivially safe) or whether prose follows them (every rewrite is
 * a mid-file splice, and the lock disposition for those carriers is a real
 * design decision, not a detail).
 *
 *   pnpm exec vite-node scripts/survey-toctree.ts ~/godot-docs
 *   pnpm exec vite-node scripts/survey-toctree.ts ~/cpython --sub Doc
 *   pnpm exec vite-node scripts/survey-toctree.ts ~/godot-docs --out scripts/data/toctree-census --label godot
 *
 * THE SCANNER IS IMPORTED, NOT RESTATED. `scanToctrees` comes from
 * `src/collections/rst.ts` — the same function `expand` and `parse` use.
 * docs/12 decision 2 made "one scanner, shared" a requirement of the ADAPTER;
 * it has to bind the survey too, or the census measures a regex that the
 * product does not run and the phase-2 plan is sized against fiction.
 *
 * THE SPLIT THIS SCRIPT REFUSES TO COLLAPSE (CLAUDE.md: conflation is the
 * house failure mode). Three things all look like "the block is at the end":
 *
 *   LAST BLOCK      the final `.. toctree::` in the file. Every carrier has
 *                   exactly one. Says nothing about what follows it.
 *   TRAILING RUN    the maximal SUFFIX of blocks separated from each other
 *                   only by inert lines. A file can have a five-block
 *                   trailing run and still have prose after all five.
 *   TAIL-TO-EOF     the trailing run reaches EOF with no content line after
 *                   it. This is the one a planner can act on.
 *
 * Only the third licenses "rewrite the tail". Reporting the first as if it
 * were the third is how a mid-file splice gets costed as an append.
 *
 * EXACT RULES, stated because every number below turns on them:
 *
 *   BLANK LINE    `line.trim() === ""`.
 *   COMMENT SPAN  a line matching `^(\s*)\.\.(\s|$)` that is NOT a directive
 *                 (`.. name::`) and NOT a hyperlink target (`.. _label:`),
 *                 plus every following line that is blank or indented deeper
 *                 than the marker. RST renders none of it.
 *   BLOCK SPAN    `[block.startLine, block.endLine)` as `scanToctrees`
 *                 reports it.
 *   INERT LINE    blank, inside a comment span, or inside a block span.
 *   CONTENT LINE  anything else. Prose, headings, other directives, labels.
 *   TRAILING RUN  walking backwards from the last block, extend the run
 *                 while the gap to the previous block holds no CONTENT line.
 *   TAIL REGION   `[firstBlockOfTrailingRun.startLine, EOF)`.
 *   TAIL-TO-EOF   the tail region holds no CONTENT line. Equivalent, given
 *                 the run rule, to "only blank lines and comments follow the
 *                 last block" — which is why the run definition and the tail
 *                 test use one shared notion of inertness rather than two.
 *   MID-FILE      a carrier that is NOT tail-to-EOF: content follows its
 *                 last block. Split again on WHAT follows — `paragraph`,
 *                 `directive`, `invisible` (see TrailingKind). All three
 *                 defeat a naive append; only the first two put something
 *                 on the page below the nav, so a disposition written for
 *                 "prose after the nav" is sized wrong if it counts the
 *                 invisible ones. These are the subjects of the phase-2
 *                 lock disposition, so their full paths are receipts, not
 *                 a sample — pass `--out` to write them.
 *
 * A STRICTER variant is reported alongside, where a comment counts as
 * content. The gap between the two is exactly the population where a
 * maintainer note sits below the nav ("keep these alphabetical"), which
 * docs/12 already flagged as a house rule a tool can silently break.
 *
 * Rebuilding the five corpora (all read-only; godot-docs is the docs/12
 * reference corpus and must never be modified):
 *
 *   godot    git clone --depth 1 https://github.com/godotengine/godot-docs.git ~/godot-docs
 *            # surveyed at 5a1dda5d, 1596 .rst; no --sub (conf.py at repo root)
 *
 *   cpython  git clone --filter=blob:none --depth 1 --sparse \
 *              https://github.com/python/cpython.git ~/corpora/cpython
 *            git -C ~/corpora/cpython sparse-checkout set Doc
 *            # surveyed at a7bb524f, 557 .rst; --sub Doc
 *
 *   linux    git clone --filter=blob:none --depth 1 --sparse \
 *              https://github.com/torvalds/linux.git ~/corpora/linux
 *            git -C ~/corpora/linux sparse-checkout set Documentation
 *            # surveyed at 8d3ae592, 3989 .rst; --sub Documentation
 *
 *   ansible  git clone --filter=blob:none --depth 1 \
 *              https://github.com/ansible/ansible-documentation.git ~/corpora/ansible
 *            # surveyed at 528974f3, 405 .rst; --sub docs/docsite/rst
 *
 *   blender  MEASURED. projects.blender.org IS reachable; there is no
 *            GitHub mirror (github.com/blender/blender-manual 404s). The
 *            repo uses git-lfs for images, so a plain clone dies with
 *            "git-lfs: command not found" on a machine without it — the
 *            filter overrides below are what make the clone succeed, and
 *            the sparse set keeps it to the .rst files this census reads.
 *
 *            git -c filter.lfs.smudge= -c filter.lfs.process= \
 *                -c filter.lfs.required=false \
 *                clone --filter=blob:none --depth 1 --no-checkout --sparse \
 *                https://projects.blender.org/blender/blender-manual.git ~/corpora/blender
 *            git -C ~/corpora/blender sparse-checkout set --no-cone \
 *                '/manual/**' '!/manual/images'
 *            git -C ~/corpora/blender -c filter.lfs.smudge= \
 *                -c filter.lfs.process= -c filter.lfs.required=false checkout
 *            # surveyed at ec379305, 2374 .rst (36 MB); --sub manual
 *
 * Read-only. Never writes to a corpus, never fetches. `--out` writes only
 * inside this repository.
 */

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { scanToctrees, type ToctreeBlock } from "@/collections/rst";

// ── arguments ────────────────────────────────────────────────

const root = process.argv[2];
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const SUB = flag("--sub");
const OUT = flag("--out");
const LABEL = flag("--label");
/** How many multi-block carriers to print in the sectioning-idiom table. */
const TOP = Number(flag("--top") ?? 5);

if (!root) {
  console.error(
    "usage: vite-node scripts/survey-toctree.ts <corpus-root> [--sub <dir>] [--out <dir>] [--label <name>] [--top <n>]",
  );
  process.exit(1);
}

const SCAN_ROOT = SUB === undefined ? resolve(root) : join(resolve(root), SUB);
if (!existsSync(SCAN_ROOT)) {
  console.error(`no such directory: ${SCAN_ROOT}`);
  process.exit(1);
}
const label = LABEL ?? basename(resolve(root));

// ── corpus walk ──────────────────────────────────────────────

/** `.git` only. Everything else a Sphinx project ships is fair game — a
 *  `_build` or a vendored theme that holds toctrees is a real carrier the
 *  app would also see, and pruning it here would hide it. */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === ".git") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".rst")) out.push(full);
  }
  return out;
}

const toPosix = (p: string) => p.split("\\").join("/");
const rel = (full: string) => toPosix(relative(SCAN_ROOT, full));

const files = walk(SCAN_ROOT).sort();

// ── line classification ──────────────────────────────────────

const EXPLICIT_RE = /^(\s*)\.\.(\s|$)/;
const DIRECTIVE_RE = /^\s*\.\.\s+[^\s].*::/;
const LABEL_RE = /^\s*\.\.\s+_/;
/** Looser than the scanner's, on purpose: it counts what a naive regex
 *  census WOULD have found, so a gap between the two is visible rather
 *  than assumed absent. */
const LOOSE_MARKER_RE = /^\s*\.\.\s+toctree::/;

const isBlank = (line: string) => line.trim() === "";

/** docutils COLUMNS, matching the shipped scanner: a tab advances to the
 *  next multiple of 8. Kept in step with `rst.ts` deliberately — this
 *  file exists to measure what the product sees, so an indent rule that
 *  differs from the product's measures something else. Verified
 *  inert on godot and the kernel: every committed census number is
 *  byte-identical before and after. */
function indentOf(line: string): number {
  let col = 0;
  for (const ch of line) {
    if (ch === " ") col++;
    else if (ch === "\t") col += 8 - (col % 8);
    else break;
  }
  return col;
}

/** `.. |name| directive::` — a substitution definition. Renders nothing
 *  where it sits; it defines a token used elsewhere in the document. */
const SUBSTITUTION_RE = /^\s*\.\.\s+\|[^|]+\|/;

/**
 * Explicit-markup spans: a `..` marker line plus every following line that
 * is blank or indented deeper than it. `accept` selects WHICH markers open
 * a span, which is the only thing separating the three masks below.
 */
function markupMask(lines: string[], accept: (line: string) => boolean): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = EXPLICIT_RE.exec(line);
    if (!m || !accept(line)) continue;
    // Columns on BOTH sides of the comparison below. Fixing one and not
    // the other would compare a column against a character count.
    const base = indentOf(m[1]!);
    mask[i] = true;
    let j = i + 1;
    while (j < lines.length && (isBlank(lines[j]!) || indentOf(lines[j]!) > base)) {
      mask[j] = true;
      j++;
    }
    i = j - 1;
  }
  return mask;
}

const isComment = (line: string) => !DIRECTIVE_RE.test(line) && !LABEL_RE.test(line);
/** Renders nothing AT THIS POSITION: a comment, a hyperlink target, or a
 *  substitution definition. */
const isPlacementInvisible = (line: string) =>
  isComment(line) || LABEL_RE.test(line) || SUBSTITUTION_RE.test(line);

/**
 * WHAT follows a mid-file carrier's last block. Three referents, not two —
 * an earlier cut called everything non-paragraph "markup-only", which put
 * `.. seealso::` (a rendered admonition box, right under the nav) in the
 * same bucket as `.. |image0| image:: …` (renders nothing there at all).
 * Those are opposite answers to "does the reader see anything below the
 * nav", so they get separate names.
 *
 *   invisible  only comments, labels and substitution definitions follow.
 *              Nothing is rendered after the nav.
 *   directive  at least one rendering directive (`.. seealso::`, `.. note::`)
 *              but no bare paragraph.
 *   paragraph  at least one bare text line or section heading.
 *
 * All three defeat a naive append-at-EOF, so all three are mid-file. Only
 * `invisible` means the reader sees nothing after the nav.
 */
type TrailingKind = "invisible" | "directive" | "paragraph";

interface TailVerdict {
  /** Index of the first block of the trailing run. */
  runStart: number;
  /** Blocks in the trailing run. */
  runLength: number;
  /** No content line from the run's first marker to EOF. */
  tailToEOF: boolean;
  /** Content lines after the LAST block — the mid-file evidence. */
  trailingContent: number;
}

interface Carrier {
  path: string;
  blocks: ToctreeBlock[];
  /** Comments inert — the primary rule. */
  tol: TailVerdict;
  /** Comments count as content — the sensitivity check. */
  strict: TailVerdict;
  /** What follows the last block. Meaningless when `tol.tailToEOF`. */
  trailing: TrailingKind;
}

/**
 * One rule, applied twice. `isContent` is the ONLY difference between the
 * two verdicts, and it is threaded through BOTH the run extension and the
 * tail test — computing the run one way and testing it the other produces a
 * mixed rule whose numbers belong to neither, which is the first version of
 * this function and the reason it is parameterized now.
 */
function verdict(
  lines: string[],
  blocks: ToctreeBlock[],
  isContent: (i: number) => boolean,
): TailVerdict {
  const hasContent = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (isContent(i)) return true;
    return false;
  };

  let runStart = blocks.length - 1;
  while (
    runStart > 0 &&
    !hasContent(blocks[runStart - 1]!.endLine, blocks[runStart]!.startLine)
  ) {
    runStart--;
  }

  let tailToEOF = true;
  for (let i = blocks[runStart]!.startLine; i < lines.length; i++) {
    if (isContent(i)) tailToEOF = false;
  }

  let trailingContent = 0;
  for (let i = blocks[blocks.length - 1]!.endLine; i < lines.length; i++) {
    if (isContent(i)) trailingContent++;
  }

  return { runStart, runLength: blocks.length - runStart, tailToEOF, trailingContent };
}

function analyse(path: string, text: string, blocks: ToctreeBlock[]): Carrier {
  const lines = text.split("\n");
  const comments = markupMask(lines, isComment);
  const invisible = markupMask(lines, isPlacementInvisible);
  const anyMarkup = markupMask(lines, () => true);
  const inBlock = new Array<boolean>(lines.length).fill(false);
  for (const b of blocks) {
    for (let i = b.startLine; i < Math.min(b.endLine, lines.length); i++)
      inBlock[i] = true;
  }

  const isContent = (i: number) => !isBlank(lines[i]!) && !comments[i] && !inBlock[i];
  let trailing: TrailingKind = "invisible";
  for (let i = blocks[blocks.length - 1]!.endLine; i < lines.length; i++) {
    if (!isContent(i)) continue;
    if (!anyMarkup[i]) trailing = "paragraph";
    else if (!invisible[i] && trailing !== "paragraph") trailing = "directive";
  }

  return {
    path,
    blocks,
    tol: verdict(lines, blocks, isContent),
    strict: verdict(lines, blocks, (i) => !isBlank(lines[i]!) && !inBlock[i]),
    trailing,
  };
}

// ── scan ─────────────────────────────────────────────────────

const carriers: Carrier[] = [];
let looseMarkersTotal = 0;
let unreadable = 0;

for (const full of files) {
  let text: string;
  try {
    text = readFileSync(full, "utf8");
  } catch {
    unreadable++;
    continue;
  }
  for (const line of text.split("\n"))
    if (LOOSE_MARKER_RE.test(line)) looseMarkersTotal++;
  const blocks = scanToctrees(text);
  if (blocks.length === 0) continue;
  carriers.push(analyse(rel(full), text, blocks));
}

const allBlocks = carriers.flatMap((c) => c.blocks);
const pct = (n: number, d: number) => (d === 0 ? "0.0" : ((100 * n) / d).toFixed(1));

// ── 1. carriers ──────────────────────────────────────────────

const lines: string[] = [];
const say = (s = "") => {
  lines.push(s);
  console.log(s);
};

say(`===== ${label} =====`);
say(`root                 ${SCAN_ROOT}`);
say(
  `.rst files           ${files.length}${unreadable > 0 ? `  (${unreadable} unreadable)` : ""}`,
);
say(
  `carriers             ${carriers.length}  (${pct(carriers.length, files.length)}% of files)`,
);
say(`toctree blocks       ${allBlocks.length}`);
say(`toctree entries      ${allBlocks.reduce((n, b) => n + b.entries.length, 0)}`);
say(
  `loose \`.. toctree::\` markers ${looseMarkersTotal} vs ${allBlocks.length} blocks scanned` +
    (looseMarkersTotal === allBlocks.length
      ? "  (no gap)"
      : "  ← GAP: scanner skipped some"),
);

// ── 2. blocks per carrier ────────────────────────────────────

const byCount = new Map<number, number>();
for (const c of carriers)
  byCount.set(c.blocks.length, (byCount.get(c.blocks.length) ?? 0) + 1);
const one = byCount.get(1) ?? 0;

say();
say("blocks per carrier");
say("  n  carriers   %");
for (const n of [...byCount.keys()].sort((a, b) => a - b)) {
  const v = byCount.get(n)!;
  say(
    `  ${String(n).padStart(2)}  ${String(v).padStart(8)}  ${pct(v, carriers.length).padStart(5)}`,
  );
}
say(`  exactly one block: ${one}/${carriers.length} = ${pct(one, carriers.length)}%`);

// ── 3/4. the nav tail ────────────────────────────────────────

const tail = carriers.filter((c) => c.tol.tailToEOF);
const tailStrict = carriers.filter((c) => c.strict.tailToEOF);
const midFile = carriers
  .filter((c) => !c.tol.tailToEOF)
  .sort((a, b) => a.path.localeCompare(b.path));
const midFileStrictOnly = carriers
  .filter((c) => c.tol.tailToEOF && !c.strict.tailToEOF)
  .sort((a, b) => a.path.localeCompare(b.path));

say();
say("the nav tail");
say(
  `  tail-to-EOF (comments inert — PRIMARY)  ${tail.length}/${carriers.length} = ${pct(tail.length, carriers.length)}%`,
);
say(
  `  tail-to-EOF (strict, comments count as content)  ${tailStrict.length}/${carriers.length} = ${pct(tailStrict.length, carriers.length)}%`,
);
say(`  MID-FILE carriers (content after the last block)  ${midFile.length}`);
const kinds: TrailingKind[] = ["paragraph", "directive", "invisible"];
const KIND_NOTE: Record<TrailingKind, string> = {
  paragraph: "bare text or a section heading",
  directive: "a rendering directive (.. seealso::, .. note::) — the reader sees it",
  invisible: "labels + substitution definitions only — nothing renders there",
};
for (const k of kinds) {
  const n = midFile.filter((c) => c.trailing === k).length;
  say(`      trailing ${k.padEnd(10)} ${String(n).padStart(4)}   ${KIND_NOTE[k]}`);
}
say(
  `  MID-FILE under the strict rule                   ${carriers.length - tailStrict.length}`,
);
const runDist = new Map<number, number>();
for (const c of carriers)
  runDist.set(c.tol.runLength, (runDist.get(c.tol.runLength) ?? 0) + 1);
say(
  `  trailing-run length: ${[...runDist.keys()]
    .sort((a, b) => a - b)
    .map((k) => `${k}×${runDist.get(k)!}`)
    .join(" ")}`,
);

say();
say(`MID-FILE FILE LIST (${midFile.length})`);
for (const c of midFile) {
  say(
    `  ${c.path}  [${c.blocks.length} block${c.blocks.length === 1 ? "" : "s"}, ${c.tol.trailingContent} content line${c.tol.trailingContent === 1 ? "" : "s"} after last, ${c.trailing}]`,
  );
}
say(
  `STRICT-ONLY (a COMMENT, not prose, sits in or after the trailing run) (${midFileStrictOnly.length})`,
);
for (const c of midFileStrictOnly) say(`  ${c.path}`);

// ── 5. :glob: ────────────────────────────────────────────────

const globBlocks = allBlocks.filter((b) => b.options.some((o) => o.startsWith(":glob:")));
const globFiles = carriers
  .filter((c) => c.blocks.some((b) => b.options.some((o) => o.startsWith(":glob:"))))
  .sort((a, b) => a.path.localeCompare(b.path));

say();
say(`:glob: blocks ${globBlocks.length} in ${globFiles.length} files`);
for (const c of globFiles) {
  const n = c.blocks.filter((b) => b.options.some((o) => o.startsWith(":glob:"))).length;
  say(`  ${c.path}  [${n} glob block${n === 1 ? "" : "s"}]`);
}

// ── 6. multi-block carriers ──────────────────────────────────

const caption = (b: ToctreeBlock): string => {
  const c = b.options.find((o) => o.startsWith(":caption:"));
  return c === undefined ? "—" : c.slice(":caption:".length).trim();
};

const multi = carriers
  .filter((c) => c.blocks.length > 1)
  .sort((a, b) => b.blocks.length - a.blocks.length || a.path.localeCompare(b.path));

say();
say(
  `multi-block carriers: ${multi.length}; top ${Math.min(TOP, multi.length)} by block count`,
);
for (const c of multi.slice(0, TOP)) {
  say(
    `  ${c.path}  ×${c.blocks.length}  (tail-to-EOF ${c.tol.tailToEOF ? "yes" : "NO"})`,
  );
  for (const b of c.blocks) {
    say(`      :caption: ${caption(b)}   (${b.entries.length} entries)`);
  }
}

// ── 7. option frequency ──────────────────────────────────────

const OPTION_NAME_RE = /^:([a-zA-Z0-9_-]+):/;
const KNOWN = [
  "maxdepth",
  "numbered",
  "titlesonly",
  "hidden",
  "caption",
  "name",
  "glob",
] as const;

const optCount = new Map<string, number>();
const optValues = new Map<string, Map<string, number>>();
for (const b of allBlocks) {
  for (const o of b.options) {
    const m = OPTION_NAME_RE.exec(o);
    const name = m ? m[1]! : `«unparsed» ${o}`;
    optCount.set(name, (optCount.get(name) ?? 0) + 1);
    const v = o.slice(m ? m[0]!.length : 0).trim();
    const vals = optValues.get(name) ?? new Map<string, number>();
    vals.set(v === "" ? "(flag)" : v, (vals.get(v === "" ? "(flag)" : v) ?? 0) + 1);
    optValues.set(name, vals);
  }
}

say();
say(`option frequency across ${allBlocks.length} blocks`);
for (const name of KNOWN) {
  const n = optCount.get(name) ?? 0;
  say(
    `  :${name}:`.padEnd(18) +
      `${String(n).padStart(5)}  ${pct(n, allBlocks.length).padStart(5)}%`,
  );
}
const others = [...optCount.keys()]
  .filter((k) => !(KNOWN as readonly string[]).includes(k))
  .sort((a, b) => optCount.get(b)! - optCount.get(a)!);
if (others.length === 0) say("  (no option outside the known list)");
for (const name of others) {
  say(
    `  :${name}: ★`.padEnd(18) +
      `${String(optCount.get(name)!).padStart(5)}  ${pct(optCount.get(name)!, allBlocks.length).padStart(5)}%  ← NOT in the known list`,
  );
}
say("  values seen:");
for (const name of [...KNOWN, ...others]) {
  const vals = optValues.get(name);
  if (!vals) continue;
  const shown = [...vals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([v, n]) => `${v}×${n}`)
    .join(", ");
  say(`    :${name}: ${shown}${vals.size > 6 ? ` (+${vals.size - 6} more)` : ""}`);
}

// ── entry shapes ─────────────────────────────────────────────

/**
 * Not asked for by the census, but free once the blocks are scanned and
 * directly load-bearing for phase 2: a move rewrites an ENTRY LINE, so the
 * shapes those lines come in are the shapes the planner has to carry
 * verbatim. `foo/index.rst` and `foo/index` are the same docname written
 * two ways, and a corpus that mixes them will notice a normalizer.
 */
const allEntries = allBlocks.flatMap((b) => b.entries);
const shape = {
  doc: allEntries.filter((e) => e.kind === "doc").length,
  glob: allEntries.filter((e) => e.kind === "glob").length,
  external: allEntries.filter((e) => e.kind === "external").length,
  self: allEntries.filter((e) => e.kind === "self").length,
  explicitTitle: allEntries.filter((e) => e.title !== undefined).length,
  withSuffix: allEntries.filter((e) => /\.rst$/.test(e.target)).length,
  absolute: allEntries.filter((e) => e.target.startsWith("/")).length,
};
say();
say(`entry shapes across ${allEntries.length} entries`);
for (const [k, v] of Object.entries(shape)) {
  say(
    `  ${k.padEnd(16)}${String(v).padStart(6)}  ${pct(v, allEntries.length).padStart(5)}%`,
  );
}

// ── cross-corpus row ─────────────────────────────────────────

/** One TSV line per corpus, so the comparison table in the note is
 *  assembled by concatenation rather than by retyping numbers. */
say();
say(
  "SUMMARY\tcorpus\tfiles\tcarriers\tcarrier%\tblocks\tentries\t1block%\ttailEOF%\tmidfile\tglobBlocks",
);
say(
  [
    "SUMMARY",
    label,
    files.length,
    carriers.length,
    pct(carriers.length, files.length),
    allBlocks.length,
    allBlocks.reduce((n, b) => n + b.entries.length, 0),
    pct(one, carriers.length),
    pct(tail.length, carriers.length),
    midFile.length,
    globBlocks.length,
  ].join("\t"),
);

// ── receipts ─────────────────────────────────────────────────

if (OUT !== undefined) {
  const dir = resolve(OUT);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${label}.txt`);
  writeFileSync(file, lines.join("\n") + "\n", "utf8");
  console.log(`\nwrote ${file}`);
}
