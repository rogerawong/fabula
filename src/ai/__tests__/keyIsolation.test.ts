/**
 * keyIsolation.test.ts — a key entered for one provider is never sent
 * to another (docs/10 amendment, 2026-08-19).
 *
 * THE DEFECT. The API key was a single shared field. Switching presets
 * kept it, so the run after a Gemini → Claude switch posted the Gemini
 * key to Anthropic — a funded secret delivered to the wrong company and
 * into their request logs. Nothing failed visibly: the request was
 * well-formed and the provider simply rejected an unfamiliar
 * credential, which reads as "wrong key, paste it again".
 *
 * The differential workflow this arc exists for — run one document
 * against two providers and compare — IS that switching pattern, so the
 * feature and its worst failure mode arrived together.
 *
 * WHAT IS ASSERTED. Not the store's shape but the BYTES THAT LEAVE: the
 * outgoing request's URL and Authorization header, taken from the real
 * `settings → run → client` path. A store-only test would pass while a
 * call site still read a stale key from somewhere else.
 *
 * WHICH TEST ACTUALLY GUARDS IT — measured, not assumed. Mutating
 * `currentKey` back into the old shared-field behaviour (fall back to
 * any stored key when this provider has none) kills exactly ONE of the
 * cases below: "switching to a provider with no key". The other four
 * pass under the defect, because their fixtures give BOTH providers a
 * key, so the fallback branch is never reached. They pin adjacent
 * properties worth having — restore-on-switch-back, forget-clears-all,
 * the structural claim — but they are not the guard, and a reader
 * pruning "redundant" cases should prune around the first one.
 *
 * The dangerous state is an EMPTY slot, so that is the fixture the
 * guard needs: a provider with a key and a provider without, in one
 * test. A file where every provider is configured cannot show that the
 * unconfigured one is treated differently.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import { runReorganize } from "../run";
import { currentKey, resetAiSettings, useAiSettings } from "../settings";

const GEMINI_KEY = "gemini-only-secret";
const CLAUDE_KEY = "claude-only-secret";

const OPTIONS = {
  mode: "grounded" as const,
  scopeSectionIds: null,
  allowRenames: false,
  allowNewSections: false,
  allowFileMoves: false,
  folderHints: false,
  granularity: "full" as const,
};

const DOC = () => doc([section("Guide", [topic("Intro")])]);

/** Records every request the app actually makes. */
function recorder() {
  const sent: { url: string; auth: string | undefined }[] = [];
  const impl: typeof fetch = async (url, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    sent.push({ url: String(url), auth: headers.Authorization });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "s1\n  t1" }, finish_reason: "stop" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  return { sent, impl };
}

async function reorganize(impl: typeof fetch) {
  await runReorganize({
    doc: DOC(),
    options: OPTIONS,
    instructions: "tidy",
    fetchImpl: impl,
  });
}

beforeEach(() => {
  resetAiSettings();
  useAiSettings.getState().setKey(GEMINI_KEY); // provider starts as gemini
});
afterEach(() => resetAiSettings());

describe("a key belongs to the provider it was entered for", () => {
  it("switching to a provider with no key sends NO key material from the old one", async () => {
    const { sent, impl } = recorder();
    useAiSettings.getState().update({ providerId: "claude" });

    // the switch itself must not have fired anything
    expect(sent).toHaveLength(0);

    // and the app must refuse to run at all, rather than run keyless
    expect(useAiSettings.getState().isConfigured()).toBe(false);

    // force the call anyway — the guard above is UI-level, and this
    // test is about what the transport does when reached
    await reorganize(impl);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toContain("api.anthropic.com");
    expect(sent[0]!.auth ?? "").not.toContain(GEMINI_KEY);
    // no key at all for a provider that has none — not a stale one
    expect(sent[0]!.auth).toBeUndefined();
  });

  it("each provider's own key goes to its own endpoint, across a switch", async () => {
    useAiSettings.getState().update({ providerId: "claude" });
    useAiSettings.getState().setKey(CLAUDE_KEY);

    const claude = recorder();
    await reorganize(claude.impl);
    expect(claude.sent[0]!.url).toContain("api.anthropic.com");
    expect(claude.sent[0]!.auth).toBe(`Bearer ${CLAUDE_KEY}`);
    expect(claude.sent[0]!.auth).not.toContain(GEMINI_KEY);

    useAiSettings.getState().update({ providerId: "gemini" });
    const gemini = recorder();
    await reorganize(gemini.impl);
    expect(gemini.sent[0]!.url).toContain("generativelanguage");
    expect(gemini.sent[0]!.auth).toBe(`Bearer ${GEMINI_KEY}`);
    expect(gemini.sent[0]!.auth).not.toContain(CLAUDE_KEY);
  });

  it("the key and the destination are derived from ONE id, so they cannot disagree", () => {
    // The structural claim, asserted directly: for every preset, the
    // key the app would send is the one stored under the same id that
    // chose the base URL. Vigilance would be a rule someone forgets;
    // this is arithmetic.
    useAiSettings.getState().update({ providerId: "claude" });
    useAiSettings.getState().setKey(CLAUDE_KEY);
    useAiSettings.getState().update({ providerId: "gemini" });

    const s = useAiSettings.getState();
    expect(currentKey(s)).toBe(GEMINI_KEY);
    expect(s.apiKeys.claude).toBe(CLAUDE_KEY);
    expect(currentKey({ ...s, providerId: "claude" })).toBe(CLAUDE_KEY);
  });

  it("switching away and back restores the original key, not an empty field", async () => {
    // the re-paste-every-time complaint, pinned
    useAiSettings.getState().update({ providerId: "claude" });
    useAiSettings.getState().update({ providerId: "gemini" });
    expect(currentKey(useAiSettings.getState())).toBe(GEMINI_KEY);
  });

  it("forgetKey clears every provider, not only the visible one", () => {
    useAiSettings.getState().update({ providerId: "claude" });
    useAiSettings.getState().setKey(CLAUDE_KEY);
    useAiSettings.getState().forgetKey();

    const s = useAiSettings.getState();
    expect(s.apiKeys).toEqual({});
    expect(currentKey({ ...s, providerId: "gemini" })).toBe("");
  });
});
