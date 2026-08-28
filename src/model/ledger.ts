/**
 * ledger.ts — what THIS ARRANGEMENT has displaced (docs/21, Decision 3).
 *
 * DOCUMENT-SIDE TRUTH, and the boundary matters. `ai/constraints.ts` is
 * RUN-side truth — what this run tells the model and pre-checks. This
 * answers a different question: what has this arrangement displaced,
 * whoever displaced it. Keeping them apart is the run-mode/tab-state
 * split one layer down, and the reason the first draft's "a third
 * consumer joins the RunConstraint union" was withdrawn.
 *
 * A LEDGER IS A FACT ABOUT THE ARRANGEMENT, so it is never stored as a
 * count and never stamped at tab creation. With the manual gesture in
 * scope a hand can displace a fourth row a week after the tab was born,
 * and every consumer of a stored count starts lying the moment it does.
 *
 * TWO MECHANISMS, ONE SELECTOR:
 *
 * - **Derived**, wherever an ORIGINAL document is available (a
 *   collection tab, whose snapshot re-parses into one). Placement now
 *   versus placement then, filtered to pinned rows — the comparison
 *   `planChanges` already performs to declare `entryMoves`. Correct
 *   regardless of which producer displaced the row, and undo-safe for
 *   free: undo changes the model, the next derivation reflects it.
 * - **Recorded**, on `Topic.displaced`, where there is no snapshot
 *   behind the pin (a Mintlify tab). Written by the displacing act,
 *   riding Immer patches so undo removes the move and the record
 *   together.
 *
 * On a collection tab BOTH exist and must AGREE — the
 * display-is-its-own-oracle rule (docs/19's reach label). The DEV
 * assertion below and `src/model/__tests__/ledgerOracle.test.ts` are
 * what turn a producer that forgot to write, or a carry path that
 * dropped the field, into a red check instead of a wrong badge.
 *
 * The oracle deliberately does NOT cover `consent` records: there is no
 * second derivation to check them against, and inventing one would mean
 * deriving a fact — who consented — that placement cannot carry.
 */

import { LOCK_LABEL, lockUnbolt } from "./locks";
import { chainKey } from "./selectors";
import { cloneTopic } from "./tree";
import type {
  ContainerDescriptor,
  DisplacementKind,
  LockKind,
  Section,
  SectionId,
  TocDocument,
  Topic,
} from "./types";
import type { StructuralRemainder } from "./remainders";

/**
 * One entry in the ledger, assembled by the selector from either source.
 *
 * Topic-anchored by construction: every kind names a row that sits
 * somewhere it would not be written. The one classified violation that
 * is NOT about a row — an emptied never-empty container — is a fact
 * about the CONTAINER and derives from the document instead
 * (`emptiedNeverEmpty` below), which is why it is not a member here.
 */
export interface LedgerRecord {
  topicId: string;
  /** The row's current title — copy for the badge, the checklist and
   *  the Overview line. */
  title: string;
  kind: DisplacementKind;
  /** `pin` records only: which of the seven kinds pins the row, so the
   *  badge and the checklist can speak the lock legend's own words. */
  lockKind?: LockKind;
  originalParentId: string;
  originalParentTitle: string;
  originalIndex: number;
  /**
   * The file whose construct pins the row.
   *
   * ABSENT, NEVER GUESSED (the guard-consumes-declared-inputs rule).
   * Derivable where an original document is available — it is the
   * original parent's own path — and absent on a format tab, where
   * nothing can name it.
   */
  carrier?: string;
}

/** Where a row sat, and among how many siblings. */
interface Placement {
  parentId: string;
  parentKey: string;
  parentTitle: string;
  parentPath?: string;
  index: number;
}

/**
 * A node's NATURAL key — the name that survives a re-parse.
 *
 * Model ids do NOT: `newId()` is a random uuid and a parse mints fresh
 * ones for every node, deliberately (random, never sequential — a
 * sequential counter has to be re-seeded after hydration, and
 * forgetting once collides new ids with persisted ones). So any comparison
 * between the CURRENT document and a re-parsed snapshot has to key on
 * something the source itself carries.
 *
 * This is `sphinx.ts`'s `entryKey`, verbatim in shape and for the same
 * reason: it is how `planChanges` already declares `entryMoves`, which
 * is the comparison the ledger's derived reading runs filtered to pinned
 * rows. Two derivations of one idea would be two things to keep in step,
 * so this one is stated in the neutral layer both can reach.
 *
 * A page's path where it has one; its title otherwise, prefixed so a
 * title can never collide with a path.
 */
export function naturalKey(node: { path?: string; title: string }): string {
  return node.path ?? `~${node.title}`;
}

function placementIndex(sections: readonly Section[]): Map<string, Placement> {
  const out = new Map<string, Placement>();
  const walk = (
    nodes: readonly Topic[],
    parent: { id: string; title: string; path?: string },
  ): void => {
    nodes.forEach((t, index) => {
      out.set(naturalKey(t), {
        parentId: parent.id,
        parentKey: naturalKey(parent),
        parentTitle: parent.title,
        ...(parent.path !== undefined ? { parentPath: parent.path } : {}),
        index,
      });
      walk(t.children, { id: t.id, title: t.title, path: t.path });
    });
  };
  for (const s of sections) walk(s.topics, { id: s.id, title: s.title, path: s.path });
  return out;
}

