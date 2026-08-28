import { describe, expect, it } from "vitest";
import {
  allTopicIds,
  cloneDocument,
  createSection,
  createSectionByUnwrapping,
  findTopic,
  insertTopic,
  isDescendantOf,
  locateTopic,
  locateTopicInDocument,
  removeTopic,
  renameSection,
  renameTopic,
  subtreeContains,
} from "../tree";
import type { Topic } from "../types";
import { sampleDoc, topic } from "./fixtures";

function mustFind<T>(value: T | null | undefined, what: string): T {
  if (value == null) throw new Error(`fixture missing: ${what}`);
  return value;
}

const byTitle = (s: { topics: Topic[] }, title: string): Topic =>
  mustFind(
    s.topics.find((t) => t.title === title),
    title,
  );

describe("locateTopic / findTopic", () => {
  it("finds nested topics and reports parent, siblings, index", () => {
    const d = sampleDoc();
    const guide = mustFind(d.sections[0], "guide");
    const config = mustFind(
      findTopic(guide, byTitle(guide, "Setup").children[1]!.id),
      "config",
    );
    expect(config.title).toBe("Config");

    const loc = mustFind(locateTopic(guide, config.id), "loc");
    expect(loc.parent?.title).toBe("Setup");
    expect(loc.index).toBe(1);
    expect(loc.siblings).toHaveLength(2);
  });

  it("locates across the document and returns null for unknown ids", () => {
    const d = sampleDoc();
    const ref = mustFind(d.sections[1], "reference");
    const core = mustFind(ref.topics[0]?.children[0], "core");
    const loc = mustFind(locateTopicInDocument(d, core.id), "loc");
    expect(loc.section.title).toBe("Reference");
    expect(locateTopicInDocument(d, "nope")).toBeNull();
  });
});

describe("removeTopic / insertTopic", () => {
  it("moves a subtree between sections, preserving ids", () => {
    const d = sampleDoc();
    const guide = mustFind(d.sections[0], "guide");
    const ref = mustFind(d.sections[1], "reference");
    const setup = byTitle(guide, "Setup");
    const idsBefore = [setup.id, ...setup.children.map((c) => c.id)];

    const removed = mustFind(removeTopic(guide, setup.id), "removed");
    expect(guide.topics.map((t) => t.title)).toEqual(["Intro", "Advanced"]);

    const api = byTitle(ref, "API");
    expect(insertTopic(ref, removed, api.id, 1)).toBe(true);
    expect(api.children.map((t) => t.title)).toEqual(["Core", "Setup", "Plugins"]);

    const after = mustFind(findTopic(ref, setup.id), "moved setup");
    expect([after.id, ...after.children.map((c) => c.id)]).toEqual(idsBefore);
  });

  it("clamps the insert index and inserts at top level with null parent", () => {
    const d = sampleDoc();
    const guide = mustFind(d.sections[0], "guide");
    insertTopic(guide, topic("Appendix"), null, 999);
    expect(guide.topics.at(-1)?.title).toBe("Appendix");
  });

  it("returns null / false for unknown ids", () => {
    const d = sampleDoc();
    const guide = mustFind(d.sections[0], "guide");
    expect(removeTopic(guide, "nope")).toBeNull();
    expect(insertTopic(guide, topic("X"), "nope", 0)).toBe(false);
  });
});

describe("rename", () => {
  it("renames a topic and clears titleDerived", () => {
    const d = sampleDoc();
    const guide = mustFind(d.sections[0], "guide");
    const intro = byTitle(guide, "Intro");
    intro.titleDerived = true;

    expect(renameTopic(guide, intro.id, "Welcome")).toBe(true);
    expect(intro.title).toBe("Welcome");
    expect(intro.titleDerived).toBe(false);
  });

  it("renames a section and clears titleDerived", () => {
    const d = sampleDoc();
    const guide = mustFind(d.sections[0], "guide");
    guide.titleDerived = true;
    renameSection(guide, "Handbook");
    expect(guide.title).toBe("Handbook");
    expect(guide.titleDerived).toBe(false);
  });
});

describe("subtree checks", () => {
  it("detects descendants at any depth (drop-into-own-subtree guard)", () => {
    const d = sampleDoc();
    const guide = mustFind(d.sections[0], "guide");
    const setup = byTitle(guide, "Setup");
    const install = mustFind(setup.children[0], "install");

    expect(subtreeContains(setup, install.id)).toBe(true);
    expect(isDescendantOf(guide, setup.id, install.id)).toBe(true);
    expect(isDescendantOf(guide, install.id, setup.id)).toBe(false);
    // a topic is not its own descendant
    expect(isDescendantOf(guide, setup.id, setup.id)).toBe(false);
  });
});

describe("section factories", () => {
  it("createSection wraps topics under a fresh id", () => {
    const s = createSection("New", [topic("A"), topic("B")]);
    expect(s.id).toBeTruthy();
    expect(s.topics.map((t) => t.title)).toEqual(["A", "B"]);
  });

  it("createSectionByUnwrapping promotes children and keeps metadata", () => {
    const parent = topic("Parent", [topic("A"), topic("B")], "parent/");
    parent.extras = { uid: "p" };
    const s = createSectionByUnwrapping(parent);
    expect(s.title).toBe("Parent");
    expect(s.path).toBe("parent/");
    expect(s.extras).toEqual({ uid: "p" });
    expect(s.topics.map((t) => t.title)).toEqual(["A", "B"]);
  });
});

describe("cloneDocument", () => {
  it("deep-clones with fresh ids by default", () => {
    const d = sampleDoc();
    const copy = cloneDocument(d);
    expect(copy.id).not.toBe(d.id);
    const origIds = new Set(d.sections.flatMap(allTopicIds));
    for (const s of copy.sections) {
      for (const id of allTopicIds(s)) expect(origIds.has(id)).toBe(false);
    }
    // structure is identical
    expect(copy.sections.map((s) => s.title)).toEqual(d.sections.map((s) => s.title));
  });

  it("keepIds preserves every id and is fully detached", () => {
    const d = sampleDoc();
    const copy = cloneDocument(d, { keepIds: true });
    expect(copy.sections.map((s) => s.id)).toEqual(d.sections.map((s) => s.id));
    const guideCopy = mustFind(copy.sections[0], "guide copy");
    byTitle(guideCopy, "Intro").title = "Mutated";
    expect(byTitle(mustFind(d.sections[0], "guide"), "Intro").title).toBe("Intro");
  });
});
