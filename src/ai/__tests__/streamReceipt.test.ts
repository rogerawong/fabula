/**
 * streamReceipt.test.ts — the streaming receipt's own judgement,
 * asserted without a browser or a server.
 *
 * WHY A HARNESS GETS A TEST FILE. `scripts/receipt-stream.ts` reported
 * three probes INDETERMINATE under the banner "HARNESS DEFECT … Fix the
 * probe" when the probes were perfect and the dev server was simply not
 * running. The measurement it printed alongside — "(0ms)" — was a
 * literal, not a measurement, and that fabricated number then read as
 * evidence for a setup-time throw. Neither defect was reachable by any
 * assertion in this repo, because the script launches chromium at its
 * top level and so cannot be imported. The judgements moved to
 * `scripts/lib/streamReceipt.ts`; this file is what now watches them.
 *
 * Its sibling in spirit is `noInterception.test.ts`: a fence about the
 * instrument rather than about the product, living under `src/` because
 * that is where vitest looks.
 *
 * WHAT THIS FILE DOES NOT ENFORCE, written down rather than implied:
 *
 *   The announcement contract is pinned here against a LITERAL sample
 *   of the mock's line. Nothing in this file runs `mock-provider.ts`,
 *   so if that server's wording changed, this test would keep passing.
 *   The live differential is the receipt itself: an unparsed
 *   announcement yields an `underivable` floor, which is INDETERMINATE,
 *   which fails the run — loudly, and on the very next execution.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  announcementLog,
  applyFloor,
  EXIT,
  floorFor,
  parseAnnouncement,
  preflight,
  timed,
  type Finding,
  type Floor,
} from "../../../scripts/lib/streamReceipt";

/** The line `scripts/mock-provider.ts` prints when it begins a stream. */
const ANNOUNCEMENT_LINE =
  "[mock-provider] streaming 5 chunks, mode=stream-clean, ttft=800ms, delay=200ms";

const present = (name: string): Finding => ({
  name,
  verdict: "MEASURED-PRESENT",
  note: "saw the thing",
});
const absent = (name: string): Finding => ({
  name,
  verdict: "MEASURED-ABSENT",
  note: "did not see the thing",
});

describe("the announcement the floor is derived from", () => {
  it("reads every term of the duration from the mock's own line", () => {
    expect(parseAnnouncement(ANNOUNCEMENT_LINE)).toEqual({
      chunks: 5,
      ttftMs: 800,
      delayMs: 200,
    });
  });

  // REGRESSION — the floor used to take ttft and delay from constants
  // in the receipt and only the COUNT from the server, so a server that
  // ignored a flag could not be noticed. A line missing a term must
  // fail to parse, not yield a partial announcement that reads as
  // complete.
  it("refuses a line that does not state all three terms", () => {
    expect(
      parseAnnouncement(
        "[mock-provider] streaming 5 chunks, mode=stream-clean, ttft=800ms",
      ),
    ).toBeNull();
    expect(
      parseAnnouncement("[mock-provider] listening on http://localhost:8788"),
    ).toBeNull();
  });
});

describe("announcements are keyed by the port that made them", () => {
  // REGRESSION for D3 — one module-level `announcedChunks` was shared
  // by every mock the run started. Receipt D starts a fresh server per
  // mode, and `stream-abrupt` announces half as many chunks as the
  // others, so whichever process logged last owned the number and a
  // floor could be computed for one endpoint out of another's stream.
  it("never answers for a port with another port's stream", () => {
    const log = announcementLog();
    log.note(
      8788,
      "[mock-provider] streaming 5 chunks, mode=stream-clean, ttft=800ms, delay=200ms",
    );
    log.note(
      8792,
      "[mock-provider] streaming 3 chunks, mode=stream-abrupt, ttft=800ms, delay=20ms",
    );

    expect(log.latest(8788)).toEqual({ chunks: 5, ttftMs: 800, delayMs: 200 });
    expect(log.latest(8792)).toEqual({ chunks: 3, ttftMs: 800, delayMs: 20 });
  });

  it("reports an unannounced port as unknown rather than as somebody else", () => {
    const log = announcementLog();
    log.note(8788, ANNOUNCEMENT_LINE);
    expect(log.latest(9999)).toBeNull();
  });

  it("ignores the mock's other chatter", () => {
    const log = announcementLog();
    log.note(
      8788,
      "[mock-provider] mode=stream-clean listening on http://localhost:8788",
    );
    expect(log.latest(8788)).toBeNull();
  });
});