/** Every node in this document, addressed by its natural key — so a fact
 *  read out of a re-parsed snapshot can be pointed back at the node the
 *  user is actually looking at. */
function idByNaturalKey(doc: TocDocument): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (nodes: readonly Topic[]): void => {
    for (const t of nodes) {
      out.set(naturalKey(t), t.id);
      walk(t.children);
    }
  };
  for (const s of doc.sections) {
    out.set(naturalKey(s), s.id);
    walk(s.topics);
  }
  return out;
}

function eachTopic(doc: TocDocument, visit: (t: Topic) => void): void {
  const walk = (nodes: readonly Topic[]): void => {
    for (const t of nodes) {
      visit(t);
      walk(t.children);
    }
  };
  for (const s of doc.sections) walk(s.topics);
}

/**
 * Does this arrangement hold any displacement at all?
 *
 * The BIRTH RULE's second clause (docs/21, Decision 2) reads this: a tab
 * holding displacements cannot honestly wear the Grounded promise,
 * whatever run produced it. Reads the RECORD rather than deriving,
 * because a tab is born before anything has re-parsed a snapshot for it
 * — and reconstruction writes the record on every path that creates one.
 */
export function hasDisplacements(doc: TocDocument): boolean {
  let found = false;
  eachTopic(doc, (t) => {
    if (t.displaced) found = true;
  });
  return found;
}

/**
 * The RECORDED reading: one entry per row carrying a `displaced` field.
 *
 * O(rows) and snapshot-free, which is why the canvas badge and the
 * Overview line read this rather than the selector of record. That is
 * sound BECAUSE of the oracle: on a collection tab the two must agree,
 * and a disagreement is a red check.
 */
/**
 * One row's own record, as a `LedgerRecord`.
 *
 * The canvas badge reads THIS rather than the selector of record: it is
 * O(1) per row on a render path, and it is sound because on a collection
 * tab the derived and recorded readings must agree — a test and a DEV
 * assertion say so, which is what turns the shortcut into a shortcut
 * rather than a second source of truth.
 */
export function recordOf(topic: Topic): LedgerRecord | null {
  if (!topic.displaced) return null;
  return {
    topicId: topic.id,
    title: topic.title,
    kind: topic.displaced.kind,
    ...(topic.lock ? { lockKind: topic.lock.kind } : {}),
    originalParentId: topic.displaced.parentId,
    originalParentTitle: topic.displaced.parentTitle,
    originalIndex: topic.displaced.index,
  };
}

export function recordedLedger(doc: TocDocument): LedgerRecord[] {
  const out: LedgerRecord[] = [];
  eachTopic(doc, (t) => {
    const record = recordOf(t);
    if (record) out.push(record);
  });
  return out;
}

/**
 * The DERIVED reading of `pin` records: pinned rows whose PARENT differs
 * from the original document's.
 *
 * PARENT CHANGE ONLY, matching the net it mirrors (`validate.ts`): no
 * lock kind says anything about POSITION, so a pinned row that merely
 * changed its index among its own siblings has not been displaced.
 */
export function derivedPinRecords(
  current: TocDocument,
  original: TocDocument,
): LedgerRecord[] {
  const was = placementIndex(original.sections);
  const now = placementIndex(current.sections);
  const idOf = idByNaturalKey(current);
  const out: LedgerRecord[] = [];
  eachTopic(current, (t) => {
    if (t.lock === undefined) return;
    const key = naturalKey(t);
    const before = was.get(key);
    const after = now.get(key);
    // A row the snapshot does not contain has no original placement to
    // compare against — a guard consumes DECLARED inputs, so this checks
    // nothing rather than treating "absent from the source" as "moved".
    if (!before || !after || before.parentKey === after.parentKey) return;
    out.push({
      topicId: t.id,
      title: t.title,
      kind: "pin",
      lockKind: t.lock.kind,
      // Resolved back into THIS document, because the projection uses it
      // as an address. An original parent that is no longer in the
      // document resolves to nothing, and the record then carries the
      // re-parsed id — which points at no node here, which is exactly
      // what "that parent is gone" means. The field keeps one referent.
      originalParentId: idOf.get(before.parentKey) ?? before.parentId,
      originalParentTitle: before.parentTitle,
      originalIndex: before.index,
      ...(before.parentPath !== undefined ? { carrier: before.parentPath } : {}),
    });
  });
  return out;
}

/**
 * THE SELECTOR OF RECORD.
 *
 * `pin` records derived where an original exists, recorded otherwise;
 * every other kind read from the record on every tab, because none of
 * them is derivable from placement alone. One function, so the
 * derived-vs-recorded decision cannot be made differently by two
 * callers.
 *
 * @param original the document as the source has it — a collection
 * snapshot re-parsed (`originalDocumentOf`), or null on a format tab.
 */
