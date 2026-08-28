/**
 * mintlifyCreationGap.test.ts — the write path consults `accepts`.
 *
 * THE DEFECT. A card created on canvas has no `chain`, so it lands in
 * the ROOT queue. Where the root navigation is a CONTAINER array —
 * `tabs`, `languages`, `dropdowns` — `fillContainer` appended a group
 * object into an array `ARRAY_BEARS` omits, and nothing on the write
 * path consulted `accepts`. Measured before the fix, on all three
 * container-rooted fixtures:
 *
 *   {"group":"Created On Canvas","pages":["created/a-page"]}
 *
 * appended into `navigation.languages` / `navigation.tabs`. Against
 * Mintlify's published schema every one of the 14 permitted
 * `tabs.items` shapes requires `tab`; that object carries `group` and
 * `pages` and no `tab`, so the bytes were invalid.
 *
 * The fixtures here are the two SHIPPED root species rather than
 * invented shapes: `starter-docs.json` is `{pages, global}` (a root
 * that bears sections) and `docs-reduced.json` is `{languages}` (a
 * root that bears only containers).
 *
 * The arrival mechanic is canvas creation, which is the measured
 * chainless path: `execCreateSection` builds its section with
 * `createSection`, which sets no chain. The real gesture is driven in
 * `e2e/mintlify-creation-gap.spec.ts`.
 *
 * These assertions spell the message out as LITERAL text. Importing
 * the producer and comparing it to itself would be an oracle agreeing
 * with a straw man — it would pass for any message at all.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mintlifyAdapter } from "../adapters/mintlify";
import { createSection } from "@/model/tree";
import { chainFromKey } from "@/model/selectors";
import { containersInOrder } from "@/model/containers";
import type { Section, TocDocument } from "@/model/types";

const FIXTURES = join(import.meta.dirname, "fixtures", "mintlify");

function load(name: string): TocDocument {
  return mintlifyAdapter.parse(
    readFileSync(join(FIXTURES, `${name}.json`), "utf8"),
    `${name}.json`,
  );
}

/** Exactly what `execCreateSection` pushes: no chain, ever. */
function createdOnCanvas(title = "Created On Canvas"): Section {
  return createSection(title, [
    { id: "t-created", title: "A Page", path: "created/a-page", children: [] },
  ]);
}

const withSections = (doc: TocDocument, sections: Section[]): TocDocument => ({
  ...doc,
  sections,
});

const serialize = (doc: TocDocument): string =>
  mintlifyAdapter.serialize(
    doc,
    doc.sections.map((s) => s.id),
  );

describe("(ii) a container root refuses a card that is not inside any container", () => {
  it("throws rather than writing the card into the container array", () => {
    const doc = load("docs-reduced");
    const mutated = withSections(doc, [...doc.sections, createdOnCanvas()]);
    expect(() => serialize(mutated)).toThrow();
  });

  // THE DISTINCTIVE ARTIFACT — not merely that serialization failed.
  // An error can be produced by the wrong path entirely.
  it("names the card in the message", () => {
    const doc = load("docs-reduced");
    const mutated = withSections(doc, [
      ...doc.sections,
      createdOnCanvas("Release Notes"),
    ]);
    expect(() => serialize(mutated)).toThrow(/Release Notes/);
  });

  it("states the remedy — drag it into one of the containers", () => {
    const doc = load("docs-reduced");
    const mutated = withSections(doc, [...doc.sections, createdOnCanvas()]);
    expect(() => serialize(mutated)).toThrow(/[Dd]rag/);
  });

  // The same refusal on the SCHEMA-VALID container root, so the claim
  // does not rest on a fixture that could not have validated anyway.
  it("refuses on the tabs-rooted fixture too", () => {
    const doc = load("tabs-rooted-valid");
    const mutated = withSections(doc, [
      ...doc.sections,
      createdOnCanvas("Release Notes"),
    ]);
    expect(() => serialize(mutated)).toThrow(/Release Notes/);
  });

  // PROHIBITION FORM. The point is not that an error surfaced; it is
  // that no bytes exist for a reader to act on.
  it("emits no bytes at all", () => {
    const doc = load("docs-reduced");
    const mutated = withSections(doc, [...doc.sections, createdOnCanvas()]);
    let produced: string | undefined;
    try {
      produced = serialize(mutated);
    } catch {
      produced = undefined;
    }
    expect(produced).toBeUndefined();
  });
});

// BOTH SIDES OF THE CLASSIFIER. Narrowing one obligates the other's
// receipt: a predicate inverted to refuse everything passes any suite
// that only asserts what it refuses.
describe("(i) a root that bears sections takes a created card", () => {
  it("serializes, and the card is in the output", () => {
    const doc = load("starter-docs");
    const mutated = withSections(doc, [...doc.sections, createdOnCanvas()]);
    const out = serialize(mutated);
    expect(JSON.parse(out).navigation.pages).toBeDefined();
    expect(out).toContain("Created On Canvas");
  });
});

describe("(iii) the same container root takes the card once it is placed", () => {
  it("serializes into the container the card was placed in", () => {
    const doc = load("docs-reduced");
    const target = containersInOrder(doc).find(
      (c) => c.accepts.sections && c.chainKey !== "",
    );
    if (!target) throw new Error("fixture has no section-bearing container");

    const placed: Section = {
      ...createdOnCanvas(),
      chain: chainFromKey(target.chainKey),
    };
    const out = serialize(withSections(doc, [...doc.sections, placed]));
    expect(out).toContain("Created On Canvas");
  });
});
