/**
 * persistence.ts — Versioned localStorage session persistence (docs/03:
 * version the payload, discard on mismatch, tell the user).
 *
 * Persisted: tabs (name, document, columns, depth state) + active tab.
 * NOT persisted: selection, viewport, undo/redo stacks, drag state,
 * measured heights, topics-lock, closed-tab history.
 *
 * On version mismatch or corrupt payload: DISCARD, never migrate
 * silently — the caller shows a heads-up toast. Writes are debounced;
 * `flush` runs synchronously on beforeunload.
 *
 * Storage is injected (a Storage-shaped object) so every path is
 * testable without a browser.
 */

import { DEFAULT_VIEWPORT } from "@/interaction/transform";
import type { EditorState } from "@/commands/types";
import { useAppStore, type AppState, type TabState } from "./index";
import type { TabProvenance } from "./provenance";

/**
 * Bump this whenever a PERSISTED shape changes incompatibly. Session
 * payloads are discarded on mismatch, never migrated — a stale session
 * costs the user their tab arrangement, while a half-understood one
 * costs them the app.
 *
 * 2 — `TopicUnlisted` became `{ reasons: [...] }` (was `{ label, note }`)
 *     when a page turned out to be able to carry more than one flag.
 *     Shipping that without a bump meant any session written by the
 *     previous build rehydrated into code calling `.reasons.map()` on an
 *     object that had none: one throwing row, and the whole canvas
 *     rendered as a BLANK PAGE with no recovery but clearing storage by
 *     hand.
 * 3 — `TopicUnlisted` split again: own-flag `reasons` and
 *     `inheritedFrom` are orthogonal, because a page can carry a flag
 *     AND sit inside a hidden section. Bumped deliberately this time.
 */
export const PERSIST_VERSION = 3;
export const STORAGE_KEY = "toc-fable/session";
export const DEBOUNCE_MS = 500;

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface PersistedTab {
  id: string;
  name: string;
  editor: EditorState;
  /**
   * Optional, and therefore NOT a version bump. A payload written
   * before provenance existed simply has none, which is the correct
   * reading of it — that tab was loaded rather than generated. The
   * version exists for shapes that would rehydrate into code expecting
   * something else; an absent optional field rehydrates into `undefined`,
   * which every consumer already handles. Bumping would discard every
   * user's tab arrangement to gain nothing.
   */
  provenance?: TabProvenance;
  /**
   * The tab STATE (docs/21, Decision 2), on the same terms as
   * `provenance` above and for the same reason: absent is the correct
   * reading — Grounded, never asked — so no bump is owed.
   *
   * DELIBERATELY NOT the `topicsLocked` treatment. That field is
   * reconstructed as `false` below because it is transient VIEW state;
   * these two are a CONSENT memory, and a consent that evaporates on
   * reload re-asks a question the user already answered — or worse,
   * re-refuses a tab full of badges as if they were illegal.
   */
  aspirational?: true;
  seamDeclined?: true;
}

interface Payload {
  version: number;
  tabs: PersistedTab[];
  activeTabId: string | null;
}

// ── Serialize / deserialize ─────────────────────────────────

export function serializeSession(state: Pick<AppState, "tabs" | "activeTabId">): string {
  const payload: Payload = {
    version: PERSIST_VERSION,
    tabs: state.tabs.map((t) => ({
      id: t.id,
      name: t.name,
      editor: t.editor,
      // spread so an absent provenance stays ABSENT in the payload
      // rather than becoming an explicit null that reads like an
      // unknown origin
      ...(t.provenance ? { provenance: t.provenance } : {}),
      // Same spread, same reason, one question further: a `false` here
      // would read as "asked and declined", which is what `seamDeclined`
      // is for. Absent means unasked.
      ...(t.aspirational ? { aspirational: t.aspirational } : {}),
      ...(t.seamDeclined ? { seamDeclined: t.seamDeclined } : {}),
    })),
    activeTabId: state.activeTabId,
  };
  return JSON.stringify(payload);
}

/** Rebuild live TabStates with fresh transient fields. Returns null for
 *  anything invalid — version mismatch, corrupt JSON, wrong shape. */
