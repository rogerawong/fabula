/**
 * rst.ts — The ONE reStructuredText scanner: toctree blocks + document
 * titles (docs/12).
 *
 * Both halves of the Sphinx pipeline read through this module. `expand`
 * uses it to discover which documents to ingest next; `parse` uses it to
 * build the model. Two scanners that drift is how the ingest set and the
 * parsed model silently disagree — a bug class the round-trip law cannot
 * catch, because both sides stay self-consistent (docs/12, decision 2).
 *
 * Everything needed to re-emit a block byte-identically is recorded: the
 * marker indent, the content indent as BOTH a column and the literal bytes
 * that produced it (per block — the corpus mixes 3 and 4 spaces inside one
 * directory and tabs in 13 kernel files, so neither is ever normalized),
 * option lines verbatim and in order, and each entry's raw text.
 * Serialization is therefore `contentPrefix + entry.raw` — only ever
 * existing lines reordered, which is what makes moves-only true by
 * construction.
 */

/** How an entry is treated. Only `doc` entries are movable. */
export type EntryKind = "doc" | "glob" | "external" | "self";

export interface ToctreeEntry {
  /** The line exactly as written, minus its indentation. Re-emitted verbatim. */
  raw: string;
  /** Explicit label, when the entry uses the `Title <target>` form. */
  title?: string;
  /** What the entry points at: a docname, a URL, a glob pattern, or "self". */
  target: string;
  kind: EntryKind;
  /** 0-based line index in the source text. */
  line: number;
}

export interface ToctreeBlock {
  /** Indent of the `.. toctree::` marker itself. */
  markerIndent: number;
  /**
   * The content lines' indent COLUMN, docutils-expanded. NEVER
   * normalized — see docblock. Read it to compare depths.
   */
  contentIndent: number;
  /**
   * The content lines' literal indent BYTES — what `emitEntry` writes.
   *
   * Split from the column above rather than derived from it, because a
   * width cannot say which whitespace produced it: 8 is one tab, eight
   * spaces, or two spaces and a tab, and rebuilding it as
   * `" ".repeat(n)` corrupts the file in the two cases that are not
   * spaces. 13 kernel files indent their toctree bodies with tabs.
   */
  contentPrefix: string;
  /**
   * This block's line terminator: `"\r"` in a CRLF source, `""` otherwise.
   * Entries store trimmed content, so the terminator has to be re-attached
   * on emit or a CRLF document loses one byte per rewritten line. It lives
   * on the BLOCK rather than the entry because an entry moved between files
   * must adopt its DESTINATION's ending, not carry its origin's.
   */
  eol: string;
  /** Option lines verbatim and in order, without indentation (":maxdepth: 1"). */
  options: string[];
  entries: ToctreeEntry[];
  /** 0-based line index of the `.. toctree::` marker. */
  startLine: number;
  /** 0-based index one past the last line this block owns. */
  endLine: number;
}

const TOCTREE_RE = /^(\s*)\.\.\s+toctree::\s*$/;
const OPTION_RE = /^\s*:[a-zA-Z0-9_-]+:/;
const EXPLICIT_TITLE_RE = /^(.*?)<([^<>]*)>$/;
const URL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
/** A directive or comment marker: `.. name::`, `.. _label:`, `.. text`. */
const EXPLICIT_MARKUP_RE = /^(\s*)\.\.(\s|$)/;
/** Top-level field list entry, e.g. `:orphan:` or `:allow_comments: False`. */
const FIELD_RE = /^:[^:\s][^:]*:/;

/**
 * docutils' TAB WIDTH. Not a preference: `string2lines` reads every
 * source line through `expandtabs(tab_width)` and the `--tab-width`
 * default is 8, so this is the width Sphinx itself measured with.
 */
const TAB_WIDTH = 8;

/**
 * The indent COLUMN, as docutils counts it.
 *
 * A tab advances to the next tab STOP, so it is worth between 1 and 8
 * columns depending on where it starts — `"  \t"` is column 8, not 3
 * and not 10. Counting characters instead made a tab-indented body
 * measure 1, which is shallower than any indented marker, and body
 * detection (`indentOf(line) > markerIndent`) then DROPPED the block's
 * entries. A lost subtree, not a lost byte.
 *
 * This is the column only. The literal bytes that produced it are the
 * block's `contentPrefix`, and re-emission uses those — a width cannot
 * say which whitespace it came from.
 */
function indentOf(line: string): number {
  let col = 0;
  for (const ch of line) {
    if (ch === " ") col++;
    else if (ch === "\t") col += TAB_WIDTH - (col % TAB_WIDTH);
    else break;
  }
  return col;
}

