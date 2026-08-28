/**
 * useKeyboard.ts — Global keyboard map (docs/02 §8). The listener
 * ignores events originating in inputs/contenteditable (docs/05).
 * Escape clears selection · L locks topics · Cmd/Ctrl+Z(+Shift)
 * undo/redo · Cmd/Ctrl+Shift+T reopens a tab · Delete/Backspace
 * removes the selection (topics first, else the selected card) —
 * no confirmation: undo is the recovery model.
 */

import { useEffect } from "react";
import {
  animatedDispatch,
  animatedRedo,
  animatedUndo,
} from "@/animation/animatedActions";
import { anyTopicLocked } from "@/model/selectors";
import { selectActiveTab, useAppStore } from "@/store";
import { useUiStore } from "@/view/uiStore";

function isEditableTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

export function useKeyboard(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e)) return;
      const state = useAppStore.getState();
      const tab = selectActiveTab(state);

      if (e.key === "Escape") {
        state.selectSection(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && tab) {
        const ui = useUiStore.getState();
        if (ui.loadDialogOpen || ui.aiDialogOpen || ui.changesDialogOpen) return;
        if (tab.selectedTopicIds.length > 0 && !tab.topicsLocked) {
          // A locked topic in the selection cancels the delete outright —
          // falling through to the section branch would delete the CARD
          // instead, which is not what the user asked for (docs/12).
          if (anyTopicLocked(tab.editor.document, tab.selectedTopicIds)) return;
          e.preventDefault();
          animatedDispatch({ type: "removeTopics", topicIds: tab.selectedTopicIds });
        } else if (tab.selectedSectionIds.length > 0) {
          e.preventDefault();
          // one command, one undo entry — even for a multi-selection
          animatedDispatch({
            type: "removeSections",
            sectionIds: tab.selectedSectionIds,
          });
        }
        return;
      }
      if ((e.key === "l" || e.key === "L") && !e.metaKey && !e.ctrlKey && tab) {
        state.setTopicsLocked(tab.id, !tab.topicsLocked);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) {
          animatedRedo();
        } else {
          animatedUndo();
        }
        return;
      }
      // Reopen recently closed tab (browser may own this combo; when the
      // page receives it, it works — docs/02 §8)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        state.reopenClosedTab();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
