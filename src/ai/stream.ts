/**
 * stream.ts — Server-Sent Events, accumulated back into the ONE string
 * the rest of the pipeline already knows how to read.
 *
 * WHY IT IS ITS OWN MODULE. Streaming exists so a waiting user can see
 * the model working; it must not become a second answer format. Every
 * layer below this one — parse, validate, reconstruct, capture — is
 * unchanged by construction, because what leaves here is the same
 * `content` string the non-streaming path returned. The seam is
 * deliberately this narrow.
 *
 * WHAT A FRAME LOOKS LIKE. OpenAI-compatible endpoints emit
 *
 *   data: {"choices":[{"delta":{"content":"s1\n"},"finish_reason":null}]}
 *   data: {"choices":[{"delta":{},"finish_reason":"stop"}]}
 *   data: [DONE]
 *
 * blank-line separated. Frame boundaries do NOT respect chunk
 * boundaries — a socket splits wherever it likes, including mid-JSON —
 * so this buffers and only consumes complete frames. `stream.test.ts`
 * feeds every fixture one character at a time for exactly that reason.
 *
 * THREE END STATES, NOT TWO. A stream stops for three distinguishable
 * reasons and the caller needs all three:
 *
 *   sawDone         the endpoint said `[DONE]` — the answer is whole
 *   finishReason    why the MODEL stopped ("stop", "length", …) — and
 *                   it rides the LAST chunk, so every earlier chunk
 *                   reports null and a reader that peeks at the first
 *                   one sees a healthy stream
 *   providerError   the endpoint sent an error object mid-stream, after
 *                   200 OK and after some of the answer had arrived
 *
 * A stream that ends with none of them set closed ABRUPTLY, which is
 * its own state and not a success — the caller decides, this module
 * only reports. Same shape as the instrument rule elsewhere in this
 * project: report the measurement and the health separately.
 */

interface ChunkShape {
  choices?: { delta?: { content?: unknown }; finish_reason?: unknown }[];
  error?: { message?: unknown };
}

export class SseAccumulator {
  /** Bytes received but not yet forming a complete frame. */
  private buffer = "";
  private text = "";
  private finish: string | null = null;
  private failure: string | null = null;
  private done = false;

  /** The answer so far — the exact string a non-streamed call returns. */
  get content(): string {
    return this.text;
  }
  /** Why the model stopped, from the last chunk that named it. */
  get finishReason(): string | null {
    return this.finish;
  }
  /** The endpoint's own complaint, delivered mid-stream. */
  get providerError(): string | null {
    return this.failure;
  }
  /** Whether the terminator arrived. Absent ≠ failed: see the docblock. */
  get sawDone(): boolean {
    return this.done;
  }

  /**
   * Feed raw bytes; returns ONLY the text this push added, so a caller
   * can append to a tail without re-rendering the whole answer.
   */
  push(bytes: string): string {
    this.buffer += bytes;
    let added = "";

    // Frames end at a blank line, which is \n\n or \r\n\r\n depending on
    // the server. Consume whole frames only; leave the remainder.
    let cut: number;
    while ((cut = this.buffer.search(/\r?\n\r?\n/)) !== -1) {
      const match = /\r?\n\r?\n/.exec(this.buffer.slice(cut))!;
      const frame = this.buffer.slice(0, cut);
      this.buffer = this.buffer.slice(cut + match[0].length);
      added += this.consumeFrame(frame);
    }
    return added;
  }

  private consumeFrame(frame: string): string {
    let added = "";
    for (const line of frame.split(/\r?\n/)) {
      // `:` comments are keep-alives; `event:`/`id:` carry no payload
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        this.done = true;
        continue;
      }
      let chunk: ChunkShape;
      try {
        chunk = JSON.parse(payload) as ChunkShape;
      } catch {
        // A single unreadable frame must not discard an answer that is
        // otherwise arriving fine — providers interleave vendor lines.
        continue;
      }
      const message = chunk.error?.message;
      if (typeof message === "string" && message.trim()) {
        this.failure = message.trim();
        continue;
      }
      const choice = chunk.choices?.[0];
      const piece = choice?.delta?.content;
      if (typeof piece === "string" && piece) {
        this.text += piece;
        added += piece;
      }
      // The `typeof === "string"` guard is what does the work here:
      // every chunk but the last carries `finish_reason: null`, and
      // null is not a string, so only a NAMED reason is ever recorded.
      // (An earlier comment here claimed plain assignment was
      // load-bearing against `??=`. It is not — the guard already
      // excludes the nulls — and a mutation check said so.)
      if (typeof choice?.finish_reason === "string") {
        this.finish = choice.finish_reason;
      }
    }
    return added;
  }
}
