/**
 * aspirationalFences.test.ts — the prohibitions (docs/21, "Fences and
 * invariants for the build").
 *
 * A FENCE WITHOUT A TEST IS A REQUEST. Every rule here says what must
 * NOT happen, and prose cannot hold any of them: the violating line is
 * one line, usually convenient, and it arrives with a passing test of
 * its own.
 *
 * ASSERTED ON THE CONSTRUCTION, NEVER ON VOCABULARY. A scan for bare
 * words flags the prose that explains the fence, and a fence that fails
 * on its own explanation is one people learn to disable — three receipts
 * in one session say so. So these look for imports and call shapes.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseResponse } from "@/ai/parse";
import { applyableProjection, buildChecklist, recordedLedger } from "../ledger";
import { doc, section, topic } from "./fixtures";

const source = (path: string): string => readFileSync(path, "utf8");

/**
 * A file's CODE, with comments removed.
 *
 * ASSERTED ON THE CONSTRUCTION, NEVER ON VOCABULARY — this file's own
 * header says so, and the bare-word scan below broke that rule the first
 * time a module explained in prose which fields it deliberately does not
 * read (docs/22's report selector, whose whole point is that two tabs
 * differing only in tab state derive identical reports). A fence that
 * fails on its own explanation is one people learn to disable.
 *
 * Stripping comments is what makes the remaining scan a construction
 * assertion: a member access, a declaration or a literal survives, prose
 * does not. Deliberately not a full tokenizer — a `//` inside a string
 * would truncate that line, which costs nothing here because every
 * pattern below names an identifier rather than a URL.
 */
const code = (path: string): string =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Every .ts/.tsx file under a directory, recursively, tests excluded. */
function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      out.push(...sourcesUnder(path));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

describe("classification never gates a write", () => {
  /**
   * The ledger is DOCUMENT-side truth about what an arrangement has
   * displaced. The write path answers a different question — what can
   * be written — and the whole design rests on those two never being
   * asked as one. An adapter that consulted a badge would be refusing on
   * a fact about imagination.
   */
  it("keeps every collection adapter from importing the ledger at all", () => {
    for (const path of sourcesUnder("src/collections")) {
      const text = source(path);
      // The one legitimate exception is the module that EXISTS to feed
      // the ledger a re-parsed original — it consumes nothing from it.
      if (path.endsWith("original.ts")) continue;
      expect(text, path).not.toMatch(/from "@\/model\/ledger"/);
    }
  });

  it("keeps the verifier and the writers clear of it too", () => {
    // `simulatePlan`, `applyChanges` and the File System Access writer
    // are the three places a plan becomes bytes. None may know a
    // displacement exists.
    for (const path of ["src/collections/verify.ts", "src/collections/fsAccess.ts"]) {
      expect(source(path), path).not.toContain("ledger");
      expect(source(path), path).not.toContain("displaced");
    }
  });

  it("keeps the drag/seam layer clear of every adapter", () => {
    // The gesture layer's inputs are the tab and the model layer's
    // `isPinned` — nothing format-shaped. Applied BEFORE the drift: arc
    // 2 built the seam here, and this is what it landed against.
    for (const path of sourcesUnder("src/interaction")) {
      expect(source(path), path).not.toMatch(/collections\/adapters/);
      expect(source(path), path).not.toMatch(/formats\/adapters/);
    }
  });

  it("SWEEPS the seam's own modules, rather than a directory that might not hold them", () => {
    /**
     * AN INSTRUMENT THAT ACCEPTS IS NOT AN INSTRUMENT THAT CHECKS. The
     * test above globs a directory, so it stays green — silently, and
     * forever — if the seam is ever moved out of it, or if the glob
     * one day matches nothing at all. Naming the files is what turns
     * "we swept a folder" into "we swept THESE".
     *
     * The seam's own surfaces are listed here because they are the
     * files this fence exists for; the glob keeps covering everything
     * else, including whatever arrives next.
     */
    const swept = new Set(sourcesUnder("src/interaction"));
    for (const owed of [
      "src/interaction/pinnedDrag.ts",
      "src/interaction/topicDrag.ts",
      "src/interaction/moveLabel.ts",
    ]) {
      expect(swept.has(owed), `${owed} is not covered by the interaction sweep`).toBe(
        true,
      );
    }

    // The seam's VIEW surfaces sit outside `src/interaction`, so the
    // glob above never sees them. They answer the same prohibition.
    for (const path of [
      "src/view/canvas/PinnedSeamMenu.tsx",
      "src/view/canvas/rowMenu.ts",
      "src/view/aspirationalControl.ts",
    ]) {
      expect(source(path), path).not.toMatch(/collections\/adapters/);
      expect(source(path), path).not.toMatch(/formats\/adapters/);
    }
  });
});

