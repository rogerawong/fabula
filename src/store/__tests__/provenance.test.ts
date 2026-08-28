/**
 * provenance.test.ts — where a tab's document came from, and what must
 * not be able to destroy that fact.
 *
 * A reorganized tab used to be named `"<source> (reorganized)"` and
 * that name was the ONLY record of its origin: which provider, which
 * model, which instruction preset, when. The name is also the one thing
 * a user is invited to change. So the fact and its only witness were
 * the same string, and renaming a tab silently deleted the answer to
 * "which model produced this?".
 *
 * Provenance splits them. The name is SEEDED from provenance at
 * creation and belongs to the user thereafter; the provenance is the
 * durable fact and belongs to the tab. Every operation that carries a
 * document forward — rename, duplicate, close-and-reopen, a session
 * restored from localStorage — has to carry it too, and each of those
 * is a separate consumer that could silently drop it.
 *
 * NOT-MEASURED IS NOT ZERO applies here as everywhere: a tab with no
 * provenance (a loaded file, a sample) must round-trip as ABSENT, not
 * as an empty record that reads like an unknown model.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import { useAppStore } from "../index";
import { provenanceTabName, type TabProvenance } from "../provenance";
import {
  deserializeSession,
  hydrateSession,
  serializeSession,
  STORAGE_KEY,
} from "../persistence";

const PROV: TabProvenance = {
  kind: "ai-reorganize",
  providerId: "claude",
  providerLabel: "Claude (Anthropic)",
  model: "claude-opus-5",
  presetId: "balance",
  presetName: "Balance",
  at: "2026-08-19T10:30:00.000Z",
};

const DOC = () => doc([section("Guide", [topic("Intro")])]);

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

beforeEach(() => {
  useAppStore.setState({ tabs: [], activeTabId: null, closedTabs: [] });
});

describe("the name is derived once; the fact is kept", () => {
  it("names a reorganized tab after its model", () => {
    expect(provenanceTabName("godot-docs", PROV)).toBe("godot-docs (claude-opus-5)");
  });

  it("stores provenance alongside the derived name", () => {
    const id = useAppStore.getState().openDocument(DOC(), {
      name: provenanceTabName("Toc", PROV),
      provenance: PROV,
    });
    const tab = useAppStore.getState().tabs.find((t) => t.id === id)!;
    expect(tab.name).toBe("Toc (claude-opus-5)");
    expect(tab.provenance).toEqual(PROV);
  });

  it("RENAMING never alters or destroys the metadata", () => {
    const id = useAppStore
      .getState()
      .openDocument(DOC(), { name: "Toc (claude-opus-5)", provenance: PROV });
    useAppStore.getState().renameTab(id, "Proposal for review");

    const tab = useAppStore.getState().tabs.find((t) => t.id === id)!;
    expect(tab.name).toBe("Proposal for review");
    expect(tab.provenance).toEqual(PROV);
  });
});

describe("every path that carries a document forward carries the fact", () => {
  it("survives close and reopen", () => {
    const id = useAppStore.getState().openDocument(DOC(), { provenance: PROV });
    useAppStore.getState().closeTab(id);
    const reopened = useAppStore.getState().reopenClosedTab()!;
    const tab = useAppStore.getState().tabs.find((t) => t.id === reopened)!;
    expect(tab.provenance).toEqual(PROV);
  });

  it("survives duplication — the copy's document came from there too", () => {
    const id = useAppStore.getState().openDocument(DOC(), { provenance: PROV });
    const copy = useAppStore.getState().duplicateTab(id)!;
    const tab = useAppStore.getState().tabs.find((t) => t.id === copy)!;
    expect(tab.provenance).toEqual(PROV);
  });

  it("survives a persisted session", () => {
    useAppStore.getState().openDocument(DOC(), { name: "A", provenance: PROV });
    const restored = deserializeSession(serializeSession(useAppStore.getState()))!;
    expect(restored.tabs[0]!.provenance).toEqual(PROV);
  });
});

describe("absent is its own answer", () => {
  it("a tab with no provenance round-trips as undefined, not as a blank record", () => {
    useAppStore.getState().openDocument(DOC(), { name: "Loaded from a file" });
    const restored = deserializeSession(serializeSession(useAppStore.getState()))!;
    expect(restored.tabs[0]!.provenance).toBeUndefined();
    expect(restored.tabs[0]).not.toHaveProperty("provenance", expect.anything());
  });

  it("a session written before provenance existed still hydrates", () => {
    // Adding an OPTIONAL field is compatible, so PERSIST_VERSION is not
    // bumped: an older payload simply has no provenance, which is the
    // correct reading of it. Asserted rather than assumed, because the
    // cost of being wrong is every user's tabs discarded on upgrade.
    const storage = memoryStorage();
    useAppStore.getState().openDocument(DOC(), { name: "Old" });
    const payload = JSON.parse(serializeSession(useAppStore.getState())) as {
      tabs: Record<string, unknown>[];
    };
    for (const t of payload.tabs) delete t.provenance;
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));

    useAppStore.setState({ tabs: [], activeTabId: null });
    expect(hydrateSession(storage)).toBe("restored");
    expect(useAppStore.getState().tabs[0]!.name).toBe("Old");
    expect(useAppStore.getState().tabs[0]!.provenance).toBeUndefined();
  });
});