export function ledgerOf(
  doc: TocDocument,
  original: TocDocument | null | undefined,
): LedgerRecord[] {
  const recorded = recordedLedger(doc);
  if (!original) return recorded;

  const derived = derivedPinRecords(doc, original);
  const others = recorded.filter((r) => r.kind !== "pin");

  if (import.meta.env?.DEV) {
    // THE DISPLAY IS ITS OWN ORACLE. Both sources answer the same
    // question here, so a disagreement is never a difference of opinion
    // — it names a producer that forgot to write `displaced`, or a
    // rebuild path that dropped it. Louder than a wrong badge, which
    // nothing would ever contradict.
    const recordedPins = recorded.filter((r) => r.kind === "pin").map((r) => r.topicId);
    const derivedPins = derived.map((r) => r.topicId);
    const same =
      recordedPins.length === derivedPins.length &&
      [...recordedPins].sort().every((id, i) => id === [...derivedPins].sort()[i]);
    if (!same) {
      console.error("[ledger] derived and recorded pin records disagree", {
        derived: derivedPins,
        recorded: recordedPins,
      });
    }
  }

  return [...derived, ...others];
}

/**
 * Never-empty containers this arrangement leaves with no cards.
 *
 * DERIVED, and deliberately not a ledger record: the fact is about a
 * CONTAINER, and every `LedgerRecord` names a row. Recomputed from the
 * declared registry and the current cards, so it survives undo by
 * construction and needs no producer to remember anything.
 *
 * EMPTY, NOT EMPTIED — and the difference is worth stating rather than
 * hiding, because it is the temporal conflation this project pays for.
 * `emptiedContainers` can ask the sharper question because it is handed
 * a before AND an after; a standing tab has only the after. What makes
 * the weaker predicate safe here is that it is a DISPLAY, not a refusal:
 * the only other way a never-empty container can hold no cards is an
 * adapter declaring one that its own source forbids (Mintlify's
 * `tabs.groups` is `minItems: 1`), which `lintContainers` already calls
 * an adapter bug. At apply time the sharper predicate is available again
 * — the snapshot is the before — and it is the one the save consults.
 */
export function emptiedNeverEmpty(doc: TocDocument): ContainerDescriptor[] {
  if (!doc.containers || doc.containers.length === 0) return [];
  const occupied = new Set(doc.sections.map(chainKey));
  return doc.containers.filter((c) => !c.mayEmpty && !occupied.has(c.chainKey));
}

/**
 * PASS 3 — CARD ORDER (docs/22, Decision 4).
 *
 * With a `card-order` record, the projected card sequence is the
 * SOURCE's; the user's within-card edits ride untouched, because only
 * the sequence moves. Created cards are already dissolved, so they are
 * not in `surviving` to be ordered.
 *
 * EXPORTED so the pass ORDER itself is addressable. `applyableProjection`
 * calls this and `projectRowOrder` in the documented order; the
 * confluence assertion in `sphinxProjection.test.ts` composes them BOTH
 * ways and reads the difference off, which is what turns "these two are
 * independent" from a claim in a comment into a checked property.
 */
export function projectCardOrder(
  sections: readonly Section[],
  surviving: readonly SectionId[],
  source: TocDocument | null,
  remainders: readonly StructuralRemainder[],
): SectionId[] {
  if (!source || !remainders.some((r) => r.kind === "card-order")) {
    return [...surviving];
  }
  const here = new Map(sections.map((s) => [naturalKey(s), s.id]));
  const restored: SectionId[] = [];
  const taken = new Set<SectionId>();
  for (const s of source.sections) {
    const id = here.get(naturalKey(s));
    if (id !== undefined && !taken.has(id)) {
      restored.push(id);
      taken.add(id);
    }
  }
  // A surviving card the source does not name keeps its arranged
  // position at the end rather than being dropped: an order pass may
  // not change MEMBERSHIP.
  return [...restored, ...surviving.filter((id) => !taken.has(id))];
}

/**
 * PASS 4 — ROW ORDER (docs/22, Decision 4).
 *
 * For each `row-order` record, the frozen block's rows return to source
 * sequence, on what the earlier passes left behind.
 *
 * WHICH ROWS BELONG TO THE FROZEN RUN is read from the rows' own LOCK,
 * not re-derived from the file: `outside-region` and `globbed` are the
 * labels the adapter already put on exactly those entries, and the record
 * names which kind this block is. That reading is not assumed — the
 * projection-completeness fence plans the result through the real
 * planner, so a lock that disagreed with its block turns red there.
 *
 * THE RESEQUENCE IS POSITION-PRESERVING, and that is what makes this
 * pass CONFLUENT with the membership passes above it: the frozen rows are
 * sorted into the positions they already occupy, so the answer does not
 * depend on whether a row has been restored into the list yet. An
 * index-splice implementation — placing each row at its absolute source
 * index — would NOT be confluent, and the assertion that pins this
 * distinction is the one thing the pass-order mutants cannot express.
 *
 * PURE: returns new sections rather than mutating, so the pass can be
 * composed in either order by the confluence assertion.
 */
