/**
 * The one sentence a reviewer relies on to tell a slug from a title.
 */

import { describe, expect, it } from "vitest";
import { doc, sampleDoc, section, topic } from "@/model/__tests__/fixtures";
import type { Section, Topic, TocDocument } from "@/model/types";
import { derivedTitlesNote } from "../derivedTitles";

const page = (title: string, path: string): Topic => ({
  ...topic(title, [], path),
  titleDerived: true,
});

/** A Mintlify shape: real card titles from the file, derived page titles. */
const mintlifyish = (): TocDocument =>
  doc([
    section("Get started", [page("Index", "index"), page("Quickstart", "quickstart")]),
  ]);

/** A bare-path nav: the cards are orphan wrappers named from paths too. */
const barePath = (): TocDocument =>
  doc([
    {
      ...section("Intro", [page("Intro", "intro.md")]),
      titleDerived: true,
      isOrphan: true,
    },
    {
      ...section("Setup", [page("Setup", "guide/setup.md")]),
      titleDerived: true,
      isOrphan: true,
    },
  ] as Section[]);

describe("derivedTitlesNote", () => {
  it("says nothing about a document whose titles are its own", () => {
    expect(derivedTitlesNote(sampleDoc())).toBeNull();
  });

  it("names the caveat, and vouches for the card titles it can vouch for", () => {
    const note = derivedTitlesNote(mintlifyish());
    expect(note).toContain("derived from file paths");
    expect(note).toContain("Card titles are read from the file");
  });

  it("drops the reassurance when the cards are path-derived too", () => {
    // A bare-path DocFX or MkDocs nav. Claiming the card titles are real
    // would be false for every label on the canvas — the exact misread
    // this sentence exists to prevent.
    const note = derivedTitlesNote(barePath());
    expect(note).toContain("derived from file paths");
    expect(note).not.toContain("Card titles");
  });
});
