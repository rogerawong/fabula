/**
 * types.ts — The collection adapter contract (docs/11).
 *
 * Collection adapters serve doc systems whose navigation is derived
 * from METADATA SPREAD ACROSS FILES (frontmatter, directory layout,
 * _category_.json) rather than one config file. Where a format adapter
 * serializes back to a single blob, a collection adapter emits a
 * CHANGE PLAN: minimal per-file edits.
 *
 * THE ROUND-TRIP LAW (the single-file contract, reworded):
 * - No model edits → planChanges returns [].
 * - An edit touches ONLY affected files; within a file, only the lines
 *   the adapter manages — every other line byte-identical.
 * - Idempotent: planChanges(parse(apply(changes))) === [].
 * Contributing a new collection adapter is one file under
 * src/collections/adapters/ + one fixture directory + one registry line;
 * the shared conformance suite enforces the law.
 */

import type { ImportOccurrence } from "./importEvidence";
import type { TocDocument, SectionId } from "@/model/types";
import type { Bearing } from "@/model/birth";
import type { StructuralRemainder } from "@/model/remainders";
import type { RenameCapability, ReparentCapability } from "@/formats/types";

/**
 * path → the content THIS APP OWNS for that path. Plain object, NOT a
 * Map: this snapshot lives in TocDocument.extras and must survive JSON
 * clone + localStorage.
 *
 * What "owns" means depends on the entry (docs/15): a config file is nav
 * in full, so it is kept whole; a page's nav is its front matter, so only
 * the NAV HEAD is kept and the body never enters the session. `navHead.ts`
 * draws that line.
 *
 * THE SNAPSHOT IS NOT A DISK MIRROR. It is what the app loaded or last
 * wrote. Nothing re-reads the folder to keep it current — that would be
 * drift detection wearing a different hat, silently absorbing a
 * concurrent editor's work into our baseline. Concurrency is delegated to
 * version control, deliberately and with receipts
 * (`scripts/receipt-vcs-merge.sh`).
 */
export type FilesSnapshot = Record<string, string>;

/**
 * Which region of the file `newContent` replaces. Absent means the whole
 * file — the original behavior, still correct for config files and for
 * any adapter that keeps whole files.
 *
 * `"navHead"` means `newContent` is a nav head: at save time it is
 * spliced into the bytes on disk AT THAT MOMENT, so a body edit made
 * after load survives. The mark travels with the change because only the
 * planner knows which it built, and only the writer can act on it.
 *
 * `"navTail"` is the same contract at the other end of the file: a
 * Sphinx document's trailing toctree run (docs/19). Same splice-on-save
 * behaviour, and the same reason for it — but NOT the same shape, and
 * the difference is what the writers have to know. A head is a PREFIX,
 * so its diff is positionally valid for the whole file and its last line
 * is never the file's last. A tail is a SUFFIX: its hunks must be
 * OFFSET by the lines above it, and it carries the file's EOF terminator
 * state, which `git apply` treats as part of the context contract.
 */
export type FileRegion = "navHead" | "navTail";

export type FileChange =
  | { kind: "edit"; path: string; newContent: string; region?: FileRegion }
  | { kind: "create"; path: string; newContent: string; region?: FileRegion }
  /** Directory-bound systems (Docusaurus) move files. `newContent` is
   *  the (possibly also edited) content at the new path. */
  | {
      kind: "move";
      fromPath: string;
      toPath: string;
      newContent: string;
      region?: FileRegion;
    };

/**
 * Plan-level choices a user makes at Review, not per gesture.
 *
 * Restructures arrive in bursts — the docs/16 survey counts 141 moves in
 * 2018 and 168 in 2024 — so anything asked once per move is asked forty
 * times in an afternoon. These are asked once per plan.
 */
export interface CollectionPlanOptions {
  /**
   * Write an `aliases:` redirect onto each moved page. Default ON: it
   * repairs the dominant link species outright and costs one key in the
   * page's own front matter.
   */
  writeAliases?: boolean;
}

export interface CollectionWarning {
  kind: string;
  /** Human-readable, path-specific message. */
  detail: string;
  /** Blocking warnings disable saving until resolved. */
  blocking?: boolean;
}

