/**
 * constraints.test.ts — one producer, two consumers (docs/10 amendment
 * 2026-08-19).
 *
 * THE INCIDENT. A whole-godot reorganize moved "Using the Project
 * Manager", a row the Sphinx source pins in place. The lock net refused
 * the result, the whole corpus-scale call was discarded, and the model
 * had never been told the row was pinned. Reparent was the FIRST
 * instance of this class and was fixed in docs/16 step 6a (`8a193af`);
 * locks were the one left.
 *
 * PARITY IS STRUCTURAL HERE, not a rule anyone remembers. A constraint
 * is one value in a discriminated union, and BOTH the prompt renderer
 * and the pre-reconstruct checker switch over it exhaustively — so a
 * new constraint kind cannot compile until both sides answer for it.
 * Adding a rule to the enforcement side while forgetting the prompt is
 * no longer a thing a diff can express.
 *
 * WHAT THIS FILE DOES NOT COVER: the post-reconstruct nets in
 * `validate.ts` are unchanged and remain the COMPLETE enforcer. The
 * checker here is deliberately SOUND-BUT-INCOMPLETE, and the
 * exclusions are asserted below rather than left to be discovered.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { Topic } from "@/model/types";
import {
  buildConstraints,
  constraintPromptLines,
  explicitViolations,
  PINNED_MARKER,
  type RunConstraint,
} from "../constraints";
import { buildOutline } from "../outline";
import type { ReorganizeOptions, ResultNode } from "../contract";

const OPTIONS: ReorganizeOptions = {
  mode: "grounded" as const,
  scopeSectionIds: null,
  allowRenames: false,
  allowNewSections: false,
  allowFileMoves: false,
  folderHints: false,
  granularity: "full",
};

function pinned(title: string, children: Topic[] = []): Topic {
  return {
    ...topic(title, children),
    lock: { kind: "reference" as const, owner: "Elsewhere" },
  };
}

/**
 * s1 Guide [t1 Intro, t2 Install(PINNED)]
 * s2 Reference [t3 API]
 */
const PINNED_DOC = () =>
  doc([
    section("Guide", [topic("Intro"), pinned("Install")]),
    section("Reference", [topic("API")]),
  ]);

/** The same shape with nothing pinned — the absence fixture. */
const FREE_DOC = () =>
  doc([
    section("Guide", [topic("Intro"), topic("Install")]),
    section("Reference", [topic("API")]),
  ]);

function constraintsFor(document = PINNED_DOC(), options = OPTIONS) {
  const outline = buildOutline(document, options);
  return {
    outline,
    constraints: buildConstraints(document, options, outline.idMap),
  };
}

function find<K extends RunConstraint["kind"]>(
  list: RunConstraint[],
  kind: K,
): Extract<RunConstraint, { kind: K }> | undefined {
  return list.find((c) => c.kind === kind) as
    Extract<RunConstraint, { kind: K }> | undefined;
}

const lines = (list: RunConstraint[]) => list.flatMap(constraintPromptLines).join("\n");

describe("buildConstraints — the one producer", () => {
  it("collects pinned rows by their OUTLINE id, which is the only name the model has", () => {
    const { constraints } = constraintsFor();
    const pinnedRows = find(constraints, "pinned-rows");
    expect(pinnedRows?.rows).toEqual([{ id: "t2", title: "Install" }]);
  });

  it("emits NO pinned-rows constraint for a document that pins nothing", () => {
    const { constraints } = constraintsFor(FREE_DOC());
    expect(find(constraints, "pinned-rows")).toBeUndefined();
  });

  it("carries the reparent policy, so its prompt line stops being a parallel path", () => {
    const { constraints } = constraintsFor();
    // a plain in-memory document is nav-owned: reparent is permitted
    expect(find(constraints, "reparent")).toEqual({ kind: "reparent", allowed: true });
  });

  it("only pins rows the model can actually reference", () => {
    // A row inside a truncated subtree gets no id, so naming it would
    // be an instruction the model cannot act on — the same reasoning
    // that makes `neverEmptyGroups` list ids rather than container
    // names. `top` granularity gives topics no ids at all.
    const { constraints } = constraintsFor(PINNED_DOC(), {
      ...OPTIONS,
      granularity: "top",
    });
    expect(find(constraints, "pinned-rows")).toBeUndefined();
  });
});

