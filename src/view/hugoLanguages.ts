/**
 * hugoLanguages.ts — Reading the sibling-language facts a Hugo document
 * carries (docs/14).
 *
 * DECLARED ≠ PRESENT. A site's config states how many languages it
 * publishes; a folder grant carries whatever was cloned. The reference
 * corpus declares 17 and holds 1, and that is the ordinary case rather
 * than a broken one — so the disclosure counts DECLARED (the true fact
 * about the site) and marks which of them this folder can actually open.
 */

import type { TocDocument } from "@/model/types";

export interface LanguageFacts {
  /** Every language the config declares, in config order. */
  declared: { key: string; label: string; contentDir: string | null }[];
  /** Keys whose content is in the granted folder. */
  present: string[];
  /** The one on screen. */
  loaded: string | null;
}

export function languageFacts(doc: TocDocument): LanguageFacts | null {
  const hugo = (doc.extras as { hugo?: Record<string, unknown> } | undefined)?.hugo;
  if (!hugo) return null;
  const declared = hugo.languages as LanguageFacts["declared"] | undefined;
  if (!declared || declared.length < 2) return null; // nothing to disclose
  return {
    declared,
    present: (hugo.presentLanguages as string[] | undefined) ?? [],
    loaded: (hugo.loadedLanguage as string | null | undefined) ?? null,
  };
}

/** "17 languages · English loaded" — the persistent half of the
 *  disclosure. Deliberately states the DECLARED count. */
export function languageSummary(facts: LanguageFacts): string {
  const loaded = facts.declared.find((l) => l.key === facts.loaded);
  return `${facts.declared.length} languages · ${loaded?.label ?? facts.loaded ?? "one"} loaded`;
}

/** Openable siblings: present in the folder, and not the one on screen. */
export function openableSiblings(facts: LanguageFacts): LanguageFacts["declared"] {
  return facts.declared.filter(
    (l) => facts.present.includes(l.key) && l.key !== facts.loaded,
  );
}

/** Why a declared language cannot be opened from this folder. */
export function absenceReason(facts: LanguageFacts, key: string): string | null {
  if (facts.present.includes(key)) return null;
  return "not present in this folder";
}

export type SiblingState = "loaded" | "openable" | "disabled";

export interface SiblingEntry {
  key: string;
  label: string;
  contentDir: string | null;
  state: SiblingState;
  /** One line, only when disabled. */
  reason?: string;
}

/**
 * What the picker offers, and why each entry is what it is.
 *
 * Two independent reasons a door does not open, and they are NOT the
 * same fact, so they do not share a message:
 *
 * - the language is declared by the site but its content was never in
 *   the granted folder — nothing to read from this import, ever;
 * - the content may well be there, but this import kept no directory
 *   handle (webkitdirectory, GitHub, paste), so the app cannot reach it.
 *   That one is fixable by the user, and the message says how.
 *
 * Pure, so both branches are testable without a browser: a
 * FileSystemDirectoryHandle cannot be constructed in a node test, and
 * the partition is the interesting part rather than the read.
 */
export function siblingEntries(facts: LanguageFacts, hasHandle: boolean): SiblingEntry[] {
  return facts.declared.map((lang): SiblingEntry => {
    if (lang.key === facts.loaded) return { ...lang, state: "loaded" };
    if (!facts.present.includes(lang.key)) {
      return { ...lang, state: "disabled", reason: "not present in this folder" };
    }
    if (!hasHandle) {
      return {
        ...lang,
        state: "disabled",
        reason: "re-import the folder to open this language",
      };
    }
    return { ...lang, state: "openable" };
  });
}
