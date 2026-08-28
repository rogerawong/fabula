/**
 * loadCollection.ts — Folder / GitHub-tree import pipeline for
 * collection adapters (docs/11). Pure helpers are exported for unit
 * tests (pickers aren't Playwright-drivable, GitHub is mocked); the
 * pickers and fetches are thin shells around them.
 *
 * Hard caps refuse oversized imports up front: if the originals can't
 * persist, planChanges breaks after a reload — worse than refusing.
 */

import {
  COLLECTION_ADAPTERS,
  detectCollection,
  getCollectionAdapter,
} from "@/collections/registry";
import { stampLinkIndex, type LinkIndex } from "@/collections/linkIndex";
import { groupIntoEvidence, type ImportOccurrence } from "@/collections/importEvidence";
import {
  filesOf,
  type CollectionAdapter,
  type CollectionWarning,
  type FilesSnapshot,
} from "@/collections/types";
import { useAppStore } from "@/store";

/**
 * Storage cap — applied to what an import KEEPS (`doc.extras.files`),
 * because that is what localStorage has to hold and what every later
 * `planChanges` diffs against.
 *
 * There used to be a `MAX_FILES = 500` beside this, and it is gone rather
 * than resized (docs/15). `git log -S MAX_FILES` returns exactly one
 * commit: both constants entered together under one sentence — "if the
 * originals can't persist, planChanges breaks after a reload" — so the
 * file cap was never a second guard, it was this one counted twice. No
 * per-entry cost was ever measured, and the two that are real are counted
 * elsewhere: localStorage overhead is bytes (here), and per-file read cost
 * is MAX_READ_FILES (below). Naming a successor count would have been the
 * same unmeasured number with a fresher date.
 *
 * What made it safe to drop is that the kept set stopped being the file
 * set: pages are kept as NAV HEADS, so kubernetes/website keeps 446 KB
 * across 1,672 files where whole-file ownership needed 14.79 MB.
 */
export const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

/**
 * Read budget — guards the SCAN, not storage. A toctree walk can touch
 * thousands of files to extract titles it then discards, so this is loose
 * by design: it exists to stop a pathological folder, not to bound a
 * session. Its message says so, so the two failures never read alike.
 */
export const MAX_READ_FILES = 5000;
export const MAX_READ_BYTES = 64 * 1024 * 1024;

const SKIP_SEGMENTS = new Set(["node_modules", "_site", "vendor"]);

/** Build directories (and all dot-dirs) never hold nav sources. */
export function shouldSkipPath(path: string): boolean {
  return path.split("/").some((seg) => seg.startsWith(".") || SKIP_SEGMENTS.has(seg));
}

/** A file any registered collection adapter wants to read. */
export function ingestible(path: string): boolean {
  return COLLECTION_ADAPTERS.some((a) => a.ingests(path));
}

/** Longest directory prefix common to ALL paths → collection-relative
 *  paths (webkitdirectory prefixes everything with the folder name). */
export function stripCommonPrefix(paths: string[]): (path: string) => string {
  if (paths.length === 0) return (p) => p;
  let prefix = paths[0]!.split("/").slice(0, -1);
  for (const path of paths) {
    const segs = path.split("/").slice(0, -1);
    let i = 0;
    while (i < prefix.length && i < segs.length && prefix[i] === segs[i]) i++;
    prefix = prefix.slice(0, i);
  }
  const joined = prefix.join("/");
  if (joined === "") return (p) => p;
  return (p) => (p.startsWith(joined + "/") ? p.slice(joined.length + 1) : p);
}

export interface IngestCandidate {
  path: string;
  size: number;
  read: () => Promise<string>;
}

/** Bytes and files consumed by a scan, against the read budget. */
class ReadBudget {
  private files = 0;
  private bytes = 0;

  spend(byteCount: number): void {
    this.files += 1;
    this.bytes += byteCount;
    if (this.files > MAX_READ_FILES) {
      throw new Error(
        `That folder has too many files to scan (over ${MAX_READ_FILES}). Import a docs subfolder instead.`,
      );
    }
    if (this.bytes > MAX_READ_BYTES) {
      throw new Error(
        `That folder has too many bytes to scan (over ${(MAX_READ_BYTES / 1024 / 1024).toFixed(0)} MB). Import a docs subfolder instead.`,
      );
    }
  }
}

