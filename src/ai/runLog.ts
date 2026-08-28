/**
 * runLog.ts — the live tail of a reorganize run (docs/10 amendment
 * 2026-08-19).
 *
 * WHY IT EXISTS. The wait dialog showed a spinner and a seconds
 * counter: no evidence the model was doing anything, and two true
 * things invisible. The privacy claim — titles only, sent on Run —
 * was a sentence in the footer rather than something a user could
 * watch happen. And the guided retry was a second paid call nobody
 * ever saw. Both become visible here.
 *
 * THE LOG IS A CLAIM. What it shows is what was sent and what came
 * back, not a summary of either. The one liberty taken is FRAMING, and
 * it says so at the point it takes it: `formatSentPayload` parses the
 * exact request body the client posted and prints the message contents
 * verbatim under role headings, because a JSON string with every
 * newline escaped is unreadable for precisely the audience this pane
 * exists for. It is derived from the bytes that left, never assembled
 * a second time from the same intent — a rendering built beside the
 * real one drifts, and a drifted log is worse than no log.
 *
 * ONE CALL, POSSIBLY TWO REQUESTS. `call` and `request` are separate
 * events for a reason that is not tidiness: a 400 fallback makes one
 * call issue two requests (streamed, then not), and the guided retry
 * makes one run issue two calls. Merged, neither shape is expressible.
 * The retry marker is therefore STRUCTURAL — a second `call` entry —
 * rather than a synthesized string somebody has to keep true.
 *
 * IT VANISHES ON SUCCESS (ruled). The store is transient and lives
 * outside the main app store, like every other high-frequency surface
 * in this project: a delta arrives dozens of times a second and must
 * not re-render the canvas.
 */

import { create } from "zustand";
import type { ChatMessage } from "./client";
import type { CaptureAttempt } from "./capture";

/** What a run reports as it happens. Ordered; the pane renders in
 *  arrival order and derives nothing the producer did not state. */
export type RunLogEvent =
  /** A model call begins. `attempt` is the guided-retry position. */
  | { kind: "call"; attempt: CaptureAttempt }
  /** Bytes went out. Two of these under one `call` means a fallback. */
  | { kind: "request"; sent: string }
  /** The response body is an event stream. */
  | { kind: "connected" }
  /** Text arrived. */
  | { kind: "delta"; text: string }
  /** Something happened that is neither progress nor failure. */
  | { kind: "notice"; text: string }
  /** This call's answer is complete; parse and validate are next. */
  | { kind: "received" }
  /** The whole run succeeded. */
  | { kind: "done" };

/**
 * The state line, and every value it can truthfully hold.
 *
 * `waiting` is not decoration. A reasoning model emits nothing for
 * tens of seconds after connecting, and a still log with no word for
 * that state reads as hung — which is the failure this whole pane was
 * built to end, reintroduced one layer up.
 */
export type RunPhase = "connecting" | "waiting" | "receiving" | "checking" | "done";

export interface RunLogCall {
  attempt: CaptureAttempt;
  /** One entry per request this call made; two means a fallback. */
  requests: string[];
  /** The answer as it arrives. */
  received: string;
  notices: string[];
}

interface RunLogState {
  calls: RunLogCall[];
  /** null when no run is in flight. */
  phase: RunPhase | null;
  apply: (event: RunLogEvent) => void;
  /** Clear — on a new run, and on success, where the log vanishes. */
  reset: () => void;
}

function patchLast(
  calls: RunLogCall[],
  update: (call: RunLogCall) => RunLogCall,
): RunLogCall[] {
  if (calls.length === 0) return calls;
  return [...calls.slice(0, -1), update(calls[calls.length - 1]!)];
}

export const useRunLog = create<RunLogState>((set) => ({
  calls: [],
  phase: null,

  apply: (event) =>
    set((s) => {
      switch (event.kind) {
        case "call":
          return {
            calls: [
              ...s.calls,
              { attempt: event.attempt, requests: [], received: "", notices: [] },
            ],
            phase: "connecting",
          };
        case "request":
          return {
            calls: patchLast(s.calls, (c) => ({
              ...c,
              requests: [...c.requests, event.sent],
            })),
          };
        case "connected":
          return { phase: "waiting" };
        case "delta":
          return {
            calls: patchLast(s.calls, (c) => ({
              ...c,
              received: c.received + event.text,
            })),
            // DERIVED here rather than reported by the transport: the
            // client states facts ("this text arrived"), and what that
            // means for a state line is this layer's business.
            phase: "receiving",
          };
        case "notice":
          return {
            calls: patchLast(s.calls, (c) => ({
              ...c,
              notices: [...c.notices, event.text],
            })),
          };
        case "received":
          return { phase: "checking" };
        case "done":
          return { phase: "done" };
      }
    }),

  reset: () => set({ calls: [], phase: null }),
}));

/**
 * Render a posted request body as something a person can read.
 *
 * Takes the EXACT bytes the client handed to `fetch`, so the pane
 * cannot disagree with the wire. Message contents are printed verbatim
 * under role headings; every other body parameter becomes one
 * `key=value` header line, so nothing in the payload is hidden by
 * being inconvenient to show.
 *
 * A body that will not parse is returned as-is. The log's whole value
 * is that it does not editorialize, and an unreadable body is a fact
 * about the run rather than an error in the pane.
 */
export function formatSentPayload(url: string, body: string): string {
  let parsed: { messages?: ChatMessage[] } & Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    return `POST ${url}\n\n${body}`;
  }
  const { messages, ...params } = parsed;
  const paramLine = Object.entries(params)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ");

  const lines = [`POST ${url}`, paramLine].filter(Boolean);
  for (const message of messages ?? []) {
    lines.push("", `── ${message.role} ──`, message.content);
  }
  return lines.join("\n");
}