describe("the tab STATE never gates a write", () => {
  it("gives the write path no parameter a tab state could arrive through", () => {
    // THE CONSTRUCTION ASSERTION. Stronger than any claim about a
    // value: the projection takes (document, records) and the checklist
    // takes (document, records, options). Neither signature has a slot
    // for `aspirational` or `seamDeclined`.
    expect(applyableProjection.length).toBe(2);
    expect(buildChecklist.length).toBe(3);
  });

  it("keeps the store's tab-state fields out of the model and collection layers", () => {
    // Nothing below the view may even name them, which is what makes
    // "the apply surfaces read the LEDGER" enforceable rather than
    // aspirational.
    for (const path of [
      ...sourcesUnder("src/model"),
      ...sourcesUnder("src/collections"),
    ]) {
      expect(code(path), path).not.toMatch(/\bseamDeclined\b/);
      expect(code(path), path).not.toMatch(/tab\.aspirational/);
    }
  });
});

describe("no model-authored classification", () => {
  /**
   * Which moves are aspirational is DERIVED by the app, never annotated
   * by the model. Trusting an annotation would create a second source of
   * truth for a fact the app can compute — and an annotation the model
   * forgets would silently downgrade a pinned move into an applyable
   * one, which is the exact lie the identity-strict layer exists to
   * prevent, one field over.
   */
  const known = new Set(["s1", "t1", "t2"]);

  it("parses an invented aspiration marker as TITLE TEXT, never as syntax", () => {
    const parsed = parseResponse("s1\n  t1 ~ Intro [aspirational]", known);
    expect(parsed.errors).toEqual([]);
    const child = parsed.nodes[0]!.children![0]!;
    expect(child.id).toBe("t1");
    // The marker survives as characters in a title. It is not a field,
    // not a flag, and nothing downstream reads it.
    expect(child.title).toContain("[aspirational]");
  });

  it("refuses an invented ID however it is dressed", () => {
    // Identity-strictness is a proposal-constraint and binds in both
    // modes: an invented id is content invention, and no badge can label
    // its way out of a node the document does not have.
    expect(parseResponse("s1\n  t9 [pinned-move]", known).errors.length).toBeGreaterThan(
      0,
    );
  });

  it("has no aspiration vocabulary in the grammar at all", () => {
    // Asserted on the parser's SOURCE, because the failure mode is a
    // future line that adds one — `~` (rename) and `+` (new group) are
    // the only two markers the grammar has.
    const grammar = source("src/ai/parse.ts");
    expect(grammar).not.toMatch(/aspiration/i);
    expect(grammar).not.toContain("displaced");
  });
});

describe("the ledger reads what the arrangement holds, never a stored count", () => {
  it("reflects an edit made after the tab was born", () => {
    // The first draft stored the classification once at tab creation.
    // A hand can displace a row a week later, and every consumer of a
    // stored count starts lying the moment it does.
    const d = doc([section("A", [topic("one")]), section("B", [])]);
    expect(recordedLedger(d)).toEqual([]);
    const moved = d.sections[0]!.topics.pop()!;
    d.sections[1]!.topics.push({
      ...moved,
      displaced: {
        parentId: d.sections[0]!.id,
        parentTitle: "A",
        index: 0,
        kind: "pin",
      },
    });
    expect(recordedLedger(d)).toHaveLength(1);
  });
});
