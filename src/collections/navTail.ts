/**
 * navTail.ts — The region of a Sphinx document that carries navigation
 * (docs/19), and docs/15's `navHead` seen from the other end.
 *
 * TWO-SENTENCE TEST, which is why the name survives: "a `navHead` is the
 * file's front matter — the bytes before the body"; "a `navTail` is the
 * file's trailing toctree run — the bytes after it". Same use, opposite
 * ends.
 *
 * But the regions are NOT the same shape, and pretending otherwise is how
 * this would go wrong. A head is entirely nav. A tail is MOSTLY nav: the
 * section headings that label its blocks sit inside it and are reproduced
 * verbatim, because a captioned block and a heading-labelled block are
 * the same authoring intent and only one of them has a `:caption:`.
 *
 * THE BOUNDARY LAW, settled by entry coverage rather than by symmetry
 * with the head: the region runs from the first directive of the trailing
 * SEQUENCE to EOF, where a sequence may be interrupted by a section
 * heading. The strict reading — blocks separated only by blank lines —
 * leaves 22% of godot's entries editable against 93%, because godot's
 * dominant idiom is `heading + toctree` repeated. An adapter that cannot
 * edit 78% of the corpus it was designed against is not an adapter.
 *
 * THE COMPLEMENT IS THE REFUSAL SET, and it gets three names rather than
 * one "no tail", because the three are different facts about the file and
 * the user is owed the one that is true:
 *
 *   no-toctree     the document declares no nav at all.
 *   mid-file       content follows the last block, so there is no region
 *                  to anchor: an append would land above that content.
 *   prose-in-span  prose sits BETWEEN blocks of the trailing sequence.
 *                  The carrier is partly editable and partly not, which
 *                  is a shape a card cannot express — a card's rows come
 *                  from all of its blocks, so a plan targeting one could
 *                  rewrite a line the region does not own.
 *
 * Subjects for the last two are committed per corpus under
 * `scripts/data/toctree-census/`; `scripts/survey-navtail.ts` measures
 * coverage THROUGH THIS MODULE, so the census can never describe a rule
 * the product does not run.
 */

import { scanToctrees } from "./rst";

/**
 * Why a document has no editable region AT ALL. Two facts, two names.
 *
 * `prose-in-span` used to be a third, and it was a SECOND RULE bolted
 * beside the boundary law rather than a consequence of it. The law
 * already says what a sequence is — blocks separated only by blanks,
 * inert markup and section HEADINGS — so prose is simply not one of the
 * things a sequence may cross, and the region is the last maximal
 * sequence reaching EOF. Blocks above the prose are outside it and lock.
 */
export type NavTailRefusal = "no-toctree" | "mid-file";

export type NavTail =
  | {
      ok: true;
      /** The region's bytes: first directive of the sequence → EOF. */
      text: string;
      /** 0-based line index where the region starts. */
      startLine: number;
      /**
       * Index of the FIRST block inside the region.
       *
       * Everything before it is outside the trailing sequence: read as
       * navigation, never rewritten. Consumers need the index rather than
       * the line, because what they lock is a BLOCK.
       */
      fromBlock: number;
      /** Byte offset where the region starts. */
      start: number;
    }
  | { ok: false; reason: NavTailRefusal };

/** A directive or comment marker: `.. name::`, `.. _label:`, `.. text`. */
const EXPLICIT_RE = /^(\s*)\.\.(\s|$)/;
const DIRECTIVE_RE = /^\s*\.\.\s+[^\s].*::/;
const LABEL_RE = /^\s*\.\.\s+_/;

const TAB_WIDTH = 8;

/** docutils COLUMNS — see `rst.ts`; a tab advances to the next stop. */
function indentOf(line: string): number {
  let col = 0;
  for (const ch of line) {
    if (ch === " ") col++;
    else if (ch === "\t") col += TAB_WIDTH - (col % TAB_WIDTH);
    else break;
  }
  return col;
}

const isBlank = (line: string): boolean => line.trim() === "";

