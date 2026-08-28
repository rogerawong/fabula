/**
 * registry.ts — Collection adapter registry + format-adapter FACADES.
 *
 * To add a collection system: implement CollectionAdapter in one file
 * under src/collections/adapters/, add fixtures + the round-trip-law
 * tests, and register it in COLLECTION_ADAPTERS below.
 *
 * Collection documents store the collection id as their formatId, so
 * every code path that routes through the FORMAT registry (per-card
 * code view, legacy export) needs an adapter answering to that id.
 * The facades provide that: serializeSection renders a YAML outline of
 * the card (there is no single source file to show), and serialize
 * renders the CURRENT change plan as a git-style .patch — the degraded
 * form of export for callers that predate the review dialog.
 */

import yaml from "js-yaml";
import type { Section, SectionId, TocDocument, Topic } from "@/model/types";
import type { TocFormatAdapter } from "@/formats/types";
import { docusaurusAdapter } from "./adapters/docusaurus";
import { hugoAdapter } from "./adapters/hugo";
import { jtdAdapter } from "./adapters/jtd";
import { sphinxAdapter } from "./adapters/sphinx";
import { renderPatch } from "./diff";
import { filesOf, type CollectionAdapter, type FilesSnapshot } from "./types";

export const COLLECTION_ADAPTERS: CollectionAdapter[] = [
  jtdAdapter,
  docusaurusAdapter,
  sphinxAdapter,
  hugoAdapter,
];

export function getCollectionAdapter(formatId: string): CollectionAdapter | null {
  return COLLECTION_ADAPTERS.find((a) => a.id === formatId) ?? null;
}

/** True when a document came from a collection import (its edits are
 *  reviewed as per-file changes, not exported as one blob). */
export function isCollectionDocument(doc: TocDocument): boolean {
  return getCollectionAdapter(doc.formatId) !== null;
}

/**
 * Whether this document's system can be written back at all (docs/12,
 * decision 3). A collection adapter with no `planChanges` reads
 * faithfully but has no planner yet; format-adapter documents always
 * export, so they answer true.
 */
export function supportsWriteBack(doc: TocDocument): boolean {
  const adapter = getCollectionAdapter(doc.formatId);
  return adapter === null || adapter.planChanges !== undefined;
}

/** Pick the most confident adapter for an imported snapshot. */
export function detectCollection(files: FilesSnapshot): CollectionAdapter | null {
  let best: CollectionAdapter | null = null;
  let bestScore = 0.3; // minimum confidence to claim a folder
  for (const adapter of COLLECTION_ADAPTERS) {
    const score = adapter.detect(files);
    if (score > bestScore) {
      best = adapter;
      bestScore = score;
    }
  }
  return best;
}

// ── Format-adapter facades ──────────────────────────────────

function outlineNode(t: Topic): Record<string, unknown> {
  return {
    title: t.title,
    ...(t.path !== undefined ? { path: t.path } : {}),
    ...(t.children.length > 0 ? { children: t.children.map(outlineNode) } : {}),
  };
}

function makeFacade(adapter: CollectionAdapter): TocFormatAdapter {
  return {
    id: adapter.id,
    label: adapter.label,
    fileExtensions: ["patch"],
    // DELEGATED, never restated. A collection document routed through
    // the FORMAT registry is still that collection, and a facade that
    // answered for itself would be a second source of truth for a fact
    // its own adapter already holds — the shape this whole pair of
    // fields exists to prevent.
    createCards: adapter.createCards,
    reorderCards: adapter.reorderCards,
    // Delegated for the same reason: the collection holds this fact, and
    // a facade answering for itself would be the second source of truth
    // the whole required-field discipline exists to prevent.
    rootBearing: adapter.rootBearing,
    ...(adapter.cardNoun ? { cardNoun: adapter.cardNoun } : {}),
    detect: () => 0, // collections are imported from folders, never from one file
    parse: () => {
      throw new Error(
        `${adapter.label} documents are imported from a folder, not a single file`,
      );
    },
    serialize: (doc: TocDocument, sectionOrder: SectionId[]): string => {
      if (!adapter.planChanges) {
        // A read-only adapter (docs/12, decision 3) has no plan to render.
        throw new Error(
          `${adapter.label} documents are read-only in this version — restructuring stays on the canvas`,
        );
      }
      const files = filesOf(doc);
      const { changes } = adapter.planChanges(files, doc, sectionOrder);
      return changes.length === 0 ? "" : renderPatch(changes, files);
    },
    serializeSection: (section: Section): string => {
      const header = `# ${section.title}${section.path ? ` — ${section.path}` : ""}\n`;
      return header + yaml.dump(section.topics.map(outlineNode), { lineWidth: -1 });
    },
  };
}

export const COLLECTION_FACADES: TocFormatAdapter[] = COLLECTION_ADAPTERS.map(makeFacade);
