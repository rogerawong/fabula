/**
 * LoadDialog.tsx — Load a TOC (docs/02 §1, docs/11).
 *
 * One "Open" surface takes a file OR a folder (buttons or drag-and-
 * drop) and auto-detection routes it to the right adapter — the user
 * never has to know whether their docs system is single-file or
 * folder-based. A Format dropdown (default Auto-detect) overrides
 * detection; choosing a specific format constrains the surface to the
 * ingestion that format supports. Paste and URL stay as modes; GitHub
 * /tree/ URLs route to the collection importer automatically.
 *
 * Errors render inline and stay specific; a successful load opens a
 * new tab and closes the dialog.
 */

import { useEffect, useRef, useState } from "react";
import { FileText, FolderOpen, X } from "lucide-react";
import { toast } from "sonner";
import { registerDirectoryHandle } from "@/collections/fsAccess";
import { COLLECTION_ADAPTERS } from "@/collections/registry";
import {
  declaredRootOf,
  needsRootChoice,
  rootCandidates,
  ROOT_KEY,
  type RootCandidate,
} from "@/collections/adapters/sphinx";
import type { FilesSnapshot } from "@/collections/types";
import { FORMAT_ADAPTERS } from "@/formats/registry";
import { KnownUnsupportedFormatError } from "@/formats/types";
import { fetchTocFromUrl, openFromText } from "./loadDocument";
import {
  candidatesFromFileList,
  fetchGitHubFolder,
  openCollection,
  parseGitHubTreeUrl,
  payloadFromDataTransfer,
  pickFolder,
  snapshotFromCandidates,
} from "./loadCollection";
import { useUiStore } from "./uiStore";

type Mode = "open" | "paste" | "url";
/** "" = auto-detect; otherwise an adapter id from either registry. */
type ParserId = string;

const FORMAT_IDS = new Set(FORMAT_ADAPTERS.map((a) => a.id));

/** What ingestion the chosen parser allows. */
function parserConstraint(parser: ParserId): "any" | "file" | "folder" {
  if (parser === "") return "any";
  return FORMAT_IDS.has(parser) ? "file" : "folder";
}

const SUPPORTED_LINE = [...FORMAT_ADAPTERS, ...COLLECTION_ADAPTERS]
  .map((a) => a.label.replace(/\s*\(.*\)$/, ""))
  .join(" · ");