async function readOne(candidate: IngestCandidate, budget: ReadBudget): Promise<string> {
  const content = await candidate.read();
  budget.spend(content.length);
  return content;
}

/**
 * Graph-driven ingest for adapters that implement `expand` (docs/12).
 *
 * Reads the adapter's seed, detects on it, then loops: ask what to read
 * next, read what is new, repeat until a round asks for nothing new.
 * Termination is this visited map, not a counter — a toctree graph has
 * cycles and repeated references, so re-requesting a satisfied path has
 * to be free. A path settles at most twice (head, then full); a full read
 * is never downgraded.
 *
 * Returns null when the adapter does not claim the folder, so the caller
 * falls through to the ordinary read-everything path unchanged.
 */
async function ingestByGraph(
  adapter: CollectionAdapter,
  byPath: Map<string, IngestCandidate>,
  budget: ReadBudget,
): Promise<FilesSnapshot | null> {
  const files: FilesSnapshot = {};
  const read = new Set<string>();
  let claimed = false;

  for (;;) {
    const wanted = adapter.expand!(files).filter(
      (path) => !read.has(path) && byPath.has(path),
    );
    if (wanted.length === 0) break;

    const queue = [...new Set(wanted)];
    for (const path of queue) read.add(path);
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        for (;;) {
          const path = queue.shift();
          if (path === undefined) return;
          files[path] = await readOne(byPath.get(path)!, budget);
        }
      }),
    );

    if (!claimed) {
      // Detect on the seed, before paying for the walk.
      if (adapter.detect(files) < 0.5) return null;
      claimed = true;
    }
  }
  // A GRAPH INGEST SUCCEEDS ONLY IF THE WALK REACHED SOMETHING THE SEED
  // DID NOT NAME. Claiming the folder is not the same as walking it:
  // ansible declares `root_doc = index` and ships no `index.rst` — its
  // Makefile symlinks one at build time — so the walk starts, finds no
  // root, and stops with `conf.py` in hand. Returning that as a
  // successful ingest hands the app a one-file snapshot and no way to
  // discover what the project actually contains, which is precisely the
  // corpus the root-candidate picker exists for.
  //
  // Falling through costs an eager read under the existing caps, and it
  // is the same read every non-graph adapter already gets.
  const seed = new Set(adapter.expand!({}));
  const walked = Object.keys(files).some((path) => !seed.has(path));
  return claimed && walked ? files : null;
}

/** Filter, read (6 at a time), strip the common prefix. */
export async function snapshotFromCandidates(
  candidates: IngestCandidate[],
): Promise<FilesSnapshot> {
  const eligible = candidates.filter(
    (c) => !shouldSkipPath(c.path) && ingestible(c.path),
  );
  if (eligible.length === 0) {
    throw new Error(
      "No documentation files (.md, .mdx, .rst, _category_.json, _config.yml) found in that folder.",
    );
  }

  const rel = stripCommonPrefix(eligible.map((c) => c.path));
  const budget = new ReadBudget();

  // Graph-driven adapters get first refusal: their seed is a couple of
  // files, so probing costs almost nothing and detection happens before
  // any bulk read.
  const byPath = new Map<string, IngestCandidate>();
  for (const c of eligible) byPath.set(rel(c.path), c);
  for (const adapter of COLLECTION_ADAPTERS) {
    if (!adapter.expand) continue;
    const graphed = await ingestByGraph(adapter, byPath, budget);
    if (graphed !== null) return graphed;
  }

  const files: FilesSnapshot = {};
  const queue = [...eligible];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (;;) {
        const c = queue.shift();
        if (!c) return;
        files[rel(c.path)] = await readOne(c, budget);
      }
    }),
  );
  return files;
}

