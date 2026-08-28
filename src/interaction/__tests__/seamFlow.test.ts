/**
 * seamFlow.test.ts — the seam, end to end through the store (docs/21,
 * Decision 9; arc 2's fences 2–5 and 7).
 *
 * WHAT THIS FILE'S GREEN MEANS: the seam's STATE MACHINE is right — which
 * drops ask, which commit, which refuse; that a decline sticks; that a
 * proceed flips the tab exactly once and badges the move; and that undo
 * takes the move and the record together while leaving the tab's state
 * exactly where the user put it.
 *
 * WHAT IT SAYS NOTHING ABOUT: pointers, pixels, or the two-line wrapper
 * that joins a release to `commitPinnedDrop` — vitest runs in node, and
 * `animatedDispatch`'s FLIP snapshot needs a DOM. So this drives the
 * store's own `dispatch` (the shipped mutation path; `animatedDispatch`
 * is the animation wrapper around exactly it) and `e2e/flow16` drives
 * real pointers at real pixels for the rest. Named rather than implied,
 * because an instrument that ACCEPTS is not an instrument that CHECKS.
 *
 * THE CONFLATION FENCE'S SEAM LEG (completing arc 1's): the 2×2 of run
 * MODE × tab STATE is driven through both consumer families here, and
 * each varies with exactly one. The construction half is stronger still
 * and is asserted too — `pinnedGate` has no parameter a run mode could
 * arrive through, and `buildConstraints` has none for a tab state — so a
 * helper taking "aspirational: boolean" without saying WHICH cannot be
 * written against either signature.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import { recordedLedger } from "@/model/ledger";
import type { TocDocument } from "@/model/types";
import { buildConstraints, constraintPromptLines } from "@/ai/constraints";
import { buildOutline } from "@/ai/outline";
import type { ReorganizeOptions, RunMode } from "@/ai/contract";
import { useAppStore } from "@/store";
import type { TabProvenance } from "@/store/provenance";
import { pinnedGate, pinnedInMove } from "../pinnedDrag";

/** Guides → [Intro, (pinned) Installing]; Tutorials → [] */
function project(): TocDocument {
  const d = doc([section("Guides", [topic("Intro")]), section("Tutorials", [])]);
  d.sections[0]!.topics.push({
    ...topic("Installing"),
    lock: { kind: "outside-region" },
  });
  return d;
}

const tabById = (id: string) => useAppStore.getState().tabs.find((t) => t.id === id)!;
/** The pinned row, WHEREVER it currently sits — not at a fixed index.
 *  A helper that assumed one moved with the row and reported the
 *  opposite of what it measured. */
const pinnedRow = (id: string) => {
  const row = tabById(id)
    .editor.document.sections.flatMap((s) => s.topics)
    .find((t) => t.lock !== undefined);
  if (!row) throw new Error("fixture has no pinned row");
  return row;
};
const intoTutorials = (id: string) => ({
  sectionId: tabById(id).editor.document.sections[1]!.id,
  parentTopicId: null,
});
/** A within-parent reorder of the pinned row: to its own card, index 0. */
const reorderInPlace = (id: string) => ({
  sectionId: tabById(id).editor.document.sections[0]!.id,
  parentTopicId: null,
});

/** How many pinned rows this drop would displace. Asserted alongside a
 *  `commit` verdict wherever `commit` is the interesting answer: the gate
 *  returns `commit` for "nothing pinned moved" too, so a test that only
 *  read the verdict would pass for the wrong reason. */
function displaces(tabId: string, to: { sectionId: string; parentTopicId: null }) {
  return pinnedInMove(tabById(tabId).editor.document, [pinnedRow(tabId).id], to).length;
}

/** What the release would do, from the two shipped predicates. */
function verdictFor(tabId: string, to: { sectionId: string; parentTopicId: null }) {
  const tab = tabById(tabId);
  const pinned = pinnedInMove(tab.editor.document, [pinnedRow(tabId).id], to);
  return pinnedGate(tab, pinned.length);
}

/** The seam's "yes", minus the animation wrapper (see the docblock). */
function proceed(tabId: string, to: { sectionId: string; parentTopicId: null }): void {
  const rowId = pinnedRow(tabId).id;
  useAppStore.getState().setTabAspirational(tabId, true);
  useAppStore.getState().dispatch({
    type: "moveTopics",
    topicIds: [rowId],
    toSectionId: to.sectionId,
    toParentTopicId: to.parentTopicId,
    toIndex: 0,
  });
}

beforeEach(() => {
  useAppStore.setState({ tabs: [], activeTabId: null, closedTabs: [] });
});

