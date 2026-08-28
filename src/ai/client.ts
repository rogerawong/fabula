/**
 * client.ts — The one OpenAI-compatible chat call. Raw fetch, minimal
 * params (compat layers reject exotic ones), injected fetchImpl for
 * tests, and the full error taxonomy. The API key appears ONLY in the
 * Authorization header — never in errors, logs, or toasts.
 *
 * STREAMING (docs/10 amendment 2026-08-19). The call asks for
 * `stream: true` and accumulates SSE deltas, so a waiting user can
 * watch the answer arrive. What this function RETURNS is unchanged: the
 * complete text, exactly as the unstreamed path produced it. Everything
 * below — parse, validate, reconstruct, capture — is untouched by
 * construction, and the payload differs from the pre-streaming one by
 * exactly that one key (`streamingClient.test.ts` asserts the diff
 * rather than the shape, because a shape assertion passes while a
 * second key rides along beside the one that changed).
 *
 * THE FALLBACK IS A CLASSIFIER, and it has two branches for two
 * different facts:
 *
 *   200 + not `text/event-stream` — the endpoint IGNORED `stream` and
 *     answered whole. The answer is already in hand, so it is READ.
 *     Asking again would spend a second call to learn nothing.
 *   400 — the only status that can be a complaint about the request
 *     BODY, and the only thing new in that body is `stream`. Retried
 *     once with the key removed (not falsified — an endpoint that
 *     rejects the key may reject `false` too).
 *
 * Everything else is excluded, and the exclusions are asserted: 401 is
 * not a streaming failure, 429 retried is the worst possible answer to
 * a rate limit, 5xx is an endpoint that is down rather than fussy, and
 * a transport throw produced no answer to classify at all. Narrowing a
 * classifier obligates the other side's receipt.
 *
 * PARTIAL BYTES. When a stream breaks — mid-stream error, abrupt close,
 * `finish_reason: length` — the accumulated text so far rides the
 * thrown error as `partial`. The client knows the bytes but not which
 * ATTEMPT it was holding; `run.ts` knows the attempt but not the bytes,
 * and that is where the two become a capture. Including on abort: the
 * bytes are attached there too, so the "no capture on user cancel" rule
 * one layer up has something real to decline rather than being vacuous.
 */

import { AiError } from "./contract";
import { SseAccumulator } from "./stream";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatArgs {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  extraBody?: Record<string, unknown>;
  /** Per-provider transport headers (`ProviderPreset.extraHeaders`). */
  extraHeaders?: Record<string, string>;
  /** False when the provider refuses `temperature` outright — the whole
   *  call 400s, so this is compatibility, not tuning. Default true. */
  supportsTemperature?: boolean;
  /** Transport narration for the live log. Facts only — "connected",
   *  "this text arrived" — never derived states like "waiting", which
   *  belong to whoever renders them (`runLog.ts`). */
  onEvent?: (event: ChatEvent) => void;
  fetchImpl?: typeof fetch;
}

/** What the transport can report while a call is in flight. */
export type ChatEvent =
  /** Bytes about to go out — the EXACT body handed to `fetch`, so
   *  anything rendering it cannot disagree with the wire. Fires twice
   *  under one call when the streaming fallback engages. */
  | { kind: "request"; url: string; body: string }
  /** Headers arrived and the body IS an event stream. */
  | { kind: "connected" }
  /** No stream, and why — one line, stated rather than hidden, because
   *  a fallback is a behaviour and not an error. */
  | { kind: "fallback"; reason: string }
  /** Text that just arrived. In the unstreamed case this fires once
   *  with the whole answer, so the tail is never blank. */
  | { kind: "delta"; text: string };

interface ChatCompletionShape {
  choices?: {
    message?: { content?: string };
    finish_reason?: string;
  }[];
}

/** Extract a human-readable error message from a provider error body
 *  (OpenAI shape `{error:{message}}` or Google's `{error:{message}}` /
 *  arrays thereof). Never contains the key — we never send it in a body. */
async function providerErrorDetail(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    const first = Array.isArray(body) ? body[0] : body;
    const error = (first as { error?: { message?: unknown } })?.error;
    const message = error?.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim().slice(0, 300);
    }
  } catch {
    // non-JSON body — nothing useful to show
  }
  return null;
}