describe("floors derive from what was announced", () => {
  const announced = { chunks: 5, ttftMs: 800, delayMs: 200 };

  it("holds a whole stream to its ttft plus every chunk's delay", () => {
    const floor = floorFor({ kind: "whole-stream" }, announced);
    expect(floor).toMatchObject({ kind: "derived", ms: 800 + 5 * 200 });
  });

  // The numbers must come from the ANNOUNCEMENT, not from the receipt's
  // own constants — an announcement unlike anything this repo passes
  // has to move the floor.
  it("follows the announcement when it disagrees with the receipt's own constants", () => {
    const floor = floorFor(
      { kind: "whole-stream" },
      { chunks: 12, ttftMs: 50, delayMs: 7 },
    );
    expect(floor).toMatchObject({ kind: "derived", ms: 50 + 12 * 7 });
  });

  it("holds a mid-stream cancel to its ttft plus the observation window", () => {
    expect(floorFor({ kind: "mid-stream", observeMs: 2000 }, announced)).toMatchObject({
      kind: "derived",
      ms: 2800,
    });
  });

  // THE EXCLUSION, asserted on its own side. `no-stream` 400s the
  // streamed request and answers whole; its measured duration is BELOW
  // the ttft the streaming modes are held to, so an omission here would
  // void a correct probe every run.
  it("excludes the mode that never streams, and says why", () => {
    const floor = floorFor({ kind: "no-stream" }, announced);
    expect(floor.kind).toBe("not-applicable");
    expect((floor as Extract<Floor, { kind: "not-applicable" }>).why).toContain(
      "no stream",
    );
  });

  it("excludes it even when that port did announce a stream", () => {
    expect(floorFor({ kind: "no-stream" }, announced).kind).toBe("not-applicable");
  });

  // THREE ANSWERS, NEVER TWO: "no floor applies" and "I could not work
  // one out" must not share a representation, or a broken ledger passes
  // as a deliberate exclusion.
  it("distinguishes an inapplicable floor from an underivable one", () => {
    expect(floorFor({ kind: "whole-stream" }, null).kind).toBe("underivable");
    expect(floorFor({ kind: "no-stream" }, null).kind).toBe("not-applicable");
  });
});

describe("the vacuity guard", () => {
  const floor = floorFor(
    { kind: "whole-stream" },
    { chunks: 5, ttftMs: 800, delayMs: 200 },
  );
  const spec = {
    probe: "tail",
    timingName: "A3 · the run actually took streaming time",
    floor,
  };

  it("passes a run that took at least as long as its work implies", () => {
    const out = applyFloor({ ...spec, findings: [present("A")], elapsedMs: 2350 });
    expect(out.findings[0]!.verdict).toBe("MEASURED-PRESENT");
    expect(out.timing).toMatchObject({
      name: "A3 · the run actually took streaming time",
      verdict: "MEASURED-PRESENT",
    });
  });

  // DIRECTIVE 3 — a probe whose claimed work implies elapsed time fails
  // as a HARNESS DEFECT when it completes implausibly fast, and the
  // failure asserts the DISTINCTIVE ARTIFACT rather than an exit
  // polarity: which probe, the measured duration, the derived floor,
  // and the terms it was derived from.
  it("voids a run that finished faster than its work could take, naming the cause", () => {
    const out = applyFloor({ ...spec, findings: [present("A")], elapsedMs: 40 });
    expect(out.timing!.verdict).toBe("INDETERMINATE");
    expect(out.timing!.note).toContain("tail");
    expect(out.timing!.note).toContain("40ms elapsed");
    expect(out.timing!.note).toContain("1800ms floor");
    expect(out.timing!.note).toContain("800ms announced ttft");
    expect(out.timing!.note).toContain("5 announced chunks");
    expect(out.timing!.note).toContain("200ms announced delay");
  });

  // BOTH POLARITIES. An unfounded ABSENT is as worthless as an
  // unfounded PRESENT: the instrument did not do the work, so neither
  // answer is evidence about anything.
  it("voids every verdict the probe produced, whichever way it pointed", () => {
    const out = applyFloor({
      ...spec,
      findings: [present("A"), absent("A2")],
      elapsedMs: 40,
    });
    expect(out.findings.map((f) => f.verdict)).toEqual([
      "INDETERMINATE",
      "INDETERMINATE",
    ]);
  });

  it("keeps what the probe thought it saw, as evidence about how it went wrong", () => {
    const out = applyFloor({ ...spec, findings: [present("A")], elapsedMs: 40 });
    expect(out.findings[0]!.note).toContain("saw the thing");
    expect(out.findings[0]!.name).toBe("A");
  });

  it("voids when no floor could be derived at all", () => {
    const out = applyFloor({
      ...spec,
      floor: floorFor({ kind: "whole-stream" }, null),
      findings: [present("A")],
      elapsedMs: 9_999,
    });
    expect(out.findings[0]!.verdict).toBe("INDETERMINATE");
    expect(out.timing!.verdict).toBe("INDETERMINATE");
  });

  // The exclusion's other side: an inapplicable floor must leave the
  // probe alone AND emit no timing line, because a timing verdict there
  // would be a claim about a measurement nobody took.
  it("leaves an excluded probe untouched and states no timing claim", () => {
    const out = applyFloor({
      ...spec,
      probe: "D · no-stream",
      floor: floorFor({ kind: "no-stream" }, null),
      findings: [present("D · mock mode no-stream")],
      elapsedMs: 525,
    });
    expect(out.findings).toEqual([present("D · mock mode no-stream")]);
    expect(out.timing).toBeNull();
  });
});

