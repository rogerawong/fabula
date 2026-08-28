/**
 * topicDrag.ts — The topic-drag gesture: move a topic (or the current
 * multi-selection) to a position in any card's tree, or to empty canvas
 * to create a new section (docs/05 gestures table).
 *
 * DOM hit-testing via data attributes + elementFromPoint (ghost and
 * indicators are pointer-events-none, so they never occlude); target
 * resolution and index math are pure (dropMath.ts). The drop dispatches
 * exactly one command; Escape cancels with no side effects.
 */

import { animatedDispatch } from "@/animation/animatedActions";
import { screenToCanvas } from "@/interaction/transform";
import {
  findSection,
  locateTopic,
  locateTopicInDocument,
  subtreeContains,
} from "@/model/tree";
import type { TopicId } from "@/model/types";
import { selectActiveTab, useAppStore, type TabState } from "@/store";
import { computeLayout } from "@/view/canvas/useLayout";
import { adjustIndexAfterRemoval, cardDropPosition } from "./dropMath";
import { topicMoveRefusal, type TopicMoveRefusal } from "@/commands/guards";
import { moveLabel, refusalSentence } from "./moveLabel";
import {
  consentGate,
  pinnedDropConsequence,
  pinnedGate,
  pinnedInMove,
  seamRefusalSentence,
  type SeamCause,
} from "./pinnedDrag";
import { cardNoun, createCards } from "@/formats/registry";
import { resolveBirth } from "@/model/bearing";
import { useUiStore } from "@/view/uiStore";

/**
 * Paint `not-allowed` while the pointer is over a region the commit
 * predicate refuses.
 *
 * An ATTRIBUTE plus a `!important` rule on `* ` (see index.css), not an
 * inline `body.style.cursor`. `cursor` is inherited, so a body-level
 * value is overridden by any descendant that declares its own — and
 * every topic row declares `cursor-grab`. The inline version therefore
 * set the property correctly and changed nothing the user could see,
 * which is exactly how it got shipped: the state was right and only the
 * paint was missing.
 *
 * Cleared unconditionally at drag end — a stuck not-allowed cursor is
 * worse than none.
 */
/** One line, at the pointer, before release — the gesture has to say
 *  what it will do (docs/13 v2). */
function setRefusedCursor(refused: boolean): void {
  if (refused) document.body.dataset.dragRefused = "true";
  else delete document.body.dataset.dragRefused;
}
import { startDragGesture } from "./gesture";
import { useDragStore, type TopicDropTarget } from "./dragStore";

function activeTab(): TabState | null {
  return selectActiveTab(useAppStore.getState());
}

/** True when `candidateId` is one of the moving topics or inside one of
 *  their subtrees — an invalid drop anchor. */
function insideMovingSubtree(
  tab: TabState,
  movingIds: readonly TopicId[],
  candidateId: TopicId,
): boolean {
  for (const id of movingIds) {
    if (id === candidateId) return true;
    const topic = locateTopicInDocument(tab.editor.document, id)?.topic;
    if (topic && subtreeContains(topic, candidateId)) return true;
  }
  return false;
}

