/**
 * registry.ts — Format adapter registry.
 *
 * To add a format: implement TocFormatAdapter in one file under
 * src/formats/adapters/ and add it to FORMAT_ADAPTERS below. Detection
 * is by confidence score, so adapters don't need to be mutually
 * exclusive. (Doc systems whose nav lives in MANY files are collection
 * adapters — see src/collections/registry.ts.)
 */

import yaml from "js-yaml";
import { COLLECTION_FACADES, getCollectionAdapter } from "@/collections/registry";
import type { Section, SectionId, TocDocument } from "@/model/types";
import {
  KnownUnsupportedFormatError,
  RENAMES_ALL,
  type FormatRecognizer,
  type RenameCapability,
  type TocFormatAdapter,
} from "./types";
import { docfxAdapter } from "./adapters/docfx";
import { mkdocsAdapter } from "./adapters/mkdocs";
import { legacyMintJsonRecognizer, mintlifyAdapter } from "./adapters/mintlify";

export type { TocFormatAdapter } from "./types";

/** All registered format adapters */
export const FORMAT_ADAPTERS: TocFormatAdapter[] = [
  docfxAdapter,
  mkdocsAdapter,
  mintlifyAdapter,
];

/**
 * Known-unsupported formats, consulted only when no adapter claims the
 * input. Each lives with the module that owns the knowledge where one
 * exists; roadmap entries live here until their adapter does.
 */
export const RECOGNIZERS: FormatRecognizer[] = [
  {
    id: "mdbook-summary",
    // mdBook's SUMMARY.md: a markdown file whose body is a nested list of
    // links. Name-gated deliberately — a nameless markdown list is just a
    // markdown list.
    test: (_parsed, raw, fileName) =>
      /(^|\/)summary\.md$/i.test(fileName) && /^\s*[-*]\s*\[.+\]\(.+\)/m.test(raw),
    message:
      "That looks like an mdBook SUMMARY.md. mdBook support is planned but not built yet — " +
      "for now, Fabula reads DocFX, MkDocs, Sphinx, Just the Docs, Docusaurus and Mintlify.",
    helpUrl: "https://rust-lang.github.io/mdBook/format/summary.html",
  },
  // Legacy mint.json, co-located with the adapter that knows what current
  // Mintlify looks like (docs/13).
  legacyMintJsonRecognizer,
];

/** The adapter used for the default "Load sample" menu entry */
export const DEFAULT_ADAPTER = docfxAdapter;

/**
 * Look up an adapter by its ID (as stored on TocDocument.formatId).
 * Collection documents (folder imports) resolve to their FACADE —
 * detection/parse stay format-only, but code view and legacy export
 * route through here and must not throw at render time.
 */
export function getAdapter(formatId: string): TocFormatAdapter {
  const adapter =
    FORMAT_ADAPTERS.find((a) => a.id === formatId) ??
    COLLECTION_FACADES.find((a) => a.id === formatId);
  if (!adapter) {
    throw new Error(`Unknown TOC format "${formatId}"`);
  }
  return adapter;
}

/** The first recognizer that claims this input, as a throwable error. */
function recognize(
  parsed: unknown,
  raw: string,
  fileName: string,
): KnownUnsupportedFormatError | null {
  for (const recognizer of RECOGNIZERS) {
    if (recognizer.test(parsed, raw, fileName)) {
      return new KnownUnsupportedFormatError(recognizer);
    }
  }
  return null;
}

/**
 * Which node kinds this document can record a rename for (docs/13).
 * Resolved across BOTH contracts and defaulting to both kinds — an
 * adapter that says nothing renames freely, which is every adapter that
 * shipped before the capability existed.
 *
 * Lives here rather than in the collection registry because only this
 * module can see both adapter lists without a cycle.
 */
export function renameCapability(doc: TocDocument): RenameCapability {
  const collection = getCollectionAdapter(doc.formatId);
  if (collection) return collection.supportsRename ?? RENAMES_ALL;
  return (
    FORMAT_ADAPTERS.find((a) => a.id === doc.formatId)?.supportsRename ?? RENAMES_ALL
  );
}

/**
 * Whether this document's system can record a change of parent.
 *
 * Same shape as `renameCapability`, and used at THREE choke points that
 * must agree: the command executors (so a drag is refused as it
 * happens), the planner (the permanent invariant — messaging can be
 * bypassed, a plan cannot), and the AI validator (so a proposal never
 * reaches a planner that would have to refuse it).
 */