export function projectRowOrder(
  sections: readonly Section[],
  source: TocDocument | null,
  remainders: readonly StructuralRemainder[],
): Section[] {
  if (!source || !remainders.some((r) => r.kind === "row-order")) {
    return [...sections];
  }
  const was = placementIndex(source.sections);
  const sourceIndex = (row: Topic): number =>
    was.get(naturalKey(row))?.index ?? Number.MAX_SAFE_INTEGER;
  const resequence = (rows: readonly Topic[], lockKind: LockKind): Topic[] => {
    const at: number[] = [];
    const frozen: Topic[] = [];
    rows.forEach((row, i) => {
      if (row.lock?.kind === lockKind) {
        at.push(i);
        frozen.push(row);
      }
    });
    if (frozen.length < 2) return [...rows];
    const sorted = [...frozen].sort((a, b) => sourceIndex(a) - sourceIndex(b));
    const out = [...rows];
    at.forEach((position, i) => (out[position] = sorted[i]!));
    return out;
  };

  const next: Section[] = sections.map((s) => ({ ...s, topics: [...s.topics] }));
  const applyTo = (parentId: string, lockKind: LockKind): void => {
    for (const s of next) {
      if (s.id === parentId) {
        s.topics = resequence(s.topics, lockKind);
        return;
      }
    }
    const walk = (nodes: Topic[]): boolean => {
      for (let i = 0; i < nodes.length; i++) {
        const t = nodes[i]!;
        if (t.id === parentId) {
          nodes[i] = { ...t, children: resequence(t.children, lockKind) };
          return true;
        }
        const children = [...t.children];
        if (walk(children)) {
          nodes[i] = { ...t, children };
          return true;
        }
      }
      return false;
    };
    for (const s of next) if (walk(s.topics)) return;
  };
  for (const record of remainders) {
    if (record.kind !== "row-order") continue;
    applyTo(record.parentId, record.lockKind);
  }
  return next;
}

/**
 * THE ARRANGEMENT: a document AND the order its cards sit in.
 *
 * TWO HALVES, because card order is a LAYOUT fact and a document alone
 * cannot answer "in what order are the cards?" — which is exactly why
 * `planChanges` has always taken a section order beside the document.
 * The projection restores both, so what the planner is handed is one
 * coherent arrangement rather than a projected document paired with the
 * imagined order it was supposed to have left behind.
 */
export interface Arrangement {
  doc: TocDocument;
  sectionOrder: readonly SectionId[];
}

/**
 * THE APPLYABLE PROJECTION (docs/21 Decision 4; docs/22 Decision 4).
 *
 * Every projected record's subtree returned to its original parent, every
 * imagined structure dissolved, and nothing else touched. MEMBERSHIP is
 * the exact obligation for a row, because membership is what the refusal
 * is about; POSITION is restored from the record's `originalIndex`,
 * clamped to the current sibling count.
 *
 * The residual is stated rather than hidden: if the original siblings
 * were themselves rearranged after the displacement, the restored
 * position is approximate while membership stays exact. That shows up in
 * the ordinary Review diff, never silently, and it is consistent with the
 * promise analysis — no lock kind promises position.
 *
 * PLAN THE PROJECTION, NEVER FILTER THE PLAN. A plan is not separable per
 * change (ordering, renumbering and cross-file edits interdepend), so a
 * filtered plan is a document nobody verified. This produces a REAL
 * arrangement, and the existing pipeline runs on it unmodified.
 *
 * PASS ORDER, LOAD-BEARING AND STATED: membership first (pins home,
 * consent-declined home, creations dissolved), then husk pruning, then
 * card order, then row order. Each later pass reads the earlier passes'
 * output. The reverse order restores indices against lists whose
 * membership is about to change — the same arithmetic the ascending-index
 * sort below already defends. `sphinxProjection.test.ts` holds the
 * minimal pair that fails if the order moves.
 *
 * @param input.records which displacements to undo — `pin`-class always,
 * `consent` records only while the apply-time control is off. Choosing
 * the set is the caller's job, because the R4 control is what decides it.
 * @param input.remainders the structure report for this arrangement.
 * ABSENT MEANS NOT MEASURED, not "nothing imagined" — a caller with no
 * report projects the rows and leaves the structure exactly as arranged,
 * and the adapters' own refusals answer for it underneath.
 * @param input.source the document as the source has it. Required by the
 * three structural clauses and by nothing else: a creation dissolves TO
 * somewhere, and only the source can say where.
 */
