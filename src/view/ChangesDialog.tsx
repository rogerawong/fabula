/**
 * ChangesDialog.tsx — Per-file change review for collection documents
 * (docs/11). The plan is recomputed from (original files, edited
 * model, canvas order) every time the dialog opens — no journal — and
 * VERIFIED BY SIMULATION before any save affordance is enabled: apply
 * in memory, re-parse, compare. Blocking warnings (unresolvable
 * ambiguity, unmergeable YAML, path collisions) disable saving until
 * the user fixes the cause on the canvas.
 *
 * Diffs are rendered as colored unified-diff text (no CodeMirror — a
 * patch is line-colored plain text; the editor bundle stays lazy for
 * actual code views).
 */

import { useEffect, useMemo, useState } from "react";
import { inboundCount, type LinkIndex } from "@/collections/linkIndex";
import { headPrependPaths } from "@/collections/diff";
import type { TocDocument } from "@/model/types";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Download,
  FolderDown,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  directoryTarget,
  ensureWritePermission,
  getDirectoryHandle,
  registerDirectoryHandle,
  saveChanges,
} from "@/collections/fsAccess";
import { evidenceOf } from "@/collections/importEvidence";
import { structureReport } from "@/model/remainders";
import { originalDocumentOf } from "@/collections/original";
import {
  applyableProjection,
  buildChecklist,
  checklistText,
  ledgerOf,
} from "@/model/ledger";
import { getCollectionAdapter } from "@/collections/registry";
import { renderPatch } from "@/collections/diff";
import { applyChanges, simulatePlan } from "@/collections/verify";
import { filesOf, type FileChange, type FilesSnapshot } from "@/collections/types";
import { deriveSectionOrder } from "@/layout/columns";
import { useAppStore, type TabState } from "@/store";
import { useTooltip } from "./Tooltip";
import { useUiStore } from "./uiStore";
import { reviewHeadline } from "./reviewHeadline";
import { untitledNotice } from "@/model/naming";

export function ChangesDialog() {
  const open = useUiStore((s) => s.changesDialogOpen);
  const tab = useAppStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null);
  if (!open || !tab) return null;
  return <ChangesBody key={tab.id} tab={tab} />;
}

function changePath(change: FileChange): string {
  return change.kind === "move" ? change.toPath : change.path;
}

