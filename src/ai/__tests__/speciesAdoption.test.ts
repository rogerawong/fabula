/**
 * speciesAdoption.test.ts — FENCE 5 (adoption per home), the pinned
 * departure, and FENCE 7's minimal pairs (docs/22, Decision 6).
 *
 * WHAT M3 MEASURED at `a8f28cf`, end to end through the shipped
 * pipeline: one existing leaf listed at outline ROOT on the
 * container-rooted fixture reconstructs as `isOrphan: true` and
 * INHERITS `chain: ["Reference"]` — the chain of the card above it. That
 * is a `groups` container, whose descriptor declares `orphans: false`.
 * The export then writes a bare page path into an array that holds group
 * objects, unrefused, and the bytes are schema-invalid.
 *
 * So the adoption rule and the write path were each individually
 * defensible and jointly produced invalid bytes. docs/22 closes it
 * twice: the refusal narrows (mintlifyStandalone.test.ts) and adoption
 * stops inheriting blindly (here). This file is the second half.
 *
 * THE ORACLE IS THE VENDORED SCHEMA through the shipped `regExp` shim —
 * the published schema contains `^phc\\_`, an invalid escape in unicode
 * mode, so a default ajv cannot compile Mintlify's real schema at all.
 *
 * A GUARD CONSUMES DECLARED INPUTS: a document with no container
 * descriptors declares no bearing, so adoption behaves exactly as it
 * always has. That is the complement, asserted here too — a rule that
 * only ever refuses is not a rule anyone measured.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { mintlifyAdapter } from "@/formats/adapters/mintlify";
import { mkdocsAdapter } from "@/formats/adapters/mkdocs";
import { sphinxAdapter } from "@/collections/adapters/sphinx";
import type { FilesSnapshot } from "@/collections/types";
import { buildOutline } from "../outline";
import { parseResponse } from "../parse";
import { reconstructDocument } from "../validate";
import { containerFor } from "@/model/containers";
import { SerializeRefusedError } from "@/formats/types";
import { chainKey } from "@/model/selectors";
import type { ReorganizeOptions } from "../contract";
import type { Section, TocDocument } from "@/model/types";

const FIXTURES = join(process.cwd(), "src/formats/__tests__/fixtures/mintlify");

let validate: ValidateFunction;
beforeAll(() => {
  const schema: unknown = JSON.parse(
    readFileSync(join(FIXTURES, "schema", "docs.schema.json"), "utf8"),
  );
  const regExp = Object.assign(
    (src: string, flags: string) => new RegExp(src, flags.replace("u", "")),
    { code: 'new RegExp(source, flags.replace("u", ""))' },
  );
  const ajv = new Ajv({ strict: false, allErrors: true, code: { regExp } });
  addFormats(ajv);
  validate = ajv.compile(schema as object);
});

const load = (name: string): TocDocument =>
  mintlifyAdapter.parse(
    readFileSync(join(FIXTURES, `${name}.json`), "utf8"),
    `${name}.json`,
  );

const OPTIONS: ReorganizeOptions = {
  instruction: "",
  granularity: "full",
  scopeSectionIds: null,
  folderHints: false,
  allowRenames: false,
  allowNewSections: true,
  allowFileMoves: false,
  mode: "grounded",
} as ReorganizeOptions;

/** Run one outline through the shipped pipeline. `edit` rewrites the
 *  outline text the model is imagined to have returned. */
function reorganize(
  doc: TocDocument,
  edit: (lines: string[]) => string[],
  options: Partial<ReorganizeOptions> = {},
): TocDocument {
  const outline = buildOutline(doc, { ...OPTIONS, ...options });
  const lines = outline.text.split("\n").filter((l) => l.trim() !== "");
  const response = edit(lines).join("\n");
  const parsed = parseResponse(response, new Set(outline.idMap.keys()));
  expect(parsed.errors).toEqual([]);
  return reconstructDocument({
    doc,
    nodes: parsed.nodes,
    idMap: outline.idMap,
    options: { ...OPTIONS, ...options },
  }).doc;
}

const indentOf = (line: string): number => line.length - line.trimStart().length;
const idOf = (line: string): string => line.trim().split(/\s+/)[0]!;

/** Hoist one CHILDLESS leaf to outline root: drop its line, append its
 *  bare id. Only correct for a leaf — see `hoistSubtree`. */
