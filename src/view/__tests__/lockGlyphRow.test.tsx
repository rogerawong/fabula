/**
 * lockGlyphRow.test.tsx — the row's resting-state chrome, as markup.
 *
 * TopicRow reads no store at render (stores are handler-time only), so
 * `renderToStaticMarkup` works in vitest's node environment — no jsdom,
 * no browser. What needs a real pointer (hover, tooltip paint,
 * occlusion) lives in e2e and the corpus paint checks; THIS file pins
 * the resting DOM: glyph present with kind/tier, retired chips ABSENT
 * (retired chrome is a claim), the atomic count preserved, and the
 * unlisted/lock collision case rendering BOTH marks.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCK_KINDS } from "@/model/locks";
import type { Topic, TopicLock } from "@/model/types";
import { TopicRow, type RowContext } from "../canvas/TopicRow";

function topicWith(over: Partial<Topic>): Topic {
  return { id: "t1", title: "Provision swap memory", children: [], ...over };
}

const ctx: RowContext = {
  tabId: "tab1",
  sectionId: "s1",
  depth: 2,
  locked: false,
  renameable: { sections: true, topics: true },
  selectedIds: new Set(),
  indicatorKey: null,
  overrides: new Map(),
  onToggle: () => {},
  editingId: null,
  setEditingId: () => {},
};

function render(topic: Topic): string {
  return renderToStaticMarkup(<TopicRow topic={topic} level={1} ctx={ctx} />);
}

/** The retired chip vocabulary — none of it may render at rest. */
const RETIRED_CHIP_TEXT = [
  "Locked",
  "Also in",
  "Reference",
  "Pattern",
  "Above prose",
  "Glob block",
  "External",
  "Missing",
];

describe("lock glyph slot", () => {
  it.each(LOCK_KINDS.map((k) => [k] as const))(
    "renders one %s glyph and no text chip",
    (kind) => {
      const lock: TopicLock =
        kind === "atomic"
          ? { kind, count: 1163 }
          : kind === "reference"
            ? { kind, owner: "Getting started" }
            : { kind };
      const html = render(topicWith({ lock }));
      expect(html).toContain(`data-lock-kind="${kind}"`);
      expect(html).toContain(
        `data-lock-tier="${kind === "missing" ? "error" : "state"}"`,
      );
      // The chip is RETIRED, all kinds, no toggle — absence asserted,
      // because retired chrome is a claim about the build.
      for (const text of RETIRED_CHIP_TEXT) {
        expect(html, `chip text "${text}" must not render`).not.toContain(`>${text}<`);
      }
      expect(html).not.toContain("text-[10px]");
      expect(html).not.toContain("uppercase tracking-wide");
    },
  );

  it("keeps the atomic boundary's count — disclosure, not a property label", () => {
    const html = render(topicWith({ lock: { kind: "atomic", count: 1163 } }));
    expect(html).toContain("1,163");
  });

  it("paints missing in the warning token and the others monochrome", () => {
    expect(render(topicWith({ lock: { kind: "missing" } }))).toContain("text-warning");
    expect(render(topicWith({ lock: { kind: "external" } }))).not.toContain(
      "text-warning",
    );
  });

  it("renders BOTH marks on a row that is unlisted and locked", () => {
    // The eye-off column and the lock glyph are different columns with
    // different semantics; a row carrying both facts shows both.
    const html = render(
      topicWith({
        lock: { kind: "reference", owner: "Getting started" },
        unlisted: { reasons: [{ label: "toc_hide", note: "hidden from the sidebar" }] },
      }),
    );
    expect(html).toContain('data-testid="unlisted-glyph"');
    expect(html).toContain('data-testid="lock-glyph"');
    expect(html).toContain('data-lock-kind="reference"');
  });

  it("leaves unlocked rows without a glyph slot", () => {
    expect(render(topicWith({}))).not.toContain("data-lock-kind");
  });
});