function resolveDrop(
  e: PointerEvent,
  tab: TabState,
  movingIds: readonly TopicId[],
): TopicDropTarget | null {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (!el) return null;
  const movingSet = new Set(movingIds);

  // ── A topic row: before / after / as-child ────────────────
  const row = el.closest<HTMLElement>("[data-topic-row]");
  if (row) {
    const rowTopicId = row.getAttribute("data-topic-id")!;
    const sectionId = row.getAttribute("data-section-id")!;
    if (insideMovingSubtree(tab, movingIds, rowTopicId)) return null;

    const section = findSection(tab.editor.document, sectionId);
    const loc = section ? locateTopic(section, rowTopicId) : null;
    if (!section || !loc) return null;

    const rect = row.getBoundingClientRect();
    const rel = (e.clientY - rect.top) / Math.max(1, rect.height);

    if (rel >= 0.3 && rel <= 0.7) {
      // middle band → drop as last child of the row
      return {
        kind: "topic",
        sectionId,
        parentTopicId: rowTopicId,
        index: adjustIndexAfterRemoval(
          loc.topic.children.map((t) => t.id),
          loc.topic.children.length,
          movingSet,
        ),
        indicator: { topicId: rowTopicId, position: "child" },
      };
    }
    const before = rel < 0.3;
    return {
      kind: "topic",
      sectionId,
      parentTopicId: loc.parent?.id ?? null,
      index: adjustIndexAfterRemoval(
        loc.siblings.map((t) => t.id),
        before ? loc.index : loc.index + 1,
        movingSet,
      ),
      indicator: { topicId: rowTopicId, position: before ? "before" : "after" },
    };
  }

  // ── Card chrome (header, padding): append to that section ─
  const card = el.closest<HTMLElement>("[data-card-id]");
  if (card) {
    const sectionId = card.getAttribute("data-card-id")!;
    const section = findSection(tab.editor.document, sectionId);
    // THE ORPHAN CLAUSE DIED HERE (docs/22, Decision 2 — the second
    // drag). It read `if (!section || section.isOrphan) return null;
    // // orphans wrap one leaf`, and it was the reason a standalone card
    // could not be dropped ON — which made R3's deferred commitment a
    // dead end: the first drag committed to neither shape and there was
    // no second gesture to reveal which was meant. A drop lands now, and
    // `execMoveTopics` converts the card in the same command, so one
    // undo restores the standalone and the row's origin together.
    if (!section) return null;
    return {
      kind: "section-end",
      sectionId,
      index: adjustIndexAfterRemoval(
        section.topics.map((t) => t.id),
        section.topics.length,
        movingSet,
      ),
    };
  }

  // ── Empty canvas: new section at this column slot ─────────
  const canvas = el.closest<HTMLElement>('[data-testid="canvas"]');
  if (canvas) {
    const bounds = canvas.getBoundingClientRect();
    const pt = screenToCanvas(tab.viewport, {
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top,
    });
    const layout = computeLayout(tab);
    const pos = cardDropPosition(tab.editor.columns, layout.byId, pt, null);
    return {
      kind: "canvas",
      toColumn: pos.colIndex,
      toIndexInColumn: pos.cardIndex,
    };
  }

  return null;
}

