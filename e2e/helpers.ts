/** Shared e2e helpers — notably the zero-console-errors rule (docs/07). */

import { expect, type Page } from "@playwright/test";

/**
 * Start collecting console errors + page errors. Call the returned
 * assert at the end of every flow — zero errors tolerated.
 * `ignore` patterns exempt EXPECTED noise (e.g. Chromium logs a console
 * error for any non-2xx response a test deliberately provokes).
 */
export function watchConsole(
  page: Page,
  opts?: { ignore?: RegExp[] },
): { assertClean: () => void } {
  const errors: string[] = [];
  const ignored = (text: string) => opts?.ignore?.some((re) => re.test(text)) ?? false;
  page.on("console", (msg) => {
    if (msg.type() === "error" && !ignored(msg.text())) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return {
    assertClean: () => expect(errors, "console must stay clean").toEqual([]),
  };
}
