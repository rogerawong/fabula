/**
 * App shell — the sidebar spans the FULL height of the
 * window (wordmark on top, sections, minimap, tagline); header, tab
 * bar, toolbar, and canvas live in the right column, so tabs start
 * over the canvas area.
 *
 * The shell owns the layout: during a card drag the drag store's
 * previewColumns replace the committed columns, so the canvas AND the
 * sidebar preview the resulting arrangement live — the command only
 * fires on drop.
 */

import { Toaster } from "sonner";
import { useKeyboard } from "./useKeyboard";
import { useDragStore } from "@/interaction/dragStore";
import { selectActiveTab, useAppStore } from "@/store";
import { Canvas } from "@/view/canvas/Canvas";
import { DragOverlay } from "@/view/canvas/DragOverlay";
import { GhostLayer } from "@/view/canvas/GhostLayer";
import { useLayout } from "@/view/canvas/useLayout";
import { EmptyState } from "@/view/EmptyState";
import { Header } from "@/view/Header";
import { LoadDialog } from "@/view/LoadDialog";
import { ReorganizeDialog } from "@/view/reorganize/ReorganizeDialog";
import { ChangesDialog } from "@/view/ChangesDialog";
import { CanvasContextMenu } from "@/view/canvas/CanvasContextMenu";
import { OverviewPanel } from "@/view/OverviewPanel";
import { SeamMenu } from "@/view/canvas/SeamMenu";
import { PinnedSeamMenu } from "@/view/canvas/PinnedSeamMenu";
import { Sidebar } from "@/view/Sidebar";
import { TabBar } from "@/view/TabBar";
import { Toolbar } from "@/view/Toolbar";

export function App() {
  const tab = useAppStore(selectActiveTab);
  useKeyboard();
  const previewColumns = useDragStore((s) => s.previewColumns);
  const layout = useLayout(tab, previewColumns ?? undefined);
  const columns = tab ? (previewColumns ?? tab.editor.columns) : [];

  return (
    <div className="flex h-screen overflow-hidden text-neutral-800 antialiased">
      <Sidebar tab={tab} layout={layout} columns={columns} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header tab={tab} />
        <TabBar />
        {tab && layout ? (
          // The drawer is a sibling of the canvas, not an overlay on the
          // app: covering the header would hide the control that opened
          // it, and the tab bar with it.
          <div className="relative flex min-h-0 flex-1 flex-col">
            <Toolbar tab={tab} />
            <Canvas tab={tab} layout={layout} />
            <OverviewPanel tab={tab} />
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
      <DragOverlay />
      <GhostLayer />
      <LoadDialog />
      <ReorganizeDialog />
      <ChangesDialog />
      <CanvasContextMenu />
      <SeamMenu />
      <PinnedSeamMenu />
      <Toaster position="bottom-right" gap={8} />
    </div>
  );
}
