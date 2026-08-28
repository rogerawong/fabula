/**
 * fixpoint.ts — M1 definition-of-done check (docs/08-roadmap.md):
 * "a script can parse the sample and serialize it back to a fixpoint."
 *
 * Run with: pnpm fixpoint
 * (vite-node, so `?raw` imports and `@/` aliases work as in the app.)
 */

import { FORMAT_ADAPTERS } from "@/formats/registry";

let failed = false;

for (const adapter of FORMAT_ADAPTERS) {
  if (!adapter.sample) {
    console.log(`- ${adapter.id}: no sample, skipped`);
    continue;
  }
  const { fileName, content } = adapter.sample;
  const doc = adapter.parse(content, fileName);
  const order = doc.sections.map((s) => s.id);
  const out1 = adapter.serialize(doc, order);
  const reparsed = adapter.parse(out1, fileName);
  const out2 = adapter.serialize(
    reparsed,
    reparsed.sections.map((s) => s.id),
  );

  const ok = out1 === out2;
  console.log(
    `- ${adapter.id}: ${doc.sections.length} sections, ` +
      `serialize fixpoint ${ok ? "OK" : "FAILED"}`,
  );
  if (!ok) failed = true;
}

if (failed) {
  process.exit(1);
}
console.log("fixpoint: all adapters stable");
