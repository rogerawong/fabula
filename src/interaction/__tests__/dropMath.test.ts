import { describe, expect, it } from "vitest";
import { CARD_WIDTH, GAP_X, PADDING_LEFT, PADDING_TOP } from "@/layout/positions";
import type { CardRect } from "@/layout/positions";
import {
  adjustIndexAfterRemoval,
  cardDropPosition,
  sidebarDropToColumnPos,
  crossChainDrop,
} from "../dropMath";

function rect(sectionId: string, x: number, y: number, height = 200): CardRect {
  return { sectionId, x, y, width: CARD_WIDTH, height };
}

describe("cardDropPosition", () => {
  const columns = [["a", "b"], ["c"]];
  const rects = new Map([
    ["a", rect("a", PADDING_LEFT, PADDING_TOP)],
    ["b", rect("b", PADDING_LEFT, PADDING_TOP + 232)],
    ["c", rect("c", PADDING_LEFT + CARD_WIDTH + GAP_X, PADDING_TOP)],
  ]);

  it("maps x to the column under the pointer", () => {
    const overCol0 = cardDropPosition(
      columns,
      rects,
      { x: PADDING_LEFT + 100, y: 0 },
      null,
    );
    expect(overCol0.colIndex).toBe(0);
    const overCol1 = cardDropPosition(
      columns,
      rects,
      { x: PADDING_LEFT + CARD_WIDTH + GAP_X + 100, y: 0 },
      null,
    );
    expect(overCol1.colIndex).toBe(1);
  });

  it("clamps to a potential new column on the right, never negative", () => {
    const farRight = cardDropPosition(columns, rects, { x: 5000, y: 0 }, null);
    expect(farRight.colIndex).toBe(2); // == columns.length → new column
    const farLeft = cardDropPosition(columns, rects, { x: -500, y: 0 }, null);
    expect(farLeft.colIndex).toBe(0);
  });

  it("computes the insert index from card midpoints", () => {
    const aboveA = cardDropPosition(
      columns,
      rects,
      { x: PADDING_LEFT, y: PADDING_TOP + 10 },
      null,
    );
    expect(aboveA.cardIndex).toBe(0);
    const belowAMid = cardDropPosition(
      columns,
      rects,
      { x: PADDING_LEFT, y: PADDING_TOP + 150 },
      null,
    );
    expect(belowAMid.cardIndex).toBe(1);
    const belowBoth = cardDropPosition(
      columns,
      rects,
      { x: PADDING_LEFT, y: 5000 },
      null,
    );
    expect(belowBoth.cardIndex).toBe(2);
  });

  it("ignores the dragged card when counting positions", () => {
    // dragging "a": pointer below a's midpoint but above b's → index 0
    const p = cardDropPosition(
      columns,
      rects,
      { x: PADDING_LEFT, y: PADDING_TOP + 150 },
      "a",
    );
    expect(p.cardIndex).toBe(0);
  });
});

describe("adjustIndexAfterRemoval", () => {
  it("subtracts moved ids that sit before the insertion point", () => {
    const sibs = ["a", "b", "c", "d"];
    expect(adjustIndexAfterRemoval(sibs, 3, new Set(["a", "c"]))).toBe(1);
    expect(adjustIndexAfterRemoval(sibs, 1, new Set(["c"]))).toBe(1);
    expect(adjustIndexAfterRemoval(sibs, 0, new Set(["a"]))).toBe(0);
  });

  it("never returns a negative index", () => {
    expect(adjustIndexAfterRemoval(["a"], 1, new Set(["a"]))).toBe(0);
  });
});

describe("sidebarDropToColumnPos", () => {
  const columns = [
    ["a", "b"],
    ["c", "d"],
  ];

  it("places before/after the target on the dragged-removed columns", () => {
    expect(sidebarDropToColumnPos(columns, "d", "a", "before")).toEqual({
      colIndex: 0,
      cardIndex: 0,
    });
    expect(sidebarDropToColumnPos(columns, "d", "a", "after")).toEqual({
      colIndex: 0,
      cardIndex: 1,
    });
  });

  it("accounts for the dragged card leaving its own column", () => {
    // dragging "a" after "b": without a, col0 = [b] → index 1
    expect(sidebarDropToColumnPos(columns, "a", "b", "after")).toEqual({
      colIndex: 0,
      cardIndex: 1,
    });
  });

  it("returns null for unknown targets", () => {
    expect(sidebarDropToColumnPos(columns, "a", "ghost", "before")).toBeNull();
  });
});

describe("crossChainDrop", () => {
  // Navigation containers sit above the card level and have no card of
  // their own, so the serializer partitions by chain and a cross-chain
  // position would export as a silent no-op. Refusing it while dragging
  // is what makes the limitation visible (docs/13).
  const columns = [["a1", "a2", "b1", "b2"]];
  const chains: Record<string, string> = { a1: "A", a2: "A", b1: "B", b2: "B" };
  const of = (id: string) => chains[id] ?? "";

  it("refuses a slot whose only neighbours belong to another chain", () => {
    // dropping A-card between b1 and b2
    expect(crossChainDrop(columns, of, "a1", { colIndex: 0, cardIndex: 3 })).toBe(true);
  });

  it("allows a slot adjacent to its own chain", () => {
    expect(crossChainDrop(columns, of, "a1", { colIndex: 0, cardIndex: 1 })).toBe(false);
  });

  it("allows the boundary between two chains", () => {
    // Indices are POST-removal, like every other drop calculation here.
    // Dragging b2 to index 2 of ["a1","a2","b1"] puts it after a2 and
    // before b1 — one neighbour is its own chain, so the position is
    // expressible and refusing it would block legal reordering.
    expect(crossChainDrop(columns, of, "b2", { colIndex: 0, cardIndex: 2 })).toBe(false);
  });

  it("refuses a slot buried inside another chain's run, post-removal", () => {
    // a1 removed leaves ["a2","b1","b2"]; index 2 sits between b1 and b2.
    expect(crossChainDrop(columns, of, "a1", { colIndex: 0, cardIndex: 2 })).toBe(true);
  });

  it("allows an empty column, which has no run to land inside", () => {
    expect(crossChainDrop([[]], of, "a1", { colIndex: 0, cardIndex: 0 })).toBe(false);
  });

  it("is inert when no section declares a chain", () => {
    // Every format shipped today: no chains, so nothing can be refused.
    const none = () => "";
    expect(crossChainDrop(columns, none, "a1", { colIndex: 0, cardIndex: 3 })).toBe(
      false,
    );
  });
});
