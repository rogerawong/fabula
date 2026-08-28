/**
 * `rootBearing` — what each system's ROOT holds, declared per adapter
 * (docs/22, Decision 8's marked declaration).
 *
 * REQUIRED ON BOTH CONTRACTS, the `reparentMovesFiles` discipline
 * verbatim: an adapter nobody classified would fall through to a default
 * somebody guessed, and the guess decides what a drag-out BIRTHS on that
 * system. `pnpm check` names the next adapter that forgets.
 *
 * EVERY ANSWER VERIFIED AGAINST ITS OWN PLANNER, never copied (the
 * capability-fields method). The receipts are PUBLISHED-RENDERING
 * FIDELITY — a real theme's behaviour with a bare top-level page, read
 * off the theme's template or its published nav contract — because the
 * `no_list` lesson is that a plausible answer read off a key name
 * mismarked 77 rows. Each declaration carries its method AT the field;
 * this file asserts the planner half, which is the half a fixture can
 * hold.
 */

import { describe, expect, it } from "vitest";
import { COLLECTION_ADAPTERS } from "@/collections/registry";
import { FORMAT_ADAPTERS } from "@/formats/registry";
// IMPORTED FOR ITS SIDE EFFECT: this fixture reaches the registry
// through `as unknown as CollectionAdapter`, which is exactly the trust
// boundary this assertion exists for. Without the import the cast-path
// occupant is absent and the sweep would pass over four well-typed
// adapters while proving nothing about the fifth.
import "@/commands/__tests__/refusingAdapter";
import { bearingOf, resolveBirth } from "../bearing";
import { doc, section, topic } from "./fixtures";
import type { TocDocument } from "../types";
import { mintlifyAdapter } from "@/formats/adapters/mintlify";
import starter from "@/formats/__tests__/fixtures/mintlify/starter-docs.json?raw";
import docsReduced from "@/formats/__tests__/fixtures/mintlify/docs-reduced.json?raw";
import syntheticShapes from "@/formats/__tests__/fixtures/mintlify/synthetic-shapes.json?raw";
import tabsRooted from "@/formats/__tests__/fixtures/mintlify/tabs-rooted-valid.json?raw";
import emptyContainer from "@/formats/__tests__/fixtures/mintlify/empty-container.json?raw";

describe("every registered adapter declares a root bearing", () => {
  /**
   * OVER THE LIVE REGISTRY, not over the interface. A cast pierces every
   * type guarantee — `as unknown as T` makes a required field optional
   * again for exactly the objects that skipped review — and adapters
   * enter this registry from tests and fixtures as well as from
   * `adapters/`. The required `reparentMovesFiles` was satisfied by all
   * four shipped adapters and `undefined` on a fixture that arrived
   * through a cast; the absence test found it and the compiler could
   * not.
   */
  it("answers with two booleans, at runtime, for every entry in both registries", () => {
    for (const adapter of [...FORMAT_ADAPTERS, ...COLLECTION_ADAPTERS]) {
      const bearing = (adapter as { rootBearing?: unknown }).rootBearing;
      expect(bearing, `${adapter.id} declares no rootBearing`).toBeDefined();
      expect(typeof (bearing as { sections?: unknown }).sections, adapter.id).toBe(
        "boolean",
      );
      expect(typeof (bearing as { orphans?: unknown }).orphans, adapter.id).toBe(
        "boolean",
      );
    }
  });
});

describe("bearingOf — declared descriptor first, adapter declaration second", () => {
  /**
   * ONE PRODUCER FOR THE BEARING QUESTION. The container descriptors are
   * the source of truth wherever a document declares them; the adapter's
   * `rootBearing` is what a format with no containers has INSTEAD, never
   * a second opinion that could disagree with a descriptor.
   */
  it("reads a declared container's own accepts", () => {
    const d: TocDocument = {
      ...doc([section("A", [topic("one")])]),
      formatId: "mintlify",
      containers: [
        {
          chainKey: "",
          label: "Top level",
          order: 0,
          accepts: { sections: false, orphans: false },
          mayEmpty: true,
        },
      ],
    };
    expect(bearingOf(d, [])).toEqual({ sections: false, orphans: false });
  });

  it("falls through to the adapter's declaration where the document declares no containers", () => {
    const d: TocDocument = { ...doc([section("A", [topic("one")])]), formatId: "sphinx" };
    expect(bearingOf(d, [])).toEqual({ sections: true, orphans: false });
  });

  it("a chain no descriptor claims is NOT MEASURED — and not the ROOT's answer either", () => {
    // A guard consumes declared inputs. This document declared bearing
    // for the root and said nothing about "Ghost"; inventing a refusal
    // from silence is worse than the hazard it imagines, and
    // `refuseUnhousedSections` is the floor underneath either way.
    //
    // KEYED TO SPHINX ON PURPOSE, whose declaration is {sections, no
    // orphans}: with a `{both}` adapter here the assertion would pass
    // whether or not the chain length was consulted at all, which is
    // measured — it let a mutant that drops the length check live.
    const d: TocDocument = {
      ...doc([section("A", [topic("one")])]),
      formatId: "sphinx",
      containers: [
        {
          chainKey: "",
          label: "Top level",
          order: 0,
          accepts: { sections: false, orphans: false },
          mayEmpty: true,
        },
      ],
    };
    expect(bearingOf(d, ["Ghost"])).toEqual({ sections: true, orphans: true });
  });

  it("an unknown formatId is not measured either", () => {
    const d: TocDocument = { ...doc([section("A", [topic("one")])]), formatId: "nope" };
    expect(bearingOf(d, [])).toEqual({ sections: true, orphans: true });
  });
});

