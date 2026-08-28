/**
 * cardConstraints.test.ts — telling the model what the plan will refuse
 * about CARDS (oracle log, 2026-08-19; docs/10's parity amendment).
 *
 * A CONSTRAINT ENFORCED BUT UNCOMMUNICATED IS A RETRY LOOP BY DESIGN.
 * Both of these were enforced — at plan time, correctly, by the adapter's
 * own refusals — and stated nowhere:
 *
 * - the model created four cards on a system where a card is a toctree
 *   block this version does not create;
 * - the model moved a top-level card from position 6 to 5 on the same
 *   system, where *"nothing in either mode's prompt says card order is
 *   fixed here"*.
 *
 * Both runs were corpus-scale and both were refused after the money was
 * spent. So the lines ship with the field that produces them, from the
 * ONE producer both consumers already read.
 *
 * BOTH MODES, IDENTICALLY — RETIRED 2026-08-21 (docs/22, Decision 6).
 *
 * The original reason was sound and is now spent: these lines were the
 * same in both modes because "a created card cannot be labeled — every
 * ledger record names a ROW, so creation is not a projectable record
 * kind" (docs/21, Decision 9's addendum), and a mode-dependent framing
 * would have promised a label that did not exist.
 *
 * docs/22 MINTS THAT LABEL. Creation, card order and row order are
 * derived remainder kinds with a badge policy, a checklist remedy and an
 * applyable projection, so the promise is now one the app keeps. The
 * reason retires WITH its cause stated, the same reversal-with-its-cause
 * the streaming amendment performed on the truncation-capture ruling —
 * not quietly rewritten, because the retired reason is what makes the
 * new framing legible.
 *
 * GROUNDED IS UNCHANGED, byte-for-byte, and asserted as a DIFF: the
 * differential workflow's baseline must not move.
 */

import { describe, expect, it } from "vitest";
import { COLLECTION_ADAPTERS } from "@/collections/registry";
import type { CollectionAdapter } from "@/collections/types";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { TocDocument } from "@/model/types";
import {
  buildConstraints,
  constraintPromptLines,
  explicitViolations,
  type RunConstraint,
} from "../constraints";
import { buildOutline, neverEmptyGroups } from "../outline";
import { buildSystemMessage } from "../prompt";
import { nodesNeedTargets } from "../permissions";
import type { ReorganizeOptions, RunMode } from "../contract";

const OPTIONS = (mode: RunMode): ReorganizeOptions => ({
  mode,
  scopeSectionIds: null,
  allowRenames: false,
  allowNewSections: false,
  allowFileMoves: false,
  folderHints: false,
  granularity: "full",
});

const MODES: RunMode[] = ["grounded", "aspirational"];

function fixture(id: string, caps: { createCards: boolean; reorderCards: boolean }) {
  const adapter: CollectionAdapter = {
    id,
    label: id,
    ingests: () => true,
    detect: () => 0,
    reparentMovesFiles: false,
    rootBearing: { sections: true, orphans: true },
    nodesNeedTargets: false,
    ...caps,
    parse: () => ({ doc: doc([]), warnings: [] }),
  };
  return adapter;
}

const asDoc = (formatId: string): TocDocument => ({
  ...doc([section("A", [topic("one")]), section("B", [topic("two")])]),
  formatId,
});

/** Every prompt line this document's constraints produce, for one mode. */
function promptFor(id: string, mode: RunMode): string {
  const d = asDoc(id);
  const options = OPTIONS(mode);
  const { idMap } = buildOutline(d, options);
  return buildConstraints(d, options, idMap)
    .flatMap((c) => constraintPromptLines(c))
    .join("\n");
}

function withAdapter<T>(adapter: CollectionAdapter, run: () => T): T {
  COLLECTION_ADAPTERS.push(adapter);
  try {
    return run();
  } finally {
    COLLECTION_ADAPTERS.pop();
  }
}

describe("the card-creation line, ×2 modes, both sides", () => {
  it("GROUNDED keeps the prohibition, byte-for-byte", () => {
    withAdapter(fixture("cc-false", { createCards: false, reorderCards: true }), () => {
      const prompt = promptFor("cc-false", "grounded");
      expect(prompt).toContain("cannot add a new card");
      expect(prompt).toContain("never create one");
    });
  });

  it("ASPIRATIONAL reframes it as a permission with a consequence", () => {
    // ENFORCEMENT AND COMMUNICATION SHIP TOGETHER, classify-semantics
    // edition: the run may imagine a card, and the sentence says what
    // happens to it — labeled for the user to carry out by hand. Saying
    // "never create one" here would be false of a mode whose whole
    // posture is that the arrangement may exceed the write path.
    withAdapter(fixture("cc-false", { createCards: false, reorderCards: true }), () => {
      const prompt = promptFor("cc-false", "aspirational");
      expect(prompt).not.toContain("never create one");
      expect(prompt).toContain("labeled");
    });
  });

  it("is ABSENT in both modes where it can", () => {
    // THE OTHER SIDE. Asserting only the inclusion leaves "does the line
    // ever go away?" resting on nothing, and a producer that emitted it
    // unconditionally would pass the test above and lie to every other
    // format.
    withAdapter(fixture("cc-true", { createCards: true, reorderCards: true }), () => {
      for (const mode of MODES) {
        expect(promptFor("cc-true", mode), mode).not.toContain("cannot add a new card");
      }
    });
  });
});

