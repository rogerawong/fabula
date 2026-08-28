/**
 * JTD adapter conformance: parse against VENDORED REAL FILES from the
 * just-the-docs repo (including the theme's own ambiguity fixtures),
 * plus the round-trip laws:
 *   no edits → [] · minimal touch · rename cascades · move-to-root
 *   grand_parent removal · nav_exclude removals · idempotency ·
 *   verification-by-simulation · byte-level untouched-line law.
 */

import { describe, expect, it } from "vitest";
import { deriveSectionOrder } from "@/layout/columns";
import { initialColumns } from "@/layout/columns";
import { runCommand } from "@/commands/dispatcher";
import type { Command, EditorState } from "@/commands/types";
import type { TocDocument } from "@/model/types";
import { jtdAdapter } from "../adapters/jtd";
import { navHeadOf } from "../navHead";
import { applyChanges, simulatePlan } from "../verify";
import type { FileChange, FilesSnapshot } from "../types";

// ── Load vendored fixtures as a FilesSnapshot ───────────────

const raw = import.meta.glob("./fixtures/jtd/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function snapshot(): FilesSnapshot {
  const files: FilesSnapshot = {};
  for (const [key, content] of Object.entries(raw)) {
    if (key.endsWith("README.md")) continue; // our attribution file
    files[key.replace("./fixtures/jtd/", "")] = content;
  }
  return files;
}

function parseFixture() {
  return jtdAdapter.parse(snapshot(), "JTD Docs");
}

/** Find a topic by title anywhere; returns [sectionId, topicId]. */
function findTopic(doc: TocDocument, title: string): { sectionId: string; id: string } {
  for (const s of doc.sections) {
    const stack = [...s.topics];
    while (stack.length) {
      const t = stack.pop()!;
      if (t.title === title) return { sectionId: s.id, id: t.id };
      stack.push(...t.children);
    }
  }
  throw new Error(`topic ${title} not found`);
}

function section(doc: TocDocument, title: string) {
  const s = doc.sections.find((x) => x.title === title);
  if (!s) throw new Error(`section ${title} not found`);
  return s;
}

/** Run a command against a doc (reusing the real command layer). */
function edit(doc: TocDocument, command: Command): EditorState {
  const state: EditorState = {
    document: doc,
    columns: initialColumns(doc),
    view: { globalDepth: 2, cardDepths: {} },
  };
  const { next, entry } = runCommand(state, command);
  expect(entry, `expected ${command.type} to change state`).not.toBeNull();
  return next;
}

function plan(files: FilesSnapshot, state: EditorState) {
  return jtdAdapter.planChanges!(
    files,
    state.document,
    deriveSectionOrder(state.columns),
  );
}

// ── parse ───────────────────────────────────────────────────

describe("jtd parse (real fixtures)", () => {
  it("assembles the tree that just-the-docs.com renders", () => {
    const { doc } = parseFixture();
    expect(doc.formatId).toBe("jtd");
    expect(doc.sections.map((s) => s.title)).toEqual([
      "Configuration",
      "UI Components",
      "Utilities",
      "Layout",
      "Navigation",
      "Markdown kitchen sink",
    ]);
    const ui = section(doc, "UI Components");
    expect(ui.topics.map((t) => t.title)).toEqual(["Typography", "Buttons", "Code"]);
    // nested chain: Code > Line Numbers
    expect(ui.topics[2]!.children.map((t) => t.title)).toEqual(["Line Numbers"]);
    // synthetic pages attach under Configuration
    const config = section(doc, "Configuration");
    expect(config.topics.map((t) => t.title)).toEqual([
      "CRLF Page",
      "Commented Page",
      "Last Title Wins",
    ]);
  });

  it("orphans, exclusions, ambiguity warnings behave like the theme", () => {
    const { doc, warnings } = parseFixture();
    expect(section(doc, "Markdown kitchen sink").isOrphan).toBe(true);
    // minimal-test.md has nav_exclude: true → absent entirely
    expect(JSON.stringify(doc.sections)).not.toContain("Minimal layout test");
    const kinds = warnings.map((w) => w.kind);
    expect(kinds).toContain("duplicate-title"); // Typography ×2, S/T/U pairs
    // NOTE: the x/y ancestry families fully resolve via the modern
    // `ancestor:` key — no ambiguous-parent warnings for this subset
  });

  it("resolves deep ambiguity via the modern `ancestor:` key", () => {
    const { doc } = parseFixture();
    // yu.md: title U, parent T, ancestor Y → must land under the T of
    // the Y branch, not the X branch
    const nav = section(doc, "Navigation");
    const main = nav.topics.find((t) => t.title === "Main Navigation")!;
    const ancestry = main.children.find((t) => t.title === "Ancestry")!;
    const y = ancestry.children.find((t) => t.title === "Y")!;
    const yS = y.children.find((t) => t.title === "S")!;
    const yT = yS.children.find((t) => t.title === "T")!;
    expect(yT.path).toBe("navigation/main/yt.md");
    expect(yT.children.map((t) => t.path)).toEqual(["navigation/main/yu.md"]);
  });

  it("supports float nav_order (Layout is 4.5 in the wild)", () => {
    const { doc } = parseFixture();
    const titles = doc.sections.map((s) => s.title);
    expect(titles.indexOf("Layout")).toBeGreaterThan(titles.indexOf("Utilities"));
    expect(titles.indexOf("Layout")).toBeLessThan(titles.indexOf("Navigation"));
  });

  it("detects the collection from frontmatter shape", () => {
    expect(jtdAdapter.detect(snapshot())).toBeGreaterThan(0.5);
    expect(jtdAdapter.detect({ "a.md": "# no frontmatter\n" })).toBe(0);
  });
});

