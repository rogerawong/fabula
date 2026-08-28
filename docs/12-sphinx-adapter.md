# 12 — Sphinx toctree adapter (design)

Status: **phase 1 built; phase 2 (moves-only write-back) built on
`docs19-writeback` — see `docs/19`**. Read-only was ENCODED as the
absence of `planChanges`, so defining it is the whole flip; every
read-only sentence below is phase-1 history unless it says otherwise. This note records what the
Sphinx nav actually is, what a survey of a real corpus says, where the
existing `CollectionAdapter` contract fits and where it does not, and
the five decisions that came out of review — see Decisions at the end
for the summary and Sequencing for what lands when.

Reference corpus: **godot-docs** (`github.com/godotengine/godot-docs`,
commit `5a1dda5d`), read-only. A fixture slice is vendored at
`src/collections/__tests__/fixtures/sphinx/`.

## How a Sphinx sidebar is actually assembled

There is no nav file. The sidebar is the **global toctree**, which
Sphinx builds by starting at the root document (`master_doc` /
`root_doc` in `conf.py`, defaulting to `index`) and walking
`.. toctree::` directives recursively:

```rst
.. toctree::
   :hidden:
   :maxdepth: 1
   :caption: About
   :name: sec-general

   about/introduction
   about/list_of_features
```

- Entries are **extensionless docnames**, resolved relative to the
  containing document's directory (or from the source root when they
  begin with `/`).
- An entry whose target holds its own toctree blocks **grafts that
  subtree in**. Nesting is recursive and unbounded.
- The label shown for an entry is the **target document's title** —
  its first section title. This is our `titleDerived` mechanism in the
  wild, and it is the reason parse cannot work from nav files alone.
- `:hidden:` registers the entries in the global toctree without
  rendering the list inline on the page — how a root index builds a
  sidebar without printing it in the body.
- `:caption:` becomes the sidebar group heading. `:name:` is a
  cross-reference target. `:maxdepth:` limits render depth only; it
  does **not** limit the tree.
- An entry may override the derived label with `Title <docname>`.
- One document may host **many** toctree blocks, separated by prose,
  section headings and comments.

## Survey of the corpus

Walked from `index` with a throwaway script (blocks parsed
structurally, not by regex over whole files).

| | |
|---|---|
| source files on disk (`.rst`) | 1601 → **1596** [corrected 2026-08-17] |
| docs reachable from the root toctree graph | 1594 |
| toctree blocks (reachable / on disk) | 101 / 103 |
| files hosting a toctree | 62 (63 on disk) |
| total toctree entries | 1678 |
| max nesting depth | 4 |
| docs referenced by **more than one** toctree | **85** |
| docs in no toctree | 7 → **2** (incl. 1 `:orphan:`) [corrected 2026-08-17] |
| entries pointing at a missing file | 0 |

Option usage, across all 103 blocks on disk:

| option | blocks |
|---|---|
| `:maxdepth:` | 103 (**always `1`** — no other value anywhere) |
| `:name:` | 103 |
| `:hidden:` | 6 |
| `:caption:` | 6 |

Entry shapes — and this is the survey's most useful result, because it
contradicts the starting assumptions:

| shape | count |
|---|---|
| plain docname | 1678 |
| explicit title (`Title <path>`) | **0** |
| external URL | **0** |
| `:glob:` / wildcard | **0** |
| `self` | **0** |

Per-block content indent: **3 spaces in 94 blocks, 4 spaces in 9**
(`classes/index.rst` ×6, `tutorials/index.rst` ×2, `tutorials/io/index.rst`
×1). Both widths occur under `tutorials/`, so indent is a per-block
property, not a per-directory one. Never normalize it.

Multi-block files (12 of them) include the root `index.rst` (6 blocks,
the only captioned ones) and `classes/index.rst` (6 blocks, 1163
entries between them).

Snapshot cost, by subtree:

| what | files | bytes |
|---|---|---|
| toctree-hosting files only | 62 | 102 KB |
| all reachable docs | 1594 | 31.7 MB |
| reachable, excluding `classes/` | 515 | 5.4 MB |

### What the survey changes

1. **`:hidden:` + `:caption:` are a root-index idiom, not a general
   one.** 97 of 103 blocks carry only `:maxdepth:` and `:name:`. A
   parser that expects captions everywhere will find none.
2. **The rename syntax has zero real-world coverage here.** Renames
   were to serialize as `Title <path>`; the corpus never uses it. The
   syntax is still correct (it is standard Sphinx), but round-trip
   confidence has to come from synthetic fixtures, kept separate from
   the vendored corpus so the corpus stays a faithful copy.
3. **`:glob:` handling is speculative for now.** Same treatment:
   design for it, test it synthetically, do not claim corpus coverage.
4. **"Every doc appears in exactly one toctree" is false.** 85
   `classes/*` docs are referenced twice (e.g. `class_editordock` from
   both the *nodes* and the *editors* block of `classes/index.rst`).
   It cannot be a validation invariant. It is also **not** the modelling
   problem it first looks like — see Duplicate references.
