Fixture files vendored from https://github.com/godotengine/godot-docs at
commit 5a1dda5d4219511cd27a43cf64cf31df65bdef95, licensed CC BY 3.0
(https://creativecommons.org/licenses/by/3.0/) and attributed to
"Juan Linietsky, Ariel Manzur and the Godot community". Copied verbatim —
byte-for-byte fidelity is the point, since the Sphinx adapter's round-trip
law is defined on per-block indent and untouched surrounding prose.

Nothing under `classes/` is vendored: those files are MIT rather than
CC BY 3.0, and the design (docs/12) treats the whole subtree as one
atomic locked card that is never ingested.

What each file covers (survey and rationale in docs/12):

- `index.rst` — the root document. Six `:hidden:` + `:caption:` blocks,
  3-space content indent. The only captioned blocks in the corpus.
- `conf.py` — docs-root detection anchor; declares `master_doc = "index"`
  and `source_suffix = ".rst"` (both read by regex, never executed).
- `tutorials/index.rst` — the awkward one: `:orphan:`, TWO toctree blocks
  under separate H2s, 4-space indent, and a maintainer comment asking that
  entries stay alphabetized. Unreachable from the root graph (linked only
  via raw HTML), so a faithful walk misses it — as Sphinx's own does.
- `tutorials/2d/index.rst` — nested section chain, 3-space indent, and
  prose BEFORE the document title, which breaks naive title derivation.
- `tutorials/io/index.rst` — 4-space indent, single block. Pairs with
  `tutorials/2d/index.rst` to prove indent is a per-block property, not a
  per-directory one.
- `getting_started/introduction/index.rst` — a second nesting chain.
- `about/introduction.rst`, `tutorials/2d/{canvas_layers,2d_meshes,
  2d_transforms}.rst`, `tutorials/io/background_loading.rst` — leaf
  documents, present as title sources (a toctree entry's label is the
  target document's first section title).

Files prefixed `synthetic-` are ours, not vendored. The corpus contains
zero explicit-title entries, zero external URLs, zero `:glob:` blocks and
zero `self` entries, so those shapes have no real-world coverage here and
are supplied by hand:

- `synthetic-explicit-titles.rst` — `Title <path>` (how renames serialize),
  external-URL entries, `self`.
- `synthetic-glob.rst` — `:glob:` blocks, which round-trip verbatim as
  locked nodes.
