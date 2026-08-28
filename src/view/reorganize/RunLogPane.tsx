/**
 * RunLogPane.tsx — the live tail of a run (docs/10 amendment
 * 2026-08-19).
 *
 * WHAT REPLACED WHAT. The wait state was a spinner and a seconds
 * counter, which is evidence that time is passing and evidence of
 * nothing else. The spinner and the counter survive, DEMOTED into a
 * header line; the pane is the answer arriving.
 *
 * THE LOG IS A CLAIM, so the rendering adds no interpretation. The tail
 * is the model's bytes verbatim in a monospace block; the sent block is
 * the posted request body, parsed once for readability and printed
 * whole (`formatSentPayload`, which says there what liberty it takes).
 * Nothing is summarized, sampled or reordered.
 *
 * WHAT IS COLLAPSED, AND IT SAYS SO. The sent payload is behind one
 * line carrying its own size — the live response is what a waiting user
 * came for, and a screenful of system prompt above it would bury the
 * thing that moves. Collapsed-and-says-so, the same rule the Overview
 * panel follows: the summary line states the measurement it stands in
 * for, so a reader knows what expanding would show them.
 *
 * THE RETRY MARKER IS STRUCTURAL. A second call is a second entry with
 * its own heading, because that is what the store recorded — not a
 * string synthesized by this component from a count it happened to
 * notice. Same for the fallback line, which is the transport's own
 * words passed through.
 *
 * TAIL-FOLLOW YIELDS TO THE USER. It scrolls to the bottom on new text
 * only while the view is already at the bottom; scrolling up to read
 * something stops the follow until you come back. A log that yanks the
 * viewport away mid-read is one people scroll away from and stop
 * trusting.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, RotateCw } from "lucide-react";
import { useRunLog, type RunLogCall, type RunPhase } from "@/ai/runLog";

/**
 * The state line, in words that stay true at every moment.
 *
 * `waiting` earns its own entry rather than sharing "connecting":
 * a reasoning model can emit nothing for tens of seconds after the
 * connection is open, and a still log with no word for that reads as
 * hung — which is the failure this pane exists to end, reintroduced one
 * layer up. The compatibility layer streams no thinking content, so
 * there is genuinely nothing to show during it; saying so is the whole
 * remedy available.
 */
const PHASE_WORDS: Record<RunPhase, string> = {
  connecting: "connecting",
  waiting: "waiting for the first token",
  receiving: "receiving",
  checking: "checking the proposal",
  done: "done",
};

/** chars/4, the same heuristic the payload guard uses upstream. */
function estTokens(text: string): number {
  return Math.round(text.length / 4);
}

function countLines(text: string): number {
  return text ? text.split("\n").length : 0;
}

export function RunLogPane({ model, elapsed }: { model: string; elapsed: number }) {
  const calls = useRunLog((s) => s.calls);
  const phase = useRunLog((s) => s.phase);

  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  // The tail follows only while the user has not scrolled away. Read
  // at scroll time rather than derived from a stored flag, so a resize
  // or a jump-to-bottom re-arms it without extra bookkeeping.
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const tail = calls.map((c) => c.received).join("");
  useEffect(() => {
    const el = scroller.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [tail, calls.length]);

  return (
    <div className="flex flex-col gap-2" data-testid="ai-running">
      <div className="flex items-center gap-2 text-[12px] text-neutral-600">
        <Loader2 size={13} className="shrink-0 animate-spin text-neutral-400" />
        <span className="truncate">Asking {model || "the model"}</span>
        <span className="tabular-nums text-neutral-500">{elapsed}s</span>
        {phase && (
          <span
            className="ml-auto shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600"
            data-testid="ai-log-state"
          >
            {PHASE_WORDS[phase]}
          </span>
        )}
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        data-testid="ai-run-log"
        className="h-[260px] overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5"
      >
        {calls.length === 0 && (
          <div className="text-[11px] text-neutral-500">preparing the request…</div>
        )}
        {calls.map((call, index) => (
          <CallBlock key={index} call={call} index={index} />
        ))}
      </div>
    </div>
  );
}

function CallBlock({ call, index }: { call: RunLogCall; index: number }) {
  return (
    <div className={index > 0 ? "mt-3" : undefined}>
      {call.attempt === "after-retry" && (
        <div
          className="mb-2 flex items-center gap-1.5 border-t border-neutral-200 pt-2 text-[11px] text-amber-700"
          data-testid="ai-log-retry"
        >
          <RotateCw size={11} className="shrink-0" />
          {/* Named for what it IS rather than "attempt 2": the retry is
              guided — it carries the specific complaint back — and that
              is the fact worth two paid calls. */}
          Guided retry — the first answer didn&apos;t match the outline
        </div>
      )}

      {call.requests.map((sent, i) => (
        <SentBlock key={i} sent={sent} retriedUnstreamed={i > 0} />
      ))}

      {call.notices.map((notice, i) => (
        <div
          key={i}
          className="mb-1.5 text-[11px] text-neutral-600"
          data-testid="ai-log-notice"
        >
          ⓘ {notice}
        </div>
      ))}

      {call.received && (
        <pre
          className="font-mono text-[11px] leading-[1.55] break-words whitespace-pre-wrap text-neutral-700"
          data-testid="ai-log-tail"
        >
          {call.received}
        </pre>
      )}
    </div>
  );
}

/**
 * The sent payload, collapsed behind its own measurement.
 *
 * `retriedUnstreamed` marks a SECOND request under one call — the
 * streaming fallback. It is labelled rather than hidden because two
 * requests happened and a log that showed one would be understating
 * what left the browser, which is the one thing this pane must never
 * do.
 */
function SentBlock({
  sent,
  retriedUnstreamed,
}: {
  sent: string;
  retriedUnstreamed: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-1.5">
      <button
        type="button"
        data-testid="ai-log-sent"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 rounded text-left text-[11px] text-neutral-600 hover:text-neutral-800"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span>
          {retriedUnstreamed ? "sent again, unstreamed" : "sent"} · {countLines(sent)}{" "}
          lines · ~{estTokens(sent)} tokens
        </span>
      </button>
      {open && (
        <pre
          data-testid="ai-log-sent-body"
          className="mt-1 border-l-2 border-neutral-200 pl-2 font-mono text-[11px] leading-[1.55] break-words whitespace-pre-wrap text-neutral-600"
        >
          {sent}
        </pre>
      )}
    </div>
  );
}
