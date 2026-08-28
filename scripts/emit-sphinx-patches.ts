/**
 * emit-sphinx-patches.ts — the fixtures behind `receipt-sphinx-tail.sh`.
 *
 * The `navTail` counterpart of `emit-move-patches.ts`, and the port of
 * the session-local `sphinx-experiments.sh` docs/19 named as a step-8
 * obligation. It writes, into a work dir: a Sphinx project as files, one
 * `.patch` per scenario from the SHIPPED planner and the SHIPPED patch
 * writer, and the bytes the SHIPPED File System Access writer predicts.
 *
 * The oracle is the OTHER WRITER, never a simulation — docs/16's lesson,
 * and it bites harder here. A tail region is a SUFFIX, so a writer that
 * ignored `region` would truncate every byte of prose above the nav, and
 * a check comparing the app against itself would agree enthusiastically.
 *
 * Kept as a script because the oracle is an external tool: vitest cannot
 * run `git apply`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sphinxAdapter } from "@/collections/adapters/sphinx";
import { renderPatch } from "@/collections/diff";
import { saveChanges } from "@/collections/fsAccess";
import { deriveSectionOrder, initialColumns } from "@/layout/columns";
import type { FilesSnapshot } from "@/collections/types";
import type { Section, TocDocument, Topic } from "@/model/types";

const work = process.argv[2];
if (!work) {
  console.error("usage: vite-node scripts/emit-sphinx-patches.ts <workdir>");
  process.exit(1);
}

const CONF = 'master_doc = "index"\nsource_suffix = ".rst"\n';

/**
 * The corpus. Every file here exists to make one thing FAIL if the
 * region model is wrong — bodies above the nav, a file with no trailing
 * newline, CRLF, tab indentation, group separators, and prose between
 * blocks so part of a carrier is out of region.
 */
const CORPUS: FilesSnapshot = {
  "conf.py": CONF,
  "index.rst": [
    "Docs",
    "====",
    "",
    "A paragraph above the navigation. The region does not own this,",
    "and a writer that replaced the file instead of splicing it would",
    "delete these three lines.",
    "",
    ".. toctree::",
    "   :maxdepth: 2",
    "   :caption: Guides",
    "",
    "   guides/index",
    "",
    "Reference",
    "---------",
    "",
    ".. toctree::",
    "   :caption: Reference",
    "",
    "   reference/api",
    "   reference/cli",
    "",
    "   reference/legacy",
    "",
  ].join("\n"),
  // Group separators, including a DOUBLE blank — the kernel's
  // `arch/arm/index.rst` shape, which broke a boolean separator model.
  "guides/index.rst": [
    "Guides",
    "======",
    "",
    ".. toctree::",
    "",
    "   install",
    "",
    "",
    "   usage",
    "   config",
    "",
  ].join("\n"),
  "guides/install.rst": "Install\n=======\n\nbody\n",
  "guides/usage.rst": "Usage\n=====\n\nbody\n",
  "guides/config.rst": "Config\n======\n\nbody\n",
  "reference/api.rst": "API\n===\n\nbody\n",
  "reference/cli.rst": "CLI\n===\n\nbody\n",
  "reference/legacy.rst": "Legacy\n======\n\nbody\n",
  // NO TRAILING NEWLINE. `git apply` treats the marker as part of the
  // context contract and refuses the hunk without it.
  "tools/index.rst": ["Tools", "=====", "", ".. toctree::", "", "   lint", "   fmt"].join(
    "\n",
  ),
  "tools/lint.rst": "Lint\n====\n\nbody\n",
  "tools/fmt.rst": "Fmt\n===\n\nbody\n",
  // TAB-INDENTED body, the kernel's 13-file hazard.
  "kernel/index.rst": [
    "Kernel",
    "======",
    "",
    ".. toctree::",
    "\t:maxdepth: 3",
    "",
    "\tboot",
    "\tmemory",
    "",
  ].join("\n"),
  "kernel/boot.rst": "Boot\n====\n\nbody\n",
  "kernel/memory.rst": "Memory\n======\n\nbody\n",
  // CRLF throughout.
  "win/index.rst": "Win\r\n===\r\n\r\n.. toctree::\r\n\r\n   setup\r\n   paths\r\n",
  "win/setup.rst": "Setup\r\n=====\r\n\r\nbody\r\n",
  "win/paths.rst": "Paths\r\n=====\r\n\r\nbody\r\n",
  // PROSE BETWEEN BLOCKS: the first block is outside the region and
  // locks; the trailing run stays writable.
  "split/index.rst": [
    "Split",
    "=====",
    "",
    ".. toctree::",
    "",
    "   above",
    "",
    "Prose between the blocks, which the region must not claim.",
    "",
    ".. toctree::",
    "",
    "   below",
    "   later",
    "",
  ].join("\n"),
  "split/above.rst": "Above\n=====\n\nbody\n",
  "split/below.rst": "Below\n=====\n\nbody\n",
  "split/later.rst": "Later\n=====\n\nbody\n",
};

// The extra hosts are reachable only if the root lists them.
CORPUS["index.rst"] = CORPUS["index.rst"]!.replace(
  "   guides/index\n",
  "   guides/index\n   tools/index\n   kernel/index\n   win/index\n   split/index\n",
);

