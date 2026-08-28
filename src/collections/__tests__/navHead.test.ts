import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { navHeadOf, spliceNavHead, toNavHeads } from "../navHead";
import { unifiedHunks } from "../diff";

describe("navHeadOf", () => {
  it("ends AT the closing fence, not after its line terminator", () => {
    const content = "---\ntitle: A\n---\nBody starts here.\n";
    expect(navHeadOf(content)).toBe("---\ntitle: A\n---");
  });

  it("is empty for a file with no front matter", () => {
    expect(navHeadOf("# Just a heading\n")).toBe("");
  });

  it("keeps a BOM and CRLF exactly as found", () => {
    const content = "﻿---\r\ntitle: A\r\n---\r\nBody.\r\n";
    expect(navHeadOf(content)).toBe("﻿---\r\ntitle: A\r\n---");
  });

  it("ignores a --- horizontal rule in the body", () => {
    const content = "---\ntitle: A\n---\n\nintro\n\n---\n\nmore\n";
    expect(navHeadOf(content)).toBe("---\ntitle: A\n---");
  });

  it("never ends with a line terminator", () => {
    fc.assert(
      fc.property(fc.array(fc.string({ minLength: 1 })), fc.string(), (keys, body) => {
        const fm = keys.map((k, i) => `k${i}: ${JSON.stringify(k)}`).join("\n");
        const content = `---\n${fm}${fm ? "\n" : ""}---\n${body}`;
        const head = navHeadOf(content);
        expect(head.endsWith("\n")).toBe(false);
        expect(head.endsWith("\r")).toBe(false);
      }),
    );
  });
});

describe("spliceNavHead", () => {
  it("round-trips: splicing a file's own head back is the identity", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { maxLength: 6 }),
        fc.string(),
        fc.constantFrom("\n", "\r\n"),
        fc.constantFrom("", "﻿"),
        (keys, body, eol, bom) => {
          const fm = keys.map((k, i) => `k${i}: ${JSON.stringify(k)}`).join(eol);
          const content = `${bom}---${eol}${fm}${fm ? eol : ""}---${eol}${body}`;
          expect(spliceNavHead(content, navHeadOf(content))).toBe(content);
        },
      ),
    );
  });

  it("preserves every byte after the fence when the head changes", () => {
    const current = "---\ntitle: A\nparent: Old\n---\nBody the app never saw.\n";
    const next = spliceNavHead(current, "---\ntitle: A\nparent: New\n---");
    expect(next).toBe("---\ntitle: A\nparent: New\n---\nBody the app never saw.\n");
  });

  it("inserts front matter into a file that had none, keeping the body", () => {
    const next = spliceNavHead("# Heading\n\ntext\n", "---\ntitle: A\n---");
    expect(next).toBe("---\ntitle: A\n---\n# Heading\n\ntext\n");
  });

  it("is a no-op when both the file and the head lack front matter", () => {
    expect(spliceNavHead("# Heading\n", "")).toBe("# Heading\n");
  });

  it("does not eat a leading blank line from a file that never had front matter", () => {
    // Docusaurus takes nav from the directory tree, so plenty of its docs
    // carry no front matter at all and their nav head is "". Stripping a
    // leading newline here would silently reformat files we never edited.
    expect(spliceNavHead("\n# Heading\n", "")).toBe("\n# Heading\n");
  });

  it("removes front matter when spliced with an empty head", () => {
    expect(spliceNavHead("---\ntitle: A\n---\nBody.\n", "")).toBe("Body.\n");
  });
});

describe("the law: a nav head never claims context it did not read", () => {
  // docs/15. Including the fence's EOL fabricates a trailing blank
  // context line; 41% of kubernetes/website pages start their body
  // immediately after the fence, and every such patch would be refused.
  it("diffs two heads into a hunk whose context all exists in the real file", () => {
    const real = "---\ntitle: B\nparent: Old\n---\nBody immediately.\nMore.\n";
    const before = navHeadOf(real);
    const after = before.replace("Old", "New");
    const hunk = unifiedHunks(before, after).join("\n");
    const realLines = real.split("\n");
    for (const line of hunk.split("\n").slice(1)) {
      if (!line.startsWith(" ")) continue;
      expect(realLines).toContain(line.slice(1));
    }
  });
});

describe("toNavHeads", () => {
  it("slices markdown and leaves config files whole", () => {
    const files = {
      "a.md": "---\ntitle: A\n---\nBody.\n",
      "b.mdx": "---\ntitle: B\n---\nBody.\n",
      "_category_.json": '{\n  "label": "Guides"\n}\n',
      "_config.yml": "title: Site\n",
    };
    expect(toNavHeads(files)).toEqual({
      "a.md": "---\ntitle: A\n---",
      "b.mdx": "---\ntitle: B\n---",
      "_category_.json": '{\n  "label": "Guides"\n}\n',
      "_config.yml": "title: Site\n",
    });
  });

  it("is idempotent — slicing an already-sliced snapshot changes nothing", () => {
    const files = { "a.md": "---\ntitle: A\n---\nBody.\n" };
    const once = toNavHeads(files);
    expect(toNavHeads(once)).toEqual(once);
  });
});

describe("the FSA writer splices onto a BARE page (docs/16 step 8)", () => {
  /**
   * The case that started finding 2: a page with no front matter that
   * gains a weight. The patch writer needs a zero-context hunk for it;
   * this writer needs only to splice, and the body must come through
   * byte for byte. Both writers cover it, which is the point — the
   * differential oracle is only meaningful if each side is asserted
   * against the bytes and not just against the other.
   */
  const bare = "# Bare\n\nNo front matter at all.\n";

  it("inserts the head and leaves the body byte-identical", () => {
    const out = spliceNavHead(bare, "---\nweight: 42\n---");
    expect(out).toBe("---\nweight: 42\n---\n# Bare\n\nNo front matter at all.\n");
    expect(out.endsWith(bare)).toBe(true);
  });

  it("does not disturb a body that itself contains a fence line", () => {
    const fencey = "# F\n\nProse\n\n---\n\nMore.\n";
    const out = spliceNavHead(fencey, "---\ntitle: F\n---");
    expect(out.endsWith(fencey)).toBe(true);
  });

  it("preserves CRLF in the body it did not write", () => {
    const crlf = "# C\r\n\r\nCRLF body.\r\n";
    expect(spliceNavHead(crlf, "---\nweight: 1\n---").endsWith(crlf)).toBe(true);
  });
});
