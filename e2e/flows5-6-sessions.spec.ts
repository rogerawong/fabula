/**
 * Flows 5–6 (docs/07 Layer 5) — the M6 definition of done:
 *   5. Export → downloaded text parses and matches the edited document.
 *   6. Reload page → tabs and arrangement persist.
 * Plus: tabs lifecycle, load dialog (paste + errors), code view.
 */

import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { expect, test, type Page } from "@playwright/test";
import { watchConsole } from "./helpers";

test.use({ viewport: { width: 1600, height: 1000 } });

async function loadSample(page: Page) {
  await page.goto("/");
  await page.getByTestId("empty-load-sample-docfx").click();
  await expect(page.getByTestId("card")).toHaveCount(8);
}

test("flow 5: export honors edits and section order, and re-parses", async ({ page }) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  // edit: rename Guides → Field Guide
  await page.getByRole("heading", { name: "Guides", exact: true }).dblclick();
  await page.getByTestId("inline-edit").fill("Field Guide");
  await page.getByTestId("inline-edit").press("Enter");

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-button").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("toc.yml");

  const text = readFileSync((await download.path())!, "utf8");
  const parsed = yaml.load(text) as { items: { name?: string; href?: string }[] };
  // renamed section is in the export
  expect(parsed.items.some((n) => n.name === "Field Guide")).toBe(true);
  expect(parsed.items.some((n) => n.name === "Guides")).toBe(false);
  // full document round-trips: all 8 top-level entries present, sample
  // order preserved (Overview first, Release Notes last)
  expect(parsed.items).toHaveLength(8);
  expect(parsed.items[0]!.name).toBe("Overview");
  expect(parsed.items.at(-1)!.name).toBe("Release Notes");

  console_.assertClean();
});

test("flow 6: reload restores tabs, edits, and arrangement", async ({ page }) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  // rename a section and reorder a card so persistence has real work
  await page.getByRole("heading", { name: "Guides", exact: true }).dblclick();
  await page.getByTestId("inline-edit").fill("Persisted Guide");
  await page.getByTestId("inline-edit").press("Enter");

  // second tab
  await page.getByTestId("load-menu").click();
  await page.getByTestId("load-sample-docfx").click();
  await expect(page.getByTestId("tab")).toHaveCount(2);

  // wait past the persistence debounce
  await page.waitForTimeout(700);
  await page.reload();

  await expect(page.getByTestId("tab")).toHaveCount(2);
  // second tab was active; switch to the first and find the rename
  await page.getByTestId("tab").first().click();
  await expect(
    page.getByRole("heading", { name: "Persisted Guide", exact: true }),
  ).toBeVisible();

  console_.assertClean();
});

test("tabs: context-menu copy, rename, close with undo toast", async ({ page }) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  // right-click → Copy to new tab (the compare-alternatives flow)
  await page.getByTestId("tab").click({ button: "right" });
  await expect(page.getByTestId("context-menu")).toBeVisible();
  await page.getByRole("menuitem", { name: "Copy to new tab" }).click();
  await expect(page.getByTestId("context-menu")).not.toBeVisible();
  await expect(page.getByTestId("tab")).toHaveCount(2);
  await expect(page.getByTestId("tab").nth(1)).toContainText("Toc (copy)");

  // rename the duplicate via double-click (menu Rename shares the path)
  await page.getByTestId("tab").nth(1).dblclick();
  await page.getByTestId("inline-edit").fill("Draft B");
  await page.getByTestId("inline-edit").press("Enter");
  await expect(page.getByTestId("tab").nth(1)).toContainText("Draft B");

  // close via the context menu → toast undo restores it
  await page.getByTestId("tab").nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Close" }).click();
  await expect(page.getByTestId("tab")).toHaveCount(1);
  await page
    .locator("[data-sonner-toast]", { hasText: 'Closed "Draft B"' })
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(page.getByTestId("tab")).toHaveCount(2);
  await expect(page.getByTestId("tab").nth(1)).toContainText("Draft B");

  console_.assertClean();
});