/** The literal leading whitespace of a line — what re-emission writes. */
function prefixOf(line: string): string {
  return line.slice(0, line.length - line.trimStart().length);
}

/** A section underline/overline: one punctuation character, repeated. */
function isAdornment(line: string): boolean {
  const s = line.trim();
  if (s.length < 2) return false;
  if (!/^[!-/:-@[-`{-~]$/.test(s[0]!)) return false;
  return s === s[0]!.repeat(s.length);
}

/**
 * What this LINE is. Not what its block does.
 *
 * This took a `globbed` argument and returned `pattern` for every entry
 * of a globbing block, so a plain docname acquired a description that
 * was false about it while standing in for a refusal that belonged to
 * its BLOCK. Two referents under one name (docs/19).
 *
 * A BLOCK LOCK IS ENFORCEMENT; AN ENTRY KIND IS LABELING. Whether a line
 * may be rewritten is the block's property — a globbing block builds its
 * list from patterns, so none of its lines is one the planner may touch,
 * and that refusal is answered once, for the block. What a line IS is
 * the line's own property, and it exists to tell the reader what they
 * are looking at.
 */
function classify(target: string): EntryKind {
  if (URL_RE.test(target)) return "external";
  if (target === "self") return "self";
  if (target.includes("*") || target.includes("?")) return "glob";
  return "doc";
}

/**
 * Does this block GENERATE its list? The enforcement half of the split.
 *
 * `:glob:` expands patterns at build time, so the rendered order is not
 * the written order and no line here may be moved or rewritten —
 * including the plain docnames that are legal alongside the patterns.
 * 15 blocks across four corpora (7 kernel, 8 ansible, 4 blender); zero
 * in godot, which is why phase 1 never had to name it.
 */
export function isGlobbed(block: ToctreeBlock): boolean {
  return block.options.some((o) => o.startsWith(":glob:"));
}

function makeEntry(raw: string, line: number): ToctreeEntry {
  const m = EXPLICIT_TITLE_RE.exec(raw);
  if (m && m[1]!.trim() !== "") {
    const target = m[2]!.trim();
    return { raw, title: m[1]!.trim(), target, kind: classify(target), line };
  }
  return { raw, target: raw, kind: classify(raw), line };
}

/**
 * Every `.. toctree::` block in a document, in file order.
 *
 * A directive body is the run of lines indented deeper than the marker,
 * including interior blank lines. Options come first; the first
 * non-option content line ends the option run and fixes `contentIndent`.
 */
export function scanToctrees(text: string): ToctreeBlock[] {
  const lines = text.split("\n");
  const blocks: ToctreeBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const marker = TOCTREE_RE.exec(lines[i]!);
    if (!marker) continue;

    // The MARKER's column, by the same rule: a tab-indented marker with
    // a deeper tab-indented body is legal, and measuring either in
    // characters makes the comparison between them meaningless.
    const markerPrefix = marker[1]!;
    const markerIndent = indentOf(markerPrefix);
    const startLine = i;
    const body: { text: string; line: number }[] = [];
    let j = i + 1;

    while (j < lines.length) {
      const line = lines[j]!;
      if (line.trim() === "") {
        // A blank line stays inside the body only if the body resumes.
        let k = j;
        while (k < lines.length && lines[k]!.trim() === "") k++;
        if (k < lines.length && indentOf(lines[k]!) > markerIndent) {
          j = k;
          continue;
        }
        break;
      }
      if (indentOf(line) <= markerIndent) break;
      body.push({ text: line, line: j });
      j++;
    }

    const options: string[] = [];
    const entries: ToctreeEntry[] = [];
    let contentPrefix: string | null = null;

    const contentLines: { text: string; line: number }[] = [];
    for (const item of body) {
      if (OPTION_RE.test(item.text) && contentPrefix === null) {
        options.push(item.text.trim());
        continue;
      }
      if (contentPrefix === null) contentPrefix = prefixOf(item.text);
      contentLines.push(item);
    }
    for (const item of contentLines) {
      entries.push(makeEntry(item.text.trim(), item.line));
    }

    blocks.push({
      markerIndent,
      // An option-only block still has to round-trip; mirror Sphinx's own
      // convention of one deeper level than the marker. Built from the
      // marker's OWN prefix so a tab-indented directive stays tabbed.
      contentIndent: indentOf(contentPrefix ?? markerPrefix + "   "),
      contentPrefix: contentPrefix ?? markerPrefix + "   ",
      eol: lines[startLine]!.endsWith("\r") ? "\r" : "",
      options,
      entries,
      startLine,
      endLine: body.length > 0 ? body[body.length - 1]!.line + 1 : startLine + 1,
    });
    i = j - 1;
  }

  return blocks;
}

/**
 * Re-emit one entry line at its block's own indent and line ending.
 *
 * The PREFIX, never the width. `" ".repeat(block.contentIndent)` was
 * right for every space-indented corpus and rewrote `"\tentry"` as
 * `" entry"` — one tab becoming one space, in a file phase 1 promised
 * not to touch.
 */
export function emitEntry(block: ToctreeBlock, entry: ToctreeEntry): string {
  return block.contentPrefix + entry.raw + block.eol;
}

/**
 * Sphinx's own default `source_suffix`, and the default here for the
 * same reason: an entry written `library/index.rst` names the DOCUMENT
 * `library/index`, and a resolver that keeps the suffix looks for a file
 * called `library/index.rst.rst`.
 */
export const DEFAULT_SOURCE_SUFFIXES: readonly string[] = [".rst"];

/**
 * Resolve a toctree entry target to a docname. Leading `/` means "from
 * the source root"; anything else is relative to the referring document's
 * directory. Returns a normalized, slash-separated docname.
 *
 * Relative resolution is against the containing document's DIRECTORY,
 * quoting the directive documentation verbatim:
 *
 *   "Relative document names (not beginning with a slash) are relative
 *    to the document the directive occurs in, absolute names are
 *    relative to the source directory."
 *   — sphinx-doc.org/en/master/usage/restructuredtext/directives.html
 *
 * SUFFIX STRIPPING comes first, and it is not optional politeness —
 * Sphinx does it, so a corpus that writes suffixes is not unusual, it is
 * supported. `TocTree.parse_content`, sphinx-doc/sphinx master:
 *
 *     # remove suffixes (backwards compatibility)
 *     for suffix in suffixes:
 *         if docname.endswith(suffix):
 *             docname = docname.removesuffix(suffix)
 *             break
 *
 * Omitting it did not degrade gracefully. CPython writes the suffix on
 * every one of its 526 entries, so the whole corpus resolved to files
 * that do not exist and imported as a nav of `missing` rows titled
 * "Index.Rst" — populated, confident and wrong.
 */
export function resolveDocname(
  target: string,
  fromDoc: string,
  suffixes: readonly string[] = DEFAULT_SOURCE_SUFFIXES,
): string {
  // FIRST match wins and the loop stops, matching Sphinx's `break`: with
  // [".rst", ".txt"] configured, `page.txt` is `page` either way, but a
  // greedy loop would differ on a name ending in two of them.
  let name = target;
  for (const suffix of suffixes) {
    if (suffix !== "" && name.endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
      break;
    }
  }
  if (name.startsWith("/")) return normalizeDocname(name.slice(1));
  const dir = fromDoc.includes("/") ? fromDoc.slice(0, fromDoc.lastIndexOf("/")) : "";
  return normalizeDocname(dir === "" ? name : `${dir}/${name}`);
}

/** Collapse `.` and `..` segments without touching the filesystem. */
function normalizeDocname(path: string): string {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.join("/");
}

/**
 * A document's title: its first section title.
 *
 * Skips the leading field list (`:orphan:`), comments and directives
 * (with their indented bodies), and hyperlink targets (`.. _label:`).
 * Prose may legally precede the title — `tutorials/2d/index.rst` opens
 * with three paragraphs before its `2D` heading — so this scans for the
 * first text/adornment pair rather than taking the first text line.
 */
export function documentTitle(text: string): string | undefined {
  const lines = text.split("\n");
  let i = 0;

  // Leading field list, before any content.
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (!FIELD_RE.test(line)) break;
    i++;
    while (i < lines.length && indentOf(lines[i]!) > 0) i++;
  }

  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;

    const markup = EXPLICIT_MARKUP_RE.exec(line);
    if (markup) {
      // Skip the whole explicit-markup block: its indented continuation.
      const base = markup[1]!.length;
      i++;
      while (
        i < lines.length &&
        (lines[i]!.trim() === "" || indentOf(lines[i]!) > base)
      ) {
        i++;
      }
      i--;
      continue;
    }

    // Overline form: adornment / text / matching adornment.
    if (isAdornment(line) && i + 2 < lines.length) {
      const title = lines[i + 1]!;
      if (title.trim() !== "" && lines[i + 2]!.trim() === line.trim()) {
        return title.trim();
      }
    }

    // Underline form: text / adornment at least as long as the text.
    const next = lines[i + 1];
    if (
      next !== undefined &&
      isAdornment(next) &&
      next.trim().length >= line.trim().length
    ) {
      return line.trim();
    }
  }

  return undefined;
}
