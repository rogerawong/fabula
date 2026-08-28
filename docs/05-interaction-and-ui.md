# Interaction & UI

The look and feel is this product's own and is deliberate — clean,
light, CodeHike-inspired, colored dashed card borders. Under the hood:
one interaction system, one animation discipline.

## Layout anatomy

```
┌──────────────────────────────────────────────────────────┐
│ Header: app name · doc name + stats · [+ Load ▾]         │
├───────────┬──────────────────────────────────────────────┤
│ Sidebar   │ Tab bar                                      │
│  section  ├──────────────────────────────────────────────┤
│  list     │ Toolbar: depth commands · selection hint ·   │
│  (reorder)│          auto-arrange · lock                 │
│           ├──────────────────────────────────────────────┤
│  minimap  │ Infinite canvas: cards, connectors,          │
│           │ zoom controls (bottom-left)                  │
└───────────┴──────────────────────────────────────────────┘
```

## Visual language

**These values are normative — the look is settled and right. Do not
"refresh" them during implementation.**

- Light neutral canvas; white cards; orphan cards grey and compact.
- **Soft rounded corners everywhere.** Radius token scale `--radius: 0.5rem`
  (sm 4px / md 6px / lg 8px / xl 12px). Cards use **8px** (`rounded-lg`);
  card headers round the top at md; small chips/badges at 3–4px.
- **Card borders**: `2.5px dashed` in the section's palette color;
  selected = `3px solid` + 2px ring in the same color + elevated shadow;
  drop target = `2.5px solid` + soft outer glow (`{color}60`).
  Card width 300–360px.
- **The 12-hue section palette** (border / tint bg / text):

  | # | Name | Border | Bg | Text |
  |---|---|---|---|---|
  | 0 | blue | `#3b82f6` | `#eff6ff` | `#2563eb` |
  | 1 | green | `#22c55e` | `#f0fdf4` | `#16a34a` |
  | 2 | teal | `#14b8a6` | `#f0fdfa` | `#0d9488` |
  | 3 | orange | `#f59e0b` | `#fffbeb` | `#d97706` |
  | 4 | red | `#ef4444` | `#fef2f2` | `#dc2626` |
  | 5 | indigo | `#6366f1` | `#eef2ff` | `#4f46e5` |
  | 6 | pink | `#ec4899` | `#fdf2f8` | `#db2777` |
  | 7 | purple | `#a855f7` | `#faf5ff` | `#9333ea` |
  | 8 | lime | `#84cc16` | `#f7fee7` | `#65a30d` |
  | 9 | amber | `#d97706` | `#fffbeb` | `#b45309` |
  | 10 | cyan | `#06b6d4` | `#ecfeff` | `#0891b2` |
  | 11 | slate | `#64748b` | `#f8fafc` | `#475569` |

  Assigned round-robin to regular sections in document order; orphan cards
  use the neutral fallback (border `#9ca3af`, bg `#f3f4f6`, text
  `#6b7280`) and skip a palette slot.

  > **[amended 2026-08-18, scoped] Header INK derives from a darker
  > per-hue ramp, not the `Text` column.** Five of the twelve `Text`
  > shades measure 3.1–4.4:1 on their own `Bg` tints (green `#16a34a`
  > on `#f0fdf4` ≈ 3.1:1 — detector receipts, three critiques
  > running), so text that must READ on the tint — the card title, the
  > count pill, the card-level glyph — takes the per-hue -800-class
  > ink in `view/canvas/badgeColors.ts`, unit-asserted ≥ 4.5:1 on both
  > the tint and white (`badgeContrast.test.ts`). The table above
  > stays verbatim and normative for everything else it feeds —
  > borders, tints, dots, minimap, ghosts. The scope is deliberate:
  > this amends a DERIVATION for reading text, not the palette.

  > **[amended 2026-08-19, scoped] A THIRD tone: the intent token,
  > `--color-intent: #6d28d9`.** Authorized at docs/21's gate 1 (R2)
  > and landing with that note's build. It marks ONE thing — an
  > aspirational move: a row imagined somewhere the app will not write
  > it, awaiting a human's hand (`view/canvas/TopicRow.tsx`, the
  > badge; the Overview's "imagined moves" line; the result view's
  > split sentence).
  >
  > **Why a third tone rather than the warning token.** The
  > tier-membership test (docs/19, `model/locks.ts`: *does this mean
  > something in the FILES should change?*) puts an aspirational move
  > embarrassingly close to the error tier, because it does. The
  > two-sentence test is what separates them: *"the warning token
  > marks a FAULT in the corpus"* / *"the intent token marks a MOVE
  > AWAITING YOUR HAND"*. A fault and an intention are different kinds
  > of thing, and painting an intention in the fault's tone would spend
  > the error tier's jump — the same economy that keeps six of the
  > seven lock kinds quiet monochrome.
  >
  > **Receipts, computed not eyeballed** (`badgeContrast.test.ts`):
  > **7.10:1 on white** (the card body the rows sit on) and **≥ 6.35:1
  > on every one of the twelve palette tints plus the orphan fallback**
  > — both asserted per hue rather than on the ones a corpus happens to
  > use. It is a different HUE from the warning amber (`#b45309`), not
  > a lighter shade of it, and the test pins that too: two severities of
  > one thing is exactly the reading the split exists to prevent.
  >
  > Scope, deliberately narrow: the token marks aspirational moves and
  > nothing else. The palette table above is untouched, the warning
  > token keeps its sole meaning, and a `consent`-kind record gets NO
  > canvas mark at all — that row is ordinary and writable-with-consent,
  > so a mark would cry wolf about a row nothing is wrong with.

  > **[amended 2026-08-21, scoped] The intent token gains its second
  > consumer: a CARD-level mark** (`view/canvas/cardMarks.ts`,
  > `card-mark-created`). docs/22's Decision 5 marks a card the write
  > path cannot record — imagined structure, awaiting a human's hand,
  > which is the token's existing meaning applied to a card instead of
  > a row. The two-sentence test still separates it from the warning
  > token, and the scope sentence above widens by exactly one clause:
  > the token marks aspirational MOVES and imagined CARDS, and nothing
  > else.
  >
  > **The sibling mark is the counter-example, and it is deliberate.** A
  > card with no home this navigation file can write
  > (`card-mark-unhoused`) DOES mean something in the files should
  > change — it blocks the export outright — so it wears the WARNING
  > token, and it is the only card mark that does. The two glyphs
  > differ in SILHOUETTE as well as tone (a plus-in-circle against a
  > triangle), so they still classify at 50% canvas zoom and for a
  > reader who cannot tell the tones apart — the lock legend's own rule,
  > one layer up. A card that is BOTH shows the warning one: two marks
  > would be two competing calls to action for one thing to do.
  >
  > No new contrast receipt is owed: the tokens are unchanged and the
  > mark sits on the card header tint, which `badgeContrast.test.ts`
  > already covers per hue. What paints is asserted in the browser
  > instead (`e2e/flow17-structural-remainders.spec.ts`), where each
  > mark's computed colour is read back and compared against its token
  > resolved through the same engine.