const hoist = (id: string) => (lines: string[]) => [
  ...lines.filter((l) => idOf(l) !== id),
  id,
];

/**
 * Hoist an entry AND its subtree to outline root, de-indented.
 *
 * Written after the leaf version quietly produced the wrong species: it
 * dropped only the entry's own line, so the children stayed indented
 * under whatever preceded them and the entry arrived at root CHILDLESS —
 * which is the standalone branch, not the promotion branch. The test
 * read as if it were exercising promotion and was exercising a hoist.
 */
const hoistSubtree = (id: string) => (lines: string[]) => {
  const at = lines.findIndex((l) => idOf(l) === id);
  if (at === -1) throw new Error(`no line for ${id}`);
  const depth = indentOf(lines[at]!);
  let end = at + 1;
  while (end < lines.length && indentOf(lines[end]!) > depth) end++;
  const moved = lines.slice(at, end).map((l) => l.slice(depth));
  return [...lines.slice(0, at), ...lines.slice(end), ...moved];
};

const serialize = (doc: TocDocument): string =>
  mintlifyAdapter.serialize(
    doc,
    doc.sections.map((s) => s.id),
  );

const errorText = (): string =>
  (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join("; ");

describe("FENCE 5 — reconstruction never mints a card into a home that refuses its species", () => {
  it("the hoisted leaf on a tabs root arrives as a SECTION inside the tab", () => {
    // M3's exact run. Before this change the leaf arrived `isOrphan` with
    // chain ["Reference"] — a groups container declaring orphans: false.
    const doc = load("tabs-rooted-valid");
    const result = reorganize(doc, hoist("t1"));
    const minted = result.sections.find((s) =>
      s.topics.some((t) => t.path === "guides/intro"),
    )!;
    expect(minted.isOrphan).toBeUndefined();
    expect(minted.topics.map((t) => t.path)).toEqual(["guides/intro"]);
    const home = containerFor(result, chainKey(minted));
    expect(home).toBeDefined();
    expect(home!.accepts.sections).toBe(true);
  });

  it("and the export VALIDATES — which is what M3 measured as invalid", () => {
    const doc = load("tabs-rooted-valid");
    const result = reorganize(doc, hoist("t1"));
    const out = serialize(result);
    expect(validate(JSON.parse(out)), errorText()).toBe(true);
  });

  it("the wrapper is titled after its entry, derived — nobody chose that name", () => {
    // A PLACEHOLDER WOULD BE WRONG HERE: no one is present mid-run to
    // answer it, and a single-page group named for its page is the
    // format's own idiom. `titleDerived` is how the card says the title
    // came from the entry rather than from a person.
    const doc = load("tabs-rooted-valid");
    const result = reorganize(doc, hoist("t1"));
    const minted = result.sections.find((s) =>
      s.topics.some((t) => t.path === "guides/intro"),
    )!;
    expect(minted.title).toBe("Intro");
    expect(minted.titleDerived).toBe(true);
  });

  it("PROPERTY: a minted card is never placed INTO a container that refuses it", () => {
    // SCOPED TO MINTED CARDS: a card the document already had is not born
    // here — it is re-listed, keeps its id, and may legitimately sit
    // where a minted one could not (a sealed `$ref` standalone lives in
    // `navigation.languages`, which declares it bears nothing at all).
    //
    // AND SCOPED TO PLACEMENT. The one unhoused outcome the rule may
    // still produce is CHAINLESS — the outline's first-entry case, where
    // there is no card above to inherit from and nothing reachable bears
    // the card. That is Decision 6's third regime, surfaced rather than
    // refused, and it is asserted as such in its own test below rather
    // than swept in here.
    for (const fixture of ["tabs-rooted-valid", "docs-reduced"]) {
      const doc = load(fixture);
      const existing = new Set(doc.sections.map((s) => s.id));
      const outline = buildOutline(doc, OPTIONS);
      const leaves = [...outline.idMap]
        .filter(([, e]) => e.kind === "topic")
        .map(([id]) => id);
      for (const id of leaves.slice(0, 6)) {
        const result = reorganize(doc, hoist(id));
        for (const card of result.sections) {
          if (existing.has(card.id)) continue;
          const key = chainKey(card);
          if (key === "") continue;
          const home = containerFor(result, key);
          if (!home) continue;
          const bears = card.isOrphan ? home.accepts.orphans : home.accepts.sections;
          expect(bears, `${fixture}/${id}: "${card.title}" in "${home.label}"`).toBe(
            true,
          );
        }
      }
    }
  });

  it("PROPERTY: every minted card is either HOUSED where it is borne, or chainless", () => {
    // THE COMPLETE RULED DISJUNCTION, and the second oracle with it: the
    // export refuses EXACTLY the chainless case. So the two layers are
    // asserted against each other rather than each against a hope — a
    // rule that housed a card somewhere refusing would break the first
    // half, and one that quietly stopped minting anything would break
    // the second.
    for (const fixture of ["tabs-rooted-valid", "docs-reduced", "starter-docs"]) {
      const doc = load(fixture);
      const existing = new Set(doc.sections.map((s) => s.id));
      const outline = buildOutline(doc, OPTIONS);
      const leaves = [...outline.idMap]
        .filter(([, e]) => e.kind === "topic")
        .map(([id]) => id);
      for (const id of leaves.slice(0, 6)) {
        const result = reorganize(doc, hoist(id));
        let anyUnhoused = false;
        for (const card of result.sections) {
          if (existing.has(card.id)) continue;
          const home = containerFor(result, chainKey(card));
          if (!home) continue;
          const bears = card.isOrphan ? home.accepts.orphans : home.accepts.sections;
          if (!bears) {
            // The only tolerated shape: chainless, which is regime 3.
            expect(
              chainKey(card),
              `${fixture}/${id}: "${card.title}" placed into "${home.label}"`,
            ).toBe("");
            anyUnhoused = true;
          }
        }
        let refused = false;
        try {
          serialize(result);
        } catch {
          refused = true;
        }
        expect(refused, `${fixture}/${id}: refusal should track unhoused`).toBe(
          anyUnhoused,
        );
      }
    }
  });

  it("REGIME 3 — the outline's first entry mints CHAINLESS, and export is the floor", () => {
    // NOT A GAP, A RULING. A hand mid-gesture can be handed a sentence
    // naming real homes and act on it now; a model mid-outline cannot, so
    // classify-and-surface is its honest fallback. The export refusal
    // stays the floor and stops being the FIRST notice — Decision 5's
    // Overview line and card mark are the earlier door.
    const doc = load("docs-reduced");
    const outline = buildOutline(doc, OPTIONS);
    const first = [...outline.idMap].find(([, e]) => e.kind === "topic")![0];
    const result = reorganize(doc, hoist(first));
    const existing = new Set(doc.sections.map((s) => s.id));
    const minted = result.sections.find((s) => !existing.has(s.id))!;
    expect(minted, "the hoist mints a card").toBeDefined();
    expect(minted.chain).toBeUndefined();
    expect(() => serialize(result)).toThrow(SerializeRefusedError);
  });
});

describe("THE COMPLEMENT — a home that BEARS the species still inherits", () => {
  it("a pages-rooted document still mints the standalone, as shipped", () => {
    // Without this, a rule that born everything a section would pass
    // every assertion above while destroying the standalone species.
    const doc = load("starter-docs");
    const outline = buildOutline(doc, OPTIONS);
    const leaf = [...outline.idMap].find(([, e]) => e.kind === "topic")![0];
    const result = reorganize(doc, hoist(leaf));
    expect(result.sections.some((s) => s.isOrphan)).toBe(true);
  });

  it("a document with NO container descriptors adopts exactly as before", () => {
    // DECLARED INPUTS: nothing declares a bearing, so nothing is checked
    // — the guard skips its clause rather than refusing on a guess.
    const doc = load("starter-docs");
    const bare: TocDocument = { ...doc, containers: undefined };
    const outline = buildOutline(bare, OPTIONS);
    const leaf = [...outline.idMap].find(([, e]) => e.kind === "topic")![0];
    const result = reorganize(bare, hoist(leaf));
    expect(result.sections.some((s) => s.isOrphan)).toBe(true);
  });
});

describe("FENCE 7 — the species minimal pairs, in one document", () => {
  /** One document holding a childless leaf and a parented leaf, so the
   *  two births are distinguished by the ENTRY and nothing else. */
  function pair(): { doc: TocDocument; childless: string; parented: string } {
    // docs-reduced is the ONLY shipped fixture with parented rows —
    // measured, and asserted below rather than skipped past. A test that
    // returns early when its fixture lacks the case is a test that
    // reports green about nothing.
    const doc = load("docs-reduced");
    const outline = buildOutline(doc, OPTIONS);
    let childless: string | undefined;
    let parented: string | undefined;
    for (const [id, entry] of outline.idMap) {
      if (entry.kind !== "topic") continue;
      if (entry.topic.children.length === 0) childless ??= id;
      // WITH A PATH: a promotion carries the entry's path onto the card,
      // and a pageless group row could not show that. The fixture holds
      // both shapes, so the one that discriminates is named.
      else if (entry.topic.path !== undefined) parented ??= id;
    }
    expect(childless, "fixture must hold a childless entry").toBeDefined();
    expect(parented, "fixture must hold a parented entry").toBeDefined();
    return { doc, childless: childless!, parented: parented! };
  }

  it("a CHILDLESS entry at root births the standalone", () => {
    const { doc, childless } = pair();
    const result = reorganize(doc, hoist(childless));
    const minted = result.sections.filter((s) => s.isOrphan);
    expect(minted.length).toBeGreaterThan(0);
  });

  it("a PARENTED entry at root PROMOTES — the shipped unwrap, now ruled", () => {
    const { doc, parented } = pair();
    const outline = buildOutline(doc, OPTIONS);
    const entry = outline.idMap.get(parented)!;
    if (entry.kind !== "topic") throw new Error("expected a topic");
    const result = reorganize(doc, hoistSubtree(parented));
    // FOUND BY PATH, not by title: the fixture holds standalone cards
    // whose titles collide with row titles, and matching on the title
    // picked one of those — a test passing on the wrong card.
    const card = result.sections.find((s) => !s.isOrphan && s.path === entry.topic.path)!;
    expect(card, "the promoted card carries the entry's own path").toBeDefined();
    // The children became the rows; the entry became the heading.
    expect(card.topics.map((t) => t.title)).toEqual(
      entry.topic.children.map((c) => c.title),
    );
  });
});

describe("THE ONE BEHAVIORAL DEPARTURE — a PINNED parented id at root WRAPS", () => {
  it("keeps the entry as a row inside the born section, pin intact", () => {
    // OR-5c. A pinned row never stops being a row: promotion would erase
    // the pin, because `Section` has no lock. So the entry stays a row
    // inside the born card and the displacement records normally.
    const doc = load("docs-reduced");
    const outline = buildOutline(doc, OPTIONS);
    let target: { id: string; title: string; path: string } | undefined;
    for (const [id, entry] of outline.idMap) {
      if (
        entry.kind === "topic" &&
        entry.topic.children.length > 0 &&
        entry.topic.path !== undefined
      ) {
        target = { id, title: entry.topic.title, path: entry.topic.path };
        break;
      }
    }
    expect(target, "fixture must hold a parented entry with a path").toBeDefined();
    if (!target) throw new Error("unreachable — asserted above");

    // Pin it in place — the same shape the adapters produce.
    const pinned: TocDocument = structuredClone(doc);
    const mark = (nodes: Section["topics"]): boolean => {
      for (const t of nodes) {
        if (t.title === target!.title && t.children.length > 0) {
          t.lock = { kind: "external" };
          return true;
        }
        if (mark(t.children)) return true;
      }
      return false;
    };
    pinned.sections.some((s) => mark(s.topics));

    // ASPIRATIONAL, and the reason is a fact about the layer below: the
    // grounded pinned net DISCARDS a pinned row that changes parent
    // before reconstruction ever mints a card, so the wrap is not
    // reachable in grounded mode. In aspirational mode the net
    // classifies instead of discarding, which is where the departure
    // lives (docs/21, Decision 6).
    const result = reorganize(pinned, hoistSubtree(target.id), { mode: "aspirational" });
    // NOTHING WAS PROMOTED: the promotion branch puts the entry's own
    // path on the card face, so a card carrying it is the failure.
    expect(
      result.sections.some((s) => s.path === target!.path),
      "a pinned entry must not become the card's face — Section has no lock",
    ).toBe(false);
    // The entry is a ROW inside the born card, pin intact.
    const born = result.sections.find((s) =>
      s.topics.some((t) => t.path === target!.path),
    );
    expect(born, "the pinned entry should still be a row").toBeDefined();
    const row = born!.topics.find((t) => t.path === target!.path)!;
    expect(row.lock?.kind).toBe("external");
    expect(row.children.map((c) => c.title).length).toBeGreaterThan(0);
  });
});

describe("REGRESSION — an existing standalone is re-listed, never re-speciated", () => {
  it("an identity reorganize preserves every standalone card", () => {
    // FOUND BY A TEST WRITTEN FOR SOMETHING ELSE. The first cut of the
    // adoption rule asked the home about EVERY card it touched, including
    // ones the document already had — so the three sealed `$ref`
    // standalones in this fixture came back as groups, silently, and the
    // export would have written group objects where the source had
    // `{"$ref": "./fr.json"}`.
    //
    // The species-at-birth rule governs a BIRTH. A card with a wrapper
    // already exists; it is re-listed, and it keeps what it is. Same
    // shape as the docs/13 chain-carry lesson, one field over.
    const doc = load("docs-reduced");
    const before = doc.sections.filter((s) => s.isOrphan).map((s) => s.title);
    expect(before.length, "fixture must hold standalone cards").toBeGreaterThan(0);

    const result = reorganize(doc, (lines) => lines);
    const after = result.sections.filter((s) => s.isOrphan).map((s) => s.title);
    expect(after).toEqual(before);
  });

  it("and they keep their seals, so the write path still carves them out", () => {
    const doc = load("docs-reduced");
    const result = reorganize(doc, (lines) => lines);
    const standalones = result.sections.filter((s) => s.isOrphan);
    for (const card of standalones) expect(card.sealed?.source).toBeDefined();
    expect(() => serialize(result)).not.toThrow();
  });
});

describe("THE ROOT IS A HOME LIKE ANY OTHER (docs/22 arc 2, the rootBearing receipts)", () => {
  /**
   * Decision 6's three regimes were written against CONTAINER-rooted
   * documents, where `containerFor` answers and the bearing is a
   * descriptor's. A document with no containers has a root too, and arc
   * 2 made each adapter declare what it bears — so "the regime each of
   * those homes gets follows the receipt, not the guess".
   *
   * WITHOUT THIS, `rootBearing` and the AI path contradict each other on
   * the one adapter whose answer is not {both}: Sphinx declares that its
   * root bears no standalone — every entry lives inside a toctree block
   * — while a grounded run hoisting one leaf minted `isOrphan: true`
   * anyway, because the no-candidate branch returned early before any
   * bearing was consulted.
   */
  const SPHINX: FilesSnapshot = {
    "conf.py": 'master_doc = "index"\nsource_suffix = ".rst"\n',
    "index.rst": [
      "Docs",
      "====",
      "",
      ".. toctree::",
      "   :caption: Guides",
      "",
      "   guides/index",
      "",
    ].join("\n"),
    "guides/index.rst": "Guides\n======\n\n.. toctree::\n\n   install\n   tour\n",
    "guides/install.rst": "Install\n=======\n\nbody\n",
    "guides/tour.rst": "Tour\n====\n\nbody\n",
  };

  /** The id of one childless leaf, from the outline the run would send. */
  const leafId = (doc: TocDocument): string => {
    const outline = buildOutline(doc, OPTIONS);
    for (const [id, entry] of outline.idMap) {
      if (entry.kind === "topic" && entry.topic.children.length === 0) return id;
    }
    throw new Error("fixture has no childless leaf");
  };

  it("a hoisted leaf on a SPHINX tab arrives WRAPPED, not as a standalone", () => {
    const { doc } = sphinxAdapter.parse(SPHINX, "p");
    const built = reorganize(doc, hoist(leafId(doc)));
    const minted = built.sections[built.sections.length - 1]!;
    expect(minted.isOrphan).toBeUndefined();
    expect(minted.topics).toHaveLength(1);
    // Titled after its entry with `titleDerived` — the AI path's
    // placeholder rule: nobody is present mid-run to name it.
    expect(minted.titleDerived).toBe(true);
  });

  it("and a MKDOCS tab still mints the standalone — the exclusion, asserted", () => {
    // Narrowing a classifier obligates the other side's receipt. MkDocs'
    // root bears both — its own parse mints root standalones — so
    // nothing about this arrangement changed for it.
    const doc = mkdocsAdapter.parse(
      "site_name: S\nnav:\n  - Guides:\n      - Install: install.md\n      - Tour: tour.md\n",
      "mkdocs.yml",
    );
    const built = reorganize(doc, hoist(leafId(doc)));
    const minted = built.sections[built.sections.length - 1]!;
    expect(minted.isOrphan).toBe(true);
  });
});
