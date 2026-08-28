/**
 * report.ts — Tier 1 of the Overview report (docs/17): what the model
 * itself says about a document.
 *
 * A SELECTOR, never stored. Every line here is recomputed on open, which
 * is what keeps the fence intact while Tier 2 stores parse evidence: the
 * classifier is *can this be recomputed from the kept snapshot?* — yes
 * for everything below, because it reads the model, which is entirely
 * present.
 *
 * Two consequences worth stating where they can be violated:
 *
 * - **Subjects are complete.** The 20-exemplar bound is a Tier-2 STORAGE
 *   property. A selector has nothing to sample, so every finding names
 *   every subject it has and each one can focus.
 * - **A fact the document lacks emits no finding.** A line per table row
 *   would give a clean document a page of zeroes, and an empty section
 *   for every line reads as broken.
 */

import { recordedLedger } from "./ledger";
import { unhousedSections } from "./containers";
import type { StructuralRemainder } from "./remainders";
import { LOCK_LABEL } from "./locks";
import { chainKey, documentStats, isEmpty, type TopicStats } from "./selectors";
import type { NodeRef } from "@/collections/importEvidence";
import type { Section, TocDocument, Topic } from "./types";

/** One counted fact, with where to look and what proves it. */
export interface ReportFinding {
  /** Stable key — the panel's React key and the tests' handle. */
  id: string;
  /** The line, in the product's own words. */
  label: string;
  /** Shown inline, never on hover: a screenshot must carry its evidence. */
  receipt: string;
  count: number;
  /**
   * Split by kind wherever a sum would hide one. Counts split by kind
   * rather than summed into one is the collapse-legibly rule; an empty
   * breakdown means the count is already the whole story.
   */
  breakdown: { key: string; count: number }[];
  /** COMPLETE. Empty means stat-only: nothing on the canvas to focus. */
  subjects: NodeRef[];
  /**
   * Ids of the findings this one totals, in the order its receipt names
   * them. Set only on a line whose whole meaning is arithmetic over
   * other lines. `groupFindings` reads this and renders the set as a
   * CLUSTER — this line heading, its terms nested beneath.
   *
   * The relationship is DECLARED here and nowhere else. Do not infer a
   * grouping downstream from labels, id prefixes or shared subjects: a
   * category the renderer invented is a claim about what the model
   * means, made by the layer least equipped to make it.
   */
  summarises?: string[];
  /**
   * Set only on a finding that means the CORPUS needs fixing — the lock
   * legend's error tier (locks.ts: "does this mean something in the
   * FILES should change?"). The panel renders it in the warning token.
   * DECLARED here, never inferred by the renderer from labels or ids.
   */
  severity?: "warning";
}

export interface Tier1Report {
  stats: {
    sections: number;
    topics: number;
    maxDepth: number;
    /** Topics per level — the only line that reveals a lone deep branch. */
    levels: Record<number, number>;
  };
  findings: ReportFinding[];
}

/** Walk every topic in the document, with the card it belongs to. */
function eachTopic(
  doc: TocDocument,
  visit: (topic: Topic, section: Section) => void,
): void {
  for (const section of doc.sections) {
    const walk = (topics: Topic[]): void => {
      for (const t of topics) {
        visit(t, section);
        walk(t.children);
      }
    };
    walk(section.topics);
  }
}

