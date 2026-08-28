/**
 * locks.test.ts — the lock legend's contract (docs/19).
 *
 * The Record types make an eighth kind a compile error at every table;
 * these tests pin what types cannot: tier MEMBERSHIP, vocabulary
 * distinctness (no string serves two kinds — the two-sentence test as
 * a unit test), and the per-row facts each tooltip interpolates.
 */

import { describe, expect, it } from "vitest";
import { LOCK_KINDS, LOCK_LABEL, LOCK_TIER, lockTooltip } from "../locks";
import { LOCK_GLYPH } from "@/view/canvas/lockGlyphs";
import type { LockKind, TopicLock } from "../types";

/** A representative lock per kind, per-kind facts filled in. */
function lockOf(kind: LockKind): TopicLock {
  if (kind === "atomic") return { kind, count: 1163 };
  if (kind === "reference") return { kind, owner: "Getting started" };
  return { kind };
}

describe("the lock legend", () => {
  it("names every kind exactly once", () => {
    expect([...LOCK_KINDS].sort()).toEqual(
      [...Object.keys(LOCK_TIER)].sort() as LockKind[],
    );
    expect(new Set(LOCK_KINDS).size).toBe(LOCK_KINDS.length);
  });

  it("maps every kind to its own mark — no shape serves two kinds", () => {
    const marks = LOCK_KINDS.map((k) => LOCK_GLYPH[k]);
    expect(marks.every((m) => m !== undefined)).toBe(true);
    expect(new Set(marks).size).toBe(LOCK_KINDS.length);
  });

  it("answers the membership question: does this mean something in the FILES should change?", () => {
    // Only `missing` says yes — a target that does not exist is a fault
    // in the corpus. Every other kind is a boundary of the app's
    // editing model, and painting one in the warning token would spend
    // the error tier on a state.
    expect(LOCK_TIER.missing).toBe("error");
    for (const kind of LOCK_KINDS.filter((k) => k !== "missing")) {
      expect(LOCK_TIER[kind], `${kind} is a state, not a corpus fault`).toBe("state");
    }
  });

  it("gives every kind a label of its own", () => {
    const labels = LOCK_KINDS.map((k) => LOCK_LABEL[k]);
    expect(new Set(labels).size).toBe(LOCK_KINDS.length);
  });

  it("gives every kind tooltip copy no other kind shares (two-sentence test)", () => {
    const seen = new Map<string, LockKind>();
    for (const kind of LOCK_KINDS) {
      const lines = lockTooltip(lockOf(kind));
      expect(lines.length, `${kind} explains itself`).toBeGreaterThanOrEqual(2);
      for (const line of lines) {
        const owner = seen.get(line);
        expect(owner, `"${line}" serves both ${owner} and ${kind}`).toBeUndefined();
        seen.set(line, kind);
      }
    }
  });

  it("puts 'Above prose' first for outside-region, with the remedy named", () => {
    const lines = lockTooltip(lockOf("outside-region"));
    expect(lines[0]).toBe("Above prose");
    expect(lines.join(" ")).toContain("move the toctree to the file's end");
  });

  it("names the owner in a reference tooltip, and survives its absence", () => {
    expect(lockTooltip({ kind: "reference", owner: "Getting started" })[0]).toContain(
      "“Getting started”",
    );
    // Input absent ⇒ the general sentence, never a guessed owner.
    expect(lockTooltip({ kind: "reference" })[0]).not.toContain("“");
  });

  it("carries the folded count in an atomic tooltip, formatted", () => {
    expect(lockTooltip({ kind: "atomic", count: 1163 }).join(" ")).toContain("1,163");
  });
});