describe("Mintlify's static declaration is the floor, and the floor is not reached", () => {
  /**
   * NAMING WHAT A GREEN RUN DOES NOT ENFORCE. Mintlify is the one
   * adapter whose real root bearing is a per-DOCUMENT fact, so its
   * static field says "permissive, because nothing was declared" — a
   * value that would be WRONG if it were ever consulted for a real
   * docs.json, and is not, because `walkContainer` declares a descriptor
   * for `navigation` itself on every parse.
   *
   * So the declaration is verified by its UNREACHABILITY rather than by
   * its value. If a future parse stops declaring the root, this goes red
   * and the field stops being a floor.
   */
  it("every shipped fixture declares a root descriptor, so bearingOf never falls through", () => {
    for (const [name, raw] of [
      ["starter-docs", starter],
      ["docs-reduced", docsReduced],
      ["synthetic-shapes", syntheticShapes],
      ["tabs-rooted-valid", tabsRooted],
      ["empty-container", emptyContainer],
    ] as const) {
      const parsed = mintlifyAdapter.parse(raw, `${name}.json`);
      const root = parsed.containers?.find((c) => c.chainKey === "");
      expect(root, `${name} declares no root container`).toBeDefined();
      expect(bearingOf(parsed, [])).toEqual({ ...root!.accepts });
    }
  });

  it("and a tabs root really does bear neither — the value the static field would have got wrong", () => {
    const parsed = mintlifyAdapter.parse(tabsRooted, "tabs-rooted-valid.json");
    expect(bearingOf(parsed, [])).toEqual({ sections: false, orphans: false });
    expect(mintlifyAdapter.rootBearing).toEqual({ sections: true, orphans: true });
  });
});

describe("resolveBirth — one answer, two callers", () => {
  /**
   * THE COMPOSITION THE EXECUTOR AND THE DRAG LAYER SHARE. Two
   * derivations of one rule is how the sidebar once committed the move
   * the canvas refused, and a birth has three separable questions
   * — where is the home, what does it bear, what does that make — which
   * is three chances to disagree. So they are answered once, here.
   */
  const leaf = { childless: true, pinned: false };
  const parent = { childless: false, pinned: false };

  it("a Sphinx root wraps a childless entry: its cards ARE toctree blocks", () => {
    const d: TocDocument = { ...doc([section("A", [topic("one")])]), formatId: "sphinx" };
    expect(resolveBirth(d, [d.sections[0]!.id], 1, [leaf])).toEqual({
      chain: [],
      shape: { kind: "wrap" },
    });
  });

  it("a Hugo root births the standalone, which is what Docsy renders", () => {
    const d: TocDocument = { ...doc([section("A", [topic("one")])]), formatId: "hugo" };
    expect(resolveBirth(d, [d.sections[0]!.id], 1, [leaf])).toEqual({
      chain: [],
      shape: { kind: "standalone" },
    });
  });

  it("a promoted entry keeps its own name and takes the home the drop names", () => {
    const d: TocDocument = { ...doc([section("A", [topic("one")])]), formatId: "hugo" };
    expect(resolveBirth(d, [d.sections[0]!.id], 1, [parent]).shape).toEqual({
      kind: "promote",
    });
  });

  it("the CHAIN comes from the drop slot's neighbours, not from the moving rows", () => {
    const guides = { ...section("Guides", [topic("one")]), chain: ["Docs"] as const };
    const d: TocDocument = {
      ...doc([guides]),
      formatId: "mintlify",
      containers: [
        {
          chainKey: "",
          label: "Top level",
          order: 0,
          accepts: { sections: false, orphans: false },
          mayEmpty: true,
        },
        {
          chainKey: "Docs",
          label: "Docs",
          order: 1,
          accepts: { sections: true, orphans: false },
          mayEmpty: true,
        },
      ],
    };
    // Dropped BELOW the Guides card: the home is that card's container,
    // whose `groups` array holds group objects and not page paths — so
    // the childless entry is wrapped rather than left bare.
    expect(resolveBirth(d, [guides.id], 1, [leaf])).toEqual({
      chain: ["Docs"],
      shape: { kind: "wrap" },
    });
  });

  it("a bears-nothing root is UNHOUSED, and the caller decides what that means", () => {
    const d: TocDocument = {
      ...doc([section("A", [topic("one")])]),
      formatId: "mintlify",
      containers: [
        {
          chainKey: "",
          label: "Top level",
          order: 0,
          accepts: { sections: false, orphans: false },
          mayEmpty: true,
        },
      ],
    };
    expect(resolveBirth(d, [], 0, [leaf]).shape).toEqual({ kind: "unhoused" });
  });
});
