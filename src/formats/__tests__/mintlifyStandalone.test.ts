/**
 * mintlifyStandalone.test.ts — FENCE 4, the M1 regression, BOTH SIDES
 * (docs/22, Decision 5's write-path extension).
 *
 * WHAT WAS MEASURED. At `a8f28cf` the write-path refusal exempted ALL
 * orphans with a single `isOrphan` early return, and the exemption was
 * wider than its own justification. Two cases were driven through the
 * shipped adapter and both emitted bytes, unrefused:
 *
 *   A · a chainless unsealed standalone appended the bare string
 *       "created/standalone" into `navigation.tabs`, sibling of the tab
 *       objects — and every one of the 14 shapes the published schema
 *       permits in a `tabs` array requires `tab`.
 *   B · the same card carrying `chain: ["Guides"]` appended that string
 *       into the tab's `groups` array, which holds group objects.
 *
 * Both verdicts against the vendored schema through the shipped
 * `regExp` shim: INVALID. The producer of case B is not hypothetical —
 * it is one AI run hoisting one leaf on a container-rooted document
 * (Substrate M3), which is why the adoption fix ships beside this.
 *
 * NARROWING A CLASSIFIER OBLIGATES THE OTHER SIDE'S RECEIPT. The
 * carve-out's justification was `$ref` pointers, which legitimately sit
 * in container arrays and parse SEALED. So this asserts the inclusion —
 * an unsealed standalone in a home that bears none now refuses with the
 * one-producer message — AND the exclusion: every sealed `$ref` orphan
 * in the shipped fixtures still round-trips byte-identically. A
 * predicate inverted to refuse everything passes a suite that only
 * asserts what it refuses.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mintlifyAdapter } from "../adapters/mintlify";
import { createSection } from "@/model/tree";
import { SerializeRefusedError } from "../types";
import type { Section, TocDocument } from "@/model/types";

const FIXTURES = join(import.meta.dirname, "fixtures", "mintlify");

const raw = (name: string): string =>
  readFileSync(join(FIXTURES, `${name}.json`), "utf8");
const load = (name: string): TocDocument =>
  mintlifyAdapter.parse(raw(name), `${name}.json`);
const serialize = (doc: TocDocument): string =>
  mintlifyAdapter.serialize(
    doc,
    doc.sections.map((s) => s.id),
  );

/** The card M1 measured: a standalone entry, unsealed, one childless
 *  row — what a canvas drag-out or an AI hoist mints. */
function standalone(chain?: string[]): Section {
  return {
    ...createSection("Standalone", [
      {
        id: "t-standalone",
        title: "Standalone",
        path: "created/standalone",
        children: [],
      },
    ]),
    isOrphan: true,
    ...(chain ? { chain } : {}),
  };
}

const withCard = (doc: TocDocument, card: Section): TocDocument => ({
  ...doc,
  sections: [...doc.sections, card],
});

describe("THE INCLUSION — an unsealed standalone in a home that bears none", () => {
  it("case A: chainless on a container root now REFUSES instead of emitting", () => {
    const doc = load("tabs-rooted-valid");
    expect(() => serialize(withCard(doc, standalone()))).toThrow(SerializeRefusedError);
  });

  it("case B: chained into a groups container now REFUSES instead of emitting", () => {
    // The live producer: one AI run hoisting one leaf inherits the chain
    // of the card above it, which on this fixture is a `groups` tab.
    const doc = load("tabs-rooted-valid");
    expect(() => serialize(withCard(doc, standalone(["Guides"])))).toThrow(
      SerializeRefusedError,
    );
  });

  it("emits no bytes at all — the prohibition form", () => {
    const doc = load("tabs-rooted-valid");
    let produced: string | undefined;
    try {
      produced = serialize(withCard(doc, standalone(["Guides"])));
    } catch {
      produced = undefined;
    }
    expect(produced).toBeUndefined();
  });

  it("names the card, and names it through the ONE producer", () => {
    // THE DISTINCTIVE ARTIFACT, not the exit polarity: an error can be
    // produced by the wrong path entirely. `SerializeRefusedError`
    // carries the refused titles as a field, which only this refusal
    // sets.
    const doc = load("tabs-rooted-valid");
    try {
      serialize(withCard(doc, standalone(["Guides"])));
      throw new Error("expected a refusal");
    } catch (err) {
      expect(err).toBeInstanceOf(SerializeRefusedError);
      expect((err as SerializeRefusedError).sectionTitles).toEqual(["Standalone"]);
      expect((err as Error).message).toContain("Standalone");
    }
  });

  it("says something TRUE about where the card is, for both arrivals", () => {
    // A NEW INPUT SPECIES OBLIGATES A CONSUMER SWEEP, and the message is
    // a consumer. Written for chainless SECTION cards, it said "sits
    // outside every navigation container" and "drag it into Guides or
    // Reference" — both false of a card that is already inside "Guides",
    // and the second is advice to do what has already been done.
    //
    // This assertion is written to fail on that sentence rather than to
    // find "Guides" anywhere in it: the old copy contained the word as a
    // suggested DESTINATION, so a naive contains-check passed while the
    // sentence was wrong.
    const doc = load("tabs-rooted-valid");
    const message = (card: Section): string => {
      try {
        serialize(withCard(doc, card));
        throw new Error("expected a refusal");
      } catch (err) {
        return (err as Error).message;
      }
    };

    const chained = message(standalone(["Guides"]));
    expect(chained).not.toContain("outside every navigation container");
    expect(chained).toMatch(/sits in "Guides"/);
    // What that container actually holds, from its declared `accepts`.
    expect(chained).toMatch(/group/i);

    // The chainless card keeps the sentence that was already true of it.
    const chainless = message(standalone());
    expect(chainless).toMatch(/top level/i);
  });
});

