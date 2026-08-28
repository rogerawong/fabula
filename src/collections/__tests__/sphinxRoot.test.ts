/**
 * The root-candidate picker's derivation (docs/19's rider).
 *
 * Ansible's writers are in scope, and today they get a correct refusal
 * that reads like a broken app: `root_doc = master_doc = 'index'` with
 * no `index.rst` anywhere, because the Makefile symlinks one at build
 * time and picks WHICH one by the doc set being built.
 *
 * THE RULE, corrected by measurement before it was written down: files
 * that HOST a toctree and appear as an ENTRY in no other file's toctree.
 * Run against ansible that yields SIX, not two — `dev_guide/*` is the
 * same build-time symlink one level down, and the `roadmap/*` pair are
 * genuinely unreferenced hosts. Restricting to TOP-LEVEL docnames
 * reproduces the expected pair exactly, and it is principled rather than
 * convenient: `root_doc` resolves from the source root, so a nested
 * unreferenced host is a sub-root or an orphan host and is reached
 * THROUGH whichever root is chosen.
 *
 * REACH IS THE LABEL, and it validates the derivation independently —
 * the same walk, on corpora whose roots are not in doubt, must reproduce
 * numbers already known from elsewhere. That cross-check is wired in
 * `sphinxRootCorpus.test.ts`, which runs only where the corpora are.
 */

import { describe, expect, it } from "vitest";
import { rootCandidates, ROOT_KEY, sphinxAdapter } from "../adapters/sphinx";
import type { FilesSnapshot } from "../types";

const CONF = 'root_doc = "index"\nsource_suffix = ".rst"\n';

/** Two real roots, plus the nested twin the restriction must exclude. */
const MULTI: FilesSnapshot = {
  "conf.py": CONF,
  // Root A — three documents in its closure, counting itself.
  "alpha_index.rst": "Alpha\n=====\n\n.. toctree::\n\n   guides/one\n   guides/two\n",
  "guides/one.rst": "One\n===\n\nbody\n",
  "guides/two.rst": "Two\n===\n\nbody\n",
  // Root B — smaller, and shares nothing with A.
  "beta_index.rst": "Beta\n====\n\n.. toctree::\n\n   ref/api\n",
  "ref/api.rst": "API\n===\n\nbody\n",
  // THE NESTED TWIN: hosts a toctree, referenced by nobody, and is NOT
  // a candidate because it is not top-level. This is the shape that
  // made the uncorrected rule return six for ansible.
  "sub/alpha_index.rst": "Nested\n======\n\n.. toctree::\n\n   ../ref/api\n",
};

describe("candidates are top-level unreferenced hosts", () => {
  it("finds both real roots", () => {
    const names = rootCandidates(MULTI).map((c) => c.docname);
    expect(names.sort()).toEqual(["alpha_index", "beta_index"]);
  });

  it("EXCLUDES the nested twin", () => {
    // The clause the corrected rule turns on, asserted on its own so a
    // regression cannot hide behind the pair above.
    expect(rootCandidates(MULTI).map((c) => c.docname)).not.toContain("sub/alpha_index");
  });

  it("excludes a top-level host that another file lists", () => {
    // The complement of "unreferenced": a host reached from elsewhere is
    // not a root, it is a branch.
    const referenced: FilesSnapshot = {
      ...MULTI,
      "beta_index.rst": "Beta\n====\n\n.. toctree::\n\n   ref/api\n   alpha_index\n",
    };
    expect(rootCandidates(referenced).map((c) => c.docname)).toEqual(["beta_index"]);
  });

  it("excludes a top-level document that hosts no toctree", () => {
    const withLeaf: FilesSnapshot = { ...MULTI, "readme.rst": "Read\n====\n\nbody\n" };
    expect(rootCandidates(withLeaf).map((c) => c.docname)).not.toContain("readme");
  });
});

describe("REACH is the closure size, including the root itself", () => {
  it("counts every document a candidate reaches", () => {
    const byName = new Map(rootCandidates(MULTI).map((c) => [c.docname, c.reach]));
    expect(byName.get("alpha_index")).toBe(3);
    expect(byName.get("beta_index")).toBe(2);
  });

  it("does not double-count a document reached twice", () => {
    const diamond: FilesSnapshot = {
      "conf.py": CONF,
      "top.rst": "T\n=\n\n.. toctree::\n\n   left\n   right\n",
      "left.rst": "L\n=\n\n.. toctree::\n\n   shared\n",
      "right.rst": "R\n=\n\n.. toctree::\n\n   shared\n",
      "shared.rst": "S\n=\n\nbody\n",
    };
    expect(rootCandidates(diamond)[0]!.reach).toBe(4);
  });

  it("terminates on a cycle", () => {
    // A toctree graph contains cycles; a walk that did not track visited
    // documents would not return at all.
    const cyclic: FilesSnapshot = {
      "conf.py": CONF,
      "a.rst": "A\n=\n\n.. toctree::\n\n   b\n",
      "b.rst": "B\n=\n\n.. toctree::\n\n   a\n",
    };
    // `a` and `b` each reference the other, so NEITHER is unreferenced
    // and there is no candidate — which is itself the honest answer.
    expect(rootCandidates(cyclic)).toEqual([]);
  });

  it("ranks the biggest tree first", () => {
    expect(rootCandidates(MULTI)[0]!.docname).toBe("alpha_index");
  });
});

