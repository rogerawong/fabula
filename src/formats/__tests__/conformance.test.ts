/**
 * Format adapter conformance suite (docs/04-format-adapters.md).
 *
 * Every registered adapter runs the same round-trip contract against its
 * fixtures. When you contribute a new format adapter, add at least one
 * fixture for it to FIXTURES below — the suite does the rest.
 *
 * THE CONTRACT:
 *  1. the registry picks this adapter for the fixture (confidence)
 *  2. parse() produces at least one section, tagged with the adapter's id
 *  3. serialize(parse(x)) re-parses to an equivalent model (lossless;
 *     comparison strips generated ids)
 *  4. serialization is stable: serialize → parse → serialize is a fixpoint
 *  5. serializeSection() produces non-empty output for every section
 */

import { describe, expect, it } from "vitest";
import { KnownUnsupportedFormatError } from "../types";
import { FORMAT_ADAPTERS, parseDocument } from "@/formats/registry";
import { lintContainers } from "@/model/containers";
import type { Section, TocDocument, Topic } from "@/model/types";

import docfxClassicList from "./fixtures/docfx-classic-list.yml?raw";
import docfxSample from "../samples/docfx-sample.yml?raw";
import mkdocsConfig from "./fixtures/mkdocs-config.yml?raw";
import mkdocsSample from "../samples/mkdocs-sample.yml?raw";
import mintlifySample from "../samples/mintlify-sample.json?raw";
import mintlifyStarter from "./fixtures/mintlify/starter-docs.json?raw";
import mintlifyDocsReduced from "./fixtures/mintlify/docs-reduced.json?raw";
import mintlifySynthetic from "./fixtures/mintlify/synthetic-shapes.json?raw";
import mintlifyEmptyContainer from "./fixtures/mintlify/empty-container.json?raw";

/** Fixtures per adapter id. Add entries here when contributing a format. */
const FIXTURES: Record<string, { name: string; content: string }[]> = {
  docfx: [
    { name: "sample (items root)", content: docfxSample },
    { name: "classic list root", content: docfxClassicList },
  ],
  mkdocs: [
    { name: "sample", content: mkdocsSample },
    { name: "config with surrounding keys", content: mkdocsConfig },
  ],
  mintlify: [
    { name: "sample", content: mintlifySample },
    {
      name: "mintlify/starter (verbatim, no trailing newline)",
      content: mintlifyStarter,
    },
    { name: "mintlify/docs (reduced slice)", content: mintlifyDocsReduced },
    { name: "synthetic entry shapes", content: mintlifySynthetic },
    {
      name: "container that bears sections and holds none",
      content: mintlifyEmptyContainer,
    },
  ],
};

// ── Model normalization for equivalence comparison ──────────

/**
 * Strip volatile fields (generated ids) for deep comparison. `lock`,
 * `sealed` and `chain` are part of the comparison rather than ignored:
 * they are declared by the adapter at parse time and the core interprets
 * them, so an adapter that dropped a chain or a seal on export would be
 * losing document meaning, not merely presentation.
 */
function normalizeTopic(t: Topic): unknown {
  return {
    title: t.title,
    titleDerived: t.titleDerived ?? false,
    path: t.path,
    lock: t.lock,
    extras: t.extras,
    children: t.children.map(normalizeTopic),
  };
}

function normalizeSection(s: Section): unknown {
  return {
    title: s.title,
    titleDerived: s.titleDerived ?? false,
    path: s.path,
    sealed: s.sealed,
    chain: s.chain,
    extras: s.extras,
    isOrphan: s.isOrphan ?? false,
    topics: s.topics.map(normalizeTopic),
  };
}

function normalize(doc: TocDocument): unknown {
  return {
    formatId: doc.formatId,
    extras: doc.extras,
    sections: doc.sections.map(normalizeSection),
  };
}

const identityOrder = (doc: TocDocument) => doc.sections.map((s) => s.id);

// ── The conformance suite ───────────────────────────────────

for (const adapter of FORMAT_ADAPTERS) {
  const fixtures = FIXTURES[adapter.id] ?? [];

  describe(`adapter: ${adapter.id}`, () => {
    it("has at least one conformance fixture", () => {
      expect(fixtures.length).toBeGreaterThan(0);
    });

    for (const fixture of fixtures) {
      describe(fixture.name, () => {
        it("is detected by the registry", () => {
          const parsed = parseDocument(fixture.content, "toc.yml");
          expect(parsed.formatId).toBe(adapter.id);
        });

        it("parses to a non-empty model tagged with the adapter id", () => {
          const doc = adapter.parse(fixture.content, "toc.yml");
          expect(doc.formatId).toBe(adapter.id);
          expect(doc.sections.length).toBeGreaterThan(0);
        });

        it("round-trips losslessly (parse → serialize → parse ≡ parse)", () => {
          const first = adapter.parse(fixture.content, "toc.yml");
          const out = adapter.serialize(first, identityOrder(first));
          const second = adapter.parse(out, "toc.yml");
          expect(normalize(second)).toEqual(normalize(first));
        });

        it("serialization is a fixpoint (stable output)", () => {
          const first = adapter.parse(fixture.content, "toc.yml");
          const out1 = adapter.serialize(first, identityOrder(first));
          const reparsed = adapter.parse(out1, "toc.yml");
          const out2 = adapter.serialize(reparsed, identityOrder(reparsed));
          expect(out2).toBe(out1);
        });

        it("declares containers that agree with the cards in them", () => {
          // Like-joins-like as a LINT, not as the source of truth
          // (docs/13 v2): a container's contents cannot decide what it
          // bears, but they can catch a declaration that contradicts
          // them, which is an adapter bug. Free for every future format
          // that grows containers.
          expect(lintContainers(adapter.parse(fixture.content, "toc.yml"))).toEqual([]);
        });

        it("serializeSection produces valid output for every section", () => {
          const doc = adapter.parse(fixture.content, "toc.yml");
          for (const section of doc.sections) {
            const text = adapter.serializeSection(section);
            expect(text.trim().length).toBeGreaterThan(0);
          }
        });
      });
    }
  });
}

describe("recognizers name what no adapter can read", () => {
  // Recognizers are NOT adapters: there is no parse to call, so the
  // conformance loop above cannot and must not include them (docs/04).
  const SUMMARY = "# Summary\n\n- [Introduction](intro.md)\n- [Usage](usage.md)\n";

  it("turns an unrecognized mdBook SUMMARY.md into a specific answer", () => {
    try {
      parseDocument(SUMMARY, "SUMMARY.md");
      throw new Error("expected parseDocument to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(KnownUnsupportedFormatError);
      const known = err as KnownUnsupportedFormatError;
      expect(known.recognizerId).toBe("mdbook-summary");
      expect(known.message).toContain("mdBook");
      expect(known.helpUrl).toContain("mdBook");
    }
  });

  it("sniffs conservatively — a nameless markdown list falls through", () => {
    // A wrong recognizer sends someone to migrate an unrelated file, so
    // ambiguity must NOT be claimed. The same bytes under a different
    // name reach an ordinary failure instead of the mdBook message.
    expect(() => parseDocument(SUMMARY, "notes.md")).not.toThrow(
      KnownUnsupportedFormatError,
    );
    expect(() => parseDocument(SUMMARY, "notes.md")).toThrow();
  });

  it("never shadows an adapter that can actually read the input", () => {
    for (const adapter of FORMAT_ADAPTERS) {
      if (!adapter.sample) continue;
      const doc = parseDocument(adapter.sample.content, adapter.sample.fileName);
      expect(doc.formatId).toBe(adapter.id);
    }
  });
});
