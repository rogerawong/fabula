/**
 * focusPath.ts — What to expand, and where to stop, when a finding is
 * clicked (docs/17).
 *
 * Focus does three things: expand the ancestor path, bring the subject
 * into view, flash it. This module owns the first, and owns it as a PURE
 * function so the expansion can be asserted as state rather than as
 * pixels.
 *
 * Expansion is ORDINARY expansion. The result is applied as the same
 * per-node overrides a chevron click writes, producing state identical
 * to the user having opened that path by hand — so there is no new
 * mechanism and no second source of truth to reconcile, and "is the
 * override sticky?" has the answer it already had: exactly as sticky as
 * a chevron. Depth settings are not read, not raised and not restored.
 */

import type { NodeRef } from "@/collections/importEvidence";
import type { Section, SectionId, TocDocument, Topic, TopicId } from "./types";

export interface FocusPath {
  sectionId: SectionId;
  /** Ancestors to open, outermost first. Never includes a boundary. */
  expand: TopicId[];
  /** The node to bring into view; undefined means the card itself. */
  target?: TopicId;
  /** True when a boundary stopped the walk short of the asked-for node. */
  stoppedAtBoundary: boolean;
}

/**
 * A node that stands in front of a subtree, rather than one that merely
 * cannot be moved.
 *
 * The model already draws this line and it can be read rather than
 * re-derived: `TopicLock.count` is documented "`atomic` only: how many
 * entries sit behind the boundary". A kind that can say how much is
 * behind it is a boundary; the other four cannot, because there is
 * nothing behind them.
 */
function isBoundary(topic: Topic): boolean {
  return topic.lock?.kind === "atomic";
}

/** The chain of topics from a section's top level down to `topicId`. */
function chainTo(section: Section, topicId: TopicId): Topic[] | null {
  const walk = (topics: Topic[], trail: Topic[]): Topic[] | null => {
    for (const t of topics) {
      const here = [...trail, t];
      if (t.id === topicId) return here;
      const deeper = walk(t.children, here);
      if (deeper) return deeper;
    }
    return null;
  };
  return walk(section.topics, []);
}

export function focusPath(doc: TocDocument, subject: NodeRef): FocusPath | null {
  const section = doc.sections.find((s) => s.id === subject.sectionId);
  if (!section) return null;

  // A sealed card's contents are generated elsewhere, so opening it
  // would claim an interior it does not have. The card is the subject.
  if (section.sealed !== undefined) {
    return { sectionId: section.id, expand: [], stoppedAtBoundary: true };
  }

  if (subject.topicId === undefined) {
    return { sectionId: section.id, expand: [], stoppedAtBoundary: false };
  }

  const chain = chainTo(section, subject.topicId);
  // A subject that is not in the card any more: focus the card rather
  // than nothing, because the card is still the honest answer to where
  // it was.
  if (!chain) return { sectionId: section.id, expand: [], stoppedAtBoundary: false };

  const expand: TopicId[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const ancestor = chain[i]!;
    if (isBoundary(ancestor)) {
      // Stop here: focusing into a collapsed atomic subtree would undo
      // the collapse that made the card legible, and the boundary is
      // the honest subject.
      return {
        sectionId: section.id,
        expand,
        target: ancestor.id,
        stoppedAtBoundary: true,
      };
    }
    expand.push(ancestor.id);
  }

  // The target itself is never expanded — the user asked to see it, and
  // its own chevron stays theirs to press.
  return {
    sectionId: section.id,
    expand,
    target: subject.topicId,
    stoppedAtBoundary: false,
  };
}