/**
 * A parse-time warning, read as one import occurrence. Adapters emit
 * `CollectionWarning` today; the split (docs/17) leaves that type
 * plan-side, where `blocking` gates saving, and this path carries the
 * neutral observations the old name was starving of.
 */
function toOccurrence(warning: CollectionWarning): ImportOccurrence {
  return { kind: warning.kind, detail: warning.detail };
}

/**
 * What the DRIVER dropped before any adapter saw it (docs/17).
 *
 * `shouldSkipPath` and `ingestible` filter candidates in
 * `snapshotFromCandidates`, so those files never reach `parse` and no
 * adapter can report them. A writer that assumed `parse` saw everything
 * would under-report exactly the skips the Overview panel exists to
 * surface — silently, which is worse than not having the panel.
 *
 * Counted once each, under the reason that dropped it first: a `.png`
 * inside `node_modules` is one skipped file, and counting it twice
 * would make the totals disagree with the folder.
 */
export function driverSkipOccurrences(
  candidatePaths: readonly string[],
): ImportOccurrence[] {
  const occurrences: ImportOccurrence[] = [];
  for (const path of candidatePaths) {
    if (shouldSkipPath(path)) {
      occurrences.push({
        kind: "driver-skipped-path",
        detail: "files in build or dot directories, never read",
        receipt: "shouldSkipPath: node_modules, _site, vendor, dot-directories",
      });
      continue;
    }
    if (!ingestible(path)) {
      occurrences.push({
        kind: "driver-not-ingestible",
        detail: "files no installed adapter reads",
        receipt: "CollectionAdapter.ingests",
      });
    }
  }
  return occurrences;
}

/** Refuse a KEPT snapshot that localStorage could not hold (docs/12). */
function enforceStorageCaps(files: FilesSnapshot): void {
  let bytes = 0;
  for (const content of Object.values(files)) bytes += content.length;
  if (bytes > MAX_TOTAL_BYTES) {
    throw new Error(
      `Those files total ${(bytes / 1024 / 1024).toFixed(1)} MB — the limit is ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(0)} MB. Import a docs subfolder instead.`,
    );
  }
}

/** Detect the owning adapter, parse, open in a NEW tab, never a
 *  silent replace.
 *  Parse warnings ride along in extras for the review dialog.
 *  `adapterId` overrides auto-detection (the Format dropdown). */
export function openCollection(
  files: FilesSnapshot,
  rootName: string,
  adapterId?: string,
  /**
   * Every path the driver CONSIDERED, before `shouldSkipPath` /
   * `ingestible` filtered it. Without this the writer can only report
   * what `parse` saw, and the skips would go missing silently.
   */
  candidatePaths?: readonly string[],
): { tabId: string; label: string; evidenceCount: number } {
  const adapter = adapterId ? getCollectionAdapter(adapterId) : detectCollection(files);
  if (!adapter) {
    throw new Error(
      "Couldn't recognize a supported docs system in those files. " +
        "If you know what it is, pick it from the Format dropdown and try again.",
    );
  }
  const { doc, warnings, evidence: adapterEvidence } = adapter.parse(files, rootName);
  if (doc.sections.length === 0) {
    throw new Error(
      "No navigation pages found — the files parsed but none carry nav metadata.",
    );
  }
  // Only now is the kept set known: a graph-driven adapter decides during
  // parse which of the files it read are worth keeping.
  enforceStorageCaps(filesOf(doc));

  // The single writer, aggregating at write time (docs/17): one record
  // per kind, with its count and up to 20 exemplars. Grouping here — not
  // in the panel — is what makes the stored form bounded rather than
  // proportional to the corpus.
  // Merged at the occurrence level, then grouped ONCE: the driver and
  // the adapter observe different things, and a kind seen by both must
  // come out as one record with one count.
  const evidence = groupIntoEvidence([
    ...driverSkipOccurrences(candidatePaths ?? []),
    ...(adapterEvidence ?? []),
    ...warnings.map(toOccurrence),
  ]);
  // The import stamp belongs HERE, not in `parse`: `parse` is pure, and
  // a clock read inside it makes two parses of the same bytes differ.
  // This is the layer that knows when the import happened, so it is the
  // layer that says so — and every display of a count reads its "as of
  // import" from this one write.
  const harvested = (doc.extras as { linkIndex?: LinkIndex } | undefined)?.linkIndex;
  doc.extras = {
    ...(doc.extras as Record<string, unknown>),
    importEvidence: evidence,
    ...(harvested
      ? { linkIndex: stampLinkIndex(harvested, new Date().toISOString()) }
      : {}),
  };
  const tabId = useAppStore.getState().openDocument(doc);
  // Occurrences, not kinds. Grouping must not silently change what this
  // number counts — the toast has always meant "how many things did the
  // import observe".
  const evidenceCount = evidence.reduce((total, record) => total + record.count, 0);
  return { tabId, label: adapter.label, evidenceCount };
}

