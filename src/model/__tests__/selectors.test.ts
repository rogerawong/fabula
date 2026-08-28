import { describe, expect, it } from "vitest";
import {
  hiddenSubtreeDetail,
  hiddenSubtreeLine,
  anyTopicLocked,
  chainKey,
  chainPathKey,
  countTopics,
  documentStats,
  allRowsLocked,
  isEmpty,
  isSealed,
  pageTitlesAllDerived,
  sectionStats,
} from "../selectors";
import { sectionColorMap, ORPHAN_COLOR, SECTION_COLORS } from "../palette";
import { sampleDoc, section, topic, doc } from "./fixtures";
import type { Section, Topic } from "../types";

describe("countTopics", () => {
  it("computes totals, level counts and max depth", () => {
    const d = sampleDoc();
    const guide = d.sections[0]!;
    expect(sectionStats(guide)).toEqual({
      total: 5,
      levelCounts: { 1: 3, 2: 2 },
      maxDepth: 2,
    });
  });

  it("handles empty trees", () => {
    expect(countTopics([])).toEqual({ total: 0, levelCounts: {}, maxDepth: 0 });
  });

  it("matches brute-force recomputation on a deeper tree", () => {
    // depth chain: 1 → 2 → 3 → 4
    const t = topic("a", [topic("b", [topic("c", [topic("d")])])]);
    const stats = countTopics([t]);
    expect(stats).toEqual({
      total: 4,
      levelCounts: { 1: 1, 2: 1, 3: 1, 4: 1 },
      maxDepth: 4,
    });
  });

  it("documentStats aggregates across sections", () => {
    const d = sampleDoc();
    const stats = documentStats(d);
    // Guide 5 + Reference 3 + FAQ orphan 1
    expect(stats.total).toBe(9);
    expect(stats.sections).toBe(3);
    expect(stats.maxDepth).toBe(2);
  });
});

describe("sectionColorMap", () => {
  it("assigns palette slots round-robin, orphans get neutral without consuming a slot", () => {
    const d = sampleDoc(); // Guide, Reference, FAQ(orphan)
    const colors = sectionColorMap(d);
    expect(colors.get(d.sections[0]!.id)).toBe(SECTION_COLORS[0]);
    expect(colors.get(d.sections[1]!.id)).toBe(SECTION_COLORS[1]);
    expect(colors.get(d.sections[2]!.id)).toBe(ORPHAN_COLOR);
  });

  it("wraps around after 12 regular sections", () => {
    const sections = Array.from({ length: 13 }, (_, i) =>
      section(`S${i}`, [topic("t") as Topic]),
    );
    const colors = sectionColorMap(doc(sections));
    expect(colors.get(sections[12]!.id)).toBe(SECTION_COLORS[0]);
  });
});

describe("anyTopicLocked", () => {
  // Gestures act on a SET of topics, so the question is never "is this
  // node locked" but "does this set contain one" — a locked node riding
  // along inside a group drag is what locking exists to prevent (docs/12).
  const pinned: Topic = { ...topic("Pinned"), lock: { kind: "reference" } };
  const nested = topic("Parent", [topic("Child", [pinned])]);
  const free = topic("Free");
  const d = doc([section("Sec", [nested, free])]);

  it("is false for an empty selection", () => {
    expect(anyTopicLocked(d, [])).toBe(false);
  });

  it("is false when every named topic is movable", () => {
    expect(anyTopicLocked(d, [free.id, nested.id])).toBe(false);
  });

  it("finds a locked topic nested at any depth", () => {
    expect(anyTopicLocked(d, [pinned.id])).toBe(true);
  });

  it("is true when a locked topic rides along in a group", () => {
    expect(anyTopicLocked(d, [free.id, pinned.id])).toBe(true);
  });

  it("ignores locked topics outside the named set", () => {
    // the pin exists in the document but is not part of this gesture
    expect(anyTopicLocked(d, [free.id])).toBe(false);
  });

  it("is false for ids that are not in the document", () => {
    expect(anyTopicLocked(d, ["no-such-id"])).toBe(false);
  });
});

