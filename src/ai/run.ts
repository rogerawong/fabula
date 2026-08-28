/**
 * run.ts — The reorganization pipeline: outline → prompt → model →
 * parse → (guided retry) → reconstruct. Pure orchestration; every stage
 * is the tested module it calls.
 */

import type { TocDocument } from "@/model/types";
import { noteRejection, withCapture, type CaptureAttempt } from "./capture";
import { chatCompletion, type ChatMessage } from "./client";
import { buildConstraints, explicitViolations } from "./constraints";
import { formatSentPayload, type RunLogEvent } from "./runLog";
import { AiError, type ReorganizeOptions, type ReorganizeSummary } from "./contract";
import { buildOutline, neverEmptyGroups } from "./outline";
import { parseResponse } from "./parse";
import { nodesNeedTargets } from "./permissions";
import { buildRetryMessage, buildSystemMessage, buildUserMessage } from "./prompt";
import { getProvider } from "./providers";
import { currentKey, useAiSettings } from "./settings";
import { reconstructDocument } from "./validate";

export interface RunReorganizeArgs {
  doc: TocDocument;
  options: ReorganizeOptions;
  instructions: string;
  signal?: AbortSignal;
  /** Live narration for the dialog's log pane. A callback rather than a
   *  store import, so this module stays DOM-free and every event
   *  sequence below is a unit test. */
  onLog?: (event: RunLogEvent) => void;
  fetchImpl?: typeof fetch;
}