export interface CollectionParseResult {
  doc: TocDocument;
  warnings: CollectionWarning[];
  /**
   * What the parse OBSERVED that the kept snapshot cannot recompute
   * (docs/17): files skipped, refused or folded away, and content
   * present-or-absent in a folder the app no longer holds.
   *
   * Optional, and most adapters will never set it. The classifier
   * decides membership and is binding: a fact still derivable from the
   * snapshot is a SELECTOR, however conveniently parse noticed it first
   * — emitting one here would store a derivation, which is what the
   * fence forbids. If the double computation ever bothers anyone, the
   * answer is a faster selector, never a stored derivation.
   *
   * Collection contract only; the format contract gains this on its
   * first real producer and not before.
   */
  evidence?: ImportOccurrence[];
}

/**
 * ONE ENTRY changing cards, across however many files that takes.
 *
 * DELIBERATELY NOT `FileChange`'s `move` kind, and the names are kept
 * apart because they are two referents that would happily share one:
 * that one says A FILE goes from one path to another; this one says AN
 * ENTRY goes from one card to another WHILE NO FILE MOVES AT ALL. In a
 * Sphinx project the page never budges — only the line naming it does.
 *
 * Declared by the PLANNER, never inferred by the dialog. Two `edit`
 * changes are halves of one gesture and only the planner knows it; a
 * renderer grouping them by path, by adjacency or by title would be
 * inventing a category, and would invent a wrong one the first time an
 * unrelated file was edited in the same plan.
 */
export interface EntryMove {
  /** The row's title, as the canvas shows it. */
  title: string;
  /** The card it left, and the card it joined. */
  from: string;
  to: string;
  /** Every file this one move rewrites. */
  paths: string[];
}

export interface CollectionPlanResult {
  changes: FileChange[];
  warnings: CollectionWarning[];
  /**
   * Moves the plan expresses WITHOUT moving a file (docs/19). Optional,
   * and absent for every adapter whose reparent relocates bytes — there
   * the `FileChange` already says it.
   */
  entryMoves?: EntryMove[];
}

