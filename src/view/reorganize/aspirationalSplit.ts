/**
 * aspirationalSplit.ts — the result view's one-line split, as a sentence
 * with stated units (docs/21, Decision 3; Ruling A, 2026-08-19).
 *
 * THE SPLIT, SAID BEFORE THE TAB OPENS. The no-silent-downgrade
 * constraint is met at the EARLIEST surface rather than first at Review:
 * a user about to accept an aspirational proposal learns here how much of
 * it the app can write.
 *
 * TWO NUMBERS, NEVER ONE. "The app cannot write this" and "you have not
 * agreed to write this" have different remedies, and summing them would
 * blame the format for a choice nobody has made yet.
 *
 * AND EACH NUMBER SAYS WHAT IT COUNTS. This one counts ROWS — one record
 * per displaced row, written by reconstruction. Review's checklist counts
 * ITEMS, and its items are not all rows (an emptied container earns a
 * line of its own). Printed as bare integers the two look like the same
 * measurement gone wrong, which is what a live run showed; with their
 * units they read as the two different questions they are.
 *
 * AND A SECOND HALF, docs/22: structure the app cannot RECORD, beside
 * rows it will not MOVE. The two are separated by a semicolon rather
 * than folded into one list because they answer different questions and
 * have different remedies — a row goes home, a card has to be written
 * into the source by hand.
 *
 * A CARD ORDER IS NAMED, NEVER COUNTED. A permutation is one fact
 * however many cards moved, and "3 card orders" would be a count of
 * something that does not come in threes.
 *
 * Pure and out of the component so the sentence is testable, the way
 * `reviewHeadline` is.
 */

export function aspirationalSplitText(split: {
  moves: number;
  needsHand: number;
  needsConsent: number;
  /**
   * The structure report's counts. ABSENT MEANS NOT MEASURED — a caller
   * with no report gets exactly the shipped sentence, which is what
   * keeps this an extension rather than a replacement.
   */
  structural?: {
    createdCards: number;
    cardOrderChanged: boolean;
    frozenBlocks: number;
  };
}): string {
  const writable = split.moves - split.needsHand - split.needsConsent;
  const parts = [
    `${split.moves} move${split.moves === 1 ? "" : "s"} — ${writable} the app can write`,
  ];
  if (split.needsHand > 0) {
    parts.push(
      `${split.needsHand} row${split.needsHand === 1 ? " needs" : "s need"} your hand`,
    );
  }
  if (split.needsConsent > 0) {
    parts.push(
      `${split.needsConsent} row${
        split.needsConsent === 1 ? " needs" : "s need"
      } your consent to write`,
    );
  }
  const sentence = parts.join(", ");

  const structural = split.structural;
  if (!structural) return sentence;
  const owed: string[] = [];
  if (structural.createdCards > 0) {
    owed.push(
      `${structural.createdCards} created card${structural.createdCards === 1 ? "" : "s"}`,
    );
  }
  if (structural.cardOrderChanged) owed.push("the card order");
  if (structural.frozenBlocks > 0) {
    owed.push(
      `${structural.frozenBlocks} frozen block${structural.frozenBlocks === 1 ? "" : "s"}`,
    );
  }
  if (owed.length === 0) return sentence;
  // AT REVIEW, said here: this clause is about what happens at the apply
  // surface, and naming where keeps it from reading as a refusal now.
  const subject =
    owed.length === 1
      ? owed[0]!
      : `${owed.slice(0, -1).join(", ")} and ${owed[owed.length - 1]!}`;
  const verb = owed.length === 1 && !structural.cardOrderChanged ? "needs" : "need";
  return `${sentence}; ${subject} ${verb} your hand at Review`;
}
