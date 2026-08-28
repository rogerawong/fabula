/**
 * cardDrag.ts — Card reorder gestures, canvas and sidebar. Both drive
 * the SAME live preview (previewColumns → layout) and commit the SAME
 * command (reorderCard) — one system, two affordances.
 */

import { animatedDispatch } from "@/animation/animatedActions";
import { moveCardToColumn } from "@/layout/columns";
import { screenToCanvas } from "@/interaction/transform";
import { findSection } from "@/model/tree";
import type { SectionId } from "@/model/types";
import { toast } from "sonner";
import { useAppStore, type TabState } from "@/store";
import { useUiStore } from "@/view/uiStore";
import { computeLayout } from "@/view/canvas/useLayout";
import { cardDropPosition, classifyDrop, sidebarDropToColumnPos } from "./dropMath";
import { containerFor, containerOf, containerPhrase } from "@/model/containers";
import { cardChainRefusal } from "@/commands/guards";
import { chainFromKey, chainLookup, chainPathKey } from "@/model/selectors";
import type { ContainerDescriptor, Section } from "@/model/types";
import { startDragGesture } from "./gesture";
import { useDragStore } from "./dragStore";

function currentTab(tabId: string): TabState | null {
  return useAppStore.getState().tabs.find((t) => t.id === tabId) ?? null;
}

function samePosition(
  tab: TabState,
  sectionId: SectionId,
  target: { colIndex: number; cardIndex: number },
): boolean {
  const col = tab.editor.columns[target.colIndex];
  return col ? col[target.cardIndex] === sectionId : false;
}

/** Commit a card move, naming the container when one changed. */
export function commitCardMove(
  sectionId: SectionId,
  target: { colIndex: number; cardIndex: number },
  chain: readonly string[] | null,
  intoLabel?: string,
): void {
  animatedDispatch({
    type: "reorderCard",
    sectionId,
    toColumn: target.colIndex,
    toIndexInColumn: target.cardIndex,
    ...(chain ? { chain } : {}),
  });
  if (!chain) return;
  // The toast is where a user learns the container changed — the card's
  // chip updates too, but it may be off screen. Undoable, visible and
  // non-destructive is exactly why this is a toast and not a modal
  // asking permission first (docs/13 v2).
  const toastId = `reparent-${sectionId}`;
  toast(`Moved to ${intoLabel ?? "another container"}`, {
    id: toastId,
    duration: 5000,
    action: {
      label: "Undo",
      onClick: () => {
        toast.dismiss(toastId); // dismiss BEFORE mutating (toast + undo races)
        useAppStore.getState().undo();
      },
    },
  });
}

function finishCardDrag(tabId: string, sectionId: SectionId, cancelled: boolean): void {
  const { cardTarget: target, dropChain, seam } = useDragStore.getState();
  const pointer = useDragStore.getState().pointer;
  useDragStore.getState().reset();
  if (cancelled || !target) return;
  const tab = currentTab(tabId);
  if (!tab) return;

  // A seam reads both ways, so the release asks instead of guessing. No
  // modal: the question is which of two moves was meant, not whether to
  // proceed — and a proceed/cancel prompt would presume the answer.
  if (seam && pointer) {
    useUiStore.getState().setSeamMenu({
      x: pointer.x,
      y: pointer.y,
      sectionId,
      target,
      chain: seam.chain,
      into: seam.into,
      keep: seam.keep,
    });
    return;
  }

  // No-op drops (same slot, same container) must not create an undo entry.
  if (!dropChain && samePosition(tab, sectionId, target)) return;
  commitCardMove(
    sectionId,
    target,
    dropChain,
    dropChain
      ? containerPhrase(containerFor(tab.editor.document, chainPathKey(dropChain)))
      : undefined,
  );
}

/**
 * Say what this drop position means, and preview it (docs/13 v2).
 *
 * Shared by both affordances deliberately. What a drop MEANS is a
 * property of the drop, not of the gesture that produced it — the
 * sidebar shipped without v1's guard precisely because the guard lived
 * inside the canvas path. This function only messages; whether a
 * reparent is legal is decided once at the command (execute.ts), and
 * this reads the same registry to say so before the release rather than
 * after it.
 */
