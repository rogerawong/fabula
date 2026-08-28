/**
 * What focus expands, and where it stops (docs/17).
 *
 * Asserted as the OVERRIDES MAP rather than as pixels: focus writes the
 * same per-node overrides a chevron click writes, so the test that
 * matters is that the resulting state is identical to the user having
 * opened that path by hand. Depth settings are not read, not raised and
 * not restored — this is not a view mode.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "./fixtures";
import { focusPath } from "../focusPath";
import type { Section, Topic } from "../types";

const atomic = (title: string, count: number): Topic => ({
  ...topic(title),
  lock: { kind: "atomic", count },
});

const lockedKind = (
  title: string,
  kind: "reference" | "pattern" | "external" | "missing",
) => ({
  ...topic(title),
  lock: { kind },
});

describe("expanding the ancestor path", () => {
  const leaf = topic("Leaf");
  const mid = topic("Mid", [leaf]);
  const top = topic("Top", [mid]);
  const card = section("Guide", [top, topic("Sibling")]);
  const d = doc([card]);

  it("expands every ancestor of the target, and not the target itself", () => {
    // Opening the target would be a different gesture: the user asked to
    // SEE it, and a chevron on the node itself is theirs to press.
    const path = focusPath(d, { sectionId: card.id, topicId: leaf.id })!;
    expect(path.expand).toEqual([top.id, mid.id]);
    expect(path.target).toBe(leaf.id);
  });

  it("expands nothing for a top-level row", () => {
    const path = focusPath(d, { sectionId: card.id, topicId: top.id })!;
    expect(path.expand).toEqual([]);
    expect(path.target).toBe(top.id);
  });

  it("focuses the card itself when no topic is named", () => {
    const path = focusPath(d, { sectionId: card.id })!;
    expect(path?.sectionId).toBe(card.id);
    expect(path?.expand).toEqual([]);
    expect(path?.target).toBeUndefined();
  });

  it("reports no boundary when the path is ordinary", () => {
    expect(
      focusPath(d, { sectionId: card.id, topicId: leaf.id })!.stoppedAtBoundary,
    ).toBe(false);
  });
});

describe("boundaries stop the walk", () => {
  // Focusing INTO a collapsed atomic subtree would undo the collapse
  // that made the card legible. The boundary is the honest subject, and
  // docs/12 already treats it as a thing rather than a lid.
  const buried = topic("Buried");
  const boundary: Topic = { ...atomic("All classes", 1163), children: [buried] };
  const above = topic("Above", [boundary]);
  const card = section("Reference", [above]);
  const d = doc([card]);

  it("stops at an atomic row and focuses the boundary", () => {
    const path = focusPath(d, { sectionId: card.id, topicId: buried.id })!;
    expect(path.target).toBe(boundary.id);
    expect(path.stoppedAtBoundary).toBe(true);
  });

  it("writes no expansion state inside the boundary's subtree", () => {
    const path = focusPath(d, { sectionId: card.id, topicId: buried.id })!;
    expect(path.expand).toEqual([above.id]);
    expect(path.expand).not.toContain(boundary.id);
  });

  it("focuses an atomic row asked for directly, without opening it", () => {
    const path = focusPath(d, { sectionId: card.id, topicId: boundary.id })!;
    expect(path.target).toBe(boundary.id);
    expect(path.expand).toEqual([above.id]);
  });

  it("stops at a sealed card and focuses the card", () => {
    const sealed: Section = {
      ...section("API", [topic("Generated")]),
      sealed: { source: "OpenAPI /openapi.json" },
    };
    const sealedDoc = doc([sealed]);
    const path = focusPath(sealedDoc, {
      sectionId: sealed.id,
      topicId: sealed.topics[0]!.id,
    })!;
    expect(path.target).toBeUndefined();
    expect(path.expand).toEqual([]);
    expect(path.stoppedAtBoundary).toBe(true);
  });
});

describe("the other four lock kinds are not boundaries", () => {
  // A merely-locked row is one row that happens to be immobile, not a
  // container. Refusing to focus it would withhold the node the user
  // asked for on a property that has nothing to do with containment —
  // and only `atomic` can say how much stands behind it.
  it.each(["reference", "pattern", "external", "missing"] as const)(
    "focuses a %s row directly",
    (kind) => {
      const row = lockedKind("Pinned", kind);
      const parent = topic("Parent", [row]);
      const card = section("Guide", [parent]);
      const path = focusPath(doc([card]), { sectionId: card.id, topicId: row.id })!;
      expect(path.target).toBe(row.id);
      expect(path.expand).toEqual([parent.id]);
      expect(path.stoppedAtBoundary).toBe(false);
    },
  );
});

describe("unknown subjects fail quietly", () => {
  const card = section("Guide", [topic("A")]);
  const d = doc([card]);

  it("returns nothing for a section that is not there", () => {
    expect(focusPath(d, { sectionId: "missing" })).toBeNull();
  });

  it("focuses the card when the topic is not in it", () => {
    const path = focusPath(d, { sectionId: card.id, topicId: "missing" })!;
    expect(path?.sectionId).toBe(card.id);
    expect(path?.target).toBeUndefined();
  });
});
