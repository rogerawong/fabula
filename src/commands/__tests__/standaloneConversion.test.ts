/**
 * THE SECOND DROP (docs/22, Decision 2's "second drag, and the heading
 * as the commitment"; the r1 ruling record's consequence).
 *
 * A standalone card is R3's DEFERRED COMMITMENT: the first drag out
 * committed to neither shape the format offers, and the second gesture is
 * what reveals which was meant. Two drop geometries, two ruled meanings.
 *
 * ONE GESTURE, ONE UNDOABLE COMMAND, whose inverse restores the
 * standalone AND the moved row's origin together — which is why the
 * conversion lives inside `execMoveTopics` rather than beside it.
 *
 * IT ALSO CLOSES A LATENT DEFECT. Before this arc a drop onto the
 * standalone's ROW was already reachable (the row branch of `resolveDrop`
 * never excluded orphans) and produced an `isOrphan` card with two
 * top-level rows, or with a child under its entry — states `isOrphan`'s
 * own contract says cannot exist ("a top-level TOC entry with no
 * children"). MkDocs then serialised the second shape as a bare path and
 * dropped the children on the floor. The regression is named below.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import { mkdocsAdapter } from "@/formats/adapters/mkdocs";
import { runCommand } from "../dispatcher";
import { applyUndo } from "../dispatcher";
import type { EditorState } from "../types";
import type { Section, TocDocument } from "@/model/types";

function fixture(): { state: EditorState; d: TocDocument; card: Section; mover: string } {
  const lone: Section = {
    ...section("Install", [{ ...topic("Install"), path: "install.md" }]),
    path: "install.md",
    isOrphan: true,
  };
  const d = doc([lone, section("Guides", [{ ...topic("Tour"), path: "tour.md" }])]);
  return {
    state: {
      document: d,
      columns: [d.sections.map((s) => s.id)],
      view: { globalDepth: 2, cardDepths: {} },
    },
    d,
    card: d.sections[0]!,
    mover: d.sections[1]!.topics[0]!.id,
  };
}

describe("a SIBLING drop converts the standalone to a placeholder section", () => {
  it("both entries become rows under a heading nobody has chosen", () => {
    const { state, card, mover } = fixture();
    const { next } = runCommand(state, {
      type: "moveTopics",
      topicIds: [mover],
      toSectionId: card.id,
      toParentTopicId: null,
      toIndex: 1,
    });
    const converted = next.document.sections.find((s) => s.id === card.id)!;
    expect(converted.isOrphan).toBeUndefined();
    expect(converted.title).toBe("New section");
    expect(converted.untitled).toBe(true);
    expect(converted.path).toBeUndefined();
    expect(converted.topics.map((t) => t.title)).toEqual(["Install", "Tour"]);
  });

  it("one undo restores the standalone AND the row's origin together", () => {
    const { state, card, mover } = fixture();
    const before = structuredClone(state.document);
    const { next, entry } = runCommand(state, {
      type: "moveTopics",
      topicIds: [mover],
      toSectionId: card.id,
      toParentTopicId: null,
      toIndex: 1,
    });
    expect(applyUndo(next, entry!).document).toEqual(before);
  });
});

describe("a CHILD drop promotes the standalone (OR-5b's own invariant)", () => {
  it("the entry becomes the card's face and the newcomer becomes its row", () => {
    const { state, card, mover } = fixture();
    const { next } = runCommand(state, {
      type: "moveTopics",
      topicIds: [mover],
      toSectionId: card.id,
      toParentTopicId: card.topics[0]!.id,
      toIndex: 0,
    });
    const converted = next.document.sections.find((s) => s.id === card.id)!;
    expect(converted.isOrphan).toBeUndefined();
    expect(converted.title).toBe("Install");
    expect(converted.path).toBe("install.md");
    expect(converted.untitled).toBeUndefined();
    expect(converted.topics.map((t) => t.title)).toEqual(["Tour"]);
  });

  it("WRAPS instead when the entry is pinned — the pin cannot become a face", () => {
    const { state, card, mover } = fixture();
    card.topics[0]!.lock = { kind: "outside-region" };
    const { next } = runCommand(state, {
      type: "moveTopics",
      topicIds: [mover],
      toSectionId: card.id,
      toParentTopicId: card.topics[0]!.id,
      toIndex: 0,
    });
    const converted = next.document.sections.find((s) => s.id === card.id)!;
    expect(converted.title).toBe("New section");
    expect(converted.untitled).toBe(true);
    // The entry stays a ROW, with its lock and its new child.
    expect(converted.topics.map((t) => t.title)).toEqual(["Install"]);
    expect(converted.topics[0]!.lock).toEqual({ kind: "outside-region" });
    expect(converted.topics[0]!.children.map((t) => t.title)).toEqual(["Tour"]);
  });
});

describe("the shape this closes — an orphan that is not one", () => {
  it("REGRESSION: mkdocs no longer serialises a two-row standalone as a bare path", () => {
    /**
     * The defect, measured: `sectionToNode` unwraps an `isOrphan` card
     * whose `topics.length === 1`, and `topicToNode` writes a bare path
     * for a `titleDerived` entry — so an orphan whose entry had acquired
     * CHILDREN exported as `install.md` and the children vanished. The
     * conversion makes that state unreachable: any drop into a standalone
     * leaves a section behind.
     */
    const { state, card, mover } = fixture();
    const { next } = runCommand(state, {
      type: "moveTopics",
      topicIds: [mover],
      toSectionId: card.id,
      toParentTopicId: card.topics[0]!.id,
      toIndex: 0,
    });
    const converted = next.document.sections.find((s) => s.id === card.id)!;
    // The invariant `isOrphan` promises: a standalone's entry is
    // childless, and it has exactly one.
    expect(converted.isOrphan).toBeUndefined();
    const yaml = mkdocsAdapter.serialize(
      { ...next.document, formatId: "mkdocs" },
      next.document.sections.map((s) => s.id),
    );
    expect(yaml).toContain("Tour");
  });
});

