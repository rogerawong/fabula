/**
 * OverviewPanel.tsx — "What am I actually looking at?" (docs/17).
 *
 * A right-hand DRAWER, not a modal. Click-to-focus needs the report and
 * the canvas visible at once; a modal that closes on focus would make
 * every finding a one-shot and force a reopen to compare two. It stays
 * open across focuses, which is the whole reason it is a drawer.
 *
 * Anatomy, top to bottom: identity → vital statistics → attention
 * (findings that can be focused) → observations (stat-only). A line
 * that TOTALS other lines renders as a CLUSTER — the total heading, its
 * terms nested beneath — so its derivation cannot be separated from the
 * numbers it cites by anything that ranks between them. Receipts
 * are inline on every line and never on hover, because this panel is
 * read by the third audience who never opens the app (PRODUCT.md) and a
 * screenshot of it has to carry its evidence.
 *
 * Two collapses, both legible where they happen: counts split by kind
 * rather than summed, and a sampled list says "first 20" and "+K more".
 */

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { evidenceOf, MAX_EXEMPLARS } from "@/collections/importEvidence";
import { filesOf } from "@/collections/types";
import { deriveSectionOrder } from "@/layout/columns";
import { structureReport } from "@/model/remainders";
import {
  buildTier1,
  groupFindings,
  type FindingCluster,
  type ReportFinding,
} from "@/model/report";
import type { NodeRef } from "@/collections/importEvidence";
import type { TabState } from "@/store";
import { distinguish, type SubjectIdentity } from "./subjectIdentity";
import { useFocusStore } from "./focusStore";
import { useUiStore } from "./uiStore";

/**
 * Above this many subjects the list stops being a set you can scan and
 * becomes a wall — measured on kubernetes/website, where "hidden because
 * an ancestor is" names 207 nodes and "titles derived from paths" names
 * 141. Eight sits above the useful case (a per-ancestor line names three
 * causes) and below the point where the links stop helping.
 *
 * This folds the RENDER, never the data. Completeness governs what the
 * selector knows: it still holds all 207, the toggle says 207, and
 * opening it shows them. A fold that lied about the count would be the
 * data truncation the completeness rule forbids.
 */
const FOLD_ABOVE = 8;

/** Subject links, folded behind a true count when there are many. */
function Subjects({
  subjects,
  identify,
  onFocus,
}: {
  subjects: NodeRef[];
  identify: (subject: NodeRef) => SubjectIdentity;
  onFocus: (subject: NodeRef) => void;
}) {
  const [open, setOpen] = useState(false);
  if (subjects.length === 0) return null;

  if (subjects.length > FOLD_ABOVE && !open) {
    return (
      <button
        type="button"
        data-fold-toggle
        data-testid="overview-fold"
        className="mt-1 rounded-[3px] text-[11px] text-neutral-600 underline underline-offset-2 hover:bg-neutral-100"
        onClick={() => setOpen(true)}
      >
        {subjects.length} nodes ▸
      </button>
    );
  }

  // Scoped to the slice actually drawn: two identical labels confuse a
  // reader only where both are on screen at once.
  const shown = subjects.slice(0, MAX_EXEMPLARS);
  const labels = distinguish(shown.map(identify));

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {shown.map((subject, i) => (
        <FocusButton
          key={`${subject.sectionId}:${subject.topicId ?? ""}`}
          subject={subject}
          // The node's own name, QUOTED — "Show 1 … Show 13" is a list
          // of anonymous doors, and a rewritten title is worse than an
          // anonymous one. Where two titles collide, the difference is
          // ADDED beside them instead.
          label={labels[i]!.title}
          detail={labels[i]!.detail}
          onFocus={onFocus}
        />
      ))}
      {subjects.length > MAX_EXEMPLARS && (
        <span className="self-center text-[11px] text-neutral-500">
          first {MAX_EXEMPLARS} of {subjects.length}
        </span>
      )}
      {subjects.length > FOLD_ABOVE && (
        <button
          type="button"
          data-fold-toggle
          className="self-center rounded-[3px] text-[11px] text-neutral-500 underline underline-offset-2"
          onClick={() => setOpen(false)}
        >
          ▾ fold
        </button>
      )}
    </div>
  );
}

function Receipt({ children }: { children: React.ReactNode }) {
  return <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{children}</p>;
}

function Breakdown({ items }: { items: { key: string; count: number }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
      {items.map((item) => (
        <li key={item.key} className="text-[11px] text-neutral-600">
          <span className="font-medium text-neutral-800">{item.count}</span> {item.key}
        </li>
      ))}
    </ul>
  );
}