// ── Local folder pickers ────────────────────────────────────

/** webkitdirectory fallback (all desktop browsers, read-only). */
export function candidatesFromFileList(list: ArrayLike<File>): {
  candidates: IngestCandidate[];
  rootName: string;
} {
  const files = Array.from(list);
  const candidates: IngestCandidate[] = files.map((f) => ({
    path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    size: f.size,
    read: () => f.text(),
  }));
  const first = candidates[0]?.path ?? "";
  const rootName = first.includes("/") ? first.split("/")[0]! : "Imported docs";
  return { candidates, rootName };
}

/** Chromium: File System Access picker — keeps a write handle for
 *  saving back. Returns null when the user cancels. */
export async function pickFolder(): Promise<{
  candidates: IngestCandidate[];
  rootName: string;
  handle: FileSystemDirectoryHandle;
} | null> {
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await window.showDirectoryPicker({ mode: "read", id: "toc-fable-docs" });
  } catch {
    return null; // cancelled
  }
  const candidates: IngestCandidate[] = [];
  await walkDirectory(handle, "", candidates);
  return { candidates, rootName: handle.name, handle };
}

/**
 * Open one sibling language as its OWN document tab (docs/14).
 *
 * Reads through the RETAINED directory handle — the same one
 * splice-save re-reads through — so nothing about the current document's
 * snapshot is touched: the new tab gets its own files, its own caps and
 * its own plan. Preloading sibling nav heads into the open document was
 * rejected for exactly that reason (it would conflate cap accounting
 * across two documents and front-load the cost of a door nobody opened).
 *
 * Handle-less imports never reach here — the picker disables those
 * entries with a reason instead of half-opening (docs/14, decision-5
 * pattern).
 */
export async function openLanguageFromHandle(
  handle: FileSystemDirectoryHandle,
  contentDir: string,
  rootName: string,
): Promise<{ tabId: string; label: string; evidenceCount: number }> {
  if ((await handle.queryPermission({ mode: "read" })) !== "granted") {
    if ((await handle.requestPermission({ mode: "read" })) !== "granted") {
      throw new Error(
        "Permission to read that folder has lapsed — re-import it to open this language.",
      );
    }
  }
  const candidates: IngestCandidate[] = [];
  await walkDirectory(handle, "", candidates);
  // Only this language's tree, plus the config that described it.
  const inLanguage = candidates.filter(
    (c) => c.path === contentDir || c.path.startsWith(contentDir + "/"),
  );
  // Counted BEFORE the config is added: hugo.toml lives at the granted
  // root and would otherwise make an empty language look non-empty.
  if (inLanguage.length === 0) {
    throw new Error(`No content found under ${contentDir}.`);
  }
  const scoped = [
    ...inLanguage,
    ...candidates.filter((c) => CONFIG_AT_ROOT.test(c.path)),
  ];
  const files = await snapshotFromCandidates(scoped);
  return openCollection(
    files,
    rootName,
    undefined,
    scoped.map((c) => c.path),
  );
}

/** A Hugo config at the granted root — carried along so the new document
 *  reads the same language table rather than re-deriving one. */
const CONFIG_AT_ROOT = /^(hugo|config)\.(toml|yaml|yml|json)$/i;

