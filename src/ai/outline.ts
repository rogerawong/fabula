/**
 * outline.ts — Serialize a document (or a scoped subset) into the
 * compact indented-text outline the model receives.
 *
 * Titles only by default; optional folder hints append the DIRECTORY
 * prefix (never basenames). Orphan sections render as their wrapped
 * topic at root. Granularity truncates depth — truncated subtrees show
 * `(+N topics)` and move atomically via children-follow semantics.
 * Unscoped sections become one id-less context line the model cannot
 * reference.
 *
 * PINNED ROWS ARE MARKED AT THE POINT OF USE (docs/10 amendment
 * 2026-08-19). A row the source pins carries `[pinned]` on its own
 * line, beside the title it constrains, rather than being listed in a
 * block the model has to cross-reference. The system message explains
 * the marker ONCE — O(1) tokens — and the outline pays O(rows) for a
 * mark of eight characters. The opposite arrangement, a block naming
 * every pinned id, costs the same order and puts the constraint
 * somewhere other than where it applies.
 *
 * The predicate is imported rather than rewritten as `topic.lock !==
 * undefined` here: the constraint set and the serialization must agree
 * about which rows are pinned, and one name is how they agree.
 */

import { chainKey, countTopics } from "@/model/selectors";
import type { Section, TocDocument, Topic } from "@/model/types";
import { PINNED_MARKER } from "./constraints";
import { isPinned } from "@/model/locks";
import type { IdMap, OutlineResult, ReorganizeOptions } from "./contract";

function sanitizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim() || "Untitled";
}

/** Directory prefix of a path ("guides/writing.md" → "guides/"). */
function dirOf(path: string | undefined): string | null {
  if (!path) return null;
  const idx = path.replace(/\/+$/, "").lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx + 1) : null;
}

function maxTopicDepth(granularity: ReorganizeOptions["granularity"]): number {
  // depth of TOPIC levels included: root entries are always included
  if (granularity === "top") return 0;
  if (granularity === "two") return 1;
  return Number.POSITIVE_INFINITY;
}

/**
 * Sections the model must not empty ALL of, grouped by the container
 * that requires one, addressed by outline id.
 *
 * Containers are invisible to the outline (docs/13) — deliberately, and
 * that is exactly why the constraint has to be spelled out here. Naming
 * the ids is the only form the model can act on: it cannot see that s1
 * and s2 share a tab, so "keep a section in every tab" would be advice
 * it has no way to follow.
 *
 * Scoped runs list only the ids in scope. A container whose cards are
 * all out of scope cannot be emptied by a proposal that may not mention
 * them, so it contributes no line rather than an unactionable one.
 */
export function neverEmptyGroups(
  doc: TocDocument,
  idMap: IdMap,
): { label: string; ids: string[] }[] {
  if (!doc.containers || doc.containers.length === 0) return [];
  const idOf = new Map<string, string>();
  for (const [id, entry] of idMap) {
    if (entry.kind === "section") idOf.set(entry.section.id, id);
  }
  const out: { label: string; ids: string[] }[] = [];
  for (const container of doc.containers) {
    if (container.mayEmpty) continue;
    const ids = doc.sections
      .filter((s) => chainKey(s) === container.chainKey)
      .map((s) => idOf.get(s.id))
      .filter((id): id is string => id !== undefined);
    if (ids.length > 0) out.push({ label: container.label, ids });
  }
  return out;
}

export function buildOutline(
  doc: TocDocument,
  options: ReorganizeOptions,
): OutlineResult {
  const scope = options.scopeSectionIds ? new Set(options.scopeSectionIds) : null;
  const scoped = doc.sections.filter((s) => !scope || scope.has(s.id));
  const unscoped = doc.sections.filter((s) => scope && !scope.has(s.id));
  const depthLimit = maxTopicDepth(options.granularity);

  const idMap: IdMap = new Map();
  const lines: string[] = [];
  let nextSection = 1;
  let nextTopic = 1;
  let topicCount = 0;

  const hint = (path: string | undefined): string => {
    if (!options.folderHints) return "";
    const dir = dirOf(path);
    return dir ? ` | ${dir}` : "";
  };

  const pushTopic = (
    topic: Topic,
    depth: number,
    indent: number,
    sectionId: string,
    orphanSection?: Section,
  ): void => {
    topicCount++;
    const id = `t${nextTopic++}`;
    idMap.set(id, { kind: "topic", topic, sectionId, orphanSection });

    const pad = "  ".repeat(indent);
    // Directly after the title in BOTH branches: a truncated subtree's
    // head is still a row the model can move, so it still needs its
    // mark.
    const pin = isPinned(topic) ? ` ${PINNED_MARKER}` : "";
    if (depth >= depthLimit && topic.children.length > 0) {
      // truncated: subtree moves atomically (children-follow), hidden
      // descendants get no ids
      const hidden = countTopics(topic.children).total;
      topicCount += hidden;
      lines.push(`${pad}${id} ${sanitizeTitle(topic.title)}${pin} (+${hidden} topics)`);
      return;
    }
    lines.push(`${pad}${id} ${sanitizeTitle(topic.title)}${pin}${hint(topic.path)}`);
    for (const child of topic.children) {
      pushTopic(child, depth + 1, indent + 1, sectionId);
    }
  };

  for (const section of scoped) {
    const wrapped = section.topics[0];
    if (section.isOrphan && section.topics.length === 1 && wrapped) {
      // orphan = its inner topic at root; remember the wrapper
      pushTopic(wrapped, 0, 0, section.id, section);
      continue;
    }
    const id = `s${nextSection++}`;
    idMap.set(id, { kind: "section", section });
    if (depthLimit === 0) {
      const total = countTopics(section.topics).total;
      topicCount += total;
      lines.push(`${id} ${sanitizeTitle(section.title)} (+${total} topics)`);
      continue;
    }
    lines.push(`${id} ${sanitizeTitle(section.title)}${hint(section.path)}`);
    for (const topic of section.topics) {
      pushTopic(topic, 1, 1, section.id);
    }
  }

  const contextLine =
    unscoped.length > 0
      ? `Other sections (context only — do not include in your answer): ` +
        unscoped.map((s) => sanitizeTitle(s.title)).join(", ")
      : null;

  const text = lines.join("\n");
  const estTokens = Math.ceil((text.length + (contextLine?.length ?? 0)) / 4);

  return {
    text,
    contextLine,
    idMap,
    stats: {
      scopedSections: scoped.length,
      totalSections: doc.sections.length,
      topics: topicCount,
      estTokens,
    },
  };
}
