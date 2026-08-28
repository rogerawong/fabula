/** Shared helpers for command-layer tests. */

import { sampleDoc } from "@/model/__tests__/fixtures";
import { initialColumns } from "@/layout/columns";
import { DEFAULT_GLOBAL_DEPTH } from "@/store";
import type { TocDocument, Topic } from "@/model/types";
import type { EditorState } from "../types";

export function editorFor(doc: TocDocument): EditorState {
  return {
    document: doc,
    columns: initialColumns(doc),
    view: { globalDepth: DEFAULT_GLOBAL_DEPTH, cardDepths: {} },
  };
}

export function sampleEditor(): EditorState {
  return editorFor(sampleDoc());
}

/**
 * The sample, with two rows displaced — a ledgered tab (docs/21).
 *
 * Exists because `randomCommand` can now generate `putBackTopic`, and on
 * a document holding NO records every such command is a no-op. That
 * branch would look like coverage and be vacuity: the arbitrary needs a
 * state where the command does something.
 *
 * Two rows, in two different cards, one of them pinned — so the property
 * exercises both the "clears on put back" and "clears on a move that
 * lands home" paths, and a fixture with only the interesting case cannot
 * show that the boring one is treated differently.
 */
export function ledgeredEditor(): EditorState {
  const state = sampleEditor();
  const [first, second] = state.document.sections;
  const rows = [first?.topics[0], second?.topics[0]].filter(
    (t): t is Topic => t !== undefined,
  );
  rows.forEach((row, i) => {
    const home = i === 0 ? second : first;
    if (!home) return;
    if (i === 0) row.lock = { kind: "outside-region" };
    row.displaced = {
      parentId: home.id,
      parentTitle: home.title,
      index: 0,
      kind: i === 0 ? "pin" : "consent",
    };
  });
  return state;
}

export function mustFind<T>(value: T | null | undefined, what: string): T {
  if (value == null) throw new Error(`fixture missing: ${what}`);
  return value;
}

export function topicByTitle(state: EditorState, title: string): Topic {
  for (const s of state.document.sections) {
    const stack = [...s.topics];
    while (stack.length) {
      const t = stack.pop()!;
      if (t.title === title) return t;
      stack.push(...t.children);
    }
  }
  throw new Error(`no topic titled ${title}`);
}

export function sectionByTitle(state: EditorState, title: string) {
  return mustFind(
    state.document.sections.find((s) => s.title === title),
    `section ${title}`,
  );
}
