/**
 * constraints.ts — the ONE place a run's source constraints are
 * declared, and the two places they are consumed (docs/10 amendment
 * 2026-08-19).
 *
 * ## The incident this exists for
 *
 * 2026-08-19, whole-godot reorganize. The Sphinx source pins rows in
 * place; `validate.ts`'s lock net enforces the pin; the prompt never
 * mentioned it. The model moved "Using the Project Manager", the entire
 * result was discarded, and a paid call at corpus scale bought nothing.
 * The rule was real, the enforcement was correct, and the only party who
 * could have complied was the one party never told.
 *
 * This is the SECOND instance of a recorded class, and the first one's
 * fix is the precedent: the Hugo reparent refusal was enforced with no
 * prompt line until docs/16 step 6a (`8a193af`) added the `moves`
 * branch. That fix was correct and left a hole of its own — it created
 * a second, hand-wired path from a source fact to a prompt sentence,
 * so "a constraint enforced but uncommunicated" stopped being one
 * pattern and became two one-offs. A third would have been a third.
 *
 * ## Parity is structural, not vigilant
 *
 * A constraint is one member of a discriminated union. Both consumers —
 * `constraintPromptLines` (what the model is TOLD) and
 * `explicitViolations` (what is CHECKED) — switch over that union
 * exhaustively, so a new kind cannot compile until both sides answer
 * for it. There is no diff that adds enforcement while forgetting the
 * prompt, in the same way the per-provider key map made it impossible
 * to pair one provider's credential with another's URL: not a rule
 * somebody remembers, an arrangement in which the mistake has nowhere
 * to live.
 *
 * ## Two consumers, and a third that is deliberately unchanged
 *
 * `validate.ts`'s post-reconstruct nets are the COMPLETE enforcer and
 * this arc does not touch their semantics. `explicitViolations` is a
 * SOUND-BUT-INCOMPLETE pre-check whose only job is to make a violation
 * reachable by the guided retry that already exists — a rescue for a
 * call that would otherwise be spent, never a second opinion. Where
 * placement is ambiguous it declines to judge and says so at the
 * clause, because a false positive here spends the one retry
 * correcting an answer that was already correct.
 *
 * ## What is NOT in here yet, and why that is a boundary rather than an
 * oversight
 *
 * Never-empty containers and `nodesNeedTargets` are also source facts
 * with prompt blocks, and they already have one producer each feeding
 * both sides — they are parity-compliant by hand. Folding them in is a
 * refactor this arc did not rule on. Renames are the interesting
 * omission: `renameCapability` is enforced in `validate.ts` by SILENTLY
 * DROPPING a rename the format cannot record, which is the same class
 * with a milder failure — output tokens spent on work that vanishes,
 * and a summary reading "0 renamed" with no explanation. Recorded here
 * rather than fixed, because its enforcement is "ignore" and not
 * "discard", so none of D3's or D4's machinery applies to it.
 */

import type { Section, TocDocument, Topic } from "@/model/types";
import type { IdMap, ReorganizeOptions, ResultNode, RunMode } from "./contract";
import { fileMovesAllowed } from "./permissions";
import { isPinned } from "@/model/locks";
import { createCards, reorderCards } from "@/formats/registry";

/**
 * The inline mark a pinned row carries in the outline.
 *
 * SHORT on purpose. It is paid per row on every request for the life of
 * the feature, and at godot scale the pinned set runs to hundreds — see
 * the token measurement in docs/10 and `scripts/measure-constraint-cost.ts`.
 */
export const PINNED_MARKER = "[pinned]";

export interface PinnedRow {
  /** The compact outline id — the only name the model has for this row. */
  id: string;
  title: string;
}

/**
 * One constraint the source places on this run.
 *
 * Adding a member obliges an answer in `constraintPromptLines` AND in
 * `explicitViolations`; both switches are exhaustive and `pnpm check`
 * names whichever one you missed. "No violations to pre-check" is a
 * legitimate answer — see reparent — but it has to be written down.
 */
