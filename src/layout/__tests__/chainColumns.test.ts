/**
 * Auto-arrange keeps containers apart (docs/13 v2). In reparent-world a
 * container is a drop target, so a tidy canvas that interleaves them is
 * a canvas whose lanes cannot be seen or aimed at.
 */

import { describe, expect, it } from "vitest";
import { distributeIntoColumns } from "../positions";
import { columnBands } from "../bands";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { ContainerDescriptor, Section, TocDocument } from "@/model/types";

const container = (
  chainKey: string,
  label: string,
  order: number,
): ContainerDescriptor => ({
  chainKey,
  label,
  order,
  accepts: { sections: true, orphans: true },
  mayEmpty: true,
});

const carded = (title: string, chain: readonly string[]): Section => ({
  ...section(title, [topic(`${title} a`), topic(`${title} b`)]),
  chain,
});

/** Declared B-then-A, listed A-then-B — the two must not agree by luck. */
const twoContainers = (): TocDocument => ({
  ...doc([
    carded("A1", ["Alpha"]),
    carded("B1", ["Beta"]),
    carded("A2", ["Alpha"]),
    carded("B2", ["Beta"]),
  ]),
  containers: [container("Beta", "Beta", 0), container("Alpha", "Alpha", 1)],
});

const chainOfColumn = (d: TocDocument, column: string[]): string[] =>
  column.map((id) => (d.sections.find((s) => s.id === id)?.chain ?? []).join("/"));

describe("auto-arrange with containers", () => {
  it("never mixes two containers in one column", () => {
    const d = twoContainers();
    const columns = distributeIntoColumns(d.sections, { containers: d.containers });
    for (const column of columns) {
      expect(new Set(chainOfColumn(d, column)).size).toBeLessThanOrEqual(1);
    }
  });

  it("lays containers out in their declared order, not their listed order", () => {
    const d = twoContainers();
    const columns = distributeIntoColumns(d.sections, { containers: d.containers });
    const first = chainOfColumn(d, columns[0]!)[0];
    expect(first).toBe("Beta");
  });

  it("keeps every card, exactly once", () => {
    const d = twoContainers();
    const columns = distributeIntoColumns(d.sections, { containers: d.containers });
    const placed = columns.flat().sort();
    expect(placed).toEqual(d.sections.map((s) => s.id).sort());
  });

  it("is unchanged for a document with no containers", () => {
    const d = doc([section("A", [topic("a")]), section("B", [topic("b")])]);
    const withOpt = distributeIntoColumns(d.sections, { containers: undefined });
    const without = distributeIntoColumns(d.sections);
    expect(withOpt).toEqual(without);
  });
});

describe("columnBands", () => {
  it("names the container each column belongs to", () => {
    const d = twoContainers();
    const columns = distributeIntoColumns(d.sections, { containers: d.containers });
    expect(columnBands(d, columns)[0]).toBe("Beta");
  });

  it("names nothing for a document without containers", () => {
    const d = doc([section("A", [topic("a")])]);
    expect(columnBands(d, [[d.sections[0]!.id]])).toEqual([null]);
  });

  it("names nothing for a column that mixes containers", () => {
    // Freeform layouts can interleave; a band claimed over a mixed
    // column would be a lie about where a drop lands.
    const d = twoContainers();
    const mixed = [[d.sections[0]!.id, d.sections[1]!.id]];
    expect(columnBands(d, mixed)).toEqual([null]);
  });
});
