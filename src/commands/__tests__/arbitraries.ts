/**
 * arbitraries.ts — Random-but-valid command generation for the
 * property-based undo invariants (docs/07 Layer 3).
 *
 * fast-check supplies integer seeds; `randomCommand` turns one seed +
 * the CURRENT state into a plausible command. It aims for mostly-valid
 * commands (no-ops teach the suite nothing), but the executor's own
 * guards remain the source of truth — an occasionally-invalid command
 * is itself a useful test input.
 */

import type { Section, Topic, TopicId } from "@/model/types";
import type { Command, EditorState } from "../types";

/** Small deterministic PRNG (xorshift32) seeded per command. */
export function makeRng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

interface FlatTopic {
  sectionId: string;
  topic: Topic;
}

function flatten(state: EditorState): FlatTopic[] {
  const out: FlatTopic[] = [];
  for (const s of state.document.sections) {
    const walk = (t: Topic) => {
      out.push({ sectionId: s.id, topic: t });
      t.children.forEach(walk);
    };
    s.topics.forEach(walk);
  }
  return out;
}

function pick<T>(rnd: () => number, arr: readonly T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[rnd() % arr.length];
}

/** All topics in `section` that are NOT inside any moved subtree. */
function validParents(section: Section, moved: TopicId[]): (TopicId | null)[] {
  const parents: (TopicId | null)[] = [null];
  const movedSet = new Set(moved);
  const walk = (t: Topic) => {
    if (movedSet.has(t.id)) return; // whole subtree is moving
    parents.push(t.id);
    t.children.forEach(walk);
  };
  section.topics.forEach(walk);
  return parents;
}

export function randomCommand(state: EditorState, seed: number): Command | null {
  const rnd = makeRng(seed);
  const sections = state.document.sections;
  const topics = flatten(state);
  if (sections.length === 0) return null;

  // Weighted choice: moves dominate (they're the risky path).
  const roll = rnd() % 100;

  if (roll < 30 && topics.length > 0) {
    // moveTopics: 1–3 topics → random section/parent/index
    const n = 1 + (rnd() % 3);
    const ids = Array.from(
      new Set(Array.from({ length: n }, () => pick(rnd, topics)!.topic.id)),
    );
    const to = pick(rnd, sections)!;
    const parent = pick(rnd, validParents(to, ids)) ?? null;
    return {
      type: "moveTopics",
      topicIds: ids,
      toSectionId: to.id,
      toParentTopicId: parent,
      toIndex: rnd() % 5,
    };
  }
  if (roll < 40 && topics.length > 0) {
    const n = 1 + (rnd() % 2);
    const ids = Array.from(
      new Set(Array.from({ length: n }, () => pick(rnd, topics)!.topic.id)),
    );
    return {
      type: "moveTopicsToNewSection",
      topicIds: ids,
      title: `Section ${seed % 1000}`,
      toColumn: rnd() % (state.columns.length + 1),
      toIndexInColumn: rnd() % 4,
    };
  }
  if (roll < 50 && topics.length > 0) {
    const t = pick(rnd, topics)!;
    return {
      type: "renameTopic",
      sectionId: t.sectionId,
      topicId: t.topic.id,
      title: `Renamed ${seed % 1000}`,
    };
  }
  if (roll < 58) {
    const s = pick(rnd, sections)!;
    return { type: "renameSection", sectionId: s.id, title: `Section ${seed % 1000}` };
  }
  if (roll < 64 && topics.length > 3) {
    // keep some content around — only delete when there's plenty
    const t = pick(rnd, topics)!;
    return { type: "removeTopics", topicIds: [t.topic.id] };
  }
  if (roll < 70 && sections.length > 1) {
    const s = pick(rnd, sections)!;
    return { type: "removeSection", sectionId: s.id };
  }
  if (roll < 76) {
    // PUT BACK. Aimed at a row that actually holds a record when one
    // exists — an arbitrary that only ever generated no-ops would look
    // like coverage and be vacuity. The command is in the undo property
    // because it mutates the document in two ways at once (the move and
    // the record's erasure), which is exactly the shape that used to be
    // got wrong by hand-written reversals.
    const displaced = topics.filter((t) => t.topic.displaced !== undefined);
    const t = pick(rnd, displaced.length > 0 ? displaced : topics);
    if (t) return { type: "putBackTopic", topicId: t.topic.id };
  }
  if (roll < 80) {
    const s = pick(rnd, sections)!;
    return {
      type: "reorderCard",
      sectionId: s.id,
      toColumn: rnd() % (state.columns.length + 1),
      toIndexInColumn: rnd() % 4,
    };
  }
  if (roll < 86) {
    return { type: "setGlobalDepth", depth: rnd() % 6 };
  }
  if (roll < 92) {
    const s = pick(rnd, sections)!;
    const clear = rnd() % 3 === 0;
    return {
      type: "setCardDepth",
      sectionId: s.id,
      depth: clear ? null : rnd() % 6,
    };
  }
  const s = pick(rnd, sections)!;
  const parent = pick(rnd, [
    null,
    ...flatten(state)
      .filter((f) => f.sectionId === s.id)
      .map((f) => f.topic.id),
  ]);
  return {
    type: "insertTopic",
    sectionId: s.id,
    parentTopicId: parent ?? null,
    index: rnd() % 5,
    title: `Topic ${seed % 1000}`,
  };
}