export type RunConstraint =
  /**
   * Rows the source pins. Absent entirely when the document pins
   * nothing, so an unconstrained run carries no boilerplate about a
   * state its documents cannot be in.
   *
   * The MODE rides the member rather than being passed separately to
   * each consumer (docs/21, Decision 5). One producer resolved it once;
   * two consumers that each took a `mode` argument could be handed
   * different ones, which is the disagreement this whole object exists
   * to make impossible.
   */
  | { kind: "pinned-rows"; rows: PinnedRow[]; mode: RunMode }
  /**
   * May a topic change section at all this run?
   *
   * GROUNDED: capability ∧ permission. ASPIRATIONAL: yes, unconditional
   * — proposal space is wide by definition, and the consent this branch
   * used to carry has moved to apply time (docs/21, R4). Resolved by the
   * producer, so the field means exactly what it says at every reader:
   * may the model list a topic under a different section THIS RUN.
   */
  | { kind: "reparent"; allowed: boolean }
  /**
   * May this run add a top-level card, and may it put the cards in a
   * different order?
   *
   * TWO MEMBERS, NOT ONE, because they are two refusals with two
   * remedies: Hugo creates a card happily and writes no cross-card order
   * at all, so a single `structuralEdits` member would make one sentence
   * stand in for both and be wrong about one of them.
   *
   * THE MODE FIELD, and why it arrived (docs/22, Decision 6). These
   * members shipped WITHOUT one, with the reason stated: "a displaced ROW
   * can be labeled and handed to the user; a created card cannot — every
   * ledger record names a row, so creation is not a projectable record
   * kind" (docs/21, Decision 9's addendum). Reframing per mode would have
   * promised a label that did not exist.
   *
   * docs/22 mints the label: creation and card order are derived
   * remainder kinds with a badge policy, a checklist remedy and an
   * applyable projection. So the reason RETIRES WITH ITS CAUSE — the same
   * reversal-with-its-cause the streaming amendment performed on the
   * truncation-capture ruling — and the framing lands.
   *
   * `allowed` STILL ARRIVES FROM THE ADAPTER and no mode widens it: what
   * the plan can WRITE does not change because the user asked to imagine.
   * The mode changes only what the model is TOLD to do about it —
   * prohibition in grounded, permission-with-a-consequence in
   * aspirational, where the consequence is the label.
   */
  | { kind: "create-cards"; allowed: boolean; mode: RunMode }
  | { kind: "reorder-cards"; allowed: boolean; mode: RunMode };

/**
 * Read every constraint this run is under, from the document and the
 * options. Pure, and called with the same three arguments by both
 * consumers, so there is no version of this that can disagree with
 * itself.
 */
export function buildConstraints(
  doc: TocDocument,
  options: Pick<ReorganizeOptions, "allowFileMoves" | "mode">,
  idMap: IdMap,
): RunConstraint[] {
  const constraints: RunConstraint[] = [];

  // Walked over the ID MAP rather than the document: a row with no
  // compact id cannot be named in the answer, so it cannot be moved by
  // the answer either, and listing it would be an instruction the model
  // has no way to follow. Hidden descendants of a truncated subtree
  // travel with their parent by children-follow and are pinned by
  // construction.
  const rows: PinnedRow[] = [];
  for (const [id, entry] of idMap) {
    if (entry.kind === "topic" && isPinned(entry.topic)) {
      rows.push({ id, title: entry.topic.title });
    }
  }
  if (rows.length > 0)
    constraints.push({ kind: "pinned-rows", rows, mode: options.mode });

  constraints.push({
    kind: "reparent",
    allowed: options.mode === "aspirational" || fileMovesAllowed(doc, options),
  });
  // READ OFF THE DOCUMENT'S OWN ADAPTER, with no mode term: what the
  // plan can write does not widen because the user asked to imagine.
  constraints.push({
    kind: "create-cards",
    allowed: createCards(doc),
    mode: options.mode,
  });
  constraints.push({
    kind: "reorder-cards",
    allowed: reorderCards(doc),
    mode: options.mode,
  });
  return constraints;
}

/** How many rows this run marked as pinned — the fact the discard copy
 *  needs in order to claim the model was told. */
export function pinnedRowCount(constraints: RunConstraint[]): number {
  for (const c of constraints) if (c.kind === "pinned-rows") return c.rows.length;
  return 0;
}

/**
 * What the model is TOLD about this constraint.
 *
 * Exhaustive over `RunConstraint`. The pinned block explains the marker
 * ONCE rather than listing every id: the marker is already beside the
 * row in the outline, which is the point of use, and a second copy of
 * the same set in the system message would be O(rows) tokens spent
 * saying what the outline already says at the place it matters. Naming
 * ids is right where the thing is INVISIBLE — that is why
 * `neverEmptyGroups` lists them, containers having no outline presence
 * at all — and wrong where it is already on the line.
 */
