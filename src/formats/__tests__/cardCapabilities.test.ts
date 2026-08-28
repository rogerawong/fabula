/**
 * cardCapabilities.test.ts — `createCards` and `reorderCards`, the two
 * facts the dialog and the prompt were missing (oracle log, 2026-08-19).
 *
 * ## The walls this exists for
 *
 * Three live corpus-scale runs against godot-docs came back refused at
 * Review for structure the adapter cannot write, and every one of them
 * was refused AFTER a paid call:
 *
 * - "the dialog offered a toggle no adapter capability field
 *   conditions, so the run promised what the plan must refuse" — the
 *   model created cards on a system where a card is a toctree block
 *   this version does not create;
 * - "nothing in either mode's prompt says card order is fixed here" —
 *   the model reordered top-level cards on the same system.
 *
 * The enforcement was correct in both cases and lived at plan time. What
 * was missing is the fact itself: nowhere in the codebase could anything
 * ASK whether this system can create or reorder cards.
 *
 * ## Why required, and why on BOTH contracts
 *
 * The failure of a missing answer is silent and in the DANGEROUS
 * direction, which is the test `reparentMovesFiles` and
 * `nodesNeedTargets` already pass: an adapter nobody classified reads as
 * capable, so the toggle re-arms and the prompt line vanishes, and the
 * run promises what the plan must refuse — the wall above, rebuilt.
 * Required means `pnpm check` names the next adapter that forgets.
 *
 * ## Derived, never wired per adapter
 *
 * There is no adapter-id branch anywhere in the path. The dialog reads
 * the document's own adapter, so an adapter that flips a field re-lights
 * the toggle with zero UI work — asserted below as its own test, because
 * a claim about a mechanism nobody exercises is a claim about nothing.
 */

import { describe, expect, it } from "vitest";
import { COLLECTION_ADAPTERS } from "@/collections/registry";
import type { CollectionAdapter } from "@/collections/types";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { TocDocument } from "@/model/types";
import { FORMAT_ADAPTERS, createCards, reorderCards } from "../registry";

const asDoc = (formatId: string): TocDocument => ({
  ...doc([section("A", [topic("one")])]),
  formatId,
});

describe("both registries answer both fields", () => {
  it("gets a boolean from every registered COLLECTION adapter", () => {
    /**
     * ASSERTED OVER THE LIVE REGISTRY, not merely declared on the
     * interface. A cast pierces every type guarantee: the required
     * `reparentMovesFiles` was once `undefined` on a test fixture that
     * reached the registry through `as unknown as`, and the compiler
     * could not see it while a test like this one could.
     */
    expect(COLLECTION_ADAPTERS.length).toBeGreaterThan(0);
    for (const adapter of COLLECTION_ADAPTERS) {
      expect(typeof adapter.createCards, adapter.id).toBe("boolean");
      expect(typeof adapter.reorderCards, adapter.id).toBe("boolean");
    }
  });

  it("gets a boolean from every registered FORMAT adapter", () => {
    // Both contracts, because both produce documents the dialog opens
    // and the prompt describes. A fact declared on one of two contracts
    // is a fact half the app cannot ask for.
    expect(FORMAT_ADAPTERS.length).toBeGreaterThan(0);
    for (const adapter of FORMAT_ADAPTERS) {
      expect(typeof adapter.createCards, adapter.id).toBe("boolean");
      expect(typeof adapter.reorderCards, adapter.id).toBe("boolean");
    }
  });
});

describe("the lookup reads the document's own adapter", () => {
  it("routes a collection document to its collection adapter", () => {
    for (const adapter of COLLECTION_ADAPTERS) {
      expect(createCards(asDoc(adapter.id)), adapter.id).toBe(adapter.createCards);
      expect(reorderCards(asDoc(adapter.id)), adapter.id).toBe(adapter.reorderCards);
    }
  });

  it("routes a format document to its format adapter", () => {
    for (const adapter of FORMAT_ADAPTERS) {
      expect(createCards(asDoc(adapter.id)), adapter.id).toBe(adapter.createCards);
      expect(reorderCards(asDoc(adapter.id)), adapter.id).toBe(adapter.reorderCards);
    }
  });

  it("answers an UNKNOWN formatId permissively, and says why at the site", () => {
    // A document from no registered adapter is one the app made or one
    // a test built; there is no adapter to refuse on its behalf, and
    // inventing a refusal would produce one nobody can act on. The
    // dangerous direction is guarded by the REQUIRED field, which is
    // what makes this default safe: every real adapter answers.
    expect(createCards(asDoc("nothing-registered"))).toBe(true);
    expect(reorderCards(asDoc("nothing-registered"))).toBe(true);
  });
});

describe("THE RIDER — an adapter flipping the field changes the answer, with no UI work", () => {
  it("follows a fixture adapter's createCards, both ways", () => {
    /**
     * The requirement stated as a test, because "derived, never wired"
     * is a claim about a mechanism and a claim nobody exercises is a
     * claim about nothing. One fixture adapter, one field flipped,
     * nothing else touched — and the answer moves.
     *
     * This is the shape that would have prevented the wall: the toggle
     * asks the adapter, so the day Sphinx learns to create a block, the
     * dialog re-lights itself.
     */
    const base: CollectionAdapter = {
      id: "fixture-flip",
      label: "Fixture",
      ingests: () => true,
      detect: () => 0,
      reparentMovesFiles: false,
      rootBearing: { sections: true, orphans: true },
      nodesNeedTargets: false,
      createCards: false,
      reorderCards: false,
      parse: () => ({ doc: doc([]), warnings: [] }),
    };

    COLLECTION_ADAPTERS.push(base);
    try {
      expect(createCards(asDoc("fixture-flip"))).toBe(false);
      // ONE FIELD, nothing else — not a re-registration, not a new id.
      base.createCards = true;
      expect(createCards(asDoc("fixture-flip"))).toBe(true);
      // …and the sibling field is independent, or "derived" would be
      // hiding a single flag wearing two names.
      expect(reorderCards(asDoc("fixture-flip"))).toBe(false);
    } finally {
      COLLECTION_ADAPTERS.pop();
    }
  });
});
