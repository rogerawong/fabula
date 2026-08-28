/**
 * receipt-aspirational.ts — does the mode actually change what happens?
 * (docs/21)
 *
 * Drives the REAL client through the REAL pipeline against a REAL local
 * endpoint (`scripts/mock-provider.ts`), keyless. Nothing is patched, so
 * nothing can be left patched: the residue of a finished run is a killed
 * process, which is a state you can see. No API keys in an unattended
 * harness, standing rule.
 *
 * IT IS A DIFFERENTIAL, not a demonstration. The mock answers the
 * request it was SENT — it reads the outline back out of the payload and
 * finds the pinned rows by the mark the serializer wrote — and the SAME
 * mock, the SAME fixture and the SAME proposal are driven through both
 * modes. Grounded must discard it; aspirational must open it. A receipt
 * that only ran the new arm would pass just as happily if the old one
 * had been deleted.
 *
 *   pnpm receipt-aspirational
 *
 * THREE VERDICTS, NEVER TWO. A probe exception is INDETERMINATE and
 * fails the RUN as a harness defect. It must never collapse into a
 * measured absence, because absence is a legitimate answer here — the
 * aspirational run must spend NO retry, and "no second call" is a real
 * measurement rather than a failure to look.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { sphinxAdapter } from "@/collections/adapters/sphinx";
import { deriveSectionOrder, initialColumns } from "@/layout/columns";
import type { FilesSnapshot } from "@/collections/types";
import { renderPatch } from "@/collections/diff";
import { buildConstraints, pinnedRowCount } from "@/ai/constraints";
import { AiError, type ReorganizeOptions, type RunMode } from "@/ai/contract";
import { buildOutline } from "@/ai/outline";
import { runReorganize } from "@/ai/run";
import { useAiSettings } from "@/ai/settings";
import {
  applyableProjection,
  buildChecklist,
  checklistText,
  recordedLedger,
} from "@/model/ledger";
import type { TocDocument } from "@/model/types";

const PORT = Number(process.env.MOCK_PORT ?? 8797);
const BASE = `http://localhost:${PORT}/v1`;

/**
 * The SAME synthetic Sphinx project `receipt-constraints.ts` and
 * `e2e/flow14` use — prose between two toctree blocks locks the block
 * above it as `outside-region` (docs/19). Three instruments, one corpus:
 * they can disagree about it only if one of them is wrong.
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

const OPTIONS = (mode: RunMode): ReorganizeOptions => ({
  mode,
  scopeSectionIds: null,
  allowRenames: false,
  allowNewSections: false,
  allowFileMoves: false,
  folderHints: false,
  granularity: "full",
});

type Verdict = "MEASURED-PRESENT" | "MEASURED-ABSENT" | "INDETERMINATE";
const results: { name: string; verdict: Verdict; note: string }[] = [];

function record(name: string, verdict: Verdict, note: string): void {
  results.push({ name, verdict, note });
  const mark =
    verdict === "MEASURED-PRESENT" ? "✓" : verdict === "MEASURED-ABSENT" ? "·" : "!";
  console.log(`${mark} ${name} — ${verdict}\n    ${note}`);
}

/** What the mock reported it actually DID. The instrument's HEALTH, kept
 *  separate from its measurement: a violation mode that found nowhere to
 *  move a row drove a COMPLIANT run, so any verdict from it is about
 *  nothing. */
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