function ChangesBody({ tab }: { tab: TabState }) {
  const setOpen = useUiStore((s) => s.setChangesDialogOpen);
  const doc = tab.editor.document;
  const adapter = getCollectionAdapter(doc.formatId);
  const [expanded, setExpanded] = useState<string | null>(null);
  /**
   * Plan-level and default ON (docs/16). Restructures arrive in bursts —
   * 141 moves in 2018, 168 in 2024 — so one decision covers the plan
   * rather than being asked once per drag.
   *
   * Local to the dialog session, not persisted: whether it should be
   * remembered per document is a docs/16 settle item, and a remembered
   * permission that silently re-applies is the shape the AI toggles were
   * split to avoid.
   */
  const [writeAliases, setWriteAliases] = useState(true);
  /**
   * R4: plan-level consent for the file-relocating moves an ASPIRATIONAL
   * run proposed with no proposal-time consent to carry (docs/21).
   *
   * DEFAULT OFF, unlike `writeAliases` above, and the asymmetry is the
   * point: an alias is a repair the user already implied by moving the
   * page, while these moves were proposed by a run nobody granted disk
   * permission to. Off projects them home and lists them as "declined
   * this run" — because "the app cannot write this" and "you chose not
   * to write this today" are different facts.
   *
   * It appears only when the LEDGER holds consent records — a document
   * fact — so this surface never has to ask which run produced the plan,
   * and a grounded run's dialog-consented moves see no second control.
   */
  const [writeConsentMoves, setWriteConsentMoves] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  /**
   * The ledger, from the SELECTOR OF RECORD: derived against the
   * re-parsed snapshot where one exists, recorded otherwise (docs/21,
   * Decision 3).
   *
   * Re-parsing a corpus is real work, and this is the one place it is
   * already being done — `simulatePlan` re-parses the whole snapshot on
   * every open. The canvas badge and the Overview line read the RECORD
   * instead, which the oracle keeps honest.
   */
  const ledger = useMemo(() => ledgerOf(doc, originalDocumentOf(doc)), [doc]);
  const consentRecords = ledger.filter((r) => r.kind === "consent");
  /**
   * The STRUCTURE REPORT (docs/22, Decision 3): what this arrangement
   * imagines that the write path cannot express.
   *
   * Keyed on the document, its source and the card order — never on the
   * tab state or the run mode, which is what gives a GROUNDED tab the
   * same projection and the same checklist by construction rather than
   * by a second code path.
   */
  const cardOrder = useMemo(
    () => deriveSectionOrder(tab.editor.columns),
    [tab.editor.columns],
  );
  const remainders = useMemo(
    () => structureReport(doc, filesOf(doc), cardOrder),
    [doc, cardOrder],
  );
  const checklist = useMemo(
    () =>
      buildChecklist(doc, ledger, {
        consentDeclined: !writeConsentMoves,
        remainders,
      }),
    [doc, ledger, remainders, writeConsentMoves],
  );

  const plan = useMemo(() => {
    // A read-only adapter has no planner; the Header disables the button
    // rather than opening this (docs/12, decision 3).
    if (!adapter?.planChanges) return null;
    const files = filesOf(doc);
    const order = deriveSectionOrder(tab.editor.columns);
    /**
     * PLAN THE PROJECTION, NEVER FILTER THE PLAN (docs/21, Decision 4).
     *
     * A plan is not separable per change — ordering, renumbering and
     * cross-file edits interdepend — so a filtered plan is a document
     * nobody verified. The projection is a REAL document: every pinned
     * displacement returned to its original parent, plus the consent
     * moves while the control is off, and everything else exactly as
     * arranged. Then the existing pipeline runs on it, unmodified.
     *
     * Only `pin` and `consent` records project. A demoted card or a
     * pageless nesting stays in the arrangement and the adapters' own
     * refusals answer for it below — two independent layers, and the
     * outer one is the shipped one.
     */
    const projected = ledger.filter(
      (r) => r.kind === "pin" || (r.kind === "consent" && !writeConsentMoves),
    );
    const applyable = applyableProjection(
      { doc, sectionOrder: order },
      { records: projected, remainders, source: originalDocumentOf(doc) },
    );
    const { changes, warnings, entryMoves } = adapter.planChanges(
      files,
      applyable.doc,
      [...applyable.sectionOrder],
      {
        writeAliases,
      },
    );
    const blocked = warnings.some((w) => w.blocking);
    // Simulated against the document the plan was COMPUTED from. Passing
    // the displaced document here would compare the plan to an
    // arrangement it never described, and the mismatch would read as a
    // planner bug.
    const sim =
      changes.length > 0 && !blocked
        ? simulatePlan(
            adapter,
            files,
            applyable.doc,
            [...applyable.sectionOrder],
            changes,
          )
        : { ok: true };
    return { files, changes, warnings, blocked, sim, entryMoves, projected };
  }, [
    adapter,
    doc,
    ledger,
    remainders,
    tab.editor.columns,
    writeAliases,
    writeConsentMoves,
  ]);

  // Save-to-folder is Chromium-only; elsewhere the .patch is the way.
  const canSaveToFolder = "showDirectoryPicker" in window;
  const hasHandle = getDirectoryHandle(tab.id) !== null;
  // Styled tooltip (Tooltip.tsx); on a wrapper span, because the button
  // disables and a disabled control swallows its own pointer events.
  // Above the early return — hooks run on every render.
  const saveTip = useTooltip([
    hasHandle
      ? "Write the changes into the imported folder"
      : "The folder link was lost on reload — you'll pick it again",
  ]);

  if (!adapter || !plan) return null;
  const { files, changes, warnings, blocked, sim, entryMoves } = plan;
  // INFORM, never refuse. These files need one flag at apply time, and
  // the patch itself says so in its own first lines — this is the same
  // fact on screen, so a user who reads the dialog is not surprised by
  // the file and a user who only reads the file is not lost.
  const needsFlag = headPrependPaths(changes, files);
  // D2's truth on its second surface. The patch preamble stopped
  // offering GNU patch where the plan renames; this note offered it too,
  // and a stale recommendation on screen is the same trap as one in the
  // file. Measured: `patch -p1` on a rename applies the hunk at the OLD
  // path and exits 0.
  const hasRenames = changes.some((c) => c.kind === "move");
  const saveDisabled = blocked || !sim.ok || changes.length === 0;

  // One record per KIND now (docs/17), so this renders one line each
  // rather than one per occurrence — a better list for a folder that
  // skipped 84 files, and a change rather than a no-op. A legacy session
  // reads through the alias as count-1 records and renders as it always
  // did.
  const importEvidence = evidenceOf(doc);
  const evidenceTotal = importEvidence.reduce((sum, e) => sum + e.count, 0);

  const copyChecklist = () => {
    void navigator.clipboard
      .writeText(checklistText(checklist).join("\n"))
      .then(() => toast.success("Checklist copied"))
      .catch(() => toast.error("Could not copy the checklist"));
  };

  const downloadPatch = () => {
    // The instruction travels with the bytes (docs/16's
    // self-documenting-patch precedent): a reviewer who only ever sees
    // the file is told what the app could not write.
    const text = renderPatch(changes, files, checklistText(checklist));
    const stem =
      tab.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "changes";
    const blob = new Blob([text], { type: "text/x-patch;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${stem}.patch`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${a.download} — apply with: git apply ${a.download}`);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      let handle = getDirectoryHandle(tab.id);
      if (!handle) {
        // reload dropped the transient handle — ask for the folder again
        try {
          handle = await window.showDirectoryPicker({
            mode: "readwrite",
            id: "toc-fable-docs",
          });
        } catch {
          return; // cancelled
        }
        registerDirectoryHandle(tab.id, handle);
      }
      if (!(await ensureWritePermission(handle))) {
        toast.error("Write permission was denied for that folder.");
        return;
      }
      await saveChanges(directoryTarget(handle), changes);
      useAppStore.getState().refreshCollectionFiles(tab.id, applyChanges(files, changes));
      toast.success(
        `Saved ${changes.length} file change${changes.length === 1 ? "" : "s"} to the folder`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? `Save failed: ${err.message}` : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  /**
   * A move, as four stacked facts (docs/16).
   *
   *   MOVED   content/en/docs/tasks/provision-swap-memory.md
   *        →  content/en/docs/tutorials/cluster-management/provision-swap-memory.md
   *           + alias  /docs/tasks/provision-swap-memory/
   *           12 inbound links, as of import — not rewritten
   *
   * The count says "not rewritten" because that is the whole disclosure:
   * this app does not edit other people's bodies (option 1, rejected on
   * cost — 297 files for 103 measured prose moves). The alias repairs the
   * URL; the links themselves are left alone and git review is the
   * enforcement.
   *
   * ABSENT when unmeasured, never zero. Nothing folds into a count.
   */
  function MoveRow({
    change,
    doc,
  }: {
    change: Extract<FileChange, { kind: "move" }>;
    doc: TocDocument;
  }) {
    const index = (doc.extras as { linkIndex?: LinkIndex } | undefined)?.linkIndex;
    const inbound = inboundCount(index, change.fromPath);
    const alias = /^aliases:/m.test(change.newContent)
      ? change.newContent.match(/^- (\/.*)$/m)?.[1]
      : undefined;

    return (
      <span className="flex min-w-0 flex-col text-left" data-testid="change-move">
        <span className="truncate font-mono text-[12px] text-neutral-500">
          {change.fromPath}
        </span>
        <span className="truncate font-mono text-[12px] text-neutral-800">
          → {change.toPath}
        </span>
        {alias && (
          <span
            data-testid="change-move-alias"
            className="truncate font-mono text-[11px] text-emerald-700"
          >
            + alias {alias}
          </span>
        )}
        {inbound !== null && (
          <span
            data-testid="change-move-inbound"
            className="text-[11px] text-neutral-500"
          >
            {inbound} inbound link{inbound === 1 ? "" : "s"}, as of import — not rewritten
          </span>
        )}
      </span>
    );
  }

  const badge = (change: FileChange) =>
    change.kind === "edit" ? (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-chrome font-semibold uppercase text-amber-700">
        edit
      </span>
    ) : change.kind === "create" ? (
      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-chrome font-semibold uppercase text-emerald-700">
        new
      </span>
    ) : (
      <span className="rounded bg-sky-100 px-1.5 py-0.5 text-chrome font-semibold uppercase text-sky-700">
        move
      </span>
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Review file changes"
        data-testid="changes-dialog"
        className="flex max-h-[85vh] w-[680px] flex-col rounded-xl border border-neutral-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold text-neutral-800">Review changes</h2>
            <p className="text-[12px] text-neutral-400">
              {adapter.label} · files are edited minimally, never deleted
            </p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* THE STATUS LINE, one decision (`reviewHeadline.ts`).
              It was a chain of ternaries here, ordered emptiness-first,
              and that ordering shipped a lie: an empty plan beside a
              blocking warning claimed the canvas matched the files while
              the warning below said the plan had been refused. Blocked
              outranks everything now, and the ordering is a rule with a
              test rather than a line order somebody could rearrange. */}
          {(() => {
            const headline = reviewHeadline({
              changes: changes.length,
              blocked,
              checklist: checklist.length,
              simOk: sim.ok,
              ...(sim.detail !== undefined ? { simDetail: sim.detail } : {}),
            });
            const tone =
              headline.kind === "clean"
                ? "bg-neutral-50 text-[13px] text-neutral-500"
                : headline.kind === "verified"
                  ? "bg-emerald-50 text-[12px] text-emerald-700"
                  : "bg-red-50 text-[12px] leading-relaxed text-red-700";
            const Icon =
              headline.kind === "verified"
                ? Check
                : headline.kind === "clean"
                  ? null
                  : AlertTriangle;
            return (
              <p
                data-testid={
                  headline.kind === "clean"
                    ? "changes-empty"
                    : headline.kind === "verified"
                      ? "changes-verified"
                      : "changes-blocked"
                }
                data-headline-kind={headline.kind}
                className={`flex items-start gap-2 rounded-md px-3 py-2 ${tone}`}
              >
                {Icon && <Icon size={14} className="mt-0.5 shrink-0" />}
                {headline.text}
              </p>
            );
          })()}

          {/* THE PLACEHOLDER NOTICE (docs/22, Decision 5). Neutral tone,
              deliberately: the bytes are legal and the name is merely
              nobody's, so spending the warning token here would cost the
              error tier its jump — the salience economy `locks.ts` states
              under the membership test. It sits above the warnings
              because it is about the arrangement rather than the plan. */}
          {(() => {
            const notice = untitledNotice(doc);
            if (notice === null) return null;
            return (
              <p
                data-testid="untitled-notice"
                className="mt-3 rounded-md bg-neutral-50 px-3 py-1.5 text-[12px] text-neutral-500"
              >
                {notice} — a card nobody named reads as one somebody did.
              </p>
            );
          })()}

          {/* plan warnings */}
          {warnings.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1" data-testid="plan-warnings">
              {warnings.map((w, i) => (
                <li
                  key={i}
                  className={`rounded-md px-3 py-1.5 text-[12px] leading-relaxed ${
                    w.blocking
                      ? "bg-red-50 font-medium text-red-700"
                      : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {w.detail}
                </li>
              ))}
            </ul>
          )}

          {/* The alias toggle: plan-level, one decision for the whole
              restructure. A moved page's redirect is a plan LINE, so it
              is reviewable and revocable like any other. */}
          {changes.some((c) => c.kind === "move") && (
            <label
              data-testid="alias-toggle"
              className="mt-3 flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-700"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={writeAliases}
                onChange={(e) => setWriteAliases(e.target.checked)}
              />
              <span>
                Leave a redirect from each page&rsquo;s old URL
                <span className="mt-0.5 block text-[11px] text-neutral-500">
                  Adds <code>aliases:</code> to the moved page&rsquo;s own front matter.
                  Repairs links to the old address; nothing else is edited.
                </span>
              </span>
            </label>
          )}

          {/* R4: the file-move consent, present ONLY when the LEDGER
              holds consent records. Keyed on a document fact, so this
              surface never asks which run produced the plan — and a
              grounded run, whose moves were dialog-consented, sees no
              second control at all. */}
          {consentRecords.length > 0 && (
            <label
              data-testid="consent-moves-toggle"
              className="mt-3 flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-700"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={writeConsentMoves}
                onChange={(e) => setWriteConsentMoves(e.target.checked)}
              />
              <span>
                Move the files for {consentRecords.length} proposed page move
                {consentRecords.length === 1 ? "" : "s"}
                <span className="mt-0.5 block text-[11px] text-neutral-500">
                  This proposal was made without disk permission. Leave it off and those
                  pages stay where they are, listed below as declined.
                </span>
              </span>
            </label>
          )}

          {/* THE REMAINDER, above the file rows — the `entryMoves`
              precedent: what the user asked for sits above what it costs
              on disk, and the file rows are never replaced. Two groups,
              because "the app cannot write this" and "you chose not to
              write this today" have different remedies. */}
          {checklist.length > 0 && (
            <div className="mt-4" data-testid="aspirational-checklist">
              {(["needs-hand", "declined"] as const).map((group) => {
                const items = checklist.filter((i) => i.group === group);
                if (items.length === 0) return null;
                return (
                  <div key={group} className="mt-2">
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                      {group === "needs-hand"
                        ? `Aspirational — needs your hand (${items.length})`
                        : `Declined this run (${items.length})`}
                    </div>
                    <ul className="flex flex-col gap-1">
                      {items.map((item) => (
                        <li
                          key={item.id}
                          data-testid="checklist-item"
                          data-checklist-group={group}
                          /* COMPOSED, so it lives OUTSIDE any truncate
                             wrapper: three stacked facts, and a single
                             truncating span would eat two of them while
                             every assertion still passed. */
                          className="flex flex-col gap-0.5 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] leading-relaxed text-amber-900"
                        >
                          <span className="font-medium">{item.headline}</span>
                          <span className="text-amber-800">{item.cause}</span>
                          <span className="text-amber-800">{item.remedy}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              <button
                type="button"
                data-testid="copy-checklist-button"
                className="mt-2 flex items-center gap-1.5 rounded-md border border-neutral-300 px-2 py-1 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
                onClick={copyChecklist}
              >
                <ClipboardCopy size={13} />
                Copy checklist
              </button>
              {/* NO FILE IS WRITTEN INTO THE USER'S FOLDER. A checklist
                  file would be a new species of write — a non-corpus
                  file in the corpus — so the folder-save user gets the
                  clipboard and the patch user gets the preamble. */}
            </div>
          )}

          {/* The flag note, present ONLY while such a change is in the
              plan — never a stale warning about a state that passed. */}
          {needsFlag.length > 0 && (
            <p
              data-testid="unidiff-zero-note"
              className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-700"
            >
              {needsFlag.length} file{needsFlag.length === 1 ? "" : "s"} gain front matter
              and have none to anchor against, so the patch applies with{" "}
              <code>git apply --unidiff-zero</code>
              {hasRenames ? (
                <>
                  {" "}
                  — and this plan moves files, which <code>patch</code> cannot do
                </>
              ) : (
                <>
                  {" "}
                  (or <code>patch -p1</code>)
                </>
              )}
              . The download names {needsFlag.length === 1 ? "it" : "them"} in its first
              lines. Saving to a folder needs nothing extra.
            </p>
          )}

          {/*
            WHAT THE USER DID, above what it costs on disk.

            A cross-file entry move is ONE gesture written as two file
            edits, and the file rows alone make it look like two
            unrelated changes. This names the move once, in the user's
            own words — the row title and the card titles, never a
            docname — and says how many files it spans.

            The file rows STAY below it. This is a summarization surface,
            so it collapses on purpose and says so at the collapse point:
            Review's job is to show what will be written, and a summary
            that REPLACED the file list would be hiding the answer to
            the question the dialog exists to answer.
          */}
          {entryMoves !== undefined && entryMoves.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1" data-testid="entry-moves">
              {entryMoves.map((move) => (
                <li
                  key={`${move.title}:${move.from}:${move.to}`}
                  data-testid="entry-move"
                  className="flex items-baseline gap-2 rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2 text-[13px] text-sky-800"
                >
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 text-chrome font-semibold uppercase text-sky-700">
                    move
                  </span>
                  <span className="min-w-0">
                    moves entry <strong className="font-medium">{move.title}</strong> from{" "}
                    {move.from} to {move.to} — {move.paths.length} file
                    {move.paths.length === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* per-file diffs */}
          {changes.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1.5" data-testid="changes-list">
              {changes.map((change) => {
                const path = changePath(change);
                const isOpen = expanded === path;
                return (
                  <li
                    key={path}
                    className="overflow-hidden rounded-lg border border-neutral-200"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 bg-neutral-50 px-3 py-2 text-left hover:bg-neutral-100"
                      onClick={() => setExpanded(isOpen ? null : path)}
                    >
                      {badge(change)}
                      {change.kind === "move" ? (
                        /* COMPOSED, so it escapes the truncate wrapper: a
                           move is four facts stacked — where from, where
                           to, what redirect, what it costs — and a
                           single truncating span eats every line but the
                           first while every assertion still passes. */
                        <MoveRow change={change} doc={doc} />
                      ) : (
                        <span className="flex min-w-0 flex-col text-left">
                          <span className="truncate font-mono text-[12px] text-neutral-700">
                            {change.path}
                          </span>
                          {needsFlag.includes(change.path) && (
                            <span
                              data-testid="change-gains-frontmatter"
                              className="text-[11px] text-neutral-500"
                            >
                              gains front matter — patch applies with --unidiff-zero
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                    {isOpen && <DiffText change={change} files={files} />}
                  </li>
                );
              })}
            </ul>
          )}

          {/* import warnings from the original parse */}
          {importEvidence.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer select-none text-[12px] font-medium text-neutral-500 hover:text-neutral-700">
                {evidenceTotal} import note{evidenceTotal === 1 ? "" : "s"} from the
                original folder
              </summary>
              <ul className="mt-1.5 flex flex-col gap-1">
                {importEvidence.map((record, i) => (
                  <li
                    // Kind AND position: a LEGACY session maps its
                    // records one-to-one without grouping (by design —
                    // grouping them would collapse lines that used to
                    // render separately), so two can share a kind.
                    key={`${record.kind}:${i}`}
                    className="rounded-md bg-neutral-50 px-3 py-1.5 text-[12px] leading-relaxed text-neutral-500"
                  >
                    {record.detail ?? record.kind}
                    {/* Collapsed-and-says-so: the suffix is where the
                        grouping becomes legible. Absent at one, so an
                        old session reads exactly as it did. */}
                    {record.count > 1 && (
                      <span className="text-neutral-400">
                        {" "}
                        · {record.count} occurrences
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-100 px-5 py-3">
          <button
            type="button"
            data-testid="download-patch-button"
            className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
            disabled={saveDisabled}
            onClick={downloadPatch}
          >
            <Download size={14} />
            Download .patch
          </button>
          {canSaveToFolder && (
            <span {...saveTip.props}>
              <button
                type="button"
                data-testid="save-folder-button"
                className="flex items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
                disabled={saveDisabled || saving}
                onClick={() => void onSave()}
              >
                <FolderDown size={14} />
                {saving ? "Saving…" : hasHandle ? "Save to folder" : "Save to folder…"}
              </button>
              {saveTip.node}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Colored unified diff for ONE change (plain text — no editor). */
function DiffText({ change, files }: { change: FileChange; files: FilesSnapshot }) {
  const text = useMemo(() => renderPatch([change], files), [change, files]);
  return (
    <pre className="max-h-72 overflow-auto border-t border-neutral-200 bg-white p-3 font-mono text-[11.5px] leading-relaxed">
      {text.split("\n").map((line, i) => (
        <div
          key={i}
          className={
            line.startsWith("+++") || line.startsWith("---")
              ? "text-neutral-400"
              : line.startsWith("+")
                ? "bg-emerald-50 text-emerald-700"
                : line.startsWith("-")
                  ? "bg-red-50 text-red-600"
                  : line.startsWith("@@")
                    ? "text-sky-600"
                    : line.startsWith("diff ") ||
                        line.startsWith("rename ") ||
                        line.startsWith("new file")
                      ? "font-semibold text-neutral-500"
                      : "text-neutral-600"
          }
        >
          {line || " "}
        </div>
      ))}
    </pre>
  );
}