describe("sealed vs empty vs all-rows-locked", () => {
  // One predicate used to answer all three, and `topics.every(locked)` is
  // VACUOUSLY TRUE at zero rows — so a card generated from a spec and a
  // genuinely empty card came out identical. They are opposites (docs/13).
  const locked = (t: string): Topic => ({ ...topic(t), lock: { kind: "pattern" } });
  const spec = (title: string): Section => ({
    ...section(title, []),
    sealed: { source: "OpenAPI /openapi.json" },
  });

  it("does not seal an empty card, however tempting the vacuous truth", () => {
    const empty = section("Empty", []);
    expect(isSealed(empty)).toBe(false);
    expect(allRowsLocked(empty)).toBe(false);
    expect(isEmpty(empty)).toBe(true);
  });

  it("seals a generated card that has no rows at all", () => {
    const generated = spec("API reference");
    expect(isSealed(generated)).toBe(true);
    expect(isEmpty(generated)).toBe(true);
    // The distinction the old predicate could not make:
    expect(isSealed(generated)).not.toBe(isSealed(section("Empty", [])));
  });

  it("reports all-rows-locked as a hint, without calling it sealed", () => {
    const s = section("Releases", [locked("a"), locked("b")]);
    expect(allRowsLocked(s)).toBe(true);
    expect(isSealed(s)).toBe(false);
  });

  it("does not treat one pin among movable rows as anything", () => {
    const s = section("Manual", [locked("a"), topic("b")]);
    expect(allRowsLocked(s)).toBe(false);
    expect(isSealed(s)).toBe(false);
  });

  it("ignores locks on nested children", () => {
    const parent = topic("Parent", [locked("child")]);
    expect(allRowsLocked(section("Guide", [parent]))).toBe(false);
  });

  it("never derives a seal from locking the last movable row", () => {
    // Auto-sealing here would be action-at-a-distance: editing a row
    // silently changing what the card permits.
    const s = section("Class reference", [locked("only")]);
    expect(allRowsLocked(s)).toBe(true);
    expect(isSealed(s)).toBe(false);
  });
});

describe("a document labelled entirely from paths", () => {
  // Measured across every shipped corpus: each Mintlify document derives
  // 100% of its page titles (224/224 on mintlify/docs), while DocFX and
  // MkDocs derive a minority (3/24, 5/19). So the caveat is a property of
  // the document, needs no threshold, and is false for the formats whose
  // titles are real.
  const page = (title: string, path: string): Topic => ({
    ...topic(title, [], path),
    titleDerived: true,
  });
  const named = (title: string, path: string): Topic => topic(title, [], path);

  it("is true when every page row's title was derived", () => {
    expect(pageTitlesAllDerived(doc([section("Guide", [page("Index", "index")])]))).toBe(
      true,
    );
  });

  it("is false as soon as one page carries a real title", () => {
    const d = doc([section("Guide", [page("Index", "index"), named("Setup", "setup")])]);
    expect(pageTitlesAllDerived(d)).toBe(false);
  });

  it("ignores group rows, whose titles come from the file", () => {
    // A Mintlify group nested in `pages` has a real name AND a root path;
    // counting it would make the predicate false for every real corpus.
    const group: Topic = {
      ...topic("CLI", [page("Install", "cli/install")], "cli/index"),
    };
    expect(pageTitlesAllDerived(doc([section("Guide", [group])]))).toBe(true);
  });

  it("ignores locked rows, which are not pages and name themselves", () => {
    // The locked row carries a PATH on purpose: without one it is already
    // excluded for being pathless, and the lock clause never runs. Sphinx
    // reference and missing rows are exactly this shape.
    const pinned: Topic = {
      ...topic("Reference", [], "shared/page"),
      lock: { kind: "reference" },
    };
    const d = doc([section("Guide", [page("Index", "index"), pinned])]);
    expect(pageTitlesAllDerived(d)).toBe(true);
  });

  it("is false for a document with no page rows to speak about", () => {
    expect(pageTitlesAllDerived(doc([section("Empty", [])]))).toBe(false);
  });

  it("is false for the shipped sample, whose titles are real", () => {
    expect(pageTitlesAllDerived(sampleDoc())).toBe(false);
  });
});

