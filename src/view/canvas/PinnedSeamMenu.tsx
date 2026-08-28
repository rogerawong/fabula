/**
 * PinnedSeamMenu.tsx — the two-option menu for a drop that would move a
 * pinned row on a Grounded-unasked tab (docs/21, Decision 9).
 *
 * THE SECOND SEAM IN THE APP, and it is the docs/13 shape deliberately:
 * two readings are genuinely live, the operation is undoable and
 * non-destructive, so the release asks WHICH rather than WHETHER. The
 * card seam asks which move was meant; this one asks what kind of tab
 * this is.
 *
 * ONE MENU, TWO CAUSES (docs/22, Decision 7). It asks the same question
 * for a drop that would displace a PINNED ROW and for one that would
 * MAKE STRUCTURE the write path cannot record — because there is one
 * consent (OR-3), and two menus would put a second indistinguishable
 * toggle on the tab. What differs is the sentence, which `seamCopy`
 * owns; this component renders whichever cause the drop carried and
 * never decides which that is.
 *
 * A MODE CHOICE, NEVER A MOVE CONFIRMATION. "Yes" does not authorize
 * anything on disk — the seam's yes licenses a displacement to EXIST on
 * the canvas, labeled, and does not bring its write one inch closer.
 * That is why neither option says "move" or "cancel": both are sentences
 * about the tab, and the copy states the SPLIT rather than a vanishing.
 *
 * "No" answers the MODE too. It is not "cancel this drop and ask again
 * next time" — it sets the decline, and later pinned drags refuse with
 * the sentence that names the way back.
 */

import { commitSeamDrop, declinePinnedDrop } from "@/interaction/topicDrag";
import { seamCopy } from "@/interaction/pinnedDrag";
import { ContextMenu } from "../ContextMenu";
import { useUiStore } from "../uiStore";

export function PinnedSeamMenu() {
  const seam = useUiStore((s) => s.pinnedSeam);
  const close = useUiStore((s) => s.setPinnedSeam);
  if (!seam) return null;

  const copy = seamCopy(seam.cause, seam.movingCount, seam.cardNoun);

  return (
    <ContextMenu
      x={seam.x}
      y={seam.y}
      header={copy.headline}
      onClose={() => {
        // DISMISSAL IS NOT AN ANSWER. Escaping or clicking away leaves
        // the tab unasked and the row where it was — the seam may offer
        // again. Only the explicit "Keep this tab Grounded" is a
        // decline, because a decline is sticky and a stray click must
        // not spend it.
        close(null);
      }}
      items={[
        {
          label: copy.proceed.label,
          detail: copy.proceed.detail,
          onSelect: () => {
            close(null);
            commitSeamDrop(seam.tabId, seam.topicIds, seam.drop, seam.birth);
          },
        },
        {
          label: copy.decline.label,
          detail: copy.decline.detail,
          onSelect: () => {
            close(null);
            declinePinnedDrop(seam.tabId);
          },
        },
      ]}
    />
  );
}
