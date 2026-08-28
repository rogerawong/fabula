/**
 * MkDocs adapter-specific behavior tests (beyond the shared conformance
 * suite): surrounding-config preservation (the extras stress test,
 * docs/04), bare-path derived titles, orphan mapping, export order.
 */

import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { mkdocsAdapter } from "@/formats/adapters/mkdocs";
import { parseDocument } from "@/formats/registry";
import { renameTopic } from "@/model/tree";
import type { TocDocument } from "@/model/types";

import mkdocsConfig from "./fixtures/mkdocs-config.yml?raw";
import docfxSample from "../samples/docfx-sample.yml?raw";

const idOrder = (doc: TocDocument) => doc.sections.map((s) => s.id);

describe("mkdocs: surrounding config", () => {
  it("round-trips sibling keys verbatim and keeps nav's position", () => {
    const doc = mkdocsAdapter.parse(mkdocsConfig, "mkdocs.yml");
    const out = mkdocsAdapter.serialize(doc, idOrder(doc));
    const raw = yaml.load(out) as Record<string, unknown>;

    expect(raw.site_name).toBe("Widget Docs");
    expect(raw.theme).toEqual({ name: "readthedocs" });
    expect(raw.extra_css).toEqual(["css/custom.css"]);
    expect(raw.plugins).toEqual(["search"]);

    // nav stays between theme and extra_css, as in the source
    const keys = Object.keys(raw);
    expect(keys.indexOf("nav")).toBeGreaterThan(keys.indexOf("theme"));
    expect(keys.indexOf("nav")).toBeLessThan(keys.indexOf("extra_css"));
  });

  it("serializes app-created documents without stored config as bare nav", () => {
    const doc = mkdocsAdapter.parse(mkdocsConfig, "mkdocs.yml");
    delete doc.extras;
    const raw = yaml.load(mkdocsAdapter.serialize(doc, idOrder(doc))) as Record<
      string,
      unknown
    >;
    expect(Object.keys(raw)).toEqual(["nav"]);
  });
});

describe("mkdocs: titles and paths", () => {
  it("derives titles for bare paths and keeps them bare on export", () => {
    const doc = mkdocsAdapter.parse(mkdocsConfig, "mkdocs.yml");
    const guide = doc.sections.find((s) => s.title === "Guide")!;
    expect(guide.topics[0]!.title).toBe("Index");
    expect(guide.topics[0]!.titleDerived).toBe(true);

    const out = yaml.load(mkdocsAdapter.serialize(doc, idOrder(doc))) as {
      nav: unknown[];
    };
    const guideNode = out.nav.find(
      (n) => typeof n === "object" && n !== null && "Guide" in n,
    ) as { Guide: unknown[] };
    expect(guideNode.Guide[0]).toBe("guide/index.md"); // still a bare string
  });

  it("an explicit rename switches a bare path to the map form", () => {
    const doc = mkdocsAdapter.parse(mkdocsConfig, "mkdocs.yml");
    const guide = doc.sections.find((s) => s.title === "Guide")!;
    renameTopic(guide, guide.topics[0]!.id, "Overview");

    const out = yaml.load(mkdocsAdapter.serialize(doc, idOrder(doc))) as {
      nav: unknown[];
    };
    const guideNode = out.nav.find(
      (n) => typeof n === "object" && n !== null && "Guide" in n,
    ) as { Guide: unknown[] };
    expect(guideNode.Guide[0]).toEqual({ Overview: "guide/index.md" });
  });
});

describe("mkdocs: orphans and order", () => {
  it("maps top-level leaves to orphan sections and unwraps on export", () => {
    const doc = mkdocsAdapter.parse(mkdocsConfig, "mkdocs.yml");
    expect(doc.sections.map((s) => Boolean(s.isOrphan))).toEqual([
      true, // Home
      true, // about.md
      false, // Guide
      true, // FAQ
    ]);

    const out = yaml.load(mkdocsAdapter.serialize(doc, idOrder(doc))) as {
      nav: unknown[];
    };
    expect(out.nav[0]).toEqual({ Home: "index.md" });
    expect(out.nav[1]).toBe("about.md");
    expect(out.nav[3]).toEqual({ FAQ: "faq.md" });
  });

  it("serializes sections in the given id order", () => {
    const doc = mkdocsAdapter.parse(mkdocsConfig, "mkdocs.yml");
    const reversed = [...idOrder(doc)].reverse();
    const out = yaml.load(mkdocsAdapter.serialize(doc, reversed)) as { nav: unknown[] };
    expect(out.nav[0]).toEqual({ FAQ: "faq.md" });
    expect(out.nav.at(-1)).toEqual({ Home: "index.md" });
  });
});

describe("mkdocs: detection", () => {
  it("wins the registry for mkdocs configs; loses for DocFX TOCs", () => {
    expect(parseDocument(mkdocsConfig, "mkdocs.yml").formatId).toBe("mkdocs");
    expect(parseDocument(docfxSample, "toc.yml").formatId).toBe("docfx");
  });

  it("rejects configs without nav and non-nav shapes", () => {
    expect(mkdocsAdapter.detect(yaml.load("site_name: X\n"), "", "mkdocs.yml")).toBe(0);
    expect(mkdocsAdapter.detect(yaml.load("- a\n- b\n"), "", "x.yml")).toBe(0);
    expect(
      mkdocsAdapter.detect(yaml.load("nav:\n- {a: 1, b: 2}\n"), "", "mkdocs.yml"),
    ).toBe(0);
  });
});
