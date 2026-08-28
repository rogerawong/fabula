/**
 * permissions.ts — may THIS run change a topic's parent? (docs/16)
 *
 * One rule, three consumers: the prompt (which must state it), the
 * reconstruction net (which enforces it), and the dialog's payload
 * preview (which shows the user what will be sent). They have to agree,
 * and the way they agree is by asking here rather than each re-deriving
 * `capability && toggle`.
 *
 * The two halves are different questions and stay separate names:
 *
 * - **capability** — can this documentation system RECORD a parent
 *   change at all? A property of the adapter, the same one the drag and
 *   the planner consult.
 * - **permission** — did the user agree to it THIS TIME? A per-run
 *   choice, default off, never inherited from a preset.
 *
 * Either false refuses. Collapsing them back into one is a regression
 * that is always one `&&` away, which is why the absence test asserts
 * the conjunction on an adapter whose capability is TRUE.
 */

import { reparentCapability } from "@/formats/registry";
import { getCollectionAdapter } from "@/collections/registry";
import type { TocDocument } from "@/model/types";
import type { ReorganizeOptions } from "./contract";

export function fileMovesAllowed(
  doc: TocDocument,
  options: Pick<ReorganizeOptions, "allowFileMoves">,
): boolean {
  // The capability is absolute: a system that cannot record a parent
  // change refuses regardless of what anyone consented to.
  if (!reparentCapability(doc)) return false;
  // The PERMISSION only gates where there is a consequence to permit.
  // On a nav-owned adapter a parent change is a metadata or nav edit
  // with nothing on disk to consent to, so requiring a toggle there
  // would refuse every MkDocs reorganize on behalf of a risk that does
  // not exist — and docs/16 is explicit that nothing about JTD or
  // Mintlify changes. Found by 18 existing tests going red, which is
  // what they are for.
  if (!movesFilesOnReparent(doc)) return true;
  return options.allowFileMoves;
}

/**
 * Does this document's format relocate FILES for a parent change?
 *
 * What decides whether the toggle is SHOWN at all — and therefore
 * whether consent is asked for. DECLARED by the adapter, never inferred
 * from a list of ids here.
 *
 * A hardcoded list was the first cut and it fails silent in the
 * dangerous direction: an adapter nobody remembered to add is treated
 * as nav-owned, so the toggle never appears, so a reorganize relocates
 * files with no consent asked. The declaration puts the fact where the
 * fact lives, and being REQUIRED on the interface means `pnpm check`
 * names the next adapter that forgets rather than a user discovering it
 * in `git status`.
 *
 * Single-file FORMAT adapters (DocFX, MkDocs, Mintlify) answer false by
 * construction: their nav IS one file, so a parent change rewrites that
 * file and no page moves. There is nothing for them to declare.
 */
/**
 * Must every node in this document's navigation name a page?
 *
 * The discriminant behind "a block is not an entry" (docs/19). Asked
 * here rather than re-derived, because the prompt that STATES the rule,
 * the net that ENFORCES it and any surface that shows it are three
 * consumers of one fact — the shape `guards.ts` exists to keep.
 *
 * A format-adapter document answers FALSE: a nav file can express a
 * group with children and no page, which is what MkDocs and DocFX do.
 */
export function nodesNeedTargets(doc: TocDocument): boolean {
  return getCollectionAdapter(doc.formatId)?.nodesNeedTargets ?? false;
}

export function movesFilesOnReparent(doc: TocDocument): boolean {
  return getCollectionAdapter(doc.formatId)?.reparentMovesFiles ?? false;
}
