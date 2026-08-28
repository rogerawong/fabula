# Impeccable critique — k8s whole-site pass

Date: 2026-08-16 · Build: main @ 7254e0a · Corpus: kubernetes/website
(sparse, content/en/docs, commit 6449f1e), whole-site load — 7 cards /
1,038 topics / depth 5.

Provenance: run from the claude.ai design session driving the live app
via browser (single-context — no sub-agents; degraded per the rubric's
own banner). Detector: impeccable @ bd25359, injected, run at 50% canvas
zoom with the Reference card at depth 4 — text-overflow and occlusion
counts are inflated by that state and marked accordingly. Persisted
after the fact via export; Claude Code correctly declined to reconstruct
a report it did not run.

## Design Health: 33/40 (prior baseline 28/40) — amended to 34/40, see log

| #   | Heuristic             | Was → Now | Note                                                                        |
| --- | --------------------- | --------- | --------------------------------------------------------------------------- |
| 1   | Visibility of status  | 3 → 4     | Unlisted marks; live counts (scope, payload tokens); per-card depth chip    |
| 2   | Match to real world   | 3 → 4     | Published-order sidebar; linktitle law visible; tooltips cite flag + remedy |
| 3   | User control          | 3 → 3*    | Esc everywhere; per-card scoping. *Amended to 4 — see log entry 2           |
| 4   | Consistency           | 3 → 3     | Ghost/chip language coherent; tooltip delivery split styled vs native       |
| 5   | Error prevention      | 3 → 4     | Capability gating live; force-disabled toggles; titles-only line            |
| 6   | Recognition vs recall | 3 → 3     | Italic/ghost meanings hover-only; order badges still unexplained            |
| 7   | Flexibility           | 2 → 3     | Sidebar-select → per-card depth scoping; still no shortcuts/palette         |
| 8   | Aesthetic/minimalist  | 3 → 3     | Tagline still under the minimap; density otherwise disciplined              |
| 9   | Error recovery        | 3 → 3     | Refusal invariant held live; retry path code-verified only                  |
| 10  | Help & docs           | 2 → 3     | Empty state teaches the thesis; tooltips carry remedies; no shortcut sheet  |

## Detector (168 findings / 161 elements; prior 56/47)

Durable: low-contrast ×12 — order badges still white on #3b82f6 (3.7:1)
and #22c55e (2.3:1); improved from 28 via dark-on-tint chips, badge
fills unfixed (carried P2, second critique). undersized-ui-text ×21 —
10px L-chips unchanged (carried P2). flat-type-hierarchy — 10–16px,
1.6:1 (carried, founding finding). Scale-inflated noise: text-overflow
×101 (span.truncate doing designed truncation at depth-4 density — the
count is a density datum, not a defect); occlusion ×26 and
clipped-overflow ×2 largely canvas-transform artifacts per the first
pass.

## Findings & dispositions

- P1 — Language door recorded-not-built. Zero disclosure of 16 sibling
  languages; the settled decision absent. Plus new nuance:
  declared-vs-present (sparse clones declare 17, carry 1).
  DISPOSITION: session-1 shipped data layer + persistent disclosure
  chip; picker under the source-capability-split decision (handle →
  programmatic sub-import; handle-less → disabled-with-reason).
