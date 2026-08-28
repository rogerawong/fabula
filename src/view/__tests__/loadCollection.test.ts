/**
 * Import pipeline: skip rules, prefix stripping, hard caps, GitHub
 * tree-URL parsing + branch probing + raw fetching (all offline —
 * fetch is injected). Folder pickers themselves are browser-only and
 * covered by e2e/manual runs.
 */

import { describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/store";
import { filesOf } from "@/collections/types";
import {
  fetchGitHubFolder,
  ingestible,
  MAX_READ_FILES,
  MAX_TOTAL_BYTES,
  openCollection,
  parseGitHubTreeUrl,
  shouldSkipPath,
  snapshotFromCandidates,
  stripCommonPrefix,
  type IngestCandidate,
} from "../loadCollection";

const text = (path: string, content: string, size?: number): IngestCandidate => ({
  path,
  size: size ?? content.length,
  read: () => Promise.resolve(content),
});

describe("skip + prefix rules", () => {
  it("skips build dirs and dot-dirs anywhere in the path", () => {
    expect(shouldSkipPath(".git/config")).toBe(true);
    expect(shouldSkipPath("docs/node_modules/x/readme.md")).toBe(true);
    expect(shouldSkipPath("docs/_site/index.md")).toBe(true);
    expect(shouldSkipPath("docs/.vitepress/config.md")).toBe(true);
    expect(shouldSkipPath("docs/guide/intro.md")).toBe(false);
  });

  it("ingests what any collection adapter wants", () => {
    expect(ingestible("docs/a.md")).toBe(true);
    expect(ingestible("docs/a.mdx")).toBe(true);
    expect(ingestible("docs/_category_.json")).toBe(true);
    expect(ingestible("_config.yml")).toBe(true);
    expect(ingestible("logo.png")).toBe(false);
  });

  it("strips the common directory prefix (webkitdirectory shape)", () => {
    const rel = stripCommonPrefix(["my-docs/intro.md", "my-docs/guides/a.md"]);
    expect(rel("my-docs/intro.md")).toBe("intro.md");
    expect(rel("my-docs/guides/a.md")).toBe("guides/a.md");
    const noop = stripCommonPrefix(["a/x.md", "b/y.md"]);
    expect(noop("a/x.md")).toBe("a/x.md");
  });
});

describe("snapshotFromCandidates", () => {
  it("filters, reads, and strips", async () => {
    const files = await snapshotFromCandidates([
      text("site/docs/intro.md", "INTRO"),
      text("site/docs/logo.png", "PNG"),
      text("site/docs/.git/HEAD", "ref"),
      text("site/docs/guides/a.md", "A"),
    ]);
    expect(files).toEqual({ "intro.md": "INTRO", "guides/a.md": "A" });
  });

  it("refuses an import with nothing to read", async () => {
    await expect(snapshotFromCandidates([text("x.png", "p")])).rejects.toThrow(
      /No documentation files/,
    );
  });

  it("guards the SCAN with the read budget, not the storage caps", async () => {
    // The read budget exists because a graph walk can touch far more than
    // it keeps; its message is about scanning, not storage (docs/12).
    const many = Array.from({ length: MAX_READ_FILES + 1 }, (_, i) =>
      text(`docs/f${i}.md`, "x"),
    );
    await expect(snapshotFromCandidates(many)).rejects.toThrow(/too many files to scan/i);
  });
});

describe("the storage cap applies to what is KEPT", () => {
  // One cap, on bytes. The FILE-COUNT cap was removed in docs/15 rather
  // than resized: it was never a second guard, only this one counted
  // twice, and no per-entry cost was ever measured to justify it.
  const jtdFiles = (n: number, body = "x") => {
    const files: Record<string, string> = {};
    for (let i = 0; i < n; i++) {
      files[`f${i}.md`] = `---\ntitle: T${i}\nnav_order: ${i}\n---\n${body}\n`;
    }
    return files;
  };

  // HEAVY, NOT SLOW (builds a multi-megabyte snapshot). Timed out under machine load at the
  // default 5s while passing in ~0.7s idle; the control group was a
  // clean tree failing identically, so the cause is contention, not a
  // regression. The explicit budget keeps that diagnosis from having to
  // be re-derived from a red suite.
  it("refuses a kept set over the byte cap", { timeout: 20000 }, () => {
    // The bytes must be in the NAV to count — a cap on what localStorage
    // holds, and bodies are no longer held. A 4 MB front-matter value is
    // absurd, which is the point: that is what it now takes to trip it.
    const heavy: Record<string, string> = {};
    for (let i = 0; i < 4; i++) {
      heavy[`f${i}.md`] =
        `---\ntitle: T${i}\nnav_order: ${i}\nblob: ${"y".repeat(1024 * 1024)}\n---\nbody\n`;
    }
    expect(() => openCollection(heavy, "Heavy")).toThrow(/MB/);
  });

  // HEAVY, NOT SLOW (parses 4,000 pages). Timed out under machine load at the
  // default 5s while passing in ~0.7s idle; the control group was a
  // clean tree failing identically, so the cause is contention, not a
  // regression. The explicit budget keeps that diagnosis from having to
  // be re-derived from a red suite.
  it(
    "no longer refuses on FILE COUNT — 4,000 pages import (docs/15)",
    { timeout: 20000 },
    () => {
      // The count cap is gone, not raised. This is eight times the number
      // that used to be refused outright, and it is well inside the byte
      // cap because pages are kept as nav heads.
      expect(() => openCollection(jtdFiles(4000), "Huge")).not.toThrow();
    },
  );

  // HEAVY, NOT SLOW (parses 1,672 pages, now with a link harvest over
  // every body — docs/16 step 2 added ~20% to parse). Measured at 422ms
  // in isolation; it times out at the default 5s only under whole-suite
  // parallelism on a loaded machine. Same diagnosis and same remedy as
  // the two budgets above.
  it(
    "ACCEPTANCE: a kubernetes/website-sized site fits (1,672 pages)",
    { timeout: 20000 },
    () => {
      // docs/15's headline. Whole-file ownership needed 14.79 MB for this
      // and was refused twice over; nav heads keep ~446 KB. The bodies here
      // are deliberately fat — they are exactly what must NOT be counted.
      const files = jtdFiles(1672, "z".repeat(9 * 1024));
      expect(Object.values(files).reduce((n, c) => n + c.length, 0)).toBeGreaterThan(
        14 * 1024 * 1024,
      );
      let tabId = "";
      expect(() => {
        tabId = openCollection(files, "k8s-sized").tabId;
      }).not.toThrow();
      const kept = filesOf(
        useAppStore.getState().tabs.find((t) => t.id === tabId)!.editor.document,
      );
      expect(Object.keys(kept)).toHaveLength(1672);
      const keptBytes = Object.values(kept).reduce((n, c) => n + c.length, 0);
      expect(keptBytes).toBeLessThan(MAX_TOTAL_BYTES);
    },
  );

  it("allows a kept set inside the cap", () => {
    expect(() => openCollection(jtdFiles(3), "Small")).not.toThrow();
  });
});

describe("openCollection format override", () => {
  // JTD-shaped frontmatter: detection would pick jtd — the override
  // (the Format dropdown) must win
  const FILES = {
    "a.md": "---\ntitle: Alpha\nnav_order: 1\n---\nA\n",
    "sub/b.md": "---\ntitle: Beta\nparent: Alpha\n---\nB\n",
  };

  it("auto-detects without an override, honors one when given", () => {
    const auto = openCollection(FILES, "Auto");
    expect(
      useAppStore.getState().tabs.find((t) => t.id === auto.tabId)!.editor.document
        .formatId,
    ).toBe("jtd");

    const forced = openCollection(FILES, "Forced", "docusaurus");
    expect(
      useAppStore.getState().tabs.find((t) => t.id === forced.tabId)!.editor.document
        .formatId,
    ).toBe("docusaurus");

    expect(() => openCollection(FILES, "X", "not-an-adapter")).toThrow(/Format dropdown/);
  });
});

describe("GitHub tree URLs", () => {
  it("parses /tree/ URLs and rejects others", () => {
    expect(
      parseGitHubTreeUrl("https://github.com/just-the-docs/just-the-docs/tree/main/docs"),
    ).toEqual({ owner: "just-the-docs", repo: "just-the-docs", rest: "main/docs" });
    expect(parseGitHubTreeUrl("https://github.com/o/r/tree/main/")).toEqual({
      owner: "o",
      repo: "r",
      rest: "main",
    });
    expect(parseGitHubTreeUrl("https://github.com/o/r/blob/main/toc.yml")).toBeNull();
    expect(parseGitHubTreeUrl("https://example.com/o/r/tree/main")).toBeNull();
  });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  it("resolves branches containing slashes by probing, then fetches raws", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://api.github.com/repos/o/r") {
        return json({ default_branch: "main" });
      }
      if (url.includes("/git/trees/release?")) return json({ message: "nf" }, 404);
      if (url.includes("/git/trees/release%2F2.0?")) {
        return json({
          truncated: false,
          tree: [
            { path: "docs/index.md", type: "blob", size: 10 },
            { path: "docs/sub/page.md", type: "blob", size: 10 },
            { path: "docs/logo.png", type: "blob", size: 10 },
            { path: "src/main.ts", type: "blob", size: 10 },
            { path: "docs/sub", type: "tree" },
          ],
        });
      }
      if (url.startsWith("https://raw.githubusercontent.com/o/r/release/2.0/")) {
        return new Response(`content of ${url.split("release/2.0/")[1]}`);
      }
      return json({ message: "unexpected" }, 500);
    }) as unknown as typeof fetch;

    const { files, rootName } = await fetchGitHubFolder(
      "https://github.com/o/r/tree/release/2.0/docs",
      fetchImpl,
    );
    expect(rootName).toBe("docs");
    expect(Object.keys(files).sort()).toEqual(["index.md", "sub/page.md"]);
    expect(files["index.md"]).toContain("docs/index.md");
    // probed release (404) then release/2.0 (hit) — ≤3 tree calls
    expect(calls.filter((u) => u.includes("/git/trees/")).length).toBe(2);
  });

  it("surfaces the rate-limit case specifically", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response("{}", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      });
    }) as unknown as typeof fetch;
    await expect(
      fetchGitHubFolder("https://github.com/o/r/tree/main/docs", fetchImpl),
    ).rejects.toThrow(/rate limit/);
  });

  it("refuses truncated trees with guidance", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.github.com/repos/o/r") {
        return json({ default_branch: "main" });
      }
      return json({ truncated: true, tree: [] });
    }) as unknown as typeof fetch;
    await expect(
      fetchGitHubFolder("https://github.com/o/r/tree/main/docs", fetchImpl),
    ).rejects.toThrow(/local clone/);
  });
});

