/**
 * The shared link harvester (docs/16 step 2).
 *
 * Evidence, not a selector: the bodies it is derived from are gone after
 * import, so it cannot be recomputed — docs/17's classifier puts it in
 * Tier 2 by that test alone.
 *
 * The load-bearing property is the fence, and it is asserted here rather
 * than described: this index INFORMS and never GATES. Bodies change
 * after import (docs/15's baseline-is-not-a-mirror), so a refusal citing
 * a count would claim authority the data cannot back — the sealed /
 * all-rows-locked shape the project already has a receipt for.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildLinkIndex,
  MAX_EXEMPLARS,
  stampLinkIndex,
  UNSTAMPED,
  type LinkSpecies,
} from "../linkIndex";

/** A site-path species over a tiny two-directory corpus. */
const urlOf = (path: string): string =>
  `/${path.replace(/^content\/en\//, "").replace(/\.md$/, "")}/`;

const sitePath = (pages: readonly string[]): LinkSpecies => {
  const byUrl = new Map(pages.map((p) => [urlOf(p), p]));
  return {
    name: "absolute-site-path",
    find: (body) => [...body.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]!),
    resolve: (raw) => byUrl.get(raw) ?? null,
  };
};

const PAGES = [
  "content/en/docs/tasks/alpha.md",
  "content/en/docs/tasks/beta.md",
  "content/en/docs/concepts/gamma.md",
];

const build = (bodies: Record<string, string>, pages = PAGES) =>
  buildLinkIndex({
    bodies: Object.entries(bodies),
    species: [sitePath(pages)],
    observedAt: "2026-08-16T00:00:00.000Z",
  });

describe("counting inbound edges", () => {
  it("counts a link from one page to another", () => {
    const index = build({
      "content/en/docs/tasks/alpha.md": "see [beta](/docs/tasks/beta/)",
      "content/en/docs/tasks/beta.md": "no links",
    });
    expect(index.targets["content/en/docs/tasks/beta.md"]?.n).toBe(1);
  });

  it("counts INSTANCES, so a page linking twice counts twice", () => {
    // The survey's 8,002 edges are resolved link instances, and the
    // label says "12 inbound links" — both mean occurrences. `from`
    // answers the different question of WHICH pages, deduplicated.
    const index = build({
      "content/en/docs/tasks/alpha.md":
        "[b](/docs/tasks/beta/) and again [b](/docs/tasks/beta/)",
    });
    const entry = index.targets["content/en/docs/tasks/beta.md"];
    expect(entry?.n).toBe(2);
    expect(entry?.from).toHaveLength(1);
  });

  it("ignores a page linking to itself", () => {
    // Not an inbound edge from elsewhere, and a move does not break it:
    // the link travels with the file.
    const index = build({
      "content/en/docs/tasks/alpha.md": "[me](/docs/tasks/alpha/)",
    });
    expect(index.targets["content/en/docs/tasks/alpha.md"]).toBeUndefined();
  });

  it("ignores a target that resolves to nothing", () => {
    // 93.5% resolution on the real corpus. The residue is silently not
    // counted, which is why `species` exists — a reader can tell what is
    // NOT counted rather than reading a low number as "few links".
    const index = build({
      "content/en/docs/tasks/alpha.md": "[gone](/docs/nowhere/)",
    });
    expect(Object.keys(index.targets)).toEqual([]);
  });

  it("emits no entry at all for a page nothing links to", () => {
    // One entry per page WITH an inbound link — the bound is by
    // construction, not by a cap someone has to remember.
    const index = build({
      "content/en/docs/tasks/alpha.md": "[beta](/docs/tasks/beta/)",
    });
    expect(Object.keys(index.targets)).toEqual(["content/en/docs/tasks/beta.md"]);
  });
});

describe("exemplars are bounded and cannot desync", () => {
  const many = (): Record<string, string> => {
    const pages = Array.from({ length: 30 }, (_, i) => `content/en/docs/s${i}.md`);
    const bodies: Record<string, string> = {};
    for (const p of pages) bodies[p] = "[t](/docs/target/)";
    return bodies;
  };
  const pagesWithTarget = [
    ...Array.from({ length: 30 }, (_, i) => `content/en/docs/s${i}.md`),
    "content/en/docs/target.md",
  ];

  it("caps `from` at the existing exemplar constant while `n` stays exact", () => {
    const index = build(many(), pagesWithTarget);
    const entry = index.targets["content/en/docs/target.md"];
    expect(entry?.n).toBe(30);
    expect(entry?.from).toHaveLength(MAX_EXEMPLARS);
  });

  it("stores sources as indices into the index's OWN path table", () => {
    // Indices into an external list — the snapshot's key order — would
    // silently repoint every exemplar the day anything filters the kept
    // set. A table the index carries cannot desync from itself.
    const index = build({
      "content/en/docs/tasks/alpha.md": "[beta](/docs/tasks/beta/)",
    });
    const entry = index.targets["content/en/docs/tasks/beta.md"]!;
    expect(entry.from.every((i) => Number.isInteger(i))).toBe(true);
    expect(index.paths[entry.from[0]!]).toBe("content/en/docs/tasks/alpha.md");
  });
});

