/**
 * Deterministic per-command cases (Layer 3, docs/07). The property-based
 * invariants live in undo-invariants.test.ts.
 */

import { describe, expect, it } from "vitest";
import { applyUndo, runCommand } from "../dispatcher";
import type { Command, EditorState } from "../types";
import { sampleEditor, sectionByTitle, topicByTitle } from "./helpers";

/** Run a command, asserting it actually did something. */
function run(state: EditorState, command: Command) {
  const result = runCommand(state, command);
  expect(result.entry, `expected ${command.type} to change state`).not.toBeNull();
  return result;
}

describe("moveTopics", () => {
  it("moves a subtree between sections (one undo step, ids stable)", () => {
    const s0 = sampleEditor();
    const setup = topicByTitle(s0, "Setup");
    const api = topicByTitle(s0, "API");
    const ref = sectionByTitle(s0, "Reference");

    const { next, entry, hints } = run(s0, {
      type: "moveTopics",
      topicIds: [setup.id],
      toSectionId: ref.id,
      toParentTopicId: api.id,
      toIndex: 1,
    });

    const refAfter = sectionByTitle(next, "Reference");
    const apiAfter = refAfter.topics[0]!;
    expect(apiAfter.children.map((t) => t.title)).toEqual(["Core", "Setup", "Plugins"]);
    expect(apiAfter.children[1]!.id).toBe(setup.id);
    expect(sectionByTitle(next, "Guide").topics.map((t) => t.title)).toEqual([
      "Intro",
      "Advanced",
    ]);
    expect(hints.movedTopicIds).toEqual([setup.id]);

    // undo restores the exact original state
    expect(applyUndo(next, entry!)).toEqual(s0);
  });

  it("reorders within the same list using post-removal indices", () => {
    const s0 = sampleEditor();
    const guide = sectionByTitle(s0, "Guide");
    const intro = topicByTitle(s0, "Intro");

    // [Intro, Setup, Advanced] → move Intro to index 2 (after removal:
    // [Setup, Advanced], insert at 2 → [Setup, Advanced, Intro])
    const { next } = run(s0, {
      type: "moveTopics",
      topicIds: [intro.id],
      toSectionId: guide.id,
      toParentTopicId: null,
      toIndex: 2,
    });
    expect(sectionByTitle(next, "Guide").topics.map((t) => t.title)).toEqual([
      "Setup",
      "Advanced",
      "Intro",
    ]);
  });

  it("moves a multi-selection as ONE transaction (one undo step)", () => {
    const s0 = sampleEditor();
    const intro = topicByTitle(s0, "Intro");
    const advanced = topicByTitle(s0, "Advanced");
    const ref = sectionByTitle(s0, "Reference");

    const { next, entry } = run(s0, {
      type: "moveTopics",
      topicIds: [intro.id, advanced.id],
      toSectionId: ref.id,
      toParentTopicId: null,
      toIndex: 0,
    });

    expect(sectionByTitle(next, "Reference").topics.map((t) => t.title)).toEqual([
      "Intro",
      "Advanced",
      "API",
    ]);
    // single entry undoes the whole gesture
    expect(applyUndo(next, entry!)).toEqual(s0);
  });

  it("normalizes nested selections — children travel with their ancestor", () => {
    const s0 = sampleEditor();
    const setup = topicByTitle(s0, "Setup");
    const install = topicByTitle(s0, "Install"); // child of Setup
    const ref = sectionByTitle(s0, "Reference");

    const { next, hints } = run(s0, {
      type: "moveTopics",
      topicIds: [install.id, setup.id], // deliberately both, child first
      toSectionId: ref.id,
      toParentTopicId: null,
      toIndex: 0,
    });

    expect(hints.movedTopicIds).toEqual([setup.id]); // only the ancestor
    const moved = sectionByTitle(next, "Reference").topics[0]!;
    expect(moved.children.map((t) => t.title)).toEqual(["Install", "Config"]);
  });

  it("rejects drops into the moved subtree (no-op, no undo entry)", () => {
    const s0 = sampleEditor();
    const setup = topicByTitle(s0, "Setup");
    const install = topicByTitle(s0, "Install");
    const guide = sectionByTitle(s0, "Guide");

    const result = runCommand(s0, {
      type: "moveTopics",
      topicIds: [setup.id],
      toSectionId: guide.id,
      toParentTopicId: install.id, // inside Setup's own subtree
      toIndex: 0,
    });
    expect(result.entry).toBeNull();
    expect(result.next).toBe(s0); // strictly unchanged
  });

  it("dissolves an orphan husk when its topic moves out, and undo restores it", () => {
    const s0 = sampleEditor();
    const faqSection = sectionByTitle(s0, "FAQ");
    const faqTopic = faqSection.topics[0]!;
    const guide = sectionByTitle(s0, "Guide");

    const { next, entry, hints } = run(s0, {
      type: "moveTopics",
      topicIds: [faqTopic.id],
      toSectionId: guide.id,
      toParentTopicId: null,
      toIndex: 0,
    });

    expect(next.document.sections.map((s) => s.title)).toEqual(["Guide", "Reference"]);
    expect(next.columns.flat()).not.toContain(faqSection.id);
    expect(hints.removedSectionIds).toEqual([faqSection.id]);
    expect(applyUndo(next, entry!)).toEqual(s0);
  });
});

