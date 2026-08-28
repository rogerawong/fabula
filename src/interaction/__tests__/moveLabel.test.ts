/**
 * What a reparent drag says, and what it refuses (docs/16 step 5).
 *
 * The three refusal sentences are keyed by the discriminant `guards.ts`
 * produces, so the drag cannot name a reason the executor would not
 * give — the cursor is the predicate's costume, never a second opinion.
 */

import { describe, expect, it } from "vitest";
import { moveLabel, refusalSentence } from "../moveLabel";
import { topicMoveRefusal } from "@/commands/guards";
import { REFUSING } from "@/commands/__tests__/refusingAdapter";
import { newId } from "@/model/id";
import type { LinkIndex } from "@/collections/linkIndex";
import type { TocDocument } from "@/model/types";

const topic = (title: string, path: string) => ({
  id: newId(),
  title,
  path,
  children: [],
});

function docOf(formatId: string, extras?: Record<string, unknown>): TocDocument {
  return {
    id: newId(),
    name: "Doc",
    formatId,
    extras,
    sections: [
      {
        id: newId(),
        title: "Tasks",
        path: "content/docs/tasks/_index.md",
        topics: [topic("Alpha", "content/docs/tasks/alpha.md")],
      },
      {
        id: newId(),
        title: "Guides",
        path: "content/docs/guides/_index.md",
        topics: [topic("One", "content/docs/guides/one.md")],
      },
    ],
  };
}

const to = (doc: TocDocument) => ({
  sectionId: doc.sections[1]!.id,
  parentTopicId: null,
});

const index = (targets: LinkIndex["targets"]): LinkIndex => ({
  observedAt: "2026-08-16T00:00:00.000Z",
  species: ["absolute-site-path"],
  paths: [],
  targets,
});

describe("the label states the consequence in the system's own terms", () => {
  it("names the destination directory, not the card", () => {
    // "moves file to tasks/configure-pod-container/" is a fact about
    // disk. "moves to Tasks" is a fact about the canvas, and the canvas
    // is not what changes.
    const doc = docOf("hugo");
    const label = moveLabel(doc, [doc.sections[0]!.topics[0]!.id], to(doc));
    expect(label?.destination).toBe("→ moves file to content/docs/guides/");
  });

  it("counts the files when several move at once", () => {
    const doc = docOf("hugo");
    doc.sections[0]!.topics.push(topic("Beta", "content/docs/tasks/beta.md"));
    const ids = doc.sections[0]!.topics.map((t) => t.id);
    expect(moveLabel(doc, ids, to(doc))?.destination).toBe(
      "→ moves 2 files to content/docs/guides/",
    );
  });

  it("says nothing at all for a reorder", () => {
    const doc = docOf("hugo");
    const same = { sectionId: doc.sections[0]!.id, parentTopicId: null };
    expect(moveLabel(doc, [doc.sections[0]!.topics[0]!.id], same)).toBeNull();
  });
});

describe("the inbound line is ABSENT when unmeasured, never zero", () => {
  it("omits the line entirely with no index", () => {
    // A missing measurement rendered as "0 inbound links" is a number
    // lying by omission — the +K discipline applied to a count.
    const doc = docOf("hugo");
    expect(moveLabel(doc, [doc.sections[0]!.topics[0]!.id], to(doc))?.inbound).toBeNull();
  });

  it("reports the count, stamped as of import", () => {
    const doc = docOf("hugo", {
      linkIndex: index({ "content/docs/tasks/alpha.md": { n: 12, from: [] } }),
    });
    expect(moveLabel(doc, [doc.sections[0]!.topics[0]!.id], to(doc))?.inbound).toBe(
      "12 inbound links, as of import",
    );
  });

  it("says zero when zero is a MEASURED answer", () => {
    // Measured-and-zero and unmeasured are different facts. This is the
    // line that proves the absence rule is not just "hide small
    // numbers".
    const doc = docOf("hugo", { linkIndex: index({}) });
    expect(moveLabel(doc, [doc.sections[0]!.topics[0]!.id], to(doc))?.inbound).toBe(
      "0 inbound links, as of import",
    );
  });

  it("sums across a multi-row drag", () => {
    const doc = docOf("hugo", {
      linkIndex: index({
        "content/docs/tasks/alpha.md": { n: 3, from: [] },
        "content/docs/tasks/beta.md": { n: 4, from: [] },
      }),
    });
    doc.sections[0]!.topics.push(topic("Beta", "content/docs/tasks/beta.md"));
    const ids = doc.sections[0]!.topics.map((t) => t.id);
    expect(moveLabel(doc, ids, to(doc))?.inbound).toBe("7 inbound links, as of import");
  });

  it("uses the singular for one link", () => {
    const doc = docOf("hugo", {
      linkIndex: index({ "content/docs/tasks/alpha.md": { n: 1, from: [] } }),
    });
    expect(moveLabel(doc, [doc.sections[0]!.topics[0]!.id], to(doc))?.inbound).toBe(
      "1 inbound link, as of import",
    );
  });
});

