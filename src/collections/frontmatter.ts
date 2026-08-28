/**
 * frontmatter.ts — Byte-preserving frontmatter surgery (the collection
 * adapters' scalpel). Edits ONLY the managed keys it is told to touch,
 * at column 0, leaving every other byte of the file — body, unmanaged
 * keys, comments, EOL style, BOM — identical.
 *
 * Jekyll-compatibility notes encoded here:
 * - Ruby's Psych takes the LAST duplicate key; js-yaml THROWS unless
 *   `json: true` — parseFrontmatter uses it, and edits target the last
 *   occurrence of a duplicated key.
 * - The block opener is `---` at byte 0 (a UTF-8 BOM may precede it);
 *   the closer is the first subsequent line that is `---` ignoring
 *   trailing whitespace, so `---` horizontal rules in bodies are never
 *   touched but a real page closing with `--- ` still parses (issue #1).
 */

import yaml from "js-yaml";

const BOM = "\uFEFF";

export interface FrontmatterBlock {
  /** "" or the BOM that preceded the opener. */
  bom: string;
  /** "\n" or "\r\n", detected from the first line break. */
  eol: string;
  /** Raw lines BETWEEN the --- fences (no fences included). */
  lines: string[];
  /** Everything from the closing fence's line start onward. */
  rest: string;
  /** Parsed mapping (Psych-compatible last-wins). null = unparsable. */
  data: Record<string, unknown> | null;
}

export function parseFrontmatter(content: string): FrontmatterBlock | null {
  const bom = content.startsWith(BOM) ? BOM : "";
  const body = bom ? content.slice(1) : content;
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  if (!body.startsWith(`---${eol}`) && !body.startsWith("---\n")) return null;

  const usedEol = body.startsWith(`---\r\n`) ? "\r\n" : "\n";
  const afterOpener = body.slice(3 + usedEol.length);
  const lines = afterOpener.split(usedEol);
  // Trailing whitespace on the closer is accepted: Hugo and Jekyll both
  // read it, and requiring exactly "---" silently dropped every key of a
  // real kubernetes/website page (issue #1). The closer line belongs to
  // `rest`, so its bytes — trailing space included — survive surgery.
  const closerIdx = lines.findIndex((l) => l.trimEnd() === "---");
  if (closerIdx < 0) return null;

  const fmLines = lines.slice(0, closerIdx);
  const rest = lines.slice(closerIdx).join(usedEol);

  let data: Record<string, unknown> | null = null;
  try {
    const parsed = yaml.load(fmLines.join("\n"), { json: true });
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    } else if (parsed == null) {
      data = {};
    }
  } catch {
    data = null;
  }

  return { bom, eol: usedEol, lines: fmLines, rest, data };
}

/** Line index of the LAST column-0 occurrence of `key`, or -1. */
function lastKeyLine(lines: string[], key: string): number {
  const re = new RegExp(`^${key}[ \\t]*:`);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (re.test(lines[i]!)) return i;
  }
  return -1;
}

/** True when the key's raw line holds a plain scalar we can rewrite
 *  (not a block scalar, anchor, or flow collection opener). */
function isEditableScalarLine(line: string): boolean {
  const value = line.slice(line.indexOf(":") + 1).trim();
  if (value === "") return true; // key with value on same line only
  return !/^[|>&*]/.test(value);
}

/** Serialize one scalar the way js-yaml would (handles quoting). */
export function dumpScalar(value: string | number | boolean): string {
  return yaml.dump(value, { lineWidth: -1 }).trimEnd();
}

/**
 * The two verbs are deliberately separate.
 *
 * `set` REPLACES a scalar; `prepend` JOINS a list. They were nearly one
 * field, and folding them would have made the docs/16 alias write
 * silently discard whatever redirects a page already declared — pages
 * do declare them. One name serving both operations is this project's
 * house failure mode; the two-sentence test separates them cleanly:
 * "set writes the weight this page should sort by" / "set writes the
 * redirects this page should keep".
 */
export interface FrontmatterEdits {
  set?: Record<string, string | number | boolean>;
  remove?: string[];
  /**
   * Managed LIST keys, new items first (docs/16 alias-on-move).
   *
   * A separate verb from `set` because the operation is different: a
   * scalar is replaced, a list is JOINED. Folding it into `set` would
   * mean the alias write silently discarded whatever redirects a page
   * already declared — and pages do: the corpus has them.
   *
   * Block style only, and conservative in the same way `set` is: an
   * existing flow list (`aliases: [a, b]`) or a scalar under the same
   * key is REFUSED rather than reformatted, because rewriting a shape
   * this planner did not author is how a "minimal honest edit" stops
   * being either.
   */
  prepend?: Record<string, string[]>;
}

