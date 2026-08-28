/**
 * ConfigureView.tsx — The Reorganize dialog's main state: scope,
 * preset, editable instructions, option toggles. Presets fill the
 * instruction field; the field is the source of truth for what's sent.
 * A DEV-only payload details block is the debug tool — end users get a
 * black box plus the privacy footer.
 */

import {
  createCards,
  renameCapability,
  reorderCards,
  reparentCapability,
} from "@/formats/registry";
import { scopeNoticeText } from "./scopeNotice";
import { useMemo } from "react";
import { RotateCcw, Settings2 } from "lucide-react";
import { buildOutline, neverEmptyGroups } from "@/ai/outline";
import { movesFilesOnReparent, nodesNeedTargets } from "@/ai/permissions";
import { buildConstraints, pinnedRowCount } from "@/ai/constraints";
import { buildSystemMessage } from "@/ai/prompt";
import { DEFAULT_PRESET_ID, PRESETS } from "@/ai/presets";
import { useTooltip } from "@/view/Tooltip";
import type { Granularity, RunMode } from "@/ai/contract";
import { ORPHAN_COLOR, sectionColorMap } from "@/model/palette";
import { countTopics } from "@/model/selectors";
import type { SectionId, TocDocument } from "@/model/types";

export interface ReorganizeConfig {
  /** The run POSTURE (docs/21). Resets with the dialog like every
   *  sibling field; seeded from the tab's state, never from a device
   *  store, and never from a preset. */
  mode: RunMode;
  scopeMode: "all" | "selected";
  checkedIds: SectionId[];
  presetId: string;
  instructions: string;
  edited: boolean;
  allowNewSections: boolean;
  allowRenames: boolean;
  /** Per-run permission, default OFF, never preset-set (docs/16). */
  allowFileMoves: boolean;
  folderHints: boolean;
  granularity: Granularity;
}

/**
 * The request options for a config. `doc` gates the capabilities its
 * system cannot express — a rename has no serialization in a read-only
 * adapter, so it is forced off here rather than trusted to the checkbox
 * (docs/12, decision 5).
 */
/**
 * A dialog's opening state.
 *
 * Lives beside the config's SHAPE rather than in the dialog component,
 * because "what are this config's fields" and "what does a fresh one
 * hold" are one question asked twice, and answering them in two files
 * is how a new field ships with no default.
 *
 * `seedMode` is the STATE of the tab the dialog opened on — seeding, not
 * persistence (docs/21, re-decision 5). The value comes from the tab in
 * front of the user, which already wears its state in its chrome, so the
 * seeded default surprises no one. The radio stays live either way:
 * seeding sets the default, never the answer.
 */
export function initialConfig(
  seedSectionIds: SectionId[],
  seedMode: RunMode = "grounded",
): ReorganizeConfig {
  const preset = PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!;
  return {
    mode: seedMode,
    scopeMode: seedSectionIds.length > 0 ? "selected" : "all",
    checkedIds: seedSectionIds,
    presetId: preset.id,
    instructions: preset.template,
    edited: false,
    allowFileMoves: false,
    allowNewSections: preset.defaults.allowNewSections,
    allowRenames: preset.defaults.allowRenames,
    folderHints: false,
    granularity: "full",
  };
}

/**
 * May this run ask the model to create new sections, and if not, why?
 *
 * ONE PRODUCER FOR THE STATE AND THE SENTENCE. The disabled control, its
 * reason and `configOptions`' clamp all read this, so a toggle cannot say
 * one thing while the payload does another — which is precisely what
 * happened before `createCards` existed: the dialog offered the toggle,
 * the prompt rendered `+ Title`, the model created four cards, and Review
 * refused the whole corpus-scale plan (docs/10's oracle log, 2026-08-19).
 *
 * THREE REASONS, NEVER SUMMED. A toggle can be dark because the system
 * cannot record a new card at all, because a new card would be a new
 * parent on a system that cannot express one, or because it would move
 * files this run has no permission to move. They carry different
 * remedies, and one of the three is not a remedy at all — so the
 * unfixable obstacle is named FIRST, or the copy would send someone to
 * turn on a permission that changes nothing.
 *
 * NO ADAPTER ID ANYWHERE. Every clause reads a field off the document's
 * own adapter, which is what makes the rider true: an adapter that flips
 * `createCards` re-lights this control with no change here.
 *
 * MODE-AWARE IN EXACTLY ONE BRANCH (docs/22, Decision 6). An aspirational
 * run may imagine a card the write path cannot record — it becomes a
 * `creation` remainder, labeled on canvas, listed in the checklist and
 * dissolved by the projection so the rest of the plan still applies. So
 * the FIRST clause re-arms, and only that one. The other two guard
 * consequences a mode cannot authorize: a new section on a path-addressed
 * system is a DIRECTORY, and imagining one neither makes it writable nor
 * supplies the file-move consent. A mode is not a permission.
 */