// ── the laws ────────────────────────────────────────────────

describe("jtd round-trip laws", () => {
  it("LAW: no model edits → zero changes", () => {
    const files = snapshot();
    const { doc } = jtdAdapter.parse(files, "JTD Docs");
    const state: EditorState = {
      document: doc,
      columns: initialColumns(doc),
      view: { globalDepth: 2, cardDepths: {} },
    };
    expect(plan(files, state).changes).toEqual([]);
  });

  it("a reorder touches ONLY the group's files, only nav_order lines", () => {
    const files = snapshot();
    const { doc } = jtdAdapter.parse(files, "JTD Docs");
    const ui = section(doc, "UI Components");
    // move Buttons to front of UI Components
    const buttons = findTopic(doc, "Buttons");
    const state = edit(doc, {
      type: "moveTopics",
      topicIds: [buttons.id],
      toSectionId: ui.id,
      toParentTopicId: null,
      toIndex: 0,
    });

    const { changes, warnings } = plan(files, state);
    expect(warnings.filter((w) => w.blocking)).toEqual([]);
    const paths = changes.map((c) => (c.kind === "move" ? c.toPath : c.path)).sort();
    // only UI Components' direct children renumber
    expect(paths).toEqual([
      "ui-components/buttons.md",
      "ui-components/code/index.md",
      "ui-components/typography.md",
    ]);
    // byte law: only nav_order lines differ. Compared head-to-head —
    // a plan now carries the NAV HEAD, so diffing it against the whole
    // file would just be measuring the body it deliberately omits.
    for (const change of changes) {
      if (change.kind !== "edit") continue;
      expect(change.region).toBe("navHead");
      const before = navHeadOf(files[change.path]!).split("\n");
      const after = change.newContent.split("\n");
      expect(after.length).toBe(before.length);
      const diffs = before.filter((line, i) => after[i] !== line);
      expect(diffs.length).toBeGreaterThan(0);
      for (const line of diffs) expect(line).toMatch(/^nav_order[ \t]*:/);
    }
  });

  it("renaming a parent cascades to children and grandchildren", () => {
    const files = snapshot();
    const { doc } = jtdAdapter.parse(files, "JTD Docs");
    const ui = section(doc, "UI Components");
    const state = edit(doc, {
      type: "renameSection",
      sectionId: ui.id,
      title: "Components",
    });

    const { changes } = plan(files, state);
    const byPath = new Map(
      changes.map((c) => [c.kind === "move" ? c.toPath : c.path, c]),
    );
    // the page itself
    expect(
      (byPath.get("ui-components/index.md") as { newContent: string }).newContent,
    ).toContain("title: Components");
    // children reparent
    expect(
      (byPath.get("ui-components/buttons.md") as { newContent: string }).newContent,
    ).toContain("parent: Components");
    // grandchild's grand_parent is NOT set (Code is unambiguous) but
    // line-numbers keeps parent: Code untouched
    expect(byPath.has("ui-components/code/line-numbers.md")).toBe(false);
  });

  it("moving a subtree to top level removes stale grand_parent keys", () => {
    const files = snapshot();
    const { doc } = jtdAdapter.parse(files, "JTD Docs");
    // Ancestry (under Navigation > Main Navigation) has the x/y families
    const ancestry = findTopic(doc, "Ancestry");
    const state = edit(doc, {
      type: "moveTopicsToNewSection",
      topicIds: [ancestry.id],
      toColumn: 0,
      toIndexInColumn: 0,
    });

    const { changes } = plan(files, state);
    const x = changes.find(
      (c) => c.kind === "edit" && c.path === "navigation/main/xt.md",
    );
    // xt had grand_parent: X — X's parent becomes Ancestry-at-root's
    // child; grand_parent may update or vanish but must never be stale.
    // The strong assertion is simulation:
    const sim = simulatePlan(
      jtdAdapter,
      files,
      state.document,
      deriveSectionOrder(state.columns),
      changes,
    );
    expect(sim.ok).toBe(true);
    expect(x === undefined || x.kind === "edit").toBe(true);
  });

  it("removing a section nav_excludes every page of its subtree", () => {
    const files = snapshot();
    const { doc } = jtdAdapter.parse(files, "JTD Docs");
    const utilities = section(doc, "Utilities");
    const state = edit(doc, { type: "removeSection", sectionId: utilities.id });

    const { changes } = plan(files, state);
    const paths = changes.map((c) => (c.kind === "move" ? c.toPath : c.path));
    expect(paths).toEqual(
      expect.arrayContaining([
        "utilities/index.md",
        "utilities/color.md",
        "utilities/typography.md",
      ]),
    );
    for (const c of changes) {
      if (c.kind === "edit" && c.path.startsWith("utilities/")) {
        expect(c.newContent).toContain("nav_exclude: true");
      }
    }
  });

  it("new in-app sections become stub files", () => {
    const files = snapshot();
    const { doc } = jtdAdapter.parse(files, "JTD Docs");
    const color = findTopic(doc, "Color");
    const state = edit(doc, {
      type: "moveTopicsToNewSection",
      topicIds: [color.id],
      toColumn: 0,
      toIndexInColumn: 0,
    });
    // leaf → wrapped in a new section titled Color; the topic HAS a
    // backing file so the section is the topic itself at root — no stub
    const noStub = plan(files, state);
    expect(noStub.changes.every((c) => c.kind !== "create")).toBe(true);

    // but an AI-style new grouping (title without backing file) stubs:
    const doc2 = structuredClone(state.document);
    doc2.sections.push({
      id: "new-group",
      title: "Brand New Group",
      topics: [],
    } as never);
    // (empty group would be dropped — give it a child by reference)
    const guides = doc2.sections.find((s) => s.title === "Utilities")!;
    const moved = guides.topics.pop()!;
    doc2.sections.find((s) => s.id === "new-group")!.topics.push(moved);
    const order = [...state.columns.flat(), "new-group"];
    const { changes } = jtdAdapter.planChanges!(files, doc2, order);
    const create = changes.find((c) => c.kind === "create");
    expect(create).toBeDefined();
    expect(create!.newContent).toContain("title: Brand New Group");
  });

  it("LAW: idempotency + simulation for a compound editing session", () => {
    const files = snapshot();
    const { doc } = jtdAdapter.parse(files, "JTD Docs");

    // session: rename UI Components, move Buttons under Utilities,
    // reorder Navigation's children
    let state: EditorState = {
      document: doc,
      columns: initialColumns(doc),
      view: { globalDepth: 2, cardDepths: {} },
    };
    const apply = (cmd: Command) => {
      const { next, entry } = runCommand(state, cmd);
      expect(entry).not.toBeNull();
      state = next;
    };
    apply({
      type: "renameSection",
      sectionId: section(state.document, "UI Components").id,
      title: "Components",
    });
    apply({
      type: "moveTopics",
      topicIds: [findTopic(state.document, "Buttons").id],
      toSectionId: section(state.document, "Utilities").id,
      toParentTopicId: null,
      toIndex: 0,
    });
    apply({
      type: "moveTopics",
      topicIds: [findTopic(state.document, "Ordering Pages").id],
      toSectionId: section(state.document, "Navigation").id,
      toParentTopicId: null,
      toIndex: 0,
    });

    const order = deriveSectionOrder(state.columns);
    const { changes, warnings } = jtdAdapter.planChanges!(files, state.document, order);
    expect(warnings.filter((w) => w.blocking)).toEqual([]);

    // simulation: re-parse of patched files ≡ edited structure
    const sim = simulatePlan(jtdAdapter, files, state.document, order, changes);
    expect(sim.ok).toBe(true);

    // idempotency: planning again over the patched snapshot is empty
    const patched = applyChanges(files, changes);
    const reparsed = jtdAdapter.parse(patched, "JTD Docs");
    const columns2 = initialColumns(reparsed.doc);
    const again = jtdAdapter.planChanges!(
      patched,
      reparsed.doc,
      deriveSectionOrder(columns2),
    );
    expect(again.changes).toEqual([]);
  });

  it("creating colliding parents yields a blocking warning, not corruption", () => {
    const files = snapshot();
    const { doc } = jtdAdapter.parse(files, "JTD Docs");
    // rename "Utilities" to "Configuration" (collides with the root leaf)
    const utilities = section(doc, "Utilities");
    const state = edit(doc, {
      type: "renameSection",
      sectionId: utilities.id,
      title: "Configuration",
    });
    const { warnings } = plan(files, state);
    expect(warnings.some((w) => w.blocking)).toBe(true);
  });
});