export interface SurgeryResult {
  content: string;
  /** Keys that could not be edited safely (non-scalar values). */
  refused: string[];
}

/**
 * The core surgery, shared by frontmatter blocks and bare YAML files
 * (_category_.yml): rewrite/insert/remove column-0 managed keys in a
 * line array, leaving every other line byte-identical. Set → rewrite
 * the LAST occurrence (preserving a trailing comment when the raw
 * value is comment-safe) or append; remove → delete the line(s).
 */
export function editManagedLines(
  input: string[],
  edits: FrontmatterEdits,
): { lines: string[]; changed: boolean; refused: string[] } {
  const lines = [...input];
  const refused: string[] = [];
  let changed = false;

  for (const key of edits.remove ?? []) {
    const re = new RegExp(`^${key}[ \\t]*:`);
    for (let i = lines.length - 1; i >= 0; i--) {
      if (re.test(lines[i]!)) {
        lines.splice(i, 1);
        changed = true;
      }
    }
  }

  for (const [key, value] of Object.entries(edits.set ?? {})) {
    const idx = lastKeyLine(lines, key);
    const rendered = `${key}: ${dumpScalar(value)}`;
    if (idx >= 0) {
      const line = lines[idx]!;
      if (!isEditableScalarLine(line)) {
        refused.push(key);
        continue;
      }
      // preserve a trailing comment iff the raw value cannot itself
      // contain # or quotes (conservative)
      const commentMatch = line.match(/^[^:#"']*:[^#"']*(#.*)$/);
      const next = commentMatch ? `${rendered} ${commentMatch[1]}` : rendered;
      if (next !== line) {
        lines[idx] = next;
        changed = true;
      }
    } else {
      // append after the last non-empty line (bare files often end
      // with a trailing newline; keep it trailing)
      let end = lines.length;
      while (end > 0 && lines[end - 1] === "") end--;
      lines.splice(end, 0, rendered);
      changed = true;
    }
  }

  for (const [key, items] of Object.entries(edits.prepend ?? {})) {
    if (items.length === 0) continue;
    const rendered = items.map((item) => `- ${dumpScalar(item)}`);
    const idx = lastKeyLine(lines, key);
    if (idx < 0) {
      let end = lines.length;
      while (end > 0 && lines[end - 1] === "") end--;
      lines.splice(end, 0, `${key}:`, ...rendered);
      changed = true;
      continue;
    }
    // The key exists. Only a BLOCK list may be joined: a bare `key:`
    // whose items follow as `- ` lines. Anything else — a flow list, a
    // scalar — is a shape this planner did not author.
    const head = lines[idx]!;
    if (!/^[^\s:]+[ \t]*:[ \t]*$/.test(head)) {
      refused.push(key);
      continue;
    }
    const existing = new Set<string>();
    let after = idx + 1;
    while (after < lines.length && /^[ \t]*-[ \t]/.test(lines[after]!)) {
      existing.add(lines[after]!.replace(/^[ \t]*-[ \t]*/, "").trim());
      after++;
    }
    // Idempotence: an alias already present is not added twice, which is
    // what lets `planChanges(parse(apply(plan)))` come back empty.
    const fresh = rendered.filter(
      (line) => !existing.has(line.replace(/^-[ \t]*/, "").trim()),
    );
    if (fresh.length === 0) continue;
    lines.splice(idx + 1, 0, ...fresh);
    changed = true;
  }

  return { lines, changed, refused };
}

/**
 * Apply managed-key edits to a frontmatter block. Returns the original
 * content untouched when there is nothing to do.
 */
export function applyFrontmatterEdits(
  content: string,
  edits: FrontmatterEdits,
): SurgeryResult {
  const block = parseFrontmatter(content);
  if (!block) return { content, refused: Object.keys(edits.set ?? {}) };

  const { bom, eol } = block;
  const { lines, changed, refused } = editManagedLines(block.lines, edits);

  if (!changed) return { content, refused };
  const rebuilt = `${bom}---${eol}${lines.map((l) => l + eol).join("")}${block.rest}`;
  return { content: rebuilt, refused };
}

/**
 * Apply managed-key edits to a BARE YAML file (no --- fences), e.g.
 * Docusaurus `_category_.yml`. Same byte-preservation guarantees:
 * only the managed column-0 lines change; nested blocks, comments,
 * and EOL style survive.
 */
export function applyYamlFileEdits(
  content: string,
  edits: FrontmatterEdits,
): SurgeryResult {
  const bom = content.startsWith(BOM) ? BOM : "";
  const body = bom ? content.slice(1) : content;
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const { lines, changed, refused } = editManagedLines(body.split(eol), edits);
  if (!changed) return { content, refused };
  return { content: bom + lines.join(eol), refused };
}
