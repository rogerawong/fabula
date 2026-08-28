/**
 * CanvasContextMenu.tsx — Right-click menus for cards and topic rows,
 * scoped to the CORE hard-to-reach commands:
 * - rows: Move to new card (else drag-to-empty-canvas-only) + Remove
 * - cards: Reorganize with AI scoped to the card (else the
 *   select-then-dialog dance) + Remove card
 * Row menus act on the current topic selection — the trigger site
 * (TopicRow) selects an unselected row before opening, so the menu
 * always operates on what the user can see highlighted.
 */

import { animatedDispatch } from "@/animation/animatedActions";
import { birthOrSeam } from "@/interaction/topicDrag";
import { selectActiveTab, useAppStore } from "@/store";
import { ContextMenu } from "../ContextMenu";
import { useUiStore } from "../uiStore";
import { cardMenuRefusals } from "./cardMenu";
import { rowMenuRefusals } from "./rowMenu";

export function CanvasContextMenu() {
  const menu = useUiStore((s) => s.canvasMenu);
  const setMenu = useUiStore((s) => s.setCanvasMenu);
  if (!menu) return null;
  const close = () => setMenu(null);
  const { target } = menu;

  if (target.kind === "topics") {
    const n = target.topicIds.length;
    const noun = n === 1 ? "topic" : `${n} topics`;
    // A SELECTION MAY HOLD A PINNED ROW (docs/21, arc 2 — the row became
    // selectable so the seam could count it), and ONE of this menu's two
    // commands is still something a pin refuses. Remove is: deletion is
    // not displacement, so the lock's contract stands. "Move to new
    // card" is NOT, since docs/22 arc 2 — the birth wraps a pinned entry
    // instead of promoting it, so the pin survives and the displacement
    // records. Asked of the same predicates the keyboard and the
    // executor use, never re-derived: the menu that offers what the
    // command refuses is how the sidebar once committed the move the canvas
    // would not.
    const tab_ = selectActiveTab(useAppStore.getState());
    const document_ = tab_?.editor.document;
    /**
     * WHERE the new card would land — computed ONCE and used twice, for
     * the question and for the dispatch (docs/22, Decision 2).
     *
     * The birth's home is decided by this slot, so a menu that asked
     * without it would be asking a different question from the one it
     * then commits — the shape that once let the sidebar commit the move the
     * canvas refused. Land it right after the source card's slot.
     */
    const slot = (() => {
      const columns = tab_?.editor.columns ?? [];
      let toColumn = Math.max(0, columns.length - 1);
      let toIndexInColumn = columns[toColumn]?.length ?? 0;
      for (let c = 0; c < columns.length; c++) {
        const i = columns[c]!.indexOf(target.sectionId);
        if (i >= 0) {
          toColumn = c;
          toIndexInColumn = i + 1;
          break;
        }
      }
      return { toColumn, toIndexInColumn, columnIds: columns[toColumn] ?? [] };
    })();
    // A GUARD CONSUMES DECLARED INPUTS: with no document there is
    // nothing to ask, so nothing is refused rather than everything.
    const refusals = document_
      ? rowMenuRefusals(document_, target.topicIds, {
          columnIds: slot.columnIds,
          cardIndex: slot.toIndexInColumn,
        })
      : {};
    /**
     * THROUGH THE ONE GATE (docs/22, Decision 7). Dispatching directly
     * here would make this menu a second entry point enforcing a subset
     * of the drag's rules — the shape `guards.ts` is named after — and
     * the subset it would drop is CONSENT: the drag asks before making a
     * card the write path cannot record, and this would just make one.
     *
     * The seam opens at the menu's own corner, because a question about
     * a gesture has to appear where the gesture is.
     */
    const moveToNewCard = () => {
      if (!tab_) return;
      birthOrSeam(
        tab_.id,
        target.topicIds,
        { toColumn: slot.toColumn, toIndexInColumn: slot.toIndexInColumn },
        { x: menu.x, y: menu.y },
      );
    };
    return (
      <ContextMenu
        x={menu.x}
        y={menu.y}
        onClose={close}
        items={[
          {
            label: n === 1 ? "Move to new card" : `Move ${n} topics to new card`,
            ...(refusals.moveToNewCard ? { disabledReason: refusals.moveToNewCard } : {}),
            onSelect: moveToNewCard,
          },
          {
            label: `Remove ${noun}`,
            danger: true,
            ...(refusals.remove ? { disabledReason: refusals.remove } : {}),
            onSelect: () =>
              animatedDispatch({ type: "removeTopics", topicIds: target.topicIds }),
          },
        ]}
      />
    );
  }

  const tab = selectActiveTab(useAppStore.getState());
  const card = tab?.editor.document.sections.find((s) => s.id === target.sectionId);
  /**
   * THE SPECIES COMMANDS (docs/22, Decision 2), asked of the SAME
   * predicates the executor uses. A menu that offers what the command
   * refuses is how the sidebar once committed the move the canvas would not.
   *
   * A guard consumes declared inputs: with no card there is nothing to
   * ask, so both are refused-without-a-reason rather than offered.
   */
  const cardRefusals =
    tab && card ? cardMenuRefusals(tab.editor.document, card) : { addHeading: "" };
  // ONE SLOT, NOT TWO: a card is one species or the other, so exactly
  // one of these is ever the live command. Showing both with one greyed
  // would spend a menu row on a state that cannot change.
  const speciesItem = card?.isOrphan
    ? {
        label: "Add heading",
        ...(cardRefusals.addHeading ? { disabledReason: cardRefusals.addHeading } : {}),
        onSelect: () =>
          animatedDispatch({ type: "addHeading", sectionId: target.sectionId }),
      }
    : {
        label: "Remove heading",
        ...(cardRefusals.removeHeading
          ? { disabledReason: cardRefusals.removeHeading }
          : {}),
        onSelect: () =>
          animatedDispatch({ type: "removeHeading", sectionId: target.sectionId }),
      };

  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      onClose={close}
      items={[
        speciesItem,
        {
          label: "Reorganize with AI…",
          onSelect: () => {
            // the AI dialog seeds its scope from the selected card
            useAppStore.getState().selectSection(target.sectionId);
            useUiStore.getState().setAiDialogOpen(true);
          },
        },
        {
          label: "Remove card",
          danger: true,
          onSelect: () =>
            animatedDispatch({ type: "removeSection", sectionId: target.sectionId }),
        },
      ]}
    />
  );
}
