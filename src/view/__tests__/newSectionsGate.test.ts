/**
 * newSectionsGate.test.ts — "Allow new sections", conditioned on the
 * adapter that would have to write the result (oracle log, 2026-08-19).
 *
 * THE WALL, in its own words: *"the dialog offered a toggle no adapter
 * capability field conditions, so the run promised what the plan must
 * refuse."* The model created four cards on a Sphinx project, the answer
 * validated and opened, and Review then refused the whole plan — a
 * corpus-scale call spent on structure nothing upstream of the planner
 * knew was unwritable.
 *
 * ONE PRODUCER FOR THE STATE AND THE SENTENCE. `newSectionsGate` answers
 * whether the toggle is live and, when it is not, why — so the disabled
 * control and its reason cannot disagree, and `configOptions` clamps on
 * the same answer. A control that says one thing and behaves another way
 * is the shape that put the toggle in front of the user in the first
 * place.
 *
 * DERIVED, NEVER WIRED. Every case below is driven by an adapter's own
 * field; no test here names a format id, and neither does the code (the
 * construction fence in `permissions.test.ts` asserts that).
 */

import { describe, expect, it } from "vitest";
import { COLLECTION_ADAPTERS } from "@/collections/registry";
import type { CollectionAdapter } from "@/collections/types";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { TocDocument } from "@/model/types";
import {
  configOptions,
  initialConfig,
  newSectionsGate,
} from "../reorganize/ConfigureView";

const asDoc = (formatId: string): TocDocument => ({
  ...doc([section("A", [topic("one")])]),
  formatId,
});

/** A nav-owned adapter — no file moves, no page requirement — so the
 *  ONLY thing varying between cases is `createCards`. */
function fixture(createCards: boolean): CollectionAdapter {
  return {
    id: "gate-fixture",
    label: "Gate fixture",
    ingests: () => true,
    detect: () => 0,
    reparentMovesFiles: false,
    rootBearing: { sections: true, orphans: true },
    nodesNeedTargets: false,
    createCards,
    reorderCards: true,
    parse: () => ({ doc: doc([]), warnings: [] }),
  };
}

function withAdapter<T>(adapter: CollectionAdapter, run: () => T): T {
  COLLECTION_ADAPTERS.push(adapter);
  try {
    return run();
  } finally {
    COLLECTION_ADAPTERS.pop();
  }
}

const asked = { ...initialConfig([]), allowNewSections: true };

describe("the toggle asks the adapter that would have to write the result", () => {
  it("stays live where the adapter can create cards", () => {
    withAdapter(fixture(true), () => {
      const gate = newSectionsGate(asDoc("gate-fixture"), asked);
      expect(gate.enabled).toBe(true);
      expect(gate.reason).toBeUndefined();
    });
  });

  it("goes dark where it cannot, WITH A REASON naming the limitation", () => {
    withAdapter(fixture(false), () => {
      const gate = newSectionsGate(asDoc("gate-fixture"), asked);
      expect(gate.enabled).toBe(false);
      // DISABLED WITH A REASON (docs/12 decision 5). A control that
      // cannot work must say why rather than fail on press — and here
      // "fail on press" meant a paid call refused at Review.
      expect(gate.reason).toBeDefined();
      expect(gate.reason).toContain("new");
    });
  });

  it("CLAMPS the request, not just the checkbox", () => {
    // The toggle is the message; this is the invariant. A stale
    // `allowNewSections: true` in the config — from a preset, from a
    // previous document — must not reach the payload, or the prompt
    // renders `+ Title` syntax the adapter refuses.
    withAdapter(fixture(false), () => {
      expect(configOptions(asked, asDoc("gate-fixture")).allowNewSections).toBe(false);
    });
    withAdapter(fixture(true), () => {
      expect(configOptions(asked, asDoc("gate-fixture")).allowNewSections).toBe(true);
    });
  });
});

