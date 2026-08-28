/**
 * Write-back semantics over the in-memory WritableTarget (pickers are
 * not test-drivable): writes, move-as-write+remove, the simultaneity
 * law (a move source another change re-wrote survives), and the full
 * loop — a real planner's changes saved to a target must equal
 * applyChanges' in-memory result byte for byte.
 */

import { describe, expect, it } from "vitest";
import { deriveSectionOrder, initialColumns } from "@/layout/columns";
import { runCommand } from "@/commands/dispatcher";
import type { EditorState } from "@/commands/types";
import { memoryTarget, saveChanges } from "../fsAccess";
import { jtdAdapter } from "../adapters/jtd";
import { applyChanges } from "../verify";
import { toNavHeads } from "../navHead";
import { filesOf, type FileChange, type FilesSnapshot } from "../types";

describe("saveChanges over a WritableTarget", () => {
  it("applies edits, creates, and moves", async () => {
    const target = memoryTarget({ "a.md": "A", "sub/b.md": "B" });
    const changes: FileChange[] = [
      { kind: "edit", path: "a.md", newContent: "A2" },
      { kind: "create", path: "c.md", newContent: "C" },
      { kind: "move", fromPath: "sub/b.md", toPath: "b.md", newContent: "B2" },
    ];
    await saveChanges(target, changes);
    expect(target.files).toEqual({ "a.md": "A2", "c.md": "C", "b.md": "B2" });
  });

  it("LAW: a move source that another change re-wrote survives", async () => {
    const target = memoryTarget({ "a.md": "A", "b.md": "B" });
    const changes: FileChange[] = [
      { kind: "move", fromPath: "a.md", toPath: "b.md", newContent: "A@b" },
      { kind: "move", fromPath: "b.md", toPath: "c.md", newContent: "B@c" },
    ];
    await saveChanges(target, changes);
    expect(target.files).toEqual({ "b.md": "A@b", "c.md": "B@c" });
    // and matches the simulation's own semantics
    expect(applyChanges({ "a.md": "A", "b.md": "B" }, changes)).toEqual(target.files);
  });

  it("full loop: planner changes saved to a target ≡ applyChanges", async () => {
    const files = {
      "a.md": "---\ntitle: Alpha\nnav_order: 1\n---\nbody a\n",
      "b.md": "---\ntitle: Beta\nparent: Alpha\n---\nbody b\n",
      "c.md": "---\ntitle: Gamma\nparent: Alpha\nnav_order: 2\n---\nbody c\n",
    };
    const { doc } = jtdAdapter.parse(files, "Site");
    // The snapshot the app actually carries: nav heads, no bodies.
    const kept = filesOf(doc);
    // remove Beta from the model → nav_exclude edit
    const edited = structuredClone(doc);
    const alpha = edited.sections[0]!;
    alpha.topics = alpha.topics.filter((t) => t.title !== "Beta");
    const order = deriveSectionOrder(initialColumns(edited));
    const { changes } = jtdAdapter.planChanges!(kept, edited, order);
    expect(changes.length).toBeGreaterThan(0);

    const target = memoryTarget(files);
    await saveChanges(target, changes);

    // The law used to be `target.files === applyChanges(...)`, which held
    // while both sides were whole files. Under docs/15 they are
    // deliberately different things — the snapshot is the NAV, the target
    // is the DISK — so the law is restated at the layer where they must
    // still agree: the nav on disk is exactly the nav in the snapshot.
    expect(toNavHeads(target.files)).toEqual(applyChanges(kept, changes));
    expect(target.files["b.md"]).toContain("nav_exclude: true");
    // ...and the half the old law could not have caught: bodies survive.
    expect(target.files["a.md"]).toContain("body a");
    expect(target.files["b.md"]).toContain("body b");
    expect(target.files["c.md"]).toContain("body c");
  });
});

