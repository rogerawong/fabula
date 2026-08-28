/**
 * target.ts — Shared model→target interpretation for collection
 * planners. Converts the edited TocDocument (+ canvas section order)
 * into a plain target tree, applying the two canvas-shape collapses
 * every collection adapter agrees on (mirrored in verify.normalizeDoc):
 * - an ORPHAN section IS its page: the wrapped topic (matched by path)
 *   is authoritative for the title; extra topics dropped in become the
 *   page's children
 * - a pathless single-topic section titled like its topic (the
 *   drag-to-canvas leaf wrap) is the topic itself at top level
 */

import type { TocDocument, Topic } from "@/model/types";

/** A node of the TARGET structure: backed by a file/dir (path) or to
 *  be created (path: null). */
export interface TargetNode {
  path: string | null;
  title: string;
  children: TargetNode[];
}

export function targetFromModel(doc: TocDocument, sectionOrder: string[]): TargetNode[] {
  const byId = new Map(doc.sections.map((s) => [s.id, s]));
  const topicNode = (t: Topic): TargetNode => ({
    path: t.path ?? null,
    title: t.title,
    children: t.children.map(topicNode),
  });
  const out: TargetNode[] = [];
  for (const id of sectionOrder) {
    const s = byId.get(id);
    if (!s) continue;
    const only = s.topics[0];
    if (s.isOrphan && s.topics.length > 0) {
      // an orphan section IS its page: the wrapped topic (matched by
      // path) is authoritative for title/children; any other topics the
      // user dropped in become the page's children
      const wrapped =
        s.topics.find((t) => t.path !== undefined && t.path === s.path) ??
        (s.topics.length === 1 ? only : undefined);
      if (wrapped) {
        out.push({
          path: wrapped.path ?? s.path ?? null,
          title: wrapped.title,
          children: [
            ...wrapped.children.map(topicNode),
            ...s.topics.filter((t) => t !== wrapped).map(topicNode),
          ],
        });
        continue;
      }
    }
    if (!s.path && s.topics.length === 1 && only && only.title === s.title) {
      // leaf-wrap from drag-to-canvas: the section IS the page — the
      // page simply lives at top level now, no stub needed
      out.push(topicNode(only));
      continue;
    }
    out.push({
      path: s.path ?? null,
      title: s.title,
      children: s.topics.map(topicNode),
    });
  }
  return out;
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "page";
}