describe("the three refusals, from one predicate", () => {
  const withFiles = (files: Record<string, string>) => docOf("hugo", { files });

  it("refuses a leaf bundle and names its resources", () => {
    const doc = withFiles({});
    doc.sections[0]!.topics = [topic("Leafy", "content/docs/tasks/leafy/index.md")];
    const reason = topicMoveRefusal(doc, [doc.sections[0]!.topics[0]!.id], to(doc));
    expect(reason).toBe("leaf-bundle");
    expect(refusalSentence(reason!)).toMatch(/never read|strand/);
  });

  it("refuses a path collision and says two pages cannot share a path", () => {
    const doc = withFiles({ "content/docs/guides/alpha.md": "---\ntitle: A\n---\n" });
    const reason = topicMoveRefusal(doc, [doc.sections[0]!.topics[0]!.id], to(doc));
    expect(reason).toBe("path-collision");
    expect(refusalSentence(reason!)).toMatch(/already there/);
  });

  it("refuses two rows landing on one filename in ONE gesture", () => {
    // Not hypothetical: dragging two same-named pages into one card is
    // one gesture repeated.
    const doc = withFiles({});
    doc.sections[0]!.topics = [
      topic("A", "content/docs/tasks/same.md"),
      topic("B", "content/docs/other/same.md"),
    ];
    const ids = doc.sections[0]!.topics.map((t) => t.id);
    expect(topicMoveRefusal(doc, ids, to(doc))).toBe("path-collision");
  });

  it("refuses a SUBSECTION as a directory move, not as a filename clash", () => {
    // Found by the corpus paint check on a real subsection ("Learning
    // environment"). Every destination directory has an `_index.md`, so
    // the path check caught this first and said "a page with this
    // filename is already there" — sending the user off to rename a
    // file when no filename would have helped. The reason is that
    // moving a section moves its whole directory, which docs/16 defers
    // as a designed absence.
    const doc = withFiles({ "content/docs/guides/_index.md": "---\ntitle: G\n---\n" });
    doc.sections[0]!.topics = [
      topic("Learning environment", "content/docs/tasks/learning/_index.md"),
    ];
    const reason = topicMoveRefusal(doc, [doc.sections[0]!.topics[0]!.id], to(doc));
    expect(reason).toBe("subsection");
    expect(refusalSentence(reason!)).toMatch(/whole folder/);
    expect(refusalSentence(reason!)).not.toMatch(/filename/);
    // WHAT DEFERRAL OWES (docs/18): a wall plus a path. The same
    // redistribution the AI validator names when it refuses a nested
    // section, so the two surfaces cannot drift into two truths.
    expect(refusalSentence(reason!)).toMatch(/select them and drag them together/i);
  });

  it("gives the LEAF BUNDLE no escape, because none exists", () => {
    // Redistribution saves a section's pages; nothing saves a bundle's
    // resources. Offering a path here would be inventing one, so the
    // sentence says plainly that there is none.
    const doc = withFiles({ "content/docs/guides/_index.md": "---\ntitle: G\n---\n" });
    doc.sections[0]!.topics = [topic("Leafy", "content/docs/bundle/leafy/index.md")];
    const reason = topicMoveRefusal(doc, [doc.sections[0]!.topics[0]!.id], to(doc));
    expect(reason).toBe("leaf-bundle");
    expect(refusalSentence(reason!)).toMatch(/left behind/i);
    expect(refusalSentence(reason!)).not.toMatch(/drag them together/i);
  });

  it("still refuses on CAPABILITY first, before any path question", () => {
    // The v1 refusal, unchanged. A system that cannot express a parent
    // change refuses before the destination path is even considered.
    const doc = docOf(REFUSING, { files: {} });
    expect(topicMoveRefusal(doc, [doc.sections[0]!.topics[0]!.id], to(doc))).toBe(
      "capability",
    );
  });

  it("applies EVERY refusal to a drag onto empty canvas, not just capability", () => {
    // The sidebar hole, prospectively. A new section is a new parent by
    // definition, so a second entry point that checked the capability
    // alone was enforcing a subset of the first's rules — and here the
    // silent-allow has DISK consequences: a created section containing
    // a subsection's `_index.md`, relocated illegally.
    const doc = withFiles({});
    doc.sections[0]!.topics = [topic("Sub", "content/docs/tasks/sub/_index.md")];
    expect(topicMoveRefusal(doc, [doc.sections[0]!.topics[0]!.id], null)).toBe(
      "subsection",
    );
  });

  it("refuses a leaf bundle onto empty canvas too", () => {
    const doc = withFiles({});
    doc.sections[0]!.topics = [topic("Leafy", "content/docs/tasks/leafy/index.md")];
    expect(topicMoveRefusal(doc, [doc.sections[0]!.topics[0]!.id], null)).toBe(
      "leaf-bundle",
    );
  });

  it("treats the CREATED _index.md as a collision candidate", () => {
    // Near-vacuous for an existing card — nothing new is created — but a
    // new section materialises `dir/_index.md`, and overwriting one
    // would destroy a real landing page.
    const doc = withFiles({ "content/docs/reference/_index.md": "---\ntitle: R\n---\n" });
    expect(
      topicMoveRefusal(doc, [doc.sections[0]!.topics[0]!.id], null, "Reference"),
    ).toBe("path-collision");
  });

  it("allows a new section whose directory is free", () => {
    const doc = withFiles({ "content/docs/reference/_index.md": "---\ntitle: R\n---\n" });
    expect(
      topicMoveRefusal(doc, [doc.sections[0]!.topics[0]!.id], null, "Brand New"),
    ).toBeNull();
  });

  it("skips the candidate check rather than guessing when no title is given", () => {
    // A refusal invented from a title nobody supplied would be worse
    // than the collision it imagines.
    const doc = withFiles({ "content/docs/reference/_index.md": "---\ntitle: R\n---\n" });
    expect(topicMoveRefusal(doc, [doc.sections[0]!.topics[0]!.id], null)).toBeNull();
  });

  it("allows an ordinary move", () => {
    expect(
      topicMoveRefusal(
        withFiles({}),
        [withFiles({}).sections[0]!.topics[0]!.id],
        to(withFiles({})),
      ),
    ).toBeNull();
  });
});
