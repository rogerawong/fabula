/**
 * receipt-constraints.ts — does telling the model actually change what
 * happens? (docs/10 amendment 2026-08-19)
 *
 * Drives the REAL client through the REAL pipeline against a REAL local
 * endpoint (`scripts/mock-provider.ts`), keyless. Nothing is patched, so
 * nothing can be left patched; the residue of a finished run is a killed
 * process.
 *
 * The mock's three modes answer the request they were SENT rather than a
 * canned string — they read the outline back out of the payload and find
 * the pinned rows by the mark the serializer wrote. That makes this a
 * small differential rather than a fixture echo: if the marking stopped
 * happening, the violation mode would find nothing to move and the
 * receipt would go quiet in a way the log names.
 *
 *   pnpm receipt-constraints
 *
 * Three verdicts, never two. A probe exception is INDETERMINATE and
 * fails the RUN as a harness defect — it must never collapse into a
 * measured absence, because absence is a legitimate answer here (the
 * compliant run must spend NO retry).
 */

import { spawn, type ChildProcess } from "node:child_process";
import { sphinxAdapter } from "@/collections/adapters/sphinx";
import type { FilesSnapshot } from "@/collections/types";
import { buildConstraints, pinnedRowCount } from "@/ai/constraints";
import { AiError, type ReorganizeOptions } from "@/ai/contract";
import { buildOutline } from "@/ai/outline";
import { runReorganize } from "@/ai/run";
import { useAiSettings } from "@/ai/settings";

const PORT = Number(process.env.MOCK_PORT ?? 8795);
const BASE = `http://localhost:${PORT}/v1`;

/**
 * A synthetic Sphinx project that produces locked rows — prose between
 * two toctree blocks locks the block above it as `outside-region`
 * (docs/19). Same shape as `e2e/flow12-lock-glyphs.spec.ts`, so the two
 * instruments disagree about the corpus only if one of them is wrong.
 */
const PROJECT: FilesSnapshot = {
  "conf.py": 'master_doc = "index"\nsource_suffix = ".rst"\n',
  "index.rst": ["Docs", "====", "", ".. toctree::", "", "   guides/index", ""].join("\n"),
  "guides/index.rst": [
    "Guides",
    "======",
    "",
    ".. toctree::",
    "",
    "   early",
    "   usage",
    "",
    "Prose between the blocks terminates the trailing sequence, so the",
    "block above locks as outside-region.",
    "",
    ".. toctree::",
    "",
    "   install",
    "",
  ].join("\n"),
  "guides/early.rst": "Early\n=====\n\nbody\n",
  "guides/usage.rst": "Using It\n========\n\nbody\n",
  "guides/install.rst": "Installing\n==========\n\nbody\n",
};

const OPTIONS: ReorganizeOptions = {
  mode: "grounded" as const,
  scopeSectionIds: null,
  allowRenames: false,
  allowNewSections: false,
  allowFileMoves: false,
  folderHints: false,
  granularity: "full",
};

type Verdict = "MEASURED-PRESENT" | "MEASURED-ABSENT" | "INDETERMINATE";
const results: { name: string; verdict: Verdict; note: string }[] = [];

function record(name: string, verdict: Verdict, note: string): void {
  results.push({ name, verdict, note });
  const mark =
    verdict === "MEASURED-PRESENT" ? "✓" : verdict === "MEASURED-ABSENT" ? "·" : "!";
  console.log(`${mark} ${name} — ${verdict}\n    ${note}`);
}

/** What the mock reported it actually DID, per call. The instrument's
 *  HEALTH, kept separate from its measurement: a violation mode that
 *  found nowhere to move a row has not tested anything, and that is a
 *  broken probe rather than a passing product. */
let mockMoves: string[] = [];

