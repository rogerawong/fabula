/**
 * Mintlify adapter behavior tests (beyond the shared conformance suite):
 * the round-trip bar docs/13 sets — input identity on a well-formed file,
 * non-navigation keys untouched, page-path multiset conservation — plus
 * containers (chains), locked/sealed nodes, derived page titles, the
 * refuse list, detection, and the legacy mint.json recognizer.
 */

import { describe, expect, it } from "vitest";
import { mintlifyAdapter } from "@/formats/adapters/mintlify";
import { parseDocument } from "@/formats/registry";
import { KnownUnsupportedFormatError } from "@/formats/types";
import { containerFor, containersInOrder, lintContainers } from "@/model/containers";
import { chainKey, chainPathKey } from "@/model/selectors";
import { renameSection } from "@/model/tree";
import type { Section, TocDocument, Topic } from "@/model/types";

import starter from "./fixtures/mintlify/starter-docs.json?raw";
import docsReduced from "./fixtures/mintlify/docs-reduced.json?raw";
import syntheticShapes from "./fixtures/mintlify/synthetic-shapes.json?raw";
import docfxSample from "../samples/docfx-sample.yml?raw";
import mkdocsSample from "../samples/mkdocs-sample.yml?raw";

const idOrder = (doc: TocDocument) => doc.sections.map((s) => s.id);
const roundTrip = (raw: string, fileName = "docs.json") => {
  const doc = mintlifyAdapter.parse(raw, fileName);
  return mintlifyAdapter.serialize(doc, idOrder(doc));
};

/** Every page path the file references: `pages` strings plus group `root`s. */
function pagePaths(json: string): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === "string") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const obj = node as Record<string, unknown>;
    if (typeof obj.root === "string") out.push(obj.root);
    if (Array.isArray(obj.pages)) {
      for (const entry of obj.pages) {
        if (typeof entry === "string") out.push(entry);
        else walk(entry);
      }
    }
    for (const [key, value] of Object.entries(obj)) {
      if (key !== "pages") walk(value);
    }
  };
  walk(JSON.parse(json));
  return out.sort();
}

const findSection = (doc: TocDocument, title: string): Section =>
  doc.sections.find((s) => s.title === title)!;
const findTopic = (section: Section, title: string): Topic =>
  section.topics.find((t) => t.title === title)!;

// ── The round trip ──────────────────────────────────────────

describe("mintlify: round trip", () => {
  it("reproduces a well-formed file byte for byte, trailing-newline state included", () => {
    // The bar docs/13 sets and no shipped adapter meets. starter-docs.json
    // ends WITHOUT a newline; a spurious one is a diff in a config file.
    expect(starter.endsWith("\n")).toBe(false);
    expect(roundTrip(starter)).toBe(starter);
  });

  it("reproduces a canonically-formatted real slice byte for byte", () => {
    expect(docsReduced.endsWith("\n")).toBe(true);
    expect(roundTrip(docsReduced)).toBe(docsReduced);
  });

  it("leaves every non-navigation key byte-identical", () => {
    // Asserted on its own rather than as a corollary of identity: the nav
    // is a subtree of a config file carrying theme, colors, seo, api…
    const before = JSON.parse(docsReduced) as Record<string, unknown>;
    const after = JSON.parse(roundTrip(docsReduced)) as Record<string, unknown>;
    expect(Object.keys(after)).toEqual(Object.keys(before));
    for (const key of Object.keys(before)) {
      if (key === "navigation") continue;
      expect(JSON.stringify(after[key])).toBe(JSON.stringify(before[key]));
    }
  });

  it("conserves the page-path multiset across a reordering edit", () => {
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    const reversed = idOrder(doc).reverse();
    expect(pagePaths(mintlifyAdapter.serialize(doc, reversed))).toEqual(
      pagePaths(docsReduced),
    );
  });

  it("reproduces the recorded indent unit", () => {
    const fourSpace = JSON.stringify(JSON.parse(starter), null, 4) + "\n";
    expect(roundTrip(fourSpace)).toBe(fourSpace);
  });

  it("reproduces a minified file without pretty-printing it", () => {
    const minified = JSON.stringify(JSON.parse(starter));
    expect(roundTrip(minified)).toBe(minified);
  });

  it("reads a file a Windows editor saved with a byte-order mark", () => {
    // Neither corpus has one, but JSON.parse rejects a BOM outright, so
    // without this a perfectly valid docs.json fails with a parse error
    // that names a character the author cannot see.
    const withBom = "﻿" + starter;
    expect(roundTrip(withBom)).toBe(withBom);
  });

  it("keeps CRLF line endings rather than rewriting every line", () => {
    // The trailing-newline rule exists because a spurious newline is a
    // diff in a config file. Silently converting a CRLF file to LF is the
    // same harm across every line at once.
    const crlf = starter.replace(/\n/g, "\r\n");
    expect(roundTrip(crlf)).toBe(crlf);
  });

  it("serializes a document created in the app, which has no stored config", () => {
    const doc = mintlifyAdapter.parse(starter, "docs.json");
    delete doc.extras;
    const out = JSON.parse(mintlifyAdapter.serialize(doc, idOrder(doc))) as {
      navigation: { pages: unknown[] };
    };
    expect(out.navigation.pages.length).toBeGreaterThan(0);
  });
});