export interface CollectionAdapter {
  /** Stable id; stored as TocDocument.formatId (prefixed, e.g. "jtd"). */
  id: string;
  label: string;
  /** File name predicate: which files should be ingested at import. */
  ingests(path: string): boolean;
  /**
   * Graph-driven ingest (docs/12, decision 2). Given what has been read
   * so far, name additional paths to read; the driver calls this
   * repeatedly until a round names nothing new.
   *
   * For systems whose nav is DISTRIBUTED but EXPLICIT (Sphinx toctrees),
   * the set of files worth reading is discovered by following the nav
   * itself — a per-path predicate cannot express it, and ingesting the
   * whole folder blows the import caps on any real corpus. Adapters that
   * do not implement this keep today's behavior exactly: `ingests` names
   * the files, all of them are read, and the caps apply to that set.
   *
   * Every named file is read IN FULL. Windowed reads were considered and
   * removed: a window is really a content classifier, and a
   * classification miss loses a subtree silently, with no invariant to
   * catch it — entry conservation guards plans, not ingest. The read set
   * is bounded instead by the read budget and by whatever the adapter
   * declines to descend into.
   *
   * Termination is the driver's visited set, not a counter here: toctree
   * graphs contain cycles and repeated references, so naming an
   * already-read path must be free rather than fatal.
   */
  expand?(files: FilesSnapshot): string[];
  /** Confidence 0–1 that this snapshot belongs to this system. */
  detect(files: FilesSnapshot): number;
  /**
   * Which node kinds this system can record a rename for (docs/13).
   * Absent means both — the two shipped collection adapters write a label
   * key for either. Where a kind is false the UI grays that affordance
   * and the AI validator refuses renames of that kind, so a rename can
   * never reach a planner that would have to refuse it.
   */
  supportsRename?: RenameCapability;
  /**
   * Can a topic's PARENT change? Absent = yes.
   *
   * False for systems where membership is the path and the planner
   * cannot yet move files. It is a BIRTH STATE, not a fixed property —
   * docs/16 is the transition out of it, and no shipped adapter answers
   * false today (a fixture keeps the stage exercised). See
   * `reparentMovesFiles` below for the different question of whether a
   * parent change moves bytes.
   */
  supportsReparent?: ReparentCapability;
  /**
   * Does a parent change MOVE FILES on disk (docs/16)?
   *
   * REQUIRED, and deliberately not optional. It decides whether the AI
   * dialog asks for the "Allow file moves" permission at all, and the
   * failure of a missing answer is silent in the DANGEROUS direction:
   * an adapter nobody remembered to classify would be treated as
   * nav-owned, the toggle would never be shown, and a reorganize would
   * relocate files with no consent asked. Required means `pnpm check`
   * names the next adapter that forgets, which is the same reason the
   * command union's three switches are exhaustive.
   *
   * Distinct from `supportsReparent`, which is a fact about what the
   * format can EXPRESS. This is a fact about what happens when it does
   * — the difference between a capability and a consequence.
   *
   * True for membership-is-path systems (Hugo, Docusaurus). False where
   * parentage is metadata or an explicit nav: Just the Docs writes
   * front-matter keys, Sphinx moves an entry line between toctrees.
   */
  reparentMovesFiles: boolean;
  /**
   * Must EVERY navigation node name a page?
   *
   * REQUIRED, for the same reason `reparentMovesFiles` is: the failure
   * of a missing answer is silent and in the dangerous direction. An
   * adapter nobody classified would be treated as "nodes may be
   * pageless", the AI would be free to nest one card inside another, and
   * reconstruction would hand the planner a node it cannot write a line
   * for. `pnpm check` names the next adapter that forgets.
   *
   * TRUE where the nav is a list of TARGETS: a Sphinx toctree entry is a
   * docname, so a node with no page has no line. Also Just the Docs,
   * where every node is a page carrying its own front matter.
   *
   * FALSE where the nav can hold a GROUP: a Docusaurus category and an
   * MkDocs nav mapping both have a title and children and need no page
   * of their own. Hugo answers false too — a directory with no
   * `_index.md` still renders in the sidebar.
   *
   * Distinct from `supportsReparent` and `reparentMovesFiles`, which are
   * about MOVING a node. This is about whether a node can EXIST without
   * a page, which is the question a demotion asks.
   */
  nodesNeedTargets: boolean;
  /**
   * Can this system's write path CREATE a top-level card that was not in
   * the source, and RECORD a change to the order of top-level cards?
   *
   * REQUIRED, both of them, for the third and fourth time and the same
   * reason `reparentMovesFiles` and `nodesNeedTargets` are: the failure
   * of a missing answer is silent and in the DANGEROUS direction. An
   * adapter nobody classified reads as capable, so the "Allow new
   * sections" toggle re-arms and the card-order prompt line vanishes —
   * and the run then PROMISES WHAT THE PLAN MUST REFUSE. That is not a
   * hypothetical: it is the oracle log's 2026-08-19 godot batch, three
   * corpus-scale calls refused at Review for structure no layer above
   * the planner knew was unwritable. `pnpm check` names the next adapter
   * that forgets.
   *
   * TWO FIELDS, NEVER ONE. "This system can add a card" and "this system
   * can put the cards in a different order" are different sentences with
   * different enforcement and different remedies — Hugo creates a
   * directory happily and has no cross-directory order to write; a
   * whole-file nav does both. A single `structuralEdits` flag would
   * force a false choice between disabling an edit the system supports
   * and offering one it cannot express, which is exactly the argument
   * that made `supportsRename` per-kind (docs/13).
   *
   * FACTS ABOUT THE WRITE PATH, not about the canvas. Neither field
   * refuses a gesture: the canvas may still create and reorder cards,
   * and what happens at apply time is the planner's business, unchanged.
   * These answer the upstream question — what may a RUN promise.
   */
  createCards: boolean;
  reorderCards: boolean;
  /**
   * What this system's ROOT holds — a section, a standalone entry, both,
   * or neither (docs/22, Decision 2's per-home bearing; Decision 8's
   * marked declaration).
   *
   * REQUIRED, for the fifth time and the same reason the four fields
   * above are: forgetting it fails SILENTLY, and here it fails while
   * deciding what a gesture MAKES. This is the question the
   * species-at-birth table asks when a childless row is dragged to empty
   * canvas — a guess that says "bears standalones" on a system that
   * cannot spell one writes bytes the format rejects, and a guess the
   * other way wraps a page in a heading nobody asked for.
   *
   * ONLY THE FALLBACK. Where the document declares containers, the
   * home's own `accepts` answers; this is what a system with no
   * containers has instead.
   *
   * ANSWERED WITH A RECEIPT, never from a key name — whether the SITE
   * renders a bare top-level entry is published-rendering fidelity (the
   * `no_list` lesson). Each adapter states its method where it answers,
   * and the answer is verified against that adapter's own PLANNER, never
   * copied from a sibling (the capability-fields method).
   */
  rootBearing: Bearing;
  /**
   * What a card IS in this system, in the format's own words — "toctree
   * block" (docs/22's `StructuralCopy` noun, hoisted to its declaration).
   *
   * COPY ONLY, NEVER BEHAVIOR — the `ContainerDescriptor.kind` precedent
   * verbatim. Two surfaces read it and neither branches on it: the
   * creation seam's headline ("here, cards are toctree blocks") and the
   * checklist's structural remedy ("add a toctree block in index.rst").
   *
   * DECLARED HERE RATHER THAN SPELLED TWICE. The remedy had this literal
   * inside `structuralRemainders`; the seam needs the same word at DRAG
   * time, where no record exists yet, and one noun in two places is one
   * noun that drifts.
   *
   * OPTIONAL, AND ABSENT IS ANSWERED: an adapter that names no noun gets
   * sentences that are still true rather than ones with a hole in them.
   */
  cardNoun?: string;
  /**
   * Can THIS page hold children in the navigation?
   *
   * OPTIONAL, and its absence means "yes, always" — which is the honest
   * default for every system where nesting is expressed by the nav file
   * or by the directory tree. A guard that invented this fact would
   * produce a refusal nobody could act on.
   *
   * Sphinx implements it because the answer is per-PAGE rather than
   * per-format: a document holds children only if it declares a
   * `toctree`, and giving one to a page that has none is block creation
   * rather than an entry move.
   *
   * Read at DRAG TIME as well as at plan time, through `guards.ts`, so
   * the gesture refuses what the planner would refuse — the choke-point
   * rule that exists because a second copy of a rule let the sidebar
   * commit the move the canvas refused.
   */
  canHostChildren?(files: FilesSnapshot, path: string): boolean;
  parse(files: FilesSnapshot, rootName: string): CollectionParseResult;
  /**
   * Pure function of (original files, edited model, section order) —
   * no edit journal, which is what makes undo/redo integration free.
   *
   * OPTIONAL, and its presence IS the write-back capability (docs/12,
   * decision 3). An adapter that can already read a system faithfully but
   * cannot yet write it back omits this; the UI then disables Review
   * changes for those tabs with a reason rather than hiding it, so the
   * limitation is legible instead of looking like a missing feature. The
   * read-only `sidebars.ts` adapter in docs/08 reuses the same mechanism.
   */
  planChanges?(
    files: FilesSnapshot,
    doc: TocDocument,
    sectionOrder: SectionId[],
    options?: CollectionPlanOptions,
  ): CollectionPlanResult;
  /**
   * Which parts of this arrangement the write path cannot express
   * (docs/22, Decision 3) — the SHOWING half of the same comparison
   * `planChanges` refuses on.
   *
   * ONE RULE, TWO CONSUMERS, split before the drift rather than after.
   * The predicates behind this method and behind the planner's
   * `section-set-changed`, `card-reordered` and frozen-block refusals are
   * the same functions; the planner asks "must this be refused?" and this
   * asks "which structure is imagined?". Two questions about one
   * comparison, which is why they may not be answered by two derivations.
   *
   * OPTIONAL, and its ABSENCE is a declared input rather than a claim: an
   * adapter that does not implement it reports nothing, and the report
   * being empty then means NOT MEASURED, not "nothing imagined". Only an
   * adapter answering `createCards` or `reorderCards` false, or holding
   * frozen blocks, has anything to report — Hugo, JTD and Docusaurus
   * answer true on both and freeze nothing.
   *
   * THE DERIVATION IS SOUND ONLY WHERE RENAMES CANNOT FORGE KEYS. Cards
   * are compared by natural key (`path ?? ~title`), so a TITLE-keyed card
   * that could be renamed would derive as created-plus-deleted. Sphinx
   * declares `supportsRename: { sections: false, topics: false }`, which
   * is what makes the coupling hold today. The adapter that first
   * combines title keys with renames finds this sentence waiting.
   */
  structuralRemainders?(
    files: FilesSnapshot,
    doc: TocDocument,
    sectionOrder: SectionId[],
  ): StructuralRemainder[];
}

/** Where the original snapshot lives on a collection document. */
export function filesOf(doc: TocDocument): FilesSnapshot {
  const files = (doc.extras as { files?: FilesSnapshot } | undefined)?.files;
  return files ?? {};
}
