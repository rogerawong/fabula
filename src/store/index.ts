/**
 * store/index.ts — The app store (Zustand).
 *
 * One store, sliced per docs/03: tabs (each owning its document, columns,
 * view state, and undo/redo stacks), plus the command gate. Transient
 * high-frequency state (drag position, hover target) never lives here.
 *
 * DOM-free by design — every action is exercised headless in tests.
 * Persistence (localStorage, versioned) arrives in M6.
 */

import { create } from "zustand";
import type { FilesSnapshot } from "@/collections/types";
import type { SectionId, TocDocument, TopicId } from "@/model/types";
import { cloneDocument } from "@/model/tree";
import { distributeIntoColumns } from "@/layout/positions";
import { newId } from "@/model/id";
import { hasDisplacements } from "@/model/ledger";
import { hasStructuralRemainders } from "@/model/remainders";
import { filesOf } from "@/collections/types";
import { applyRedo, applyUndo, runCommand } from "@/commands/dispatcher";
import type { AnimationHints, Command, EditorState, UndoEntry } from "@/commands/types";
import { DEFAULT_VIEWPORT, type Viewport } from "@/interaction/transform";
import type { TabProvenance } from "./provenance";

export const DEFAULT_GLOBAL_DEPTH = 2;

/** Undo stacks are capped; ancient history quietly falls off the bottom. */
const MAX_UNDO_DEPTH = 200;

export interface TabState {
  id: string;
  name: string;
  editor: EditorState;
  /** Where this document came from, when it was not loaded from a file
   *  (`provenance.ts`). The tab NAME is seeded from it and then belongs
   *  to the user; this field is the durable fact and no gesture alters
   *  it. Absent means "loaded, not generated" — its own answer, not a
   *  missing one. */
  provenance?: TabProvenance;
  /**
   * May this tab's arrangement hold pinned displacements going forward
   * (docs/21, Decision 2)? Entered by the drag seam or the per-tab
   * control; absent means Grounded-UNASKED — the seam may still offer.
   *
   * NOT provenance, and not the run MODE. Provenance is immutable run
   * metadata ("no gesture in the app alters it"); this exists to be
   * altered by a gesture, and it describes the TAB rather than any one
   * run. The two-sentence test is the whole reason they are two fields.
   *
   * NOT the `topicsLocked` pattern either. That resets to `false` on
   * rehydrate because it is transient VIEW state; this is a CONSENT
   * memory, and a consent that silently evaporates on reload either
   * re-asks a question the user already answered or re-refuses a tab
   * full of badges as if they were illegal.
   */
  aspirational?: true;
  /**
   * The seam was offered on this tab and declined (docs/21, Decision 9).
   * Absent means it may offer.
   *
   * Two fields rather than one three-valued union, because they answer
   * two questions — "what is the tab's state?" and "was the seam
   * declined?" — that merely correlate. A union member `"declined"`
   * would make one value answer both, which is the house conflation
   * with three letters saved.
   */
  seamDeclined?: true;
  /** Transient mode: disables topic-level interactions (docs/02 §3).
   *  Deliberately NOT part of the undoable EditorState. */
  topicsLocked: boolean;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  // ── Transient view state (never persisted, never undoable) ──
  viewport: Viewport;
  /** Selected cards. [0] is the ANCHOR — shift-click ranges extend
   *  from it in reading order. Plain click → one entry. */
  selectedSectionIds: SectionId[];
  /** Multi-select (shift range / alt-cmd toggle / box-select); always
   *  within ONE card; dragging any selected row moves the group. */
  selectedTopicIds: TopicId[];
  /** Rendered card heights, reported once per size change by the card
   *  components (layout never reads the DOM — docs/03). */
  measuredHeights: Record<SectionId, number>;
}

/** A closed tab kept for reopen (Ctrl/Cmd+Shift+T, close-toast Undo).
 *  Undo stacks are intentionally NOT restored (docs/02 §4). */
export interface ClosedTab {
  tab: Pick<
    TabState,
    "id" | "name" | "editor" | "provenance" | "aspirational" | "seamDeclined"
  >;
  index: number;
}

const MAX_CLOSED_TABS = 10;

export interface AppState {
  tabs: TabState[];
  activeTabId: string | null;
  closedTabs: ClosedTab[];

