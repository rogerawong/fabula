/**
 * The handle path: opening a sibling language as its own document.
 *
 * Driven through a FAKE FileSystemDirectoryHandle rather than a real
 * one, because a real handle cannot be constructed outside a browser and
 * the interesting behaviour is what gets READ and what the new document
 * ends up owning — not the picker dance.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { useAppStore } from "@/store";
import { filesOf } from "@/collections/types";
import { openLanguageFromHandle } from "../loadCollection";

const ROOT = "src/collections/__tests__/fixtures/hugo-edges";

/** Minimal stand-in for the browser handle: enough of the shape that
 *  walkDirectory and the permission check are exercised for real. */
function fakeHandle(dir: string, granted = true): FileSystemDirectoryHandle {
  const make = (abs: string, name: string): FileSystemDirectoryHandle =>
    ({
      kind: "directory",
      name,
      queryPermission: () => Promise.resolve(granted ? "granted" : "prompt"),
      requestPermission: () => Promise.resolve(granted ? "granted" : "denied"),
      async *values() {
        for (const entry of readdirSync(abs)) {
          const child = join(abs, entry);
          if (statSync(child).isDirectory()) yield make(child, entry);
          else {
            yield {
              kind: "file",
              name: entry,
              getFile: () =>
                Promise.resolve({
                  size: statSync(child).size,
                  text: () => Promise.resolve(readFileSync(child, "utf8")),
                } as unknown as File),
            } as unknown as FileSystemFileHandle;
          }
        }
      },
    }) as unknown as FileSystemDirectoryHandle;
  return make(dir, relative(".", dir));
}

describe("opening a sibling language from the retained handle", () => {
  beforeEach(() => {
    useAppStore.setState({ tabs: [], activeTabId: null });
  });

  it("opens it as its OWN document, scoped to that language's contentDir", () => {
    return openLanguageFromHandle(fakeHandle(ROOT), "content/de", "Deutsch").then(
      ({ tabId }) => {
        const tab = useAppStore.getState().tabs.find((t) => t.id === tabId)!;
        expect(tab, "a new tab, not a mutation of the current one").toBeDefined();
        expect(tab.editor.document.formatId).toBe("hugo");

        // its own snapshot: German content only, no English carried over
        const kept = Object.keys(filesOf(tab.editor.document));
        expect(kept.some((p) => p.startsWith("content/de/"))).toBe(true);
        expect(kept.some((p) => p.startsWith("content/en/"))).toBe(false);

        // and the tree is the German one
        expect(tab.editor.document.sections.map((s) => s.title)).toContain("Konzepte");
      },
    );
  });

  it("refuses legibly when permission has lapsed", async () => {
    await expect(
      openLanguageFromHandle(fakeHandle(ROOT, false), "content/de", "Deutsch"),
    ).rejects.toThrow(/re-import/i);
  });

  it("refuses legibly when the language's directory holds nothing", async () => {
    await expect(
      openLanguageFromHandle(fakeHandle(ROOT), "content/fr", "Français"),
    ).rejects.toThrow(/No content found under content\/fr/);
  });
});
