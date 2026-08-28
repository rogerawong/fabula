/**
 * TopicRow.tsx — One row of a card's topic tree: caret, title, badges,
 * and the full interaction surface — drag handle (the row's CONTENT;
 * drags from the row's empty flex leftover rubber-band instead),
 * click/shift-click selection anywhere on the row, double-click
 * inline rename, and drop indicators (before/after lines, child
 * highlight).
 */

import { ChevronDown, ChevronRight, EyeOff, FileText, Hand } from "lucide-react";
import { animatedDispatch } from "@/animation/animatedActions";
import { beginTopicDrag } from "@/interaction/topicDrag";
import { LOCK_LABEL, LOCK_TIER, lockTooltip } from "@/model/locks";
import { displacementCopy, recordOf } from "@/model/ledger";
import { countTopics } from "@/model/selectors";
import type { Topic, TopicId } from "@/model/types";
import type { RenameCapability } from "@/formats/types";
import { useAppStore } from "@/store";
import { InlineEdit } from "@/view/InlineEdit";
import { useTooltip } from "@/view/Tooltip";
import { useUiStore } from "@/view/uiStore";
import { LOCK_GLYPH } from "./lockGlyphs";

/** A topic whose path targets another TOC file renders as a badged leaf. */
export function isNestedToc(topic: Topic): boolean {
  return /(^|\/)toc\.ya?ml$/i.test(topic.path ?? "");
}

/**
 * How a locked row reads: one GLYPH in the right-margin slot, per-kind
 * shape (lockGlyphs.ts), tiered tone — the warning token for `missing`
 * (the corpus needs fixing), quiet monochrome for every other kind (the
 * app's editing model has a boundary here; the files are fine). The
 * text chips this replaces truncated property labels and out-shouted
 * the titles; the kind's NAME now lives in the glyph's aria-label and
 * its styled tooltip, and the Overview's locked line itemizes the same
 * vocabulary — the second door, so no meaning is hover-only.
 */

export interface RowContext {
  tabId: string;
  sectionId: string;
  depth: number;
  locked: boolean;
  /** Which node kinds this document can rename (docs/13). */
  renameable: RenameCapability;
  selectedIds: ReadonlySet<TopicId>;
  /** `${topicId}:${position}` of the current drop indicator, or null */
  indicatorKey: string | null;
  overrides: ReadonlyMap<TopicId, boolean>;
  onToggle: (id: TopicId, expanded: boolean) => void;
  editingId: TopicId | null;
  setEditingId: (id: TopicId | null) => void;
}