function write(dir: string, files: FilesSnapshot): void {
  for (const [path, content] of Object.entries(files)) {
    const abs = join(dir, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}
write(join(work, "repo"), CORPUS);

const { doc } = sphinxAdapter.parse(CORPUS, "receipt");
const card = (d: TocDocument, title: string): Section =>
  d.sections.find((s) => s.title === title)!;
const rowIn = (nodes: Topic[], title: string): Topic =>
  nodes.find((t) => t.title === title)!;

const clone = (d: TocDocument): TocDocument => structuredClone(d);

/** Reorder two children of a hosting row. */
function swapChildren(d: TocDocument, section: string, host: string): TocDocument {
  const next = clone(d);
  const parent = rowIn(card(next, section).topics, host);
  parent.children = [...parent.children].reverse();
  return next;
}

const scenarios: { name: string; doc: TocDocument }[] = [
  {
    // The plain case: entries reordered inside one block, in a file
    // whose region starts a long way down.
    name: "reorder-in-region",
    doc: (() => {
      const next = clone(doc);
      const ref = card(next, "Reference");
      ref.topics = [ref.topics[2]!, ref.topics[0]!, ref.topics[1]!];
      return next;
    })(),
  },
  {
    // GROUP SEPARATORS, including the double blank. A boolean separator
    // model collapses it and loses a line.
    name: "separators-preserved",
    doc: swapChildren(doc, "Guides", "Guides"),
  },
  {
    // NO TRAILING NEWLINE. The `\ No newline at end of file` marker
    // attaches to the trailing CONTEXT line here, because the edit does
    // not touch the last line.
    name: "unterminated-file",
    doc: swapChildren(doc, "Guides", "Tools"),
  },
  {
    // TAB-INDENTED body: re-emission must write tabs back.
    name: "tab-indented",
    doc: swapChildren(doc, "Guides", "Kernel"),
  },
  {
    // CRLF: every rewritten line keeps its carriage return.
    name: "crlf-region",
    doc: swapChildren(doc, "Guides", "Win"),
  },
  {
    // OUT-OF-REGION blocks stay put while the trailing run is rewritten.
    //
    // Only the WRITABLE run is reordered. Reversing all three children
    // moves `above` too, and the planner refuses that — correctly, and
    // it refused the first draft of this scenario, which is the guard
    // working rather than a fixture problem.
    name: "outside-region-untouched",
    doc: (() => {
      const next = clone(doc);
      const split = rowIn(card(next, "Guides").topics, "Split");
      const [above, ...rest] = split.children;
      split.children = [above!, ...rest.reverse()];
      return next;
    })(),
  },
  {
    // THE SEPARATOR LEFT BEHIND. None of the eight above covers it: the
    // entries that leave a block in `cross-file-move` and
    // `cross-file-into-unterminated` are the FIRST and the THIRD, and
    // neither owns a blank. Here `usage` owns the double blank, so the
    // question is what happens to the group marker when its owner goes.
    //
    // It goes WITH it — a separator is a fact about how this block is
    // grouped, and an orphaned blank left at a boundary nobody drew is
    // a byte we invented.
    name: "separator-owner-leaves",
    doc: (() => {
      const next = clone(doc);
      const guides = rowIn(card(next, "Guides").topics, "Guides");
      const usage = guides.children[1]!;
      guides.children = [guides.children[0]!, guides.children[2]!];
      card(next, "Reference").topics.push(usage);
      return next;
    })(),
  },
  {
    // THE STEP-4 SHAPE: one gesture, two files, two `navTail` edits.
    name: "cross-file-move",
    doc: (() => {
      const next = clone(doc);
      const guides = rowIn(card(next, "Guides").topics, "Guides");
      const install = guides.children[0]!;
      guides.children = guides.children.slice(1);
      card(next, "Reference").topics.push(install);
      return next;
    })(),
  },
  {
    // Cross-file INTO an unterminated file: the two hazards at once.
    name: "cross-file-into-unterminated",
    doc: (() => {
      const next = clone(doc);
      const guides = rowIn(card(next, "Guides").topics, "Guides");
      const config = guides.children[2]!;
      guides.children = guides.children.slice(0, 2);
      rowIn(card(next, "Guides").topics, "Tools").children.push(config);
      return next;
    })(),
  },
];

for (const scenario of scenarios) {
  const order = deriveSectionOrder(initialColumns(scenario.doc));
  const result = sphinxAdapter.planChanges!(CORPUS, scenario.doc, order);
  const blocking = result.warnings.filter((w) => w.blocking);
  if (blocking.length > 0) {
    console.error(
      `${scenario.name}: BLOCKED — ${blocking.map((w) => w.kind).join(", ")}`,
    );
    process.exit(1);
  }
  if (result.changes.length === 0) {
    console.error(`${scenario.name}: NO CHANGES — the scenario edits nothing`);
    process.exit(1);
  }
  writeFileSync(
    join(work, `${scenario.name}.patch`),
    // The originals are the KEPT SNAPSHOT, which for Sphinx is whole
    // host files — passing anything else made every hunk in the docs/16
    // receipt claim the body was being deleted.
    renderPatch(result.changes, CORPUS),
  );

  // The oracle is the OTHER SHIPPED WRITER, run against an in-memory
  // target holding the real corpus — the same splice-on-save path a
  // folder save takes.
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
      `${result.entryMoves?.length ?? 0} entry move(s)`,
  );
}
