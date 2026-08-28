/**
 * ContextMenu.tsx — Minimal reusable right-click menu. Fixed-position
 * at the pointer (screen-edge clamped), closes on outside pointerdown,
 * Escape, or window blur. Selecting an item closes first, then acts —
 * so actions that open dialogs/toasts never race the teardown.
 * Deliberately tiny: the trigger owns what goes in.
 *
 * THREE THINGS AN ITEM MAY CARRY BEYOND ITS LABEL, and each is a line
 * this project already owed somewhere:
 *
 * - a `header`, for the one menu that is a SEAM rather than a list of
 *   commands (docs/13: two readings genuinely live, so the menu states
 *   the situation before offering the two answers);
 * - a `detail`, for an item whose consequence is not obvious from four
 *   words — rendered as its own element BELOW the label, never joined
 *   into it, because the label truncates and a truncation wrapper owns
 *   single-line text only;
 * - a `disabledReason`, which is the ONLY way to disable an item.
 *
 * DISABLED WITH A REASON IS STRUCTURAL HERE, not a convention (docs/12
 * decision 5). There is no `disabled` boolean: a control that cannot
 * work must say why, and making the reason the mechanism means a silent
 * disable has nowhere to live. The reason renders VISIBLY rather than on
 * hover — a disabled control swallows the pointer events a tooltip needs
 * (`SettingsView.tsx` works around exactly that with a wrapper), and a
 * menu is not a place to go hunting for hover targets.
 */

import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  /** Destructive styling (still undoable — no confirms in this app). */
  danger?: boolean;
  /** What choosing this does, when the label cannot carry it. */
  detail?: string;
  /** Why this cannot be chosen. Present ⇒ the item is disabled; there is
   *  no other way to disable one. */
  disabledReason?: string;
}

const MENU_WIDTH = 176;
/** A seam's options carry a sentence each, so the menu needs room for
 *  prose rather than for four words. */
const WIDE_WIDTH = 280;
const ITEM_HEIGHT = 30;
/** Rough per-line allowance for the second lines, for edge clamping
 *  only — the menu is never sized from this, only kept on screen. */
const DETAIL_HEIGHT = 34;

export function ContextMenu({
  x,
  y,
  header,
  items,
  onClose,
}: {
  x: number;
  y: number;
  /** States the situation, for a menu that asks rather than lists. */
  header?: string;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    // capture phase: close even when the click lands on something that
    // stops propagation (cards, rows, other menus)
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const wide =
    header !== undefined ||
    items.some((i) => i.detail !== undefined || i.disabledReason !== undefined);
  const width = wide ? WIDE_WIDTH : MENU_WIDTH;
  const height =
    items.length * ITEM_HEIGHT +
    items.filter((i) => i.detail ?? i.disabledReason).length * DETAIL_HEIGHT +
    (header ? DETAIL_HEIGHT : 0);

  const left = Math.max(4, Math.min(x, window.innerWidth - width - 4));
  const top = Math.max(4, Math.min(y, window.innerHeight - height - 12));

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="context-menu"
      className="fixed z-50 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg"
      style={{ left, top, width }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {header && (
        <p
          data-testid="context-menu-header"
          className="border-b border-neutral-100 px-2.5 pb-2 pt-1.5 text-[12px] leading-snug text-neutral-600"
        >
          {header}
        </p>
      )}
      {items.map((item) => {
        const second = item.disabledReason ?? item.detail;
        const body = (
          <>
            <span className="block truncate">{item.label}</span>
            {/* Its own element, outside the truncating span: composed
                content inside a truncation wrapper is eaten silently
                while every state assertion passes. */}
            {second && (
              <span
                data-testid={
                  item.disabledReason ? "menu-item-reason" : "menu-item-detail"
                }
                className="mt-0.5 block text-[11px] leading-snug text-neutral-500"
              >
                {second}
              </span>
            )}
          </>
        );

        if (item.disabledReason !== undefined) {
          return (
            <div
              key={item.label}
              role="menuitem"
              aria-disabled="true"
              data-menu-disabled="true"
              className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-neutral-400"
            >
              {body}
            </div>
          );
        }
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={`block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-neutral-100 ${
              item.danger ? "text-red-600" : "text-neutral-700"
            }`}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