export function constraintPromptLines(constraint: RunConstraint): string[] {
  switch (constraint.kind) {
    case "pinned-rows":
      // SAME MARKERS, DIFFERENT FRAMING (docs/21, Decision 5). The rows
      // carry the identical `[pinned]` mark in both modes and the
      // outline is byte-identical; what changes is this block, and the
      // payload-diff test asserts that nothing else does.
      //
      // The aspirational wording is NOT silence about the pins. An
      // informed dream beats an ignorant one: the model can weigh a
      // pinned move's cost and spend it where the structure demands it.
      // "Prefer few" is advisory — nothing enforces a minimum — which is
      // correct, because the enforcer downstream classifies rather than
      // refuses, so no enforced-but-uncommunicated gap opens in either
      // direction.
      return constraint.mode === "aspirational"
        ? [
            "",
            `PINNED ROWS: lines ending in ${PINNED_MARKER} are pinned in place by the`,
            "source document — the app cannot write a move of these rows; a",
            "human can. You MAY move them when the arrangement genuinely calls",
            "for it: each such move will be labeled for the user to carry out",
            "by hand. Prefer arrangements that need few pinned moves over",
            `arrangements that need many. Never rename a ${PINNED_MARKER} row.`,
          ]
        : [
            "",
            `PINNED ROWS: lines ending in ${PINNED_MARKER} are pinned in place by`,
            "the source document. Keep each of them under the exact same parent it",
            "already has — you may reorder it among its current siblings, but do",
            `not move it to another section, and never rename a ${PINNED_MARKER} row.`,
            "A single moved pinned row causes the whole answer to be rejected.",
          ];
    // The refusal line is IDENTICAL whether the capability or the toggle
    // refused, because the model does not care which of the two stopped
    // it — only that it must not do this. Distinguishing them here would
    // leak a UI state into a system message for no gain. (Moved verbatim
    // from `prompt.ts` with docs/16's reasoning intact; the sentence is
    // unchanged so this arc's diff is a rewiring and not a copy change.)
    case "reparent":
      return constraint.allowed
        ? [
            "- To move a topic into a different section, list it under that",
            "  section. Its children follow it.",
          ]
        : [
            "- Do NOT move a topic to a different section. Reorder within each",
            "  section only.",
          ];
    // SILENT WHERE THE SYSTEM CAN DO IT. The permissive branch of each of
    // these is already covered — `allowNewSections` renders the creation
    // syntax, and card order needs no instruction when it is writable —
    // so a second sentence saying "you may" would be tokens spent
    // repeating the grammar block.
    //
    // The prohibitive branch says WHY, in one line. "Do NOT create new
    // sections" already appears when the run's toggle is off; this one
    // states the different fact that no setting can turn it on, which is
    // what stops a model treating it as a preference.
    case "create-cards":
      if (constraint.allowed) return [];
      // ASPIRATIONAL SAYS WHAT HAPPENS TO IT, not that it may not
      // happen: "never create one" is false of a mode whose posture is
      // that the arrangement may exceed the write path. The consequence
      // IS the communication — the card is labeled and handed over.
      return constraint.mode === "aspirational"
        ? [
            "- This documentation system cannot add a new card to its",
            "  navigation, but you MAY create one when the arrangement calls",
            "  for it: each new card will be labeled for the user to carry",
            "  out by hand.",
          ]
        : [
            "- This documentation system cannot add a new card to its",
            "  navigation, so never create one. Rearrange within the cards",
            "  that already exist.",
          ];
    case "reorder-cards":
      if (constraint.allowed) return [];
      return constraint.mode === "aspirational"
        ? [
            "- This system writes the top-level card order in the source",
            "  file's own layout, which it does not rewrite — but you MAY",
            "  reorder them when the arrangement calls for it: the new order",
            "  will be labeled for the user to carry out by hand.",
          ]
        : [
            "- Keep the top-level cards in the order they appear in the",
            "  outline. This system writes their order in the source file's",
            "  own layout, which it does not rewrite — moving the pages",
            "  between cards is what changes the structure here.",
          ];
  }
}

