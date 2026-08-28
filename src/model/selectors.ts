/**
 * selectors.ts — Derived data over the model.
 *
 * Storing these (`totalCount` / `levelCounts` / `maxDepth` / `level`)
 * means chasing staleness with recompute calls after every mutation —
 * so everything here is derived. Memoization, where it matters,
 * happens at the store/view boundary — these functions stay pure.
 */

import type { Section, TocDocument, Topic } from "./types";

export interface TopicStats {
  /** Total topic count (recursive) */
  total: number;
  /** Count per depth level: { 1: 5, 2: 12, ... } (1 = section top level) */
  levelCounts: Record<number, number>;
  /** Deepest level present (0 for an empty tree) */
  maxDepth: number;
}

export function countTopics(topics: Topic[]): TopicStats {
  let total = 0;
  const levelCounts: Record<number, number> = {};
  let maxDepth = 0;

  const walk = (t: Topic, level: number) => {
    total++;
    levelCounts[level] = (levelCounts[level] ?? 0) + 1;
    if (level > maxDepth) maxDepth = level;
    for (const c of t.children) walk(c, level + 1);
  };
  for (const t of topics) walk(t, 1);

  return { total, levelCounts, maxDepth };
}

export function sectionStats(section: Section): TopicStats {
  return countTopics(section.topics);
}

/**
 * True when any of `topicIds` names a locked topic (docs/12): a node the
 * source pins in place, which must not move, be deleted or be renamed.
 * Gestures that act on a SET of topics check the whole set — a locked
 * node riding along in a group drag is exactly the inconsistent state
 * locking exists to prevent.
 */
export function anyTopicLocked(doc: TocDocument, topicIds: readonly string[]): boolean {
  if (topicIds.length === 0) return false;
  const wanted = new Set(topicIds);
  let found = false;
  const walk = (t: Topic) => {
    if (found) return;
    if (t.lock !== undefined && wanted.has(t.id)) {
      found = true;
      return;
    }
    for (const c of t.children) walk(c);
  };
  for (const s of doc.sections) for (const t of s.topics) walk(t);
  return found;
}

/**
 * Three questions that used to be one, and were not the same question
 * (docs/13). The old `isSectionSealed` derived a seal as
 * `topics.length > 0 && topics.every(locked)`, which is **vacuously
 * true at zero rows** — so a card generated from an OpenAPI spec (no
 * rows, not editable) and a genuinely empty card (no rows, a fine drop
 * target) were indistinguishable. They are opposites.
 */

/**
 * The card's contents are generated elsewhere and are not editable here.
 * DECLARED by the adapter; never derived. This is the predicate every
 * BEHAVIORAL consumer uses — drop refusal, AI movement rules, merge
 * candidacy. Zero rows never implies a seal.
 */
/**
 * Does this document hold any row the source pins in place?
 *
 * O(rows) and asked once per menu open, not per row — the per-row
 * question is `isPinned` (`locks.ts`). Its consumer is the per-tab
 * aspirational control, which exists only for documents where a pin
 * could ever come up: a control that can do nothing here is noise.
 */
export function hasPinnedRow(doc: TocDocument): boolean {
  const walk = (nodes: readonly Topic[]): boolean =>
    nodes.some((t) => t.lock !== undefined || walk(t.children));
  return doc.sections.some((s) => walk(s.topics));
}

export function isSealed(section: Section): boolean {
  return section.sealed !== undefined;
}

/**
 * Every row is locked, and there is at least one row. A **UI hint only**:
 * it says the card currently has nothing movable in it, which is worth
 * showing, but it is not a claim that the card is inert — topics can
 * still be dropped in.
 *
 * Deliberately NOT a seal. Auto-sealing a card because its last movable
 * row was locked would be action-at-a-distance: an edit to a row silently
 * changing what the card permits.
 */
export function allRowsLocked(section: Section): boolean {
  return section.topics.length > 0 && section.topics.every((t) => t.lock !== undefined);
}

/** No rows. Says nothing about whether the card is editable. */
export function isEmpty(section: Section): boolean {
  return section.topics.length === 0;
}

/**
 * Every page in this document is labelled from its own path, so no row
 * title on the canvas came from the source — they will differ from the
 * published sidebar. A document-level fact, and worth saying once at
 * document level: PRODUCT.md's third audience is shown a canvas they did
 * not build, and cannot otherwise tell a slug from a title.
 *
 * Counts PAGES only. A group row carries a real name from the file even
 * when it also has a path, and a locked row names itself; including
 * either would make the predicate false for every real corpus. Measured:
 * every Mintlify document derives 100% (224/224 on mintlify/docs), DocFX
 * and MkDocs a minority (3/24, 5/19) — so no threshold is needed, and
 * this stays false for the formats whose titles are real.
 */
export function pageTitlesAllDerived(doc: TocDocument): boolean {
  let pages = 0;
  let derived = 0;
  const walk = (t: Topic) => {
    if (t.path !== undefined && t.lock === undefined && t.children.length === 0) {
      pages += 1;
      if (t.titleDerived) derived += 1;
    }
    t.children.forEach(walk);
  };
  for (const s of doc.sections) s.topics.forEach(walk);
  return pages > 0 && derived === pages;
}

/**
 * Separates chain segments. NUL, because a container label may contain
 * any printable character — joining on one would let a tab named "a/b"
 * key the same as the tabs "a" then "b".
 */
const CHAIN_SEPARATOR = "\u0000";

/**
 * Chain key for a raw ancestor path. A serializer partitions cards by
 * chain key while holding paths read from the file rather than sections,
 * so it needs the same key from the other shape — and must not re-derive
 * the separator, which would then diverge invisibly.
 */
