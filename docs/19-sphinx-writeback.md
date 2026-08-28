# 19 — Sphinx write-back (phase 2) — design

> **STATUS [2026-08-17]: BUILDING.** Sequencing steps 1–4 are shipped on
> `docs19-writeback`. The amendments dated 2026-08-17 below were taken
> DURING that build and supersede the text they sit under.

docs/12 shipped the reader and encoded read-only by OMITTING
`planChanges`. This note un-encodes it.

It covers docs/12's phase 2 (plan, moves-only) and the part of phase 3
that follows from it. Renames are examined and deferred with a reason,
not inherited as deferred.

## Opening state

Four corpora, and the split between them is load-bearing, so it is
declared before any number: **the block census is parse-independent** —
it comes from `scanToctrees` over raw bytes and never resolves a
docname — while everything under "what the reader produces" was
**re-measured after the 2026-08-17 hotfix set** and would have encoded a
defective reader before it.

### Parse-independent — the block census

Provenance: `scripts/survey-toctree.ts`, importing the shipped scanner
so the census cannot measure a regex the product does not run. Its own
absence test is that a loose `\.\.\s+toctree::` marker count equals the
scanned block count on all five corpora.

| corpus | `.rst` | carriers | carrier % | blocks | entries | 1-block % | tail→EOF % | mid-file | `:glob:` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **godot** | 1,596 | 63 | 3.9 | 103 | 1,703 | 79.4 | **85.7** | 9 | 0 |
| cpython | 557 | 49 | 8.8 | 61 | 528 | 89.8 | 87.8 | 6 | 0 |
| **kernel** | 3,989 | 417 | 10.5 | 552 | 3,944 | 88.5 | **76.7** | **97** | **7** |
| ansible | 405 | 46 | 11.4 | 65 | 478 | 91.3 | 71.7 | 13 | 8 |
| blender | 2,374 | 372 | 15.7 | 525 | 2,354 | 80.6 | 94.9 | 19 | 4 |

**godot is the REFERENCE corpus** — conventions, paint checks,
continuity with the phase-1 baselines. **The kernel is the HAZARD
corpus** — mid-file locks, glob locks, an 11-block carrier,
translations, and the only scale that hurts.

The nav layer is concentrated everywhere: carriers are 4–16% of files.

### Parse-dependent — what the reader produces [post-hotfix, 2026-08-17]

| corpus | sections | placed | kept | locks | evidence |
| --- | --- | --- | --- | --- | --- |
| **godot** | 6 | 515 | 64 | `atomic` 1 | — |
| cpython | 1 | 528 | 51 | `reference` 1 | duplicate-reference 1 |
| kernel | 8 | 3,640 | 410 | `reference` 42, `pattern` 18, `atomic` 1, `external` 1 | duplicate-reference 42 |
| ansible | **0** | **0** | 2 | — | **root-document-absent 1** |
| blender | 3 | 2,347 | 372 | `reference` 24, `pattern` 4, `missing` 4 | missing-document 4, duplicate-reference 10 |

> **[rider, 2026-08-17]** This row was to be recorded NOT MEASURED —
> blender's domain sits outside the sandbox allowlist and no mirror was
> known. It turned out to be measurable after all: the census clone
> reached it, so the honest entry is the measurement rather than the
> refusal. **Provenance differs from the other four and is stated
> because of it** — godot, the kernel and the two scratch clones are
> durable checkouts, while blender was read from a session-local clone.
> Re-running this row needs the clone rebuilt; `scripts/survey-toctree.ts`
> carries the command.

**godot is the control**: unchanged at its phase-1 baseline through
every fix in the hotfix set. cpython was **16 rows, all `missing`**
before it. Ansible produces no nav and now says why.

## What the hotfix set found, and why it comes first

Write-back on a reader that mis-imports amplifies rather than ships:
a planner faithfully rewrites entry lines derived from a nav that was
never real. **A writer inherits its reader's lies.** So the four defects
found while surveying for this note were fixed before it was written.

| | | disposition |
| --- | --- | --- |
| suffix stripping | CPython writes `.rst` on 526 of 526 entries; Sphinx strips it, we did not | **FIXED** |
| `anyTopicLocked` | the AI relocated locked rows the drag refuses to move | **FIXED** |
| guardrail 3 | the sidecar's plan/save filter has no call site | **staged, not broken** — tripwire |
| `source_suffix` shapes | three legal shapes; the regex read one, and a comment could empty a document | **FIXED**, eight-shape fixture set |
| root document absent | ansible symlinks its root at build time | **FIXED** — evidence, not silence |

Two of these were **correct by coincidence** and that is the more
dangerous class: the kernel's multiline dict `source_suffix` was read as
EMPTY and fell back to `.rst`, which is what the kernel declares first.
Nothing looked wrong. It surfaced only because the evidence line the
convention required started firing on a corpus that should not have
produced one — the enforcement loop finding its own senior case.

## The region: `navTail`, and why the name survives its test

docs/15 gave the snapshot a region model with one member, `navHead` —
byte 0 through the closing front-matter fence, exclusive of its
terminator. Sphinx needs the mirror, and it is not a clean mirror.

**Two-sentence test.** *"A `navHead` is the file's front matter — the
bytes before the body."* / *"A `navTail` is the file's trailing toctree
run — the bytes after the body."* Same use, opposite ends. The name
passes.

**But the regions are not the same shape**, and the note says so rather
than letting the symmetry imply it: a `navHead` is entirely nav, while a
`navTail` is *mostly* nav and must reproduce the rest verbatim.

### The boundary law, settled by entry coverage

