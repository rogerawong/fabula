/**
 * locks.ts — What each lock kind SAYS, in one vocabulary (docs/19).
 *
 * The model half of the lock legend: the view maps each kind to a mark
 * (lockGlyphs.tsx); this file owns the words — the label the Overview
 * breakdown prints, the tier that decides the mark's tone, and the
 * tooltip that explains the kind in cause → consequence → remedy order.
 * One source, three consumers (row glyph, Overview line, tests), so the
 * vocabularies cannot drift apart.
 */

import type { LockKind, Topic, TopicLock } from "./types";

/**
 * Every kind, once — the canonical iteration order for tests and
 * legends. The Records below are keyed on LockKind, so an eighth kind
 * fails `pnpm check` at every table until it is answered.
 */
export const LOCK_KINDS: readonly LockKind[] = [
  "atomic",
  "reference",
  "pattern",
  "globbed",
  "outside-region",
  "external",
  "missing",
];

/**
 * ERROR vs STATE — one slot, two tiers.
 *
 * The membership test: does this mean something in the FILES should
 * change? `missing` is the only yes — a target that does not exist is a
 * fault in the corpus, and the mark renders in the warning token.
 * Every other kind means the app's EDITING MODEL has a boundary here;
 * the corpus is fine, so the mark stays quiet monochrome.
 */
export type LockTier = "error" | "state";
export const LOCK_TIER: Record<LockKind, LockTier> = {
  atomic: "state",
  reference: "state",
  pattern: "state",
  globbed: "state",
  "outside-region": "state",
  external: "state",
  missing: "error",
};

/**
 * The kind's name in the product's vocabulary — Overview breakdown keys,
 * glyph aria-labels, tooltip headings. "Above prose" rather than
 * "outside-region": named for what the author would see on opening the
 * file, not for our region vocabulary (docs/19).
 */
export const LOCK_LABEL: Record<LockKind, string> = {
  atomic: "Kept whole",
  reference: "Reference",
  pattern: "Pattern",
  globbed: "Glob block",
  "outside-region": "Above prose",
  external: "External",
  missing: "Missing",
};

/**
 * Tooltip lines per kind: cause, consequence, remedy — in the house
 * voice, no string serving two kinds (the two-sentence test is a unit
 * test over this table). The first line is the heading the styled
 * tooltip renders emphasized.
 *
 * Kinds that take per-row facts (reference's owner, atomic's count)
 * interpolate them; a missing fact degrades to the general sentence,
 * never to a guessed one.
 */
export function lockTooltip(lock: TopicLock): string[] {
  switch (lock.kind) {
    // promise: "I did not descend; this subtree is N deep" — about SIZE (docs/19)
    case "atomic":
      return [
        "Kept whole",
        "The import did not open this subtree, so its pages are not on the canvas.",
        lock.count !== undefined
          ? `It moves as one unit — ${lock.count.toLocaleString()} entries come with it.`
          : "It moves as one unit.",
      ];
    // promise: "this is a second listing; another is primary" — about IDENTITY (docs/19)
    case "reference":
      return [
        lock.owner !== undefined
          ? `A second listing — the primary one lives in “${lock.owner}”.`
          : "A second listing — another toctree holds the primary one.",
        "Restructuring happens through the primary listing; this one stays pinned so the two cannot drift apart.",
      ];
    // promise: "this line is a pattern, not a docname" — about SYNTAX (docs/19)
    case "pattern":
      return [
        "This line is a glob pattern, not a page.",
        "The pages it pulls in exist only at build time, so there is no entry here to move.",
        "To rearrange them, replace the pattern with explicit entries in the source file.",
      ];
    // block lock, worn by the line: the entry may be an ordinary docname —
    // it is uneditable for a reason that has nothing to do with it (docs/19)
    case "globbed":
      return [
        "In a glob block",
        "A `:glob:` block generates its own entry list, so no line in it is one the app may rewrite — the lock belongs to the block, not to this page.",
        "To edit these entries, replace the block's pattern with explicit entries.",
      ];
    // the block is fine; its POSITION is the problem (docs/19: prose
    // terminates the sequence, blocks above it lock individually)
    case "outside-region":
      return [
        "Above prose",
        "This entry's toctree has prose after it, and the app only rewrites the run of blocks at the end of a file.",
        "To make these editable, move the toctree to the file's end — the app won't rearrange prose for you.",
      ];
    // promise: "this target is outside the project" — about TARGET (docs/19)
    case "external":
      return [
        "This target lives outside the project — a URL or another project's docs.",
        "There is no file here to move; the app leaves the link as written.",
        "Edit the entry in the source file if the link itself should change.",
      ];
    // promise: "this target does not exist" — about TARGET, and the only
    // kind that is a fault rather than a decision (docs/19)
    case "missing":
      return [
        "This target does not exist in the project.",
        "Sphinx drops the entry with a warning, so readers never see it.",
        "Create the missing document, or remove the entry in the source file.",
      ];
  }
}

