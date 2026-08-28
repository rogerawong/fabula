/**
 * ReorganizeDialog.tsx — "Reorganize with AI" (see the approved plan).
 * Single-column dialog with swapped bodies: configure → running →
 * result | error, plus a settings subview behind the gear. Results
 * ONLY ever open as a new tab; Escape/backdrop abort in-flight
 * requests; AbortError is swallowed (zero-console rule).
 */

import { useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy, Settings2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { formatCapture, type CaptureStage } from "@/ai/capture";
import { AiError, type ReorganizeSummary } from "@/ai/contract";
import { PRESETS } from "@/ai/presets";
import { getProvider } from "@/ai/providers";
import { runReorganize } from "@/ai/run";
import { useRunLog } from "@/ai/runLog";
import { currentKey, useAiSettings } from "@/ai/settings";
import type { TocDocument } from "@/model/types";
import { selectActiveTab, useAppStore } from "@/store";
import { provenanceTabName, type TabProvenance } from "@/store/provenance";
import { useUiStore } from "@/view/uiStore";
import { aspirationalSplitText } from "./aspirationalSplit";
import {
  ConfigureView,
  configOptions,
  initialConfig,
  type ReorganizeConfig,
} from "./ConfigureView";
import { RunLogPane } from "./RunLogPane";
import { SettingsView } from "./SettingsView";

type View = "configure" | "settings" | "running" | "result" | "error";

export function ReorganizeDialog() {
  const open = useUiStore((s) => s.aiDialogOpen);
  const setOpen = useUiStore((s) => s.setAiDialogOpen);
  const tab = useAppStore(selectActiveTab);
  const configured = useAiSettings((s) => Boolean(currentKey(s) && s.model && s.baseUrl));

  const [view, setView] = useState<View>("configure");
  const [config, setConfig] = useState<ReorganizeConfig>(() => initialConfig([]));
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{
    doc: TocDocument;
    summary: ReorganizeSummary;
  } | null>(null);
  const [error, setError] = useState<AiError | null>(null);
  /** Snapshotted when the run STARTS, not when the tab opens: what is
   *  being recorded is the run that produced this document, and
   *  settings can change while it is in flight. */
  const [provenance, setProvenance] = useState<TabProvenance | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // (re)seed on open: scope from the canvas selection — a multi-card
  // selection checks every selected card
  useEffect(() => {
    if (!open) return;
    const active = selectActiveTab(useAppStore.getState());
    // SEEDED FROM THE TAB, not from a device store (docs/21,
    // re-decision 5): the value comes from the tab in front of the
    // user, which already wears its state in its chrome.
    setConfig(
      initialConfig(
        active?.selectedSectionIds ?? [],
        active?.aspirational ? "aspirational" : "grounded",
      ),
    );
    setView("configure");
    setResult(null);
    setError(null);
    useRunLog.getState().reset();
  }, [open]);

  // elapsed counter while running
  useEffect(() => {
    if (view !== "running") return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [view]);

  const close = () => {
    abortRef.current?.abort();
    setOpen(false);
  };

  // Escape: abort when running, otherwise close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close is stable enough
  }, [open]);

  if (!open || !tab) return null;
  const doc = tab.editor.document;
  const model = useAiSettings.getState().model;

  const runnable =
    configured &&
    doc.sections.length > 0 &&
    (config.scopeMode === "all" || config.checkedIds.length > 0) &&
    config.instructions.trim().length > 0;

  const run = () => {
    const abort = new AbortController();
    abortRef.current = abort;
    const settings = useAiSettings.getState();
    const preset = PRESETS.find((p) => p.id === config.presetId);
    setProvenance({
      kind: "ai-reorganize",
      providerId: settings.providerId,
      providerLabel: getProvider(settings.providerId).label,
      model: settings.model,
      presetId: config.presetId,
      presetName: preset?.label ?? config.presetId,
      // WHAT THE RUN WAS, immutably. The tab's STATE may be switched
      // later by a gesture; this never changes, which is the whole
      // reason the two are different fields in different types
      // (docs/21, Decision 7).
      mode: config.mode,
      at: new Date().toISOString(),
    });

    setView("running");
    setError(null);
    // The log belongs to ONE run. Cleared at the start of each, so a
    // retry never shows the previous attempt's tail underneath its own.
    useRunLog.getState().reset();

    runReorganize({
      doc,
      options: configOptions(config, doc),
      instructions: config.instructions,
      signal: abort.signal,
      onLog: (event) => useRunLog.getState().apply(event),
    })
      .then((res) => {
        setResult(res);
        setView("result");
        // RULED: the log vanishes on success. Cleared on the failure
        // path too — the capture is the record there — so the store is
        // never left holding a finished run nothing is rendering, which
        // is exactly the lifecycle the capture avoids by riding an error.
        useRunLog.getState().reset();
      })
      .catch((err: unknown) => {
        useRunLog.getState().reset();
        if (err instanceof AiError && err.kind === "aborted") {
          // A cancel is not a failure: back to where they were, no tab,
          // no error surface, and no capture (enforced in `run.ts`).
          setView("configure");
          return;
        }
        setError(
          err instanceof AiError
            ? err
            : new AiError("bad-response", "Something went wrong. Please try again."),
        );
        setView("error");
      });
  };

  const openAsTab = () => {
    if (!result) return;
    // The name is SEEDED from the provenance and belongs to the user
    // afterwards; the provenance is the durable fact and survives every
    // rename (`store/provenance.ts`).
    useAppStore.getState().openDocument(result.doc, {
      name: provenance
        ? provenanceTabName(tab.name, provenance)
        : `${tab.name} (reorganized)`,
      ...(provenance ? { provenance } : {}),
    });
    toast.success("Reorganization opened as a new tab — keep it or close it.");
    close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reorganize with AI"
        data-testid="ai-dialog"
        className="flex max-h-[85vh] w-[520px] flex-col rounded-xl border border-neutral-200 bg-white shadow-xl"
      >
        <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-3">
          <Sparkles size={15} className="text-neutral-500" />
          <h2 className="text-[15px] font-semibold text-neutral-800">
            Reorganize with AI
          </h2>
          <div className="ml-auto flex items-center gap-1">
            {view === "configure" && (
              <button
                type="button"
                aria-label="Model settings"
                data-testid="ai-open-settings"
                className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                onClick={() => setView("settings")}
              >
                <Settings2 size={15} />
              </button>
            )}
            <button
              type="button"
              aria-label="Close dialog"
              className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
              onClick={close}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {view === "configure" && (
            <ConfigureView
              doc={doc}
              config={config}
              onChange={(partial) => setConfig((c) => ({ ...c, ...partial }))}
              onOpenSettings={() => setView("settings")}
              configured={configured}
            />
          )}
          {view === "settings" && <SettingsView onBack={() => setView("configure")} />}
          {view === "running" && (
            <div className="flex flex-col gap-3">
              <RunLogPane model={model} elapsed={elapsed} />
              <div className="flex items-center">
                <span className="mr-auto text-[11px] text-neutral-500">
                  🔒 Titles only — the sent block above is the whole request.
                </span>
                <button
                  type="button"
                  data-testid="ai-cancel"
                  className="rounded-md border border-neutral-300 px-3 py-1 text-[13px] text-neutral-600 hover:bg-neutral-50"
                  onClick={() => abortRef.current?.abort()}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {view === "result" && result && (
            <ResultView summary={result.summary} docBefore={doc} />
          )}
          {view === "error" && error && (
            <div className="py-4" data-testid="ai-error">
              <div className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] leading-relaxed text-red-700">
                {error.message}
              </div>
              {error.capture && <CaptureRow error={error} />}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-[13px] text-neutral-600 hover:bg-neutral-50"
                  onClick={() =>
                    setView(error.kind === "auth" ? "settings" : "configure")
                  }
                >
                  ← Back {error.kind === "auth" ? "to settings" : ""}
                </button>
                <button
                  type="button"
                  className="rounded-md bg-neutral-800 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-700"
                  onClick={run}
                >
                  Retry
                </button>
              </div>
            </div>
          )}
        </div>

        {(view === "configure" || view === "result") && (
          <div className="flex items-center gap-2 border-t border-neutral-100 px-5 py-3">
            <span className="mr-auto text-[11px] text-neutral-400">
              🔒 Topic titles are sent to the model only when you press Run.
            </span>
            {view === "configure" ? (
              <>
                <button
                  type="button"
                  className="rounded-md px-3 py-1.5 text-[13px] text-neutral-500 hover:bg-neutral-100"
                  onClick={close}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="ai-run"
                  disabled={!runnable}
                  className="flex items-center gap-1.5 rounded-md bg-neutral-800 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
                  onClick={run}
                >
                  <Sparkles size={13} /> Run
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="rounded-md px-3 py-1.5 text-[13px] text-neutral-500 hover:bg-neutral-100"
                  onClick={close}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="rounded-md px-3 py-1.5 text-[13px] text-neutral-500 hover:bg-neutral-100"
                  onClick={() => setView("configure")}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  data-testid="ai-open-tab"
                  className="rounded-md bg-neutral-800 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-700"
                  onClick={openAsTab}
                >
                  ⧉ Open as new tab
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The rejected model response, offered for a bug report.
 *
 * Shown only when a capture exists — a transport failure (auth, rate
 * limit, no network) has no model output, and a copy button promising
 * one there would be a claim the clipboard then contradicts.
 *
 * The stage and attempt are rendered as well as copied: a reader who
 * never presses the button can still say which layer refused it and
 * whether the retry had already been spent, which is most of what
 * localizes a report.
 */
/**
 * What each refusing layer is called, in the user's words.
 *
 * A RECORD rather than a ternary: adding a stage to `CaptureStage` must
 * fail `pnpm check` here, because a message is DATA and no test fails
 * when one is missing — the same reason this project keeps its command
 * switches exhaustive. The `stream` entry is why the rule earned its
 * keep: it arrived after the ternary was written, and the ternary's
 * `else` would have described a fragment as a refused result.
 */
const STAGE_WORDS: Record<CaptureStage, string> = {
  // NOT "unreadable reply": the commonest parse rejection is an unknown
  // id, where the reply read perfectly well and simply named something
  // that is not in the outline. Calling that unreadable sends the
  // reporter looking for mojibake.
  parse: "reply didn't match the outline",
  validate: "result was refused",
  // Says FRAGMENT, because that is what a stream capture holds — an
  // outline that stops mid-line, not a proposal the model finished.
  stream: "answer arrived incomplete",
};

function CaptureRow({ error }: { error: AiError }) {
  const capture = error.capture;
  const [copied, setCopied] = useState(false);
  if (!capture) return null;

  const copy = async () => {
    const text = formatCapture(capture, error.message);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard is unavailable outside a secure context; say so
      // rather than leaving a button that silently does nothing
      toast.error(
        "Couldn't reach the clipboard — check the browser console for the raw response.",
      );
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2" data-testid="ai-capture">
      {/* neutral-500, not 400: at 11px this is chrome text under the
          ≥4.5:1 rule the polish session drove to zero findings, and
          neutral-400 on white measures ~2.6:1 */}
      <span
        className="font-mono text-[11px] text-neutral-500"
        data-testid="ai-capture-meta"
      >
        {STAGE_WORDS[capture.stage]} ·{" "}
        {capture.attempt === "first" ? "first attempt" : "after retry"} ·{" "}
        {capture.raw.length} bytes
      </span>
      <button
        type="button"
        data-testid="ai-copy-capture"
        className="ml-auto flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-[12px] text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
        onClick={() => void copy()}
      >
        {copied ? <Check size={12} /> : <ClipboardCopy size={12} />}
        {copied ? "Copied" : "Copy raw response"}
      </button>
    </div>
  );
}

function ResultView({
  summary,
  docBefore,
}: {
  summary: ReorganizeSummary;
  docBefore: TocDocument;
}) {
  const scoped = summary.scopedSections < summary.totalSections;
  const row = "flex justify-between text-[13px] text-neutral-700";
  return (
    <div className="flex flex-col gap-2.5" data-testid="ai-result">
      <div className="text-[14px] font-semibold text-emerald-700">
        ✓ Reorganization ready
      </div>
      {scoped && (
        <div className="text-[12px] text-neutral-500">
          {summary.scopedSections} of {summary.totalSections} sections reorganized — the
          others are untouched.
        </div>
      )}
      <div className="rounded-lg border border-neutral-100 px-3 py-2">
        <div className={row}>
          <span>Sections</span>
          <span className="tabular-nums">
            {docBefore.sections.length} → {summary.sectionsAfter}
          </span>
        </div>
        <div className={row}>
          <span>Max depth</span>
          <span className="tabular-nums">
            {summary.maxDepthBefore} → {summary.maxDepthAfter}
          </span>
        </div>
        <div className={row}>
          <span>Changes</span>
          <span className="tabular-nums">
            {summary.moved} moved · {summary.renamed} renamed · {summary.newSections} new
          </span>
        </div>
        {/*
          THE SPLIT, SAID BEFORE THE TAB OPENS (docs/21, Decision 3).
          The no-silent-downgrade constraint is met at the EARLIEST
          surface rather than first at Review: a user who is about to
          accept an aspirational proposal learns here how much of it the
          app can write.

          Two numbers, never one. "The app cannot write this" and "you
          have not agreed to write this" have different remedies, and
          summing them would blame the format for a choice nobody has
          made yet.
        */}
        {summary.aspirational.moves > 0 &&
          summary.aspirational.needsHand + summary.aspirational.needsConsent > 0 && (
            <div className={`${row} text-intent`} data-testid="aspirational-split">
              <span>Aspirational</span>
              {/* EACH NUMBER SAYS WHAT IT COUNTS (Ruling A). This one
                  counts ROWS; Review's checklist counts ITEMS, and its
                  items are not all rows — so the two legitimately differ
                  and bare integers made them look like one measurement
                  gone wrong. One producer, in `aspirationalSplit.ts`. */}
              <span className="tabular-nums">
                {aspirationalSplitText(summary.aspirational)}
              </span>
            </div>
          )}
        {(summary.recovered > 0 ||
          summary.promoted > 0 ||
          summary.emptySectionsDropped > 0) && (
          <div className={`${row} text-neutral-500`}>
            <span>Adjustments</span>
            <span className="tabular-nums">
              {summary.promoted} promoted · {summary.recovered} recovered ·{" "}
              {summary.emptySectionsDropped} emptied
            </span>
          </div>
        )}
      </div>
      {summary.warnings.map((w) => (
        <div
          key={w}
          className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800"
        >
          ⚠ {w}
        </div>
      ))}
    </div>
  );
}
