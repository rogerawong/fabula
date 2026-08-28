/**
 * How a drop position reads (docs/13 v2). The trichotomy every gesture
 * shares, kept pure so it can be tested without a DOM or a drag.
 */

import { describe, expect, it } from "vitest";
import { classifyDrop } from "../dropMath";

//  column 0: a1 a2 | b1 b2      (chain A then chain B)
const columns = [["a1", "a2", "b1", "b2"]];
const chains: Record<string, string> = { a1: "A", a2: "A", b1: "B", b2: "B" };
const of = (id: string) => chains[id] ?? "";

const at = (dragged: string, cardIndex: number, colIndex = 0) =>
  classifyDrop(columns, of, dragged, { colIndex, cardIndex });

describe("classifyDrop", () => {
  it("reads a slot among my own container's cards as a reorder", () => {
    // a1 removed leaves [a2, b1, b2]; index 0 sits before a2, which is
    // mine, so nothing about the container changes.
    expect(at("a1", 0)).toEqual({ kind: "reorder" });
  });

  it("reads a slot buried in another container as a move into it", () => {
    // a1 removed leaves [a2, b1, b2]; index 3 sits between b1 and b2,
    // so both neighbours are B and there is nothing to ask about.
    expect(at("a1", 3)).toEqual({ kind: "reparent", chainKey: "B" });
  });

  it("reads the boundary between two containers as a seam", () => {
    // a1 removed leaves [a2, b1, b2]; index 1 sits between a2 (mine) and
    // b1 (not) — reorder-within-A and move-to-B are the same pixel, and
    // this is the ONLY case that asks.
    expect(at("a1", 1)).toEqual({ kind: "seam", chainKey: "B", keepKey: "A" });
  });

  it("reads the end of another container's run as a move into it", () => {
    // b1 removed leaves [a1, a2, b2]; index 2 sits between a2 and b2 —
    // one neighbour mine, one not: still a seam.
    expect(at("b1", 2)).toEqual({ kind: "seam", chainKey: "A", keepKey: "B" });
  });

  it("reads a slot past every card as a move into the last run", () => {
    expect(at("a1", 3)).toEqual({ kind: "reparent", chainKey: "B" });
  });

  it("reads an empty column as a plain reorder — nothing to move into", () => {
    expect(classifyDrop([[]], of, "a1", { colIndex: 0, cardIndex: 0 })).toEqual({
      kind: "reorder",
    });
  });

  it("reads a column that does not exist as a plain reorder", () => {
    expect(classifyDrop(columns, of, "a1", { colIndex: 9, cardIndex: 0 })).toEqual({
      kind: "reorder",
    });
  });

  it("is inert when no card declares a container", () => {
    // Every format whose cards are top level: one container cannot be
    // ambiguous with itself.
    const flat = () => "";
    expect(classifyDrop(columns, flat, "a1", { colIndex: 0, cardIndex: 3 })).toEqual({
      kind: "reorder",
    });
  });
});
