/**
 * Reparent legality at the commit path (docs/13 v2).
 *
 * These tests dispatch the COMMAND. They cannot tell which UI produced
 * it, and that is the point: v1's cross-chain guard lived inside the
 * canvas drag handler, so the sidebar shipped without it and committed
 * the move the canvas refused. A test that drives a drag proves that
 * drag; a test here proves every entrance, including the ones not built
 * yet.
 */

import { describe, expect, it } from "vitest";
import { initialColumns } from "@/layout/columns";
import { chainKey } from "@/model/selectors";
import { DEFAULT_GLOBAL_DEPTH } from "@/store";
import type { ContainerDescriptor, Section, TocDocument } from "@/model/types";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import { runCommand } from "../dispatcher";
import type { EditorState } from "../types";

const container = (
  chainKey: string,
  label: string,
  order: number,
  accepts: { sections: boolean; orphans: boolean },
  mayEmpty = true,
): ContainerDescriptor => ({ chainKey, label, order, accepts, mayEmpty });

const carded = (title: string, chain: readonly string[], orphan = false): Section => ({
  ...section(title, [topic(`${title} page`, [], title.toLowerCase())]),
  chain,
  ...(orphan ? { isOrphan: true } : {}),
});

/**
 * Guides bears sections and may not empty; Reference bears sections and
 * holds NONE; global bears orphans only; Solo is a one-card tab.
 */
function fixture(): EditorState {
  const d: TocDocument = {
    ...doc([
      carded("Get started", ["Guides"]),
      carded("Operate", ["Guides"]),
      carded("Endpoints", ["Solo"]),
      carded("Status", ["global"], true),
    ]),
    containers: [
      container("Guides", "Guides", 0, { sections: true, orphans: false }, false),
      container("Reference", "Reference", 1, { sections: true, orphans: false }),
      container("Solo", "Solo", 2, { sections: true, orphans: false }, false),
      container("global", "global", 3, { sections: false, orphans: true }),
      container("", "Top level", 4, { sections: true, orphans: true }),
    ],
  };
  return {
    document: d,
    columns: initialColumns(d),
    view: { globalDepth: DEFAULT_GLOBAL_DEPTH, cardDepths: {} },
  };
}

const find = (state: EditorState, title: string): Section =>
  state.document.sections.find((s) => s.title === title)!;

const chainOf = (state: EditorState, title: string): string =>
  chainKey(find(state, title));

describe("reparent at the commit path", () => {
  it("moves a card into another container when the drop names one", () => {
    const state = fixture();
    const { next } = runCommand(state, {
      type: "reorderCard",
      sectionId: find(state, "Operate").id,
      toColumn: 0,
      toIndexInColumn: 0,
      chain: ["Solo"],
    });
    expect(chainOf(next, "Operate")).toBe("Solo");
  });

  it("leaves the chain alone when the drop names none — an ordinary reorder", () => {
    const state = fixture();
    const { next } = runCommand(state, {
      type: "reorderCard",
      sectionId: find(state, "Operate").id,
      toColumn: 0,
      toIndexInColumn: 0,
    });
    expect(chainOf(next, "Operate")).toBe("Guides");
  });

  it("accepts the FIRST card of a container that bears sections and holds none", () => {
    // The case that killed derivation: nothing is inside Reference to
    // infer from, and it must still take a card.
    const state = fixture();
    const { next } = runCommand(state, {
      type: "reorderCard",
      sectionId: find(state, "Operate").id,
      toColumn: 0,
      toIndexInColumn: 0,
      chain: ["Reference"],
    });
    expect(chainOf(next, "Operate")).toBe("Reference");
  });

  it("refuses a section into a container that bears only orphans", () => {
    // A type error, not a move: Mintlify's global lane holds anchors.
    const state = fixture();
    const { next, entry } = runCommand(state, {
      type: "reorderCard",
      sectionId: find(state, "Operate").id,
      toColumn: 0,
      toIndexInColumn: 0,
      chain: ["global"],
    });
    expect(chainOf(next, "Operate")).toBe("Guides");
    expect(entry).toBeNull();
  });

  it("refuses a move that would empty a container the format requires filled", () => {
    // `tabs.groups` has minItems: 1 — emptying Solo writes a file
    // Mintlify rejects.
    const state = fixture();
    const { next, entry } = runCommand(state, {
      type: "reorderCard",
      sectionId: find(state, "Endpoints").id,
      toColumn: 0,
      toIndexInColumn: 0,
      chain: ["Guides"],
    });
    expect(chainOf(next, "Endpoints")).toBe("Solo");
    expect(entry).toBeNull();
  });

  it("allows the last card out of a container that may empty", () => {
    const state = fixture();
    const { next } = runCommand(state, {
      type: "reorderCard",
      sectionId: find(state, "Status").id,
      toColumn: 0,
      toIndexInColumn: 0,
      chain: [],
    });
    expect(chainOf(next, "Status")).toBe("");
  });

  it("refuses a chain no container declares", () => {
    const state = fixture();
    const { next } = runCommand(state, {
      type: "reorderCard",
      sectionId: find(state, "Operate").id,
      toColumn: 0,
      toIndexInColumn: 0,
      chain: ["Invented"],
    });
    expect(chainOf(next, "Operate")).toBe("Guides");
  });

  it("is inert for a document that declares no containers", () => {
    // Every format whose cards are top level: a chain-bearing command
    // cannot arrive, and an ordinary reorder must not start failing.
    const d = doc([section("A", [topic("a")]), section("B", [topic("b")])]);
    const state: EditorState = {
      document: d,
      columns: initialColumns(d),
      view: { globalDepth: DEFAULT_GLOBAL_DEPTH, cardDepths: {} },
    };
    const { next } = runCommand(state, {
      type: "reorderCard",
      sectionId: d.sections[1]!.id,
      toColumn: 0,
      toIndexInColumn: 0,
    });
    expect(next.columns[0]![0]).toBe(d.sections[1]!.id);
  });

  it("undoes a reparent back to the original container", () => {
    const state = fixture();
    const { next, entry } = runCommand(state, {
      type: "reorderCard",
      sectionId: find(state, "Operate").id,
      toColumn: 0,
      toIndexInColumn: 0,
      chain: ["Reference"],
    });
    expect(chainOf(next, "Operate")).toBe("Reference");
    expect(entry?.label).toContain("Reference");
  });
});