The obvious definition — a trailing RUN of blocks separated only by
blanks — is wrong for the reference corpus. godot's dominant idiom is
`heading + toctree`, repeated: `tutorials/2d/index.rst` has five blocks
with section headings between them. Under the strict rule, one editable
block per carrier.

Measured both ways, **on the shipped scanner** — one implementation, one
count, no tolerance:

> **[amended 2026-08-17, at build] THIS TABLE IS RETIRED.** It was taken
> by a session-local harness that did not survive — the committed-scripts
> convention broken in the one place it was written down, and caught by
> trying to reproduce it. The count of record is now
> `scripts/survey-navtail.ts`, which measures THROUGH `navTailOf`: a
> census and a product that disagree is not a thing that can happen,
> because there is one rule and the survey reads it.
>
> | corpus | entries | STRICT | SPAN (shipped) |
> | --- | --- | --- | --- |
> | **godot** | 1,703 | 404 — 23.7% | **1,597 — 93.8%** |
> | cpython | 528 | 370 — 70.1% | 389 — 73.7% |
> | kernel | 3,944 | 2,862 — 72.6% | **3,003 — 76.1%** |
> | ansible | 478 | 335 — 70.1% | 335 — 70.1% |
>
> **The decision does not move**: 24% against 94% on the reference
> corpus, which is what the retired table said. kernel SPAN reproduces
> at 3,003 exactly.
>
> **Deltas stated rather than smoothed.** godot and cpython land within
> two entries of the retired SPAN figures. Ansible does not reconcile —
> retired 255→368, measured 335→335 — and its multi-block carriers have
> essentially no heading-interrupted gaps, so a +113 SPAN gain over
> STRICT is not producible under any reading that could be
> reconstructed. The retired row is the less trustworthy of the two: it
> is not reproducible and this one is.
>
> **[extended 2026-08-17] THE REACH FIGURES ARE RETIRED TOO, and they
> are the THIRD ansible figure from this provenance that does not
> reproduce.** The rider gives `ansible_index` 294 documents and
> `core_index` 214, and "choosing `ansible_index` leaves 111 of 405".
> Measured through the shipped walk, on the same commit (`528974f3`):
>
> | candidate | rider | shipped | leaves |
> | --- | --- | --- | --- |
> | `ansible_index` | 294 | **336** | 69 of 405 |
> | `core_index` | 214 | **227** | 178 of 405 |
>
> Neither reading of the closure reproduces the rider — counting all
> docnames gives 350 / 241, counting only those that exist gives
> 336 / 227 — so the gap is not the same-units question. The pattern is
> now the finding rather than the discrepancy: godot and cpython
> reproduce EXACTLY under every measurement this build took (1,594 and
> 528 for reach; 6/515/64 and 1/528/51 for parse), and ansible has
> failed to reproduce three times from one harness. The DECISION each
> figure supported is unaffected — two top-level candidates, named
> correctly, ranked by a walk that two independent corpora validate.
>
> The picker's e2e pins measured reach values so the label cannot drift
> again without a red test.

> **The control that says the survey is honest** is the mid-file count,
> which comes from the INDEPENDENT block census committed under
> `scripts/data/toctree-census/`: 9 / 6 / 97 / 13, matched **4 of 4**.
> Two implementations, one number, no tolerance.

> **[resolved 2026-08-17]** A first pass used an independent scanner and
> disagreed with the shipped one by under 2% — 0 / 2 / 10 / 10 entries.
> That was recorded as a stated weakness and it should not have been:
> **two implementations producing one count admit no tolerance**, and a
> reconciliation property would have turned the gap into a test failure
> later, at a worse moment.
>
> Diagnosed rather than bounded. **Every** disagreement was an entry
> beginning with `../` — `../RCU/index`, `../howto/argparse.rst` — which
> the independent scanner discarded as a comment. `..` followed by a
> slash is a relative docname, not a comment marker. The shipped scanner
> was right and the probe undercounted; godot agreed exactly only
> because it contains no `../` entries. The table above is recomputed on
> the shipped scanner and the decision does not move.
>
> Worth keeping because it happened twice independently in one session —
> a subagent caught the identical defect in its own first pass and said
> so. A rule that reads "a line starting with `..` is a comment" is
> wrong in exactly one way, and RST puts that way in the middle of real
> corpora.

**The strict rule ships an adapter that cannot edit 78% of the corpus it
was designed against.** So:

> **The `navTail` runs from the first directive of the trailing
> SEQUENCE to EOF, where a sequence may be interrupted by a section
> heading.**

**Headings inside the region are owned as LABELS.** They are what makes
the sectioning idiom legible — a captioned block and a heading-labelled
block are the same authoring intent — and the region reproduces them
verbatim.

> **[amended 2026-08-17, at build] PROSE TERMINATES THE SEQUENCE.** This
> paragraph used to end: *"carriers with other prose inside the span are
> 7 / 2 / 15 / 1 — those carriers lock with the list committed, the same
> disposition as mid-file blocks"*. That was a SECOND RULE bolted beside
> the boundary law, and the law already had the answer. A sequence may
> be crossed by blanks, inert markup and headings; prose is none of
> them, so prose ENDS the sequence, and the region is the last maximal
> sequence reaching EOF.
>
> Blocks above the prose lock individually as `outside-region`, and the
> run below them stays writable. It buys back 60 entries on godot and
> 265 on the kernel, every one of them in a document whose trailing run
> was never in doubt. Subjects listed per corpus under
> `scripts/data/navtail-census/`.

### The region's stated complement