describe("moveTopicsToNewSection", () => {
  it("unwraps a single parent topic: children become the top level", () => {
    const s0 = sampleEditor();
    const setup = topicByTitle(s0, "Setup");

    const { next, entry, hints } = run(s0, {
      type: "moveTopicsToNewSection",
      topicIds: [setup.id],
      toColumn: 1,
      toIndexInColumn: 0,
    });

    const created = next.document.sections.at(-1)!;
    expect(created.title).toBe("Setup");
    expect(created.path).toBe("setup/");
    expect(created.topics.map((t) => t.title)).toEqual(["Install", "Config"]);
    expect(hints.createdSectionIds).toEqual([created.id]);
    expect(next.columns[1]).toEqual([created.id]);
    expect(applyUndo(next, entry!)).toEqual(s0);
  });

  it("wraps a leaf topic without unwrapping", () => {
    const s0 = sampleEditor();
    const intro = topicByTitle(s0, "Intro");

    const { next } = run(s0, {
      type: "moveTopicsToNewSection",
      topicIds: [intro.id],
      toColumn: 0,
      toIndexInColumn: 0,
    });

    const created = next.document.sections.at(-1)!;
    expect(created.title).toBe("Intro");
    expect(created.topics.map((t) => t.title)).toEqual(["Intro"]);
  });

  it("wraps a multi-selection under the given title", () => {
    const s0 = sampleEditor();
    const intro = topicByTitle(s0, "Intro");
    const advanced = topicByTitle(s0, "Advanced");

    const { next } = run(s0, {
      type: "moveTopicsToNewSection",
      topicIds: [intro.id, advanced.id],
      title: "Basics",
      toColumn: 0,
      toIndexInColumn: 1,
    });

    const created = next.document.sections.at(-1)!;
    expect(created.title).toBe("Basics");
    expect(created.topics.map((t) => t.title)).toEqual(["Intro", "Advanced"]);
  });
});

describe("rename", () => {
  it("renameTopic clears titleDerived; undo restores flag and title", () => {
    const s0 = sampleEditor();
    const guide = sectionByTitle(s0, "Guide");
    guide.topics[0]!.titleDerived = true;

    const { next, entry } = run(s0, {
      type: "renameTopic",
      sectionId: guide.id,
      topicId: guide.topics[0]!.id,
      title: "Welcome",
    });

    const after = sectionByTitle(next, "Guide").topics[0]!;
    expect(after.title).toBe("Welcome");
    expect(after.titleDerived).toBe(false);
    expect(applyUndo(next, entry!)).toEqual(s0);
  });

  it("renameSection works and is undoable", () => {
    const s0 = sampleEditor();
    const guide = sectionByTitle(s0, "Guide");
    const { next, entry } = run(s0, {
      type: "renameSection",
      sectionId: guide.id,
      title: "Handbook",
    });
    expect(sectionByTitle(next, "Handbook").id).toBe(guide.id);
    expect(applyUndo(next, entry!)).toEqual(s0);
  });
});

describe("sections & columns", () => {
  it("removeSection cleans document, columns and depth overrides", () => {
    const s0 = sampleEditor();
    const ref = sectionByTitle(s0, "Reference");
    s0.view.cardDepths[ref.id] = 3;

    const { next, entry } = run(s0, { type: "removeSection", sectionId: ref.id });
    expect(next.document.sections.map((s) => s.title)).toEqual(["Guide", "FAQ"]);
    expect(next.columns.flat()).not.toContain(ref.id);
    expect(next.view.cardDepths[ref.id]).toBeUndefined();
    expect(applyUndo(next, entry!)).toEqual(s0);
  });

  it("reorderCard moves a card between columns", () => {
    const s0 = sampleEditor();
    const guide = sectionByTitle(s0, "Guide");

    const { next } = run(s0, {
      type: "reorderCard",
      sectionId: guide.id,
      toColumn: 2,
      toIndexInColumn: 0,
    });
    expect(next.columns.flat()).toHaveLength(3);
    expect(next.columns.at(-1)).toEqual([guide.id]);
  });

  it("setColumns rejects arrangements that don't match the live sections", () => {
    const s0 = sampleEditor();
    const result = runCommand(s0, {
      type: "setColumns",
      columns: [[s0.document.sections[0]!.id]], // missing the other two
    });
    expect(result.entry).toBeNull();
  });

  it("setColumns applies a full valid arrangement", () => {
    const s0 = sampleEditor();
    const ids = s0.document.sections.map((s) => s.id);
    const { next } = run(s0, {
      type: "setColumns",
      columns: [[ids[2]!], [ids[1]!, ids[0]!]],
    });
    expect(next.columns).toEqual([[ids[2]], [ids[1], ids[0]]]);
  });
});

