/**
 * runMode.test.ts — the run posture, per dialog open (docs/21,
 * Decision 2).
 *
 * PER-RUN, NEVER DEVICE-PERSISTED (R3): a remembered deviation
 * self-perpetuates invisibly, and the differential workflow depends on
 * a grounded run staying comparable across time. What DOES seed the
 * radio is the tab in front of the user — a visible property of a
 * visible tab, which is seeding rather than persistence, and which R3's
 * reasoning does not reach.
 *
 * A PRESET NEVER SETS THE MODE. A preset is an editable instruction
 * template and stays two-field. The mode is not a permission — but it
 * is not an optimization goal either; it is a run POSTURE, and a preset
 * that flipped it would make "Diátaxis" mean different things on
 * different days.
 */

import { describe, expect, it } from "vitest";
import { PRESETS } from "../presets";
import { configOptions, initialConfig } from "@/view/reorganize/ConfigureView";

describe("the mode joins the request options", () => {
  it("defaults a fresh dialog to Grounded", () => {
    expect(initialConfig([]).mode).toBe("grounded");
    expect(configOptions(initialConfig([])).mode).toBe("grounded");
  });

  it("carries an aspirational choice into the options verbatim", () => {
    const config = { ...initialConfig([]), mode: "aspirational" as const };
    expect(configOptions(config).mode).toBe("aspirational");
  });

  it("is never gated by a document capability, unlike renames or file moves", () => {
    // The mode shapes PROPOSAL SPACE. It authorizes nothing on disk, so
    // there is no capability that could refuse it — the way `allowRenames`
    // is forced off where the format cannot record one.
    const config = { ...initialConfig([]), mode: "aspirational" as const };
    expect(configOptions(config, undefined).mode).toBe("aspirational");
  });
});

describe("seeding from the tab state (re-decision 5)", () => {
  it("seeds Aspirational on a tab whose STATE is Aspirational", () => {
    expect(initialConfig([], "aspirational").mode).toBe("aspirational");
  });

  it("seeds Grounded on a Grounded or Grounded-declined tab", () => {
    expect(initialConfig([], "grounded").mode).toBe("grounded");
    expect(initialConfig([]).mode).toBe("grounded");
  });
});

describe("presets carry instructions, never postures", () => {
  it("no preset's defaults mention the mode", () => {
    // Two-field, asserted rather than described: a third key here is how
    // a template acquires a side effect.
    for (const preset of PRESETS) {
      expect(Object.keys(preset.defaults).sort()).toEqual([
        "allowNewSections",
        "allowRenames",
      ]);
    }
  });
});
