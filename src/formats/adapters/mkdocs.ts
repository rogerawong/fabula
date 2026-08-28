/**
 * mkdocs.ts — Format adapter for MkDocs navigation (`nav:` inside
 * mkdocs.yml). https://www.mkdocs.org/user-guide/configuration/#nav
 *
 * FORMAT SHAPE (nav lives INSIDE a larger config file):
 *   site_name: My Docs          # arbitrary sibling config keys
 *   nav:
 *   - Home: index.md            # single-key map: title → path (leaf)
 *   - getting-started.md        # bare path (title derived from filename)
 *   - User Guide:               # single-key map: title → list (section)
 *     - user-guide/index.md
 *     - Install: user-guide/install.md
 *   theme: { name: material }
 *
 * MODEL MAPPING:
 * - nav entry with a list value      → regular section
 * - nav entry that is a leaf         → orphan section (compact card)
 * - bare path                        → titleDerived: true (renaming
 *   writes the `Title: path` form on export)
 * - THE WHOLE SURROUNDING CONFIG round-trips via TocDocument.extras:
 *   we keep the loaded config object and overwrite its `nav` on
 *   serialize — spread-assignment preserves every sibling key AND the
 *   nav key's original position.
 */

import yaml from "js-yaml";
import { newId } from "@/model/id";
import { deriveDocumentName, deriveTitleFromPath } from "@/model/naming";
import type { Section, TocDocument, Topic } from "@/model/types";
import type { TocFormatAdapter } from "../types";
import SAMPLE_CONTENT from "../samples/mkdocs-sample.yml?raw";

const FORMAT_ID = "mkdocs";

type NavValue = unknown;

// ── Detection ───────────────────────────────────────────────

function looksLikeNavNode(v: unknown): boolean {
  if (typeof v === "string") return true;
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  return Object.keys(v).length === 1;
}

function detect(parsed: unknown): number {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return 0;
  const nav = (parsed as Record<string, unknown>).nav;
  if (!Array.isArray(nav)) return 0;
  if (nav.length === 0) return 0.5;
  return nav.every(looksLikeNavNode) ? 0.9 : 0;
}

// ── Parsing ─────────────────────────────────────────────────

/** Unpack a nav node into (title, value). Defensive on odd shapes. */
function unpack(node: NavValue): { title: string; derived: boolean; value: unknown } {
  if (typeof node === "string") {
    return { title: deriveTitleFromPath(node), derived: true, value: node };
  }
  if (typeof node === "object" && node !== null && !Array.isArray(node)) {
    const key = Object.keys(node)[0];
    if (key !== undefined) {
      return {
        title: key,
        derived: false,
        value: (node as Record<string, unknown>)[key],
      };
    }
  }
  return { title: "Untitled", derived: true, value: undefined };
}

function parseNavNode(node: NavValue): Topic {
  const { title, derived, value } = unpack(node);
  return {
    id: newId(),
    title,
    titleDerived: derived || undefined,
    path: typeof value === "string" ? value : undefined,
    children: Array.isArray(value) ? value.map(parseNavNode) : [],
  };
}

function parse(raw: string, fileName: string): TocDocument {
  const loaded = yaml.load(raw);
  if (
    typeof loaded !== "object" ||
    loaded === null ||
    Array.isArray(loaded) ||
    !Array.isArray((loaded as Record<string, unknown>).nav)
  ) {
    throw new Error(
      "Not an MkDocs config: expected a mapping with a `nav:` list " +
        "(see mkdocs.org/user-guide/configuration/#nav)",
    );
  }
  const config = loaded as Record<string, unknown>;
  const nav = config.nav as NavValue[];

  const sections: Section[] = nav.map((node) => {
    const { title, derived, value } = unpack(node);
    const isSection = Array.isArray(value);
    return {
      id: newId(),
      title,
      titleDerived: derived || undefined,
      path: typeof value === "string" ? value : undefined,
      isOrphan: isSection ? undefined : true,
      topics: isSection ? (value as NavValue[]).map(parseNavNode) : [parseNavNode(node)],
    };
  });

  return {
    id: newId(),
    name: deriveDocumentName(fileName),
    formatId: FORMAT_ID,
    // the ENTIRE config (nav included — overwritten on serialize, which
    // keeps the nav key's position among its siblings)
    extras: { config: JSON.parse(JSON.stringify(config)) as Record<string, unknown> },
    sections,
  };
}

// ── Serialization ───────────────────────────────────────────

function topicToNode(t: Topic): unknown {
  if (t.children.length > 0) {
    return { [t.title]: t.children.map(topicToNode) };
  }
  // A derived title means the source was a bare path — keep it bare.
  // An explicit rename cleared the flag, so the map form is written.
  if (t.titleDerived && t.path) return t.path;
  if (t.path) return { [t.title]: t.path };
  return { [t.title]: null };
}

function sectionToNode(section: Section): unknown {
  const only = section.topics[0];
  if (section.isOrphan && section.topics.length === 1 && only) {
    // orphan wraps a single leaf entry — unwrap on export
    return topicToNode(only);
  }
  return { [section.title]: section.topics.map(topicToNode) };
}

const DUMP_OPTS: yaml.DumpOptions = {
  lineWidth: 120,
  noRefs: true,
  quotingType: '"',
};

function serialize(doc: TocDocument, sectionOrder: string[]): string {
  const byId = new Map(doc.sections.map((s) => [s.id, s]));
  const nav = sectionOrder
    .map((id) => byId.get(id))
    .filter((s): s is Section => Boolean(s))
    .map(sectionToNode);

  // Overwriting `nav` on the original config keeps its key position and
  // every sibling setting verbatim. Documents created inside the app
  // have no stored config — a bare { nav } is still a valid mkdocs.yml.
  const config = (doc.extras?.config ?? {}) as Record<string, unknown>;
  return yaml.dump({ ...config, nav }, DUMP_OPTS);
}

function serializeSection(section: Section): string {
  return yaml.dump(sectionToNode(section), DUMP_OPTS);
}

// ── Adapter ─────────────────────────────────────────────────

export const mkdocsAdapter: TocFormatAdapter = {
  id: FORMAT_ID,
  label: "MkDocs (mkdocs.yml nav)",
  fileExtensions: ["yml", "yaml"],
  // Both true, by construction: `nav` is rebuilt from `sectionOrder`, and
  // a section serializes from the model alone — a document created inside
  // the app has no stored config and a bare `{ nav }` is still valid.
  createCards: true,
  reorderCards: true,
  /**
   * BOTH. An MkDocs `nav:` entry is either a mapping to a LIST (a
   * section) or a mapping to a PAGE — and a bare string path is legal
   * too. This adapter's parse already mints the second as a standalone
   * (`isOrphan: isSection ? undefined : true`) and `sectionToNode`
   * unwraps it back to the bare form.
   *
   * METHOD: the published `nav` grammar, verified against this adapter's
   * own round trip — `mkdocs.yml`'s nav accepts `- Title: page.md` at
   * top level, the sample fixtures carry exactly that shape, and the
   * fixpoint check re-emits them unchanged.
   */
  rootBearing: { sections: true, orphans: true },
  detect,
  parse,
  serialize,
  serializeSection,
  sample: { fileName: "mkdocs.yml", content: SAMPLE_CONTENT },
};
