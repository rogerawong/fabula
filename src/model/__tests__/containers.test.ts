/**
 * The container registry: what a card may be dropped into, and the lint
 * that catches a declaration disagreeing with the cards (docs/13 v2).
 */

import { describe, expect, it } from "vitest";
import { doc, section, topic } from "./fixtures";
import type { ContainerDescriptor, Section, TocDocument } from "../types";
import {
  containerFor,
  containerPhrase,
  containerTooltip,
  containersInOrder,
  lintContainers,
  wouldEmptyContainer,
} from "../containers";

const container = (
  chainKey: string,
  label: string,
  order: number,
  accepts: { sections: boolean; orphans: boolean },
  mayEmpty = true,
): ContainerDescriptor => ({ chainKey, label, order, accepts, mayEmpty });

const carded = (title: string, chain: readonly string[], orphan = false): Section => ({
  ...section(title, [topic(`${title} page`, [], title.toLowerCase())]),
  chain,
  ...(orphan ? { isOrphan: true } : {}),
});

/** Two tabs that bear sections, plus a global lane that bears anchors. */
const twoTabs = (): TocDocument => ({
  ...doc([
    carded("Get started", ["Guides"]),
    carded("Operate", ["Guides"]),
    carded("Endpoints", ["API"]),
    carded("Status", ["global"], true),
  ]),
  containers: [
    container("Guides", "Guides", 0, { sections: true, orphans: false }, false),
    container("API", "API", 1, { sections: true, orphans: false }, false),
    container("global", "global", 2, { sections: false, orphans: true }),
  ],
});

describe("containerFor", () => {
  it("finds a container by the chain key its sections carry", () => {
    const d = twoTabs();
    expect(containerFor(d, "API")?.label).toBe("API");
  });

  it("is undefined for a chain no container declares", () => {
    expect(containerFor(twoTabs(), "nonexistent")).toBeUndefined();
  });

  it("is undefined for a document that declares no containers at all", () => {
    // Every format whose cards are top level — the mechanism stays inert.
    expect(containerFor(doc([section("Guide", [])]), "")).toBeUndefined();
  });
});

describe("containersInOrder", () => {
  it("orders containers by their declaration, never by where cards sit", () => {
    const d = twoTabs();
    // Reversing the CARDS must not reorder the containers: deriving
    // container order from member positions is action-at-a-distance.
    d.sections.reverse();
    expect(containersInOrder(d).map((c) => c.label)).toEqual(["Guides", "API", "global"]);
  });

  it("is empty for a document with no containers", () => {
    expect(containersInOrder(doc([section("Guide", [])]))).toEqual([]);
  });

  it("sorts by the declared order, not by the order they were listed in", () => {
    // The declaration array is not the authority; `order` is. Without
    // that, lane and band order would drift with however an adapter
    // happened to append its descriptors.
    const d = twoTabs();
    d.containers = [
      container("C", "Third", 2, { sections: true, orphans: false }),
      container("A", "First", 0, { sections: true, orphans: false }),
      container("B", "Second", 1, { sections: true, orphans: false }),
    ];
    expect(containersInOrder(d).map((c) => c.label)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });
});

describe("wouldEmptyContainer", () => {
  it("is true when the last card leaves a container that may not empty", () => {
    const d = twoTabs();
    const endpoints = d.sections.find((s) => s.title === "Endpoints")!;
    expect(wouldEmptyContainer(d, endpoints)).toBe(true);
  });

  it("is false when the container keeps a card", () => {
    const d = twoTabs();
    const started = d.sections.find((s) => s.title === "Get started")!;
    expect(wouldEmptyContainer(d, started)).toBe(false);
  });

  it("is false when the container is allowed to empty", () => {
    const d = twoTabs();
    const status = d.sections.find((s) => s.title === "Status")!;
    expect(wouldEmptyContainer(d, status)).toBe(false);
  });

  it("is false for an unchained card in a document with no containers", () => {
    const d = doc([section("Guide", [])]);
    expect(wouldEmptyContainer(d, d.sections[0]!)).toBe(false);
  });
});

describe("container copy", () => {
  // `kind` is the format's own noun for a container, and it feeds copy
  // ONLY — a tooltip, the seam menu, the undo toast. Behaviour stays on
  // accepts/mayEmpty, so the field can never grow teeth.
  const withKind = (kind?: string): ContainerDescriptor => ({
    ...container("API", "API reference", 0, { sections: true, orphans: false }),
    ...(kind ? { kind } : {}),
  });

  it("names a container by the format's own noun when it has one", () => {
    expect(containerPhrase(withKind("tab"))).toBe("tab 'API reference'");
  });

  it("falls back to the label alone when the format has no noun", () => {
    expect(containerPhrase(withKind())).toBe("API reference");
  });

  it("capitalizes the standalone form, for a tooltip", () => {
    expect(containerTooltip(withKind("tab"))).toBe("Tab 'API reference'");
    expect(containerTooltip(withKind())).toBe("API reference");
  });

  it("says nothing at all for a card in no declared container", () => {
    expect(containerTooltip(undefined)).toBeUndefined();
    expect(containerPhrase(undefined)).toBeUndefined();
  });
});

describe("lintContainers", () => {
  // Like-joins-like survives as a LINT, not as the source of truth: it
  // catches a declaration that disagrees with the cards, which is a bug
  // in the adapter rather than a fact about the format.
  it("passes a document whose declarations match its cards", () => {
    expect(lintContainers(twoTabs())).toEqual([]);
  });

  it("passes a document that declares no containers", () => {
    expect(lintContainers(doc([section("Guide", [])]))).toEqual([]);
  });

  it("catches a section card sitting in a container that declares it bears none", () => {
    const d = twoTabs();
    d.sections.push(carded("Smuggled", ["global"]));
    expect(lintContainers(d).join(" ")).toMatch(/global/);
  });

  it("catches a section card whose chain no container declares", () => {
    const d = twoTabs();
    d.sections.push(carded("Orphaned chain", ["Nowhere"]));
    expect(lintContainers(d).join(" ")).toMatch(/Nowhere/);
  });

  it("says nothing about an orphan in a container that bears no sections", () => {
    // Mintlify's `navigation.languages` holds language objects and $ref
    // pointers; the $refs are orphan cards, and declaring that array
    // bears neither is correct. Flagging its own contents would be the
    // lint disagreeing with the format rather than with the adapter.
    const d = twoTabs();
    d.containers = [
      ...d.containers!,
      container("", "Top level", 3, { sections: false, orphans: false }),
    ];
    d.sections.push(carded("./fr.json", [], true));
    expect(lintContainers(d)).toEqual([]);
  });

  it("says nothing about a bearing container that happens to be empty", () => {
    // The case that killed derivation: a container legally bears
    // sections and holds none yet. It must still render a lane and
    // accept the first card dropped into it.
    const d = twoTabs();
    d.containers = [
      ...d.containers!,
      container("Reference", "Reference", 3, { sections: true, orphans: false }),
    ];
    expect(lintContainers(d)).toEqual([]);
    expect(containerFor(d, "Reference")?.accepts.sections).toBe(true);
  });
});
