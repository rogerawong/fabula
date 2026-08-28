import { describe, expect, it } from "vitest";
import { hugoAdapter } from "@/collections/adapters/hugo";
import {
  absenceReason,
  languageFacts,
  languageSummary,
  openableSiblings,
  siblingEntries,
  type SiblingEntry,
} from "../hugoLanguages";

const raw = import.meta.glob("../../collections/__tests__/fixtures/hugo/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const files = () => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.endsWith("README.md")) continue;
    out[k.replace("../../collections/__tests__/fixtures/hugo/", "")] = v;
  }
  return out;
};

describe("sibling-language disclosure", () => {
  const facts = () => languageFacts(hugoAdapter.parse(files(), "k8s").doc)!;

  it("states the DECLARED count and the loaded language by its own name", () => {
    expect(languageSummary(facts())).toMatch(/^17 languages · English loaded$/);
  });

  it("offers no door to a language this folder does not carry", () => {
    // 17 declared, 1 cloned: every sibling is absent, so there is nothing
    // to open and the disclosure must not pretend otherwise.
    expect(openableSiblings(facts())).toEqual([]);
    expect(absenceReason(facts(), "de")).toBe("not present in this folder");
    expect(absenceReason(facts(), "en")).toBeNull();
  });

  it("stays silent for a single-language site", () => {
    const { doc } = hugoAdapter.parse(
      {
        "hugo.toml": 'contentDir = "content"\n',
        "content/docs/a.md": "---\ntitle: A\n---\n",
      },
      "One",
    );
    expect(languageFacts(doc)).toBeNull();
  });

  it("is null for a non-Hugo document", () => {
    expect(
      languageFacts({ id: "d", name: "n", formatId: "docfx", sections: [] }),
    ).toBeNull();
  });
});

describe("what the picker offers", () => {
  const facts = () => languageFacts(hugoAdapter.parse(files(), "k8s").doc)!;

  it("marks the loaded language, never as a door", () => {
    const en = siblingEntries(facts(), true).find((e) => e.key === "en")!;
    expect(en.state).toBe("loaded");
    expect(en.reason).toBeUndefined();
  });

  it("disables a declared language absent from the folder", () => {
    const de = siblingEntries(facts(), true).find((e) => e.key === "de")!;
    expect(de.state).toBe("disabled");
    expect(de.reason).toBe("not present in this folder");
  });

  it("distinguishes 'not here' from 'no handle' — different facts, different fixes", () => {
    // A present sibling with no directory handle is not missing; it is
    // unreachable by THIS import, and the user can fix that.
    const present = {
      declared: [
        { key: "en", label: "English", contentDir: "content/en" },
        { key: "de", label: "Deutsch", contentDir: "content/de" },
      ],
      present: ["en", "de"],
      loaded: "en",
    };
    const withHandle = siblingEntries(present, true).find((e) => e.key === "de")!;
    expect(withHandle.state).toBe("openable");
    expect(withHandle.reason).toBeUndefined();

    const without = siblingEntries(present, false).find((e) => e.key === "de")!;
    expect(without.state).toBe("disabled");
    expect(without.reason).toBe("re-import the folder to open this language");
  });

  it("never offers a half-open: every entry is loaded, openable, or explained", () => {
    for (const hasHandle of [true, false]) {
      for (const e of siblingEntries(facts(), hasHandle) as SiblingEntry[]) {
        if (e.state === "disabled") expect(e.reason).toBeTruthy();
        else expect(e.reason).toBeUndefined();
      }
    }
  });
});
