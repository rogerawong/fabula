/**
 * verify.ts — Verification-by-simulation: apply a change plan to an
 * in-memory snapshot, re-parse, and compare the resulting nav against
 * the edited model. Used by the conformance tests AND at runtime by
 * the review dialog — a plan that fails simulation is shown as a
 * warning, never silently trusted.
 */

import type { Section, TocDocument, Topic } from "@/model/types";
import { spliceNavHead } from "./navHead";
import { spliceNavTail } from "./navTail";
import type { CollectionAdapter, FileChange, FilesSnapshot } from "./types";

/**
 * The bytes a change produces, HONOURING ITS REGION.
 *
 * This function ignored `region` entirely and wrote `newContent`
 * wholesale. That was invisible while `navHead` was the only region —
 * the snapshot it is called with holds nav heads, so a head replacing a
 * head is the same operation either way — and it made this an oracle
 * that agreed with a straw man: docs/16 recorded exactly that, an
 * expected-bytes check that would have blessed any splice at all.
 *
 * With `navTail` it is not invisible. A tail region is a SUFFIX of a
 * whole host file, so writing it wholesale truncates every byte of prose
 * above the nav — and `simulatePlan` re-parses the result, so the
 * document would lose its own title and the simulation would fail with a
 * generic mismatch instead of naming the cause.
 *
 * ONE RULE, THREE CONSUMERS: the File System Access writer, the patch
 * writer and this simulator all splice through the same functions.
 * Applied prophylactically, which is the point of `guards.ts` — three
 * re-derivations discovered to disagree later is the shape that let the
 * sidebar commit the move the canvas refused.
 */
function bytesOf(files: FilesSnapshot, change: FileChange): string {
  if (change.region === undefined) return change.newContent;
  // The ORIGINAL bytes at the source, read before any vacating — the
  // same order the File System Access writer uses, and for the same
  // reason: a plan may move a→b while b is itself a source.
  const from = change.kind === "move" ? change.fromPath : change.path;
  const current = files[from] ?? "";
  switch (change.region) {
    case "navHead":
      return spliceNavHead(current, change.newContent);
    case "navTail":
      return spliceNavTail(current, change.newContent);
  }
}

export function applyChanges(files: FilesSnapshot, changes: FileChange[]): FilesSnapshot {
  // Simultaneous semantics: vacate every move source FIRST, then write
  // every target — a plan may move a→b while b's old content moves on
  // elsewhere (directory shuffles do this), and sequential handling
  // would delete the freshly-written b.
  const next: FilesSnapshot = { ...files };
  const written = changes.map((change) => bytesOf(files, change));
  for (const change of changes) {
    if (change.kind === "move") delete next[change.fromPath];
  }
  for (const [i, change] of changes.entries()) {
    next[change.kind === "move" ? change.toPath : change.path] = written[i]!;
  }
  return next;
}

/**
 * Structure-only view for comparison: every root canonicalized to
 * `{title, path, children}`. Orphan wrappers (and pathless leaf-wrap
 * sections) collapse to their page — matching how collection adapters
 * interpret the model, so "orphan gained children" and "top-level page
 * with children" compare equal, as they should: they are the same
 * on-disk reality.
 */
export function normalizeDoc(doc: TocDocument): unknown {
  const topic = (t: Topic): unknown => ({
    title: t.title,
    path: t.path,
    children: t.children.map(topic),
  });
  const root = (s: Section): unknown => {
    const only = s.topics[0];
    if (s.isOrphan && s.topics.length > 0) {
      // an orphan section IS its page: wrapped topic is authoritative;
      // extra topics the user dropped in are the page's children
      const wrapped =
        s.topics.find((t) => t.path !== undefined && t.path === s.path) ??
        (s.topics.length === 1 ? only : undefined);
      if (wrapped) {
        return {
          title: wrapped.title,
          path: wrapped.path,
          children: [
            ...wrapped.children.map(topic),
            ...s.topics.filter((t) => t !== wrapped).map(topic),
          ],
        };
      }
    }
    if (s.topics.length === 1 && only && !s.path && only.title === s.title) {
      return topic(only);
    }
    return {
      title: s.title,
      path: s.path,
      children: s.topics.map(topic),
    };
  };
  return doc.sections.map(root);
}

/** Re-order the model's sections to a given order (simulating what the
 *  canvas order means for the export). */
export function docInOrder(doc: TocDocument, sectionOrder: string[]): TocDocument {
  const byId = new Map(doc.sections.map((s) => [s.id, s]));
  return {
    ...doc,
    sections: sectionOrder
      .map((id) => byId.get(id))
      .filter((s): s is Section => Boolean(s)),
  };
}

export interface SimulationResult {
  ok: boolean;
  /** Human-readable mismatch description when not ok. */
  detail?: string;
}

/**
 * The law: parse(apply(planChanges(...))) must equal the edited model
 * (structure-only — created stubs get real paths, so compare titles/
 * hierarchy; paths compare when both sides have them).
 */
export function simulatePlan(
  adapter: CollectionAdapter,
  files: FilesSnapshot,
  doc: TocDocument,
  sectionOrder: string[],
  changes: FileChange[],
): SimulationResult {
  const patched = applyChanges(files, changes);
  const reparsed = adapter.parse(patched, doc.name);

  const expected = JSON.stringify(
    stripPaths(normalizeDoc(docInOrder(doc, sectionOrder))),
  );
  const actual = JSON.stringify(stripPaths(normalizeDoc(reparsed.doc)));
  if (expected === actual) return { ok: true };
  return {
    ok: false,
    detail: "re-parsing the planned changes does not reproduce the edited structure",
  };
}

/** Created stubs are assigned paths the model doesn't know — compare
 *  structure by title/hierarchy only. */
function stripPaths(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripPaths);
  if (typeof node === "object" && node !== null) {
    const { path: _path, ...rest } = node as Record<string, unknown>;
    return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, stripPaths(v)]));
  }
  return node;
}
