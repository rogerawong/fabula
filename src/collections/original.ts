/**
 * original.ts — the document as the SOURCE has it (docs/21, Decision 3).
 *
 * The derived half of the displacement ledger needs one thing the model
 * alone cannot supply: where each row sat before anything moved it. On a
 * collection tab that is recoverable — the snapshot rides
 * `doc.extras.files` through every rebuild, and re-parsing it yields the
 * original arrangement. This is the same comparison `planChanges`
 * already performs to declare `entryMoves`; the ledger runs it filtered
 * to pinned rows.
 *
 * NULL IS AN ANSWER, twice over: a FORMAT tab has no snapshot behind its
 * pins (Mintlify produces `external` and `pattern` locks from a JSON nav
 * with no files kept), and a collection tab whose snapshot failed to
 * re-parse has nothing to compare against either. Both fall back to the
 * recorded reading rather than to a guess — the ledger's selector owns
 * that decision, not the callers.
 *
 * NOT CACHED. Re-parsing a corpus is real work, so this is called where
 * the work is already being done — the Review dialog, which re-parses
 * the whole snapshot in `simulatePlan` on every open — and never on a
 * render path. The canvas badge and the Overview line read the RECORD
 * instead, which is sound because the two must agree and a test plus a
 * DEV assertion says so.
 */

import type { TocDocument } from "@/model/types";
import { getCollectionAdapter } from "./registry";
import { filesOf } from "./types";

export function originalDocumentOf(doc: TocDocument): TocDocument | null {
  const adapter = getCollectionAdapter(doc.formatId);
  if (!adapter) return null;
  const files = filesOf(doc);
  if (Object.keys(files).length === 0) return null;
  try {
    return adapter.parse(files, doc.name).doc;
  } catch {
    // A snapshot that will not re-parse is a fact about the snapshot,
    // not grounds for crashing the review dialog. The recorded reading
    // takes over and the ledger says so.
    return null;
  }
}
