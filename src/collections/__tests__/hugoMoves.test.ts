/**
 * Cross-directory moves in the Hugo planner (docs/16 step 3).
 *
 * Hugo's membership IS the path, so a reparent moves the file. What that
 * costs — inbound links — is disclosed, never gated: the survey's prose
 * cut says 92% of real moves have at least one inbound link, and a
 * capability that declines nine times in ten is not a capability.
 *
 * Driven against a synthetic tree with one directory per hazard, so a
 * failure names the case rather than "the fixture".
 */

import { describe, expect, it } from "vitest";
import { hugoAdapter } from "../adapters/hugo";
import { deriveSectionOrder, initialColumns } from "@/layout/columns";
import type { Section, TocDocument, Topic } from "@/model/types";
import type { FileChange } from "../types";
import { applyChanges } from "../verify";
import type { FilesSnapshot } from "../types";

const raw = import.meta.glob("./fixtures/hugo-moves/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function snapshot(): FilesSnapshot {
  const files: FilesSnapshot = {};
  for (const [key, content] of Object.entries(raw)) {
    if (key.endsWith("README.md")) continue;
    files[key.replace("./fixtures/hugo-moves/", "")] = content;
  }
  return files;
}

const load = () => {
  const files = snapshot();
  const { doc } = hugoAdapter.parse(files, "moves");
  return { files, doc };
};

const card = (doc: TocDocument, title: string): Section =>
  doc.sections.find((s) => s.title === title)!;

const rowOf = (section: Section, title: string): Topic =>
  section.topics.find((t) => t.title === title)!;

/** Move a row from one card to another, at `at`, as the canvas would. */
function reparent(
  doc: TocDocument,
  fromCard: string,
  rowTitle: string,
  toCard: string,
  at = 0,
): TocDocument {
  const next: TocDocument = structuredClone(doc);
  const source = card(next, fromCard);
  const row = rowOf(source, rowTitle);
  source.topics = source.topics.filter((t) => t.id !== row.id);
  const dest = card(next, toCard);
  dest.topics = [...dest.topics.slice(0, at), row, ...dest.topics.slice(at)];
  return next;
}

const plan = (files: FilesSnapshot, doc: TocDocument) =>
  hugoAdapter.planChanges!(files, doc, deriveSectionOrder(initialColumns(doc)));

const moves = (changes: FileChange[]) =>
  changes.filter((c): c is Extract<FileChange, { kind: "move" }> => c.kind === "move");

const blocking = (warnings: { blocking?: boolean; kind: string }[]) =>
  warnings.filter((w) => w.blocking).map((w) => w.kind);

describe("the capability is on, and a plain page moves", () => {
  it("declares reparenting supported", () => {
    expect(hugoAdapter.supportsReparent).toBe(true);
  });

  it("emits ONE move for one dragged row", () => {
    const { files, doc } = load();
    const result = plan(files, reparent(doc, "Tasks", "Beta", "Guides"));
    expect(blocking(result.warnings)).toEqual([]);
    const m = moves(result.changes);
    expect(m).toHaveLength(1);
    expect(m[0]!.fromPath).toBe("content/docs/tasks/beta.md");
    expect(m[0]!.toPath).toBe("content/docs/guides/beta.md");
  });

  it("keeps the FILENAME, because a move is not a slug rename", () => {
    // 368 slug renames in the survey, a different operation with no
    // gesture on this canvas. Naming the difference is what stops the
    // two being folded together because both emit FileChange.move.
    const { files, doc } = load();
    const m = moves(plan(files, reparent(doc, "Tasks", "Beta", "Guides")).changes);
    expect(m[0]!.toPath.split("/").pop()).toBe("beta.md");
  });

  it("carries region navHead across the move", () => {
    // The splice×move seam: at save the writer reads bytes at the OLD
    // path and writes the head at the new one.
    const { files, doc } = load();
    const m = moves(plan(files, reparent(doc, "Tasks", "Beta", "Guides")).changes);
    expect(m[0]!.region).toBe("navHead");
  });

  it("conserves the path multiset — nothing gained, lost or duplicated", () => {
    // The docs/10 net extended from entries to paths: this is what
    // catches a bundle half-moved.
    const { files, doc } = load();
    const result = plan(files, reparent(doc, "Tasks", "Beta", "Guides"));
    const after = applyChanges(files, result.changes);
    const before = new Set(Object.keys(files));
    const now = new Set(Object.keys(after));
    expect(now.size).toBe(before.size);
    expect(now.has("content/docs/guides/beta.md")).toBe(true);
    expect(now.has("content/docs/tasks/beta.md")).toBe(false);
  });
});

