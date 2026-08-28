/**
 * capture.ts — the raw model response that was REJECTED, kept long
 * enough to be looked at (docs/10 amendment 2026-08-18).
 *
 * The defect this closes is an absence: a rejected proposal threw a
 * message and dropped the bytes that caused it, so a report could say
 * "it failed" and never what the model actually said. Nothing was
 * wrong; nothing was recorded either.
 *
 * WHERE IT LIVES. On the thrown `AiError`, not in a store. The capture
 * is then scoped to the failure that produced it by construction —
 * there is no lifecycle to get wrong, no key to evict, and "never
 * captured on success" is not a rule anyone has to remember, because a
 * run that does not throw has nothing to hang a capture on. It also
 * cannot outlive the session: it is a field on an object.
 *
 * WHAT IT CARRIES. Two facts that are not one fact:
 *
 *   stage    — WHICH LAYER refused it (parse / validate / stream)
 *   attempt  — WHICH ANSWER it was (first / after the one guided retry)
 *
 * They look like one "phase" and they are orthogonal: a proposal can
 * parse on the retry and still be refused by reconstruction, which is
 * `validate` + `after-retry` and which neither field alone can say.
 * Collapsing them would be this project's house failure mode applied to
 * a diagnostic — the field that exists to localize a report being the
 * field that cannot.
 *
 * WHAT IT STORES. The BYTES, verbatim. The parser strips fences and
 * prose to find the outline; storing what it extracted would throw away
 * exactly the wrapping that is usually why the report was filed.
 */

import type { AiError } from "./contract";

/**
 * Which layer refused the response.
 *
 * `parse` spans ALL THREE of `parse.ts`'s layers, including L3 —
 * identity-strict id resolution. So an unknown or duplicate id
 * (`s99`, `t404`) is correctly `parse`, even though the response was
 * structurally readable and the complaint is semantic: `collectIdErrors`
 * runs inside `parseResponse` and its findings are what the guided
 * retry is built from. Checked against the shipped code rather than
 * assumed, because "it parsed fine, so this must be validate" is the
 * obvious wrong reading and would send a reader to the wrong module.
 *
 * `validate` is the reconstruction safety nets in `validate.ts` — a
 * proposal that resolved to real nodes and was refused anyway.
 *
 * `stream` is the transport (docs/10 amendment 2026-08-19) and it is a
 * genuinely third answer, not a tidier name for one of the others: the
 * response was refused by NEITHER layer, because it never became a
 * whole response. A mid-stream provider error, a socket that closed
 * early, an answer cut off at `finish_reason: length` — each leaves
 * bytes that used to be discarded entirely. What a `stream` capture
 * holds is a PARTIAL by definition, which is worth knowing before
 * reading one: an outline that stops mid-line is the evidence, not a
 * malformed proposal.
 */
export type CaptureStage = "parse" | "validate" | "stream";

/** Which answer it was, relative to the one guided retry. */
export type CaptureAttempt = "first" | "after-retry";

export interface ResponseCapture {
  stage: CaptureStage;
  attempt: CaptureAttempt;
  /** The model's response, exactly as received. */
  raw: string;
  /** The parser's specific complaints, when that layer produced any. */
  errors?: string[];
}

/**
 * Note a rejection for a developer watching the console.
 *
 * DEV-only, and `warn` rather than `error` on purpose: `validate.ts`
 * already logs the reason at error level right where it throws, and
 * this is the other half — the bytes it was reasoning about. Two
 * levels, two jobs. It is also the ONLY surface a recovered
 * first-attempt parse failure ever reaches, since the retry rescued it
 * and no error is thrown to carry it to the user.
 */
export function noteRejection(capture: ResponseCapture): void {
  if (!import.meta.env?.DEV) return;
  console.warn("[ai] model response rejected — raw body captured", {
    stage: capture.stage,
    attempt: capture.attempt,
    bytes: capture.raw.length,
    errors: capture.errors,
    raw: capture.raw,
  });
}

/** Attach the capture to the error that is about to be thrown, and log
 *  it. One call site per rejection, so the two can never disagree. */
export function withCapture(error: AiError, capture: ResponseCapture): AiError {
  noteRejection(capture);
  error.capture = capture;
  return error;
}

const ATTEMPT_WORDS: Record<CaptureAttempt, string> = {
  first: "first attempt",
  "after-retry": "after the guided retry",
};

/**
 * Render the capture as something a person can paste into a report.
 *
 * `message` is REQUIRED, not optional with a default. Forgetting it
 * fails silently and in the useless direction — a body with no
 * complaint attached, leaving the reader to guess which of six
 * refusals produced it, which is the exact guessing this capture
 * exists to end.
 */
export function formatCapture(capture: ResponseCapture, message: string): string {
  const lines = [
    "Fabula — rejected model response",
    `stage: ${capture.stage} (${ATTEMPT_WORDS[capture.attempt]})`,
    `bytes: ${capture.raw.length}`,
    `shown to the user: ${message}`,
  ];
  if (capture.errors?.length) {
    lines.push("", "rejected because:");
    for (const e of capture.errors) lines.push(`  - ${e}`);
  }
  lines.push("", "--- raw response ---", capture.raw);
  return lines.join("\n");
}