// ── Containers ──────────────────────────────────────────────

describe("mintlify: containers", () => {
  it("makes a card of every group wherever it sits, and records its ancestor chain", () => {
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    expect(findSection(doc, "Get started").chain).toEqual(["en", "Documentation"]);
    expect(findSection(doc, "Admin").chain).toEqual(["en", "API reference"]);
  });

  it("gives top-level cards no chain at all", () => {
    // navigation.languages holds the $ref cards directly, so they sit at
    // the root: absent, not [""], or the chip would render an empty pill.
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    expect(findSection(doc, "./fr.json").chain).toBeUndefined();
  });

  it("maps a group nested inside a group's pages to a topic with children", () => {
    // The canvas is two levels; groups nest six deep in the corpus.
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    const cli = findTopic(findSection(doc, "Get started"), "CLI");
    expect(cli.children.map((c) => c.path)).toEqual([
      "cli/install",
      "cli/preview",
      "cli/commands",
    ]);
  });

  it("reorders cards within their own container and leaves other containers alone", () => {
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    const order = idOrder(doc);
    const a = order.indexOf(findSection(doc, "API reference").id);
    const b = order.indexOf(findSection(doc, "Admin").id);
    const [first, second] = [order[a]!, order[b]!];
    order[a] = second;
    order[b] = first;

    const nav = navOf(mintlifyAdapter.serialize(doc, order));
    expect(groupNames(nav, "en", "API reference")).toEqual([
      "Admin",
      "API reference",
      "Agent",
    ]);
    expect(groupNames(nav, "en", "Documentation")).toEqual([
      "Get started",
      "Create content",
      "Manage your site",
    ]);
  });

  it("keeps a card in its own container even when the flat order interleaves chains", () => {
    // A cross-chain drag is refused at drag time, but AI reorganize and
    // auto-arrange can still hand the serializer an interleaved list. The
    // partition is what makes that a no-op rather than a corruption.
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    const order = idOrder(doc);
    const moved = order.splice(order.indexOf(findSection(doc, "Admin").id), 1);
    order.splice(order.indexOf(findSection(doc, "Get started").id), 0, ...moved);

    const nav = navOf(mintlifyAdapter.serialize(doc, order));
    expect(groupNames(nav, "en", "Documentation")).not.toContain("Admin");
    expect(groupNames(nav, "en", "API reference")).toContain("Admin");
  });

  it("makes global anchors visible cards rather than silent extras", () => {
    const doc = mintlifyAdapter.parse(starter, "docs.json");
    const blog = findSection(doc, "Blog");
    expect(blog.chain).toEqual(["global"]);
    expect(blog.isOrphan).toBe(true);
    expect(blog.topics[0]?.lock?.kind).toBe("external");
  });

  it("appends a card whose chain has no container to the root slot rather than dropping it", () => {
    // Multiset conservation outranks placement: a card must never vanish
    // because its chain went missing.
    const doc = mintlifyAdapter.parse(starter, "docs.json");
    doc.sections.push({
      id: "stray",
      title: "Stray",
      chain: ["nonexistent-tab"],
      topics: [{ id: "stray-t", title: "Stray page", path: "stray", children: [] }],
    });
    const nav = navOf(mintlifyAdapter.serialize(doc, idOrder(doc)));
    expect(JSON.stringify(nav)).toContain("stray");
  });

  it("declares a container per navigation level, with what it bears", () => {
    // Declared at parse, never derived from the cards inside: a tab that
    // legally bears sections and holds none must still say so.
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    const documentation = containerFor(doc, chainPathKey(["en", "Documentation"]))!;
    expect(documentation.label).toBe("Documentation");
    expect(documentation.accepts).toEqual({ sections: true, orphans: false });
    // `tabs.groups` has minItems: 1 — emptying a tab writes a file
    // Mintlify rejects.
    expect(documentation.mayEmpty).toBe(false);
  });

  it("declares the languages root as bearing neither", () => {
    // It holds language objects and $ref pointers, not cards anyone can
    // drop — so nothing may be dragged into it, though the $ref orphans
    // already there stay.
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    expect(containerFor(doc, "")?.accepts).toEqual({
      sections: false,
      orphans: false,
    });
  });

  it("declares the global anchor lane as bearing orphans only", () => {
    const doc = mintlifyAdapter.parse(starter, "docs.json");
    expect(containerFor(doc, chainPathKey(["global"]))?.accepts).toEqual({
      sections: false,
      orphans: true,
    });
  });

  it("declares a root pages list as bearing both", () => {
    const doc = mintlifyAdapter.parse(starter, "docs.json");
    expect(containerFor(doc, "")?.accepts).toEqual({ sections: true, orphans: true });
  });

  it("declares containers in source order, never in card order", () => {
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    const labels = containersInOrder(doc).map((c) => c.label);
    expect(labels.indexOf("Documentation")).toBeLessThan(labels.indexOf("API reference"));
  });

  it("declares a container that bears sections but holds none", () => {
    // The case that killed derivation. It must render a lane and accept
    // the first card dropped into it.
    const empty =
      '{\n  "$schema": "https://mintlify.com/docs.json",\n  "name": "Empty tab",\n' +
      '  "navigation": {\n    "tabs": [\n      {\n        "tab": "Guides",\n' +
      '        "groups": [\n          {\n            "group": "G",\n' +
      '            "pages": [\n              "g/a"\n            ]\n' +
      '          }\n        ]\n      },\n      {\n        "tab": "Reference",\n' +
      '        "groups": []\n      }\n    ]\n  }\n}\n';
    const doc = mintlifyAdapter.parse(empty, "docs.json");
    const reference = containerFor(doc, chainPathKey(["Reference"]))!;
    expect(reference.accepts.sections).toBe(true);
    expect(doc.sections.filter((s) => chainKey(s) === reference.chainKey)).toEqual([]);
    expect(roundTrip(empty)).toBe(empty);
  });

  it("passes the container lint on both real corpora", () => {
    for (const raw of [starter, docsReduced, syntheticShapes]) {
      expect(lintContainers(mintlifyAdapter.parse(raw, "docs.json"))).toEqual([]);
    }
  });

  it("refuses a navigation whose containers share an ancestor path", () => {
    // Two identically-named siblings make chain keys ambiguous, and the
    // serializer would silently pour both containers' cards into one.
    const clashing = JSON.stringify(
      {
        $schema: "https://mintlify.com/docs.json",
        name: "Clash",
        navigation: {
          tabs: [
            { tab: "Guides", groups: [{ group: "A", pages: ["a"] }] },
            { tab: "Guides", groups: [{ group: "B", pages: ["b"] }] },
          ],
        },
      },
      null,
      2,
    );
    expect(() => mintlifyAdapter.parse(clashing, "docs.json")).toThrow(/Guides/);
  });
});