describe("a lane that bears no sections refuses the drop that would make one", () => {
  it("refuses, because the conversion is unwritable HERE (Decision 2, regime 2)", () => {
    const { d, card, mover } = fixture();
    const anchored: TocDocument = {
      ...d,
      sections: d.sections.map((s) =>
        s.id === card.id ? { ...s, chain: ["Links"] } : s,
      ),
      containers: [
        {
          chainKey: "Links",
          label: "Links",
          order: 0,
          accepts: { sections: false, orphans: true },
          mayEmpty: true,
        },
        {
          chainKey: "",
          label: "Top level",
          order: 1,
          accepts: { sections: true, orphans: true },
          mayEmpty: true,
        },
      ],
    };
    const state: EditorState = {
      document: anchored,
      columns: [anchored.sections.map((s) => s.id)],
      view: { globalDepth: 2, cardDepths: {} },
    };
    const { next, entry } = runCommand(state, {
      type: "moveTopics",
      topicIds: [mover],
      toSectionId: card.id,
      toParentTopicId: null,
      toIndex: 1,
    });
    expect(entry).toBeNull();
    expect(next.document.sections.find((s) => s.id === card.id)!.isOrphan).toBe(true);
  });

  it("but a lane that bears sections takes it — the exclusion, asserted", () => {
    const { d, card, mover } = fixture();
    const grouped: TocDocument = {
      ...d,
      sections: d.sections.map((s) => (s.id === card.id ? { ...s, chain: ["Docs"] } : s)),
      containers: [
        {
          chainKey: "Docs",
          label: "Docs",
          order: 0,
          accepts: { sections: true, orphans: true },
          mayEmpty: true,
        },
      ],
    };
    const state: EditorState = {
      document: grouped,
      columns: [grouped.sections.map((s) => s.id)],
      view: { globalDepth: 2, cardDepths: {} },
    };
    const { entry } = runCommand(state, {
      type: "moveTopics",
      topicIds: [mover],
      toSectionId: card.id,
      toParentTopicId: null,
      toIndex: 1,
    });
    expect(entry).not.toBeNull();
  });
});