describe("the card-order line, ×2 modes, both sides", () => {
  it("GROUNDED keeps the prohibition, byte-for-byte", () => {
    withAdapter(fixture("ro-false", { createCards: true, reorderCards: false }), () => {
      expect(promptFor("ro-false", "grounded")).toContain(
        "Keep the top-level cards in the order they appear",
      );
    });
  });

  it("ASPIRATIONAL reframes it as a permission with a consequence", () => {
    withAdapter(fixture("ro-false", { createCards: true, reorderCards: false }), () => {
      const prompt = promptFor("ro-false", "aspirational");
      expect(prompt).not.toContain("Keep the top-level cards in the order they appear");
      expect(prompt).toContain("labeled");
    });
  });

  it("is ABSENT in both modes where it can", () => {
    withAdapter(fixture("ro-true", { createCards: true, reorderCards: true }), () => {
      for (const mode of MODES) {
        expect(promptFor("ro-true", mode), mode).not.toContain(
          "Keep the top-level cards in the order they appear",
        );
      }
    });
  });
});

describe("the two lines are independent — one field each", () => {
  it("says only what THIS adapter cannot do", () => {
    // Two facts, never one flag: a system that creates cards happily may
    // still have no cross-card order to write (Hugo is exactly that), and
    // a single `structuralEdits` would force one sentence to stand in for
    // two different refusals.
    withAdapter(fixture("split", { createCards: true, reorderCards: false }), () => {
      const prompt = promptFor("split", "grounded");
      expect(prompt).not.toContain("cannot add a new card");
      expect(prompt).toContain("Keep the top-level cards in the order they appear");
    });
  });
});

describe("the pre-check declines to judge, and says why at the clause", () => {
  it("returns no violations for either card constraint", () => {
    /**
     * SOUND, NOT COMPLETE, and here deliberately EMPTY. `explicitViolations`
     * exists to make a violation reachable by the ONE guided retry, and a
     * retry is worth spending only where the alternative is a discard.
     * Neither of these is: `validate.ts` accepts a created or reordered
     * card, and the refusal arrives later, at plan time. Spending the
     * retry here would buy a second call for an answer the validator was
     * going to open anyway.
     *
     * It falls out of the exhaustive switch rather than being a special
     * case somewhere upstream — the same shape as the pinned arm in
     * aspirational mode.
     */
    withAdapter(fixture("no-check", { createCards: false, reorderCards: false }), () => {
      const d = asDoc("no-check");
      const options = OPTIONS("grounded");
      const { idMap } = buildOutline(d, options);
      for (const constraint of buildConstraints(d, options, idMap)) {
        if (constraint.kind !== "create-cards" && constraint.kind !== "reorder-cards") {
          continue;
        }
        expect(explicitViolations(constraint, [], idMap, d)).toEqual([]);
      }
    });
  });
});