export function beginTopicDrag(
  down: React.PointerEvent,
  tabId: string,
  topicId: TopicId,
): void {
  const store = useAppStore.getState();
  const tab = store.tabs.find((t) => t.id === tabId);
  if (!tab || tab.topicsLocked) return;

  // Dragging a selected row moves the whole selection; anything else
  // resets the selection to just this row.
  const ids = tab.selectedTopicIds.includes(topicId) ? tab.selectedTopicIds : [topicId];

  /**
   * THE SILENT REFUSAL DIED HERE (docs/21, Decision 9).
   *
   * This line used to read `if (anyTopicLocked(...)) return` — the one
   * drag surface in the app that declined without a sentence, and the
   * place a pin stopped being a write permission and started being a
   * restriction on thought. A pinned row (or a selection holding one)
   * now begins a drag like any other row, in EVERY tab state. What
   * differs is the drop: a Grounded-unasked tab opens the seam, a
   * declined one refuses with a sentence naming the escape hatch, and an
   * Aspirational one commits badged.
   *
   * The keyboard delete (`useKeyboard.ts`) is equally silent and
   * deliberately survives: the seam licenses imagination about
   * PLACEMENT, and a deletion is not an arrangement.
   */

  const drag = useDragStore.getState();
  startDragGesture(down, {
    onStart: (e) => {
      if (!tab.selectedTopicIds.includes(topicId)) store.setTopicSelection([topicId]);
      const title =
        locateTopicInDocument(tab.editor.document, topicId)?.topic.title ?? "topic";
      // Which cards can receive this, answered once from the SAME
      // predicates the drop and the executor use. A highlight derived
      // from a second rule would light a card the release then refuses.
      //
      // TWO PREDICATES NOW, because there are two reasons a card can be
      // ineligible: the move axis refuses it (`topicMoveRefusal`), or
      // this TAB has declined to hold pinned displacements. The second
      // is a gesture-consent question and lives only here — no command
      // and no adapter may read a tab's state — but it belongs in the
      // same affirmative set, or a declined tab would light every card
      // and refuse each on arrival.
      const document_ = tab.editor.document;
      const eligible = document_.sections
        .filter((section) => {
          const to = { sectionId: section.id, parentTopicId: null };
          if (topicMoveRefusal(document_, ids, to) !== null) return false;
          return pinnedGate(tab, pinnedInMove(document_, ids, to).length) !== "refuse";
        })
        .map((section) => section.id);
      drag.set({
        kind: "topics",
        topicIds: ids,
        ghostLabel: ids.length > 1 ? `${ids.length} topics` : title,
        pointer: { x: e.clientX, y: e.clientY },
        dropTarget: null,
        eligibleSectionIds: eligible,
      });
    },
    onMove: (e) => {
      const current = activeTab();
      const target = current ? resolveDrop(e, current, ids) : null;
      // The cursor is the COMMIT PREDICATE'S COSTUME — same function the
      // executor calls, never a second opinion. If these two ever
      // disagree the user is told a drop is fine and then watches it do
      // nothing — a refusal that shows nothing reads as a broken feature.
      const to =
        target === null || target.kind === "canvas"
          ? null
          : {
              sectionId: target.sectionId,
              parentTopicId: target.kind === "topic" ? target.parentTopicId : null,
            };
      // THE BIRTH'S OWN SLOT, when the drop is a canvas drop. The
      // refusal keys on the home the position names, so the discriminant
      // needs the position — and gets exactly the one the commit will
      // use, from the same target.
      const birthAt =
        target !== null && target.kind === "canvas" && current !== null
          ? {
              columnIds: current.editor.columns[target.toColumn] ?? [],
              cardIndex: target.toIndexInColumn,
            }
          : undefined;
      const reason =
        current !== null && target !== null
          ? topicMoveRefusal(current.editor.document, ids, to, undefined, birthAt)
          : null;

      // WHAT THIS DROP WOULD DISPLACE, and what this tab says about it.
      // A within-parent reorder of a pinned row displaces nothing and
      // therefore says nothing — in every tab state, including declined,
      // where the hand gains sibling reorder of a pinned row for the
      // first time.
      //
      // A CANVAS DROP DISPLACES TOO, since docs/22 retired
      // `pinned-to-card`: a pinned row that lands inside a born card has
      // changed parent exactly as one dropped on an existing card has.
      // `pinnedInMove` already answers for `to === null` — "a new parent
      // by definition" — so the exclusion below simply went away.
      const pinned =
        current !== null && target !== null
          ? pinnedInMove(current.editor.document, ids, to)
          : [];
      // THE SECOND CAUSE (docs/22, Decision 7): a drop that MAKES
      // structure the write path cannot record.
      const cause: SeamCause = {
        pinnedCount: pinned.length,
        creates:
          target?.kind === "canvas" &&
          current !== null &&
          !createCards(current.editor.document),
      };
      const gate = consentGate(current ?? {}, cause);
      const refusalCopy =
        reason !== null
          ? refusalSentence(reason, birthContext(current, ids, birthAt, reason))
          : gate === "refuse"
            ? seamRefusalSentence(cause)
            : null;
      const refused = refusalCopy !== null;
      setRefusedCursor(refused);

      // What the drop WILL do, when it is allowed. Consent is in the
      // gesture: the label states the consequence in the target
      // system's own terms — where the file lands first, then what it
      // costs — and the inbound line is ABSENT rather than zero when
      // nothing was measured.
      const label =
        !refused && current !== null && to !== null
          ? moveLabel(current.editor.document, ids, to)
          : null;

      drag.set({
        pointer: { x: e.clientX, y: e.clientY },
        dropTarget: refused ? null : target,
        // The same channel the container refusal uses (`cardDrag.ts` →
        // `dragStore.refusal` → `DragOverlay`), which already renders for
        // `kind === "topics"`. The message was missing here only because
        // nothing set the field — the overlay was ready the whole time.
        refusal: refusalCopy,
        dropLabel: label?.destination ?? null,
        dropDetail: label?.inbound ?? null,
        // Shown while the drop is still LIVE — a seam that only spoke at
        // release would be the consequence arriving after the decision.
        dropConsequence: refused
          ? null
          : (pinnedDropConsequence(pinned) ?? creationConsequence(cause)),
      });
    },
    onEnd: (cancelled) => {
      const { dropTarget: target, pointer } = useDragStore.getState();
      setRefusedCursor(false);
      // Read BEFORE the reset: the seam needs the release point, and
      // `reset()` clears the pointer along with everything else.
      const at = pointer;
      drag.reset();
      if (cancelled || !target) return;

      // RE-READ THE TAB, never the closure's copy: a drag is long-lived
      // and the tab it started on may have been switched, closed or made
      // Aspirational in between.
      const current = activeTab();
      const drop =
        target.kind === "canvas"
          ? null
          : {
              sectionId: target.sectionId,
              parentTopicId: target.kind === "topic" ? target.parentTopicId : null,
              index: target.index,
            };
      const birth =
        target.kind === "canvas"
          ? { toColumn: target.toColumn, toIndexInColumn: target.toIndexInColumn }
          : undefined;

      const document_ = current?.editor.document;
      // THE BIRTH BRANCH DELEGATES, so the gate has ONE site rather than
      // one per gesture (see `birthOrSeam`).
      if (birth && current && at) {
        birthOrSeam(current.id, ids, birth, at);
        return;
      }
      const pinned = current ? pinnedInMove(current.editor.document, ids, drop) : [];
      // The BIRTH branch left above, through the gate both share, so
      // what remains here is the pinned cause alone.
      const cause: SeamCause = { pinnedCount: pinned.length, creates: false };
      const gate = consentGate(current ?? {}, cause);

      // Belt: `onMove` already withheld the target on a declined tab, so
      // there is nothing to arrive here — but a commit predicate that
      // trusted a visual is the shape that once let the sidebar commit the
      // move the canvas refused.
      if (gate === "refuse") return;

      if (gate === "seam" && current && at) {
        // HELD, NOT COMMITTED. No displacement and no card commits
        // before the seam answers — that is what makes the question a
        // question.
        useUiStore.getState().setPinnedSeam({
          x: at.x,
          y: at.y,
          tabId: current.id,
          topicIds: [...ids],
          drop,
          ...(birth ? { birth } : {}),
          cause,
          ...(document_ && cardNoun(document_) ? { cardNoun: cardNoun(document_)! } : {}),
          movingCount: ids.length,
        });
        return;
      }

      animatedDispatch({
        type: "moveTopics",
        topicIds: ids,
        toSectionId: drop!.sectionId,
        toParentTopicId: drop!.parentTopicId,
        toIndex: drop!.index,
      });
    },
  });
}

