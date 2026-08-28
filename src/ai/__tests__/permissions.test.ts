/**
 * Capability ∧ permission, and the absence test that keeps them apart
 * (docs/16, ruling aba4ad5).
 *
 * A CAPABILITY is what an adapter can express. A PER-RUN PERMISSION is
 * what the user will let one AI call do to their disk. They were nearly
 * one field, and the two-sentence test separates them: "Allow new
 * sections lets the model group topics under a heading it invented" /
 * "Allow new sections lets the model relocate files on disk".
 */

import { describe, expect, it } from "vitest";
import { fileMovesAllowed, movesFilesOnReparent } from "../permissions";
import { REFUSING } from "@/commands/__tests__/refusingAdapter";
import { readFileSync } from "node:fs";
import { COLLECTION_ADAPTERS } from "@/collections/registry";
import { newId } from "@/model/id";
import type { TocDocument } from "@/model/types";

const docOf = (formatId: string): TocDocument => ({
  id: newId(),
  name: "Doc",
  formatId,
  sections: [{ id: newId(), title: "S", topics: [] }],
});

describe("the permission gates only where there is a consequence", () => {
  it("REFUSES a file-move format when the toggle is off — though the capability is TRUE", () => {
    // THE ABSENCE TEST. Asserted on Hugo, whose capability is true since
    // step 3, so an implementation that collapses the conjunction back
    // to the capability alone fails here and nowhere else. That
    // regression is one `&&` away at all times.
    const hugo = docOf("hugo");
    expect(movesFilesOnReparent(hugo)).toBe(true);
    expect(fileMovesAllowed(hugo, { allowFileMoves: false })).toBe(false);
  });

  it("allows it when the toggle is on", () => {
    expect(fileMovesAllowed(docOf("hugo"), { allowFileMoves: true })).toBe(true);
  });

  it("allows a NAV-OWNED format regardless of the toggle", () => {
    // Nothing about MkDocs, JTD or Mintlify changes. A parent change
    // there is a nav or metadata edit with nothing on disk to consent
    // to, and demanding a permission for an absent risk would refuse
    // every reorganize on those formats — which is what 18 existing
    // tests caught when the first cut did exactly that.
    for (const id of ["mkdocs", "docfx", "mintlify", "jtd"]) {
      const doc = docOf(id);
      expect(movesFilesOnReparent(doc)).toBe(false);
      expect(fileMovesAllowed(doc, { allowFileMoves: false })).toBe(true);
    }
  });

  it("refuses on CAPABILITY even with the toggle on", () => {
    // The capability is absolute: consent cannot conjure an ability the
    // format does not have.
    expect(fileMovesAllowed(docOf(REFUSING), { allowFileMoves: true })).toBe(false);
  });
});

describe("the consent layer holds no adapter ids", () => {
  // The absence test for the declaration. A hardcoded list here fails
  // SILENT and in the dangerous direction: an adapter nobody remembered
  // to add reads as nav-owned, so the toggle is never shown, so a
  // reorganize relocates files with no consent asked. The fact belongs
  // to the adapter, and being required on the interface means the
  // compiler names the next one that forgets.
  const source = (path: string) => readFileSync(path, "utf8");

  it("names no format id in the permissions module", () => {
    const module = source("src/ai/permissions.ts");
    for (const id of ["hugo", "docusaurus", "jtd", "sphinx", "mkdocs", "mintlify"]) {
      expect(module).not.toMatch(new RegExp(`["'\`]${id}["'\`]`));
    }
  });

  it("names no format id in the dialog's permission wiring", () => {
    // The other half of the consent path: the view decides whether to
    // SHOW the toggle, and a list there is the same defect one file
    // over.
    const view = source("src/view/reorganize/ConfigureView.tsx");
    for (const id of ["hugo", "docusaurus"]) {
      expect(view).not.toMatch(new RegExp(`["'\`]${id}["'\`]`));
    }
  });

  it("names no adapter id anywhere in the CARD-CAPABILITY path", () => {
    /**
     * THE DERIVATION FENCE, construction-form. `createCards` and
     * `reorderCards` decide whether a toggle is offered and whether a
     * prompt line renders, and the whole point of them being adapter
     * FIELDS is that no layer above the adapter knows which system it is
     * looking at. One `formatId === "sphinx"` here and the rider dies
     * silently: an adapter that gained the capability would keep being
     * refused by a list nobody remembered to update.
     *
     * Asserted on the CONSTRUCTION — the id literals — never on
     * vocabulary, because a scan for bare words flags the prose that
     * explains the fence, and a fence that fails on its own explanation
     * is one people learn to disable.
     */
    const ids = ["hugo", "docusaurus", "jtd", "sphinx", "docfx", "mkdocs", "mintlify"];
    for (const path of [
      "src/formats/registry.ts",
      "src/view/reorganize/ConfigureView.tsx",
      "src/ai/prompt.ts",
      "src/ai/constraints.ts",
    ]) {
      const text = source(path);
      for (const id of ids) {
        expect(text, `${path} names "${id}"`).not.toMatch(
          new RegExp(`["'\`]${id}["'\`]`),
        );
      }
    }
  });

  it("reads the answer from every registered adapter, not from a list", () => {
    // Every shipped adapter answers, because the field is required.
    //
    // ASSERTED OVER THE LIVE REGISTRY, not merely declared on the
    // interface: a cast pierces every type guarantee, and the required
    // `reparentMovesFiles` was once `undefined` on a test fixture that
    // reached the registry through `as unknown as`. The compiler could
    // not see it; this test could.
    for (const adapter of COLLECTION_ADAPTERS) {
      expect(typeof adapter.reparentMovesFiles).toBe("boolean");
      expect(typeof adapter.nodesNeedTargets).toBe("boolean");
    }
    // The card-capability plank lives with the rest of its family in
    // `formats/__tests__/cardCapabilities.test.ts`, which sweeps BOTH
    // registries — this pair is collection-only, so the two planks are
    // two tests rather than one.
  });

  it("names no format id in the block-is-not-an-entry discriminant", () => {
    // Same fence, one field over. `nodesNeedTargets` decides whether the
    // AI may nest one card inside another, so a hardcoded list here
    // fails silently in the dangerous direction.
    const permissions = source("src/ai/permissions.ts");
    for (const id of ["sphinx", "jtd", "hugo", "docusaurus"]) {
      expect(permissions).not.toMatch(new RegExp(`["'\`]${id}["'\`]`));
    }
  });
});

describe("presets may never carry the permission", () => {
  it("keeps the preset defaults block two-field", async () => {
    // A preset is an editable instruction template. A template that
    // silently re-enables disk moves is a template with a side effect,
    // so OFF is the only default a run may inherit.
    const { PRESETS } = await import("../presets");
    for (const preset of PRESETS) {
      expect(Object.keys(preset.defaults).sort()).toEqual([
        "allowNewSections",
        "allowRenames",
      ]);
    }
  });
});
