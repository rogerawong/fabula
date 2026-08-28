/**
 * focusStore.ts — The focus REQUEST channel (docs/17).
 *
 * Clicking a finding has to open a path inside a card, and the state
 * that decides what is open already exists: `TopicTree`'s own per-node
 * overrides, the same map a chevron click writes. So this store carries
 * a REQUEST, consumed by the card that owns it, and never a second copy
 * of the expansion state — lifting the overrides up here would refactor
 * working view-state for the benefit of a read-only reader, and drag
 * persistence and cross-tab surface along with it.
 *
 * Four guards, each for a failure the channel would otherwise have:
 *
 * - **Consume-once.** Every request carries a nonce and is cleared the
 *   moment its card applies it, so a re-render cannot re-open a path the
 *   user has since closed by hand.
 * - **Card-addressed ownership.** A request names one section, and a
 *   request no card can own is refused at dispatch rather than left to
 *   sit unclaimed while the pan waits on an ack that never arrives.
 * - **Ack-before-pan.** `applied` is published only once the card has
 *   expanded, because expansion changes layout and measuring first would
 *   pan to where the node used to be.
 * - **Pan and flash live outside the tree.** The tree's job is the
 *   overrides map; moving the viewport is the canvas's.
 */

import { create } from "zustand";
import { focusPath } from "@/model/focusPath";
import type { NodeRef } from "@/collections/importEvidence";
import type { SectionId, TocDocument, TopicId } from "@/model/types";

export interface FocusRequest {
  /** Consume-once token; also the applied signal's identity. */
  nonce: number;
  /** The card that owns this request. No other card may apply it. */
  sectionId: SectionId;
  /** Ancestors to open, outermost first. Never includes a boundary. */
  expand: TopicId[];
  /** The node to bring into view; undefined means the card itself. */
  target?: TopicId;
  /** True when a boundary stopped the walk short of the asked-for node. */
  stoppedAtBoundary: boolean;
}

/** What the pan/flash orchestrator waits for. */
export interface FocusApplied {
  nonce: number;
  sectionId: SectionId;
  target?: TopicId;
}

interface FocusState {
  request: FocusRequest | null;
  applied: FocusApplied | null;
  /** Panel → channel. Computes the path and addresses it to its card. */
  requestFocus: (doc: TocDocument, subject: NodeRef) => void;
  /** Owning card → channel, once the overrides are written. */
  applyDone: (nonce: number) => void;
  reset: () => void;
}

let nextNonce = 1;

export const useFocusStore = create<FocusState>((set, get) => ({
  request: null,
  applied: null,

  requestFocus: (doc, subject) => {
    const path = focusPath(doc, subject);
    if (!path) {
      // Unowned: no card can ever apply this, so the pan would wait
      // forever. Loud in dev, silent-and-harmless in production.
      if (import.meta.env?.DEV) {
        console.warn(
          `[focus] no card owns section "${subject.sectionId}" — request dropped`,
        );
      }
      return;
    }
    set({
      request: {
        nonce: nextNonce++,
        sectionId: path.sectionId,
        expand: path.expand,
        ...(path.target !== undefined ? { target: path.target } : {}),
        stoppedAtBoundary: path.stoppedAtBoundary,
      },
      applied: null,
    });
  },

  applyDone: (nonce) => {
    const request = get().request;
    // A card that re-renders after a newer request landed must not
    // consume it.
    if (!request || request.nonce !== nonce) return;
    set({
      request: null,
      applied: {
        nonce,
        sectionId: request.sectionId,
        ...(request.target !== undefined ? { target: request.target } : {}),
      },
    });
  },

  reset: () => set({ request: null, applied: null }),
}));