export function applyableProjection(
  arrangement: Arrangement,
  input: {
    records: readonly LedgerRecord[];
    remainders?: readonly StructuralRemainder[];
    source?: TocDocument | null;
  },
): Arrangement {
  const { doc } = arrangement;
  const records = input.records;
  const source = input.source ?? null;
  // A GUARD CONSUMES DECLARED INPUTS. With no source there is nowhere to
  // dissolve a creation TO, so the structural passes check nothing rather
  // than inventing a home — the row passes still run.
  const remainders = source ? (input.remainders ?? []) : [];
  if (records.length === 0 && remainders.length === 0) return arrangement;

  const byId = new Map(records.map((r) => [r.topicId, r]));
  const lifted = new Map<string, Topic>();

  /** Remove every projected row from wherever it currently sits. */
  const strip = (nodes: readonly Topic[]): Topic[] => {
    const out: Topic[] = [];
    for (const t of nodes) {
      const rebuilt: Topic = {
        ...cloneTopic(t, { keepIds: true }),
        children: strip(t.children),
      };
      if (byId.has(t.id)) {
        // The record travels no further: the projection is a document
        // that does NOT hold the displacement, so a record on it would
        // describe an arrangement it no longer has.
        delete rebuilt.displaced;
        lifted.set(t.id, rebuilt);
      } else {
        out.push(rebuilt);
      }
    }
    return out;
  };

  let sections: Section[] = doc.sections.map((s) => ({
    ...s,
    topics: strip(s.topics),
  }));

  /** Put one row back under `parentId`, at `index` clamped. */
  const restore = (record: LedgerRecord): boolean => {
    const row = lifted.get(record.topicId);
    if (!row) return false;
    const insert = (list: Topic[]): void => {
      list.splice(Math.min(Math.max(record.originalIndex, 0), list.length), 0, row);
    };
    for (const s of sections) {
      if (s.id === record.originalParentId) {
        insert(s.topics);
        return true;
      }
    }
    let done = false;
    const walk = (nodes: Topic[]): void => {
      for (const t of nodes) {
        if (done) return;
        if (t.id === record.originalParentId) {
          insert(t.children);
          done = true;
          return;
        }
        walk(t.children);
      }
    };
    for (const s of sections) walk(s.topics);
    return done;
  };

  /**
   * ASCENDING BY ORIGINAL INDEX, and the order is load-bearing.
   *
   * Every projected row is stripped first, so a parent regaining three
   * of them is inserting into a SHORTER list than the indices were
   * measured against. Filling the low indices first makes each later
   * insert land after the ones already restored; filling them in
   * arbitrary order clamps the high ones down and interleaves them with
   * the rows that never moved.
   *
   * Found by pricing the `order` kind rather than by the suite: a
   * three-row restore came back "first, second, keep, third".
   */
  const ordered = [...records].sort((a, b) => a.originalIndex - b.originalIndex);
  for (const record of ordered) {
    if (restore(record)) continue;
    // THE PARENT IS GONE. A guard consumes declared inputs: with nowhere
    // to restore membership TO, this projects nothing rather than
    // inventing a home, and leaves the row where the arrangement put it.
    // The adapters' own refusals are still live underneath, so an
    // unprojected row cannot reach an unsafe write.
    const row = lifted.get(record.topicId);
    if (row) sections[sections.length - 1]?.topics.push(row);
  }

  // ── PASS 1b: CREATIONS DISSOLVE (docs/22, Decision 4) ───────
  //
  // Runs on the output of the row restore, so a created card holding a
  // pinned row has already given that row up before it is taken apart.
  const dissolved = new Set<SectionId>();
  if (source) {
    const was = placementIndex(source.sections);
    const sourceKeys = new Set(was.keys());
    for (const s of source.sections) sourceKeys.add(naturalKey(s));

    /** Rows to re-home, in the order the source lists them, so a card
     *  giving up three of them fills low indices first — the same
     *  arithmetic the ledger restore defends above. */
    const homing: { key: string; row: Topic }[] = [];

    for (const record of remainders) {
      if (record.kind !== "creation") continue;
      const card = sections.find((s) => s.id === record.sectionId);
      if (!card) continue;
      dissolved.add(card.id);

      if (sourceKeys.has(record.ownKey)) {
        // A HOIST OR A PROMOTION DISSOLVES AS ONE UNIT. The card's own
        // key IS an entry the source has, so the entry goes home WITH
        // its subtree rather than the children scattering to their own
        // source rows — which would take a promotion apart into pieces
        // the user never separated.
        const unit: Topic =
          record.species === "standalone"
            ? // The card IS its single childless entry.
              (card.topics[0] ?? {
                id: card.id,
                title: card.title,
                ...(card.path !== undefined ? { path: card.path } : {}),
                children: [],
              })
            : {
                // Payload transfer between two uuid spaces, the shape
                // reconstruction already uses for a demoted card.
                id: card.id,
                title: card.title,
                ...(card.path !== undefined ? { path: card.path } : {}),
                ...(card.titleDerived ? { titleDerived: true } : {}),
                children: card.topics,
              };
        homing.push({ key: record.ownKey, row: unit });
      } else {
        // A WRAP: a new name over existing rows. Nothing about the card
        // itself is in the source, so each member goes back to its own
        // source placement and the name simply ceases to exist.
        for (const row of card.topics) homing.push({ key: naturalKey(row), row });
      }
    }

    if (dissolved.size > 0) {
      sections = sections.filter((s) => !dissolved.has(s.id));
      const parentOf = idByNaturalKey({ ...doc, sections });
      const place = (key: string, row: Topic): boolean => {
        const at = was.get(key);
        if (!at) return false;
        const parentId = parentOf.get(at.parentKey);
        if (parentId === undefined) return false;
        const insert = (list: Topic[]): boolean => {
          list.splice(Math.min(Math.max(at.index, 0), list.length), 0, row);
          return true;
        };
        for (const s of sections) if (s.id === parentId) return insert(s.topics);
        let done = false;
        const walk = (nodes: Topic[]): void => {
          for (const t of nodes) {
            if (done) return;
            if (t.id === parentId) {
              done = insert(t.children);
              return;
            }
            walk(t.children);
          }
        };
        for (const s of sections) walk(s.topics);
        return done;
      };
      homing
        .map((h) => ({ ...h, index: was.get(h.key)?.index ?? Number.MAX_SAFE_INTEGER }))
        .sort((a, b) => a.index - b.index)
        .forEach((h) => {
          if (place(h.key, h.row)) return;
          // Source placement gone: the ledger's own gone-parent clause,
          // applied to structure. Project nothing; the adapters refuse
          // underneath.
          sections[sections.length - 1]?.topics.push(h.row);
        });
    }
  }

  // ── PASS 2: HUSK PRUNING ────────────────────────────────────
  //
  // A standalone card IS its single entry, so one emptied by an earlier
  // pass is not a card any more — it is a husk. Pruned exactly as
  // `pruneEmptyOrphans` prunes it on canvas, and NOT as an optional
  // tidy-up: without this the projection would hand the planner a card
  // count its block count refuses, CREATING the refusal it exists to
  // clear.
  const husks = new Set(
    sections.filter((s) => s.isOrphan && s.topics.length === 0).map((s) => s.id),
  );
  if (husks.size > 0) sections = sections.filter((s) => !husks.has(s.id));

  // ── PASS 3: CARD ORDER ──────────────────────────────────────
  const surviving = arrangement.sectionOrder.filter(
    (id) => !dissolved.has(id) && !husks.has(id),
  );
  const sectionOrder = projectCardOrder(sections, surviving, source, remainders);

  // ── PASS 4: ROW ORDER ───────────────────────────────────────
  sections = projectRowOrder(sections, source, remainders);

  return { doc: { ...doc, sections }, sectionOrder };
}