  /** Open a document in a new tab and activate it. Returns the tab id. */
  openDocument: (
    doc: TocDocument,
    opts?: { name?: string; provenance?: TabProvenance },
  ) => string;
  closeTab: (tabId: string) => void;
  renameTab: (tabId: string, name: string) => void;
  /** Deep-clone a tab (document, columns, view). Returns the new tab id. */
  duplicateTab: (tabId: string) => string | null;
  /** Restore the most recently closed tab. Returns its id, or null. */
  reopenClosedTab: () => string | null;
  setActiveTab: (tabId: string) => void;
  setTopicsLocked: (tabId: string, locked: boolean) => void;
  /**
   * Switch a tab between Grounded and Aspirational (docs/21, Decision 9).
   *
   * Turning it ON clears `seamDeclined`: the decline answered the SEAM,
   * and a deliberate switch supersedes it. Turning it OFF lands the tab
   * Grounded-UNASKED for the same reason in reverse — a switch-back is
   * not a seam decline, so the seam may offer again.
   *
   * The EMPTY-LEDGER precondition for switching back (G1) is enforced by
   * the control that offers it, not here: this is the store's setter and
   * a setter that consulted the document would be a second place the
   * rule lives.
   */
  setTabAspirational: (tabId: string, aspirational: boolean) => void;
  /** Remember that the seam was offered and declined on this tab. */
  declineSeam: (tabId: string) => void;
  setViewport: (tabId: string, viewport: Viewport) => void;
  /** Single-select a card (or clear with null). */
  selectSection: (sectionId: SectionId | null) => void;
  /** Replace the card selection outright (shift-range path). */
  setSectionSelection: (sectionIds: SectionId[]) => void;
  /** Alt/Cmd-click: add/remove one card, any order. */
  toggleSectionSelected: (sectionId: SectionId) => void;
  setTopicSelection: (topicIds: TopicId[]) => void;
  toggleTopicSelected: (topicId: TopicId) => void;
  reportCardHeight: (tabId: string, sectionId: SectionId, height: number) => void;

  /** After a successful collection save: replace the document's
   *  original-files snapshot with the post-save contents — the change
   *  plan collapses to [], and a later undo correctly yields a
   *  revert-on-disk plan. NOT a command; never undoable. */
  refreshCollectionFiles: (tabId: string, files: FilesSnapshot) => void;

  /** Run a command against the active tab. Returns animation hints and
   *  the undo label (null when the command was a no-op). */
  dispatch: (command: Command) => { hints: AnimationHints; label: string | null };
  /** Undo/redo the active tab. Returns the entry's label, or null. */
  undo: () => string | null;
  redo: () => string | null;
}

function freshTab(
  doc: TocDocument,
  name?: string,
  provenance?: TabProvenance,
  state?: Pick<TabState, "aspirational" | "seamDeclined">,
): TabState {
  return {
    id: newId(),
    name: name ?? doc.name,
    ...(provenance ? { provenance } : {}),
    // Spread, never defaulted: an absent field is Grounded-UNASKED, and
    // an explicit `false` would read like an answered question.
    ...(state?.aspirational ? { aspirational: true as const } : {}),
    ...(state?.seamDeclined ? { seamDeclined: true as const } : {}),
    editor: {
      document: doc,
      // Bin-packing runs exactly here and on Auto-arrange (docs/03).
      columns: distributeIntoColumns(doc.sections, {
        globalDepth: DEFAULT_GLOBAL_DEPTH,
      }),
      view: { globalDepth: DEFAULT_GLOBAL_DEPTH, cardDepths: {} },
    },
    topicsLocked: false,
    undoStack: [],
    redoStack: [],
    viewport: DEFAULT_VIEWPORT,
    selectedSectionIds: [],
    selectedTopicIds: [],
    measuredHeights: {},
  };
}

function updateTab(
  tabs: TabState[],
  tabId: string,
  update: (tab: TabState) => TabState,
): TabState[] {
  return tabs.map((t) => (t.id === tabId ? update(t) : t));
}