A file whose last block does not reach EOF has no `navTail` at all. Its
entries are **locked, disclosed with the per-corpus list** — 9 / 6 / 97
/ 13 / 19, committed under `scripts/data/toctree-census/`. Never a fixed
count: the 16-files framing was per-corpus arithmetic, and this project
has paid for that twice in one afternoon.

## Patch mechanics — three inherited expectations, inverted

Tool semantics by experiment, per the `--unidiff-zero` lesson. Each
finding below states its exact header and outcome, so it is reproducible
from this note alone.

> **The harness is session-local, and committing it is a step-8
> obligation.** `sphinx-experiments.sh` — 587 lines, read-only outside
> its own scratch directory, verified deterministic across two runs —
> lives in a scratchpad and will not survive this session. It ports to
> `scripts/receipt-sphinx-tail.sh` on `receipt-move-patch.sh`'s shape
> (`mktemp -d` plus a cleanup trap, no absolute paths), and it lands
> with the adversarial pass, exactly as docs/16's receipt did. Named
> here rather than linked, so this paragraph is not a pointer at a
> ghost.

**1. There is no tail preamble, and writing one would be a lie.** The
brief expected tail creation to mirror docs/18's D1 — no owned leading
anchor, therefore the flagged class. Measured, the flag requirement
belongs to the **`-0` START-LINE position**, not to the absence of an
anchor:

| header | default `git apply` |
| --- | --- |
| `@@ -0,0 +1,6 @@` (top) | **refuses**; `--unidiff-zero` accepts |
| `@@ -6,0 +7,6 @@` (EOF append) | **accepts** |

Identical payload, identical file. So `isHeadPrepend` has **no analogue
at the tail**, and a phase-2 patch mixing tail edits with tail creations
applies under plain `git apply` (measured). Emitting a preamble for it
would put a lie in the bytes — and `receipt-move-patch.sh`'s
flagged-direction assertion would catch it, which is the receipt
working.

**This sharpens D1's rationale rather than contradicting it.** D1's
class was never "no owned anchor"; it was "a hunk anchored at position
zero". The tail is the far end of the same file and needs nothing.

Canonical EOF append: `@@ -L,0 +L+1,K @@`. Measured against every
plausible candidate — `+L` inserts before the last line, silently.

**2. The EOF terminator is part of the context contract** — a docs/15
corollary, and the mirror of its CRLF lesson. On a file whose last line
lacks `\n`, git emits `\ No newline at end of file`, and stripping it
makes git **refuse the hunk** — even when the edit never touches the
last line, because the marker attaches to the trailing CONTEXT line.
A writer that tracks only "did I touch the last line?" gets it wrong.

Worse, an additions-only append onto an unterminated file is accepted
and **silently wrong**: the payload's leading `\n` is consumed as the
missing terminator, so the blank separator between prose and directive
disappears. The rule: **a tail writer must know whether the file ends
with a terminator, and lead with two newlines when it does not.**

