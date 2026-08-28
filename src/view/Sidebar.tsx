/**
 * Sidebar.tsx — Full-height left rail: app wordmark on
 * top, section list (click selects; drag reorders through the same
 * reorderCard command as the canvas), and the minimap. Rendered even
 * with no document — the shell stays stable while tabs come and go.
 * `columns` arrives from the app shell and already includes any live
 * drag preview. (The marketing tagline that used to sit under the
 * minimap was evicted — two critiques carried it as P3; the app does
 * not need to advertise itself to someone already inside it.)
 */

import { useMemo } from "react";
import { GripVertical } from "lucide-react";
import type { CanvasLayout } from "@/layout/positions";
import type { Columns } from "@/layout/columns";
import { ORPHAN_COLOR, sectionColorMap } from "@/model/palette";
import { sectionStats } from "@/model/selectors";
import { deriveSectionOrder } from "@/layout/columns";
import { beginSidebarCardDrag } from "@/interaction/cardDrag";
import { useDragStore } from "@/interaction/dragStore";
import { useAppStore, type TabState } from "@/store";
import { Minimap } from "./canvas/Minimap";

function SectionList({ tab, columns }: { tab: TabState; columns: Columns }) {
  const draggingCardId = useDragStore((s) => (s.kind === "card" ? s.cardId : null));
  const doc = tab.editor.document;
  const colors = useMemo(() => sectionColorMap(doc), [doc]);
  const order = deriveSectionOrder(columns);
  const byId = useMemo(() => new Map(doc.sections.map((s) => [s.id, s])), [doc]);

  return (
    <>
      <div className="border-b border-neutral-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        Sections{" "}
        <span className="font-normal normal-case tracking-normal text-neutral-300">
          — drag to reorder
        </span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5" data-testid="section-list">
        {order.map((id) => {
          const section = byId.get(id);
          if (!section) return null;
          const color = colors.get(id) ?? ORPHAN_COLOR;
          const selected = tab.selectedSectionIds.includes(id);
          return (
            <li key={id}>
              <button
                type="button"
                data-sidebar-row={id}
                className={`flex w-full cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] ${
                  draggingCardId === id
                    ? "bg-sky-50 opacity-60"
                    : selected
                      ? "bg-neutral-100 font-medium text-neutral-900"
                      : "text-neutral-600 hover:bg-neutral-50"
                }`}
                onPointerDown={(e) => {
                  if (e.button === 0) beginSidebarCardDrag(e, tab.id, id);
                }}
                onClick={(e) => {
                  // same gestures as the canvas: shift = range from the
                  // anchor in list order, alt/cmd = toggle
                  const store = useAppStore.getState();
                  if (e.shiftKey && tab.selectedSectionIds.length > 0) {
                    const anchor = tab.selectedSectionIds[0]!;
                    const a = order.indexOf(anchor);
                    const b = order.indexOf(id);
                    if (a >= 0 && b >= 0) {
                      const [lo, hi] = a <= b ? [a, b] : [b, a];
                      const range = order.slice(lo, hi + 1);
                      store.setSectionSelection([
                        anchor,
                        ...range.filter((x) => x !== anchor),
                      ]);
                      return;
                    }
                  }
                  if (e.metaKey || e.altKey) {
                    store.toggleSectionSelected(id);
                    return;
                  }
                  store.selectSection(selected ? null : id);
                }}
              >
                <GripVertical
                  size={12}
                  className="-ml-1 shrink-0 text-neutral-300"
                  aria-hidden="true"
                />
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color.border }}
                />
                <span className="truncate">{section.title}</span>
                <span className="ml-auto text-[11px] tabular-nums text-neutral-400">
                  {sectionStats(section).total}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function Sidebar({
  tab,
  layout,
  columns,
}: {
  tab: TabState | null;
  layout: CanvasLayout | null;
  columns: Columns;
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="flex h-12 shrink-0 items-center border-b border-neutral-200 px-4">
        <h1 className="text-heading font-bold tracking-tight text-neutral-800">Fabula</h1>
      </div>

      {tab ? (
        <SectionList tab={tab} columns={columns} />
      ) : (
        <div className="flex-1 px-4 py-5 text-[12px] leading-relaxed text-neutral-400">
          Load a table of contents to see its sections here.
        </div>
      )}

      {tab && layout && (
        <div className="border-t border-neutral-100 p-2">
          <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Minimap
          </div>
          <Minimap tab={tab} layout={layout} />
        </div>
      )}
    </aside>
  );
}
