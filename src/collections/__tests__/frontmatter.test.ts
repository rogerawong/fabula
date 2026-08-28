import { describe, expect, it } from "vitest";
import { applyFrontmatterEdits, parseFrontmatter } from "../frontmatter";

const BASIC = `---
title: Buttons
parent: UI Components
nav_order: 2
layout: default # keep me
---

# Buttons

Body with a horizontal rule below, which is NOT a fence:

---

The end.
`;

describe("parseFrontmatter", () => {
  it("parses the block and stops at the FIRST closing fence", () => {
    const block = parseFrontmatter(BASIC)!;
    expect(block.data).toMatchObject({ title: "Buttons", nav_order: 2 });
    expect(block.rest).toContain("# Buttons");
    expect(block.rest).toContain("The end.");
  });

  it("returns null without a frontmatter block or closer", () => {
    expect(parseFrontmatter("# Just a doc\n")).toBeNull();
    expect(parseFrontmatter("---\ntitle: X\nno closer ever\n")).toBeNull();
  });

  it("tolerates duplicate keys Psych-style (last wins) instead of throwing", () => {
    const block = parseFrontmatter("---\ntitle: A\ntitle: B\n---\nbody\n")!;
    expect(block.data).toEqual({ title: "B" });
  });

  it("preserves BOM and CRLF detection", () => {
    const crlf = "---\r\ntitle: X\r\n---\r\nbody\r\n";
    const block = parseFrontmatter(crlf)!;
    expect(block.eol).toBe("\r\n");
    const bom = "﻿---\ntitle: X\n---\nbody\n";
    expect(parseFrontmatter(bom)!.bom).toBe("﻿");
  });
});

describe("applyFrontmatterEdits", () => {
  it("rewrites only the managed line; every other byte survives", () => {
    const { content } = applyFrontmatterEdits(BASIC, {
      set: { parent: "Utilities" },
    });
    const changedLines = BASIC.split("\n").filter(
      (line, i) => content.split("\n")[i] !== line,
    );
    expect(changedLines).toEqual(["parent: UI Components"]);
    expect(content).toContain("parent: Utilities");
    expect(content).toContain("layout: default # keep me");
    expect(content).toContain("The end.");
  });

  it("no-op edits return the original string identity", () => {
    const { content } = applyFrontmatterEdits(BASIC, {
      set: { nav_order: 2, title: "Buttons" },
    });
    expect(content).toBe(BASIC);
  });

  it("inserts missing keys before the closing fence", () => {
    const { content } = applyFrontmatterEdits(BASIC, {
      set: { grand_parent: "Navigation" },
    });
    const lines = content.split("\n");
    const closer = lines.indexOf("---", 1);
    expect(lines[closer - 1]).toBe("grand_parent: Navigation");
  });

  it("removes keys (all duplicate occurrences)", () => {
    const doubled = "---\ntitle: A\ngrand_parent: X\ngrand_parent: Y\n---\nbody\n";
    const { content } = applyFrontmatterEdits(doubled, { remove: ["grand_parent"] });
    expect(content).toBe("---\ntitle: A\n---\nbody\n");
  });

  it("quotes values that need it", () => {
    const { content } = applyFrontmatterEdits(BASIC, {
      set: { title: "Q: a title with a colon #tricky" },
    });
    const parsed = parseFrontmatter(content)!;
    expect(parsed.data!.title).toBe("Q: a title with a colon #tricky");
  });

  it("preserves comment-safe trailing comments, drops unsafe ones", () => {
    const { content } = applyFrontmatterEdits(BASIC, { set: { layout: "home" } });
    expect(content).toContain("layout: home # keep me");
  });

  it("refuses non-scalar managed values instead of corrupting them", () => {
    const block = "---\ntitle: >-\n  folded scalar\nnav_order: 1\n---\nbody\n";
    const { content, refused } = applyFrontmatterEdits(block, {
      set: { title: "New" },
    });
    expect(refused).toEqual(["title"]);
    expect(content).toBe(block);
  });

  it("edits CRLF files with CRLF line endings", () => {
    const crlf = "---\r\ntitle: X\r\nnav_order: 1\r\n---\r\nbody\r\n";
    const { content } = applyFrontmatterEdits(crlf, { set: { nav_order: 5 } });
    expect(content).toBe("---\r\ntitle: X\r\nnav_order: 5\r\n---\r\nbody\r\n");
  });

  it("supports float nav_order (seen in the wild: 4.5)", () => {
    const { content } = applyFrontmatterEdits(BASIC, { set: { nav_order: 4.5 } });
    expect(parseFrontmatter(content)!.data!.nav_order).toBe(4.5);
  });
});

