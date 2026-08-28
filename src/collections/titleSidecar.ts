/**
 * titleSidecar.ts — The ONE accessor for the title sidecar (docs/12,
 * decision 1, guardrail 2).
 *
 * A Sphinx toctree entry is labelled by its TARGET document's title, but
 * keeping every target in the snapshot costs 5.4 MB on the reference
 * corpus — over the import caps, and doubled by every tab clone. So the
 * kept snapshot holds the nav-hosting files plus this sidecar: a compact
 * docname → title map, built from bounded head-reads whose content is
 * discarded once the title is out.
 *
 * It has to live INSIDE FilesSnapshot rather than beside it, because
 * `simulatePlan` re-parses the snapshot and compares titles — anything
 * parse cannot see from `files` alone is a title it cannot reproduce.
 *
 * That makes this the one synthetic key in a map documented as
 * path → content, so the guardrails matter more than the code:
 *   1. the key holds a NUL, which no filesystem or GitHub tree can
 *      produce, so collision is impossible rather than unlikely;
 *   2. every read and write goes through here — no adapter or view code
 *      touches the key, and this is the only place the format is
 *      versioned;
 *   3. `realFiles` strips it, so planners and the save path cannot leak
 *      it into a .patch or onto disk;
 *   4. a property test asserts no plan ever names a synthetic key.
 */

import type { FilesSnapshot } from "./types";

/**
 * Reserved snapshot key. The leading NUL is load-bearing: POSIX and
 * Windows both reject it in filenames and GitHub's tree API cannot
 * return it, so no real file can ever collide with this entry.
 */
export const SIDECAR_KEY = "\u0000toc-fable:titles";

/** Bump when the payload shape changes; older payloads degrade to {}. */
const SIDECAR_VERSION = 1;

export function isSidecarKey(key: string): boolean {
  return key === SIDECAR_KEY;
}

/**
 * The stored docname → title map, or `{}` when absent or unreadable.
 * Never throws: a stale session from an older app version must degrade
 * to path-derived titles, not break the import.
 */
export function readTitles(files: FilesSnapshot): Record<string, string> {
  const raw = files[SIDECAR_KEY];
  if (raw === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const { v, titles } = parsed as { v?: unknown; titles?: unknown };
  if (v !== SIDECAR_VERSION) return {};
  if (typeof titles !== "object" || titles === null || Array.isArray(titles)) return {};
  // One bad value invalidates the map: a half-trusted title cache would
  // silently mislabel cards, which is worse than falling back to paths.
  for (const value of Object.values(titles as Record<string, unknown>)) {
    if (typeof value !== "string") return {};
  }
  return { ...(titles as Record<string, string>) };
}

/** A new snapshot carrying `titles`, replacing any existing sidecar. */
export function withTitles(
  files: FilesSnapshot,
  titles: Record<string, string>,
): FilesSnapshot {
  return {
    ...files,
    [SIDECAR_KEY]: JSON.stringify({ v: SIDECAR_VERSION, titles }),
  };
}

/** The snapshot minus any synthetic entries — what may reach disk. */
export function realFiles(files: FilesSnapshot): FilesSnapshot {
  const out: FilesSnapshot = {};
  for (const [key, content] of Object.entries(files)) {
    if (!isSidecarKey(key)) out[key] = content;
  }
  return out;
}