describe("durations are measured, never written down", () => {
  // REGRESSION for D2 — the failure path recorded a hardcoded `0`, so
  // every INDETERMINATE printed "(0ms)" whatever it had cost. That
  // number was then read as a measurement supporting a setup-time-throw
  // diagnosis. The clock is injected so this is exact on a machine
  // whose normal state is load average 15–20.
  it("times a probe that throws, from the clock rather than from a literal", async () => {
    const ticks = [1_000, 1_042];
    const out = await timed(
      () => Promise.reject(new Error("net::ERR_CONNECTION_REFUSED")),
      () => ticks.shift()!,
    );
    expect(out.ok).toBe(false);
    expect(out.ms).toBe(42);
  });

  it("times a probe that succeeds, and hands back what it returned", async () => {
    const ticks = [1_000, 3_350];
    const out = await timed(
      () => Promise.resolve(["a finding"]),
      () => ticks.shift()!,
    );
    expect(out).toMatchObject({ ok: true, ms: 2_350, value: ["a finding"] });
  });
});

describe("the precondition is not a probe", () => {
  // REGRESSION for D1 — with nothing serving APP_URL, `page.goto` threw
  // inside all three browser probes and the per-probe catch called them
  // three harness defects. The probes were fine. "The run could not
  // start" and "a probe could not measure" send a reader to two
  // different places, so they must not share a representation.
  it("refuses an unreachable app by naming the URL and the remedy", async () => {
    const out = await preflight("http://localhost:5999/", () => Promise.resolve(false));
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.cause).toContain("http://localhost:5999/");
    expect(out.remedy).toContain("pnpm dev");
  });

  it("passes a reachable app", async () => {
    const out = await preflight("http://localhost:5173/", () => Promise.resolve(true));
    expect(out.ok).toBe(true);
  });

  it("gives an unmet precondition its own rung, distinct from a broken probe", () => {
    const codes = [EXIT.ok, EXIT.claimFailed, EXIT.harnessDefect, EXIT.preconditionUnmet];
    expect(new Set(codes).size).toBe(codes.length);
    expect(EXIT.preconditionUnmet).not.toBe(EXIT.harnessDefect);
  });
});

describe("the precondition is checked before the browser exists", () => {
  /** Strip comments and string literals: a fence that fails on its own
   *  explanation is a fence people learn to disable. */
  function code(text: string): string {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, "``");
  }

  // Asserted on the CONSTRUCTION and on its ORDER, because the unit
  // assertions above would all still pass if the call site were
  // deleted: `preflight` would be a correct function nobody ran, and
  // the goto would fall back into the per-probe catch exactly as
  // before.
  it("calls preflight before chromium.launch in the receipt", () => {
    const source = code(
      readFileSync(
        join(import.meta.dirname, "..", "..", "..", "scripts", "receipt-stream.ts"),
        "utf8",
      ),
    );
    const check = source.indexOf("preflight(");
    const launch = source.indexOf("chromium.launch(");
    expect(check).toBeGreaterThan(-1);
    expect(launch).toBeGreaterThan(-1);
    expect(check).toBeLessThan(launch);
  });
});
