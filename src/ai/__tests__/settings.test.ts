import { afterEach, describe, expect, it } from "vitest";
import type { StorageLike } from "@/store/persistence";
import {
  AI_SETTINGS_KEY,
  AI_SETTINGS_VERSION,
  currentKey,
  initAiSettings,
  resetAiSettings,
  useAiSettings,
} from "../settings";

function fakeStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

afterEach(() => resetAiSettings());

describe("ai settings persistence", () => {
  it("persists provider/model but NOT the key unless remembered", () => {
    const storage = fakeStorage();
    initAiSettings(storage);
    useAiSettings.getState().setKey("secret-key");
    useAiSettings.getState().update({ model: "gemini-x" });

    const raw = storage.map.get(AI_SETTINGS_KEY)!;
    expect(raw).toContain("gemini-x");
    expect(raw).not.toContain("secret-key");
  });

  it("persists and restores the key when remember is on", () => {
    const storage = fakeStorage();
    initAiSettings(storage);
    useAiSettings.getState().update({ rememberKey: true });
    useAiSettings.getState().setKey("secret-key");

    resetAiSettings();
    initAiSettings(storage);
    expect(currentKey(useAiSettings.getState())).toBe("secret-key");
    expect(useAiSettings.getState().rememberKey).toBe(true);
  });

  it("forgetKey clears the key everywhere", () => {
    const storage = fakeStorage();
    initAiSettings(storage);
    useAiSettings.getState().update({ rememberKey: true });
    useAiSettings.getState().setKey("secret-key");
    useAiSettings.getState().forgetKey();

    expect(currentKey(useAiSettings.getState())).toBe("");
    expect(storage.map.get(AI_SETTINGS_KEY)).not.toContain("secret-key");
  });

  it("discards on version mismatch or corruption", () => {
    const storage = fakeStorage();
    storage.setItem(
      AI_SETTINGS_KEY,
      JSON.stringify({ version: AI_SETTINGS_VERSION + 1, providerId: "gemini" }),
    );
    initAiSettings(storage);
    expect(storage.map.has(AI_SETTINGS_KEY)).toBe(false);
    expect(useAiSettings.getState().providerId).toBe("gemini"); // defaults

    resetAiSettings();
    storage.setItem(AI_SETTINGS_KEY, "{corrupt");
    initAiSettings(storage);
    expect(storage.map.has(AI_SETTINGS_KEY)).toBe(false);
  });

  it("switching provider re-seeds url and model from the preset", () => {
    const storage = fakeStorage();
    initAiSettings(storage);
    useAiSettings.getState().update({ providerId: "custom" });
    expect(useAiSettings.getState().baseUrl).toBe("");
    useAiSettings.getState().update({ providerId: "gemini" });
    expect(useAiSettings.getState().baseUrl).toContain("generativelanguage");
    expect(useAiSettings.getState().model).toBe("gemini-flash-latest");
  });

  it("isConfigured requires url + model + key", () => {
    const s = useAiSettings.getState();
    expect(s.isConfigured()).toBe(false);
    s.setKey("k");
    expect(useAiSettings.getState().isConfigured()).toBe(true);
  });
});