**3. GNU patch is not atomic across entries** — docs/18 D2's second,
independent receipt. With the destination missing, `patch -p1` leaves
file A edited and writes `b/index.rst.rej`; `git apply` refuses the pair
in both directions, all 44 entries or none. **A cross-file toctree move
is multi-entry by construction** (docs/12: "a topic moving between two
files edits both"), so this is not an edge case here — it is the common
case. D2 retired the recommendation for renames; this retires it for
plans.

## Move semantics

A move relocates an **entry line** between blocks, possibly in two
different files. There is no file relocation and no directory: Sphinx's
`reparentMovesFiles: false` already carries the reasoning, and it is
true of phase 2 exactly as of phase 1.

**Nothing breaks that a link index would count.** `:doc:` and `:ref:`
resolve by DOCNAME, which a move preserves — so a cross-toctree move
produces no broken references, and the `linkIndex` "no species declared"
row stays honest rather than being filled with zeros. **Slug rename is
what would break them**, and it stays out of scope: it changes the
docname, so every `:doc:` reference to it goes stale. One sentence, so
it is never absorbed into "move".

**Insert position** is nav order within the target block. **Plan shape**
is two entry-line edits, both `region: "navTail"`, in one plan; Review
renders it as one row — *"moves entry 'foo' from Guides to Tutorials —
2 files"*.

> **[clarified 2026-08-17, at build]** One row for the GESTURE, ABOVE
> the file rows, not instead of them. Review's job is to show what will
> be written to disk, and a summary replacing the file list would hide
> the answer to the question the dialog exists to answer. Collapsed and
> says so, not collapsed instead of.
>
> The grouping is DECLARED by the planner
> (`CollectionPlanResult.entryMoves`), never inferred by the dialog: two
> `edit` changes are halves of one gesture and only the planner knows
> it. `EntryMove` is deliberately not `FileChange`'s `move` kind — that
> one says A FILE changes path, this one says AN ENTRY changes card
> while no file moves at all.

**Relative resolution**, with the receipt the convention requires:

> "Relative document names (not beginning with a slash) are relative to
> the document the directive occurs in, absolute names are relative to
> the source directory."
> — sphinx-doc.org/en/master/usage/restructuredtext/directives.html

The prose is ambiguous about directory-vs-document; the implementation
is not. `docname_join` pops the base document's own basename, so
resolution is against its DIRECTORY — matching the shipped
`resolveDocname`. **A moved entry must be rewritten for its new
containing document**, which is the one place a move edits the line's
TEXT rather than just its position.

> **[added 2026-08-17, at build] BLOCK REORDER IS A DESIGNED ABSENCE.**
> A Sphinx card IS a toctree block in the root document, so reordering
> cards means reordering blocks and adding one means creating a block.
> Neither is an entry-line move, so both are refused —
> `section-set-changed` and `interleaved-blocks`.
>
> **The unlock is named.** Moving a block means moving its heading label
> with it, and a heading belongs to the block below it only by
> CONVENTION — nothing declares the relationship. A `:caption:` does
> declare it, so captioned-only block reorder is the smallest honest
> version of this feature. Inferring the label from a neighbouring
> heading would be grouping by invented category, which is the one thing
> this project refuses.

## `:hidden:` — display, not navigation

The Hugo `no_list` trap one level over, and it needed the receipt for
exactly that reason.

`note_toctree` never reads `hidden` — hierarchy registration is
unconditional — while `_resolve_toctree` suppresses only the inline
list at the directive's location. So a hidden toctree **is** navigation.

**And the arithmetic decides it, not the semantics.** All 6 of godot's
root blocks carry `:hidden:`, and they ARE the entire sidebar. An
adapter reading `:hidden:` as "not nav" imports the reference corpus as
an **empty document** — every branch dropped, which is the
shape-fidelity law's exact failure.

> **Position, not percentage.** `:hidden:` is 1.4% of blocks across four
> corpora and 100% of godot's root navigation. The percentage measures
> the wrong thing. A flag's weight is where it sits, not how often it
> appears — and this is the general form of the lesson `no_list` taught
> by count.

Entries inside a hidden block are ordinary nav and fully editable.

## The refusal set, Sphinx-native

The Hugo refusals do not transfer. There are no directories in this plan
shape, so `leaf-bundle` and `subsection` have nothing to describe — say
so rather than leaving a reader to wonder which four reasons apply.

| refusal | why | subjects |
| --- | --- | --- |
| **globbed block** | `:glob:` generates entries from a pattern; there are no entry lines to edit | 15 across four corpora, listed |
| **mid-file block** | no `navTail`; the region cannot be anchored | 9 / 6 / 97 / 13, listed |
| ~~**prose inside the span**~~ | **[amended 2026-08-17]** NOT a refusal: prose ends the sequence, blocks above it lock as `outside-region`, and the run below stays writable | 7 / 3 / 15 / 1 carriers, listed |
| **MyST fenced toctree** | deferred with a recognizer, never silently unsupported | **0 in all four corpora** |
| **include-routed block** | file-of-record ≠ page-of-display would break splice targeting | **0** — measured both directions |

**`:glob:` is rare, not zero, and the earlier "unused in practice"
claim is formally corrected here.** 7 kernel files, 8 ansible, 4
blender.

**MyST has zero corpus coverage, and that is a caveat rather than a
result.** The recognizer must be verified synthetically. It cannot key
on `.md` presence — godot has 8 `.md` files and zero MyST, so that
heuristic false-positives on the one corpus of the four that has any.
It keys on an actual `{toctree}` fence, `myst_parser` in `extensions`,
or `.md` in `source_suffix` — which is now readable in all three of its
declared shapes, and was not before the hotfix set.

## Locks: what each kind PROMISES

The must-consider, settled by measurement.

The interim law from the hotfix is: a locked row may not change parent;
its position among its own siblings is not refused. Making that the law
requires answering whether any lock kind is a claim about ORDER.

| kind | what it promises | about position? |
| --- | --- | --- |
| `atomic` | "I did not descend; this subtree is N deep" | no — about SIZE |
| `reference` | "this is a second listing; another is primary" | no — about IDENTITY |
| `pattern` | "this line is a pattern, not a docname" | no — about SYNTAX |
| `external` | "this target is outside the project" | no — about TARGET |
| `missing` | "this target does not exist" | no — about TARGET |

> **[added 2026-08-18, polish-glyphs] The promises above now have a
> RENDERING LAW: one glyph slot, two tiers.** The row's mark is a
> per-kind SHAPE in the right margin (`view/canvas/lockGlyphs.ts`,
> each shape commented with its promise from this table), and the tier
> decides its tone:
>
> | tier | kinds | tone | meaning |
> | --- | --- | --- | --- |
> | **error** | `missing` — only `missing` | the warning token | the CORPUS needs fixing |
> | **state** | `atomic`, `reference`, `pattern`, `globbed`, `outside-region`, `external` | quiet monochrome | the app's EDITING MODEL has a boundary here |
>
> **The membership test: does this mean something in the FILES should
> change?** (`model/locks.ts`, unit-tested by that question's name.)
> A target that does not exist is the only yes — the same "fault
> rather than decision" docs/12 identified — and painting a state in
> the warning token would spend the error tier on a boundary.
>
> **The error tier gets a SECOND DOOR**: a warning glyph on a row with
> no panel line behind it is a finding with one door, so `missing`
> emits its own attention line in the Overview (docnames as subjects),
> and above-prose entries emit a carrier-grouped attention line —
> hidden-via's shape, the hub-page actionable list. Block counts are
> NOT derivable from the model (adjacency does not reveal block
> boundaries), so that line counts entries and files, never blocks.
> The text chips this replaces are recorded, with their retirement,
> in docs/12's row-treatment table.

**None is about position.** And the measurement makes the cost of
guessing otherwise concrete:

| corpus | locked rows | cards holding one | **parents a reorder-refusal would freeze** |
| --- | --- | --- | --- |
| godot | 1 | 1 of 6 | 1 |
| **cpython** | 1 | **1 of 1** | 1 |
| kernel | 62 | 5 of 8 | **30** |

Refusing reorder would make **cpython entirely un-reorganizable** — it
has one card and that card holds a `reference` row — and would freeze 5
of the kernel's 8 cards. **Settled: parent change refused, sibling order
allowed**, on both the promise analysis and the blast radius.

### The globbed-block conflation, and the boundary it needs

`classify(target, globbed)` returns `pattern` for EVERY entry in a
globbed block, so a plain docname sitting in one is marked a pattern.
Two referents under one name — **"this line contains a glob"** and
**"this line lives in a globbing block"** — and only the second is true
of all of them.

The split ships with the boundary stated, because the two ideas belong
to different layers:

> **A block lock is ENFORCEMENT. An entry kind is LABELING.**

Whether an entry can be edited is a property of its BLOCK — a globbed
block generates its entries, so none of them is a line the planner may
rewrite, and that refusal is answered once, for the block. What an entry
IS — a glob pattern, an external URL, a dangling target — is a property
of the LINE, and it exists to tell the reader what they are looking at.

Collapsing them made the block's enforcement wear the line's vocabulary,
which is why a plain docname acquired a description that was false about
it while the refusal it was standing in for was true. After the split,
the block carries the lock and the entry carries its own kind, and a
plain docname in a globbed block is exactly that: unremarkable, and
uneditable for a reason that has nothing to do with it.

## Orphans

Orphanhood is **two facts, and the classifier sorts them differently** —
which is the amendment this note took at its gate, because the first
version got one of them wrong.

**Membership — "is this docname in the nav?" — is Tier 1.** Recomputable
from the kept snapshot alone: running the closure over the 64 kept keys
reproduces the full 1,594-doc closure exactly. It works because hosts are
recorded before the atomic threshold is tested, so `classes/index.rst` is
kept with all 1,163 of its entries. Storing it would be storing a
derivation.

**The COUNT of orphans is Tier 2, and it is evidence.** This is where the
first draft slipped. It reasoned that the closure is recomputable and
stopped there — but an orphan count is `files_on_disk − closure`, and the
snapshot holds no file list. **A derived count inherits the tier of its
LEAST-AVAILABLE term.** One recomputable operand does not make the
expression recomputable, and "the closure is a selector" is true and
irrelevant to it.

So: **`parse` emits the orphan docnames as Tier-2 evidence at import**,
where the read set is in hand and the subtraction is answerable exactly
once. The Overview renders the stat from that evidence, provenance
stamped **"as of import"** — the `LinkIndex` pattern, for the same
reason and with the same honesty about what a stored observation can
claim.

**The fences fold into that provenance rather than sitting beside it.**
Both of the things the earlier draft fenced separately are properties of
an observation made at a moment:

- the equality that makes the closure recomputable is a CORPUS property,
  not an invariant — it holds because exactly one file under `classes/`
  hosts a block and that file is kept;
- where it fails, an unread host's children are invisible to the walk,
  so a naive recompute would report them as orphans.

Stamped as evidence, both are covered by one sentence the count already
has to carry: it is what the import saw, of the documents the import
read. The degradation is then automatic rather than special-cased — a
corpus that breaks the property yields a count qualified by the
unread-host number recorded next to it, which is a narrower claim,
stated, instead of a confident wrong one.

godot has **2 orphans**, not the 7 docs/12 records (arithmetic on a stale
total; corrected there). **Four populations look like "not reached" and
only one is an orphan**: 2 orphaned, 1,078 behind the atomic boundary
(collapsed and says so, count on the card), 454 read then discarded,
1,884 never candidates.

**Orphans are not focusable**, because focus targets a row on the canvas
and an orphan has none — so the honest affordance is a STAT, not a link.
**Adding an orphan to a toctree is a designed absence**: it needs a
surface for rows that have no card, the same missing surface docs/18
named for page-less subtrees.

## Rider — the root-candidate picker

**Ships with the phase-2 build, at step 6; not before.** Ansible's
writers are in scope, and today they get a correct refusal that reads
like a broken app.

This is the `root-document-absent` evidence line **growing an
affordance** — the same shape as the language door, where a disclosure
that named a fact became a control that acted on it. The evidence-only
behaviour ships unchanged until then.

### The derivation, corrected by measurement

The proposed rule was: files that HOST a toctree but appear as an ENTRY
in no other file's toctree. Run against the real corpus it yields
**six**, not two:

    ansible_index · core_index · dev_guide/ansible_index ·
    dev_guide/core_index · roadmap/index · roadmap/old_roadmap_index

The extras are real and correctly found — `dev_guide/*` is the same
build-time symlink one level down, and the `roadmap/*` pair are genuinely
unreferenced hosts — but they are not candidates for *the document
`root_doc` was supposed to name*. **Restricting to TOP-LEVEL docnames
reproduces the expected pair exactly**, and behaves on every corpus:

| corpus | unreferenced hosts | top-level candidates |
| --- | --- | --- |
| **ansible** | 6 | **2 — `ansible_index`, `core_index`** |
| godot | 2 | 1 — `index` |
| cpython | 1 | 1 — `contents` |
| kernel | 9 | 1 — `index` |

Top level is principled rather than convenient: `root_doc` resolves from
the source root, so a nested unreferenced host is a sub-root or an orphan
host, and either way it is reached THROUGH whichever root is chosen.

**REACH is the picker's label**, and it falls out of the same walk —
the size of each candidate's closure. `ansible_index` reaches **294**
documents, `core_index` **214**. It also validates the derivation
independently: godot's `index` reaches 1,594, which is its measured
closure exactly, and cpython's `contents` reaches 528, its entry count.

### The surface

    Root document "index" not found.
    2 candidate roots detected — choose one to import:
      ansible_index   294 documents
      core_index      214 documents

The chosen candidate becomes the import's root. **The choice is
SESSION-LOCAL** — an import parameter, never persisted config, because a
deviation from what the repository declares must not self-perpetuate
(docs/16's alias-toggle reasoning, same direction).

**One candidate still ASKS.** Never auto-adopt: the config declared
something else, and silently substituting is inventing a default. Zero
candidates leaves today's line unchanged.

**The substitution is named in the disclosure** — *"root:
`ansible_index` — chosen; declared `index` absent"* — so the Overview
and any export carry the provenance rather than presenting a chosen root
as a found one.

### The un-chosen tree, stated rather than discovered

Choosing `ansible_index` leaves **111 of 405 `.rst` files** outside its
closure, and they will surface in the orphan evidence. That is correct
and it is going to look alarming, so the disclosure pre-empts it in one
sentence: **"documents reachable only from other roots appear as
orphans."**

This is also why the orphan count is evidence rather than a selector —
it is a fact about what THIS import read, under THIS root, and the
picker makes the root a per-import choice. The provenance stamp was
already carrying that weight before the picker existed to need it.

### Fixtures

- The **ansible slice** imports through the picker path.
- A **candidate-derivation unit test** on a synthetic multi-root project,
  including the nested twin that top-level restriction must exclude.
- **e2e drives the picker once**, choosing the smaller tree so the
  orphan disclosure is exercised too.

## Permissions and the AI

**Verified by execution, not by reading** — the D4 lesson.

`fileMovesAllowed` returns TRUE for Sphinx without the toggle:
capability true (no `supportsReparent` declared), `reparentMovesFiles`
false, so the permission never gates. A topic moving between two
sections PASSES with the toggle off, with a Hugo control refusing the
identical proposal in the same run. **Neither the prompt nor the payload
preview needs a Sphinx line** — the existing shape covers it.

The section-demotion net does not fire for Sphinx, correctly: it gates
on `movesFilesOnReparent`. **But the consequence is unguarded** — a
demoted section produces a topic with `path: undefined`, because every
Sphinx section is built pathless, and a toctree entry line must name a
docname. The Sphinx-shaped refusal is **"a block is not an entry"**, and
it is owed at the same layer.

## Fences

- **No body reads beyond the parse that already reads blocks.** Phase 2
  adds no read.
- **No stored bodies**, unchanged.
- **The tail region claims only owned bytes.** Leading prose is never
  context — the zero-context experiment is the boundary's receipt.
- **MyST: recognizer plus deferral**, never silent unsupport.
- **Generated-content seams** — kernel-doc directives, ansible plugin
  docs — are parse-time facts and get a hazard row, no new machinery.

## Hazards

| hazard | disposition |
| --- | --- |
| **TAB-indented block bodies** | `indentOf` counts a tab as 1 char; docutils expands to 8, so `emitEntry` rewrites `"\ttest"` as `" test"` — **silent byte corruption** in a file docs/12 promised not to touch. 14 blocks, 13 kernel files. Latent today because nothing calls `emitEntry`; **it goes live the day write-back does**, which is why it is build step 1 |
| generated root document | ansible symlinks `index.rst` at build time; disclosed as evidence |
| unreadable config shapes | reported even when the fallback is right |
| `:class:` and other unlisted options | preserved verbatim, inert to the model |
| kernel translations | parallel RST trees under `translations/zh_CN/…`; the language-door pattern transfers unchanged, keyed on the convention rather than on config. **Phase-2 rider, build optional** |
| 11-block carriers | the sectioning idiom; see below |
| `:maxdepth:` / `:numbered:` / `:titlesonly:` | display options, preserved verbatim |

## Multi-block carriers and the container question

The sectioning idiom is real: `admin-guide/index.rst` ×11,
`ansible_index.rst` ×10, godot's root ×6. Ordered labelled blocks within
one parent is exactly the container/chains shape.

**But the label is not always there, and that decides it.** ansible's
×10 captions every block; godot's ×6 captions every block; **the
kernel's ×11 captions none of them.** A container needs a declared
label — `ContainerDescriptor.label` — and `:caption:` is the only
declaration available. Inferring one from a neighbouring heading would
be **grouping by invented category**, which this project refuses.

So: **containers where `:caption:` declares them, headings-as-labels
inside the region otherwise, and no inference between the two.** Nothing
prevents a collection adapter from declaring containers — verified by
building a container-bearing document from real `parse()` output and
driving `lintContainers`, `emptiedContainers` and `cardChainRefusal`
over it. Emptying a captioned block is the dissolution analog and
`mayEmpty` reads for it directly.

## The capability-flip copy sweep

Every phase-1 string that becomes false the day this ships, enumerated
now so the build has a checklist:

- `registry.ts` `supportsWriteBack` — the mechanism itself, and its only
  consumer, `Header.tsx`'s disabled Review-changes button.
- The disabled-button reason: *"Restructuring stays on the canvas for
  now — writing back to Sphinx files arrives with phase 2."*
- `sphinx.ts` `supportsRename: { sections: false, topics: false }` and
  every affordance it grays.
- docs/12's own status lines: "phase 1 shipped (read-only)", "Nothing
  writes back yet", the sequencing block's phase list.
- `docs/08`'s Sphinx entry and `CLAUDE.md`'s index line.
- This note's status line.

## Validation invariants

- **Entry multiset conservation** across any plan, except entries the
  user removed — a fast-check property, docs/12's, unchanged.
- **Byte-identity outside managed lines**, per file, not per plan.
- **Round-trip and idempotence**: no edits → empty plan; re-planning a
  patched snapshot returns `[]`.
- **Tab fidelity**: a block whose body is tab-indented re-emits
  byte-identically. The regression the hazard names.
- **Terminator fidelity**: a file with no trailing newline still has
  none after a tail edit.
- **Differential oracle**: FSA result ≡ patch-applied result, extended
  to the directory set per docs/18's D3.
- **Absence tests**: no plan names the sidecar key (the guardrail-3
  tripwire, already in place); no read of any file outside the parse.

## Fixtures plan

- **Synthetic project** exercising every region shape: tail-to-EOF,
  heading-interrupted sequence, prose-in-span (locked), mid-file
  (locked), globbed (locked), tab-indented body, no trailing newline,
  explicit titles, external URL, self-reference, absolute docname.
- **godot slice**, extended from docs/12's, as the reference-corpus
  continuity check.
- **kernel slice** — new, and the hazard corpus earns it: a mid-file
  carrier, a globbed block, a tab-indented body, and one multi-block
  captionless carrier.
- **cpython slice** — the suffix-form entries, so the hotfix stays
  fixed against real bytes rather than only against inline snapshots.
- Prettier-ignored, gitattributes `-text`.

## Sequencing

1. **Tab fidelity in `indentOf` / `emitEntry`**, with the 13-file kernel
   list as its fixture. First, because every later step writes bytes
   through it.
2. **The `navTail` region**: boundary law, splice targeting, terminator
   rule; `FileRegion` gains its second member.
3. **`planChanges`, moves-only** — the refusal set, entry-line
   rewriting for the new containing document, simulation.
4. **Cross-file moves** as one plan; Review's move row.
5. **The Sphinx-shaped AI refusal** ("a block is not an entry") and the
   evidence `subject` threading that makes parse observations focusable.
6. **Write-back**: Save-to-folder, the capability flip and its copy
   sweep, `supportsWriteBack` true. **Plus the root-candidate picker** —
   it rides here because root resolution is already being touched.
7. **Renames**, or their deferral confirmed — explicit-title form,
   never an H1 edit.
8. **Adversarial pass**, target named: tail splice × EOF-newline ×
   cross-file two-edit plan × both writers, with a corpus paint check on
   godot across both generations. **Ports `sphinx-experiments.sh` to
   `scripts/receipt-sphinx-tail.sh`** — the harness that decided the
   three inversions above, currently session-local.

## Separators — the rule, and where it came from

> **[added 2026-08-17, at build]** The note did not cover interior blank
> lines, and they are load-bearing: 48 blocks across four corpora split
> their entries into visual groups that way, including godot's own
> `index.rst` (25 entries in two groups) and cpython's `contents.rst`
> (16 in two). Contiguous re-emission would have deleted every one.

**A separator OPENS A GROUP, so it is anchored to the entry that FOLLOWS
it.** Three clauses, each with a case in `receipt-sphinx-tail.sh`:

- It **travels with its entry** within the block. A reorder that left
  group markers at fixed line numbers would scramble a grouping the
  author chose.
- It **never leaves the block**. A separator is a fact about how THIS
  block is grouped; carrying it into another block — or another file —
  imports a grouping decision that block's author never made, one blank
  line at a time.
- It **never lands first**. The blank between the option run and the
  first entry belongs to the options.

And a separator is BYTES, never a count. Stored as a boolean it could not
say how many blanks there were, and the kernel's `arch/arm/index.rst`
puts TWO after `pxa/mfp` — one file out of 450 regions, found by the
corpus and by nothing else.

## Renames — DEFERRED, with the reason and the unlock

> **[settled 2026-08-17, at build, step 7]** Deferred. `supportsRename`
> stays `{ sections: false, topics: false }`, so the affordance is grayed
> rather than offered and the AI validator refuses a rename before a paid
> call produces one.

**Topic renames are deferred because the divergence is invisible in the
app that causes it.** The serialization is the explicit-title form,
`Title <docname>`, which sets the TOCTREE LABEL and nothing else — the
page's own H1 is untouched, and docs/12 already ruled out editing it
(a body is not ours, and the region model is built on that). So a rename
here makes the sidebar and the page disagree, permanently and silently.
Many docs teams treat that as a style violation and some lint for it.
Shipping a control whose consequence the user cannot see from inside the
app is the ambiguous affordance this step was told to refuse.

**The unlock is a DISCLOSURE, not a capability.** The app already reads
every document's H1 — `titleOf` does it to label the row in the first
place — so it can show both the entry label and the document title, and
say which one a rename changes. Once the divergence is visible at the
moment it is created, the affordance stops being ambiguous. That is a
smaller piece of work than the rename itself.

**Section renames are a DIFFERENT question and the note did not separate
them.** A Sphinx card is a toctree block and its title is the block's
`:caption:` — a nav option line, inside the region, with no H1
counterpart and therefore no divergence at all. Editing an existing
caption is the cleanest write in the whole adapter.

But it splits in two, and only one half is clean:

- **A captioned block**: rewrite the `:caption:` line. Pure nav, in
  region, reversible, nothing else changes.
- **An UNCAPTIONED block**: there is no line to rewrite, so renaming
  means ADDING `:caption:` — which makes a group heading appear in the
  sidebar where none was before. That is a rendering change dressed as a
  rename, and the user asked for a rename.

**Flagged rather than decided**, per the note's own instruction: shipping
`{ sections: true, topics: false }` for captioned blocks only would be
defensible and would leave uncaptioned cards grayed for a reason the UI
would have to explain per-card. That is a product call about how much
inconsistency is worth the capability, and it is not one to make inside
a build step.

## Step-8 riders — named, not dropped

> **[settled 2026-08-17, at build]**

**The differential oracle's DIRECTORY SET (docs/18 D3) is vacuous here,
and that is the finding rather than an omission.** docs/16's receipt
compares the two writers' directory sets because a Hugo move relocates
files and an emptied directory is a real outcome. A Sphinx move
relocates an ENTRY LINE — `reparentMovesFiles: false`, true of phase 2
exactly as of phase 1 — so no file is created, deleted or moved by any
plan this adapter produces, and there is no directory set to compare.
`receipt-sphinx-tail.sh` asserts the stronger property instead: the two
writers agree on the WHOLE TREE, byte for byte, which subsumes the
directory set and would also catch a file appearing that should not.

**Kernel translations: DEFERRED, and the FIRST reason given here was
wrong.** It said the language set is a filesystem convention, so building
a door on `translations/zh_CN/…` would be grouping by invented category.
That is false, and the corpus says so in one line:

    Documentation/index.rst:124     Translations <translations/index>
    Documentation/translations/index.rst
        .. toctree::
           zh_CN/index  zh_TW/index  it_IT/index  ja_JP/index
           ko_KR/index  pt_BR/index  sp_SP/index

The set is NAV-DECLARED — seven languages, in a toctree, reachable from
the root. Nothing would have to be inferred from a directory name.

**The real reason is that the door solves a problem Sphinx does not
have.** Hugo's language door exists because Hugo keeps PARALLEL CONTENT
TREES and an import picks one, so the siblings are off-canvas and need a
way back. The kernel's translations are inside the same toctree graph:
`translations/index` is an ordinary entry, its languages are ordinary
children, and they are already imported and already on the canvas. A
door that reopened them would open what is open.

So this is a DESIGNED ABSENCE rather than deferred work, and the
distinction matters — deferred work implies a gap someone should close.
The unlock, if the shape ever appears, is a Sphinx project that builds
its translations as SEPARATE PROJECTS with their own `conf.py`, which is
the arrangement the kernel does not use.

## `outside-region`, and a quadruple that read wrong

> **[added 2026-08-17]** Reported once as "46 / 294 / 48 / 0" in the
> order godot, KERNEL, cpython, ansible — which is not this note's table
> order, and the note's order is the one a reader applies. Read as
> **godot / cpython / kernel / ansible**, that quadruple gives cpython
> 294 outside-region rows against 139 non-editable entries in total,
> which is impossible. A presentation defect caught by arithmetic on the
> published numbers, which is exactly what publishing them is for.
>
> **In this note's order — godot, cpython, kernel, ansible:**
>
> | corpus | entries | editable | non-editable | outside-region ENTRY LINES | PLACED rows locked |
> | --- | --- | --- | --- | --- | --- |
> | godot | 1,703 | 1,597 | 106 | 46 | 46 |
> | cpython | 528 | 389 | 139 | 48 | 48 |
> | kernel | 3,944 | 3,003 | 941 | **302** | **294** |
> | ansible | 478 | 335 | 143 | 33 | **0** |
>
> **The last two columns are two different quantities and the kernel
> proves it.** Entry LINES in out-of-region blocks is a file-level count;
> PLACED rows carrying the lock is a model-level one, and they differ by
> 8 because lock precedence puts `reference` and `missing` ahead of
> `outside-region` — a duplicate listing in an out-of-region block is
> labelled for what it IS, not for where it sits. Ansible's 33 against 0
> is the same distinction at its limit: the lines exist in the files, and
> no document is placed at all because the root is absent.
>
> Stating them as one number would have been the house failure mode
> again, one column later.

## The instrument tally

Every defect this build found, and which instrument found it. The
pattern is the finding: **not one came from the unit suite**, and the
unit suite was green at every point.

| defect | found by |
| --- | --- |
| `indentOf` counts a tab as 1 char — byte corruption AND a droppable subtree | reading the corpus for the hazard row |
| a separator stored as a boolean loses a double blank (`arch/arm/index.rst`, 1 of 450 regions) | corpus fixpoint over four checkouts |
| both writers truncate a suffix region to the region (`region !== "navHead"`) | a test written because widening a union is the dangerous direction |
| `applyChanges` ignores `region`, so simulation validated a straw man | three plan tests failing at once |
| a row dropped under a page with no toctree CRASHES the planner | e2e, on an ordinary pointer path no fixture had constructed |
| a card reorder writes a wrong plan under the right captions | a probe written to check a suspicion |
| `\ No newline` on shared context joins two entries onto one line | `receipt-sphinx-tail.sh`, on its first run |
| the corpus paint check passing in 3.9s on the wrong quantity | asserting scale, because the speed looked wrong |

Two instrument defects of my own, recorded because they fail in the
directions that hide things: a batch mutation harness reported a
surviving guard as KILLED (a false kill certifies coverage that is not
there), and the corpus check's first scale assertion compared the
SECTION count against 400 — it went red, which looked like the guard
working, and it was measuring the wrong number.

## Open questions

### Must settle before implementation

None. The one must-consider — per-lock-kind reorder semantics — is
settled above by measurement and by what each kind promises.

### Settle during implementation

- **Where the `navTail` splice re-anchors on save.** docs/15 splices the
  head at byte 0; the tail's anchor is EOF, and whether the writer
  re-finds the region by scanning or by offset is a code-shape question
  best answered with both in front of you.
- **Renames.** The explicit-title form is the serialization and docs/12
  already ruled out touching an H1. What is unsettled is the
  H1-vs-sidebar divergence a docs team may treat as a style violation —
  a conversation this note opens rather than closes.
- **The kernel translations rider.** Parallel trees transfer the
  language door unchanged; whether phase 2 ships it or names it is a
  scope call, not a design one.
