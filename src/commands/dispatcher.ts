/**
 * dispatcher.ts — The single gate for mutations (docs/03).
 *
 * `runCommand` executes a command against an EditorState via Immer's
 * `produceWithPatches`. The returned patches/inverse-patches ARE the
 * redo/undo — no per-operation reversal recipes exist anywhere.
 *
 * Invariant (property-tested in __tests__/undo-invariants.test.ts):
 * for any command sequence, undoing all entries restores a deep-equal
 * EditorState.
 */

import { applyPatches, enablePatches, produceWithPatches } from "immer";
import type {
  AnimationHints,
  Command,
  CommandResult,
  EditorState,
  UndoEntry,
} from "./types";
import { executeCommand } from "./execute";

enablePatches();

// ── User-facing labels (toasts, future history UI) ──────────

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export function labelFor(command: Command, hints: AnimationHints): string {
  switch (command.type) {
    case "moveTopics":
      // NAMES the move when there is one (docs/16). Restructures arrive
      // in bursts, so "Undo move" beside the fortieth step says nothing
      // about which one is about to be undone; the title does.
      return hints.movedTopicTitle !== undefined
        ? `Move "${hints.movedTopicTitle}"`
        : `Move ${count(hints.movedTopicIds?.length ?? 0, "topic")}`;
    case "moveTopicsToNewSection":
      return "New section";
    case "insertTopic":
      return "Add topic";
    case "removeTopics":
      return `Delete ${count(hints.removedTopicIds?.length ?? 0, "topic")}`;
    case "putBackTopic":
      // NAMES the row, like a reparent does: this undo sits in a stack
      // beside forty other steps, and "Put back" alone says nothing
      // about which row is about to leave home again.
      return hints.movedTopicTitle !== undefined
        ? `Put "${hints.movedTopicTitle}" back`
        : "Put back";
    case "renameTopic":
      return "Rename topic";
    case "renameSection":
      return "Rename section";
    case "addHeading":
      return "Add heading";
    case "removeHeading":
      return "Remove heading";
    case "removeSection":
      return "Delete section";
    case "removeSections":
      return `Delete ${count(hints.removedSectionIds?.length ?? 0, "section")}`;
    case "reorderCard":
      // A reparent names where it went — the undo toast is where the
      // user learns a container changed, so "Move card" would hide the
      // one thing that makes this drop different (docs/13 v2). The
      // container's NAME, never the word "tab", which collides with the
      // app's own document tabs.
      return command.chain && command.chain.length > 0
        ? `Move to ${command.chain[command.chain.length - 1]}`
        : "Move card";
    case "setColumns":
      return "Arrange cards";
    case "setGlobalDepth":
    case "setCardDepth":
      return "Change depth";
  }
}

// ── The gate ────────────────────────────────────────────────

export function runCommand(state: EditorState, command: Command): CommandResult {
  let hints: AnimationHints = {};
  const [next, patches, inversePatches] = produceWithPatches(state, (draft) => {
    hints = executeCommand(draft, command);
  });

  if (patches.length === 0) {
    // No-op (invalid ids, same-position move, …): nothing to undo.
    return { next: state, entry: null, hints };
  }

  return {
    next,
    entry: { label: labelFor(command, hints), patches, inversePatches },
    hints,
  };
}

/** Apply an undo entry (inverse patches) to a state. */
export function applyUndo(state: EditorState, entry: UndoEntry): EditorState {
  return applyPatches(state, entry.inversePatches);
}

/** Re-apply an undo entry's forward patches (redo). */
export function applyRedo(state: EditorState, entry: UndoEntry): EditorState {
  return applyPatches(state, entry.patches);
}