// ── Titles ──────────────────────────────────────────────────

describe("mintlify: titles", () => {
  it("derives page titles from their paths and writes the bare path back", () => {
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    const quickstart = findTopic(findSection(doc, "Get started"), "Quickstart");
    expect(quickstart.titleDerived).toBe(true);
    expect(quickstart.path).toBe("quickstart");
  });

  it("reads a group's title from the file rather than deriving it", () => {
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    expect(findSection(doc, "Get started").titleDerived).toBeFalsy();
  });

  it("writes a renamed card back to the group string", () => {
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    renameSection(findSection(doc, "Get started"), "Start here");
    expect(
      groupNames(
        navOf(mintlifyAdapter.serialize(doc, idOrder(doc))),
        "en",
        "Documentation",
      ),
    ).toContain("Start here");
  });

  it("declares that it renames sections but cannot rename topics", () => {
    // The schema has no slot for a page title, so a topic rename is
    // inexpressible rather than merely unimplemented.
    expect(mintlifyAdapter.supportsRename).toEqual({ sections: true, topics: false });
  });
});

// ── The group's own landing page ────────────────────────────

describe("mintlify: group root", () => {
  it("maps a group's root to the card's path", () => {
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    const settings = findTopic(findSection(doc, "Manage your site"), "Global settings");
    expect(settings.path).toBe("organize/settings");
  });

  it("returns root to its own key, never into pages", () => {
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    const out = mintlifyAdapter.serialize(doc, idOrder(doc));
    const group = findGroup(navOf(out), "Global settings");
    expect(group.root).toBe("organize/settings");
    expect(group.pages).not.toContain("organize/settings");
  });
});

