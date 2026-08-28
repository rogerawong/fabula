# Contributing to Fabula

Thanks for your interest! The most valuable contribution you can make is
**support for your documentation system's TOC format** — and the
codebase is built so that this is genuinely easy: one adapter file, one
fixture, one registry line, and a conformance suite that tells you when
you're done.

## Getting started

```sh
pnpm install
pnpm dev          # app on http://localhost:5173
pnpm test         # unit + conformance + property tests
pnpm check        # TypeScript
pnpm lint
pnpm e2e          # Playwright smoke flows (installs nothing extra; run
                  #   `pnpm exec playwright install chromium` once first)
pnpm fixpoint     # parse → serialize → parse each adapter's sample
```

Node ≥ 22 and pnpm ≥ 10 are required.

## Two kinds of adapter

Fabula supports two shapes of documentation system, each with its own
one-file adapter convention:

- **Format adapters** (`src/formats/adapters/`) — the nav lives in ONE
  config file (DocFX `toc.yml`, MkDocs `mkdocs.yml`). Round-trip =
  parse a blob, serialize a blob.
- **Collection adapters** (`src/collections/adapters/`) — the nav is
  derived from METADATA SPREAD ACROSS FILES (Just the Docs frontmatter,
  Docusaurus directory structure + `_category_.json`). Round-trip =
  parse a file snapshot, emit a minimal per-file change plan.

Pick the one matching your system and follow its section below.

## Writing a format adapter

An adapter teaches Fabula to read one TOC format into the neutral
model and write it back — the round-trip. Reference implementations:
[`src/formats/adapters/docfx.ts`](src/formats/adapters/docfx.ts)
(standalone TOC file) and
[`src/formats/adapters/mkdocs.ts`](src/formats/adapters/mkdocs.ts) (nav
embedded in a larger config — a good template if your format lives
inside another file).

### 1. Implement `TocFormatAdapter`

Create `src/formats/adapters/<your-format>.ts` implementing the
interface in [`src/formats/types.ts`](src/formats/types.ts):

| Member                          | Contract                                                                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                            | Stable unique string; stored on every document for round-trip routing.                                                                                                           |
| `label`                         | Shown in the UI, e.g. `"DocFX (toc.yml)"`.                                                                                                                                       |
| `fileExtensions`                | Without dots, e.g. `["yml", "yaml"]`.                                                                                                                                            |
| `detect(parsed, raw, fileName)` | Confidence 0–1. `parsed` is the registry's single `yaml.load` result — **don't re-parse**. Return 0 for anything that isn't clearly yours; the registry picks the highest score. |
| `parse(raw, fileName)`          | Text → `TocDocument`. Throw an `Error` with a user-friendly message on invalid input.                                                                                            |
| `serialize(doc, sectionOrder)`  | Model → text, honoring the given section-id order.                                                                                                                               |
| `serializeSection(section)`     | One section, for the per-card code view.                                                                                                                                         |
| `createCards`                   | **Required.** Can `serialize` write a top-level card that was not in the source? Answer from your own serializer, not by analogy.                                                |
| `reorderCards`                  | **Required.** Can it record a change to the ORDER of top-level cards — does it rebuild the top level from `sectionOrder`?                                                        |
| `sample?`                       | Optional bundled sample for the Load menu.                                                                                                                                       |

**Why those two are required and not optional.** They condition the AI
dialog's "Allow new sections" toggle and two prompt lines, so a missing
answer reads as _capable_: the toggle re-arms, the lines vanish, and the
run promises what the plan must refuse. Three corpus-scale calls were
refused at Review for exactly that before the fields existed. A
whole-file serializer answers `true` to both, which is why leaving them
optional would feel harmless — the next adapter is the one that cannot.

### 2. Honor the round-trip contract

`serialize(parse(text))` must be **lossless** (re-parsing yields an
equivalent model) and **stable** (a second serialize is byte-identical).
The mechanisms:

