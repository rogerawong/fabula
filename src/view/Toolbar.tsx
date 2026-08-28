/**
 * Toolbar.tsx — Depth commands (routed to the selected card when one is
 * selected, global otherwise — docs/02 §2) + topics lock. All commands
 * flow through dispatch, so depth changes are undoable.
 */

import {
  ChevronsDown,
  ChevronsDownUp,
  ChevronsUp,
  ChevronsUpDown,
  LayoutGrid,
  Lock,
  LockOpen,
} from "lucide-react";
import { animatedDispatch } from "@/animation/animatedActions";
import { deriveSectionOrder } from "@/layout/columns";
import { distributeIntoColumns } from "@/layout/positions";
import { useAppStore, type TabState } from "@/store";
import { useCanvasSize } from "./canvas/canvasSize";
import { MIN_DEPTH, docMaxDepth, effectiveDepth } from "./depth";
import { useTooltip } from "./Tooltip";

export function Toolbar({ tab }: { tab: TabState }) {
  const setTopicsLocked = useAppStore((s) => s.setTopicsLocked);

  // depth targets ONE card; a multi-card selection adjusts global depth
  const selected =
    tab.selectedSectionIds.length === 1 ? tab.selectedSectionIds[0]! : null;
  const maxDepth = docMaxDepth(tab);
  const current = selected ? effectiveDepth(tab, selected) : tab.editor.view.globalDepth;

  const setDepth = (depth: number) => {
    const clamped = Math.min(Math.max(depth, MIN_DEPTH), maxDepth);
    if (selected) {
      animatedDispatch({ type: "setCardDepth", sectionId: selected, depth: clamped });
    } else {
      animatedDispatch({ type: "setGlobalDepth", depth: clamped });
    }
  };

  // Bin-pack the CURRENT order into fresh columns (docs/03: bin-packing
  // runs only on load and here). One undoable command; FLIP animates
  // the reflow.
  const autoArrange = () => {
    const canvas = useCanvasSize.getState();
    animatedDispatch({
      type: "setColumns",
      columns: distributeIntoColumns(tab.editor.document.sections, {
        order: deriveSectionOrder(tab.editor.columns),
        // Containers get their own columns: a drop target has to be
        // visible when the canvas is tidy (docs/13 v2).
        containers: tab.editor.document.containers,
        globalDepth: tab.editor.view.globalDepth,
        cardDepths: tab.editor.view.cardDepths,
        viewportHeight:
          canvas.height > 0 ? canvas.height / tab.viewport.scale : undefined,
      }),
    });
  };

  const btn =
    "flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent";

  // Styled tooltips for the buttons whose visible text does not already
  // say everything (Tooltip.tsx — the one tooltip system). "Collapse
  // all" / "Expand all" say it on the button and carry none.
  const minusTip = useTooltip(["Collapse one level"]);
  const plusTip = useTooltip(["Expand one level"]);
  const arrangeTip = useTooltip(["Re-pack cards into columns (undoable)"]);
  const lockTip = useTooltip(["Toggle topics lock (L)"]);

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-neutral-200 bg-white px-3">
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        Depth
      </span>
      <button
        type="button"
        className={btn}
        aria-label="Collapse all"
        disabled={current <= MIN_DEPTH}
        onClick={() => setDepth(MIN_DEPTH)}
      >
        <ChevronsDownUp size={14} /> Collapse all
      </button>
      <button
        type="button"
        className={btn}
        aria-label="Collapse one level"
        {...minusTip.props}
        disabled={current <= MIN_DEPTH}
        onClick={() => setDepth(current - 1)}
      >
        <ChevronsUp size={14} /> −1
      </button>
      {minusTip.node}
      <button
        type="button"
        className={btn}
        aria-label="Expand one level"
        {...plusTip.props}
        disabled={current >= maxDepth}
        onClick={() => setDepth(current + 1)}
      >
        <ChevronsDown size={14} /> +1
      </button>
      {plusTip.node}
      <button
        type="button"
        className={btn}
        aria-label="Expand all"
        disabled={current >= maxDepth}
        onClick={() => setDepth(maxDepth)}
      >
        <ChevronsUpDown size={14} /> Expand all
      </button>

      <span
        className="ml-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[12px] font-medium tabular-nums text-neutral-600"
        data-testid="depth-indicator"
      >
        depth {current} / {maxDepth}
      </span>
      <span className="text-[12px] text-neutral-400" data-testid="depth-scope">
        {selected ? "applies to selected card" : "applies to all cards"}
      </span>

      <button
        type="button"
        data-testid="auto-arrange"
        className={`${btn} ml-auto`}
        aria-label="Auto-arrange cards"
        {...arrangeTip.props}
        onClick={autoArrange}
      >
        <LayoutGrid size={14} /> Auto-arrange
      </button>
      {arrangeTip.node}
      <button
        type="button"
        className={btn}
        aria-label={tab.topicsLocked ? "Unlock topics" : "Lock topics"}
        aria-pressed={tab.topicsLocked}
        {...lockTip.props}
        onClick={() => setTopicsLocked(tab.id, !tab.topicsLocked)}
      >
        {tab.topicsLocked ? <Lock size={14} /> : <LockOpen size={14} />}
        {tab.topicsLocked ? "Topics locked" : "Lock topics"}
      </button>
      {lockTip.node}
    </div>
  );
}