// ── Locked and sealed nodes ─────────────────────────────────

describe("mintlify: locked and sealed nodes", () => {
  it("shows a $ref as a locked, sealed card naming the file its nav lives in", () => {
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    const fr = findSection(doc, "./fr.json");
    expect(fr.isOrphan).toBe(true);
    expect(fr.topics[0]?.lock?.kind).toBe("pattern");
    expect(fr.sealed).toEqual({ source: "./fr.json" });
  });

  it("locks an external href inside a group as external, not as a pattern", () => {
    const doc = mintlifyAdapter.parse(syntheticShapes, "docs.json");
    const mixed = findSection(doc, "Mixed entry shapes");
    const href = mixed.topics.find((t) => t.lock?.kind === "external")!;
    expect(href.extras).toEqual({
      href: "https://status.example.org",
      icon: "signal",
    });
  });

  it("locks openapi, asyncapi and unrecognised objects as patterns", () => {
    const doc = mintlifyAdapter.parse(syntheticShapes, "docs.json");
    const kinds = findSection(doc, "Mixed entry shapes").topics.map((t) => t.lock?.kind);
    expect(kinds).toEqual([
      undefined, // "index" — an ordinary page
      "pattern", // openapi, string form
      "pattern", // openapi, object form
      "pattern", // asyncapi
      "external", // href
      "pattern", // a page object: not in the schema, so unrecognised
      "pattern", // unrecognised future key
    ]);
  });

  it("round-trips every locked entry verbatim", () => {
    expect(roundTrip(syntheticShapes)).toBe(syntheticShapes);
  });

  it("seals a group that sources its pages from a spec instead of listing them", () => {
    // Zero rows AND not editable — the case Section.sealed exists for,
    // and the opposite of a genuinely empty card.
    const sourced = JSON.stringify(
      {
        $schema: "https://mintlify.com/docs.json",
        name: "Sourced",
        navigation: {
          groups: [{ group: "API reference", openapi: "/openapi.json" }],
        },
      },
      null,
      2,
    );
    const doc = mintlifyAdapter.parse(sourced, "docs.json");
    const section = findSection(doc, "API reference");
    expect(section.topics).toEqual([]);
    expect(section.sealed?.source).toContain("/openapi.json");
    expect(roundTrip(sourced)).toBe(sourced);
  });

  it("writes a nested spec-sourced group back without inventing a page list", () => {
    // The seal mechanism existed only at card level, so a group nested
    // inside `pages` gained a `pages: []` the source never had.
    const nested =
      '{\n  "$schema": "https://mintlify.com/docs.json",\n  "name": "Nested",\n' +
      '  "navigation": {\n    "groups": [\n      {\n        "group": "API",\n' +
      '        "pages": [\n          "overview",\n          {\n' +
      '            "group": "Products",\n            "openapi": "v2.json"\n' +
      "          }\n        ]\n      }\n    ]\n  }\n}\n";
    expect(roundTrip(nested)).toBe(nested);
  });

  it("keeps a nested group that lists no pages from collapsing into its own root path", () => {
    // The page path survived but the group node and its author-written
    // title did not, which is a structural loss the round trip forbids.
    const empty =
      '{\n  "$schema": "https://mintlify.com/docs.json",\n  "name": "Empty",\n' +
      '  "navigation": {\n    "groups": [\n      {\n        "group": "Guides",\n' +
      '        "pages": [\n          {\n            "group": "CLI",\n' +
      '            "root": "cli/index",\n            "pages": []\n' +
      "          }\n        ]\n      }\n    ]\n  }\n}\n";
    expect(roundTrip(empty)).toBe(empty);
  });

  it("keeps a group's own key order, whatever order the author wrote it in", () => {
    const unusual =
      '{\n  "$schema": "https://mintlify.com/docs.json",\n  "name": "Order",\n' +
      '  "navigation": {\n    "groups": [\n      {\n        "icon": "gauge",\n' +
      '        "group": "Operate",\n        "pages": [\n          "op/a"\n' +
      '        ],\n        "root": "op/index"\n      }\n    ]\n  }\n}\n';
    expect(roundTrip(unusual)).toBe(unusual);
  });

  it("leaves a group with an empty page list unsealed — empty means empty", () => {
    const empty = JSON.stringify(
      {
        $schema: "https://mintlify.com/docs.json",
        name: "Empty",
        navigation: { groups: [{ group: "Coming soon", pages: [] }] },
      },
      null,
      2,
    );
    const doc = mintlifyAdapter.parse(empty, "docs.json");
    expect(findSection(doc, "Coming soon").sealed).toBeUndefined();
  });
});

