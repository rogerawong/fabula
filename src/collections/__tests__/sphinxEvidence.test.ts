/**
 * Parse observations become FOCUSABLE (docs/19 step 5's rider).
 *
 * docs/12 left this half-done and said so: `missing-document` and
 * `duplicate-reference` carried no `subject`, so they were counted but
 * not clickable — "that half needs a `NodeRef`, which needs the section
 * id threaded through `traverse` to where the placeholder node is
 * built".
 *
 * A PLACEHOLDER IS A NEW FOCUS-TARGET SPECIES, so the consumer sweep is
 * run rather than assumed: `focusPath` is the one consumer that turns a
 * `NodeRef` into a canvas action, and its boundary rule has acquired two
 * new lock kinds since it was written.
 */

import { describe, expect, it } from "vitest";
import { sphinxAdapter } from "../adapters/sphinx";
import { focusPath } from "@/model/focusPath";
import type { FilesSnapshot } from "../types";

const CONF = 'master_doc = "index"\nsource_suffix = ".rst"\n';

/** `gone` is listed and absent; `about` is listed twice. */
const FLAWED: FilesSnapshot = {
  "conf.py": CONF,
  "index.rst": [
    "Docs",
    "====",
    "",
    ".. toctree::",
    "   :caption: Guides",
    "",
    "   about",
    "   gone",
    "",
    ".. toctree::",
    "   :caption: Extras",
    "",
    "   about",
    "",
  ].join("\n"),
  "about.rst": "About\n=====\n\nbody\n",
};

describe("an observation names the node it is about", () => {
  it("carries a subject for a missing document", () => {
    const { doc, evidence } = sphinxAdapter.parse(FLAWED, "p");
    const missing = evidence!.find((e) => e.kind === "missing-document");
    expect(missing?.subject).toBeDefined();
    // And it points at a node that is really there.
    const row = doc.sections
      .flatMap((s) => s.topics)
      .find((t) => t.id === missing!.subject!.topicId);
    expect(row?.lock?.kind).toBe("missing");
  });

  it("carries a subject for a duplicate reference", () => {
    const { doc, evidence } = sphinxAdapter.parse(FLAWED, "p");
    const dup = evidence!.find((e) => e.kind === "duplicate-reference");
    expect(dup?.subject).toBeDefined();
    const section = doc.sections.find((s) => s.id === dup!.subject!.sectionId);
    // The SECOND listing is the pinned one, so the subject is in Extras.
    expect(section?.title).toBe("Extras");
  });

  it("leaves a project-level observation subjectless", () => {
    // The complement: not every observation is about a node, and
    // inventing a subject for `root-document-absent` would send the user
    // to a card that has nothing to do with it.
    const { evidence } = sphinxAdapter.parse({ "conf.py": 'master_doc = "nope"\n' }, "p");
    const absent = evidence!.find((e) => e.kind === "root-document-absent");
    expect(absent).toBeDefined();
    expect(absent!.subject).toBeUndefined();
  });
});

describe("the consumer sweep: focusPath on a placeholder", () => {
  it("resolves a path to the missing row rather than returning null", () => {
    const { doc, evidence } = sphinxAdapter.parse(FLAWED, "p");
    const missing = evidence!.find((e) => e.kind === "missing-document")!;
    const path = focusPath(doc, missing.subject!);
    expect(path).not.toBeNull();
    expect(path!.target).toBe(missing.subject!.topicId);
    expect(path!.stoppedAtBoundary).toBe(false);
  });

  it("does not treat the NEW lock kinds as focus boundaries", () => {
    // `isBoundary` stops at `atomic` and nothing else. Two kinds have
    // been added since it was written — `globbed` and `outside-region` —
    // and both describe rows that RENDER with their children, so
    // stopping at them would refuse to focus something plainly on
    // screen. Asserted rather than assumed.
    const globbed: FilesSnapshot = {
      "conf.py": CONF,
      "index.rst": [
        "Docs",
        "====",
        "",
        ".. toctree::",
        "   :glob:",
        "",
        "   host",
        "",
      ].join("\n"),
      "host.rst": "Host\n====\n\n.. toctree::\n\n   leaf\n",
      "leaf.rst": "Leaf\n====\n\nbody\n",
    };
    const { doc } = sphinxAdapter.parse(globbed, "p");
    const host = doc.sections[0]!.topics[0]!;
    expect(host.lock?.kind).toBe("globbed");
    const leaf = host.children[0]!;
    const path = focusPath(doc, {
      sectionId: doc.sections[0]!.id,
      topicId: leaf.id,
    });
    expect(path!.target).toBe(leaf.id);
    expect(path!.stoppedAtBoundary).toBe(false);
    expect(path!.expand).toContain(host.id);
  });
});
