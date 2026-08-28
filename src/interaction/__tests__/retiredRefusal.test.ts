/**
 * FENCE 12 — `pinned-to-card` IS GONE, asserted on the CONSTRUCTION
 * (docs/22, Decision 7).
 *
 * A FENCE WITHOUT A TEST IS A REQUEST, and this one guards a capability
 * FLIP: every refusal sentence is a claim about what the build can do,
 * so a stale one is a lie told to the person least able to check it. The
 * code compiles either way and no test fails, because a message is data.
 *
 * ON THE CONSTRUCTION, NEVER ON VOCABULARY — the rule this project
 * learned three times in one session. A scan for the bare words
 * "pinned to card" would flag the prose that EXPLAINS the retirement,
 * including this docblock, and a fence that fails on its own explanation
 * is one people learn to disable. So the assertions are:
 *
 *  1. the discriminant is not a member of the union — checked by
 *     exhausting the union at the type level and at runtime, so a
 *     resurrected member fails `pnpm check` here before it fails
 *     anything else;
 *  2. no sentence the union can produce carries the retired copy —
 *     checked over the whole OUTPUT SPACE rather than over one fixture's
 *     answer, because a fixture pins one path and the clause could
 *     return in any other;
 *  3. the shipped source contains no `return "pinned-to-card"` — a
 *     construction, not a word.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { refusalSentence } from "../moveLabel";
import type { TopicMoveRefusal } from "@/commands/guards";
import type { TocDocument } from "@/model/types";

/**
 * THE UNION, EXHAUSTED. This array is checked against the type by
 * construction: `satisfies` makes a missing member a compile error and
 * an extra one a compile error too, so it cannot drift from the union it
 * claims to enumerate.
 */
const EVERY_REASON = [
  "capability",
  "leaf-bundle",
  "path-collision",
  "subsection",
  "no-nav-list",
  "unhoused-species",
] as const satisfies readonly TopicMoveRefusal[];

/** Every phrase the retired clause used to put on screen. */
const RETIRED = [
  "quietly lose the pin",
  "no way yet to label that as an imagined move",
  "a pinned row can move between cards",
  "a card can't carry a pin",
];

describe("the retired refusal cannot be reached, said, or resurrected", () => {
  it("the union has no member for it, and the enumeration cannot drift", () => {
    // A resurrected member would fail the `satisfies` above at
    // `pnpm check`. At runtime, the count is the second half: an
    // enumeration that silently shrank would pass a per-member loop.
    expect(EVERY_REASON).toHaveLength(6);
    expect(EVERY_REASON).not.toContain("pinned-to-card");
  });

  it("no sentence in the whole output space carries the retired copy", () => {
    for (const reason of EVERY_REASON) {
      const sentence = refusalSentence(reason);
      for (const phrase of RETIRED) {
        expect(sentence, `${reason} still says "${phrase}"`).not.toContain(phrase);
      }
    }
  });

  it("nothing in the shipped source RETURNS the retired discriminant", () => {
    // The construction, not the word: this file names the discriminant
    // several times in prose above and stays green, which is exactly the
    // property that keeps the fence from being disabled.
    for (const path of [
      "src/commands/guards.ts",
      "src/interaction/moveLabel.ts",
      "src/interaction/topicDrag.ts",
      "src/view/canvas/rowMenu.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/return\s+"pinned-to-card"/);
      expect(source, path).not.toMatch(/case\s+"pinned-to-card"/);
    }
  });
});

describe("the refusal CONTEXT reaches the sentence that needs it", () => {
  /**
   * REGRESSION. `topicDrag.ts` composed the unhoused sentence's context
   * behind `if (reason !== "unhoused-birth")`, and the discriminant was
   * renamed to `unhoused-species` when the same fact started refusing a
   * second gesture. Nothing failed: the comparison simply never matched,
   * the context arrived `undefined`, and the sentence degraded to the
   * general fact — still TRUE, and no longer naming the lanes that bear
   * the card, which is the half a user can act on.
   *
   * The cause is the parameter's TYPE. A `reason: string` cannot be
   * checked, so a rename that touches every typed site leaves the
   * stringly-typed one behind. Asserted here on the OUTPUT — the two
   * sentences are distinguishable, which is what makes the degradation
   * observable at all.
   */
  it("names the lanes when the context is supplied, and does not when it is not", () => {
    const doc: TocDocument = {
      id: "d",
      name: "d",
      formatId: "mintlify",
      sections: [],
      containers: [
        {
          chainKey: "",
          label: "Top level",
          order: 0,
          accepts: { sections: false, orphans: false },
          mayEmpty: true,
        },
        {
          chainKey: "Guides",
          label: "Guides",
          order: 1,
          accepts: { sections: true, orphans: false },
          mayEmpty: true,
        },
      ],
    };
    const withCtx = refusalSentence("unhoused-species", {
      doc,
      chain: [],
      wants: "section",
    });
    expect(withCtx).toContain('"Guides"');
    expect(withCtx).toContain("holds containers only");

    const without = refusalSentence("unhoused-species");
    expect(without).not.toContain('"Guides"');
    // Still a true sentence, which is why the degradation was silent.
    expect(without).toContain("nowhere to live");
  });
});
