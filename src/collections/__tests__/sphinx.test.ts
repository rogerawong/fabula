/**
 * Sphinx adapter, phase 1 (docs/12): read-only. Detection, the
 * graph-driven expand loop, and parse.
 *
 * Behavioural cases use inline snapshots so each one states its whole
 * world; the vendored godot-docs slice covers the real shapes and the
 * dangling-entry path, since the slice deliberately references documents
 * it does not include.
 */

import { describe, expect, it } from "vitest";
import { ATOMIC_ENTRY_THRESHOLD, sphinxAdapter } from "../adapters/sphinx";
import { readTitles, SIDECAR_KEY } from "../titleSidecar";
import type { FilesSnapshot } from "../types";
import type { Topic } from "@/model/types";

const CONF = 'master_doc = "index"\nsource_suffix = ".rst"\n';

/** A minimal, self-consistent Sphinx project. */
const mini: FilesSnapshot = {
  "conf.py": CONF,
  "index.rst": [
    "Docs",
    "====",
    "",
    ".. toctree::",
    "   :maxdepth: 1",
    "   :caption: Guide",
    "",
    "   guide/index",
    "",
    ".. toctree::",
    "   :maxdepth: 1",
    "   :caption: About",
    "",
    "   about",
    "",
  ].join("\n"),
  "guide/index.rst": [
    "Guide",
    "=====",
    "",
    ".. toctree::",
    "    :maxdepth: 1",
    "",
    "    install",
    "    usage",
    "",
  ].join("\n"),
  "guide/install.rst": "Installing\n==========\n\nbody\n",
  "guide/usage.rst": "Using It\n========\n\nbody\n",
  "about.rst": "About Us\n========\n\nbody\n",
};

const titles = (topics: Topic[]): string[] => topics.map((t) => t.title);

describe("identity and capabilities", () => {
  it("writes back, and still records no rename", () => {
    // OPTIONALITY IS THE CAPABILITY, which is why this test changed the
    // moment `planChanges` was defined rather than at some later flag
    // flip: `supportsWriteBack` reads the method's PRESENCE, so there is
    // no second place to keep in step. docs/19 sequences the flip at its
    // step 6 and the mechanism does not permit that — defining the
    // planner IS the flip, and the copy sweep is owed with it.
    expect(sphinxAdapter.planChanges).toBeDefined();
    // Renames stay refused: they have no serialization yet, and
    // `supportsRename` keeps them away from a planner that could not
    // express them (docs/12, decision 5).
    expect(sphinxAdapter.supportsRename).toEqual({ sections: false, topics: false });
  });

  it("ingests reStructuredText sources and conf.py, and NOT markdown", () => {
    expect(sphinxAdapter.ingests("index.rst")).toBe(true);
    expect(sphinxAdapter.ingests("guide/install.rst")).toBe(true);
    expect(sphinxAdapter.ingests("conf.py")).toBe(true);
    expect(sphinxAdapter.ingests("docs/conf.py")).toBe(true);
    expect(sphinxAdapter.ingests("setup.py")).toBe(false);
    // MARKDOWN IS CONFIG-KEYED, so it is not claimed by a per-path
    // predicate that cannot see `conf.py`. Claiming it here would read
    // every markdown file in every reStructuredText project on the chance
    // that one of them is MyST.
    expect(sphinxAdapter.ingests("README.md")).toBe(false);
  });

  it("ASKS FOR the root document under every configured suffix", () => {
    // The complement, and the reason the widening was tempting: a project
    // declaring `.md` first has its root at `index.md`, and asking only
    // for `.rst` reported the root absent when it was right there.
    // `expand` sees the config, so this is where the question belongs.
    const wanted = sphinxAdapter.expand!({
      "conf.py": 'master_doc = "index"\nsource_suffix = [".md", ".rst"]\n',
    });
    expect(wanted).toContain("index.md");
    expect(wanted).toContain("index.rst");
  });

  it("resolves a document under a NON-FIRST configured suffix", () => {
    const mixed: FilesSnapshot = {
      "conf.py": 'master_doc = "index"\nsource_suffix = [".rst", ".md"]\n',
      "index.rst": "Docs\n====\n\n.. toctree::\n\n   notes\n",
      "notes.md": "# Field Notes\n",
    };
    const { doc } = sphinxAdapter.parse(mixed, "t");
    const row = doc.sections[0]!.topics[0]!;
    expect(row.path).toBe("notes");
    // Found, so not a `missing` placeholder — which is what the
    // single-suffix lookup produced for every markdown document.
    expect(row.lock).toBeUndefined();
  });

  it("keeps markdown OUT of the kept set — read, then discarded", () => {
    // The half that did not change, asserted because widening a read set
    // silently widening a WRITE set is the direction that would hurt.
    const { doc } = sphinxAdapter.parse({ ...mini, "notes.md": "# Notes\n" }, "t");
    const kept = (doc.extras as { files: FilesSnapshot }).files;
    expect(Object.keys(kept)).not.toContain("notes.md");
  });
});

