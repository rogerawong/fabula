/**
 * animatedActions.ts — Animated wrappers around the store's mutation
 * actions. Every UI-triggered mutation goes through `animateMutation`:
 *
 *   1. snapshot flip rects            (F)
 *   2. flushSync(mutate)              — DOM now reflects the new state
 *   3. ghosts for vanished cards + playFlip   (L-I-P, via WAAPI)
 *
 * All in ONE synchronous task, so animations are applied before the
 * browser paints the new state — the first-paint discipline (docs/05
 * rule 1) holds by construction. A dev-mode assertion catches anyone
 * who makes this path asynchronous.
 *
 * Toasts (sonner) ride along: every structural command completion gets
 * a toast with an Undo action; toast ids are stable per operation and
 * are dismissed BEFORE mutating (toast + undo races duplicate state).
 */

import { flushSync } from "react-dom";
import { toast } from "sonner";
import type { AnimationHints, Command } from "@/commands/types";
import { selectActiveTab, useAppStore } from "@/store";
import { ghostVanishedCards } from "./ghosts";
import { playFlip, snapshotFlipRects } from "./flip";

function currentScale(): number {
  return selectActiveTab(useAppStore.getState())?.viewport.scale ?? 1;
}

/** Dev assertion: if a rAF fires before we finish applying animations,
 *  the mutation painted un-animated — the discipline was broken. */
function firstPaintGuard(tag: string): () => void {
  if (!import.meta.env.DEV) return () => {};
  let done = false;
  requestAnimationFrame(() => {
    if (!done) {
      console.error(
        `[animation] ${tag}: state painted before animations were applied — ` +
          "first-paint discipline violated (docs/05 rule 1)",
      );
    }
  });
  return () => {
    done = true;
  };
}

function animateMutation<T>(tag: string, mutate: () => T): T {
  const settle = firstPaintGuard(tag);
  const before = snapshotFlipRects();
  let result!: T;
  flushSync(() => {
    result = mutate();
  });
  ghostVanishedCards(before);
  playFlip(before, currentScale());
  settle();
  return result;
}

// ── Toasts ──────────────────────────────────────────────────

/** Commands that mutate view depth — undoable, but toasting every
 *  toolbar click is noise. */
const TOASTLESS = new Set<Command["type"]>(["setGlobalDepth", "setCardDepth"]);

let opCounter = 0;

function showUndoToast(label: string): void {
  const state = useAppStore.getState();
  const tab = selectActiveTab(state);
  if (!tab) return;
  const tabId = tab.id;
  const depth = tab.undoStack.length; // this op sits at this depth
  const toastId = `op-${++opCounter}`;

  toast(label, {
    id: toastId,
    duration: 4000,
    action: {
      label: "Undo",
      onClick: () => {
        // Dismiss BEFORE mutating — a live undo toast can duplicate the tab
        toast.dismiss(toastId);
        const s = useAppStore.getState();
        const t = s.tabs.find((x) => x.id === tabId);
        // Only undo if this op is still the top of this tab's stack.
        if (t && s.activeTabId === tabId && t.undoStack.length === depth) {
          animatedUndo();
        }
      },
    },
  });
}

// ── Public animated actions ─────────────────────────────────

export function animatedDispatch(command: Command): AnimationHints {
  const { hints, label } = animateMutation(command.type, () =>
    useAppStore.getState().dispatch(command),
  );
  if (label && !TOASTLESS.has(command.type)) showUndoToast(label);
  return hints;
}

export function animatedUndo(): string | null {
  const label = animateMutation("undo", () => useAppStore.getState().undo());
  if (label) toast(`Undone: ${label}`, { duration: 2200 });
  return label;
}

export function animatedRedo(): string | null {
  const label = animateMutation("redo", () => useAppStore.getState().redo());
  if (label) toast(`Redone: ${label}`, { duration: 2200 });
  return label;
}
