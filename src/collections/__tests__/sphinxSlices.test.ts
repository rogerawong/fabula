/**
 * VENDORED BYTES, not inline snapshots (docs/19's fixtures plan).
 *
 * An inline fixture encodes what someone BELIEVED a corpus looks like,
 * and a belief cannot catch the case where the belief is the bug. Both
 * of these pin a hotfix against real bytes:
 *
 *  - the **cpython slice** for suffix stripping. CPython writes `.rst`
 *    on all 526 of its entries; omitting the strip did not degrade
 *    gracefully, it imported the whole corpus as `missing` rows titled
 *    "Index.Rst" — populated, confident and wrong.
 *  - the **ansible slice** for the root picker. Its `conf.py` chains
 *    `root_doc = master_doc = 'index'` and no `index.rst` exists,
 *    because the Makefile symlinks one at build time.
 */

import { describe, expect, it } from "vitest";
import {
  needsRootChoice,
  rootCandidates,
  sphinxAdapter,
  ROOT_KEY,
} from "../adapters/sphinx";
import type { FilesSnapshot } from "../types";

const raw = import.meta.glob("./fixtures/sphinx-{ansible,cpython}/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function slice(dir: string): FilesSnapshot {
  const files: FilesSnapshot = {};
  const prefix = `./fixtures/${dir}/`;
  for (const [key, text] of Object.entries(raw)) {
    if (key.startsWith(prefix)) files[key.slice(prefix.length)] = text;
  }
  return files;
}

describe("cpython slice — suffixes on entries, from real bytes", () => {
  const files = slice("sphinx-cpython");

  it("vendors the file rather than a belief about it", () => {
    expect(files["contents.rst"]).toBeDefined();
    // The property the hotfix exists for, asserted on the bytes: every
    // entry carries its suffix.
    expect(files["contents.rst"]).toContain("   library/index.rst");
  });

  it("strips the configured suffix when resolving", () => {
    const project: FilesSnapshot = {
      ...files,
      "conf.py": 'master_doc = "contents"\nsource_suffix = ".rst"\n',
      "library/index.rst": "The Library\n===========\n\nbody\n",
    };
    const { doc } = sphinxAdapter.parse(project, "cpython");
    const row = doc.sections[0]!.topics.find((t) => t.path === "library/index");
    expect(row).toBeDefined();
    // Resolved, so NOT a missing placeholder — the whole failure mode.
    expect(row!.lock?.kind).not.toBe("missing");
    expect(row!.title).toBe("The Library");
  });

  it("would have titled it from the path if the strip regressed", () => {
    // The complement, stated so the assertion above cannot pass
    // vacuously: with no such file the row IS missing and IS
    // path-titled, which is exactly what the whole corpus looked like.
    const project: FilesSnapshot = {
      ...files,
      "conf.py": 'master_doc = "contents"\nsource_suffix = ".rst"\n',
    };
    const { doc } = sphinxAdapter.parse(project, "cpython");
    const row = doc.sections[0]!.topics.find((t) => t.path === "library/index");
    expect(row!.lock?.kind).toBe("missing");
  });
});

describe("ansible slice — the picker's own corpus", () => {
  const files = slice("sphinx-ansible");

  it("reads the CHAINED root declaration", () => {
    expect(files["conf.py"]).toContain("root_doc = master_doc = 'index'");
  });

  it("needs a root chosen, because the declared one is generated", () => {
    expect(needsRootChoice(files)).toBe(true);
  });

  it("offers exactly the two top-level roots", () => {
    expect(
      rootCandidates(files)
        .map((c) => c.docname)
        .sort(),
    ).toEqual(["ansible_index", "core_index"]);
  });

  it("imports through the picker path", () => {
    const chosen: FilesSnapshot = { ...files, [ROOT_KEY]: "core_index" };
    const { doc, evidence } = sphinxAdapter.parse(chosen, "ansible");
    expect(doc.sections.length).toBeGreaterThan(0);
    const note = evidence!.find((e) => e.kind === "root-chosen");
    expect(note!.detail).toContain("core_index");
    expect(note!.detail).toContain("index");
  });

  it("says the root is absent when NOTHING was chosen", () => {
    // Today's line, unchanged where there is no choice — the rider is
    // explicit that zero candidates leaves it alone, and so does a user
    // who cancels.
    const { evidence } = sphinxAdapter.parse(files, "ansible");
    expect(evidence!.some((e) => e.kind === "root-document-absent")).toBe(true);
  });
});
