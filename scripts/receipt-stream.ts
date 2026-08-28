/**
 * receipt-stream.ts — the three claims about streaming that only a real
 * endpoint and a real browser can settle (docs/10 amendment
 * 2026-08-19).
 *
 * WHY THIS IS NOT AN e2e SPEC. `e2e/flow13-ai-streaming.spec.ts` covers
 * everything that can be checked with a fulfilled response, and says so
 * at its top. What it CANNOT check is the only claim this feature
 * actually makes: that the tail grows while you watch it. Playwright's
 * `route.fulfill` delivers a whole body, so a spec built on it proves
 * the bytes parse and proves nothing about time. That needs an endpoint
 * emitting chunks over real seconds.
 *
 * NOTHING IS PATCHED. `scripts/mock-provider.ts` is a real local HTTP
 * server; the app makes an ordinary request to it through the CUSTOM
 * provider. The residue of a finished run is a killed process, which is
 * a state you can see — unlike a browser route, which lives in the
 * driver's memory and once cost a real key-bearing run (docs/10's
 * interception addendum).
 *
 *   pnpm dev                 # in another shell — REQUIRED, see below
 *   pnpm receipt-stream
 *
 * NO KEY. The mock accepts any non-empty one.
 *
 * ## Verdicts, and why there are three
 *
 * MEASURED-PRESENT / MEASURED-ABSENT / INDETERMINATE. A probe exception
 * — a locator error, a strict-mode ambiguity, a null from a
 * non-participant — is INDETERMINATE and fails the RUN as a harness
 * defect. It must never collapse into ABSENT, because absent is a
 * legitimate ANSWER here (no capture row after a cancel is the whole
 * point of receipt B) and conflating them makes a broken instrument
 * indistinguishable from a true negative.
 *
 * ## The PRECONDITION is a fourth thing, and it is not a verdict
 *
 * With nothing serving `APP_URL`, `page.goto` threw inside all three
 * browser probes and the per-probe catch reported three INDETERMINATE
 * verdicts under the banner "HARNESS DEFECT … Fix the probe." The
 * probes were fine; the dev server was not running. So the run now
 * refuses BEFORE the browser launches, naming the URL and the remedy,
 * and exits 3 — a rung of its own, because "the run could not start"
 * sends a reader somewhere different from "a probe could not measure".
 *
 * ## The instrument is timed, not only its verdict
 *
 * A tail-growth check that finishes in 40ms has not watched anything
 * grow. EVERY probe whose claimed work implies elapsed time is guarded
 * by a floor DERIVED from what the mock announced on that probe's own
 * port — never from a constant written here, and never from another
 * endpoint's stream. Below the floor the probe's verdicts are VOIDED to
 * INDETERMINATE, whatever their polarity, because an unfounded ABSENT
 * is as worthless as an unfounded PRESENT.
 *
 * What a floor does NOT enforce, since an instrument that accepts is
 * not an instrument that checks: it is a LOWER bound on the run, so it
 * catches a probe that skipped the work and cannot catch one that did
 * the work badly. Setup is deliberately outside the timed window so the
 * bound is tight — the D modes clear their floors by 18–20ms, which is
 * what a floor measuring the right quantity looks like.
 *
 * The exclusion is `no-stream`, which refuses SSE and answers whole:
 * there is no stream to have taken time, so no floor applies. It is
 * asserted as an exclusion in `src/ai/__tests__/streamReceipt.test.ts`,
 * because narrowing a classifier obligates the other side's receipt.
 *
 * The decisions above are pure and live in `scripts/lib/streamReceipt.ts`
 * so they can be asserted without a browser; this file is the I/O.
 */

