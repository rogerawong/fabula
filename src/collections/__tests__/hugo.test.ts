/**
 * Hugo section-tree adapter (docs/14). Parse laws asserted against
 * VENDORED REAL FILES from kubernetes/website plus a synthetic directory
 * per named hazard, so a failure names the case rather than "the
 * fixture".
 *
 * The laws that are specific to this adapter, and why each is here:
 *   - effective order must be COMPUTED (weight → title → path), because
 *     unlike every prior adapter the published order is not stored;
 *   - leaf-bundle siblings are RESOURCES: a naive scanner invents 629
 *     phantom topics on the real corpus;
 *   - the nav is the directory tree, so a directory with pages and no
 *     `_index.md` is still a section;
 *   - `card.weight` is a decoy and TOML front matter must be refused
 *     rather than misparsed.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { hugoAdapter, partitionLanguages, readHugoConfig } from "../adapters/hugo";
import { deriveSectionOrder, initialColumns } from "@/layout/columns";
import { runCommand } from "@/commands/dispatcher";
import type { EditorState } from "@/commands/types";
import type { Section, TocDocument } from "@/model/types";
import { applyChanges, simulatePlan } from "../verify";
import { filesOf, type FilesSnapshot } from "../types";

// ── fixtures ────────────────────────────────────────────────

const realRaw = import.meta.glob("./fixtures/hugo/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const edgeRaw = import.meta.glob("./fixtures/hugo-edges/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function snapshotFrom(raw: Record<string, string>, prefix: string): FilesSnapshot {
  const files: FilesSnapshot = {};
  for (const [key, content] of Object.entries(raw)) {
    if (key.endsWith("README.md")) continue; // our attribution file
    files[key.replace(prefix, "")] = content;
  }
  return files;
}

const real = () => snapshotFrom(realRaw, "./fixtures/hugo/");
const edges = () => snapshotFrom(edgeRaw, "./fixtures/hugo-edges/");

const titles = (nodes: { title: string }[]) => nodes.map((n) => n.title);

function sectionOf(doc: TocDocument, title: string): Section {
  const s = doc.sections.find((x) => x.title === title);
  if (!s) throw new Error(`section "${title}" not found in ${titles(doc.sections)}`);
  return s;
}

// ── detection ───────────────────────────────────────────────

describe("hugo detect", () => {
  it("claims a Docsy-shaped site from hugo.toml + _index.md sections", () => {
    expect(hugoAdapter.detect(real())).toBeGreaterThan(0.5);
  });

  it("does not claim a folder with no hugo config", () => {
    expect(hugoAdapter.detect({ "docs/a.md": "---\ntitle: A\n---\nbody\n" })).toBe(0);
  });

  it("does not claim a Just-the-Docs folder", () => {
    expect(
      hugoAdapter.detect({
        "_config.yml": "theme: just-the-docs\n",
        "a.md": "---\ntitle: A\nnav_order: 1\n---\n",
      }),
    ).toBe(0);
  });
});

// ── parse: real corpus slice ────────────────────────────────

describe("hugo parse (real kubernetes/website slice)", () => {
  it("builds sections from directories carrying _index.md", () => {
    const { doc } = hugoAdapter.parse(real(), "k8s");
    expect(doc.formatId).toBe("hugo");
    // Section titles come from `_index.md`, NOT the directory name:
    // `setup/` publishes as "Getting started" on kubernetes.io, which is
    // exactly the gap between the filesystem and the sidebar that makes
    // this adapter's parse non-trivial.
    expect(titles(doc.sections)).toContain("Concepts");
    expect(titles(doc.sections)).toContain("Getting started");
    expect(titles(doc.sections)).not.toContain("Setup");
  });

  it("orders top-level sections by their _index.md weight", () => {
    const { doc } = hugoAdapter.parse(real(), "k8s");
    const names = titles(doc.sections);
    // Getting started 20 · Concepts 40
    expect(names.indexOf("Getting started")).toBeLessThan(names.indexOf("Concepts"));
  });

  it("orders a real section by weight, ascending", () => {
    const { doc } = hugoAdapter.parse(real(), "k8s");
    const concepts = sectionOf(doc, "Concepts");
    const arch = concepts.topics.find((t) => t.title === "Cluster Architecture")!;
    // nodes 10 · controller 30 · cgroups 50 · garbage-collection 70
    expect(titles(arch.children)).toEqual([
      "Nodes",
      "Controllers",
      "About cgroup v2",
      "Garbage Collection",
    ]);
  });

  it("uses _index.md as the section's own landing page, never a child", () => {
    const { doc } = hugoAdapter.parse(real(), "k8s");
    const concepts = sectionOf(doc, "Concepts");
    const arch = concepts.topics.find((t) => t.title === "Cluster Architecture")!;
    expect(arch.path).toBe("content/en/docs/concepts/architecture/_index.md");
    expect(titles(arch.children)).not.toContain("Cluster Architecture");
  });
});

// ── the ordering law ────────────────────────────────────────

describe("hugo ordering law (computed, not stored)", () => {
  it("sorts unweighted pages AFTER every weighted page", () => {
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const ordering = sectionOf(doc, "Ordering");
    const names = titles(ordering.topics);
    expect(names.at(-1)).toBe("Unweighted One");
  });

  it("breaks a weight tie by title, ascending", () => {
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const ordering = sectionOf(doc, "Ordering");
    const names = titles(ordering.topics);
    expect(names.indexOf("Tie Apple")).toBeLessThan(names.indexOf("Tie Zebra"));
  });

  it("reads BOTH linkTitle spellings, preferring them over title", () => {
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const names = titles(sectionOf(doc, "Ordering").topics);
    expect(names).toContain("Camel Link");
    expect(names).toContain("Lower Link");
    expect(names.join()).not.toContain("Ignored When LinkTitle Present");
  });

  it("ignores card.weight — it is a decoy, not an ordering key", () => {
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const flags = sectionOf(doc, "Flags");
    const names = titles(flags.topics);
    // weight 4 among 1,2,3,6 — a scanner reading card.weight: 999 would
    // sort it last instead.
    expect(names.indexOf("Card Decoy")).toBeLessThan(names.length - 1);
  });
});

// ── the phantom-topic hazard ────────────────────────────────

describe("hugo leaf bundles (the survey's headline hazard)", () => {
  it("folds a leaf bundle to ONE topic — siblings are resources", () => {
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const bundle = sectionOf(doc, "Bundle Parent");
    const glossary = bundle.topics.find((t) => t.title === "Glossary")!;
    expect(glossary).toBeDefined();
    expect(glossary.children).toEqual([]);
    // the three resource files must not appear anywhere
    const all = JSON.stringify(doc.sections);
    for (const resource of ["aggregate", "cluster", "pod"]) {
      expect(all).not.toContain(`/glossary/${resource}.md`);
    }
  });
});

// ── structural edge cases ───────────────────────────────────

describe("hugo structural edges", () => {
  it("treats a directory with pages and no _index.md as a section", () => {
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const all = JSON.stringify(doc.sections);
    expect(all).toContain("Orphaned Child");
  });

  it("derives a title for a front-matter-less page and flags it", () => {
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const flags = sectionOf(doc, "Flags");
    const derived = flags.topics.find((t) => t.path?.endsWith("no-frontmatter.md"))!;
    expect(derived).toBeDefined();
    expect(derived.titleDerived).toBe(true);
  });

  it("warns on TOML front matter rather than misparsing it", () => {
    const { warnings } = hugoAdapter.parse(edges(), "Edges");
    expect(warnings.some((w) => w.kind === "toml-frontmatter")).toBe(true);
  });

  it("reads a page whose closing fence has a trailing space (issue #1)", () => {
    // The shipped frontmatter scanner returns null for `--- `, losing
    // every key including the title. This adapter must not inherit that.
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const all = JSON.stringify(doc.sections);
    expect(all).toContain("Trailing Space Fence");
  });

  it("reads an ignoreFiles list whose patterns contain brackets", () => {
    // The real k8s list is:
    //   [ "(?:^|/)OWNERS$", "README[-]+[a-z]*\\.md", "^node_modules$",
    //     "content/en/docs/doc-contributor-tools" ]
    // A non-greedy `\[([\s\S]*?)\]` stops at the `]` inside `[-]` and
    // silently drops every pattern after it — the list looks honoured
    // while most of it is gone.
    const cfg = readHugoConfig(real());
    expect(cfg.ignore).toHaveLength(4);
    expect(
      cfg.ignore.some((re) => re.test("content/en/docs/doc-contributor-tools/x.md")),
    ).toBe(true);
  });

  it("drops an ignored directory from the real corpus slice", () => {
    const files = real();
    files["content/en/docs/doc-contributor-tools/_index.md"] =
      "---\ntitle: Doc Contributor Tools\nweight: 90\n---\n";
    const { doc } = hugoAdapter.parse(files, "k8s");
    expect(titles(doc.sections)).not.toContain("Doc Contributor Tools");
  });

  it("honours hugo.toml ignoreFiles", () => {
    const files = edges();
    files["content/en/docs/flags/README-tmp.md"] = "---\ntitle: Should Be Ignored\n---\n";
    files["content/en/docs/flags/OWNERS"] = "approvers:\n  - someone\n";
    const { doc } = hugoAdapter.parse(files, "Edges");
    expect(JSON.stringify(doc.sections)).not.toContain("Should Be Ignored");
  });
});

// ── snapshot ownership (docs/15) ────────────────────────────

describe("hugo keeps the nav, not the file (docs/15)", () => {
  it("stores nav heads — page bodies never enter the session", () => {
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const kept = (doc.extras as { files: FilesSnapshot }).files;
    const page = kept["content/en/docs/ordering/alpha.md"]!;
    expect(page).toBe("---\ntitle: Alpha\nweight: 10\n---");
    expect(page).not.toContain("Body alpha");
  });
});

// ── the round-trip laws ─────────────────────────────────────

describe("hugo round-trip laws", () => {
  const stateOf = (doc: TocDocument): EditorState => ({
    document: doc,
    columns: initialColumns(doc),
    view: { globalDepth: 3, cardDepths: {} },
  });
  const planFor = (files: FilesSnapshot, state: EditorState) =>
    hugoAdapter.planChanges!(files, state.document, deriveSectionOrder(state.columns));

  it("LAW: no model edits → zero changes", () => {
    const files = edges();
    const { doc } = hugoAdapter.parse(files, "Edges");
    expect(planFor(filesOf(doc), stateOf(doc)).changes).toEqual([]);
  });

  it("LAW: no model edits → zero changes, on the REAL corpus slice", () => {
    const files = real();
    const { doc } = hugoAdapter.parse(files, "k8s");
    expect(planFor(filesOf(doc), stateOf(doc)).changes).toEqual([]);
  });

  it("a reorder writes weights, and ONLY to the reordered directory", () => {
    const files = edges();
    const { doc } = hugoAdapter.parse(files, "Edges");
    const kept = filesOf(doc);
    const ordering = sectionOf(doc, "Ordering");

    const state = stateOf(doc);
    const moved = ordering.topics[2]!;
    const { next } = runCommand(state, {
      type: "moveTopics",
      topicIds: [moved.id],
      toSectionId: ordering.id,
      toParentTopicId: null,
      toIndex: 0,
    });
    const { changes, warnings } = planFor(kept, {
      ...next,
      columns: next.columns,
    } as EditorState);

    expect(warnings.filter((w) => w.blocking)).toEqual([]);
    expect(changes.length).toBeGreaterThan(0);
    for (const c of changes) {
      expect("path" in c && c.path.startsWith("content/en/docs/ordering/")).toBe(true);
      expect(c.region).toBe("navHead");
    }
  });

  it("LAW: a removal hides the page and never deletes the file", () => {
    const files = edges();
    const { doc } = hugoAdapter.parse(files, "Edges");
    const kept = filesOf(doc);
    const edited = structuredClone(doc);
    const ordering = edited.sections.find((s) => s.title === "Ordering")!;
    const dropped = ordering.topics[0]!;
    ordering.topics = ordering.topics.slice(1);

    const { changes, warnings } = hugoAdapter.planChanges!(
      kept,
      edited,
      deriveSectionOrder(initialColumns(edited)),
    );
    expect(changes.every((c) => c.kind !== "move")).toBe(true);
    const hidden = changes.find((c) => "path" in c && c.path === dropped.path);
    expect(hidden).toBeDefined();
    expect((hidden as { newContent: string }).newContent).toContain("_build.list");
    // and it says so, rather than hiding a semantic change
    expect(warnings.some((w) => w.kind === "page-hidden")).toBe(true);
  });

  it("LAW: idempotent — replanning over the applied snapshot returns []", () => {
    const files = edges();
    const { doc } = hugoAdapter.parse(files, "Edges");
    const kept = filesOf(doc);
    const edited = structuredClone(doc);
    const ordering = edited.sections.find((s) => s.title === "Ordering")!;
    ordering.topics = [
      ordering.topics[1]!,
      ordering.topics[0]!,
      ...ordering.topics.slice(2),
    ];
    const order = deriveSectionOrder(initialColumns(edited));

    const first = hugoAdapter.planChanges!(kept, edited, order);
    expect(first.changes.length).toBeGreaterThan(0);
    const patched = applyChanges(kept, first.changes);
    const second = hugoAdapter.planChanges!(patched, edited, order);
    expect(second.changes).toEqual([]);
  });

  it("LAW: simulation reproduces the edited order (order is COMPUTED)", () => {
    // The one that matters most here: every other adapter stores order,
    // so re-parsing trivially returns it. Hugo re-derives it from the
    // weights just written, so a wrong weight scheme fails here.
    const files = edges();
    const { doc } = hugoAdapter.parse(files, "Edges");
    const kept = filesOf(doc);
    const edited = structuredClone(doc);
    const ordering = edited.sections.find((s) => s.title === "Ordering")!;
    ordering.topics = [...ordering.topics].reverse();
    const order = deriveSectionOrder(initialColumns(edited));

    const { changes } = hugoAdapter.planChanges!(kept, edited, order);
    const sim = simulatePlan(hugoAdapter, kept, edited, order, changes);
    expect(sim.detail ?? "ok").toBe("ok");
    expect(sim.ok).toBe(true);
  });
});

// ── the property test every collection adapter owes ─────────

describe("property: any editing session yields a safe plan", () => {
  // HEAVY, NOT SLOW (a fast-check property over whole plans). Timed out under machine load at the
  // default 5s while passing in ~0.7s idle; the control group was a
  // clean tree failing identically, so the cause is contention, not a
  // regression. The explicit budget keeps that diagnosis from having to
  // be re-derived from a red suite.
  it(
    "random command sequences → blocking warnings OR (simulation ok ∧ idempotent)",
    { timeout: 20000 },
    () => {
      const base = edges();
      const { doc: parsed } = hugoAdapter.parse(base, "Edges");
      const kept = filesOf(parsed);

      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              section: fc.nat({ max: 3 }),
              from: fc.nat({ max: 6 }),
              to: fc.nat({ max: 6 }),
              rename: fc.boolean(),
            }),
            { maxLength: 6 },
          ),
          (ops) => {
            const doc = structuredClone(parsed);
            for (const [i, op] of ops.entries()) {
              const section = doc.sections[op.section % doc.sections.length];
              if (!section || section.topics.length < 2) continue;
              const from = op.from % section.topics.length;
              const to = op.to % section.topics.length;
              const [moved] = section.topics.splice(from, 1);
              if (!moved) continue;
              if (op.rename) moved.title = `Renamed ${i}`;
              section.topics.splice(to, 0, moved);
            }
            const order = deriveSectionOrder(initialColumns(doc));
            const { changes, warnings } = hugoAdapter.planChanges!(kept, doc, order);
            if (warnings.some((w) => w.blocking)) return true;

            // never delete, always nav-head region
            for (const c of changes) {
              expect(c.kind).not.toBe("move");
              expect(c.region).toBe("navHead");
            }
            const sim = simulatePlan(hugoAdapter, kept, doc, order, changes);
            expect(sim.ok, sim.detail).toBe(true);
            const again = hugoAdapter.planChanges!(
              applyChanges(kept, changes),
              doc,
              order,
            );
            expect(again.changes).toEqual([]);
            return true;
          },
        ),
      );
    },
  );
});

// ── visible-but-marked, and the disclosures ─────────────────

describe("hugo marks pages the site leaves out of nav", () => {
  const flagsOf = (title: string) => {
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    return sectionOf(doc, "Flags").topics.find((x) => x.title === title)!;
  };

  it("marks toc_hide and headless WITHOUT hiding or locking them", () => {
    for (const [title, label, note] of [
      [
        "Hidden Toc",
        "toc_hide",
        "Not in the site's sidebar — still published at its URL. Remove `toc_hide` to list it.",
      ],
      [
        "Headless Page",
        "headless",
        "Not published at all — Hugo builds no URL for it. Remove `headless` to publish it.",
      ],
    ] as const) {
      const topic = flagsOf(title);
      expect(topic, `${title} must stay ON the canvas`).toBeDefined();
      expect(topic.unlisted?.reasons.map((r) => r.label)).toEqual([label]);
      expect(topic.unlisted?.reasons[0]!.note).toBe(note);
      // own flag → glyph channel; nothing above these is hidden
      expect(topic.unlisted?.inheritedFrom).toBeUndefined();
      // a lock means immobile; these are movable, so borrowing lock
      // styling would teach the wrong thing about both
      expect(topic.lock).toBeUndefined();
    }
  });

  it("does NOT mark no_list — it is a listing style, not a visibility flag", () => {
    // Docsy filters the sidebar on toc_hide alone (sidebar-tree.html:87);
    // no_list only selects how a landing page renders its own child list
    // (section-index.html:11). The page is in the sidebar and reachable.
    // Marking it mislabelled 77 pages of kubernetes/website. The earlier
    // assertion here encoded the wrong spec, which is exactly why a
    // fixture suite could not catch it.
    const topic = flagsOf("Not Listed");
    expect(topic).toBeDefined();
    expect(topic.unlisted).toBeUndefined();
  });

  it("names EVERY reason when a page carries more than one flag", () => {
    // kubernetes/website: tasks/tools/included/_index.md is both.
    const topic = flagsOf("Both Flags");
    expect(topic.unlisted?.reasons.map((r) => r.label)).toEqual(["toc_hide", "headless"]);
  });

  it("leaves ordinary pages unmarked", () => {
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    expect(sectionOf(doc, "Ordering").topics.every((t) => !t.unlisted)).toBe(true);
  });

  it("discloses when the config is above the imported folder", () => {
    const files = edges();
    delete files["hugo.toml"];
    const { warnings } = hugoAdapter.parse(files, "Edges");
    const disclosure = warnings.find((w) => w.kind === "hugo-config-missing");
    expect(disclosure).toBeDefined();
    expect(disclosure!.detail).toMatch(/repository root/i);
    expect(disclosure!.blocking).toBeFalsy(); // a limitation, not an error
  });

  it("does NOT invent ignore rules when the config is missing", () => {
    // Guessing which directories a site excludes would quietly add pages
    // the site never publishes.
    const files = edges();
    delete files["hugo.toml"];
    files["content/en/docs/flags/README-tmp.md"] = "---\ntitle: Would Be Ignored\n---\n";
    const { doc } = hugoAdapter.parse(files, "Edges");
    expect(JSON.stringify(doc.sections)).toContain("Would Be Ignored");
  });
});

// ── section-level unlisted (P1) ─────────────────────────────

describe("hugo marks a SECTION the site drops entirely", () => {
  it("marks a section whose _index.md carries toc_hide", () => {
    // Receipt: Docsy filters `union .Pages .Sections` on toc_hide
    // (sidebar-tree.html:87), so the section is dropped as a NODE — the
    // whole subtree goes with it.
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const hidden = sectionOf(doc, "Hidden Section");
    expect(hidden.unlisted?.reasons.map((r) => r.label)).toEqual(["toc_hide"]);
  });

  it("PRODUCER: the same file is a card or a row depending on load root", () => {
    // This is why Section.unlisted is shipped rather than staged. A Hugo
    // section and a nested directory are the same thing; which one it
    // becomes in our model depends only on where the user pointed the
    // importer, so a derivation that covered topics alone would report
    // the same file differently for the same site.
    const deeper: FilesSnapshot = {};
    for (const [path, content] of Object.entries(edges())) {
      if (path.startsWith("content/en/docs/")) {
        deeper[path.replace("content/en/docs/", "")] = content;
      }
    }
    const { doc } = hugoAdapter.parse(deeper, "Rooted lower");
    const asCard = doc.sections.find((s) => s.title === "Hidden Section");
    expect(asCard, "the directory is now a top-level card").toBeDefined();
    expect(asCard!.unlisted?.reasons.map((r) => r.label)).toEqual(["toc_hide"]);
  });

  it("marks descendants as INHERITED — second channel, no glyph", () => {
    // A false PRESENCE claim otherwise: 199 of 1,038 corpus rows sit
    // under a toc_hide'd container and the site never links them.
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const hidden = sectionOf(doc, "Hidden Section");
    const inside = hidden.topics.find((t) => t.title === "Inside Hidden")!;
    // italic channel: inherited, and no flag of its own → no glyph
    expect(inside.unlisted?.inheritedFrom?.via).toBe("Hidden Section");
    expect(inside.unlisted?.reasons).toEqual([]);
  });

  it("inherits all the way down, not just one level", () => {
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const hidden = sectionOf(doc, "Hidden Section");
    const child = hidden.topics.find((t) => t.title === "Child")!;
    const deep = child.children[0]!;
    expect(child.unlisted?.inheritedFrom?.via).toBe("Hidden Section");
    expect(deep.unlisted?.inheritedFrom).toBeDefined();
  });

  it("BOTH channels when a flagged page sits inside a hidden section", () => {
    // The two facts are orthogonal and both get shown: glyph for the
    // page's own flag, italic for the section that hides it. Collapsing
    // them dropped the second on nine `tasks/tools/included/` rows,
    // which then looked like ordinary members of a visible section.
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const hidden = sectionOf(doc, "Hidden Section");
    const flagged = hidden.topics.find((t) => t.title === "Flagged Inside")!;
    expect(flagged.unlisted?.reasons.map((r) => r.label)).toEqual(["headless"]);
    expect(flagged.unlisted?.inheritedFrom?.via).toBe("Hidden Section");
  });

  it("headless does NOT propagate — only toc_hide removes a subtree", () => {
    // Receipt: the sidebar filter is on toc_hide alone. `headless`
    // describes the node itself.
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const flags = sectionOf(doc, "Flags");
    expect(flags.topics.every((t) => t.unlisted?.inheritedFrom === undefined)).toBe(true);
  });
});

// ── .html content pages (docs/14 fast-follow) ───────────────

describe("hugo scans .html content pages", () => {
  it("treats a front-mattered .html as a page", () => {
    // Six real ones in kubernetes/website (the Katacoda
    // "interactive-gone" tutorials). They were all toc_hide, so scanning
    // .md only LOOKED harmless — a missing page is a missing branch
    // regardless of whether the corpus happens to hide it.
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const flags = sectionOf(doc, "Flags");
    const html = flags.topics.find((t) => t.path?.endsWith("gone.html"));
    expect(html, "a front-mattered .html must appear on the canvas").toBeDefined();
    expect(html!.title).toBe("Gone Interactive");
    expect(html!.unlisted?.reasons.map((r) => r.label)).toEqual(["toc_hide"]);
  });

  it("derives a title for an .html page with no front matter", () => {
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const bare = sectionOf(doc, "Flags").topics.find((t) =>
      t.path?.endsWith("bare.html"),
    );
    expect(bare).toBeDefined();
    expect(bare!.titleDerived).toBe(true);
  });

  it("keeps .html nav heads out of the body, like .md", () => {
    const { doc } = hugoAdapter.parse(edges(), "Edges");
    const kept = (doc.extras as { files: FilesSnapshot }).files;
    const head = kept["content/en/docs/flags/gone.html"]!;
    expect(head).toContain("toc_hide");
    expect(head).not.toContain("<p>");
  });
});

// ── sibling languages: declared vs present (docs/14) ────────

describe("hugo sibling languages", () => {
  it("reads each language's OWN contentDir, not the first one's", () => {
    // Every `[languages.xx]` table is read from its own slice; a global
    // regex would give all 17 the first language's contentDir.
    const cfg = readHugoConfig(real());
    expect(cfg.languages.length).toBeGreaterThan(10);
    const en = cfg.languages.find((l) => l.key === "en")!;
    const de = cfg.languages.find((l) => l.key === "de")!;
    expect(en.contentDir).toBe("content/en");
    expect(de.contentDir).toBe("content/de");
    expect(en.label).toBe("English");
  });

  it("never assumes English — the default comes from the config", () => {
    const cfg = readHugoConfig(edges());
    expect(cfg.defaultLanguage).toBe("en"); // declared first in that fixture
    const only = readHugoConfig({
      "hugo.toml":
        'contentDir = "content/fr"\n[languages]\n[languages.fr]\nlanguageName = "Français"\ncontentDir = "content/fr"\n[languages.en]\ncontentDir = "content/en"\n',
    });
    expect(only.defaultLanguage).toBe("fr");
    expect(only.languages[0]!.label).toBe("Français");
  });

  it("PARTITIONS declared from present — 17 declared, 1 on disk", () => {
    // The corpus is a sparse clone and that is the normal case: a folder
    // grant carries what it carries. Counting declared languages is the
    // true fact about the SITE; only present ones can actually open.
    const cfg = readHugoConfig(real());
    const { present, absent } = partitionLanguages(cfg, real());
    expect(present.map((l) => l.key)).toEqual(["en"]);
    expect(absent.length).toBe(cfg.languages.length - 1);
    expect(absent.some((l) => l.key === "de")).toBe(true);
  });

  it("records the loaded language and the present set on the document", () => {
    const { doc } = hugoAdapter.parse(real(), "k8s");
    const hugo = (doc.extras as { hugo: Record<string, unknown> }).hugo;
    expect(hugo.loadedLanguage).toBe("en");
    expect(hugo.presentLanguages).toEqual(["en"]);
    expect((hugo.languages as unknown[]).length).toBeGreaterThan(10);
  });

  it("discloses DECLARED count and says how many are actually here", () => {
    const { warnings } = hugoAdapter.parse(real(), "k8s");
    const w = warnings.find((x) => x.kind === "sibling-languages")!;
    expect(w.detail).toMatch(/languages declared/);
    expect(w.detail).toMatch(/no others in this folder/);
    expect(w.blocking).toBeFalsy();
  });

  it("says nothing for a single-language site", () => {
    const single = {
      "hugo.toml": 'contentDir = "content"\n',
      "content/docs/a.md": "---\ntitle: A\n---\n",
    };
    const { warnings } = hugoAdapter.parse(single, "One");
    expect(warnings.some((w) => w.kind === "sibling-languages")).toBe(false);
  });
});
