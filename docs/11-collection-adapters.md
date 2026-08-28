# 11 — Collection adapters

Format adapters (docs/04) assume the nav lives in ONE file. Many doc
systems derive it from **metadata spread across files**: Just the Docs
reads per-page frontmatter; Docusaurus autogenerates sidebars from the
directory tree plus `_category_.json`. Collection adapters make those
users first-class: import a docs folder (or GitHub `/tree/` URL),
reorganize with every existing tool (drag, undo, AI), and get the
result back as **reviewed, minimal per-file edits** — downloadable as
a git-applyable `.patch` anywhere, or written in place via the File
System Access API on Chromium.

## The contract (`src/collections/types.ts`)

```ts
interface CollectionAdapter {
  id; label;
  ingests(path): boolean;                       // which files to read at import
  detect(files): number;                        // 0–1 confidence
  parse(files, rootName): { doc, warnings };
  planChanges(files, doc, sectionOrder): { changes, warnings };

  reparentMovesFiles: boolean;                  // required — see below
  nodesNeedTargets: boolean;                    // required
  createCards: boolean;                         // required
  reorderCards: boolean;                        // required
}
type FilesSnapshot = Record<string, string>;    // JSON-safe — lives in doc.extras
type FileChange = edit | create | move;         // moves for directory-bound systems
```

The original snapshot lives in `doc.extras.files`, which makes
`planChanges` a **pure function of (original files, edited model,
canvas order)** — no edit journal. That is what makes undo/redo
integration free: undo just changes the model, and the next plan
recomputation reflects it (undo after a save correctly yields a
revert-on-disk plan).

**Four required capability fields, and one reason between them.** Each
answers a question some layer above the planner has to ask BEFORE a run
starts, and each fails silently in the dangerous direction if it is
missing — an unclassified adapter reads as *capable*, so a permission is
never asked or a prompt line never renders, and the run promises what the
plan must refuse. Required means `pnpm check` names the next adapter that
forgets, rather than a user paying for the discovery.

| field | the question | what a missing answer costs |
| --- | --- | --- |
| `reparentMovesFiles` | does a parent change move bytes on disk? | files relocated with no consent asked |
| `nodesNeedTargets` | must every nav node name a page? | a card nested inside another, with no line to write |
| `createCards` | can the write path add a top-level card? | the "Allow new sections" toggle offered where the plan refuses one |
| `reorderCards` | can it record a change to their order? | no prompt line saying card order is fixed here |

The last two were added after three corpus-scale runs came back refused
at Review for structure no layer above the planner knew was unwritable
(docs/10's oracle log, 2026-08-19). Answer them from your OWN
`planChanges` — Hugo creates a card happily and writes no top-level order
at all, which is the distinction between what a format can express and
what an adapter writes.

**The round-trip law** (the single-file contract, reworded):

- no model edits → `planChanges` returns `[]`
- an edit touches ONLY affected files; within a file, only managed
  lines — every other byte identical (frontmatter surgery is
  byte-preserving: BOM, CRLF, comments, duplicate keys)
- idempotent: re-planning over the patched snapshot returns `[]`
- files are never deleted — removals map to the system's hidden
  mechanism; a move is the only thing that vacates a path

**Verification by simulation** (`verify.ts`): apply the plan in
memory → re-parse → structurally compare with the edited model. This
runs in the tests AND at runtime in the review dialog; a plan that
fails simulation is never saveable. Unresolvable situations
(ambiguous titles, unmergeable YAML, path collisions) surface as
`blocking` warnings that disable saving.

## Just the Docs (`adapters/jtd.ts`)

Nav linkage is by exact TITLE strings: `parent:`/`grand_parent:`
reference titles, never paths; directory layout is officially
irrelevant. Parse implements the theme's real semantics (verified
against its own repo, including its ambiguity test pages): the modern
`ancestor:` key with iterative chain-aware resolution, Liquid-truthy
`nav_exclude` ("false" excludes!), float `nav_order`, sibling sort =
nav_order'd first, then title-alphabetical case-sensitive.