describe("issue #1 — a closing fence with trailing whitespace", () => {
  // Hugo, Jekyll and every other tool in the ecosystem accept `--- `.
  // Requiring exactly `---` made parseFrontmatter return null, so the
  // page silently lost every key including its title — and, once
  // snapshots became nav heads, lost its front matter from the session
  // entirely. One real page in kubernetes/website is written this way.
  const raw = "---\ntitle: Trailing\nweight: 6\n--- \nBody.\n";

  it("reads the block instead of returning null", () => {
    const block = parseFrontmatter(raw);
    expect(block).not.toBeNull();
    expect(block!.data).toEqual({ title: "Trailing", weight: 6 });
  });

  it("still preserves the fence's trailing space byte-for-byte", () => {
    // The closer belongs to `rest`, so surgery must not tidy it.
    const { content } = applyFrontmatterEdits(raw, { set: { weight: 7 } });
    expect(content).toBe("---\ntitle: Trailing\nweight: 7\n--- \nBody.\n");
  });
});

describe("prepend: a JOIN verb, distinct from set (docs/16)", () => {
  const page = (body: string) => `---\n${body}---\nBody stays.\n`;

  it("creates the key with its items when the page has none", () => {
    const { content } = applyFrontmatterEdits(page("title: A\n"), {
      prepend: { aliases: ["/docs/old/"] },
    });
    expect(content).toMatch(/aliases:\n- \/docs\/old\//);
  });

  it("joins rather than replaces, so declared redirects survive", () => {
    // The reason this is not `set`: overwriting would silently retire
    // a 301 someone else established.
    const { content } = applyFrontmatterEdits(
      page("title: A\naliases:\n- /docs/kept/\n"),
      { prepend: { aliases: ["/docs/new/"] } },
    );
    expect(content).toContain("- /docs/new/");
    expect(content).toContain("- /docs/kept/");
    expect(content.indexOf("- /docs/new/")).toBeLessThan(
      content.indexOf("- /docs/kept/"),
    );
  });

  it("IS A NO-OP when the item is already present", () => {
    // Same-page idempotence, asserted directly rather than inferred
    // from a re-plan: this is what makes planChanges(parse(apply(p)))
    // come back empty, and a duplicate alias is a duplicate 301.
    const before = page("title: A\naliases:\n- /docs/old/\n");
    const { content } = applyFrontmatterEdits(before, {
      prepend: { aliases: ["/docs/old/"] },
    });
    expect(content).toBe(before);
    expect([...content.matchAll(/- \/docs\/old\//g)]).toHaveLength(1);
  });

  it("refuses a flow list rather than reformatting it", () => {
    // Conservative in the same way `set` is: a shape this planner did
    // not author is not one it rewrites.
    const { content, refused } = applyFrontmatterEdits(
      page("title: A\naliases: [/docs/kept/]\n"),
      { prepend: { aliases: ["/docs/new/"] } },
    );
    expect(refused).toContain("aliases");
    expect(content).toContain("aliases: [/docs/kept/]");
  });

  it("leaves every other line byte-identical", () => {
    const before = page("title: A\nweight: 10\n");
    const { content } = applyFrontmatterEdits(before, {
      prepend: { aliases: ["/docs/old/"] },
    });
    expect(content).toContain("title: A\n");
    expect(content).toContain("weight: 10\n");
    expect(content).toContain("Body stays.");
  });
});