describe("the prompt side", () => {
  it("explains the marker, and names the id, when rows are pinned", () => {
    const text = lines(constraintsFor().constraints);
    expect(text).toContain(PINNED_MARKER);
    expect(text).toMatch(/pinned/i);
  });

  it("leaks NO pinned boilerplate into an unconstrained run", () => {
    // The mechanism must cost nothing where it has nothing to say —
    // otherwise every DocFX and MkDocs run pays for a rule about a
    // state its documents cannot be in.
    const text = lines(constraintsFor(FREE_DOC()).constraints);
    expect(text).not.toMatch(/pinned/i);
    expect(text).not.toContain(PINNED_MARKER);
  });

  it("states the reparent policy in both directions", () => {
    const allowed = constraintPromptLines({ kind: "reparent", allowed: true }).join("\n");
    const refused = constraintPromptLines({ kind: "reparent", allowed: false }).join(
      "\n",
    );
    expect(allowed).toMatch(/list it under that/i);
    expect(refused).toMatch(/do not move a topic/i);
  });
});

describe("the outline side — pinned rows are marked where they are USED", () => {
  it("marks a pinned row inline, and only that row", () => {
    const { outline } = constraintsFor();
    const rows = outline.text.split("\n");
    expect(rows.find((l) => l.startsWith("  t2"))).toContain(PINNED_MARKER);
    expect(rows.find((l) => l.startsWith("  t1"))).not.toContain(PINNED_MARKER);
  });

  it("marks nothing in a document that pins nothing", () => {
    expect(buildOutline(FREE_DOC(), OPTIONS).text).not.toContain(PINNED_MARKER);
  });

  it("the marker sits before the folder hint, so both stay readable", () => {
    const withPath = doc([
      section("Guide", [{ ...pinned("Install"), path: "guide/install.md" }]),
    ]);
    const text = buildOutline(withPath, { ...OPTIONS, folderHints: true }).text;
    expect(text).toContain(`${PINNED_MARKER} | guide/`);
  });
});

describe("explicitViolations — the sound half", () => {
  const violationsFor = (nodes: ResultNode[], document = PINNED_DOC()) => {
    const { outline, constraints } = constraintsFor(document);
    return constraints.flatMap((c) =>
      explicitViolations(c, nodes, outline.idMap, document),
    );
  };

  it("catches a pinned row listed under a different section", () => {
    // the shape of the godot incident
    const found = violationsFor([
      { id: "s1", children: [{ id: "t1" }] },
      { id: "s2", children: [{ id: "t2" }, { id: "t3" }] },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("Install");
    expect(found[0]).toMatch(/t2/);
  });

  it("passes a pinned row listed under its own section", () => {
    expect(
      violationsFor([{ id: "s1", children: [{ id: "t2" }, { id: "t1" }] }, { id: "s2" }]),
    ).toEqual([]);
  });

  it("passes a pinned row the model never listed — children follow", () => {
    // An unlisted node keeps its parent by construction, so it cannot
    // have been moved. Flagging it would refuse the commonest correct
    // answer there is.
    expect(violationsFor([{ id: "s2" }, { id: "s1" }])).toEqual([]);
  });

  // ── the exclusions, asserted rather than discovered ──────────
  //
  // This checker exists to buy a RETRY, not to replace the net in
  // validate.ts. It must never produce a false positive, because a
  // false positive spends the one guided retry correcting a proposal
  // that was fine. Where placement is ambiguous it declines to judge
  // and the post-reconstruct net — which sees the real result — decides.

  it("declines to judge a pinned row placed at TOP LEVEL", () => {
    // Reconstruction may re-wrap an orphan into its original section or
    // mint a new one, and only the finished document says which.
    expect(violationsFor([{ id: "s1" }, { id: "t2" }, { id: "s2" }])).toEqual([]);
  });

  it("declines to judge a pinned row placed under a NEW group", () => {
    expect(
      violationsFor([
        { id: "s1" },
        { title: "Newly Invented", children: [{ id: "t2" }] },
        { id: "s2" },
      ]),
    ).toEqual([]);
  });

  it("the reparent constraint contributes NO pre-check violations, by design", () => {
    // Recorded, not overlooked: reparent's post-reconstruct net is
    // unchanged by this arc, so routing it through the retry too would
    // be a behaviour change nobody ruled on. The seam is here when
    // somebody wants it.
    expect(
      explicitViolations(
        { kind: "reparent", allowed: false },
        [{ id: "s2", children: [{ id: "t1" }] }],
        constraintsFor().outline.idMap,
        PINNED_DOC(),
      ),
    ).toEqual([]);
  });
});
