/**
 * survey-navtail.ts — `navTail` coverage, measured THROUGH THE SHIPPED
 * MODULE (docs/19's boundary law).
 *
 * docs/19 settled the boundary law by entry coverage: the strict reading
 * (blocks separated only by blanks) against the SPAN reading (a sequence
 * may be interrupted by a section heading). Those figures were taken by a
 * session-local harness that did not survive, so this script exists to
 * put them back in the repo where a regression can be seen.
 *
 * ONE IMPLEMENTATION, ONE COUNT — the lesson docs/19 itself records after
 * an independent scanner disagreed with the shipped one by under 2% and
 * that gap was very nearly written down as a tolerance. Every number here
 * comes from `navTailOf`, so a census and a product that disagree is not
 * a thing that can happen: there is only one rule and this reads it.
 *
 * The STRICT column is computed here rather than shipped, because it is
 * the road not taken — a counterfactual the decision rests on, not a
 * behaviour anything runs.
 *
 *   pnpm exec vite-node scripts/survey-navtail.ts ~/godot-docs --label godot
 *   pnpm exec vite-node scripts/survey-navtail.ts ~/linux-docs \
 *     --sub Documentation --label kernel
 *
 * Corpus clone commands live in `survey-toctree.ts`'s docblock.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { navTailOf, type NavTailRefusal } from "../src/collections/navTail";
import { scanToctrees } from "../src/collections/rst";

const args = process.argv.slice(2);
const root = args[0];
if (root === undefined) {
  console.error(
    "usage: vite-node scripts/survey-navtail.ts <root> [--sub d] [--label l]",
  );
  process.exit(1);
}
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const base = join(root, flag("--sub") ?? "");
const label = flag("--label") ?? relative(process.cwd(), base);

const files: string[] = [];
const walk = (dir: string): void => {
  for (const name of readdirSync(dir)) {
    if (name === ".git") continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs);
    else if (name.endsWith(".rst")) files.push(abs);
  }
};
walk(base);

/**
 * The counterfactual: entries the STRICT reading would leave editable.
 *
 * Same walk as `navTailOf`, with heading gaps disallowed — so it is the
 * region rule minus exactly one clause, which is the comparison the
 * decision needs. It duplicates a little of the module deliberately:
 * shipping a strict mode nothing calls would be staging a mechanism.
 */
function strictEditable(text: string): number {
  const region = navTailOf(text);
  if (!region.ok) return 0;
  const blocks = scanToctrees(text);
  const lines = text.split("\n");
  let first = blocks.length - 1;
  for (let i = blocks.length - 1; i > 0; i--) {
    let clean = true;
    for (let l = blocks[i - 1]!.endLine; l < blocks[i]!.startLine; l++) {
      if (lines[l]!.trim() !== "") {
        clean = false;
        break;
      }
    }
    if (!clean) break;
    first = i - 1;
  }
  return blocks.slice(first).reduce((n, b) => n + b.entries.length, 0);
}

let carriers = 0;
let entries = 0;
let editable = 0;
let strict = 0;
let outsideEntries = 0;
const outsideCarriers: string[] = [];
const refused: Record<NavTailRefusal, string[]> = {
  "no-toctree": [],
  "mid-file": [],
};

for (const abs of files) {
  const text = readFileSync(abs, "utf8");
  const blocks = scanToctrees(text);
  if (blocks.length === 0) continue;
  carriers++;
  entries += blocks.reduce((n, b) => n + b.entries.length, 0);
  const region = navTailOf(text);
  if (!region.ok) {
    refused[region.reason].push(relative(base, abs));
    continue;
  }
  // Entries INSIDE the region are the editable ones. A carrier whose
  // sequence starts at its second block keeps the first block's rows out
  // of reach — those lock as `outside-region` rather than condemning the
  // carrier, which is the boundary law applied to itself.
  const inRegion = blocks.slice(region.fromBlock);
  const outside = blocks.slice(0, region.fromBlock);
  editable += inRegion.reduce((n, b) => n + b.entries.length, 0);
  const locked = outside.reduce((n, b) => n + b.entries.length, 0);
  if (locked > 0) {
    outsideEntries += locked;
    outsideCarriers.push(relative(base, abs));
  }
  strict += strictEditable(text);
}

const pct = (n: number) => (entries === 0 ? "0" : ((n / entries) * 100).toFixed(1));
console.log(`===== ${label} =====`);
console.log(`root                 ${base}`);
console.log(`carriers             ${carriers}`);
console.log(`toctree entries      ${entries}`);
console.log(`editable, STRICT     ${strict}  (${pct(strict)}%)`);
console.log(`editable, SPAN       ${editable}  (${pct(editable)}%)`);
console.log("");
console.log("locked, and why");
console.log(`  mid-file carriers      ${refused["mid-file"].length}`);
console.log(`  no-toctree             ${refused["no-toctree"].length}`);
console.log(
  `  outside-region blocks  ${outsideEntries} entries in ${outsideCarriers.length} carriers`,
);
console.log("");
console.log(`MID-FILE FILE LIST (${refused["mid-file"].length})`);
for (const path of refused["mid-file"].sort()) console.log(`  ${path}`);
console.log("");
console.log(`OUTSIDE-REGION FILE LIST (${outsideCarriers.length})`);
for (const path of outsideCarriers.sort()) console.log(`  ${path}`);
console.log("");
console.log(
  "SUMMARY\tcorpus\tcarriers\tentries\tstrict\tstrict%\tspan\tspan%\tmidfile\toutside",
);
console.log(
  `SUMMARY\t${label}\t${carriers}\t${entries}\t${strict}\t${pct(strict)}\t${editable}\t${pct(editable)}\t${refused["mid-file"].length}\t${outsideCarriers.length}`,
);