describe("the picker does not fire where there is nothing to pick", () => {
  it("returns nothing when the declared root is present", () => {
    // Not the picker's own trigger — that is the caller's — but a
    // corpus with one obvious root must not offer a choice at all.
    const ordinary: FilesSnapshot = {
      "conf.py": CONF,
      "index.rst": "Docs\n====\n\n.. toctree::\n\n   about\n",
      "about.rst": "About\n=====\n\nbody\n",
    };
    expect(rootCandidates(ordinary).map((c) => c.docname)).toEqual(["index"]);
  });

  it("returns nothing for a folder with no toctree at all", () => {
    expect(rootCandidates({ "conf.py": CONF, "a.rst": "A\n=\n" })).toEqual([]);
  });
});

describe("a chosen root is SESSION-LOCAL and discloses itself", () => {
  /**
   * The chosen candidate becomes the import's root. It is an import
   * PARAMETER, never persisted config — a deviation from what the
   * repository declares must not self-perpetuate (docs/16's alias-toggle
   * reasoning, same direction).
   *
   * But it must survive INTO the snapshot, and that is not a
   * contradiction: `simulatePlan` re-parses `extras.files`, so a choice
   * the snapshot could not recall would re-parse under the declared —
   * absent — root and produce an empty document to compare against.
   * Session-local means "not written back to conf.py and not remembered
   * for the next import", not "forgotten immediately".
   */
  const withChoice = (files: FilesSnapshot, docname: string): FilesSnapshot => ({
    ...files,
    [ROOT_KEY]: docname,
  });

  it("parses under the chosen root", () => {
    const { doc } = sphinxAdapter.parse(withChoice(MULTI, "beta_index"), "p");
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0]!.topics.map((t) => t.title)).toEqual(["API"]);
  });

  it("names the substitution, so an export carries the provenance", () => {
    const { evidence } = sphinxAdapter.parse(withChoice(MULTI, "beta_index"), "p");
    const chosen = evidence!.find((e) => e.kind === "root-chosen");
    expect(chosen).toBeDefined();
    expect(chosen!.detail).toContain("beta_index");
    // The DECLARED root is named too: a chosen root presented as a found
    // one is the app quietly rewriting what the project says.
    expect(chosen!.detail).toContain("index");
  });

  it("PRE-EMPTS the orphan alarm with the measurement", () => {
    // Choosing the smaller tree leaves the other one outside, and those
    // documents will surface as orphans. That is correct and it is going
    // to look alarming, so the disclosure says so before the user finds
    // it: "documents reachable only from other roots appear as orphans".
    const { evidence } = sphinxAdapter.parse(withChoice(MULTI, "beta_index"), "p");
    const chosen = evidence!.find((e) => e.kind === "root-chosen")!;
    // MULTI has 6 .rst documents; beta_index reaches 2.
    expect(chosen.detail).toMatch(/4 of 6/);
    expect(chosen.detail).toMatch(/orphan/i);
  });

  it("says nothing when the declared root was found", () => {
    // The complement. A disclosure on every import is a disclosure
    // nobody reads, and this one is only true after a substitution.
    const ordinary: FilesSnapshot = {
      "conf.py": CONF,
      "index.rst": "Docs\n====\n\n.. toctree::\n\n   about\n",
      "about.rst": "About\n=====\n\nbody\n",
    };
    const { evidence } = sphinxAdapter.parse(ordinary, "p");
    expect(evidence!.some((e) => e.kind === "root-chosen")).toBe(false);
    expect(evidence!.some((e) => e.kind === "root-document-absent")).toBe(false);
  });

  it("leaves the sidecar out of the kept snapshot's nav files", () => {
    // The fence: no plan may ever name this key.
    const { doc } = sphinxAdapter.parse(withChoice(MULTI, "beta_index"), "p");
    const kept = (doc.extras as { files: FilesSnapshot }).files;
    expect(kept[ROOT_KEY]).toBe("beta_index");
    const edited = structuredClone(doc);
    const plan = sphinxAdapter.planChanges!(
      kept,
      edited,
      edited.sections.map((s) => s.id),
    );
    expect(plan.changes.map((c) => (c.kind === "edit" ? c.path : ""))).not.toContain(
      ROOT_KEY,
    );
  });
});