5. **A graph walk misses `:orphan:` hubs.** `tutorials/index.rst` is
   `:orphan:`, hosts 2 toctree blocks, and is reachable only through
   raw HTML in the root index. Sphinx's own global toctree misses it
   too, so we are faithful by missing it — but the 2 blocks and their
   16 entries are invisible to the app while their targets appear
   elsewhere. Worth a load-time note, not a fix.

## A third structural shape

The codebase has two adapter contracts:

- **Format adapter** (docs/04) — the nav lives in ONE file; parse a
  blob, serialize a blob.
- **Collection adapter** (docs/11) — the nav is INFERRED from metadata
  spread across files (frontmatter keys, directory layout); parse a
  snapshot, emit a per-file change plan.

Sphinx is neither. The nav is **explicit** — hand-written directives
that say exactly what goes where, like a format adapter — but it is
**distributed** across dozens of files, like a collection. Call it a
**distributed explicit TOC**.

The consequence is a good one: because the nav is explicit, planning
is far simpler than JTD's or Docusaurus's. There is no resolver to
simulate, no ambiguity to disambiguate, no linkage keys to keep
consistent. A move is a line moving between two blocks. Most of the
difficulty lives in **ingest** instead.

`CollectionAdapter` is still the right contract: `planChanges` as a
pure function of (original files, edited model, canvas order) fits
exactly, and the change plan / review / `.patch` / write-back pipeline
is reusable as-is.

## Two places the current contract does not fit

Both were found by reading the code, and both override the starting
direction.

### 1. Ingest is a folder scan; it cannot walk a graph

The direction was "parse walks the graph from `index.rst`, never
scanning the whole tree". The contract cannot express that:

- `ingests(path): boolean` is a **pure per-path predicate**. It sees a
  path, not file contents, and not the graph.