describe("splice-on-save (docs/15)", () => {
  it("writes only the nav head, preserving a body the session never held", async () => {
    const target = memoryTarget({
      "a.md": "---\ntitle: Alpha\nparent: Old\n---\nBody the app never loaded.\n",
    });
    await saveChanges(target, [
      {
        kind: "edit",
        path: "a.md",
        newContent: "---\ntitle: Alpha\nparent: New\n---",
        region: "navHead",
      },
    ]);
    expect(target.files["a.md"]).toBe(
      "---\ntitle: Alpha\nparent: New\n---\nBody the app never loaded.\n",
    );
  });

  it("preserves a body edited AFTER load — the clobber, gone by construction", async () => {
    const target = memoryTarget({
      "a.md": "---\ntitle: Alpha\nparent: Old\n---\nRewritten by a colleague at 10:00.\n",
    });
    // The plan was built at 09:00 from a snapshot that held only the head.
    await saveChanges(target, [
      {
        kind: "edit",
        path: "a.md",
        newContent: "---\ntitle: Alpha\nparent: New\n---",
        region: "navHead",
      },
    ]);
    expect(target.files["a.md"]).toContain("Rewritten by a colleague at 10:00.");
    expect(target.files["a.md"]).toContain("parent: New");
  });

  it("creates a page that does not exist yet", async () => {
    const target = memoryTarget({});
    await saveChanges(target, [
      {
        kind: "create",
        path: "new.md",
        newContent: "---\ntitle: New\n---",
        region: "navHead",
      },
    ]);
    expect(target.files["new.md"]).toBe("---\ntitle: New\n---\n");
  });

  it("moves a page by splicing into the SOURCE file's current bytes", async () => {
    const target = memoryTarget({
      "old/p.md": "---\ntitle: P\nparent: Old\n---\nBody that must travel.\n",
    });
    await saveChanges(target, [
      {
        kind: "move",
        fromPath: "old/p.md",
        toPath: "new/p.md",
        newContent: "---\ntitle: P\nparent: New\n---",
        region: "navHead",
      },
    ]);
    expect(target.files).toEqual({
      "new/p.md": "---\ntitle: P\nparent: New\n---\nBody that must travel.\n",
    });
  });

  it("leaves unmarked changes as whole-file writes", async () => {
    const target = memoryTarget({ "_category_.json": '{"label":"Old"}' });
    await saveChanges(target, [
      { kind: "edit", path: "_category_.json", newContent: '{"label":"New"}' },
    ]);
    expect(target.files["_category_.json"]).toBe('{"label":"New"}');
  });
});

