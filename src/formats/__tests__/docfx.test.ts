/**
 * DocFX adapter-specific behavior tests (beyond the shared conformance
 * suite): title derivation, extras preservation, orphan mapping,
 * root-style preservation, and export-order handling.
 */

import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { docfxAdapter } from "@/formats/adapters/docfx";
import { renameTopic } from "@/model/tree";
import type { Section, TocDocument } from "@/model/types";

import docfxClassicList from "./fixtures/docfx-classic-list.yml?raw";

const ITEMS_ROOT = `items:
- name: Guide
  href: guide/
  items:
  - href: guide/getting-started.md
  - name: Deep Dive
    href: guide/deep-dive.md
    expanded: true
- name: FAQ
  href: faq.md
`;

function sectionAt(doc: TocDocument, i: number): Section {
  const s = doc.sections[i];
  if (!s) throw new Error(`no section at ${i}`);
  return s;
}

const idOrder = (doc: TocDocument) => doc.sections.map((s) => s.id);

describe("docfx: title derivation", () => {
  it("derives a title from href when name is missing", () => {
    const doc = docfxAdapter.parse(ITEMS_ROOT, "toc.yml");
    const guide = sectionAt(doc, 0);
    expect(guide.topics[0]?.title).toBe("Getting Started");
    expect(guide.topics[0]?.titleDerived).toBe(true);
    expect(guide.topics[1]?.title).toBe("Deep Dive");
    expect(guide.topics[1]?.titleDerived).toBeUndefined();
  });

  it("uses uid as title when neither name nor href exists", () => {
    const doc = docfxAdapter.parse(docfxClassicList, "toc.yml");
    const ref = doc.sections.find((s) => s.title === "Reference.Root");
    expect(ref).toBeDefined();
    expect(ref!.titleDerived).toBe(true);
    expect(ref!.topics.map((t) => t.title)).toEqual([
      "Reference.ClassA",
      "Reference.ClassB",
    ]);
  });

  it("does not write derived names on export", () => {
    const doc = docfxAdapter.parse(ITEMS_ROOT, "toc.yml");
    const out = docfxAdapter.serialize(doc, idOrder(doc));
    const raw = yaml.load(out) as { items: { items: unknown[] }[] };
    // The name-less child must stay name-less
    expect(raw.items[0]?.items[0]).toEqual({ href: "guide/getting-started.md" });
  });

  it("writes the name after an explicit rename clears titleDerived", () => {
    const doc = docfxAdapter.parse(ITEMS_ROOT, "toc.yml");
    const guide = sectionAt(doc, 0);
    renameTopic(guide, guide.topics[0]!.id, "Start Here");
    const out = docfxAdapter.serialize(doc, idOrder(doc));
    const raw = yaml.load(out) as { items: { items: unknown[] }[] };
    expect(raw.items[0]?.items[0]).toEqual({
      name: "Start Here",
      href: "guide/getting-started.md",
    });
  });
});

describe("docfx: extras preservation", () => {
  it("round-trips unknown node properties (uid, expanded, order, displayName)", () => {
    const doc = docfxAdapter.parse(docfxClassicList, "toc.yml");
    const out = docfxAdapter.serialize(doc, idOrder(doc));
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const raw = yaml.load(out) as any[];

    const setup = raw.find((n) => n.name === "Setup");
    expect(setup.expanded).toBe(true);
    expect(setup.items[2].displayName).toBe("setup errors install problems");

    const ref = raw.find((n) => n.uid === "Reference.Root");
    expect(ref.items[1]).toEqual({ uid: "Reference.ClassB", order: 50 });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });
});

describe("docfx: root style and orphans", () => {
  it("preserves a bare-list root on export", () => {
    const doc = docfxAdapter.parse(docfxClassicList, "toc.yml");
    const out = docfxAdapter.serialize(doc, idOrder(doc));
    expect(Array.isArray(yaml.load(out))).toBe(true);
  });

  it("preserves an items-key root on export", () => {
    const doc = docfxAdapter.parse(ITEMS_ROOT, "toc.yml");
    const out = docfxAdapter.serialize(doc, idOrder(doc));
    const raw = yaml.load(out) as { items: unknown };
    expect(Array.isArray(raw.items)).toBe(true);
  });

  it("maps top-level leaves to orphan sections and back to leaves", () => {
    const doc = docfxAdapter.parse(ITEMS_ROOT, "toc.yml");
    const faq = sectionAt(doc, 1);
    expect(faq.isOrphan).toBe(true);
    expect(faq.topics).toHaveLength(1);

    const out = docfxAdapter.serialize(doc, idOrder(doc));
    const raw = yaml.load(out) as { items: unknown[] };
    expect(raw.items[1]).toEqual({ name: "FAQ", href: "faq.md" });
  });
});

describe("docfx: export order", () => {
  it("serializes sections in the given id order, skipping unknown ids", () => {
    const doc = docfxAdapter.parse(ITEMS_ROOT, "toc.yml");
    const [a, b] = idOrder(doc);
    const out = docfxAdapter.serialize(doc, [b!, "unknown-id", a!]);
    const raw = yaml.load(out) as { items: { name: string }[] };
    expect(raw.items.map((n) => n.name)).toEqual(["FAQ", "Guide"]);
  });
});

describe("docfx: detection", () => {
  it("rejects YAML that is not a TOC", () => {
    expect(docfxAdapter.detect(yaml.load("foo: bar\nbaz: 1\n"), "", "x.yml")).toBe(0);
    expect(docfxAdapter.detect(yaml.load("- 1\n- 2\n"), "", "x.yml")).toBe(0);
    expect(docfxAdapter.detect(null, "", "x.yml")).toBe(0);
  });
});