describe("detect", () => {
  it("claims a snapshot with conf.py and a toctree-bearing root", () => {
    expect(sphinxAdapter.detect(mini)).toBeGreaterThan(0.5);
  });

  it("does not claim a folder of markdown with frontmatter", () => {
    expect(
      sphinxAdapter.detect({ "index.md": "---\nnav_order: 1\n---\n# Hi\n" }),
    ).toBeLessThan(0.3);
  });

  it("does not claim reStructuredText with no conf.py and no toctree", () => {
    expect(sphinxAdapter.detect({ "readme.rst": "Hello\n=====\n" })).toBeLessThan(0.3);
  });
});

describe("expand — the graph-driven ingest loop", () => {
  it("asks for the seed when nothing has been read", () => {
    const seed = sphinxAdapter.expand!({});
    expect(seed).toContain("conf.py");
    expect(seed).toContain("index.rst");
  });

  it("follows toctree entries it has not read yet", () => {
    const partial = { "conf.py": CONF, "index.rst": mini["index.rst"]! };
    const reqs = sphinxAdapter.expand!(partial);
    expect(reqs).toContain("guide/index.rst");
    expect(reqs).toContain("about.rst");
  });

  it("reaches a fixpoint once everything is read", () => {
    // Termination is the driver's job, but expand must stop naming NEW
    // paths or the loop would never settle.
    const reqs = sphinxAdapter.expand!(mini);
    expect(reqs.filter((p) => mini[p] === undefined)).toEqual([]);
  });

  it("carries the entry count onto the atomic node", () => {
    // Without the count the row renders as a childless leaf, which reads
    // as empty rather than big — the misread this whole state exists for.
    const big = Array.from({ length: ATOMIC_ENTRY_THRESHOLD + 7 }, (_, i) => `p${i}`);
    const files: FilesSnapshot = {
      "conf.py": CONF,
      "index.rst": "Docs\n====\n\n.. toctree::\n   :caption: Ref\n\n   gen/index\n",
      "gen/index.rst": `Generated\n=========\n\n.. toctree::\n\n${big
        .map((b) => `   ${b}`)
        .join("\n")}\n`,
    };
    const { doc } = sphinxAdapter.parse(files, "Big");
    const node = doc.sections[0]!.topics[0]!;
    expect(node.lock).toEqual({ kind: "atomic", count: ATOMIC_ENTRY_THRESHOLD + 7 });
    expect(node.children).toEqual([]);
  });

  it("does not descend into a host past the atomic threshold", () => {
    const big = Array.from({ length: ATOMIC_ENTRY_THRESHOLD + 1 }, (_, i) => `gen/p${i}`);
    const files: FilesSnapshot = {
      "conf.py": CONF,
      "index.rst": "Docs\n====\n\n.. toctree::\n\n   gen/index\n",
      "gen/index.rst": `Generated\n=========\n\n.. toctree::\n\n${big
        .map((b) => `   ${b.slice(4)}`)
        .join("\n")}\n`,
    };
    const reqs = sphinxAdapter.expand!(files);
    expect(reqs.some((p) => p.startsWith("gen/p"))).toBe(false);
  });
});