/**
 * One record, rendered — cause → consequence → remedy, the grammar the
 * lock legend already speaks, with the displacement interpolated.
 *
 * THE BADGE AND THE CHECKLIST ARE TWO RENDERINGS OF ONE RECORD, so they
 * read the same function. A second wording would drift, and the drift
 * would be invisible: both surfaces would keep rendering, each confident.
 *
 * Exhaustive over `DisplacementKind`, so a sixth kind cannot ship
 * unlabelled — the same discipline the streaming amendment applied to
 * `CaptureStage`.
 */
export interface DisplacementCopy {
  /** '"Row" — imagined under "X", stays under "Y"'. */
  headline: string;
  /** Why it stays there, in the kind's own words. */
  cause: string;
  /** What would make the imagined move real. */
  remedy: string;
}

export function displacementCopy(
  record: LedgerRecord,
  currentParentTitle: string | undefined,
): DisplacementCopy {
  // NOT MEASURED IS NOT ZERO, applied to copy: a current parent nobody
  // supplied is left out of the sentence rather than named "unknown".
  const headline =
    currentParentTitle !== undefined
      ? `"${record.title}" — imagined under "${currentParentTitle}", stays under "${record.originalParentTitle}"`
      : `"${record.title}" — stays under "${record.originalParentTitle}"`;
  const where = record.carrier ? ` in ${record.carrier}` : "";

  switch (record.kind) {
    case "pin": {
      // A pin record with no lock kind cannot happen through any
      // producer — every one reads `Topic.lock` — but the field is
      // optional on the record, so the general sentence answers rather
      // than a non-null assertion that would crash a surface.
      const kind = record.lockKind;
      if (kind === undefined) {
        return {
          headline,
          cause: `Pinned in place by the source${where}.`,
          remedy:
            "To make this real: unpin the row in the source file, then re-import and re-run.",
        };
      }
      return {
        headline,
        cause: `Pinned: ${LOCK_LABEL[kind].toLowerCase()}${where}.`,
        remedy: `To make this real: ${lockUnbolt(kind, record.carrier)}, then re-import and re-run.`,
      };
    }
    case "directory-move":
      return {
        headline,
        cause:
          "Putting one card inside another would move its whole folder, which this version does not do.",
        // ONE TRUTH, N SURFACES: the same redistribution path the drag
        // refusal and the AI validator name, in the same words.
        remedy:
          "To make this real: move the folder yourself, or ask for its pages to be moved individually instead.",
      };
    case "block-entry":
      return {
        headline,
        cause:
          "This card is a group in the navigation file rather than a page, so there is no entry to list inside another card.",
        remedy:
          "To make this real: give the group a page of its own, or keep it a block and move its pages individually.",
      };
    case "reparent-unsupported":
      return {
        headline,
        cause:
          "This system stores a page's place in the file tree, and cannot record a parent change at all.",
        remedy:
          "To make this real: move the file yourself in the source folder, then re-import.",
      };
    case "consent":
      // NOT A WALL, A CHOICE — and the distinction is the whole reason
      // this kind exists separately. Blaming the format for a decision
      // the user has not made yet would be the copy lying in the
      // format's favour.
      return {
        headline,
        cause:
          "This move relocates its file on disk, and no consent was given when the proposal was made.",
        remedy: 'To write it: turn on "Move the files for these" in Review changes.',
      };
  }
}

