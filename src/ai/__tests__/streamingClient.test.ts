/**
 * streamingClient.test.ts — the transport half of streaming: does a
 * stream get established, what happens when it cannot be, and what
 * survives when one breaks.
 *
 * `stream.test.ts` owns the byte accumulation. This file owns the parts
 * that touch a `Response`: the request body, the fallback classifier,
 * the partial bytes that ride a failure, and abort.
 *
 * THE FALLBACK IS A CLASSIFIER, so both sides are asserted. A rule that
 * says "these answers mean the endpoint refused SSE" is two claims, and
 * testing only the inclusion is how the exclusion ships broken — an
 * auth failure retried "just in case" doubles every keyless run and
 * reports the second failure instead of the first.
 */

import { describe, expect, it } from "vitest";
import { AiError } from "../contract";
import { chatCompletion, type ChatArgs, type ChatEvent } from "../client";

const encoder = new TextEncoder();

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

function frame(content: string, finish: string | null = null): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: { content }, finish_reason: finish }],
  })}\n\n`;
}

/**
 * A real streamed Response — a ReadableStream with the SSE mime type.
 *
 * `thenError` is delivered from a LATER pull, never from `start`.
 * `controller.error()` resets the queue, so erroring in `start` after
 * enqueuing discards everything enqueued and the first read rejects
 * with nothing delivered — which is a different scenario (a socket that
 * died before any bytes) wearing this one's name. The first cut did
 * exactly that and reported working code as broken.
 */
function sse(chunks: string[], opts?: { thenError?: Error }): Response {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent < chunks.length) {
        controller.enqueue(encoder.encode(chunks[sent]!));
        sent++;
        return;
      }
      if (opts?.thenError) controller.error(opts.thenError);
      else controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

async function asAiError(promise: Promise<unknown>): Promise<AiError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof AiError) return err;
    throw err;
  }
  throw new Error("expected the call to reject");
}

const DONE = "data: [DONE]\n\n";

describe("the streamed request", () => {
  it("asks for a stream and returns the whole accumulated answer", async () => {
    let body: Record<string, unknown> = {};
    const impl: typeof fetch = async (_url, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return sse([frame("s1\n"), frame("  t1", "stop"), DONE]);
    };
    const content = await chatCompletion(args(impl));
    expect(body.stream).toBe(true);
    expect(content).toBe("s1\n  t1");
  });

  it("the payload differs from the non-streamed one by EXACTLY `stream: true`", async () => {
    // The arc's stated guarantee. Asserted as a diff rather than as a
    // shape, because a shape assertion passes while a second key rides
    // along beside the one that was meant to change.
    const capture = async (extra?: Partial<ChatArgs>) => {
      let body: Record<string, unknown> = {};
      const impl: typeof fetch = async (_u, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return sse([frame("x", "stop"), DONE]);
      };
      await chatCompletion(args(impl, extra));
      return body;
    };

    const streamed = await capture({ extraBody: { reasoning_effort: "low" } });
    const { stream, ...rest } = streamed;
    expect(stream).toBe(true);
    // what remains is byte-for-byte the body this client sent before
    // streaming existed
    expect(rest).toEqual({
      model: "test-model",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.2,
      reasoning_effort: "low",
    });

    // and the Claude shape — no temperature — is still no temperature
    const claude = await capture({ supportsTemperature: false });
    expect(claude).not.toHaveProperty("temperature");
    expect(claude.stream).toBe(true);
  });

  it("reports connection and each delta, in order, as they arrive", async () => {
    const events: ChatEvent[] = [];
    const impl: typeof fetch = async () =>
      sse([frame("s1\n"), frame("  t1"), frame("", "stop"), DONE]);
    await chatCompletion(args(impl, { onEvent: (e) => events.push(e) }));
    expect(events.map((e) => e.kind)).toEqual(["request", "connected", "delta", "delta"]);
    expect(events.filter((e) => e.kind === "delta")).toEqual([
      { kind: "delta", text: "s1\n" },
      { kind: "delta", text: "  t1" },
    ]);
    // the request event carries the LITERAL posted body, not a
    // reconstruction of it
    const request = events.find((e) => e.kind === "request")!;
    expect(JSON.parse(request.body)).toMatchObject({ model: "test-model", stream: true });
    expect(request.url).toBe("https://api.example.com/v1/chat/completions");
  });
});

describe("fallback — what counts as 'this endpoint will not stream'", () => {
  it("a 200 that is not an event stream is READ, not re-requested", async () => {
    let calls = 0;
    const events: ChatEvent[] = [];
    const impl: typeof fetch = async () => {
      calls++;
      return json({
        choices: [{ message: { content: "s1\n  t1" }, finish_reason: "stop" }],
      });
    };
    const content = await chatCompletion(args(impl, { onEvent: (e) => events.push(e) }));
    expect(content).toBe("s1\n  t1");
    expect(calls).toBe(1); // the answer is already in hand — asking twice is waste
    expect(events.filter((e) => e.kind === "fallback")).toHaveLength(1);
    // the whole answer still reaches the tail, so the pane is not blank
    expect(events).toContainEqual({ kind: "delta", text: "s1\n  t1" });
  });

  it("a 400 IS a refusal of the request we changed: retry once, unstreamed", async () => {
    const bodies: Record<string, unknown>[] = [];
    const impl: typeof fetch = async (_u, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (bodies.length === 1) {
        return json({ error: { message: "stream is not supported" } }, { status: 400 });
      }
      return json({ choices: [{ message: { content: "s1" }, finish_reason: "stop" }] });
    };
    const events: ChatEvent[] = [];
    const content = await chatCompletion(args(impl, { onEvent: (e) => events.push(e) }));
    expect(content).toBe("s1");
    expect(bodies).toHaveLength(2);
    expect(bodies[0]!.stream).toBe(true);
    expect(bodies[1]).not.toHaveProperty("stream"); // the key is REMOVED, not falsified
    expect(events.filter((e) => e.kind === "fallback")).toHaveLength(1);
  });

  it("a 400 that persists is reported once, with the provider's own words", async () => {
    let calls = 0;
    const impl: typeof fetch = async () => {
      calls++;
      return json({ error: { message: "model is retired" } }, { status: 400 });
    };
    const err = await asAiError(chatCompletion(args(impl)));
    expect(calls).toBe(2);
    expect(err.kind).toBe("bad-response");
    expect(err.message).toContain("model is retired");
  });

  // ── the exclusion side, without which only half the rule is pinned ──

  it("does NOT retry a 401 — an auth failure is not a streaming failure", async () => {
    let calls = 0;
    const impl: typeof fetch = async () => {
      calls++;
      return new Response("", { status: 401 });
    };
    const err = await asAiError(chatCompletion(args(impl)));
    expect(err.kind).toBe("auth");
    expect(calls).toBe(1);
  });

  it("does NOT retry a 429 — doubling a rate-limited call is the worst answer", async () => {
    let calls = 0;
    const impl: typeof fetch = async () => {
      calls++;
      return new Response("", { status: 429 });
    };
    expect((await asAiError(chatCompletion(args(impl)))).kind).toBe("rate-limit");
    expect(calls).toBe(1);
  });

  it("does NOT retry a 503 — the endpoint is down, not fussy about SSE", async () => {
    let calls = 0;
    const impl: typeof fetch = async () => {
      calls++;
      return json({ error: { message: "overloaded" } }, { status: 503 });
    };
    expect((await asAiError(chatCompletion(args(impl)))).kind).toBe("bad-response");
    expect(calls).toBe(1);
  });

  it("does NOT retry a transport throw — there was no answer to classify", async () => {
    let calls = 0;
    const impl: typeof fetch = async () => {
      calls++;
      throw new TypeError("Failed to fetch");
    };
    expect((await asAiError(chatCompletion(args(impl)))).kind).toBe("network");
    expect(calls).toBe(1);
  });
});

describe("what survives a broken stream", () => {
  it("mid-stream error: the provider's complaint AND the bytes that arrived", async () => {
    const impl: typeof fetch = async () =>
      sse([
        frame("s1\n"),
        frame("  t1"),
        `data: ${JSON.stringify({ error: { message: "Overloaded" } })}\n\n`,
      ]);
    const err = await asAiError(chatCompletion(args(impl)));
    expect(err.kind).toBe("bad-response");
    expect(err.message).toContain("Overloaded");
    expect(err.partial).toBe("s1\n  t1");
  });

  it("abrupt close: no terminator, and the partial is kept", async () => {
    const impl: typeof fetch = async () => sse([frame("s1\n"), frame("  t1")]);
    const err = await asAiError(chatCompletion(args(impl)));
    expect(err.kind).toBe("network");
    expect(err.message).toContain("closed");
    expect(err.partial).toBe("s1\n  t1");
  });

  it("a socket that errors mid-read is an abrupt close too", async () => {
    const impl: typeof fetch = async () =>
      sse([frame("s1\n")], { thenError: new TypeError("terminated") });
    const err = await asAiError(chatCompletion(args(impl)));
    expect(err.kind).toBe("network");
    expect(err.partial).toBe("s1\n");
  });

  it("length in the terminal chunk: truncated, with the partial outline", async () => {
    const impl: typeof fetch = async () =>
      sse([frame("s1\n"), frame("  t1", "length"), DONE]);
    const err = await asAiError(chatCompletion(args(impl)));
    expect(err.kind).toBe("truncated");
    expect(err.message).toContain("granularity");
    expect(err.partial).toBe("s1\n  t1");
  });

  it("the UNSTREAMED path keeps its partial too, or the evidence depends on transport", async () => {
    const impl: typeof fetch = async () =>
      json({ choices: [{ message: { content: "s1\n  t" }, finish_reason: "length" }] });
    const err = await asAiError(chatCompletion(args(impl)));
    expect(err.kind).toBe("truncated");
    expect(err.partial).toBe("s1\n  t");
  });

  it("a stream that ends with `stop` but no [DONE] is complete, not abrupt", async () => {
    // Real endpoints differ on whether they send the terminator. The
    // model said why it stopped, which is the fact that matters.
    const impl: typeof fetch = async () => sse([frame("s1"), frame("", "stop")]);
    await expect(chatCompletion(args(impl))).resolves.toBe("s1");
  });
});

describe("abort", () => {
  it("stops reading, cancels the body, and still hands back what arrived", async () => {
    const control = new AbortController();
    let pulls = 0;
    let cancelled = false;

    // BOUNDED on purpose. An unbounded fixture does not fail an
    // ignored-abort implementation, it exhausts the heap — which is a
    // harness defect wearing a product defect's clothes, and it is
    // exactly what the first cut of this test did. 200 is far more
    // than the abort should ever allow through, and finite.
    const MAX_PULLS = 200;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        if (pulls > MAX_PULLS) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(frame(`line${pulls}\n`)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const impl: typeof fetch = async () =>
      new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

    const err = await asAiError(
      chatCompletion(
        args(impl, {
          signal: control.signal,
          onEvent: (e) => {
            if (e.kind === "delta") control.abort();
          },
        }),
      ),
    );

    expect(err.kind).toBe("aborted");
    expect(cancelled).toBe(true);
    const pullsAtAbort = pulls;
    await new Promise((r) => setTimeout(r, 20));
    expect(pulls).toBe(pullsAtAbort); // no further reads after abort
    // the bytes exist — which is what makes run.ts's "no capture on
    // cancel" rule load-bearing rather than vacuous
    expect(err.partial).toContain("line1");
  });
});