describe("seam scope — cross-parent only, in all three tab states", () => {
  it("a cross-parent pinned drop SEAMS on a Grounded-unasked tab", () => {
    const id = useAppStore.getState().openDocument(project());
    expect(verdictFor(id, intoTutorials(id))).toBe("seam");
  });

  it("a cross-parent pinned drop COMMITS on an Aspirational tab, no seam", () => {
    const id = useAppStore.getState().openDocument(project());
    useAppStore.getState().setTabAspirational(id, true);
    expect(displaces(id, intoTutorials(id))).toBe(1);
    expect(verdictFor(id, intoTutorials(id))).toBe("commit");
  });

  it("a cross-parent pinned drop REFUSES on a declined tab", () => {
    const id = useAppStore.getState().openDocument(project());
    useAppStore.getState().declineSeam(id);
    expect(verdictFor(id, intoTutorials(id))).toBe("refuse");
  });

  it("a WITHIN-PARENT reorder never seams, in any of the three states", () => {
    // The complement, and the one that matters: a net is pinned only
    // when both its answers are. A reorder writes no record and the
    // seam's opening claim would be false for it — so it must commit
    // even on the tab that refuses every displacement, which is where
    // the hand gains sibling reorder of a pinned row for the first time.
    const unasked = useAppStore.getState().openDocument(project());
    // The mirror of the guard above: here `commit` is right BECAUSE
    // nothing is displaced, and that is the claim.
    expect(displaces(unasked, reorderInPlace(unasked))).toBe(0);
    expect(verdictFor(unasked, reorderInPlace(unasked))).toBe("commit");

    const asp = useAppStore.getState().openDocument(project());
    useAppStore.getState().setTabAspirational(asp, true);
    expect(verdictFor(asp, reorderInPlace(asp))).toBe("commit");

    const declined = useAppStore.getState().openDocument(project());
    useAppStore.getState().declineSeam(declined);
    expect(verdictFor(declined, reorderInPlace(declined))).toBe("commit");
  });
});

describe("decline is sticky", () => {
  it("refuses the NEXT pinned cross-parent drag without re-seaming", () => {
    const id = useAppStore.getState().openDocument(project());
    // The seam is offered once…
    expect(verdictFor(id, intoTutorials(id))).toBe("seam");
    // …answered "keep this tab Grounded"…
    useAppStore.getState().declineSeam(id);
    // …and every later attempt refuses rather than asking again.
    expect(verdictFor(id, intoTutorials(id))).toBe("refuse");
    expect(verdictFor(id, intoTutorials(id))).toBe("refuse");
    expect(tabById(id).aspirational).toBeUndefined();
  });

  it("leaves the document untouched — a decline moves nothing", () => {
    const id = useAppStore.getState().openDocument(project());
    useAppStore.getState().declineSeam(id);
    expect(tabById(id).editor.document.sections[0]!.topics).toHaveLength(2);
    expect(recordedLedger(tabById(id).editor.document)).toEqual([]);
  });
});

describe("proceed flips the tab exactly once", () => {
  it("lands the move badged and turns the tab Aspirational", () => {
    const id = useAppStore.getState().openDocument(project());
    proceed(id, intoTutorials(id));
    expect(tabById(id).aspirational).toBe(true);
    const ledger = recordedLedger(tabById(id).editor.document);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.originalParentTitle).toBe("Guides");
  });

  it("raises NO second seam for a later pinned drop on the same tab", () => {
    // Consent was given once, for the tab. Re-asking per move would be
    // the forty-modals failure docs/16 measured.
    const id = useAppStore.getState().openDocument(project());
    proceed(id, intoTutorials(id));
    // The row now sits in Tutorials; moving it back to Guides is a
    // second cross-parent drop, and it must not ask. Asserted as a
    // DISPLACEMENT first — `commit` is also what an ordinary reorder
    // gets, so the verdict alone would be evidence about nothing.
    expect(displaces(id, reorderInPlace(id))).toBe(1);
    expect(verdictFor(id, reorderInPlace(id))).toBe("commit");
  });

  it("clears a prior decline — a deliberate switch supersedes the seam's answer", () => {
    const id = useAppStore.getState().openDocument(project());
    useAppStore.getState().declineSeam(id);
    useAppStore.getState().setTabAspirational(id, true);
    expect(tabById(id).seamDeclined).toBeUndefined();
    expect(verdictFor(id, intoTutorials(id))).toBe("commit");
  });
});

