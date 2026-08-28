/**
 * mintlify.ts — Format adapter for Mintlify's `docs.json`.
 * https://mintlify.com/docs/organize/settings
 *
 * FORMAT SHAPE (the nav is a subtree of a config file carrying everything
 * else too — MkDocs is the closest sibling, not DocFX):
 *   {
 *     "$schema": "https://mintlify.com/docs.json",
 *     "name": "My Docs",                  // arbitrary sibling config keys
 *     "navigation": {
 *       "languages": [                    // ONE of: pages | groups | tabs |
 *         { "language": "en",             // anchors | dropdowns | versions |
 *           "tabs": [                     // languages | products
 *             { "tab": "Documentation",
 *               "groups": [
 *                 { "group": "Get started", "root": "index",
 *                   "pages": ["quickstart", { "group": "CLI", "pages": [...] }] }
 *               ] } ] },
 *         { "$ref": "./fr.json" }         // nav that lives in another file
 *       ],
 *       "global": { "anchors": [{ "anchor": "Blog", "href": "https://…" }] }
 *     },
 *     "theme": "mint", "colors": {…}, "seo": {…}
 *   }
 *
 * MODEL MAPPING (docs/13):
 * - `group` object                    → section (card), WHEREVER it sits
 * - page path string in a group       → topic, `titleDerived: true`
 * - `group` nested inside `pages`     → topic with children (depth 6 seen)
 * - tab / language / dropdown / …     → NOT cards: recorded as the section's
 *   `chain`, the ordered ancestor path the serializer partitions by
 * - top-level page string, `$ref`,
 *   global anchor, unrecognised object → orphan section (compact card),
 *   locked; a `$ref` is also `sealed`, since its nav really does live
 *   elsewhere
 * - a group sourcing its pages from a spec instead of listing them →
 *   `sealed` section with zero rows (NOT an empty card — the opposite)
 * - group `root`                      → the section's `path`; it lives
 *   OUTSIDE the pages array and must be written back to `root`
 * - every other group key             → section `extras`, verbatim
 * - everything outside `navigation`   → `doc.extras.config`, verbatim
 *
 * ROUND TRIP: `docs.json` has no comments, so JSON re-serialization can
 * clear a bar YAML cannot — byte identity with the input for any
 * consistently formatted file, not merely a fixpoint. `parse` records the
 * whole config, the indent unit and the trailing-newline state; `serialize`
 * rebuilds only the navigation and re-applies both. A file with drifted
 * indentation re-exports canonicalised: a whitespace-only diff in a
 * machine-maintained config, deliberately preferred over a JSON CST.
 *
 * `parse` uses `JSON.parse`; `detect` keeps the registry's shared js-yaml
 * result (docs/04 forbids re-parsing for detection). Two parsers reading
 * the same bytes is fine only because they disagree exclusively about
 * inputs we refuse — which makes the refuse list load bearing: duplicate
 * keys (js-yaml errors, `JSON.parse` silently drops one) and integer-like
 * keys (JavaScript hoists them to the front of the object).
 */

import { newId } from "@/model/id";
import { deriveDocumentName, deriveTitleFromPath } from "@/model/naming";
import { chainKey, chainPathKey, partitionByChain } from "@/model/selectors";
import { containerFor, unhousedSections } from "@/model/containers";
import type {
  ContainerDescriptor,
  Section,
  SectionId,
  SectionSeal,
  TocDocument,
  Topic,
} from "@/model/types";
import { SerializeRefusedError } from "../types";
import type { FormatRecognizer, TocFormatAdapter } from "../types";
import SAMPLE_CONTENT from "../samples/mintlify-sample.json?raw";

const FORMAT_ID = "mintlify";
const SCHEMA_URL = "https://mintlify.com/docs.json";

/**
 * Where a card sat in a container array. Held in the stored template and
 * refilled from the model on serialize, so cards can be reordered,
 * removed or added without disturbing the containers around them. NUL
 * makes it unreachable from any real page path.
 */
const CARD_SLOT = "\u0000card";

/**
 * The source key order of the object a card or nested group came from,
 * kept in its `extras` and stripped on export. It answers three
 * questions no other field can, for an unedited node:
 *
 * - which keys, in which ORDER — an author who wrote `icon` before
 *   `group` gets their file back unchanged;
 * - whether it had a `pages` list AT ALL — a group whose pages come from
 *   a spec has none, and inventing `pages: []` corrupts it;
 * - whether it was a GROUP at all — otherwise a group listing no pages
 *   is indistinguishable from a bare page path and collapses into one,
 *   losing the author's title.
 */
const KEY_ORDER = "\u0000keys";

/**
 * The arrays a container may hold. Schema-verified: a container carries
 * exactly one of these, and a container that carries two is refused —
 * cards are matched to a container by chain path, so both arrays would
 * draw from one queue and the second would export empty.
 */
