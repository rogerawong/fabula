/**
 * "Reorganize with AI" — fully offline: the Gemini endpoint is
 * intercepted with page.route, so the REAL client/parse/reconstruct
 * code paths run against canned OpenAI-shaped responses. Compact ids
 * are deterministic against the DocFX sample, so fixtures are
 * hand-written.
 *
 * Sample outline ids (whole doc, full granularity):
 *   t1 Overview · s1 Getting Started (t2–t10) · s2 Guides (t11–t19,
 *   Versioning = t18) · s3 Tutorials (t20–t23) · s4 API Reference ·
 *   s5 Extensibility · t34 FAQ · t35 Release Notes
 */

import { expect, test, type Page } from "@playwright/test";
import { watchConsole } from "./helpers";

const GEMINI = "https://generativelanguage.googleapis.com/**";

function completion(content: string) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      choices: [{ message: { content }, finish_reason: "stop" }],
    }),
  };
}

async function loadSampleAndOpenDialog(page: Page) {
  await page.goto("/");
  await page.getByTestId("empty-load-sample-docfx").click();
  await expect(page.getByTestId("card")).toHaveCount(8);
  await page.getByTestId("reorganize-button").click();
  await expect(page.getByTestId("ai-dialog")).toBeVisible();
}

async function configureKey(page: Page) {
  await page.getByTestId("ai-open-settings").click();
  await page.getByTestId("ai-api-key").fill("test-key");
  await page.getByTestId("ai-settings-back").click();
}

test("happy path: run against the mock, open result as a new tab", async ({ page }) => {
  const console_ = watchConsole(page);
  let requestsBeforeRun = 0;
  let capturedAuth: string | null = null;

  await page.route(GEMINI, async (route) => {
    capturedAuth = route.request().headers()["authorization"] ?? null;
    // move Versioning (t18) into Tutorials (s3), listing s3 in full
    await route.fulfill(
      completion(
        [
          "t1",
          "s1",
          "s2",
          "s3",
          "  t18",
          "  t20",
          "  t21",
          "  t22",
          "  t23",
          "s4",
          "s5",
          "t34",
          "t35",
        ].join("\n"),
      ),
    );
  });
  page.on("request", (req) => {
    if (req.url().includes("generativelanguage")) requestsBeforeRun++;
  });

  await loadSampleAndOpenDialog(page);
  await configureKey(page);

  // nothing is sent before Run
  expect(requestsBeforeRun).toBe(0);

  await page.getByTestId("ai-run").click();
  await expect(page.getByTestId("ai-result")).toBeVisible();
  await expect(page.getByTestId("ai-result")).toContainText("1 moved");

  await page.getByTestId("ai-open-tab").click();
  await expect(page.getByTestId("tab")).toHaveCount(2);
  // Named for the MODEL since 2026-08-19 (docs/10, tab provenance): the
  // differential workflow is two runs of one document side by side, and
  // "Toc (reorganized)" twice is two identical labels for the two things
  // being compared.
  await expect(page.getByTestId("tab").nth(1)).toContainText("Toc (gemini-flash-latest)");

  // new tab is active: Versioning now lives in Tutorials (5 topics)
  const tutorials = page
    .locator('[data-card-variant="section"]')
    .filter({ has: page.getByRole("heading", { name: "Tutorials" }) });
  await expect(tutorials.getByTestId("topic-count")).toHaveText("5");
  await expect(tutorials.getByText("Versioning", { exact: true })).toBeVisible();
  const guides = page
    .locator('[data-card-variant="section"]')
    .filter({ has: page.getByRole("heading", { name: "Guides" }) });
  await expect(guides.getByTestId("topic-count")).toHaveText("8");

  // the ORIGINAL tab is untouched
  await page.getByTestId("tab").first().click();
  await expect(
    page
      .locator('[data-card-variant="section"]')
      .filter({ has: page.getByRole("heading", { name: "Guides" }) })
      .getByTestId("topic-count"),
  ).toHaveText("9");

  expect(capturedAuth).toBe("Bearer test-key");
  console_.assertClean();
});