import { chromium, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { chatCompletion } from "@/ai/client";
import { AiError } from "@/ai/contract";
import {
  announcementLog,
  applyFloor,
  EXIT,
  floorFor,
  preflight,
  timed,
  type Claim,
  type Finding,
  type Millis,
  type Verdict,
} from "./lib/streamReceipt";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173/";
const MOCK_PORT = Number(process.env.MOCK_PORT ?? 8788);
const MOCK_BASE = `http://localhost:${MOCK_PORT}/v1`;

/** Slow enough that a sampler can see the tail grow, and slow enough
 *  that `waiting for the first token` is a state and not an instant. */
const CHUNK_DELAY_MS = 200;
const TTFT_MS = 800;

/** Receipt B's observation window, from ONE producer: the same constant
 *  is handed to `waitForTimeout` and to the mid-stream floor, so the
 *  wait and the assertion about the wait cannot disagree. */
const OBSERVE_MS = 2_000;

/** What each mock announced, keyed by ITS OWN port. Receipt D runs a
 *  fresh server per mode and `stream-abrupt` announces half as many
 *  chunks as the rest, so a single shared value is one name for N
 *  referents. */
const announced = announcementLog();

/** The bundled DocFX sample's top level — an identity reorganization. */
const IDENTITY = "t1\ns1\ns2\ns3\ns4\ns5\nt34\nt35";

const results: (Finding & { ms: number })[] = [];

/** Only a MEASURED duration may be reported: `Millis` is produced by
 *  `timed` alone, so a literal cannot reach this function. */
function report(finding: Finding, ms: Millis): void {
  results.push({ ...finding, ms });
  const mark =
    finding.verdict === "MEASURED-PRESENT"
      ? "✓"
      : finding.verdict === "MEASURED-ABSENT"
        ? "·"
        : "!";
  console.log(
    `${mark} ${finding.name} — ${finding.verdict} (${ms}ms)\n    ${finding.note}`,
  );
}

function found(name: string, verdict: Verdict, note: string): Finding {
  return { name, verdict, note };
}

// ── the mock endpoint, as a real process ────────────────────

function startMock(mode: string, delayMs: number, port = MOCK_PORT): ChildProcess {
  const child = spawn(
    "pnpm",
    [
      "exec",
      "vite-node",
      "scripts/mock-provider.ts",
      "--",
      "--port",
      String(port),
      "--mode",
      mode,
      "--delay",
      String(delayMs),
      "--ttft",
      String(TTFT_MS),
      "--content",
      IDENTITY,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout?.on("data", (b: Buffer) => {
    const text = String(b);
    announced.note(port, text);
    process.stdout.write(`  [mock] ${text}`);
  });
  child.stderr?.on("data", (b: Buffer) => process.stderr.write(`  [mock] ${b}`));
  return child;
}

async function waitForMock(port = MOCK_PORT): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${port}/v1/models`);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`mock provider never answered on port ${port}`);
}

/** Is the app being served? Absence assertions FAST-FAIL: a dead port
 *  answers immediately and a wrong host must not hang the refusal. */
async function reachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return response.ok;
  } catch {
    return false;
  }
}

// ── driving the app ─────────────────────────────────────────

async function loadSampleAndConfigure(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.getByTestId("empty-load-sample-docfx").click();
  await page.getByTestId("card").first().waitFor({ timeout: 15_000 });
  await page.getByTestId("reorganize-button").click();
  await page.getByTestId("ai-open-settings").click();
  await page.getByTestId("ai-provider").selectOption("custom");
  // The base URL field only exists for an editable-URL preset, so this
  // also confirms the custom provider is the one selected.
  await page.getByTestId("ai-base-url").fill(MOCK_BASE);
  await page.getByTestId("ai-model").fill("mock-model");
  await page.getByTestId("ai-api-key").fill("not-a-real-key");
  await page.getByTestId("ai-settings-back").click();
}

/**
 * Is this element actually painted?
 *
 * Reports WHICH ORACLE answered, so a green result cannot quietly mean
 * the weaker check ran. Hit-test where the CONTENT is (top-left plus a
 * few px), not at the centre — a `<pre>` of short lines is mostly empty
 * trailing space, and a centre probe lands on the container behind it.
 */
async function painted(
  page: Page,
  testId: string,
): Promise<{ ok: boolean; oracle: string; note: string }> {
  const locator = page.getByTestId(testId);
  let count: number;
  try {
    count = await locator.count();
  } catch (error) {
    throw new Error(`probe failed counting ${testId}: ${String(error)}`);
  }
  if (count === 0) return { ok: false, oracle: "count", note: "absent" };

  return await locator.first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) {
      return { ok: false, oracle: "rendered-ness", note: "zero-size box" };
    }
    const style = getComputedStyle(el);
    if (
      style.visibility === "hidden" ||
      style.display === "none" ||
      style.opacity === "0"
    ) {
      return { ok: false, oracle: "rendered-ness", note: `style ${style.visibility}` };
    }
    if (style.pointerEvents === "none") {
      return { ok: true, oracle: "rendered-ness", note: "not a hit-test participant" };
    }
    const hit = document.elementFromPoint(r.left + 6, r.top + 6);
    const inside = hit !== null && (hit === el || el.contains(hit) || hit.contains(el));
    return {
      ok: inside,
      oracle: "hit-test",
      note: inside ? `landed on <${hit!.tagName.toLowerCase()}>` : "occluded",
    };
  });
}

// ── Receipt A — the tail grows while you watch it ───────────

async function receiptTailGrows(page: Page): Promise<Finding[]> {
  const states: string[] = [];
  const lengths: number[] = [];

  await page.getByTestId("ai-run").click();

  // Sample the pane repeatedly during the run. The mock emits its
  // chunks at CHUNK_DELAY_MS, so a correct implementation gives several
  // DISTINCT lengths; one that renders only on completion gives one.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const sample = await page.evaluate(() => {
      const tail = document.querySelector('[data-testid="ai-log-tail"]');
      const state = document.querySelector('[data-testid="ai-log-state"]');
      const result = document.querySelector('[data-testid="ai-result"]');
      return {
        len: tail?.textContent?.length ?? 0,
        state: state?.textContent?.trim() ?? "",
        done: Boolean(result),
      };
    });
    // Captured at the DECISION POINT and logged from the measurement's
    // own variables — a parallel narration recomputed later drifts.
    if (sample.state && states.at(-1) !== sample.state) states.push(sample.state);
    if (sample.len > 0 && lengths.at(-1) !== sample.len) lengths.push(sample.len);
    if (sample.done) break;
    // Faster than the mock's chunk gap AND faster than its ttft, or the
    // sampler measures its own interval rather than the app's states.
    await page.waitForTimeout(40);
  }

  const grew =
    lengths.length >= 3 && lengths.every((n, i) => i === 0 || n > lengths[i - 1]!);
  const sawWaiting = states.includes("waiting for the first token");
  const sawReceiving = states.includes("receiving");

  return [
    found(
      "A · tail grows across frames",
      grew ? "MEASURED-PRESENT" : "MEASURED-ABSENT",
      `${lengths.length} distinct tail lengths ${JSON.stringify(lengths.slice(0, 6))}…` +
        ` (monotonic: ${grew}); states seen: ${JSON.stringify(states)}`,
    ),
    found(
      "A2 · state line transitions through waiting → receiving",
      sawWaiting && sawReceiving ? "MEASURED-PRESENT" : "MEASURED-ABSENT",
      `waiting=${sawWaiting} receiving=${sawReceiving}`,
    ),
  ];
}

// ── Receipt B — cancel stops the stream and leaves no capture ──

async function receiptCancel(page: Page): Promise<Finding[]> {
  let bytesAfterCancel = 0;
  let cancelled = false;
  page.on("response", (res) => {
    if (cancelled && res.url().includes(String(MOCK_PORT))) bytesAfterCancel++;
  });

  await page.getByTestId("ai-run").click();
  // wait for text to actually be arriving, so the cancel is MID-stream
  await page.getByTestId("ai-log-tail").waitFor({ timeout: 10_000 });
  const before = await page.getByTestId("ai-log-tail").textContent();

  await page.getByTestId("ai-cancel").click();
  cancelled = true;

  // pre-run state restored
  await page.getByTestId("ai-run").waitFor({ timeout: 5_000 });
  // Absence assertions FAST-FAIL: nothing is the expected answer, and a
  // 30s default would turn a correct result into a stall.
  const errorShown = await page.getByTestId("ai-error").count();
  const captureShown = await page.getByTestId("ai-capture").count();
  const tabs = await page.getByTestId("tab").count();

  // give the stream time to keep arriving if the abort did not land
  await page.waitForTimeout(OBSERVE_MS);
  const after = await page.evaluate(
    () => document.querySelector('[data-testid="ai-log-tail"]')?.textContent ?? null,
  );

  const ok =
    errorShown === 0 &&
    captureShown === 0 &&
    tabs === 1 &&
    after === null &&
    bytesAfterCancel === 0;
  return [
    found(
      "B · cancel: request aborted, dialog restored, no capture row",
      ok ? "MEASURED-PRESENT" : "MEASURED-ABSENT",
      `tail at cancel ${JSON.stringify(before?.slice(0, 20))}; ` +
        `error rows ${errorShown}, capture rows ${captureShown}, tabs ${tabs}, ` +
        `log after ${OBSERVE_MS}ms ${after === null ? "cleared" : "STILL GROWING"}, ` +
        `responses after cancel ${bytesAfterCancel}`,
    ),
  ];
}

// ── Receipt C — the tab is named for the model, and keeps the fact ──

async function receiptProvenance(page: Page): Promise<Finding[]> {
  await page.getByTestId("ai-run").click();
  await page.getByTestId("ai-result").waitFor({ timeout: 20_000 });
  await page.getByTestId("ai-open-tab").click();

  const newTab = page.getByTestId("tab").nth(1);
  await newTab.waitFor({ timeout: 5_000 });
  const namedFor = (await newTab.textContent()) ?? "";

  await newTab.dblclick();
  await page.getByTestId("inline-edit").fill("Renamed by hand");
  await page.getByTestId("inline-edit").press("Enter");

  const stored = await page.evaluate(async () => {
    const read = () => {
      const raw = localStorage.getItem("toc-fable/session");
      const payload = JSON.parse(raw ?? "{}") as {
        tabs?: { name: string; provenance?: Record<string, string> }[];
      };
      return payload.tabs?.[1] ?? null;
    };
    for (let i = 0; i < 40; i++) {
      const tab = read();
      if (tab?.name === "Renamed by hand") return tab;
      await new Promise((r) => setTimeout(r, 100));
    }
    return read();
  });

  const paint = await painted(page, "ai-run-log");
  const ok =
    namedFor.includes("mock-model") &&
    stored?.name === "Renamed by hand" &&
    stored?.provenance?.model === "mock-model";

  return [
    found(
      "C · tab named for the model; provenance survives a rename",
      ok ? "MEASURED-PRESENT" : "MEASURED-ABSENT",
      `tab opened as ${JSON.stringify(namedFor)}, renamed to ` +
        `${JSON.stringify(stored?.name)}, stored provenance ` +
        `${JSON.stringify(stored?.provenance ?? null)}; log pane after success: ` +
        `${paint.ok ? "still shown" : `gone (${paint.note})`} via ${paint.oracle}`,
    ),
    found(
      "C2 · the log VANISHED on success (ruled)",
      paint.ok ? "MEASURED-ABSENT" : "MEASURED-PRESENT",
      `pane oracle=${paint.oracle} note=${paint.note}`,
    ),
  ];
}

// ── the guarded runner ──────────────────────────────────────

/**
 * Time a probe, void its verdicts if it cannot have done the work, and
 * record what happened — including on the failure path, whose duration
 * is MEASURED rather than a literal `0`.
 */
async function runProbe(
  spec: { probe: string; timingName: string; claim: Claim; port: number },
  fn: () => Promise<Finding[]>,
): Promise<void> {
  const outcome = await timed(fn);
  if (!outcome.ok) {
    // A probe exception is INDETERMINATE, never ABSENT. Absent is a
    // real answer in this file; a broken instrument is not.
    report(
      found(`${spec.probe} · probe`, "INDETERMINATE", String(outcome.error)),
      outcome.ms,
    );
    return;
  }
  const floor = floorFor(spec.claim, announced.latest(spec.port));
  const guarded = applyFloor({
    probe: spec.probe,
    timingName: spec.timingName,
    findings: outcome.value,
    elapsedMs: outcome.ms,
    floor,
  });
  for (const finding of guarded.findings) report(finding, outcome.ms);
  if (guarded.timing) report(guarded.timing, outcome.ms);
}

// ── Receipt D — each mock stream mode produces the shape it names ──

/**
 * An instrument that is never driven is a request, not a fixture.
 *
 * The four failure modes exist so the unit accumulator has realistic
 * inputs — but the unit tests feed HAND-WRITTEN frames, so nothing
 * anywhere checks that the mock emits what its mode name claims. This
 * drives the real client against the real server, in node, with no
 * browser and no key: the shortest path that makes the mock's claims
 * falsifiable.
 *
 * It is DIFFERENTIAL against `stream.test.ts` rather than a repeat of
 * it. That file asks "given these bytes, what does the accumulator
 * conclude"; this asks "does the server produce those bytes at all".
 */
async function receiptModes(): Promise<void> {
  const cases: {
    mode: string;
    claim: Claim;
    expect: { kind: string; partial?: string; content?: string };
  }[] = [
    {
      mode: "stream-clean",
      claim: { kind: "whole-stream" },
      expect: { kind: "ok", content: IDENTITY },
    },
    {
      mode: "stream-mid-error",
      claim: { kind: "whole-stream" },
      expect: { kind: "bad-response", partial: "some" },
    },
    {
      mode: "stream-abrupt",
      claim: { kind: "whole-stream" },
      expect: { kind: "network", partial: "some" },
    },
    {
      mode: "stream-length",
      claim: { kind: "whole-stream" },
      expect: { kind: "truncated", partial: "some" },
    },
    // THE EXCLUSION: this mode 400s the streamed request and answers
    // whole, so no floor applies. Asserted as an exclusion in the unit
    // test — its measured duration is BELOW the ttft the other four
    // are held to, which is exactly why the exclusion has to be a case
    // rather than an omission.
    {
      mode: "no-stream",
      claim: { kind: "no-stream" },
      expect: { kind: "ok", content: IDENTITY },
    },
  ];

  let port = MOCK_PORT + 1;
  for (const { mode, claim, expect: want } of cases) {
    port += 1;
    const thisPort = port;
    const child = startMock(mode, 20, thisPort);
    try {
      await waitForMock(thisPort);
      await runProbe(
        {
          probe: `D · ${mode}`,
          timingName: `D2 · mock mode ${mode} actually took streaming time`,
          claim,
          port: thisPort,
        },
        async () => {
          let got: { kind: string; partial?: string; content?: string };
          try {
            const content = await chatCompletion({
              baseUrl: `http://localhost:${thisPort}/v1`,
              apiKey: "not-a-real-key",
              model: "mock-model",
              messages: [{ role: "user", content: "hi" }],
            });
            got = { kind: "ok", content };
          } catch (error) {
            got =
              error instanceof AiError
                ? { kind: error.kind, partial: error.partial }
                : { kind: `unexpected:${String(error)}` };
          }

          const kindOk = got.kind === want.kind;
          const contentOk = want.content === undefined || got.content === want.content;
          // "some" means: bytes survived. The exact prefix depends on
          // where the server cut, which is the server's business, not a
          // contract.
          const partialOk = want.partial === undefined || Boolean(got.partial);
          return [
            found(
              `D · mock mode ${mode}`,
              kindOk && contentOk && partialOk ? "MEASURED-PRESENT" : "MEASURED-ABSENT",
              `expected ${want.kind}, got ${got.kind}` +
                (got.partial ? `; partial ${JSON.stringify(got.partial)}` : "") +
                (got.content ? `; content ${JSON.stringify(got.content)}` : ""),
            ),
          ];
        },
      );
    } finally {
      child.kill("SIGTERM");
    }
  }
}

