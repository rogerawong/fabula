/**
 * Header.tsx — App name · document name + stats · Load menu.
 */

import {
  ChevronDown,
  PanelRight,
  Download,
  FileDiff,
  FilePlus2,
  Languages,
  Signpost,
  Sparkles,
} from "lucide-react";
import { isCollectionDocument, supportsWriteBack } from "@/collections/registry";
import { documentStats } from "@/model/selectors";
import {
  languageFacts,
  languageSummary,
  openableSiblings,
  siblingEntries,
  type LanguageFacts,
} from "./hugoLanguages";
import { getDirectoryHandle } from "@/collections/fsAccess";
import { openLanguageFromHandle } from "./loadCollection";
import { toast } from "sonner";
import type { TabState } from "@/store";
import { makeLargeSample } from "@/dev/largeSample";
import { makeK8sSilhouette } from "@/dev/k8sSilhouette";
import { useAppStore } from "@/store";
import { exportDocument } from "./exportDocument";
import { derivedTitlesNote } from "./derivedTitles";
import { adaptersWithSamples, loadSample } from "./loadSample";
import { useTooltip } from "./Tooltip";
import { useUiStore } from "./uiStore";

/**
 * The door. Every declared language is listed — including the ones this
 * folder cannot open — because the disclosure's whole job is that the
 * site has more than what is on screen. A disabled entry says WHY, and
 * the two reasons are different problems with different fixes
 * (docs/14).
 */
