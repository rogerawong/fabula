/**
 * rowMenu.test.ts — what the row context menu may offer a selection that
 * holds a pinned row.
 *
 * A NEW INPUT SPECIES OBLIGATES A CONSUMER SWEEP. Arc 2 makes a pinned
 * row SELECTABLE — it has to, because the seam counts "2 of the 5 rows
 * in this move are pinned" and a selection is how five rows become one
 * gesture. Every consumer of a topic selection therefore owes an answer
 * for the new case, and the row menu is one.
 *
 * IT ALSO CLOSES A DEFECT THAT WAS ALREADY THERE (regression D1, arc 2).
 * Box select has never filtered locked rows (`boxSelect.ts` hits every
 * `[data-topic-row]`), so a rubber band over a pinned row followed by a
 * right-click on an unpinned one offered "Remove 2 topics" — and removed
 * both. The keyboard path guards exactly this (`useKeyboard.ts`: "a
 * locked topic in the selection cancels the delete outright") and the
 * menu did not: one rule, two consumers, one of them disagreeing. That
 * is the shape that once let the sidebar commit the move the canvas refused.
 *
 * DELETION IS NOT DISPLACEMENT, and no mode or tab state changes that:
 * `Topic.lock`'s contract is that a locked node "cannot be dragged,
 * deleted or renamed", and Decision 9 lifts exactly one of those three.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { TocDocument, Topic } from "@/model/types";
import { rowMenuRefusals } from "../rowMenu";
import { refusalSentence } from "@/interaction/moveLabel";
import type { TopicMoveRefusal } from "@/commands/guards";

function fixture(): { d: TocDocument; plain: Topic; pinned: Topic } {
  const d = doc([section("Guides", [topic("Intro")]), section("Tutorials", [])]);
  const pinned: Topic = { ...topic("Installing"), lock: { kind: "outside-region" } };
  d.sections[0]!.topics.push(pinned);
  return { d, plain: d.sections[0]!.topics[0]!, pinned };
}

describe("removing rows", () => {
  it("offers Remove for an ordinary selection", () => {
    const { d, plain } = fixture();
    expect(rowMenuRefusals(d, [plain.id]).remove).toBeUndefined();
  });

  it("refuses Remove when the selection holds a pinned row, with a reason", () => {
    const { d, pinned } = fixture();
    const reason = rowMenuRefusals(d, [pinned.id]).remove;
    expect(reason).toBeDefined();
    expect(reason).toContain("pinned");
  });

  it("refuses Remove for a MIXED selection — the box-select defect", () => {
    // The whole gesture is refused rather than quietly narrowed to the
    // unpinned rows: a partial delete is a silent downgrade, and the
    // keyboard path refuses outright for the same reason.
    const { d, plain, pinned } = fixture();
    expect(rowMenuRefusals(d, [plain.id, pinned.id]).remove).toBeDefined();
  });
});

describe("moving rows to a new card", () => {
  it("offers it for an ordinary selection", () => {
    const { d, plain } = fixture();
    expect(rowMenuRefusals(d, [plain.id]).moveToNewCard).toBeUndefined();
  });

  it("OFFERS it for a pinned row, which it used to refuse", () => {
    /**
     * `pinned-to-card` RETIRED with docs/22 arc 2 (OR-5c). This test
     * used to assert the refusal and its sentence; the refusal's own
     * stated reason — that promotion erases the pin and leaves a
     * displacement nothing can name — is now false by construction,
     * because a pinned entry is WRAPPED (or, childless, births the
     * standalone) and the entry stays a row with its lock intact.
     *
     * Not a second rule here either: `guards.ts` still answers, and the
     * menu still asks it exactly as the executor does.
     */
    const { d, pinned } = fixture();
    expect(rowMenuRefusals(d, [pinned.id]).moveToNewCard).toBeUndefined();
  });

  it("the retired sentence is GONE — no branch may still be saying it", () => {
    /**
     * A CAPABILITY FLIP OBLIGATES A COPY SWEEP: every refusal sentence
     * is a claim about what the build can do, and a stale one is a lie
     * told to the person least able to check it. Asserted as an ABSENCE
     * over the whole `TopicMoveRefusal` union rather than over one
     * fixture's answer, because a fixture pins one path and the retired
     * clause could return in any other.
     *
     * ON THE CONSTRUCTION, not on vocabulary: the union is the exhaustive
     * list of things this function can say, so walking it is the whole
     * output space.
     */
    const reasons: TopicMoveRefusal[] = [
      "capability",
      "leaf-bundle",
      "path-collision",
      "subsection",
      "no-nav-list",
      "unhoused-species",
    ];
    for (const reason of reasons) {
      const sentence = refusalSentence(reason);
      expect(sentence, reason).not.toContain("quietly lose the pin");
      expect(sentence, reason).not.toContain("imagined move");
      expect(sentence, reason).not.toContain("a card can't carry a pin");
    }
  });

  it("still refuses a birth with nowhere to live, so the menu cannot offer what the command refuses", () => {
    // The menu that offers what the command refuses is how the sidebar once
    // committed the move the canvas would not — so the position travels
    // with the question.
    const { d, plain } = fixture();
    const homeless: TocDocument = {
      ...d,
      containers: [
        {
          chainKey: "",
          label: "Top level",
          order: 0,
          accepts: { sections: false, orphans: false },
          mayEmpty: true,
        },
      ],
    };
    const reason = rowMenuRefusals(homeless, [plain.id], {
      columnIds: [],
      cardIndex: 0,
    }).moveToNewCard;
    expect(reason).toBeDefined();
    expect(reason).toContain("holds containers only");
  });
});