function FocusButton({
  subject,
  label,
  detail,
  onFocus,
}: {
  subject: NodeRef;
  label: string;
  detail?: string;
  onFocus: (subject: NodeRef) => void;
}) {
  return (
    <button
      type="button"
      data-testid="overview-focus"
      data-focus-detail={detail}
      className="rounded-[3px] px-1 text-[11px] text-blue-700 underline underline-offset-2 hover:bg-blue-50"
      onClick={() => onFocus(subject)}
    >
      {label}
      {/* Secondary, and inline rather than on hover: a screenshot of
          this panel has to say which door is which. */}
      {detail !== undefined && (
        <span className="ml-1 font-normal text-neutral-500 no-underline">{detail}</span>
      )}
    </button>
  );
}

function Finding({
  finding,
  identify,
  onFocus,
}: {
  finding: ReportFinding;
  identify: (subject: NodeRef) => SubjectIdentity;
  onFocus: (subject: NodeRef) => void;
}) {
  const focusable = finding.subjects.length > 0;
  return (
    <li
      data-testid="overview-finding"
      data-finding-id={finding.id}
      data-severity={finding.severity}
      className="py-2"
    >
      <div className="flex items-baseline gap-2">
        {/* The same triangle, the same token, as the row glyph it is
            the second door for (lockGlyphs.tsx) — DECLARED by the
            finding's severity, never inferred here from its id. */}
        {finding.severity === "warning" && (
          <TriangleAlert
            size={13}
            className="shrink-0 self-center text-warning"
            aria-hidden="true"
          />
        )}
        <span className="text-[13px] font-semibold text-neutral-800">
          {finding.count}
        </span>
        <span className="text-[13px] text-neutral-700">{finding.label}</span>
      </div>
      <Receipt>{finding.receipt}</Receipt>
      <Breakdown items={finding.breakdown} />
      {/* Stat-only findings render NO affordance — not a disabled
          control. There is nothing to press, and the absence is the
          honest signal that there is nothing on the canvas to look at. */}
      {focusable && (
        <Subjects subjects={finding.subjects} identify={identify} onFocus={onFocus} />
      )}
    </li>
  );
}

/**
 * A finding and, indented beneath it, the lines it totals.
 *
 * The nesting is the whole point: a total whose terms can be separated
 * from it by anything else is a number the reader has to take on trust.
 * Structure holds that together where placement only happened to.
 */
function Cluster({
  cluster,
  identify,
  onFocus,
}: {
  cluster: FindingCluster;
  identify: (subject: NodeRef) => SubjectIdentity;
  onFocus: (subject: NodeRef) => void;
}) {
  if (cluster.terms.length === 0) {
    return <Finding finding={cluster.head} identify={identify} onFocus={onFocus} />;
  }
  return (
    <li data-testid="overview-cluster" data-cluster-id={cluster.head.id}>
      <ul>
        <Finding finding={cluster.head} identify={identify} onFocus={onFocus} />
      </ul>
      {/* Indented under a rule rather than boxed: the terms are the same
          kind of line as the head, one level in, and a box would read as
          a different sort of thing. */}
      <ul className="mb-1 ml-2 border-l border-neutral-200 pl-3">
        {cluster.terms.map((term) => (
          <Finding key={term.id} finding={term} identify={identify} onFocus={onFocus} />
        ))}
      </ul>
    </li>
  );
}