- `snapshotFromCandidates` ([loadCollection.ts:57](../src/view/loadCollection.ts#L57))
  walks the entire folder, keeps everything `ingestible`, **enforces
  `MAX_FILES = 500` and `MAX_TOTAL_BYTES = 3 MB`**, reads it all, and
  only then calls `detect` and `parse`.
- `parse(files, rootName)` receives an already-materialized snapshot
  and has no I/O.

So an adapter that `ingests` `*.rst` would pull all 1596 godot-docs
files, 32 MB, and the import would be **refused at the cap** before
any adapter code ran. Raising the cap is not the fix — the cap exists
because the snapshot has to survive `localStorage`.

**Decided: a graph-driven ingest phase.** One optional member:

```ts
/** Given what has been read so far, name additional paths to read.
 *  Called repeatedly until it returns nothing new (or a cap trips). */
expand?(files: FilesSnapshot): string[];
```

Ingest becomes: read the **seed** (what `ingests` matches — for
Sphinx, `conf.py` and any `index.rst`) → `detect` → loop `expand`
to a fixpoint → `parse`. Existing adapters do not implement `expand`
and are unaffected; the caps still apply, but they now bound the
*reachable* set instead of the whole tree. This also fixes the
ordering problem that detection currently runs *after* a full read.

Three requirements on the loop:

1. **Termination is a visited set, not an iteration counter.** The
   driver tracks every path it has already offered and stops when a
   round adds nothing new. A toctree graph may contain cycles (`a`
   lists `b`, `b` lists `a`) and the corpus already contains 85 docs
   reached twice — neither may loop.
2. **Dangling entries surface as broken nodes; ingest never throws.**
   An entry naming a file that is not on disk is a real condition
   (godot-docs has zero today, but a work-in-progress branch will).
   `expand` returns the path, the read finds nothing, and `parse`
   renders a node marked broken with a non-blocking warning. The
   0-missing result in the survey is a property of this snapshot, not
   a guarantee.
3. **One scanner, shared.** `expand` and `parse` must extract toctree
   blocks with the *same* function. Two scanners that drift is how the
   ingest set and the parsed model silently disagree — a class of bug
   the round-trip law cannot catch, because both sides would be
   self-consistent.

### What is read vs what is kept

The note originally specified what the snapshot *holds* and never said
what the driver has to *fetch* to build it. Those numbers differ by a
factor of forty, and the gap is where both import limits live.

| | files | bytes |
|---|---|---|
| **read**, transiently — every reachable document, for its title | 517 | 5.41 MB |
| **kept** — nav hosts + `conf.py` + the title sidecar | 63 | ~113 KB |
| never read — excluded by suggest-atomic | 1078 | 26.3 MB |

So the caps split in two. `MAX_FILES` / `MAX_TOTAL_BYTES` keep their
numbers and their message but move to the **kept** set, checked after
parse — the first moment a graph-driven adapter's kept set is known. For
jtd and docusaurus the kept set *is* the read set, so the same imports
fail with the same words. A separate, deliberately loose read budget
guards the **scan**, with its own message, because "too big to store"
and "too big to walk" are different problems with different remedies.

**Every reachable non-atomic file is read in full.** Toctree detection
and title extraction both run on complete text. The read set is bounded
by two things only: the read budget, and whatever the walk declines to
descend into — which on this corpus is 1078 of 1594 documents and 83% of
the bytes.

Windowed reads were specified, built, and removed. The reasoning is
worth keeping because it generalizes: a head window is introduced as a
cost optimization, but what it actually does is **classify** — this file
does or does not host a toctree — and a classification miss loses an
entire subtree *silently*. Nothing catches it. Entry conservation guards
plans, not ingest, so there is no invariant standing between a wrong
window and a nav that is quietly missing a branch. It was also solving a
constraint that no longer exists: heads were sized to fit the read-set
caps, and the caps re-scope moved those to the kept set.

Corpus statistics are not a substitute for an invariant here. The 8 KB
window covered 63 of 63 hosts on godot-docs — which is evidence about
one repository, not a guarantee about the next one, and the failure it
would eventually produce is invisible.

If remote loading later wants a fast path, the zero-residual form is a
**size-gated** head read: take a head only when the file is no larger
than the window, so a truncated read never happens and no classification
can be missed. That is a phase-3 option, not a phase-1 one.

### 2. Simulation re-parses the snapshot, so titles must live in it

`simulatePlan` ([verify.ts:95](../src/collections/verify.ts#L95)) applies
the plan in memory, calls `adapter.parse(patched, …)`, and compares
the result to the edited model — **comparing titles**, with paths
stripped. So every title the app displays must be reproducible from
the snapshot alone.

That kills "lazy title extraction" as a free optimization: a title
backfilled from a file that is not in the snapshot cannot be
reproduced by re-parse, and every plan would fail simulation.

The rule this forces:

> A node's title must be either (a) derived from a file **in the
> snapshot**, or (b) derived from its **path**. Nothing in between.

Deferring a title read is therefore only safe when the node is
displayed with a path-derived title until the read happens — and the
read must add the file to the snapshot.

Combined with the numbers above, that leaves a decision about what the
snapshot holds. Three options:

| option | snapshot | fidelity | smell |
|---|---|---|---|
| **A** hosts only, path-derived titles | 62 files, 102 KB | poor — sidebar reads `introduction_to_2d`, not "Introduction to 2D" | none |
| **B** hosts + full title sources | 515 files, 5.4 MB (still over both caps) | exact | blows the caps |
| **C** hosts + a title sidecar | 62 files + ~30 KB map | exact | one synthetic key in a map of real files |

**Decided: C.** `parse` reads real files when present, else the sidecar,
else falls back to the path. The sidecar survives `applyChanges`
untouched ([ChangesDialog.tsx:126](../src/view/ChangesDialog.tsx#L126) refreshes
the snapshot with `applyChanges`, which preserves unknown keys), so
re-parse sees the same titles. B is out on arithmetic: 515 files /
5.4 MB is over both caps, and `cloneDocument` deep-clones `extras`
([tree.ts:54](../src/model/tree.ts#L54)) so one AI reorganize doubles it.

C's cost is that a synthetic key now lives in a map documented as
path → file content. Four guardrails make that safe by construction
rather than by convention:

1. **A reserved key that cannot be a path.** Not a plausible filename —
   something no filesystem walk or GitHub tree can produce, so
   collision is impossible rather than unlikely.
2. **One accessor module.** Reading and writing the sidecar goes
   through a single module; no adapter or view code touches the key
   directly. That is also the only place the format is versioned.
3. **`planChanges` and the save path filter it.** The key can never
   appear in a `FileChange`, so it cannot reach a `.patch` or
   `fsAccess` write.
4. **A property test that no plan ever references a synthetic key.**
   Random editing sessions, asserted over every emitted change — the
   same fast-check shape that caught five JTD planner bugs.

Guardrail 4 is the one that matters: 1–3 are invariants a refactor can
quietly break, and only the property test notices.

Known consequence, accepted: with titles supplied by the sidecar,
`simulatePlan`'s title comparison is tautological for unrenamed nodes —
it copies through `applyChanges` and re-parse reproduces it by
construction. Simulation still covers the override path (a serialized
`Title <path>` must beat the sidecar on re-parse), but **H1 extraction
correctness moves to ordinary fixture tests** against the vendored
corpus. With renames out of phase 1 (see Renames), the override path is
phase-2 work, so in phase 1 the title comparison proves nothing and the
fixture tests are the only coverage.

## Parse

1. **Find the docs root.** `conf.py` plus a root document containing
   toctree blocks. Godot keeps `conf.py` at the repo root; most Sphinx
   projects use `docs/`, `doc/`, or `doc/source/` — if the picked
   folder has no `conf.py`, look 1–2 levels down and offer that folder
   rather than failing.
2. **Find the root document.** `master_doc` / `root_doc` in `conf.py`
   by regex (never execute it — godot's declares
   `master_doc = "index"`), defaulting to `index`. `source_suffix`
   likewise (`".rst"` here).
3. **Walk.** Read the root document, extract its toctree blocks in
   file order, resolve each entry to a docname, recurse. Track visited
   docnames; a second reference to an already-placed doc is a hazard,
   not a second placement (see Hazards).
4. **Title each node** from the target's first section title — a text
   line followed by an underline of a repeated punctuation character
   (optionally preceded by a matching overline). Skip the leading field
   list (`:orphan:`, `:allow_comments:`), comments (`.. text`), and
   labels (`.. _name:`). Note that prose may legally precede the title:
   `tutorials/2d/index.rst` opens with three paragraphs before its `2D`
   heading. Fall back to a de-slugified last path segment.
5. **Shape the model.** Each root-level toctree block becomes a
   section; its `:caption:` is the section title when present, else the
   host document's title. Entries become topics; grafted subtrees
   become their children.

Per-block state that must round-trip byte-identically: the marker's
indent, the content indent, option lines and their order, the blank
line between options and entries, and everything outside the block
(prose, headings, comments, blank-line structure).

## planChanges

Because the nav is explicit, the plan is narrow: **rewrite only the
entry lines inside blocks whose entry list changed.** Everything else
in every file stays byte-identical.

- Recompute each block's entry list from the model.
- Unchanged block → no change. All blocks in a file unchanged → the
  file is absent from the plan.
- Emit entries at the block's **own** recorded indent.
- Options, caption, `:name:`, surrounding prose and comments are never
  touched.
- **A topic moving between two files edits both** — one block loses a
  line, another gains one. This is the common case and is why
  `planChanges` must diff blocks globally, not per file.
- Never create or delete files in phase 1. A node dragged somewhere
  that would require a new document is a blocking warning.

### Renames — out of phase 1

**Decided: phase 1 is moves-only.** Not because the escalation
mechanism is missing — a rename the adapter cannot express would block
itself at plan time like any other situation — but because renaming is
the one edit that makes the adapter *author* nav syntax rather than
rearrange it, and that deserves its own phase with write-back.

The serialization, when it lands, is the explicit-title form inside the
toctree (`New Title <about/introduction>`), never an edit to the
target's H1 — nav edits stay confined to nav files, consistent with
Docusaurus renames writing `sidebar_label` rather than touching
headings.

Phase 1 enforces this three ways:

1. **A `supportsRename` capability flag** on the adapter. This is new:
   no capability mechanism exists on either adapter contract today, and
   `allowRenames` ([contract.ts:30](../src/ai/contract.ts#L30)) is a
   per-run AI option, not an adapter property.

   **Superseded in shape by docs/13:** Mintlify renames groups but cannot
   rename pages (its schema has no per-page title), so the flag becomes
   per node kind — `{ sections: boolean; topics: boolean }` on both
   adapter contracts, defaulting to `{ true, true }`. Sphinx's
   `supportsRename: false` migrates to `{ sections: false, topics: false }`:
   same meaning, new shape.
2. **The UI grays rename affordances** for a document whose adapter
   declares `supportsRename: false`, and **Reorganize force-disables
   `allowRenames`** for it — the option is not merely defaulted off, it
   is unavailable, so a preset that asks for renames cannot produce
   entries the planner would have to refuse.
3. **Moves-only serialization, structurally.** Emitted lines are only
   ever *existing entry lines*, reordered and re-indented. The planner
   never composes an entry line from a title, which makes "phase 1
   cannot rename" a property of the code rather than a rule someone
   must remember. It also makes the byte-minimality claim trivially
   true: every line written was already in the file.

Deferred with renames: the **H1-vs-sidebar divergence** question — an
overridden entry label disagrees with the page's own title, which
Sphinx allows but a docs team may treat as a style violation. That is a
write-back-phase conversation, alongside the maintainer comment in
`tutorials/index.rst` ("These sections are sorted alphabetically.
Please keep them that way.") — these files have house rules a tool can
silently break.

`synthetic-explicit-titles.rst` is already vendored and stays: parse
must *read* the explicit-title form correctly in phase 1 (godot-docs
could adopt it tomorrow), even though nothing writes it yet.

### Locked nodes

Round-trip verbatim, cannot be reordered into or split apart:

- `:glob:` blocks — the entry list is a pattern, not a list.
- External-URL entries.
- `self`.
- Anything the parser does not recognize.

Pinned reference nodes (above) are the fourth kind, and an oversized
generated subtree is the fifth. On the reference corpus that is
`classes/`: 1079 docs, 26.3 MB, 6 blocks, 1163 entries, 85 duplicate
references. It collapses to a **single atomic locked card**, which keeps
it out of the snapshot entirely and keeps load fast.

**Decided: a rule, not a path.** An entry whose target host declares at
least `ATOMIC_ENTRY_THRESHOLD` entries across its own blocks collapses,
and the walk does not descend into it. `classes/` is the instance, never
the criterion — hardcoding a directory name would be correct for exactly
one project and invisible everywhere else.

The threshold is **250**, and the corpus says the choice barely matters
within a wide band: `classes/index.rst` declares 1163 entries and the
next-largest host in the entire project declares **47** (the root
`index.rst`). Anything from 150 to 500 separates them by multiples;
250 sits 5.3× above the runner-up and 4.7× below the target.

The signal comes from the host's OWN blocks, computed during expand, so
it costs no child reads — which is the whole point, since the subtree it
fires on is 1079 documents. A general model-level size policy stays
deferred (decision 4): this rule is adapter-local, and one corpus is not
enough evidence to make it a property of the model.

#### What "Lock topics" already gives us

Checked before designing anything new. `topicsLocked` provides exactly
the seams a per-node lock needs, and none of the state:

**Reusable — the guard sites already exist.** Topic drag
([topicDrag.ts:141](../src/interaction/topicDrag.ts#L141)), box select
([boxSelect.ts:19](../src/interaction/boxSelect.ts#L19)), delete-selected
([useKeyboard.ts:44](../src/app/useKeyboard.ts#L44)), and card pointerdown
([SectionCard.tsx:357](../src/view/canvas/SectionCard.tsx#L357)). A `locked`
prop is already threaded Canvas → SectionCard → TopicTree → TopicRow,
where it guards drag start, the context menu, rename, and the
`cursor-grab` affordance ([TopicRow.tsx:57](../src/view/canvas/TopicRow.tsx#L57)
onward). A per-node predicate slots into those same checks as
`ctx.locked || node.locked` — no new interaction paths.

**Not reusable — the state is the wrong shape in three ways.** It is
one boolean for a whole tab, not per node. It is deliberately outside
`EditorState`, so it is not undoable — correct for a view mode, wrong
for a document property. And it is not persisted:
[persistence.ts:81](../src/store/persistence.ts#L81) resets it to `false` on
reload, whereas a pinned reference must survive a refresh because it
describes the file, not the session.

So the new work is a real model field (`Topic.locked?: boolean`), not a
new interaction layer. It cannot live in `extras`: that bag is
explicitly data "the core clones but never interprets" (docs/03), and
the core must interpret this to guard a drag. An optional field is
backward-compatible with the persisted session format.

## The author's load procedure

1. **Load → Folder** (or a GitHub `/tree/` URL), picking the repo or
   docs root.
2. Docs-root detection; if `conf.py` is deeper, offer that folder.
3. Seed read → detect → graph expansion → parse. Warnings collected.
4. Cards render: one per root-level toctree block, captions as titles,
   `classes/` collapsed as one locked card.
5. Reorganize with every existing tool — drag, multi-select, undo, AI.
6. **Review changes** → per-file unified diffs, simulation verdict.
7. **Download `.patch`** / **Save to folder** — both, since docs/19.

## Hazards

| hazard | disposition |
|---|---|
| **Duplicate references** (85 docs in 2 blocks) | First occurrence is a movable primary; later ones are pinned locked reference nodes. See below. |
| **Indent drift** | Per-block indent is recorded and reused. Never normalize. Both 3 and 4 space widths occur in one directory. |
| **`:orphan:` hubs** | Invisible to the walk, as they are to Sphinx. Note at load; do not chase raw-HTML links. |
| **Prose before the title** | Title derivation must find the first *section*, not the first text line. |
| **Comments that look like directives** | `.. Sections below are split…` is a comment, not a directive. Block extraction must respect the `.. toctree::` form exactly. |
| **House rules** (alphabetized lists, maintainer comments) | Cannot be enforced; surface the comment text in the review dialog when a block carrying one is edited. |
| **`classes/` scale** | Atomic locked card; never ingested. |
| **Snapshot persistence** | Two different limits, deliberately not one. `MAX_FILES` / `MAX_TOTAL_BYTES` bound what is **kept**, checked after parse, because that is what `localStorage` holds — same numbers and same wording as before, and for jtd/docusaurus (kept == read) the same refusal. `MAX_READ_FILES` / `MAX_READ_BYTES` bound the **scan**, are loose by design, and say so in their own message: a graph walk touches far more than it stores. See "What is read vs what is kept". |

### Duplicate references

**Decided: a structural distinction, not a policy.** In walk order, the
**first occurrence** of a doc is the primary — an ordinary, movable
topic. Every **subsequent occurrence** is a **pinned reference node**,
reusing the locked-node treatment `:glob:` and external-URL entries
already need: it round-trips verbatim, and no plan ever rewrites its
line.

Two things make this the answer rather than "warn" or "block".

**The model represents duplicates natively.** A doc in two toctrees does
not need one node with two parents; it is two topic nodes that share a
`path`, which is what the source file says. `Topic.path` is
`path?: string`, "link target, if any" — it carries no uniqueness
contract, and nothing in `model/`, `commands/` or `store/` keys by it.
Every lookup is by stable id. Two cards showing
`class_editordock` is a faithful rendering of a file that lists it
twice, so nothing has to be rejected at import.

**But representable is not the same as safely editable**, which is why
this stops short of "no special handling at all". Two identical-looking
cards that behave identically, while only one of them can be moved
without changing what the other block says, is a trap. Pinning closes
the behavioural half of it: a pin can never be edited into an
inconsistent state in the first place, and `planChanges` needs no
duplicate-specific branch — pins are simply never emitted as changes,
like every other locked node.

> **Amended 2026-08-20 (docs/21 arc 2).** This sentence read "a pin
> cannot be dragged or deleted into an inconsistent state", and the drag
> half of that stopped being true: a pinned row now DRAGS, its drop
> asking once per tab, and the displacement is recorded and badged. The
> guarantee above is unchanged and is the reason the amendment is one
> clause rather than a rewrite — what protects the file is that the
> displaced arrangement never reaches a planner (the applyable
> projection returns every displaced row home first), with this
> adapter's own refusals still live underneath. Deletion is still
> refused outright. Corrected rather than quietly rewritten, because a
> sentence describing a limitation that has gone is one the next reader
> costs work around.

**The legibility half is now built too.** A pin carries the title of the
section holding its primary and says so on the row — "Also in Manual" —
so the reader learns where the real one lives without hunting. See
Locked states, read.

The cost, stated plainly: a pin is **inert**, so the corpus's 85
duplicated `classes/*` docs can only be reorganized at their primary.
Editing the second reference means editing the file by hand. That is the
right trade while `classes/` is an atomic locked card anyway, and it
should be revisited if a corpus turns up with duplicates in subtrees a
user actually rearranges.

**The one conflict simulation must refuse:** moving a primary into the
block that holds one of its pins. That would put two identical entry
lines in one block — which Sphinx tolerates but which no longer round-
trips, since re-parse collapses them back to one primary plus one pin in
a different order than the model says.

That refusal is computed at plan time from the situation, in the same
style as `path-collision`
([docusaurus.ts:794](../src/collections/adapters/docusaurus.ts#L794)) and
`unresolvable-ambiguity` ([jtd.ts:444](../src/collections/adapters/jtd.ts#L444)) —
which is also why "warn or block?" was the wrong question to ask up
front: in both shipped adapters `blocking` is a property of the
individual situation, not a switch set per adapter.

## Validation invariants

The hoped-for "every doc in exactly one toctree" is false in the
corpus, so it cannot be a hard invariant. What survives:

- **Round-trip law** (docs/11), unchanged: no edits → empty plan; an
  edit touches only entry lines in changed blocks; re-planning over the
  patched snapshot returns `[]`.
- **Simulation**, unchanged: `parse(apply(plan))` reproduces the edited
  structure — which is exactly what forces the title rule above.
- **Entry conservation**: the multiset of docnames across all blocks is
  preserved by any plan, except for entries the user explicitly
  removed. Duplicate references make this a multiset, not a set —
  a fast-check property, in the spirit of the AI pipeline's topic-id
  multiset net (docs/10).
- **Byte-identity outside managed lines**: assert per file, not just
  per plan.

## Read-only, and how the UI says so

`planChanges` is **optional** on `CollectionAdapter`, and its presence IS
the write-back capability — the same phase-1 pattern as
`supportsRename`, encoded by optionality rather than by a second flag.
Phase 1 Sphinx omits it.

This was the third thing the note left unsaid: it specified a read-only
phase and a required interface member, and never reconciled them. A
stub returning `[]` would have produced a Review changes button opening
an empty dialog — a dead end that reads as a bug.

Instead the button is **disabled with a reason**, not hidden:

> Restructuring stays on the canvas for now — writing back to Sphinx
> files arrives with phase 2.

Hiding it would be tidier and worse. The same decision-5 reasoning
applies: a missing affordance reads as a missing feature, a disabled one
explains itself and sets an expectation. `supportsRename: false` grays
the rename affordances the same way, and forces `allowRenames` off in
Reorganize so a preset cannot ask for something the planner would have
to refuse.

The read-only `sidebars.ts` adapter in docs/08 reuses this mechanism
exactly — which is the argument for optionality over a stub: the second
adapter that needs it is already on the roadmap.

## Sequencing

**Read-only first**, same rationale as manual Docusaurus sidebars
(docs/08): import, visualize, reorganize, AI, and `.patch` download —
no folder write-back — until the plan has been exercised against real
corpora. Unlike `sidebars.ts`, this does **not** break the byte-minimal
round-trip law, so it is a genuine collection adapter and can graduate
to Save-to-folder without changing shape.

Phases, as decided:

1. **Read — built.** `expand` hook + shared RST scanner + `parse` + the
   title sidecar and its accessor + `Topic.locked` + `supportsRename` +
   optional `planChanges` + the caps split + fixtures. Registered, so a
   Sphinx folder imports, renders and reorganizes on the canvas; nothing
   writes back.
2. **Plan, moves-only.** `planChanges` emitting only reordered existing
   entry lines, simulation, the co-location refusal, `.patch` download,
   and the property tests (no synthetic key in any change; entry
   multiset conservation).
3. **Write back.** Save-to-folder, renames + `supportsRename: true`,
   the H1-vs-sidebar divergence conversation, `:glob:` support,
   docs-root offer UI.

> **[phase 2 is designed — `docs/19`, 2026-08-17]** Written and gated;
> no `src/` beyond the hotfix set below. What it settles that this note
> could not: the region model is a **`navTail`** running from the first
> directive of the trailing SEQUENCE to EOF — heading-interrupted, since
> the strict reading leaves only **22% of godot's entries editable**
> against 93% — with mid-file blocks, prose-in-span carriers and globbed
> blocks locked, each with its per-corpus list committed under
> `scripts/data/toctree-census/`.
>
> Three expectations inverted by experiment: there is **no tail
> preamble** (the `--unidiff-zero` class is position-zero, not
> anchorless, so a tail applies under default `git apply`); the **EOF
> terminator is part of the context contract**; and **GNU patch is not
> atomic across entries**, which matters here because a cross-toctree
> move is multi-entry by construction.
>
> Two of this note's own rulings are amended there: **`:glob:` is rare,
> not unused** (15 blocks across four corpora), and it is LOCKED in
> phase 2 rather than supported in phase 3; and **`:hidden:` is display,
> not navigation** — all six of godot's root blocks carry it and they
> are the entire sidebar, so reading it as "not nav" would import the
> reference corpus as an empty document.

## Locked states, read

`Topic.locked` was a boolean that rendered nothing: a locked row differed
from an ordinary one only by a missing grab cursor. On the reference
corpus that actively misled — the Class reference card showed one
caret-less row, `All classes`, which reads as *empty* and means *1163
pages, deliberately not expanded*.

**The to-do said three states. Building it found a fourth**, because
`locked` was also set on a dangling entry — a document listed in a
toctree that does not exist. That is a fault in the source, not a
decision, and it is the only kind that earns a warning tone. Conflating
it with a deliberate boundary was the worst case available.

`lock?: TopicLock` replaces the boolean, carrying the kind plus the two
values parse computed and used to discard: the atomic entry count, and
the owning section's title for a pin.

**The row already had the slots.** Caret = what kind of node, title plus
micro-badge = what it is, right rail = how big. Nothing new was added;
locked kinds fill slots that existed, which is why this cost almost
nothing and why it matches the pinned visual language of docs/05.

| kind | caret | badge | right rail |
|---|---|---|---|
| `atomic` | layers | Locked | **the count** |
| `reference` | pin | Also in *&lt;section&gt;* | — |
| `pattern` | asterisk | Pattern (title set as code) | — |
| `external` | external-link | External | — |
| `missing` | file-x, warning tone | Missing | — |

> **[amended 2026-08-18, polish-glyphs] The text badges above are
> RETIRED — all kinds, no toggle.** Property labels truncated titles
> and out-shouted content at density. The mark is now ONE right-margin
> glyph per row, per-kind SHAPE (`view/canvas/lockGlyphs.ts`), in two
> tiers — `missing` in the warning token, every other kind quiet
> monochrome — with a styled tooltip (cause → consequence → remedy,
> `model/locks.ts`) and the Overview's locked line itemizing the same
> vocabulary as the second door. The tier law and the membership test
> live in docs/19's lock section. The caret slot no longer carries the
> lock icon; a locked leaf keeps an empty spacer. **The right-rail
> COUNT survives** — it is disclosure of folded rows, never a property
> label, and it was the single highest-value line then and still is.

The single highest-value line: the count. An atomic node has a size and
rendered none, because `children` is empty. Putting it in the slot every
other parent already uses turns *empty* into *big*.

### When to split a lock kind

`pattern` and `external` mean different things and currently *behave*
identically: both round-trip verbatim and refuse every gesture. Whether
they should be separate kinds is still open, and docs/13 hit the same
question for Mintlify's `$ref`.

**Principle, shared by both notes: split when behavior splits, not when
meaning feels different.** A kind that changes nothing but a label is a
concept to maintain for free, and the taxonomy is already five wide.

The trigger is concrete rather than a matter of taste: **the collection
adapter**. There a `$ref` target resolves into real nodes and a glob
still does not — at that point they stop behaving alike, and the split
pays for itself. Until then it is nomenclature.

### Sealed cards

Card border carries the same fact at presentation distance, where rows
are illegible but outlines are not — the review-artifact job in
PRODUCT.md. The resting border is **dashed**, which reads as permeable;
sealed is its antonym, continuous with a second rule of equal weight
just inside. The inner rule is a `box-shadow`, not the border, so
selection and drop-target keep the border channel they already own and
both states stay readable at once.

**Superseded in mechanism by docs/13.** This derived the seal as
`rows.every(locked)`, which is vacuously true at zero rows, so a card
generated from a spec and a genuinely empty card came out identical.
Sealing is now DECLARED section data (`Section.sealed`), set by an
adapter at parse time; the derived predicate survives as `allRowsLocked`,
a **UI hint only**. Sphinx declares no seals — dropping a topic into the
Class reference card is a legal edit, so claiming the card is inert was
over-reach — and that card now renders on the hint instead.

A card shows the sealed treatment when **every** top-level row is locked —
not when it merely contains one. A card holding one pin among twenty movable rows is
not inert, and caging it would be the same lie one level up. That rule
catches both real shapes: godot's Class reference (one atomic row) and a
glob-driven Releases card (every row a pattern).

### What the corpus does and does not exercise

Of 516 placed nodes in godot-docs: **1 atomic, 0 references, 0 patterns,
0 external, 0 missing**. The 85 duplicate references all sit inside
`classes/`, which is atomic and never descended into. So four of the five
kinds are covered by synthetic fixtures only — the same caveat that
applies to the rename syntax, and worth knowing before trusting them.

Density varies enormously and the design has to hold at both ends: 1
locked row in 516 for godot, versus 100% locked rows on a globbed
releases card.


## Decisions

All five open questions are resolved; the sections above carry the
detail. Summary, and what each one costs:

| # | decision | new mechanism required |
|---|---|---|
| 1 | Title **sidecar** (option C), with four guardrails | reserved NUL key, single accessor module, `planChanges`/save filter, property test |
| 2 | **`expand(files)`** iterated to a fixpoint | visited-set termination, broken nodes for dangling entries, one shared scanner; every named file read in full |
| 3 | Duplicates → **primary + pinned reference nodes** | locked-node treatment; co-location refusal at plan time |
| 4 | **Atomic collapse by rule** (`ATOMIC_ENTRY_THRESHOLD = 250`) | `Topic.locked?: boolean` in the model; model-level size policy deferred |
| 5 | **Renames out of phase 1** | `supportsRename` capability flag; moves-only serialization |

> **[corrected 2026-08-17, re-measured]** Two figures in the survey table
> above were wrong and the rest reproduce exactly. `.rst` on disk is
> **1,596**, not 1601 — three independent counts agree (`find`,
> `git ls-files`, `git ls-tree HEAD`) at the same commit with a clean
> tree. "Docs in no toctree" was arithmetic on the stale total, so it is
> **2**, not 7; the parenthetical is right, exactly one carries
> `:orphan:`. Every other row — 1,594 reachable, 103 blocks, 62 hosts,
> 1,678 entries, 85 multi-listed, 0 missing — reproduces to the unit.
>
> And **"reachable" needs a qualifier wherever it appears here.** It
> means two different sets: Sphinx's global toctree closure reaches
> **1,594 docs**, while the shipped walk READS **517 files**. The
> 1,077-doc gap is `ATOMIC_ENTRY_THRESHOLD` declining to descend into
> `classes/`, not unreachability — collapsed-and-says-so, with the count
> on the card. An orphan discussion means the first; a cost discussion
> means the second.

> **[corrected 2026-08-17] Guardrail 3 is STAGED, not shipped.** The
> Decisions table below lists a "`planChanges`/save filter" among the
> title sidecar's four guardrails. `realFiles` is that filter and it has
> no production call site — repo-wide, only its own module and its unit
> test. It is unreachable rather than broken, because Sphinx omits
> `planChanges` and no writer is ever handed the snapshot; but the table
> reads as shipped and it is not. **Claimed ≠ wired.** A tripwire now
> sits in `titleSidecar.test.ts` that passes on the absence and fails
> the day `planChanges` lands without the filter.

Three follow-on resolutions came out of implementation, each filling a
place the decision above was silent rather than wrong:

| | the decision settled | what it did not say |
|---|---|---|
| 1 | what the snapshot **keeps** | what the driver must **read** to build it — 8× larger, and where both caps live |
| 4 | that `classes/` collapses | by what **rule**, since a hardcoded path is right for one project only |
| 5 | that phase 1 is read-only | that `planChanges` was **required** by the interface, so "read-only" had no encoding |

Three of these touch shared code rather than the adapter — the `expand`
hook (`CollectionAdapter`), `Topic.locked` (`model/`), and
`supportsRename` (both adapter contracts). They land first, in phase 1,
because everything else is written against them.

Deferred, deliberately:

- **Size-based atomic collapse** as a general policy — waiting for a
  second corpus to ask.
- **H1-vs-sidebar divergence** — a write-back-phase question, since
  nothing writes an overriding label until then.