/**
 * The context the unhoused-species sentence needs, or undefined for every
 * other reason.
 *
 * Composed HERE rather than inside `guards.ts` because the two files
 * split by job, not by data: the discriminant is the rule's, the
 * sentence is the voice's, and what crosses between them is the reason
 * plus the values that reason's own sentence names.
 */
function birthContext(
  tab: TabState | null,
  ids: readonly TopicId[],
  birthAt: { columnIds: readonly string[]; cardIndex: number } | undefined,
  /**
   * TYPED, AND THE TYPE IS THE TEST. This was `reason: string`, and a
   * `string` cannot be checked — so when the discriminant was renamed
   * (`unhoused-birth` → `unhoused-species`, once the same fact started
   * refusing a second gesture) every typed site moved and this one did
   * not. Nothing failed: the comparison stopped matching, the context
   * arrived `undefined`, and the sentence quietly degraded to the
   * general fact — still true, and no longer naming the lanes that bear
   * the card, which is the half a user can act on.
   */
  reason: TopicMoveRefusal,
) {
  if (reason !== "unhoused-species" || !tab || !birthAt) return undefined;
  const document_ = tab.editor.document;
  const moving = ids
    .map((id) => locateTopicInDocument(document_, id)?.topic)
    .filter((t) => t !== undefined);
  const chain = resolveBirth(
    document_,
    birthAt.columnIds,
    birthAt.cardIndex,
    moving.map((t) => ({
      childless: t.children.length === 0,
      pinned: t.lock !== undefined,
    })),
  ).chain;
  // WHAT THE ENTRY ASKED TO BE, which is what the sentence names homes
  // for: suggesting section lanes to a standalone would be advice that
  // produces this same refusal again.
  const wants =
    moving.length === 1 && moving[0]!.children.length === 0
      ? ("standalone" as const)
      : ("section" as const);
  return { doc: document_, chain, wants };
}

/**
 * The consequence line for a structure-MAKING drop, at the pointer,
 * before release (docs/16's pattern, docs/22's second cause).
 *
 * SECOND, NEVER BOTH. `pinnedDropConsequence` wins where a drop carries
 * both facts, because the pin is the one the user did not choose; the
 * seam's own headline is where both counts are named, and two lines at a
 * pointer mid-gesture is a paragraph nobody reads.
 */
