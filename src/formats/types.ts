/**
 * types.ts — The TOC format adapter contract.
 *
 * A format adapter teaches TOC Fable how to read one TOC file format into
 * the neutral model (src/model/) and how to write the model back out —
 * the round-trip. Contributing a new format means implementing this
 * interface in one file under src/formats/, adding at least one fixture,
 * and registering it in registry.ts. See docs/04-format-adapters.md.
 *
 * ROUND-TRIP CONTRACT:
 * - `serialize(parse(text))` must be lossless and stable: re-parsing the
 *   output yields a deep-equal model (modulo generated ids), and a second
 *   serialize is byte-identical.
 * - Properties the neutral model doesn't represent go in the `extras`
 *   bags verbatim and come back out on serialize. The core clones and
 *   carries extras but never interprets them. An adapter only ever
 *   serializes models produced by ITS OWN parser (each document stores
 *   its formatId), so extras semantics are private to the adapter.
 *   Anything created inside the app has `extras === undefined` —
 *   serialize must cope.
 * - Nodes whose title was derived (no explicit name in the source) carry
 *   `titleDerived: true`; serialize omits the name for those. An explicit
 *   in-app rename clears the flag.
 */

import type { Bearing } from "@/model/birth";
import type { Section, SectionId, TocDocument } from "@/model/types";

/**
 * Which node kinds this system can record a rename for (docs/13).
 *
 * Per KIND, not per document, because the answer genuinely differs:
 * Mintlify stores a group's display name in docs.json but has no field
 * for a page title at all, so it renames sections and cannot rename
 * topics. A single flag would force a false choice between disabling a
 * rename the format supports and offering one it cannot express.
 *
 * Absent means `{ sections: true, topics: true }` — every shipped
 * adapter before this existed renames both.
 */
export interface RenameCapability {
  sections: boolean;
  topics: boolean;
}

export const RENAMES_ALL: RenameCapability = { sections: true, topics: true };

/**
 * Whether this system can record a topic whose PARENT changed (docs/14
 * Decision 3, docs/16).
 *
 * The predicate is deliberately the parent, not the directory: in a
 * path-addressed system like Hugo, nesting page A under sibling B in the
 * same folder still means the FILE moves, so a directory-equality test
 * would wave intra-card re-nesting straight through.
 *
 * Absent means true — every adapter shipped before Hugo stores nav
 * explicitly and can express any parent.
 */
export type ReparentCapability = boolean;

/**
 * A format we RECOGNIZE but deliberately do not support (docs/04,
 * docs/13). Consulted only after every `detect` returns 0, so it can
 * replace the generic "Unrecognized TOC format" with an answer.
 *
 * Emphatically NOT an adapter: never parsed, never serialized, and
 * excluded from the conformance and fixpoint suites *by construction* —
 * there is no `parse` to call. The alternative considered was letting an
 * adapter's `detect` claim a format its `parse` refuses, which would have
 * redefined `detect`, turned an error path into a guidance channel, and
 * needed a hand-written suite exemption.
 *
 * Sniff conservatively: an ambiguous, nameless input must fall through to
 * the generic error. A silent recognizer beats a wrong one, which would
 * send someone to run a migration tool on an unrelated file.
 */
export interface FormatRecognizer {
  /** Stable id, for tests and telemetry. */
  id: string;
  /** True when this input is the known-unsupported thing. */
  test(parsed: unknown, raw: string, fileName: string): boolean;
  /** What it is and what to do about it. Product copy, not an error string. */
  message: string;
  /** Optional documentation link the load UI renders as a link. */
  helpUrl?: string;
}

/**
 * Thrown when an arrangement cannot be written in this format at all.
 *
 * NEVER BYTES. The alternative — writing the closest legal-looking
 * thing — is what this class of defect already did once: a card with
 * no container was appended into a Mintlify `tabs` array, producing a
 * file whose own `$schema` rejects it, silently, with every test
 * green. A refusal a person can read beats bytes they cannot trust.
 *
 * The titles ride as data because the message is rendered once, by one
 * producer, and a caller that wants to name the cards differently must
 * not re-derive them from the prose.
 */
export class SerializeRefusedError extends Error {
  readonly sectionTitles: readonly string[];

  constructor(message: string, sectionTitles: readonly string[]) {
    super(message);
    this.name = "SerializeRefusedError";
    this.sectionTitles = [...sectionTitles];
  }
}

/** Thrown when a recognizer claims the input: a known format, not a mystery. */
export class KnownUnsupportedFormatError extends Error {
  readonly recognizerId: string;
  readonly helpUrl?: string;