function previewDrop(
  drag: ReturnType<typeof useDragStore.getState>,
  tab: TabState,
  sectionId: SectionId,
  target: { colIndex: number; cardIndex: number },
  pointer: { x: number; y: number },
): void {
  const doc = tab.editor.document;
  const section = findSection(doc, sectionId);
  const chains = chainLookup(doc);
  const drop = classifyDrop(tab.editor.columns, chains.of, sectionId, target);
  const preview = moveCardToColumn(
    tab.editor.columns,
    sectionId,
    target.colIndex,
    target.cardIndex,
  );

  if (drop.kind === "reorder" || !section) {
    drag.set({
      pointer,
      cardTarget: target,
      refusal: null,
      dropLabel: null,
      dropChain: null,
      seam: null,
      previewColumns: preview,
    });
    return;
  }

  // Both remaining readings move the card, so both must clear the same
  // check the command will apply. A refusal here is the reason shown
  // early, not a second rule.
  const into = containerFor(doc, drop.chainKey);
  const blocked = reparentRefusal(doc, section, into);
  if (blocked) {
    drag.set({
      pointer,
      cardTarget: null,
      refusal: blocked,
      dropLabel: null,
      dropChain: null,
      seam: null,
      previewColumns: tab.editor.columns,
    });
    return;
  }

  const chain = chainFromKey(into?.chainKey ?? "");
  if (drop.kind === "reparent") {
    drag.set({
      pointer,
      cardTarget: target,
      refusal: null,
      dropLabel: `→ moves to ${into?.label ?? "another container"}`,
      dropChain: chain,
      seam: null,
      previewColumns: preview,
    });
    return;
  }

  // Seam: both readings are live, so the ghost says so and the release
  // asks rather than guessing.
  drag.set({
    pointer,
    cardTarget: target,
    refusal: null,
    dropLabel: `↔ ${containerFor(doc, drop.keepKey)?.label ?? "here"} or ${into?.label ?? "the next container"}`,
    dropChain: null,
    seam: {
      chain,
      into: containerPhrase(into) ?? "the next container",
      keep: containerPhrase(containerFor(doc, drop.keepKey)) ?? "here",
    },
    previewColumns: preview,
  });
}

/**
 * The one-line reason a move is refused, or null when it is allowed.
 *
 * The RULE is `cardChainRefusal`; this composes its wording. Deriving
 * the answer here again is what this function used to do, and it lost
 * the no-containers clause doing it (docs/16 step 1) — so it asks, and
 * only decides how to say it.
 */
function reparentRefusal(
  doc: TabState["editor"]["document"],
  section: Section,
  into: ContainerDescriptor | undefined,
): string | null {
  const reason = cardChainRefusal(doc, section, chainFromKey(into?.chainKey ?? ""));
  switch (reason) {
    case null:
      return null;
    case "not-accepted":
      // Named for the target, which is where the pointer is.
      return `"${into?.label ?? "That container"}" doesn't hold cards like this one.`;
    case "would-empty": {
      const home = containerOf(doc, section);
      return `"${home?.label ?? "This container"}" can't be left empty.`;
    }
    case "no-containers":
      // Unreachable through `classifyDrop`, which never classifies a
      // drop as a reparent on a document with no chains. Answered
      // anyway: an unreachable branch that returns null is a silent
      // allow the day something else reaches it.
      return "This document has no containers to move between.";
  }
}

/** Drag a card by its header on the canvas. */
export function beginCardDrag(
  down: React.PointerEvent,
  tabId: string,
  sectionId: SectionId,
): void {
  const tab = currentTab(tabId);
  if (!tab) return;
  const title = findSection(tab.editor.document, sectionId)?.title ?? "section";
  // Rects frozen at drag start: targets stay stable while the preview
  // moves cards around under the pointer.
  const baseLayout = computeLayout(tab);
  const drag = useDragStore.getState();

  startDragGesture(down, {
    onStart: (e) => {
      drag.set({
        kind: "card",
        cardId: sectionId,
        ghostLabel: title,
        pointer: { x: e.clientX, y: e.clientY },
        previewColumns: tab.editor.columns,
      });
    },
    onMove: (e) => {
      const now = currentTab(tabId);
      const canvas = document.querySelector('[data-testid="canvas"]');
      if (!now || !canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const pt = screenToCanvas(now.viewport, {
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      });
      const target = cardDropPosition(now.editor.columns, baseLayout.byId, pt, sectionId);
      previewDrop(drag, now, sectionId, target, { x: e.clientX, y: e.clientY });
    },
    onEnd: (cancelled) => finishCardDrag(tabId, sectionId, cancelled),
  });
}

/** Drag a row in the sidebar section list — same command, same preview. */
export function beginSidebarCardDrag(
  down: React.PointerEvent,
  tabId: string,
  sectionId: SectionId,
): void {
  const tab = currentTab(tabId);
  if (!tab) return;
  const title = findSection(tab.editor.document, sectionId)?.title ?? "section";
  const drag = useDragStore.getState();

  startDragGesture(down, {
    onStart: (e) => {
      drag.set({
        kind: "card",
        cardId: sectionId,
        ghostLabel: title,
        pointer: { x: e.clientX, y: e.clientY },
        previewColumns: tab.editor.columns,
      });
    },
    onMove: (e) => {
      const now = currentTab(tabId);
      if (!now) return;
      drag.set({ pointer: { x: e.clientX, y: e.clientY } });

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest<HTMLElement>("[data-sidebar-row]");
      if (!row) return;
      const targetId = row.getAttribute("data-sidebar-row")!;
      if (targetId === sectionId) return;
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      const target = sidebarDropToColumnPos(
        now.editor.columns,
        sectionId,
        targetId,
        before ? "before" : "after",
      );
      if (!target) return;
      previewDrop(drag, now, sectionId, target, { x: e.clientX, y: e.clientY });
    },
    onEnd: (cancelled) => finishCardDrag(tabId, sectionId, cancelled),
  });
}