export function OverviewPanel({ tab }: { tab: TabState | null }) {
  const open = useUiStore((s) => s.overviewOpen);
  const setOpen = useUiStore((s) => s.setOverviewOpen);
  const requestFocus = useFocusStore((s) => s.requestFocus);
  /**
   * The STRUCTURE REPORT, memoized on the arrangement (docs/22).
   *
   * ABOVE THE EARLY RETURN — hooks run on every render, and the panel
   * has one. The `ChangesDialog` precedent is the same shape for the
   * same reason.
   *
   * The hook it reaches scans only the files it needs — the root
   * document and the hosts holding rows — rather than re-parsing the
   * corpus, which is why it can sit on a panel that re-renders on every
   * edit. Memoized all the same, and skipped entirely while the panel is
   * CLOSED: "cheap enough" is not a reason to do it per frame.
   */
  const doc = tab?.editor.document;
  const columns = tab?.editor.columns;
  const remainders = useMemo(
    () =>
      open && doc && columns
        ? structureReport(doc, filesOf(doc), deriveSectionOrder(columns))
        : [],
    [open, doc, columns],
  );
  if (!open || !tab || !doc) return null;

  const report = buildTier1(doc, remainders);
  // A focus link says which node it opens. Falls back to the card's own
  // name for a card-addressed subject, and to a neutral word if the node
  // has since gone — never to an index, which names nothing.
  //
  // Returns the path alongside, because a title is not always enough to
  // tell two links apart and the path is what separates them.
  const identify = (subject: NodeRef): SubjectIdentity => {
    const section = doc.sections.find((s) => s.id === subject.sectionId);
    if (!section) return { title: "this node" };
    if (subject.topicId === undefined)
      return { title: section.title, path: section.path };
    let found: SubjectIdentity | null = null;
    const walk = (topics: typeof section.topics): void => {
      for (const t of topics) {
        if (t.id === subject.topicId) found = { title: t.title, path: t.path };
        else walk(t.children);
        if (found !== null) return;
      }
    };
    walk(section.topics);
    return found ?? { title: section.title, path: section.path };
  };
  const evidence = evidenceOf(doc);
  // Grouped by the selector, not here: Attention sorts by COUNT (the
  // panel orients rather than judges, and a severity order would be this
  // file inventing a severity the model does not carry), and a line that
  // TOTALS others arrives as a cluster with its terms nested, ranked as
  // one entry by the head's count. Both rules are testable there;
  // vitest runs in node.
  const { attention: focusable, observations: statOnly } = groupFindings(report.findings);

  return (
    <aside
      data-testid="overview-panel"
      // Overlays rather than pushes: pushing would relayout the canvas
      // under a reader who is about to be panned somewhere, and the
      // second move would read as the panel's doing.
      className="absolute inset-y-0 right-0 z-30 flex w-96 flex-col border-l border-neutral-200 bg-white shadow-lg"
    >
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-neutral-800">Overview</h2>
        <button
          type="button"
          data-testid="overview-close"
          className="rounded-md px-2 py-1 text-[12px] text-neutral-500 hover:bg-neutral-100"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* identity */}
        <p className="truncate text-[13px] font-medium text-neutral-800">{tab.name}</p>
        <p className="text-[11px] text-neutral-500">{doc.formatId}</p>

        {/* vital statistics */}
        <dl
          data-testid="overview-stats"
          className="mt-3 grid grid-cols-3 gap-2 border-y border-neutral-100 py-3"
        >
          {[
            ["Cards", report.stats.sections],
            ["Rows", report.stats.topics],
            ["Max depth", report.stats.maxDepth],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt className="text-[11px] text-neutral-500">{label}</dt>
              <dd className="text-[15px] font-semibold text-neutral-800">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-2">
          <p className="text-[11px] text-neutral-500">Rows per level</p>
          <Breakdown
            items={Object.entries(report.stats.levels).map(([level, count]) => ({
              key: `at level ${level}`,
              count,
            }))}
          />
        </div>

        {/* attention */}
        {focusable.length > 0 && (
          <section className="mt-4">
            <h3 className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
              Attention
            </h3>
            <ul className="divide-y divide-neutral-100">
              {focusable.map((cluster) => (
                <Cluster
                  key={cluster.head.id}
                  cluster={cluster}
                  identify={identify}
                  onFocus={(subject) => requestFocus(doc, subject)}
                />
              ))}
            </ul>
          </section>
        )}

        {/* observations — stat-only Tier 1, then Tier 2 evidence */}
        {(statOnly.length > 0 || evidence.length > 0) && (
          <section className="mt-4">
            <h3 className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
              Observations
            </h3>
            <ul className="divide-y divide-neutral-100">
              {statOnly.map((cluster) => (
                <Cluster
                  key={cluster.head.id}
                  cluster={cluster}
                  identify={identify}
                  onFocus={() => {}}
                />
              ))}
              {/* Tier 2 renders only when non-empty: three of seven
                  formats contribute nothing, and an empty section would
                  read as broken rather than as clean. */}
              {evidence.map((record, i) => (
                <li
                  // See ChangesDialog: a legacy session can hold two
                  // records of one kind, so position disambiguates.
                  key={`${record.kind}:${i}`}
                  data-testid="overview-evidence"
                  data-evidence-kind={record.kind}
                  className="py-2"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-neutral-800">
                      {record.count}
                    </span>
                    <span className="text-[13px] text-neutral-700">
                      {record.detail ?? record.kind}
                    </span>
                  </div>
                  {record.receipt && <Receipt>{record.receipt}</Receipt>}
                  {record.exemplars.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Subjects
                        subjects={record.exemplars}
                        identify={identify}
                        onFocus={(s) => requestFocus(doc, s)}
                      />
                      {/* Sampling is never silent, and it is a DIFFERENT
                          fact from folding: the fold hides a list the
                          panel holds in full, this says the record never
                          held the rest. A sampled list that looked
                          complete would answer the question wrongly
                          rather than decline to answer. */}
                      {record.count > record.exemplars.length && (
                        <span
                          data-testid="overview-sampled"
                          className="self-center text-[11px] text-neutral-500"
                        >
                          first {record.exemplars.length} · +
                          {record.count - record.exemplars.length} more
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
