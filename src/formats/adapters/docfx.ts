/**
 * docfx.ts — Format adapter for DocFX table-of-contents files (toc.yml),
 * the format used by DocFX / learn.microsoft.com-style documentation sites.
 * https://dotnet.github.io/docfx/docs/table-of-contents.html
 *
 * FORMAT SHAPE:
 *   items:                     # root: `items` key (modern) or a bare list (classic)
 *   - name: Getting Started    # display name — OPTIONAL (falls back to article title)
 *     href: getting-started.md # link target — .md, a directory/, or another toc.yml
 *     items:                   # children
 *     - href: install.md
 *     - name: Advanced
 *       uid: some-uid          # alternative to href
 *       expanded: true         # misc extra properties are preserved via `extras`
 *
 * MODEL MAPPING:
 * - Top-level items with children  → regular sections
 * - Top-level items without children → orphan sections (compact card),
 *   wrapping the entry as the section's single topic
 * - name → title (derived from href/uid when absent, with titleDerived: true)
 * - href → path
 * - all other node properties → extras (opaque, round-tripped verbatim)
 * - root style (`items:` key vs bare list) and any sibling root keys are
 *   remembered in TocDocument.extras
 */

import yaml from "js-yaml";
import { newId } from "@/model/id";
import { deriveDocumentName, deriveTitleFromPath } from "@/model/naming";
import type { Section, TocDocument, Topic } from "@/model/types";
import type { TocFormatAdapter } from "../types";
import SAMPLE_CONTENT from "../samples/docfx-sample.yml?raw";

const FORMAT_ID = "docfx";

// ── Raw node shape ──────────────────────────────────────────

interface DocFxNode {
  name?: unknown;
  href?: unknown;
  uid?: unknown;
  items?: unknown;
  [key: string]: unknown;
}

/** Keys the adapter maps onto the model; everything else goes to extras */
const MAPPED_KEYS = new Set(["name", "href", "items"]);

// ── Detection ───────────────────────────────────────────────

function looksLikeNode(v: unknown): boolean {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const node = v as DocFxNode;
  return (
    typeof node.name === "string" ||
    typeof node.href === "string" ||
    typeof node.uid === "string" ||
    Array.isArray(node.items)
  );
}

function detect(parsed: unknown): number {
  // Modern root: { items: [...] }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    Array.isArray((parsed as DocFxNode).items)
  ) {
    const items = (parsed as DocFxNode).items as unknown[];
    if (items.length === 0) return 0.5;
    return items.every(looksLikeNode) ? 0.9 : 0;
  }

  // Classic root: a bare list of nodes
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed.every(looksLikeNode) ? 0.8 : 0;
  }

  return 0;
}

// ── Parsing ─────────────────────────────────────────────────

function deriveTitle(node: DocFxNode): { title: string; derived: boolean } {
  if (typeof node.name === "string" && node.name.trim() !== "") {
    return { title: node.name, derived: false };
  }
  if (typeof node.href === "string" && node.href.trim() !== "") {
    return { title: deriveTitleFromPath(node.href), derived: true };
  }
  if (typeof node.uid === "string" && node.uid.trim() !== "") {
    return { title: node.uid, derived: true };
  }
  return { title: "Untitled", derived: true };
}

/** Collect all non-mapped properties into an extras bag (undefined if none) */
function collectExtras(node: DocFxNode): Record<string, unknown> | undefined {
  let extras: Record<string, unknown> | undefined;
  for (const key of Object.keys(node)) {
    if (MAPPED_KEYS.has(key)) continue;
    (extras ??= {})[key] = node[key];
  }
  return extras;
}

function parseNode(node: DocFxNode): Topic {
  const { title, derived } = deriveTitle(node);
  const rawItems = Array.isArray(node.items) ? node.items : [];
  const children = rawItems
    .filter((c): c is DocFxNode => typeof c === "object" && c !== null)
    .map(parseNode);

  return {
    id: newId(),
    title,
    titleDerived: derived || undefined,
    path: typeof node.href === "string" ? node.href : undefined,
    extras: collectExtras(node),
    children,
  };
}

