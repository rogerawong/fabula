/**
 * THE SPECIES COMMANDS, both directions (docs/22, Decision 2's explicit
 * species commands; OR-2's ruled refusal).
 *
 * O1's species rule is HAS-HEADING, and the transition between the two
 * species is a pair of explicit, undoable commands rather than an
 * inference from row count. That is the whole reason they exist: derived
 * species would be hidden state, the `sealed`/empty mistake one level up.
 *
 * "ADD HEADING" WRAPS A NEW GROUP AROUND THE CARD'S CONTENT — the
 * deliberate new-byte-shape, distinct from promotion, which makes the
 * entry the face rather than putting a label over it.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import { applyUndo, runCommand } from "../dispatcher";
import { addHeadingRefusal, removeHeadingRefusal } from "../guards";
import type { EditorState } from "../types";
import type { Section, TocDocument } from "@/model/types";

const standalone = (title: string, path?: string): Section => ({
  ...section(title, [{ ...topic(title), ...(path ? { path } : {}) }]),
  ...(path ? { path } : {}),
  isOrphan: true,
});

function editorFor(d: TocDocument): EditorState {
  return {
    document: d,
    columns: [d.sections.map((s) => s.id)],
    view: { globalDepth: 2, cardDepths: {} },
  };
}

describe("Add heading — a new group over the card's content", () => {
  it("turns a standalone into a section whose heading nobody has chosen", () => {
    const d = doc([standalone("Install", "guides/install.md")]);
    const state = editorFor(d);
    const { next, entry } = runCommand(state, {
      type: "addHeading",
      sectionId: d.sections[0]!.id,
    });
    expect(entry).not.toBeNull();
    const card = next.document.sections[0]!;
    expect(card.isOrphan).toBeUndefined();
    expect(card.title).toBe("New section");
    expect(card.untitled).toBe(true);
    // THE ENTRY STAYS AN ENTRY. A heading was added over it, not
    // substituted for it — which is what makes this distinct from
    // promotion, where the entry becomes the face.
    expect(card.topics.map((t) => t.title)).toEqual(["Install"]);
    expect(card.topics[0]!.path).toBe("guides/install.md");
    // The card's own path went with the species: a section that is not
    // its entry does not address the entry's page.
    expect(card.path).toBeUndefined();
  });

  it("undoes back to the standalone — the command-inverse law", () => {
    /**
     * STRUCTURALLY, NOT BY `JSON.stringify`. The first draft compared
     * serialized strings and went red on KEY ORDER alone: undo restores
     * `isOrphan` and `path` in insertion order rather than the original
     * one, and nothing observes a `Section`'s key order — adapters read
     * fields by name, and the round-trip law is asserted on EXPORTED
     * bytes, not on the model's JSON. A test that fails on an unobservable
     * difference is a test that will be "fixed" by loosening the code.
     */
    const d = doc([standalone("Install", "guides/install.md")]);
    const state = editorFor(d);
    const before = structuredClone(state.document);
    const { next, entry } = runCommand(state, {
      type: "addHeading",
      sectionId: d.sections[0]!.id,
    });
    const undone = applyUndo(next, entry!);
    expect(undone.document).toEqual(before);
  });

  it("is refused on a card that already has a heading", () => {
    const d = doc([section("Guides", [topic("Install")])]);
    expect(addHeadingRefusal(d, d.sections[0]!)).toBe("not-standalone");
  });

  it("is refused where the home bears no sections — an anchors lane", () => {
    const d: TocDocument = {
      ...doc([{ ...standalone("Install", "install.md"), chain: ["Links"] }]),
      containers: [
        {
          chainKey: "Links",
          label: "Links",
          order: 0,
          accepts: { sections: false, orphans: true },
          mayEmpty: true,
        },
      ],
    };
    expect(addHeadingRefusal(d, d.sections[0]!)).toBe("unhoused-species");
  });

  it("is allowed where the home bears sections — the exclusion, asserted", () => {
    const d: TocDocument = {
      ...doc([{ ...standalone("Install", "install.md"), chain: ["Guides"] }]),
      containers: [
        {
          chainKey: "Guides",
          label: "Guides",
          order: 0,
          accepts: { sections: true, orphans: true },
          mayEmpty: true,
        },
      ],
    };
    expect(addHeadingRefusal(d, d.sections[0]!)).toBeNull();
  });
});

