/**
 * Flow 14 — every enforced constraint is a communicated constraint
 * (docs/10 amendment 2026-08-19).
 *
 * THE INCIDENT. A whole-godot reorganize moved a row the Sphinx source
 * pins in place. The lock net refused the result, the corpus-scale call
 * was discarded, and the model had never been told the row was pinned.
 *
 * A synthetic Sphinx project reproduces the shape in miniature: prose
 * between two toctree blocks locks the block above it as
 * `outside-region`, so two rows arrive pinned. Same fixture shape as
 * `scripts/receipt-constraints.ts`, so the two instruments can only
 * disagree about the corpus if one of them is wrong.
 *
 * WHAT THIS FILE'S GREEN MEANS: the marker and its explanation reach a
 * real payload, a violation earns a retry in a real browser, a second
 * violation renders the new copy AND that copy is on screen rather than
 * merely in the DOM. What it says nothing about: any real provider —
 * that is the live receipt, and the mock cannot stand in for it.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { watchConsole } from "./helpers";

const GEMINI = "https://generativelanguage.googleapis.com/**";

const PROJECT: Record<string, string> = {
  "conf.py": 'master_doc = "index"\nsource_suffix = ".rst"\n',
  "index.rst": ["Docs", "====", "", ".. toctree::", "", "   guides/index", ""].join("\n"),
  "guides/index.rst": [
    "Guides",
    "======",
    "",
    ".. toctree::",
    "",
    "   early",
    "   usage",
    "",
    "Prose between the blocks terminates the trailing sequence, so the",
    "block above locks as outside-region.",
    "",
    ".. toctree::",
    "",
    "   install",
    "",
  ].join("\n"),
  "guides/early.rst": "Early\n=====\n\nbody\n",
  "guides/usage.rst": "Using It\n========\n\nbody\n",
  "guides/install.rst": "Installing\n==========\n\nbody\n",
};

/**
 * Outline this fixture produces (verified by
 * `scripts/receipt-constraints.ts`, which parses the same project):
 *   s1 Docs / t1 Guides / t2 Early [pinned] / t3 Using It [pinned] / t4 Installing
 */
const VIOLATION = "s1\n  t2\n  t1\n    t3\n    t4";
const COMPLIANT = "s1\n  t1\n    t2\n    t3\n    t4";

let folder: string;

test.beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "toc-parity-"));
  for (const [path, content] of Object.entries(PROJECT)) {
    const abs = join(folder, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
});

function completion(content: string) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }),
  };
}

async function openLockedProject(page: Page) {
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
  });
  await page.goto("/");
  await page.getByTestId("empty-open-dialog").click();
  await page.getByTestId("load-folder-input").setInputFiles(folder);
  await page.getByTestId("card").first().waitFor({ state: "visible" });
  await page.getByTestId("reorganize-button").click();
  await page.getByTestId("ai-open-settings").click();
  await page.getByTestId("ai-api-key").fill("test-key");
  await page.getByTestId("ai-settings-back").click();
}

test("the payload marks the pinned rows and explains the mark", async ({ page }) => {
  const console_ = watchConsole(page);
  let body = "";
  await page.route(GEMINI, async (route) => {
    body = route.request().postData() ?? "";
    await route.fulfill(completion(COMPLIANT));
  });

  await openLockedProject(page);
  await page.getByTestId("ai-run").click();
  await expect(page.getByTestId("ai-result")).toBeVisible();

  // the mark, on the rows that carry it
  expect(body).toContain("Early [pinned]");
  expect(body).toContain("Using It [pinned]");
  // …and not on the one that does not
  expect(body).not.toContain("Installing [pinned]");
  // the explanation, once
  expect(body).toMatch(/PINNED ROWS/);
  // still titles only — the privacy claim is unchanged by any of this
  expect(body).not.toContain(".rst");
  expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);

  console_.assertClean();
});

test("a document that pins nothing carries none of it", async ({ page }) => {
  // The absence fence, in a browser: the mechanism must not leak
  // boilerplate into every DocFX and MkDocs run for a state those
  // documents cannot be in.
  const console_ = watchConsole(page);
  let body = "";
  await page.route(GEMINI, async (route) => {
    body = route.request().postData() ?? "";
    await route.fulfill(completion("t1\ns1\ns2\ns3\ns4\ns5\nt34\nt35"));
  });

  await page.goto("/");
  await page.getByTestId("empty-load-sample-docfx").click();
  await expect(page.getByTestId("card")).toHaveCount(8);
  await page.getByTestId("reorganize-button").click();
  await page.getByTestId("ai-open-settings").click();
  await page.getByTestId("ai-api-key").fill("test-key");
  await page.getByTestId("ai-settings-back").click();
  await page.getByTestId("ai-run").click();
  await expect(page.getByTestId("ai-result")).toBeVisible();

  expect(body).not.toMatch(/pinned/i);
  expect(body).not.toContain("PINNED ROWS");

  console_.assertClean();
});

test("a violation earns a guided retry, and the corrected answer is accepted", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  let calls = 0;
  let retryBody = "";
  await page.route(GEMINI, async (route) => {
    calls++;
    if (calls === 1) {
      await route.fulfill(completion(VIOLATION));
    } else {
      retryBody = route.request().postData() ?? "";
      await route.fulfill(completion(COMPLIANT));
    }
  });

  await openLockedProject(page);
  await page.getByTestId("ai-run").click();
  await expect(page.getByTestId("ai-result")).toBeVisible();

  expect(calls).toBe(2);
  // the retry carries the SPECIFIC violation — this is what makes it a
  // guided retry rather than a second roll of the dice
  expect(retryBody).toContain("pinned in place");
  expect(retryBody).toContain("Early");

  console_.assertClean();
});

test("violating twice discards, and the NEW copy is on screen", async ({ page }) => {
  const console_ = watchConsole(page);
  await page.route(GEMINI, (route) => route.fulfill(completion(VIOLATION)));

  await openLockedProject(page);
  await page.getByTestId("ai-run").click();

  const error = page.getByTestId("ai-error");
  await expect(error).toBeVisible();
  await expect(error).toContainText("pinned in place by the source");
  // the copy is TRUE in the new world: the request marked the rows, so
  // the failure is the model's non-compliance and not the user's
  // instruction
  await expect(error).toContainText(/request marks every pinned row/i);
  // …and the retired advice, which sent the user to edit an instruction
  // that was never the problem, is gone
  await expect(error).not.toContainText(
    /try an instruction that leaves the pinned rows/i,
  );

  // VERIFY THE PAINT, not just the state. A message can be present,
  // correctly sized and `toBeVisible()`-passing while sitting under
  // something. Hit-tested at a CONTENT ANCHOR — a few px inside the
  // top-left — because the centre of a text block can be trailing
  // whitespace that belongs to the container behind it.
  const painted = await error.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return { ok: false, why: "zero-size" };
    const hit = document.elementFromPoint(r.left + 8, r.top + 8);
    return {
      ok: hit !== null && (hit === el || el.contains(hit) || hit.contains(el)),
      why: hit ? hit.tagName : "null",
    };
  });
  expect(painted.ok, `the error copy must be hit-testable (${painted.why})`).toBe(true);

  console_.assertClean();
});
