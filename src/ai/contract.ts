/**
 * contract.ts — Shared types for the AI reorganization pipeline
 * (outline → prompt → LLM → parse → reconstruct). See the plan's data
 * contract: compact ids travel to the model; UUIDs, paths, and extras
 * never leave the browser.
 */

import type { Section, SectionId, Topic } from "@/model/types";
import type { ResponseCapture } from "./capture";
import type { RunMode } from "@/store/provenance";

export type { RunMode };

/** What a compact id (s1/t1) refers to. Kept locally, never sent. */
export type IdEntry =
  | { kind: "section"; section: Section }
  | {
      kind: "topic";
      topic: Topic;
      /** The section the topic lives in (for recovery grouping). */
      sectionId: SectionId;
      /** Set when this topic is an orphan section's wrapped entry —
       *  reconstruction re-wraps it with this original section. */
      orphanSection?: Section;
    };

export type IdMap = Map<string, IdEntry>;

export type Granularity = "full" | "two" | "top";

export interface ReorganizeOptions {
  /**
   * What this run may IMAGINE (docs/21, Decision 2).
   *
   * REQUIRED, not defaulted, and the direction of the failure is why.
   * A caller that forgets a mode would silently get one — and if the
   * default were `aspirational`, a grounded run would stop discarding
   * unwritable moves with nothing on screen saying so; if `grounded`,
   * an aspirational run would discard the very proposal the user asked
   * to see. Either way the mistake is invisible and the compiler is
   * silent. Required means `pnpm check` names every site that owes an
   * answer.
   *
   * NOT A PERMISSION. It shapes proposal space and authorizes nothing
   * on disk, so it never gates a write and never appears in a capability
   * conjunction (`permissions.ts` is the other half of that split).
   */
  mode: RunMode;
  /** null = whole document */
  scopeSectionIds: SectionId[] | null;
  allowRenames: boolean;
  allowNewSections: boolean;
  /**
   * May the model change a topic's PARENT — which on a file-move system
   * relocates files on disk (docs/16)?
   *
   * A per-run PERMISSION, not a capability. The capability answers "can
   * this system record a parent change"; this answers "did the user
   * agree to it THIS TIME". They were nearly one field, and the
   * two-sentence test separates them: *"Allow new sections lets the
   * model group topics under a heading it invented"* / *"Allow new
   * sections lets the model relocate files on disk"* — the same checkbox
   * used differently.
   *
   * Default OFF, and NEVER preset-settable: a preset is an editable
   * instruction template, and a template that silently re-enables disk
   * moves is a template with a side effect. Off is the only default a
   * run may inherit.
   */
  allowFileMoves: boolean;
  folderHints: boolean;
  granularity: Granularity;
}

export interface OutlineResult {
  /** The exact indented-text outline sent to the model. */
  text: string;
  /** One id-less line naming unscoped sections, or null when unscoped
   *  is empty / whole-document scope. */
  contextLine: string | null;
  idMap: IdMap;
  stats: {
    scopedSections: number;
    totalSections: number;
    topics: number;
    /** chars/4 heuristic over outline + context */
    estTokens: number;
  };
}

/** A node of the parsed LLM response. */
export interface ResultNode {
  /** Compact id of an existing section/topic; absent for new groups. */
  id?: string;
  /** Title text on the line (rename candidate or new-group title). */
  title?: string;
  /** Explicitly listed children. undefined = none listed → children
   *  follow (keep originals minus any placed elsewhere). */
  children?: ResultNode[];
}

export interface ReorganizeSummary {
  scopedSections: number;
  totalSections: number;
  sectionsBefore: number;
  sectionsAfter: number;
  maxDepthBefore: number;
  maxDepthAfter: number;
  moved: number;
  renamed: number;
  newSections: number;
  /** Topics promoted into sections (unwrap semantics — payload lives on
   *  as the section). */
  promoted: number;
  /** Sections merged into others as topics (their uuid moved into
   *  topic-id space). */
  demoted: number;
  /** Topics the model omitted, recovered into their original sections. */
  recovered: number;
  emptySectionsDropped: number;
  /**
   * The split an ASPIRATIONAL run produced (docs/21, Decision 3): what
   * this proposal asks of the app, and what it asks of a human.
   *
   * Present in both modes; all zeros in a grounded run, because a
   * grounded run cannot classify — it discards. THE RESULT VIEW SAYS THE
   * SPLIT BEFORE THE TAB OPENS, which is where the no-silent-downgrade
   * constraint is met at the earliest surface rather than first at
   * Review.
   *
   * `needsHand` and `needsConsent` are drawn from `moves` and are two
   * facts, never one: "the app cannot write this" and "you have not
   * agreed to write this" are different sentences with different
   * remedies, and summing them would blame the format for a choice the
   * user has not yet made.
   */
  aspirational: {
    /** Relocations the app will not write, full stop. */
    needsHand: number;
    /** Relocations it WILL write, once the user agrees at apply time. */
    needsConsent: number;
    /**
     * The denominator both are drawn from: every relocation this run
     * produced. Larger than `moved`, which counts topics only — a
     * demoted CARD is a relocation `moved` cannot see, because its id
     * was never in topic space before.
     */
    moves: number;
    /**
     * STRUCTURE this arrangement imagines that the write path cannot
     * record (docs/22, Decision 5) — beside the rows above, never summed
     * with them. A row goes home; a card has to be written into the
     * source by hand, and those are different asks.
     *
     * DERIVED FROM THE DOCUMENT, not from the run: a GROUNDED run can
     * hoist a leaf or reorder cards — the validator opens both, and the
     * pinned net is parent-change-only by design — so this is populated
     * in both modes. Absent only where no source exists to compare
     * against, which is every format tab.
     */
    structural?: {
      createdCards: number;
      cardOrderChanged: boolean;
      frozenBlocks: number;
    };
  };
  warnings: string[];
}

export type AiErrorKind =
  "auth" | "rate-limit" | "network" | "truncated" | "bad-response" | "aborted";

export class AiError extends Error {
  kind: AiErrorKind;
  retryAfterSec?: number;
  /**
   * The rejected model response, when this failure was a rejection of
   * one (`run.ts` attaches it; see `capture.ts` for why it rides the
   * error rather than living in a store). Absent on transport failures
   * — an auth or network error has no model output to keep.
   */
  capture?: ResponseCapture;
  /**
   * What had ARRIVED when the failure happened — a truncated answer, or
   * the bytes a broken stream delivered before it broke.
   *
   * Raw material for a capture, not a capture: `client.ts` knows the
   * bytes but not which attempt produced them, and `run.ts` knows the
   * attempt but never sees a `Response`. Kept as two fields for that
   * reason, and it is why the "no capture on user cancel" rule has
   * something real to decline — an aborted call carries its partial
   * here and still reaches no capture.
   */
  partial?: string;

  constructor(kind: AiErrorKind, message: string, retryAfterSec?: number) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
    this.retryAfterSec = retryAfterSec;
  }
}
