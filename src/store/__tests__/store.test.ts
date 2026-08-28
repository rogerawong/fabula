/**
 * Store behavior: dispatch/undo/redo wiring, per-tab stack isolation.
 * (Persistence tests arrive with persistence in M6.)
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore, selectActiveTab } from "@/store";
import { sampleDoc } from "@/model/__tests__/fixtures";

function active() {
  const tab = selectActiveTab(useAppStore.getState());
  if (!tab) throw new Error("no active tab");
  return tab;
}

beforeEach(() => {
  useAppStore.setState({ tabs: [], activeTabId: null });
});

describe("tabs", () => {
  it("openDocument creates and activates a tab with initial columns", () => {
    const doc = sampleDoc();
    const tabId = useAppStore.getState().openDocument(doc);
    const tab = active();
    expect(tab.id).toBe(tabId);
    expect(tab.name).toBe("Test Doc");
    expect(tab.editor.columns.flat()).toEqual(doc.sections.map((s) => s.id));
  });

  it("closeTab falls back to the last remaining tab", () => {
    const s = useAppStore.getState();
    const a = s.openDocument(sampleDoc(), { name: "A" });
    const b = useAppStore.getState().openDocument(sampleDoc(), { name: "B" });
    expect(active().id).toBe(b);
    useAppStore.getState().closeTab(b);
    expect(active().id).toBe(a);
  });
});

describe("dispatch / undo / redo", () => {
  it("routes commands to the active tab and maintains both stacks", () => {
    useAppStore.getState().openDocument(sampleDoc());
    const section = active().editor.document.sections[0]!;

    useAppStore.getState().dispatch({
      type: "renameSection",
      sectionId: section.id,
      title: "Renamed",
    });
    expect(active().editor.document.sections[0]!.title).toBe("Renamed");
    expect(active().undoStack).toHaveLength(1);

    const label = useAppStore.getState().undo();
    expect(label).toBe("Rename section");
    expect(active().editor.document.sections[0]!.title).toBe("Guide");
    expect(active().redoStack).toHaveLength(1);

    expect(useAppStore.getState().redo()).toBe("Rename section");
    expect(active().editor.document.sections[0]!.title).toBe("Renamed");
  });

  it("a new command clears the redo branch", () => {
    useAppStore.getState().openDocument(sampleDoc());
    const section = active().editor.document.sections[0]!;
    const rename = (title: string) =>
      useAppStore.getState().dispatch({
        type: "renameSection",
        sectionId: section.id,
        title,
      });

    rename("One");
    useAppStore.getState().undo();
    rename("Two");
    expect(active().redoStack).toHaveLength(0);
    expect(useAppStore.getState().redo()).toBeNull();
  });

  it("no-op commands add nothing to the undo stack", () => {
    useAppStore.getState().openDocument(sampleDoc());
    useAppStore.getState().dispatch({
      type: "renameSection",
      sectionId: "nope",
      title: "X",
    });
    expect(active().undoStack).toHaveLength(0);
  });

  it("undo stacks are per-tab", () => {
    useAppStore.getState().openDocument(sampleDoc(), { name: "A" });
    const aId = active().id;
    const aSection = active().editor.document.sections[0]!;
    useAppStore.getState().dispatch({
      type: "renameSection",
      sectionId: aSection.id,
      title: "Changed A",
    });

    useAppStore.getState().openDocument(sampleDoc(), { name: "B" });
    expect(active().undoStack).toHaveLength(0);
    expect(useAppStore.getState().undo()).toBeNull(); // B has nothing to undo

    useAppStore.getState().setActiveTab(aId);
    expect(useAppStore.getState().undo()).toBe("Rename section");
  });
});