describe("THE PAYLOAD DIFF — these lines, and nothing else", () => {
  /**
   * ASSERTED AS A DIFFERENCE, not as a shape (the streaming amendment's
   * discipline). "Grounded is byte-stable" was docs/21's fence and this
   * arc amends it deliberately: a capability-FALSE adapter's grounded
   * payload MUST change, because the whole point is telling the model
   * something it was never told. What must not change is everything
   * else — so the message is built twice, with and without the two new
   * members, and the difference is read off rather than described.
   */
  function messageFor(
    d: TocDocument,
    mode: RunMode,
    keep: (c: RunConstraint) => boolean,
  ) {
    const options = OPTIONS(mode);
    const outline = buildOutline(d, options);
    const constraints = buildConstraints(d, options, outline.idMap).filter(keep);
    return buildSystemMessage(
      options,
      false,
      neverEmptyGroups(d, outline.idMap),
      constraints,
      nodesNeedTargets(d),
    );
  }

  const withoutCards = (c: RunConstraint) =>
    c.kind !== "create-cards" && c.kind !== "reorder-cards";
  const all = () => true;

  /** Lines present in `after` and absent from `before`, in order. */
  function added(before: string, after: string): string[] {
    const seen = new Set(before.split("\n"));
    return after.split("\n").filter((line) => !seen.has(line));
  }

  it("GROUNDED adds EXACTLY the two blocks the parity arc shipped", () => {
    // THE BASELINE THAT MUST NOT MOVE. Quoted verbatim: if a word of the
    // grounded rendering changes, the differential workflow is comparing
    // two runs of two different requests.
    withAdapter(
      fixture("diff-false", { createCards: false, reorderCards: false }),
      () => {
        const d = asDoc("diff-false");
        const diff = added(
          messageFor(d, "grounded", withoutCards),
          messageFor(d, "grounded", all),
        );
        expect(diff).toEqual([
          "- This documentation system cannot add a new card to its",
          "  navigation, so never create one. Rearrange within the cards",
          "  that already exist.",
          "- Keep the top-level cards in the order they appear in the",
          "  outline. This system writes their order in the source file's",
          "  own layout, which it does not rewrite — moving the pages",
          "  between cards is what changes the structure here.",
        ]);
      },
    );
  });

  it("ASPIRATIONAL adds EXACTLY the two reframed blocks — the delta, read off", () => {
    withAdapter(
      fixture("diff-false", { createCards: false, reorderCards: false }),
      () => {
        const d = asDoc("diff-false");
        const diff = added(
          messageFor(d, "aspirational", withoutCards),
          messageFor(d, "aspirational", all),
        );
        expect(diff).toEqual([
          "- This documentation system cannot add a new card to its",
          "  navigation, but you MAY create one when the arrangement calls",
          "  for it: each new card will be labeled for the user to carry",
          "  out by hand.",
          "- This system writes the top-level card order in the source",
          "  file's own layout, which it does not rewrite — but you MAY",
          "  reorder them when the arrangement calls for it: the new order",
          "  will be labeled for the user to carry out by hand.",
        ]);
      },
    );
  });

  it("the two renderings DIFFER — the reframing is not a no-op", () => {
    // A mode field that changed nothing would pass both assertions above
    // if the two texts happened to coincide. They must not.
    withAdapter(
      fixture("diff-false", { createCards: false, reorderCards: false }),
      () => {
        const d = asDoc("diff-false");
        expect(messageFor(d, "aspirational", all)).not.toBe(
          messageFor(d, "grounded", all),
        );
      },
    );
  });

  it("adds NOTHING for a capability-true adapter, both modes", () => {
    // The differential workflow's baseline: a grounded run on every
    // format that CAN do these things is byte-identical to what the
    // parity arc shipped.
    withAdapter(fixture("diff-true", { createCards: true, reorderCards: true }), () => {
      for (const mode of MODES) {
        const d = asDoc("diff-true");
        expect(messageFor(d, mode, all), mode).toBe(messageFor(d, mode, withoutCards));
      }
    });
  });

  it("leaves the NON-PROMPT payload untouched — the outline is not a constraint", () => {
    // The lines land in the system message and nowhere else. If a card
    // constraint ever reached the outline serializer, every row's token
    // cost would move and the measured table in docs/10 would silently
    // stop describing the shipped payload.
    const capable = fixture("payload-true", { createCards: true, reorderCards: true });
    const refusing = fixture("payload-false", {
      createCards: false,
      reorderCards: false,
    });
    const outlineOf = (id: string) => {
      const o = buildOutline(asDoc(id), OPTIONS("grounded"));
      return { text: o.text, ids: [...o.idMap.keys()], context: o.contextLine };
    };
    const a = withAdapter(capable, () => outlineOf("payload-true"));
    const b = withAdapter(refusing, () => outlineOf("payload-false"));
    expect(b).toEqual(a);
  });
});

describe("the SHIPPED adapters, not only fixtures", () => {
  /**
   * The tests above drive fixture adapters, which is what makes them
   * about the mechanism. This one drives the real registry, because a
   * mechanism wired correctly to nothing is the failure those tests
   * cannot see — and the walls this arc closes were on real corpora.
   */
  it("tells a Sphinx run both facts, in both modes — framed by mode", () => {
    // BOTH FACTS IN BOTH MODES; only the FRAMING moves. The shared half
    // of each sentence is the fact ("cannot add a new card", "writes the
    // top-level card order in the source file's own layout"), and it is
    // present either way — which is what "the model is told every
    // constraint the layer below enforces" means.
    for (const mode of MODES) {
      const prompt = promptFor("sphinx", mode);
      expect(prompt, mode).toContain("cannot add a new card");
      expect(prompt, mode).toMatch(/order (they appear|in the source)/);
    }
    expect(promptFor("sphinx", "grounded")).toContain("never create one");
    expect(promptFor("sphinx", "aspirational")).toContain("labeled");
  });

  it("tells a Hugo run only the order fact — it creates cards happily", () => {
    // The minimal pair against the shipped registry: same two lines, one
    // adapter that can do one of the two things.
    for (const mode of MODES) {
      const prompt = promptFor("hugo", mode);
      expect(prompt, mode).not.toContain("cannot add a new card");
      expect(prompt, mode).toMatch(/order (they appear|in the source)/);
    }
  });

  it("tells a whole-file format neither", () => {
    for (const id of ["mkdocs", "docfx", "mintlify"]) {
      const prompt = promptFor(id, "grounded");
      expect(prompt, id).not.toContain("cannot add a new card");
      expect(prompt, id).not.toContain(
        "Keep the top-level cards in the order they appear",
      );
    }
  });
});
