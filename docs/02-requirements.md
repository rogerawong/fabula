# Requirements

Feature inventory for v1 — the launch scope. Anything not listed here is
scope creep until
promoted deliberately. "MUST" = launch blocker; "SHOULD" = launch target;
"MAY" = post-launch candidate.

## 1. Loading documents

- MUST load a TOC from: local file picker (`.yml`/`.yaml`), pasted YAML text,
  bundled sample (per adapter), and URL.
- MUST rewrite GitHub file URLs (`github.com/.../blob/...`) to
  `raw.githubusercontent.com` and fetch directly (CORS works there).
- MUST fall back gracefully when a URL fetch fails (CORS/network): guide the
  user to open-in-browser + paste.
- MUST auto-detect the format via adapter confidence scores; unrecognized
  input produces a friendly error naming supported formats.
- SHOULD let the user override detection when ambiguous.

## 2. Canvas & viewing

- MUST render each top-level section as a card on an infinite canvas:
  pan (drag empty space / trackpad), zoom (wheel/pinch, buttons with 10%
  snapping, presets 50/75/100%, fit-to-view), and a clickable minimap.
- MUST render orphan cards (top-level leaf entries) as a compact variant.
- MUST show connector lines with sequence badges between cards in order.
- MUST provide depth controls: collapse all / collapse one level / expand
  one level / expand all — applying globally, or to the selected card only.
- MUST show per-card stats: topic count, counts per level, max depth.
- MUST offer a per-card YAML code view (read-only editor), serialized
  on demand through the document's format adapter.
- SHOULD provide auto-arrange (bin-pack into columns) as an explicit,
  reversible action — toggling it off with no reorders restores the prior
  manual layout.

## 3. Restructuring (the core)

- MUST support dragging a topic (or subtree) to: another position in its
  card, another card, or empty canvas (creating a new section; dragging a
  parent "unwraps" it — children become the new section's top level).
- MUST support multi-select (shift-click, box-select within a card) and
  dragging the selection as a group.
- MUST support card reordering by dragging on the canvas and in the sidebar
  list, with live preview of the resulting layout.
- MUST prevent dropping a topic into its own subtree.
- MUST support inline rename (double-click) of section titles and topic
  titles, IME-safe.
- MUST support a "lock topics" mode that disables topic-level interactions
  (drag/select) while keeping card-level ones.
- MAY support: delete topic/section, merge sections, promote/demote levels
  via keyboard.

## 4. Undo

- MUST make every structural mutation undoable via Ctrl/Cmd+Z and via an
  Undo action on the operation's toast.
- MUST animate undo so the reversal is legible (topics fly back, removed
  cards leave a fading ghost).
- SHOULD support redo (Ctrl/Cmd+Shift+Z); the command architecture
  (see 03) makes it nearly free.
- Undo stacks are per-tab and not persisted.

## 5. Tabs & persistence

- MUST support multiple tabs, each holding an independent deep copy of a
  document (its own format, undo stack, arrangement, depth state).
- MUST support: create, rename, duplicate (deep-clones the document),
  close with undo-toast, reopen recently closed (Ctrl/Cmd+Shift+T).
- MUST persist tabs + documents + arrangements to localStorage (debounced,
  flushed on unload), under a versioned schema; on version mismatch,
  discard cleanly rather than migrate or crash.
- MUST NOT persist transient state: selection, drag state, viewport
  transform, undo stacks.

## 6. Export

- MUST export the active tab through the adapter that parsed it, honoring
  current section order, as a file download.
- MUST be lossless per the adapter contract (04-format-adapters.md).

## 7. Formats

- MUST ship the DocFX adapter (reference implementation) with conformance
  fixtures.
- MUST mark topics whose link targets another TOC file with a badge; they
  behave as leaves.
- SHOULD ship a second adapter (MkDocs `nav:` is the best candidate: simple,
  popular) before announcing — it proves the plugin story and keeps the
  interface honest.

## 8. Keyboard map (v1)

| Key | Action |
|---|---|
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z | Redo (if shipped) |
| Escape | Clear selection / cancel drag / exit inline edit |
| L | Toggle topics lock |
| Ctrl/Cmd+Shift+T | Reopen closed tab |
| Enter / Escape in inline edit | Commit / cancel |

## Non-functional requirements

- **Performance:** smooth pan/zoom (target 60fps) with 50 cards / 1,000
  topics; initial load under 2s on a mid-range laptop. Virtualize or
  simplify card contents at low zoom if needed.
- **Fidelity:** exporting an unmodified document produces an equivalent
  document (adapter-level equivalence, enforced by tests); a single edit
  produces a minimal diff.
- **Privacy:** no network calls except user-initiated URL loads. No
  analytics in the open-source build.
- **Browser support:** current Chrome, Firefox, Safari, Edge. No IE, no
  legacy targets.
- **Accessibility (v1 floor):** all toolbar/menu actions keyboard-reachable
  and labeled; visible focus; prefers-reduced-motion disables decorative
  animation. (Full keyboard drag-and-drop is a stated post-v1 goal, not a
  launch blocker.)
- **Codebase:** TypeScript strict; no component over ~300 lines; state
  logic testable without the DOM.
