/**
 * TopicTree.tsx — A card's recursive topic tree.
 *
 * Visibility: a node's children show when its level < the card's
 * effective depth, unless the user toggled its caret — explicit toggles
 * live in local state and are RESET whenever the effective depth
 * changes (the parent keys this component by depth).
 *
 * Focus (docs/17) writes into THIS map rather than bringing its own.
 * The Overview panel dispatches a request addressed to one card; the
 * card applies it here — producing state identical to the user having
 * opened that path by hand — and acknowledges, which consumes the
 * request and releases the pan. Expansion truth never leaves this
 * component.
 */

import { memo, useEffect, useMemo, useState } from "react";
import { useFocusStore } from "../focusStore";
import type { Topic, TopicId } from "@/model/types";
import type { RenameCapability } from "@/formats/types";
import { TopicRow, type RowContext } from "./TopicRow";

export const TopicTree = memo(function TopicTree({
  tabId,
  sectionId,
  sectionTitle,
  topics,
  depth,
  locked,
  renameable,
  selectedTopicIds,
  indicatorKey,
}: {
  tabId: string;
  sectionId: string;
  /** The card's own title — the "imagined under X" half of a top-level
   *  row's displacement badge (docs/21). */
  sectionTitle: string;
  topics: Topic[];
  depth: number;
  locked: boolean;
  renameable: RenameCapability;
  selectedTopicIds: readonly TopicId[];
  indicatorKey: string | null;
}) {
  const [overrides, setOverrides] = useState<ReadonlyMap<TopicId, boolean>>(
    () => new Map(),
  );
  const [editingId, setEditingId] = useState<TopicId | null>(null);
  const selectedIds = useMemo(() => new Set(selectedTopicIds), [selectedTopicIds]);

  // Apply a focus request this card owns, then acknowledge it.
  //
  // A SUBSCRIPTION rather than an effect over rendered state: a focus
  // request is an event that arrives from outside React, and reacting to
  // it during render would make expansion a function of the last render
  // rather than of the dispatch. Ownership is checked here rather than
  // by the dispatcher broadcasting — every card hears every request and
  // exactly one answers.
  useEffect(
    () =>
      useFocusStore.subscribe((state, prev) => {
        const request = state.request;
        if (!request || request === prev.request) return;
        if (request.sectionId !== sectionId) return;
        if (request.expand.length > 0) {
          setOverrides((current) => {
            const next = new Map(current);
            for (const id of request.expand) next.set(id, true);
            return next;
          });
        }
        // Consume-once: the ack clears the request, so a later render
        // cannot re-open a path the user has since closed by hand. It
        // also releases the pan, which waits on the applied signal.
        useFocusStore.getState().applyDone(request.nonce);
      }),
    [sectionId],
  );

  const ctx: RowContext = {
    tabId,
    sectionId,
    depth,
    locked,
    renameable,
    selectedIds,
    indicatorKey,
    overrides,
    onToggle: (id, expanded) => setOverrides((prev) => new Map(prev).set(id, expanded)),
    editingId,
    setEditingId,
  };

  return (
    <ul className="px-2 py-1.5">
      {topics.map((t) => (
        <TopicRow key={t.id} topic={t} level={1} ctx={ctx} parentTitle={sectionTitle} />
      ))}
    </ul>
  );
});