describe("weight at the destination", () => {
  it("gives the moved page a weight among its NEW neighbours", () => {
    const { files, doc } = load();
    const result = plan(files, reparent(doc, "Tasks", "Beta", "Guides", 0));
    const after = applyChanges(files, result.changes);
    const landed = after["content/docs/guides/beta.md"]!;
    expect(landed).toMatch(/weight:/);
  });

  it("leaves untouched neighbours BYTE-IDENTICAL", () => {
    // The no-touch law. A neighbour is rewritten only when the plan says
    // so, and then it is its own line in Review.
    const { files, doc } = load();
    const result = plan(files, reparent(doc, "Tasks", "Beta", "Guides", 0));
    const after = applyChanges(files, result.changes);
    expect(after["content/docs/tasks/alpha.md"]).toBe(
      files["content/docs/tasks/alpha.md"],
    );
    expect(after["content/docs/tasks/gamma.md"]).toBe(
      files["content/docs/tasks/gamma.md"],
    );
  });

  it("discloses the all-unweighted destination as the multi-file edit it is", () => {
    // Dropping into a section where nothing carries a weight, anywhere
    // but first, forces weights onto pages that had none — a weighted
    // page sorts before every unweighted one. Review must show that as
    // several files, never folded into "1 file changed".
    const { files, doc } = load();
    const result = plan(files, reparent(doc, "Tasks", "Beta", "Guides", 1));
    const touched = result.changes.map((c) => (c.kind === "move" ? c.toPath : c.path));
    expect(touched).toContain("content/docs/guides/beta.md");
    // `one.md` precedes the landing slot and had no weight, so it has to
    // gain one for the order to be expressible at all.
    expect(touched).toContain("content/docs/guides/one.md");
    expect(touched.length).toBeGreaterThan(1);
  });
});

describe("the three refusals", () => {
  it("refuses a leaf bundle, from the snapshot alone", () => {
    const { files, doc } = load();
    const result = plan(files, reparent(doc, "Bundle", "Leafy", "Guides"));
    expect(blocking(result.warnings)).toContain("leaf-bundle-move");
    expect(moves(result.changes)).toHaveLength(0);
  });

  it("names resources as the reason, not a capability gap", () => {
    const { files, doc } = load();
    const result = plan(files, reparent(doc, "Bundle", "Leafy", "Guides"));
    const w = result.warnings.find((x) => x.kind === "leaf-bundle-move");
    expect(w?.detail).toMatch(/resources/i);
  });

  it("refuses a move onto an existing path", () => {
    const { files, doc } = load();
    const result = plan(files, reparent(doc, "Tasks", "Alpha", "Collide"));
    expect(blocking(result.warnings)).toContain("move-path-collision");
    expect(moves(result.changes)).toHaveLength(0);
  });

  it("refuses a URL collision a slug already claims", () => {
    // Path is free; the address is not. Plan-time only — the drag does
    // not hold the whole document.
    const files = snapshot();
    files["content/docs/guides/beta.md"] = undefined as unknown as string;
    delete files["content/docs/guides/beta.md"];
    files["content/docs/guides/taken.md"] = "---\ntitle: Taken\nslug: beta\n---\nx\n";
    const { doc } = hugoAdapter.parse(files, "moves");
    const result = plan(files, reparent(doc, "Tasks", "Beta", "Guides"));
    expect(blocking(result.warnings)).toContain("move-url-collision");
  });

  it("refuses two pages landing on one path in the same plan", () => {
    // Two same-named pages dragged into one card is one gesture
    // repeated, not a hypothetical.
    const files = snapshot();
    files["content/docs/aliased/beta.md"] = "---\ntitle: Beta Two\nweight: 20\n---\nx\n";
    const { doc } = hugoAdapter.parse(files, "moves");
    let edited = reparent(doc, "Tasks", "Beta", "Guides");
    edited = reparent(edited, "Aliased", "Beta Two", "Guides");
    const result = plan(files, edited);
    expect(blocking(result.warnings)).toContain("move-path-collision");
  });
});

describe("no refusal ever cites a link count", () => {
  it("keeps every blocking reason free of inbound-link language", () => {
    // The fence, asserted where a refusal is actually produced: the
    // index INFORMS and never GATES, and gating on it would refuse 92%
    // of real moves on evidence that went stale at import.
    const { files, doc } = load();
    const result = plan(files, reparent(doc, "Bundle", "Leafy", "Guides"));
    for (const w of result.warnings.filter((x) => x.blocking)) {
      expect(w.detail).not.toMatch(/inbound|link count|links point/i);
    }
  });
});

