/**
 * streamReceipt.ts — the decision logic `receipt-stream.ts` runs on,
 * kept pure so it can be asserted without a browser or a server.
 *
 * WHY IT IS ITS OWN FILE. `scripts/receipt-stream.ts` launches chromium
 * and spawns a server at the top level, so nothing can import it to
 * check what it decides. Every judgement it makes therefore lived where
 * no test could reach it, which is how three of the defects below
 * survived: a fabricated duration, a shared announcement clobbered by
 * whichever mock logged last, and a whole class of probes with no
 * vacuity guard at all.
 *
 * NOTHING HERE DOES I/O. The reachability probe and the clock are
 * injected, so the tests are deterministic on a machine whose normal
 * state is load average 15–20.
 */

// ── verdicts ────────────────────────────────────────────────

/**
 * THREE VERDICTS, NEVER TWO. A probe exception is INDETERMINATE and
 * fails the RUN as a harness defect; it must never collapse into
 * ABSENT, because absent is a legitimate ANSWER here (no capture row
 * after a cancel is the whole point of receipt B) and conflating them
 * makes a broken instrument indistinguishable from a true negative.
 */
export type Verdict = "MEASURED-PRESENT" | "MEASURED-ABSENT" | "INDETERMINATE";

/** One measured claim. The duration is attached by the runner, from the
 *  runner's own clock — a probe never states its own elapsed time. */
export type Finding = { name: string; verdict: Verdict; note: string };

// ── what the mock announced, per endpoint ───────────────────

/** The terms of a stream's duration, as the mock states them on its own
 *  stdout. Every one is announced rather than assumed: a floor built
 *  from what this side INTENDED cannot notice that the server ignored a
 *  flag — which has happened here before, when `--ttft` did nothing
 *  because the response head was never flushed. */
export type Announcement = { chunks: number; ttftMs: number; delayMs: number };

const ANNOUNCEMENT = /streaming (\d+) chunks, mode=\S+?, ttft=(\d+)ms, delay=(\d+)ms/;

export function parseAnnouncement(text: string): Announcement | null {
  const m = ANNOUNCEMENT.exec(text);
  if (!m) return null;
  return { chunks: Number(m[1]), ttftMs: Number(m[2]), delayMs: Number(m[3]) };
}

/**
 * Announcements KEYED BY PORT.
 *
 * The first cut kept one module-level `announcedChunks`, which is one
 * name for N referents: receipt D starts a fresh mock per mode on its
 * own port, and `stream-abrupt` announces half as many chunks as the
 * others. Whichever server logged last owned the variable, so a floor
 * could be computed for one endpoint out of another's stream.
 */
export type AnnouncementLog = {
  note: (port: number, text: string) => void;
  latest: (port: number) => Announcement | null;
};

export function announcementLog(): AnnouncementLog {
  const byPort = new Map<number, Announcement>();
  return {
    note(port, text) {
      const parsed = parseAnnouncement(text);
      if (parsed) byPort.set(port, parsed);
    },
    latest(port) {
      return byPort.get(port) ?? null;
    },
  };
}

// ── floors ──────────────────────────────────────────────────

/**
 * What a probe CLAIMS it did — which is what implies elapsed time.
 *
 * `no-stream` is the EXCLUSION, and it carries its reason: that mode
 * refuses SSE with a 400 and answers whole, so there is no stream to
 * have taken time. Narrowing a classifier obligates the other side's
 * receipt, so the exclusion is a case here rather than a missing entry,
 * and it is asserted in its own test.
 */
export type Claim =
  | { kind: "whole-stream" }
  | { kind: "mid-stream"; observeMs: number }
  | { kind: "no-stream" };

/**
 * THREE ANSWERS, NEVER TWO, for the same reason the verdicts are three:
 * "no floor applies here" and "I could not work out a floor" are
 * different states, and one `null` for both would let a broken ledger
 * pass as a deliberate exclusion.
 */
export type Floor =
  | { kind: "derived"; ms: number; derivation: string }
  | { kind: "not-applicable"; why: string }
  | { kind: "underivable"; why: string };

export function floorFor(claim: Claim, announced: Announcement | null): Floor {
  if (claim.kind === "no-stream") {
    return {
      kind: "not-applicable",
      why: "the endpoint refuses SSE and answers whole — no stream to take time",
    };
  }
  if (announced === null) {
    return {
      kind: "underivable",
      why: "the mock announced no stream on this port — cannot derive a floor",
    };
  }
  if (claim.kind === "mid-stream") {
    return {
      kind: "derived",
      ms: announced.ttftMs + claim.observeMs,
      derivation:
        `${announced.ttftMs}ms announced ttft + ${claim.observeMs}ms observation ` +
        `window (a cancel before the first token is not mid-stream)`,
    };
  }
  return {
    kind: "derived",
    ms: announced.ttftMs + announced.chunks * announced.delayMs,
    derivation:
      `${announced.ttftMs}ms announced ttft + ${announced.chunks} announced chunks ` +
      `× ${announced.delayMs}ms announced delay`,
  };
}

// ── the vacuity guard ───────────────────────────────────────

