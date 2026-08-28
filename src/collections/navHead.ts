/**
 * navHead.ts — The region of a page file that carries navigation (docs/15).
 *
 * A collection snapshot owns the nav, not the file. For folder-based
 * systems the nav is the front matter, so the snapshot keeps each page's
 * NAV HEAD and the body never enters the session at all. Saving splices a
 * new head into the bytes on disk at that moment, which is why a body
 * edit made after load survives: there was never a stale body to write
 * back. Preservation is a construction property, not a guard.
 *
 * THE LAW, and it is not cosmetic: the head runs from byte 0 through the
 * closing fence, EXCLUSIVE of that line's terminator. A head is a PREFIX
 * of the file, so a diff between two heads stays positionally valid for
 * the whole file — but only while it claims no context it did not read.
 * Include the terminator and `split("\n")` yields a trailing empty
 * element, which the differ emits as a blank context line the real file
 * may not have; `git apply` then refuses every page whose body starts
 * immediately after the fence. That is 634 of 1,530 pages (41%) in
 * kubernetes/website, so the wrong boundary is a majority-case bug, not
 * an edge case. docs/15 has the measurement.
 */

import type { FilesSnapshot } from "./types";
import { parseFrontmatter } from "./frontmatter";

/** Pages whose nav lives in front matter; config files are nav in full.
 *  `.html` is here because Hugo renders a front-mattered `.html` under
 *  `content/` as a page (docs/14) — its body is no more ours than a
 *  markdown body is. */
export function isPagePath(path: string): boolean {
  return /\.(mdx?|html)$/i.test(path);
}

/**
 * The file's nav head: byte 0 through the closing fence, without its line
 * terminator. `""` when the file carries no front matter — which is a
 * real value, not a failure: it means "this page contributes no nav
 * metadata", and splicing a head into it later inserts one.
 */
export function navHeadOf(content: string): string {
  const block = parseFrontmatter(content);
  if (!block) return "";
  // `rest` starts at the closing fence's line start, so the head is
  // everything before it plus the three fence characters.
  return content.slice(0, content.length - block.rest.length + 3);
}

/**
 * Replace `current`'s nav head with `head`, leaving every following byte
 * identical. `current` is the file as it is on disk RIGHT NOW, not as it
 * was at load — that is the whole point.
 */
export function spliceNavHead(current: string, head: string): string {
  const block = parseFrontmatter(current);
  if (head === "") {
    // "" is a real nav head, not a missing one: it means "this page
    // contributes no nav metadata". If the file never had front matter
    // there is nothing to remove and nothing to tidy — touching it here
    // would silently reformat a file we were not asked to edit.
    if (!block) return current;
    // Removing front matter: take the terminator that followed the fence
    // with it, or the file gains a leading blank line on every save.
    return block.rest.slice(3).replace(/^\r?\n/, "");
  }
  if (block) return head + block.rest.slice(3);
  // No front matter yet — insert, and supply the terminator the head
  // deliberately does not carry.
  const eol = head.includes("\r\n") ? "\r\n" : "\n";
  return head + eol + current;
}

/**
 * Reduce a snapshot to what the nav actually needs: pages become nav
 * heads, config files (`_category_.json`, `_config.yml`, …) stay whole
 * because for them the file IS the nav.
 *
 * Idempotent, which matters — simulation re-slices snapshots that are
 * already sliced, and a second pass must be a no-op.
 */
export function toNavHeads(files: FilesSnapshot): FilesSnapshot {
  const out: FilesSnapshot = {};
  for (const [path, content] of Object.entries(files)) {
    out[path] = isPagePath(path) ? navHeadOf(content) : content;
  }
  return out;
}
