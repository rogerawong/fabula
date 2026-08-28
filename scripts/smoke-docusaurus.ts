/**
 * smoke-docusaurus.ts — one-off: parse a real docs folder (default
 * ~/tmp/docu-test/docs) with the Docusaurus adapter, print the tree +
 * warnings, and assert the no-op law (plan over the untouched model
 * must be empty). Run: pnpm vite-node scripts/smoke-docusaurus.ts
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { docusaurusAdapter } from "../src/collections/adapters/docusaurus";
import { initialColumns, deriveSectionOrder } from "../src/layout/columns";
import type { FilesSnapshot } from "../src/collections/types";
import type { Topic } from "../src/model/types";

const root = process.argv[2] ?? join(homedir(), "tmp/docu-test/docs");

const files: FilesSnapshot = {};
const walk = (dir: string): void => {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (docusaurusAdapter.ingests(name)) {
      files[relative(root, full).split("\\").join("/")] = readFileSync(full, "utf8");
    }
  }
};
walk(root);
console.log(`${Object.keys(files).length} files ingested from ${root}`);
console.log(`detect: ${docusaurusAdapter.detect(files)}`);

const { doc, warnings } = docusaurusAdapter.parse(files, "docusaurus");
const line = (t: Topic, depth: number): void => {
  console.log(`${"  ".repeat(depth)}- ${t.title}`);
  for (const c of t.children) line(c, depth + 1);
};
for (const s of doc.sections) {
  console.log(`\n■ ${s.title}${s.isOrphan ? " (page)" : ""}`);
  for (const t of s.topics) line(t, 1);
}
console.log(`\n${warnings.length} warnings:`);
for (const w of warnings) console.log(`  [${w.kind}] ${w.detail}`);

const order = deriveSectionOrder(initialColumns(doc));
const plan = docusaurusAdapter.planChanges!(files, doc, order);
console.log(`\nno-op plan: ${plan.changes.length} changes (MUST be 0)`);
if (plan.changes.length > 0) {
  for (const c of plan.changes.slice(0, 10)) {
    console.log(
      `  ${c.kind}: ${c.kind === "move" ? `${c.fromPath} → ${c.toPath}` : c.path}`,
    );
  }
  process.exit(1);
}
