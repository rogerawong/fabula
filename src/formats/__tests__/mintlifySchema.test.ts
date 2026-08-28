/**
 * mintlifySchema.test.ts — the post-export schema plank (docs/08).
 *
 * WHAT THIS CLOSES. The fixpoint suite proves byte identity for an
 * UNCHANGED document and the round-trip property proves an edit touches
 * only what changed. Neither says the bytes a MUTATED document produces
 * are valid for the format — and a defect of exactly that class shipped
 * once already: a proposal that drained a Mintlify tab exported
 * `groups: []` against a `minItems: 1` schema, silently, with every
 * test green.
 *
 * THE ORACLE is Mintlify's own published schema, fetched to
 * `fixtures/mintlify/schema/docs.schema.json` — NOT vendored, and NOT
 * in git. Its license could not be determined (the README beside it
 * carries the evidence and the ruling, 2026-08-27), so the file ships
 * in neither the private nor the public tree; `pnpm
 * fetch-mintlify-schema` retrieves it, and without it this whole file
 * SKIPS WITH ITS REASON below rather than being quietly dropped —
 * the sphinx-corpus shape, network-gated instead of corpus-gated.
 *
 * AN INSTRUMENT THAT ACCEPTS IS NOT AN INSTRUMENT THAT CHECKS. A
 * validator handed a truncated or over-permissive schema passes
 * everything and certifies nothing, and the run stays green either way
 * — the failure mode is real here, because the source URL answers 307
 * and a fetch without `-L` yields 15 bytes. So the plank carries its
 * own teeth: a known-invalid document asserted to FAIL.
 *
 * That known-invalid document is not invented. It is the BEFORE-RECEIPT
 * of the creation gap — the exact bytes this adapter produced at
 * `87a33dd` when a chainless card reached a container-rooted file —
 * kept here so the defect stays falsifiable after the code that caused
 * it is gone.
 *
 * SINGLE PRODUCER, PRE-DECLARED. Mintlify is the only adapter here
 * because it is the only one whose format publishes a schema. The shape
 * is a fixture plus a compiled validator, so a second schema-publishing
 * adapter is an ADDED fixture and a second describe block, not a
 * rewrite of this file.
 *
 * WHAT THIS DOES NOT ENFORCE, measured and written down rather than
 * left implied. Of the four Mintlify fixtures, only `starter-docs.json`
 * validates as published. `docs-reduced.json` does not, and the cause
 * is not our reduction: it keeps `{"$ref": "./redirects.json"}` and
 * three bare `{"$ref": …}` language entries VERBATIM from
 * mintlify/docs, and the published schema models no `$ref` composition
 * at all (`redirects must be array`; a language item must carry
 * `language`). `empty-container.json` and `synthetic-shapes.json` are
 * synthetic and omit root keys the schema requires (`colors`), plus a
 * `_comment` key that `additionalProperties: false` rejects.
 *
 * So this plank asserts that MUTATION does not break a document that
 * was valid to begin with. It says nothing about whether a given real
 * docs.json is schema-valid — several are not, including one written
 * by the format's own author.
 *
 * Tests only. `ajv` is a devDependency and nothing under `src/` outside
 * `__tests__` imports it, so no validator reaches the bundle.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { mintlifyAdapter } from "../adapters/mintlify";
import { runCommand } from "@/commands/dispatcher";
import type { EditorState } from "@/commands/types";
import { initialColumns } from "@/layout/columns";
import { DEFAULT_GLOBAL_DEPTH } from "@/store";
import { createSection } from "@/model/tree";
import { chainFromKey } from "@/model/selectors";
import { containersInOrder } from "@/model/containers";
import { deriveSectionOrder } from "@/layout/columns";
import type { Section, TocDocument } from "@/model/types";

const FIXTURES = join(import.meta.dirname, "fixtures", "mintlify");

// The oracle is a fetched asset, not a vendored one (license
// undetermined — see schema/README.md). Absent oracle = skip with this
// reason, never a failure: a fresh clone stays green offline, and the
// plank runs wherever `pnpm fetch-mintlify-schema` has been run.
const SCHEMA_PATH = join(FIXTURES, "schema", "docs.schema.json");
const oracleFetched = existsSync(SCHEMA_PATH);
const describeWithOracle = describe.skipIf(!oracleFetched);

let validate: ValidateFunction;

beforeAll(() => {
  if (!oracleFetched) return;
  const schema: unknown = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  // `strict: false` because the oracle is somebody else's document: we
  // validate against it as published, and do not get to lint it.
  //
  // The custom `regExp` drops ajv's `u` flag. MEASURED, not preference:
  // the published schema contains the pattern `^phc\_`, where `\_` is
  // an invalid escape in unicode mode, so a default ajv cannot compile
  // Mintlify's real schema at all. JSON Schema specifies `pattern` as an
  // ECMA-262 regular expression and does not require unicode mode, so
  // this validates the schema as WRITTEN rather than refusing it.
  // ajv types the engine as the function PLUS the `code` string it
  // inlines into generated validators, so both halves are supplied.
  const regExp = Object.assign(
    (source: string, flags: string) => new RegExp(source, flags.replace("u", "")),
    { code: 'new RegExp(source, flags.replace("u", ""))' },
  );
  const ajv = new Ajv({ strict: false, allErrors: true, code: { regExp } });
  addFormats(ajv);
  validate = ajv.compile(schema as object);
});

function load(name: string): TocDocument {
  return mintlifyAdapter.parse(
    readFileSync(join(FIXTURES, `${name}.json`), "utf8"),
    `${name}.json`,
  );
}

function stateFor(doc: TocDocument): EditorState {
  return {
    document: doc,
    columns: initialColumns(doc),
    view: { globalDepth: DEFAULT_GLOBAL_DEPTH, cardDepths: {} },
  };
}

function serializeState(state: EditorState): string {
  return mintlifyAdapter.serialize(state.document, deriveSectionOrder(state.columns));
}

const errorText = (): string =>
  (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join("; ");

describeWithOracle(
  "the fetched oracle has teeth (skipped = run `pnpm fetch-mintlify-schema`)",
  () => {
    it("accepts a document the format's own author publishes", () => {
      // `starter-docs.json` is byte-verbatim from mintlify/starter.
      const raw: unknown = JSON.parse(
        readFileSync(join(FIXTURES, "starter-docs.json"), "utf8"),
      );
      expect(validate(raw), errorText()).toBe(true);
    });

    it("accepts the container-rooted fixture", () => {
      const raw: unknown = JSON.parse(
        readFileSync(join(FIXTURES, "tabs-rooted-valid.json"), "utf8"),
      );
      expect(validate(raw), errorText()).toBe(true);
    });

    /**
     * THE BEFORE-RECEIPT, and the plank's vacuity check in one.
     *
     * Built by REPRODUCING what the adapter did at `87a33dd` rather than
     * by hand-writing a blob: take the container-rooted fixture and
     * append the group object a chainless card produced. Every shape the
     * schema permits in a `tabs` array requires `tab`; this object
     * carries `group` and `pages` and no `tab`.
     *
     * If this ever passes, the oracle is not checking anything — which is
     * a live risk, since the source URL answers 307 and a fetch without
     * `-L` vendors 15 bytes of text.
     */
    it("REFUSES the bytes the creation gap used to produce", () => {
      const doc = JSON.parse(
        readFileSync(join(FIXTURES, "tabs-rooted-valid.json"), "utf8"),
      ) as { navigation: { tabs: unknown[] } };
      doc.navigation.tabs.push({
        group: "Created On Canvas",
        pages: ["created/a-page"],
      });
      expect(validate(doc)).toBe(false);
    });

    /**
     * THE SECOND BEFORE-RECEIPT: the standalone shape (docs/22, M1).
     *
     * The creation gap's bytes were a GROUP object in a `tabs` array; these
     * are a bare PAGE PATH, which the orphan carve-out let through for one
     * arc longer. Both cases measured at `a8f28cf`, both emitted, both
     * invalid — case A into `navigation.tabs` and case B into a tab's
     * `groups`. Kept here so the defect stays falsifiable after the code
     * that caused it is gone, and so the oracle keeps its teeth for this
     * shape specifically: if either passes, the schema is not checking the
     * thing the refusal now exists to prevent.
     */
    it("REFUSES the bare page path a chainless standalone used to write (M1 case A)", () => {
      const doc = JSON.parse(
        readFileSync(join(FIXTURES, "tabs-rooted-valid.json"), "utf8"),
      ) as { navigation: { tabs: unknown[] } };
      doc.navigation.tabs.push("created/standalone");
      expect(validate(doc)).toBe(false);
    });

    it("REFUSES the same path inside a tab's groups array (M1 case B)", () => {
      const doc = JSON.parse(
        readFileSync(join(FIXTURES, "tabs-rooted-valid.json"), "utf8"),
      ) as { navigation: { tabs: { groups: unknown[] }[] } };
      doc.navigation.tabs[0]!.groups.push("created/standalone");
      expect(validate(doc)).toBe(false);
    });
  },
);

