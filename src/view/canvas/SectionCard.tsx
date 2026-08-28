/**
 * SectionCard.tsx — One section card (regular or orphan-compact).
 * Visual language is normative (docs/05): 2.5px dashed border in the
 * section color, 8px radius, selected = 3px solid + ring; drop target =
 * solid + soft glow.
 *
 * Interaction surfaces (M4): header = card-drag handle + double-click
 * rename; body rows = topic drag/select/rename; body padding =
 * box-select. Reports its rendered height upward (ResizeObserver) so
 * layout never reads the DOM (docs/03).
 */

import { lazy, memo, Suspense, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Code2, EyeOff, Lock, Trash2 } from "lucide-react";
import { animatedDispatch } from "@/animation/animatedActions";
import { beginBoxSelect } from "@/interaction/boxSelect";
import { beginCardDrag } from "@/interaction/cardDrag";
import { useDragStore } from "@/interaction/dragStore";
import { deriveSectionOrder } from "@/layout/columns";
import { serializeSection } from "@/formats/registry";
import type { Section, TopicId } from "@/model/types";
import type { RenameCapability } from "@/formats/types";
import type { SectionColor } from "@/model/palette";
import {
  allRowsLocked,
  chainLabel,
  hiddenSubtreeDetail,
  hiddenSubtreeLine,
  isSealed,
  sectionStats,
} from "@/model/selectors";
import { useAppStore } from "@/store";
import { InlineEdit } from "@/view/InlineEdit";
import { useTooltip } from "@/view/Tooltip";
import { useUiStore } from "@/view/uiStore";
import { badgeNumeral } from "./badgeColors";
import type { CardMark } from "./cardMarks";
import { TopicTree } from "./TopicTree";
import { isNestedToc } from "./TopicRow";

/**
 * Per-level chip colors: TINT is the section hue the fill derives from,
 * TEXT a darker same-family shade — dark-on-tint, the same move the
 * order badges made, unit-asserted ≥ 4.5:1 on the composited fill
 * (badgeContrast.test.ts). Exported for that test.
 */
export const LEVEL_CHIPS: readonly { tint: string; text: string }[] = [
  { tint: "#f97316", text: "#9a3412" },
  { tint: "#16a34a", text: "#166534" },
  { tint: "#9333ea", text: "#6b21a8" },
  { tint: "#e11d48", text: "#9f1239" },
  { tint: "#0284c7", text: "#075985" },
];
/** The alpha the chip fill renders at (`${tint}1a`). */
export const LEVEL_CHIP_ALPHA = 0x1a / 0xff;

// CodeMirror loads only when a card first flips to code view
const CodeView = lazy(() => import("./CodeView"));

interface SectionCardProps {
  tabId: string;
  section: Section;
  /** For the per-card code view: serialization routes through the
   *  adapter that parsed this document. */
  formatId: string;
  color: SectionColor;
  x: number;
  y: number;
  width: number;
  depth: number;
  selected: boolean;
  locked: boolean;
  /** Which node kinds this document can rename (docs/13). */
  renameable: RenameCapability;
  /**
   * The container this card lives in, named for a tooltip — "Tab
   * 'API reference'". The CHIP shows the container's name only: the
   * bare word "tab" collides with the app's own document tabs, and the
   * tooltip is where the format's term earns its keep (docs/13 v2).
   */
  containerTooltip?: string;
  /**
   * Structure this card holds that the write path cannot express
   * (docs/22, Decision 5) — a created card, or a card with no home.
   *
   * PASSED IN, never derived here: both are whole-DOCUMENT questions,
   * and asking them per card would be O(cards²) on a path that runs
   * during a drag. Absent means the card is ordinary.
   */
  mark?: CardMark;
  dragging: boolean;
  /** True while a card drag previews the layout — position changes get
   *  CSS transitions for exactly that duration (docs/05 rule 4). */
  previewing: boolean;
  selectedTopicIds: readonly TopicId[];
}