/**
 * SUSPICIOUS SPEED IS A VACUITY SMELL, and nothing in a green run says
 * so. A probe that reports a verdict in less time than its own claimed
 * work could physically take did not do that work, and its verdict is
 * void whatever its polarity — an unfounded ABSENT is as worthless as
 * an unfounded PRESENT.
 *
 * Voiding is INDETERMINATE rather than ABSENT because the failure is
 * the instrument's, not the product's: the run must fail as a harness
 * defect and send the reader to the probe.
 *
 * The voided note names the DISTINCTIVE ARTIFACT — which probe, the
 * measured duration, the derived floor and the terms it was derived
 * from — because an exit code can be produced by the wrong path
 * entirely.
 */
export function applyFloor(input: {
  /** Short label naming the probe in the cause, e.g. "tail". */
  probe: string;
  /** The timing finding's own name, so a claim that is already cited
   *  elsewhere keeps the words it is cited by. */
  timingName: string;
  findings: Finding[];
  elapsedMs: number;
  floor: Floor;
}): { findings: Finding[]; timing: Finding | null } {
  const { probe, timingName, findings, elapsedMs, floor } = input;
  if (floor.kind === "not-applicable") {
    // The exclusion emits NO timing line: a floor finding here would
    // have to invent a verdict about a measurement nobody took.
    return { findings, timing: null };
  }

  const cause =
    floor.kind === "underivable"
      ? `${probe}: ${floor.why}`
      : `${probe}: ${elapsedMs}ms elapsed against a ${floor.ms}ms floor ` +
        `(${floor.derivation})`;

  if (floor.kind === "underivable" || elapsedMs < floor.ms) {
    return {
      findings: findings.map((f) => ({
        name: f.name,
        verdict: "INDETERMINATE" as const,
        // The original note is kept: what the probe thought it saw is
        // evidence about HOW it went wrong.
        note: `VOID — ${cause}. Reported before voiding: ${f.note}`,
      })),
      timing: { name: timingName, verdict: "INDETERMINATE", note: cause },
    };
  }

  return {
    findings,
    timing: { name: timingName, verdict: "MEASURED-PRESENT", note: cause },
  };
}

// ── timing ──────────────────────────────────────────────────

/**
 * A duration that was actually MEASURED.
 *
 * The brand exists so the defect cannot be written again: `report`
 * accepts only a `Millis`, and a `Millis` is only ever produced by
 * `timed`, so passing a literal `0` on a failure path fails
 * `pnpm check` rather than printing a number nobody measured. Erasable
 * — it is a type, not a value.
 */
export type Millis = number & { readonly __measured: unique symbol };

export type Timed<T> =
  { ok: true; ms: Millis; value: T } | { ok: false; ms: Millis; error: unknown };

/**
 * Time a probe, INCLUDING one that throws.
 *
 * The first cut recorded a hardcoded `0` on the failure path, so every
 * INDETERMINATE printed "(0ms)" whatever it had really cost. That
 * number then read as a measurement: a run whose three probes died on
 * an unreachable app was diagnosed as a setup-time throw BECAUSE the
 * log said 0ms, and the 0 was a literal. Logs state what was measured,
 * from the measurement's own variables.
 */
export async function timed<T>(
  fn: () => Promise<T>,
  now: () => number = Date.now,
): Promise<Timed<T>> {
  const started = now();
  try {
    const value = await fn();
    return { ok: true, ms: (now() - started) as Millis, value };
  } catch (error) {
    return { ok: false, ms: (now() - started) as Millis, error };
  }
}

// ── the precondition ────────────────────────────────────────

/**
 * A PRECONDITION IS NOT A PROBE.
 *
 * When nothing serves `APP_URL`, `page.goto` throws inside each of the
 * three browser probes, and the per-probe catch labelled all three
 * INDETERMINATE — "HARNESS DEFECT: at least one probe could not
 * measure. Fix the probe." The probes were perfect. The dev server was
 * not running.
 *
 * Two ideas had one name: "the probe broke while measuring" and "the
 * run could never have started". The first sends a reader into the
 * instrument, which is right; the second sends them into an instrument
 * that is fine, which cost this arc its charter. So the run refuses
 * BEFORE the browser launches, with the URL and the remedy named — the
 * shape `paint-check.ts` and `paint-glyphs.ts` already use.
 */
export type Precondition =
  { ok: true; note: string } | { ok: false; cause: string; remedy: string };

export async function preflight(
  url: string,
  reach: (url: string) => Promise<boolean>,
): Promise<Precondition> {
  const up = await reach(url);
  return up
    ? { ok: true, note: `app answering at ${url}` }
    : {
        ok: false,
        cause: `nothing is serving the app at ${url}`,
        remedy: "start it with `pnpm dev` in another shell, then re-run",
      };
}

/** Exit codes, as a ladder rather than a polarity — three failure kinds
 *  that send a reader to three different places. */
export const EXIT = {
  ok: 0,
  /** A claim did not hold: read the notes before opening product code. */
  claimFailed: 1,
  /** A probe could not measure: the instrument is broken. */
  harnessDefect: 2,
  /** The run could not start: the operator's precondition is unmet. */
  preconditionUnmet: 3,
} as const;
