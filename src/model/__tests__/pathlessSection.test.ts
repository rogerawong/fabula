/**
 * The consumer sweep for a NEW INPUT SPECIES: a section with no backing
 * file (docs/16 step 6c).
 *
 * The canvas has always been able to create a card, but until moves
 * shipped there was nothing it could contain and nowhere for it to go,
 * so a pathless section never reached most of these layers. Two
 * consumers were bitten before this sweep existed, both silently:
 *
 *   - `execMoveTopicsToNewSection` checked the capability alone, so a
 *     subsection could be dragged into a section it would then illegally
 *     relocate;
 *   - Hugo's `targetByDir` ordered a pathless section's topics at dir
 *     "", so every row read as a move to the nav root.
 *
 * Two is the threshold, not the tally. Every consumer of a section's
 * backing path is exercised here with the species it can now receive —
 * an assertion where behaviour matters, a recorded receipt where the
 * honest answer is "nothing happens".
 */

import { describe, expect, it } from "vitest";
import { newId } from "@/model/id";
import type { TocDocument } from "@/model/types";
import { buildOutline } from "@/ai/outline";
import { buildTier1 } from "@/model/report";
import { topicMoveRefusal } from "@/commands/guards";
import { moveLabel } from "@/interaction/moveLabel";
import { distinguish } from "@/view/subjectIdentity";

const row = (title: string, path?: string) => ({
  id: newId(),
  title,
  path,
  children: [],
});

/** One filed section and one the canvas just created — a minimal pair. */
function withNewCard(): TocDocument {
  return {
    id: newId(),
    name: "Doc",
    formatId: "hugo",
    extras: { files: { "content/docs/tasks/_index.md": "---\ntitle: Tasks\n---\n" } },
    sections: [
      {
        id: "filed",
        title: "Tasks",
        path: "content/docs/tasks/_index.md",
        topics: [row("Alpha", "content/docs/tasks/alpha.md")],
      },
      // NO path: what `moveTopicsToNewSection` produces.
      {
        id: "fresh",
        title: "Operations",
        topics: [row("Beta", "content/docs/tasks/beta.md")],
      },
    ],
  };
}

describe("every consumer survives a section with no file", () => {
  it("the outline builder omits the folder hint rather than emitting a bare pipe", () => {
    // `hint(undefined)` → dirOf(undefined) → "" → no separator. The
    // failure would have been a `|` with nothing after it, which the
    // model reads as a real folder named nothing.
    const text = buildOutline(withNewCard(), {
      mode: "grounded" as const,
      scopeSectionIds: null,
      allowRenames: false,
      allowNewSections: true,
      allowFileMoves: true,
      folderHints: true,
      granularity: "full",
    }).text;
    expect(text).toContain("Operations");
    expect(text).not.toMatch(/Operations\s*\|\s*$/m);
  });

  it("the Tier-1 report counts it without deriving a path", () => {
    const report = buildTier1(withNewCard());
    expect(report.stats.sections).toBe(2);
  });

  it("the subject disambiguator treats it as having nothing to distinguish WITH", () => {
    // Two identically-titled cards, one filed and one fresh: the fresh
    // one gets no detail rather than an invented one.
    const labels = distinguish([
      { title: "Operations", path: "content/docs/ops/_index.md" },
      { title: "Operations" },
    ]);
    expect(labels[0]?.detail).toBe("content/docs/ops/_index.md");
    expect(labels[1]?.detail).toBeUndefined();
  });

  it("the drag label declines to name a destination it cannot know", () => {
    // RECEIPT, not a defect: a card with no directory has no "moves file
    // to …" to state, so the label is absent rather than wrong. The
    // planner is what creates the directory, at save.
    const doc = withNewCard();
    const label = moveLabel(doc, [doc.sections[0]!.topics[0]!.id], {
      sectionId: "fresh",
      parentTopicId: null,
    });
    expect(label).toBeNull();
  });

  it("the move guard still refuses INTO it on the same four reasons", () => {
    // The consumer that was bitten. A pathless destination must not
    // become a hole in the rules: a subsection dragged into a fresh card
    // is refused for being a subsection, exactly as into a filed one.
    const doc = withNewCard();
    doc.sections[0]!.topics = [row("Sub", "content/docs/tasks/sub/_index.md")];
    expect(
      topicMoveRefusal(doc, [doc.sections[0]!.topics[0]!.id], {
        sectionId: "fresh",
        parentTopicId: null,
      }),
    ).toBe("subsection");
  });

  it("the move guard allows a plain page into it", () => {
    const doc = withNewCard();
    expect(
      topicMoveRefusal(doc, [doc.sections[0]!.topics[0]!.id], {
        sectionId: "fresh",
        parentTopicId: null,
      }),
    ).toBeNull();
  });
});