describe("idempotence across a move", () => {
  it("re-planning a moved corpus proposes nothing", () => {
    const { files, doc } = load();
    const result = plan(files, reparent(doc, "Tasks", "Beta", "Guides", 0));
    const after = applyChanges(files, result.changes);
    const reparsed = hugoAdapter.parse(after, "moves");
    const again = plan(after, reparsed.doc);
    expect(again.changes).toEqual([]);
  });
});

describe("alias-on-move (docs/16 option 2.5)", () => {
  const aliasesIn = (content: string): string[] =>
    [...content.matchAll(/^- (\/.*)$/gm)].map((m) => m[1]!);

  it("writes the old URL as a redirect on the moved page's own file", () => {
    // Front matter, so it is inside the ownership law: the moved page's
    // own nav head, the same edit the move already makes for its weight.
    // Zero body reads, zero foreign files touched.
    const { files, doc } = load();
    const result = plan(files, reparent(doc, "Tasks", "Beta", "Guides"));
    const after = applyChanges(files, result.changes);
    expect(aliasesIn(after["content/docs/guides/beta.md"]!)).toContain(
      "/docs/tasks/beta/",
    );
  });

  it("touches no file but the one that moved", () => {
    const { files, doc } = load();
    const result = plan(files, reparent(doc, "Tasks", "Beta", "Guides", 0));
    for (const change of result.changes) {
      const path = change.kind === "move" ? change.fromPath : change.path;
      if (path === "content/docs/tasks/beta.md") continue;
      const content = change.newContent;
      expect(content).not.toMatch(/^aliases:/m);
    }
  });

  it("PREPENDS, so redirects a page already declared survive", () => {
    // Overwriting would silently retire someone else's 301.
    const { files, doc } = load();
    const result = plan(files, reparent(doc, "Aliased", "With Alias", "Guides"));
    const after = applyChanges(files, result.changes);
    const list = aliasesIn(after["content/docs/guides/withalias.md"]!);
    expect(list).toContain("/docs/aliased/withalias/");
    expect(list).toContain("/docs/somewhere-old/");
    expect(list.indexOf("/docs/aliased/withalias/")).toBeLessThan(
      list.indexOf("/docs/somewhere-old/"),
    );
  });

  it("can be turned off at the plan level, and then writes none", () => {
    // One decision for forty moves: the survey's bursts are why this is
    // plan-level rather than per-drag.
    const { files, doc } = load();
    const edited = reparent(doc, "Tasks", "Beta", "Guides");
    const result = hugoAdapter.planChanges!(
      files,
      edited,
      deriveSectionOrder(initialColumns(edited)),
      { writeAliases: false },
    );
    const after = applyChanges(files, result.changes);
    expect(after["content/docs/guides/beta.md"]).not.toMatch(/^aliases:/m);
  });

  it("defaults ON when no options are passed", () => {
    const { files, doc } = load();
    const result = plan(files, reparent(doc, "Tasks", "Beta", "Guides"));
    const after = applyChanges(files, result.changes);
    expect(after["content/docs/guides/beta.md"]).toMatch(/^aliases:/m);
  });

  it("refuses an alias another page's permalink already claims", () => {
    // Condition 3 of the five the redirects template errors on. A page
    // whose slug publishes at the OLD url means the redirect would
    // shadow a live page.
    // `other.md` sets slug: beta, so it publishes at /docs/tasks/beta/
    // alongside beta.md. Once beta moves away, `other` legitimately owns
    // that URL and a redirect back to it would shadow a live page.
    const files = snapshot();
    files["content/docs/tasks/other.md"] =
      "---\ntitle: Other\nweight: 25\nslug: beta\n---\nAlso at /docs/tasks/beta/.\n";
    const { doc } = hugoAdapter.parse(files, "moves");
    const result = plan(files, reparent(doc, "Tasks", "Beta", "Guides"));
    const declined = result.warnings.find((w) => w.kind === "alias-not-written");
    expect(declined).toBeDefined();
    expect(declined?.detail).toMatch(/already publishes/);
  });

  it("refuses an alias another page already redirects from", () => {
    // Condition 4. Aliases are front matter, so they are in the nav
    // heads already kept — no new reads to answer this.
    const files = snapshot();
    files["content/docs/guides/claimer.md"] =
      "---\ntitle: Claimer\nweight: 5\naliases:\n- /docs/tasks/beta/\n---\nx\n";
    const { doc } = hugoAdapter.parse(files, "moves");
    const result = plan(files, reparent(doc, "Tasks", "Beta", "Guides"));
    const declined = result.warnings.find((w) => w.kind === "alias-not-written");
    expect(declined?.detail).toMatch(/already redirects/);
  });

  it("SOUNDNESS: no alias a plan writes collides with anything post-plan", () => {
    // The invariant behind the five conditions, asserted over the whole
    // fixture tree rather than per case: after applying the plan, every
    // written alias addresses nothing that exists.
    const { files, doc } = load();
    for (const row of ["Beta", "Gamma", "Delta"]) {
      const result = plan(files, reparent(doc, "Tasks", row, "Guides"));
      const after = applyChanges(files, result.changes);
      const reparsed = hugoAdapter.parse(after, "moves");

      const permalinks = new Set<string>();
      const walk = (topics: Topic[]): void => {
        for (const t of topics) {
          if (t.path) {
            permalinks.add(
              "/" + t.path.replace(/^content\//, "").replace(/\.md$/, "") + "/",
            );
          }
          walk(t.children);
        }
      };
      for (const section of reparsed.doc.sections) walk(section.topics);

      const written = Object.values(after)
        .flatMap((content) => [...content.matchAll(/^- (\/.*)$/gm)])
        .map((m) => m[1]!);
      for (const alias of written) {
        expect(alias).not.toMatch(/\s/); // condition 1
        expect(permalinks.has(alias)).toBe(false); // conditions 2 and 3
      }
    }
  });

  it("never blocks on an alias it declined to write", () => {
    const { files, doc } = load();
    const result = plan(files, reparent(doc, "Tasks", "Beta", "Guides"));
    for (const w of result.warnings) {
      if (w.kind === "alias-not-written") expect(w.blocking).not.toBe(true);
    }
  });

  it("stays idempotent — re-planning adds no second alias", () => {
    const { files, doc } = load();
    const result = plan(files, reparent(doc, "Tasks", "Beta", "Guides"));
    const after = applyChanges(files, result.changes);
    const again = hugoAdapter.parse(after, "moves");
    const second = plan(after, again.doc);
    expect(second.changes).toEqual([]);
  });
});

describe("disableAliases is disclosed, never obeyed", () => {
  it("reports what was observed and calls an unconsumed alias inert", () => {
    // The premise docs/16 corrected: the setting stops the HTML stubs,
    // not the aliases. Both real sites that set it pair it with a
    // redirects template. The app cannot verify that — layouts/ is not
    // ingested — so it reports rather than infers.
    const files = snapshot();
    files["hugo.toml"] = files["hugo.toml"] + "\ndisableAliases = true\n";
    const { doc } = hugoAdapter.parse(files, "moves");
    const result = plan(files, reparent(doc, "Tasks", "Beta", "Guides"));
    const w = result.warnings.find((x) => x.kind === "aliases-disabled-in-config");
    expect(w).toBeDefined();
    expect(w?.blocking).not.toBe(true);
    expect(w?.detail).toMatch(/inert/);
  });

  it("still writes the alias when the setting is on", () => {
    const files = snapshot();
    files["hugo.toml"] = files["hugo.toml"] + "\ndisableAliases = true\n";
    const { doc } = hugoAdapter.parse(files, "moves");
    const result = plan(files, reparent(doc, "Tasks", "Beta", "Guides"));
    const after = applyChanges(files, result.changes);
    expect(after["content/docs/guides/beta.md"]).toMatch(/^aliases:/m);
  });
});

describe("new sections: create plus populate, in ONE plan", () => {
  /** Add a card with no path — what the canvas produces — and fill it. */
  function withNewSection(doc: TocDocument, title: string, rowTitle: string) {
    const next: TocDocument = structuredClone(doc);
    const source = card(next, "Tasks");
    const row = rowOf(source, rowTitle);
    source.topics = source.topics.filter((t) => t.id !== row.id);
    next.sections.push({ id: `new-${title}`, title, topics: [row] });
    return next;
  }

  it("creates the section's _index.md and moves its topic in one plan", () => {
    // A section's purpose is receiving topics: the create alone produces
    // a card that can never be filled, and the moves alone write pages
    // into a directory with no landing page.
    const { files, doc } = load();
    const result = plan(files, withNewSection(doc, "Operations", "Beta"));
    expect(blocking(result.warnings)).toEqual([]);
    const created = result.changes.filter((c) => c.kind === "create");
    expect(created.map((c) => (c.kind === "create" ? c.path : ""))).toEqual([
      "content/docs/operations/_index.md",
    ]);
    const m = moves(result.changes);
    expect(m).toHaveLength(1);
    expect(m[0]!.toPath).toBe("content/docs/operations/beta.md");
  });

  it("slugs the directory, because the directory name IS the URL segment", () => {
    const { files, doc } = load();
    const result = plan(files, withNewSection(doc, "Day 2 Operations!", "Beta"));
    const created = result.changes.find((c) => c.kind === "create");
    expect(created && created.kind === "create" ? created.path : "").toBe(
      "content/docs/day-2-operations/_index.md",
    );
  });

  it("gives the new section a title AND a weight, so it holds its place", () => {
    const { files, doc } = load();
    const result = plan(files, withNewSection(doc, "Operations", "Beta"));
    const created = result.changes.find((c) => c.kind === "create");
    const content = created && created.kind === "create" ? created.newContent : "";
    expect(content).toMatch(/title: Operations/);
    expect(content).toMatch(/weight: \d+/);
  });

  it("refuses a title with no usable characters rather than creating a nameless dir", () => {
    const { files, doc } = load();
    const result = plan(files, withNewSection(doc, "!!!", "Beta"));
    expect(blocking(result.warnings)).toContain("new-section-unnameable");
  });

  it("refuses to create over an existing landing page", () => {
    // Overwriting a real _index.md is the one thing a create must never
    // do, and the canvas cannot see that the directory exists.
    const { files, doc } = load();
    const result = plan(files, withNewSection(doc, "Guides", "Beta"));
    expect(blocking(result.warnings)).toContain("new-section-collision");
  });

  it("stays idempotent: re-planning the created tree proposes nothing", () => {
    const { files, doc } = load();
    const result = plan(files, withNewSection(doc, "Operations", "Beta"));
    const after = applyChanges(files, result.changes);
    const again = hugoAdapter.parse(after, "moves");
    expect(plan(after, again.doc).changes).toEqual([]);
  });
});

describe("dissolution: an emptied section keeps its directory", () => {
  it("discloses the retained directory rather than deleting it", () => {
    // Files are never deleted, and a section IS a directory, so
    // dissolution has nothing to delete. The empty card is the
    // disclosure — a section that vanished while its directory survived
    // would be the canvas lying about the file tree.
    const { files, doc } = load();
    const edited: TocDocument = structuredClone(doc);
    const tasks = card(edited, "Tasks");
    const guides = card(edited, "Guides");
    guides.topics = [...guides.topics, ...tasks.topics];
    tasks.topics = [];
    const result = plan(files, edited);
    const note = result.warnings.find((w) => w.kind === "section-emptied");
    expect(note?.detail).toMatch(/section emptied — directory retained/);
    expect(note?.detail).toMatch(/content\/docs\/tasks\//);
    expect(note?.blocking).not.toBe(true);
  });

  it("says nothing about a section that ARRIVED empty", () => {
    // EMPTY and EMPTIED are two states, and only the second is news.
    // The fixture now carries a landing-only section for this, because
    // the first version of this test asserted over a document where NO
    // section was empty — so it passed whether the guard existed or not.
    // A surviving mutant said so; the same empty-vs-emptied distinction
    // the container guard needed, found the same way.
    const { files, doc } = load();
    expect(card(doc, "Landing Only").topics).toEqual([]);
    const result = plan(files, structuredClone(doc));
    expect(result.warnings.find((w) => w.kind === "section-emptied")).toBeUndefined();
  });

  it("distinguishes the two in ONE plan: one arrived empty, one was emptied", () => {
    // The discriminating case. Both cards are empty when the planner
    // looks; only one of them was emptied by this edit.
    const { files, doc } = load();
    const edited: TocDocument = structuredClone(doc);
    const tasks = card(edited, "Tasks");
    const guides = card(edited, "Guides");
    guides.topics = [...guides.topics, ...tasks.topics];
    tasks.topics = [];
    const emptied = plan(files, edited).warnings.filter(
      (w) => w.kind === "section-emptied",
    );
    expect(emptied).toHaveLength(1);
    expect(emptied[0]?.detail).toMatch(/content\/docs\/tasks\//);
    expect(emptied[0]?.detail).not.toMatch(/landing/);
  });
});
