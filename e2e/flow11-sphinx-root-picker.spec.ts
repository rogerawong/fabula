/**
 * Flow 11 — the root-candidate picker (docs/19's rider).
 *
 * Ansible declares `root_doc = master_doc = 'index'` and ships no
 * `index.rst`: its Makefile symlinks one at build time and picks WHICH
 * one by the doc set being built. Today that imports to an empty canvas
 * with a correct explanation that reads like a broken app.
 *
 * The e2e chooses the SMALLER tree on purpose, because that is the only
 * choice that exercises the orphan disclosure — picking the biggest one
 * leaves little outside it and the sentence that matters never renders.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";
import { watchConsole } from "./helpers";

/** Two real roots and a nested twin the top-level rule must exclude. */
const PROJECT: Record<string, string> = {
  "conf.py": 'root_doc = master_doc = "index"\nsource_suffix = ".rst"\n',
  "big_index.rst": [
    "Big",
    "===",
    "",
    ".. toctree::",
    "   :caption: Everything",
    "",
    "   guides/one",
    "   guides/two",
    "   guides/three",
    "",
  ].join("\n"),
  "guides/one.rst": "One\n===\n\nbody\n",
  "guides/two.rst": "Two\n===\n\nbody\n",
  "guides/three.rst": "Three\n=====\n\nbody\n",
  "small_index.rst": [
    "Small",
    "=====",
    "",
    ".. toctree::",
    "   :caption: Reference",
    "",
    "   ref/api",
    "",
  ].join("\n"),
  "ref/api.rst": "API\n===\n\nbody\n",
  // The nested twin: hosts a toctree, referenced by nobody, NOT a
  // candidate. `root_doc` resolves from the source root.
  "sub/small_index.rst": "Nested\n======\n\n.. toctree::\n\n   ../ref/api\n",
};

let folder: string;
test.beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "toc-root-"));
  for (const [path, content] of Object.entries(PROJECT)) {
    const abs = join(folder, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
});

test("flow 11: the picker asks, labels by reach, and discloses the rest", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
  });
  await page.goto("/");
  await page.getByTestId("empty-open-dialog").click();
  await page.getByTestId("load-folder-input").setInputFiles(folder);

  // IT ASKS. Silently substituting would be inventing a default the
  // repository did not declare.
  const picker = page.getByTestId("root-picker");
  await expect(picker).toBeVisible();
  await expect(picker).toContainText("index");

  // TOP-LEVEL ONLY: the nested twin is not offered.
  const options = page.getByTestId("root-candidate");
  await expect(options).toHaveCount(2);
  const names = await options.evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-docname")),
  );
  expect(names).toEqual(["big_index", "small_index"]);
  expect(names).not.toContain("sub/small_index");

  // REACH is the label, biggest first, and it is what distinguishes two
  // roots a stranger has never seen.
  await expect(options.first()).toContainText("4 documents");
  await expect(options.nth(1)).toContainText("2 documents");
  // SAME UNITS, pinned: reach and remainder are both counted in
  // documents, so a reader can do the arithmetic — and it must come out.
  // SEVEN `.rst` files here, not six: the nested twin is a document even
  // though it is not a candidate, which is the kind of off-by-one a
  // label without a stated denominator hides. 7 − 4 = 3, 7 − 2 = 5.
  await expect(options.first()).toContainText("leaving 3 outside");
  await expect(options.nth(1)).toContainText("leaving 5 outside");

  // THE SMALLER TREE, so the orphan disclosure is exercised.
  await options.nth(1).click();
  await page.getByTestId("card").first().waitFor({ state: "visible" });

  // It parsed under the CHOSEN root, not the declared one.
  await expect(page.getByRole("heading", { name: "Reference" })).toBeVisible();

  // The substitution is disclosed, and the orphan alarm is pre-empted
  // with the measurement rather than left to be discovered.
  await page.getByTestId("overview-button").click();
  const overview = page.getByTestId("overview-panel");
  await expect(overview).toContainText("small_index");
  await expect(overview).toContainText("index");
  await expect(overview).toContainText("orphans");

  console_.assertClean();
});
