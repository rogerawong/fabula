/**
 * tree.ts — Pure(ish) helpers over the neutral TOC tree.
 *
 * Mutation helpers mutate the given objects in place — they are designed
 * to run inside Immer `produce` recipes (commands), where "mutation" is
 * recorded as patches. Query helpers never mutate.
 *
 * Everything is addressed by id, never by array index.
 */

import { newId } from "./id";
import type { Section, SectionId, TocDocument, Topic, TopicId } from "./types";

// ── Cloning ─────────────────────────────────────────────────

/** Deep-clone an extras bag (JSON-safe values only, which YAML guarantees) */
export function cloneExtras(
  extras: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!extras) return undefined;
  return JSON.parse(JSON.stringify(extras)) as Record<string, unknown>;
}

/** Deep-clone a topic subtree. Fresh ids by default (safe for duplication). */
export function cloneTopic(t: Topic, opts?: { keepIds?: boolean }): Topic {
  return {
    ...t,
    id: opts?.keepIds ? t.id : newId(),
    extras: cloneExtras(t.extras),
    children: t.children.map((c) => cloneTopic(c, opts)),
  };
}

export function cloneSection(s: Section, opts?: { keepIds?: boolean }): Section {
  return {
    ...s,
    id: opts?.keepIds ? s.id : newId(),
    extras: cloneExtras(s.extras),
    topics: s.topics.map((t) => cloneTopic(t, opts)),
  };
}

/**
 * Deep-clone a whole document so tabs can mutate independently.
 * Fresh ids everywhere (including the document id) by default.
 */
export function cloneDocument(
  doc: TocDocument,
  opts?: { keepIds?: boolean },
): TocDocument {
  return {
    ...doc,
    id: opts?.keepIds ? doc.id : newId(),
    extras: cloneExtras(doc.extras),
    sections: doc.sections.map((s) => cloneSection(s, opts)),
  };
}

// ── Queries ─────────────────────────────────────────────────

export function findSection(doc: TocDocument, sectionId: SectionId): Section | null {
  return doc.sections.find((s) => s.id === sectionId) ?? null;
}

/** Locate a topic anywhere in a section. Returns its parent list + index. */
export interface TopicLocation {
  section: Section;
  /** null when the topic sits at the section's top level */
  parent: Topic | null;
  /** The list the topic lives in (section.topics or parent.children) */
  siblings: Topic[];
  index: number;
  topic: Topic;
}

function locateInList(
  section: Section,
  parent: Topic | null,
  list: Topic[],
  topicId: TopicId,
): TopicLocation | null {
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (!t) continue;
    if (t.id === topicId) {
      return { section, parent, siblings: list, index: i, topic: t };
    }
    const found = locateInList(section, t, t.children, topicId);
    if (found) return found;
  }
  return null;
}

export function locateTopic(section: Section, topicId: TopicId): TopicLocation | null {
  return locateInList(section, null, section.topics, topicId);
}

export function locateTopicInDocument(
  doc: TocDocument,
  topicId: TopicId,
): TopicLocation | null {
  for (const section of doc.sections) {
    const found = locateTopic(section, topicId);
    if (found) return found;
  }
  return null;
}

export function findTopic(section: Section, topicId: TopicId): Topic | null {
  return locateTopic(section, topicId)?.topic ?? null;
}

/** Does `topic`'s subtree (strictly below it) contain `id`? */
export function subtreeContains(topic: Topic, id: TopicId): boolean {
  return topic.children.some((c) => c.id === id || subtreeContains(c, id));
}

/**
 * Guard for drag-and-drop: true when `descendantId` sits inside
 * `ancestorId`'s subtree — dropping there would orphan the subtree.
 */
export function isDescendantOf(
  section: Section,
  ancestorId: TopicId,
  descendantId: TopicId,
): boolean {
  const ancestor = findTopic(section, ancestorId);
  return ancestor ? subtreeContains(ancestor, descendantId) : false;
}

/** Every topic id in a section, depth-first. */
export function allTopicIds(section: Section): TopicId[] {
  const ids: TopicId[] = [];
  const walk = (t: Topic) => {
    ids.push(t.id);
    t.children.forEach(walk);
  };
  section.topics.forEach(walk);
  return ids;
}

// ── Mutations (in-place; run inside Immer recipes) ──────────

/**
 * Remove a topic (with its subtree) from a section.
 * Returns the removed topic, or null if not found.
 */
export function removeTopic(section: Section, topicId: TopicId): Topic | null {
  const loc = locateTopic(section, topicId);
  if (!loc) return null;
  loc.siblings.splice(loc.index, 1);
  return loc.topic;
}

/**
 * Remove a topic (with its subtree) from whichever section holds it.
 * Returns the removed topic, or null if not found.
 */
export function removeTopicFromDocument(
  doc: TocDocument,
  topicId: TopicId,
): Topic | null {
  const loc = locateTopicInDocument(doc, topicId);
  if (!loc) return null;
  loc.siblings.splice(loc.index, 1);
  return loc.topic;
}

/**
 * Insert a topic under `parentTopicId` (or at the section's top level when
 * null) at `index` (clamped). Returns false if the parent doesn't exist.
 */
export function insertTopic(
  section: Section,
  topic: Topic,
  parentTopicId: TopicId | null,
  index: number,
): boolean {
  const list =
    parentTopicId === null ? section.topics : findTopic(section, parentTopicId)?.children;
  if (!list) return false;
  list.splice(Math.max(0, Math.min(index, list.length)), 0, topic);
  return true;
}

/**
 * Rename a topic. Clears `titleDerived` — an explicit rename means the
 * name must be written on export even if it was originally derived —
 * without this, export invents a name for every derived-title node.
 * Returns true if found.
 */
export function renameTopic(
  section: Section,
  topicId: TopicId,
  newTitle: string,
): boolean {
  const topic = findTopic(section, topicId);
  if (!topic) return false;
  topic.title = newTitle;
  topic.titleDerived = false;
  return true;
}

/** Rename a section; clears `titleDerived` (same contract as topics). */
export function renameSection(section: Section, newTitle: string): void {
  section.title = newTitle;
  section.titleDerived = false;
  // THE PLACEHOLDER IS SPENT (docs/22, Decision 2). `untitled` says the
  // title is a stand-in nobody replaced, and this IS somebody replacing
  // it — so it clears here, at the one place a section's title changes,
  // rather than at each caller who might remember to.
  delete section.untitled;
}

// ── Section factories ───────────────────────────────────────

/** New section wrapping the given topics as its top level. */
export function createSection(title: string, topics: Topic[]): Section {
  return { id: newId(), title, topics };
}

/**
 * New section by "unwrapping" a parent topic: its title/path/extras become
 * the section's, its children become the section's top-level topics.
 * Used when dragging a parent topic onto empty canvas. Extras carry over
 * so they survive export and undo.
 */
export function createSectionByUnwrapping(topic: Topic): Section {
  return {
    id: newId(),
    title: topic.title,
    titleDerived: topic.titleDerived,
    path: topic.path,
    extras: topic.extras,
    topics: topic.children,
  };
}
