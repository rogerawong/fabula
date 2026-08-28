/**
 * "A BLOCK IS NOT AN ENTRY" — the Sphinx-shaped AI refusal (docs/19).
 *
 * The existing section-demotion net gates on `movesFilesOnReparent`,
 * which is FALSE for Sphinx — correctly, because nesting a Sphinx card
 * moves no directory. But the CONSEQUENCE is still unguarded, and it is
 * a different one: every Sphinx section is built PATHLESS (a card is a
 * toctree block in the root document, not a page), while a toctree entry
 * line must name a docname. So a demoted card has nothing to write.
 *
 * The discriminant is DECLARED, not guessed from an adapter id: a
 * hardcoded list at the consent layer fails silently in the dangerous
 * direction, which docs/16 already paid for once. `nodesNeedTargets` is
 * a required adapter field, so `pnpm check` names the next adapter that
 * forgets to answer.
 *
 * BOTH ANSWERS PINNED — the D4 rule. A net asserted only on what it
 * refuses leaves the other half resting on nothing, and D4's directory
 * net survived all 54 tests when inverted to refuse everything, because
 * every test in the block fed it a document that SHOULD be refused.
 */

import { describe, expect, it } from "vitest";
import { buildOutline } from "../outline";
import { parseResponse } from "../parse";
import { reconstructDocument } from "../validate";
import { AiError } from "../contract";
import { sphinxAdapter } from "@/collections/adapters/sphinx";
import { mkdocsAdapter } from "@/formats/adapters/mkdocs";
import type { FilesSnapshot } from "@/collections/types";
import type { TocDocument } from "@/model/types";

const CONF = 'master_doc = "index"\nsource_suffix = ".rst"\n';
const PROJECT: FilesSnapshot = {
  "conf.py": CONF,
  "index.rst": [
    "Docs",
    "====",
    "",
    ".. toctree::",
    "   :caption: Guides",
    "",
    "   guides/index",
    "",
    ".. toctree::",
    "   :caption: Reference",
    "",
    "   reference/api",
    "   reference/cli",
    "",
  ].join("\n"),
  "guides/index.rst": "Guides\n======\n\n.. toctree::\n\n   install\n",
  "guides/install.rst": "Install\n=======\n\nbody\n",
  "reference/api.rst": "API\n===\n\nbody\n",
  "reference/cli.rst": "CLI\n===\n\nbody\n",
};

const doc = (): TocDocument => sphinxAdapter.parse(PROJECT, "p").doc;

const OPTS = {
  mode: "grounded" as const,
  scopeSectionIds: null as string[] | null,
  allowRenames: false,
  allowNewSections: false,
  allowFileMoves: false,
  folderHints: false,
  granularity: "full" as const,
};

/** Reconstruct a response against a document's own outline. */
function run(d: TocDocument, response: string) {
  const outline = buildOutline(d, OPTS);
  const parsed = parseResponse(response, new Set(outline.idMap.keys()));
  expect(parsed.errors).toEqual([]);
  return reconstructDocument({
    doc: d,
    nodes: parsed.nodes,
    idMap: outline.idMap,
    options: OPTS,
  });
}

/** The compact ids the outline actually assigned, so the fixtures cannot
 *  drift from the tokenizer. */
function idsOf(d: TocDocument): { sections: string[]; topics: Map<string, string> } {
  const outline = buildOutline(d, OPTS);
  const sections: string[] = [];
  const topics = new Map<string, string>();
  for (const [cid, entry] of outline.idMap) {
    if (entry.kind === "section") sections.push(cid);
    else topics.set(entry.topic.title, cid);
  }
  return { sections, topics };
}

describe("a card demoted into another card is refused", () => {
  it("refuses, and says a block is not an entry", () => {
    const d = doc();
    const { sections } = idsOf(d);
    // s2 (Reference) nested under s1 (Guides).
    const outline = [`${sections[0]!} Guides`, `  ${sections[1]!} Reference`].join("\n");
    expect(() => run(d, outline)).toThrow(AiError);
    try {
      run(d, outline);
    } catch (error) {
      expect(String((error as AiError).message)).toMatch(/card|section/i);
      expect(String((error as AiError).message)).toMatch(/page|docname|entry/i);
    }
  });

  it("names the redistribution path, in the canvas's own words", () => {
    // A refusal that states only a wall leaves the user to discover for
    // themselves that the same restructure is reachable another way —
    // and here it is, because moving the PAGES is exactly what this
    // build ships.
    const d = doc();
    const { sections } = idsOf(d);
    const outline = [`${sections[0]!} Guides`, `  ${sections[1]!} Reference`].join("\n");
    try {
      run(d, outline);
      throw new Error("expected a refusal");
    } catch (error) {
      expect(String((error as AiError).message)).toMatch(
        /individually|one at a time|pages/i,
      );
    }
  });
});

describe("the complement: an ordinary reorganize still passes", () => {
  it("accepts a reorder that moves no card into another", () => {
    // THE HALF A REFUSAL-ONLY SUITE LEAVES UNASSERTED. Inverting the
    // predicate to refuse everything must fail here.
    const d = doc();
    const { sections, topics } = idsOf(d);
    const outline = [
      `${sections[0]!} Guides`,
      `  ${topics.get("Guides")!} Guides`,
      `    ${topics.get("Install")!} Install`,
      `${sections[1]!} Reference`,
      `  ${topics.get("CLI")!} CLI`,
      `  ${topics.get("API")!} API`,
    ].join("\n");
    const result = run(d, outline).doc;
    expect(result.sections).toHaveLength(2);
    expect(result.sections[1]!.topics.map((t) => t.title)).toEqual(["CLI", "API"]);
  });

  it("accepts a topic moving BETWEEN cards, which is the shipped gesture", () => {
    const d = doc();
    const { sections, topics } = idsOf(d);
    const outline = [
      `${sections[0]!} Guides`,
      `  ${topics.get("Guides")!} Guides`,
      `${sections[1]!} Reference`,
      `  ${topics.get("API")!} API`,
      `  ${topics.get("CLI")!} CLI`,
      `  ${topics.get("Install")!} Install`,
    ].join("\n");
    const result = run(d, outline).doc;
    expect(result.sections[1]!.topics.map((t) => t.title)).toContain("Install");
  });
});

describe("a format whose nodes need no page is untouched", () => {
  it("lets MkDocs nest one group inside another", () => {
    // The discriminant is a DECLARED fact about the format, not a guess
    // from an adapter id: an MkDocs nav group is a mapping with a title
    // and children and needs no page of its own, so nesting one is
    // ordinary and must stay ordinary.
    const yaml = [
      "nav:",
      "  - Guides:",
      "      - guides/index.md",
      "  - Reference:",
      "      - reference/api.md",
    ].join("\n");
    const d = mkdocsAdapter.parse(yaml, "mkdocs.yml");
    const { sections } = idsOf(d);
    const outline = [`${sections[0]!} Guides`, `  ${sections[1]!} Reference`].join("\n");
    expect(() => run(d, outline)).not.toThrow();
  });
});