/** Counts by key, largest first, ties broken by name so runs are stable. */
function ranked(counts: Map<string, number>): { key: string; count: number }[] {
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * @param remainders the structure report for this arrangement (docs/22).
 * ABSENT MEANS NOT MEASURED — a caller with no report gets exactly the
 * shipped panel, which is what keeps the structural lines an extension
 * rather than a replacement. Passed in rather than derived here because
 * deriving it needs the SOURCE snapshot, and this selector runs on every
 * panel render.
 */
export function buildTier1(
  doc: TocDocument,
  remainders: readonly StructuralRemainder[] = [],
): Tier1Report {
  const stats: TopicStats & { sections: number } = documentStats(doc);
  const findings: ReportFinding[] = [];
  const add = (finding: ReportFinding): void => {
    if (finding.count > 0) findings.push(finding);
  };

  // ── hidden: three ways, then the total ────────────────────
  // Three different facts. Collapsing them dropped a true fact from
  // eight rows once already (docs/14), so they never share a line —
  // and the fourth line below TOTALS them without collapsing them,
  // which is the distinction the whole block turns on.
  const ownByKind = new Map<string, number>();
  const ownSubjects: NodeRef[] = [];
  const viaCounts = new Map<string, number>();
  const inheritedSubjects: NodeRef[] = [];
  // Counted here rather than by intersecting two lists afterwards: this
  // walk is the only place both facts about one node are in hand.
  let bothCount = 0;

  const noteUnlisted = (unlisted: Section["unlisted"], ref: NodeRef): void => {
    if (!unlisted) return;
    const own = unlisted.reasons.length > 0;
    const via = unlisted.inheritedFrom?.via;
    if (own) {
      for (const reason of unlisted.reasons) {
        ownByKind.set(reason.label, (ownByKind.get(reason.label) ?? 0) + 1);
      }
      ownSubjects.push(ref);
    }
    if (via !== undefined) {
      viaCounts.set(via, (viaCounts.get(via) ?? 0) + 1);
      inheritedSubjects.push(ref);
    }
    if (own && via !== undefined) bothCount += 1;
  };

  for (const section of doc.sections) {
    noteUnlisted(section.unlisted, { sectionId: section.id });
  }
  eachTopic(doc, (t, section) => {
    noteUnlisted(t.unlisted, { sectionId: section.id, topicId: t.id });
  });

  add({
    id: "hidden-own",
    label: "Hidden by their own front matter",
    receipt: "flags on the page itself",
    count: ownSubjects.length,
    breakdown: ranked(ownByKind),
    subjects: ownSubjects,
  });

  add({
    id: "hidden-inherited",
    label: "Hidden because an ancestor is",
    receipt: "no flag of their own; the section above them carries one",
    count: inheritedSubjects.length,
    breakdown: [],
    subjects: inheritedSubjects,
  });

  // The line that focuses well: each row's subject is the FLAGGED
  // ANCESTOR, because the user asked "why are these hidden" and the
  // answer is one node — selecting its members would be a selection.
  const byTitle = new Map<string, NodeRef>();
  for (const section of doc.sections) {
    if (section.unlisted?.reasons.length)
      byTitle.set(section.title, { sectionId: section.id });
  }
  eachTopic(doc, (t, section) => {
    if (t.unlisted?.reasons.length && !byTitle.has(t.title)) {
      byTitle.set(t.title, { sectionId: section.id, topicId: t.id });
    }
  });
  const viaRanked = ranked(viaCounts);
  add({
    id: "hidden-via",
    label: "Hidden via a specific ancestor",
    receipt: "each count is the subtree under one flagged node",
    count: inheritedSubjects.length,
    breakdown: viaRanked,
    subjects: viaRanked.flatMap(({ key }) => {
      const ref = byTitle.get(key);
      return ref ? [ref] : [];
    }),
  });

  // The fourth line answers a different question from the three above:
  // they say IN WHAT WAY, and overlap on purpose; this says HOW MANY
  // ROWS a reader never reaches. Summing the lines would overcount by
  // exactly the pages carrying both facts, so it subtracts them — and
  // prints the subtraction, because a total whose terms are three lines
  // away is one a reader has to take on trust.
  //
  // Only when both ways are present: with one of them zero the union
  // restates a line already on screen, and a restatement is the sort of
  // line that makes a clean document read as a page of zeroes.
  if (ownSubjects.length > 0 && inheritedSubjects.length > 0) {
    add({
      id: "hidden-any",
      label: "Hidden from navigation, any reason",
      receipt: `own ${ownSubjects.length} + inherited ${inheritedSubjects.length} − both ${bothCount}`,
      count: ownSubjects.length + inheritedSubjects.length - bothCount,
      breakdown: [],
      // Stat-only deliberately: every node it counts already folds out
      // of a line above, and a third fold over the same rows is noise.
      subjects: [],
      summarises: ["hidden-own", "hidden-inherited", "hidden-via"],
    });
  }

  // ── the rest of the table ─────────────────────────────────
  const orphans = doc.sections.filter((s) => s.isOrphan);
  add({
    id: "orphans",
    label: "Orphan cards",
    receipt: "top-level entries with no children of their own",
    count: orphans.length,
    breakdown: [],
    subjects: orphans.map((s) => ({ sectionId: s.id })),
  });

  const derivedTopics: NodeRef[] = [];
  eachTopic(doc, (t, section) => {
    if (t.titleDerived) derivedTopics.push({ sectionId: section.id, topicId: t.id });
  });
  const derivedSections = doc.sections.filter((s) => s.titleDerived);
  add({
    id: "derived-titles",
    label: "Titles derived from paths",
    receipt: "no name in the source; the path supplied one",
    count: derivedTopics.length + derivedSections.length,
    breakdown: [
      ...(derivedTopics.length ? [{ key: "topics", count: derivedTopics.length }] : []),
      ...(derivedSections.length
        ? [{ key: "sections", count: derivedSections.length }]
        : []),
    ],
    subjects: [...derivedTopics, ...derivedSections.map((s) => ({ sectionId: s.id }))],
  });

  // Breakdown keys are the legend's LABELS (locks.ts), not the union's
  // internal names: "above prose", never "outside-region" — the row
  // glyph's tooltip, this line and the aria-labels speak one vocabulary.
  const lockCounts = new Map<string, number>();
  const lockedSubjects: NodeRef[] = [];
  eachTopic(doc, (t, section) => {
    if (!t.lock) return;
    const label = LOCK_LABEL[t.lock.kind].toLowerCase();
    lockCounts.set(label, (lockCounts.get(label) ?? 0) + 1);
    lockedSubjects.push({ sectionId: section.id, topicId: t.id });
  });
  add({
    id: "locked",
    label: "Locked nodes",
    receipt: "pinned in place by the source, in seven kinds",
    count: lockedSubjects.length,
    breakdown: ranked(lockCounts),
    subjects: lockedSubjects,
  });

  // ── the aspirational remainder (docs/21, Decision 3) ──────
  //
  // COUNTS `pin` RECORDS. A `consent` record surfaces at Review, where
  // its question lives — a panel line about it would be asking the user
  // to act on a decision the apply surface owns.
  //
  // Reads the RECORDED ledger rather than the selector of record: this
  // selector is recomputed on every panel render and re-parsing a
  // corpus snapshot here would make the panel cost a parse per frame.
  // Sound because the two must agree on a collection tab — the oracle
  // is what buys the shortcut.
  //
  // SUBJECTS FOCUS, unlike orphans: every displaced row EXISTS on the
  // canvas, so the affordance is a link rather than a stat.
  const pinRecords = recordedLedger(doc).filter((r) => r.kind === "pin");
  const displacedByKind = new Map<string, number>();
  const displacedSubjects: NodeRef[] = [];
  if (pinRecords.length > 0) {
    const byId = new Map(pinRecords.map((r) => [r.topicId, r]));
    eachTopic(doc, (t, section) => {
      const record = byId.get(t.id);
      if (!record) return;
      // Split by KIND per the house rule — a sum would hide which
      // boundary the reader is actually up against, and the kinds have
      // different remedies.
      const label = record.lockKind
        ? LOCK_LABEL[record.lockKind].toLowerCase()
        : "pinned";
      displacedByKind.set(label, (displacedByKind.get(label) ?? 0) + 1);
      displacedSubjects.push({ sectionId: section.id, topicId: t.id });
    });
  }
  add({
    id: "aspirational",
    label: "Imagined moves that need your hand",
    receipt:
      "pinned rows sitting away from their source placement — the app will not write these, a person can",
    count: displacedSubjects.length,
    breakdown: ranked(displacedByKind),
    subjects: displacedSubjects,
  });

  // ── cards with no home this format can write (docs/22, Decision 5) ──
  //
  // THE EXPORT REFUSAL STAYS THE FLOOR AND STOPS BEING THE FIRST NOTICE.
  // The card is on the canvas the whole time; being told about it only
  // at Save is being told at the worst possible moment.
  //
  // ERROR TIER, by the membership test (locks.ts: "does this mean
  // something in the FILES should change?"). It does — either the user
  // drags the card into a container, or they add a container for it —
  // and unlike every quiet boundary this one blocks the export.
  const unhoused = unhousedSections(doc);
  add({
    id: "unhoused",
    label: "Cards with nowhere to go in this file",
    // TWO REMEDIES, in-app first, by-hand second, blaming neither. The
    // app never edits containers, and saying so is what makes the second
    // remedy honest rather than a shrug.
    receipt:
      "the navigation has no container that holds them — drag each into one, " +
      "or add a container for it in the file yourself (the app never edits containers)",
    count: unhoused.length,
    breakdown: [],
    subjects: unhoused.map((s) => ({ sectionId: s.id })),
    severity: "warning",
  });

  // ── structure this arrangement imagines (docs/22, Decision 3) ──────
  //
  // THREE LINES, NEVER ONE. A created card, a card order and a frozen
  // block are three different asks with three different remedies, and a
  // summed "3 structural remainders" would tell the reader they have
  // three of one thing.
  //
  // NOT THE ERROR TIER. None of these means the files are WRONG — they
  // mean the app cannot write this arrangement, which is a boundary of
  // the editing model. Spending the warning tone here would cost the
  // error tier its jump (docs/19's salience economy).
  const created = remainders.filter((r) => r.kind === "creation");
  add({
    id: "created-cards",
    label: "Cards imagined that this system cannot record",
    receipt: "the app will not write these; the checklist says what would",
    count: created.length,
    breakdown: ranked(
      new Map(
        (["section", "standalone"] as const)
          .map((species) => [
            species === "standalone" ? "standalone entries" : "sections",
            created.filter((r) => r.kind === "creation" && r.species === species).length,
          ])
          .filter(([, n]) => (n as number) > 0) as [string, number][],
      ),
    ),
    subjects: created.map((r) => ({
      sectionId: (r as { sectionId: string }).sectionId,
    })),
  });

  const cardOrder = remainders.find((r) => r.kind === "card-order");
  add({
    id: "card-order",
    label: "Cards imagined in a different order",
    // ONE FACT, however many cards moved — the count is the number of
    // things to do, and a permutation is one of them. The receipt is
    // where the how-many lives.
    receipt:
      cardOrder && cardOrder.kind === "card-order"
        ? `${cardOrder.moved.length} card${cardOrder.moved.length === 1 ? "" : "s"} moved; this system writes card order in the file's own layout`
        : "",
    count: cardOrder ? 1 : 0,
    breakdown: [],
    subjects:
      cardOrder && cardOrder.kind === "card-order"
        ? cardOrder.moved.map((m) => ({ sectionId: m.sectionId }))
        : [],
  });

  const rowOrder = remainders.filter((r) => r.kind === "row-order");
  add({
    id: "row-order",
    label: "Rows imagined in a different order inside a frozen block",
    receipt: "these lines are not the app's to rewrite; the checklist says what would be",
    count: rowOrder.length,
    breakdown: ranked(
      new Map(
        rowOrder.reduce((acc, r) => {
          if (r.kind !== "row-order") return acc;
          const label = LOCK_LABEL[r.lockKind].toLowerCase();
          acc.set(label, (acc.get(label) ?? 0) + 1);
          return acc;
        }, new Map<string, number>()),
      ),
    ),
    // FOCUSES THE CARRIER, because a row order is not a place — the card
    // holding the block is what a reader can be sent to look at.
    subjects: rowOrder.map((r) => ({
      sectionId: (r as { parentId: string }).parentId,
    })),
  });

  // ── the error tier's second door (docs/19; tier table in locks.ts) ──
  // `missing` is the only lock kind that means the FILES need fixing,
  // so beyond its share of the locked line it gets an attention line of
  // its own, docnames as subjects: a warning glyph on a row with no
  // panel line behind it would be a finding with one door.
  const missingSubjects: NodeRef[] = [];
  eachTopic(doc, (t, section) => {
    if (t.lock?.kind === "missing")
      missingSubjects.push({ sectionId: section.id, topicId: t.id });
  });
  add({
    id: "missing-targets",
    label: "Entries whose target does not exist",
    receipt:
      "named in a toctree, absent from the project — a fault in the corpus, not an app boundary",
    severity: "warning",
    count: missingSubjects.length,
    breakdown: [],
    subjects: missingSubjects,
  });

  // ── above prose: the hub-page list ────────────────────────
  // Grouped by CARRIER — the file whose toctree holds the locked entry,
  // which is the entry's PARENT in the tree (or the card itself for a
  // top-level entry). hidden-via's shape on purpose: the user asks
  // "where do I fix this?" and the answer is one file, so the subjects
  // are the carriers, ranked with the breakdown. BLOCK counts are not
  // derivable from the model (adjacency does not reveal block
  // boundaries), so the line counts entries and files and never guesses
  // a block count.
  const carrierCounts = new Map<string, number>();
  const carrierByTitle = new Map<string, NodeRef>();
  let aboveProse = 0;
  for (const section of doc.sections) {
    const walk = (topics: Topic[], parent: Topic | null): void => {
      for (const t of topics) {
        if (t.lock?.kind === "outside-region") {
          aboveProse += 1;
          const title = parent ? parent.title : section.title;
          carrierCounts.set(title, (carrierCounts.get(title) ?? 0) + 1);
          if (!carrierByTitle.has(title)) {
            carrierByTitle.set(
              title,
              parent
                ? { sectionId: section.id, topicId: parent.id }
                : { sectionId: section.id },
            );
          }
        }
        walk(t.children, t);
      }
    };
    walk(section.topics, null);
  }
  const carriersRanked = ranked(carrierCounts);
  add({
    id: "above-prose",
    label: "Entries locked above prose",
    receipt:
      "their toctree sits above prose in its file; each becomes editable if its toctree moves to the file's end",
    count: aboveProse,
    breakdown: carriersRanked,
    subjects: carriersRanked.flatMap(({ key }) => {
      const ref = carrierByTitle.get(key);
      return ref ? [ref] : [];
    }),
  });

  const sealed = doc.sections.filter((s) => s.sealed !== undefined);
  add({
    id: "sealed",
    label: "Sealed cards",
    receipt: sealed.length
      ? `contents generated elsewhere: ${[
          ...new Set(sealed.map((s) => s.sealed?.source ?? "declared source")),
        ].join(", ")}`
      : "contents generated elsewhere",
    count: sealed.length,
    breakdown: [],
    subjects: sealed.map((s) => ({ sectionId: s.id })),
  });

  if (doc.containers && doc.containers.length > 0) {
    const perContainer = new Map<string, number>();
    for (const s of doc.sections) {
      const label =
        doc.containers.find((c) => c.chainKey === chainKey(s))?.label ?? "unplaced";
      perContainer.set(label, (perContainer.get(label) ?? 0) + 1);
    }
    add({
      id: "containers",
      label: "Navigation containers",
      receipt: "cards grouped by the container they live in",
      count: doc.containers.length,
      breakdown: ranked(perContainer),
      subjects: [],
    });
  }

  const empties = doc.sections.filter(isEmpty);
  add({
    id: "empty-sections",
    label: "Empty cards",
    receipt: "no rows — and not declared as generated elsewhere",
    count: empties.length,
    breakdown: [],
    subjects: empties.map((s) => ({ sectionId: s.id })),
  });

  return {
    stats: {
      sections: stats.sections,
      topics: stats.total,
      maxDepth: stats.maxDepth,
      levels: stats.levelCounts,
    },
    findings,
  };
}

/**
 * A finding and the findings it declares as its terms.
 *
 * Every finding reaches the panel as a cluster, most of them with no
 * terms at all, so the renderer has one shape to draw rather than two.
 */
export interface FindingCluster {
  head: ReportFinding;
  /** In `head.summarises` order. Empty for an ordinary finding. */
  terms: ReportFinding[];
}

/**
 * Split the findings into the panel's two sections — what can be acted
 * on, and what can only be known — as ranked CLUSTERS.
 *
 * The default rule is the affordance: a finding with subjects goes to
 * Attention, one without goes to Observations, and each section ranks by
 * count. A finding that `summarises` others heads a cluster instead. Its
 * terms nest beneath it and leave the top level entirely; the cluster
 * ranks as one entry, by the head's count, in the section its TERMS
 * landed in — the head is stat-only and would otherwise drag its
 * focusable terms into Observations with it.
 *
 * Nesting rather than placement is what makes the adjacency structural.
 * The rule this replaced put the total after its last term, which was
 * true only until some unrelated finding ranked its way in between — on
 * kubernetes/website, 141 derived titles sat inside the hidden block by
 * arithmetic accident. A property that holds per corpus is not a
 * property.
 *
 * The grouping is DECLARED, never inferred: clusters exist because a
 * finding names its terms, not because this function noticed that some
 * findings look related. An invented category — 'the hidden ones', 'the
 * structural ones' — would be this file deciding what the model means,
 * and it would be wrong the first time an adapter emitted a line that
 * did not fit the shape someone imagined.
 *
 * Lives here, not in the panel, so it is testable: vitest runs in node.
 */
export function groupFindings(findings: readonly ReportFinding[]): {
  attention: FindingCluster[];
  observations: FindingCluster[];
} {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const claimed = new Set<string>();
  for (const f of findings) {
    for (const id of f.summarises ?? []) if (byId.has(id)) claimed.add(id);
  }

  const clusters: FindingCluster[] = [];
  for (const head of findings) {
    if (claimed.has(head.id)) continue; // nested below, not loose here
    const terms = (head.summarises ?? []).flatMap((id) => {
      const term = byId.get(id);
      // A term the document never produced is simply absent — the
      // no-finding-for-a-fact-you-lack rule, one level down.
      return term ? [term] : [];
    });
    clusters.push({ head, terms });
  }

  // Attention if anything in the cluster can be focused: the head of a
  // total is stat-only by design, and letting it decide would file its
  // focusable terms under Observations.
  const actionable = (c: FindingCluster): boolean =>
    c.head.subjects.length > 0 || c.terms.some((t) => t.subjects.length > 0);
  const byCount = (a: FindingCluster, b: FindingCluster) => b.head.count - a.head.count;

  return {
    attention: clusters.filter(actionable).sort(byCount),
    observations: clusters.filter((c) => !actionable(c)).sort(byCount),
  };
}