describe("undo atomicity, and what undo may NOT touch", () => {
  it("restores the move and clears the record; redo restores both", () => {
    const id = useAppStore.getState().openDocument(project());
    proceed(id, intoTutorials(id));
    expect(recordedLedger(tabById(id).editor.document)).toHaveLength(1);

    useAppStore.getState().undo();
    expect(recordedLedger(tabById(id).editor.document)).toEqual([]);
    expect(tabById(id).editor.document.sections[0]!.topics.map((t) => t.title)).toEqual([
      "Intro",
      "Installing",
    ]);

    useAppStore.getState().redo();
    expect(recordedLedger(tabById(id).editor.document)).toHaveLength(1);
    expect(tabById(id).editor.document.sections[1]!.topics.map((t) => t.title)).toEqual([
      "Installing",
    ]);
  });

  it("leaves the tab STATE byte-identical across undo and redo", () => {
    /**
     * VIEW AND CONSENT STATE NEVER ENTER UNDO HISTORY
     * (`commands/types.ts`: "Transient state … lives elsewhere and is
     * never part of undo"). A consent answered is a fact about the USER,
     * not about the document — so undoing the first aspirational move
     * leaves an Aspirational tab with an empty ledger, which Decision 7
     * already defines as behaving exactly like a Grounded one at apply.
     * Harmless, and honest.
     */
    const id = useAppStore.getState().openDocument(project());
    proceed(id, intoTutorials(id));
    const stateOf = () => ({
      aspirational: tabById(id).aspirational,
      seamDeclined: tabById(id).seamDeclined,
    });
    const after = JSON.stringify(stateOf());

    useAppStore.getState().undo();
    expect(JSON.stringify(stateOf())).toBe(after);
    useAppStore.getState().redo();
    expect(JSON.stringify(stateOf())).toBe(after);
  });
});

describe("the 2×2 — run MODE and tab STATE never conflate", () => {
  const OPTIONS = (mode: RunMode): ReorganizeOptions => ({
    mode,
    scopeSectionIds: null,
    allowRenames: false,
    allowNewSections: false,
    allowFileMoves: false,
    folderHints: false,
    granularity: "full",
  });

  const PROV = (mode: RunMode): TabProvenance => ({
    kind: "ai-reorganize",
    providerId: "gemini",
    providerLabel: "Gemini",
    model: "gemini-flash-latest",
    presetId: "balance",
    presetName: "Balance",
    at: "2026-08-20T10:00:00.000Z",
    mode,
  });

  /** What the model is TOLD, for one run mode. */
  function promptFor(d: TocDocument, mode: RunMode): string {
    const options = OPTIONS(mode);
    const { idMap } = buildOutline(d, options);
    return buildConstraints(d, options, idMap)
      .flatMap((c) => constraintPromptLines(c))
      .join("\n");
  }

  const MODES: RunMode[] = ["grounded", "aspirational"];
  const STATES = [{}, { aspirational: true as const }];

  it("CLASSIFICATION varies with the run mode and not with the tab state", () => {
    const seen = new Map<string, Set<string>>();
    for (const mode of MODES) {
      for (const state of STATES) {
        const id = useAppStore
          .getState()
          .openDocument(project(), { provenance: PROV(mode) });
        if (state.aspirational) useAppStore.getState().setTabAspirational(id, true);
        const prompt = promptFor(tabById(id).editor.document, mode);
        (seen.get(mode) ?? seen.set(mode, new Set()).get(mode)!).add(prompt);
      }
    }
    // One prompt per mode across both states — the tab could not have
    // reached it.
    expect([...seen.values()].map((s) => s.size)).toEqual([1, 1]);
    // …and the two modes genuinely differ, or the assertion above would
    // hold for a builder that ignored the mode too.
    const [grounded, aspirational] = [...seen.values()].map((s) => [...s][0]!);
    expect(grounded).not.toBe(aspirational);
  });

  it("GESTURE CONSENT varies with the tab state and not with the run mode", () => {
    const verdicts = new Map<string, Set<string>>();
    for (const mode of MODES) {
      for (const state of STATES) {
        const id = useAppStore
          .getState()
          .openDocument(project(), { provenance: PROV(mode) });
        // A grounded-run tab is born Grounded and an aspirational-run
        // tab is born Aspirational (the birth rule), so the state is set
        // explicitly here to reach all four cells rather than the two
        // birth pairs the rule would otherwise produce.
        useAppStore.getState().setTabAspirational(id, state.aspirational === true);
        const key = state.aspirational ? "aspirational" : "unasked";
        const verdict = verdictFor(id, intoTutorials(id));
        (verdicts.get(key) ?? verdicts.set(key, new Set()).get(key)!).add(verdict);
      }
    }
    expect(verdicts.get("unasked")).toEqual(new Set(["seam"]));
    expect(verdicts.get("aspirational")).toEqual(new Set(["commit"]));
  });

  it("gives neither consumer a parameter the other's fact could arrive through", () => {
    // THE CONSTRUCTION ASSERTION, stronger than any claim about values:
    // the gate takes (consent, count) and the constraint builder takes
    // (doc, options, idMap). There is no shared parameter site, so the
    // two facts cannot be passed as one boolean.
    expect(pinnedGate.length).toBe(2);
    expect(buildConstraints.length).toBe(3);
  });
});