/**
 * One line of the remainder — what is left for the user's hand after the
 * app has written everything it can (docs/21, Decision 4).
 *
 * TWO GROUPS, NEVER ONE. "The app cannot write this" and "you chose not
 * to write this today" are different facts, and a single list would
 * blame the format for a decision the user made. Same split as the
 * summary's two numbers, rendered.
 */
export interface ChecklistItem {
  /** Stable key: the record's topic id, or the container's chain key. */
  id: string;
  group: "needs-hand" | "declined";
  headline: string;
  cause: string;
  remedy: string;
}

/**
 * One STRUCTURAL remainder, rendered — the same cause → consequence →
 * remedy grammar the row records use, so the checklist reads as one list
 * rather than two lists in one panel.
 *
 * EXHAUSTIVE OVER THE KINDS, which is fence 10's second half: a fourth
 * remainder kind fails `pnpm check` here as well as at the verb
 * function, so a kind cannot ship unlabelled.
 *
 * EACH REMEDY NAMES THE SMALLEST REAL ACT. "Fix your files" is not a
 * remedy; "add a toctree block in index.rst listing: a, b, c" is, and
 * it is what makes the remainder something a person can actually
 * discharge between two runs.
 */
export function structuralCopy(record: StructuralRemainder): DisplacementCopy {
  switch (record.kind) {
    case "creation": {
      // THE RULED WORD IS "STANDALONE ENTRY" (OR-1). "Orphan" names a
      // parse mechanism, not a thing a writer chose to make — a writer
      // did not orphan anything, they placed a page at top level.
      const what = record.species === "standalone" ? "a standalone entry" : "a new card";
      const noun = record.cardNoun;
      const where = record.carrierPath ? ` in ${record.carrierPath}` : "";
      const members =
        record.memberKeys.length > 0 ? ` listing: ${record.memberKeys.join(", ")}` : "";
      // THE NAMING ASK, appended only where it is true. A remedy that
      // always asked for a name would be telling a user to rename a card
      // they already named — the exclusion is asserted beside the
      // inclusion, because a rule's other side is where the lie lives.
      const naming = record.untitled
        ? " …and give it a name — its heading is still the placeholder."
        : "";
      return {
        headline: `"${record.title}" — imagined as ${what}`,
        cause: noun
          ? `This system's cards are ${noun}s, and the app does not create ${noun}s.`
          : "This system's navigation cannot record a new top-level card.",
        remedy:
          (noun
            ? `To make it real: add a ${noun}${where}${members} — then re-import and re-run.`
            : `To make it real: add it to the source yourself${where}${members} — then re-import and re-run.`) +
          naming,
      };
    }
    case "card-order": {
      // ONE ITEM, HOWEVER MANY CARDS MOVED. A permutation is one edit
      // for the hand, and N items would make "1 card order" read as
      // "6 things to do".
      const noun = record.cardNoun ?? "card";
      const where = record.carrierPath ? ` in ${record.carrierPath}` : "";
      return {
        headline: "Cards imagined in a different order",
        cause: `${noun[0]!.toUpperCase()}${noun.slice(1)} order here is written in the file's own layout, which the app does not rewrite.`,
        remedy: `To make it real: reorder the ${noun}s${where} yourself (a ${noun}'s caption travels with it when you move the whole ${noun}), then re-import.`,
      };
    }
    case "row-order": {
      const where = record.carrierPath ? ` in ${record.carrierPath}` : "";
      return {
        headline: `Rows under "${record.parentTitle}" imagined in a different order`,
        cause: `Pinned: ${LOCK_LABEL[record.lockKind].toLowerCase()}${where}.`,
        // ONE VOCABULARY, ONE MORE CONSUMER: the lock legend's own unbolt
        // words, so the checklist and the row's tooltip cannot drift.
        remedy: `To make it real: ${lockUnbolt(record.lockKind, record.carrierPath)}, then re-import and re-run.`,
      };
    }
  }
}

/** The checklist's stable key for a structural item — anchored to the
 *  thing the record is ABOUT, which is not always a row. */
function structuralKey(record: StructuralRemainder): string {
  switch (record.kind) {
    case "creation":
      return `creation:${record.sectionId}`;
    case "card-order":
      return "card-order";
    case "row-order":
      return `row-order:${record.parentId}:${record.lockKind}`;
  }
}

/**
 * The remainder list, assembled from the ledger and the arrangement.
 *
 * ONE SOURCE, THREE SURFACES: the Review panel section, the `.patch`
 * preamble and the clipboard all render this, so a user who reads the
 * dialog and a user who reads the file are told the same thing. The
 * checklist and the badge are likewise two renderings of one record —
 * both go through `displacementCopy`.
 */