describeWithOracle("a document mutated through real commands still validates", () => {
  it("after a topic moves between cards", () => {
    const doc = load("tabs-rooted-valid");
    const state = stateFor(doc);
    const from = doc.sections.find((s) => !s.isOrphan && s.topics.length > 0)!;
    const to = doc.sections.find((s) => !s.isOrphan && s.id !== from.id)!;
    const { next } = runCommand(state, {
      type: "moveTopics",
      topicIds: [from.topics[0]!.id],
      toSectionId: to.id,
      toParentTopicId: null,
      toIndex: 0,
    });
    const out = serializeState(next);
    expect(validate(JSON.parse(out)), errorText()).toBe(true);
  });

  it("after a card is created and placed into a container", () => {
    const doc = load("tabs-rooted-valid");
    const target = containersInOrder(doc).find(
      (c) => c.accepts.sections && c.chainKey !== "",
    )!;
    const placed: Section = {
      ...createSection("Created On Canvas", [
        { id: "t-created", title: "A Page", path: "created/a-page", children: [] },
      ]),
      chain: chainFromKey(target.chainKey),
    };
    const withCard: TocDocument = { ...doc, sections: [...doc.sections, placed] };
    const out = serializeState(stateFor(withCard));
    expect(validate(JSON.parse(out)), errorText()).toBe(true);
    expect(out).toContain("Created On Canvas");
  });

  it("after a card is created on a root that bears sections", () => {
    const doc = load("starter-docs");
    const created = createSection("Created On Canvas", [
      { id: "t-created", title: "A Page", path: "created/a-page", children: [] },
    ]);
    const withCard: TocDocument = { ...doc, sections: [...doc.sections, created] };
    const out = serializeState(stateFor(withCard));
    expect(validate(JSON.parse(out)), errorText()).toBe(true);
  });
});
