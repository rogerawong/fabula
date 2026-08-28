/**
 * emit-move-patches.ts — the fixtures behind `receipt-move-patch.sh`.
 *
 * Produces, into a work dir: the corpus as files, one `.patch` per move
 * scenario from the SHIPPED planner and the SHIPPED patch writer, and
 * the bytes the app's own `applyChanges` predicts for each. The shell
 * script then hands the patches to real `git apply` and compares.
 *
 * Kept as a script rather than a test because the oracle is an external
 * tool: vitest cannot run `git apply`, and a simulation agreeing with
 * itself is not a receipt.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hugoAdapter } from "@/collections/adapters/hugo";
import { renderPatch } from "@/collections/diff";
import { saveChanges } from "@/collections/fsAccess";
import { deriveSectionOrder, initialColumns } from "@/layout/columns";
import { filesOf, type FilesSnapshot } from "@/collections/types";
import type { Section, TocDocument, Topic } from "@/model/types";

const work = process.argv[2];
if (!work) {
  console.error("usage: vite-node scripts/emit-move-patches.ts <workdir>");
  process.exit(1);
}

/** A small Hugo tree with real bodies — the point is that BODIES exist,
 *  because the seam is a head spliced into bytes the snapshot never
 *  kept. A fixture of head-only files could not fail. */
const CORPUS: FilesSnapshot = {
  "hugo.toml": 'contentDir = "content"\ntitle = "Receipt"\n',
  "content/docs/_index.md": "---\ntitle: Docs\n---\nRoot landing.\n",
  "content/docs/tasks/_index.md": "---\ntitle: Tasks\nweight: 10\n---\nTasks landing.\n",
  "content/docs/tasks/alpha.md":
    "---\ntitle: Alpha\nweight: 10\n---\n# Alpha\n\nA body with several lines.\n\nSee [beta](/docs/tasks/beta/).\n\nMore prose that must survive byte for byte.\n",
  "content/docs/tasks/beta.md":
    "---\ntitle: Beta\nweight: 20\n---\n# Beta\n\nAnother body.\n\n- a list\n- of things\n",
  "content/docs/guides/_index.md":
    "---\ntitle: Guides\nweight: 20\n---\nGuides landing.\n",
  "content/docs/guides/one.md": "---\ntitle: One\n---\n# One\n\nUnweighted body.\n",
  "content/docs/guides/two.md": "---\ntitle: Two\n---\n# Two\n\nAlso unweighted.\n",
  // A fully WEIGHTED card holding no bare page. It exists so the D1
  // scenario can contain a move-prepend and NOTHING ELSE: dropping into
  // `tasks/` would renumber `tasks/bare.md`, whose own edit-prepend
  // flags the patch and hides whether the MOVE was classified at all.
  // That is the corpus accident this scenario was written to escape —
  // and the first draft of it walked straight back into one, caught by
  // mutation rather than by reading.
  "content/docs/refs/_index.md": "---\ntitle: Refs\nweight: 30\n---\nRefs landing.\n",
  "content/docs/refs/first.md": "---\ntitle: First\nweight: 10\n---\n# First\n\nBody.\n",
  "content/docs/refs/second.md":
    "---\ntitle: Second\nweight: 20\n---\n# Second\n\nBody.\n",
  // A BARE page in ITS OWN card, and the card exists for that reason.
  //
  // It first lived in `guides/`, which made `move-into-unweighted-middle`
  // start emitting a bare-page prepend it had never emitted before — the
  // scenario kept its name and quietly changed what it proved. A test's
  // name is a claim, so the fixture moved instead of the name.
  "content/docs/inbox/_index.md": "---\ntitle: Inbox\nweight: 40\n---\nInbox landing.\n",
  "content/docs/inbox/bare-guide.md": "# Bare Guide\n\nNo front matter here either.\n",
  // ── the adversarial bodies ───────────────────────────────
  "content/docs/tasks/crlf.md":
    "---\r\ntitle: Crlf\r\nweight: 30\r\n---\r\n# Crlf\r\n\r\nA body with CRLF endings.\r\n",
  "content/docs/tasks/bom.md":
    "\ufeff---\ntitle: Bom\nweight: 40\n---\n# Bom\n\nA body behind a byte-order mark.\n",
  "content/docs/tasks/bare.md": "# Bare\n\nNo front matter at all.\n",
  "content/docs/tasks/fencey.md":
    "---\ntitle: Fencey\nweight: 50\n---\n# Fencey\n\nProse, then a line that looks like a fence:\n\n---\n\nMore prose after it.\n",
};

