/**
 * The shared harvester's SECOND producer (docs/16 step 7).
 *
 * The claim being tested is not "Docusaurus counts links" but that one
 * harvest loop serves two URL derivations: Hugo strips a content root
 * and appends a trailing slash, Docusaurus strips a numeric prefix and
 * does not. A shared mechanism with one producer is a mechanism nobody
 * has checked — docs/13's Decided ≠ built, applied to a harvester.
 *
 * And the species stay SEPARATE. A doc id is not a link: it is a handle
 * another sidebar refers to, changed by a move without any link being
 * touched, and no redirect repairs it. It is NAMED, never counted into
 * the link number.
 */

import { describe, expect, it } from "vitest";
import { docusaurusAdapter } from "../adapters/docusaurus";
import { buildLinkIndex } from "../linkIndex";
import { deriveSectionOrder, initialColumns } from "@/layout/columns";
import type { FilesSnapshot } from "../types";
import type { TocDocument } from "@/model/types";

const raw = import.meta.glob("./fixtures/docusaurus/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function fixture(): FilesSnapshot {
  const files: FilesSnapshot = {};
  for (const [key, content] of Object.entries(raw)) {
    if (key.endsWith("README.md")) continue;
    files[key.replace("./fixtures/docusaurus/", "")] = content;
  }
  return files;
}

/** Bodies inline, because the fixture is reused UNCHANGED (docs/16). */
const LINKED: FilesSnapshot = {
  "guides/installation.md":
    "See [config](./configuration.mdx) and [api](../reference/api.md).",
  "guides/configuration.mdx": "Back to [install](./installation.md).",
  "reference/api.md": "Absolute: [install](/guides/installation).",
  "reference/01-cli.md": "Numeric prefix: [api](./api.md).",
};

const indexOf = (files: FilesSnapshot) => {
  const { doc } = docusaurusAdapter.parse(files, "docs");
  return (doc.extras as { linkIndex?: ReturnType<typeof buildLinkIndex> }).linkIndex!;
};

describe("the second URL derivation", () => {
  it("resolves a relative markdown link, the species Hugo had none of", () => {
    // kubernetes/website has ZERO relative .md links and 5,796 absolute
    // paths; Docusaurus is the inverse. One loop, both corpora.
    const index = indexOf(LINKED);
    expect(index.targets["guides/configuration.mdx"]?.n).toBe(1);
  });

  it("resolves `..` against the linking file's own directory", () => {
    expect(indexOf(LINKED).targets["reference/api.md"]?.n).toBe(2);
  });

  it("resolves an absolute route, stripping no trailing slash it never had", () => {
    expect(indexOf(LINKED).targets["guides/installation.md"]?.n).toBe(2);
  });

  it("strips a numeric prefix from the route but not from the path", () => {
    // `01-cli.md` publishes at /reference/cli. The PATH keeps its
    // prefix — that is what a move has to carry.
    const index = buildLinkIndex({
      bodies: [["reference/api.md", "[cli](/reference/cli)"]],
      species: [],
      observedAt: "x",
    });
    expect(index.targets).toEqual({});
    const wired = indexOf({ ...LINKED, "reference/api.md": "[cli](/reference/cli)" });
    expect(wired.targets["reference/01-cli.md"]?.n).toBe(1);
  });

  it("declares both species, so a zero is readable", () => {
    expect(indexOf(LINKED).species).toEqual(["relative-markdown", "absolute-route"]);
  });

  it("wires into the shipped fixture unchanged, finding its zero links honestly", () => {
    // The fixture has no links. The index is still built and still
    // declares its species — "measured, and there are none" rather than
    // "not measured", which are different states.
    const index = indexOf(fixture());
    expect(index.species).toEqual(["relative-markdown", "absolute-route"]);
    expect(Object.keys(index.targets)).toEqual([]);
  });
});

describe("two species, two channels — never one number", () => {
  const movePlan = () => {
    const files = LINKED;
    const { doc } = docusaurusAdapter.parse(files, "docs");
    const edited: TocDocument = structuredClone(doc);
    // Move the first row of the first card into the second card.
    const from = edited.sections[0]!;
    const to = edited.sections[1]!;
    const row = from.topics[0]!;
    from.topics = from.topics.filter((t) => t.id !== row.id);
    to.topics = [row, ...to.topics];
    return docusaurusAdapter.planChanges!(
      files,
      edited,
      deriveSectionOrder(initialColumns(edited)),
    );
  };

  it("counts inbound links, replacing the generic sentence", () => {
    // The old warning fired on every move and carried no information —
    // the wallpaper failure docs/17 exists to avoid.
    const w = movePlan().warnings.find((x) => x.kind === "links-may-break");
    expect(w?.detail).toMatch(/inbound link/);
    expect(w?.detail).toMatch(/as of import — not rewritten/);
  });

  it("NAMES doc IDs in a separate warning, never folded into the count", () => {
    const warnings = movePlan().warnings;
    const links = warnings.find((x) => x.kind === "links-may-break");
    const ids = warnings.find((x) => x.kind === "doc-ids-change");
    expect(ids).toBeDefined();
    expect(ids?.detail).toMatch(/→/);
    // The link count must not mention ids, and the id line must not
    // carry a link count: one number meaning two things is the failure.
    expect(links?.detail).not.toMatch(/doc ID/i);
    expect(ids?.detail).not.toMatch(/inbound/);
  });

  it("neither warning blocks — both INFORM", () => {
    for (const w of movePlan().warnings) {
      if (w.kind === "links-may-break" || w.kind === "doc-ids-change") {
        expect(w.blocking).not.toBe(true);
      }
    }
  });
});