// ── Group metadata ──────────────────────────────────────────

describe("mintlify: group metadata", () => {
  it("carries group metadata through as extras and writes it back in place", () => {
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    expect(findSection(doc, "Get started").extras).toMatchObject({ boost: 2 });
    const group = findGroup(
      navOf(mintlifyAdapter.serialize(doc, idOrder(doc))),
      "Get started",
    );
    expect(Object.keys(group)).toEqual(["group", "boost", "pages"]);
  });

  it("keeps its bookkeeping out of the exported file", () => {
    // The recorded key order lives in extras, which is otherwise written
    // back verbatim — a leak would put a NUL key in the user's config.
    const out = roundTrip(docsReduced);
    expect(out).toBe(docsReduced); // the export is real, not an empty shell
    expect(out).not.toContain("\\u0000");
  });
});

// ── The refuse list ─────────────────────────────────────────

describe("mintlify: inputs it refuses", () => {
  it("refuses duplicate keys, which JSON.parse would resolve silently", () => {
    const dup =
      '{\n  "$schema": "https://mintlify.com/docs.json",\n  "name": "Dup",\n' +
      '  "navigation": { "pages": ["a"] },\n  "navigation": { "pages": ["b"] }\n}\n';
    expect(() => mintlifyAdapter.parse(dup, "docs.json")).toThrow(/navigation/);
  });

  it("refuses integer-like keys, which JavaScript would reorder", () => {
    const intKey =
      '{\n  "$schema": "https://mintlify.com/docs.json",\n  "name": "Int",\n' +
      '  "navigation": { "pages": ["a"] },\n  "2": "hoisted",\n  "seo": {}\n}\n';
    expect(() => mintlifyAdapter.parse(intKey, "docs.json")).toThrow(/"2"/);
  });

  it("accepts the errors block, whose 404 key the schema requires", () => {
    // Refusing every array-index-like key refused a large class of valid
    // files and told the author to rename a key the schema names for
    // them. The harm is reordering, so only reordering earns a refusal.
    const errors =
      '{\n  "$schema": "https://mintlify.com/docs.json",\n  "name": "Errors",\n' +
      '  "errors": {\n    "404": {\n      "redirect": false\n    }\n  },\n' +
      '  "navigation": {\n    "groups": [\n      {\n        "group": "G",\n' +
      '        "pages": [\n          "a"\n        ]\n      }\n    ]\n  }\n}\n';
    expect(roundTrip(errors)).toBe(errors);
  });

  it("refuses a numeric key that is not already in the position JavaScript gives it", () => {
    const moved =
      '{\n  "$schema": "https://mintlify.com/docs.json",\n  "name": "Moved",\n' +
      '  "errors": { "title": "Nope", "404": { "redirect": false } },\n' +
      '  "navigation": { "pages": ["a"] }\n}\n';
    expect(() => mintlifyAdapter.parse(moved, "docs.json")).toThrow(/"404"/);
  });

  it("refuses escape-equivalent duplicate keys, which read as distinct in the source", () => {
    // Reachable without the registry's js-yaml gate: the load dialog lets
    // a user name the format outright, and then this is the only guard.
    const escaped =
      '{\n  "name": "X",\n  "navigation": { "pages": ["a"] },\n' +
      '  "\\u006eavigation": { "pages": ["b"] }\n}\n';
    expect(() => mintlifyAdapter.parse(escaped, "docs.json")).toThrow(/navigation/);
  });

  it("refuses a container holding two kinds of child at once", () => {
    // Schema-invalid: Mintlify restricts each level to one child type.
    // Cards are matched to a container by chain path, so both arrays
    // would draw from one queue and the second would export empty.
    const twoKinds =
      '{\n  "$schema": "https://mintlify.com/docs.json",\n  "name": "Two",\n' +
      '  "navigation": {\n    "groups": [{ "group": "G", "pages": ["g/a"] }],\n' +
      '    "pages": ["standalone"]\n  }\n}\n';
    expect(() => mintlifyAdapter.parse(twoKinds, "docs.json")).toThrow(/one kind/i);
  });

  it("refuses a group whose pages is not a list, rather than emptying it", () => {
    const badPages =
      '{\n  "$schema": "https://mintlify.com/docs.json",\n  "name": "Bad",\n' +
      '  "navigation": { "groups": [{ "group": "G", "pages": "g/a" }] }\n}\n';
    expect(() => mintlifyAdapter.parse(badPages, "docs.json")).toThrow(/"G"/);
  });

  it("refuses a file that is not a JSON object", () => {
    expect(() => mintlifyAdapter.parse("[1, 2]", "docs.json")).toThrow();
  });
});

