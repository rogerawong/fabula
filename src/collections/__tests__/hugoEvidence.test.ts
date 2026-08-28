/**
 * What Hugo's parse OBSERVED and the snapshot cannot recompute
 * (docs/17, Tier 2).
 *
 * The classifier is binding here, and this file is where it gets tested
 * in both directions. `scan()` holds the implicit-section and tied-set
 * facts in hand at the very moment it writes evidence, and emitting them
 * there would feel efficient — but the snapshot keeps those paths and
 * those weights, so they are SELECTORS, recomputed on open. Evidence is
 * for what the snapshot cannot recompute, not for what parse happened to
 * notice first.
 */

import { describe, expect, it } from "vitest";
import { hugoAdapter } from "../adapters/hugo";
import { groupIntoEvidence } from "../importEvidence";

const CONFIG = `baseURL = "https://example.org"
contentDir = "content/en"
ignoreFiles = ["content/en/drafts/.*"]

[languages.en]
  contentDir = "content/en"
[languages.fr]
  contentDir = "content/fr"
`;

const page = (title: string, weight?: number) =>
  `---\ntitle: ${title}\n${weight === undefined ? "" : `weight: ${weight}\n`}---\n\nbody\n`;

/** A site with every Tier-2 shape and every Tier-1 temptation. */
const FILES: Record<string, string> = {
  "hugo.toml": CONFIG,
  "content/en/_index.md": page("Home"),
  "content/en/docs/_index.md": page("Docs"),
  "content/en/docs/a.md": page("A"),
  // Tier 1 temptation: tied weights, and an implicit section below.
  "content/en/docs/b.md": page("B", 10),
  "content/en/docs/c.md": page("C", 10),
  "content/en/docs/implicit/x.md": page("X"),
  // Tier 2: skipped by ignoreFiles.
  "content/en/drafts/d1.md": page("Draft one"),
  "content/en/drafts/d2.md": page("Draft two"),
  // Tier 2: a leaf bundle — index.md is the page, its siblings are resources.
  "content/en/docs/bundle/index.md": page("Bundle"),
  "content/en/docs/bundle/note.md": page("Folded one"),
  "content/en/docs/bundle/extra.md": page("Folded two"),
  // Tier 2: front matter this adapter refuses to read.
  "content/en/docs/toml.md": `+++\ntitle = "Toml"\n+++\n\nbody\n`,
};

const evidenceFor = (files: Record<string, string>) => {
  const result = hugoAdapter.parse(files, "site");
  return groupIntoEvidence([
    ...(result.evidence ?? []),
    ...result.warnings.map((w) => ({ kind: w.kind, detail: w.detail })),
  ]);
};

const kinds = (files: Record<string, string>) => evidenceFor(files).map((e) => e.kind);

describe("hugo contributes what the snapshot cannot recompute", () => {
  it("reports files ignoreFiles skipped, which no later pass could find", () => {
    const record = evidenceFor(FILES).find((e) => e.kind === "hugo-ignored");
    expect(record?.count).toBe(2);
  });

  it("names the rule that did the skipping, inline", () => {
    const record = evidenceFor(FILES).find((e) => e.kind === "hugo-ignored");
    expect(record?.receipt).toContain("ignoreFiles");
  });

  it("reports resources folded into a leaf bundle", () => {
    const record = evidenceFor(FILES).find((e) => e.kind === "hugo-bundle-resource");
    expect(record?.count).toBe(2);
  });

  it("reports front matter it refuses to read", () => {
    expect(kinds(FILES)).toContain("toml-frontmatter");
  });

  it("reports languages declared but not present in the granted folder", () => {
    // Presence was observed against a folder that is gone; the config
    // that DECLARES them is kept, so only presence is evidence.
    const record = evidenceFor(FILES).find((e) => e.kind === "hugo-language-absent");
    expect(record?.count).toBe(1);
  });

  it("stores no exemplars for any of it — the files are not in the document", () => {
    for (const record of evidenceFor(FILES)) {
      expect(record.exemplars).toEqual([]);
    }
  });

  it("is deterministic across runs", () => {
    expect(JSON.stringify(evidenceFor(FILES))).toBe(JSON.stringify(evidenceFor(FILES)));
  });
});

describe("the classifier is binding — Tier-1 facts are never emitted here", () => {
  // Each of these IS observable during scan(), and each is recomputable
  // from the kept snapshot, so each must stay a selector. Emitting one
  // as evidence would store a derivation, which is the thing the fence
  // forbids — and the double computation is not a reason: the answer to
  // a slow selector is a faster selector, never a stored derivation.
  it("does not emit implicit sections", () => {
    expect(kinds(FILES).join(" ")).not.toMatch(/implicit/i);
  });

  it("does not emit tied or unweighted sibling sets", () => {
    expect(kinds(FILES).join(" ")).not.toMatch(/tied|unweighted|weight/i);
  });

  it("does not emit .html pages included", () => {
    const withHtml = { ...FILES, "content/en/docs/legacy.html": "<h1>Legacy</h1>" };
    expect(kinds(withHtml).join(" ")).not.toMatch(/html/i);
  });

  it("does not emit languages DECLARED — the config that declares them is kept", () => {
    const declared = evidenceFor(FILES).filter((e) => /declared/i.test(e.kind));
    expect(declared).toEqual([]);
  });
});