export function newSectionsGate(
  doc: TocDocument | undefined,
  config: Pick<ReorganizeConfig, "allowFileMoves" | "mode">,
): { enabled: boolean; reason?: string } {
  if (doc === undefined) return { enabled: true };
  if (!createCards(doc) && config.mode !== "aspirational") {
    return {
      enabled: false,
      reason:
        "This system's navigation cannot record a new top-level card, so a proposal that created one could not be written back. Reorganizing within the existing cards still works.",
    };
  }
  if (!reparentCapability(doc)) {
    return {
      enabled: false,
      reason:
        "This system stores a page's place in the file tree, so a new group would mean moving files. Reordering within each group still works.",
    };
  }
  if (movesFilesOnReparent(doc) && !config.allowFileMoves) {
    // DISABLED WITH A REASON, and the reason names the control that
    // unlocks it — the decision-5 precedent from docs/13. A new section
    // whose whole purpose is receiving topics, on a run that may not move
    // any, is a card that can never be populated.
    return {
      enabled: false,
      reason:
        'A new section is for receiving topics, and this run may not move any. Turn on "Allow file moves" first.',
    };
  }
  return { enabled: true };
}

export function configOptions(config: ReorganizeConfig, doc?: TocDocument) {
  return {
    // Passed straight through: unlike every capability-gated field
    // below, the mode authorizes nothing a format could refuse.
    mode: config.mode,
    scopeSectionIds: config.scopeMode === "selected" ? config.checkedIds : null,
    allowRenames:
      config.allowRenames &&
      (doc === undefined ||
        renameCapability(doc).sections ||
        renameCapability(doc).topics),
    // A new section is a new PARENT for whatever moves into it, so it
    // rides on the reparent capability. On a FILE-MOVE format it also
    // needs the per-run permission: a new section that cannot receive
    // topics is the unpopulatable-card bug reborn one layer up, and
    // docs/14 settled item 5 refused to ship half of it on the canvas.
    // Shipping half of it in this dialog is the same defect wearing the
    // AI's clothes.
    // Clamped on the SAME answer the control shows, so a stale `true`
    // — from a preset, or from the previously open document — can never
    // reach the payload and make the prompt render `+ Title` syntax the
    // adapter refuses.
    allowNewSections: config.allowNewSections && newSectionsGate(doc, config).enabled,
    // Never true where the format does not move files: a permission for
    // a consequence that cannot occur is noise in the payload and a lie
    // in the preview.
    allowFileMoves:
      config.allowFileMoves && doc !== undefined && movesFilesOnReparent(doc),
    folderHints: config.folderHints,
    granularity: config.granularity,
  };
}