// ── Detection and the legacy recognizer ─────────────────────

describe("mintlify: detection", () => {
  it("wins for its own file and loses for the other adapters' samples", () => {
    expect(parseDocument(starter, "docs.json").formatId).toBe("mintlify");
    expect(parseDocument(docfxSample, "toc.yml").formatId).toBe("docfx");
    expect(parseDocument(mkdocsSample, "mkdocs.yml").formatId).toBe("mkdocs");
  });

  it("still claims a file that opens with a byte-order mark", () => {
    // Detection reads the raw text, so the invisible character must not
    // cost the adapter its own file.
    expect(parseDocument("﻿" + starter, "docs.json").formatId).toBe("mintlify");
  });

  it("does not claim YAML that merely has a navigation key", () => {
    expect(
      mintlifyAdapter.detect(
        { navigation: { pages: [] } },
        "navigation:\n  pages: []\n",
        "x.yml",
      ),
    ).toBe(0);
  });

  it("does not claim a legacy mint.json, whose navigation is a list", () => {
    const mint =
      '{\n  "name": "Legacy",\n  "navigation": [{ "group": "Docs", "pages": ["a"] }]\n}\n';
    expect(mintlifyAdapter.detect(JSON.parse(mint), mint, "mint.json")).toBe(0);
  });
});

