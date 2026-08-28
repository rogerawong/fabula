/**
 * settings.ts — AI connection settings (provider, model, key).
 *
 * Versioned localStorage under its OWN key (`toc-fable/ai-settings`),
 * separate from the session payload — session resets never touch the
 * key and vice versa. The API key is persisted ONLY while "remember on
 * this device" is checked; otherwise it lives in memory for the
 * session. Storage is injected (StorageLike idiom) for tests.
 */

import { create } from "zustand";
import type { StorageLike } from "@/store/persistence";
import { getProvider, PROVIDERS } from "./providers";

export const AI_SETTINGS_VERSION = 1;
export const AI_SETTINGS_KEY = "toc-fable/ai-settings";

export interface AiSettings {
  providerId: string;
  /** Overrides the preset's base URL (custom provider). */
  baseUrl: string;
  model: string;
  /**
   * API keys, keyed by provider id. NEVER one shared value.
   *
   * A single field meant that switching Gemini → Claude carried the
   * previous provider's key into the next run — a funded secret posted
   * to the wrong company's endpoint and into their request logs. The
   * differential workflow (run the same document against two providers)
   * is exactly that switching pattern, so the feature this arc exists
   * for was also the fastest way to trigger it.
   *
   * The safety here is STRUCTURAL, not vigilance: the key is looked up
   * by the same `providerId` that selects `baseUrl`, so the credential
   * and the destination cannot disagree. There is no moment during a
   * switch when the old key is paired with the new URL, because neither
   * is carried — both are derived.
   */
  apiKeys: Record<string, string>;
  rememberKey: boolean;
}

/**
 * The key for the provider currently selected — the ONLY way callers
 * should reach a key. Reading `apiKeys` directly at a call site is how
 * a second lookup rule gets invented, and two rules for one question is
 * this project's house failure mode.
 */
export function currentKey(s: Pick<AiSettings, "apiKeys" | "providerId">): string {
  return s.apiKeys[s.providerId] ?? "";
}

interface AiSettingsState extends AiSettings {
  update: (partial: Partial<AiSettings>) => void;
  /** Set the key for the CURRENT provider. */
  setKey: (value: string) => void;
  forgetKey: () => void;
  /** True when a request could be attempted. */
  isConfigured: () => boolean;
}

function defaults(): AiSettings {
  const gemini = PROVIDERS[0]!;
  return {
    providerId: gemini.id,
    baseUrl: gemini.baseUrl,
    model: gemini.defaultModel,
    apiKeys: {},
    rememberKey: false,
  };
}

export const useAiSettings = create<AiSettingsState>((set, get) => ({
  ...defaults(),

  update: (partial) => {
    set((s) => {
      const next = { ...s, ...partial };
      // switching provider re-seeds url/model from the preset
      if (partial.providerId && partial.providerId !== s.providerId) {
        const preset = getProvider(partial.providerId);
        next.baseUrl = preset.baseUrl;
        next.model = preset.defaultModel;
      }
      return next;
    });
    persist();
  },

  setKey: (value) => {
    // written to the CURRENT provider's slot — never to a shared field
    set((s) => ({ apiKeys: { ...s.apiKeys, [s.providerId]: value } }));
    persist();
  },

  /**
   * Clears EVERY provider's key, not just the visible one, and stops
   * persisting. With keys plural, a "forget" that left another
   * provider's funded key live in memory would be a surprise in the
   * dangerous direction — and nothing in the UI would show it was
   * still there. Clearing one provider's key alone is still available:
   * it is the text field, which the user can empty directly.
   */
  forgetKey: () => {
    set({ apiKeys: {}, rememberKey: false });
    persist();
  },

  isConfigured: () => {
    const s = get();
    return Boolean(s.baseUrl.trim() && s.model.trim() && currentKey(s).trim());
  },
}));

// ── Persistence (explicit init, injected storage) ───────────

let boundStorage: StorageLike | null = null;

interface Persisted {
  version: number;
  providerId: string;
  baseUrl: string;
  model: string;
  /** present only when rememberKey was on */
  apiKeys?: Record<string, string>;
  rememberKey: boolean;
}

function persist(): void {
  if (!boundStorage) return;
  const s = useAiSettings.getState();
  const payload: Persisted = {
    version: AI_SETTINGS_VERSION,
    providerId: s.providerId,
    baseUrl: s.baseUrl,
    model: s.model,
    rememberKey: s.rememberKey,
    ...(s.rememberKey ? { apiKeys: s.apiKeys } : {}),
  };
  boundStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(payload));
}

function isKeyMap(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "string")
  );
}

export function initAiSettings(storage: StorageLike): void {
  boundStorage = storage;
  const raw = storage.getItem(AI_SETTINGS_KEY);
  if (raw === null) return;
  let payload: Persisted;
  try {
    payload = JSON.parse(raw) as Persisted;
  } catch {
    storage.removeItem(AI_SETTINGS_KEY);
    return;
  }
  if (
    payload?.version !== AI_SETTINGS_VERSION ||
    typeof payload.providerId !== "string"
  ) {
    storage.removeItem(AI_SETTINGS_KEY); // discard, never migrate silently
    return;
  }
  useAiSettings.setState({
    providerId: payload.providerId,
    baseUrl: typeof payload.baseUrl === "string" ? payload.baseUrl : "",
    model: typeof payload.model === "string" ? payload.model : "",
    // A legacy single `apiKey` from before keys were per-provider is
    // deliberately NOT migrated. It could only be attributed by
    // assuming it belonged to the stored `providerId` — and the bug
    // being fixed here is precisely that the shared field carried keys
    // across providers, so that assumption is unreliable exactly where
    // it matters. One re-entry, correctly attributed, beats a guess
    // that posts a secret to the wrong endpoint.
    apiKeys: isKeyMap(payload.apiKeys) ? payload.apiKeys : {},
    rememberKey: Boolean(payload.rememberKey),
  });
}

/** Test helper: detach storage and restore defaults. */
export function resetAiSettings(): void {
  boundStorage = null;
  useAiSettings.setState(defaults());
}
