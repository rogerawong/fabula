/**
 * aspirationalPrompt.test.ts — what the two modes TELL the model
 * (docs/21, Decision 5).
 *
 * THE MODE CHANGES THE FRAMING, NOT THE MECHANISM. Same producer
 * (`buildConstraints`), same two exhaustive consumers, one more input.
 * The per-row marker is identical by construction — same
 * `PINNED_MARKER`, same outline serialization — so the payload
 * difference between the modes is the system-message block and NOTHING
 * ELSE, and that is asserted here as a DIFF rather than as a shape (the
 * streaming amendment's discipline, where `stream: true` was pinned the
 * same way).
 *
 * GROUNDED IS BYTE-STABLE. The differential workflow compares two runs
 * of one document, so a grounded run has to stay comparable across
 * time: this feature's mere existence must not move one byte of it.
 * That is the fence, and the fixture below is the parity arc's own
 * rendering, quoted.
 *
 * AN INFORMED DREAM BEATS AN IGNORANT ONE. The aspirational block is not
 * silence about the pins — silence would make the model's compliance
 * WORSE than the surface demands, which is the enforced-but-
 * uncommunicated failure wearing the other hat. It states the fact, the
 * consequence, and the weighing instruction.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { TocDocument, Topic } from "@/model/types";
import {
  buildConstraints,
  constraintPromptLines,
  explicitViolations,
  PINNED_MARKER,
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

function pinned(title: string, children: Topic[] = []): Topic {
  return { ...topic(title, children), lock: { kind: "outside-region" as const } };
}

const PINNED_DOC = (): TocDocument =>
  doc([
    section("Getting started", [topic("Intro"), pinned("Using the Project Manager")]),
    section("Tutorials", [topic("First tutorial")]),
  ]);

/** The message as a single reflowed run, so an assertion about what it
 *  SAYS is not also an assertion about where it wraps. */
function reflow(text: string): string {
  return text.replace(/\s+/g, " ");
}

function systemFor(mode: RunMode, d: TocDocument = PINNED_DOC()): string {
  const options = OPTIONS(mode);
  const outline = buildOutline(d, options);
  return buildSystemMessage(
    options,
    false,
    neverEmptyGroups(d, outline.idMap),
    buildConstraints(d, options, outline.idMap),
    nodesNeedTargets(d),
  );
}

