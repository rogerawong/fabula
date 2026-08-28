# Product Vision

## One-liner

See your documentation's table of contents the way readers never can —
as a whole — and reshape it by dragging, with a lossless round-trip back
to the file your doc system actually reads.

## The problem

Documentation information architecture (IA) lives in TOC files (`toc.yml`
and kin) that are edited as text: deeply nested YAML where "move this
subtree under that section" means error-prone cut-and-paste, and where
nobody can see the shape of the whole navigation at once. IA work is
inherently spatial and comparative — the tooling is neither.

## Who it's for

- **Docs IA owners / tech writers** restructuring a docs site's navigation
- **Docs engineers** reviewing or proposing IA changes
- **Anyone** who inherits a large TOC and needs to understand it fast

## Jobs to be done

1. **Comprehend** — load a TOC and immediately grasp its structure: section
   sizes, depth, distribution, outliers.
2. **Restructure** — move topics between sections, split sections, reorder,
   rename — directly, spatially, with undo.
3. **Compare** — sketch alternative structures side by side (tabs) before
   committing to one.
4. **Export** — write the result back to the exact same format, losslessly,
   ready to commit to the docs repo.

## Product principles

- **The file is the truth.** We are an editor for *their* file format, not a
  new source of truth. Round-trip fidelity is a hard requirement: load →
  export with no edits must be equivalent to the input; export after edits
  must change only what the user changed.
- **Spatial, direct manipulation.** Cards on a canvas, dragging, immediate
  feedback. No forms, no modals for core operations.
- **Format-pluggable.** The core knows nothing about any YAML dialect.
  Support for a new doc system's TOC format is a one-file contribution.
- **Zero infrastructure.** Pure client-side SPA. No accounts, no server, no
  data leaves the browser. Deployable as static files (GitHub Pages).
- **Undo makes bravery cheap.** Every structural operation is undoable;
  animation shows what changed and what un-changed.

## Goals (v1)

- The complete launch feature set of 02-requirements.md
- DocFX `toc.yml` support, read + write, conformance-tested
- A contributor experience where a new format adapter is genuinely easy
- Deployed publicly as a static site; open source under AGPLv3

## Non-goals (v1)

- **Cross-format conversion.** Documents export through the adapter that
  parsed them. Conversion may fall out of the architecture as a lossy
  side effect but gets no UI and no promises.
- **Editing page content.** We edit structure (titles, hierarchy, order),
  never the documents the TOC points to.
- **Multi-file TOC graphs.** Nested TOC references render as marked leaf
  nodes; open each file in its own tab. No cross-file resolution in v1.
  *(Since crossed, deliberately: collection adapters — docs/11 — read
  many files by design, and Sphinx walks a nav graph across hundreds.
  The limit survives only where it was always a property of the
  interface: a FORMAT adapter parses one blob. See docs/04.)*
- **Real-time collaboration, accounts, cloud sync.** LocalStorage
  persistence only.
- **Mobile — all of it, not just editing.** A designed absence, not a
  deferral (ruled 2026-08-18; PRODUCT.md carries the full statement):
  the canvas is a map, and a map read through a keyhole is not a
  smaller version of the experience, it is a different and defeated
  one. An earlier version of this entry allowed "read-only degradation
  on small screens" — that framing retired with the ruling. Hover is
  first-class; accessibility is not relaxed (keyboard-driven drag
  stays on the backlog, and no finding may be hover-only).

## Success criteria

- A tech writer can load a 500-topic toc.yml, restructure three sections,
  and export a correct file in under ten minutes without reading docs.
- `git diff` of an exported file after a single move shows only that move.
- A motivated contributor ships a working adapter for a new format
  (e.g. MkDocs `nav:`, Docusaurus sidebars, Hugo menus) in one file + one
  fixture + one registry line, guided only by CONTRIBUTING.md.