async function walkDirectory(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: IngestCandidate[],
): Promise<void> {
  for await (const entry of dir.values()) {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.kind === "directory") {
      if (entry.name.startsWith(".") || SKIP_SEGMENTS.has(entry.name)) continue;
      await walkDirectory(entry as FileSystemDirectoryHandle, path, out);
    } else if (ingestible(path)) {
      const file = await (entry as FileSystemFileHandle).getFile();
      out.push({ path, size: file.size, read: () => file.text() });
    }
  }
}

/** What landed on the drop zone: one file, or one whole folder. */
export type DroppedPayload =
  | { kind: "file"; file: File }
  | {
      kind: "folder";
      candidates: IngestCandidate[];
      rootName: string;
      /** Chromium drops carry a real handle → save-back works. */
      handle: FileSystemDirectoryHandle | null;
    }
  | null;

/**
 * Route a drag-and-drop payload. MUST be called synchronously from the
 * drop event — DataTransfer items go inert once the handler yields, so
 * every getter runs before the first await.
 */
export function payloadFromDataTransfer(dt: DataTransfer): Promise<DroppedPayload> {
  const item = Array.from(dt.items).find((i) => i.kind === "file");
  if (!item) return Promise.resolve(null);
  // all sync, before any await:
  const handlePromise =
    (
      item as DataTransferItem & {
        getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
      }
    ).getAsFileSystemHandle?.() ?? null;
  const entry = item.webkitGetAsEntry();
  const file = item.getAsFile();

  return (async () => {
    const handle = handlePromise ? await handlePromise.catch(() => null) : null;
    if (handle?.kind === "directory") {
      const dir = handle as FileSystemDirectoryHandle;
      const candidates: IngestCandidate[] = [];
      await walkDirectory(dir, "", candidates);
      return { kind: "folder" as const, candidates, rootName: dir.name, handle: dir };
    }
    if (entry?.isDirectory) {
      // non-Chromium folder drop: FileSystemEntry traversal, read-only
      const candidates: IngestCandidate[] = [];
      await walkEntry(entry as FileSystemDirectoryEntry, "", candidates);
      return {
        kind: "folder" as const,
        candidates,
        rootName: entry.name,
        handle: null,
      };
    }
    return file ? { kind: "file" as const, file } : null;
  })();
}

function readEntryBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function walkEntry(
  dir: FileSystemDirectoryEntry,
  prefix: string,
  out: IngestCandidate[],
): Promise<void> {
  const reader = dir.createReader();
  for (;;) {
    const batch = await readEntryBatch(reader); // readEntries pages
    if (batch.length === 0) return;
    for (const entry of batch) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory) {
        if (entry.name.startsWith(".") || SKIP_SEGMENTS.has(entry.name)) continue;
        await walkEntry(entry as FileSystemDirectoryEntry, path, out);
      } else if (ingestible(path)) {
        const file = await new Promise<File>((resolve, reject) =>
          (entry as FileSystemFileEntry).file(resolve, reject),
        );
        out.push({ path, size: file.size, read: () => file.text() });
      }
    }
  }
}

// ── GitHub folder URLs ──────────────────────────────────────

export interface GitHubTreeRef {
  owner: string;
  repo: string;
  /** Everything after /tree/ — ref and path, ambiguous until probed. */
  rest: string;
}

