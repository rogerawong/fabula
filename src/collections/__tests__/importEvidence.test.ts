/**
 * Import evidence: the stored, one-per-kind record the review dialog and
 * the Overview panel both read (docs/17).
 *
 * The migration is the load-bearing part. It touches every document in
 * every user's localStorage, and the one reshape this project got wrong
 * — `TopicUnlisted` — was neither readable nor version-bumped and
 * blanked the app. So the alias is tested from the stored side: an old
 * document must load, not merely typecheck.
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "@/model/__tests__/fixtures";
import type { TocDocument } from "@/model/types";
import { evidenceOf, groupIntoEvidence, MAX_EXEMPLARS } from "../importEvidence";

const stored = (extras: Record<string, unknown>): TocDocument => ({
  ...doc([section("Guide", [topic("Intro", [], "intro.md")])]),
  extras,
});

describe("reading stored evidence", () => {
  it("reads the new key", () => {
    const d = stored({
      importEvidence: [
        { kind: "skipped", count: 84, detail: "84 files skipped", exemplars: [] },
      ],
    });
    expect(evidenceOf(d).map((e) => [e.kind, e.count])).toEqual([["skipped", 84]]);
  });

  it("reads a legacy importWarnings array through the alias", () => {
    // A session stored before the rename. PERSIST_VERSION does not bump,
    // because the old shape is still READABLE — which is the difference
    // between a migration and a break.
    const d = stored({
      importWarnings: [
        { kind: "sibling-languages", detail: "17 languages declared · English loaded" },
        { kind: "frontmatter-created", detail: "created front matter for 3 pages" },
      ],
    });
    expect(evidenceOf(d).map((e) => e.kind)).toEqual([
      "sibling-languages",
      "frontmatter-created",
    ]);
  });

  it("reads each legacy record as one occurrence with no exemplars", () => {
    const d = stored({ importWarnings: [{ kind: "page-hidden", detail: "one page" }] });
    expect(evidenceOf(d)[0]).toMatchObject({ count: 1, exemplars: [] });
  });

  it("prefers the new key when a document somehow carries both", () => {
    const d = stored({
      importEvidence: [{ kind: "new", count: 2, exemplars: [] }],
      importWarnings: [{ kind: "old", detail: "stale" }],
    });
    expect(evidenceOf(d).map((e) => e.kind)).toEqual(["new"]);
  });

  it("drops a legacy blocking flag rather than carrying it across", () => {
    // `blocking` gates SAVING and is computed from the plan's warnings,
    // never from the import array. It splits to the plan side; carrying
    // it here would keep one name serving two referents.
    const d = stored({
      importWarnings: [{ kind: "refusal", detail: "bad", blocking: true }],
    });
    expect(evidenceOf(d)[0]).not.toHaveProperty("blocking");
  });

  it("is empty for a document with no extras at all", () => {
    // Every format-adapter document: openCollection is the only writer.
    expect(evidenceOf(doc([section("Guide", [])]))).toEqual([]);
  });

  it("is empty rather than throwing when the stored value is malformed", () => {
    expect(evidenceOf(stored({ importEvidence: "not an array" }))).toEqual([]);
    expect(evidenceOf(stored({ importWarnings: { kind: "x" } }))).toEqual([]);
  });
});

describe("grouping occurrences into one record per kind", () => {
  const occ = (kind: string, detail: string, sectionId?: string, topicId?: string) => ({
    kind,
    detail,
    ...(sectionId ? { subject: { sectionId, ...(topicId ? { topicId } : {}) } } : {}),
  });

  it("collapses many occurrences of one kind into a single record", () => {
    const evidence = groupIntoEvidence([
      occ("skipped", "a.md skipped"),
      occ("skipped", "b.md skipped"),
      occ("refused", "c.toml refused"),
    ]);
    expect(evidence.map((e) => [e.kind, e.count])).toEqual([
      ["skipped", 2],
      ["refused", 1],
    ]);
  });

  it("keeps the first occurrence's detail as the record's prose", () => {
    const evidence = groupIntoEvidence([
      occ("skipped", "first"),
      occ("skipped", "second"),
    ]);
    expect(evidence[0]?.detail).toBe("first");
  });

  it("counts every occurrence, including the ones it does not exemplify", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      occ("skipped", `f${i}`, "s1", `t${i}`),
    );
    const [record] = groupIntoEvidence(many);
    expect(record?.count).toBe(25);
    expect(record?.exemplars).toHaveLength(MAX_EXEMPLARS);
  });

  it("holds count >= exemplars.length, always", () => {
    for (const n of [0, 1, 19, 20, 21, 200]) {
      const [record] = groupIntoEvidence(
        Array.from({ length: n }, (_, i) => occ("k", `d${i}`, "s1", `t${i}`)),
      );
      if (n === 0) expect(record).toBeUndefined();
      else expect(record!.count).toBeGreaterThanOrEqual(record!.exemplars.length);
    }
  });

  it("takes the FIRST exemplars in the order given, so the same corpus stores the same bytes", () => {
    const many = Array.from({ length: 25 }, (_, i) => occ("k", `d${i}`, "s1", `t${i}`));
    const once = groupIntoEvidence(many);
    const twice = groupIntoEvidence(many);
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
    expect(once[0]?.exemplars[0]?.topicId).toBe("t0");
    expect(once[0]?.exemplars.at(-1)?.topicId).toBe("t19");
  });

  it("stores no exemplars for occurrences that name no node", () => {
    // "84 files skipped by ignoreFiles" has nothing on the canvas to
    // look at — those files are not in the document by definition.
    const [record] = groupIntoEvidence([occ("skipped", "a"), occ("skipped", "b")]);
    expect(record?.exemplars).toEqual([]);
    expect(record?.count).toBe(2);
  });

  it("keeps kinds in first-appearance order", () => {
    const evidence = groupIntoEvidence([occ("b", "1"), occ("a", "2"), occ("b", "3")]);
    expect(evidence.map((e) => e.kind)).toEqual(["b", "a"]);
  });

  it("carries a receipt when the occurrence has one", () => {
    const evidence = groupIntoEvidence([
      { kind: "skipped", detail: "a", receipt: "ignoreFiles" },
    ]);
    expect(evidence[0]?.receipt).toBe("ignoreFiles");
  });
});