describe("THE RIDER — an adapter flipping the field re-lights the toggle, with zero UI work", () => {
  it("follows one field, in both directions, on one adapter object", () => {
    /**
     * The requirement as a test. Nothing here touches the view: one
     * field on one adapter changes, and the gate, its reason and the
     * clamped request all move together.
     */
    const adapter = fixture(false);
    withAdapter(adapter, () => {
      const d = asDoc("gate-fixture");
      expect(newSectionsGate(d, asked).enabled).toBe(false);
      expect(configOptions(asked, d).allowNewSections).toBe(false);

      adapter.createCards = true;

      expect(newSectionsGate(d, asked).enabled).toBe(true);
      expect(newSectionsGate(d, asked).reason).toBeUndefined();
      expect(configOptions(asked, d).allowNewSections).toBe(true);
    });
  });
});

describe("the pre-existing gates still answer, and each keeps its own sentence", () => {
  it("keeps the file-moves reason distinct from the create-cards one", () => {
    // A NET IS PINNED ONLY WHEN BOTH ITS ANSWERS ARE, and here there are
    // three reasons a toggle can be dark. Collapsing them into one
    // sentence would send a user to turn on a permission that would not
    // have helped.
    const fileMover: CollectionAdapter = {
      ...fixture(true),
      id: "gate-filemover",
      reparentMovesFiles: true,
    };
    withAdapter(fileMover, () => {
      const gate = newSectionsGate(asDoc("gate-filemover"), asked);
      expect(gate.enabled).toBe(false);
      expect(gate.reason).toContain("Allow file moves");
    });
  });

  it("names the create-cards limitation FIRST where both apply", () => {
    // A format that cannot create a card will not create one however the
    // file-move permission is set, so the sentence that names the
    // unfixable obstacle is the one to show — the other would offer a
    // remedy that changes nothing.
    const both: CollectionAdapter = {
      ...fixture(false),
      id: "gate-both",
      reparentMovesFiles: true,
    };
    withAdapter(both, () => {
      const gate = newSectionsGate(asDoc("gate-both"), asked);
      expect(gate.enabled).toBe(false);
      expect(gate.reason).not.toContain("Allow file moves");
    });
  });
});

describe("MODE-AWARE IN ONE BRANCH (docs/22, Decision 6)", () => {
  const aspirational = { ...asked, mode: "aspirational" as const };
  const grounded = { ...asked, mode: "grounded" as const };

  it("an ASPIRATIONAL run re-arms the toggle on a createCards:false document", () => {
    // The run may imagine new cards; they will be labeled, listed in the
    // checklist and dissolved by the projection so the rest of the plan
    // still applies. Keeping the control dark would refuse real work on
    // behalf of a wall that is no longer there.
    withAdapter(fixture(false), () => {
      const gate = newSectionsGate(asDoc("gate-fixture"), aspirational);
      expect(gate.enabled).toBe(true);
      expect(gate.reason).toBeUndefined();
    });
  });

  it("the GROUNDED branch keeps its disabled-with-a-reason sentence", () => {
    withAdapter(fixture(false), () => {
      const gate = newSectionsGate(asDoc("gate-fixture"), grounded);
      expect(gate.enabled).toBe(false);
      expect(gate.reason).toContain("new top-level card");
    });
  });

  it("ONE BRANCH ONLY — mode does not re-arm the other two obstacles", () => {
    // A mode is not a permission. The reparent and file-move clauses
    // guard consequences a mode cannot authorize: a new section on a
    // path-addressed system is a directory, and imagining one does not
    // make it writable or consented to.
    const pathAddressed: CollectionAdapter = {
      ...fixture(true),
      id: "gate-paths",
      reparentMovesFiles: true,
      supportsReparent: false,
    };
    withAdapter(pathAddressed, () => {
      const gate = newSectionsGate(asDoc("gate-paths"), {
        ...aspirational,
        allowFileMoves: false,
      });
      expect(gate.enabled).toBe(false);
      expect(gate.reason).toBeDefined();
    });
  });

  it("CLAMPS with the mode, so the payload and the control still agree", () => {
    withAdapter(fixture(false), () => {
      const d = asDoc("gate-fixture");
      expect(configOptions(grounded, d).allowNewSections).toBe(false);
      expect(configOptions(aspirational, d).allowNewSections).toBe(true);
    });
  });
});