describe("depth & misc", () => {
  it("depth commands are undoable and clearable", () => {
    const s0 = sampleEditor();
    const guide = sectionByTitle(s0, "Guide");

    const a = run(s0, { type: "setGlobalDepth", depth: 4 });
    const b = run(a.next, { type: "setCardDepth", sectionId: guide.id, depth: 1 });
    expect(b.next.view.globalDepth).toBe(4);
    expect(b.next.view.cardDepths[guide.id]).toBe(1);

    const c = run(b.next, { type: "setCardDepth", sectionId: guide.id, depth: null });
    expect(c.next.view.cardDepths[guide.id]).toBeUndefined();
    expect(applyUndo(c.next, c.entry!)).toEqual(b.next);
  });

  it("insertTopic adds a fresh leaf under a parent", () => {
    const s0 = sampleEditor();
    const guide = sectionByTitle(s0, "Guide");
    const setup = topicByTitle(s0, "Setup");

    const { next } = run(s0, {
      type: "insertTopic",
      sectionId: guide.id,
      parentTopicId: setup.id,
      index: 99,
      title: "Uninstall",
      path: "uninstall.md",
    });
    const setupAfter = topicByTitle(next, "Setup");
    expect(setupAfter.children.at(-1)?.title).toBe("Uninstall");
  });

  it("removeTopics deletes subtrees and prunes emptied orphans", () => {
    const s0 = sampleEditor();
    const faq = sectionByTitle(s0, "FAQ");
    const { next, entry } = run(s0, {
      type: "removeTopics",
      topicIds: [faq.topics[0]!.id],
    });
    expect(next.document.sections.map((s) => s.title)).toEqual(["Guide", "Reference"]);
    expect(applyUndo(next, entry!)).toEqual(s0);
  });

  it("same-position moves are no-ops (no undo entry)", () => {
    const s0 = sampleEditor();
    const guide = sectionByTitle(s0, "Guide");
    const intro = topicByTitle(s0, "Intro"); // index 0 at top level

    // dropping Intro back at index 0 of its own list
    const topicMove = runCommand(s0, {
      type: "moveTopics",
      topicIds: [intro.id],
      toSectionId: guide.id,
      toParentTopicId: null,
      toIndex: 0,
    });
    expect(topicMove.entry).toBeNull();

    // dropping the card back into its current slot
    const cardMove = runCommand(s0, {
      type: "reorderCard",
      sectionId: guide.id,
      toColumn: 0,
      toIndexInColumn: 0,
    });
    expect(cardMove.entry).toBeNull();

    // setColumns with the identical arrangement
    const sameColumns = runCommand(s0, {
      type: "setColumns",
      columns: s0.columns.map((c) => [...c]),
    });
    expect(sameColumns.entry).toBeNull();
  });

  it("unknown ids are no-ops across all commands", () => {
    const s0 = sampleEditor();
    const noops: Command[] = [
      {
        type: "moveTopics",
        topicIds: ["nope"],
        toSectionId: s0.document.sections[0]!.id,
        toParentTopicId: null,
        toIndex: 0,
      },
      {
        type: "moveTopicsToNewSection",
        topicIds: ["nope"],
        toColumn: 0,
        toIndexInColumn: 0,
      },
      { type: "removeTopics", topicIds: ["nope"] },
      { type: "renameTopic", sectionId: "nope", topicId: "nope", title: "X" },
      { type: "renameSection", sectionId: "nope", title: "X" },
      { type: "removeSection", sectionId: "nope" },
      { type: "reorderCard", sectionId: "nope", toColumn: 0, toIndexInColumn: 0 },
      { type: "setCardDepth", sectionId: "nope", depth: 1 },
      {
        type: "insertTopic",
        sectionId: "nope",
        parentTopicId: null,
        index: 0,
        title: "X",
      },
    ];
    for (const cmd of noops) {
      const result = runCommand(s0, cmd);
      expect(result.entry, cmd.type).toBeNull();
      expect(result.next, cmd.type).toBe(s0);
    }
  });
});
