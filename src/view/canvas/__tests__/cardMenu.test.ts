/**
 * The species commands' voice (docs/22, Decision 2).
 *
 * A REFUSAL SENTENCE IS A CLAIM, so each one is asserted against the
 * fact it makes rather than against a substring somebody could satisfy
 * by accident. The two that name a PATH are asserted to name it; the one
 * that deliberately names none is asserted not to.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import { cardMenuRefusals } from "../cardMenu";
import type { Section, TocDocument } from "@/model/types";

const standalone = (title: string, path?: string): Section => ({
  ...section(title, [{ ...topic(title), ...(path ? { path } : {}) }]),
  ...(path ? { path } : {}),
  isOrphan: true,
});

describe("what the card menu offers", () => {
  it("offers Add heading on a standalone and refuses Remove there", () => {
    const d = doc([standalone("Install", "install.md")]);
    const r = cardMenuRefusals(d, d.sections[0]!);
    expect(r.addHeading).toBeUndefined();
    expect(r.removeHeading).toContain("no heading");
  });

  it("offers Remove heading on a pure-name section and refuses Add there", () => {
    const d = doc([section("Group", [topic("Install")])]);
    const r = cardMenuRefusals(d, d.sections[0]!);
    expect(r.removeHeading).toBeUndefined();
    expect(r.addHeading).toContain("already has a heading");
  });

  it("names the split-by-drag path for a multi-entry card (OR-2)", () => {
    const d = doc([section("Group", [topic("Install"), topic("Tour")])]);
    expect(cardMenuRefusals(d, d.sections[0]!).removeHeading).toBe(
      "A heading with several entries under it is a section; to break it up, drag its entries out.",
    );
  });

  it("names NO path for a path-bearing face, because none exists", () => {
    // The exclusion asserted: a sentence offering a way round would be
    // inventing one, which is the failure the leaf-bundle refusal names
    // at its own site.
    const d = doc([
      { ...section("Guides", [topic("Install")]), path: "guides/index.md" },
    ]);
    const copy = cardMenuRefusals(d, d.sections[0]!).removeHeading!;
    expect(copy).toBe(
      "This card's heading is the page itself, not a label — there is nothing to remove without deleting the page.",
    );
    expect(copy).not.toContain("drag");
  });

  it("names the lanes that DO bear the result when a lane refuses it", () => {
    const d: TocDocument = {
      ...doc([{ ...section("Group", [topic("Install")]), chain: ["Guides"] }]),
      containers: [
        {
          chainKey: "Guides",
          label: "Guides",
          order: 0,
          accepts: { sections: true, orphans: false },
          mayEmpty: true,
        },
        {
          chainKey: "Links",
          label: "Links",
          order: 1,
          accepts: { sections: false, orphans: true },
          mayEmpty: true,
        },
      ],
    };
    const copy = cardMenuRefusals(d, d.sections[0]!).removeHeading!;
    expect(copy).toContain('"Links"');
    // And NOT the lane it is already in, which would be advice to repeat
    // what the user just did.
    expect(copy).not.toContain('"Guides"');
  });
});
