/**
 * runLog.test.ts — what a run NARRATES, and what it captures when a
 * stream breaks.
 *
 * Two jobs that share a fixture and are not one job:
 *
 *   the LOG    — the live narration a waiting user reads. Ordered
 *                events, one `call` per model call, so the guided retry
 *                is a STRUCTURAL second entry rather than a synthesized
 *                marker string. Grouping by declared relationship, not
 *                by invented category.
 *   the CAPTURE — the bytes that ride a thrown error. Streaming adds a
 *                third stage (`stream`) because a transport that
 *                delivered half an answer refused it at neither parse
 *                nor validate.
 *
 * The load-bearing case here is CANCEL. An aborted stream carries its
 * partial bytes on the error — the client attaches them unconditionally
 * — so the rule "user cancel is not a failure, and populates no
 * capture" has something real to decline. Were the client to withhold
 * the bytes instead, the guard in `run.ts` would be vacuous and nothing
 * would ever say so.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import { AiError } from "../contract";
import { runReorganize } from "../run";
import type { RunLogEvent } from "../runLog";
import { resetAiSettings } from "../settings";

const encoder = new TextEncoder();

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

function frame(content: string, finish: string | null = null): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: { content }, finish_reason: finish }],
  })}\n\n`;
}
const DONE = "data: [DONE]\n\n";

function sse(chunks: string[]): Response {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent < chunks.length) {
        controller.enqueue(encoder.encode(chunks[sent]!));
        sent++;
      } else {
        controller.close();
      }
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** A clean streamed answer for the one-section fixture. */
const CLEAN = () => sse([frame("s1\n"), frame("  t1", "stop"), DONE]);

async function run(
  fetchImpl: typeof fetch,
  events: RunLogEvent[] = [],
): Promise<{ events: RunLogEvent[]; error: AiError | null }> {
  try {
    await runReorganize({
      doc: DOC(),
      options: OPTIONS,
      instructions: "tidy",
      fetchImpl,
      onLog: (e) => events.push(e),
    });
    return { events, error: null };
  } catch (err) {
    if (err instanceof AiError) return { events, error: err };
    throw err;
  }
}

beforeEach(() => resetAiSettings());
afterEach(() => resetAiSettings());

describe("the log a run writes", () => {
  it("narrates one call: sent → connected → deltas → received → done", async () => {
    const { events, error } = await run(async () => CLEAN());
    expect(error).toBeNull();
    expect(events.map((e) => e.kind)).toEqual([
      "call",
      "request",
      "connected",
      "delta",
      "delta",
      "received",
      "done",
    ]);
  });

  it("the sent block is rendered FROM the bytes that left, not from a second copy", async () => {
    // `call` says which attempt; `request` carries what was actually
    // posted. Two facts, two events — and on a 400 fallback one call
    // makes two requests, which a merged event could not express.
    const { events } = await run(async () => CLEAN());
    const call = events.find((e) => e.kind === "call")!;
    expect(call.attempt).toBe("first");

    const request = events.find((e) => e.kind === "request")!;
    // titles, with their compact ids — the privacy claim, watchable
    expect(request.sent).toContain("s1 Guide");
    expect(request.sent).toContain("t1 Intro");
    // and the transport facts, so the block is not a partial account
    expect(request.sent).toContain("stream=true");
    // no paths, no uuids, no key — the same claim the dialog makes
    expect(request.sent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it("the guided retry is a SECOND call entry, not a marker in the first", async () => {
    let calls = 0;
    const { events, error } = await run(async () => {
      calls++;
      return calls === 1
        ? sse([frame("s99 Ghost\n"), frame("  t404", "stop"), DONE])
        : CLEAN();
    });
    expect(error).toBeNull();
    const callEvents = events.filter((e) => e.kind === "call");
    expect(callEvents.map((e) => e.attempt)).toEqual(["first", "after-retry"]);
    // the retry's payload carries the specific complaint, which is what
    // makes it a GUIDED retry rather than a second roll of the dice
    const requests = events.filter((e) => e.kind === "request");
    expect(requests).toHaveLength(2);
    expect(requests[1]!.sent).toContain("s99");
  });

  it("a 400 fallback shows BOTH requests under one call — streamed, then not", async () => {
    let calls = 0;
    const { events, error } = await run(async () => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: { message: "no streaming here" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "s1\n  t1" }, finish_reason: "stop" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    expect(error).toBeNull();
    expect(events.filter((e) => e.kind === "call")).toHaveLength(1);
    const requests = events.filter((e) => e.kind === "request");
    expect(requests).toHaveLength(2);
    expect(requests[0]!.sent).toContain("stream=true");
    expect(requests[1]!.sent).not.toContain("stream=true");
  });

  it("a fallback is stated in one line, because it is a behaviour not an error", async () => {
    const { events, error } = await run(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "s1\n  t1" }, finish_reason: "stop" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    expect(error).toBeNull();
    const notices = events.filter((e) => e.kind === "notice");
    expect(notices).toHaveLength(1);
    expect(notices[0]!.text).toContain("whole response");
    // and the answer still reached the tail
    expect(events.filter((e) => e.kind === "delta")).toHaveLength(1);
  });
});

describe("what a broken stream leaves behind", () => {
  it("mid-stream error: a capture at the STREAM stage, holding the partial", async () => {
    const { error } = await run(async () =>
      sse([
        frame("s1\n"),
        `data: ${JSON.stringify({ error: { message: "Overloaded" } })}\n\n`,
      ]),
    );
    expect(error!.kind).toBe("bad-response");
    expect(error!.capture).toMatchObject({
      stage: "stream",
      attempt: "first",
      raw: "s1\n",
    });
  });

  it("truncation keeps the partial outline as evidence, where it used to keep nothing", async () => {
    const { error } = await run(async () =>
      sse([frame("s1\n"), frame("  t1", "length"), DONE]),
    );
    expect(error!.kind).toBe("truncated");
    expect(error!.capture?.stage).toBe("stream");
    expect(error!.capture?.raw).toBe("s1\n  t1");
  });

  it("an abrupt close captures what arrived", async () => {
    const { error } = await run(async () => sse([frame("s1\n")]));
    expect(error!.kind).toBe("network");
    expect(error!.capture?.raw).toBe("s1\n");
  });

  // ── the rule that needs a non-vacuous fixture ──────────────

  it("USER CANCEL populates no capture — even though the bytes exist", async () => {
    const control = new AbortController();
    const events: RunLogEvent[] = [];
    let error: AiError | null = null;
    try {
      await runReorganize({
        doc: DOC(),
        options: OPTIONS,
        instructions: "tidy",
        signal: control.signal,
        onLog: (e) => {
          events.push(e);
          if (e.kind === "delta") control.abort();
        },
        fetchImpl: async () => sse([frame("s1\n"), frame("  t1"), frame("  t2")]),
      });
    } catch (err) {
      error = err as AiError;
    }

    expect(error!.kind).toBe("aborted");
    // the guard had something to decline: the bytes are ON the error
    expect(error!.partial).toContain("s1");
    // and declined it
    expect(error!.capture).toBeUndefined();
  });
});