describe("chain keys", () => {
  // A serializer partitions cards by chain key, but it holds raw ancestor
  // PATHS from the file, not sections. Both had better key the same way:
  // a separator that disagreed would silently route every card to the
  // wrong container, and the mistake is invisible in a diff.
  const chained = (chain: readonly string[]): Section => ({
    ...section("Card", []),
    chain,
  });

  it("keys a raw ancestor path exactly as it keys a section carrying it", () => {
    const path = ["en", "Documentation"];
    expect(chainPathKey(path)).toBe(chainKey(chained(path)));
  });

  it("keys an unchained section and an empty path alike", () => {
    expect(chainPathKey([])).toBe(chainKey(section("Top level", [])));
  });

  it("separates segments with a character no container name can contain", () => {
    // Joining on a printable character would collide: a tab named
    // "a/b" would key the same as tabs "a" then "b".
    expect(chainPathKey(["a", "b"])).not.toBe(chainPathKey(["a/b"]));
    expect(chainPathKey(["a", "b"])).not.toBe(chainPathKey(["a b"]));
  });
});

describe("hiddenSubtreeLine — the card-level cause (docs/14)", () => {
  const via = (name: string) => ({
    reasons: [{ label: "toc_hide", note: "n" }],
    inheritedFrom: { via: name, reasons: [{ label: "toc_hide", note: "n" }] },
  });
  const topic = (id: string, unlisted?: object, children: unknown[] = []) =>
    ({ id, title: id, children, ...(unlisted ? { unlisted } : {}) }) as never;

  it("is null when nothing inherits", () => {
    expect(
      hiddenSubtreeLine({ id: "s", title: "S", topics: [topic("a")] } as never),
    ).toBeNull();
  });

  it("names the cause and counts the rows, nested included", () => {
    const section = {
      id: "s",
      title: "S",
      topics: [
        topic("a"),
        topic("b", via("Definitions"), [topic("c", via("Definitions"))]),
      ],
    } as never;
    expect(hiddenSubtreeLine(section)).toBe("2 rows hidden via “Definitions”");
  });

  it("uses the singular for one row", () => {
    const section = {
      id: "s",
      title: "S",
      topics: [topic("b", via("Generated"))],
    } as never;
    expect(hiddenSubtreeLine(section)).toBe("1 row hidden via “Generated”");
  });

  it("NAMES BOTH when there are exactly two", () => {
    // "…and 1 other" reads as a dominant cause with a footnote. On the
    // corpus the Reference split is 135/64 — two comparable regions, and
    // summarising one of them away misdescribes the shape.
    const section = {
      id: "s",
      title: "S",
      topics: [topic("a", via("Big")), topic("b", via("Big")), topic("c", via("Small"))],
    } as never;
    expect(hiddenSubtreeLine(section)).toBe("3 rows hidden via “Big” and “Small”");
  });

  it("summarises only at three or more, largest first", () => {
    const section = {
      id: "s",
      title: "S",
      topics: [
        topic("a", via("Big")),
        topic("b", via("Big")),
        topic("c", via("Mid")),
        topic("d", via("Small")),
      ],
    } as never;
    expect(hiddenSubtreeLine(section)).toBe("4 rows hidden via “Big” and 2 others");
  });

  it("the hover detail lists EVERY cause with its own count", () => {
    const section = {
      id: "s",
      title: "S",
      topics: [
        topic("a", via("Big")),
        topic("b", via("Big")),
        topic("c", via("Mid")),
        topic("d", via("Small")),
      ],
    } as never;
    expect(hiddenSubtreeDetail(section)).toBe(
      "2 rows via “Big”\n1 row via “Mid”\n1 row via “Small”",
    );
  });
});
