/**
 * provenance.ts — where a tab's document came from (docs/10 amendment
 * 2026-08-19).
 *
 * THE DEFECT IT CLOSES is a conflation between a FACT and its only
 * WITNESS. A reorganized tab was named `"<source> (reorganized)"`, and
 * that name was the entire record of its origin — which provider,
 * which model, which instruction preset, when. It is also the one
 * thing the user is invited to change, so renaming a tab silently
 * deleted the answer to "which model produced this?". The two are now
 * separate: the name is SEEDED from provenance at creation and belongs
 * to the user afterwards; the provenance belongs to the tab and no
 * gesture in the app alters it.
 *
 * WHY IT LIVES UNDER `store/` and not `ai/`. It is tab metadata that
 * the persistence layer serializes; the store must not depend on the
 * AI layer to describe its own state. The AI dialog is a producer of
 * this shape, not its owner.
 *
 * SINGLE PRODUCER, PRE-DECLARED. `kind` has exactly one value today
 * and nothing branches on it. It is here rather than omitted because
 * every other field — provider, model, preset — is meaningless for any
 * other origin, so a second one (an import, a manual duplicate) must
 * add a VARIANT rather than reinterpret these fields. Until that
 * second producer exists, this is a parameterised shape nothing
 * distinguishes from a hardcoded one: staged, not proved.
 *
 * NOT A DIFF. docs/08 names diff-view-between-tabs as the highest-value
 * backlog item and this is its future feed — storage only. Nothing
 * reads provenance for comparison yet, and building a diff UI on top of
 * a shape with one producer would be the same mistake one layer up.
 */

/**
 * What one run was allowed to IMAGINE (docs/21, Decision 2).
 *
 * - `grounded` — proposal space is what the app can apply. Today's
 *   semantics, verbatim: a move the write path refuses is refused at
 *   proposal time, with `validate.ts`'s branch-aware discard copy.
 * - `aspirational` — proposal space is any arrangement of this
 *   document. Moves the app cannot write are CLASSIFIED and labeled
 *   rather than discarded; the write path is untouched.
 *
 * DECLARED HERE, and the placement is the point. This union has two
 * homes — `ReorganizeOptions.mode` (what a run is being asked for) and
 * `TabProvenance.mode` (what a run WAS) — and the store may not depend
 * on the AI layer to describe its own state, which is this file's
 * founding constraint. So the closed union lives with the durable
 * record and `ai/contract.ts` imports it, the direction `ai/settings.ts`
 * already takes for `StorageLike`. Re-declaring the two strings in the
 * AI layer would be the second source of truth this project splits
 * names to avoid.
 *
 * NOT the tab STATE. `TabState.aspirational` answers a different
 * question — may THIS TAB hold pinned displacements going forward — and
 * it mutates, which is precisely why it is not here (docs/21's
 * "run mode and tab state never conflate" fence).
 */
export type RunMode = "grounded" | "aspirational";

/** What produced a tab's document, when the tab did not come from a file. */
export interface TabProvenance {
  kind: "ai-reorganize";
  /** The preset id the run used — `settings.providerId`. */
  providerId: string;
  /** Its human label at the time of the run. Stored rather than looked
   *  up, because a preset can be relabelled or removed and the fact
   *  being recorded is what the run actually used. */
  providerLabel: string;
  model: string;
  presetId: string;
  presetName: string;
  /**
   * What the run was allowed to imagine (docs/21, Decision 7).
   *
   * OPTIONAL, and its absence is an ANSWER rather than a gap: every run
   * recorded before this field existed was grounded by construction, so
   * a provenance without `mode` is a grounded-era run. Written absent
   * rather than defaulted on read, so the payload of an old session
   * round-trips unchanged and no `PERSIST_VERSION` bump is owed.
   */
  mode?: RunMode;
  /** ISO 8601, UTC. */
  at: string;
}

/**
 * The tab name a reorganized document opens under.
 *
 * The MODEL rather than the provider, and rather than the word
 * "reorganized" it replaces: the differential workflow this whole arc
 * exists for is two runs of one document side by side, where "Toc
 * (reorganized)" twice is two identical labels for the two things
 * being compared. `gemini-flash-latest` and `claude-opus-5` tell them
 * apart at a glance in the tab strip, which is the only place the
 * comparison actually happens.
 */
export function provenanceTabName(sourceName: string, provenance: TabProvenance): string {
  return `${sourceName} (${provenance.model})`;
}
