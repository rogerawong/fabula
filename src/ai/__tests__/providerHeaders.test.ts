/**
 * providerHeaders.test.ts — the `extraHeaders` transport seam
 * (docs/10 amendment 2026-08-18).
 *
 * Two claims, and only one of them is the obvious one. That the Claude
 * preset SENDS its browser-access header is the inclusion half; that
 * every provider declaring no `extraHeaders` sends NOTHING extra is the
 * exclusion half, and a merge that leaked one provider's headers into
 * another's request would pass an inclusion-only suite untouched. A net
 * is pinned only when both its answers are.
 *
 * The absence half is driven FROM THE REGISTRY rather than naming
 * gemini and custom, so a future preset inherits the fence instead of
 * being exempt from it by omission.
 */

import { describe, expect, it } from "vitest";
import { chatCompletion, listModels } from "../client";
import { PROVIDERS, getProvider } from "../providers";

const BROWSER_HEADER = "anthropic-dangerous-direct-browser-access";
const BASE = ["Content-Type", "Authorization"];

/** A fetch stub that records the headers of every request it sees. */
function recorder(body: unknown) {
  const seen: Record<string, string>[] = [];
  const impl: typeof fetch = async (_url, init) => {
    seen.push({ ...((init?.headers ?? {}) as Record<string, string>) });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { seen, impl };
}

const CHAT_OK = { choices: [{ message: { content: "s1" }, finish_reason: "stop" }] };
const MODELS_OK = { data: [{ id: "claude-opus-5" }] };

describe("extraHeaders — the inclusion half", () => {
  it("the Claude preset sends the browser-access header on a chat call", async () => {
    const claude = getProvider("claude");
    const { seen, impl } = recorder(CHAT_OK);
    await chatCompletion({
      baseUrl: claude.baseUrl,
      apiKey: "sk-test",
      model: claude.defaultModel,
      messages: [{ role: "user", content: "hi" }],
      extraHeaders: claude.extraHeaders,
      fetchImpl: impl,
    });
    // exact name and value — the API matches the header by name, and a
    // typo fails as a CORS block that reads like a network outage
    expect(seen[0]![BROWSER_HEADER]).toBe("true");
  });

  it("…and on the model-list call, which is a second consumer", async () => {
    // The consumer sweep. `listModels` backs the settings "Fetch
    // available models" button; wiring only `chatCompletion` ships a
    // button that CORS-fails for exactly the provider this seam exists
    // for, and nothing in the chat tests would notice.
    const claude = getProvider("claude");
    const { seen, impl } = recorder(MODELS_OK);
    await listModels({
      baseUrl: claude.baseUrl,
      apiKey: "sk-test",
      extraHeaders: claude.extraHeaders,
      fetchImpl: impl,
    });
    expect(seen[0]![BROWSER_HEADER]).toBe("true");
  });
});

describe("extraHeaders — the exclusion half (the fence)", () => {
  const headerless = PROVIDERS.filter((p) => p.extraHeaders === undefined);

  it("some preset declares none, or this fence is vacuous", () => {
    expect(headerless.length).toBeGreaterThan(0);
  });

  it.each(headerless.map((p) => [p.id] as const))(
    "%s sends exactly the base headers on a chat call — nothing extra",
    async (id) => {
      const provider = getProvider(id);
      const { seen, impl } = recorder(CHAT_OK);
      await chatCompletion({
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        model: "m",
        messages: [{ role: "user", content: "hi" }],
        extraHeaders: provider.extraHeaders,
        fetchImpl: impl,
      });
      expect(Object.keys(seen[0]!).sort()).toEqual([...BASE].sort());
      expect(seen[0]![BROWSER_HEADER]).toBeUndefined();
    },
  );

  it.each(headerless.map((p) => [p.id] as const))(
    "%s sends no extra headers on the model-list call either",
    async (id) => {
      const provider = getProvider(id);
      const { seen, impl } = recorder(MODELS_OK);
      await listModels({
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        extraHeaders: provider.extraHeaders,
        fetchImpl: impl,
      });
      expect(Object.keys(seen[0]!)).toEqual(["Authorization"]);
    },
  );

  it("an undefined extraHeaders never serializes a phantom header", async () => {
    const { seen, impl } = recorder(CHAT_OK);
    await chatCompletion({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      // no extraHeaders at all — the shape a custom provider produces
      fetchImpl: impl,
    });
    expect(Object.keys(seen[0]!).sort()).toEqual([...BASE].sort());
  });
});

describe("the registry's own contents", () => {
  // Asserted over the LIVE registry rather than the interface: a
  // preset reaches this array from fixtures and tests too, and a
  // header whose value is undefined serializes as the string
  // "undefined" and fails as an opaque 400.
  it.each(PROVIDERS.map((p) => [p.id] as const))(
    "%s declares header values that are non-empty strings",
    (id) => {
      const entries = Object.entries(getProvider(id).extraHeaders ?? {});
      for (const [name, value] of entries) {
        expect(name.trim()).not.toBe("");
        expect(typeof value).toBe("string");
        expect(value.trim()).not.toBe("");
      }
    },
  );

  it("any preset pointed at Anthropic carries the browser-access header", () => {
    // The claim that decays if a second Anthropic-shaped preset is
    // added later (a Bedrock/one-off URL, a differently-labelled
    // Claude entry) and the header is forgotten: the request would
    // fail CORS in the browser and pass every unit test, because
    // nothing here talks to the network.
    for (const p of PROVIDERS) {
      if (p.baseUrl.includes("api.anthropic.com")) {
        expect(p.extraHeaders?.[BROWSER_HEADER]).toBe("true");
      }
    }
  });
});

describe("temperature, suppressed per provider (measured 2026-08-19)", () => {
  // A live Claude reorganize answered 400 "temperature is deprecated for
  // this model." Both sides are asserted: the preset that refuses it
  // sends no such key, and the preset that accepts it is UNCHANGED —
  // a suppression that leaked into Gemini would be a silent behaviour
  // change to the provider this app has always shipped.

  async function bodyFor(providerId: string) {
    const provider = getProvider(providerId);
    let sent: Record<string, unknown> = {};
    const impl: typeof fetch = async (_url, init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify(CHAT_OK), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    await chatCompletion({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      supportsTemperature: provider.supportsTemperature,
      extraBody: provider.extraBody,
      fetchImpl: impl,
    });
    return sent;
  }

  it("the Claude preset omits the temperature KEY entirely", async () => {
    const body = await bodyFor("claude");
    // absent, not zero: the provider rejects the parameter, not a value
    expect("temperature" in body).toBe(false);
  });

  it("Gemini still sends temperature, unchanged", async () => {
    const body = await bodyFor("gemini");
    expect(body.temperature).toBe(0.2);
  });

  it("a provider that says nothing keeps the default", async () => {
    const body = await bodyFor("custom");
    expect(body.temperature).toBe(0.2);
  });
});

describe("the model-list capability (measured 2026-08-19)", () => {
  it("Claude declares it cannot serve a list to this client", () => {
    // A valid funded key was refused exactly as a dummy one was:
    // Anthropic reads Bearer as an OAuth credential, so an API key sent
    // that way is never valid. Recorded as a capability rather than
    // worked around with a hardcoded list.
    expect(getProvider("claude").supportsModelList).toBe(false);
  });

  it("every other preset still offers one", () => {
    for (const p of PROVIDERS) {
      if (p.id === "claude") continue;
      expect(p.supportsModelList).not.toBe(false);
    }
  });
});