export function LoadDialog() {
  const open = useUiStore((s) => s.loadDialogOpen);
  const setOpen = useUiStore((s) => s.setLoadDialogOpen);
  const [mode, setMode] = useState<Mode>("open");
  const [parser, setParser] = useState<ParserId>("");
  const [pasted, setPasted] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [helpUrl, setHelpUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  /**
   * An import waiting on a root choice (docs/19).
   *
   * Held rather than guessed: the config declared something else, and
   * silently substituting is inventing a default. ONE candidate still
   * ASKS — the app has no standing to choose on the project's behalf,
   * however obvious the answer looks.
   */
  const [pendingRoot, setPendingRoot] = useState<{
    files: FilesSnapshot;
    rootName: string;
    handle: FileSystemDirectoryHandle | null;
    candidatePaths?: readonly string[];
    candidates: RootCandidate[];
    declared: string;
  } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    setDragOver(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const constraint = parserConstraint(parser);
  const formatOverride = constraint === "file" ? parser : undefined;
  const collectionOverride = constraint === "folder" ? parser : undefined;
  const fileAccept =
    constraint === "file"
      ? FORMAT_ADAPTERS.find((a) => a.id === parser)!
          .fileExtensions.map((e) => `.${e}`)
          .join(",")
      : ".yml,.yaml";

  const succeed = (name: string) => {
    setOpen(false);
    setPasted("");
    setUrl("");
    toast.success(`Loaded ${name}`);
  };
  const fail = (err: unknown, fallback: string) => {
    setError(err instanceof Error ? err.message : fallback);
    // A recognized-but-unsupported format carries a link worth following
    // (docs/13); a plain failure does not.
    setHelpUrl(err instanceof KnownUnsupportedFormatError ? (err.helpUrl ?? null) : null);
  };

  const openFile = async (file: File) => {
    if (constraint === "folder") {
      setError(
        `${COLLECTION_ADAPTERS.find((a) => a.id === parser)?.label} imports a docs folder — choose a folder instead.`,
      );
      return;
    }
    try {
      openFromText(await file.text(), file.name, formatOverride);
      succeed(file.name);
    } catch (err) {
      fail(err, "Could not load that document");
    }
  };

  const finishCollection = (
    files: FilesSnapshot,
    rootName: string,
    handle: FileSystemDirectoryHandle | null,
    /** Everything the driver considered, so its skips are reportable. */
    candidatePaths?: readonly string[],
  ) => {
    // THE ROOT PICKER. Ansible declares `root_doc = index` and ships no
    // `index.rst` — its Makefile symlinks one at build time and picks
    // WHICH one by the doc set being built — so today it imports to an
    // empty canvas with a correct explanation that reads like a broken
    // app. ZERO candidates leaves that line exactly as it was.
    if (needsRootChoice(files)) {
      const candidates = rootCandidates(files);
      if (candidates.length > 0) {
        setPendingRoot({
          files,
          rootName,
          handle,
          candidatePaths,
          candidates,
          declared: declaredRootOf(files),
        });
        return;
      }
    }
    const { tabId, label, evidenceCount } = openCollection(
      files,
      rootName,
      collectionOverride,
      candidatePaths,
    );
    if (handle) registerDirectoryHandle(tabId, handle);
    setOpen(false);
    setUrl("");
    toast.success(
      `Imported ${rootName} (${label})` +
        // Neutral, because the array is: it carries refusals AND
        // disclosures like "17 languages declared" (docs/17). Counting
        // OCCURRENCES, not kinds — grouping must not change what this
        // number means.
        (evidenceCount > 0 ? ` — ${evidenceCount} import note(s)` : ""),
    );
  };

  const openFolderCandidates = async (
    candidates: Parameters<typeof snapshotFromCandidates>[0],
    rootName: string,
    handle: FileSystemDirectoryHandle | null,
  ) => {
    if (constraint === "file") {
      setError(
        `${FORMAT_ADAPTERS.find((a) => a.id === parser)?.label} loads a single file — choose a file instead.`,
      );
      return;
    }
    const files = await snapshotFromCandidates(candidates);
    finishCollection(
      files,
      rootName,
      handle,
      candidates.map((c) => c.path),
    );
  };

  const onChooseFolder = async () => {
    setBusy(true);
    setError(null);
    try {
      const picked = await pickFolder();
      if (!picked) return; // cancelled
      await openFolderCandidates(picked.candidates, picked.rootName, picked.handle);
    } catch (err) {
      fail(err, "Could not import that folder");
    } finally {
      setBusy(false);
    }
  };
  const onFolderInput = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const { candidates, rootName } = candidatesFromFileList(list);
      await openFolderCandidates(candidates, rootName, null);
    } catch (err) {
      fail(err, "Could not import that folder");
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (dt: DataTransfer) => {
    // payloadFromDataTransfer must be called synchronously (items go
    // inert when the drop handler yields)
    const payload = payloadFromDataTransfer(dt);
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const dropped = await payload;
        if (!dropped) return;
        if (dropped.kind === "file") await openFile(dropped.file);
        else {
          await openFolderCandidates(
            dropped.candidates,
            dropped.rootName,
            dropped.handle,
          );
        }
      } catch (err) {
        fail(err, "Could not load that drop");
      } finally {
        setBusy(false);
      }
    })();
  };

  const onPaste = () => {
    try {
      openFromText(pasted, "toc.yml", formatOverride);
      succeed("pasted TOC");
    } catch (err) {
      fail(err, "Could not load that document");
    }
  };

  const onUrl = async () => {
    setBusy(true);
    setError(null);
    try {
      if (parseGitHubTreeUrl(url)) {
        if (constraint === "file") {
          setError(
            "A /tree/ URL is a folder import — switch the Format dropdown to Auto-detect or a folder-based system.",
          );
          return;
        }
        const { files, rootName, candidatePaths } = await fetchGitHubFolder(url);
        finishCollection(files, rootName, null, candidatePaths);
        return;
      }
      if (constraint === "folder") {
        setError(
          "That format imports a docs folder — paste a GitHub /tree/ folder URL instead.",
        );
        return;
      }
      const { raw, fileName } = await fetchTocFromUrl(url);
      openFromText(raw, fileName, formatOverride);
      succeed(fileName);
    } catch (err) {
      fail(err, "Could not fetch that URL");
    } finally {
      setBusy(false);
    }
  };

  const tabBtn = (m: Mode, label: string) => (
    <button
      type="button"
      className={`rounded-md px-3 py-1 text-[13px] font-medium ${
        mode === m ? "bg-neutral-800 text-white" : "text-neutral-600 hover:bg-neutral-100"
      }`}
      aria-pressed={mode === m}
      onClick={() => {
        setMode(m);
        setError(null);
      }}
    >
      {label}
    </button>
  );

  if (pendingRoot) {
    const total = Object.keys(pendingRoot.files).filter((f) => f.endsWith(".rst")).length;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30"
        data-testid="root-picker"
      >
        <div className="w-[min(560px,92vw)] rounded-xl border border-neutral-200 bg-white p-5 shadow-xl">
          <h2 className="text-[15px] font-semibold text-neutral-800">
            Root document &ldquo;{pendingRoot.declared}&rdquo; not found
          </h2>
          <p className="mt-1 text-[13px] text-neutral-500">
            Some projects generate it at build time. Each of these is the top of a
            navigation tree &mdash; choose one to import.
          </p>
          <ul className="mt-3 flex flex-col gap-1">
            {pendingRoot.candidates.map((candidate) => (
              <li key={candidate.docname}>
                <button
                  type="button"
                  data-testid="root-candidate"
                  data-docname={candidate.docname}
                  className="flex w-full items-baseline justify-between gap-4 rounded-lg border border-neutral-200 px-3 py-2 text-left hover:bg-neutral-50"
                  onClick={() => {
                    const chosen = pendingRoot;
                    setPendingRoot(null);
                    finishCollection(
                      { ...chosen.files, [ROOT_KEY]: candidate.docname },
                      chosen.rootName,
                      chosen.handle,
                      chosen.candidatePaths,
                    );
                  }}
                >
                  <span className="font-mono text-[13px] text-neutral-800">
                    {candidate.docname}
                  </span>
                  {/*
                    REACH is the label, and it is the only thing that
                    distinguishes two roots a stranger has never seen. It also
                    proves the walk: the same closure, run on corpora whose
                    roots are not in doubt, reproduces numbers known from
                    elsewhere (godot 1,594; cpython 528).
                  */}
                  <span className="shrink-0 text-[12px] text-neutral-500">
                    {candidate.reach} documents
                    {total > candidate.reach
                      ? `, leaving ${total - candidate.reach} outside`
                      : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-neutral-400">
            Documents reachable only from another root will appear as orphans. The choice
            applies to this import only &mdash; nothing is written to conf.py.
          </p>
          <button
            type="button"
            data-testid="root-picker-cancel"
            className="mt-3 text-[12px] text-neutral-500 underline"
            onClick={() => setPendingRoot(null)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Load a table of contents"
        data-testid="load-dialog"
        className="w-[520px] rounded-xl border border-neutral-200 bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-neutral-800">Load a TOC</h2>
          <button
            type="button"
            aria-label="Close dialog"
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-3 flex gap-1">
          {tabBtn("open", "Open")}
          {tabBtn("paste", "Paste")}
          {tabBtn("url", "URL")}
        </div>

        <div className="mt-4">
          {mode === "open" && (
            <div
              data-testid="load-drop-zone"
              className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-[13px] ${
                dragOver
                  ? "border-sky-400 bg-sky-50 text-sky-700"
                  : "border-neutral-300 text-neutral-500"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                onDrop(e.dataTransfer);
              }}
            >
              <span>
                {busy ? "Importing…" : "Drop a TOC file or a whole docs folder here"}
              </span>
              <div className="flex gap-2">
                <label
                  className={`flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 ${
                    constraint === "folder" || busy
                      ? "pointer-events-none opacity-40"
                      : "cursor-pointer"
                  }`}
                >
                  <FileText size={14} />
                  Choose file…
                  <input
                    type="file"
                    accept={fileAccept}
                    data-testid="load-file-input"
                    className="sr-only"
                    disabled={constraint === "folder" || busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void openFile(f);
                    }}
                  />
                </label>
                {"showDirectoryPicker" in window ? (
                  <button
                    type="button"
                    data-testid="load-folder-button"
                    disabled={constraint === "file" || busy}
                    className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                    onClick={() => void onChooseFolder()}
                  >
                    <FolderOpen size={14} />
                    Choose folder…
                  </button>
                ) : (
                  <label
                    className={`flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 ${
                      constraint === "file" || busy
                        ? "pointer-events-none opacity-40"
                        : "cursor-pointer"
                    }`}
                  >
                    <FolderOpen size={14} />
                    Choose folder…
                    <input
                      type="file"
                      data-testid="load-folder-input"
                      className="sr-only"
                      disabled={constraint === "file" || busy}
                      {...{ webkitdirectory: "", directory: "" }}
                      multiple
                      onChange={(e) => void onFolderInput(e.target.files)}
                    />
                  </label>
                )}
              </div>
              {/*
                Say this at the point of choosing, not after the import.
                A docs site's config sits ABOVE its content tree, so
                picking the content folder loses the ignore rules and the
                language table — and the app cannot ask for a parent
                folder it was never granted.
              */}
              <p className="text-[12px] text-neutral-500">
                Pick the <strong>repository root</strong> where you can — Fabula finds the
                docs tree itself, and a site&rsquo;s config (ignore rules, languages)
                lives above the content folder.
              </p>
            </div>
          )}
          {mode === "paste" && (
            <div className="flex flex-col gap-2">
              <textarea
                data-testid="load-paste-input"
                className="h-40 w-full resize-none rounded-lg border border-neutral-300 p-2 font-mono text-[12px] outline-none focus:border-neutral-500"
                placeholder="Paste your TOC YAML here…"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
              />
              <button
                type="button"
                className="self-end rounded-md bg-neutral-800 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
                disabled={!pasted.trim()}
                onClick={onPaste}
              >
                Load pasted TOC
              </button>
            </div>
          )}
          {mode === "url" && (
            <div className="flex flex-col gap-2">
              <input
                type="url"
                data-testid="load-url-input"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-[13px] outline-none focus:border-neutral-500"
                placeholder="https://github.com/owner/repo/tree/main/docs"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && url.trim()) void onUrl();
                }}
              />
              <p className="text-[12px] text-neutral-400">
                File links load one TOC (GitHub blob links are fetched via
                raw.githubusercontent.com); <code>/tree/</code> folder links import the
                whole docs folder.
              </p>
              <button
                type="button"
                className="self-end rounded-md bg-neutral-800 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
                disabled={!url.trim() || busy}
                onClick={() => void onUrl()}
              >
                {busy ? "Fetching…" : "Fetch and load"}
              </button>
            </div>
          )}
        </div>

        {mode !== "paste" && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-[12px] text-neutral-500">
              Format
              <select
                data-testid="load-parser-select"
                className="rounded-md border border-neutral-300 px-2 py-1 text-[12px] text-neutral-700 outline-none focus:border-neutral-500"
                value={parser}
                onChange={(e) => {
                  setParser(e.target.value);
                  setError(null);
                }}
              >
                <option value="">Auto-detect</option>
                <optgroup label="Single file">
                  {FORMAT_ADAPTERS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Docs folder">
                  {COLLECTION_ADAPTERS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <span className="text-right text-[11px] leading-tight text-neutral-400">
              Supported: {SUPPORTED_LINE}
            </span>
          </div>
        )}

        {error && (
          <p
            data-testid="load-error"
            className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[12px] leading-relaxed text-red-700"
          >
            {error}
            {helpUrl && (
              <>
                {" "}
                <a
                  href={helpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline underline-offset-2"
                >
                  Learn more
                </a>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