export async function runReorganize(
  args: RunReorganizeArgs,
): Promise<{ doc: TocDocument; summary: ReorganizeSummary }> {
  const settings = useAiSettings.getState();
  const provider = getProvider(settings.providerId);

  const outline = buildOutline(args.doc, args.options);
  if (outline.stats.estTokens > provider.contextWindow) {
    throw new AiError(
      "truncated",
      "This document is too large for the model's context window. " +
        "Reduce the scope to fewer cards or use a coarser granularity.",
    );
  }

  const scoped = args.options.scopeSectionIds !== null;
  // ONE PRODUCER, TWO CONSUMERS. The same array states the rules in the
  // system message and judges the answer below, so there is no diff
  // that enforces a constraint without communicating it (constraints.ts).
  const constraints = buildConstraints(args.doc, args.options, outline.idMap);
  const system = buildSystemMessage(
    args.options,
    scoped,
    neverEmptyGroups(args.doc, outline.idMap),
    constraints,
    nodesNeedTargets(args.doc),
  );
  const user = buildUserMessage(args.instructions, outline);
  const knownIds = new Set(outline.idMap.keys());

  const emit = args.onLog ?? (() => {});

  const call = async (
    messages: ChatMessage[],
    attempt: CaptureAttempt,
  ): Promise<string> => {
    emit({ kind: "call", attempt });
    try {
      const content = await chatCompletion({
        baseUrl: settings.baseUrl,
        apiKey: currentKey(settings),
        model: settings.model,
        messages,
        signal: args.signal,
        extraBody: provider.extraBody,
        extraHeaders: provider.extraHeaders,
        supportsTemperature: provider.supportsTemperature,
        onEvent: (event) => {
          switch (event.kind) {
            case "request":
              emit({ kind: "request", sent: formatSentPayload(event.url, event.body) });
              break;
            case "connected":
              emit({ kind: "connected" });
              break;
            case "fallback":
              emit({ kind: "notice", text: event.reason });
              break;
            case "delta":
              emit({ kind: "delta", text: event.text });
              break;
          }
        },
        fetchImpl: args.fetchImpl,
      });
      emit({ kind: "received" });
      return content;
    } catch (err) {
      throw enrich(err, attempt);
    }
  };

  const baseMessages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  let content = await call(baseMessages, "first");
  let parsed = parseResponse(content, knownIds);
  // Which answer we are holding, for the capture. Orthogonal to WHICH
  // LAYER refuses it — reconstruction can refuse the retry's answer.
  let attempt: CaptureAttempt = "first";

  /**
   * What is wrong with the answer in hand, and which layer says so.
   *
   * TWO SOURCES, ONE RETRY. Parse errors come first because a proposal
   * that did not parse has no nodes to judge; only a CLEAN parse is
   * handed to the constraint checker. The retry itself is unchanged and
   * unduplicated — the guided retry has always carried specifics, and
   * this only widens what can reach it.
   *
   * The checker is SOUND, NOT COMPLETE, on purpose: a false positive
   * would spend the one retry correcting an answer that was already
   * right. `validate.ts` remains the complete enforcer and the only
   * place a discard is decided.
   */
  const problemsIn = (
    result: typeof parsed,
  ): { stage: "parse" | "validate"; errors: string[] } =>
    result.errors.length > 0
      ? { stage: "parse", errors: result.errors }
      : {
          stage: "validate",
          errors: constraints.flatMap((c) =>
            explicitViolations(c, result.nodes, outline.idMap, args.doc),
          ),
        };

  const problems = problemsIn(parsed);
  if (problems.errors.length > 0) {
    // Rescued or not, this rejection cost a paid call and describes a
    // real disagreement between the prompt and the model. If the retry
    // succeeds there is no error to carry it, so the DEV log is the
    // only place it is ever visible.
    noteRejection({
      stage: problems.stage,
      attempt,
      raw: content,
      errors: problems.errors,
    });
    // one guided retry with the specific errors (plan Layer 3)
    attempt = "after-retry";
    content = await call(
      [
        ...baseMessages,
        { role: "assistant", content },
        { role: "user", content: buildRetryMessage(content, problems.errors) },
      ],
      attempt,
    );
    parsed = parseResponse(content, knownIds);
    if (parsed.errors.length > 0) {
      throw withCapture(
        new AiError(
          "bad-response",
          "The model couldn't produce a valid reorganization for this document. " +
            "Try again, simplify the instructions, or reduce the scope.",
        ),
        { stage: "parse", attempt, raw: content, errors: parsed.errors },
      );
    }
    // A constraint violation that SURVIVES the retry is deliberately
    // not re-checked here. `reconstructDocument` sees the finished
    // document rather than the proposal, so it is both the complete
    // enforcer and the one site that owns the discard copy — checking
    // twice would mean two messages for one refusal to keep in step.
  }

  try {
    const result = reconstructDocument({
      doc: args.doc,
      nodes: parsed.nodes,
      idMap: outline.idMap,
      options: args.options,
    });
    emit({ kind: "done" });
    return result;
  } catch (err) {
    // The safety nets throw from six sites inside `validate.ts`, none of
    // which can see the bytes — they receive parsed nodes. Enriching
    // here keeps the raw body with the failure without threading it
    // through a signature that has no other use for it. A non-AiError
    // is a genuine bug and is rethrown untouched, never dressed up as a
    // model rejection.
    if (err instanceof AiError) {
      throw withCapture(err, { stage: "validate", attempt, raw: content });
    }
    throw err;
  }
}

/**
 * Turn a transport failure into one that carries its evidence.
 *
 * A broken stream leaves BYTES — half an outline, an answer cut off at
 * the token limit — which used to be discarded because nothing had
 * anywhere to put them. `client.ts` attaches them to the error as
 * `partial`; it knows the bytes but not which attempt produced them,
 * and this function knows the attempt but never sees a `Response`.
 *
 * USER CANCEL IS NOT A FAILURE, and this is the one place that rule is
 * enforced. An aborted call arrives here carrying its partial exactly
 * like a broken one — the client does not special-case it, deliberately,
 * so this guard has something real to decline rather than being a
 * comment over a branch that never fires. Nothing was rejected, nobody
 * needs evidence, and a capture row offering to copy the bytes of a
 * request the user themselves stopped would be inviting a bug report
 * about a working feature.
 */
function enrich(err: unknown, attempt: CaptureAttempt): unknown {
  if (!(err instanceof AiError)) return err;
  if (err.kind === "aborted") return err;
  if (!err.partial) return err;
  return withCapture(err, { stage: "stream", attempt, raw: err.partial });
}
