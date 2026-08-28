import { describe, expect, it } from "vitest";
import { doc, sampleDoc, section, topic } from "@/model/__tests__/fixtures";
import { deriveSectionOrder } from "../columns";
import {
  CARD_WIDTH,
  GAP_X,
  GAP_Y,
  ORPHAN_CARD_HEIGHT,
  PADDING_LEFT,
  PADDING_TOP,
  distributeIntoColumns,
  estimateCardHeight,
  positionCards,
} from "../positions";

describe("estimateCardHeight", () => {
  it("orphans get the compact height regardless of depth", () => {
    const d = sampleDoc();
    const faq = d.sections[2]!;
    expect(estimateCardHeight(faq, 1)).toBe(ORPHAN_CARD_HEIGHT);
    expect(estimateCardHeight(faq, 5)).toBe(ORPHAN_CARD_HEIGHT);
  });

  it("deeper expand depth shows more lines → taller card", () => {
    const d = sampleDoc();
    const guide = d.sections[0]!; // 3 L1 topics, Setup has 2 children
    expect(estimateCardHeight(guide, 2)).toBeGreaterThan(estimateCardHeight(guide, 1));
  });
});

describe("positionCards", () => {
  it("computes column x and stacked y from heights", () => {
    const layout = positionCards([["a", "b"], ["c"]], (id) => (id === "a" ? 100 : 200));

    expect(layout.byId.get("a")).toEqual({
      sectionId: "a",
      x: PADDING_LEFT,
      y: PADDING_TOP,
      width: CARD_WIDTH,
      height: 100,
    });
    expect(layout.byId.get("b")!.y).toBe(PADDING_TOP + 100 + GAP_Y);
    expect(layout.byId.get("c")!.x).toBe(PADDING_LEFT + CARD_WIDTH + GAP_X);
    expect(layout.totalWidth).toBe(PADDING_LEFT * 2 + CARD_WIDTH * 2 + GAP_X);
  });

  it("handles empty columns and empty input", () => {
    expect(positionCards([], () => 0).cards).toEqual([]);
    const layout = positionCards([[], ["a"]], () => 50);
    expect(layout.byId.get("a")!.x).toBe(PADDING_LEFT + CARD_WIDTH + GAP_X);
  });
});

describe("distributeIntoColumns", () => {
  it("preserves the given order exactly (only picks the breaks)", () => {
    const sections = Array.from({ length: 12 }, (_, i) =>
      section(`S${i}`, [topic("a"), topic("b"), topic("c")]),
    );
    const d = doc(sections);
    const ids = d.sections.map((s) => s.id);

    const columns = distributeIntoColumns(d.sections);
    expect(deriveSectionOrder(columns)).toEqual(ids);
  });

  it("respects a custom order and drops unknown ids", () => {
    const d = doc([section("A", [topic("t")]), section("B", [topic("t")])]);
    const [a, b] = d.sections.map((s) => s.id);
    const columns = distributeIntoColumns(d.sections, { order: [b!, "ghost", a!] });
    expect(deriveSectionOrder(columns)).toEqual([b, a]);
  });

  it("packs more cards per column when the viewport is taller", () => {
    const sections = Array.from({ length: 10 }, (_, i) =>
      section(
        `S${i}`,
        Array.from({ length: 8 }, (_, j) => topic(`t${j}`)),
      ),
    );
    const d = doc(sections);
    const short = distributeIntoColumns(d.sections, { viewportHeight: 900 });
    const tall = distributeIntoColumns(d.sections, { viewportHeight: 2400 });
    expect(tall.length).toBeLessThanOrEqual(short.length);
    // both partitions preserve order
    expect(deriveSectionOrder(short)).toEqual(d.sections.map((s) => s.id));
    expect(deriveSectionOrder(tall)).toEqual(d.sections.map((s) => s.id));
  });

  it("never emits a trailing empty column", () => {
    const d = doc([
      section(
        "Huge",
        Array.from({ length: 100 }, (_, j) => topic(`t${j}`)),
      ),
    ]);
    const columns = distributeIntoColumns(d.sections);
    expect(columns.every((col) => col.length > 0)).toBe(true);
  });
});
