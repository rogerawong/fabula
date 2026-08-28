/**
 * Layer 4 (docs/07): persisted payload round-trip, version-mismatch
 * discard, debounce/flush behavior with fake timers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleDoc } from "@/model/__tests__/fixtures";
import { useAppStore } from "@/store";
import {
  PERSIST_VERSION,
  STORAGE_KEY,
  deserializeSession,
  hydrateSession,
  serializeSession,
  startPersistence,
  type StorageLike,
} from "../persistence";

function fakeStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

beforeEach(() => {
  useAppStore.setState({ tabs: [], activeTabId: null, closedTabs: [] });
});

describe("serialize/deserialize round-trip", () => {
  it("restores tabs with fresh transient state", () => {
    const s = useAppStore.getState();
    s.openDocument(sampleDoc(), { name: "A" });
    useAppStore.getState().openDocument(sampleDoc(), { name: "B" });
    // dirty some transient state that must NOT survive
    const tabId = useAppStore.getState().tabs[0]!.id;
    useAppStore.getState().setViewport(tabId, { x: 99, y: 99, scale: 0.5 });
    useAppStore.getState().setActiveTab(tabId);

    const raw = serializeSession(useAppStore.getState());
    const restored = deserializeSession(raw)!;

    expect(restored.tabs.map((t) => t.name)).toEqual(["A", "B"]);
    expect(restored.activeTabId).toBe(tabId);
    expect(restored.tabs[0]!.viewport).toEqual({ x: 0, y: 0, scale: 1 });
    expect(restored.tabs[0]!.undoStack).toEqual([]);
    expect(restored.tabs[0]!.editor.document.sections.length).toBe(3);
    // arrangement survives
    expect(restored.tabs[0]!.editor.columns).toEqual(
      useAppStore.getState().tabs[0]!.editor.columns,
    );
  });
});

describe("version mismatch and corruption", () => {
  it.each([
    ["wrong version", JSON.stringify({ version: PERSIST_VERSION + 1, tabs: [] })],
    ["not json", "{nope"],
    ["wrong shape", JSON.stringify({ version: PERSIST_VERSION, tabs: [{ id: 1 }] })],
  ])("discards cleanly on %s", (_name, raw) => {
    const storage = fakeStorage();
    storage.setItem(STORAGE_KEY, raw);
    expect(hydrateSession(storage)).toBe("reset");
    expect(storage.map.has(STORAGE_KEY)).toBe(false); // wiped, not kept
    expect(useAppStore.getState().tabs).toEqual([]);
  });

  it("reports empty when nothing was stored", () => {
    expect(hydrateSession(fakeStorage())).toBe("empty");
  });

  it("restores a valid payload", () => {
    useAppStore.getState().openDocument(sampleDoc(), { name: "Kept" });
    const storage = fakeStorage();
    storage.setItem(STORAGE_KEY, serializeSession(useAppStore.getState()));

    useAppStore.setState({ tabs: [], activeTabId: null });
    expect(hydrateSession(storage)).toBe("restored");
    expect(useAppStore.getState().tabs[0]!.name).toBe("Kept");
  });
});

describe("debounced writes", () => {
  afterEach(() => vi.useRealTimers());

  it("coalesces rapid changes and flushes on demand", () => {
    vi.useFakeTimers();
    const storage = fakeStorage();
    const handle = startPersistence(storage, 500);

    useAppStore.getState().openDocument(sampleDoc(), { name: "One" });
    useAppStore.getState().renameTab(useAppStore.getState().tabs[0]!.id, "Two");
    expect(storage.map.has(STORAGE_KEY)).toBe(false); // not yet

    vi.advanceTimersByTime(499);
    expect(storage.map.has(STORAGE_KEY)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(storage.map.has(STORAGE_KEY)).toBe(true);
    expect(deserializeSession(storage.getItem(STORAGE_KEY))!.tabs[0]!.name).toBe("Two");

    // flush writes pending changes immediately
    useAppStore.getState().renameTab(useAppStore.getState().tabs[0]!.id, "Three");
    handle.flush();
    expect(deserializeSession(storage.getItem(STORAGE_KEY))!.tabs[0]!.name).toBe("Three");

    handle.dispose();
  });

  it("a full storage warns ONCE and never throws into the timer", () => {
    vi.useFakeTimers();
    const storage = fakeStorage();
    const quotaError = new DOMException("quota", "QuotaExceededError");
    storage.setItem = () => {
      throw quotaError;
    };
    const onWriteError = vi.fn();
    const handle = startPersistence(storage, 500, onWriteError);

    useAppStore.getState().openDocument(sampleDoc(), { name: "One" });
    vi.advanceTimersByTime(500); // must not throw
    useAppStore.getState().renameTab(useAppStore.getState().tabs[0]!.id, "Two");
    vi.advanceTimersByTime(500);

    expect(onWriteError).toHaveBeenCalledTimes(1); // one-shot
    expect(onWriteError).toHaveBeenCalledWith(quotaError);
    handle.dispose();
  });

  it("transient-only changes do not schedule writes", () => {
    vi.useFakeTimers();
    useAppStore.getState().openDocument(sampleDoc());
    const storage = fakeStorage();
    const handle = startPersistence(storage, 500);

    const tabId = useAppStore.getState().tabs[0]!.id;
    useAppStore.getState().setViewport(tabId, { x: 5, y: 5, scale: 1 });
    useAppStore.getState().selectSection(null);
    vi.advanceTimersByTime(1000);
    expect(storage.map.has(STORAGE_KEY)).toBe(false);

    handle.dispose();
  });
});

describe("tab lifecycle (M6 store actions)", () => {
  it("duplicateTab deep-clones and inserts after the source", () => {
    useAppStore.getState().openDocument(sampleDoc(), { name: "Base" });
    const srcId = useAppStore.getState().tabs[0]!.id;
    const copyId = useAppStore.getState().duplicateTab(srcId)!;

    const tabs = useAppStore.getState().tabs;
    expect(tabs.map((t) => t.name)).toEqual(["Base", "Base (copy)"]);
    expect(useAppStore.getState().activeTabId).toBe(copyId);

    // fully detached: renaming a section in the copy leaves the source
    const copy = tabs[1]!;
    const sectionId = copy.editor.document.sections[0]!.id;
    useAppStore.getState().dispatch({
      type: "renameSection",
      sectionId,
      title: "Changed",
    });
    expect(useAppStore.getState().tabs[1]!.editor.document.sections[0]!.title).toBe(
      "Changed",
    );
    expect(useAppStore.getState().tabs[0]!.editor.document.sections[0]!.title).toBe(
      "Guide",
    );
  });

  it("closeTab records the tab; reopenClosedTab restores it in place", () => {
    useAppStore.getState().openDocument(sampleDoc(), { name: "A" });
    useAppStore.getState().openDocument(sampleDoc(), { name: "B" });
    useAppStore.getState().openDocument(sampleDoc(), { name: "C" });
    const bId = useAppStore.getState().tabs[1]!.id;

    useAppStore.getState().closeTab(bId);
    expect(useAppStore.getState().tabs.map((t) => t.name)).toEqual(["A", "C"]);

    const reopened = useAppStore.getState().reopenClosedTab();
    expect(reopened).toBe(bId);
    expect(useAppStore.getState().tabs.map((t) => t.name)).toEqual(["A", "B", "C"]);
    expect(useAppStore.getState().activeTabId).toBe(bId);
    // undo stacks are NOT restored
    expect(useAppStore.getState().tabs[1]!.undoStack).toEqual([]);
  });

  it("reopenClosedTab returns null when nothing was closed", () => {
    expect(useAppStore.getState().reopenClosedTab()).toBeNull();
  });
});

describe("incompatible persisted shapes are discarded, not rendered", () => {
  it("refuses a session from an older PERSIST_VERSION", () => {
    // The guard's whole job. A session written before TopicUnlisted
    // gained `reasons` would otherwise reach TopicRow, throw on
    // `.reasons.map()`, and blank the app — which is exactly what
    // happened when this field changed without a bump.
    const stale = JSON.stringify({
      version: PERSIST_VERSION - 1,
      activeTabId: "t1",
      tabs: [
        {
          id: "t1",
          name: "Old",
          topicsLocked: false,
          undo: [],
          redo: [],
          editor: {
            document: {
              id: "d1",
              name: "Old",
              formatId: "hugo",
              sections: [
                {
                  id: "s1",
                  title: "Sec",
                  topics: [
                    {
                      id: "t-1",
                      title: "Ghost",
                      // the pre-bump shape: no `reasons`
                      unlisted: { label: "toc_hide", note: "Hidden" },
                      children: [],
                    },
                  ],
                },
              ],
            },
            columns: [["s1"]],
            view: { globalDepth: 2, cardDepths: {} },
          },
        },
      ],
    });
    expect(deserializeSession(stale)).toBeNull();
  });

  it("accepts the same session at the CURRENT version", () => {
    // guards the guard: the rejection above must be about the version,
    // not about the payload being malformed in some other way
    const current = JSON.stringify({
      version: PERSIST_VERSION,
      activeTabId: "t1",
      tabs: [
        {
          id: "t1",
          name: "Now",
          topicsLocked: false,
          undo: [],
          redo: [],
          editor: {
            document: { id: "d1", name: "Now", formatId: "docfx", sections: [] },
            columns: [],
            view: { globalDepth: 2, cardDepths: {} },
          },
        },
      ],
    });
    expect(deserializeSession(current)).not.toBeNull();
  });
});