describe("parse — structure", () => {
  const { doc } = sphinxAdapter.parse(mini, "Mini");

  it("makes one section per root-level toctree block, captions as titles", () => {
    expect(doc.sections.map((s) => s.title)).toEqual(["Guide", "About"]);
  });

  it("grafts a target's own toctree in as that entry's children", () => {
    const guide = doc.sections[0]!.topics[0]!;
    expect(guide.title).toBe("Guide");
    expect(titles(guide.children)).toEqual(["Installing", "Using It"]);
  });

  it("labels entries with the target document's H1, not its path", () => {
    expect(doc.sections[1]!.topics[0]!.title).toBe("About Us");
  });

  it("records the docname as the topic path", () => {
    expect(doc.sections[1]!.topics[0]!.path).toBe("about");
  });

  it("preserves the format id so the tab routes back here", () => {
    expect(doc.formatId).toBe("sphinx");
  });
});

describe("parse — a toctree far into a long file", () => {
  // The regression guard for windowed reads: any bounded prefix is a host
  // CLASSIFIER, and missing the marker drops the whole subtree with no
  // invariant to catch it. Reads are full, so file position cannot matter.
  const preamble = "filler paragraph.\n\n".repeat(3000); // ~60 KB
  const late: FilesSnapshot = {
    "conf.py": CONF,
    "index.rst": "Docs\n====\n\n.. toctree::\n   :caption: G\n\n   deep\n",
    "deep.rst": `Deep\n====\n\n${preamble}.. toctree::\n\n   deep/leaf\n`,
    "deep/leaf.rst": "Leaf\n====\n",
  };

  it("still finds the host and grafts its subtree", () => {
    expect(late["deep.rst"]!.indexOf(".. toctree::")).toBeGreaterThan(50_000);
    const { doc } = sphinxAdapter.parse(late, "Late");
    const deep = doc.sections[0]!.topics[0]!;
    expect(titles(deep.children)).toEqual(["Leaf"]);
  });

  it("asks to read it, wherever its marker sits", () => {
    const partial = { "conf.py": CONF, "index.rst": late["index.rst"]! };
    expect(sphinxAdapter.expand!(partial)).toContain("deep.rst");
  });
});

describe("parse — what is kept", () => {
  const { doc } = sphinxAdapter.parse(mini, "Mini");
  const kept = (doc.extras as { files: FilesSnapshot }).files;

  it("keeps the nav hosts and conf.py but drops title-only sources", () => {
    expect(Object.keys(kept)).toContain("index.rst");
    expect(Object.keys(kept)).toContain("guide/index.rst");
    expect(Object.keys(kept)).toContain("conf.py");
    expect(Object.keys(kept)).not.toContain("guide/install.rst");
    expect(Object.keys(kept)).not.toContain("about.rst");
  });

  it("keeps the titles of the dropped sources in the sidecar", () => {
    expect(readTitles(kept)).toMatchObject({
      about: "About Us",
      "guide/install": "Installing",
      "guide/usage": "Using It",
    });
  });

  it("re-parses to the same titles from the kept snapshot alone", () => {
    // The load-bearing property: simulatePlan re-parses extras.files, so
    // a title the kept snapshot cannot reproduce fails every future plan.
    const again = sphinxAdapter.parse(kept, "Mini").doc;
    expect(again.sections[1]!.topics[0]!.title).toBe("About Us");
    expect(titles(again.sections[0]!.topics[0]!.children)).toEqual([
      "Installing",
      "Using It",
    ]);
  });
});

describe("parse — duplicate references", () => {
  const dup: FilesSnapshot = {
    "conf.py": CONF,
    "index.rst": [
      "Docs",
      "====",
      "",
      ".. toctree::",
      "   :caption: One",
      "",
      "   shared",
      "",
      ".. toctree::",
      "   :caption: Two",
      "",
      "   shared",
      "",
    ].join("\n"),
    "shared.rst": "Shared\n======\n",
  };
  const { doc, warnings, evidence = [] } = sphinxAdapter.parse(dup, "Dup");

  it("places the first occurrence as an ordinary movable topic", () => {
    const first = doc.sections[0]!.topics[0]!;
    expect(first.title).toBe("Shared");
    expect(first.lock).toBeUndefined();
  });

  it("pins every later occurrence", () => {
    const second = doc.sections[1]!.topics[0]!;
    expect(second.path).toBe("shared");
    expect(second.lock).toEqual({ kind: "reference", owner: "One" });
  });

  it("reports it as EVIDENCE, not as a warning [corrected 2026-08-17]", () => {
    // A docname listed twice is what the import SAW. It cannot make a
    // read-only result unsound, so it does not belong on the array whose
    // `blocking` field gates saving (docs/17). It rode there because the
    // evidence channel did not exist when this adapter was written.
    expect(warnings).toEqual([]);
    const seen = evidence.filter((e) => e.kind === "duplicate-reference");
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]!.detail).toContain("shared");
  });
});