describe("Remove heading — scoped to headings that are PURE NAMES", () => {
  it("a one-childless-entry card becomes the standalone", () => {
    const d = doc([section("Group", [{ ...topic("Install"), path: "install.md" }])]);
    const state = editorFor(d);
    const { next } = runCommand(state, {
      type: "removeHeading",
      sectionId: d.sections[0]!.id,
    });
    const card = next.document.sections[0]!;
    expect(card.isOrphan).toBe(true);
    expect(card.title).toBe("Install");
    expect(card.path).toBe("install.md");
    expect(card.topics.map((t) => t.title)).toEqual(["Install"]);
  });

  it("a one-PARENTED-entry card becomes the promoted section", () => {
    const inner = section("Group", [
      { ...topic("Guides"), path: "guides/index.md", children: [topic("Install")] },
    ]);
    const d = doc([inner]);
    const { next } = runCommand(editorFor(d), {
      type: "removeHeading",
      sectionId: d.sections[0]!.id,
    });
    const card = next.document.sections[0]!;
    // The heading goes, the entry becomes the face — the same invariant
    // as the child drop.
    expect(card.title).toBe("Guides");
    expect(card.path).toBe("guides/index.md");
    expect(card.isOrphan).toBeUndefined();
    expect(card.topics.map((t) => t.title)).toEqual(["Install"]);
  });

  it("refuses a PATH-BEARING face — that removal would be topic deletion", () => {
    const d = doc([
      { ...section("Guides", [topic("Install")]), path: "guides/index.md" },
    ]);
    expect(removeHeadingRefusal(d, d.sections[0]!)).toBe("path-bearing");
  });

  it("refuses a MULTI-ENTRY card, naming the split-by-drag path (OR-2)", () => {
    const d = doc([section("Group", [topic("Install"), topic("Tour")])]);
    expect(removeHeadingRefusal(d, d.sections[0]!)).toBe("multi-entry");
  });

  it("refuses where the resulting STANDALONE has no home — a groups lane", () => {
    const d: TocDocument = {
      ...doc([{ ...section("Group", [topic("Install")]), chain: ["Guides"] }]),
      containers: [
        {
          chainKey: "Guides",
          label: "Guides",
          order: 0,
          accepts: { sections: true, orphans: false },
          mayEmpty: true,
        },
      ],
    };
    expect(removeHeadingRefusal(d, d.sections[0]!)).toBe("unhoused-species");
  });

  it("ALLOWS it in that same lane when the entry is PARENTED — the result is a section", () => {
    // The exclusion asserted beside the inclusion: the bearing question
    // is about the RESULTING species, and a promoted entry is a section
    // the lane bears happily. A blanket "groups lanes refuse removal"
    // would refuse real work.
    const d: TocDocument = {
      ...doc([
        {
          ...section("Group", [{ ...topic("Guides"), children: [topic("Install")] }]),
          chain: ["Guides"],
        },
      ]),
      containers: [
        {
          chainKey: "Guides",
          label: "Guides",
          order: 0,
          accepts: { sections: true, orphans: false },
          mayEmpty: true,
        },
      ],
    };
    expect(removeHeadingRefusal(d, d.sections[0]!)).toBeNull();
  });

  it("refuses a card that has no heading to remove", () => {
    const d = doc([standalone("Install", "install.md")]);
    expect(removeHeadingRefusal(d, d.sections[0]!)).toBe("not-a-section");
  });
});