describe("graph-driven ingest (expand)", () => {
  const CONF = 'master_doc = "index"\nsource_suffix = ".rst"\n';
  const ROOT = "Docs\n====\n\n.. toctree::\n   :caption: G\n\n   guide/index\n";
  const GUIDE = "Guide\n=====\n\n.. toctree::\n\n   install\n";

  /** A candidate that records how it was read, and how many times. */
  const rst = (path: string, content: string) => {
    const reads: string[] = [];
    return {
      reads,
      candidate: {
        path,
        size: content.length,
        read: () => {
          reads.push("full");
          return Promise.resolve(content);
        },
      } satisfies IngestCandidate,
    };
  };

  it("reads only what the toctree graph reaches", async () => {
    const unreachable = rst("orphan.rst", "Orphan\n======\n");
    const files = await snapshotFromCandidates([
      rst("conf.py", CONF).candidate,
      rst("index.rst", ROOT).candidate,
      rst("guide/index.rst", GUIDE).candidate,
      rst("guide/install.rst", "Installing\n==========\n").candidate,
      unreachable.candidate,
    ]);
    expect(Object.keys(files)).toContain("guide/install.rst");
    // Never referenced by any toctree, so the walk never asks for it.
    expect(Object.keys(files)).not.toContain("orphan.rst");
    expect(unreachable.reads).toEqual([]);
  });

  it("reads every reachable file once, in full", async () => {
    // Windowed reads were removed: a head window is a host CLASSIFIER, and
    // a classification miss is silent subtree loss with no invariant to
    // catch it — entry conservation guards plans, not ingest.
    const leaf = rst("guide/install.rst", "Installing\n==========\n");
    const host = rst("guide/index.rst", GUIDE);
    await snapshotFromCandidates([
      rst("conf.py", CONF).candidate,
      rst("index.rst", ROOT).candidate,
      host.candidate,
      leaf.candidate,
    ]);
    expect(leaf.reads).toEqual(["full"]);
    expect(host.reads).toEqual(["full"]);
  });

  it("terminates on a cyclic toctree graph", async () => {
    const a = "A\n=\n\n.. toctree::\n\n   b\n";
    const b = "B\n=\n\n.. toctree::\n\n   a\n";
    const files = await snapshotFromCandidates([
      rst("conf.py", 'master_doc = "a"\n').candidate,
      rst("index.rst", "Idx\n===\n").candidate,
      rst("a.rst", a).candidate,
      rst("b.rst", b).candidate,
    ]);
    expect(Object.keys(files)).toContain("a.rst");
    expect(Object.keys(files)).toContain("b.rst");
  });

  it("leaves non-graph adapters on the original path", async () => {
    const files = await snapshotFromCandidates([
      text("docs/a.md", "---\ntitle: A\n---\n"),
      text("docs/b.md", "---\ntitle: B\n---\n"),
    ]);
    expect(Object.keys(files).sort()).toEqual(["a.md", "b.md"]);
  });
});