Planning: every linkage edit is gated on a resolver simulation —
"would re-parse attach this page correctly with its existing keys?" —
so untouched pages stay untouched AND stale `grand_parent` keys on
children of moved pages get fixed. Renames cascade over the RESOLVED
tree; sibling groups renumber `nav_order: 1..n` only when the induced
order differs; removals become `nav_exclude: true` subtrees; new
nodes become stub files carrying computed disambiguators; ambiguity
that can't be auto-resolved (via `grand_parent`, then the nearest
unique `ancestor` chain title) blocks.

## Docusaurus autogenerated (`adapters/docusaurus.ts`)

The hierarchy IS the directory tree. Categories read
`_category_.json` **or `_category_.yml`** (label/position; json wins
when both exist; yml is edited with the same byte-preserving line
surgery as frontmatter, so nested keys and comments survive — the
facebook/docusaurus repo itself uses yml with inline comments) or
their absorbed index doc (`index` > `README` > `<dirname>`); docs
read `sidebar_label` ?? `title` ?? first `# heading` (ATX, outside
code fences, `{#anchor}` stripped — how Docusaurus itself titles
docs) ?? filename; underscore-prefixed files are partials and stay
out of the nav; siblings sort by explicit position, then filename
(number prefixes literal in v1 — warning). New categories are
created as `.json`. Renames always write `sidebar_label` — headings
and bodies are never touched.

Planning: reorders renumber `sidebar_position` / category `position`;
renames go to `sidebar_label` / category `label` (titles and headings
are never touched); cross-folder moves are real file moves (with a
links-may-break warning — link rewriting is out of scope in v1);
whole categories relocate `_category_.json` + every doc via
longest-prefix remap; a doc that gains children converts to a
category (`doc.md` → `doc/index.md`); removals become
`unlisted: true` (Docusaurus ≥ 3); emptied categories get an index
stub so they stay visible; a collision backstop blocks any write that
would clobber a surviving file.

## Import (`src/view/loadCollection.ts`)

- **Folder tab**: `showDirectoryPicker` on Chromium (retains the
  write handle), `webkitdirectory` fallback elsewhere. Skips
  `.git`/`node_modules`/`_site`/`vendor`/dot-dirs; reads only what an
  adapter `ingests`; strips the common prefix; hard caps 500 files /
  3 MB (if the snapshot can't persist, planning breaks after reload —
  refusing is kinder).
- **GitHub `/tree/` URL**: default_branch + ≤3 prefix probes resolve
  refs containing `/`; `git/trees?recursive=1` lists (truncation
  refused); blobs come from raw.githubusercontent.com — unmetered by
  the 60/hr API quota — 6-way concurrent with one retry.
- Detection picks the most confident adapter (0.3 floor). Parse
  warnings ride in `extras.importWarnings` and appear in the review
  dialog.

## Review + write-back

`ChangesDialog` (Header shows **Review changes** instead of Export
for collection tabs): status (verified ✓ / blocked / simulation
failed), per-file colored unified diffs, plan + import warnings,
**Download .patch** (git-style, rename hunks for moves), and **Save
to folder** on Chromium — permission re-checked at save; writes land
via `fsAccess.ts` (all writes first, then vacate move sources). After
a save, `refreshCollectionFiles` swaps the snapshot for the post-save
contents, so the plan visibly collapses to empty.

Collection formatIds resolve through the format registry via
**facades** (`collections/registry.ts`): the per-card code view shows
a YAML outline; legacy serialize yields the current plan as `.patch`.

## Testing

Same philosophy as formats-conformance, plus teeth: vendored
real-world fixtures (JTD's own docs, MIT-attributed), law tests
(no-op, byte-level minimal touch, cascade, idempotency, simulation),
and a fast-check property per adapter — random command sessions must
end in blocking warnings OR a simulation-verified idempotent plan.
That property caught five real JTD planner bugs before ship
(`ancestor:` support, stub disambiguators, stale grand_parent on
moved subtrees, orphan canonicalization, orphan-inner-rename dual
placement). Flow 9 e2e runs the whole pipeline offline against a
mocked GitHub.

## Non-goals (v1)

- Link/slug rewriting on Docusaurus moves (warned instead)
- Docusaurus number-prefix reordering (positions are written instead)
- JTD `has_children` (pre-0.4 sites) — documented limitation
- Hugo/VitePress/etc. — the contract is one file per system away