- **`extras` bags** — every property the neutral model doesn't represent
  goes into `extras` verbatim and comes back out on serialize. The core
  carries them but never reads them, and a document only ever serializes
  through the adapter that parsed it — so your extras schema is private.
  Anything created inside the app has `extras === undefined`; serialize
  must cope.
- **`titleDerived`** — if your format allows unnamed nodes, derive a
  display title (see `deriveTitleFromPath` in `src/model/naming.ts`) and
  set `titleDerived: true`. Serialize must NOT write a name for flagged
  nodes; an in-app rename clears the flag.
- **Orphan mapping** — a top-level leaf entry becomes a section with
  `isOrphan: true` wrapping the entry as its single topic (rendered as a
  compact card); serialize unwraps it back to a leaf.
- **Root/document shape** — remember anything about the surrounding
  document (root style, sibling config keys) in `TocDocument.extras` and
  reproduce it.

### 3. Register + add fixtures

1. Add your adapter to `FORMAT_ADAPTERS` in
   [`src/formats/registry.ts`](src/formats/registry.ts).
2. Commit at least one **real-world fixture** under
   `src/formats/__tests__/fixtures/` and list it in the `FIXTURES` map in
   [`conformance.test.ts`](src/formats/__tests__/conformance.test.ts).
   The shared suite then runs detection, parse, lossless round-trip,
   serialize fixpoint, and per-section serialization against it —
   an adapter without fixtures fails the suite by construction.
3. Add a `<your-format>.test.ts` with quirk tests for anything your
   format does that the existing ones don't.

### 4. Definition of done

`pnpm test` green (conformance + your quirk tests) and `pnpm fixpoint`
stable. No UI tests are required — that's the point of the
architecture.

## Writing a collection adapter

A collection adapter serves systems whose navigation is assembled from
many files. Reference implementations:
[`src/collections/adapters/jtd.ts`](src/collections/adapters/jtd.ts)
(linkage by frontmatter keys — Just the Docs) and
[`src/collections/adapters/docusaurus.ts`](src/collections/adapters/docusaurus.ts)
(hierarchy from the directory tree — Docusaurus autogenerated
sidebars).

### 1. Implement `CollectionAdapter`

Create `src/collections/adapters/<your-system>.ts` implementing the
interface in [`src/collections/types.ts`](src/collections/types.ts):

| Member                                  | Contract                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `id` / `label`                          | As for format adapters.                                                                            |
| `ingests(path)`                         | Which file names to read during folder/repo import.                                                |
| `detect(files)`                         | Confidence 0–1 that a snapshot belongs to your system.                                             |
| `parse(files, rootName)`                | Snapshot → `{ doc, warnings }`. Non-fatal oddities become warnings, never throws.                  |
| `planChanges(files, doc, sectionOrder)` | Original snapshot + edited model → `{ changes, warnings }` — minimal per-file edits/creates/moves. |
| `reparentMovesFiles`                    | **Required.** Does a parent change move bytes on disk?                                             |
| `nodesNeedTargets`                      | **Required.** Must every navigation node name a page?                                              |
| `createCards`                           | **Required.** Can `planChanges` create a top-level card that was not in the source?                |
| `reorderCards`                          | **Required.** Can it record a change to the order of top-level cards?                              |

**All four are required, and the cost of forgetting is the same shape
every time.** Each answers a question a layer ABOVE the planner asks
before a run starts, and each fails silently in the dangerous direction
when it is missing: an unclassified adapter reads as _capable_, so a
consent is never asked or a prompt line never renders, and the run
promises what your `planChanges` must refuse. Required means `pnpm check`
names you; optional would mean a user pays for the discovery.

Answer them from your own planner rather than from a neighbouring
adapter. Hugo creates a card happily — it writes an `_index.md` — and
records no top-level order at all, so it answers `true, false`; the
format can express that order and the planner simply does not write it,
which is the distinction between what a system can record and what your
adapter does.

`planChanges` is a **pure function of the original files and the edited
model** — there is no edit journal, which is what makes undo/redo
integration free.

