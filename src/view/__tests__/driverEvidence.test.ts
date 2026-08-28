/**
 * The writer reaches further than `parse` (docs/17).
 *
 * Files dropped by `shouldSkipPath` / `ingestible` never reach any
 * adapter, so no adapter can report them. A writer that assumed `parse`
 * saw everything would silently under-report exactly the skips this
 * panel exists to surface — which is the hazard the note names, so it
 * is the test: the driver skips files the adapter never sees, and the
 * evidence must still say so.
 */

import { describe, expect, it } from "vitest";
import { groupIntoEvidence } from "@/collections/importEvidence";
import { driverSkipOccurrences } from "../loadCollection";

/** Grouped exactly as openCollection groups it — same path, same bytes. */
const driverSkipEvidence = (paths: readonly string[]) =>
  groupIntoEvidence(driverSkipOccurrences(paths));

const paths = (...items: string[]) => items;

describe("driver-observed skips", () => {
  it("reports files dropped for living in a build directory", () => {
    const evidence = driverSkipEvidence(
      paths("docs/a.md", "_site/a.md", "node_modules/pkg/readme.md"),
    );
    const skipped = evidence.find((e) => e.kind === "driver-skipped-path");
    expect(skipped?.count).toBe(2);
  });

  it("reports files dropped for being nothing any adapter reads", () => {
    const evidence = driverSkipEvidence(
      paths("docs/a.md", "docs/logo.png", "docs/x.css"),
    );
    const ignored = evidence.find((e) => e.kind === "driver-not-ingestible");
    expect(ignored?.count).toBe(2);
  });

  it("counts a file once, under the reason that dropped it first", () => {
    // A .png inside node_modules is skipped as a build path; counting it
    // twice would make the totals disagree with the folder.
    const evidence = driverSkipEvidence(paths("node_modules/pkg/logo.png", "docs/a.md"));
    expect(evidence.reduce((sum, e) => sum + e.count, 0)).toBe(1);
    expect(evidence[0]?.kind).toBe("driver-skipped-path");
  });

  it("says nothing when every candidate was read", () => {
    expect(driverSkipEvidence(paths("docs/a.md", "docs/b.md"))).toEqual([]);
  });

  it("carries a receipt naming what did the dropping", () => {
    const evidence = driverSkipEvidence(paths("_site/a.md", "docs/a.md"));
    expect(evidence[0]?.receipt).toMatch(/shouldSkipPath/);
  });

  it("names no node, because a skipped file has none", () => {
    // Stat-only by construction: the files are not in the document, so
    // there is nothing on the canvas to focus.
    const evidence = driverSkipEvidence(paths("_site/a.md", "docs/a.md"));
    expect(evidence.every((e) => e.exemplars.length === 0)).toBe(true);
  });

  it("is deterministic — the same folder yields the same bytes", () => {
    const folder = paths("_site/a.md", "docs/logo.png", "docs/a.md", "node_modules/x.md");
    expect(JSON.stringify(driverSkipEvidence(folder))).toBe(
      JSON.stringify(driverSkipEvidence(folder)),
    );
  });
});