describe("THE EXCLUSION — sealed $ref orphans are untouched", () => {
  it("docs-reduced round-trips byte-identically, $ref languages and all", () => {
    // The carve-out's own justification: a `$ref` card's contents really
    // are generated elsewhere, and it legitimately sits in a container
    // array that bears no cards. `orphanSection` seals exactly these.
    const text = raw("docs-reduced");
    const doc = mintlifyAdapter.parse(text, "docs-reduced.json");
    expect(serialize(doc)).toBe(text);
  });

  it("the $ref cards ARE sealed orphans — the premise, asserted not assumed", () => {
    const doc = load("docs-reduced");
    const refs = doc.sections.filter((s) => s.isOrphan && s.sealed !== undefined);
    expect(refs.length).toBeGreaterThan(0);
    for (const card of refs) expect(card.sealed?.source).toMatch(/\.json$/);
  });

  it("a sealed orphan survives a re-serialize even in a bears-nothing home", () => {
    // The narrowed predicate must let these through on purpose, not by
    // accident of them never reaching it.
    const doc = load("docs-reduced");
    const sealedRef = doc.sections.find((s) => s.isOrphan && s.sealed !== undefined)!;
    expect(() => serialize(doc)).not.toThrow();
    expect(serialize(doc)).toContain(sealedRef.sealed!.source!);
  });

  it("the verbatim-from-source fixtures still round-trip byte-identically", () => {
    // SCOPED TO WHAT IS ACTUALLY CLAIMED. `starter-docs` and
    // `docs-reduced` are byte-verbatim from mintlify's own repositories
    // and are the ones byte-identity is a claim about. The synthetic
    // fixtures are hand-authored with compact one-line objects that
    // `JSON.stringify(_, null, 2)` expands — measured at this arc's base
    // as well as after it, so it is a fact about those fixtures' layout
    // and not about this change.
    for (const name of ["starter-docs", "docs-reduced"]) {
      const text = raw(name);
      expect(serialize(mintlifyAdapter.parse(text, `${name}.json`)), name).toBe(text);
    }
  });

  it("every shipped fixture serializes STABLY — a second pass changes nothing", () => {
    // The property that holds for all five: whatever the serializer
    // emits, re-parsing and re-emitting it is a fixpoint. A narrowed
    // refusal that quietly dropped or duplicated a card would break this
    // even where byte identity with the hand-authored input never held.
    for (const name of [
      "starter-docs",
      "docs-reduced",
      "tabs-rooted-valid",
      "empty-container",
      "synthetic-shapes",
    ]) {
      const once = serialize(mintlifyAdapter.parse(raw(name), `${name}.json`));
      const twice = serialize(mintlifyAdapter.parse(once, `${name}.json`));
      expect(twice, name).toBe(once);
    }
  });
});

describe("THE COMPLEMENT — a standalone in a home that bears one is written", () => {
  it("a pages-rooted document takes a standalone card happily", () => {
    // Without this, a predicate inverted to refuse every orphan would
    // pass everything above.
    const doc = load("starter-docs");
    const out = serialize(withCard(doc, standalone()));
    expect(out).toContain("created/standalone");
  });
});