describe("mintlify: the legacy mint.json recognizer", () => {
  const mint =
    '{\n  "name": "Legacy",\n  "navigation": [{ "group": "Docs", "pages": ["a"] }]\n}\n';

  it("names mint.json by file name and points at the upgrade command", () => {
    try {
      parseDocument(mint, "mint.json");
      throw new Error("expected parseDocument to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(KnownUnsupportedFormatError);
      const known = err as KnownUnsupportedFormatError;
      expect(known.recognizerId).toBe("mintlify-legacy-mint-json");
      // The command mintlify/docs documents today (organize/settings.mdx,
      // "Upgrade from mint.json"): the CLI was renamed from `mintlify` to
      // `mint`, and `mint dev` is what writes the docs.json.
      expect(known.message).toContain("mint dev");
      expect(known.message).toContain("docs.json");
      expect(known.helpUrl).toContain("mint-json");
    }
  });

  it("names an unnamed legacy config by its shape: a navigation LIST", () => {
    expect(() => parseDocument(mint, "config.json")).toThrow(KnownUnsupportedFormatError);
  });

  it("names a real mint.json even though it carries its own $schema", () => {
    // The legacy schema url is mintlify.com/schema.json, so "has no
    // $schema" was the wrong shape test — it declined the very files the
    // sniff exists for whenever they were renamed or pasted.
    const schemad =
      '{\n  "$schema": "https://mintlify.com/schema.json",\n  "name": "Acme",\n' +
      '  "navigation": [{ "group": "Get Started", "pages": ["introduction"] }]\n}\n';
    expect(() => parseDocument(schemad, "mint 2.json")).toThrow(
      KnownUnsupportedFormatError,
    );
  });

  it("sniffs conservatively — a nameless JSON object with no navigation falls through", () => {
    const other = '{\n  "name": "Something else",\n  "sidebar": ["a"]\n}\n';
    expect(() => parseDocument(other, "config.json")).not.toThrow(
      KnownUnsupportedFormatError,
    );
    expect(() => parseDocument(other, "config.json")).toThrow();
  });

  it("leaves alone unrelated JSON that merely has a navigation key", () => {
    // Telling someone their file is legacy Mintlify when it is not sends
    // them to run a migration tool on something else.
    for (const raw of [
      '{"title":"My site","navigation":{"main":[{"label":"Home","url":"/"}]}}',
      '{"navigation":"tree","editor":{"tabSize":2}}',
      '{"navigation":true}',
    ]) {
      expect(() => parseDocument(raw, "config.json")).not.toThrow(
        KnownUnsupportedFormatError,
      );
    }
  });

  it("never claims a current docs.json, which carries a $schema", () => {
    expect(parseDocument(starter, "docs.json").formatId).toBe("mintlify");
  });
});

// ── Fixture properties the round trip depends on ────────────

describe("mintlify: fixture assumptions", () => {
  it("asserts the corpora use no escapes JSON.stringify would not reproduce", () => {
    // \uXXXX and \/ round-trip semantically but not byte-wise. docs/13
    // says assert it rather than assume it.
    for (const [name, raw] of Object.entries({ starter, docsReduced, syntheticShapes })) {
      expect([name, /\\u|\\\//.test(raw)]).toEqual([name, false]);
    }
  });

  it("keeps every card's chain key distinct from its neighbours' where containers differ", () => {
    const doc = mintlifyAdapter.parse(docsReduced, "docs.json");
    expect(chainKey(findSection(doc, "Get started"))).not.toBe(
      chainKey(findSection(doc, "Admin")),
    );
  });
});

// ── Helpers that read the serialized navigation ─────────────

type NavNode = Record<string, unknown>;

function navOf(json: string): NavNode {
  return (JSON.parse(json) as { navigation: NavNode }).navigation;
}

/** The group names inside `navigation.languages[language].tabs[tab].groups`. */
function groupNames(nav: NavNode, language: string, tab: string): string[] {
  const languages = nav.languages as NavNode[];
  const lang = languages.find((l) => l.language === language)!;
  const tabs = lang.tabs as NavNode[];
  const found = tabs.find((t) => t.tab === tab)!;
  return (found.groups as NavNode[]).map((g) => g.group as string);
}

/** The first group object anywhere in the navigation with this name. */
function findGroup(nav: unknown, name: string): NavNode {
  let found: NavNode | undefined;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== "object" || node === null) return;
    const obj = node as NavNode;
    if (obj.group === name) found ??= obj;
    Object.values(obj).forEach(walk);
  };
  walk(nav);
  return found!;
}
