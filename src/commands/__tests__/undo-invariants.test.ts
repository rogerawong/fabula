/**
 * Property-based undo invariants (docs/07 Layer 3 — the crown jewels).
 *
 * These are the tests for the hardest prototyping bug classes (orphan
 * index-shifting, unwrap reconstruction). CI runs with a fixed seed for
 * reproducibility (vite.config.ts); locally the seed is free.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { docfxAdapter } from "@/formats/adapters/docfx";
import { mintlifyAdapter } from "@/formats/adapters/mintlify";
import { deriveSectionOrder } from "@/layout/columns";
import { allTopicIds } from "@/model/tree";
import { applyRedo, applyUndo, runCommand } from "../dispatcher";
import type { EditorState, UndoEntry } from "../types";
import { editorFor, sampleEditor } from "./helpers";
import { makeRng, randomCommand } from "./arbitraries";

const seedsArb = fc.array(fc.integer({ min: 1, max: 0x7fffffff }), {
  minLength: 0,
  maxLength: 40,
});

/** Apply a seed list as commands; returns states + undo entries. */
function applySeeds(initial: EditorState, seeds: number[]) {
  let state = initial;
  const entries: UndoEntry[] = [];
  for (const seed of seeds) {
    const cmd = randomCommand(state, seed);
    if (!cmd) continue;
    const { next, entry } = runCommand(state, cmd);
    state = next;
    if (entry) entries.push(entry);
  }
  return { state, entries };
}

function undoAll(state: EditorState, entries: UndoEntry[]): EditorState {
  for (let i = entries.length - 1; i >= 0; i--) {
    state = applyUndo(state, entries[i]!);
  }
  return state;
}

describe("undo invariants (property-based)", () => {
  // HEAVY, NOT SLOW (a fast-check property over whole command sequences).
  // Measured at 837ms and 334ms while the machine carried a load average
  // of 20; it times out at the default 5s only under whole-suite
  // parallelism on top of that. Two of three consecutive full runs were
  // clean, and the file passes in isolation every time, so the cause is
  // contention rather than a regression. A timeout carries no fast-check
  // seed, so the explicit budget is what keeps this from being
  // re-diagnosed from a red suite with nothing to replay.
  it(
    "undo totality: undoing every command restores the initial state",
    { timeout: 20000 },
    () => {
      fc.assert(
        fc.property(seedsArb, (seeds) => {
          const initial = sampleEditor();
          const { state, entries } = applySeeds(initial, seeds);
          expect(undoAll(state, entries)).toEqual(initial);
        }),
      );
    },
  );

  it(
    "redo faithfulness: undo^n → redo^n reproduces the final state",
    { timeout: 20000 },
    () => {
      fc.assert(
        fc.property(seedsArb, (seeds) => {
          const initial = sampleEditor();
          const { state: final, entries } = applySeeds(initial, seeds);
          let state = undoAll(final, entries);
          for (const entry of entries) {
            state = applyRedo(state, entry);
          }
          expect(state).toEqual(final);
        }),
      );
    },
  );

  it(
    "reference integrity: columns and depth overrides always point at live sections",
    { timeout: 20000 },
    () => {
      fc.assert(
        fc.property(seedsArb, (seeds) => {
          const { state } = applySeeds(sampleEditor(), seeds);
          const live = state.document.sections.map((s) => s.id);

          // columns hold exactly the live section ids, once each
          const inColumns = deriveSectionOrder(state.columns);
          expect([...inColumns].sort()).toEqual([...live].sort());

          // every override key is a live section id
          for (const key of Object.keys(state.view.cardDepths)) {
            expect(live).toContain(key);
          }

          // topic ids are globally unique after any sequence
          const ids = state.document.sections.flatMap(allTopicIds);
          expect(new Set(ids).size).toBe(ids.length);
        }),
      );
    },
  );

  // Run per adapter, not just the first one. Mintlify is the case that
  // most needs it: it keeps a navigation TEMPLATE in doc.extras with a
  // slot per card, so a command sequence that added, removed or moved
  // cards could leave the template disagreeing with the model — and the
  // disagreement would only ever show up on export.
  for (const adapter of [docfxAdapter, mintlifyAdapter]) {
    it(
      `round-trip under editing (${adapter.id}): edit → undo-all → serialize ≡ pristine serialize`,
      { timeout: 20000 },
      () => {
        const { fileName, content } = adapter.sample!;
        fc.assert(
          fc.property(seedsArb, (seeds) => {
            const doc = adapter.parse(content, fileName);
            const initial = editorFor(doc);
            const pristine = adapter.serialize(
              initial.document,
              deriveSectionOrder(initial.columns),
            );

            const { state, entries } = applySeeds(initial, seeds);
            const restored = undoAll(state, entries);
            const out = adapter.serialize(
              restored.document,
              deriveSectionOrder(restored.columns),
            );
            expect(out).toBe(pristine);
          }),
          { numRuns: 30 }, // parse+serialize per run is heavier; still >1k commands
        );
      },
    );
  }

  it("edits reach the export rather than being partitioned away (mintlify)", () => {
    // The guard against the previous test passing vacuously: if the
    // serializer ignored the model, undo-all would trivially reproduce
    // the input. Removing a card must actually change the bytes.
    const { fileName, content } = mintlifyAdapter.sample!;
    const doc = mintlifyAdapter.parse(content, fileName);
    const initial = editorFor(doc);
    const pristine = mintlifyAdapter.serialize(
      initial.document,
      deriveSectionOrder(initial.columns),
    );
    const { next } = runCommand(initial, {
      type: "removeSection",
      sectionId: initial.document.sections[0]!.id,
    });
    const after = mintlifyAdapter.serialize(
      next.document,
      deriveSectionOrder(next.columns),
    );
    expect(after).not.toBe(pristine);
  });
});

describe("500-command fuzz (M2 definition of done)", () => {
  it("survives 500 random commands and undoes to pristine", () => {
    const initial = sampleEditor();
    const rng = makeRng(0xf00d);
    const seeds = Array.from({ length: 500 }, () => rng());

    const { state, entries } = applySeeds(initial, seeds);
    // the sequence must have actually done real work
    expect(entries.length).toBeGreaterThan(300);

    const restored = undoAll(state, entries);
    expect(restored).toEqual(initial);
  });
});