test("load dialog: paste loads a document; bad input shows a specific error", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await page.goto("/");
  await page.getByTestId("empty-open-dialog").click();
  await expect(page.getByTestId("load-dialog")).toBeVisible();

  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await page.getByTestId("load-paste-input").fill("just: some\nrandom: yaml\n");
  await page.getByRole("button", { name: "Load pasted TOC" }).click();
  await expect(page.getByTestId("load-error")).toContainText("Unrecognized TOC format");

  await page
    .getByTestId("load-paste-input")
    .fill("items:\n- name: Hello\n  items:\n  - href: world.md\n");
  await page.getByRole("button", { name: "Load pasted TOC" }).click();
  await expect(page.getByTestId("load-dialog")).toBeHidden();
  await expect(page.getByTestId("card")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Hello" })).toBeVisible();

  console_.assertClean();
});

test("code view shows adapter-serialized YAML for one card", async ({ page }) => {
  const console_ = watchConsole(page);
  await loadSample(page);

  const tutorials = page
    .locator('[data-card-variant="section"]')
    .filter({ has: page.getByRole("heading", { name: "Tutorials" }) });
  await tutorials.getByRole("button", { name: "Show YAML" }).click();

  const code = tutorials.getByTestId("code-view");
  await expect(code).toBeVisible();
  await expect(code).toContainText("name: Tutorials");
  await expect(code).toContainText("href: tutorials/");

  // toggle back to the tree
  await tutorials.getByRole("button", { name: "Show topic tree" }).click();
  await expect(tutorials.getByText("Build Your First Site")).toBeVisible();

  console_.assertClean();
});

test("the language door opens a panel that is actually on screen", async ({ page }) => {
  // P1 regression. The panel rendered inside a 21px `overflow-hidden`
  // chip: present in the DOM, correct in every text assertion, and
  // invisible. So this asserts the PAINT — elementFromPoint at the
  // panel's centre must land inside the panel — not its innerText.
  // Reading the DOM through a clip asserts the predicate, not the paint.
  const console_ = watchConsole(page);
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem(
      "toc-fable/session",
      JSON.stringify({
        version: 3,
        activeTabId: "t1",
        tabs: [
          {
            id: "t1",
            name: "Hugo",
            topicsLocked: false,
            undo: [],
            redo: [],
            editor: {
              document: {
                id: "d1",
                name: "Hugo",
                formatId: "hugo",
                extras: {
                  files: {},
                  hugo: {
                    contentDir: "content/en",
                    navRoot: "content/en/docs",
                    loadedLanguage: "en",
                    presentLanguages: ["en", "ja"],
                    languages: [
                      { key: "en", label: "English", contentDir: "content/en" },
                      { key: "ja", label: "日本語", contentDir: "content/ja" },
                      { key: "es", label: "Español", contentDir: "content/es" },
                    ],
                  },
                },
                sections: [
                  {
                    id: "s1",
                    title: "Docs",
                    path: "content/en/docs/_index.md",
                    topics: [
                      {
                        id: "t1a",
                        title: "One",
                        path: "content/en/docs/one.md",
                        children: [],
                      },
                    ],
                  },
                ],
              },
              columns: [["s1"]],
              view: { globalDepth: 2, cardDepths: {} },
            },
          },
        ],
      }),
    );
  });
  await page.reload();

  // the disclosure states the DECLARED count, not what is on disk
  await expect(page.getByTestId("language-note")).toContainText("3 languages");

  await page.getByTestId("language-open-another").click();
  const entry = page.getByTestId("language-entry-ja");
  await expect(entry).toBeVisible();

  // PAINT, not presence: hit-test the entry's centre.
  expect(
    await entry.evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return "zero-sized";
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === null ? "nothing there" : el.contains(hit) ? "painted" : "occluded";
    }),
  ).toBe("painted");

  // the loaded language is not a door, and says so without reading as
  // an instruction
  await expect(page.getByTestId("language-entry-en")).toContainText("loaded");
  await expect(page.getByTestId("language-entry-en")).toBeDisabled();
  // declared but absent from this folder: disabled, with the reason
  await expect(page.getByTestId("language-entry-es")).toContainText(
    "not present in this folder",
  );
  console_.assertClean();
});