function parse(raw: string, fileName: string): TocDocument {
  const loaded = yaml.load(raw);

  let rootItems: unknown[];
  let docExtras: Record<string, unknown> | undefined;

  if (Array.isArray(loaded)) {
    // Classic bare-list root
    rootItems = loaded;
    docExtras = { rootStyle: "list" };
  } else if (
    typeof loaded === "object" &&
    loaded !== null &&
    Array.isArray((loaded as DocFxNode).items)
  ) {
    rootItems = (loaded as DocFxNode).items as unknown[];
    // Preserve any sibling root keys (e.g. pdf metadata) for round-trip
    const rootRest = collectExtras(loaded as DocFxNode);
    docExtras = { rootStyle: "items", ...(rootRest ? { rootExtras: rootRest } : {}) };
  } else {
    throw new Error(
      "Not a DocFX TOC: expected an `items:` list or a top-level list of entries",
    );
  }

  const sections: Section[] = rootItems
    .filter((n): n is DocFxNode => typeof n === "object" && n !== null)
    .map((node) => {
      const { title, derived } = deriveTitle(node);
      const rawItems = Array.isArray(node.items) ? node.items : [];

      // Orphan: a top-level leaf entry (no children). Wrap it as a
      // single-topic compact card, mirroring how it serializes back.
      const isOrphan = rawItems.length === 0;

      const topics: Topic[] = isOrphan
        ? [parseNode(node)]
        : rawItems
            .filter((c): c is DocFxNode => typeof c === "object" && c !== null)
            .map(parseNode);

      return {
        id: newId(),
        title,
        titleDerived: derived || undefined,
        path: typeof node.href === "string" ? node.href : undefined,
        extras: collectExtras(node),
        isOrphan: isOrphan || undefined,
        topics,
      };
    });

  return {
    id: newId(),
    name: deriveDocumentName(fileName),
    formatId: FORMAT_ID,
    extras: docExtras,
    sections,
  };
}

// ── Serialization ───────────────────────────────────────────

/**
 * Build a raw DocFX node object with conventional key order:
 * name, href, then preserved extras, items last.
 */
function buildNode(opts: {
  title: string;
  titleDerived?: boolean;
  path?: string;
  extras?: Record<string, unknown>;
  children?: Topic[];
}): Record<string, unknown> {
  const node: Record<string, unknown> = {};
  // Omit derived names — they weren't in the source document
  if (!opts.titleDerived) node.name = opts.title;
  if (opts.path) node.href = opts.path;
  if (opts.extras) Object.assign(node, opts.extras);
  if (opts.children && opts.children.length > 0) {
    node.items = opts.children.map(topicToNode);
  }
  // Guard against a fully-empty node (nothing to identify it by)
  if (Object.keys(node).length === 0) node.name = opts.title;
  return node;
}

function topicToNode(t: Topic): Record<string, unknown> {
  return buildNode({
    title: t.title,
    titleDerived: t.titleDerived,
    path: t.path,
    extras: t.extras,
    children: t.children,
  });
}

function sectionToNode(section: Section): Record<string, unknown> {
  const only = section.topics[0];
  if (section.isOrphan && section.topics.length === 1 && only) {
    // Orphan cards wrap a single top-level leaf — unwrap on export
    return topicToNode(only);
  }
  return buildNode({
    title: section.title,
    titleDerived: section.titleDerived,
    path: section.path,
    extras: section.extras,
    children: section.topics,
  });
}

const DUMP_OPTS: yaml.DumpOptions = {
  lineWidth: 120,
  noRefs: true,
  quotingType: '"',
};

function serialize(doc: TocDocument, sectionOrder: string[]): string {
  const byId = new Map(doc.sections.map((s) => [s.id, s]));
  const items = sectionOrder
    .map((id) => byId.get(id))
    .filter((s): s is Section => Boolean(s))
    .map(sectionToNode);

  // Restore the original root style (bare list vs `items:` key + siblings)
  if (doc.extras?.rootStyle === "list") {
    return yaml.dump(items, DUMP_OPTS);
  }
  const rootExtras = (doc.extras?.rootExtras ?? {}) as Record<string, unknown>;
  return yaml.dump({ ...rootExtras, items }, DUMP_OPTS);
}

function serializeSection(section: Section): string {
  return yaml.dump(sectionToNode(section), DUMP_OPTS);
}

// ── Adapter ─────────────────────────────────────────────────

export const docfxAdapter: TocFormatAdapter = {
  id: FORMAT_ID,
  label: "DocFX (toc.yml)",
  fileExtensions: ["yml", "yaml"],
  // Both true, by construction: `serialize` rebuilds the whole `items`
  // list from `sectionOrder`, and a node needs nothing from the source —
  // extras are spread only when present, so an app-made card writes.
  createCards: true,
  reorderCards: true,
  /**
   * BOTH. A DocFX `toc.yml` is a list of items, and an item with no
   * `items:` key IS a bare entry — which is exactly what this adapter's
   * own parse mints as a standalone (`const isOrphan = rawItems.length
   * === 0`) and what `sectionToNode` unwraps back to on export.
   *
   * METHOD: the format's own grammar, verified against this adapter's
   * round trip — the published `toc.yml` schema puts `name`/`href` and
   * `items` on the same item shape, so a top-level entry needs no
   * children to be legal, and the conformance suite's fixpoint is the
   * standing proof that we write it back byte-for-byte.
   */
  rootBearing: { sections: true, orphans: true },
  detect,
  parse,
  serialize,
  serializeSection,
  sample: { fileName: "toc.yml", content: SAMPLE_CONTENT },
};