/** A section underline/overline: one punctuation character, repeated. */
function isAdornment(line: string): boolean {
  const s = line.trim();
  if (s.length < 2) return false;
  if (!/^[!-/:-@[-`{-~]$/.test(s[0]!)) return false;
  return s === s[0]!.repeat(s.length);
}

/**
 * COMMENT SPANS ONLY — a `..` marker that is neither a directive nor a
 * hyperlink target, plus its indented continuation. RST renders none of
 * it, so a maintainer's note under the nav ("keep these alphabetical")
 * does not make a carrier mid-file, while a `.. note::` admonition
 * renders a box the reader sees and does.
 *
 * LABELS AND SUBSTITUTION DEFINITIONS COUNT AS CONTENT, and the choice
 * is the committed census's rather than this module's. Two reasons, and
 * the second arrived unbidden:
 *
 *  - The census under `scripts/data/toctree-census/` lists mid-file
 *    carriers per corpus and docs/19's refusal table cites those counts
 *    (9 / 6 / 97 / 13). Reading them as inert here would make the
 *    product and the receipt disagree by exactly the carriers the census
 *    calls `invisible` — 2 in godot — which is the one thing
 *    "one implementation, one count" forbids.
 *  - It is also the safer reading. godot's two are
 *    `.. |image0| image:: …` definitions whose token is USED EARLIER in
 *    the same document, so a region that swallowed one and re-emitted
 *    the block without it would break an image on a page nobody was
 *    editing.
 */
function inertMarkupMask(lines: string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    const m = EXPLICIT_RE.exec(lines[i]!);
    if (!m) continue;
    const line = lines[i]!;
    if (DIRECTIVE_RE.test(line) || LABEL_RE.test(line)) continue;
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

/**
 * Lines belonging to a section heading, in both RST forms.
 *
 * These are the LABELS the region owns. Marking them is what separates
 * "a sequence interrupted by a heading" — which the law admits — from
 * "a sequence interrupted by prose", which locks the carrier.
 */
function headingMask(lines: string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (!isAdornment(lines[i]!)) continue;
    // Overline: adornment / text / matching adornment.
    if (
      i + 2 < lines.length &&
      !isBlank(lines[i + 1]!) &&
      lines[i + 2]!.trim() === lines[i]!.trim()
    ) {
      mask[i] = true;
      mask[i + 1] = true;
      mask[i + 2] = true;
      i += 2;
      continue;
    }
    // Underline: text / adornment.
    if (i > 0 && !isBlank(lines[i - 1]!) && !isAdornment(lines[i - 1]!)) {
      mask[i] = true;
      mask[i - 1] = true;
    }
  }
  return mask;
}

/**
 * The document's navigable tail, or the reason it has none.
 *
 * Pure and content-only: it takes bytes, never a path or a snapshot, so
 * the same function answers for a file at load and for the different
 * bytes on disk at save.
 */
export function navTailOf(content: string): NavTail {
  const blocks = scanToctrees(content);
  if (blocks.length === 0) return { ok: false, reason: "no-toctree" };

  const lines = content.split("\n");
  const inert = inertMarkupMask(lines);
  const heading = headingMask(lines);
  const inBlock = new Array<boolean>(lines.length).fill(false);
  for (const b of blocks) {
    for (let i = b.startLine; i < b.endLine; i++) inBlock[i] = true;
  }
  const isInert = (i: number): boolean =>
    isBlank(lines[i]!) || inert[i] === true || inBlock[i] === true;

  // MID-FILE: anything the reader sees after the last block means the
  // region cannot be anchored at EOF.
  const last = blocks[blocks.length - 1]!;
  for (let i = last.endLine; i < lines.length; i++) {
    if (!isInert(i)) return { ok: false, reason: "mid-file" };
  }

  // Walk back through the trailing sequence. A gap may hold blanks,
  // inert markup and SECTION HEADINGS; anything else locks the carrier
  // rather than merely shortening the region, because a partly editable
  // carrier is a shape a card cannot express.
  let first = blocks.length - 1;
  for (let i = blocks.length - 1; i > 0; i--) {
    let crossable = true;
    for (let l = blocks[i - 1]!.endLine; l < blocks[i]!.startLine; l++) {
      if (!isInert(l) && heading[l] !== true) {
        crossable = false;
        break;
      }
    }
    // PROSE ENDS THE SEQUENCE. It does not condemn the carrier: the
    // blocks below it are still a maximal heading-interrupted sequence
    // reaching EOF, and that is exactly what the region is.
    if (!crossable) break;
    first = i - 1;
  }

  const startLine = blocks[first]!.startLine;
  // Byte offset of that line: every earlier line plus its terminator.
  let start = 0;
  for (let i = 0; i < startLine; i++) start += lines[i]!.length + 1;
  return { ok: true, text: content.slice(start), startLine, start, fromBlock: first };
}

/**
 * Replace `current`'s nav tail with `tail`, leaving every earlier byte
 * identical. Returns `current` unchanged when it has no region.
 *
 * RE-ANCHORS BY SCANNING, never by an offset captured at load — the
 * settle-during-implementation question docs/19 left open, and docs/15
 * already answered it for the head. The snapshot is what the app loaded
 * or last wrote, never a disk mirror, so the file at save time may carry
 * a body edited since. A stored offset points at whatever slid into
 * those bytes; re-deriving the region from the CURRENT content preserves
 * that edit by construction, which is the property docs/15 built the
 * whole region model to get.
 *
 * TERMINATOR FIDELITY falls out of the same construction: the region
 * runs to EOF, so whether the file ends with a newline is a property of
 * `tail` itself and no separate rule is needed to preserve it.
 */
export function spliceNavTail(current: string, tail: string): string {
  const region = navTailOf(current);
  if (!region.ok) return current;
  return current.slice(0, region.start) + tail;
}

/**
 * Re-emit a region with new entry lines per block.
 *
 * THE RULE IS AN ABSENCE: everything that is not an entry line is copied
 * VERBATIM — markers, option lines, section headings, comments, blank
 * separators, the file's terminator. A tail is mostly nav, not entirely
 * nav, and the remainder is bytes this app does not own.
 *
 * `blockEntries[k]` is the new `raw` text for block `k`, in file order.
 * A successful region always covers every block in the file (the
 * walk-back refuses rather than shortening), so the two are index-aligned
 * and a mismatch is a programming error rather than a document shape.
 *
 * INTERIOR BLANK LINES ARE SEPARATORS, and preserving them is not
 * optional politeness: 48 blocks across the four corpora split their
 * entries into visual groups this way, including godot's own `index.rst`
 * (25 entries in two groups) and cpython's `contents.rst` (16 in two).
 * Writing entries contiguously would delete those separators — silent
 * byte corruption in the reference corpus's own navigation, which is the
 * class the tab fix closed one step earlier.
 *
 * A separator OPENS A GROUP, so it is anchored to the entry that FOLLOWS
 * it and travels with that entry within its block. An entry leaving the
 * block does not take it along, and a separator never lands first. That
 * choice is this module's rather than the note's — docs/19 does not cover
 * interior blanks — and it is recorded here because it writes bytes.
 * For an UNCHANGED block the question never arises: the lines are copied,
 * so the fixpoint law holds by construction rather than by care.
 */
export function emitRegion(
  content: string,
  blockEntries: readonly (readonly string[])[],
): string {
  const region = navTailOf(content);
  if (!region.ok) {
    throw new Error(`emitRegion: this document has no navTail (${region.reason})`);
  }
  // IN-REGION BLOCKS ONLY. A carrier whose sequence starts at its second
  // block keeps the first one's lines out of reach entirely, so passing
  // an entry list for it would be asking to rewrite bytes the region
  // does not own.
  const inRegion = scanToctrees(content).slice(region.fromBlock);
  if (inRegion.length !== blockEntries.length) {
    throw new Error(
      `emitRegion: ${inRegion.length} blocks in the region but ${blockEntries.length} entry lists`,
    );
  }
  const lines = content.split("\n");
  const out: string[] = [];
  let cursor = region.startLine;

  for (const [k, block] of inRegion.entries()) {
    // Whatever sits between the previous block and this one — headings,
    // comments, blanks. Not ours to rewrite.
    for (let i = cursor; i < block.startLine; i++) out.push(lines[i]!);

    const wanted = blockEntries[k]!;
    const first = block.entries[0];
    if (first === undefined) {
      // Option-only block: nothing of ours inside it yet.
      for (let i = block.startLine; i < block.endLine; i++) out.push(lines[i]!);
      for (const raw of wanted) out.push(block.contentPrefix + raw + block.eol);
      cursor = block.endLine;
      continue;
    }

    // Marker, options, and the blank that ends the option run.
    for (let i = block.startLine; i < first.line; i++) out.push(lines[i]!);

    // THE SEPARATOR IS BYTES, NOT A FLAG. A boolean cannot say how many
    // blank lines there were, and the kernel's `arch/arm/index.rst` puts
    // TWO after `pxa/mfp` — the only file of 424 regions across four
    // corpora that failed byte-identical re-emission, and one no fixture
    // set would have contained. Same shape as the tab fix a step earlier:
    // a measurement standing in for the bytes that produced it.
    const opensGroup = new Map<string, string[]>();
    for (const [i, entry] of block.entries.entries()) {
      // The first entry's preceding blanks belong to the option run, not
      // to the entry — they are already in the prefix above.
      if (i === 0) continue;
      const before: string[] = [];
      for (let l = entry.line - 1; l > block.startLine && lines[l]!.trim() === ""; l--) {
        before.unshift(lines[l]!);
      }
      opensGroup.set(entry.raw, before);
    }
    for (const [i, raw] of wanted.entries()) {
      if (i > 0) for (const blank of opensGroup.get(raw) ?? []) out.push(blank);
      out.push(block.contentPrefix + raw + block.eol);
    }

    const last = block.entries[block.entries.length - 1]!;
    for (let i = last.line + 1; i < block.endLine; i++) out.push(lines[i]!);
    cursor = block.endLine;
  }

  for (let i = cursor; i < lines.length; i++) out.push(lines[i]!);
  return out.join("\n");
}