export function deserializeSession(
  raw: string | null,
): { tabs: TabState[]; activeTabId: string | null } | null {
  if (!raw) return null;
  let payload: Payload;
  try {
    payload = JSON.parse(raw) as Payload;
  } catch {
    return null;
  }
  if (payload?.version !== PERSIST_VERSION || !Array.isArray(payload.tabs)) return null;

  const tabs: TabState[] = [];
  for (const t of payload.tabs) {
    // minimal structural validation — a bad tab poisons the whole
    // payload (discard beats a half-restored session)
    if (
      typeof t?.id !== "string" ||
      typeof t?.name !== "string" ||
      !Array.isArray(t?.editor?.document?.sections) ||
      !Array.isArray(t?.editor?.columns) ||
      typeof t?.editor?.view?.globalDepth !== "number"
    ) {
      return null;
    }
    tabs.push({
      id: t.id,
      name: t.name,
      editor: t.editor,
      ...(t.provenance ? { provenance: t.provenance } : {}),
      ...(t.aspirational ? { aspirational: t.aspirational } : {}),
      ...(t.seamDeclined ? { seamDeclined: t.seamDeclined } : {}),
      topicsLocked: false,
      undoStack: [],
      redoStack: [],
      viewport: DEFAULT_VIEWPORT,
      selectedSectionIds: [],
      selectedTopicIds: [],
      measuredHeights: {},
    });
  }

  const activeTabId = tabs.some((t) => t.id === payload.activeTabId)
    ? payload.activeTabId
    : (tabs[0]?.id ?? null);
  return { tabs, activeTabId };
}

// ── Hydration ───────────────────────────────────────────────

export type HydrationResult = "restored" | "reset" | "empty";

export function hydrateSession(storage: StorageLike): HydrationResult {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return "empty";
  const session = deserializeSession(raw);
  if (!session) {
    storage.removeItem(STORAGE_KEY); // discard cleanly, never crash
    return "reset";
  }
  useAppStore.setState({ tabs: session.tabs, activeTabId: session.activeTabId });
  return "restored";
}

// ── Debounced writer ────────────────────────────────────────

export interface PersistenceHandle {
  /** Write immediately (beforeunload). */
  flush: () => void;
  dispose: () => void;
}

export function startPersistence(
  storage: StorageLike,
  debounceMs: number = DEBOUNCE_MS,
  onWriteError?: (err: unknown) => void,
): PersistenceHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let warned = false;

  const write = () => {
    dirty = false;
    try {
      storage.setItem(STORAGE_KEY, serializeSession(useAppStore.getState()));
    } catch (err) {
      // QuotaExceededError: a large collection snapshot + existing tabs
      // can overflow localStorage — the app must keep working (the
      // debounce timer would otherwise throw every few hundred ms).
      // Import caps make this rare; warn ONCE, keep editing in memory.
      if (!warned) {
        warned = true;
        onWriteError?.(err);
      }
    }
  };
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (dirty) write();
  };

  const unsubscribe = useAppStore.subscribe((state, prev) => {
    // Only persisted fields schedule a write — viewport pans and other
    // transient churn must not thrash storage.
    //
    // `provenance` is deliberately NOT in this list. It is written once,
    // when the tab is created, which changes `tabs.length` and schedules
    // the write anyway — and nothing in the app can alter it afterwards.
    // Adding it here would imply it can change, which is the one thing
    // it promises not to do.
    //
    // The tab STATE fields ARE here, and the contrast is the reason:
    // they exist to be changed by a gesture, on a tab that already
    // exists, without touching the document. Nothing else in this
    // predicate would notice, so a seam answered and then reloaded
    // would be a consent silently forgotten (docs/21, Decision 2).
    const changed =
      state.tabs.length !== prev.tabs.length ||
      state.activeTabId !== prev.activeTabId ||
      state.tabs.some((t, i) => {
        const p = prev.tabs[i];
        return (
          !p ||
          p.id !== t.id ||
          p.name !== t.name ||
          p.editor !== t.editor ||
          p.aspirational !== t.aspirational ||
          p.seamDeclined !== t.seamDeclined
        );
      });
    if (!changed) return;
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(write, debounceMs);
  });

  const onUnload = () => flush();
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", onUnload);
  }

  return {
    flush,
    dispose: () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", onUnload);
      }
    },
  };
}