describe("deterministic, so the fixpoint suites cover it free", () => {
  it("produces byte-identical JSON on two runs of the same input", () => {
    const bodies = {
      "content/en/docs/tasks/alpha.md":
        "[b](/docs/tasks/beta/) [g](/docs/concepts/gamma/)",
      "content/en/docs/concepts/gamma.md": "[b](/docs/tasks/beta/)",
    };
    expect(JSON.stringify(build(bodies))).toBe(JSON.stringify(build(bodies)));
  });

  it("does not depend on the order the bodies arrive in", () => {
    const entries: [string, string][] = [
      ["content/en/docs/tasks/alpha.md", "[b](/docs/tasks/beta/)"],
      ["content/en/docs/concepts/gamma.md", "[b](/docs/tasks/beta/)"],
    ];
    const forward = buildLinkIndex({
      bodies: entries,
      species: [sitePath(PAGES)],
      observedAt: "x",
    });
    const backward = buildLinkIndex({
      bodies: [...entries].reverse(),
      species: [sitePath(PAGES)],
      observedAt: "x",
    });
    expect(JSON.stringify(forward)).toBe(JSON.stringify(backward));
  });
});

describe("provenance is stamped, and absence is legible", () => {
  it("records when it was observed, so every count can say 'as of import'", () => {
    expect(build({}).observedAt).toBe("2026-08-16T00:00:00.000Z");
  });

  it("records the species it recognised, so a zero is readable", () => {
    expect(build({}).species).toEqual(["absolute-site-path"]);
  });

  it("counts more than one species into the same target", () => {
    // Hugo has two that a move affects. They share a count because they
    // are the same question — how many links point here — and they are
    // named separately because they break differently.
    const refs: LinkSpecies = {
      name: "ref-shortcode",
      find: (body) =>
        [...body.matchAll(/\{\{<\s*ref\s+"([^"]+)"\s*>\}\}/g)].map((m) => m[1]!),
      resolve: (raw) => (PAGES.includes(raw) ? raw : null),
    };
    const index = buildLinkIndex({
      bodies: [
        [
          "content/en/docs/tasks/alpha.md",
          '[b](/docs/tasks/beta/) {{< ref "content/en/docs/tasks/beta.md" >}}',
        ],
      ],
      species: [sitePath(PAGES), refs],
      observedAt: "x",
    });
    expect(index.targets["content/en/docs/tasks/beta.md"]?.n).toBe(2);
    expect(index.species).toEqual(["absolute-site-path", "ref-shortcode"]);
  });
});

describe("the fence: INFORMS, never GATES", () => {
  // Prose cannot hold this — the violating line is one line and
  // convenient. Asserted at the emission site instead.
  const source = (path: string): string => readFileSync(path, "utf8");

  it("keeps the decision layers from importing it at all", () => {
    for (const path of ["src/commands/guards.ts", "src/commands/execute.ts"]) {
      expect(source(path)).not.toContain("linkIndex");
    }
  });

  it("never lets a link count reach a blocking warning", () => {
    // Asserted on the CONSTRUCTION, not the word: a warning is blocking
    // by carrying the field, so `blocking:` in an object literal is the
    // thing to forbid. Scanning for the bare word instead flagged this
    // module's own docblock explaining the fence — a test that fails on
    // its subject being discussed is a test nobody keeps.
    const module = source("src/collections/linkIndex.ts");
    expect(module).not.toMatch(/\bblocking\s*:/);
  });

  it("keeps the harvester out of the planner's refusal vocabulary", () => {
    // The other half: a count reaching a plan-time refusal would be the
    // same fence broken one file over.
    const hugo = source("src/collections/adapters/hugo.ts");
    const refusalNearCount = /blocking:[^}]*\b(inbound|linkIndex|links)\b/i;
    expect(hugo).not.toMatch(refusalNearCount);
  });
});

describe("the stamp is the loader's, and never escapes empty", () => {
  it("leaves parse's index unstamped, so parse reads no clock", () => {
    // Purity is the reason: a clock inside `parse` makes two parses of
    // the same bytes differ, and every claim resting on that stops
    // being checkable.
    const index = buildLinkIndex({ bodies: [], species: [], observedAt: UNSTAMPED });
    expect(index.observedAt).toBe("");
  });

  it("stamps without mutating what parse produced", () => {
    const parsed = buildLinkIndex({ bodies: [], species: [], observedAt: UNSTAMPED });
    const stamped = stampLinkIndex(parsed, "2026-08-16T12:00:00.000Z");
    expect(stamped.observedAt).toBe("2026-08-16T12:00:00.000Z");
    expect(parsed.observedAt).toBe(UNSTAMPED);
  });

  it("is applied on the load path, so no stored index reaches a display blank", () => {
    const loader = readFileSync("src/view/loadCollection.ts", "utf8");
    expect(loader).toContain("stampLinkIndex");
  });
});