### 2. Honor the round-trip law

- No model edits → `planChanges` returns `[]`.
- An edit touches ONLY affected files; within a file, only the lines
  your adapter manages — every other byte identical (use
  `src/collections/frontmatter.ts` for frontmatter surgery).
- Idempotent: re-planning over the patched snapshot returns `[]`.

**The snapshot owns the NAV, not the file** (docs/15). If your system
keeps its nav in page front matter, slice the kept set with
`toNavHeads(files)` in `parse` and emit `navHeadOf(content)` with
`region: "navHead"` from `planChanges`; the save path splices that head
into whatever is on disk at save time, so page bodies are preserved by
construction rather than by a check, and a whole site fits in the byte
cap. Config files that ARE the nav (`_category_.json`, `_config.yml`)
stay whole — no region mark. The snapshot is what the app loaded or last
wrote, never a mirror of the folder: nothing re-reads to keep it current,
because that would silently absorb someone else's concurrent edit into
your baseline.

- Never delete files: model removals map to your system's "hidden"
  mechanism (`nav_exclude`, `unlisted`); ambiguity you cannot resolve
  becomes a `blocking: true` warning, which disables saving.

`src/collections/verify.ts` gives you verification-by-simulation
(`simulatePlan`): apply your plan in memory, re-parse, compare against
the edited model. Every plan the UI shows is checked this way at
runtime — and your tests should assert it too.

**If a corpus survey decides the design, commit the script.** Numbers that
justify a decision have to be re-runnable by whoever inherits it — put the
survey in `scripts/` (see `scripts/survey-hugo.ts`) and cite it from the note.
Two reasons, both learned the expensive way. Figures from a throwaway script
cannot be checked without redoing the work, and ten of docs/14's were wrong.
And derived statistics are **model-dependent** — "how many sibling sets have
duplicate weights" gets a different answer depending on whether index pages and
bundle resources count, so three independent measurements disagreed. State the
model with the number, and let the script be the statement.

**When you write a design note first**, add one pass before you start
building: for each option you decided, ask what the decision does not
specify that the code still has to do. A wrong claim gets caught — by a
test, a reviewer, a citation that does not check out. Silence does not:
there is nothing to disagree with, so a hole reads exactly like a
settled question. The Sphinx note (docs/12) had evidence for everything
it asserted and gaps in three places it simply said nothing: it fixed
what the snapshot _keeps_ but never what the driver must _read_ to build
it (40× larger); it decided a subtree collapses but not by what _rule_;
and it declared a read-only phase without noticing that the interface
member it would have to omit was required. All three surfaced during
implementation, when they are most expensive to answer.

### 3. Register + add fixtures + property test

1. Add your adapter to `COLLECTION_ADAPTERS` in
   [`src/collections/registry.ts`](src/collections/registry.ts) (the
   facade for code view/export is generated for you).
2. Vendor real-world files under
   `src/collections/__tests__/fixtures/<your-system>/` (mind licensing —
   add an attribution README) and write a `<your-system>.test.ts`
   asserting parse conformance plus the laws above.
3. Copy the fast-check property test from an existing adapter test:
   random editing sessions must yield blocking warnings OR
   simulation-verified idempotent plans. This one test caught five real
   planner bugs in the JTD adapter before it ever shipped.

## Non-goals to keep in mind

- **No cross-format conversion.** Documents export through the adapter
  that parsed them. Don't build a universal schema.
- **No runtime plugins.** Adapters are compiled in via PRs.
- **No multi-file resolution.** A link targeting another TOC file
  renders as a badged leaf.

## Everything else

Bug fixes and features are welcome too. The architecture is documented
in [`docs/`](docs/) — read `docs/03-architecture.md` (layers, commands,
undo — and the bug classes the design refuses to reintroduce) before
larger changes. All mutations must go through commands; undo
must never be hand-written.

License: contributions are accepted under [AGPL-3.0](LICENSE).
