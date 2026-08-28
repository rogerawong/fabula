/**
 * cardMenu.ts — which SPECIES COMMANDS a card may have, and why not
 * (docs/22, Decision 2's explicit species commands).
 *
 * PURE, so both its rules are unit-testable: a rule living inside a menu
 * component is a rule only e2e can check (the `moveLabel.ts` precedent,
 * and `rowMenu.ts`'s beside it).
 *
 * THE RULE IS `guards.ts`', NOT THIS FILE'S. Nothing here re-derives
 * anything: `addHeadingRefusal` and `removeHeadingRefusal` answer, the
 * executor asks the same two functions, and this file only supplies the
 * sentences — which had no home, because until now no card command had
 * a refusal to explain.
 *
 * EVERY SENTENCE NAMES A PATH WHERE ONE EXISTS (docs/18's rule). The
 * multi-entry refusal names the split-by-drag gesture, in the same words
 * the AI validator uses for a nested section; the path-bearing refusal
 * names none, deliberately, because there is no way to remove that
 * heading that is not deleting the page.
 */

import {
  addHeadingRefusal,
  removeHeadingRefusal,
  type HeadingRefusal,
} from "@/commands/guards";
import { containersInOrder } from "@/model/containers";
import type { Section, TocDocument } from "@/model/types";

export interface CardMenuRefusals {
  /** Present ⇒ "Add heading" is disabled, and this says why. */
  addHeading?: string;
  /** Present ⇒ "Remove heading" is disabled, and this says why. */
  removeHeading?: string;
}

/**
 * The sentence for one refusal.
 *
 * `wants` is the species the command would PRODUCE, which is what the
 * unhoused sentence names homes for: offering section lanes to a
 * standalone would be advice that produces this same refusal again.
 */
function sentence(
  reason: HeadingRefusal,
  doc: TocDocument,
  wants: "standalone" | "section",
): string {
  switch (reason) {
    case "not-standalone":
      return "This card already has a heading.";
    case "not-a-section":
      return "This card has no heading — it is its entry.";
    case "path-bearing":
      // THE RULED COPY (docs/22, Decision 2). No path is offered because
      // none exists: the face is an ENTRY, and the only way to remove it
      // is to delete the page.
      return "This card's heading is the page itself, not a label — there is nothing to remove without deleting the page.";
    case "multi-entry":
      // OR-2, adopted: the dissolve-into-standalones alternative was
      // declined at gate as a bulk destructive gesture with N placement
      // decisions nobody made. So the sentence names the gesture that
      // does exist.
      return "A heading with several entries under it is a section; to break it up, drag its entries out.";
    case "unhoused-species": {
      const homes = containersInOrder(doc)
        .filter((c) => (wants === "standalone" ? c.accepts.orphans : c.accepts.sections))
        .map((c) => `"${c.label}"`);
      const what = wants === "standalone" ? "a standalone entry" : "a heading";
      return homes.length > 0
        ? `This lane holds no ${what === "a heading" ? "sections" : "standalone entries"} — move the card to ${homes.slice(0, 2).join(" or ")} first.`
        : `Nothing in this navigation holds ${what}, so there is nowhere for the result to live.`;
    }
  }
}

export function cardMenuRefusals(doc: TocDocument, section: Section): CardMenuRefusals {
  const out: CardMenuRefusals = {};
  const add = addHeadingRefusal(doc, section);
  if (add !== null) out.addHeading = sentence(add, doc, "section");
  const remove = removeHeadingRefusal(doc, section);
  if (remove !== null) {
    // The species the removal would produce — what the entry dictates.
    const wants =
      (section.topics[0]?.children.length ?? 0) === 0 ? "standalone" : "section";
    out.removeHeading = sentence(remove, doc, wants);
  }
  return out;
}