export function reparentCapability(doc: TocDocument): boolean {
  const collection = getCollectionAdapter(doc.formatId);
  if (collection) return collection.supportsReparent ?? true;
  return FORMAT_ADAPTERS.find((a) => a.id === doc.formatId)?.supportsReparent ?? true;
}

/**
 * May this document's system CREATE a top-level card, and REORDER them?
 *
 * The same shape as `reparentCapability` above and for the same reason:
 * the collection registry answers first, the format registry second, and
 * NOTHING anywhere branches on an adapter id. That is the whole
 * mechanism — the AI dialog asks the document's own adapter, so an
 * adapter that flips a field re-lights the toggle and drops the prompt
 * line with no change here and none in the view.
 *
 * TRUE for an unregistered `formatId`, and the direction is deliberate.
 * A document from no registered adapter was made by the app or by a
 * test; there is no adapter to refuse on its behalf, and a guard that
 * invented the fact would produce a refusal nobody could act on. The
 * dangerous direction is closed one level up instead: both fields are
 * REQUIRED, so every real adapter answers and none of them can fall
 * through to here.
 */
export function createCards(doc: TocDocument): boolean {
  const collection = getCollectionAdapter(doc.formatId);
  if (collection) return collection.createCards;
  return FORMAT_ADAPTERS.find((a) => a.id === doc.formatId)?.createCards ?? true;
}

/**
 * What a card IS in this document's system — "toctree block" — or
 * undefined where the adapter names no noun.
 *
 * ASKED IN ONE PLACE, like `createCards` and `reorderCards` beside it,
 * so a surface never reaches past the registry for a fact an adapter
 * holds. Copy only: nothing in the app branches on the answer.
 */
export function cardNoun(doc: TocDocument): string | undefined {
  const collection = getCollectionAdapter(doc.formatId);
  if (collection) return collection.cardNoun;
  return FORMAT_ADAPTERS.find((a) => a.id === doc.formatId)?.cardNoun;
}

export function reorderCards(doc: TocDocument): boolean {
  const collection = getCollectionAdapter(doc.formatId);
  if (collection) return collection.reorderCards;
  return FORMAT_ADAPTERS.find((a) => a.id === doc.formatId)?.reorderCards ?? true;
}

/**
 * Auto-detect the format of a document and parse it.
 * Loads the YAML exactly once and hands the result to every adapter's
 * `detect` (docs/04: adapters must not re-parse for detection).
 * Throws a user-friendly Error if no adapter recognizes the document.
 */
export function parseDocument(raw: string, fileName: string): TocDocument {
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    // A recognizer gets first refusal even here — in fact ESPECIALLY
    // here. The formats most worth naming (mdBook's markdown SUMMARY.md,
    // a TypeScript sidebars.ts) are not YAML at all, so they fail at this
    // line and would never reach detection. Consulting recognizers only
    // after `detect` would leave them permanently unreachable.
    const recognized = recognize(undefined, raw, fileName);
    if (recognized) throw recognized;
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid YAML: ${message}`);
  }

  let best: TocFormatAdapter | null = null;
  let bestScore = 0;
  for (const adapter of FORMAT_ADAPTERS) {
    const score = adapter.detect(parsed, raw, fileName);
    if (score > bestScore) {
      best = adapter;
      bestScore = score;
    }
  }

  if (!best) {
    // Nothing could read it — can anything NAME it? A recognizer turns
    // "unrecognized" into "this is X, and here is what to do" (docs/13).
    const recognized = recognize(parsed, raw, fileName);
    if (recognized) throw recognized;
    const known = FORMAT_ADAPTERS.map((a) => a.label).join(", ");
    throw new Error(`Unrecognized TOC format. Supported formats: ${known}`);
  }

  return best.parse(raw, fileName);
}

/** Serialize a full document via the adapter that parsed it */
export function serializeDocument(doc: TocDocument, sectionOrder: SectionId[]): string {
  return getAdapter(doc.formatId).serialize(doc, sectionOrder);
}

/** Serialize a single section via its document's adapter (per-card code view) */
export function serializeSection(formatId: string, section: Section): string {
  return getAdapter(formatId).serializeSection(section);
}
