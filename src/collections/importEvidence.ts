/**
 * importEvidence.ts — What an import OBSERVED, stored on the document
 * (docs/17, Tier 2).
 *
 * These are facts about files the kept snapshot deliberately does not
 * hold: skipped by `ignoreFiles`, refused for their format, folded into
 * a bundle, present-but-not-loaded. The classifier that decides what
 * belongs here is mechanical — *can this be recomputed from the kept
 * snapshot?* No, because the files are gone. So it is evidence, and
 * evidence is stored; anything still in the snapshot is a Tier-1
 * selector and storing it would store a derivation.
 *
 * WARNINGS vs EVIDENCE is a split, not a rename. `CollectionWarning`
 * stays plan-side, where `blocking` gates saving and is its whole point.
 * This type is import-side and has no `blocking`, because the array
 * carried neutral observations — declared languages, created front
 * matter — under a name that steers producers away from filing them.
 *
 * ONE RECORD PER KIND, with a count and up to 20 exemplars. Aggregating
 * at write time is what makes the stored form bounded rather than
 * proportional to the corpus: 629 folded bundle resources store 20 of
 * them and a number.
 */

import type { SectionId, TocDocument, TopicId } from "@/model/types";

/** Somewhere on the canvas, for a finding to focus. */
export interface NodeRef {
  sectionId: SectionId;
  /** Absent when the subject is the card itself. */
  topicId?: TopicId;
}

/** One kind of thing an import observed, with how often and where. */
export interface ImportEvidence {
  /** Grouping key. "warning" is a KIND here, not a type. */
  kind: string;
  /** Total occurrences, INCLUDING the ones no exemplar names. */
  count: number;
  /** Prose, for the review dialog. */
  detail?: string;
  /** Flag name, rule, or config source — the receipt shown inline. */
  receipt?: string;
  /** First 20 in document order; empty is normal and means stat-only. */
  exemplars: NodeRef[];
}

/** A single observation, before grouping. What adapters and the driver emit. */
export interface ImportOccurrence {
  kind: string;
  detail?: string;
  receipt?: string;
  /** The node this occurrence is about, when it is about one. */
  subject?: NodeRef;
}

/**
 * The exemplar bound. A TIER-2 STORAGE property and nothing else: Tier-1
 * selectors read the model, which is entirely present, so they name every
 * subject they have and must not be sampled.
 */
export const MAX_EXEMPLARS = 20;

/**
 * Group occurrences into one record per kind, first-appearance order.
 * Exemplars are the FIRST `MAX_EXEMPLARS` in the order given — document
 * order at every call site — so the same corpus stores byte-identical
 * evidence and the reconciliation property test stays falsifiable.
 */
export function groupIntoEvidence(
  occurrences: readonly ImportOccurrence[],
): ImportEvidence[] {
  const byKind = new Map<string, ImportEvidence>();
  for (const occurrence of occurrences) {
    let record = byKind.get(occurrence.kind);
    if (!record) {
      record = {
        kind: occurrence.kind,
        count: 0,
        ...(occurrence.detail !== undefined ? { detail: occurrence.detail } : {}),
        ...(occurrence.receipt !== undefined ? { receipt: occurrence.receipt } : {}),
        exemplars: [],
      };
      byKind.set(occurrence.kind, record);
    }
    record.count += 1;
    if (occurrence.subject && record.exemplars.length < MAX_EXEMPLARS) {
      record.exemplars.push(occurrence.subject);
    }
  }
  return [...byKind.values()];
}

/** A legacy `{ kind, detail }` record, read as one occurrence. */
interface LegacyWarning {
  kind?: unknown;
  detail?: unknown;
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The document's import evidence, reading the new key and falling back
 * to the old one.
 *
 * The alias is why `PERSIST_VERSION` does not bump: the previous shape
 * is still readable, which is the difference between a migration and a
 * break. Retire it once no session predates the rename — a dated
 * decision, recorded in docs/17, not permanent furniture.
 */
export function evidenceOf(doc: TocDocument): ImportEvidence[] {
  const extras = doc.extras;
  if (!extras) return [];

  const current = extras.importEvidence;
  if (Array.isArray(current)) {
    return current.filter(isRecordLike).map((raw) => ({
      kind: typeof raw.kind === "string" ? raw.kind : "unknown",
      count: typeof raw.count === "number" ? raw.count : 1,
      ...(typeof raw.detail === "string" ? { detail: raw.detail } : {}),
      ...(typeof raw.receipt === "string" ? { receipt: raw.receipt } : {}),
      exemplars: Array.isArray(raw.exemplars) ? (raw.exemplars as NodeRef[]) : [],
    }));
  }

  const legacy = extras.importWarnings;
  if (!Array.isArray(legacy)) return [];
  // One occurrence each, and `blocking` is deliberately not carried: it
  // gates saving from the PLAN's warnings and has never been read here.
  return legacy.filter(isRecordLike).map((raw: LegacyWarning) => ({
    kind: typeof raw.kind === "string" ? raw.kind : "unknown",
    count: 1,
    ...(typeof raw.detail === "string" ? { detail: raw.detail } : {}),
    exemplars: [],
  }));
}
