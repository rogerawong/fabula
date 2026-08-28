/**
 * Registry + facade: collection formatIds resolve through the FORMAT
 * registry (code view / legacy export must not throw at render time),
 * serializeSection yields a YAML outline, serialize yields the change
 * plan as a .patch (empty string when the canvas matches the files).
 */

import { describe, expect, it } from "vitest";
import { deriveSectionOrder, initialColumns } from "@/layout/columns";
import { getAdapter } from "@/formats/registry";
import { detectCollection, isCollectionDocument } from "../registry";
import { jtdAdapter } from "../adapters/jtd";

const FILES = {
  "a.md": "---\ntitle: Alpha\nnav_order: 1\n---\nbody\n",
  "b.md": "---\ntitle: Beta\nparent: Alpha\n---\nbody\n",
  "c.md": "---\ntitle: Gamma\nparent: Alpha\nnav_order: 2\n---\nbody\n",
};

describe("collection registry + facades", () => {
  it("detects the owning adapter for a snapshot", () => {
    expect(detectCollection(FILES)?.id).toBe("jtd");
    expect(detectCollection({ "notes.txt": "hello" })).toBeNull();
  });

  it("getAdapter resolves collection formatIds to a facade", () => {
    const { doc } = jtdAdapter.parse(FILES, "Site");
    expect(isCollectionDocument(doc)).toBe(true);
    const facade = getAdapter(doc.formatId);
    expect(facade.fileExtensions).toEqual(["patch"]);

    // code view: a YAML outline of the card
    const section = doc.sections[0]!;
    const text = facade.serializeSection(section);
    expect(text).toContain("# Alpha");
    expect(text).toContain("title: Beta");

    // legacy export: no edits → empty patch; an edit → git-style patch
    const order = deriveSectionOrder(initialColumns(doc));
    expect(facade.serialize(doc, order)).toBe("");
    // nav_order'd pages sort first: topics[0] is Gamma (c.md)
    const edited = structuredClone(doc);
    expect(edited.sections[0]!.topics[0]!.title).toBe("Gamma");
    edited.sections[0]!.topics[0]!.title = "Gamma Prime";
    const patch = facade.serialize(edited, order);
    expect(patch).toContain("diff --git a/c.md b/c.md");
    expect(patch).toContain("+title: Gamma Prime");
  });

  it("facades never claim single-file documents", () => {
    const facade = getAdapter("jtd");
    expect(facade.detect(null, "", "toc.yml")).toBe(0);
    expect(() => facade.parse("x", "toc.yml")).toThrow(/folder/);
  });
});
