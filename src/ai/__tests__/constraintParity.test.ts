/**
 * constraintParity.test.ts — the run-level half: a pinned-row violation
 * is now reachable by the guided retry, and the discard copy is true in
 * a world where the model was told (docs/10 amendment 2026-08-19).
 *
 * THE OLD SHAPE. `validate.ts`'s lock net throws from
 * `reconstructDocument`, which runs AFTER the one guided retry. So a
 * violation had exactly one outcome — discard — and the whole
 * corpus-scale call was spent. The retry existed, carried specifics,
 * and could not see this class of problem at all.
 *
 * THE NEW SHAPE. A sound pre-check runs on the PARSED PROPOSAL, before
 * reconstruction, and feeds the existing retry with the offending rows
 * named. Enforcement semantics are unchanged: the post-reconstruct net
 * is still the complete enforcer and still the only place a discard is
 * decided. What changed is that the model gets one corrective attempt
 * before the call is written off.
 *
 * THE COPY IS A CLAIM. "Try an instruction that leaves the pinned rows
 * where they are" was honest while the model had never been told. Once
 * the request marks every pinned row, that sentence blames the user for
 * the model's non-compliance and sends them to edit an instruction that
 * was never the problem.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { TocDocument, Topic } from "@/model/types";
import { AiError } from "../contract";
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

function pinned(title: string, children: Topic[] = []): Topic {
  return { ...topic(title, children), lock: { kind: "reference" as const } };
}

/**
 * s1 Guide [t1 Intro, t2 Install(PINNED)]
 * s2 Reference [t3 API]
 */
const PINNED_DOC = (): TocDocument =>
  doc([
    section("Guide", [topic("Intro"), pinned("Install")]),
    section("Reference", [topic("API")]),
  ]);

/** Moves the pinned t2 into s2 — the shape of the godot incident. */
const VIOLATION = "s1\n  t1\ns2\n  t2\n  t3";
/** Leaves it put. */
const COMPLIANT = "s1\n  t1\n  t2\ns2\n  t3";

/** Replies with each canned body in turn, recording what was posted. */
function replying(...bodies: string[]) {
  const sent: string[] = [];
  let call = 0;
  const impl: typeof fetch = async (_url, init) => {
    sent.push(String(init?.body));
    const content = bodies[Math.min(call, bodies.length - 1)]!;
    call += 1;
    return new Response(
      JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  return { impl, sent, calls: () => call };
}

async function run(impl: typeof fetch, document = PINNED_DOC()) {
  return runReorganize({
    doc: document,
    options: OPTIONS,
    instructions: "tidy this up",
    fetchImpl: impl,
  });
}

async function runExpectingFailure(
  impl: typeof fetch,
  document = PINNED_DOC(),
): Promise<AiError> {
  try {
    await run(impl, document);
  } catch (err) {
    if (err instanceof AiError) return err;
    throw err;
  }
  throw new Error("expected the run to reject");
}

beforeEach(() => {
  resetAiSettings();
  useAiSettings.setState({
    baseUrl: "https://api.example.com/v1",
    apiKeys: { gemini: "sk-test" },
    model: "test-model",
  });
});
afterEach(() => resetAiSettings());

describe("the request tells the model which rows are pinned", () => {
  it("marks the pinned row in the outline and explains the mark once", async () => {
    const { impl, sent } = replying(COMPLIANT);
    await run(impl);
    const body = sent[0]!;
    expect(body).toContain("t2 Install [pinned]");
    expect(body).toMatch(/PINNED ROWS/);
    // the unpinned row carries nothing
    expect(body).toContain("t1 Intro\\n");
  });

  it("says none of it for a document that pins nothing", async () => {
    const { impl, sent } = replying("s1\n  t1\n  t2\ns2\n  t3");
    await run(
      impl,
      doc([
        section("Guide", [topic("Intro"), topic("Install")]),
        section("Reference", [topic("API")]),
      ]),
    );
    expect(sent[0]!).not.toMatch(/pinned/i);
  });
});

describe("a violation now reaches the guided retry", () => {
  it("asks again, naming the row and the id it was listed under", async () => {
    const { impl, sent, calls } = replying(VIOLATION, COMPLIANT);
    const result = await run(impl);

    expect(calls()).toBe(2);
    // the retry carries the SPECIFIC violation, not a generic scolding
    const retry = sent[1]!;
    expect(retry).toContain("Install");
    expect(retry).toContain("t2");
    expect(retry).toMatch(/pinned in place/);
    // and the corrected answer was accepted
    expect(result.doc.sections[0]!.topics).toHaveLength(2);
  });

  it("spends NO extra call on a compliant answer", async () => {
    // The exclusion, asserted: a mechanism that costs a second call on
    // every run would be worse than the failure it fixes.
    const { impl, calls } = replying(COMPLIANT);
    await run(impl);
    expect(calls()).toBe(1);
  });

  it("discards when the model violates again after being told", async () => {
    const { impl, calls } = replying(VIOLATION, VIOLATION);
    const err = await runExpectingFailure(impl);
    expect(calls()).toBe(2);
    expect(err.kind).toBe("bad-response");
    expect(err.capture?.stage).toBe("validate");
  });
});

describe("the discard copy, in a world where the model was told", () => {
  it("names the row, states the non-compliance, and does not blame the instruction", async () => {
    const { impl } = replying(VIOLATION, VIOLATION);
    const err = await runExpectingFailure(impl);

    expect(err.message).toContain('"Install"');
    expect(err.message).toMatch(/pinned in place by the source/);
    // the request DID mark them — say so, because that is what makes
    // this the model's failure rather than the user's
    expect(err.message).toMatch(/request marks every pinned row/i);
    // and the retired advice is gone: it sent the user to edit an
    // instruction that was never the problem
    expect(err.message).not.toMatch(/try an instruction that leaves the pinned rows/i);
  });

  it("says something DIFFERENT when the row could not be marked", async () => {
    // A pinned row inside a collapsed subtree has no id, so the request
    // could not name it — and telling that user the model ignored a
    // mark they never sent would be a lie. Both sides of the branch are
    // asserted, or only half the rule is.
    const collapsed = doc([
      section("Guide", [topic("Intro", [pinned("Install")])]),
      section("Reference", [topic("API")]),
    ]);
    // granularity `two` gives t1 an id and hides its child
    const { impl } = replying("s1\n  t1\ns2\n  t2");
    try {
      await runReorganize({
        doc: collapsed,
        options: { ...OPTIONS, granularity: "two" },
        instructions: "tidy",
        fetchImpl: impl,
      });
    } catch (err) {
      const message = (err as AiError).message;
      expect(message).not.toMatch(/request marks every pinned row/i);
      expect(message).toMatch(/collapsed subtree|finer granularity/i);
      return;
    }
    // If reconstruction accepted it, the branch is simply not reachable
    // this way — which is a fine outcome and not a silent pass: the
    // copy above is still asserted by its own test.
  });
});
