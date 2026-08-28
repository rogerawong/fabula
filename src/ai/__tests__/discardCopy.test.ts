/**
 * discardCopy.test.ts — what the multiset discard SAYS (oracle log,
 * 2026-08-19, the aspirational full-granularity entry).
 *
 * THE LIVE ENTRY, in its own words: *"The discard copy … called it 'a bug
 * on our side' and advised retrying — a misattribution, since the honest
 * surface here is the omission count and a coarser granularity."*
 *
 * Both halves of that sentence were wrong in the expensive direction. "A
 * bug on our side" sends the user to file a report about working code,
 * and "please try again" sends them to spend the same money on the same
 * request at the same granularity — the one action guaranteed to
 * reproduce the failure. The net itself was right; only the sentence was
 * lying.
 *
 * ## One premise, measured and corrected
 *
 * An OMISSION does not reach this net at all. Reconstruction RECOVERS
 * omitted topics into their original sections by design, and all three
 * omission shapes were driven through the real path to check it: a
 * dropped row, a dropped row with both cards listed, and a card listed
 * with no children at all. Every one returned the document whole. What
 * trips the multiset net is a DUPLICATE.
 *
 * So the copy is written per CASE from the numbers at the throw site
 * rather than as one apology, and the tests below say which branch is
 * reachable through the shipped path and which is not — an instrument
 * that accepts is not an instrument that checks, and a branch tested only
 * as a pure function must not be reported as covered end to end.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { TocDocument } from "@/model/types";
import { AiError, type ReorganizeOptions, type ResultNode } from "../contract";
import { buildOutline } from "../outline";
import { multisetDiscardMessage, reconstructDocument } from "../validate";

const OPTIONS: ReorganizeOptions = {
  mode: "grounded",
  scopeSectionIds: null,
  allowRenames: false,
  allowNewSections: false,
  allowFileMoves: false,
  folderHints: false,
  granularity: "full",
};

/** One card, five rows — small enough to read, big enough to drop from. */
const corpus = (): TocDocument =>
  doc([
    section(
      "Guide",
      ["one", "two", "three", "four", "five"].map((t) => topic(t)),
    ),
  ]);

/**
 * Reconstruct, and return the AiError message it threw.
 *
 * THE INSTRUMENT REPORTS ITS OWN HEALTH: anything that is not an
 * `AiError` is a harness fault rather than a discard, and it rethrows
 * instead of handing a stringified TypeError to a `.not.toContain`
 * assertion that would then pass for the wrong reason. The first draft of
 * this helper did exactly that.
 */
function discardMessage(d: TocDocument, nodes: ResultNode[]): string | null {
  try {
    reconstructDocument({
      doc: d,
      nodes,
      idMap: buildOutline(d, OPTIONS).idMap,
      options: OPTIONS,
    });
    return null;
  } catch (err) {
    if (err instanceof AiError) return err.message;
    throw err;
  }
}

describe("through the shipped path: a duplicate is reported as a duplicate", () => {
  const duplicated: ResultNode[] = [
    { id: "s1", children: ["t1", "t1", "t2", "t3", "t4", "t5"].map((id) => ({ id })) },
  ];

  it("still discards — the net is unchanged, only the sentence moved", () => {
    // Stated first: a copy test whose scenario stopped throwing would
    // pass every prohibition below while asserting nothing.
    expect(discardMessage(corpus(), duplicated)).not.toBeNull();
  });

  it("says a row was listed twice, and how many times over", () => {
    expect(discardMessage(corpus(), duplicated)!).toContain("1 row twice");
  });

  it("does NOT report it as an omission", () => {
    // A count of missing rows would be zero here, and printing that
    // would be a number lying by omission.
    expect(discardMessage(corpus(), duplicated)!).not.toContain("left out");
  });

  it("does NOT blame the app, and does NOT advise a plain retry", () => {
    /**
     * THE PROHIBITION SIDE, and it is the half that was wrong. Asserting
     * only the new sentence would leave the retired phrases free to
     * return in some other branch with nothing contradicting them — and
     * these two cost a real corpus-scale call the last time they shipped.
     */
    const message = discardMessage(corpus(), duplicated)!;
    expect(message).not.toContain("a bug on our side");
    expect(message).not.toContain("try again");
  });

  it("names the remedy that changes the outcome", () => {
    // Coarser granularity is the action that makes the same request fit
    // in the answer; "try again" is the action guaranteed to reproduce
    // the failure.
    expect(discardMessage(corpus(), duplicated)!.toLowerCase()).toContain("granularity");
  });
});

describe("the omission branch — pure-function only, and this says so", () => {
  /**
   * NOT REACHABLE THROUGH RECONSTRUCTION TODAY, measured rather than
   * assumed (see the docblock). The branch exists because the net's
   * comparison genuinely admits it — `after` shorter than `before` is one
   * of the three ways the invariant can fail — and because a sentence
   * that described a duplication as an omission is exactly the conflation
   * this fix is about. Tested where it can honestly be tested.
   */
  it("states how many rows went missing, and out of how many", () => {
    // A number the user can check, with its denominator: the house rule
    // for publishing a measurement.
    expect(multisetDiscardMessage(["a", "b", "c", "d", "e"], ["a", "b"])).toContain(
      "left out 3 of the 5",
    );
  });

  it("keeps the two cases in two sentences", () => {
    const missing = multisetDiscardMessage(["a", "b", "c"], ["a"]);
    const twice = multisetDiscardMessage(["a", "b"], ["a", "a", "b"]);
    expect(missing).toContain("left out");
    expect(missing).not.toContain("twice");
    expect(twice).toContain("twice");
    expect(twice).not.toContain("left out");
  });

  it("falls back to a general sentence when it is neither", () => {
    // A guard consumes DECLARED inputs: where the numbers do not say
    // which failure it was, the copy states the fact it has rather than
    // inventing a count.
    //
    // The genuinely-neither shape is an EXTRA id, and finding it took a
    // correction: `(["a","b"], ["a","c"])` looks like neither and is an
    // omission — "b" really was left out — so the first draft of this
    // test asserted the wrong sentence and the code was right.
    const message = multisetDiscardMessage(["a"], ["a", "b"]);
    expect(message).toContain("could not be verified");
    expect(message).not.toContain("left out");
    expect(message).not.toContain("twice");
    expect(message).not.toContain("a bug on our side");
  });
});