/** Count the requests that actually left, so "spent no retry" is a
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
const outline = buildOutline(doc, OPTIONS("grounded"));
const pinned = pinnedRowCount(buildConstraints(doc, OPTIONS("grounded"), outline.idMap));

console.log(`receipt-aspirational: mock ${BASE}\n`);
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
  `${pinned} pinned rows; with none of them the differential below is two ` +
    `identical compliant runs and proves nothing about either mode`,
);

interface Run {
  calls: number;
  bodies: string[];
  error: AiError | null;
  result: TocDocument | null;
  needsHand: number;
}

async function drive(mode: RunMode): Promise<Run> {
  const { impl, calls, bodies } = counting();
  let error: AiError | null = null;
  let result: TocDocument | null = null;
  let needsHand = 0;
  try {
    const run = await runReorganize({
      doc,
      options: OPTIONS(mode),
      instructions: "balance the sections",
      fetchImpl: impl,
    });
    result = run.doc;
    needsHand = run.summary.aspirational.needsHand;
  } catch (err) {
    if (!(err instanceof AiError)) throw err;
    error = err;
  }
  return { calls: calls(), bodies, error, result, needsHand };
}

const planFor = (d: TocDocument) =>
  sphinxAdapter.planChanges!(PROJECT, d, deriveSectionOrder(initialColumns(d)));
const planOf = (d: TocDocument) => renderPatch(planFor(d).changes, PROJECT);

const child = startMock("violation");
try {
  await waitForMock();

  const grounded = await drive("grounded");
  const groundedMoves = [...mockMoves];
  mockMoves = [];
  const aspirational = await drive("aspirational");

  // THE INSTRUMENT'S HEALTH, before any measurement is believed. A
  // violation mode whose every answer was `moved=none` answered
  // compliantly, and a green OR a red from it would be about nothing.
  const violated = [...groundedMoves, ...mockMoves].some((m) => m !== "none");
  if (!violated) {
    record(
      "1–8 · the differential",
      "INDETERMINATE",
      `the mock never moved a pinned row (${JSON.stringify([
        ...groundedMoves,
        ...mockMoves,
      ])}) — it answered compliantly, so nothing below measured anything`,
    );
  } else {
    record(
      "1 · GROUNDED discards the same proposal",
      grounded.error !== null && /pinned in place/.test(grounded.error.message)
        ? "MEASURED-PRESENT"
        : "MEASURED-ABSENT",
      `error ${grounded.error?.kind ?? "none"} — ${
        grounded.error?.message.slice(0, 70) ?? "the run succeeded"
      }`,
    );

    record(
      "2 · ASPIRATIONAL opens it",
      aspirational.error === null && aspirational.result !== null
        ? "MEASURED-PRESENT"
        : "MEASURED-ABSENT",
      `error ${aspirational.error?.kind ?? "none"} — the identical answer, ` +
        `from the identical endpoint, on the identical corpus`,
    );

    record(
      "3 · and spends NO retry doing it",
      // A real measurement, not an inference: grounded's pre-check finds
      // the violation and buys a second call; aspirational's arm returns
      // [] because a pinned move is not a violation there.
      aspirational.calls === 1 && grounded.calls === 2
        ? "MEASURED-PRESENT"
        : "MEASURED-ABSENT",
      `aspirational ${aspirational.calls} request(s), grounded ${grounded.calls} — ` +
        `the retry is reserved for parse errors in aspirational mode`,
    );

    const asked = aspirational.bodies[0] ?? "";
    record(
      "4 · the request carried the aspirational framing, not the grounded threat",
      asked.includes("the app cannot write a move of these rows") &&
        !asked.includes("causes the whole answer to be rejected")
        ? "MEASURED-PRESENT"
        : "MEASURED-ABSENT",
      `payload ${asked.length} bytes; the marker itself is identical in both ` +
        `modes, so the block is the whole difference`,
    );

    const records = aspirational.result ? recordedLedger(aspirational.result) : [];
    record(
      "5 · the result carries one PIN record, with its origin",
      records.length === 1 &&
        records[0]!.kind === "pin" &&
        records[0]!.originalParentTitle.length > 0
        ? "MEASURED-PRESENT"
        : "MEASURED-ABSENT",
      records.length === 1
        ? `"${records[0]!.title}" — imagined elsewhere, stays under ` +
            `"${records[0]!.originalParentTitle}"; summary says needsHand=${aspirational.needsHand}`
        : `${records.length} records`,
    );

    /**
     * INVARIANT 3, against the REAL Sphinx planner — and split in two,
     * because the first draft of this receipt was VACUOUS and looked
     * green.
     *
     * It compared plan(projection) against plan(source) and reported
     * "1 bytes vs 1". Both were empty, and so was plan(DISPLACED): on
     * this corpus the adapter refuses a pinned move outright, so all
     * three agreed by having nothing in them. A byte-equality between
     * two empty strings is not evidence about a projection.
     *
     * What is actually measurable here is better stated as two facts:
     * the projection plans exactly what the source arrangement plans,
     * AND the adapter's own refusal fires on the displaced arrangement —
     * which is invariant 1's BELT, the outer of the two independent
     * layers, working. The STRONG form of the equivalence (non-empty
     * plans, unrelated edits riding along) lives in
     * `src/collections/__tests__/projection.test.ts` against the Hugo
     * planner, where a corpus exists that can express it.
     */
    const projection = aspirational.result
      ? applyableProjection(
          {
            doc: aspirational.result,
            sectionOrder: aspirational.result.sections.map((s) => s.id),
          },
          { records },
        ).doc
      : null;
    record(
      "6 · plan(projection) is byte-identical to plan(the source arrangement)",
      projection !== null && planOf(projection) === planOf(doc)
        ? "MEASURED-PRESENT"
        : "MEASURED-ABSENT",
      projection
        ? `${planOf(projection).length} vs ${planOf(doc).length} bytes — both empty ` +
            `on this corpus, so this is the WEAK form; the strong one (non-empty ` +
            `plans, unrelated edits riding along) is projection.test.ts`
        : "no result to project",
    );

    const displacedPlan = aspirational.result ? planFor(aspirational.result) : null;
    const blocking = displacedPlan?.warnings.filter((w) => w.blocking) ?? [];
    record(
      "7 · the adapter refuses the DISPLACED arrangement anyway (invariant 1's belt)",
      blocking.length > 0 ? "MEASURED-PRESENT" : "MEASURED-ABSENT",
      blocking.length > 0
        ? `${blocking.length} blocking warning(s): ${blocking[0]!.detail.slice(0, 90)} — ` +
            `two independent layers, and this is the outer, shipped one`
        : `no blocking warning; the plan carried ${displacedPlan?.changes.length ?? 0} change(s)`,
    );

    const list = aspirational.result
      ? checklistText(
          buildChecklist(aspirational.result, records, { consentDeclined: true }),
        ).join("\n")
      : "";
    record(
      "8 · the checklist names the row, its cause and its remedy",
      /needs your hand/.test(list) &&
        /above prose/.test(list) &&
        /To make this real:/.test(list)
        ? "MEASURED-PRESENT"
        : "MEASURED-ABSENT",
      list.split("\n").slice(0, 4).join(" / ").slice(0, 160),
    );
  }
} finally {
  child.kill("SIGTERM");
}

const absent = results.filter((r) => r.verdict !== "MEASURED-PRESENT");
console.log(
  `\n${results.length - absent.length}/${results.length} MEASURED-PRESENT` +
    (absent.length ? ` — ${absent.map((r) => r.name).join("; ")}` : ""),
);
process.exit(absent.length === 0 ? 0 : 1);
