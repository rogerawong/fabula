/**
 * stream.test.ts — the SSE accumulator, against the four chunk
 * sequences `scripts/mock-provider.ts` can emit.
 *
 * The accumulator is where a streamed answer becomes the SAME string
 * the non-streaming path produced, so every downstream layer (parse,
 * validate, capture) is unchanged by construction. It is pure — strings
 * in, strings out — so the four failure shapes are unit fixtures rather
 * than network conditions nobody can reproduce on demand.
 *
 * WHAT IT DOES NOT COVER, stated because a green run here says nothing
 * about it: this file never touches `fetch`, a `Response`, or a reader.
 * Whether the client establishes a stream at all, and what it does when
 * the endpoint refuses one, is `streamingClient.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { SseAccumulator } from "../stream";

/** One SSE frame carrying an OpenAI-shaped chat delta. */
function delta(content: string, finish: string | null = null): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: { content }, finish_reason: finish }],
  })}\n\n`;
}

/** Feed a whole transcript through in one push. */
function feedWhole(text: string): SseAccumulator {
  const acc = new SseAccumulator();
  acc.push(text);
  return acc;
}

/** Feed the same transcript one character at a time — frame boundaries
 *  do not respect chunk boundaries, and a real socket splits wherever
 *  it likes. */
function feedByChar(text: string): { acc: SseAccumulator; emitted: string } {
  const acc = new SseAccumulator();
  let emitted = "";
  for (const ch of text) emitted += acc.push(ch);
  return { acc, emitted };
}

const CLEAN = delta("s1\n") + delta("  t1\n") + delta("s2", "stop") + "data: [DONE]\n\n";

const MID_ERROR =
  delta("s1\n") +
  delta("  t1") +
  `data: ${JSON.stringify({ error: { message: "Overloaded, try again later" } })}\n\n`;

const ABRUPT = delta("s1\n") + delta("  t1");

const LENGTH = delta("s1\n") + delta("  t1", "length") + "data: [DONE]\n\n";

describe("SseAccumulator — a clean run", () => {
  it("accumulates the deltas into the whole answer", () => {
    const acc = feedWhole(CLEAN);
    expect(acc.content).toBe("s1\n  t1\ns2");
    expect(acc.finishReason).toBe("stop");
    expect(acc.providerError).toBeNull();
    expect(acc.sawDone).toBe(true);
  });

  it("returns each push's new text, so a caller can tail it", () => {
    const acc = new SseAccumulator();
    expect(acc.push(delta("s1\n"))).toBe("s1\n");
    expect(acc.push(delta("  t1\n"))).toBe("  t1\n");
    expect(acc.push("data: [DONE]\n\n")).toBe("");
  });

  it("is indifferent to where the socket splits the bytes", () => {
    const { acc, emitted } = feedByChar(CLEAN);
    expect(acc.content).toBe("s1\n  t1\ns2");
    expect(emitted).toBe("s1\n  t1\ns2");
    expect(acc.finishReason).toBe("stop");
    expect(acc.sawDone).toBe(true);
  });

  it("tolerates CRLF frame separators and SSE comment lines", () => {
    const acc = new SseAccumulator();
    acc.push(": ping\r\n\r\n");
    acc.push(delta("s1").replace(/\n\n$/, "\r\n\r\n"));
    expect(acc.content).toBe("s1");
  });
});

describe("SseAccumulator — the three ways a stream goes wrong", () => {
  it("mid-stream error: keeps what arrived AND names the provider's complaint", () => {
    const acc = feedWhole(MID_ERROR);
    expect(acc.content).toBe("s1\n  t1");
    expect(acc.providerError).toBe("Overloaded, try again later");
    expect(acc.sawDone).toBe(false);
  });

  it("abrupt close: no terminator, no finish reason, and the partial survives", () => {
    const acc = feedWhole(ABRUPT);
    expect(acc.content).toBe("s1\n  t1");
    expect(acc.finishReason).toBeNull();
    expect(acc.sawDone).toBe(false);
    expect(acc.providerError).toBeNull();
  });

  it("length-terminal: the reason rides the LAST chunk, not the first", () => {
    // The distinguishing fact about streaming truncation: every earlier
    // chunk says finish_reason null, so a reader that stops at the
    // first chunk sees a healthy stream.
    const acc = feedWhole(LENGTH);
    expect(acc.content).toBe("s1\n  t1");
    expect(acc.finishReason).toBe("length");
    expect(acc.sawDone).toBe(true);
  });

  it("each failure shape survives a one-character-at-a-time feed too", () => {
    expect(feedByChar(MID_ERROR).acc.providerError).toBe("Overloaded, try again later");
    expect(feedByChar(ABRUPT).acc.content).toBe("s1\n  t1");
    expect(feedByChar(LENGTH).acc.finishReason).toBe("length");
  });

  it("a data line that is not JSON is skipped, not fatal", () => {
    // Providers emit keep-alives and vendor lines; one unreadable frame
    // must not discard an answer that is otherwise arriving fine.
    const acc = new SseAccumulator();
    acc.push("data: not-json\n\n");
    acc.push(delta("s1"));
    expect(acc.content).toBe("s1");
    expect(acc.providerError).toBeNull();
  });
});
