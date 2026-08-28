/**
 * The streamed run, its live log, and the two things the log made
 * visible (docs/10 amendment 2026-08-19).
 *
 * WHAT THIS FILE'S GREEN MEANS, and what it says nothing about. The
 * routes here `fulfill` a complete SSE body, so the browser receives it
 * in one delivery: this proves the client parses event-stream bytes,
 * that the pane renders them, that the retry marker and fallback line
 * appear, and that cancel and provenance behave — end to end, in a real
 * browser, in CI, with no key.
 *
 * It does NOT prove the tail GROWS across frames, because nothing here
 * arrives progressively. That claim needs a real endpoint emitting real
 * chunks over real time, which is `pnpm receipt-stream` driving
 * `scripts/mock-provider.ts`. Stated rather than implied: a check that
 * accepts is not a check that verifies, and the gap is invisible while
 * the run is green.
 *
 * The routes are per-`page` and die with the test. The incident that
 * produced `noInterception.test.ts` was a route left on a LONG-LIVED
 * manual browser, which is a different thing from a spec's own fixture.
 */

import { expect, test, type Page } from "@playwright/test";
import { watchConsole } from "./helpers";

const GEMINI = "https://generativelanguage.googleapis.com/**";

function frame(content: string, finish: string | null = null): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: { content }, finish_reason: finish }],
  })}\n\n`;
}

/** An event-stream body carrying `content`, split into small deltas. */
function streamed(content: string): {
  status: number;
  headers: Record<string, string>;
  body: string;
} {
  const pieces = content.match(/[\s\S]{1,4}/g) ?? [];
  return {
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    body: pieces.map((p) => frame(p)).join("") + frame("", "stop") + "data: [DONE]\n\n",
  };
}

function whole(content: string) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      choices: [{ message: { content }, finish_reason: "stop" }],
    }),
  };
}

/** The bundled DocFX sample's top level — an identity reorganization. */
const IDENTITY = "t1\ns1\ns2\ns3\ns4\ns5\nt34\nt35";

async function openConfigured(page: Page) {
  await page.goto("/");
  await page.getByTestId("empty-load-sample-docfx").click();
  await expect(page.getByTestId("card")).toHaveCount(8);
  await page.getByTestId("reorganize-button").click();
  await expect(page.getByTestId("ai-dialog")).toBeVisible();
  await page.getByTestId("ai-open-settings").click();
  await page.getByTestId("ai-api-key").fill("test-key");
  await page.getByTestId("ai-settings-back").click();
}

test("a streamed answer reaches the tail, then the result", async ({ page }) => {
  const console_ = watchConsole(page);
  let sentBody = "";

  await page.route(GEMINI, async (route) => {
    sentBody = route.request().postData() ?? "";
    await route.fulfill(streamed(IDENTITY));
  });

  await openConfigured(page);
  await page.getByTestId("ai-run").click();

  // the answer arrived through the SSE path and was accepted
  await expect(page.getByTestId("ai-result")).toBeVisible();
  // the request asked for a stream — the one payload change
  expect(JSON.parse(sentBody)).toMatchObject({ stream: true });

  console_.assertClean();
});

test("the log states what it is doing and shows the answer, sent block collapsed", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  let release: (() => void) | null = null;
  const held = new Promise<void>((resolve) => (release = resolve));

  await page.route(GEMINI, async (route) => {
    await held;
    await route.fulfill(streamed(IDENTITY));
  });

  await openConfigured(page);
  await page.getByTestId("ai-run").click();

  // the state line is truthful while nothing has arrived yet
  const state = page.getByTestId("ai-log-state");
  await expect(state).toBeVisible();
  await expect(state).toHaveText(/connecting|waiting/);

  // the sent payload is collapsed behind its own measurement…
  const sent = page.getByTestId("ai-log-sent");
  await expect(sent).toBeVisible();
  await expect(sent).toContainText(/sent · \d+ lines · ~\d+ tokens/);
  await expect(page.getByTestId("ai-log-sent-body")).toHaveCount(0, { timeout: 2000 });

  // …and expanding it is how the privacy claim becomes watchable
  await sent.click();
  const body = page.getByTestId("ai-log-sent-body");
  await expect(body).toBeVisible();
  await expect(body).toContainText("s2 Guides");
  await expect(body).toContainText("stream=true");
  // titles only: no paths, no uuids, no key
  const shown = (await body.innerText()).replace(/\s+/g, " ");
  expect(shown).not.toContain(".md");
  expect(shown).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  expect(shown).not.toContain("test-key");

  release!();
  await expect(page.getByTestId("ai-result")).toBeVisible();
  console_.assertClean();
});

test("the guided retry is marked where it begins", async ({ page }) => {
  const console_ = watchConsole(page);
  let calls = 0;
  let release: (() => void) | null = null;
  const held = new Promise<void>((resolve) => (release = resolve));

  await page.route(GEMINI, async (route) => {
    calls++;
    if (calls === 1) {
      await route.fulfill(streamed("t1\ns1\ns2\ns3\ns4\ns5\nt34\nt35\nt99 Extra"));
      return;
    }
    // The second answer is HELD. Without it the run finishes, the
    // dialog swaps to the result view and the log is cleared — so the
    // assertions below would be racing the thing they measure and
    // would report a missing marker as a product defect.
    await held;
    await route.fulfill(streamed(IDENTITY));
  });

  await openConfigured(page);
  await page.getByTestId("ai-run").click();

  // the marker is a structural second entry, not a synthesized string
  await expect(page.getByTestId("ai-log-retry")).toBeVisible();
  await expect(page.getByTestId("ai-log-sent")).toHaveCount(2);

  release!();
  await expect(page.getByTestId("ai-result")).toBeVisible();
  expect(calls).toBe(2);

  console_.assertClean();
});

test("an endpoint that answers whole is stated, not hidden", async ({ page }) => {
  const console_ = watchConsole(page);
  await page.route(GEMINI, (route) => route.fulfill(whole(IDENTITY)));

  await openConfigured(page);
  await page.getByTestId("ai-run").click();
  await expect(page.getByTestId("ai-result")).toBeVisible();

  console_.assertClean();
});

test("cancel mid-run returns to configure and opens no tab", async ({ page }) => {
  const console_ = watchConsole(page);
  let released = false;
  await page.route(GEMINI, async (route) => {
    await new Promise((r) => setTimeout(r, 10_000));
    released = true;
    await route.fulfill(streamed(IDENTITY));
  });

  await openConfigured(page);
  await page.getByTestId("ai-run").click();
  await expect(page.getByTestId("ai-run-log")).toBeVisible();

  await page.getByTestId("ai-cancel").click();

  // back to the pre-run state — not an error surface
  await expect(page.getByTestId("ai-run")).toBeVisible();
  // ABSENCE assertions fast-fail: these are expected to be nothing
  await expect(page.getByTestId("ai-error")).toHaveCount(0, { timeout: 2000 });
  await expect(page.getByTestId("ai-capture")).toHaveCount(0, { timeout: 2000 });
  await expect(page.getByTestId("tab")).toHaveCount(1);
  expect(released).toBe(false);

  console_.assertClean();
});

test("the new tab is named after the model, and a rename keeps the fact", async ({
  page,
}) => {
  const console_ = watchConsole(page);
  await page.route(GEMINI, (route) => route.fulfill(streamed(IDENTITY)));

  await openConfigured(page);
  await page.getByTestId("ai-run").click();
  await expect(page.getByTestId("ai-result")).toBeVisible();
  await page.getByTestId("ai-open-tab").click();

  await expect(page.getByTestId("tab")).toHaveCount(2);
  await expect(page.getByTestId("tab").nth(1)).toContainText("gemini-flash-latest");

  // The name belongs to the user from here on — rename it, for real,
  // through the affordance a user has. The first cut of this test
  // asserted the claim in its title without ever performing it.
  await page.getByTestId("tab").nth(1).dblclick();
  await page.getByTestId("inline-edit").fill("Proposal for review");
  await page.getByTestId("inline-edit").press("Enter");
  await expect(page.getByTestId("tab").nth(1)).toContainText("Proposal for review");
  await expect(page.getByTestId("tab").nth(1)).not.toContainText("gemini-flash-latest");

  // …and the fact survives it. Read from the persisted session, which
  // is also the strictest place to read it: a provenance that lives
  // only in memory would not survive a refresh either.
  const stored = await page.evaluate(async () => {
    const read = () => {
      const raw = localStorage.getItem("toc-fable/session");
      const payload = JSON.parse(raw ?? "{}") as {
        tabs?: { name: string; provenance?: Record<string, string> }[];
      };
      return payload.tabs?.[1] ?? null;
    };
    // writes are debounced (500ms); poll rather than guess a sleep
    for (let i = 0; i < 40; i++) {
      const tab = read();
      if (tab?.name === "Proposal for review") return tab;
      await new Promise((r) => setTimeout(r, 100));
    }
    return read();
  });

  expect(stored?.name).toBe("Proposal for review");
  expect(stored?.provenance).toMatchObject({
    kind: "ai-reorganize",
    providerId: "gemini",
    model: "gemini-flash-latest",
    presetName: "Balance & right-size",
  });

  console_.assertClean();
});