const CONTAINER_ARRAYS = [
  "languages",
  "versions",
  "tabs",
  "dropdowns",
  "anchors",
  "products",
  "menu",
  "groups",
  "pages",
] as const;

/** The key a container takes its label from, in priority order. */
const CONTAINER_NAMES = [
  "tab",
  "anchor",
  "dropdown",
  "version",
  "language",
  "product",
  "item",
] as const;

/**
 * Keys that replace a group's `pages` with generated content. Present
 * WITHOUT `pages`, they mean the card's contents come from a spec we do
 * not read — a declared seal rather than an empty card.
 */
const GENERATED_FROM: Record<string, string> = {
  openapi: "OpenAPI",
  asyncapi: "AsyncAPI",
  graphql: "GraphQL",
  sdk: "SDK",
};

/** Object keys JavaScript hoists to the front, silently reordering them. */
const INTEGER_LIKE = /^(?:0|[1-9][0-9]*)$/;

/**
 * A byte-order mark, which some Windows editors write and `JSON.parse`
 * rejects outright. Recorded and re-emitted like the indent unit: a file
 * that loses its BOM on export is a diff nobody asked for, and a file
 * that fails to load at all names a character its author cannot see.
 */
const BOM = "﻿";

// ── Shape predicates ────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGroup(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.group === "string";
}

function childArrays(node: Record<string, unknown>): string[] {
  return CONTAINER_ARRAYS.filter((key) => Array.isArray(node[key]));
}

/** A node that holds other nav entries, rather than being one itself. */
function isContainer(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  // Checked inline rather than through isGroup: as a type guard, isGroup
  // would narrow the remaining value to `never`.
  if (typeof value.group === "string") return false;
  return childArrays(value).length > 0 || isRecord(value.global);
}

/**
 * Mintlify’s own noun for a container, for copy only (docs/13 v2):
 * "tab", "dropdown", "language". The navigation root and `global` have
 * no noun, so they declare none and every copy surface shows the label
 * alone.
 */
const KIND_OF: Record<string, string> = {
  tab: "tab",
  anchor: "anchor",
  dropdown: "dropdown",
  version: "version",
  language: "language",
  product: "product",
  item: "menu item",
};

function containerKind(node: Record<string, unknown>): string | undefined {
  for (const key of CONTAINER_NAMES) {
    const value = node[key];
    if (typeof value === "string" && value.length > 0) return KIND_OF[key];
  }
  return undefined;
}

