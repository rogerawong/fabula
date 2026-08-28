/**
 * capture.test.ts — the raw-response capture on a rejected proposal
 * (docs/10 amendment 2026-08-18).
 *
 * The defect this exists for is an ABSENCE: a parse failure used to
 * throw a message and drop the bytes that caused it, so every report
 * arrived without the one artifact that would localize it. The capture
 * carries two facts that are not one fact — WHICH LAYER rejected it
 * (parse / validate / stream) and WHICH ATTEMPT it was (before or after
 * the one guided retry) — because "it failed after the retry" and "the
 * parser failed" answer different questions and a single phase string
 * would answer neither.
 *
 * Driven through `runReorganize` with a canned proposal and a stubbed
 * fetch: keyless, deterministic, and it exercises the real
 * parse → retry → reconstruct path rather than a simulation of it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { TocDocument } from "@/model/types";
import { AiError } from "../contract";
import { formatCapture } from "../capture";
import { runReorganize } from "../run";
import { resetAiSettings, useAiSettings } from "../settings";

const OPTIONS = {
  mode: "grounded" as const,
  scopeSectionIds: null,
  allowRenames: false,
  allowNewSections: false,
  allowFileMoves: false,
  folderHints: false,
  granularity: "full" as const,
};

/**
 * s1 Guide [t1 Intro, t2 Install(LOCKED)]
 * s2 Reference [t3 API]
 *
 * The lock is what makes a validate rejection cheap to provoke: moving
 * a pinned row between sections trips the pinned-rows net, which needs
 * no collection adapter and no chain fixture.
 */
function lockedDoc(): TocDocument {
  const install = {
    ...topic("Install"),
    lock: { kind: "reference" as const, owner: "Reference" },
  };
  return doc([
    section("Guide", [topic("Intro"), install]),
    section("Reference", [topic("API")]),
  ]);
}

const KEEPS_THE_LOCK_PUT = "s1\n  t1\n  t2\ns2\n  t3";
const MOVES_THE_LOCKED_ROW = "s1\n  t1\ns2\n  t2\n  t3";
/**
 * The locked row PROMOTED to top level, which the reconstruction net
 * refuses for the same reason (its parent changed) but the
 * pre-reconstruct checker deliberately declines to judge — a root
 * placement may be re-wrapped into the row's original orphan section or
 * minted as a fresh one, and only the finished document says which
 * (`constraints.ts`, the sound-not-complete rule).
 *
 * That exclusion is why this body still produces a FIRST-attempt
 * validate rejection after the parity arc, where `MOVES_THE_LOCKED_ROW`
 * now earns a guided retry first. Two fixtures, two claims.
 */
const PROMOTES_THE_LOCKED_ROW = "s1\n  t1\nt2\ns2\n  t3";
const UNKNOWN_ID = "s99 Nope";