test("scoped run: request contains only scoped ids, others as id-less context", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  let body = "";

  await page.route(GEMINI, async (route) => {
    body = route.request().postData() ?? "";
    // swap the two scoped sections (Guides=s1, Tutorials=s2 in scope order)
    await route.fulfill(completion("s2\ns1"));
  });

  await loadSampleAndOpenDialog(page);
  await configureKey(page);

  await page.getByTestId("ai-scope-selected").check();
  const dialog = page.getByTestId("ai-dialog");
  await dialog.locator("label", { hasText: "Guides" }).locator("input").check();
  await dialog.locator("label", { hasText: "Tutorials" }).locator("input").check();
  await page.getByTestId("ai-run").click();
  await expect(page.getByTestId("ai-result")).toBeVisible();
  await expect(page.getByTestId("ai-result")).toContainText("2 of 8 sections");

  // ── privacy assertions on the CAPTURED REQUEST BODY ──
  expect(body).toContain("s1 Guides");
  expect(body).toContain("s2 Tutorials");
  expect(body).toContain("context only");
  expect(body).toContain("Getting Started"); // context, by name…
  expect(body).not.toMatch(/s\d+ Getting Started/); // …never with an id
  expect(body).not.toContain(".md"); // no paths
  expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/); // no uuids
  expect(body).not.toContain("test-key"); // key only in the header

  await page.getByTestId("ai-open-tab").click();
  // scoped sections swapped, unscoped untouched
  const list = page.getByTestId("section-list");
  const rows = list.locator("[data-sidebar-row]");
  await expect(rows.nth(2)).toContainText("Tutorials");
  await expect(rows.nth(3)).toContainText("Guides");
  await expect(rows.nth(1)).toContainText("Getting Started");

  console_.assertClean();
});

test("429 shows a specific rate-limit error with retry", async ({ page }) => {
  const console_ = watchConsole(page, {
    ignore: [/429|Failed to load resource/],
  });

  await page.route(GEMINI, (route) =>
    route.fulfill({
      status: 429,
      headers: {
        "Retry-After": "34",
        // Retry-After is not CORS-safelisted — without this the client
        // (correctly) falls back to its generic rate-limit message
        "Access-Control-Expose-Headers": "Retry-After",
      },
      body: "",
    }),
  );

  await loadSampleAndOpenDialog(page);
  await configureKey(page);
  await page.getByTestId("ai-run").click();

  await expect(page.getByTestId("ai-error")).toBeVisible();
  await expect(page.getByTestId("ai-error")).toContainText("Rate limit");
  await expect(page.getByTestId("ai-error")).toContainText("34");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  console_.assertClean();
});

test("malformed response is corrected via the guided retry", async ({ page }) => {
  const console_ = watchConsole(page);
  let calls = 0;
  let retryBody = "";

  await page.route(GEMINI, async (route) => {
    calls++;
    if (calls === 1) {
      // first answer: prose + an invented id → parse errors → retry
      await route.fulfill(
        completion("Here you go!\nt1\ns1\ns2\ns3\ns4\ns5\nt34\nt35\nt99 Extra"),
      );
    } else {
      retryBody = route.request().postData() ?? "";
      await route.fulfill(completion("t1\ns1\ns2\ns3\ns4\ns5\nt34\nt35"));
    }
  });

  await loadSampleAndOpenDialog(page);
  await configureKey(page);
  await page.getByTestId("ai-run").click();

  await expect(page.getByTestId("ai-result")).toBeVisible();
  expect(calls).toBe(2);
  // the retry carried the specific error feedback
  expect(retryBody).toContain("unknown id");
  expect(retryBody).toContain("t99");

  console_.assertClean();
});

test("run is disabled until a key is configured; setup banner links to settings", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await loadSampleAndOpenDialog(page);

  await expect(page.getByTestId("ai-setup-banner")).toBeVisible();
  await expect(page.getByTestId("ai-run")).toBeDisabled();

  await page.getByTestId("ai-setup-banner").click();
  await expect(page.getByTestId("ai-settings")).toBeVisible();
  await page.getByTestId("ai-api-key").fill("k");
  await page.getByTestId("ai-settings-back").click();
  await expect(page.getByTestId("ai-run")).toBeEnabled();

  console_.assertClean();
});

test("training disclosure renders by the key field, per provider", async ({ page }) => {
  const console_ = watchConsole(page);
  await loadSampleAndOpenDialog(page);
  await page.getByTestId("ai-open-settings").click();

  // default provider is the Gemini free tier: the note says training
  // happens — the direction the unit suite pins against the terms
  const note = page.getByTestId("ai-training-note");
  await expect(note).toBeVisible();
  await expect(note).toContainText(/training/i);

  // PAINT, not just state: the note must be hit-testable, not merely in
  // the DOM behind a clip (the occlusion-aware rule)
  const painted = await note.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + 8, r.top + 8);
    return {
      ok: hit !== null && (hit === el || el.contains(hit) || hit.contains(el)),
      why: hit ? hit.tagName : "null",
    };
  });
  expect(painted.ok, `the disclosure must be hit-testable (${painted.why})`).toBe(true);

  // switching presets swaps the claim — a paid-only provider and a
  // free-tier provider are different sentences, and rendering one for
  // the other is the keyLabel lie in a new slot
  await page.getByTestId("ai-provider").selectOption("claude");
  await expect(note).toContainText("Anthropic");
  await expect(note).toContainText("by default");

  console_.assertClean();
});
