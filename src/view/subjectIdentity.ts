/**
 * subjectIdentity.ts — telling two identically-titled focus links apart
 * (docs/17).
 *
 * The panel QUOTES a node's title. It never edits one, never appends an
 * index, never invents a name — a surface that rewrote what the document
 * says would be making a claim the document does not, and this panel is
 * read by people who cannot check it against the source (PRODUCT.md's
 * third audience).
 *
 * So a collision is resolved by ADDING: the path segment where the
 * colliding pages diverge, carried beside the link as secondary text.
 * That is receipts-inline applied to identity — the evidence for which
 * door is which travels with the door, rather than waiting on a hover
 * that a screenshot will never perform.
 *
 * COLLISION-TRIGGERED, never universal. A path beside every link would
 * be noise on the lists where titles already differ, which is most of
 * them; it earns its place only where the title alone stops working.
 *
 * Collisions are a normal corpus condition, not a defect to design
 * against: Just the Docs emits a `duplicate-title` evidence kind for
 * exactly this (`jtd.ts`, where two pages share a title), and
 * kubernetes/website ships six pages titled "Not found" — Katacoda
 * tutorial stubs, each with its own front-matter title.
 */

/** What the panel knows about a subject it is about to draw. */
export interface SubjectIdentity {
  title: string;
  /** Absent for a card-addressed subject, which has no file. */
  path?: string;
}

/** A quoted title, plus what distinguishes it if anything had to. */
export interface SubjectLabel {
  /** Always the input title, byte for byte. */
  title: string;
  /** Secondary text. Present only where a collision forced it. */
  detail?: string;
}

const segments = (path: string): string[] => path.split("/").filter(Boolean);

/** How many leading segments every one of these paths shares. */
function commonPrefixLength(paths: readonly string[][]): number {
  if (paths.length === 0) return 0;
  const [first, ...rest] = paths;
  let n = 0;
  while (n < first!.length && rest.every((p) => p[n] === first![n])) n += 1;
  return n;
}

/**
 * Label a list of subjects, adding a distinguishing detail to any whose
 * title is not unique within THIS list.
 *
 * Scoped to the list as rendered, because that is where the confusion
 * happens: two identical labels the reader can see at once. Collisions
 * outside the rendered slice cost nothing to leave alone.
 */
export function distinguish(entries: readonly SubjectIdentity[]): SubjectLabel[] {
  const byTitle = new Map<string, number[]>();
  entries.forEach((entry, i) => {
    byTitle.set(entry.title, [...(byTitle.get(entry.title) ?? []), i]);
  });

  const out: SubjectLabel[] = entries.map((entry) => ({ title: entry.title }));

  for (const indices of byTitle.values()) {
    if (indices.length < 2) continue;

    const withPath = indices.filter((i) => entries[i]!.path !== undefined);
    // Nothing to distinguish WITH. Leaving both plain is the honest
    // outcome: an invented suffix would separate them on screen while
    // telling the reader nothing about which is which.
    if (withPath.length === 0) continue;

    if (withPath.length === 1) {
      // Only one of the colliding entries has a path, so there is no
      // divergence point to name — the whole path is what separates it
      // from a sibling carrying none. Naming a segment here would pick
      // one arbitrarily out of a path nothing was compared against.
      const only = withPath[0]!;
      out[only]!.detail = entries[only]!.path;
      continue;
    }

    const paths = withPath.map((i) => segments(entries[i]!.path!));
    const shared = commonPrefixLength(paths);
    const tails = paths.map((p) => p.slice(shared));
    // One segment where that is enough; the whole remainder where it is
    // not — a detail repeated across the group distinguishes nothing,
    // which is the failure this fallback exists to avoid.
    const heads = tails.map((t) => t[0] ?? "");
    const enough = new Set(heads).size === heads.length && heads.every(Boolean);

    withPath.forEach((entryIndex, k) => {
      const detail = enough ? heads[k]! : tails[k]!.join("/");
      if (detail) out[entryIndex]!.detail = detail;
    });
  }

  return out;
}
