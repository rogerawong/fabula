# 18 — Section reparenting (directory moves) — DECISION RECORD

**Status: DEFERRED. Charter parked, with everything settled that could
be settled without building it.**

The successor docs/16 named. This note exists to record a decision not
to build, which is a different artifact from a design — so it says what
was measured, what the measurement decided, what deferral owes the user
instead, and what would have to change for the charter to be taken off
the shelf.

## Why this is a deferral

docs/16 shipped page moves and left card/section moves as a designed
absence, with the unlock named: a directory's membership includes files
`ingestible()` filtered out before any adapter saw them. Closing that
was expected to be the work. It is not the obstacle, and the obstacle
turns out not to be technical at all.

**The gesture is two orders of magnitude rarer than the one docs/16
built.** Measured against kubernetes/website's full history (63,643
commits, 2018-05-05 →), in `content/en/docs`:

| | count |
| --- | --- |
| cross-directory FILE moves (docs/16's number) | **577** |
| whole-directory moves | **25** |
| of those, reparents rather than renames-in-place | 16 |
| of those, **within the documentation tree** | **6** |
| most recent in-TOC directory reparent | **2019-06-12** |
| median files carried | 4 (max 17) |

Ten of the sixteen reparents move a directory OUT of `content/en/docs`
entirely — nine into `content/en/examples` as code samples were
extracted from prose, one into `releases`. Those are not IA changes made
in a table of contents; they are a repo reorganizing what counts as
documentation. The six that remain are all from 2018–2019.

**And the reason is not that the project leaves its IA alone.** Commit
`55ac801bc`, "Restructure the left navigation pane of setup", took
`setup/` from fifteen direct entries to five by creating
`best-practices/`, `learning-environment/` and `production-environment/`
and distributing pages into them. That is a textbook IA restructure and
it scores **zero directory moves**, because no directory relocated
intact. The dominant real-world shape is **redistribution, not
relocation** — and redistribution is exactly what docs/16 shipped.

So the honest case for this note was never demand. It is the
**page-less-subtree correctness hole**: `tutorials/kubernetes-basics/public/`
holds 42 files, produces nothing on the canvas, and would have to travel
with any move of `tutorials/`. That hole is real. It is also
**conditional on the gesture existing** — nothing can strand those 42
files while nothing can move their directory. Building a mechanism to
close a hole that only opens when the mechanism ships is not caution; it
is circular.

**Deferred.** What follows is the survey that decided it, the
experiments that would have decided the build, the charter parked
whole, and the affordances deferral owes.

## Survey

`scripts/survey-unread.ts` (committed) and `scripts/survey-reparent.ts`
(docs/16, reused for the history extraction — running its exact method
reproduces docs/16's 948 / 577 / 368 / 3 to the unit, which is what lets
the directory numbers stand beside the file numbers).

### The unread-file map

62 files under `content/en/docs` that the app never opens. Method,
stated so it can be re-derived: `1740 total − 1672 .md − 6 .html = 62`.
`.html` is ingestible (Hugo's `CONTENT_RE`), and treating it as unread
would have reported 68.

| where | unread |
| --- | --- |
| `tutorials/kubernetes-basics/public/images/` | **42** |
| `images/` (top level, no card above it) | **11** |
| `concepts/` | 3 |
| `reference/` | 2 |
| content root (`OWNERS`, `update-user-guide-links.py`) | 2 |
| `tasks/`, `contribute/` | 1 each |
| `setup/`, `home/`, `doc-contributor-tools/` | 0 |

By extension: 47 `.svg`, 11 `.png`, 2 extensionless (both `OWNERS`), 1
`.json`, 1 `.py`.

### Three corrections this note owns

The design chat that produced the charter got three things wrong, and
they are recorded here rather than quietly fixed, because two of them
are the same conflation wearing different clothes.

**1. "5 of 8 top-level cards" → 5 of 7.** Running `hugoAdapter.parse`
over the corpus yields **seven** sections; the disk holds **nine**
top-level directories. **Cards are not directories** — `images/` and
`doc-contributor-tools/` are directories that become no card, the first
because it holds no pages and the second because `ignoreFiles` excludes
it. Five of the seven cards carry unread files somewhere below.

**2. "the 62 concentrate in ~7 of 173 directories" — the denominator is
retired.** No measurement reproduces 173. Candidates, all from the same
corpus: 187 directories excluding the root, 188 including it, 186
holding at least one file directly, 183 holding at least one `.md`
directly. The *grain* claim survives and is the one that mattered — the
62 concentrate in seven directories, so most subsection targets are
provably clean — but the figure it was expressed with does not, and
**a number nobody can re-derive is not a receipt.**

Both corrections are the same split: **sections ≠ directories.** A
section is what the nav declares; a directory is what the filesystem
holds. They coincide often enough that one name served both until it
met a directory with no pages and a directory the config excludes.
Joins the conflation ledger.

**3. "N=0 for `doc-contributor-tools/`" is true and misleading.** It has
zero UNREAD files, and it is still a page-less subtree with no card. Its
single file — `linkchecker/README.md` — is ingestible, IS read, and IS
kept as a nav head; it merely fails to become a page. So a move would
carry it for free. Zero unread is not zero to think about.

That specimen forces a three-way split the charter collapsed into one:

| population | in the snapshot? | would a move carry it? |
| --- | --- | --- |
| **unread** (62) | no — never opened | **no; this is the hole** |
| **read-but-page-less** (1) | yes, as a nav head | yes, already |
| **folded** (bundle resources) | yes | yes, already |

Only the first is docs/18's subject. Counting the second as unread
overstates the gap; counting it as nothing hides a page-less subtree.

### Page-less subtrees, and the one that is out of scope forever

Four maximal page-less subtrees — directories with unread files and no
page anywhere below:

| files | subtree |
| --- | --- |
| 42 | `tutorials/kubernetes-basics/public/` |
| 11 | `images/` |
| 1 | `tasks/administer-cluster/dns-custom-nameservers/` |
| 1 | `doc-contributor-tools/` (read-but-page-less) |

`tutorials/kubernetes-basics/public/` is the specimen the charter is
built on: 42 files below a card that exists, which a move of `tutorials/`
must carry.

**`images/` is a boundary case and it belongs outside every possible
scope.** It is a direct child of the content root with zero pages, so no
card contains it and no card ever will. A reparent driven from the
canvas cannot see it, cannot move it, and cannot warn about it —
correctly, because it is not below anything that moves. Stated here so a
future reader does not count it as a gap in the manifest: it is not a
traveler, it is a neighbour.

**A manifest keyed by directory must not double-count nesting.**
`tutorials/kubernetes-basics/public/` and `…/public/images/` are the same
42 files at two depths.

### Storage arithmetic — and why it forecloses one design question

| | measured |
| --- | --- |
| flat JSON array of 62 relative paths | **3.23 KB** |
| nested `{dir: [names]}` | **1.46 KB** |
| kept snapshot (what `MAX_TOTAL_BYTES` sums) | 367.6 KB |
| `MAX_TOTAL_BYTES` | 3072 KB |
| headroom | **2704 KB** |

A flat manifest is **0.12%** of remaining headroom — a factor of **836**.
Nesting saves 54.7% because the corpus's prefixes repeat (41 characters,
42 times), but at this scale the saving is decoration.

The consequence is a ruling, not an observation: **any refusal threshold
this design later grows must be justified by something other than bytes,
or not exist.** The charter proposed a threshold to bound a complete
manifest, on the assumption that completeness costs. It does not.

Three snapshot figures exist and they are not interchangeable — 348.0 KB
of markdown nav heads, 445.7 KB with path keys (docs/15 and CLAUDE.md's
accounting), 367.6 KB of content across all kept files (what the cap
actually compares), 525.3 KB as localStorage JSON. Headroom above uses
367.6 KB because that is the number the cap sums.

## Experiments

Tool semantics established by experiment, not by documentation — the
`--unidiff-zero` lesson, and this session found a second instance of the
same failure (D1, below).

### File System Access: there is no directory move

Chromium 149.0.7827.55, tested on **both** an OPFS root and a **real
user-granted local directory** with a real `readwrite` grant. Every
structural finding is identical between them; only timings and the
permission model differ.

    FileSystemFileHandle.prototype.move       → "function"
    FileSystemDirectoryHandle.prototype.move  → "undefined"
    FileSystemHandle.prototype.move           → "undefined"

Absent from the IDL, not throwing — `dirHandle.move(...)` is a plain
`TypeError: I.move is not a function`, and borrowing the file
implementation is blocked (`Illegal invocation`). Note the asymmetry:
`remove` IS on the shared prototype, so directories can be deleted but
not moved.

File moves work across directories within the granted root:
`fh.move(destDirHandle, "name")`, `fh.move("newname")`,
`fh.move(destDirHandle)`. A path separator in the name is rejected — you
must hold the destination handle.

**So a section move is a RECURSION, not a loop.** `move()` is files-only,
so iterating `entries()` and moving each file leaves every SUBDIRECTORY
behind, and the subsequent `removeEntry` then fails
`InvalidModificationError`. The working shape: for each entry, move a
file, or create the mirror directory and recurse, then `removeEntry` the
emptied source — bottom-up.

**The ordering law, and it is the data-loss case.**

| order | outcome |
| --- | --- |
| move every file out, then `removeEntry(src)` with NO flag | works; verified bytes at destination |
| `removeEntry(src, {recursive:true})` first, then move | **bytes gone.** A handle grabbed BEFORE the removal does not keep the file alive: `NotFoundError` |
| `removeEntry(src)` on a non-empty dir, no flag | `InvalidModificationError`, and it FAILS SAFE — nothing deleted |

`{recursive:true}` is the dangerous call: it destroys files the plan has
not moved yet. An emptied directory needs no flag at all.

**`entries()` yields in no stable order** — the same tree enumerated
differently on the two legs. A planner must sort explicitly or its plans
are nondeterministic.

### git apply: content-free relocation works

- A **hunkless rename entry** relocates a file whose bytes we never read.
  Accepted for text and for **binary** (a real `.png`, byte-identical
  after).
- `similarity index 100%` is **optional**, and no `index <sha>..<sha>`
  line is needed. This matters more than it looks: we can emit a rename
  for a file whose content we have never read and whose hash we
  therefore cannot compute.
- **Atomic.** A 44-entry directory move with one deleted source lands
  **0 of 44**; git validates the whole patch before touching the
  worktree. There is no partial state to design for.
- **`--3way` breaks that**, and is now warned against in the patch's own
  first lines: it reads the pre-image from the INDEX, so a file deleted
  from the working tree but still tracked is silently restored at the
  destination, edited, exit 0.
- Missing destination directories are created, at any depth.
- A directory it fully empties is removed, stopping at the first parent
  that still has children.

### GNU patch: cannot do this at all

- Hunkless rename → `exit 2`, "I can't seem to find a patch in there
  anywhere". Loud, therefore fine.
- Rename + hunk → **`exit 0`**, "patching file 'old/a.md'", hunk applied
  at the OLD path, destination never created. Silent, therefore not
  fine — and this project's patch preamble used to recommend it.

**Consequence for any future build: content-free relocation is a
`git apply`-only capability.** The differential oracle ("FSA result ≡
patch result") holds for git and is unachievable for `patch(1)`. That is
a capability narrowing to state, not a bug to fix.

## Defects found while surveying

Four were reported; three were real. Each shipped as its own commit with
its own receipt scenario, ahead of this note, because they are defects in
what docs/16 already shipped rather than in what docs/18 proposes.

| | what | status |
| --- | --- | --- |
| **D4** | nesting a section inside another slipped the AI file-move net silently | **FIXED** — pinned first, then flipped |
| **D2** | the patch preamble recommended GNU patch, which edits at the old path and exits 0 | **FIXED** — offered only where nothing renames |
| **D1** | a moved bare page emitted a patch needing `--unidiff-zero` and never naming it | **FIXED** — classifier keys on the change, not the mechanism |
| **D3** | the dissolution disclosure asserted "directory retained" for both writers | **DID NOT REPRODUCE** |

**D3 is the one worth reading.** The measurement behind it was correct —
`git apply` does rmdir a directory it empties — and it does not reach
this code path, because a dissolved Hugo section keeps its `_index.md`
and the directory never becomes empty. The amendment was written, run,
and reverted. A downward amendment retires a promise, and retiring one
that was actually kept costs more than the overstatement would have.

What was real in D3 is the **under-defined oracle**: `expected/` is
materialised from an in-memory snapshot, which has no directories, so a
tree that kept an emptied directory and one that removed it serialise
identically and `diff -r` called them the same. It certified
"byte-identical" while being structurally unable to compare the thing
under dispute. The receipt now asserts the directory set.

## The manifest charter, parked

Everything below is settled and unbuilt. It is recorded at this
resolution so that taking it off the shelf is a build, not a redesign.

**Names, not counts.** The scan already enumerates every entry while
filtering — `candidatesFromFileList` maps every `File` with no filter,
and `snapshotFromCandidates` discards the complement in one
`candidates.filter(...)`. The information was always in hand; retaining
it is zero new I/O. **This is the fourth instance of docs/16's
false-constraint pattern**, alongside the fifth found this session:
`cardChainRefused` does not generalize to directories and no sibling
predicate is owed, because the gesture that moves a directory is the
TOPIC drag, whose discriminant already answers `subsection` and
`leaf-bundle`. No gesture has to be built.

> **One ingest path is not like the other.** The webkitdirectory
> fallback holds the complete unread list at a nameable line. The File
> System Access path enumerates and does not retain. Whatever the build
> does, it must do it in both, or the manifest is a Chromium-only fact
> about a Chromium-only writer — and that asymmetry is exactly the kind
> that ships unnoticed because the fallback is the branch nobody drives.

**Contents never read, stored, or claimed.** Moves of unread files are
content-free relocations: an FSA `move()` needs no bytes, and a git
rename header needs neither content nor hash. The ownership law is
extended, not breached — the plan claims identity and location, never
bytes. Absence test on the construction: no read of any manifest path
outside the page set.

**The manifest is COMPLETE, a stated exception to the exemplar
convention.** Tier-2 evidence is bounded at 20 exemplars
(`MAX_EXEMPLARS`), and this may not be: you cannot move "20 of 42 files,
plus 22 unnamed". The convention exists to keep stored evidence
proportional to nothing; here the whole set IS the payload. Measured at
1.46–3.23 KB against 2704 KB of headroom, so the exception costs
0.12% and buys correctness. **Recorded beside the convention, not
instead of it.**

**Tier-2 evidence, provenance-stamped.** docs/17's classifier is
binding: a manifest is not recomputable from the kept snapshot, because
the files it names were never kept. Written at import, stored, stamped
"as of import" wherever it is displayed — the `LinkIndex` pattern, and
for the same reason.

**Page-less subtrees are in scope.** A directory with unread files and no
page anywhere below produces nothing on the canvas and must still
travel. The manifest covers directory subtrees, not sections-with-pages.
Found by corpus inspection, not by design.

**Leaf-bundle moves unlock WITH this note**, whenever it builds: a bundle
move is a directory move, same manifest, same mechanics. Until then the
leaf-bundle refusal stands and now says plainly that there is no way
around it.

**Out of scope, one sentence each.** *Slug rename* — a filename change
with the parent preserved; 368 in the corpus, no canvas gesture, and
named so it is never absorbed into "move". *Cross-language move* —
sibling-language documents are independent (docs/14), nothing in the
contracts spans two.

**Residuals, pre-stated.** A file ADDED to a directory after import is
not in the manifest and stays behind — disclosed "as of import", the
link-index's kin. A file DELETED after import fails its move loudly at
apply, which is the safe direction.

## What deferral owes, and ships

A deferral that only refuses teaches the user nothing. These shipped
with this note:

- **The subsection refusal names the path**, not just the wall: *"To
  relocate its pages: select them and drag them together; the emptied
  section stays behind for cleanup."* That is the gesture the corpus
  actually performs, and v2 already does it.
- **The AI validator refuses a nested section in the same words.** One
  truth, three surfaces — drag overlay, AI guidance, and any plan-time
  check that later needs it.
- **The leaf bundle is told there is no path**, because there is none.
  Offering one would be inventing it.
- **Explicitly NOT built: an auto-convert offer on the refused drag.**
  Turning a refused section drag into "shall I move its pages instead?"
  is consent-model creep, machinery for a gesture this corpus performs
  never. The copy teaches the same path for the price of a sentence.

## Unlock conditions

Named so the shelf has a label, not just dust:

1. **Demand evidence** — a real corpus performing whole-directory
   reparents, at a rate that makes the gesture worth its mechanism.
   `scripts/survey-reparent.ts` and `scripts/survey-unread.ts` answer
   this for any Hugo corpus; the bar is a project where the number is
   not six-in-eight-years.
2. **The page-less hole becoming reachable another way** — if any
   gesture other than a section move can strand an unread subtree, the
   manifest is owed regardless of demand, because the hole would then be
   open rather than hypothetical.

Either one takes the charter off the shelf. Neither is true today.

## The capability-flip sweep, pre-enumerated

Every string that becomes false the day this builds, collected now so
the build has a checklist rather than a search (the two-lies lesson):

- `moveLabel.ts` — the `subsection` sentence, both halves.
- `moveLabel.ts` — the `leaf-bundle` sentence, including "There's no way
  around this one".
- `moveLabel.ts` — the `capability` sentence's "Not in this version".
- `hugo.ts` — the `leaf-bundle-move` warning's "Move the whole directory
  by hand".
- `hugo.ts` — both `no-index-file` details, which decline the case of a
  directory that already exists on disk.
- `validate.ts` — D4's rejection sentence and its redistribution
  guidance.
- `guards.ts` — `TopicMoveRefusal`, which loses two of its four members.
- `e2e/flows2-4-manipulation.spec.ts` — the refusal assertions for
  `subsection` and `leaf-bundle`.
- This note's status line, and docs/16's designed-absence table.

## Validation invariants, for the build that does not happen yet

- **Path-multiset conservation extends to manifest paths.** Nothing
  gained, lost or duplicated — the half-moved-directory catcher.
- **Directory-set comparison between writers**, now in
  `receipt-move-patch.sh`, extended to cover created and removed
  directories rather than only retained ones.
- **Determinism**: `entries()` is unordered, so a plan built from it must
  sort before emitting, and the property test is that two plans over the
  same tree are byte-identical.
- **The absence test on content reads**, above.

## Open questions

### Must settle before implementation

None. Everything the charter listed was settled by measurement: names
over counts by the scan's own enumeration, completeness by the storage
arithmetic, page-less subtrees by corpus inspection, the decomposition
and its ordering law by experiment, and the build itself by the demand
figure.

### Settle during implementation

- **Whether the manifest is stored flat or nested.** Both measured;
  nesting saves 54.7% of a number too small to matter, and flat is
  simpler to compare. Decide against a real diff view, not in advance.
- **Where the FSA recursion sorts.** `entries()` is unordered and the
  plan must be deterministic; whether the sort belongs in the walker or
  in the planner is a code-shape question best answered with both in
  front of you.
- **Whether `images/`-shaped roots deserve a mention in the Overview
  panel.** They are page-less subtrees no card contains, which is a
  legible fact about a folder and might belong in docs/17's surface
  rather than nowhere. Out of scope here; noted so it is not lost.