describe("the save→refresh fixpoint (docs/15)", () => {
  // The exact runtime loop from ChangesDialog: filesOf(doc) → plan →
  // saveChanges → applyChanges → refreshCollectionFiles. Refresh SPLICES
  // IN MEMORY rather than re-reading the folder, so this also pins the
  // reason: a post-save re-read would be drift machinery in disguise,
  // silently pulling a concurrent editor's work into our baseline.
  const raw = import.meta.glob("./fixtures/jtd/**/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const onDisk = (): FilesSnapshot => {
    const files: FilesSnapshot = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k.endsWith("README.md")) continue;
      files[k.replace("./fixtures/jtd/", "")] = v;
    }
    return files;
  };

  it("after saving, replanning the same canvas yields NOTHING left to save", async () => {
    const disk = onDisk();
    const { doc } = jtdAdapter.parse(disk, "JTD Docs");
    const kept = filesOf(doc);
    const ui = doc.sections.find((s) => s.title === "UI Components")!;

    const state: EditorState = {
      document: doc,
      columns: initialColumns(doc),
      view: { globalDepth: 2, cardDepths: {} },
    };
    const { next } = runCommand(state, {
      type: "renameSection",
      sectionId: ui.id,
      title: "Components",
    });
    const order = deriveSectionOrder(next.columns);
    const { changes } = jtdAdapter.planChanges!(kept, next.document, order);
    expect(changes.length).toBeGreaterThan(0);

    const target = memoryTarget(disk);
    await saveChanges(target, changes);
    const refreshed = applyChanges(kept, changes);

    // The fixpoint: nothing left to save.
    expect(jtdAdapter.planChanges!(refreshed, next.document, order).changes).toEqual([]);
    // The refreshed snapshot is the nav that is actually on disk.
    expect(refreshed).toEqual(toNavHeads(target.files));
  });

  it("refresh does not absorb a concurrent edit into the baseline", async () => {
    const disk = onDisk();
    const { doc } = jtdAdapter.parse(disk, "JTD Docs");
    const kept = filesOf(doc);
    const ui = doc.sections.find((s) => s.title === "UI Components")!;
    const state: EditorState = {
      document: doc,
      columns: initialColumns(doc),
      view: { globalDepth: 2, cardDepths: {} },
    };
    const { next } = runCommand(state, {
      type: "renameSection",
      sectionId: ui.id,
      title: "Components",
    });
    const order = deriveSectionOrder(next.columns);
    const { changes } = jtdAdapter.planChanges!(kept, next.document, order);

    // Someone adds a page we have never seen, after we loaded.
    const target = memoryTarget({
      ...disk,
      "stranger.md": "---\ntitle: Stranger\n---\nNot ours.\n",
    });
    await saveChanges(target, changes);
    const refreshed = applyChanges(kept, changes);

    // A re-read would have swallowed it; splice-in-memory does not. The
    // stranger stays the folder's business until the next explicit load.
    expect(Object.keys(refreshed)).not.toContain("stranger.md");
    expect(target.files["stranger.md"]).toContain("Not ours.");
  });
});

describe("save-time drift (was the bug; now impossible by construction)", () => {
  // History, because it is the point. This began as an `it.fails`
  // characterization: the snapshot owned WHOLE FILES, every FileChange
  // carried whole-file `newContent` built at load, and so a save wrote
  // 09:00 bytes over whatever was on disk at 10:00 — silently reverting
  // a colleague's body edit. Nothing re-read, hashed, or compared mtimes.
  //
  // No drift guard was added. Under docs/15 the snapshot stopped owning
  // bodies, so there is no stale body left to write back; the assertions
  // below went green as a SIDE EFFECT of that, which is why they assert
  // the outcome and say nothing about the mechanism. Detection would have
  // made this test pass too, and been the wrong fix.
  const raw = import.meta.glob("./fixtures/jtd/**/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  const snapshot = (): FilesSnapshot => {
    const files: FilesSnapshot = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k.endsWith("README.md")) continue;
      files[k.replace("./fixtures/jtd/", "")] = v;
    }
    return files;
  };

  it("does not revert a body edit made between load and save", async () => {
    const atLoad = snapshot();
    const { doc } = jtdAdapter.parse(atLoad, "JTD Docs");
    const ui = doc.sections.find((s) => s.title === "UI Components")!;

    const state: EditorState = {
      document: doc,
      columns: initialColumns(doc),
      view: { globalDepth: 2, cardDepths: {} },
    };
    const { next } = runCommand(state, {
      type: "renameSection",
      sectionId: ui.id,
      title: "Components",
    });
    const { changes } = jtdAdapter.planChanges!(
      atLoad,
      next.document,
      deriveSectionOrder(next.columns),
    );
    const touched = "ui-components/index.md";
    expect(changes.some((c) => "path" in c && c.path === touched)).toBe(true);

    // Someone else edits the body of that file after we loaded it.
    const MARKER = "Rewritten by a colleague at 09:30.";
    const onDisk: FilesSnapshot = {
      ...atLoad,
      [touched]: atLoad[touched]! + `\n${MARKER}\n`,
    };

    const target = memoryTarget(onDisk);
    await saveChanges(target, changes);

    expect(target.files[touched]).toContain("title: Components");
    // Fails today: whole-file newContent reverts the colleague's edit.
    expect(target.files[touched]).toContain(MARKER);
  });
});
