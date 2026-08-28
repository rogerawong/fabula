/**
 * fsAccess.ts — Write-back for collection documents.
 *
 * WritableTarget abstracts "a place files can be written": the real
 * implementation wraps a FileSystemDirectoryHandle (Chromium's File
 * System Access API); the in-memory one exists because pickers are
 * not test-drivable. saveChanges applies a verified plan with the
 * same SIMULTANEOUS semantics as verify.applyChanges: write every
 * target first, then remove vacated move sources (never removing a
 * path something else just wrote).
 *
 * Directory handles are transient — they can't be serialized, so
 * after a reload the tab keeps its snapshot (patch download works)
 * but saving asks for the folder again. Map lives here, per tab id.
 */

import type { FileChange } from "./types";
import { spliceNavHead } from "./navHead";
import { spliceNavTail } from "./navTail";

// ── Per-tab directory handles ───────────────────────────────

const handles = new Map<string, FileSystemDirectoryHandle>();

export function registerDirectoryHandle(
  tabId: string,
  handle: FileSystemDirectoryHandle,
): void {
  handles.set(tabId, handle);
}

export function getDirectoryHandle(tabId: string): FileSystemDirectoryHandle | null {
  return handles.get(tabId) ?? null;
}

export function releaseDirectoryHandle(tabId: string): void {
  handles.delete(tabId);
}

// ── Writable targets ────────────────────────────────────────

export interface WritableTarget {
  /** Current bytes at `path`, or null when there is no such file.
   *  Splice-on-save reads through this immediately before writing, so
   *  "current" means at save time — not at load time (docs/15). */
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
  removeFile(path: string): Promise<void>;
}

/** Permission dance at save time (a handle picked earlier may have
 *  lost write permission when the page was reloaded). */
export async function ensureWritePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return true;
  return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

/** The real thing: nested-directory traversal over a picked folder. */
export function directoryTarget(root: FileSystemDirectoryHandle): WritableTarget {
  const locate = async (
    path: string,
    create: boolean,
  ): Promise<{ dir: FileSystemDirectoryHandle; name: string }> => {
    const segs = path.split("/");
    const name = segs.pop()!;
    let dir = root;
    for (const seg of segs) {
      dir = await dir.getDirectoryHandle(seg, { create });
    }
    return { dir, name };
  };
  return {
    readFile: async (path) => {
      try {
        const { dir, name } = await locate(path, false);
        const fileHandle = await dir.getFileHandle(name, { create: false });
        return await (await fileHandle.getFile()).text();
      } catch {
        return null; // no such file — a create, or a move whose source moved
      }
    },
    writeFile: async (path, content) => {
      const { dir, name } = await locate(path, true);
      const fileHandle = await dir.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
    },
    removeFile: async (path) => {
      try {
        const { dir, name } = await locate(path, false);
        await dir.removeEntry(name);
      } catch {
        // already gone (or its directory is) — removal is best-effort
      }
    },
  };
}

/** Test double: a WritableTarget over a plain object. */
export function memoryTarget(initial: Record<string, string> = {}): WritableTarget & {
  files: Record<string, string>;
} {
  const files = { ...initial };
  return {
    files,
    readFile: (path) => Promise.resolve(files[path] ?? null),
    writeFile: (path, content) => {
      files[path] = content;
      return Promise.resolve();
    },
    removeFile: (path) => {
      delete files[path];
      return Promise.resolve();
    },
  };
}

/**
 * Resolve what actually gets written for one change.
 *
 * A `navHead` change carries only the front matter, so the bytes to write
 * are that head spliced into whatever is on disk RIGHT NOW — which is how
 * a body edited after load survives (docs/15). A move splices into its
 * SOURCE, because the body travels with the page.
 */
async function bytesFor(target: WritableTarget, change: FileChange): Promise<string> {
  // EXHAUSTIVE ON PURPOSE. This read `region !== "navHead"` and fell
  // through to `newContent`, which was correct while `navHead` was the
  // only member and silently TRUNCATED every byte above a `navTail`
  // region the day a second one arrived — `pnpm check` green throughout,
  // because an inequality is not an exhaustive check. The switch makes
  // the compiler name this site when a third region is added.
  if (change.region === undefined) return change.newContent;
  const readFrom = change.kind === "move" ? change.fromPath : change.path;
  const current = (await target.readFile(readFrom)) ?? "";
  switch (change.region) {
    case "navHead":
      return spliceNavHead(current, change.newContent);
    case "navTail":
      return spliceNavTail(current, change.newContent);
  }
}

/** Apply a change plan: all writes first, then vacate move sources —
 *  a source that another change re-wrote must survive. */
export async function saveChanges(
  target: WritableTarget,
  changes: FileChange[],
): Promise<void> {
  // Every read happens BEFORE any write: a plan may move a→b while b is
  // itself the source of another change, and writing first would splice
  // into bytes this same plan had already replaced.
  const contents = await Promise.all(changes.map((c) => bytesFor(target, c)));

  const written = new Set<string>();
  for (const [i, change] of changes.entries()) {
    const to = change.kind === "move" ? change.toPath : change.path;
    await target.writeFile(to, contents[i]!);
    written.add(to);
  }
  for (const change of changes) {
    if (change.kind === "move" && !written.has(change.fromPath)) {
      await target.removeFile(change.fromPath);
    }
  }
}