- Sequence badges (numbered circles) above cards, connected by bezier
  connectors tracing reading order.
- Type: Inter for UI, JetBrains Mono for code/YAML. Self-host fonts
  (no Google Fonts requests — privacy requirement).
- Density: cards show a per-level indented tree with counts; ~13px body.
- Dark mode: post-v1, but build with tokens from day one so it's cheap —
  the palette table above is the light-mode set; dark variants get derived
  later, not invented per-component.

## Card anatomy

- Header: color dot + title (double-click renames) + topic-count badge +
  code-view toggle + collapse chevron. Header is the card-drag handle.
- Stats ribbon: per-level counts, current depth.
- Body: recursive topic tree — expand/collapse carets, hover affordances,
  count on parent rows, badge on nested-TOC leaves ("TOC"), drag handles
  implicit (whole row draggable unless locked).
- Code view: swaps body for read-only YAML (serialized on demand via the
  document's adapter).

## Gestures (all through the interaction state machines, 03)

| Gesture | Result |
|---|---|
| Drag empty canvas / wheel | Pan / zoom (zoom centers on cursor) |
| Drag card header | Reorder card; live ghost + column preview; drop commits one command |
| Drag topic row | Move topic; drop targets: position in any card's tree (insertion indicator with indent showing sibling-vs-child), or empty canvas → a new card whose SHAPE the entry decides (see the ruled births below) |
| Right-click a card | Add heading / Remove heading (the species commands), Reorganize with AI scoped to the card, Remove card |
| Shift+click topic / drag in card body | Multi-select / box-select; drag any selected row moves the group |
| Double-click title | Inline edit (Enter commit, Esc cancel, IME-safe, drag suppressed) |
| Click card / Escape | Select / deselect (routes depth commands) |

Drop-target rules: cannot drop into own subtree; hovering shows live
preview titles in the target; invalid targets show no indicator rather
than an error state.

> **[amended 2026-08-21, scoped] What a drag-out MAKES is ruled, and
> the gesture may now ASK first** (docs/22 arc 2, Decisions 2 and 7).
> The row above used to end "(parent topics unwrap)", which described
> one of the two shapes and left the other looking like an accident.
>
> **One gesture meaning, two birth shapes, decided by the ENTRY.** The
> ruling of record: *"Dragging a topic out to the canvas must always be
> interpreted as user intent to promote a topic/topic tree to the
> top-level."* So a **parented** entry births the PROMOTED section —
> heading is the entry's own name, path carried, children become the
> rows, which is the shipped unwrap kept and now ruled — and a
> **childless** entry births the **standalone entry**: the entry itself
> at top level, wrapped in nothing. Promotion of a leaf IS the
> standalone. What shipped before was a one-entry group whose heading
> duplicated the entry's name, and the note calls that the misreading of
> the motive rather than a second meaning.
>
> **A PINNED parented entry WRAPS instead, canvas-wide.** The entry
> stays a row inside the born card, so the pin survives and the
> displacement records normally; promotion would make the entry the
> card's face, and `Section` has no lock. A pinned CHILDLESS entry
> births the standalone, where the pin rides `topics[0]` exactly as it
> does inside any card. This is what retired the refusal that used to
> decline a pinned row the empty-canvas drop.
>
> **The drop position names the HOME**, and the home's declared bearing
> decides what may be born there: a home that bears standalones takes
> one, a home that bears sections only WRAPS the entry with a
> placeholder heading, and a home that bears neither refuses the drop
> with a sentence naming the lanes that do. Nothing is born unhoused.
>
> **The species commands are explicit and undoable**, never an inference
> from row count: "Add heading" puts a new group over a standalone's
> content — the entry stays an entry, which is what distinguishes it
> from promotion — and "Remove heading" returns a pure-name card to what
> its entry dictates. A path-bearing card face is an ENTRY, so removing
> it would be page deletion and is refused with its own sentence; a
> heading over several entries is a section, and the refusal names the
> drag that breaks it up.
>
> **A second drop on a standalone is the commitment.** A SIBLING drop
> converts the card to a placeholder section holding both entries; a
> CHILD drop makes the entry parented, so the card promotes (or wraps,
> when the entry is pinned). One gesture, one undoable command, whose
> inverse restores the standalone and the moved row's origin together.
>
> **A structure-MAKING gesture on a document whose write path cannot
> record a card ASKS ONCE**, at the release point, through the same
> two-option seam a pinned drop uses — a MODE choice about the tab,
> never a move confirmation. Consent flips the tab to Aspirational and
> the card lands labeled; declining is sticky and later attempts refuse
> with the escape hatch named. Order-changing gestures do NOT ask: a
> reorder writes no record for consent to license, and a menu on every
> card drag would be the forty-modals failure.

### Containers (formats with nav levels above the card)

Some formats nest cards inside containers that have no card of their own
— Mintlify tabs and dropdowns, and later mdBook/Jupyter Book/GitBook
parts, Docusaurus categories, DITA branches. Cards then carry a **chain**
(their ordered ancestor path), and two gestures need constraining:

- the card meta ribbon gains a **chain chip** naming the containing
  container, because a constraint the user cannot see is arbitrary;
- **cross-chain drops are refused at drag time**, with a one-line reason
  on the drag ghost, rather than accepted and silently dropped on export.
  A gesture that appears to work and does nothing is worse than one that
  is refused. A boundary between two chains stays legal — only a slot
  buried inside another chain's run is refused.

Auto-arrange groups columns by chain, with label bands, so the layout
agrees with the constraint. Reparenting across containers is v2, and
container reordering is its own affordance — never derived from where
member cards sit. Full mechanism and rationale: docs/13.

## Animation discipline

Animation exists to make structure changes legible — especially undo.
First-paint races are animation's most expensive failure class —
prototyping paid for each of these rules:

1. **Animation state must be present at first commit.** Anything that
   animates in must have its starting style at the moment React commits the
   node — set during render (refs/state computed synchronously), never in a
   post-paint `useEffect`. No flash-then-animate, ever.
2. **FLIP for movement** via the Web Animations API: snapshot rects before
   a command applies (commands emit animation hints — moved ids, removed
   rects), re-render, then animate deltas in one rAF. One shared FLIP
   utility; no per-feature reimplementations.
3. **Ghosts for removal**: undoing a section-create renders a fixed-position
   dashed shell fading ~400ms at the removed card's rect while its topics
   fly home.
4. **Transitions for reflow**: card position changes during
   reorder/undo/auto-arrange restore use ~400ms ease transitions activated
   only for the duration (flag with timeout), so drags stay transition-free.
5. **Durations**: 150–200ms micro (hover, fades), 300–450ms structural.
   `prefers-reduced-motion` collapses all of it to instant.
6. Toast + undo interplay: toasts carry stable ids keyed to the operation;
   restoring/undoing dismisses the toast before mutating (doing these in
   the wrong order ships a duplicate-tab race).

## Feedback & empty states

- Every command completion → sonner toast, bottom-right, with Undo action
  where applicable; errors are specific ("Not a DocFX TOC: …"), never raw
  exceptions.
- Empty tab: centered call-to-action (Load file / URL / paste / sample).
- Loading a doc into a non-empty tab replaces it (with toast + undo?), or
  new tab — decide during M6; replacing silently surprises.

## Keyboard

See the map in 02-requirements.md. Global listener ignores events from
inputs/contenteditable. All header/toolbar controls are real buttons with
labels/tooltips — keyboard reachable and screen-reader named
(mouse-only controls are review-blocking).