describe("property: any editing session yields a safe plan", () => {
  // HEAVY, NOT SLOW (a fast-check property over whole plans). Timed out under machine load at the
  // default 5s while passing in ~0.7s idle; the control group was a
  // clean tree failing identically, so the cause is contention, not a
  // regression. The explicit budget keeps that diagnosis from having to
  // be re-derived from a red suite.
  it(
    "random command sequences → blocking warnings OR (simulation ok ∧ idempotent)",
    { timeout: 20000 },
    async () => {
      const fc = (await import("fast-check")).default;
      const { randomCommand } = await import("@/commands/__tests__/arbitraries");

      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 1, max: 0x7fffffff }), { maxLength: 12 }),
          (seeds) => {
            const files = snapshot();
            const { doc } = jtdAdapter.parse(files, "JTD Docs");
            let state: EditorState = {
              document: doc,
              columns: initialColumns(doc),
              view: { globalDepth: 2, cardDepths: {} },
            };
            for (const seed of seeds) {
              const cmd = randomCommand(state, seed);
              if (!cmd) continue;
              state = runCommand(state, cmd).next;
            }
            const order = deriveSectionOrder(state.columns);
            const { changes, warnings } = jtdAdapter.planChanges!(
              files,
              state.document,
              order,
            );
            if (warnings.some((w) => w.blocking)) return; // plan is blocked — safe

            const sim = simulatePlan(jtdAdapter, files, state.document, order, changes);
            expect(sim.ok).toBe(true);

            const patched = applyChanges(files, changes);
            const reparsed = jtdAdapter.parse(patched, "JTD Docs");
            const again = jtdAdapter.planChanges!(
              patched,
              reparsed.doc,
              deriveSectionOrder(initialColumns(reparsed.doc)),
            );
            expect(again.changes).toEqual([]);
          },
        ),
        { numRuns: 25 },
      );
    },
  );
});

// byte-level law helper is embedded in the reorder test above; ensure
// applyChanges/move handling stays covered:
describe("applyChanges", () => {
  it("applies edits, creates, and moves", () => {
    const files: FilesSnapshot = { "a.md": "A", "b.md": "B" };
    const changes: FileChange[] = [
      { kind: "edit", path: "a.md", newContent: "A2" },
      { kind: "create", path: "c.md", newContent: "C" },
      { kind: "move", fromPath: "b.md", toPath: "sub/b.md", newContent: "B2" },
    ];
    expect(applyChanges(files, changes)).toEqual({
      "a.md": "A2",
      "c.md": "C",
      "sub/b.md": "B2",
    });
  });
});