export function parseGitHubTreeUrl(url: string): GitHubTreeRef | null {
  const m = url
    .trim()
    .match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/(.+?)\/*$/);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!, rest: m[3]! };
}

function rateLimited(res: Response): boolean {
  return res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0";
}

const RATE_LIMIT_MESSAGE =
  "GitHub's API rate limit is exhausted (60 requests/hour unauthenticated). " +
  "Try again later, or import a local clone of the repository.";

async function getJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const res = await fetchImpl(url);
  if (rateLimited(res)) throw new Error(RATE_LIMIT_MESSAGE);
  if (res.status === 404) {
    throw new Error("GitHub repository not found (is it private?).");
  }
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${url}`);
  return res.json();
}

/**
 * Import a GitHub folder: resolve the branch (refs may contain "/" —
 * default branch first, then ≤3 prefix probes against the tree API),
 * list via git/trees?recursive=1, fetch blobs from
 * raw.githubusercontent.com (unmetered by the API quota).
 */
export async function fetchGitHubFolder(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ files: FilesSnapshot; rootName: string; candidatePaths: string[] }> {
  const ref = parseGitHubTreeUrl(url);
  if (!ref) {
    throw new Error(
      "That doesn't look like a GitHub folder URL (https://github.com/owner/repo/tree/branch/path).",
    );
  }
  const api = `https://api.github.com/repos/${ref.owner}/${ref.repo}`;
  const meta = (await getJson(fetchImpl, api)) as { default_branch?: unknown };
  const defaultBranch = String(meta.default_branch ?? "main");

  const segs = ref.rest.split("/");
  const candidates: { branch: string; sub: string }[] = [];
  if (ref.rest === defaultBranch || ref.rest.startsWith(defaultBranch + "/")) {
    candidates.push({
      branch: defaultBranch,
      sub: ref.rest.slice(defaultBranch.length).replace(/^\//, ""),
    });
  }
  for (let n = 1; n <= Math.min(3, segs.length); n++) {
    const branch = segs.slice(0, n).join("/");
    if (candidates.some((c) => c.branch === branch)) continue;
    candidates.push({ branch, sub: segs.slice(n).join("/") });
  }

  interface TreeEntry {
    path?: string;
    type?: string;
    size?: number;
  }
  let tree: TreeEntry[] | null = null;
  let chosen: { branch: string; sub: string } | null = null;
  for (const cand of candidates.slice(0, 3)) {
    // the tree API takes the ref as ONE path segment — encode slashes
    const res = await fetchImpl(
      `${api}/git/trees/${encodeURIComponent(cand.branch)}?recursive=1`,
    );
    if (res.status === 404 || res.status === 422) continue;
    if (rateLimited(res)) throw new Error(RATE_LIMIT_MESSAGE);
    if (!res.ok) throw new Error(`GitHub answered ${res.status} listing the tree.`);
    const body = (await res.json()) as { tree?: TreeEntry[]; truncated?: boolean };
    if (body.truncated === true) {
      throw new Error(
        "That repository is too large to list remotely — import a local clone instead.",
      );
    }
    tree = body.tree ?? [];
    chosen = cand;
    break;
  }
  if (!tree || !chosen) {
    throw new Error(
      `Couldn't resolve a branch from "${ref.rest}" — check the URL's branch name.`,
    );
  }

  const prefix = chosen.sub === "" ? "" : chosen.sub + "/";
  // raw.githubusercontent.com wants the branch as literal segments
  const branchPath = chosen.branch.split("/").map(encodeURIComponent).join("/");
  const rawBase = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${branchPath}/`;
  const blobCandidates: IngestCandidate[] = tree
    .filter(
      (e): e is { path: string; type: string; size?: number } =>
        e.type === "blob" &&
        typeof e.path === "string" &&
        (prefix === "" || e.path.startsWith(prefix)),
    )
    .map((e) => ({
      path: e.path.slice(prefix.length),
      size: e.size ?? 0,
      read: async () => {
        const rawUrl = rawBase + e.path.split("/").map(encodeURIComponent).join("/");
        const attempt = async () => {
          const r = await fetchImpl(rawUrl);
          if (!r.ok) throw new Error(`GitHub answered ${r.status} for ${e.path}`);
          return r.text();
        };
        try {
          return await attempt();
        } catch {
          return await attempt(); // one retry — raw fetches are flaky-cheap
        }
      },
    }));

  const files = await snapshotFromCandidates(blobCandidates);
  const rootName =
    chosen.sub === "" ? ref.repo : (chosen.sub.split("/").pop() ?? ref.repo);
  // Every path this door CONSIDERED, so the writer can report what the
  // driver skipped here too. Without it the same folder reports its
  // skips through the picker and stays silent through a GitHub URL.
  return { files, rootName, candidatePaths: blobCandidates.map((c) => c.path) };
}
