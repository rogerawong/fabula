# Architecture

The core failure mode this design guards against is **centralized state
without centralized logic**: one giant page component owning every piece
of state and every mutation, wired to the tree by prop-drilling, with
undo bolted on as a hand-maintained union of reversal recipes.
Prototyping proved how fast that decays; this design prevents it with
three moves: a real store, command-based mutations with
derived undo, and interaction state machines.

## Layer map

```
┌────────────────────────────────────────────────────────┐
│ view/          React components (dumb, subscribe to    │
│                store slices, dispatch commands)        │
├────────────────────────────────────────────────────────┤
│ interaction/   Pointer/keyboard state machines →       │
│                emit commands; own NO document state    │
├────────────────────────────────────────────────────────┤
│ store/         Zustand store: tabs, documents,         │
│                arrangement, selection, viewport.       │
│                Mutations ONLY via commands.            │
├────────────────────────────────────────────────────────┤
│ commands/      Every mutation as a command producing   │
│                forward + inverse patches → undo/redo   │
│                for free                                │
├────────────────────────────────────────────────────────┤
│ model/         Neutral TOC tree + pure helpers         │
│ layout/        Column model → card positions (pure)    │
│ formats/       Adapter interface, registry, DocFX      │
└────────────────────────────────────────────────────────┘
```

Dependencies point downward only. `model/`, `layout/`, `formats/`,
`commands/` are DOM-free and fully unit-testable.

## The model (proven in prototyping)

```ts
Document   { id, name, formatId, extras?, sections: Section[] }
Section    { id, title, titleDerived?, path?, extras?, isOrphan?, topics: Topic[] }
Topic      { id, title, titleDerived?, path?, extras?, children: Topic[] }
```

Foundational choices, each paid for in prototyping:
- **Sections get stable ids too** (index-addressed sections force
  index-shifting gymnastics through undo and layout whenever sections
  are added or removed — the deepest recurring bug source). All references
  (columns, selection, undo, layout) use ids, never indices.
- **No stored `level`** — depth is derivable; a stored level has to be
  renumbered across whole subtrees on every move. Compute it during render traversal.
- **No stored counts** — `totalCount`/`levelCounts`/`maxDepth` become
  memoized selectors, not fields to keep in sync.
- **No stored YAML** — serialization is always on demand via the adapter.
- `extras` bags and `titleDerived` carry over unchanged (see
  04-format-adapters.md).

## Store (Zustand + Immer)

One store, sliced:

- `tabs`: ordered tab list, active tab id; each tab: document, columns,
  depth state, undo/redo stacks.
- `arrangement` (per tab): `columns: SectionId[][]` — the explicit column
  model, which proved much better than freeze-and-patch layout.
- `view` (per tab): global depth, per-card depth overrides, topics-lock.
- `selection` (transient): selected card, selected topic ids.
- `viewport` (transient): pan/zoom transform per tab.

Components subscribe to narrow selectors — no prop-drilling. Transient
high-frequency state during drags (pointer position, hover target) stays in
the interaction layer / refs, NOT in the store, so dragging doesn't rerender
the world.

## Commands: mutations with free undo

Every document/arrangement mutation goes through a single gate:

```ts
dispatch(command: Command)
// Command = { type, params } → executed with Immer's produceWithPatches
// → { patches, inversePatches } pushed onto the tab's undo stack
```

- **Undo = apply inversePatches; redo = re-apply patches.** No per-operation
  reversal recipes, no `UndoEntry` union to maintain, no "reconstruct the
  unwrapped parent" special cases. New features get correct undo/redo by
  construction.
- Commands carry user-facing labels ("Move 3 topics") for toasts and a
  future history UI.
- Compound gestures (multi-topic drag = N removes + N inserts + maybe a
  section create) execute as **one transaction** → one undo step.
- A command's execution can also return **animation hints** (moved topic
  ids, removed section rects) consumed by the animation layer — see
  05-interaction-and-ui.md.

Invariant (property-tested, see 07): for any command sequence,
undo-all restores a deep-equal document + arrangement.

## Layout

Pure function over the explicit column model:

```
(columns, sectionSizes, gaps) → Map<SectionId, {x, y, w, h}>
```

- Column membership and order are explicit state (`SectionId[][]`), mutated
  by commands like everything else — so card reorder is undoable naturally.
- Bin-packing (`distributeIntoColumns`) runs only on document load and
  explicit Auto-arrange.
- Card height derives from content measurement reported upward once per
  size change; layout never reads the DOM directly.

## Interaction layer

Each gesture is an explicit state machine (plain TS, no library needed):

- `cardDrag`: idle → pressed (threshold) → dragging (ghost + live preview)
  → drop command / cancel.
- `topicDrag`: same shape, plus hit-testing over topic trees and canvas
  (drop into tree at path / drop on canvas → create section).
- `boxSelect`, `pan`, `inlineEdit` similarly.

Rules learned in prototyping:
- One pointer-event system for everything (no dnd-kit for the sidebar +
  custom for canvas split — the sidebar reorders cards via the same
  commands, different affordance).
- Machines emit commands only on completion; escape/cancel always possible;
  all coordinate math goes through one `screenToCanvas` transform module.
- Inline editing suppresses drag initiation; IME composition tracked
  explicitly.

## Persistence

- Versioned localStorage payload (schema version constant; mismatch =
  discard, never migrate silently, offer the user a heads-up toast).
- Debounced writes + `beforeunload` flush.
- Persisted: tabs, documents, columns, depth state. Not persisted:
  selection, viewport, undo stacks, drag state.
- Post-v1: File System Access API for "save back to the file I opened".

## App shell

- Vite + React 19, single route. Static build output; no server component
  at all — GitHub Pages serves it.
- Directory sketch:

```
src/
  model/        types, tree helpers, selectors
  formats/      types, registry, docfx/, __tests__ (conformance + fixtures)
  commands/     command defs, dispatcher, undo manager
  store/        zustand slices, persistence
  layout/       column model, positioning, measurement types
  interaction/  gesture state machines, coordinate transforms
  view/         components (canvas, cards, sidebar, header, dialogs, ui/)
  app/          shell, providers, keyboard map
```