export function ConfigureView({
  doc,
  config,
  onChange,
  onOpenSettings,
  configured,
}: {
  doc: TocDocument;
  config: ReorganizeConfig;
  onChange: (partial: Partial<ReorganizeConfig>) => void;
  onOpenSettings: () => void;
  configured: boolean;
}) {
  const colors = useMemo(() => sectionColorMap(doc), [doc]);
  // The checkbox offers renames when EITHER kind is renameable; the
  // validator enforces per kind, so a topics-only refusal never has to
  // hide a section rename the format supports (docs/13).
  const caps = renameCapability(doc);
  const renameable = caps.sections || caps.topics;
  // Does this format move files for a parent change? Still its own
  // question — it decides whether the PERMISSION is worth asking, which
  // is a different thing from whether new sections may be offered.
  const fileMoveShape = movesFilesOnReparent(doc);
  const newSections = newSectionsGate(doc, config);
  const newSectionsEnabled = newSections.enabled;
  // Styled tooltips for the disabled-with-a-reason toggles (Tooltip.tsx
  // — disabled-control reasons were named in the P1→P2 defect class).
  // The label, not the input, carries the hover: labels keep firing
  // pointer events while their disabled input swallows them.
  // The sentence comes from the SAME call that darkened the control, so
  // the two cannot drift into naming different obstacles.
  const newSectionsTip = useTooltip(
    newSections.reason === undefined ? null : [newSections.reason],
  );
  const renamesTip = useTooltip(
    renameable
      ? null
      : ["This system's nav cannot record a rename — reorganizing produces moves only."],
  );
  const outline = useMemo(
    () => buildOutline(doc, configOptions(config, doc)),
    [doc, config],
  );
  /**
   * EVERY ROW IN SCOPE IS PINNED — the notice, not a disabled control
   * (docs/21, Decision 8).
   *
   * Disabled-with-a-reason is the wrong seam here because grounded is
   * not useless on such a corpus: sibling reorder is real work, and
   * docs/19's blast-radius measurement is the receipt. So the dialog
   * STATES the situation and leaves both doors open.
   *
   * Counted against the ID MAP's topic entries, which is the same set
   * `buildConstraints` walks — a row with no compact id cannot be named
   * in the answer, so it is neither markable nor movable and belongs in
   * neither number.
   */
  const scopeTopicCount = [...outline.idMap.values()].filter(
    (e) => e.kind === "topic",
  ).length;
  const pinnedCount = pinnedRowCount(
    buildConstraints(doc, configOptions(config, doc), outline.idMap),
  );
  const entirelyPinned = scopeTopicCount > 0 && pinnedCount === scopeTopicCount;
  // READ OFF THE DOCUMENT'S OWN ADAPTER, like every other capability
  // clause in this file — no adapter id anywhere in the path.
  const scopeNotice = scopeNoticeText({
    entirelyPinned,
    createCards: createCards(doc),
    reorderCards: reorderCards(doc),
  });

  const applyPreset = (id: string) => {
    const next = PRESETS.find((p) => p.id === id)!;
    onChange({
      presetId: id,
      instructions: next.template,
      edited: false,
      allowNewSections: next.defaults.allowNewSections,
      allowRenames: next.defaults.allowRenames,
    });
  };

  const label = "text-[11px] font-semibold uppercase tracking-wide text-neutral-400";

  return (
    <div className="flex flex-col gap-4">
      {!configured && (
        <button
          type="button"
          data-testid="ai-setup-banner"
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[13px] text-amber-800 hover:bg-amber-100"
          onClick={onOpenSettings}
        >
          <Settings2 size={14} className="shrink-0" />
          Connect a model to get started — set the provider and API key
        </button>
      )}

      <div>
        <div className={`${label} mb-1.5`}>Mode</div>
        {/* THE RUN POSTURE. Per dialog open, never remembered on the
            device (R3) — a remembered deviation self-perpetuates
            invisibly and the differential workflow needs a grounded run
            to stay comparable across time. Seeded from the tab's state,
            which is a visible property of a visible tab. */}
        <div className="mb-3 flex flex-col gap-1.5" data-testid="mode-radio">
          {(
            [
              [
                "grounded",
                "Grounded",
                "Every proposed move is one this app can write back.",
              ],
              [
                "aspirational",
                "Aspirational",
                "The model arranges freely; moves the app can't write are labeled for you.",
              ],
            ] as const
          ).map(([value, title, detail]) => (
            <label
              key={value}
              data-mode={value}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${
                config.mode === value
                  ? "border-neutral-300 bg-neutral-50"
                  : "border-neutral-200"
              }`}
            >
              <input
                type="radio"
                name="run-mode"
                className="mt-0.5"
                checked={config.mode === value}
                onChange={() => onChange({ mode: value })}
              />
              {/* COMPOSED, so it lives outside any truncate wrapper:
                  two stacked lines, and a single truncating span would
                  eat the second while every assertion still passed. */}
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] font-medium text-neutral-800">{title}</span>
                <span className="text-[11px] leading-relaxed text-neutral-500">
                  {detail}
                </span>
              </span>
            </label>
          ))}
        </div>
        {scopeNotice && (
          <p
            data-testid="entirely-pinned-notice"
            className="mb-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[12px] leading-relaxed text-neutral-600"
          >
            {scopeNotice}
          </p>
        )}
        <div className={`${label} mb-1.5 flex items-baseline justify-between`}>
          <span>Scope</span>
          <span className="font-normal normal-case tracking-normal text-neutral-400">
            {config.scopeMode === "selected"
              ? `${config.checkedIds.length} of ${doc.sections.length} sections`
              : `${doc.sections.length} sections`}{" "}
            · {outline.stats.topics} topics
          </span>
        </div>
        <div className="flex gap-3 text-[13px]">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              checked={config.scopeMode === "all"}
              onChange={() => onChange({ scopeMode: "all" })}
            />
            Whole document
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              data-testid="ai-scope-selected"
              checked={config.scopeMode === "selected"}
              onChange={() => onChange({ scopeMode: "selected" })}
            />
            Selected cards
          </label>
        </div>
        {config.scopeMode === "selected" && (
          <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-neutral-200 p-1.5">
            {doc.sections.map((s) => {
              const color = colors.get(s.id) ?? ORPHAN_COLOR;
              const checked = config.checkedIds.includes(s.id);
              return (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-neutral-700 hover:bg-neutral-50">
                    <input
                      type="checkbox"
                      data-testid={`ai-scope-${s.id}`}
                      checked={checked}
                      onChange={() =>
                        onChange({
                          checkedIds: checked
                            ? config.checkedIds.filter((id) => id !== s.id)
                            : [...config.checkedIds, s.id],
                        })
                      }
                    />
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color.border }}
                    />
                    <span className="truncate">{s.title}</span>
                    <span className="ml-auto text-[11px] tabular-nums text-neutral-400">
                      {countTopics(s.topics).total}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <div className={`${label} mb-1.5`}>Preset</div>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              data-testid={`ai-preset-${p.id}`}
              aria-pressed={p.id === config.presetId}
              className={`rounded-lg border px-2.5 py-1.5 text-left ${
                p.id === config.presetId
                  ? "border-neutral-700 bg-neutral-50"
                  : "border-neutral-200 hover:border-neutral-300"
              }`}
              onClick={() => applyPreset(p.id)}
            >
              <div className="text-[13px] font-medium text-neutral-800">{p.label}</div>
              <div className="text-[11px] leading-tight text-neutral-400">{p.blurb}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className={`${label} mb-1.5 flex items-center justify-between`}>
          <span>Instructions</span>
          {config.edited && (
            <button
              type="button"
              className="flex items-center gap-1 font-normal normal-case tracking-normal text-neutral-400 hover:text-neutral-600"
              onClick={() => applyPreset(config.presetId)}
            >
              (edited) <RotateCcw size={11} /> Reset
            </button>
          )}
        </div>
        <textarea
          data-testid="ai-instructions"
          className="h-28 w-full resize-none rounded-lg border border-neutral-300 p-2 text-[12px] leading-relaxed text-neutral-700 outline-none focus:border-neutral-500"
          value={config.instructions}
          onChange={(e) => onChange({ instructions: e.target.value, edited: true })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-neutral-700">
        {/* NAMED FOR ITS CONSEQUENCE, not its mechanism. "Allow
            reparenting" describes what the model does; "relocates files
            on disk" describes what happens to the user — and the user
            who typed "as few headings as reasonable" was thinking about
            headings, not about `git status`.

            Shown only where a parent change actually moves files. A
            toggle that is always on is a toggle that teaches users to
            ignore toggles. */}
        {fileMoveShape && (
          <label
            data-testid="allow-file-moves"
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={config.allowFileMoves}
              onChange={(e) => onChange({ allowFileMoves: e.target.checked })}
            />
            Allow file moves{" "}
            <span className="text-neutral-500">(relocates files on disk)</span>
          </label>
        )}
        <label
          data-testid="allow-new-sections"
          className={`flex items-center gap-1.5 ${
            newSectionsEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-50"
          }`}
          {...newSectionsTip.props}
        >
          <input
            type="checkbox"
            disabled={!newSectionsEnabled}
            checked={config.allowNewSections && newSectionsEnabled}
            onChange={(e) => onChange({ allowNewSections: e.target.checked })}
          />
          Allow new sections
        </label>
        {newSectionsTip.node}
        <label
          className={`flex items-center gap-1.5 ${
            renameable ? "cursor-pointer" : "cursor-not-allowed opacity-50"
          }`}
          {...renamesTip.props}
        >
          <input
            type="checkbox"
            // Unavailable rather than merely defaulted off: a preset that
            // asks for renames must not produce entries the planner would
            // have to refuse (docs/12, decision 5).
            checked={renameable && config.allowRenames}
            disabled={!renameable}
            onChange={(e) => onChange({ allowRenames: e.target.checked })}
          />
          Allow renames
        </label>
        {renamesTip.node}
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={config.folderHints}
            onChange={(e) => onChange({ folderHints: e.target.checked })}
          />
          Folder hints
        </label>
        <label className="flex items-center gap-1.5">
          Granularity
          <select
            className="rounded-md border border-neutral-300 px-1.5 py-0.5 text-[12px]"
            value={config.granularity}
            onChange={(e) => onChange({ granularity: e.target.value as Granularity })}
          >
            <option value="full">Full</option>
            <option value="two">Top 2 levels</option>
            <option value="top">Top level</option>
          </select>
        </label>
      </div>

      {import.meta.env.DEV && (
        <details className="rounded-lg border border-dashed border-neutral-200 p-2">
          <summary className="cursor-pointer text-[11px] text-neutral-400">
            Debug: payload (~{outline.stats.estTokens} tokens, dev only)
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[10.5px] leading-snug text-neutral-500">
            {buildSystemMessage(
              configOptions(config, doc),
              config.scopeMode === "selected",
              neverEmptyGroups(doc, outline.idMap),
              // the SAME array the run will send and the checker will
              // judge by — a preview built from a second derivation is
              // a preview that can lie about what leaves
              buildConstraints(doc, configOptions(config, doc), outline.idMap),
              nodesNeedTargets(doc),
            )}
            {"\n\n--- user ---\n"}
            {config.instructions}
            {"\n\nCurrent outline:\n"}
            {outline.text}
            {outline.contextLine ? `\n\n${outline.contextLine}` : ""}
          </pre>
        </details>
      )}
    </div>
  );
}
