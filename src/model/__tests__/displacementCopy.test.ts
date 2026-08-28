/**
 * displacementCopy.test.ts — the badge and the checklist are two
 * renderings of ONE record, and must not drift (docs/21, Decisions 3
 * and 4).
 *
 * ONE VOCABULARY, cause → consequence → remedy — the same grammar the
 * lock legend already speaks, with the displacement interpolated. The
 * per-kind cause and unbolt clause come from `locks.ts`, which is where
 * the lock vocabulary lives; nothing here invents a second wording for a
 * kind that already has one.
 *
 * ABSENT, NEVER GUESSED. A carrier the ledger could not derive is left
 * out of the sentence rather than replaced by a plausible filename — the
 * guard-consumes-declared-inputs rule applied to copy, where the failure
 * mode is a user opening a file that has nothing to do with it.
 */

import { describe, expect, it } from "vitest";
import { LOCK_KINDS, LOCK_LABEL } from "../locks";
import { displacementCopy, type LedgerRecord } from "../ledger";
import type { DisplacementKind } from "../types";

const RECORD = (over: Partial<LedgerRecord> = {}): LedgerRecord => ({
  topicId: "t1",
  title: "Using the Project Manager",
  kind: "pin",
  lockKind: "outside-region",
  originalParentId: "s1",
  originalParentTitle: "Getting started",
  originalIndex: 0,
  ...over,
});

describe("the headline names both places", () => {
  it("says where it is imagined and where it stays", () => {
    const copy = displacementCopy(RECORD(), "Tutorials");
    expect(copy.headline).toBe(
      '"Using the Project Manager" — imagined under "Tutorials", stays under "Getting started"',
    );
  });

  it("degrades gracefully when the current parent is unknown", () => {
    const copy = displacementCopy(RECORD(), undefined);
    expect(copy.headline).toBe(
      '"Using the Project Manager" — stays under "Getting started"',
    );
  });
});

describe("the cause comes from the lock legend, not from a second wording", () => {
  it("names the kind in the legend's own words", () => {
    // The legend's LABEL, lowercased into the sentence — one vocabulary,
    // not a second wording invented at the copy site.
    expect(displacementCopy(RECORD(), "Tutorials").cause).toContain(
      LOCK_LABEL["outside-region"].toLowerCase(),
    );
  });

  it("names the carrier when the ledger derived one", () => {
    const copy = displacementCopy(RECORD({ carrier: "getting_started/index.rst" }), "T");
    expect(copy.cause).toContain("getting_started/index.rst");
  });

  it("leaves the carrier out entirely when it is absent", () => {
    const copy = displacementCopy(RECORD(), "T");
    expect(copy.cause).not.toContain("undefined");
    expect(copy.cause).not.toMatch(/\bin\s*[.,]/);
  });

  it("answers for every one of the seven lock kinds", () => {
    // Keyed on LockKind, so an eighth kind fails `pnpm check` here and
    // in the legend at the same time.
    for (const kind of LOCK_KINDS) {
      const copy = displacementCopy(RECORD({ lockKind: kind }), "T");
      expect(copy.cause.length, kind).toBeGreaterThan(0);
      expect(copy.remedy.length, kind).toBeGreaterThan(0);
    }
  });
});

describe("the remedy says what would make the imagined move REAL", () => {
  it("frames the unbolt as the move's precondition", () => {
    const copy = displacementCopy(RECORD({ carrier: "getting_started/index.rst" }), "T");
    expect(copy.remedy).toContain("To make this real:");
    expect(copy.remedy).toContain("getting_started/index.rst");
    expect(copy.remedy).toContain("re-import and re-run");
  });

  it("never sends an `atomic` row's owner to edit files", () => {
    // The one kind whose boundary is the APP's, not the corpus's: the
    // unbolt is an import that descends, and telling the user to edit a
    // source file would send them looking for a fault that is not there.
    const copy = displacementCopy(RECORD({ lockKind: "atomic" }), "T");
    expect(copy.remedy).not.toMatch(/source file|edit the entry/);
    expect(copy.remedy).toMatch(/import/i);
  });
});

describe("every displacement kind is answered", () => {
  const KINDS: DisplacementKind[] = [
    "pin",
    "directory-move",
    "block-entry",
    "reparent-unsupported",
    "consent",
  ];

  it("gives each kind its own cause and remedy", () => {
    // Exhaustive by construction — a sixth kind fails the switch. And
    // distinct by assertion: one string serving two kinds is the
    // two-sentence test failing in the copy layer.
    const causes = KINDS.map((kind) => displacementCopy(RECORD({ kind }), "T").cause);
    expect(new Set(causes).size).toBe(KINDS.length);
  });

  it("tells a CONSENT record's reader it is a choice, not a wall", () => {
    // "The app cannot write this" and "you chose not to write this
    // today" are different facts, and the list must not blame the format
    // for a choice the user made.
    const copy = displacementCopy(RECORD({ kind: "consent", lockKind: undefined }), "T");
    expect(copy.cause).toMatch(/relocates its file/i);
    expect(copy.remedy).toContain("Review changes");
  });

  it("sends a directory move to the redistribution path, as the drag does", () => {
    // One truth, N surfaces: the same words the subsection refusal uses.
    const copy = displacementCopy(
      RECORD({ kind: "directory-move", lockKind: undefined }),
      "T",
    );
    expect(copy.remedy).toMatch(/individually/);
  });
});