function startMock(mode: string): ChildProcess {
  mockMoves = [];
  const child = spawn(
    "pnpm",
    [
      "exec",
      "vite-node",
      "scripts/mock-provider.ts",
      "--",
      "--port",
      String(PORT),
      "--mode",
      mode,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout?.on("data", (b: Buffer) => {
    const text = String(b);
    for (const m of text.matchAll(/moved=(\S+)/g)) mockMoves.push(m[1]!);
    process.stdout.write(`    [mock] ${text}`);
  });
  return child;
}

async function waitForMock(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/models`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`mock never answered on ${BASE}`);
}

/** Count the requests that actually left, so "spent a retry" is a
 *  measurement and not an inference from the outcome. */
function counting(): { impl: typeof fetch; calls: () => number; bodies: string[] } {
  const bodies: string[] = [];
  const impl: typeof fetch = async (url, init) => {
    bodies.push(String(init?.body));
    return fetch(url, init);
  };
  return { impl, calls: () => bodies.length, bodies };
}

const { doc } = sphinxAdapter.parse(PROJECT, "");
const outline = buildOutline(doc, OPTIONS);
const pinned = pinnedRowCount(buildConstraints(doc, OPTIONS, outline.idMap));

console.log(`receipt-constraints: mock ${BASE}\n`);
console.log(`fixture    ${doc.sections.length} cards, ${outline.stats.topics} rows`);
console.log(`outline\n${outline.text.replace(/^/gm, "    ")}\n`);

useAiSettings.setState({
  providerId: "custom",
  baseUrl: BASE,
  model: "mock-model",
  apiKeys: { custom: "not-a-real-key" },
});

record(
  "0 · the fixture actually pins something",
  pinned > 0 ? "MEASURED-PRESENT" : "MEASURED-ABSENT",
  `${pinned} pinned rows; without these the three receipts below would ` +
    `pass vacuously — a violation mode with nothing to violate answers compliantly`,
);

async function receipt(
  name: string,
  mode: string,
  check: (r: { calls: number; bodies: string[]; error: AiError | null }) => {
    ok: boolean;
    note: string;
  },
): Promise<void> {
  const child = startMock(mode);
  try {
    await waitForMock();
    const { impl, calls, bodies } = counting();
    let error: AiError | null = null;
    try {
      await runReorganize({
        doc,
        options: OPTIONS,
        instructions: "balance the sections",
        fetchImpl: impl,
      });
    } catch (err) {
      if (!(err instanceof AiError)) throw err;
      error = err;
    }
    const { ok, note } = check({ calls: calls(), bodies, error });
    // The instrument reports its own health separately from its
    // measurement. A violation mode whose every answer was `moved=none`
    // drove a compliant run, so a green OR red verdict from it would be
    // about nothing.
    const violated = mockMoves.some((m) => m !== "none");
    if (mode.startsWith("violation") && !violated) {
      record(
        name,
        "INDETERMINATE",
        `the mock never moved a pinned row (${JSON.stringify(mockMoves)}) — ` +
          `it answered compliantly, so this receipt measured nothing`,
      );
      return;
    }
    record(
      name,
      ok ? "MEASURED-PRESENT" : "MEASURED-ABSENT",
      `${note}; mock ${JSON.stringify(mockMoves)}`,
    );
  } finally {
    child.kill("SIGTERM");
  }
}

try {
  await receipt(
    "1 · compliant: success path unchanged, NO extra call",
    "compliant",
    (r) => ({
      ok: r.error === null && r.calls === 1,
      note:
        `${r.calls} request(s), error ${r.error?.kind ?? "none"} — a mechanism that ` +
        `cost a second call on every run would be worse than the failure it fixes`,
    }),
  );

  await receipt(
    "2 · violation-once: the retry RESCUES the call",
    "violation-once",
    (r) => {
      const retry = r.bodies[1] ?? "";
      const named = /pinned in place/.test(retry) && /"[^"]+"/.test(retry);
      return {
        ok: r.error === null && r.calls === 2 && named,
        note:
          `${r.calls} request(s), error ${r.error?.kind ?? "none"}; retry payload ` +
          `${named ? "names the violated row" : "DOES NOT name the row"} — ` +
          `this is the outcome the arc exists to buy: a call that used to be ` +
          `spent now produces a result`,
      };
    },
  );

  await receipt("3 · violation twice: discard, under the NEW copy", "violation", (r) => {
    const message = r.error?.message ?? "";
    const newCopy = /request marks every pinned row/i.test(message);
    const retired = /try an instruction that leaves the pinned rows/i.test(message);
    return {
      ok: r.calls === 2 && r.error?.kind === "bad-response" && newCopy && !retired,
      note:
        `${r.calls} request(s); message ${JSON.stringify(message)}; ` +
        `new copy present ${newCopy}, retired advice present ${retired}`,
    };
  });
} catch (error) {
  record("probe", "INDETERMINATE", String(error));
}

console.log("\n── summary ─────────────────────────────");
for (const r of results) console.log(`${r.verdict.padEnd(17)} ${r.name}`);

if (results.some((r) => r.verdict === "INDETERMINATE")) {
  console.error("\nHARNESS DEFECT: a probe could not measure. Fix the probe.");
  process.exit(2);
} else if (results.some((r) => r.verdict === "MEASURED-ABSENT")) {
  console.error("\nA claim did not hold. Read the notes before opening product code.");
  process.exit(1);
}
process.exit(0);