// ── run ─────────────────────────────────────────────────────

let mock: ChildProcess | null = null;
let exitCode: number = EXIT.ok;

console.log(`receipt-stream: app ${APP_URL}, mock ${MOCK_BASE}\n`);

// THE PRECONDITION, BEFORE THE BROWSER. An unmet precondition is not a
// broken probe, and reporting it as three INDETERMINATE verdicts sends
// the next reader into an instrument that is fine.
const precondition = await preflight(APP_URL, reachable);
if (!precondition.ok) {
  console.error(
    `PRECONDITION UNMET: ${precondition.cause}\n` +
      `  Remedy: ${precondition.remedy}\n` +
      `  No probe ran, so this run measured nothing — it is not a harness defect ` +
      `and not a failed claim.`,
  );
  process.exit(EXIT.preconditionUnmet);
}
console.log(`precondition: ${precondition.note}\n`);

try {
  mock = startMock("stream-clean", CHUNK_DELAY_MS);
  await waitForMock();

  const browser = await chromium.launch();
  try {
    const specs: {
      probe: string;
      timingName: string;
      claim: Claim;
      run: (page: Page) => Promise<Finding[]>;
    }[] = [
      {
        probe: "tail",
        timingName: "A3 · the run actually took streaming time",
        claim: { kind: "whole-stream" },
        run: receiptTailGrows,
      },
      {
        probe: "cancel",
        timingName: "B2 · the cancel landed mid-stream and was watched after",
        claim: { kind: "mid-stream", observeMs: OBSERVE_MS },
        run: receiptCancel,
      },
      {
        probe: "provenance",
        timingName: "C3 · the provenance run actually took streaming time",
        claim: { kind: "whole-stream" },
        run: receiptProvenance,
      },
    ];
    for (const spec of specs) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
      try {
        // SETUP IS NOT THE MEASUREMENT. Loading the sample and filling
        // in the provider takes about half a second, and counting it as
        // streaming time is slack the floor cannot see through: a run
        // that streamed nothing at all would still clear an 1800ms
        // floor once page load grew past it. Configure first, then time
        // only the claim.
        await loadSampleAndConfigure(page);
        await runProbe({ ...spec, port: MOCK_PORT }, () => spec.run(page));
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  // Timed like every other failure path: a duration written as a
  // literal is a log stating something it never measured, which is the
  // defect that made "three probes INDETERMINATE in ~0ms" read as
  // evidence about speed when the 0 was a constant.
  const modes = await timed(receiptModes);
  if (!modes.ok) {
    report(found("D · mock modes", "INDETERMINATE", String(modes.error)), modes.ms);
  }
} finally {
  // The residue of a finished run is a killed process.
  mock?.kill("SIGTERM");
}

console.log("\n── summary ─────────────────────────────");
for (const r of results) console.log(`${r.verdict.padEnd(17)} ${r.name}`);
console.log(`\n${results.length} findings`);

if (results.some((r) => r.verdict === "INDETERMINATE")) {
  console.error("\nHARNESS DEFECT: at least one probe could not measure. Fix the probe.");
  exitCode = EXIT.harnessDefect;
} else if (results.some((r) => r.verdict === "MEASURED-ABSENT")) {
  console.error(
    "\nA claim did not hold. Read the notes above before opening product code.",
  );
  exitCode = EXIT.claimFailed;
}
process.exit(exitCode);
