/**
 * scopeNotice.ts — what the dialog says about a document that can barely
 * be reorganized (docs/21 Decision 8; extended by docs/22 Decision 8).
 *
 * DISABLED-WITH-A-REASON IS THE WRONG SEAM, and it stays wrong for the
 * reason it was wrong the first time: grounded is not useless on such a
 * corpus. Within-card reorder of unfrozen rows is real work, and
 * docs/19's blast-radius measurement is the receipt — refusing to run
 * would freeze 5 of the kernel's 8 cards and make cpython entirely
 * un-reorganizable, since it has one card and that card holds a locked
 * row. So the dialog STATES the situation and runs anyway.
 *
 * ONE SENTENCE, NOT A SECOND NOTICE. A separate panel for the card
 * capabilities would be a second thing to read about one situation, and
 * the situation is what the user is deciding about.
 *
 * Pure and out of the component so the sentence is testable, the way
 * `reviewHeadline` and `aspirationalSplitText` are.
 */

export function scopeNoticeText(state: {
  /** Every row the run could name is pinned by the source. */
  entirelyPinned: boolean;
  createCards: boolean;
  reorderCards: boolean;
}): string | null {
  // THE CARD CAPABILITIES ALONE ARE NOT THIS NOTICE'S SUBJECT. Moving
  // rows between existing cards is exactly what a run on such a document
  // is for, and a notice about it would cry wolf on ordinary work.
  if (!state.entirelyPinned) return null;

  const cannot: string[] = [];
  if (!state.createCards) cannot.push("add a card");
  if (!state.reorderCards) cannot.push("record a card order");

  const head = "Every row in scope is pinned.";
  const tail = "Aspirational proposes freely and hands you the changes as a checklist.";
  if (cannot.length === 0) {
    return `${head} A Grounded run can only reorder within sections; ${tail}`;
  }
  // TWO FACTS, NEVER ONE FLAG (the `createCards`/`reorderCards` split):
  // a system that adds cards happily may still have no cross-card order
  // to write, and naming the wrong one would be a sentence the user
  // cannot check against what they see.
  return (
    `${head} This system also cannot ${cannot.join(" or ")}, so a Grounded run ` +
    `can only reorder within sections. ${tail}`
  );
}