/** Replies with each canned body in turn, one per model call. */
function replying(...bodies: string[]) {
  let call = 0;
  const impl: typeof fetch = async () => {
    const content = bodies[Math.min(call, bodies.length - 1)]!;
    call += 1;
    return new Response(
      JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  return { impl, calls: () => call };
}

async function runExpectingFailure(
  document: TocDocument,
  ...bodies: string[]
): Promise<AiError> {
  const { impl } = replying(...bodies);
  try {
    await runReorganize({
      doc: document,
      options: OPTIONS,
      instructions: "tidy this up",
      fetchImpl: impl,
    });
  } catch (err) {
    if (err instanceof AiError) return err;
    throw err;
  }
  throw new Error("expected the run to reject");
}

/** Run against a raw fetch stub, for failures that happen at the
 *  transport rather than in a model answer. */
async function runExpectingTransportFailure(impl: typeof fetch): Promise<AiError> {
  try {
    await runReorganize({
      doc: lockedDoc(),
      options: OPTIONS,
      instructions: "tidy this up",
      fetchImpl: impl,
    });
  } catch (err) {
    if (err instanceof AiError) return err;
    throw err;
  }
  throw new Error("expected the run to reject");
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetAiSettings();
  useAiSettings.setState({
    baseUrl: "https://api.example.com/v1",
    apiKeys: { gemini: "sk-test" },
    model: "test-model",
  });
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  resetAiSettings();
});

describe("the parse stage", () => {
  it("captures the raw body and names the stage and the attempt", async () => {
    const err = await runExpectingFailure(lockedDoc(), UNKNOWN_ID, UNKNOWN_ID);
    expect(err.capture).toBeDefined();
    expect(err.capture!.stage).toBe("parse");
    // both calls failed, so what is captured is the RETRY's answer
    expect(err.capture!.attempt).toBe("after-retry");
    expect(err.capture!.raw).toBe(UNKNOWN_ID);
    expect(err.capture!.errors).toEqual([expect.stringContaining("unknown id")]);
  });

  it("captures the BYTES, not the parser's view of them", async () => {
    // A measurement is not the bytes that produced it. The parser strips
    // fences and prose to find the outline; a capture that stored the
    // extracted text would lose exactly the wrapping that is usually
    // the reason a report was filed at all.
    const messy = "Sure! Here you go:\n\n```text\ns99 Nope\n```\n\nHope that helps.";
    const err = await runExpectingFailure(lockedDoc(), messy, messy);
    expect(err.capture!.raw).toBe(messy);
  });
});

describe("the validate stage", () => {
  it("captures a first-attempt rejection as stage validate, attempt first", async () => {
    // Uses the PROMOTION fixture, not the section-move one. Since the
    // parity arc a pinned row moved between sections is caught before
    // reconstruction and earns the guided retry, so it can no longer
    // produce a first-attempt validate capture — the combination this
    // test exists to pin. A root placement is the pre-check's stated
    // exclusion, so it still reaches reconstruction on the first answer.
    const err = await runExpectingFailure(lockedDoc(), PROMOTES_THE_LOCKED_ROW);
    expect(err.message).toContain("pinned in place");
    expect(err.capture!.stage).toBe("validate");
    expect(err.capture!.attempt).toBe("first");
    expect(err.capture!.raw).toBe(PROMOTES_THE_LOCKED_ROW);
  });

  it("a pinned row moved BETWEEN SECTIONS now earns a retry before the discard", async () => {
    // The other side of the same fixture pair, so the change of
    // behaviour is pinned rather than merely absorbed by the test
    // above. Same document, same net, different route to it.
    const err = await runExpectingFailure(
      lockedDoc(),
      MOVES_THE_LOCKED_ROW,
      MOVES_THE_LOCKED_ROW,
    );
    expect(err.capture!.stage).toBe("validate");
    expect(err.capture!.attempt).toBe("after-retry");
  });

  it("keeps the attempt honest when the retry parsed but the result was refused", async () => {
    // The combination that a single phase string cannot express: the
    // parser needed two goes AND the reconstruction refused the second
    // answer. Stage and attempt are orthogonal, and this is the case
    // that proves it.
    const err = await runExpectingFailure(lockedDoc(), UNKNOWN_ID, MOVES_THE_LOCKED_ROW);
    expect(err.capture!.stage).toBe("validate");
    expect(err.capture!.attempt).toBe("after-retry");
    expect(err.capture!.raw).toBe(MOVES_THE_LOCKED_ROW);
  });
});

describe("the success path", () => {
  it("resolves, and captures nothing anywhere", async () => {
    const { impl } = replying(KEEPS_THE_LOCK_PUT);
    const result = await runReorganize({
      doc: lockedDoc(),
      options: OPTIONS,
      instructions: "tidy this up",
      fetchImpl: impl,
    });
    expect(result.doc.sections).toHaveLength(2);
    // The non-vacuous half. "No capture on success" is true by
    // construction while the capture rides on a thrown error — but the
    // DEV log is a second site with no such guarantee, and a raw model
    // response logged on a SUCCESSFUL run is the regression worth
    // pinning: nothing would ever contradict it.
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("the transport path", () => {
  // The THIRD leg, and the one that carries the whole diagnostic point
  // of the capture: it must distinguish "the model produced bytes and
  // we rejected them" from "no model bytes ever existed". Only the
  // first is a proposal anyone can inspect. Get this wrong in the
  // permissive direction and the error state offers a copy button that
  // puts nothing, or the previous run's answer, on the clipboard —
  // evidence that is worse than none, because it looks like evidence.
  //
  // Verified by paint in the live receipt (an auth error against
  // Anthropic showed no capture row); pinned here so it stays true.
  //
  // AMENDED 2026-08-19 (streaming). The line above holds and the
  // TRUNCATION case moved sides. It used to sit with auth and network
  // under "no capture", on a stated and real objection: a cut-off
  // answer is not a proposal the model stands behind, and offering one
  // for a report invites a parser bug to be filed against a sentence
  // the model never finished writing.
  //
  // What changed is not the objection but the ability to answer it.
  // The capture now carries a third `stage`, and `stream` says exactly
  // "this is a fragment, refused by the transport, complete at
  // neither parse nor validate" — so the reader who copies it is told
  // what they are holding. The old ruling was the right one while
  // `stage` could only say `parse` or `validate`, either of which
  // WOULD have misdescribed a fragment as a rejected proposal.
  //
  // Auth and network stay on the other side, and they are the reason
  // this block still has two sides to assert: no answer ever existed,
  // so there is nothing to label.

  it("an auth failure carries no capture — there was no model output", async () => {
    const impl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    const err = await runExpectingTransportFailure(impl);
    expect(err.kind).toBe("auth");
    expect(err.capture).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("a network/CORS failure carries no capture either", async () => {
    // The shape a missing browser-access header produces: fetch throws
    // rather than answering, so there is no body to keep.
    const impl: typeof fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    const err = await runExpectingTransportFailure(impl);
    expect(err.kind).toBe("network");
    expect(err.capture).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("a truncated response DOES carry a capture, labelled as a fragment", async () => {
    // Reversed 2026-08-19 with the streaming amendment; see the block
    // comment above for why the original objection is answered rather
    // than overruled. The fact that matters is the LABEL: `stage`
    // reads `stream`, so nobody can mistake half an outline for a
    // proposal the model finished.
    const impl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "s1\n  t1" }, finish_reason: "length" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    const err = await runExpectingTransportFailure(impl);
    expect(err.kind).toBe("truncated");
    expect(err.capture).toMatchObject({ stage: "stream", raw: "s1\n  t1" });
  });
});

describe("the DEV log", () => {
  it("fires on a rejection, naming the stage", async () => {
    await runExpectingFailure(lockedDoc(), MOVES_THE_LOCKED_ROW);
    expect(warn).toHaveBeenCalled();
    const [message, payload] = warn.mock.calls[0] as [string, { stage: string }];
    expect(message).toContain("[ai]");
    expect(payload.stage).toBe("validate");
  });

  it("fires on a recovered first-attempt parse failure too", async () => {
    // A rejection the retry rescued still cost a paid call and still
    // describes a real disagreement between prompt and model. It never
    // reaches a user-facing surface — there is no error to hang it on —
    // so the DEV log is the only place it can be seen at all.
    const { impl } = replying(UNKNOWN_ID, KEEPS_THE_LOCK_PUT);
    await runReorganize({
      doc: lockedDoc(),
      options: OPTIONS,
      instructions: "tidy this up",
      fetchImpl: impl,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    const [, payload] = warn.mock.calls[0] as [string, { attempt: string }];
    expect(payload.attempt).toBe("first");
  });
});

describe("formatCapture", () => {
  it("renders a report a stranger can act on", async () => {
    const err = await runExpectingFailure(lockedDoc(), PROMOTES_THE_LOCKED_ROW);
    const text = formatCapture(err.capture!, err.message);
    expect(text).toContain("validate");
    expect(text).toContain("first attempt");
    expect(text).toContain(PROMOTES_THE_LOCKED_ROW);
    // the message is what the user saw; without it the paste is a body
    // with no complaint attached
    expect(text).toContain(err.message);
  });

  it("lists the parser's specific complaints when there were any", async () => {
    const err = await runExpectingFailure(lockedDoc(), UNKNOWN_ID, UNKNOWN_ID);
    expect(formatCapture(err.capture!, err.message)).toContain("unknown id");
  });
});