const card = (doc: TocDocument, title: string): Section =>
  doc.sections.find((s) => s.title === title)!;
const rowOf = (section: Section, title: string): Topic =>
  section.topics.find((t) => t.title === title)!;

function reparent(
  doc: TocDocument,
  from: string,
  row: string,
  to: string,
  at: number,
): TocDocument {
  const next: TocDocument = structuredClone(doc);
  const source = card(next, from);
  const moving = rowOf(source, row);
  source.topics = source.topics.filter((t) => t.id !== moving.id);
  const dest = card(next, to);
  dest.topics = [...dest.topics.slice(0, at), moving, ...dest.topics.slice(at)];
  return next;
}

function write(dir: string, files: FilesSnapshot): void {
  for (const [path, content] of Object.entries(files)) {
    const abs = join(dir, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

write(join(work, "repo"), CORPUS);

const { doc } = hugoAdapter.parse(CORPUS, "receipt");
const plan = (edited: TocDocument, options?: { writeAliases?: boolean }) =>
  hugoAdapter.planChanges!(
    CORPUS,
    edited,
    deriveSectionOrder(initialColumns(edited)),
    options,
  );

/**
 * The scenarios, each naming the property it stresses.
 *
 * `no-weight-change` is the one the seam turns on: a pure relocation
 * emits a move whose nav head is UNCHANGED, so `renderPatch` produces a
 * rename with no hunks — and whether `git apply` accepts that is a
 * question about git, not about us.
 */
const scenarios: {
  name: string;
  doc: TocDocument;
  options?: { writeAliases?: boolean };
}[] = [
  { name: "move-first-with-alias", doc: reparent(doc, "Tasks", "Beta", "Guides", 0) },
  {
    name: "move-no-alias",
    doc: reparent(doc, "Tasks", "Beta", "Guides", 0),
    options: { writeAliases: false },
  },
  {
    name: "move-into-unweighted-middle",
    doc: reparent(doc, "Tasks", "Beta", "Guides", 1),
  },
  // ── the adversarial cases ────────────────────────────────
  // Each one attacks the seam rather than exercising it: a
  // region:"navHead" edit whose path ALSO changed, applied against bytes
  // on disk. If the head and the path are ever resolved from different
  // sides of the move, one of these writes the wrong bytes.
  {
    // CRLF throughout. The splice must not normalise line endings on a
    // file it is only relocating — a format pass once silently
    // LF-normalised a CRLF fixture in this repo.
    name: "adversarial-crlf-body",
    doc: reparent(doc, "Tasks", "Crlf", "Guides", 0),
  },
  {
    // A BOM before the front matter. Byte 0 is not `-`, and a splice
    // that assumed it was would eat the marker.
    name: "adversarial-bom",
    doc: reparent(doc, "Tasks", "Bom", "Guides", 0),
  },
  {
    // NO front matter at all: the head is empty, so the splice must
    // INSERT one and leave the body alone.
    name: "adversarial-bare-body",
    doc: reparent(doc, "Tasks", "Bare", "Guides", 0),
  },
  {
    // A body containing a line that looks like a front-matter fence.
    // A splice that searched for `---` without anchoring to the head
    // would cut here instead.
    name: "adversarial-fence-in-body",
    doc: reparent(doc, "Tasks", "Fencey", "Guides", 0),
  },
  {
    // SWAP: two pages exchange directories in one plan. Each move's
    // source is the other's destination, so a writer that vacated
    // sources before reading would lose both bodies.
    name: "adversarial-swap",
    doc: (() => {
      const once = reparent(doc, "Tasks", "Beta", "Guides", 0);
      return reparent(once, "Guides", "One", "Tasks", 0);
    })(),
  },
  {
    // DOCUMENTED RESIDUAL, pinned so it is known rather than
    // discovered. Applying the flagged patch TWICE stacks a second front
    // matter block: a zero-context hunk has no context to notice that
    // its change is already there, so `git apply` cannot detect the
    // re-application it would normally refuse. Accepted — the same
    // last-writer shape as docs/15's front-matter drift residual, one
    // per writer — and the receipt asserts the outcome so a future
    // change to the mode cannot alter it silently.
    name: "residual-double-apply",
    doc: (() => {
      const once = reparent(doc, "Guides", "One", "Tasks", 0);
      return reparent(once, "Tasks", "Bare", "Guides", 0);
    })(),
  },
  {
    // D1: a bare page moved INTO a weighted card. The destination's
    // siblings carry weights, so the plan writes one — onto a page whose
    // nav head is empty. That is a move AND a zero-context prepend in one
    // entry, and it is the case the old classifier missed by keying on
    // the MECHANISM (`kind === "edit"`) instead of on the CHANGE.
    //
    // Its complement is the whole suite: every patch that names no flag
    // must apply under the default invocation, which the receipt now
    // asserts. Between them the classifier is pinned on both sides.
    name: "move-bare-into-weighted",
    doc: reparent(doc, "Inbox", "Bare Guide", "Refs", 0),
  },
  {
    name: "move-two-rows",
    doc: (() => {
      const once = reparent(doc, "Tasks", "Beta", "Guides", 0);
      return reparent(once, "Tasks", "Alpha", "Guides", 0);
    })(),
  },
];

for (const scenario of scenarios) {
  const result = plan(scenario.doc, scenario.options);
  const blocking = result.warnings.filter((w) => w.blocking);
  if (blocking.length > 0) {
    console.error(
      `${scenario.name}: BLOCKED — ${blocking.map((w) => w.kind).join(", ")}`,
    );
    process.exit(1);
  }
  writeFileSync(
    join(work, `${scenario.name}.patch`),
    // The ORIGINALS the app passes are the KEPT SNAPSHOT — nav heads,
    // not whole files (`ChangesDialog` calls `filesOf(doc)`). Passing
    // whole files here made every edit hunk claim the body was being
    // deleted, and all four patches were refused. A harness defect
    // reported as a product finding: the direction this class always
    // fails in.
    renderPatch(result.changes, filesOf(scenario.doc)),
  );
  // The oracle is the OTHER WRITER, not a simulation.
  //
  // `applyChanges` was the first choice and it is the wrong one: it
  // writes `newContent` wholesale and ignores `region`, which is correct
  // for the SNAPSHOT it is called with in the app (nav heads replacing
  // nav heads) and truncates every body when handed whole files. Using
  // it here compared git against a straw man.
  //
  // What step 8 actually asks is whether the two SHIPPED writers agree,
  // so `expected` is the File System Access writer run against an
  // in-memory target holding the real corpus — the same splice-on-save
  // path a folder save takes.
  const memory: FilesSnapshot = { ...CORPUS };
  await saveChanges(
    {
      readFile: (path) => Promise.resolve(memory[path] ?? null),
      writeFile: (path, content) => {
        memory[path] = content;
        return Promise.resolve();
      },
      removeFile: (path) => {
        delete memory[path];
        return Promise.resolve();
      },
    },
    result.changes,
  );
  write(join(work, "expected", scenario.name), memory);
  console.log(
    `${scenario.name}: ${result.changes.length} change(s), ` +
      `${result.changes.filter((c) => c.kind === "move").length} move(s)`,
  );
}
