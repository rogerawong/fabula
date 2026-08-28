/**
 * TAB fidelity in the scanner (docs/19 build step 1, its hazard row).
 *
 * `indentOf` counted a tab as ONE character. docutils does not: it reads
 * every source line through `expandtabs(tab_width)` with a default width
 * of 8, so the indent Sphinx sees and the indent we measured disagree by
 * seven columns on any tab-indented block.
 *
 * That is two defects wearing one cause, and they fail in opposite
 * directions:
 *
 *  - **Emission** — `emitEntry` rebuilt the indent as `" ".repeat(n)`, so
 *    a tab body came back as ONE SPACE. Silent byte corruption in a file
 *    docs/12 promised not to touch. Latent only because phase 1 never
 *    called it; it goes live the day write-back does, which is why this
 *    is build step 1 rather than a hazard row somebody remembers.
 *  - **Reading** — body detection is `indentOf(line) > markerIndent`. A
 *    marker indented three spaces with a tab-indented body measures
 *    1 > 3 and the body is DROPPED, so the block scans as empty and the
 *    subtree vanishes. Shape fidelity, not detail.
 *
 * Subjects: 13 kernel files / 14 blocks, measured with the shipped
 * scanner against `~/linux-docs`. Two of them are vendored under
 * `fixtures/sphinx-kernel/`; `driver-api/media/drivers/index.rst` is the
 * richer one — two tab blocks separated by a section heading, which is
 * also the `navTail` boundary law's own shape.
 */

import { describe, expect, it } from "vitest";
import { emitEntry, scanToctrees } from "../rst";

const kernel = import.meta.glob("./fixtures/sphinx-kernel/**/*.rst", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const TAB = "\t";

describe("a tab-indented block re-emits byte-identically", () => {
  it("writes the tab back, not the one space its width measured", () => {
    const text = `.. toctree::\n${TAB}:maxdepth: 3\n\n${TAB}joystick\n${TAB}joystick-api\n`;
    const lines = text.split("\n");
    const [block] = scanToctrees(text);
    expect(block!.entries.map((e) => e.target)).toEqual(["joystick", "joystick-api"]);
    for (const entry of block!.entries) {
      expect(emitEntry(block!, entry)).toBe(lines[entry.line]);
    }
  });

  it("holds for every entry of every vendored kernel file", () => {
    // The corpus regression the hazard row names. Whole files, so a
    // scanner change that fixes the synthetic case and breaks a real
    // one still fails here.
    let checked = 0;
    for (const [key, text] of Object.entries(kernel)) {
      const lines = text.split("\n");
      for (const block of scanToctrees(text)) {
        for (const entry of block.entries) {
          expect(emitEntry(block, entry), `${key}:${entry.line + 1}`).toBe(
            lines[entry.line],
          );
          checked++;
        }
      }
    }
    // Guards against the fixtures silently disappearing and this test
    // passing on an empty loop. 15 + 4 entries across the two blocks of
    // `drivers/index.rst`, 2 in `joydev/index.rst`, and 46 in
    // `arch/arm/index.rst` — which joined the slice for a different
    // hazard (a DOUBLE blank between entries) and is counted here
    // because this test's claim is about the whole vendored set.
    expect(checked).toBe(67);
  });

  it("preserves a MIXED space-then-tab indent exactly", () => {
    // `"  \t"` is column 8 under tab stops — not 3, and not 2 + 8.
    // Rebuilding it from a width loses which bytes produced it.
    const text = `.. toctree::\n  ${TAB}intro\n`;
    const [block] = scanToctrees(text);
    expect(block!.contentIndent).toBe(8);
    expect(emitEntry(block!, block!.entries[0]!)).toBe(`  ${TAB}intro`);
  });
});

describe("indent is measured in docutils COLUMNS, not characters", () => {
  it("expands a leading tab to the next multiple of eight", () => {
    const [block] = scanToctrees(`.. toctree::\n${TAB}intro\n`);
    expect(block!.contentIndent).toBe(8);
  });

  it("keeps a tab-indented body under a SPACE-indented marker", () => {
    // The reading defect, and the one that loses a branch rather than a
    // byte: at 1 char the body measures shallower than its own marker.
    const text = `.. only:: html\n\n   .. toctree::\n${TAB}:maxdepth: 1\n\n${TAB}intro\n${TAB}guide\n`;
    const [block] = scanToctrees(text);
    expect(block!.markerIndent).toBe(3);
    expect(block!.contentIndent).toBe(8);
    expect(block!.options).toEqual([":maxdepth: 1"]);
    expect(block!.entries.map((e) => e.target)).toEqual(["intro", "guide"]);
  });

  it("expands a tab-indented MARKER to its own column too", () => {
    // Symmetry the comparison needs: a tab marker with a deeper tab body
    // is legal, and measuring the marker in characters would make the
    // body look shallower than it is.
    const text = `.. only:: html\n\n${TAB}.. toctree::\n${TAB}${TAB}intro\n`;
    const [block] = scanToctrees(text);
    expect(block!.markerIndent).toBe(8);
    expect(block!.contentIndent).toBe(16);
    expect(block!.entries.map((e) => e.target)).toEqual(["intro"]);
  });
});
