/**
 * The focus request channel (docs/17).
 *
 * Expansion truth stays where it already lives — TopicTree's own
 * overrides map — and the panel reaches it by dispatching a request that
 * is CONSUMED, not by holding a second map. Lifting the overrides into a
 * store would refactor working view-state for the benefit of a read-only
 * reader, and drag persistence and cross-tab surface along with it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { Section, Topic } from "@/model/types";
import { useFocusStore } from "../focusStore";

const leaf = () => topic("Leaf");

function fixture() {
  const deep = leaf();
  const parent = topic("Parent", [deep]);
  const card = section("Guide", [parent]);
  return { d: doc([card]), card, parent, deep };
}

beforeEach(() => useFocusStore.getState().reset());

describe("dispatching a request", () => {
  it("carries the expansion the path computed, addressed to one card", () => {
    const { d, card, parent, deep } = fixture();
    useFocusStore.getState().requestFocus(d, { sectionId: card.id, topicId: deep.id });
    const request = useFocusStore.getState().request!;
    expect(request.sectionId).toBe(card.id);
    expect(request.expand).toEqual([parent.id]);
    expect(request.target).toBe(deep.id);
  });

  it("stamps each request with a fresh nonce", () => {
    const { d, card } = fixture();
    const store = useFocusStore.getState();
    store.requestFocus(d, { sectionId: card.id });
    const first = useFocusStore.getState().request!.nonce;
    store.requestFocus(d, { sectionId: card.id });
    expect(useFocusStore.getState().request!.nonce).not.toBe(first);
  });

  it("refuses a request no card can own, and says so in dev", () => {
    // Card-addressed ownership: an unowned request would sit in the
    // store forever, and the pan would wait on an ack that never comes.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { d } = fixture();
    useFocusStore.getState().requestFocus(d, { sectionId: "no-such-card" });
    expect(useFocusStore.getState().request).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("consume-once", () => {
  it("clears the request when the owning card applies it", () => {
    const { d, card } = fixture();
    const store = useFocusStore.getState();
    store.requestFocus(d, { sectionId: card.id });
    const { nonce } = useFocusStore.getState().request!;
    store.applyDone(nonce);
    expect(useFocusStore.getState().request).toBeNull();
  });

  it("ignores an acknowledgement for a request that is no longer current", () => {
    // A card that re-renders after another request landed must not
    // consume the newer one.
    const { d, card } = fixture();
    const store = useFocusStore.getState();
    store.requestFocus(d, { sectionId: card.id });
    const stale = useFocusStore.getState().request!.nonce;
    store.requestFocus(d, { sectionId: card.id });
    store.applyDone(stale);
    expect(useFocusStore.getState().request).not.toBeNull();
  });

  it("publishes the applied signal only once the card acknowledges", () => {
    // Ack-before-pan: expansion changes layout, so measuring before the
    // apply would pan to where the node used to be.
    const { d, card, deep } = fixture();
    const store = useFocusStore.getState();
    store.requestFocus(d, { sectionId: card.id, topicId: deep.id });
    expect(useFocusStore.getState().applied).toBeNull();

    store.applyDone(useFocusStore.getState().request!.nonce);
    expect(useFocusStore.getState().applied).toMatchObject({
      sectionId: card.id,
      target: deep.id,
    });
  });
});

describe("boundaries survive the channel", () => {
  it("dispatches the boundary as the subject, with nothing opened inside it", () => {
    const buried = topic("Buried");
    const boundary: Topic = {
      ...topic("All classes"),
      lock: { kind: "atomic", count: 1163 },
      children: [buried],
    };
    const card = section("Reference", [boundary]);
    const d = doc([card]);
    useFocusStore.getState().requestFocus(d, { sectionId: card.id, topicId: buried.id });
    const request = useFocusStore.getState().request!;
    expect(request.target).toBe(boundary.id);
    expect(request.expand).toEqual([]);
  });

  it("dispatches a sealed card as the card itself", () => {
    const sealed: Section = {
      ...section("API", [topic("Generated")]),
      sealed: { source: "OpenAPI /openapi.json" },
    };
    const d = doc([sealed]);
    useFocusStore
      .getState()
      .requestFocus(d, { sectionId: sealed.id, topicId: sealed.topics[0]!.id });
    const request = useFocusStore.getState().request!;
    expect(request.target).toBeUndefined();
    expect(request.expand).toEqual([]);
  });
});