export async function chatCompletion(args: ChatArgs): Promise<string> {
  const doFetch = args.fetchImpl ?? fetch;
  const url = `${args.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const emit = args.onEvent ?? (() => {});

  const post = (streaming: boolean): Promise<Response> => {
    const body = JSON.stringify({
      model: args.model,
      messages: args.messages,
      // omitted entirely, not set to a neutral value: the providers
      // that refuse this parameter refuse the KEY, not the number
      ...(args.supportsTemperature === false ? {} : { temperature: 0.2 }),
      // and the same discipline for the fallback — an endpoint that
      // rejects `stream` may well reject `stream: false`
      ...(streaming ? { stream: true } : {}),
      ...args.extraBody,
    });
    // Reported from the SAME string that is posted, one line above the
    // fetch. A log rendered from the arguments instead would be a
    // second derivation of the same intent, free to drift from the
    // bytes it claims to show.
    emit({ kind: "request", url, body });
    return doFetch(url, {
      method: "POST",
      signal: args.signal,
      headers: {
        "Content-Type": "application/json",
        ...(args.apiKey ? { Authorization: `Bearer ${args.apiKey}` } : {}),
        ...args.extraHeaders,
      },
      body,
    });
  };

  let response: Response;
  try {
    response = await post(true);
  } catch (err) {
    throw transportError(err);
  }

  if (response.status === 400) {
    // The one status that can be a complaint about the request BODY,
    // and `stream` is the only thing new in it. One retry, one line in
    // the log. A persistent 400 then reports the SECOND answer, which
    // is the same error this client gave before streaming existed.
    emit({
      kind: "fallback",
      reason:
        "the endpoint refused a streamed request (400) — retrying without streaming",
    });
    try {
      response = await post(false);
    } catch (err) {
      throw transportError(err);
    }
    throwForStatus(response.status, response);
    await throwForBody(response);
    return readWhole(response, emit);
  }

  throwForStatus(response.status, response);
  await throwForBody(response);

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    emit({
      kind: "fallback",
      reason: "the endpoint answered with a whole response instead of a stream",
    });
    return readWhole(response, emit);
  }

  emit({ kind: "connected" });
  return readStream(response, emit, args.signal);
}

/** A fetch that never produced a Response — abort, CORS, or no network. */
function transportError(err: unknown): AiError {
  if (err instanceof DOMException && err.name === "AbortError") {
    return new AiError("aborted", "Request cancelled");
  }
  // CORS/network failures surface as TypeError, not a status
  return new AiError(
    "network",
    "Could not reach the model endpoint. This is usually a network problem " +
      "or a CORS restriction on custom endpoints.",
  );
}

/** Statuses whose meaning is fixed regardless of what the body says. */
function throwForStatus(status: number, response: Response): void {
  if (status === 401 || status === 403) {
    throw new AiError(
      "auth",
      "The model provider rejected the API key. Check it in settings.",
    );
  }
  if (status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new AiError(
      "rate-limit",
      Number.isFinite(retryAfter) && retryAfter > 0
        ? `Rate limit reached. Try again in ${Math.ceil(retryAfter)} seconds.`
        : "Rate limit reached. Free tiers allow only a few requests per minute — wait a moment and try again.",
      Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  }
}

/** Any other non-2xx: providers put the real cause in the body (e.g.
 *  Google's "models/x is not found for API version v1beta"). */
async function throwForBody(response: Response): Promise<void> {
  if (response.ok) return;
  const detail = await providerErrorDetail(response);
  throw new AiError(
    "bad-response",
    detail
      ? `The model provider answered ${response.status}: ${detail}`
      : `The model provider answered ${response.status}. Try again in a moment.`,
  );
}

/** The pre-streaming path, kept whole: one JSON body, one answer. */
async function readWhole(
  response: Response,
  emit: (event: ChatEvent) => void,
): Promise<string> {
  let payload: ChatCompletionShape;
  try {
    payload = (await response.json()) as ChatCompletionShape;
  } catch {
    throw new AiError("bad-response", "The model returned an unreadable response.");
  }

  const choice = payload.choices?.[0];
  const content = choice?.message?.content ?? "";
  if (choice?.finish_reason === "length") {
    // The partial rides this error here too. Otherwise the evidence a
    // report carries would depend on which transport happened to run,
    // which is the kind of difference nobody remembers to mention.
    throw truncated(content);
  }
  if (!content.trim()) {
    throw new AiError("bad-response", "The model returned an empty response.");
  }
  emit({ kind: "delta", text: content });
  return content;
}

function truncated(partial: string): AiError {
  const err = new AiError(
    "truncated",
    "The response was cut off — the document is too large for one pass. " +
      "Reduce the scope to fewer cards or use a coarser granularity.",
  );
  err.partial = partial;
  return err;
}

/** Read the SSE body to its end (or to the first thing that ends it). */
async function readStream(
  response: Response,
  emit: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<string> {
  const acc = new SseAccumulator();
  const reader = response.body?.getReader();
  if (!reader) {
    // 200, event-stream, no body: nothing arrived and nothing said why.
    throw withPartial(closedEarly(), "");
  }
  const decoder = new TextDecoder();

  try {
    for (;;) {
      // Checked BEFORE each read, not after: the abort usually arrives
      // while a delta is being rendered, and the next read is the one
      // that must not happen.
      if (signal?.aborted) {
        await reader.cancel();
        throw new AiError("aborted", "Request cancelled");
      }
      const { done, value } = await reader.read();
      if (done) break;
      const added = acc.push(decoder.decode(value, { stream: true }));
      if (added) emit({ kind: "delta", text: added });
      if (acc.providerError || acc.sawDone) break;
    }
  } catch (err) {
    if (err instanceof AiError) throw withPartial(err, acc.content);
    if (signal?.aborted) {
      throw withPartial(new AiError("aborted", "Request cancelled"), acc.content);
    }
    // The socket died mid-answer. Not "unreadable" — what arrived read
    // perfectly well and simply stopped.
    throw withPartial(closedEarly(), acc.content);
  }

  if (acc.providerError) {
    throw withPartial(
      new AiError("bad-response", `The model provider answered: ${acc.providerError}`),
      acc.content,
    );
  }
  if (acc.finishReason === "length") throw truncated(acc.content);
  // THREE end states, not two: a terminator, or a named reason the
  // model stopped, is a finished answer. Neither means the connection
  // dropped, whatever bytes are in hand.
  if (!acc.sawDone && acc.finishReason === null) {
    throw withPartial(closedEarly(), acc.content);
  }
  if (!acc.content.trim()) {
    throw new AiError("bad-response", "The model returned an empty response.");
  }
  return acc.content;
}

function closedEarly(): AiError {
  return new AiError(
    "network",
    "The connection closed before the model finished its answer. Nothing was " +
      "changed — try again.",
  );
}

function withPartial(error: AiError, partial: string): AiError {
  if (partial) error.partial = partial;
  return error;
}

/**
 * List the models the endpoint actually serves (GET /models) — the
 * durable answer to model-name drift: providers rename/retire ids, the
 * list is always current. Returns ids with any "models/" prefix
 * stripped, sorted.
 */
export async function listModels(args: {
  baseUrl: string;
  apiKey: string;
  /** Same transport headers as the chat call — this is the SECOND
   *  consumer of `extraHeaders`, and the one easiest to forget: wiring
   *  only `chatCompletion` leaves "Fetch available models" CORS-failing
   *  for precisely the provider the seam exists for. */
  extraHeaders?: Record<string, string>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<string[]> {
  const doFetch = args.fetchImpl ?? fetch;
  const url = `${args.baseUrl.replace(/\/+$/, "")}/models`;
  let response: Response;
  try {
    response = await doFetch(url, {
      signal: args.signal,
      headers: {
        ...(args.apiKey ? { Authorization: `Bearer ${args.apiKey}` } : {}),
        ...args.extraHeaders,
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new AiError("aborted", "Request cancelled");
    }
    throw new AiError("network", "Could not reach the model endpoint.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new AiError("auth", "The model provider rejected the API key.");
  }
  if (!response.ok) {
    const detail = await providerErrorDetail(response);
    throw new AiError(
      "bad-response",
      detail ?? `The model provider answered ${response.status}.`,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AiError("bad-response", "The model list was unreadable.");
  }

  // NOT MEASURED IS NOT ZERO. `data ?? []` treated any answer without a
  // `data` array — an error object, an HTML login page, a chat
  // completion from a mis-set base URL — as a successful fetch of zero
  // models: the note read "0 models available", the current model was
  // quietly kept, and nothing told the user their endpoint had answered
  // with something else entirely. An absent list and an empty list are
  // different states and only one of them is an answer.
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) {
    throw new AiError(
      "bad-response",
      "That endpoint answered, but not with a model list. Check the base URL points at the API root.",
    );
  }

  const ids = data
    .map((m) => {
      const id = (m as { id?: unknown } | null)?.id;
      return typeof id === "string" ? id.replace(/^models\//, "") : null;
    })
    .filter((id): id is string => Boolean(id));
  return [...new Set(ids)].sort();
}