function creationConsequence(cause: SeamCause): string | null {
  return cause.creates ? "→ new card needs your hand here" : null;
}

/**
 * Commit a drop the seam held, having answered its question.
 *
 * The `commitCardMove` precedent (docs/13): the menu chooses, this
 * commits, and the drag layer keeps the one copy of what a drop means.
 *
 * ORDER IS LOAD-BEARING. The tab flips first, so the move lands on a tab
 * that already holds the standing consent — and a later pinned drag or
 * canvas drop on it finds `aspirational` set and raises no second seam.
 * Two writes rather than one because they are two facts: the tab's state
 * is not undoable (`commands/types.ts` — view and consent state never
 * enter undo history), while the move and its record are one undoable
 * unit.
 *
 * BOTH CAUSES COMMIT HERE (docs/22, Decision 7), because there is one
 * consent and therefore one commit path. A null `drop` is the BIRTH: the
 * seam held a canvas drop, and what it releases is the create command
 * rather than the move. Two shapes rather than one field carrying both,
 * for the reason `PinnedSeamState` gives at its own declaration.
 */
export function commitSeamDrop(
  tabId: string,
  topicIds: readonly TopicId[],
  drop: { sectionId: string; parentTopicId: string | null; index: number } | null,
  birth: { toColumn: number; toIndexInColumn: number } | undefined,
): void {
  useAppStore.getState().setTabAspirational(tabId, true);
  if (drop === null) {
    // A guard consumes declared inputs: a held birth with no slot is not
    // a drop anybody can replay.
    if (!birth) return;
    animatedDispatch({
      type: "moveTopicsToNewSection",
      topicIds: [...topicIds],
      toColumn: birth.toColumn,
      toIndexInColumn: birth.toIndexInColumn,
    });
    return;
  }
  animatedDispatch({
    type: "moveTopics",
    topicIds: [...topicIds],
    toSectionId: drop.sectionId,
    toParentTopicId: drop.parentTopicId,
    toIndex: drop.index,
  });
}

/**
 * The seam's "no": a MODE answer, not a move answer.
 *
 * It does not mean "cancel this drop and ask again next time" — it sets
 * the decline, and later pinned drags refuse with the sentence that
 * names the way back. The drop itself simply does not happen; one
 * gesture, one answer, including for the unpinned rows travelling with
 * it.
 */
export function declinePinnedDrop(tabId: string): void {
  useAppStore.getState().declineSeam(tabId);
}

/**
 * MAKE A CARD, OR ASK FIRST — the one gate every structure-MAKING
 * gesture goes through (docs/22, Decision 7).
 *
 * TWO GESTURES REACH IT, and that is exactly why it exists. The drag's
 * release is one; "Move to new card" in the row menu is the other, and
 * leaving the second ungated would be the shape this project has a file
 * named after: a second entry point enforcing a subset of the first's
 * rules, which is how the sidebar once committed the move the canvas
 * refused. Decision 7 names the canvas drop and "Add heading"; the
 * menu command is the same rule's third gesture, with the same
 * consequence, so it answers to the same consent.
 *
 * `at` is where the seam would OPEN — a release point for the drag, the
 * menu's own corner for the menu. A seam that appeared somewhere else
 * would be a question about a gesture the user cannot see.
 */
export function birthOrSeam(
  tabId: string,
  topicIds: readonly TopicId[],
  slot: { toColumn: number; toIndexInColumn: number },
  at: { x: number; y: number },
): void {
  const tab = useAppStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return;
  const document_ = tab.editor.document;
  const cause: SeamCause = {
    pinnedCount: pinnedInMove(document_, topicIds, null).length,
    creates: !createCards(document_),
  };
  const gate = consentGate(tab, cause);
  if (gate === "refuse") return;
  if (gate === "seam") {
    useUiStore.getState().setPinnedSeam({
      x: at.x,
      y: at.y,
      tabId,
      topicIds: [...topicIds],
      drop: null,
      birth: slot,
      cause,
      ...(cardNoun(document_) ? { cardNoun: cardNoun(document_)! } : {}),
      movingCount: topicIds.length,
    });
    return;
  }
  animatedDispatch({
    type: "moveTopicsToNewSection",
    topicIds: [...topicIds],
    toColumn: slot.toColumn,
    toIndexInColumn: slot.toIndexInColumn,
  });
}