describe("grounded renders exactly what the parity arc shipped", () => {
  it("keeps the pinned block verbatim", () => {
    // Quoted from `constraints.ts` as the parity merge left it. If this
    // fails, a grounded run has changed and the differential workflow's
    // baseline has moved — which is the thing that must not happen
    // silently.
    expect(systemFor("grounded")).toContain(
      [
        `PINNED ROWS: lines ending in ${PINNED_MARKER} are pinned in place by`,
        "the source document. Keep each of them under the exact same parent it",
        "already has — you may reorder it among its current siblings, but do",
        `not move it to another section, and never rename a ${PINNED_MARKER} row.`,
        "A single moved pinned row causes the whole answer to be rejected.",
      ].join("\n"),
    );
  });

  it("still pre-checks a pinned violation, so the retry stays reachable", () => {
    const d = PINNED_DOC();
    const options = OPTIONS("grounded");
    const outline = buildOutline(d, options);
    const constraints = buildConstraints(d, options, outline.idMap);
    // t2 ("Using the Project Manager") listed under s2 — a parent change.
    const nodes = [
      { id: "s1", children: [{ id: "t1" }] },
      { id: "s2", children: [{ id: "t3" }, { id: "t2" }] },
    ];
    const found = constraints.flatMap((c) =>
      explicitViolations(c, nodes, outline.idMap, d),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("pinned in place by the source");
  });
});

describe("aspirational reframes the same markers", () => {
  it("tells the model it MAY move a pinned row, and what that costs", () => {
    const system = reflow(systemFor("aspirational"));
    expect(system).toContain("the app cannot write a move of these rows; a human can");
    expect(system).toContain(
      "each such move will be labeled for the user to carry out by hand",
    );
    // The weighing instruction — advisory, because the enforcer
    // downstream classifies rather than refuses.
    expect(system).toContain("Prefer arrangements that need few pinned moves");
    expect(system).toContain(`Never rename a ${PINNED_MARKER} row`);
  });

  it("drops the grounded rejection threat, which would now be a lie", () => {
    expect(systemFor("aspirational")).not.toContain(
      "causes the whole answer to be rejected",
    );
  });

  it("renders the reparent ALLOWED branch unconditionally", () => {
    // ON A DOCUMENT WHERE GROUNDED REFUSES. The default fixture format
    // is nav-owned, so grounded ALREADY allows a parent change there and
    // this assertion would pass for a reason nobody chose. Hugo moves
    // files, so with the toggle off grounded refuses and aspirational
    // does not — proposal space is wide by definition, and the consent
    // that branch used to carry has moved to apply time (R4).
    const hugo = { ...PINNED_DOC(), formatId: "hugo" };
    expect(systemFor("grounded", hugo)).toContain(
      "Do NOT move a topic to a different section",
    );
    const system = systemFor("aspirational", hugo);
    expect(system).toContain(
      "To move a topic into a different section, list it under that",
    );
    expect(system).not.toContain("Do NOT move a topic to a different section");
  });
});

describe("the payload difference between modes is the system message and nothing else", () => {
  it("sends a byte-identical outline in both modes", () => {
    const d = PINNED_DOC();
    expect(buildOutline(d, OPTIONS("aspirational")).text).toBe(
      buildOutline(d, OPTIONS("grounded")).text,
    );
    expect(buildOutline(d, OPTIONS("aspirational")).text).toContain(PINNED_MARKER);
  });

  it("changes ONLY the constraint block's lines, asserted as a diff", () => {
    const d = PINNED_DOC();
    const options = OPTIONS("grounded");
    const outline = buildOutline(d, options);
    const grounded = systemFor("grounded", d).split("\n");
    const aspirational = systemFor("aspirational", d).split("\n");

    // The constraint block IS the changed region: every line that
    // differs must belong to one of the two renderings of it.
    const constraintLines = new Set(
      [
        ...buildConstraints(d, OPTIONS("grounded"), outline.idMap),
        ...buildConstraints(d, OPTIONS("aspirational"), outline.idMap),
      ].flatMap((c) => constraintPromptLines(c)),
    );
    const changed = [
      ...grounded.filter((l) => !aspirational.includes(l)),
      ...aspirational.filter((l) => !grounded.includes(l)),
    ];
    expect(changed.length).toBeGreaterThan(0);
    for (const line of changed) expect(constraintLines.has(line)).toBe(true);
  });

  it("is identical in both modes for a document that pins nothing", () => {
    // No pinned rows, no reparent difference to state on a nav-owned
    // format: nothing to reframe, so nothing changes. A mode that cost
    // tokens on documents it cannot affect would be a tax on every run.
    const plain = doc([section("A", [topic("one")])]);
    expect(systemFor("aspirational", plain)).toBe(systemFor("grounded", plain));
  });
});

describe("the pre-check is mode-dependent, with the reason at the clause", () => {
  it("finds no pinned violation in aspirational mode", () => {
    // A pinned move is not a violation there; that is the mode's
    // definition. So the retry is reserved for parse errors — the
    // pre-parity behavior — and it falls out of the exhaustive switch
    // rather than being a special case.
    const d = PINNED_DOC();
    const options = OPTIONS("aspirational");
    const outline = buildOutline(d, options);
    const constraints = buildConstraints(d, options, outline.idMap);
    const nodes = [
      { id: "s1", children: [{ id: "t1" }] },
      { id: "s2", children: [{ id: "t3" }, { id: "t2" }] },
    ];
    expect(
      constraints.flatMap((c) => explicitViolations(c, nodes, outline.idMap, d)),
    ).toEqual([]);
  });
});

describe("never-empty gains an aspirational framing (R5)", () => {
  const withContainer = (): TocDocument => {
    const d = doc([section("Guides", [topic("one")])]);
    d.sections[0]!.chain = ["API"];
    d.containers = [
      {
        chainKey: "API",
        label: "API",
        kind: "tab",
        order: 0,
        accepts: { sections: true, orphans: false },
        mayEmpty: false,
      },
    ];
    return d;
  };

  it("keeps the grounded imperative", () => {
    const system = systemFor("grounded", withContainer());
    expect(reflow(system)).toContain(
      "at least one of its ids must still appear in your answer holding at least one topic",
    );
  });

  it("states the fact and the labeling instead, in aspirational mode", () => {
    // Enforcement-and-communication ship together applies to CLASSIFY
    // semantics exactly as to discard semantics: a silently-classified
    // violation the model was told was forbidden makes its compliance
    // worse than the surface demands.
    const system = systemFor("aspirational", withContainer());
    expect(reflow(system)).toContain(
      "you may propose emptying one, and it will be labeled for the user to resolve by hand",
    );
    expect(reflow(system)).not.toContain("at least one of its ids must still appear");
  });

  it("still names the ids, because containers are invisible to the outline", () => {
    const system = systemFor("aspirational", withContainer());
    expect(system).toContain("API: s1");
  });
});
