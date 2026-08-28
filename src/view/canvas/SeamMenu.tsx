/**
 * SeamMenu.tsx — The two-option menu for a card dropped at the boundary
 * between two navigation containers (docs/13 v2).
 *
 * Between the last card of one container and the first of another,
 * reorder-within and move-between are the same pixel and there is no
 * defensible default, so this is the one drop that asks. It asks WHICH
 * MOVE, never whether to proceed: a proceed/cancel modal would presume
 * the cross-container reading at exactly the position where that reading
 * is least certain, and the operation is undoable, visible and
 * non-destructive besides.
 */

import { commitCardMove } from "@/interaction/cardDrag";
import { ContextMenu } from "../ContextMenu";
import { useUiStore } from "../uiStore";

export function SeamMenu() {
  const menu = useUiStore((s) => s.seamMenu);
  const close = useUiStore((s) => s.setSeamMenu);
  if (!menu) return null;

  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      onClose={() => close(null)}
      items={[
        {
          // Named first because it is the smaller change of the two.
          label: `Keep in ${menu.keep} (reorder)`,
          onSelect: () => {
            close(null);
            commitCardMove(menu.sectionId, menu.target, null);
          },
        },
        {
          label: `Move to ${menu.into}`,
          onSelect: () => {
            close(null);
            commitCardMove(menu.sectionId, menu.target, menu.chain, menu.into);
          },
        },
      ]}
    />
  );
}