/**
 * What would UNBOLT this kind — the clause that turns an imagined move
 * into a real one (docs/21, Decision 3).
 *
 * NEW COPY, and deliberately not a quotation of `lockTooltip`'s remedy.
 * The tooltip explains how to unbolt the ROW; this is the same act read
 * as a PRECONDITION for a move the user has already imagined, so it
 * lands in a sentence that ends "…then the move is real". Kept here
 * rather than at the badge because the badge and the checklist are two
 * renderings of one record and a second copy would drift.
 *
 * The CARRIER is interpolated where the ledger derived one and left out
 * entirely where it did not — absent, never guessed, because a
 * plausible-looking filename sends someone to edit a file that has
 * nothing to do with their row.
 *
 * Keyed on `LockKind`, so an eighth kind fails `pnpm check` here and in
 * every table above at the same time.
 */
export function lockUnbolt(kind: LockKind, carrier?: string): string {
  const inFile = carrier ? ` in ${carrier}` : "";
  switch (kind) {
    // THE ONE KIND WHOSE BOUNDARY IS THE APP'S, not the corpus's. Its
    // remedy must never send the user to edit a source file: nothing is
    // wrong with the file, the import simply did not descend.
    case "atomic":
      return "import this subtree instead of keeping it whole";
    case "reference":
      return `edit this entry${inFile} — the primary listing is unaffected`;
    case "pattern":
      return `replace the pattern with explicit entries${inFile}`;
    case "globbed":
      return `replace the block's pattern with explicit entries${inFile}`;
    case "outside-region":
      return `move the toctree run to the end of${carrier ? ` ${carrier}` : " its file"}`;
    case "external":
      return `edit this entry${inFile}`;
    case "missing":
      return `create the missing document, then edit this entry${inFile}`;
  }
}

/**
 * Does the source pin this row in place?
 *
 * THE MODEL LAYER'S PREDICATE, and it lives here because three layers
 * ask it and none of them owns it: the prompt marks pinned rows, the
 * gesture seam asks which rows a drop would displace, and the ledger
 * derives its `pin` records over exactly this set. docs/21's fence names
 * it as the gesture layer's one model-shaped input — "nothing
 * format-shaped" — which is only true while it sits below both.
 *
 * ALL SEVEN LOCK KINDS ANSWER YES, and the uniformity is the point
 * rather than an oversight. `Topic.lock`'s contract is that locked
 * nodes cannot be deleted or renamed and are never rewritten by a
 * planner (dragging left that list in docs/21 arc 2 — see the field's
 * own docblock); the kinds differ in
 * WHY (`atomic` is about size, `reference` about identity, `pattern`
 * about syntax, `external` and `missing` about the target) and none of
 * them differs about WHETHER. docs/19's promise analysis is the receipt:
 * no lock kind says anything about POSITION, which is also why both nets
 * over this predicate are parent-change only.
 *
 * So the model gets ONE marker rather than seven, and the seam asks one
 * question rather than seven. A distinction nobody can act on is a
 * distinction that costs tokens and buys confusion.
 */
export function isPinned(topic: Topic): boolean {
  return topic.lock !== undefined;
}