export const SectionCard = memo(function SectionCard({
  tabId,
  section,
  formatId,
  color,
  x,
  y,
  width,
  depth,
  selected,
  locked,
  renameable,
  containerTooltip,
  mark,
  dragging,
  previewing,
  selectedTopicIds,
}: SectionCardProps) {
  const selectSection = useAppStore((s) => s.selectSection);
  const setTopicSelection = useAppStore((s) => s.setTopicSelection);
  const reportCardHeight = useAppStore((s) => s.reportCardHeight);
  const [bodyCollapsed, setBodyCollapsed] = useState(false);

  /** Card selection gestures: plain = single · shift = range from the
   *  anchor in reading order · alt/cmd = toggle, any order. */
  const onCardClick = (e: React.MouseEvent) => {
    const store = useAppStore.getState();
    const tab = store.tabs.find((t) => t.id === tabId);
    if (e.shiftKey && tab && tab.selectedSectionIds.length > 0) {
      const order = deriveSectionOrder(tab.editor.columns);
      const anchor = tab.selectedSectionIds[0]!;
      const a = order.indexOf(anchor);
      const b = order.indexOf(section.id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const range = order.slice(lo, hi + 1);
        store.setSectionSelection([anchor, ...range.filter((id) => id !== anchor)]);
        return;
      }
    }
    if (e.metaKey || e.altKey) {
      store.toggleSectionSelected(section.id);
      return;
    }
    selectSection(section.id);
  };
  const [renaming, setRenaming] = useState(false);
  const [codeView, setCodeView] = useState(false);

  // Drop-target state for THIS card, as identity-stable primitives so
  // pointermove storms don't rerender every card (docs/03).
  const indicatorKey = useDragStore((s) =>
    s.dropTarget?.kind === "topic" && s.dropTarget.sectionId === section.id
      ? `${s.dropTarget.indicator.topicId}:${s.dropTarget.indicator.position}`
      : null,
  );
  const isDropSection = useDragStore(
    (s) => s.dropTarget?.kind === "section-end" && s.dropTarget.sectionId === section.id,
  );

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => reportCardHeight(tabId, section.id, el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabId, section.id, reportCardHeight]);

  const stats = sectionStats(section);
  const hiddenLine = hiddenSubtreeLine(section);
  const hiddenDetail = hiddenSubtreeDetail(section);
  // Header INK: the darker per-hue ramp the badges use, not the
  // palette's `text` shade — five of the twelve `text` shades sit at
  // 3.1–4.4:1 on their own tints (docs/05, dated amendment 2026-08-18).
  // The palette constants stay verbatim; only the derivation changed.
  // Unit-asserted ≥ 4.5:1 on both the header tint and white
  // (badgeContrast.test.ts).
  const ink = badgeNumeral(color);
  // Styled tooltips (the one tooltip system — Tooltip.tsx). Hooks sit
  // above the orphan early-return so both variants share them.
  const cardEyeTip = useTooltip(
    section.unlisted
      ? section.unlisted.reasons.map((r) => `${r.label}: ${r.note}`)
      : null,
  );
  const hiddenTip = useTooltip(hiddenDetail ? [hiddenDetail] : null);
  const markTip = useTooltip(mark ? [mark.tooltip] : null);
  const containerTip = useTooltip(
    chainLabel(section) ? [containerTooltip ?? (section.chain ?? []).join(" › ")] : null,
  );
  const removeTip = useTooltip(["Remove card (undo restores it)"]);
  // The resting border is DASHED, which reads as permeable — things pass
  // through it. Sealed is its antonym: the same weight, continuous, with
  // a second rule just inside. That inner rule is a box-shadow rather
  // than the border itself, so selection and drop-target keep the border
  // channel they already own and both states stay readable at once.
  //
  // Two different facts, deliberately not merged (docs/13). A DECLARED
  // seal means the contents are generated elsewhere and the card is not
  // editable. `allRowsLocked` only means nothing in it happens to be
  // movable right now — a hint, not a claim about what the card permits,
  // and never true of an empty card.
  const declaredSeal = isSealed(section);
  const sealed = declaredSeal || allRowsLocked(section);
  // Equal weights: the inner line matches the border rather than
  // hairlining under it, so the pair reads as one doubled rule at
  // presentation distance instead of a slightly thicker edge.
  const innerRule = sealed
    ? `, inset 0 0 0 2px #fff, inset 0 0 0 4.5px ${color.border}`
    : "";
  // Only while topics are being dragged, and only for cards this drag
  // may legally land on. Never during a card drag: a card is not a drop
  // target for itself, and lighting every card would be noise.
  const eligible = useDragStore(
    (state) =>
      state.kind === "topics" &&
      (state.eligibleSectionIds?.includes(section.id) ?? false),
  );

  const borderStyle = isDropSection
    ? {
        border: `2.5px solid ${color.border}`,
        boxShadow: `0 0 0 4px ${color.border}60${innerRule}`,
      }
    : selected
      ? {
          border: `3px solid ${color.border}`,
          boxShadow: `0 0 0 2px ${color.border}40, 0 8px 24px rgba(0,0,0,0.12)${innerRule}`,
        }
      : eligible
        ? {
            // Eligible-but-not-hovered: the card's OWN dashed border,
            // lifted by a soft halo in its own hue. Quiet on purpose —
            // it says "you may drop here", while `isDropSection` above
            // says "you are dropping here", and the two must not read
            // as the same state. Stays inside the pinned visual
            // language (docs/05): same 2.5px dashed edge, same
            // 12-hue palette, no new idiom.
            border: `2.5px ${sealed ? "solid" : "dashed"} ${color.border}`,
            boxShadow: `0 0 0 3px ${color.border}25${innerRule}`,
          }
        : {
            border: `2.5px ${sealed ? "solid" : "dashed"} ${color.border}`,
            ...(sealed ? { boxShadow: innerRule.slice(2) } : {}),
          };

  /**
   * THE PLACEHOLDER'S TOOLTIP, through the app's one tooltip surface.
   * Native `title=` is the recorded defect class (`view/Tooltip.tsx`) —
   * right words, weakest surface — and does not appear in src/view.
   */
  const untitledTip = useTooltip(
    section.untitled
      ? [
          "Placeholder name",
          "Nobody has named this card yet — the app supplied a stand-in when the drag made it.",
          "Double-click the heading to name it.",
        ]
      : null,
  );

  const commitRename = (title: string) => {
    setRenaming(false);
    animatedDispatch({ type: "renameSection", sectionId: section.id, title });
  };

  const previewTransition = previewing
    ? "transition-[left,top] duration-300 ease-out"
    : "";

  // ── Orphan: compact single-row card (whole card = drag handle) ──
  if (section.isOrphan) {
    const topic = section.topics[0];
    return (
      <div
        ref={ref}
        data-testid="card"
        data-card-id={section.id}
        data-card-variant="orphan"
        data-drop-eligible={eligible ? "true" : undefined}
        data-flip-id={`card:${section.id}`}
        className={`absolute cursor-grab rounded-lg bg-neutral-100 px-3 py-2 ${dragging ? "opacity-50" : ""} ${previewTransition}`}
        style={{ left: x, top: y, width, ...borderStyle }}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (e.button === 0 && !renaming) beginCardDrag(e, tabId, section.id);
        }}
        onClick={onCardClick}
        onContextMenu={(e) => {
          e.preventDefault();
          // keep an existing multi-selection that includes this card
          const t = useAppStore.getState().tabs.find((x) => x.id === tabId);
          if (!t?.selectedSectionIds.includes(section.id)) selectSection(section.id);
          useUiStore.getState().setCanvasMenu({
            x: e.clientX,
            y: e.clientY,
            target: { kind: "card", sectionId: section.id },
          });
        }}
        onDoubleClick={() => renameable.sections && setRenaming(true)}
      >
        <div className="flex h-9 items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color.border }}
          />
          {renaming ? (
            <InlineEdit
              value={section.title}
              className="flex-1"
              onCommit={commitRename}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <span className="truncate text-[13px] font-medium text-neutral-600">
              {section.title}
            </span>
          )}
          {topic && isNestedToc(topic) && (
            <span className="rounded-[3px] bg-white px-1 text-chrome font-medium uppercase tracking-wide text-neutral-500">
              TOC
            </span>
          )}
          {/**
           * THE CARD MARK, on the standalone variant too (docs/22 arc
           * 2). It was missing here: `cardMarks` computed the mark for
           * every card and only the SECTION branch painted one, so a
           * standalone with no home was marked in state and blank on
           * screen — the exact failure mode "verify the paint, not just
           * the state" names, found by an e2e that expected the mark
           * and got none.
           *
           * A new input species obligates a CONSUMER SWEEP: arc 2 makes
           * the standalone a routine birth shape, and this branch is a
           * consumer that had never had to answer for one.
           *
           * ITS OWN ELEMENT, outside every truncating wrapper, for the
           * reason the section branch gives at its own copy.
           */}
          {mark && (
            <span
              data-testid={mark.testid}
              data-card-mark={mark.kind}
              className="ml-1 shrink-0 cursor-help"
              style={{ color: mark.tone }}
              {...markTip.props}
            >
              <mark.glyph size={12} aria-hidden="true" />
            </span>
          )}
          {markTip.node}
          {topic?.path && !renaming && (
            <span className="ml-auto truncate text-[11px] text-neutral-400">
              {topic.path}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Regular card ──────────────────────────────────────────
  // per-level chips (the docs/05 treatment — scannable at density)
  const levelChips = Object.entries(stats.levelCounts).map(([level, n]) => {
    const chip = LEVEL_CHIPS[(Number(level) - 1) % LEVEL_CHIPS.length]!;
    return (
      <span
        key={level}
        className="rounded-[4px] px-1 text-chrome font-semibold tabular-nums"
        style={{ backgroundColor: `${chip.tint}1a`, color: chip.text }}
      >
        L{level}: {n}
      </span>
    );
  });

  return (
    <div
      ref={ref}
      data-testid="card"
      data-card-id={section.id}
      data-card-variant="section"
      data-drop-eligible={eligible ? "true" : undefined}
      data-flip-id={`card:${section.id}`}
      className={`absolute rounded-lg bg-white shadow-sm ${dragging ? "opacity-50" : ""} ${previewTransition}`}
      style={{ left: x, top: y, width, ...borderStyle }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onCardClick}
      onContextMenu={(e) => {
        e.preventDefault();
        // keep an existing multi-selection that includes this card
        const t = useAppStore.getState().tabs.find((x) => x.id === tabId);
        if (!t?.selectedSectionIds.includes(section.id)) selectSection(section.id);
        useUiStore.getState().setCanvasMenu({
          x: e.clientX,
          y: e.clientY,
          target: { kind: "card", sectionId: section.id },
        });
      }}
    >
      <header
        className="cursor-grab rounded-t-md px-3 pb-2 pt-2.5"
        style={{ backgroundColor: color.bg }}
        onPointerDown={(e) => {
          // buttons/inputs keep their own behavior; anywhere else drags
          if (e.button !== 0 || renaming) return;
          const t = e.target as HTMLElement;
          if (t.closest("button") || t.closest("input")) return;
          e.stopPropagation();
          beginCardDrag(e, tabId, section.id);
        }}
        onClick={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("button") || t.closest("input")) return;
          // the header means THE CARD: drop any topic selection so
          // Delete acts on the card, not a stale row (selection still
          // bubbles to the card's selectSection)
          setTopicSelection([]);
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color.border }}
          />
          {renaming ? (
            <InlineEdit
              value={section.title}
              className="flex-1 text-[14px] font-semibold"
              onCommit={commitRename}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <h3
              /**
               * THE PLACEHOLDER READS AS ONE (docs/22, Decision 2).
               *
               * The fact it must communicate is "nobody chose this name
               * yet", and the treatment is the one every placeholder in
               * every text field already uses: muted and italic, so it
               * is legible as a stand-in at a glance and needs no legend.
               * It is still the card's real title — export writes it —
               * so this is a weight change, never a different string.
               *
               * NOT THE WARNING TONE. Nothing about the files is wrong;
               * spending salience here would cost the error tier its
               * jump (the membership test in `locks.ts`).
               */
              data-untitled={section.untitled ? "true" : undefined}
              className={`truncate text-title font-semibold ${
                section.untitled ? "italic opacity-60" : ""
              }`}
              style={{ color: ink }}
              {...untitledTip.props}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setRenaming(true);
              }}
            >
              {section.title}
            </h3>
          )}
          {untitledTip.node}
          {section.unlisted && (
            <span
              data-testid="unlisted-glyph-card"
              // Interim minimum, deliberately the SAME glyph the rows
              // use: the card is the hidden thing here, and inventing a
              // card-specific treatment is the Impeccable pass's call,
              // not this change's.
              className="ml-1 shrink-0 cursor-help opacity-70"
              style={{ color: ink }}
              {...cardEyeTip.props}
            >
              <EyeOff size={12} aria-hidden="true" />
            </span>
          )}
          {cardEyeTip.node}
          {mark && (
            <span
              data-testid={mark.testid}
              data-card-mark={mark.kind}
              // ITS OWN ELEMENT, outside every truncating wrapper: a
              // truncation wrapper owns single-line text only, and a
              // glyph inside one is eaten silently while every state
              // assertion passes.
              className="ml-1 shrink-0 cursor-help"
              style={{ color: mark.tone }}
              {...markTip.props}
            >
              <mark.glyph size={12} aria-hidden="true" />
            </span>
          )}
          {markTip.node}
          <span
            data-testid="topic-count"
            className="ml-auto shrink-0 rounded-full bg-white px-1.5 text-chrome font-medium tabular-nums"
            style={{ color: ink }}
          >
            {stats.total}
          </span>
          <button
            type="button"
            aria-label={`Remove section ${section.title}`}
            data-testid="remove-section"
            {...removeTip.props}
            className="shrink-0 rounded-sm p-0.5 text-neutral-400 hover:bg-white/60 hover:text-red-600"
            onClick={(e) => {
              e.stopPropagation();
              animatedDispatch({ type: "removeSection", sectionId: section.id });
            }}
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            aria-label={codeView ? "Show topic tree" : "Show YAML"}
            aria-pressed={codeView}
            className={`shrink-0 rounded-sm p-0.5 hover:bg-white/60 ${
              codeView ? "text-neutral-700" : "text-neutral-400 hover:text-neutral-600"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setCodeView((c) => !c);
            }}
          >
            <Code2 size={14} />
          </button>
          <button
            type="button"
            aria-label={bodyCollapsed ? "Expand card" : "Collapse card"}
            className="shrink-0 rounded-sm p-0.5 text-neutral-400 hover:bg-white/60 hover:text-neutral-600"
            onClick={(e) => {
              e.stopPropagation();
              setBodyCollapsed((c) => !c);
            }}
          >
            {bodyCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
        {removeTip.node}
        <div className="mt-1 flex items-center gap-1 pl-[18px] text-chrome text-neutral-500">
          {/* A sealed card with no rows is NOT empty — its contents are
              generated elsewhere. Saying "empty" there is the misread this
              distinction exists to prevent (docs/13). */}
          {levelChips.length > 0 ? (
            levelChips
          ) : declaredSeal ? (
            <span className="flex items-center gap-1 truncate text-neutral-600">
              <Lock size={10} className="shrink-0" aria-hidden="true" />
              {section.sealed?.source ?? "Generated elsewhere"}
            </span>
          ) : (
            <span>empty</span>
          )}
          <span className="pl-0.5">Depth: {stats.maxDepth}</span>
          {/* Which container this card lives in. Without it a cross-chain
              drop refusal is arbitrary — the user cannot see the rule it
              enforces (docs/13). */}
          {chainLabel(section) && (
            <span
              className="ml-auto max-w-[45%] shrink-0 cursor-help truncate rounded-[3px] bg-neutral-100 px-1 text-chrome font-medium text-neutral-600"
              {...containerTip.props}
            >
              {chainLabel(section)}
            </span>
          )}
          {containerTip.node}
        </div>
        {/*
          The cause, named once, where the cause lives — persistent, so it
          survives scrolling, zooming and touch, none of which a hover
          does. The per-row italic can say "inside something hidden" but
          not WHICH something without a tooltip; on the reference corpus
          199 rows inherit from one container. Aggregate by design: per-row
          detail stays on the row (docs/14).
        */}
        {hiddenLine && (
          <div
            data-testid="hidden-subtree-line"
            // WRAPS, deliberately. This line's whole job is to name a
            // cause, and a truncated cause name ("…via “Kubeadm Generat…")
            // is worse than no line: it tells the reader something is
            // hidden and withholds the one fact that would let them find
            // it. Every other chip on this card truncates because its
            // content is expendable; this one's is the point. `items-start`
            // keeps the glyph on the first line.
            className="mt-0.5 flex cursor-help items-start gap-1 pl-[18px] text-chrome leading-snug text-neutral-500 italic"
            {...hiddenTip.props}
          >
            <EyeOff size={10} className="mt-[3px] shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{hiddenLine}</span>
          </div>
        )}
        {hiddenTip.node}
      </header>
      {!bodyCollapsed && codeView && (
        <div className="border-t border-neutral-100">
          <Suspense
            fallback={
              <div className="p-3 text-[12px] text-neutral-400">Loading viewer…</div>
            }
          >
            <CodeView text={serializeSection(formatId, section)} />
          </Suspense>
        </div>
      )}
      {!bodyCollapsed && !codeView && (
        <div
          className="border-t border-neutral-100"
          onPointerDown={(e) => {
            // empty space starts a box-select — including the empty
            // LEFTOVER inside rows, which lets drags bubble up here;
            // row content stops propagation before this handler
            if (e.button !== 0 || locked) return;
            e.stopPropagation();
            if (ref.current) beginBoxSelect(e, tabId, section.id, ref.current);
          }}
        >
          {/* key by depth: depth commands reset per-row caret overrides */}
          <TopicTree
            key={depth}
            tabId={tabId}
            sectionId={section.id}
            sectionTitle={section.title}
            topics={section.topics}
            depth={depth}
            locked={locked}
            renameable={renameable}
            selectedTopicIds={selectedTopicIds}
            indicatorKey={indicatorKey}
          />
        </div>
      )}
    </div>
  );
});