describe("parse — locked kinds", () => {
  const locked: FilesSnapshot = {
    "conf.py": CONF,
    "index.rst": [
      "Docs",
      "====",
      "",
      ".. toctree::",
      "   :caption: Mixed",
      "",
      "   Godot <https://godotengine.org>",
      "   self",
      "   real",
      "",
      ".. toctree::",
      "   :glob:",
      "   :caption: Globbed",
      "",
      "   gen/*",
      "",
    ].join("\n"),
    "real.rst": "Real\n====\n",
  };
  const { doc } = sphinxAdapter.parse(locked, "Locked");

  it("locks external, self and glob entries but not plain docs", () => {
    const mixed = doc.sections[0]!.topics;
    expect(mixed.map((t) => t.lock?.kind)).toEqual(["external", "reference", undefined]);
    expect(doc.sections[1]!.topics.every((t) => t.lock?.kind === "pattern")).toBe(true);
  });
});

describe("parse — a dangling entry never throws", () => {
  const broken: FilesSnapshot = {
    "conf.py": CONF,
    "index.rst": "Docs\n====\n\n.. toctree::\n   :caption: G\n\n   missing/page\n",
  };

  it("renders the entry as a broken node and warns", () => {
    const { doc, warnings, evidence = [] } = sphinxAdapter.parse(broken, "Broken");
    const node = doc.sections[0]!.topics[0]!;
    expect(node.path).toBe("missing/page");
    expect(node.lock).toEqual({ kind: "missing" });
    expect(warnings).toEqual([]);
    expect(evidence.some((e) => e.kind === "missing-document")).toBe(true);
  });
});