- P1→P2 — Inherited tooltip: right words, weakest surface. Copy
  exemplary (named ancestor, published-at-URL precision, remedy);
  delivery is native title — delay, unstyled, touch-invisible, zero
  affordance. Candidates: card-level cause line ("199 rows hidden via
  'Definitions'") preferred; styled tooltip + cursor:help alternative.
  CLOSED 2026-08-18 (polish-glyphs): styled tooltip component shipped
  (`view/Tooltip.tsx`), native `title` retired across src/view — the
  inherited row, both eye-off glyphs, the hidden-subtree line, the
  chain chip, AND the disabled-control reasons (Review-changes button,
  AI toggles, save-to-folder) all deliver through it, cursor:help on
  the informational ones. One tooltip system. (The card-level cause
  line preferred here had ALREADY shipped as the hidden-subtree line —
  this closure adds the styled surface on top.) See amendments log 4.
- P2 — Drag-refusal messaging. Initially "verified absent" by
  automation; investigation found the mechanism finished and one
  drag.set() uncalled. CLOSED present-and-verified: four-state live
  table (grab / not-allowed + red reason at pointer / grab / cleared),
  e2e pinning rendered output incl. negative + cleanup. See log.
- P3 — Refused-drag selection residue. CLOSED by-design after
  measurement: selection is set at drag start and identical for allowed
  and refused drags; outcome-dependent clearing would be the worse
  behavior. Lesson recorded: findings need a control group — the
  original observation had no allowed-drag contrast case.
- P2 carried ×3 — badge contrast (fix: dark-on-tint numerals, the
  chips' own move), 10px chip floor, type ramp. Two critiques of
  receipts; routed to /impeccable colorize + typeset, separate session.
  CLOSED 2026-08-18 (polish-glyphs), detector deltas in log entry 4.
- P3 carried — marketing tagline under the minimap. CLOSED 2026-08-18:
  removed (polish-glyphs).

## What's working

Seven-card whole-site view: the shape-fidelity law honored to the
letter — published order, correct labels, 1,038 topics at 94 ms.
Corrected unlisted semantics true in the wild (Production environment
unmarked; Tools Included glyphed; Definitions run reading as one
coherent elsewhere-hidden region). Ghost ships as a muted color token,
not opacity. Sidebar-select depth scoping is the best new mechanic
since tabs-as-proposals. Reorganize dialog is the trust centerpiece:
per-card scope with live counts, honest token estimate, designed
absence that looks designed. Expander buttons aria-labeled.

## Personas

Alex: per-card depth gained; shortcuts still undiscoverable; two
hover-only secrets. Jordan: empty state finally teaches; italic rows
unexplained without hover. Sam: real focus rings, color-token ghosting,
aria-labeled expanders; native tooltips exclude touch; badge contrast
two critiques old.

## Amendments log

1. Composition addendum (post-pass, Roger-directed scene): own-flag +
   inherited verified live on tasks/tools/included — 8/8 children
   italic + glyph + ghost; parent upright + glyph. Model corrected from
   own-flag-precedence to ORTHOGONAL COMPOSITION (italic = ancestry,
   glyph = own flag, independent; four states expressible). docs/14
   wording fixed to match the build.
2. Drag P2 closed upward (mechanism existed, one call short; absent ≠
   unbuilt convention minted). Heuristic 3: 3 → 4. Design Health:
   33 → 34.
3. Conventions minted this cycle, now in CLAUDE.md: published-rendering
   fidelity (theme-template receipts for visibility claims); absent ≠
   unbuilt; amendments-are-claims (investigate before editing;
   verification steps posed to pay either way).
4. 2026-08-18, polish-glyphs session: the carried debts closed in one
   pass, measured at the INSTALLED detector pin (4.0.4 / d14711a — a
   newer build than this critique's bd25359, so the before/after ran
   BOTH sides at the same pin on the same reproduced view: k8s,
   Reference card depth 4, 50% zoom). Delta table: undersized-ui-text
   21 → 0 (10px floor — no `text-[10px]` remains in src/);
   low-contrast 15 → 8 (order badges now dark-on-tint, ≥ 4.5:1
   unit-asserted across all 12 hues + orphan; the eight survivors are
   card-title `palette.text` shades on their tints — pinned palette,
   docs/05, out of this session's scope and flagged as its own
   question); tiny-text 4 → 3; total 172 → 142. flat-type-hierarchy
   still counts 1: the ramp is now tokened and role-distinct
   (11/12/13/15/16/18 in `index.css`) but the canvas view legitimately
   spans only 11–16px. Also this session: lock text chips retired for
   the two-tier glyph system (docs/19's lock section carries the law),
   heuristic 4's "tooltip delivery split styled vs native" resolved to
   one styled system.
5. Same day, follow-up ruling: the eight card-title survivors settled
   by a SCOPED DATED AMENDMENT in docs/05 — header ink (title, count
   pill, card glyph) derives from the badge-numeral -800 ramp,
   unit-asserted ≥ 4.5:1 on tint and white; the palette table itself
   stays verbatim. low-contrast on this view: 8 → 0. With that, every
   finding of this critique is disposed.