function containerLabel(node: Record<string, unknown>): string {
  for (const key of CONTAINER_NAMES) {
    const value = node[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

/** Only a JSON object can be a docs.json — YAML with a `navigation:` key isn't. */
function looksLikeJsonObject(raw: string): boolean {
  return raw.trimStart().startsWith("{");
}

// ── Detection ───────────────────────────────────────────────

function detect(parsed: unknown, raw: string, fileName: string): number {
  if (!looksLikeJsonObject(raw) || !isRecord(parsed)) return 0;
  const nav = parsed.navigation;
  // Legacy mint.json puts an ARRAY of groups here. Scoring it 0 is what
  // lets the recognizer below name it instead of a parse error.
  if (!isRecord(nav)) return 0;
  const schema = parsed.$schema;
  if (typeof schema === "string" && /mintlify\.com/i.test(schema)) return 0.98;
  if (/(^|\/)docs\.json$/i.test(fileName)) return 0.9;
  return childArrays(nav).length > 0 || isRecord(nav.global) ? 0.7 : 0;
}

// ── The refuse list ─────────────────────────────────────────

/** A key JavaScript hoists: a canonical array index, so below 2^32-1. */
function isIndexKey(key: string): boolean {
  return INTEGER_LIKE.test(key) && Number(key) < 4294967295;
}

/** The order a JavaScript object will actually iterate these keys in. */
function hoisted(keys: readonly string[]): string[] {
  const indexes = keys.filter(isIndexKey).sort((a, b) => Number(a) - Number(b));
  return [...indexes, ...keys.filter((key) => !isIndexKey(key))];
}

/**
 * Read the source's own key order, object by object, and report the two
 * shapes this adapter cannot round-trip.
 *
 * DUPLICATES: `JSON.parse` resolves them last-wins without a word, so
 * `{"navigation": A, "navigation": B}` would load as B and re-export
 * having dropped A; js-yaml calls the same bytes invalid. The registry's
 * js-yaml pass catches most, but the load dialog lets a user name the
 * format outright and reach `parse` directly, so this is the only guard
 * on that path. Keys are unescaped before comparison — `a` and `a`
 * are the same key to `JSON.parse` and must be to us.
 *
 * REORDERING: an object mixing array-index keys with others iterates
 * index-first, so its export would move keys the author placed. Only an
 * order JavaScript would actually CHANGE earns a refusal: `errors` with
 * its schema-required `404` is a valid file, and refusing it told the
 * author to rename a key the schema names for them.
 */
function scanKeys(raw: string): { duplicate?: string; reordered?: string } {
  /** One frame per open container; null for arrays, which have no keys. */
  const stack: (string[] | null)[] = [];
  const unescape = (text: string): string => {
    try {
      return JSON.parse(`"${text}"`) as string;
    } catch {
      return text;
    }
  };

  let i = 0;
  while (i < raw.length) {
    const char = raw[i];
    if (char === '"') {
      let end = i + 1;
      let text = "";
      while (end < raw.length && raw[end] !== '"') {
        if (raw[end] === "\\") {
          text += raw.slice(end, end + 2);
          end += 2;
          continue;
        }
        text += raw[end];
        end += 1;
      }
      let after = end + 1;
      while (after < raw.length && /\s/.test(raw[after]!)) after += 1;
      const keys = stack[stack.length - 1];
      if (raw[after] === ":" && keys) {
        const key = unescape(text);
        if (keys.includes(key)) return { duplicate: key };
        keys.push(key);
      }
      i = end + 1;
      continue;
    }
    if (char === "{") stack.push([]);
    else if (char === "[") stack.push(null);
    else if (char === "}" || char === "]") {
      const frame = stack.pop();
      if (frame) {
        const after = hoisted(frame);
        const moved = frame.find((key, index) => after[index] !== key);
        if (moved !== undefined) return { reordered: after.find(isIndexKey) ?? moved };
      }
    }
    i += 1;
  }
  return {};
}

// ── Recorded formatting ─────────────────────────────────────

/**
 * The indent unit, as `JSON.stringify` takes it. 0 for a minified file,
 * which then re-exports minified rather than reformatted.
 */
function detectIndent(raw: string): number | string {
  const match = raw.match(/\n([ \t]+)"/);
  if (!match?.[1]) return 0;
  return match[1].includes("\t") ? "\t" : match[1].length;
}

// ── Parsing ─────────────────────────────────────────────────

/** A locked entry's display title: a real name if it has one, else its shape. */
function lockedTitle(node: Record<string, unknown>): {
  title: string;
  titleDerived?: true;
} {
  for (const key of CONTAINER_NAMES) {
    const value = node[key];
    // A named anchor or tab carries its own title — not derived.
    if (typeof value === "string" && value.length > 0) return { title: value };
  }
  for (const key of ["$ref", "href"] as const) {
    const value = node[key];
    if (typeof value === "string" && value.length > 0) {
      return { title: value, titleDerived: true };
    }
  }
  const [first] = Object.keys(node);
  if (first === undefined) return { title: "Untitled", titleDerived: true };
  const value = node[first];
  return {
    title: typeof value === "string" ? `${first}: ${value}` : first,
    titleDerived: true,
  };
}

/** A seal for a container that generates its contents instead of listing them. */
function sealOf(node: Record<string, unknown>): SectionSeal | undefined {
  for (const [key, label] of Object.entries(GENERATED_FROM)) {
    const value = node[key];
    if (value === undefined) continue;
    const source =
      typeof value === "string"
        ? value
        : isRecord(value) && typeof value.source === "string"
          ? value.source
          : undefined;
    return { source: source === undefined ? label : `${label} ${source}` };
  }
  return undefined;
}

function parseTopic(entry: unknown): Topic {
  if (typeof entry === "string") {
    return {
      id: newId(),
      title: deriveTitleFromPath(entry),
      titleDerived: true,
      path: entry,
      children: [],
    };
  }
  if (isGroup(entry)) {
    const { group, root, pages, ...rest } = entry;
    refusePageList(pages, group as string);
    return {
      id: newId(),
      title: group as string,
      ...(typeof root === "string" ? { path: root } : {}),
      extras: { ...rest, [KEY_ORDER]: Object.keys(entry) },
      children: Array.isArray(pages) ? pages.map(parseTopic) : [],
    };
  }
  // The schema allows only a string or a group inside `pages`, so this is
  // an entry we round-trip without interpreting. `href` is a link out of
  // the docs set; everything else is a rule that generates pages, or a
  // shape we do not know — both `pattern` until a collection adapter can
  // resolve one and not the other (docs/12, docs/13).
  const node = isRecord(entry) ? entry : {};
  return {
    id: newId(),
    ...lockedTitle(node),
    lock: { kind: typeof node.href === "string" ? "external" : "pattern" },
    extras: node,
    children: [],
  };
}

/**
 * A `pages` value that is not a list is neither readable nor
 * preservable — it is destructured out of the keys we round-trip
 * verbatim, so accepting it would silently replace the author's content
 * with an empty card. Refuse it by name instead.
 */
function refusePageList(pages: unknown, group: string): void {
  if (pages !== undefined && !Array.isArray(pages)) {
    throw new Error(
      `The group "${group}" in this docs.json has a \`pages\` value that ` +
        "is not a list, so Fabula cannot read it without losing it. " +
        "Fix that group and load again.",
    );
  }
}

function groupSection(entry: Record<string, unknown>, chain: string[]): Section {
  const { group, root, pages, ...rest } = entry;
  refusePageList(pages, group as string);
  const lists = Array.isArray(pages);
  const sealed = lists ? undefined : sealOf(rest);
  return {
    id: newId(),
    title: group as string,
    ...(typeof root === "string" ? { path: root } : {}),
    ...(chain.length > 0 ? { chain: [...chain] } : {}),
    ...(sealed ? { sealed } : {}),
    extras: { ...rest, [KEY_ORDER]: Object.keys(entry) },
    topics: lists ? (pages as unknown[]).map(parseTopic) : [],
  };
}

/**
 * A card for an entry that is not a group: a bare page path, a `$ref`, a
 * global anchor, an unrecognised object. docs/04's orphan mapping, which
 * removes the zero-card outcome entirely — silent invisibility is the
 * failure mode this codebase keeps re-learning.
 */
function orphanSection(entry: unknown, chain: string[]): Section {
  const topic = parseTopic(entry);
  const ref = isRecord(entry) && typeof entry.$ref === "string" ? entry.$ref : undefined;
  return {
    id: newId(),
    title: topic.title,
    ...(topic.titleDerived ? { titleDerived: true } : {}),
    ...(topic.path !== undefined ? { path: topic.path } : {}),
    ...(chain.length > 0 ? { chain: [...chain] } : {}),
    // A $ref card's contents genuinely are generated elsewhere — the
    // exact case a declared seal exists for.
    ...(ref !== undefined ? { sealed: { source: ref } } : {}),
    isOrphan: true,
    topics: [topic],
  };
}

/**
 * Walk the navigation, collecting cards and leaving a template behind:
 * `node` is mutated in place (it is already a clone) so that every card
 * position becomes a CARD_SLOT and every container keeps its own keys,
 * values and key order.
 */
/**
 * What a container-level array may hold, and whether it may empty —
 * declared per array KEY, which is where the format states it, rather
 * than inferred from whatever happens to be inside.
 *
 * `groups` holds group objects only; a container-level `pages` holds
 * page-path strings AND groups; `anchors` holds named links, which model
 * as orphan cards. The arrays that hold other CONTAINERS (`tabs`,
 * `languages`, `menu`…) bear no cards at all: a `$ref` orphan may sit in
 * `languages`, but nothing can be dropped there. `tabs.groups` has
 * `minItems: 1` (schema-verified), so a tab may not be emptied.
 */
const ARRAY_BEARS: Record<
  string,
  { accepts: { sections: boolean; orphans: boolean }; mayEmpty: boolean }
> = {
  groups: { accepts: { sections: true, orphans: false }, mayEmpty: false },
  pages: { accepts: { sections: true, orphans: true }, mayEmpty: true },
  anchors: { accepts: { sections: false, orphans: true }, mayEmpty: true },
};

const BEARS_NOTHING = {
  accepts: { sections: false, orphans: false },
  mayEmpty: true,
};

function walkContainer(
  node: Record<string, unknown>,
  chain: string[],
  sections: Section[],
  seen: Set<string>,
  containers: ContainerDescriptor[],
): void {
  const key = chainPathKey(chain);
  if (seen.has(key)) {
    throw new Error(
      `Two navigation containers share the path "${chain.join(" › ")}". ` +
        "Cards are matched to their container by that path, so Fabula " +
        "cannot tell these two apart — rename one of them and load again.",
    );
  }
  seen.add(key);

  const arrays = childArrays(node);
  if (arrays.length > 1) {
    // Mintlify restricts each level to one kind of child, and the
    // serializer relies on it: cards are matched to a container by chain
    // path, so two arrays here would draw from one queue and the second
    // would export empty with its cards relocated into the first.
    throw new Error(
      `A navigation container in this docs.json holds more than one kind ` +
        `of child (${arrays.join(", ")}). Mintlify allows only one per ` +
        "level — split them and load again.",
    );
  }
  for (const arrayKey of arrays) {
    // Declared here, at parse, for EVERY container — including one that
    // bears sections and holds none. Derived from the cards inside, that
    // container would refuse a legal move and draw no lane, and its
    // first card could never be placed (docs/13 v2).
    const bears = ARRAY_BEARS[arrayKey] ?? BEARS_NOTHING;
    const kind = containerKind(node);
    containers.push({
      chainKey: key,
      label: chain.length > 0 ? (chain[chain.length - 1] ?? "") : "Top level",
      ...(kind ? { kind } : {}),
      order: containers.length,
      accepts: { ...bears.accepts },
      mayEmpty: bears.mayEmpty,
    });

    node[arrayKey] = (node[arrayKey] as unknown[]).map((entry) => {
      if (isGroup(entry)) {
        sections.push(groupSection(entry, chain));
        return CARD_SLOT;
      }
      if (isContainer(entry)) {
        walkContainer(
          entry,
          [...chain, containerLabel(entry)],
          sections,
          seen,
          containers,
        );
        return entry;
      }
      sections.push(orphanSection(entry, chain));
      return CARD_SLOT;
    });
  }
  if (isRecord(node.global)) {
    walkContainer(node.global, [...chain, "global"], sections, seen, containers);
  }
}

function parse(rawInput: string, fileName: string): TocDocument {
  const bom = rawInput.startsWith(BOM);
  const raw = bom ? rawInput.slice(BOM.length) : rawInput;
  const { duplicate, reordered } = scanKeys(raw);
  if (duplicate !== undefined) {
    throw new Error(
      `This docs.json sets "${duplicate}" twice in the same object. JSON ` +
        "readers disagree about which one wins, so exporting it would " +
        "silently drop one — remove the duplicate and load again.",
    );
  }
  if (reordered !== undefined) {
    throw new Error(
      `This docs.json has the key "${reordered}" after a non-numeric one. ` +
        "JavaScript moves numeric keys to the front of their object, so " +
        "exporting would reorder them — put it first and load again.",
    );
  }

  let loaded: unknown;
  try {
    loaded = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON: ${message}`);
  }
  if (!isRecord(loaded) || !isRecord(loaded.navigation)) {
    throw new Error(
      "Not a Mintlify docs.json: expected a JSON object with a " +
        "`navigation` object (see mintlify.com/docs/organize/settings)",
    );
  }
  const config = JSON.parse(JSON.stringify(loaded)) as Record<string, unknown>;
  const sections: Section[] = [];
  const containers: ContainerDescriptor[] = [];
  walkContainer(
    config.navigation as Record<string, unknown>,
    [],
    sections,
    new Set(),
    containers,
  );

  return {
    id: newId(),
    // `name` is schema-required, so the file-name fallback is theoretical.
    name:
      typeof loaded.name === "string" && loaded.name.length > 0
        ? loaded.name
        : deriveDocumentName(fileName.replace(/\.json$/i, "")),
    formatId: FORMAT_ID,
    extras: {
      // The whole file, with `navigation` reduced to its container
      // skeleton. Spread-assigning `navigation` back on serialize keeps
      // every sibling key AND the navigation key's original position.
      config,
      indent: detectIndent(raw),
      trailingNewline: raw.endsWith("\n"),
      // Line endings and the BOM travel with the file for the same
      // reason its indent unit does: rewriting them turns an unchanged
      // document into a whole-file diff.
      ...(raw.includes("\r\n") ? { crlf: true } : {}),
      ...(bom ? { bom: true } : {}),
    },
    sections,
    containers,
  };
}

// ── Serialization ───────────────────────────────────────────

/**
 * Write a group object back in the shape its source had: the same keys,
 * in the same order, with `group`, `root` and `pages` taking their
 * current values from the model. Keys the model gained since (a `root`
 * from an edit, a `pages` list on a card that had none) are appended,
 * and a node created inside the app — which has no recorded order — gets
 * the canonical one.
 */
function groupNode(node: {
  title: string;
  path?: string;
  extras?: Record<string, unknown>;
  children: unknown[];
  listsPages: boolean;
}): Record<string, unknown> {
  const extras = { ...(node.extras ?? {}) };
  const order = extras[KEY_ORDER];
  delete extras[KEY_ORDER];
  const source = Array.isArray(order) ? (order as string[]) : ["group", "root"];

  const out: Record<string, unknown> = {};
  for (const key of source) {
    if (key === "group") out.group = node.title;
    else if (key === "root") {
      if (node.path !== undefined) out.root = node.path;
    } else if (key === "pages") out.pages = node.children;
    else if (key in extras) out[key] = extras[key];
  }
  if (!("group" in out)) out.group = node.title;
  if (node.path !== undefined && !("root" in out)) out.root = node.path;
  for (const [key, value] of Object.entries(extras)) {
    if (!(key in out)) out[key] = value;
  }
  // A group whose pages come from a spec had no `pages` key; inventing an
  // empty one corrupts it. One that gained rows needs the key regardless.
  if (!("pages" in out) && (node.listsPages || node.children.length > 0)) {
    out.pages = node.children;
  }
  return out;
}

/** Did this node's source list its pages, rather than generating them? */
function listedPages(extras: Record<string, unknown> | undefined): boolean {
  const order = extras?.[KEY_ORDER];
  return Array.isArray(order) ? (order as string[]).includes("pages") : true;
}

/** Was this node a group in the source, rather than a bare page path? */
function wasGroup(extras: Record<string, unknown> | undefined): boolean {
  const order = extras?.[KEY_ORDER];
  return Array.isArray(order) && (order as string[]).includes("group");
}

function topicToNode(topic: Topic): unknown {
  if (topic.lock) return topic.extras ?? {};
  // A page is a bare path string, and stays one through a rename the
  // format cannot express — it has no field for a page title, so the
  // path is the only thing worth writing. A node the source wrote as a
  // group stays a group even with no pages left, or its author's title
  // would vanish into a path.
  if (
    !wasGroup(topic.extras) &&
    topic.children.length === 0 &&
    topic.path !== undefined
  ) {
    return topic.path;
  }
  return groupNode({
    title: topic.title,
    path: topic.path,
    extras: topic.extras,
    children: topic.children.map(topicToNode),
    listsPages: listedPages(topic.extras),
  });
}

function sectionToNode(section: Section): unknown {
  if (section.isOrphan) {
    const only = section.topics[0];
    return only ? topicToNode(only) : {};
  }
  return groupNode({
    title: section.title,
    path: section.path,
    extras: section.extras,
    children: section.topics.map(topicToNode),
    listsPages: listedPages(section.extras),
  });
}

/**
 * Rebuild one container from the template, refilling its card slots from
 * the queue for this chain. Order WITHIN a chain comes from the canvas;
 * the order OF chains comes from the template, never from where member
 * cards happen to sit — that would be action-at-a-distance.
 */
function fillContainer(
  node: unknown,
  chain: string[],
  queues: Map<string, Section[]>,
): unknown {
  if (!isRecord(node)) return node;
  const out: Record<string, unknown> = { ...node };
  const key = chainPathKey(chain);
  for (const arrayKey of childArrays(out)) {
    const queue = queues.get(key) ?? [];
    const filled: unknown[] = [];
    for (const entry of out[arrayKey] as unknown[]) {
      if (entry === CARD_SLOT) {
        // A deleted card leaves no hole; a surviving one takes its place.
        const section = queue.shift();
        if (section) filled.push(sectionToNode(section));
        continue;
      }
      filled.push(
        fillContainer(
          entry,
          [...chain, isRecord(entry) ? containerLabel(entry) : ""],
          queues,
        ),
      );
    }
    // Cards created since the file was read.
    while (queue.length > 0) filled.push(sectionToNode(queue.shift()!));
    out[arrayKey] = filled;
  }
  if (isRecord(out.global)) {
    out.global = fillContainer(out.global, [...chain, "global"], queues);
  }
  return out;
}

function rebuildNavigation(template: unknown, queues: Map<string, Section[]>): unknown {
  const nav = fillContainer(template, [], queues);
  const orphaned = [...queues.values()].flat();
  if (orphaned.length > 0 && isRecord(nav)) {
    // A card whose container is gone still has to be written somewhere:
    // losing it would break page-path conservation, which outranks
    // placing it correctly.
    const arrayKey = childArrays(nav)[0] ?? "pages";
    const existing = Array.isArray(nav[arrayKey]) ? (nav[arrayKey] as unknown[]) : [];
    nav[arrayKey] = [...existing, ...orphaned.map(sectionToNode)];
  }
  return nav;
}

/**
 * The write path's consultation of `accepts` — the same declared data
 * the container descriptors and the drop-time refusal read, never a
 * second table.
 *
 * A card with no chain belongs to the ROOT container. Where the root
 * navigation is a container array (`tabs`, `languages`, `dropdowns`)
 * that container declares it bears no sections, and appending a group
 * object there writes a file Mintlify rejects — measured against the
 * published schema, whose 14 permitted `tabs.items` shapes every one
 * require `tab`.
 *
 * SEALED ORPHANS ONLY are carved out, and the narrowing is docs/22's
 * (Decision 5). The carve-out's justification was always `$ref`
 * pointers, which legitimately sit in a container array that bears no
 * cards — and those parse SEALED (`orphanSection` sets
 * `sealed: { source: ref }`). Exempting EVERY orphan was wider than the
 * justification, and measured at `a8f28cf` an UNSEALED standalone
 * reaching a bears-no-orphans home wrote schema-invalid bytes unrefused:
 * a bare page path appended into `navigation.tabs`, where all 14 shapes
 * the published schema permits require `tab`, and into a `groups` array,
 * which holds group objects. That second case has a live producer — one
 * AI run hoisting one leaf inherits the chain of the card above it.
 *
 * An unsealed orphan in such a home has NO legitimate producer at parse:
 * every orphan the parser mints from a container array either carries a
 * seal or sits somewhere that bears it.
 *
 * A guard consumes DECLARED inputs. A document with no container
 * descriptors at all declares nothing here, so `containerFor` answers
 * undefined and this checks nothing rather than refusing on a guess.
 */
function refuseUnhousedSections(doc: TocDocument): void {
  // THE ONE PREDICATE (`model/containers.ts`), not a fourth copy of it.
  // The Overview attention line and the card mark read the same answer,
  // so this refusal can never disagree with what the canvas showed.
  const unhoused = unhousedSections(doc);
  if (unhoused.length === 0) return;
  throw new SerializeRefusedError(
    unhousedMessage(doc, unhoused),
    unhoused.map((s) => s.title),
  );
}

/**
 * ONE PRODUCER, and PATH-NEUTRAL.
 *
 * The card may have arrived by a canvas gesture or out of an AI run,
 * so the sentence has to be true of both and blame neither. The
 * retired discard copy is the receipt for why: it blamed the user for
 * the model's non-compliance, which was false half the time and
 * unactionable the rest.
 */
function unhousedMessage(doc: TocDocument, unhoused: readonly Section[]): string {
  const named = unhoused.map((s) => `"${s.title}"`);
  const subject =
    named.length === 1
      ? `${named[0]} sits`
      : `${named.slice(0, 2).join(", ")}${named.length > 2 ? ` and ${named.length - 2} more` : ""} sit`;

  // ASKED OF THE SPECIES, because the two species have different homes:
  // a `groups` array bears sections and refuses a bare page path, and an
  // `anchors` array does the reverse. Suggesting section homes to a
  // standalone would be advice that produces this same refusal again.
  const wantsOrphanHome = unhoused.every((s) => s.isOrphan);
  const homes = (doc.containers ?? [])
    .filter(
      (c) =>
        c.chainKey !== "" && (wantsOrphanHome ? c.accepts.orphans : c.accepts.sections),
    )
    .map((c) => `"${c.label}"`);
  const remedy =
    homes.length > 0
      ? `Drag ${unhoused.length === 1 ? "it" : "each"} into ${homes
          .slice(0, 2)
          .join(" or ")}${homes.length > 2 ? " (or another)" : ""}.`
      : // NO HOME EXISTS, so "drag it somewhere" would be unactionable.
        // The by-hand remedy, and the app's own boundary with it — the
        // same words docs/13's recorded absence uses.
        `No container in this docs.json holds ${
          wantsOrphanHome ? "pages" : "groups"
        } — add one yourself; the app never edits containers.`;

  // WHERE THE CARD IS, and the two arrivals are genuinely different
  // places. A card with no chain sits at the top level; a card that
  // INHERITED a chain sits inside a container that refuses its species,
  // and telling that user it is "outside every navigation container"
  // is false, while telling them to drag it into the container it is
  // already in is advice to repeat what they did.
  const first = unhoused[0]!;
  const home = containerFor(doc, chainKey(first));
  const inside = home !== undefined && home.chainKey !== "";
  if (!inside) {
    return (
      `Cannot export: ${subject} outside every navigation container. ` +
      `${remedy} This docs.json's top level holds containers only.`
    );
  }
  const holds = home.accepts.sections
    ? "groups only"
    : home.accepts.orphans
      ? "pages only"
      : "containers only";
  return `Cannot export: ${subject} in "${home.label}", which holds ${holds}. ${remedy}`;
}

function serialize(doc: TocDocument, sectionOrder: SectionId[]): string {
  const extras = doc.extras;
  const config = isRecord(extras?.config) ? extras.config : undefined;
  const recorded = extras?.indent;
  const indent =
    typeof recorded === "number" || typeof recorded === "string" ? recorded : 2;

  refuseUnhousedSections(doc);

  const queues = new Map<string, Section[]>();
  for (const [key, group] of partitionByChain(doc.sections, sectionOrder)) {
    queues.set(key, [...group]);
  }
  const navigation = rebuildNavigation(config?.navigation ?? { pages: [] }, queues);

  // Documents created inside the app have no stored config; `$schema` and
  // `name` are the two keys a loadable docs.json cannot do without.
  const base = config ?? { $schema: SCHEMA_URL, name: doc.name };
  let out = JSON.stringify({ ...base, navigation }, null, indent);
  if (extras?.trailingNewline !== false) out += "\n";
  // Applied after the newline so the trailing one is CRLF too.
  if (extras?.crlf === true) out = out.replace(/\n/g, "\r\n");
  return extras?.bom === true ? BOM + out : out;
}

function serializeSection(section: Section): string {
  return JSON.stringify(sectionToNode(section), null, 2);
}

// ── Legacy mint.json: recognized, never parsed ──────────────

/**
 * mint.json is Mintlify's previous schema, still in production on real
 * sites. Recognize and redirect: parsing it would mean maintaining a
 * second schema generation, and writing it would mean writing a format
 * Mintlify itself is migrating away from.
 *
 * Lives here rather than in the registry because the knowledge that
 * mint.json is legacy Mintlify belongs next to the code that knows what
 * current Mintlify looks like.
 */
export const legacyMintJsonRecognizer: FormatRecognizer = {
  id: "mintlify-legacy-mint-json",
  test: (parsed, raw, fileName) => {
    if (/(^|\/)mint\.json$/i.test(fileName)) return true;
    // Shape sniff for a differently-named or pasted copy. The signal is
    // a navigation LIST: legacy mint.json puts an array of groups there,
    // where every current docs.json puts an object — which is also why
    // this cannot shadow a real docs.json, since `detect` scores an array
    // navigation 0. "Has no $schema" was the wrong test: mint.json
    // carries its own (mintlify.com/schema.json), so the sniff declined
    // the very files it exists for.
    //
    // Conservative on purpose — unrelated JSON with a `navigation` key
    // must fall through to the generic error, because telling someone
    // their file is legacy Mintlify when it is not sends them to migrate
    // something else.
    if (!looksLikeJsonObject(raw) || !isRecord(parsed)) return false;
    const nav = parsed.navigation;
    if (!Array.isArray(nav) || nav.length === 0) return false;
    return nav.every(isGroup);
  },
  message:
    "That looks like a legacy Mintlify mint.json. Fabula reads the " +
    "current docs.json instead: install Mintlify's CLI (`npm i -g mint`) " +
    "and run `mint dev` in your docs repo, which writes a docs.json from " +
    "your mint.json — then load that file.",
  helpUrl: "https://mintlify.com/docs/organize/settings#upgrade-from-mint-json",
};

// ── Adapter ─────────────────────────────────────────────────

export const mintlifyAdapter: TocFormatAdapter = {
  id: FORMAT_ID,
  label: "Mintlify (docs.json)",
  fileExtensions: ["json"],
  /**
   * TRUE, and the write path really does emit a card created on canvas —
   * `fillContainer` appends whatever is left in the chain's queue.
   *
   * THE GAP THIS USED TO RECORD IS CLOSED (2026-08-20). What it said:
   * a card created on canvas has no `chain`, so it lands in the ROOT
   * queue; where the root navigation is a CONTAINER array (`tabs`,
   * `languages`, `dropdowns`, …) that appended a group object into an
   * array the adapter itself declares bears no cards (`ARRAY_BEARS`
   * omits `tabs`), and nothing on the write path consulted `accepts` —
   * `minItems` knowledge existed for the emptying direction only.
   * Measured before the fix, the bytes were
   * `{"group":…,"pages":[…]}` inside `navigation.languages`, which
   * Mintlify's own published schema rejects: all 14 shapes it permits
   * in a container array require that container's own key.
   *
   * What closed it: `refuseUnhousedSections` above, which consults the
   * SAME `accepts` data the container descriptors and the drop-time
   * refusal read, and throws `SerializeRefusedError` — never bytes.
   * For a page-rooted file the same path was always correct and still
   * serializes.
   *
   * The field stays TRUE and stays a per-ADAPTER answer. It cannot say
   * "depends on the file", and it does not need to: the capability is
   * real — this adapter writes a created card — and WHERE that card may
   * go is a per-document question the write path now answers for
   * itself. docs/13's 2026-08-20 amendment is the record.
   */
  createCards: true,
  /**
   * TRUE — order WITHIN a chain comes from the canvas and is written
   * (`partitionByChain` buckets `sectionOrder`, and each container's card
   * slots refill from its own queue).
   *
   * The order OF chains is not this field's question: moving a card
   * between containers is a chain change with its own command and its own
   * refusal (`cardChainRefusal`), and deriving container order from where
   * member cards sit is the action-at-a-distance docs/13 declined. So
   * "card order is fixed here" would be false about this format, which is
   * what the prompt line this field controls would have said.
   */
  reorderCards: true,
  /**
   * THE FLOOR, AND IT IS NEVER REACHED — which is the honest answer for
   * the one format whose root bearing is a per-DOCUMENT fact.
   *
   * `walkContainer` declares a `ContainerDescriptor` for every array it
   * finds, starting at `navigation` itself with chain key `""`, so a
   * parsed docs.json always answers the bearing question from its own
   * declared root: `pages` bears both, `tabs`/`languages` bear neither
   * (`ARRAY_BEARS`), and docs/22's M1 measured exactly that difference.
   * This static field is consulted only where a document declares no
   * descriptor at all — a `navigation` object holding no recognised
   * array — where nothing has been declared about bearing.
   *
   * SO IT ANSWERS PERMISSIVELY, because a guard consumes DECLARED
   * inputs: with nothing declared, refusing a drop on a guess is worse
   * than allowing one, and `refuseUnhousedSections` is the floor
   * underneath either way (R5). `mintlifySchema.test.ts` pins the
   * unreachability — every shipped fixture declares a root descriptor.
   */
  rootBearing: { sections: true, orphans: true },
  detect,
  parse,
  serialize,
  serializeSection,
  // Groups store their display name in docs.json; pages have no title
  // field anywhere in the schema, so a page rename is inexpressible
  // rather than merely unimplemented (docs/13).
  supportsRename: { sections: true, topics: false },
  sample: { fileName: "docs.json", content: SAMPLE_CONTENT },
};
