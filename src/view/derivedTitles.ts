/**
 * derivedTitles.ts — What the header says about a document whose page
 * titles were derived from paths rather than read from the source.
 *
 * The decision lives here rather than inside the header so it can be
 * tested in the DOM-free suite: it is a question about a document, and
 * the answer is one sentence a reviewer relies on.
 */

import { pageTitlesAllDerived } from "@/model/selectors";
import type { TocDocument } from "@/model/types";

const CAVEAT =
  "Page titles are derived from file paths, so they will differ from the " +
  "labels the published site shows.";

const CARDS_ARE_REAL = " Card titles are read from the file.";

/**
 * The note for this document, or null when its titles are its own.
 *
 * The reassurance about card titles is conditional: a bare-path
 * navigation (an href-only DocFX file, a path-only MkDocs nav) derives
 * its CARD titles too, and there the sentence would be false for every
 * label on the canvas — the opposite of what it exists to do.
 */
export function derivedTitlesNote(doc: TocDocument): string | null {
  if (!pageTitlesAllDerived(doc)) return null;
  const cardsAreReal = doc.sections.every((s) => !s.titleDerived);
  return cardsAreReal ? CAVEAT + CARDS_ARE_REAL : CAVEAT;
}
