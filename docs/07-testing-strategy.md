# Testing Strategy

In prototyping, bugs clustered exactly where tests were absent (undo
edge cases, animation timing, index-shifting). This strategy inverts
that: the layers that bled — model mutations, undo, adapters — are
DOM-free by design (03) and tested from milestone one.

## Layer 1: model & selectors (vitest, pure)

- Tree helpers: move/insert/remove/rename, path finding, descendant checks,
  id stability across operations.
- Selectors: counts, depths, derived stats match brute-force recomputation.

## Layer 2: format adapter conformance (vitest, pure)

The shared suite: every registered adapter × every fixture →
detection, non-empty parse, lossless round-trip (normalized deep-equal),
serialize fixpoint, per-section serialization. Plus per-adapter quirk tests
(derived titles, extras, root shapes, export order).

Fixtures are real-world files, committed under
`formats/__tests__/fixtures/`. An adapter without fixtures fails the suite
by construction.

## Layer 3: commands & undo (vitest, pure — the crown jewels)

Deterministic cases for every command, plus **property-based tests**
(fast-check) over random command sequences:

- **Undo totality:** for any sequence of valid commands, undoing all of
  them restores a document + arrangement deep-equal to the initial state.
- **Redo faithfulness:** undo^n → redo^n reproduces the post-sequence
  state.
- **Transactionality:** a compound command (multi-topic drag) is exactly
  one undo step.
- **Reference integrity:** after any sequence, every id referenced by
  columns/selection/depth-overrides exists in the document.
- **Round-trip under editing:** parse fixture → random commands → undo all
  → serialize ≡ serialize of pristine parse (ties Layers 2 and 3 together).

These invariants are cheap to state with patch-based undo and would have
caught the hardest prototyping bugs (orphan index-shifting, unwrap
reconstruction, duplicate-tab races).

## Layer 4: store & persistence (vitest, jsdom where needed)

- Serialize/deserialize round-trip of the persisted payload.
- Version mismatch → clean discard, no crash.
- Debounce/flush behavior with fake timers.
- Topic-id counter re-seeding after hydration (a real regression source).

## Layer 5: end-to-end smoke (Playwright, headless Chromium)

Few, fat, stable flows — not a per-feature matrix:

1. Load sample → cards render, counts match fixture.
2. Drag a topic to another card → appears there; Ctrl+Z → returns.
3. Drag a parent topic to canvas → new section card; undo → ghost +
   restore.
4. Rename section inline → sidebar and export reflect it.
5. Export → downloaded text parses and deep-equals the store document via
   the adapter.
6. Reload page → tabs and arrangement persist.
7. Console error assertion on every flow (zero tolerated).

Animation checks in e2e assert *end states*, not frames; the first-paint
discipline (05) is enforced by code review + a dev-mode assertion helper,
not screenshots.

## CI gates (GitHub Actions)

PR: typecheck → lint → unit/property/conformance → build → Playwright
smoke. Main: same + deploy to Pages. Property tests run with a fixed seed
in CI (reproducibility) and free seed locally.

## Definition of "tested" for a new format adapter PR

fixtures committed + conformance green + quirk tests for anything the
format does that DocFX doesn't. No UI tests required — that's the point of
the architecture.

## Visual claims need visual verification

Layers 1–4 assert **state**. State can be exactly right while the user
sees nothing change, and that gap has produced every UI defect this
project has shipped so far. So: **a change that alters what the user sees
is not verified until a browser has rendered it and the rendered property
has been read back.**

Three receipts, all from the Hugo work, all found by looking at output
and none by the suite:

| defect | state was | what the screen did | found by |
| --- | --- | --- | --- |
| `no_list` marked as hidden | derivation ran exactly as written | 77 of 1,038 rows claimed hidden while the site listed them | reading Docsy's `sidebar-tree.html` |
| own-flag suppressed inheritance | both facts computed correctly | 8 rows showed the glyph and dropped the inherited fact | looking at the canvas |
| `not-allowed` cursor | predicate correct, property set, `<body>` computed right | every row's `cursor-grab` outranked it — pointer never changed | reading `getComputedStyle` under a real drag |

The third is the sharpest: the unit tests asserted the predicate and were
green, because the predicate was never the bug. **A test of the state
cannot fail for a defect that lives in the paint.**

What this looks like in practice — the drag/cursor case is the template:

1. seed a session in `localStorage` for the document shape you need
   (`PERSIST_VERSION` must match, or it is discarded — which is itself a
   thing worth checking);
2. drive the real gesture with Playwright rather than dispatching
   synthetic events, because gestures have thresholds and hit-test rules
   (`TopicRow` deliberately ignores a press on the row's own padding);
3. read the rendered property from **the element the user's pointer is
   actually over**, not from the element you set it on;
4. assert the negative and the cleanup too: eligible regions unchanged,
   and nothing stuck after release.

This does not mean every visual change earns a Playwright spec. It means
the claim "this works" is not yours to make until you have seen it
render. Add a spec when the behaviour is durable enough to regress; drive
it by hand when it is a one-off. Either way, look first.
