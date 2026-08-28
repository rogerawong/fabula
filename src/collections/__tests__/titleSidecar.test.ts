/**
 * Title sidecar guardrails (docs/12, decision 1). The sidecar is the one
 * synthetic key allowed inside a FilesSnapshot, so the tests that matter
 * are the ones proving it cannot be mistaken for a real file: it must not
 * be producible by a folder walk or a GitHub tree, and it must be
 * strippable before anything reaches a .patch or a disk write.
 */

import { describe, expect, it } from "vitest";
import { filesOf, type FilesSnapshot } from "../types";
import {
  SIDECAR_KEY,
  isSidecarKey,
  readTitles,
  realFiles,
  withTitles,
} from "../titleSidecar";

describe("the reserved key", () => {
  it("cannot be produced by any filesystem path", () => {
    // A NUL byte is rejected by every filesystem and by GitHub's tree API,
    // so collision with a real file is impossible rather than unlikely.
    expect(SIDECAR_KEY).toContain("\u0000");
  });

  it("recognises itself and nothing that merely looks like it", () => {
    expect(isSidecarKey(SIDECAR_KEY)).toBe(true);
    expect(isSidecarKey("toc-fable/titles.json")).toBe(false);
    expect(isSidecarKey("docs/toc-fable/titles.json")).toBe(false);
    expect(isSidecarKey("index.rst")).toBe(false);
    expect(isSidecarKey("")).toBe(false);
  });
});

describe("readTitles / withTitles", () => {
  const base: FilesSnapshot = { "index.rst": "hi", "about/intro.rst": "yo" };

  it("round-trips a title map", () => {
    const titles = { index: "Godot Engine", "about/intro": "Introduction" };
    expect(readTitles(withTitles(base, titles))).toEqual(titles);
  });

  it("returns an empty map when there is no sidecar", () => {
    expect(readTitles(base)).toEqual({});
  });

  it("never throws on a malformed sidecar", () => {
    // A stale localStorage session from an older format must degrade to
    // path-derived titles, not crash the import.
    expect(readTitles({ ...base, [SIDECAR_KEY]: "not json" })).toEqual({});
    expect(readTitles({ ...base, [SIDECAR_KEY]: "[1,2,3]" })).toEqual({});
    expect(readTitles({ ...base, [SIDECAR_KEY]: '{"v":99,"titles":{"a":"b"}}' })).toEqual(
      {},
    );
    expect(readTitles({ ...base, [SIDECAR_KEY]: '{"v":1,"titles":{"a":7}}' })).toEqual(
      {},
    );
  });

  it("leaves the real files untouched and does not mutate the input", () => {
    const before = JSON.stringify(base);
    const next = withTitles(base, { index: "Godot Engine" });
    expect(JSON.stringify(base)).toBe(before);
    expect(next["index.rst"]).toBe("hi");
    expect(next["about/intro.rst"]).toBe("yo");
  });

  it("replaces an existing sidecar rather than nesting one", () => {
    const once = withTitles(base, { index: "First" });
    const twice = withTitles(once, { index: "Second" });
    expect(readTitles(twice)).toEqual({ index: "Second" });
    expect(Object.keys(twice).filter(isSidecarKey)).toHaveLength(1);
  });
});

describe("realFiles", () => {
  it("strips the sidecar so it can never reach a patch or a disk write", () => {
    const withSidecar = withTitles({ "index.rst": "hi" }, { index: "Godot" });
    expect(Object.keys(withSidecar)).toContain(SIDECAR_KEY);
    expect(realFiles(withSidecar)).toEqual({ "index.rst": "hi" });
  });

  it("is a no-op on a snapshot that has none", () => {
    const files = { "a.rst": "1", "b.rst": "2" };
    expect(realFiles(files)).toEqual(files);
  });
});

describe("guardrail 3 — the planChanges/save filter [pinned 2026-08-17]", () => {
  // docs/12's Decisions table lists a "`planChanges`/save filter" among
  // the title sidecar's four shipped guardrails. `realFiles` is that
  // filter and it has NO production call site — only this module and
  // this file. CLAIMED ≠ WIRED.
  //
  // It is not a live defect and the pin says why: Sphinx omits
  // `planChanges`, so no plan exists, so no writer is ever handed a
  // snapshot carrying the reserved key. The guardrail is UNREACHABLE
  // rather than broken — staged, in this project's vocabulary.
  //
  // So this is a TRIPWIRE, not a regression test. It passes today by
  // the absence it asserts, and it fails on the day phase 2 adds
  // `planChanges` without wiring the filter — which is exactly the day
  // the guardrail stops being theoretical.
  it("is unreachable while the adapter has no planner, and says so", async () => {
    const { sphinxAdapter } = await import("../adapters/sphinx");
    if (sphinxAdapter.planChanges === undefined) {
      expect(sphinxAdapter.planChanges).toBeUndefined();
      return;
    }
    // Phase 2 has landed. The filter is now load-bearing: no change a
    // planner emits may name the reserved key, and no writer may be
    // handed it. If this fails, wire `realFiles` at the plan and save
    // boundaries before going further.
    const files = {
      "conf.py": 'master_doc = "index"\nsource_suffix = ".rst"\n',
      "index.rst": ".. toctree::\n\n   a\n",
      "a.rst": "A\n=\n",
    };
    const { doc } = sphinxAdapter.parse(files, "s");
    const snapshot = filesOf(doc);
    expect(Object.keys(snapshot)).toContain(SIDECAR_KEY);
    const { changes } = sphinxAdapter.planChanges(snapshot, doc, [], {});
    const touched = changes.map((c) => (c.kind === "move" ? c.toPath : c.path));
    expect(touched).not.toContain(SIDECAR_KEY);
  });
});
