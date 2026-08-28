/**
 * TabBar.tsx — Multiple documents, side by side (docs/02 §5): switch,
 * rename (double-click or context menu), duplicate + close via
 * RIGHT-CLICK context menu (the browser-tab idiom — a menu trigger
 * can't misfire the way the old per-tab Copy button could), close ×
 * with undo-toast + Ctrl/Cmd+Shift+T reopen. "+" opens the load
 * dialog — loading NEVER replaces a tab silently.
 */

import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useAppStore, type TabState } from "@/store";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { InlineEdit } from "./InlineEdit";
import { useUiStore } from "./uiStore";
import { aspirationalControl } from "./aspirationalControl";
import { filesOf } from "@/collections/types";
import { deriveSectionOrder } from "@/layout/columns";
import { structureReport } from "@/model/remainders";

function closeWithUndoToast(tabId: string, name: string): void {
  const store = useAppStore.getState();
  store.closeTab(tabId);
  const depth = useAppStore.getState().closedTabs.length;
  const toastId = `close-${tabId}`;
  toast(`Closed "${name}"`, {
    id: toastId,
    duration: 5000,
    action: {
      label: "Undo",
      onClick: () => {
        toast.dismiss(toastId); // dismiss BEFORE mutating (toast + undo races)
        const s = useAppStore.getState();
        if (s.closedTabs.length === depth && s.closedTabs.at(-1)?.tab.id === tabId) {
          s.reopenClosedTab();
        }
      },
    },
  });
}

function Tab({
  tab,
  active,
  renaming,
  onRenamingChange,
  onContextMenu,
}: {
  tab: TabState;
  active: boolean;
  renaming: boolean;
  onRenamingChange: (renaming: boolean) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const store = useAppStore.getState();

  return (
    <div
      data-testid="tab"
      data-tab-active={active || undefined}
      className={`group flex h-9 max-w-52 cursor-pointer items-center gap-1 border-r border-neutral-100 px-3 text-[13px] ${
        active
          ? "bg-white font-medium text-neutral-900 shadow-[inset_0_-2px_0_0_theme(colors.neutral.700)]"
          : "bg-neutral-50 text-neutral-500 hover:bg-neutral-100"
      }`}
      onClick={() => store.setActiveTab(tab.id)}
      onDoubleClick={() => onRenamingChange(true)}
      onContextMenu={onContextMenu}
    >
      {renaming ? (
        <InlineEdit
          value={tab.name}
          className="w-32 text-[13px]"
          onCommit={(name) => {
            onRenamingChange(false);
            useAppStore.getState().renameTab(tab.id, name);
          }}
          onCancel={() => onRenamingChange(false)}
        />
      ) : (
        <span className="truncate">{tab.name}</span>
      )}
      <button
        type="button"
        aria-label={`Close ${tab.name}`}
        className="shrink-0 rounded-sm p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600"
        onClick={(e) => {
          e.stopPropagation();
          closeWithUndoToast(tab.id, tab.name);
        }}
      >
        <X size={13} />
      </button>
    </div>
  );
}

interface MenuTarget {
  x: number;
  y: number;
  tabId: string;
}

/**
 * The tab menu's items, including the per-tab aspirational control
 * (docs/21, Decision 9).
 *
 * THE CONTROL IS FIRST because it is the only item that is about this
 * tab's MEANING rather than its housekeeping, and because the declined
 * drag refusal sends the user here by name — arriving at a menu whose
 * promised item sits under "Rename" would be a signpost pointing at a
 * haystack.
 */
function tabMenuItems(tab: TabState, onRename: () => void): ContextMenuItem[] {
  // THE REPORT, so the switch back can be honest about BOTH kinds of
  // remainder (docs/22, OR-3).
  //
  // COMPUTED DIRECTLY, NOT MEMOIZED, and deliberately: this function is
  // not a component — it runs only while the context menu is mounted,
  // which is once per menu open. A `useMemo` here would be a hook in a
  // plain function, which is a rules-of-hooks violation rather than an
  // optimisation.
  const remainders = structureReport(
    tab.editor.document,
    filesOf(tab.editor.document),
    deriveSectionOrder(tab.editor.columns),
  );
  const control = aspirationalControl(tab, tab.editor.document, remainders);
  return [
    ...(control
      ? [
          {
            label: control.label,
            ...(control.disabledReason ? { disabledReason: control.disabledReason } : {}),
            onSelect: () =>
              useAppStore.getState().setTabAspirational(tab.id, control.next),
          },
        ]
      : []),
    {
      label: "Copy to new tab",
      onSelect: () => useAppStore.getState().duplicateTab(tab.id),
    },
    { label: "Rename", onSelect: onRename },
    {
      label: "Close",
      danger: true,
      onSelect: () => closeWithUndoToast(tab.id, tab.name),
    },
  ];
}

export function TabBar() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const setLoadDialogOpen = useUiStore((s) => s.setLoadDialogOpen);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  // The LIVE tab, re-read on every render: the aspirational control's
  // label and its G1 gate both read the document, which changes under
  // an open menu the moment a Put back lands.
  const menuTab = menu ? tabs.find((t) => t.id === menu.tabId) : undefined;
  if (tabs.length === 0) return null;

  return (
    <div
      className="flex h-9 shrink-0 items-stretch border-b border-neutral-200 bg-neutral-50"
      data-testid="tab-bar"
    >
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {tabs.map((t) => (
          <Tab
            key={t.id}
            tab={t}
            active={t.id === activeTabId}
            renaming={renamingId === t.id}
            onRenamingChange={(r) => setRenamingId(r ? t.id : null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, tabId: t.id });
            }}
          />
        ))}
      </div>
      <button
        type="button"
        aria-label="Open another TOC"
        className="flex w-9 shrink-0 items-center justify-center text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        onClick={() => setLoadDialogOpen(true)}
      >
        <Plus size={15} />
      </button>
      {menu && menuTab && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={tabMenuItems(menuTab, () => setRenamingId(menu.tabId))}
        />
      )}
    </div>
  );
}