export const useAppStore = create<AppState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  closedTabs: [],

  openDocument: (doc, opts) => {
    // BIRTH RULE (docs/21, Decision 2; first clause widened by docs/22's
    // OR-3): a tab is born Aspirational iff it holds displacements OR
    // STRUCTURAL REMAINDERS at birth, or was produced by an aspirational
    // run; otherwise Grounded-unasked. Every clause is answered here, at
    // the ONE door every document enters through, so a producer cannot
    // mint a tab that wears the Grounded promise while holding facts that
    // contradict it.
    //
    // THE WIDENING IS NOT HYPOTHETICAL. A GROUNDED run on a Sphinx tab
    // can hoist a leaf — the validator opens it deliberately, and the
    // pinned net is parent-change-only — so the result arrives with a
    // creation record and an EMPTY row ledger. Under the unwidened rule
    // it would be born Grounded while holding structure the app cannot
    // write.
    //
    // The report is available at birth because a collection result
    // carries its snapshot through the rebuild, which is the same reason
    // the derived ledger works on it.
    const holdsRemainders = hasStructuralRemainders(
      doc,
      filesOf(doc),
      doc.sections.map((s) => s.id),
    );
    const born =
      opts?.provenance?.mode === "aspirational" ||
      hasDisplacements(doc) ||
      holdsRemainders
        ? { aspirational: true as const }
        : undefined;
    const tab = freshTab(doc, opts?.name, opts?.provenance, born);
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    return tab.id;
  },

  closeTab: (tabId) => {
    set((s) => {
      const index = s.tabs.findIndex((t) => t.id === tabId);
      if (index < 0) return s;
      const closed = s.tabs[index]!;
      const tabs = s.tabs.filter((t) => t.id !== tabId);
      const activeTabId =
        s.activeTabId === tabId
          ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null)
          : s.activeTabId;
      return {
        tabs,
        activeTabId,
        closedTabs: [
          ...s.closedTabs,
          {
            tab: {
              id: closed.id,
              name: closed.name,
              editor: closed.editor,
              provenance: closed.provenance,
              aspirational: closed.aspirational,
              seamDeclined: closed.seamDeclined,
            },
            index,
          },
        ].slice(-MAX_CLOSED_TABS),
      };
    });
  },

  renameTab: (tabId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => ({ tabs: updateTab(s.tabs, tabId, (t) => ({ ...t, name: trimmed })) }));
  },

  duplicateTab: (tabId) => {
    const source = get().tabs.find((t) => t.id === tabId);
    if (!source) return null;
    // keepIds: ids only need to be unique within a document, and columns/
    // depth overrides reference them — cloning with the same ids keeps
    // the whole editor state valid without an id-mapping pass.
    const doc = cloneDocument(source.editor.document, { keepIds: true });
    const copy: TabState = {
      // The copy's document came from wherever the original's did, so
      // the fact travels with it. A duplicate of a reorganized tab is
      // still that model's output — and it holds the same arrangement,
      // so it holds the same standing consent (docs/21, Decision 2).
      ...freshTab(doc, `${source.name} (copy)`, source.provenance, source),
      editor: {
        document: doc,
        columns: source.editor.columns.map((col) => [...col]),
        view: {
          globalDepth: source.editor.view.globalDepth,
          cardDepths: { ...source.editor.view.cardDepths },
        },
      },
    };
    set((s) => {
      const at = s.tabs.findIndex((t) => t.id === tabId) + 1;
      return {
        tabs: [...s.tabs.slice(0, at), copy, ...s.tabs.slice(at)],
        activeTabId: copy.id,
      };
    });
    return copy.id;
  },

  reopenClosedTab: () => {
    const closed = get().closedTabs.at(-1);
    if (!closed) return null;
    const restored: TabState = {
      ...freshTab(
        closed.tab.editor.document,
        closed.tab.name,
        closed.tab.provenance,
        closed.tab,
      ),
      id: closed.tab.id,
      editor: closed.tab.editor,
    };
    set((s) => {
      const at = Math.min(closed.index, s.tabs.length);
      return {
        tabs: [...s.tabs.slice(0, at), restored, ...s.tabs.slice(at)],
        activeTabId: restored.id,
        closedTabs: s.closedTabs.slice(0, -1),
      };
    });
    return restored.id;
  },

  setActiveTab: (tabId) => {
    if (get().tabs.some((t) => t.id === tabId)) set({ activeTabId: tabId });
  },

  setTopicsLocked: (tabId, locked) => {
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => ({ ...t, topicsLocked: locked })),
    }));
  },

  setTabAspirational: (tabId, aspirational) => {
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => {
        const { aspirational: _a, seamDeclined: _d, ...rest } = t;
        return aspirational ? { ...rest, aspirational: true } : rest;
      }),
    }));
  },

  declineSeam: (tabId) => {
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => ({ ...t, seamDeclined: true })),
    }));
  },

  setViewport: (tabId, viewport) => {
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => ({ ...t, viewport })),
    }));
  },

  selectSection: (sectionId) => {
    const { activeTabId } = get();
    if (!activeTabId) return;
    set((s) => ({
      tabs: updateTab(s.tabs, activeTabId, (t) => ({
        ...t,
        selectedSectionIds: sectionId === null ? [] : [sectionId],
        // clearing the card also clears topic selection (Escape path)
        ...(sectionId === null ? { selectedTopicIds: [] } : {}),
      })),
    }));
  },

  setSectionSelection: (sectionIds) => {
    const { activeTabId } = get();
    if (!activeTabId) return;
    set((s) => ({
      tabs: updateTab(s.tabs, activeTabId, (t) => ({
        ...t,
        selectedSectionIds: sectionIds,
        // card-level multi-select and topic selection don't mix
        selectedTopicIds: [],
      })),
    }));
  },

  toggleSectionSelected: (sectionId) => {
    const { activeTabId } = get();
    if (!activeTabId) return;
    set((s) => ({
      tabs: updateTab(s.tabs, activeTabId, (t) => ({
        ...t,
        selectedSectionIds: t.selectedSectionIds.includes(sectionId)
          ? t.selectedSectionIds.filter((id) => id !== sectionId)
          : [...t.selectedSectionIds, sectionId],
        selectedTopicIds: [],
      })),
    }));
  },

  setTopicSelection: (topicIds) => {
    const { activeTabId } = get();
    if (!activeTabId) return;
    set((s) => ({
      tabs: updateTab(s.tabs, activeTabId, (t) => ({
        ...t,
        selectedTopicIds: topicIds,
      })),
    }));
  },

  toggleTopicSelected: (topicId) => {
    const { activeTabId } = get();
    if (!activeTabId) return;
    set((s) => ({
      tabs: updateTab(s.tabs, activeTabId, (t) => ({
        ...t,
        selectedTopicIds: t.selectedTopicIds.includes(topicId)
          ? t.selectedTopicIds.filter((id) => id !== topicId)
          : [...t.selectedTopicIds, topicId],
      })),
    }));
  },

  reportCardHeight: (tabId, sectionId, height) => {
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) =>
        t.measuredHeights[sectionId] === height
          ? t
          : { ...t, measuredHeights: { ...t.measuredHeights, [sectionId]: height } },
      ),
    }));
  },

  refreshCollectionFiles: (tabId, files) => {
    set((s) => ({
      tabs: updateTab(s.tabs, tabId, (t) => ({
        ...t,
        editor: {
          ...t.editor,
          document: {
            ...t.editor.document,
            extras: {
              ...(t.editor.document.extras as Record<string, unknown> | undefined),
              files,
            },
          },
        },
      })),
    }));
  },

  dispatch: (command) => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return { hints: {}, label: null };

    const { next, entry, hints } = runCommand(tab.editor, command);
    if (!entry) return { hints, label: null };

    set((s) => ({
      tabs: updateTab(s.tabs, tab.id, (t) => ({
        ...t,
        editor: next,
        undoStack: [...t.undoStack, entry].slice(-MAX_UNDO_DEPTH),
        redoStack: [], // a new mutation invalidates the redo branch
      })),
    }));
    return { hints, label: entry.label };
  },

  undo: () => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === activeTabId);
    const entry = tab?.undoStack.at(-1);
    if (!tab || !entry) return null;

    set((s) => ({
      tabs: updateTab(s.tabs, tab.id, (t) => ({
        ...t,
        editor: applyUndo(t.editor, entry),
        undoStack: t.undoStack.slice(0, -1),
        redoStack: [...t.redoStack, entry],
      })),
    }));
    return entry.label;
  },

  redo: () => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === activeTabId);
    const entry = tab?.redoStack.at(-1);
    if (!tab || !entry) return null;

    set((s) => ({
      tabs: updateTab(s.tabs, tab.id, (t) => ({
        ...t,
        editor: applyRedo(t.editor, entry),
        redoStack: t.redoStack.slice(0, -1),
        undoStack: [...t.undoStack, entry],
      })),
    }));
    return entry.label;
  },
}));

/** The active tab, or null. Convenience selector. */
export function selectActiveTab(s: AppState): TabState | null {
  return s.tabs.find((t) => t.id === s.activeTabId) ?? null;
}
