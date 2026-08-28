import { describe, expect, it } from "vitest";
import { AiError } from "../contract";
import { chatCompletion, listModels, type ChatArgs } from "../client";

function args(fetchImpl: typeof fetch, extra?: Partial<ChatArgs>): ChatArgs {
  return {
    baseUrl: "https://api.example.com/v1/",
    apiKey: "sk-test",
    model: "test-model",
    messages: [{ role: "user", content: "hi" }],
    fetchImpl,
    ...extra,
  };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (err) {
    return err instanceof AiError ? err.kind : `unexpected:${String(err)}`;
  }
}

/** Await a rejection and return it as an AiError. */
async function asAiError(promise: Promise<unknown>): Promise<AiError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof AiError) return err;
    throw err;
  }
  throw new Error("expected the call to reject");
}

describe("chatCompletion", () => {
  it("happy path: posts an OpenAI-shaped body and returns content", async () => {
    let captured: { url: string; body: Record<string, unknown> } | null = null;
    const impl: typeof fetch = async (url, init) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)) };
      return jsonResponse({
        choices: [{ message: { content: "s1\n  t1" }, finish_reason: "stop" }],
      });
    };
    const content = await chatCompletion(
      args(impl, { extraBody: { reasoning_effort: "low" } }),
    );
    expect(content).toBe("s1\n  t1");
    expect(captured!.url).toBe("https://api.example.com/v1/chat/completions");
    expect(captured!.body).toMatchObject({
      model: "test-model",
      temperature: 0.2,
      reasoning_effort: "low",
    });
  });

  it("maps 401/403 to auth without leaking the key", async () => {
    const impl: typeof fetch = async () => new Response("", { status: 401 });
    const err = await asAiError(chatCompletion(args(impl)));
    expect(err.kind).toBe("auth");
    expect(err.message).not.toContain("sk-test");
  });

  it("maps 429 to rate-limit and reads Retry-After", async () => {
    const impl: typeof fetch = async () =>
      new Response("", { status: 429, headers: { "Retry-After": "34" } });
    const err = await asAiError(chatCompletion(args(impl)));
    expect(err.kind).toBe("rate-limit");
    expect(err.retryAfterSec).toBe(34);
    expect(err.message).toContain("34");
  });

  it("maps network TypeError to a CORS-flavored message", async () => {
    const impl: typeof fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    const err = await asAiError(chatCompletion(args(impl)));
    expect(err.kind).toBe("network");
    expect(err.message).toContain("CORS");
  });

  it("maps finish_reason length to truncated with guidance", async () => {
    const impl: typeof fetch = async () =>
      jsonResponse({
        choices: [{ message: { content: "s1\n  t" }, finish_reason: "length" }],
      });
    const err = await asAiError(chatCompletion(args(impl)));
    expect(err.kind).toBe("truncated");
    expect(err.message).toContain("granularity");
  });

  it("maps empty content and unreadable bodies to bad-response", async () => {
    expect(
      await kindOf(
        chatCompletion(
          args(async () => jsonResponse({ choices: [{ message: { content: "" } }] })),
        ),
      ),
    ).toBe("bad-response");
    expect(
      await kindOf(
        chatCompletion(args(async () => new Response("<html>", { status: 200 }))),
      ),
    ).toBe("bad-response");
  });

  it("maps aborts to aborted", async () => {
    const impl: typeof fetch = async () => {
      throw new DOMException("The user aborted a request.", "AbortError");
    };
    expect(await kindOf(chatCompletion(args(impl)))).toBe("aborted");
  });

  it("surfaces the provider's error body message (e.g. unknown model 404)", async () => {
    const impl: typeof fetch = async () =>
      jsonResponse(
        {
          error: {
            message: "models/gemini-2.5-flash is not found for API version v1beta",
          },
        },
        { status: 404 },
      );
    const err = await asAiError(chatCompletion(args(impl)));
    expect(err.kind).toBe("bad-response");
    expect(err.message).toContain("404");
    expect(err.message).toContain("is not found");
  });
});

describe("listModels", () => {
  it("returns sorted ids with the models/ prefix stripped", async () => {
    const impl: typeof fetch = async (url) => {
      expect(String(url)).toBe("https://api.example.com/v1/models");
      return jsonResponse({
        data: [
          { id: "models/gemini-flash-latest" },
          { id: "models/gemini-3.5-flash" },
          { id: "gemini-embedding" },
          { id: "models/gemini-3.5-flash" }, // duplicate
        ],
      });
    };
    const ids = await listModels({
      baseUrl: "https://api.example.com/v1/",
      apiKey: "k",
      fetchImpl: impl,
    });
    expect(ids).toEqual(["gemini-3.5-flash", "gemini-embedding", "gemini-flash-latest"]);
  });

  it("maps auth failures and error bodies like the chat call", async () => {
    const impl401: typeof fetch = async () => new Response("", { status: 401 });
    await expect(
      listModels({ baseUrl: "https://x.test", apiKey: "k", fetchImpl: impl401 }),
    ).rejects.toMatchObject({ kind: "auth" });
  });

  // ── not measured is not zero ──────────────────────────────
  //
  // `data ?? []` used to turn ANY 200 without a `data` array into a
  // successful fetch of zero models: the note read "0 models
  // available", the current model was silently kept, and nothing told
  // the user their endpoint had answered with something else. The
  // failure was invisible precisely because it wore a success's
  // clothes — and nothing in this suite asserted the behaviour either
  // way, which is how it survived.

  it("refuses a 200 that is not a model list, rather than reporting zero", async () => {
    const impl: typeof fetch = async () => jsonResponse({ oops: "not a list" });
    const err = await asAiError(
      listModels({ baseUrl: "https://x.test", apiKey: "k", fetchImpl: impl }),
    );
    expect(err.kind).toBe("bad-response");
    expect(err.message).toContain("not with a model list");
  });

  it("refuses a chat completion answered at /models — the shape a mis-set base URL gives", async () => {
    // The literal body a stale interception returned for a GET to
    // /models during this arc's own receipt collection. Pinned as a
    // fixture because it is the realistic wrong answer, not an
    // invented one.
    const impl: typeof fetch = async () =>
      jsonResponse({
        choices: [{ message: { content: "s1\n  t1" }, finish_reason: "stop" }],
      });
    const err = await asAiError(
      listModels({ baseUrl: "https://x.test", apiKey: "k", fetchImpl: impl }),
    );
    expect(err.kind).toBe("bad-response");
  });

  it("an EMPTY list is still a real answer and is returned as one", async () => {
    // The other side of the rule: `data: []` is a measurement — this
    // key serves no models — and must not be conflated with the
    // refusal above. Both answers pinned, or only half the rule is.
    const impl: typeof fetch = async () => jsonResponse({ data: [] });
    await expect(
      listModels({ baseUrl: "https://x.test", apiKey: "k", fetchImpl: impl }),
    ).resolves.toEqual([]);
  });
});
