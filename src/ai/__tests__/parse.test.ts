/** The malformed-input suite (plan Layers 1–3). */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseResponse } from "../parse";

const KNOWN = new Set(["s1", "s2", "t1", "t2", "t3", "t4", "t5"]);

const VALID = ["s1", "  t1", "  t2 ~ Renamed", "+ New Group", "  t3", "s2"].join("\n");

describe("clean parsing", () => {
  it("builds the tree with children-follow leaves and rename/new markers", () => {
    const { nodes, errors } = parseResponse(VALID, KNOWN);
    expect(errors).toEqual([]);
    expect(nodes).toEqual([
      {
        id: "s1",
        children: [{ id: "t1" }, { id: "t2", title: "Renamed" }],
      },
      { title: "New Group", children: [{ id: "t3" }] },
      { id: "s2" },
    ]);
  });
});

describe("Layer 1: wrapper noise", () => {
  it("prefers a fenced block and ignores surrounding prose", () => {
    const raw = `Here's the reorganized TOC:\n\n\`\`\`\n${VALID}\n\`\`\`\n\nI merged the small sections.`;
    const { nodes, errors } = parseResponse(raw, KNOWN);
    expect(errors).toEqual([]);
    expect(nodes).toHaveLength(3);
  });

  it("trims unfenced preamble and postamble prose", () => {
    const raw = `Sure! Here is the new structure.\n${VALID}\nHope this helps!`;
    const { nodes, errors } = parseResponse(raw, KNOWN);
    expect(errors).toEqual([]);
    expect(nodes).toHaveLength(3);
  });

  it("falls back to JSON when the model ignored the text format", () => {
    const raw = JSON.stringify([
      { id: "s1", children: [{ id: "t1" }, { id: "t2", title: "Renamed" }] },
      { title: "New Group", children: [{ id: "t3" }] },
    ]);
    const { nodes, errors } = parseResponse(raw, KNOWN);
    expect(errors).toEqual([]);
    expect(nodes[0]).toEqual({
      id: "s1",
      children: [{ id: "t1" }, { id: "t2", title: "Renamed" }],
    });
  });

  it("reports empty and refusal-only responses", () => {
    expect(parseResponse("", KNOWN).errors).not.toEqual([]);
    expect(
      parseResponse("I cannot reorganize this document, sorry.", KNOWN).errors,
    ).not.toEqual([]);
  });
});

describe("Layer 2: tolerant lexing", () => {
  it("strips bullets, numbering, and markdown emphasis", () => {
    const raw = ["- s1", "  * t1", "  1. **t2**", "- s2"].join("\n");
    const { nodes, errors } = parseResponse(raw, KNOWN);
    expect(errors).toEqual([]);
    expect(nodes).toEqual([
      { id: "s1", children: [{ id: "t1" }, { id: "t2" }] },
      { id: "s2" },
    ]);
  });

  it("handles tabs and ragged indent widths via the parent stack", () => {
    const raw = ["s1", "\tt1", "      t2", "   t3", "s2"].join("\n");
    const { nodes, errors } = parseResponse(raw, KNOWN);
    expect(errors).toEqual([]);
    // t2 (6) deeper than t1 (tab→2) → child of t1; t3 (3) pops t2 and
    // lands on its nearest shallower ancestor t1; s2 (0) back to root
    expect(nodes).toEqual([
      {
        id: "s1",
        children: [{ id: "t1", children: [{ id: "t2" }, { id: "t3" }] }],
      },
      { id: "s2" },
    ]);
  });

  it("captures echoed titles as title text (rename decision is downstream)", () => {
    const { nodes } = parseResponse("s1\n  t1 Some Echoed Title", KNOWN);
    expect(nodes[0]!.children![0]).toEqual({ id: "t1", title: "Some Echoed Title" });
  });
});

describe("Layer 3: identity errors", () => {
  it("collects unknown ids", () => {
    const { errors } = parseResponse("s1\n  t99", KNOWN);
    expect(errors.join(" ")).toContain('unknown id "t99"');
  });

  it("collects duplicate ids", () => {
    const { errors } = parseResponse("s1\n  t1\n  t1", KNOWN);
    expect(errors.join(" ")).toContain('"t1" appears more than once');
  });

  it("collects interior junk lines with line numbers", () => {
    const raw = ["s1", "  t1", "This groups the setup topics.", "  t2"].join("\n");
    const { errors } = parseResponse(raw, KNOWN);
    expect(errors.join(" ")).toContain("not an outline line");
  });

  it("mid-stream truncation garbage is a line error, not a crash", () => {
    // a cut in the middle of the output leaves an unlexable interior line
    const { errors } = parseResponse("s1\n  t\n  t2", KNOWN);
    expect(errors.join(" ")).toContain("not an outline line");
    // trailing truncation is trimmed silently — finish_reason=length is
    // the client's job to detect
    expect(parseResponse("s1\n  t1\n  t", KNOWN).errors).toEqual([]);
  });
});

describe("never-throws fuzz property", () => {
  it("random mutations of valid output yield nodes or errors, never a throw", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: VALID.length - 1 }), { maxLength: 8 }),
        fc.string({ maxLength: 12 }),
        (positions, garbage) => {
          let mutated = VALID;
          for (const pos of positions) {
            mutated = mutated.slice(0, pos) + garbage + mutated.slice(pos);
          }
          const outcome = parseResponse(mutated, KNOWN);
          expect(Array.isArray(outcome.nodes)).toBe(true);
          expect(Array.isArray(outcome.errors)).toBe(true);
        },
      ),
    );
  });
});
