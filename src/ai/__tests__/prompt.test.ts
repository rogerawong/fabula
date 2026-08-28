/**
 * prompt.test.ts — The fixed system message.
 *
 * Written with the never-empty-container hotfix, because that fix has
 * two halves and only one of them is enforcement. A constraint the
 * reconstruction rejects on and the prompt never states is a retry loop
 * by design: the model cannot see navigation containers (docs/13), so
 * without these lines it has no way to avoid draining one.
 */

import { describe, expect, it } from "vitest";
import { PINNED_MARKER, type RunConstraint } from "../constraints";
import { buildSystemMessage } from "../prompt";

const REPARENT = (allowed: boolean): RunConstraint[] => [{ kind: "reparent", allowed }];

const OPTS = {
  mode: "grounded" as const,
  allowRenames: false,
  allowNewSections: true,
  allowFileMoves: false,
};

describe("never-empty container constraint", () => {
  it("names the ids the model must keep, per container", () => {
    const msg = buildSystemMessage(
      OPTS,
      false,
      [
        { label: "Documentation", ids: ["s1", "s2"] },
        { label: "API reference", ids: ["s3"] },
      ],
      [],
      false,
    );
    expect(msg).toContain("- Documentation: s1, s2");
    expect(msg).toContain("- API reference: s3");
  });

  it("states the requirement in terms the model can act on", () => {
    const msg = buildSystemMessage(
      OPTS,
      false,
      [{ label: "API reference", ids: ["s3"] }],
      [],
      false,
    );
    // The ids are the actionable part: "keep a section in every tab" is
    // advice the model cannot follow, because the outline never says
    // which sections share a tab.
    expect(msg).toMatch(/at least one of its ids must still appear/i);
  });

  it("says nothing at all when the format has no such containers", () => {
    // Every format shipped today except Mintlify. A constraint block
    // that always appears is one the model learns to skim.
    const msg = buildSystemMessage(OPTS, false, [], [], false);
    expect(msg).not.toMatch(/MUST NOT ALL BE EMPTIED/);
    expect(msg).not.toMatch(/navigation container/i);
  });

  it("carries the scope rule and the container rule together", () => {
    const msg = buildSystemMessage(
      OPTS,
      true,
      [{ label: "API reference", ids: ["s3"] }],
      [],
      false,
    );
    expect(msg).toMatch(/SCOPE:/);
    expect(msg).toMatch(/MUST NOT ALL BE EMPTIED/);
  });
});

describe("the reparent rule reaches the model (docs/16)", () => {
  // A constraint enforced but uncommunicated is a retry loop by design.
  // Before this, a Hugo reorganize was told the outline grammar, told
  // not to invent sections, and then left to freely move topics — which
  // it will, because that is what reorganizing means. The reconstruction
  // then discarded the whole result, AFTER a paid call, and the reparent
  // net sits past the guided retry so there was no second attempt.
  //
  // AMENDED 2026-08-19: the line now comes from the constraints object
  // rather than from a `moves` parameter of its own. The sentence is
  // byte-identical — this arc rewired it, and deliberately did not
  // reword it, so a failure here means the wiring and not the copy.
  const refused = (msg: string) => /Do NOT move a topic to a different section/.test(msg);

  it("states the refusal when moves are not allowed", () => {
    expect(refused(buildSystemMessage(OPTS, false, [], REPARENT(false), false))).toBe(
      true,
    );
  });

  it("cannot say WHICH half refused, because the constraint does not carry it", () => {
    // The claim is that the model is told the rule, never the reason —
    // distinguishing capability from toggle would leak a UI state into
    // a system message for no gain.
    //
    // The previous version of this test called `buildSystemMessage`
    // twice with identical arguments and asserted the results matched,
    // which was true of any function at all. Asserted structurally
    // instead: the constraint has one field, so there is nothing for a
    // sentence to vary on.
    const constraint = REPARENT(false)[0]!;
    expect(Object.keys(constraint).sort()).toEqual(["allowed", "kind"]);
  });

  it("offers the move AFFORDANCE when they are allowed", () => {
    const msg = buildSystemMessage(OPTS, false, [], REPARENT(true), false);
    expect(refused(msg)).toBe(false);
    expect(msg).toMatch(/list it under that\s+section/);
  });

  it("never says both things at once", () => {
    for (const moves of [true, false]) {
      const msg = buildSystemMessage(OPTS, false, [], REPARENT(moves), false);
      const says = [/Do NOT move a topic/.test(msg), /To move a topic/.test(msg)];
      expect(says.filter(Boolean)).toHaveLength(1);
    }
  });
});

describe("pinned rows reach the model too (docs/10, 2026-08-19)", () => {
  // The SECOND instance of the class, and the one that burned a
  // corpus-scale call: godot pins rows, the net enforced the pin, and
  // the prompt said nothing at all.
  const pinned = (): RunConstraint[] => [
    {
      kind: "pinned-rows",
      mode: "grounded",
      rows: [{ id: "t7", title: "Using the Project Manager" }],
    },
  ];

  it("explains the marker the outline puts on every pinned row", () => {
    const msg = buildSystemMessage(OPTS, false, [], pinned(), false);
    expect(msg).toContain(PINNED_MARKER);
    expect(msg).toMatch(/pinned in place by/i);
  });

  it("says what the model loses by ignoring it, which is everything", () => {
    const msg = buildSystemMessage(OPTS, false, [], pinned(), false);
    expect(msg).toMatch(/whole answer to be rejected/i);
  });

  it("says nothing at all when the document pins nothing", () => {
    // DocFX, MkDocs and Mintlify documents have no locks, and a block
    // that always appears is one the model learns to skim.
    const msg = buildSystemMessage(OPTS, false, [], REPARENT(true), false);
    expect(msg).not.toMatch(/pinned/i);
    expect(msg).not.toContain(PINNED_MARKER);
  });
});

describe("a block is not an entry, STATED as well as enforced", () => {
  /**
   * A CONSTRAINT ENFORCED BUT UNCOMMUNICATED IS A RETRY LOOP BY DESIGN.
   * The net discards a proposal that nests one card inside another on a
   * target-list format; if the prompt never says so, the model discovers
   * it at the user's expense, once per run, forever.
   *
   * And the rule has to be one the model can ACT on. "A card is a
   * toctree block" is invisible in an outline — every line looks the
   * same — so the prompt states the OUTLINE-LEVEL consequence instead:
   * an `s` id never nests under another id.
   */
  it("names the rule when nodes must have pages", () => {
    const msg = buildSystemMessage(OPTS, false, [], [], true);
    expect(msg).toMatch(/never nest|not be nested|cannot be nested/i);
    expect(msg).toMatch(/\bs\d?\b/);
  });

  it("says nothing about it when nodes need no page", () => {
    // The complement. A prompt carrying every rule for every format
    // teaches the model constraints its document does not have, and
    // costs tokens on every call to do it.
    const msg = buildSystemMessage(OPTS, false, [], [], false);
    expect(msg).not.toMatch(/never nest|not be nested|cannot be nested/i);
  });
});
