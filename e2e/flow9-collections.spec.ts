/**
 * Flow 9 — Collection adapters, fully offline: api.github.com and
 * raw.githubusercontent.com are page.route-mocked, so the REAL
 * ingest → detect → parse → plan → verify code runs against a canned
 * Just the Docs repo. Import via /tree/ URL → cards render the
 * resolved nav → rename a section → Review changes shows verified,
 * minimal frontmatter edits (rename cascades to the child's parent:
 * key) → the downloaded .patch is git-shaped.
 *
 * Folder pickers aren't Playwright-drivable — folder ingest and FS
 * write-back are unit-tested (loadCollection, fsAccess) and verified
 * manually.
 */

import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { watchConsole } from "./helpers";

const REPO: Record<string, string> = {
  "docs/index.md": "---\ntitle: Home\nnav_order: 1\n---\n\n# Home\n",
  "docs/configuration.md":
    "---\ntitle: Configuration\nnav_order: 2\n---\n\n# Configuration\n",
  "docs/options.md": "---\ntitle: Options\nparent: Configuration\n---\n\n# Options\n",
  "docs/guides.md": "---\ntitle: Guides\nnav_order: 3\n---\n\n# Guides\n",
  "docs/writing.md": "---\ntitle: Writing\nparent: Guides\n---\n\n# Writing\n",
};

async function mockGitHub(page: Page) {
  await page.route("https://api.github.com/**", async (route) => {
    const url = route.request().url();
    if (url === "https://api.github.com/repos/acme/handbook") {
      return route.fulfill({ json: { default_branch: "main" } });
    }
    if (url.startsWith("https://api.github.com/repos/acme/handbook/git/trees/main")) {
      return route.fulfill({
        json: {
          truncated: false,
          tree: [
            ...Object.keys(REPO).map((path) => ({
              path,
              type: "blob",
              size: REPO[path]!.length,
            })),
            { path: "src/app.ts", type: "blob", size: 10 }, // non-doc noise
            { path: "docs", type: "tree" },
          ],
        },
      });
    }
    return route.fulfill({ status: 404, json: { message: "not found" } });
  });
  await page.route("https://raw.githubusercontent.com/**", async (route) => {
    const path = route
      .request()
      .url()
      .replace("https://raw.githubusercontent.com/acme/handbook/main/", "");
    const content = REPO[decodeURIComponent(path)];
    if (content === undefined) return route.fulfill({ status: 404, body: "nf" });
    return route.fulfill({ body: content, contentType: "text/plain" });
  });
}

test("import a JTD repo by /tree/ URL, edit, review verified changes, download the patch", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await mockGitHub(page);
  await page.goto("/");

  // ── import ──
  await page.getByTestId("empty-open-dialog").click();
  await page.getByRole("button", { name: "URL", exact: true }).click();
  await page
    .getByTestId("load-url-input")
    .fill("https://github.com/acme/handbook/tree/main/docs");
  await page.getByRole("button", { name: "Fetch and load" }).click();

  // three cards: Home (orphan) · Configuration · Guides, with children
  await expect(page.getByTestId("card")).toHaveCount(3);
  await expect(
    page.getByTestId("card").filter({ hasText: "Configuration" }),
  ).toContainText("Options");
  await expect(page.getByTestId("section-list")).toContainText("Guides");

  // ── untouched import reviews as empty ──
  await page.getByTestId("review-changes-button").click();
  await expect(page.getByTestId("changes-empty")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("changes-dialog")).not.toBeVisible();

  // ── rename Guides → Handbook (cascades to writing.md's parent:) ──
  await page.getByRole("heading", { name: "Guides", exact: true }).dblclick();
  await page.getByTestId("inline-edit").fill("Handbook");
  await page.getByTestId("inline-edit").press("Enter");

  await page.getByTestId("review-changes-button").click();
  await expect(page.getByTestId("changes-dialog")).toBeVisible();
  await expect(page.getByTestId("changes-verified")).toBeVisible();
  const list = page.getByTestId("changes-list");
  await expect(list).toContainText("guides.md");
  await expect(list).toContainText("writing.md");

  // expand a diff: the title line is rewritten, the body untouched
  await list.getByText("guides.md", { exact: true }).click();
  await expect(page.getByTestId("changes-dialog")).toContainText("+title: Handbook");

  // ── the .patch download is git-shaped and minimal ──
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("download-patch-button").click();
  const download = await downloadPromise;
  const patch = readFileSync((await download.path())!, "utf8");
  expect(download.suggestedFilename()).toMatch(/\.patch$/);
  expect(patch).toContain("diff --git a/guides.md b/guides.md");
  expect(patch).toContain("+title: Handbook");
  expect(patch).toContain("+parent: Handbook");
  expect(patch).not.toContain("options.md"); // untouched files stay untouched

  console_.assertClean();
});