describe("parse — the vendored godot-docs slice", () => {
  const raw = import.meta.glob("./fixtures/sphinx/**/*.{rst,py}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const corpus: FilesSnapshot = {};
  for (const [key, content] of Object.entries(raw)) {
    if (key.includes("/synthetic-")) continue;
    corpus[key.replace("./fixtures/sphinx/", "")] = content;
  }

  const { doc, warnings, evidence = [] } = sphinxAdapter.parse(corpus, "Godot");

  it("builds the six sidebar groups from the root index captions", () => {
    expect(doc.sections.map((s) => s.title)).toEqual([
      "About",
      "Getting started",
      "Manual",
      "Engine details",
      "Community",
      "Class reference",
    ]);
  });

  it("titles a vendored entry from its real H1", () => {
    const about = doc.sections[0]!.topics[0]!;
    expect(about.path).toBe("about/introduction");
    expect(about.title).toBe("Introduction");
  });

  it("grafts the 4-space-indented tutorials/io subtree", () => {
    // The slice reaches tutorials/io/index via tutorials/index, which is
    // :orphan: and therefore NOT reachable — so io arrives only if the
    // walk handles the vendored shape it actually has.
    const found: Topic[] = [];
    const walk = (t: Topic) => {
      found.push(t);
      t.children.forEach(walk);
    };
    doc.sections.forEach((s) => s.topics.forEach(walk));
    expect(found.some((t) => t.path === "tutorials/2d/index")).toBe(true);
  });

  it("reports the documents the slice does not vendor, without throwing", () => {
    expect(evidence.some((e) => e.kind === "missing-document")).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("COUNTS them, rather than burying the number in a sentence", () => {
    // The gain from the channel move: one occurrence per subject, so
    // `groupIntoEvidence` sums a real count and keeps the first detail.
    // The old single warning said "a, b, c and 42 more" with the number
    // inside the prose, which no surface could total.
    const missing = evidence.filter((e) => e.kind === "missing-document");
    expect(missing.length).toBeGreaterThan(1);
    expect(missing[0]!.detail).toMatch(/more|not present/);
  });

  it("never keeps a synthetic key outside the sidecar", () => {
    const kept = (doc.extras as { files: FilesSnapshot }).files;
    const synthetic = Object.keys(kept).filter((k) => k.includes("\u0000"));
    expect(synthetic).toEqual([SIDECAR_KEY]);
  });
});

describe("entries that write the source suffix (the CPython shape)", () => {
  // Sphinx strips a configured suffix before resolving —
  // `TocTree.parse_content`, "# remove suffixes (backwards
  // compatibility)". CPython writes it on 526 of 526 entries, so a
  // resolver that keeps it looked for `library/index.rst.rst`, found
  // nothing, and rendered the entire corpus as `missing` rows titled
  // "Index.Rst". Populated, confident and wrong — which is worse than
  // refusing, and it is what this fixes.
  // Root doc `contents`, as CPython declares it — the shape matters,
  // because the walk starts there.
  const CPY_CONF = 'root_doc = "contents"\nsource_suffix = ".rst"\n';
  const suffixed: FilesSnapshot = {
    "conf.py": CPY_CONF,
    "contents.rst": [
      "Contents",
      "========",
      "",
      ".. toctree::",
      "",
      "   library/index.rst",
      "   glossary.rst",
      "",
    ].join("\n"),
    "library/index.rst": "The Library\n===========\n",
    "glossary.rst": "Glossary\n========\n",
  };

  it("resolves them to real documents instead of missing rows", () => {
    const { doc } = sphinxAdapter.parse(suffixed, "cpy");
    const rows = doc.sections.flatMap((s) => s.topics);
    expect(rows.map((t) => t.title)).toEqual(["The Library", "Glossary"]);
    expect(rows.filter((t) => t.lock?.kind === "missing")).toEqual([]);
  });

  it("reads source_suffix in its DICT form, which the kernel uses", () => {
    // Three legal shapes; the scalar-only regex saw one. The kernel
    // declares the dict and fell through to the default — right by
    // luck, and wrong for any project declaring a different suffix.
    const files = {
      ...suffixed,
      "conf.py": 'root_doc = "contents"\nsource_suffix = {".rst": "restructuredtext"}\n',
    };
    const rows = sphinxAdapter.parse(files, "cpy").doc.sections.flatMap((s) => s.topics);
    expect(rows.filter((t) => t.lock?.kind === "missing")).toEqual([]);
  });

  it("falls back to Sphinx's default when the value is not a literal", () => {
    // `source_suffix = SUFFIXES` — computed at runtime, and conf.py is
    // never executed (docs/12). Falling back to `.rst` is the SAFE
    // direction: a wrong-but-common default shows the corpus, while a
    // wrong-and-invented suffix shows nothing at all.
    const files = {
      ...suffixed,
      "conf.py": 'root_doc = "contents"\nSUF = ".rst"\nsource_suffix = SUF\n',
    };
    const rows = sphinxAdapter.parse(files, "cpy").doc.sections.flatMap((s) => s.topics);
    expect(rows.map((t) => t.title)).toEqual(["The Library", "Glossary"]);
  });

  it("does not read a suffix out of a COMMENT", () => {
    // The regex-shaped read's one reachable break, fixed and pinned.
    // With the comment's token taken as the suffix, the root document
    // was looked for at `contents.md`, found nothing, and the import
    // produced an EMPTY DOCUMENT with no warning — a silent nothing,
    // which is the direction this project refuses.
    const files = {
      ...suffixed,
      "conf.py": 'root_doc = "contents"\nsource_suffix = SUFFIXES  # e.g. ".md"\n',
    };
    const { doc } = sphinxAdapter.parse(files, "cpy");
    const rows = doc.sections.flatMap((s) => s.topics);
    expect(rows.map((t) => t.title)).toEqual(["The Library", "Glossary"]);
  });

  it("reads a MULTILINE list or dict, which is how real conf.py files write them", () => {
    // DISCRIMINATING on purpose: `.txt` FIRST, so falling back to `.rst`
    // gives the WRONG answer. The first version of this test led with
    // `.rst` and passed whether or not the multiline value was read at
    // all — which is precisely how the kernel's multiline dict went
    // unread while looking fine, for a whole session. A fixture that
    // agrees with the fallback tests nothing.
    for (const value of [
      '[\n    ".txt",\n    ".rst",\n]',
      '{\n    ".txt": "t",\n    ".rst": "restructuredtext",\n}',
    ]) {
      const files = {
        ...suffixed,
        "conf.py": `root_doc = "contents"\nsource_suffix = ${value}\n`,
      };
      const { doc, evidence = [] } = sphinxAdapter.parse(files, "cpy");
      const rows = doc.sections.flatMap((s) => s.topics);
      expect(rows.filter((t) => t.lock?.kind === "missing")).toEqual([]);
      // And the shape was RECOGNISED — a fallback would say so.
      expect(evidence.filter((e) => e.kind === "config-shape-unrecognised")).toEqual([]);
    }
  });

  it("reads source_suffix in its LIST form", () => {
    const files = {
      ...suffixed,
      "conf.py": 'root_doc = "contents"\nsource_suffix = [".rst", ".txt"]\n',
    };
    const rows = sphinxAdapter.parse(files, "cpy").doc.sections.flatMap((s) => s.topics);
    expect(rows.filter((t) => t.lock?.kind === "missing")).toEqual([]);
  });

  it("THE COMPLEMENT: a suffixless corpus is untouched", () => {
    // godot writes no suffixes. The fix must not disturb the shape the
    // adapter was built against — asserted, not assumed, because a
    // stripper that over-fires would eat a real trailing segment.
    const { doc } = sphinxAdapter.parse(mini, "mini");
    expect(
      doc.sections.flatMap((s) => s.topics).filter((t) => t.lock?.kind === "missing"),
    ).toEqual([]);
  });

  it("does not strip a suffix that is not at the END of the name", () => {
    const files: FilesSnapshot = {
      "conf.py": CONF,
      "index.rst": ".. toctree::\n\n   guides/rst.tips\n",
      "guides/rst.tips.rst": "Tips\n====\n",
    };
    const rows = sphinxAdapter.parse(files, "x").doc.sections.flatMap((s) => s.topics);
    expect(rows.map((t) => t.title)).toEqual(["Tips"]);
  });
});

describe("a config shape we cannot read says so, even when the guess is right", () => {
  // CORRECT BY COINCIDENCE. Two real corpora fell back to Sphinx's
  // default and got the right answer anyway — the kernel's multiline
  // dict `source_suffix` and ansible's chained `root_doc = master_doc =
  // 'index'`. Both looked fine, and neither was read. The rule the
  // second one earned: report the unrecognised SHAPE, not the wrong
  // ANSWER, because there is no wrong answer to notice until a project
  // declares something the default does not match.
  const base: FilesSnapshot = {
    "contents.rst": ".. toctree::\n\n   library/index\n",
    "library/index.rst": "The Library\n===========\n",
  };

  it("reports source_suffix declared in a form it cannot read", () => {
    const files = {
      ...base,
      "conf.py": 'root_doc = "contents"\nsource_suffix = SUFFIXES\n',
    };
    const { doc, evidence = [] } = sphinxAdapter.parse(files, "x");
    // The fallback is RIGHT here — the corpus is `.rst` — and it still says so.
    expect(doc.sections.flatMap((s) => s.topics).map((t) => t.title)).toEqual([
      "The Library",
    ]);
    const said = evidence.find((e) => e.kind === "config-shape-unrecognised");
    expect(said?.detail).toMatch(/source_suffix/);
  });

  it("stays quiet when it read the shape", () => {
    const files = {
      ...base,
      "conf.py": 'root_doc = "contents"\nsource_suffix = ".rst"\n',
    };
    const { evidence = [] } = sphinxAdapter.parse(files, "x");
    expect(evidence.filter((e) => e.kind === "config-shape-unrecognised")).toEqual([]);
  });

  it("reads a CHAINED assignment, which is how ansible declares its root", () => {
    // `root_doc = master_doc = 'index'` — idiomatic where a project
    // supports two Sphinx majors. Read, so no evidence line.
    const files = {
      ...base,
      "conf.py": "root_doc = master_doc = 'contents'\nsource_suffix = '.rst'\n",
    };
    const { doc, evidence = [] } = sphinxAdapter.parse(files, "x");
    expect(doc.sections.flatMap((s) => s.topics).map((t) => t.title)).toEqual([
      "The Library",
    ]);
    expect(evidence.filter((e) => e.kind === "config-shape-unrecognised")).toEqual([]);
  });
});

describe("a declared root document that is not there", () => {
  // ANSIBLE. `root_doc = master_doc = 'index'` and no `index.rst`
  // anywhere, because its Makefile symlinks one at build time and picks
  // WHICH one by the doc set being built:
  //   Makefile:69  ln -sf ../rst/ansible_index.rst rst/index.rst
  //   Makefile:75  ln -sf ../rst/core_index.rst   rst/index.rst
  // Producing no nav is correct. Producing no nav SILENTLY turns a
  // property of the project into an apparent defect in the app.
  const orphaned: FilesSnapshot = {
    "conf.py": "root_doc = master_doc = 'index'\nsource_suffix = '.rst'\n",
    "ansible_index.rst": "Ansible\n=======\n\n.. toctree::\n\n   guide\n",
    "guide.rst": "Guide\n=====\n",
  };

  it("says the root is declared but absent, rather than showing nothing", () => {
    const { doc, evidence = [] } = sphinxAdapter.parse(orphaned, "ansible");
    expect(doc.sections).toEqual([]);
    const said = evidence.find((e) => e.kind === "root-document-absent");
    expect(said).toBeDefined();
    expect(said!.detail).toMatch(/"index"/);
    expect(said!.detail).toMatch(/generate it at build time/);
  });

  it("THE COMPLEMENT: says nothing when the root is present", () => {
    const { evidence = [] } = sphinxAdapter.parse(
      { ...orphaned, "index.rst": "Root\n====\n\n.. toctree::\n\n   guide\n" },
      "ok",
    );
    expect(evidence.filter((e) => e.kind === "root-document-absent")).toEqual([]);
  });
});

describe("the kept set is WHOLE HOST FILES — the docs/19 migration check", () => {
  /**
   * MIGRATION CHECK, answered rather than assumed: does phase 2's region
   * model change the shape of what Sphinx persists?
   *
   * It does not, and this is the receipt. `navTail` is a VIEW computed
   * over a kept file, never a slice of what is kept — so `extras.files`
   * holds exactly what it held in phase 1, a session saved before this
   * change loads unchanged, and none of the `TopicUnlisted` migration
   * machinery (read-alias, adversarial pass on the load path) applies.
   *
   * It is also a FENCE, because the obvious next "optimization" is to
   * keep tails instead of hosts, mirroring what docs/15 did for heads —
   * and that would be silently wrong here. Two reasons, both structural:
   *
   *  - `documentTitle` reads a document's title from ABOVE its nav, and
   *    `simulatePlan` re-parses the snapshot while comparing titles
   *    (docs/12). A tail-only snapshot cannot answer, so simulation would
   *    compare against titles it had to invent.
   *  - The region is re-derived from the original at save and at patch
   *    time. Keeping only the region would leave nothing to re-derive it
   *    FROM, and `linesBefore` — the patch offset — would have no source.
   *
   * Asserted on the CONSTRUCTION: byte identity between input and kept
   * value, which a region slice cannot satisfy.
   */
  const withTail: FilesSnapshot = {
    "conf.py": CONF,
    "index.rst": [
      "Docs",
      "====",
      "",
      "Prose above the nav, which a tail region does not own.",
      "",
      ".. toctree::",
      "",
      "   guide",
      "",
    ].join("\n"),
    "guide.rst": "Guide\n=====\n\nbody\n",
  };

  it("keeps each host byte-identical to the file on disk", () => {
    const { doc } = sphinxAdapter.parse(withTail, "receipt");
    const kept = (doc.extras as { files: FilesSnapshot }).files;
    expect(kept["index.rst"]).toBe(withTail["index.rst"]);
    // The prose above the nav is IN the snapshot, which is the whole
    // claim: a tail-sliced snapshot would have dropped it.
    expect(kept["index.rst"]).toContain("Prose above the nav");
  });

  it("keeps conf.py whole too", () => {
    const { doc } = sphinxAdapter.parse(withTail, "receipt");
    const kept = (doc.extras as { files: FilesSnapshot }).files;
    expect(kept["conf.py"]).toBe(CONF);
  });

  it("keeps no non-host source, so the shape is unchanged from phase 1", () => {
    const { doc } = sphinxAdapter.parse(withTail, "receipt");
    const kept = (doc.extras as { files: FilesSnapshot }).files;
    // `guide.rst` hosts no toctree: read for its title, then discarded.
    expect(Object.keys(kept).sort()).toEqual([SIDECAR_KEY, "conf.py", "index.rst"]);
  });
});
