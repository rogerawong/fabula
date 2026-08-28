/**
 * Vitest global setup. Property tests run with a FIXED seed in CI
 * (reproducible failures) and a free seed locally (docs/07).
 *
 * A property failure already prints its own reproduction — fast-check
 * appends `{ seed, path, endOnFailure }` to the message — so the seed is
 * captured without help. What was missing is the way back IN: replaying
 * a printed seed meant editing this file. `FC_SEED` closes that loop, so
 * a failing run's last line is a command you can paste:
 *
 *     FC_SEED=-1623943972 pnpm test src/commands/__tests__/undo.test.ts
 *
 * It overrides CI's fixed seed too, which is the case that matters: a
 * red CI run is reproduced locally by copying one number.
 */

import fc from "fast-check";

const seed = process.env.FC_SEED ?? (process.env.CI ? "20260718" : undefined);
if (seed !== undefined) fc.configureGlobal({ seed: Number(seed) });