export function chainPathKey(chain: readonly string[]): string {
  return chain.join(CHAIN_SEPARATOR);
}

/**
 * The ancestor path a chain key stands for — the inverse of
 * `chainPathKey`, for callers holding a key (a container descriptor,
 * say) that need the array a command takes.
 */
export function chainFromKey(key: string): string[] {
  return key === "" ? [] : key.split(CHAIN_SEPARATOR);
}

/** Chain key for grouping: stable, order-sensitive, "" when unchained. */
export function chainKey(section: Section): string {
  return chainPathKey(section.chain ?? []);
}

/** The immediate container's label — what the card's chip shows. */
export function chainLabel(section: Section): string | undefined {
  const chain = section.chain;
  return chain && chain.length > 0 ? chain[chain.length - 1] : undefined;
}

/**
 * Partition sections by chain for serialization (docs/13). Order WITHIN a
 * chain comes from the canvas; the order OF chains is the caller's,
 * taken from the original file — never derived from where member cards
 * happen to sit, which would be action-at-a-distance.
 */
export function partitionByChain(
  sections: readonly Section[],
  order: readonly string[],
): Map<string, Section[]> {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const out = new Map<string, Section[]>();
  for (const id of order) {
    const section = byId.get(id);
    if (!section) continue;
    const key = chainKey(section);
    const bucket = out.get(key);
    if (bucket) bucket.push(section);
    else out.set(key, [section]);
  }
  return out;
}

/**
 * Chain queries for one document, for the drag layer (docs/13). Bundled
 * so the hot path builds the id index once per gesture, not per move.
 */
export function chainLookup(doc: TocDocument): {
  of: (id: string) => string;
  labelOf: (id: string) => string | undefined;
  labelAt: (
    columns: readonly (readonly string[])[],
    target: { colIndex: number; cardIndex: number },
    excludeId: string,
  ) => string | undefined;
} {
  const byId = new Map(doc.sections.map((s) => [s.id, s]));
  const of = (id: string) => {
    const section = byId.get(id);
    return section ? chainKey(section) : "";
  };
  const labelOf = (id: string) => {
    const section = byId.get(id);
    return section ? chainLabel(section) : undefined;
  };
  return {
    of,
    labelOf,
    labelAt: (columns, target, excludeId) => {
      const column = (columns[target.colIndex] ?? []).filter((id) => id !== excludeId);
      const neighbour = column[target.cardIndex - 1] ?? column[target.cardIndex];
      return neighbour === undefined ? undefined : labelOf(neighbour);
    },
  };
}

export function documentStats(doc: TocDocument): TopicStats & { sections: number } {
  let total = 0;
  const levelCounts: Record<number, number> = {};
  let maxDepth = 0;
  for (const s of doc.sections) {
    const stats = sectionStats(s);
    total += stats.total;
    for (const [level, n] of Object.entries(stats.levelCounts)) {
      levelCounts[Number(level)] = (levelCounts[Number(level)] ?? 0) + n;
    }
    if (stats.maxDepth > maxDepth) maxDepth = stats.maxDepth;
  }
  return { total, levelCounts, maxDepth, sections: doc.sections.length };
}

/**
 * Rows on this card that the published site drops because an ANCESTOR is
 * hidden, aggregated so the card can name the cause once in its chrome
 * (docs/14).
 *
 * The per-row italic says "this one is inside something hidden"; it
 * cannot say WHICH something without a hover, and on the reference
 * corpus 199 rows inherit from a single container. Naming the cause
 * where the cause lives is the same move that put the section marking on
 * the section rather than repeating it down the subtree.
 *
 * Aggregate by design: per-row detail stays on the row's own tooltip.
 */
export function hiddenSubtreeSummary(
  section: Section,
): { count: number; causes: { via: string; count: number }[] } | null {
  const byVia = new Map<string, number>();
  const walk = (topics: Topic[]): void => {
    for (const t of topics) {
      const via = t.unlisted?.inheritedFrom?.via;
      if (via) byVia.set(via, (byVia.get(via) ?? 0) + 1);
      walk(t.children);
    }
  };
  walk(section.topics);
  if (byVia.size === 0) return null;
  const causes = [...byVia]
    .map(([via, count]) => ({ via, count }))
    .sort((a, b) => b.count - a.count || a.via.localeCompare(b.via));
  return { count: causes.reduce((n, c) => n + c.count, 0), causes };
}

/**
 * The card-chrome sentence: one line, no hover, at any zoom.
 *
 * TWO causes are both named. "…via “A” and 1 other" reads as a dominant
 * cause with a footnote, and on the reference corpus the split is 135/64
 * — two comparable regions, where naming one and counting the other
 * misdescribes the shape. Three or more genuinely need the summary form,
 * and the tooltip carries the rest.
 */
export function hiddenSubtreeLine(section: Section): string | null {
  const s = hiddenSubtreeSummary(section);
  if (!s) return null;
  const rows = `${s.count} ${s.count === 1 ? "row" : "rows"} hidden via `;
  const [first, second] = s.causes;
  if (s.causes.length === 1) return `${rows}\u201C${first!.via}\u201D`;
  if (s.causes.length === 2) {
    return `${rows}\u201C${first!.via}\u201D and \u201C${second!.via}\u201D`;
  }
  const rest = s.causes.length - 1;
  return `${rows}\u201C${first!.via}\u201D and ${rest} others`;
}

/** Every cause with its own count — the hover detail behind the line. */
export function hiddenSubtreeDetail(section: Section): string | null {
  const s = hiddenSubtreeSummary(section);
  if (!s) return null;
  return s.causes
    .map((c) => `${c.count} ${c.count === 1 ? "row" : "rows"} via \u201C${c.via}\u201D`)
    .join("\n");
}
