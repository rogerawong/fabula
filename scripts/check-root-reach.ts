/**
 * check-root-reach.ts — the picker's label IS its own oracle (docs/19).
 *
 * REACH is what the picker shows beside each candidate, and it falls out
 * of the same closure walk the import uses. That makes it checkable
 * against numbers already known from elsewhere:
 *
 *   godot   `index`    reaches 1,594 — its measured closure exactly
 *   cpython `contents` reaches   528 — its entry count
 *
 * So the number a user reads to CHOOSE is the number that proves the
 * walk is right, and a regression in the walk shows up as a wrong label
 * rather than as nothing at all.
 *
 * Skips WITH ITS REASON where a corpus is absent, and never runs in CI.
 *
 *   bash scripts/receipt-sphinx-tail.sh   # unrelated; this is standalone
 *   pnpm exec vite-node scripts/check-root-reach.ts
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { rootCandidates } from "../src/collections/adapters/sphinx";
import type { FilesSnapshot } from "../src/collections/types";

function snapshot(root: string): FilesSnapshot {
  const files: FilesSnapshot = {};
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name === ".git") continue;
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (name.endsWith(".rst") || name === "conf.py") {
        files[relative(root, abs)] = readFileSync(abs, "utf8");
      }
    }
  };
  walk(root);
  return files;
}

/** corpus → the candidate whose reach is known, and the known number. */
const EXPECTED: { label: string; root: string; docname: string; reach: number }[] = [
  {
    label: "godot",
    root: join(homedir(), "godot-docs"),
    docname: "index",
    // docs/12's measured closure: 1594 reachable documents.
    reach: 1594,
  },
  {
    label: "cpython",
    root: join(homedir(), "corpora/cpython/Doc"),
    docname: "contents",
    // Its entry count, from the block census.
    reach: 528,
  },
];

let failed = 0;
let ran = 0;
for (const want of EXPECTED) {
  if (!existsSync(want.root)) {
    console.log(`${want.label}: SKIPPED — no corpus at ${want.root}`);
    continue;
  }
  ran++;
  const candidates = rootCandidates(snapshot(want.root));
  const found = candidates.find((c) => c.docname === want.docname);
  if (found === undefined) {
    console.error(
      `${want.label}: FAIL — "${want.docname}" is not a candidate. Found: ` +
        candidates.map((c) => `${c.docname}(${c.reach})`).join(", "),
    );
    failed++;
    continue;
  }
  if (found.reach !== want.reach) {
    console.error(
      `${want.label}: FAIL — "${want.docname}" reaches ${found.reach}, expected ${want.reach}`,
    );
    failed++;
    continue;
  }
  console.log(
    `${want.label}: ok — "${want.docname}" reaches ${found.reach}, ` +
      `matching the number measured elsewhere`,
  );
}

if (ran === 0) {
  console.log("check-root-reach: no corpora present; nothing measured.");
}
process.exit(failed === 0 ? 0 : 1);
