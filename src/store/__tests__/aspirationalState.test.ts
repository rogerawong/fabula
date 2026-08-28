/**
 * aspirationalState.test.ts — the tab STATE, and the three absent-field
 * readings it depends on (docs/21, Decisions 2 and 7).
 *
 * ONE WORD, TWO REFERENTS, and this file owns the half that lives on the
 * tab. The run MODE says what one run was allowed to imagine and is
 * immutable provenance; the tab STATE says whether this tab's
 * arrangement may hold pinned displacements going forward, and it is
 * entered by a gesture and mutated by design. They are two fields in two
 * types with no common parameter site, which is what the
 * "run mode and tab state never conflate" fence means in code.
 *
 * ABSENCE IS AN ANSWER, THREE TIMES. A provenance without `mode` is a
 * grounded-era run; a tab without state fields is Grounded-unasked; a
 * document with no `displaced` records has an empty ledger. Each is
 * asserted rather than assumed, on the provenance precedent — the cost
 * of being wrong is every user's tabs discarded on upgrade, and a
 * version bump is exactly the mistake this shape exists to avoid.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import { sphinxAdapter } from "@/collections/adapters/sphinx";
import { createSection } from "@/model/tree";
import { hasDisplacements } from "@/model/ledger";
import { useAppStore } from "../index";
import type { TabProvenance } from "../provenance";
import { deserializeSession, PERSIST_VERSION, serializeSession } from "../persistence";

const PROV = (mode?: "grounded" | "aspirational"): TabProvenance => ({
  kind: "ai-reorganize",
  providerId: "gemini",
  providerLabel: "Gemini",
  model: "gemini-flash-latest",
  presetId: "balance",
  presetName: "Balance",
  at: "2026-08-19T10:00:00.000Z",
  ...(mode ? { mode } : {}),
});

beforeEach(() => {
  useAppStore.setState({ tabs: [], activeTabId: null, closedTabs: [] });
});

describe("the run mode rides provenance, immutably", () => {
  it("records the mode of the run that produced the tab", () => {
    const id = useAppStore.getState().openDocument(doc([section("A", [topic("one")])]), {
      provenance: PROV("aspirational"),
    });
    const tab = useAppStore.getState().tabs.find((t) => t.id === id)!;
    expect(tab.provenance?.mode).toBe("aspirational");
  });

  it("reads an absent mode as a grounded-era run, not as a missing fact", () => {
    // Every run before this feature existed was grounded by construction.
    const id = useAppStore
      .getState()
      .openDocument(doc([section("A", [topic("one")])]), { provenance: PROV() });
    const restored = deserializeSession(serializeSession(useAppStore.getState()))!;
    const tab = restored.tabs.find((t) => t.id === id)!;
    expect(tab.provenance).toBeDefined();
    expect(tab.provenance?.mode).toBeUndefined();
    expect("mode" in tab.provenance!).toBe(false);
  });
});

describe("the tab state persists, and its absence reads as Grounded-unasked", () => {
  it("carries aspirational and seamDeclined through a round trip", () => {
    const id = useAppStore.getState().openDocument(doc([section("A", [topic("x")])]));
    useAppStore.getState().setTabAspirational(id, true);
    const restored = deserializeSession(serializeSession(useAppStore.getState()))!;
    expect(restored.tabs[0]!.aspirational).toBe(true);
    expect(restored.tabs[0]!.seamDeclined).toBeUndefined();
  });

  it("keeps a decline, because a consent that evaporates on reload re-asks", () => {
    const id = useAppStore.getState().openDocument(doc([section("A", [topic("x")])]));
    useAppStore.getState().declineSeam(id);
    const restored = deserializeSession(serializeSession(useAppStore.getState()))!;
    expect(restored.tabs[0]!.seamDeclined).toBe(true);
    expect(restored.tabs[0]!.aspirational).toBeUndefined();
  });

  it("writes NEITHER key for a Grounded-unasked tab", () => {
    // Absent, never `false`: an explicit false reads like an answered
    // question, and the seam's whole job is to tell those apart.
    useAppStore.getState().openDocument(doc([section("A", [topic("x")])]));
    const payload = JSON.parse(serializeSession(useAppStore.getState())) as {
      tabs: Record<string, unknown>[];
    };
    expect("aspirational" in payload.tabs[0]!).toBe(false);
    expect("seamDeclined" in payload.tabs[0]!).toBe(false);
  });

  it("is NOT the topicsLocked pattern — that one resets, this one must not", () => {
    const id = useAppStore.getState().openDocument(doc([section("A", [topic("x")])]));
    useAppStore.getState().setTabAspirational(id, true);
    useAppStore.getState().setTopicsLocked(id, true);
    const restored = deserializeSession(serializeSession(useAppStore.getState()))!;
    expect(restored.tabs[0]!.topicsLocked).toBe(false);
    expect(restored.tabs[0]!.aspirational).toBe(true);
  });
});

describe("no version bump, asserted rather than assumed", () => {
  it("keeps PERSIST_VERSION at 3", () => {
    // Optional fields do not bump: an absent optional rehydrates into
    // `undefined`, which every consumer already handles. Bumping would
    // discard every user's tab arrangement to gain nothing.
    expect(PERSIST_VERSION).toBe(3);
  });

  it("rehydrates a pre-modes session byte-identically", () => {
    // Key order is the SERIALIZER's, so the only thing this comparison
    // can catch is a FIELD appearing or vanishing — which is the claim.
    // Ordering the fixture by hand would make the test fail for a reason
    // that is nobody's business.
    const before = JSON.stringify({
      version: 3,
      tabs: [
        {
          id: "t-1",
          name: "Docs",
          editor: {
            document: doc([section("A", [topic("one")])]),
            columns: [[]],
            view: { globalDepth: 2, cardDepths: {} },
          },
        },
      ],
      activeTabId: "t-1",
    });
    const session = deserializeSession(before)!;
    expect(session).not.toBeNull();
    expect(session.tabs[0]!.aspirational).toBeUndefined();
    expect(session.tabs[0]!.seamDeclined).toBeUndefined();
    useAppStore.setState({ tabs: session.tabs, activeTabId: session.activeTabId });
    // Round-tripping the restored session must reproduce the ORIGINAL
    // bytes: a field silently defaulted on read shows up here as a key
    // the old payload never had.
    expect(serializeSession(useAppStore.getState())).toBe(before);
  });
});

describe("the state travels with the tab, like provenance", () => {
  it("a duplicate copies the state and the decline memory", () => {
    const id = useAppStore.getState().openDocument(doc([section("A", [topic("x")])]));
    useAppStore.getState().setTabAspirational(id, true);
    useAppStore.getState().declineSeam(id);
    const copyId = useAppStore.getState().duplicateTab(id)!;
    const copy = useAppStore.getState().tabs.find((t) => t.id === copyId)!;
    expect(copy.aspirational).toBe(true);
    expect(copy.seamDeclined).toBe(true);
  });

  it("a reopened tab restores what it had", () => {
    const id = useAppStore.getState().openDocument(doc([section("A", [topic("x")])]));
    useAppStore.getState().setTabAspirational(id, true);
    useAppStore.getState().closeTab(id);
    const back = useAppStore.getState().reopenClosedTab()!;
    expect(useAppStore.getState().tabs.find((t) => t.id === back)!.aspirational).toBe(
      true,
    );
  });

  it("a fresh import is Grounded-unasked", () => {
    const id = useAppStore.getState().openDocument(doc([section("A", [topic("x")])]));
    const tab = useAppStore.getState().tabs.find((t) => t.id === id)!;
    expect(tab.aspirational).toBeUndefined();
    expect(tab.seamDeclined).toBeUndefined();
  });
});

describe("switching a tab back to Grounded clears the decline memory", () => {
  it("turning Aspirational ON supersedes a decline", () => {
    // The decline answered the SEAM; a deliberate switch supersedes it.
    const id = useAppStore.getState().openDocument(doc([section("A", [topic("x")])]));
    useAppStore.getState().declineSeam(id);
    useAppStore.getState().setTabAspirational(id, true);
    const tab = useAppStore.getState().tabs.find((t) => t.id === id)!;
    expect(tab.aspirational).toBe(true);
    expect(tab.seamDeclined).toBeUndefined();
  });

  it("switching back lands Grounded-UNASKED, so the seam may offer again", () => {
    const id = useAppStore.getState().openDocument(doc([section("A", [topic("x")])]));
    useAppStore.getState().setTabAspirational(id, true);
    useAppStore.getState().setTabAspirational(id, false);
    const tab = useAppStore.getState().tabs.find((t) => t.id === id)!;
    expect(tab.aspirational).toBeUndefined();
    expect(tab.seamDeclined).toBeUndefined();
  });
});

describe("the birth rule — one rule, producers enumerated (Decision 2)", () => {
  const displacedDoc = () => {
    const d = doc([section("A", [topic("pinned row")])]);
    d.sections[0]!.topics[0]!.lock = { kind: "outside-region" };
    d.sections[0]!.topics[0]!.displaced = {
      parentId: "gone",
      parentTitle: "Getting started",
      index: 0,
      kind: "pin",
    };
    return d;
  };

  it("an aspirational-run result tab is born Aspirational even with an empty ledger", () => {
    // The model may simply not have moved a pinned row; the user chose
    // the posture and the tab keeps it.
    const id = useAppStore.getState().openDocument(doc([section("A", [topic("x")])]), {
      provenance: PROV("aspirational"),
    });
    expect(useAppStore.getState().tabs.find((t) => t.id === id)!.aspirational).toBe(true);
  });

  it("a grounded-run result tab from an unledgered source is born Grounded", () => {
    const id = useAppStore.getState().openDocument(doc([section("A", [topic("x")])]), {
      provenance: PROV("grounded"),
    });
    expect(
      useAppStore.getState().tabs.find((t) => t.id === id)!.aspirational,
    ).toBeUndefined();
  });

  it("a GROUNDED run that inherited displacements is born Aspirational", () => {
    // A tab holding displacements cannot honestly wear the Grounded
    // promise, whatever run produced it.
    const id = useAppStore
      .getState()
      .openDocument(displacedDoc(), { provenance: PROV("grounded") });
    expect(useAppStore.getState().tabs.find((t) => t.id === id)!.aspirational).toBe(true);
  });

  it("a document holding displacements is born Aspirational with no provenance at all", () => {
    const id = useAppStore.getState().openDocument(displacedDoc());
    expect(useAppStore.getState().tabs.find((t) => t.id === id)!.aspirational).toBe(true);
  });

  /**
   * THE FIRST CLAUSE, WIDENED (docs/22, Decision 7, riding OR-3): "holds
   * displacements OR STRUCTURAL REMAINDERS at birth".
   *
   * The gap it closes is not hypothetical. A GROUNDED run on a Sphinx tab
   * can hoist a leaf — the validator opens it deliberately, and the pinned
   * net is parent-change-only — so the result arrives holding a creation
   * record with an EMPTY row ledger. Under the unwidened rule it would be
   * born Grounded while holding structure the app cannot write, which is a
   * tab whose state contradicts its own facts.
   */
  it("a GROUNDED result holding a created card is born Aspirational", () => {
    const files = {
      "conf.py": 'master_doc = "index"\nsource_suffix = ".rst"\n',
      "index.rst": [
        "Docs",
        "====",
        "",
        ".. toctree::",
        "   :caption: Guides",
        "",
        "   guides/install",
        "",
      ].join("\n"),
      "guides/install.rst": "Install\n=======\n\nbody\n",
    };
    const parsed = sphinxAdapter.parse(files, "proj").doc;
    // The hoist: the row leaves its card for a card the source has no
    // block for. No row is pinned, so the ledger stays empty.
    const hoisted = structuredClone(parsed);
    const row = hoisted.sections[0]!.topics[0]!;
    hoisted.sections[0]!.topics = [];
    hoisted.sections.push(createSection("Workflow", [row]));
    expect(hasDisplacements(hoisted)).toBe(false);

    const id = useAppStore
      .getState()
      .openDocument(hoisted, { provenance: PROV("grounded") });
    expect(useAppStore.getState().tabs.find((t) => t.id === id)!.aspirational).toBe(true);
  });

  it("and the same document with NO remainder is still born Grounded", () => {
    // THE COMPLEMENT. A widening that born everything Aspirational would
    // pass the test above while destroying the default state.
    const files = {
      "conf.py": 'master_doc = "index"\nsource_suffix = ".rst"\n',
      "index.rst":
        "Docs\n====\n\n.. toctree::\n   :caption: Guides\n\n   guides/install\n",
      "guides/install.rst": "Install\n=======\n\nbody\n",
    };
    const parsed = sphinxAdapter.parse(files, "proj").doc;
    const id = useAppStore
      .getState()
      .openDocument(parsed, { provenance: PROV("grounded") });
    expect(
      useAppStore.getState().tabs.find((t) => t.id === id)!.aspirational,
    ).toBeUndefined();
  });
});