  constructor(recognizer: FormatRecognizer) {
    super(recognizer.message);
    this.name = "KnownUnsupportedFormatError";
    this.recognizerId = recognizer.id;
    this.helpUrl = recognizer.helpUrl;
  }
}

export interface TocFormatAdapter {
  /** Stable unique ID, stored on every TocDocument for round-trip routing */
  id: string;
  /** Human-readable name, shown in UI (e.g. "DocFX (toc.yml)") */
  label: string;
  /** Typical file extensions, without dots (e.g. ["yml", "yaml"]) */
  fileExtensions: string[];

  /**
   * Confidence 0–1 that the document is this format.
   * `parsed` is the registry's single js-yaml load result (unknown shape;
   * may be null) — adapters must NOT re-parse for detection.
   */
  detect(parsed: unknown, raw: string, fileName: string): number;

  /**
   * Parse text into the neutral model. Must set `formatId` to this
   * adapter's `id`. Throw an Error with a user-friendly message on
   * invalid input.
   */
  parse(raw: string, fileName: string): TocDocument;

  /**
   * Serialize the model back to text — the round-trip write.
   * `sectionOrder` (section ids) determines top-level entry order; ids
   * not present in the document are ignored.
   */
  serialize(doc: TocDocument, sectionOrder: SectionId[]): string;

  /** Serialize a single section, for the per-card code view. */
  serializeSection(section: Section): string;

  /**
   * Can this format's write path CREATE a top-level card that was not in
   * the source, and RECORD a change to the order of top-level cards?
   *
   * REQUIRED, and deliberately not optional — the same contract the
   * collection side carries, for the same reason. An adapter nobody
   * classified reads as capable, so the "Allow new sections" toggle
   * re-arms and the card-order prompt line vanishes, and the run
   * promises what the plan must refuse (the oracle log's 2026-08-19
   * godot batch). A whole-file serializer answers true to both by
   * construction, which is precisely why leaving them optional would
   * feel harmless and would not be: the next format adapter is the one
   * that cannot.
   *
   * Declared on BOTH contracts because both produce documents the AI
   * dialog opens. A fact on one of two contracts is a fact half the app
   * cannot ask for, and the ask happens in one place
   * (`registry.ts`'s `createCards` / `reorderCards`).
   */
  createCards: boolean;
  reorderCards: boolean;

  /**
   * What this format's ROOT holds — a section, a standalone entry, both,
   * or neither (docs/22, Decision 2's per-home bearing; Decision 8's
   * marked declaration).
   *
   * REQUIRED, for the fifth time and the same reason
   * `reparentMovesFiles`, `nodesNeedTargets`, `createCards` and
   * `reorderCards` are: forgetting it fails SILENTLY. This is what the
   * species-at-birth table asks when a childless row is dragged to empty
   * canvas, so a missing answer would be a default somebody guessed
   * deciding what the gesture MAKES — and a guess that says "bears
   * standalones" on a system that cannot spell one writes bytes the
   * format rejects, while a guess the other way refuses a legal drop.
   *
   * ONLY THE FALLBACK. Where the document DECLARES containers, the
   * home's own `accepts` answers and this is never consulted — the
   * bearing question has one producer (`model/containers.ts`'s declared
   * descriptors) and this is what a format with no containers has
   * instead.
   *
   * ANSWERED WITH A RECEIPT, never from a key name: the question is
   * whether the SITE renders a bare top-level entry, which is
   * published-rendering fidelity (the `no_list` lesson — a plausible
   * reading off a key name mismarked 77 corpus rows). Each adapter
   * states its method where it answers.
   */
  rootBearing: Bearing;
  /**
   * What a card IS in this format, in its own words. COPY ONLY, never
   * behavior; optional, and absent is answered (see the collection
   * contract's fuller note).
   *
   * DECLARED ON BOTH contracts although no shipped format adapter has a
   * consumer yet — the creation seam fires only where `createCards` is
   * false, and every format adapter answers true. The next one that
   * cannot is the one that owes a noun, and the field is here so it has
   * somewhere to put it rather than a second table to invent.
   */
  cardNoun?: string;

  /** Which node kinds this format can record a rename for. Absent = both. */
  supportsRename?: RenameCapability;
  /** Can a topic's parent change? Absent = yes (see ReparentCapability). */
  supportsReparent?: ReparentCapability;

  /** Optional bundled sample document for the "Load sample" menu */
  sample?: { fileName: string; content: string };
}
