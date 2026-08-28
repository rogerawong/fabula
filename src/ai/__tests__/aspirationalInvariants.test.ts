/**
 * aspirationalInvariants.test.ts — what imagination never licenses
 * (docs/21, Decision 6 and the fence list).
 *
 * THE MULTISET NET IS A PROPOSAL-CONSTRAINT, binding in both modes and
 * for a reason no badge can answer: a dropped topic is a lost BRANCH,
 * which is the shape-fidelity law's exact failure (PRODUCT.md principle
 * 6). A limit may cost detail, never shape — and an arrangement missing
 * a subtree leaves the reader confidently wrong rather than merely with
 * less.
 *
 * SO THE SAME CORPUS RUNS THROUGH BOTH MODES and must be accepted or
 * rejected identically on multiset grounds. The mode changes what is
 * CLASSIFIED; it never changes what is CONTENT-SAFE.
 *
 * The corpus is generated rather than enumerated, because the failures
 * this guards against are the ones nobody thought to write down: a
 * response that lists an id twice, one that drops a subtree, one that
 * places a node under its own descendant.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { TocDocument, Topic } from "@/model/types";
import { recordedLedger } from "@/model/ledger";
import {
  AiError,
  type ReorganizeOptions,
  type ResultNode,
  type RunMode,
} from "../contract";
import { buildOutline } from "../outline";
import { reconstructDocument } from "../validate";

const OPTIONS = (mode: RunMode): ReorganizeOptions => ({
  mode,
  scopeSectionIds: null,
  allowRenames: false,
  allowNewSections: false,
  allowFileMoves: false,
  folderHints: false,
  granularity: "full",
});

/** Two cards, five rows, two of them pinned — enough shape for a
 *  proposal to break in the ways that matter. */
function corpus(): TocDocument {
  const pin = (t: Topic): Topic => ({ ...t, lock: { kind: "outside-region" as const } });
  return doc([
    section("Guides", [pin(topic("Early")), topic("Middle"), pin(topic("Late"))]),
    section("Reference", [topic("API"), topic("CLI")]),
  ]);
}

/**
 * A response outline, from a seed: a permutation of the known ids, with
 * a chance of the two content-unsafe moves — dropping an id, or listing
 * one twice.
 */
function proposalFrom(ids: string[], seed: number): ResultNode[] {
  const rnd = (() => {
    let x = seed >>> 0 || 1;
    return () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      return x;
    };
  })();
  const topics = ids.filter((id) => id.startsWith("t"));
  const sections = ids.filter((id) => id.startsWith("s"));
  const shuffled = [...topics];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rnd() % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const mode = rnd() % 3;
  // 0: faithful permutation · 1: DROP one · 2: DUPLICATE one
  const rows =
    mode === 1 && shuffled.length > 1
      ? shuffled.slice(1)
      : mode === 2 && shuffled.length > 0
        ? [...shuffled, shuffled[0]!]
        : shuffled;
  const cut = rnd() % (rows.length + 1);
  return [
    { id: sections[0]!, children: rows.slice(0, cut).map((id) => ({ id })) },
    { id: sections[1]!, children: rows.slice(cut).map((id) => ({ id })) },
  ];
}

/** Accepted, or the AiError message that refused it. */
function outcome(d: TocDocument, nodes: ResultNode[], mode: RunMode): string {
  const options = OPTIONS(mode);
  const outline = buildOutline(d, options);
  try {
    const { doc: result } = reconstructDocument({
      doc: d,
      nodes,
      idMap: outline.idMap,
      options,
    });
    return `accepted:${recordedLedger(result).length}`;
  } catch (err) {
    return err instanceof AiError ? `refused:${err.message.slice(0, 40)}` : "threw";
  }
}

describe("the multiset net is mode-independent", () => {
  // HEAVY, NOT SLOW: a fast-check property that reconstructs a whole
  // document twice per case. Measured in the low hundreds of ms; the
  // budget exists because whole-suite parallelism on a loaded machine
  // is what pushes it past the 5s default, not the work itself.
  it(
    "accepts and refuses the same proposals on content-safety grounds in both modes",
    { timeout: 20000 },
    () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 0x7fffffff }), (seed) => {
          const d = corpus();
          const ids = [...buildOutline(d, OPTIONS("grounded")).idMap.keys()];
          const nodes = proposalFrom(ids, seed);

          const grounded = outcome(d, nodes, "grounded");
          const aspirational = outcome(corpus(), nodes, "aspirational");

          // A content-safety refusal is the SAME refusal in both modes.
          // The modes may disagree about a pinned move — that is the
          // whole feature — so the assertion is scoped to the net whose
          // verdict must not move.
          const contentUnsafe = (verdict: string) =>
            verdict.startsWith("refused:The reorganization could not be verified");
          expect(contentUnsafe(aspirational)).toBe(contentUnsafe(grounded));
        }),
      );
    },
  );

  it("refuses a duplicated id in ASPIRATIONAL mode, so the property is not vacuous", () => {
    // A property that never reaches its interesting case is a property
    // about nothing. This is the case, named and driven directly.
    const d = corpus();
    const ids = [...buildOutline(d, OPTIONS("aspirational")).idMap.keys()];
    const topics = ids.filter((id) => id.startsWith("t"));
    const nodes: ResultNode[] = [
      { id: "s1", children: [...topics, topics[0]!].map((id) => ({ id })) },
      { id: "s2", children: [] },
    ];
    expect(outcome(d, nodes, "aspirational")).toMatch(/could not be verified/);
    expect(outcome(d, nodes, "grounded")).toMatch(/could not be verified/);
  });

  it("accepts a pinned move in ASPIRATIONAL and refuses it in GROUNDED", () => {
    // The complement: the modes DO differ, on exactly the net this
    // feature is about. Without this the test above would pass just as
    // happily if the modes were identical.
    const d = corpus();
    const nodes: ResultNode[] = [
      { id: "s1", children: [{ id: "t2" }] },
      { id: "s2", children: [{ id: "t4" }, { id: "t5" }, { id: "t1" }, { id: "t3" }] },
    ];
    expect(outcome(d, nodes, "aspirational")).toBe("accepted:2");
    expect(outcome(corpus(), nodes, "grounded")).toMatch(/refused:/);
  });
});
