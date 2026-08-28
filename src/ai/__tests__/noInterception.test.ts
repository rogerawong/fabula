/**
 * noInterception.test.ts — the shipped app intercepts nothing.
 *
 * WHY THIS EXISTS. A forced-failure receipt for the capture affordance
 * was collected by registering a Playwright `page.route` against
 * `api.anthropic.com/**` on a long-lived browser page, and the route was
 * never removed. The next person to use that browser got the canned
 * fixture back — for a POST to `/chat/completions` AND for a GET to
 * `/models`, since the glob matched every path and method — and it read
 * exactly like a live model failure, complete with a plausible rejected
 * proposal. The instrument produced a product defect that was not there.
 *
 * WHAT THIS TEST ENFORCES: that no module under `src/` reaches for the
 * constructs that would let the SHIPPED app do the same thing —
 * assigning over `fetch`, installing a service worker, or importing a
 * mocking library. Asserted on the CONSTRUCTION, never on vocabulary,
 * so the prose that explains the fence does not trip it.
 *
 * WHAT THIS TEST DOES NOT ENFORCE — and the gap is the whole reason the
 * incident happened, so it is written down rather than left implied:
 *
 *   A Playwright route lives in the TEST DRIVER's process, not in the
 *   page. No assertion running inside this repo's source can observe
 *   it, and this one cannot. A green result here says the product does
 *   not intercept; it says NOTHING about whether the browser a receipt
 *   was collected in had a route registered.
 *
 * That gap is closed by procedure, not by code: a receipt must carry
 * per-request provenance (an Anthropic `request_id`, a `cf-ray`, a real
 * status the fixture never returns), and forced-failure receipts should
 * be driven through a real local endpoint rather than by patching the
 * browser at all. `scripts/mock-provider.ts` exists for that.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Strip comments and string literals: a fence that fails on its own
 *  explanation is a fence people learn to disable. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

const FORBIDDEN: { name: string; re: RegExp }[] = [
  // assigning over fetch, on any global object
  {
    name: "fetch reassignment",
    re: /\b(?:globalThis|window|self|global)\s*\.\s*fetch\s*=/,
  },
  // NO bare `fetch = x` rule. The first cut had one and it FALSE-BROKE
  // on `fetchImpl: typeof fetch = fetch` in `view/loadCollection.ts` —
  // a parameter default, not a patch. It is dropped rather than
  // tightened because the vector it aimed at does not exist here:
  // TypeScript refuses assignment to the global `fetch` binding, so a
  // real patch has to go through one of the qualified forms above.
  // Recorded because a probe that reported working code as broken is
  // this harness's commonest defect, and this one did it on its first
  // run.
  // service workers can intercept every request in the page
  { name: "service worker registration", re: /navigator\s*\.\s*serviceWorker/ },
];

// The import check needs the ORIGINAL text (module specifiers are
// strings, which `code()` blanks), so it is asserted separately.
const MOCK_LIBS = /from\s*["'](?:msw|msw\/[^"']*|nock|fetch-mock|jest-fetch-mock)["']/;

describe("the shipped app intercepts nothing", () => {
  const files = sourceFiles(SRC).filter((f) => !f.includes("__tests__"));

  it("has source files to scan, or this fence is vacuous", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("never assigns over fetch and never registers a service worker", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const stripped = code(readFileSync(file, "utf8"));
      for (const { name, re } of FORBIDDEN) {
        if (re.test(stripped)) offenders.push(`${file.replace(SRC, "src")} — ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("imports no request-mocking library", () => {
    const offenders = files.filter((f) => MOCK_LIBS.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => f.replace(SRC, "src"))).toEqual([]);
  });

  it("the scanner actually catches what it claims to", () => {
    // Mutation check inline: a fence nobody has seen fail is a fence
    // nobody knows the polarity of.
    // looked up by NAME, not index: the first cut indexed into the
    // array and silently pointed at the wrong rule the moment one was
    // removed
    const rule = (name: string) => FORBIDDEN.find((r) => r.name === name)!.re;

    const patched = code(`export function x() { globalThis.fetch = myFetch; }`);
    expect(rule("fetch reassignment").test(patched)).toBe(true);

    const sw = code(`navigator.serviceWorker.register("/sw.js");`);
    expect(rule("service worker registration").test(sw)).toBe(true);

    expect(MOCK_LIBS.test(`import { setupWorker } from "msw/browser";`)).toBe(true);

    // and does not fire on prose that merely discusses the hazard
    const prose = code(`/* we never set globalThis.fetch = anything */\nconst ok = 1;`);
    expect(rule("fetch reassignment").test(prose)).toBe(false);
  });
});