export function TopicRow({
  topic,
  level,
  ctx,
  parentTitle,
}: {
  topic: Topic;
  level: number;
  ctx: RowContext;
  /**
   * What this row currently sits under — the card for a top-level row,
   * the row above for a nested one.
   *
   * A PROP, not a context field, because it differs per row and the
   * context is shared by the whole card. Passed down from the parent
   * that already knows it rather than looked up: a row knows its own
   * subtree and never the tree above it, and a lookup here would be the
   * canvas re-deriving structure it is being handed.
   */
  parentTitle?: string;
}) {
  const hasChildren = topic.children.length > 0;
  const expanded = ctx.overrides.get(topic.id) ?? level < ctx.depth;
  const selected = ctx.selectedIds.has(topic.id);
  const editing = ctx.editingId === topic.id;
  /**
   * TWO LOCKS, TWO NAMES (docs/21, arc 2). They were one — `locked` —
   * and the collapse is what made a pin a restriction on thought.
   *
   * *"The row is inert because the tab is in topics-lock mode."* That is
   * `interactionLocked`: a transient VIEW mode, and everything is off.
   * *"The row is pinned in place by its source file."* That is `pinned`:
   * a fact about the document, and it now means exactly three things —
   * no rename, no delete, and a drag whose DROP asks (Decision 9). The
   * row drags and selects like any other, because a row that cannot be
   * selected cannot ride inside the group drag the seam counts.
   */
  const lock = topic.lock;
  const pinned = lock !== undefined;
  const interactionLocked = ctx.locked;
  const Glyph = lock ? LOCK_GLYPH[lock.kind] : null;
  const glyphTip = useTooltip(lock ? lockTooltip(lock) : null);
  /**
   * ONE BADGE PER PIN-KIND RECORD — a displaced pinned row (docs/21,
   * Decision 3). A `consent` record gets NO canvas badge, deliberately:
   * that row is ordinary, movable and writable-with-consent, so a mark
   * here would cry wolf about a row nothing is wrong with. Its surface
   * is Review changes, where the fact it carries actually lives.
   *
   * It COMPOSES with the lock glyph rather than replacing it. The row is
   * still pinned — that fact did not change — and the corpus fault and
   * the imagined placement are two facts, so `missing` keeps its
   * warning-tier triangle beside this.
   */
  const displaced = recordOf(topic);
  const badged = displaced?.kind === "pin";
  const putBackTip = useTooltip(
    badged && displaced
      ? (() => {
          const copy = displacementCopy(displaced, parentTitle);
          return [copy.headline, copy.cause, copy.remedy, "Click to put it back."];
        })()
      : null,
  );
  const titleTip = useTooltip(
    topic.unlisted?.inheritedFrom
      ? [
          `Inside “${topic.unlisted.inheritedFrom.via}”, which is hidden`,
          "So this page is not reachable through the site's navigation either.",
          ...topic.unlisted.inheritedFrom.reasons.map((r) => `${r.label}: ${r.note}`),
        ]
      : topic.path
        ? [topic.path]
        : null,
  );
  const eyeTip = useTooltip(
    topic.unlisted && topic.unlisted.reasons.length > 0
      ? topic.unlisted.reasons.map((r) => `${r.label}: ${r.note}`)
      : null,
  );

  const before = ctx.indicatorKey === `${topic.id}:before`;
  const after = ctx.indicatorKey === `${topic.id}:after`;
  const child = ctx.indicatorKey === `${topic.id}:child`;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || interactionLocked || editing) return;
    // The row is full-width, so its flex LEFTOVER — indent gutter, the
    // space after a short title — looks empty to the user. A drag
    // starting there must rubber-band (bubble to the card body's box
    // select), not drag this row. Content hits land on child elements;
    // leftover hits land on the row div itself. Plain clicks in the
    // leftover still select the row via onClick — only drags differ.
    if (e.target === e.currentTarget) return;
    e.stopPropagation();
    beginTopicDrag(e, ctx.tabId, topic.id);
  };
  const onContextMenu = (e: React.MouseEvent) => {
    // A pinned row still bubbles to the CARD's menu rather than opening
    // the row menu on itself — unchanged, and deliberately not widened
    // here: the row menu's two commands are exactly the two a pin still
    // refuses (`rowMenu.ts`), so opening it on a pinned row would offer
    // a menu of nothing.
    if (interactionLocked || pinned) return;
    e.preventDefault();
    e.stopPropagation();
    const store = useAppStore.getState();
    store.selectSection(ctx.sectionId);
    // right-click on an UNSELECTED row selects it first — the menu
    // always acts on what's visibly highlighted (never a stale set)
    const inSelection = ctx.selectedIds.has(topic.id);
    const topicIds = inSelection ? [...ctx.selectedIds] : [topic.id];
    if (!inSelection) store.setTopicSelection([topic.id]);
    useUiStore.getState().setCanvasMenu({
      x: e.clientX,
      y: e.clientY,
      target: { kind: "topics", sectionId: ctx.sectionId, topicIds },
    });
  };
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (interactionLocked) return;
    const store = useAppStore.getState();
    const tab = store.tabs.find((t) => t.id === ctx.tabId);
    // a topic selection lives within ONE card: modifier clicks in a
    // different card start fresh there instead of mixing cards
    const sameCard =
      tab !== undefined &&
      tab.selectedTopicIds.length > 0 &&
      tab.selectedSectionIds.length === 1 &&
      tab.selectedSectionIds[0] === ctx.sectionId;
    // clicking a topic also selects its card — depth commands route to
    // where you're working (docs/02 §2)
    store.selectSection(ctx.sectionId);

    if (e.shiftKey && sameCard) {
      // range: anchor → here in MODEL pre-order, closed over subtrees —
      // a collapsed parent inside the range brings its hidden children
      // along (they highlight when later expanded). Model order also
      // keeps the anchor valid if its own parent was collapsed since.
      const sectionTopics =
        tab.editor.document.sections.find((s) => s.id === ctx.sectionId)?.topics ?? [];
      const ids: TopicId[] = [];
      const subtree = new Map<TopicId, TopicId[]>();
      const walk = (t: Topic): TopicId[] => {
        ids.push(t.id);
        const own = [t.id, ...t.children.flatMap(walk)];
        subtree.set(t.id, own);
        return own;
      };
      sectionTopics.forEach(walk);
      const anchor = tab.selectedTopicIds[0]!;
      const a = ids.indexOf(anchor);
      const b = ids.indexOf(topic.id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const full = new Set<TopicId>();
        for (const id of ids.slice(lo, hi + 1)) {
          for (const d of subtree.get(id) ?? [id]) full.add(d);
        }
        // anchor stays first: the next shift-click re-ranges from it
        store.setTopicSelection([anchor, ...[...full].filter((id) => id !== anchor)]);
        return;
      }
    }
    if ((e.metaKey || e.altKey) && sameCard) {
      store.toggleTopicSelected(topic.id);
      return;
    }
    store.setTopicSelection([topic.id]);
  };

  return (
    <li className="relative">
      {before && <DropLine at="top" level={level} />}
      {after && <DropLine at="bottom" level={level} />}
      <div
        data-topic-row=""
        data-topic-id={topic.id}
        data-section-id={ctx.sectionId}
        data-flip-id={`topic:${topic.id}`}
        className={`flex h-6 items-center gap-1 rounded-sm px-1 text-[13px] leading-6 ${
          child
            ? "bg-sky-100 ring-1 ring-inset ring-sky-400"
            : selected
              ? "bg-sky-100 text-sky-900"
              : "text-neutral-700 hover:bg-neutral-50"
        } ${interactionLocked ? "" : "cursor-grab"}`}
        style={{ paddingLeft: `${(level - 1) * 16 + 4}px` }}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onDoubleClick={(e) => {
          e.stopPropagation();
          // RENAMES OF PINNED ROWS STAY REFUSED, out of v1 by Decision 1:
          // an explicit title changes the sidebar and never the H1, so
          // the affordance would create a divergence invisible in the app
          // that caused it (docs/19's rename deferral).
          if (interactionLocked || pinned || !ctx.renameable.topics) return;
          ctx.setEditingId(topic.id);
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${topic.title}` : `Expand ${topic.title}`}
            aria-expanded={expanded}
            className="flex size-4 shrink-0 items-center justify-center rounded-sm text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              ctx.onToggle(topic.id, !expanded);
            }}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : lock ? (
          // a locked leaf keeps the 16px slot EMPTY: the kind lives in
          // the right-margin glyph now, and a page icon here would be a
          // lie for a pattern line or a target that does not exist
          <span className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          // leaf rows read as pages (the docs/05 treatment); the icon fills
          // the caret slot so titles stay aligned
          <span
            className="flex size-4 shrink-0 items-center justify-center text-neutral-300"
            aria-hidden="true"
          >
            <FileText size={11} />
          </span>
        )}
        {editing ? (
          <InlineEdit
            value={topic.title}
            className="flex-1"
            onCommit={(next) => {
              ctx.setEditingId(null);
              animatedDispatch({
                type: "renameTopic",
                sectionId: ctx.sectionId,
                topicId: topic.id,
                title: next,
              });
            }}
            onCancel={() => ctx.setEditingId(null)}
          />
        ) : (
          <span
            className={`truncate ${lock?.kind === "pattern" ? "font-mono text-[12px]" : ""} ${
              // Ghosted either way — the page is genuinely in the tree
              // and genuinely absent from the published nav, and the
              // canvas has to say both at once. TWO CHANNELS below it
              // (docs/14): a row flagged in its own front matter gets the
              // glyph and an upright title; a row absent only because an
              // ancestor is hidden gets italic and NO glyph. Repeating
              // the glyph would paint 199 of 1,038 rows on the reference
              // corpus and cost it its meaning everywhere else.
              topic.unlisted ? "text-neutral-400" : ""
            } ${topic.unlisted?.inheritedFrom ? "italic cursor-help" : ""}`}
            // An inherited row has no glyph to hover, so its
            // explanation rides on the title — otherwise the italic is
            // a style nobody can interrogate.
            {...titleTip.props}
          >
            {topic.title}
          </span>
        )}
        {titleTip.node}
        {topic.unlisted && topic.unlisted.reasons.length > 0 && (
          <span
            data-testid="unlisted-glyph"
            // NOT lock styling: a lock means immobile, and these pages
            // move freely. Same reason the row keeps full drag behaviour.
            // Every reason named, one per line: a page can be both
            // toc_hide and headless, and dropping one would leave the
            // reader a partial answer to "why isn't this on the site?"
            className="ml-1 shrink-0 cursor-help text-neutral-400"
            {...eyeTip.props}
          >
            <EyeOff size={12} aria-hidden="true" />
          </span>
        )}
        {eyeTip.node}
        {isNestedToc(topic) && (
          <span className="ml-1 shrink-0 rounded-[3px] bg-neutral-100 px-1 text-chrome font-medium uppercase tracking-wide text-neutral-500">
            TOC
          </span>
        )}
        {/* The right rail: how big, then which kind. The count is
            disclosure of folded rows (an atomic boundary reuses the slot
            every other parent uses — it is what turns a boundary from
            "empty" into "big"), so it SURVIVES the chip retirement: it
            was never a property label. The glyph is the rightmost fixed
            slot, one per row, so kinds line up as a scannable column. */}
        {hasChildren ? (
          <span className="ml-auto shrink-0 pl-1 text-chrome tabular-nums text-neutral-400">
            {countTopics(topic.children).total.toLocaleString()}
          </span>
        ) : lock?.count !== undefined ? (
          <span className="ml-auto shrink-0 pl-1 text-chrome tabular-nums text-neutral-400">
            {lock.count.toLocaleString()}
          </span>
        ) : null}
        {badged && (
          <button
            type="button"
            data-testid="aspirational-badge"
            aria-label={`Imagined move — put "${topic.title}" back`}
            className="ml-1 shrink-0 cursor-pointer text-intent"
            {...putBackTip.props}
            // The canvas pan handler captures the pointer, so an overlay
            // control that does not stop propagation has its click eaten
            // — and here the ROW's drag handler would eat it first.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              animatedDispatch({ type: "putBackTopic", topicId: topic.id });
            }}
          >
            <Hand size={12} aria-hidden="true" />
          </button>
        )}
        {putBackTip.node}
        {lock && Glyph && (
          <span
            data-testid="lock-glyph"
            data-lock-kind={lock.kind}
            data-lock-tier={LOCK_TIER[lock.kind]}
            role="img"
            aria-label={LOCK_LABEL[lock.kind]}
            className={`shrink-0 cursor-help ${
              hasChildren || lock.count !== undefined ? "ml-1" : "ml-auto pl-1"
            } ${LOCK_TIER[lock.kind] === "error" ? "text-warning" : "text-neutral-400"}`}
            {...glyphTip.props}
          >
            <Glyph size={12} aria-hidden="true" />
          </span>
        )}
        {glyphTip.node}
      </div>
      {hasChildren && expanded && (
        <ul>
          {topic.children.map((c) => (
            <TopicRow
              key={c.id}
              topic={c}
              level={level + 1}
              ctx={ctx}
              parentTitle={topic.title}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function DropLine({ at, level }: { at: "top" | "bottom"; level: number }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute right-1 z-10 h-0.5 rounded bg-sky-500 ${
        at === "top" ? "-top-px" : "-bottom-px"
      }`}
      style={{ left: `${(level - 1) * 16 + 4}px` }}
    />
  );
}