function LanguagePicker({ tab, facts }: { tab: TabState; facts: LanguageFacts }) {
  const hasHandle = getDirectoryHandle(tab.id) !== null;
  const entries = siblingEntries(facts, hasHandle);
  if (entries.every((e) => e.state !== "openable" && e.state !== "disabled")) return null;

  const open = async (contentDir: string | null, label: string) => {
    const handle = getDirectoryHandle(tab.id);
    if (!handle || !contentDir) return;
    try {
      const { evidenceCount } = await openLanguageFromHandle(handle, contentDir, label);
      toast.success(
        `Opened ${label}${evidenceCount > 0 ? ` — ${evidenceCount} import note(s)` : ""}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open that language.");
    }
  };

  return (
    <details className="relative shrink-0">
      <summary
        data-testid="language-open-another"
        className="cursor-pointer list-none underline underline-offset-2 hover:text-sky-900 [&::-webkit-details-marker]:hidden"
      >
        open another →
      </summary>
      <div className="absolute left-0 z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
        {entries.map((e) => (
          <button
            key={e.key}
            type="button"
            data-testid={`language-entry-${e.key}`}
            data-state={e.state}
            disabled={e.state !== "openable"}
            // No tooltip: the reason renders VISIBLY on the entry below —
            // a hover copy of a sentence already on screen is noise.
            className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-400 disabled:hover:bg-transparent"
            onClick={(ev) => {
              ev.currentTarget.closest("details")?.removeAttribute("open");
              void open(e.contentDir, e.label);
            }}
          >
            {e.label}
            {e.state === "loaded" && (
              // "· open" read as an instruction on a disabled control —
              // the one entry you cannot click looked like the one
              // telling you to click it.
              <span className="ml-1 text-[11px] text-neutral-400">· loaded</span>
            )}
            {e.reason && (
              <span className="block text-[11px] leading-snug text-neutral-400">
                {e.reason}
              </span>
            )}
          </button>
        ))}
      </div>
    </details>
  );
}

function LoadMenu() {
  const openDocument = useAppStore((s) => s.openDocument);
  const setLoadDialogOpen = useUiStore((s) => s.setLoadDialogOpen);
  return (
    <details className="relative">
      <summary
        data-testid="load-menu"
        className="flex cursor-pointer select-none list-none items-center gap-1.5 rounded-md bg-neutral-800 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-700 [&::-webkit-details-marker]:hidden"
      >
        <FilePlus2 size={14} />
        Load
        <ChevronDown size={13} />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
        <button
          type="button"
          data-testid="load-open-dialog"
          className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-neutral-700 hover:bg-neutral-100"
          onClick={(e) => {
            setLoadDialogOpen(true);
            e.currentTarget.closest("details")?.removeAttribute("open");
          }}
        >
          File, folder, paste, or URL…
        </button>
        <div className="my-1 h-px bg-neutral-100" />
        {adaptersWithSamples().map((adapter) => (
          <button
            key={adapter.id}
            type="button"
            data-testid={`load-sample-${adapter.id}`}
            className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-neutral-700 hover:bg-neutral-100"
            onClick={(e) => {
              loadSample(adapter);
              e.currentTarget.closest("details")?.removeAttribute("open");
            }}
          >
            Sample — {adapter.label}
          </button>
        ))}
        {import.meta.env.DEV && (
          <>
            <button
              type="button"
              className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-neutral-500 hover:bg-neutral-100"
              onClick={(e) => {
                openDocument(makeLargeSample());
                e.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              Large sample (1k topics, dev)
            </button>
            <button
              type="button"
              className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-neutral-500 hover:bg-neutral-100"
              onClick={(e) => {
                openDocument(makeK8sSilhouette());
                e.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              k8s silhouette (1,672 topics, dev)
            </button>
          </>
        )}
      </div>
    </details>
  );
}

function ReviewChangesButton({ tab }: { tab: TabState }) {
  const writable = supportsWriteBack(tab.editor.document);
  // The DISABLED state is exactly where the reason matters, and a
  // disabled control swallows its own pointer events — so the tooltip
  // rides on a wrapper span, not the button (the P1→P2 finding named
  // disabled-control reasons as sharing the native-title defect class).
  const reasonTip = useTooltip(
    writable
      ? null
      : // A CAPABILITY FLIP IS A COPY SWEEP: this named Sphinx and
        // phase 2 until Sphinx grew a planner, at which point it was a
        // sentence telling users a built thing was unbuilt. Written
        // for the mechanism instead of for one adapter, because the
        // mechanism outlives its occupants — docs/08 has a read-only
        // `sidebars.ts` adapter queued behind exactly this affordance.
        [
          "This format can be read but not written back yet, so restructuring stays on the canvas.",
        ],
  );
  return (
    <span className={writable ? "" : "cursor-help"} {...reasonTip.props}>
      <button
        type="button"
        data-testid="review-changes-button"
        // Disabled with a reason, not hidden: a missing button reads
        // as a missing feature, a disabled one explains itself
        // (docs/12, decision 3).
        disabled={!writable}
        className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        onClick={() => useUiStore.getState().setChangesDialogOpen(true)}
      >
        <FileDiff size={14} />
        Review changes
      </button>
      {reasonTip.node}
    </span>
  );
}

export function Header({ tab }: { tab: TabState | null }) {
  const stats = tab ? documentStats(tab.editor.document) : null;
  const derivedNote = tab ? derivedTitlesNote(tab.editor.document) : null;
  const langs = tab ? languageFacts(tab.editor.document) : null;
  const openable = langs ? openableSiblings(langs) : [];
  // Styled tooltips (Tooltip.tsx — the one tooltip system).
  const langTip = useTooltip(
    langs
      ? openable.length > 0
        ? [`Also in this folder: ${openable.map((l) => l.label).join(", ")}`]
        : [
            `The other ${langs.declared.length - 1} are declared by the site but not present in this folder.`,
          ]
      : null,
  );
  const derivedTip = useTooltip(derivedNote ? [derivedNote] : null);
  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-neutral-200 bg-white px-4">
      {/* wordmark lives in the full-height sidebar */}
      {tab && stats && (
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span
            data-testid="doc-name"
            className="truncate text-[13px] font-medium text-neutral-700"
          >
            {tab.name}
          </span>
          <span data-testid="doc-stats" className="text-[12px] text-neutral-400">
            {stats.sections} sections · {stats.total} topics · depth {stats.maxDepth}
          </span>
          {/*
            Every row title on the canvas came from a file path, so none of
            them is the label the published site shows. Said once, at
            document level, beside the document's other facts: a per-row
            marker would mark all 224 rows of a real Mintlify corpus and
            carry no information, and a line in the load dialog would be
            gone the moment the document opened — while the reader who most
            needs this is the reviewer shown a canvas, or a screenshot of
            one, that they did not build (PRODUCT.md).
          */}
          {/*
            PERSISTENT, not a toast: a reader looking at one language's
            tree needs to know the site has sixteen more for as long as
            they are looking at it. States the DECLARED count, because
            that is the true fact about the site; the folder's contents
            decide only what can be opened (docs/14).
          */}
          {langs && (
            <span
              data-testid="language-note"
              // NO `overflow-hidden` here. The truncating span INSIDE
              // does the clipping; putting it on the chip caged the
              // picker's absolute panel in a 21px-tall box and rendered
              // it invisible while every DOM assertion still passed.
              // The span keeps its job; it just stops caging the popover.
              className="flex min-w-0 cursor-help items-center gap-1 self-center rounded-[3px] bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-sky-800"
              {...langTip.props}
            >
              <Languages size={11} className="shrink-0 text-sky-700" aria-hidden="true" />
              <span className="truncate">{languageSummary(langs)}</span>
              <LanguagePicker tab={tab} facts={langs} />
            </span>
          )}
          {langTip.node}
          {derivedNote && (
            <span
              data-testid="derived-titles-note"
              // Shrinkable, and last in the group: the doc-info half of
              // the header is the half that yields, so the chip must give
              // way before the action buttons do rather than paint under
              // them on a narrow window.
              className="flex min-w-0 cursor-help items-center gap-1 self-center overflow-hidden rounded-[3px] bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-amber-800"
              {...derivedTip.props}
            >
              <Signpost
                size={11}
                className="shrink-0 text-amber-700"
                aria-hidden="true"
              />
              <span className="truncate">Page titles from paths</span>
            </span>
          )}
          {derivedTip.node}
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        {tab && (
          <button
            type="button"
            data-testid="overview-button"
            className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
            onClick={() =>
              useUiStore.getState().setOverviewOpen(!useUiStore.getState().overviewOpen)
            }
          >
            <PanelRight size={14} />
            Overview
          </button>
        )}
        {tab && (
          <button
            type="button"
            data-testid="reorganize-button"
            className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
            onClick={() => useUiStore.getState().setAiDialogOpen(true)}
          >
            <Sparkles size={14} />
            Reorganize
          </button>
        )}
        {tab &&
          (isCollectionDocument(tab.editor.document) ? (
            <ReviewChangesButton tab={tab} />
          ) : (
            <button
              type="button"
              data-testid="export-button"
              className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
              onClick={() => exportDocument(tab)}
            >
              <Download size={14} />
              Export
            </button>
          ))}
        <LoadMenu />
      </div>
    </header>
  );
}
