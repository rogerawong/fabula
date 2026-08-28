/**
 * parse.ts — Layered parsing of the LLM's response (plan: "Malformed
 * response handling", Layers 1–3).
 *
 * L1 Extraction: prefer a fenced block; else trim leading/trailing
 *    prose; JSON fallback when the model ignored the text format.
 * L2 Tolerant lexer: strips bullets/numbering/emphasis, any indent
 *    width or tabs, parent-stack depth resolution. NEVER throws.
 * L3 Strict identity: unknown ids, duplicate ids, interior junk are
 *    collected as structured errors for the guided retry.
 */

import type { ResultNode } from "./contract";

export interface ParseOutcome {
  nodes: ResultNode[];
  /** Empty = valid. Non-empty = feed back to the model (one retry). */
  errors: string[];
}

// ── L2: line lexer ──────────────────────────────────────────

interface LexedLine {
  indent: number;
  node: ResultNode;
}

const ID_RE = /^([st]\d+)\b/;

/** Strip list markers, markdown emphasis, trailing colons. The marker
 *  itself is removed WITHOUT widening the indent — "- x", "* x" and
 *  "1. x" at the same leading whitespace must lex to the same depth. */
function scrub(text: string): string {
  return text
    .replace(/^(\s*)(?:[-*•]|\d+[.)])\s+/, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/:\s*$/, "");
}

/** Lex one line; null = not an outline line (prose/junk). */
function lexLine(raw: string): LexedLine | null {
  const scrubbed = scrub(raw.replace(/\t/g, "  "));
  const indent = scrubbed.length - scrubbed.trimStart().length;
  const body = scrubbed.trim();
  if (!body) return null;

  // new group: "+ Title"
  const plus = body.match(/^\+\s*(.+)$/);
  if (plus) {
    return { indent, node: { title: plus[1]!.trim() } };
  }

  const id = body.match(ID_RE);
  if (!id) return null;
  const rest = body.slice(id[1]!.length).trim();
  // optional separator (~ — – - :) then title text; a bare echo counts
  // as title text too (rename decision happens later, by difference)
  const title = rest.replace(/^[~\-–—:]\s*/, "").trim();
  return {
    indent,
    node: { id: id[1]!, ...(title ? { title } : {}) },
  };
}

// ── L1: extraction ──────────────────────────────────────────

function extractBlock(raw: string): { lines: string[]; interiorJunk: string[] } {
  let content = raw;
  const fence = raw.match(/```[a-z]*\n([\s\S]*?)```/i);
  if (fence) content = fence[1]!;

  const all = content.split("\n");
  // trim leading/trailing prose (lines that don't lex)
  let start = 0;
  let end = all.length;
  while (start < end && lexLine(all[start]!) === null && all[start]!.trim() !== "") {
    start++;
  }
  while (end > start && lexLine(all[end - 1]!) === null) end--;

  const lines: string[] = [];
  const interiorJunk: string[] = [];
  for (let i = start; i < end; i++) {
    const line = all[i]!;
    if (line.trim() === "") continue;
    if (lexLine(line) === null) {
      interiorJunk.push(
        `line ${i + 1}: not an outline line: "${line.trim().slice(0, 60)}"`,
      );
    } else {
      lines.push(line);
    }
  }
  return { lines, interiorJunk };
}

/** JSON fallback: the model returned {id/title/children} trees. */
function tryJsonFallback(raw: string): ResultNode[] | null {
  const stripped = raw.replace(/```[a-z]*\n?|```/gi, "").trim();
  if (!stripped.startsWith("[") && !stripped.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }
  const toNode = (v: unknown): ResultNode | null => {
    if (typeof v !== "object" || v === null) return null;
    const o = v as Record<string, unknown>;
    const node: ResultNode = {};
    if (typeof o.id === "string" && ID_RE.test(o.id)) node.id = o.id;
    if (typeof o.title === "string" && o.title.trim()) node.title = o.title.trim();
    if (Array.isArray(o.children)) {
      node.children = o.children.map(toNode).filter((n): n is ResultNode => n !== null);
    }
    return node.id || node.title ? node : null;
  };
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>).toc)
      ? ((parsed as Record<string, unknown>).toc as unknown[])
      : [parsed];
  const nodes = arr.map(toNode).filter((n): n is ResultNode => n !== null);
  return nodes.length > 0 ? nodes : null;
}

// ── L3: tree build + identity validation ────────────────────

function collectIdErrors(nodes: ResultNode[], knownIds: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const walk = (list: ResultNode[]) => {
    for (const node of list) {
      if (node.id) {
        if (!knownIds.has(node.id)) {
          errors.push(`unknown id "${node.id}" — use only ids from the outline`);
        } else if (seen.has(node.id)) {
          errors.push(`id "${node.id}" appears more than once`);
        }
        seen.add(node.id);
      }
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return errors;
}

export function parseResponse(raw: string, knownIds: ReadonlySet<string>): ParseOutcome {
  // JSON fallback first when the shape screams JSON
  const jsonNodes = tryJsonFallback(raw);
  if (jsonNodes) {
    return { nodes: jsonNodes, errors: collectIdErrors(jsonNodes, knownIds) };
  }

  const { lines, interiorJunk } = extractBlock(raw);
  if (lines.length === 0) {
    return { nodes: [], errors: ["no outline lines found in the response"] };
  }

  // parent-stack tree build: deeper → child; else nearest shallower
  const roots: ResultNode[] = [];
  const stack: { indent: number; node: ResultNode }[] = [];
  for (const line of lines) {
    const lexed = lexLine(line)!;
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= lexed.indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1]?.node;
    if (parent) {
      (parent.children ??= []).push(lexed.node);
    } else {
      roots.push(lexed.node);
    }
    stack.push({ indent: lexed.indent, node: lexed.node });
  }

  return {
    nodes: roots,
    errors: [...interiorJunk, ...collectIdErrors(roots, knownIds)],
  };
}
