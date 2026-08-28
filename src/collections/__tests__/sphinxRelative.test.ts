/**
 * THE PROPERTY BEHIND THE ONE PLACE A MOVE EDITS TEXT (docs/19).
 *
 * A cross-file move rewrites an entry's target for its new containing
 * document, because a relative docname resolves against that document's
 * DIRECTORY. `targetIn` verifies its own arithmetic — it resolves the
 * rewritten target back through the shipped `resolveDocname` and falls
 * back to the absolute form when they disagree.
 *
 * That fallback SURVIVED MUTATION: disabling it broke nothing, because
 * no example test reaches it. Rather than delete a guard or leave a
 * branch nothing exercises, the claim it defends is asserted directly —
 * the arithmetic must round-trip for every pair, and the fallback is what
 * makes a counterexample a wrong-but-correct patch instead of a wrong
 * one. If fast-check ever finds a pair that needs it, the fallback has
 * its producer and this test names it.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { relativeDocname } from "../adapters/sphinx";
import { resolveDocname } from "../rst";

const segment = fc.constantFrom("a", "b", "guides", "reference", "deep", "index");
const docname = fc.array(segment, { minLength: 1, maxLength: 4 }).map((s) => s.join("/"));
const host = fc.array(segment, { minLength: 1, maxLength: 4 }).map((s) => s.join("/"));

describe("a rewritten target resolves back to the document it names", () => {
  it("round-trips for every docname and host", () => {
    fc.assert(
      fc.property(docname, host, (doc, from) => {
        const written = relativeDocname(doc, from);
        expect(resolveDocname(written, from)).toBe(doc);
      }),
      { numRuns: 500 },
    );
  });

  it("resolves the ABSOLUTE form from any host — the fallback's own claim", () => {
    fc.assert(
      fc.property(docname, host, (doc, from) => {
        expect(resolveDocname(`/${doc}`, from)).toBe(doc);
      }),
      { numRuns: 200 },
    );
  });

  it("writes a sibling without any ../ at all", () => {
    expect(relativeDocname("guides/install", "guides/index")).toBe("install");
  });

  it("climbs out of a directory to reach a sibling tree", () => {
    expect(relativeDocname("reference/api", "guides/index")).toBe("../reference/api");
  });

  it("writes a nested target from the root document plainly", () => {
    expect(relativeDocname("guides/install", "index")).toBe("guides/install");
  });
});