/** Original immediate parent of every topic: section uuid, or the uuid
 *  of the topic above it. The same shape the post-reconstruct net keys
 *  its comparison on, so the two cannot mean different things by
 *  "parent". */
function parentOf(sections: Section[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (nodes: Topic[], parent: string): void => {
    for (const t of nodes) {
      out.set(t.id, parent);
      walk(t.children, t.id);
    }
  };
  for (const s of sections) walk(s.topics, s.id);
  return out;
}

/**
 * Violations visible in the PROPOSAL, before anything is reconstructed.
 *
 * SOUND, NOT COMPLETE, and the asymmetry is deliberate in both
 * directions:
 *
 *   no false positives — this spends the one guided retry, and a retry
 *     spent correcting a correct answer is worse than no retry at all.
 *     Where placement is ambiguous it returns nothing.
 *   incompleteness is free — `validate.ts`'s net sees the finished
 *     document and refuses whatever this missed. Nothing gets through;
 *     the only thing lost is the chance to have asked again.
 *
 * The soundness argument rests on children-follow: an explicit listing
 * is honoured by reconstruction, so a pinned row explicitly placed
 * under an explicitly identified parent that is not its own has
 * certainly moved. An UNLISTED row keeps its parent by construction and
 * can never be a violation.
 */
export function explicitViolations(
  constraint: RunConstraint,
  nodes: ResultNode[],
  idMap: IdMap,
  doc: TocDocument,
): string[] {
  switch (constraint.kind) {
    case "pinned-rows": {
      // NO VIOLATION TO FIND IN ASPIRATIONAL MODE, and the reason is at
      // the clause: a pinned move is not a violation there — that is the
      // mode's definition (docs/21, Decision 6). So the retry falls back
      // to parse errors only, the pre-parity behavior, and it falls out
      // of the exhaustive switch rather than being a special case
      // somewhere upstream.
      if (constraint.mode === "aspirational") return [];
      const was = parentOf(doc.sections);
      const uuidOf = (compact: string): string | undefined => {
        const entry = idMap.get(compact);
        if (entry === undefined) return undefined;
        return entry.kind === "section" ? entry.section.id : entry.topic.id;
      };
      const pinnedIds = new Map(constraint.rows.map((r) => [r.id, r.title]));
      const found: string[] = [];

      const walk = (list: ResultNode[], parentCompact: string | null): void => {
        for (const node of list) {
          // TOP LEVEL and NEW GROUPS are not judged here. A root
          // placement may be re-wrapped into the row's original orphan
          // section or minted as a fresh one, and only the finished
          // document says which; a `+ Title` group has no id to
          // resolve. Both are left to the complete enforcer rather than
          // guessed at, because a guess here costs the retry.
          const title = node.id ? pinnedIds.get(node.id) : undefined;
          if (title !== undefined && parentCompact !== null) {
            const proposed = uuidOf(parentCompact);
            const original = was.get(uuidOf(node.id!) ?? "");
            if (
              proposed !== undefined &&
              original !== undefined &&
              proposed !== original
            ) {
              found.push(
                `${node.id} "${title}" is pinned in place by the source and must stay under its original section — your answer listed it under ${parentCompact}.`,
              );
            }
          }
          if (node.children) walk(node.children, node.id ?? null);
        }
      };
      walk(nodes, null);
      return found;
    }
    // NO pre-check, recorded rather than overlooked. Reparent's
    // post-reconstruct net is unchanged by this arc, and routing it
    // through the retry as well would be a behaviour change nobody
    // ruled on. The seam is here, exhaustively, for whoever does.
    case "reparent":
      return [];
    // NOTHING TO RESCUE, IN EITHER MODE, and the reason belongs at the
    // clause. This pre-check exists to make a violation reachable by the
    // ONE guided retry, and a retry is worth spending only where the
    // alternative is a discard. Neither of these is: `validate.ts` opens
    // a created or reordered card happily, and after docs/22 the refusal
    // that used to arrive at plan time does not arrive at all — the
    // arrangement is classified, projected and handed over as a
    // checklist item. So a retry here would buy a second paid call to
    // undo something the design now keeps on purpose.
    //
    // Both arms are written out rather than folded into the `reparent`
    // one, because the exhaustive switch is the point: a future build
    // that DOES want to rescue one of these has a place to put it, and a
    // shared `return []` would hide that there were two questions.
    case "create-cards":
      return [];
    case "reorder-cards":
      return [];
  }
}