export function buildChecklist(
  doc: TocDocument,
  records: readonly LedgerRecord[],
  opts: {
    consentDeclined: boolean;
    /**
     * The structure report for this arrangement (docs/22, Decision 5).
     *
     * CARRIED IN THE OPTIONS OBJECT rather than as a fourth parameter, so
     * the construction fence keeps its meaning: `buildChecklist` still
     * takes three arguments and none of them is a tab state or a run
     * mode. ABSENT MEANS NOT MEASURED — a caller with no report gets
     * exactly the shipped checklist.
     */
    remainders?: readonly StructuralRemainder[];
  },
): ChecklistItem[] {
  const now = placementIndex(doc.sections);
  const items: ChecklistItem[] = records.flatMap((record) => {
    // A CONSENT record only earns a line when it was DECLINED. Included
    // while the control is on, it is an ordinary plan line and saying
    // "left to you" about it would be false.
    if (record.kind === "consent" && !opts.consentDeclined) return [];
    const copy = displacementCopy(record, now.get(record.topicId)?.parentTitle);
    return [
      {
        id: record.topicId,
        group:
          record.kind === "consent" ? ("declined" as const) : ("needs-hand" as const),
        ...copy,
      },
    ];
  });

  // The structural half: creation, card order and row order. EVERY ONE
  // LANDS IN NEEDS-HAND and never in "declined this run" — declined is
  // for a choice the user made, and a structural remainder is a fact
  // about what the format can record.
  for (const record of opts.remainders ?? []) {
    items.push({
      id: structuralKey(record),
      group: "needs-hand",
      ...structuralCopy(record),
    });
  }

  // The container half: derived, never recorded, so it survives undo by
  // construction (see `emptiedNeverEmpty`).
  for (const container of emptiedNeverEmpty(doc)) {
    const noun = container.kind ?? "group";
    items.push({
      id: `container:${container.chainKey}`,
      group: "needs-hand",
      headline: `${noun} "${container.label}" — imagined empty, but the format requires a section in it`,
      cause:
        "The navigation file declares this group and requires at least one section inside it.",
      // THE APP NEVER DELETES. Naming the by-hand edit is the honest
      // remedy, and it is the one R5 ruled: the display cost of an empty
      // lane was accepted precisely so this could be said out loud.
      remedy:
        "To make this real: remove the empty group from the navigation file yourself — the app never deletes.",
    });
  }
  return items;
}

/** The checklist as plain text — for the clipboard and the `.patch`
 *  preamble, which are the same words in two containers. */
export function checklistText(items: readonly ChecklistItem[]): string[] {
  const lines: string[] = [];
  for (const group of ["needs-hand", "declined"] as const) {
    const inGroup = items.filter((i) => i.group === group);
    if (inGroup.length === 0) continue;
    lines.push(
      group === "needs-hand"
        ? `ASPIRATIONAL — needs your hand (${unitsOf(inGroup)})`
        : `DECLINED THIS RUN (${unitsOf(inGroup)})`,
    );
    inGroup.forEach((item, i) => {
      lines.push(`${i + 1}. ${item.headline}.`, `   ${item.cause}`, `   ${item.remedy}`);
    });
    lines.push("");
  }
  return lines;
}

/**
 * COUNTS SPLIT BY KIND, WITH THEIR UNIT (Ruling A, 2026-08-19; extended
 * for docs/22's three kinds).
 *
 * A bare "(7)" beside the result view's "12 rows" reads as one
 * measurement gone wrong. These are FIVE different questions with five
 * different remedies — a displaced row, an emptied group, an imagined
 * card, the card sequence, a frozen block — and summing them would tell
 * the reader they have seven of one thing.
 *
 * A KIND THE ARRANGEMENT DOES NOT HOLD SAYS NOTHING. "0 new cards" reads
 * as a fact somebody measured; an absent term is the honest shape, and
 * it is the same rule the Overview follows when a clean document gets no
 * line rather than a page of zeroes.
 */
function unitsOf(items: readonly ChecklistItem[]): string {
  const plural = (n: number, one: string, many = `${one}s`) =>
    `${n} ${n === 1 ? one : many}`;
  const count = (prefix: string) => items.filter((i) => i.id.startsWith(prefix)).length;
  const groups = count("container:");
  const created = count("creation:");
  const cardOrder = count("card-order");
  const blocks = count("row-order:");
  const rows = items.length - groups - created - cardOrder - blocks;

  const terms: string[] = [];
  if (rows > 0) terms.push(plural(rows, "row"));
  if (groups > 0) terms.push(plural(groups, "group"));
  if (created > 0) terms.push(plural(created, "new card"));
  // NOT PLURALISED, because a permutation is one fact however many cards
  // moved: "2 card orders" would be a count of something that does not
  // come in twos.
  if (cardOrder > 0) terms.push("1 card order");
  if (blocks > 0) terms.push(plural(blocks, "block"));

  // ONE KIND NEEDS NO BREAKDOWN — its own unit already says everything,
  // and "1 item: 1 block" is the collapse announcing itself twice.
  if (terms.length <= 1) return terms[0] ?? `${items.length}`;
  return `${items.length} items: ${terms.join(", ")}`;
}
