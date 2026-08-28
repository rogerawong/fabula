# 16 — Reparenting (cross-directory topic moves) — design

The first post-v1 note, reserved since docs/14 Decision 4.

## Why this note exists

Hugo v1 ships reorder and rename. It refuses the gesture the corpus most
wants: **move a page to another section.** SIG-Docs restructures are
cross-section by nature — the survey below counts **577 cross-directory
moves** in kubernetes/website since 2018, arriving in bursts of 141, 168
and 80 — and every one of them is a drag this app answers today with a
`not-allowed` cursor and a sentence.

That refusal was correct for v1 and it is fully built: capability flag,
executor guard, drag-time message. This note designs the unlock.

It earns a number rather than a pull request because its centerpiece —
what happens to inbound links when a file moves — was described in
docs/14 as a collision between two things this project believes: *minimal
honest moves* and *the snapshot owns the nav, not the file* (docs/15).
Resolving that by reflex is how a core law gets quietly widened.

The collision turns out to be smaller than it looked, and in a direction
nobody predicted. Both halves of docs/14's framing were wrong, and the
survey is what found it.

## Groundwork: what is already built

Costed before designed, per **absent ≠ unbuilt**. The estimate behind
"docs/16 is a quarter of work" assumed the capability did not exist. It
exists twice.

### The two guard axes

| axis | predicate | executor | drag layer | capability | AI validator |
| --- | --- | --- | --- | --- | --- |
| topic parent change | `guards.ts:52` `topicReparentRefused` | `execute.ts:98,145` | `topicDrag.ts:203` | `registry.ts:116` | `validate.ts:466` |
| card into another chain | `guards.ts:68` `cardChainRefused` | `execute.ts:297` | **re-implemented**, `cardDrag.ts:203` | — | — |

The topic axis is whole: one predicate, four consumers, its own
fast-check-adjacent test file (`commands/__tests__/reparent-capability.test.ts`),
and a shipped message. **Nothing in the topic axis needs building.** What
v2 changes is one boolean and one planner.

**Flag — `guards.ts` keeps its own law on one axis only.** The file opens
"the predicate lives here and both callers import it". True for topics.
`cardChainRefused` has exactly one importer — the executor. The drag
layer's `reparentRefusal` (`cardDrag.ts:203`) re-composes `accepts` +
`wouldEmptyContainer` itself and **omits the third clause**
(`!doc.containers → refuse`). There is no live defect: `classifyDrop`
returns `reorder` when a document has no chains, so the missing clause is
unreachable. But it is two implementations of one rule inside the file
written to prevent exactly that (the sidebar hole), and this note
elaborates the consent surface on both axes, so it inherits the
divergence. **Fold `cardDrag.reparentRefusal` onto `cardChainRefused`
during sequencing step 1** — boolean from the predicate, sentence
composed beside it, the shape the topic axis already has.

### Reparenting already ships, in two different plan shapes

Only Hugo declares the flag. Every other adapter defaults to `true`, and
two of those defaults are load-bearing rather than incidental:

| adapter | `supportsReparent` | reparent plan shape | receipt |
| --- | --- | --- | --- |
| DocFX, MkDocs | absent = true | whole-file nav re-serialize | format adapters |
| Mintlify | absent = true | whole-file, **plus the chain guard** | `guards.ts:68` |
| **Just the Docs** | absent = true | **front matter only** — `parent` / `grand_parent` / `ancestor` rewrite with child cascade, **no file moves at all** | `jtd.ts:410–466` |
| **Docusaurus** | absent = true | **`FileChange kind:"move"`**, plus a generic links-may-break warning | `docusaurus.ts:749`, `:795` |
| Hugo | **false** | refused | `hugo.ts:1117`, `:939` |
| Sphinx | absent = true, no `planChanges` | phase 2: nav-only entry-line edit | `sphinx.ts:10` |

**`false` is a BIRTH STATE, not a fixed property.** It is where a
membership-is-path adapter starts — the honest answer while its planner
cannot yet move files — and docs/16 is the transition out of it. Hugo
was the only occupant, so flipping it leaves the stage empty: no shipped
adapter answers `false` today. The mechanism stays, because it is the
contract point where the NEXT such adapter declares which side it is on,
and the tests keep a fixture adapter registered in the real registry so
the stage is exercised between occupants. Registered rather than mocked
— the property under test is the wiring from `doc.formatId` through the
registry to the executor, and a mocked capability proves only that the
mock works.

Three consequences the note is built on:

1. **`FileChange.move` is not novel and "never delete" is not violated by
   a first-class move.** Docusaurus has shipped it since docs/11.
2. **Membership-is-path is what costs.** JTD stores parentage in front
   matter, so its reparent is a metadata edit and breaks nothing. Sphinx
   stores it in an explicit toctree, so its reparent moves an entry line
   between two files and breaks nothing. Hugo — and Docusaurus — store it
   in the directory tree, so a reparent moves the file, and the file's
   path is its URL. **Link breakage is the price of membership-is-path,
   not a property of reparenting.** It is Hugo-and-Docusaurus-specific
   among shipped adapters, and the capability table above is where a
   future adapter declares which side it is on.
3. **Docusaurus already has this exact problem and answers it with a
   generic warning** (`"N file(s) will move — doc IDs and relative links
   are not rewritten"`). Whatever this note decides, that warning is its
   first back-port, not a separate feature.

### The fifteen references

Every existing `docs/16` pointer, and how this note discharges it:

| where | claim | disposition |
| --- | --- | --- |
| `CLAUDE.md:36` | "reserved … the only unwritten number" | superseded — in design |
| `CLAUDE.md:96` | drag refusal was one call site short | satisfied; quoted above |
| `docs/08:268` | centerpiece is the docs/15 collision | **partly superseded** — see "the false constraint" |
| `docs/08:327` | structure propagation is docs/16+ territory | satisfied — still out of scope, reasoned below |
| `docs/14:336` | `FileChange.move` already exists | satisfied |
| `docs/14:397` | full messaging ships with the docs/16 consent surface | satisfied |
| `docs/14:406` | reparenting scheduled here | satisfied |
| `docs/14:482` | lineage: don't delete the v1 refusal UX | satisfied — v2 **elaborates**, never replaces |
| `docs/14:605–665` | Decision 4 in full | **two corrections**, below |
| `docs/14:686` | new sections unblock together | satisfied |
| `docs/17:508` | "Broken links: N" is docs/16's import-time index | satisfied — designed below |
| `formats/types.ts:49`, `collections/types.ts:147`, `hugo.ts:792`, `:839`, `:939`, `:948`, `:1113` | code pointers | satisfied; `:1113` corrected |

## Survey

`scripts/survey-reparent.ts`, committed. Working tree from
`~/k8s-website` at `6449f1e`; history from a blobless clone (63,643
commits, 2018-05-05 →) because every reference corpus here is a depth-1
clone and a depth-1 clone answers "no page has ever moved", which is
false and convincing.

### Move demand — the gesture is real, and it is lumpy

948 renames, deduplicated across two detection passes: **577
cross-directory moves** (reparents), 368 filename-only changes (slug
renames — a different operation, see the conflation guard), 3 both.

    2018  141   2021   81   2024  168
    2019   58   2022   19   2025    5
    2020   27   2023    1   2026   80 (YTD)

Restructures arrive in bursts and go quiet for a year. This matters for
the consent surface: the user of this feature is not making one move, they
are making forty in an afternoon. **Anything that costs a modal per move
costs forty modals.**

> **A SECOND CONSUMER, 2026-08-20 (docs/21 arc 2).** The pinned-drag seam
> reuses this note's consent surface whole: the drop label states the
> consequence in the user's terms before the release ("→ needs your hand
> — pinned (above prose)", its own line beside the destination and the
> inbound count, because a truncation wrapper holds one line), and the
> refusal sentence names the actual obstacle plus the way round it. The
> forty-modals measurement above is the reason the seam asks ONCE PER TAB
> rather than once per move, and the reason a multi-row drag raises one
> seam that counts rather than one per pinned row. This note's number is
> what that ruling rests on.

### Link anatomy — the corpus is made of one species

| species | links | in files | resolved | what a move does to it |
| --- | --- | --- | --- | --- |
| absolute `/docs/…` | **5,796** | 1,166 | 5,419 | **silent 404** |
| `{{< ref >}}` | **2,583** | 102 | 2,570 | **build FAILS** |
| relative `.md` | **0** | 0 | — | — |
| relative directory | 221 | 112 | 0 | generated kubectl only |
| anchor-only | 1,185 | 188 | — | nothing |
| external | 2,671 | 760 | — | nothing |

Three findings that shape everything after:

- **The hand-authored species is the absolute site path**, and it is
  regex-harvestable with 93.5% resolution. There are zero relative `.md`
  links in this corpus; all 224 `.md`-suffixed links point at GitHub.
- **99% of `ref` shortcodes live in `reference/kubernetes-api/`** —
  machine-generated API reference. Nobody drags generated reference pages
  around a canvas.
- **`ref` breakage is loud.** Hugo's docs: *"By default, Hugo will throw
  an error and fail the build if it cannot resolve the path"*
  (`gohugo.io/methods/page/ref/`). The species this app cannot help with
  is the species that already shouts. Absolute paths are the silent one,
  and they are the ones we can count.

### Inbound edges — and the arithmetic of storing them

8,002 resolved in-corpus edges. **717 of 1,678 pages (43%) have at least
one inbound link**; median 4, p90 24, max 388.

A per-target index costs **40 KB** counts-only, **56 KB** with ≤20
exemplars stored as path indices, 223 KB stored naively as paths.

> **[amended 2026-08-16]** These are the SURVEY's estimates and only the
> first survived the build: measured, the shipped index is 43 KB
> counts-only and **155 KB as stored**. The estimate and the measurement
> also count different populations — the survey's 8,002 edges and 717
> linked pages are over all 1,678 content files, while the index targets
> the 593 pages of the LOADED tree and draws sources from every body
> read. Neither number is wrong; they answer different questions, and the
> measured one is in "Evidence storage" below with its method. The
kept snapshot for this corpus is 445 KB against `MAX_TOTAL_BYTES` of
3 MB — **2.6 MB of headroom.** The index fits with two orders of
magnitude to spare, and it is bounded by construction (one entry per
page, ≤20 exemplars each), not by a cap someone has to remember.

### The join, and the control that saves it from being a lie

Of cross-directory moves since 2023 whose target still exists, 30% have
inbound links today. **That number is worthless without the control**,
and the control inverts it: the recent-move population is 96% generated
reference churn — `reference/setup-tools` 99, `reference/kubernetes-api`
77, `reference/kubectl` 64. It measures how linked generated pages are.

The population this feature serves is **prose**, and it looks nothing
alike:

| cut | n | ≥1 inbound link |
| --- | --- | --- |
| a page picked at random | 1,678 | 43% |
| cross-directory move, any, since 2023 | 251 | 30% |
| **cross-directory PROSE move (outside `reference/`)** | **103** | **92%** |
| moved before 2023, still present | 111 | 95% |

**92%, median 6 inbound, 760 edges at risk.** That one number decides two
of the three options below, in opposite directions.

### The price of rewriting, stated as what it would do

Rewriting inbound links for those 103 prose moves means editing the
**bodies of 297 distinct files — 18% of the corpus**. Per single move:
median **5** other people's pages, maximum **29**.

### Aliases — the charter's premise was backwards

docs/14 Decision 4 states this corpus has `disableAliases = true` "so
Hugo's own redirect mitigation is off for exactly the community this
adapter targets". **`disableAliases` does not disable aliases.** Hugo's
documentation:

> This setting only prevents the generation of the physical HTML files;
> the `Aliases` method on a `Page` object remains available for use in
> your configuration templates.

And kubernetes/website does exactly that: `hugo.toml:106` declares a
`REDIRECTS` output format, and `layouts/index.redirects` iterates
`$page.Aliases` and emits `<alias>  <permalink> 301` into a Netlify
`_redirects` file. The setting is a signal that redirects moved
server-side, not that they were switched off.

Five public Docsy sites checked: kubernetes/website and istio.io set
`disableAliases = true` **and both pair it with a redirects output
format**; falco-website, kubeflow/website and docsy-example leave it
unset, so Hugo's own alias stubs apply. **Aliases work on 5 of 5.**

The redirects template also *errors the build* on five conditions, which
is a gift — it is a specification for a planner:

| the template refuses | can we check it at plan time? |
| --- | --- |
| alias containing whitespace | trivially |
| alias equal to the page's own permalink | yes — we compute both |
| alias colliding with a real page's permalink | yes — the snapshot holds every page path |
| alias colliding with another page's alias | **yes — aliases are front matter, so they are in the nav heads we already keep** |
| alias crossing localizations | yes — the language partition is known |

All five are answerable from data the snapshot already owns. No new
reads, no new storage.

### Bundles — what a move has to carry

1,678 content files: 173 branch bundles (`_index.md`), **4 leaf bundles**
(`index.md`), 1,501 plain pages, 6 `.html`. Of 60 non-content files under
`content/en/docs`, exactly **one** sits inside a leaf bundle; 42 are a
bundled tutorial app and the rest are strays. Images in this corpus are
referenced by absolute site path (`/images/…`) and live in `static/`, not
as page resources.

So the resource-travel problem is real in Hugo generally and nearly
absent here — which is a reason to **refuse the case rather than
engineer it**, and to say so.

## Move semantics

### The conflation guard, applied before anything else

"Move" is about to become a name in three places (a gesture, a
`FileChange`, a plan line). Two-sentence test, run now:

- **Move** = a topic's PARENT changes; its filename is preserved.
  `tasks/foo.md` → `concepts/foo.md`.
- **Slug rename** = a topic's FILENAME changes; its parent is preserved.
  `tasks/foo.md` → `tasks/bar.md`. **Out of scope.** It is a URL change
  with no structural meaning, the canvas has no gesture for it, and the
  survey counts 368 of them — a real operation this note deliberately
  does not build. Naming it here is what stops it being absorbed into
  "move" by a later reader who notices both emit `FileChange.move`.
- **Cross-language move** = a page changes language tree. **Out of
  scope**, one sentence: sibling-language documents are independent
  documents (docs/14), nothing in the current contracts spans two, and
  the redirects template errors on an alias that crosses localizations.
  Cross-document operations are the structure-propagation item in
  docs/08, unchanged by this note.

The predicate the executor already enforces is **parent-topic-unchanged**,
not directory-unchanged, and it stays that way: nesting a page under a
sibling in the same folder moves the file just as surely as dragging it to
another card (`guards.ts:44–51`).

### What v2 moves, and what it refuses

| gesture | v2 | why |
| --- | --- | --- |
| topic (plain page) to another card | **moves** — one `FileChange.move` | the whole point |
| topic to a new card | **moves** — `create` the `_index.md`, then move | docs/14 settled item 5: they unlock together |
| topic that is a **leaf bundle** (`index.md`) | **refused, with reason** | its directory holds resources the app never read; moving the page alone strands them |
| topic that is a **subsection** (`_index.md`) | **refused, with reason** | it represents a DIRECTORY, so moving it is the card move deferred two rows below — same designed absence, reached through a different gesture |
| **card** (section) to another card | **designed absence** | a directory move, whose contents include files outside the snapshot |
| slug rename | absent — no gesture exists | above |

The leaf-bundle refusal is **derivable from the snapshot** — a leaf
bundle is a page whose basename is `index.md` — so it needs no new stored
data. That is the whole reason to draw the line there rather than at
"directories containing unread files", which would need an evidence
channel built to answer one refusal.

**Card moves are deferred, not forgotten.** Moving a section means moving
a directory, and a directory's membership includes files `ingestible()`
filtered out before any adapter saw them. The honest version needs the
driver to retain per-directory unread-file counts — bounded and cheap,
but it is a second evidence channel serving one predicate, and topic
moves deliver the marquee gesture without it. Recorded as the successor,
with its unlock named, so it is not re-derived as a small feature.

> **[discharged 2026-08-17 — the successor is `docs/18`, and it is a
> DEFERRAL]** Written, measured, and deliberately not built. The
> evidence channel this paragraph asks for turns out to be free — the
> scan already enumerates every entry while filtering, so the manifest
> is names rather than counts at zero new I/O — and the obstacle is not
> the mechanism at all: kubernetes/website has SIX in-TOC whole-directory
> reparents in eight years and none since 2019-06-12, while the
> restructure that took `setup/` from fifteen entries to five scores
> ZERO directory moves, because real reorganizations REDISTRIBUTE pages.
> That is the gesture this note shipped.
>
> So the row above stays a designed absence, its charter parked whole in
> docs/18 with unlock conditions named, and the refusal gains a second
> sentence pointing at the gesture that works.

### Weight at the destination

docs/14's ordering law extends without amendment: weight ascending,
**unweighted last**, then `linkTitle`/`title`, then path.

- The moved page **gains or adjusts its own weight** to express the
  position it was dropped at, computed from its new neighbours by the
  same gap arithmetic intra-card reorder already uses.
- **Untouched neighbours stay byte-identical.** Only when no gap exists
  does the plan renumber, minimally, and every renumbered file is listed
  in the plan as its own line.
- **The all-unweighted destination is the case that bites.** Dropping
  into a section where nothing carries a weight, at any position other
  than first, forces weights onto pages that had none — because a
  weighted page sorts before every unweighted one. That is a real,
  disclosed, multi-file edit and the Review dialog must show it as such,
  not fold it into "1 file changed".

### Path collision

A move whose target path already exists is refused. It is knowable at
**drag time** — the destination directory and the filename are both in
hand — so it takes the existing refusal channel and a specific sentence,
not a plan-time surprise. The plan-time check stays as the invariant
(`blocking`), the drag-time check is its costume, exactly as
`topicReparentRefused` is today.

URL collision without path collision (via `slug:`) is checked at plan
time only: it is rare, and 7 pages in this corpus set a slug.

## The centerpiece: link handling

docs/14 posed three options. The survey retires one constraint, kills one
option, demotes another to a floor, and adds a fourth that only became
visible once the alias premise was corrected.

### The false constraint, retired

docs/14 and docs/08 both say detecting inbound links "requires reading
bodies, which the snapshot deliberately does not own". **The app already
holds every body at the moment it would need to.** `toNavHeads` is
applied *inside* `parse` (`hugo.ts:748`), so `parse` receives whole file
contents and chooses what to keep. A link harvest there reads nothing
new, costs no I/O, and touches no law.

The read budget is unchanged by it. Correcting docs/14's figure while
here: the "33% and 23%" it cites are `content/en/docs` (34% / 23%), not
"the whole k8s site". Whole-site, all languages, is **68% of
`MAX_READ_FILES` and 46% of `MAX_READ_BYTES`**; English-only is 50% /
35%. The claim survives; the headroom is half what the note says.

**This makes the three-way split on body reads explicit**, because "no
body reads" already failed the two-sentence test once — it meant both
"the snapshot stores no bodies" and "the app never looks at a body", and
only the first is a law:

| who | when | body reads |
| --- | --- | --- |
| survey scripts | any time | **yes** — output is a number in a note, not a mechanism |
| the app | at import, inside `parse` | **yes, already** — the bytes are in hand; harvesting is free |
| the app | at move time, or on demand | **never** — re-reading would be drift detection wearing a hat, and would make the answer depend on disk state the app does not own (docs/15) |

The two names, split: **no stored bodies** (docs/15's law, unchanged) and
**no post-import body reads** (this note's fence).

### Option 1 — rewrite inbound links: REJECTED

Recorded with its cost rather than dropped in silence.

| what it needs | what it costs |
| --- | --- |
| `FileChange.region` beyond `navHead` / whole-file | a new law, not a new flag — docs/15's ownership model exists precisely to say the app owns nav, not prose |
| a resolver good enough to rewrite, not just count | 93.5% resolution is fine for a count and unacceptable for an edit; the 6.5% residue becomes silent corruption of other people's pages |
| edits to files the user did not touch | **297 distinct files, 18% of the corpus**, for the 103 measured prose moves; median **5** files per single move, max **29** |

The third row is the argument. A tool whose "move one page" gesture
rewrites five other pages' bodies is not doing minimal honest moves; it
is doing a refactor and calling it a drag. **Rejected on cost, not on
feasibility** — and if it is ever revisited, it is a note of its own, not
an amendment to this one.

### Option 2 — gate the move on the link index: REJECTED

Two independent reasons, either sufficient.

**It would refuse 92% of real moves.** A capability that declines the
gesture nine times in ten is not a capability. The survey's prose cut is
the receipt: gating on "would this break a link" is gating on a condition
that is nearly always true.

**It would refuse on stale evidence, which is the sealed-law shape.** The
index records what was true at import. Bodies change after import — that
is not a bug, it is docs/15's baseline-is-not-a-mirror ruling working as
designed. A refusal citing an inbound count is a refusal claiming
authority the evidence cannot back, and the project already has the
receipt for what that costs (`sealed` / all-rows-locked / empty,
docs/13).

**Fence, with its absence test:** the link index may INFORM and may never
GATE. Prose cannot enforce that — the violating line is one line and
convenient. So: a test asserting no `blocking` warning is ever emitted for
a link-count reason, and a test asserting `guards.ts` and `execute.ts`
do not import the link index at all. Put both at the emission site.

### Option 3 — disclose and let git review catch it: ADOPTED AS THE FLOOR

Still correct, still free, still leaves docs/15 untouched — and on its own
it is now demonstrably insufficient. A generic "links may break" warning
that fires on **92%** of real moves carries no information; it is the
wallpaper failure the Overview panel was redesigned to avoid (docs/17).
Enforcement stays with version control, where it belongs
(`scripts/receipt-vcs-merge.sh`). Disclosure gets specific.

### Option 2.5 — alias-on-move: ADOPTED as the mitigation

Only visible once the alias premise was corrected, and it is the best
answer available:

**A Hugo alias is front matter.** It is inside the ownership law, on the
moved page's own file, in the same nav-head edit the move already makes
for its weight. Zero body reads, zero foreign files touched, zero new
`FileChange` kinds, zero new regions.

    ---
    title: Provision swap memory
    weight: 40
    aliases:
    - /docs/tutorials/configuration/provision-swap-memory/
    ---

**It repairs the dominant species outright.** 5,796 absolute site-path
links break because a move changes a page's URL; an alias restores the
old URL as a 301. Every one of those links keeps working — stale, but
working, which is exactly what a redirect is for.

**Applicability is FORMAT-SPECIFIC, and Docusaurus gets none of it.**
[recorded 2026-08-17, on landing step 7] The precondition for
alias-on-move is that the system reads a redirect key from the page's
OWN front matter — which is what keeps the mitigation inside docs/15's
ownership law. Hugo has ${B}aliases:${B}; Docusaurus has no equivalent, so there
is nothing to write and it ships INFORM with no mitigation.

That is **predicted, not a gap**. The survey's finding was that link
breakage is the price of membership-is-path, and nothing said the
REMEDY would generalise with the problem. A future adapter earns
alias-on-move by having such a key, not by being directory-shaped.

**It does not repair the other two**, and the note says so rather than
overselling: `{{< ref >}}` resolves by content path, not URL, so an alias
cannot help it — but 99% of refs are in generated reference and a broken
ref fails the build loudly. Relative `.md` links (zero here, common
elsewhere) break textually and aliases cannot help; they are what the
INFORM count is for.

**Plan-time soundness is fully checkable** against the five conditions
the redirects template errors on, all from the snapshot (table above).
An alias that would collide is not written and the move says why.

**Writing one needed a new verb, not a new law.** `FrontmatterEdits`
could only `set` scalars, and `aliases:` is a list that pages already
carry. So it gains `prepend`, kept DISTINCT from `set` because the
operation is a JOIN: folding it in would have made the alias write
silently retire whatever redirects a page already declared. Conservative
in the same way `set` is — an existing flow list or a scalar under the
same key is refused rather than reformatted, because rewriting a shape
this planner did not author is how a "minimal honest edit" stops being
either. Prepending an item already present is a no-op, which is what
keeps `planChanges(parse(apply(plan)))` empty and stops a duplicate
alias becoming a duplicate 301.

**Applicability.** Default **on**. Where `disableAliases` is absent or
false, Hugo generates the redirect itself. Where it is `true`, the
evidence from both real-world sites is that a redirects template consumes
the aliases — but the app cannot verify that, because `layouts/` is not
ingested. So the Review dialog discloses what was observed
(`disableAliases = true` in `hugo.toml`) and states that an unconsumed
alias is an inert front-matter key, never a broken one. The toggle lives
in **Review changes**, plan-level, not in the drag — one decision for
forty moves, per the burst finding.

### The decision, restated

**Alias-on-move as the mitigation, INFORM as the disclosure, git review
as the enforcement.** Option 1 rejected on cost, option 2 rejected on the
92% and on the sealed-law shape, option 3 kept as the floor beneath both.

## Evidence storage: the link index

docs/17's classifier is binding and settles the legitimacy question
without a new framework: **recomputable from the kept snapshot → Tier 1
selector; otherwise → Tier 2 evidence.** Bodies are gone after import, so
a link index is not recomputable. It is evidence: written once at import,
stored, bounded, provenance-stamped.

But it is **not `ImportOccurrence`-shaped**, and forcing it into that
type would be the conflation this project keeps paying for.
`ImportOccurrence` is per-kind with exemplars — "N files skipped, here
are 20". A link index is per-TARGET with counts — "this page has 12
inbound links, here are 20 of them". Different key, different arity,
different question.

    /** Inbound link counts observed at import (docs/16). Evidence, not a
     *  selector: the bodies it was derived from are not kept.
     *
     *  INFORMS, NEVER GATES. Bodies change after import; a refusal citing
     *  this would claim authority the data cannot back. See the absence
     *  tests beside the emission site. */
    interface LinkIndex {
      /** Which import produced it — every display of a count is stamped
       *  "as of import" from here. */
      observedAt: string;
      /** Species the harvester recognised, so a reader can tell what is
       *  NOT counted rather than reading 0 as "no links". */
      species: string[];
      /** Source paths, referenced BY INDEX from `targets[].from`. */
      paths: string[];
      /** target page path → inbound edges */
      targets: Record<string, { n: number; from: number[] }>;
    }

> **[amended 2026-08-16, ratified at the step-4 checkpoint]** The draft
> above wrote `from: string[]` while the prose beside it said sources
> "may be stored as indices", without saying into what. As built they are
> indices into the index's OWN table, added as `paths`.
>
> Indexing the snapshot's key order was the obvious alternative and is
> the wrong one: it silently repoints every exemplar the day anything
> filters the kept set, and a wrong exemplar looks exactly like a right
> one. It also turned out load-bearing rather than merely safer — see the
> sources-scope amendment below, after which a `from` can name a file the
> snapshot does not keep at all.

- **Bounded by construction**: one entry per page that has an inbound
  link; `from` capped at `MAX_EXEMPLARS` (20, the existing constant).
  No new cap constant, and per **`MAX_FILES` was removed, not resized**,
  no count cap is introduced without a measurement.

  > **[amended 2026-08-16, measured]** This bullet claimed "~170 KB worst
  > case for a 5,000-page corpus". **That figure is retired**, because it
  > was an estimate with no stated method and the build measures 155 KB
  > at 1,678 pages — 91% of the supposed worst case at a third of the
  > supposed size.
  >
  > The method, stated so the number can be re-derived:
  > `scripts/measure-link-index.ts` parses a corpus through the shipped
  > adapter and JSON-encodes `doc.extras.linkIndex`.
  >
  > | kubernetes/website | measured |
  > | --- | --- |
  > | targets | 593 pages with ≥1 inbound link |
  > | edges | 8,553 resolved link instances |
  > | counts only | 43.25 KB (the draft said 40 — close) |
  > | **as stored** | **154.95 KB** (the draft said 56) |
  > | naive paths | 338.68 KB (the draft said 223) |
  > | snapshot | 526 KB |
  >
  > Counts-only matched almost exactly, so the whole divergence is in
  > exemplars. It remains comfortable in absolute terms — snapshot plus
  > index is 681 KB against `MAX_TOTAL_BYTES` of 3 MB — but it is
  > comfortable BY MEASUREMENT, not by the margin the draft implied. A
  > budget stated without its method is a budget nobody can re-check,
  > which is the whole reason the survey scripts are committed.
- **Deterministic**: same input files → same index, so the fixpoint and
  idempotence suites cover it for free.
- **What counts as a source**: EVERY body the importer read, while
  targets stay pages of the loaded tree. Scoping sources to the nav root
  is the natural reading and it undercounts by 38% — 4,952 edges against
  the survey's 8,002, rising to 8,553 once widened. The reason is
  ordinary: a blog post linking into `docs/` breaks exactly as a sibling
  page does, and `content/en` holds `blog/` and `case-studies/` that the
  nav root excludes. A count that silently omitted them would understate
  the consequence of the very move it is shown beside.
- **Where it is computed**: a shared `collections/linkIndex.ts`, called
  from each adapter's `parse`, parameterised by the adapter's link
  species and its path→URL derivation. Hugo and Docusaurus derive URLs
  differently; the harvest loop is the same. This is what lets
  Docusaurus's generic warning become specific with no second
  implementation.
- **What it never holds**: link TEXT, anchors, or any body substring. It
  holds counts and source paths — and the snapshot already keeps every
  source path, so `from` may be stored as indices. **Guidance at the
  emission site, not only here:** the paths are already ours; the prose
  is not.

**Adapters without it are correct, not broken.** An adapter that omits
the index shows the generic sentence, exactly as today. `LinkIndex` is
optional and its absence is a legible state ("not measured"), never
rendered as zero — the `+K more` discipline of docs/17 applied to a
number that could otherwise lie by omission.

## Consent surface

**Elaborating the v1 refusal, never replacing it** (docs/14:482). The
`not-allowed` cursor, `dragStore.refusal` and the red pointer sentence
stay and gain company. Consent is in the gesture; there are no modals;
consequence-checkpointing belongs to Review changes (docs/13).

**At the drag.** Eligible cards and rows highlight. The label states the
consequence in Hugo's own terms and in the order the user cares about:

    → moves file to tasks/configure-pod-container/
      12 inbound links, as of import

Where the count is unmeasured the second line is absent, not zero. Where
the move is refused, the existing red sentence names which of the three
refusals applies (leaf bundle, subsection, path collision, capability
off).

> **[amended 2026-08-16] Four, not three.** The subsection refusal was
> added during step 6 after the corpus paint check dragged a real one
> ("Learning environment"). It was already being refused — every
> destination directory holds an `_index.md`, so the PATH check caught
> it — but with the wrong sentence: *"a page with this filename is
> already there"* sends the user off to rename a file, when the actual
> reason is that moving a section moves its whole directory and this
> note defers that. One name was serving two referents (a filename
> clash and a directory move), and a correct refusal for the wrong
> reason is still a wrong answer — it is the kind that costs the user
> an afternoon proving the tool wrong.

**Seam ambiguity does not arise here**, and that is worth stating rather
than importing Mintlify's seam menu by analogy. Mintlify's seams are
positions *between* adjacent chains where two readings are equally live.
A reparent target is a discrete card or row — the pointer is over one
parent or another. No menu, no release-time question.

**At the checkpoint.** Review changes renders a move distinctly:

    MOVED   content/en/docs/tasks/…/provision-swap-memory.md
         →  content/en/docs/tutorials/cluster-management/provision-swap-memory.md
            + alias  /docs/tasks/…/provision-swap-memory/
            12 inbound links, as of import — not rewritten

The alias line is a plan line, so it is reviewable and toggleable like
any other. Renumbered neighbours are their own lines. **Nothing is folded
into a count** — the collapse discipline from docs/17.

**Undo.** The canvas reparent is a pure model edit until save: Immer
patches invert it for free, and the toast names the move
(`Undo move "Provision swap memory"`). Disk consequence lives at save,
which is what lets the drag stay light.

**Paint check.** `PAINT_CORPUS=~/k8s-website pnpm paint-check` gains one
scripted cross-card move driven through plan → `.patch`, with an
occlusion-aware hit test on the drop label and the Review dialog's move
row — `elementFromPoint` at the element's centre, because presence
assertions verify that the code ran, which was never in doubt.

## New sections

Unlocked here, per docs/14 settled item 5: a new section's purpose is
receiving moves, so shipping one without the other produces a card that
exists and can never be populated.

Creating a section is `create` of `dir/_index.md` with a title and a
weight, plus the moves that populate it, in one plan. On the canvas,
dragging a topic to empty space creates a section instead of refusing.

## Structural permissions: two toggles, dependent not merged

**This supersedes the draft's "it rides on the same capability rather
than gaining a flag of its own".** That reasoning was sound where it was
written — a second *capability* with no independent producer would be
staged, not shipped (docs/13's **Decided ≠ built**) — and it smuggled a
conflation through anyway. A **capability** is what an adapter can
express. A **per-run permission** is what the user is willing to let one
AI call do to their disk. Those are two ideas, and `allowNewSections`
was about to serve both.

Two-sentence test on the merged version: *"Allow new sections lets the
model group topics under a heading it invented."* / *"Allow new sections
lets the model relocate files on disk."* The same checkbox, used
differently. Split before shipping.

### The motivating case, so the toggles have a face

Select the eight cards that grew organically over two years and prompt:
*"reorganize into as many or as few top-level headings as reasonable."*

That is the scenario sequencing step 6 exists for, and it is the one
where the two ideas visibly separate. The user wants a structural
opinion — maybe eleven sections become six. On MkDocs that is a nav
rewrite and costs nothing. On Hugo the identical request **moves several
hundred files**, and the user who typed "as few as reasonable" was
thinking about headings, not about `git status`.

### The two toggles

| toggle | meaning | shown | default |
| --- | --- | --- | --- |
| **Allow new sections** | the model may invent a grouping heading | always | preset-set (`presets.ts:29`+) |
| **Allow file moves** *(relocates files on disk)* | the model may change a topic's parent | **only on file-move plan shapes** — Hugo, Docusaurus | **OFF** |

The second is **named for its consequence, not its mechanism.** "Allow
reparenting" describes what the model does; "relocates files on disk"
describes what happens to the user. The capability table earlier in this
note is what decides whether it appears at all: nav-owned adapters
(DocFX, MkDocs, Mintlify, JTD, Sphinx) express a parent change as a
metadata or nav edit, so there is no disk consequence to consent to and
no toggle to show. **A toggle that is always on is a toggle that teaches
users to ignore toggles.**

`ReorganizeOptions` (`ai/contract.ts:30`) gains `allowFileMoves`.
**Presets do not.** The preset `defaults` block stays two-field
(`presets.ts:14`): presets are editable instruction templates, and a
template that silently re-enables disk moves is a preset with a side
effect. Off is the only default a run may inherit.

### The dependency

Dependent, not merged — the distinction the split exists to preserve.

- **On file-move adapters**: *Allow new sections* is
  **disabled-with-reason** until *Allow file moves* is on. A new section
  that cannot receive topics is the unpopulatable-card bug reborn, one
  layer up: docs/14 settled item 5 refused to ship half of it on the
  canvas, and shipping half of it in the dialog is the same defect
  wearing the AI's clothes.
- **On nav-owned adapters**: *Allow new sections* stays independent,
  exactly as shipped. Nothing about JTD or Mintlify changes.

The disabled state explains itself rather than hiding, per the
decision-5 precedent from docs/13 — the same treatment `ConfigureView`
already gives a rename it cannot express.

### What the validator keys on

Parent changes are gated on **capability ∧ per-run toggle**. The
capability answers "can this system record it"; the toggle answers "did
the user agree to it this time". Either one false refuses.

`validate.ts:466` currently reads `if (!reparentCapability(doc))`. It
becomes the conjunction, and the layer does not move — it stays the
Layer-5 safety net beside the multiset invariant, for the reason
recorded there: the prompt is advisory, and the three answers (drag,
planner, validator) have to be identical.

**Absence test** (fences get absence tests): *with the toggle off, a
proposal containing any parent change is rejected — regardless of
capability.* Asserted on an adapter whose capability is `true`, so the
test fails if the implementation ever collapses the conjunction back to
the capability alone. That is the exact regression the split exists to
prevent, and it is one `&&` away at all times.

### What the prompt must say — a gap this ruling exposes

`buildSystemMessage` takes `Pick<ReorganizeOptions, "allowRenames" |
"allowNewSections">` (`prompt.ts:14`). **It says nothing about parent
changes, on any adapter.**

So on Hugo today the model is told the outline grammar, told not to
invent sections, and then left to freely move topics between them —
which it will, because that is what reorganizing means. `validate.ts:466`
catches it and discards the whole result. The rejection is at least a
good sentence (*"try an instruction that reorders within each group
instead"*) rather than the self-blaming one, but it arrives **after** a
paid call, and the reparent net sits past the guided retry, so there is
no second attempt.

The principle, because it generalises past this one field: **a
constraint enforced but uncommunicated is a retry loop by design.** Any
rule the reconstruction rejects on and the prompt omits will be
discovered by the model at the user's expense, once per run, forever.
Enforcement and communication ship together or the feature is a slot
machine.

The toggle makes this unavoidable rather than merely wasteful: a
permission the user can flip per run has to reach the model, or the
dialog is offering a choice the request never carries.

That principle is why the never-empty hotfix shipped its prompt half at
the same time (`neverEmptyGroups` → the constraint block in
`buildSystemMessage`): containers are invisible to the outline, so
without the ids spelled out the model had no way to avoid the very thing
the new net rejects. The reparent constraint line is the remaining half,
and it lands with the toggle in sequencing step 6.

    - Do NOT move a topic to a different section. Reorder within each
      section only.

`buildSystemMessage` therefore takes `allowFileMoves` too, and the
constraint line is emitted whenever parent changes are refused —
**capability-off or toggle-off, the same line**, because the model does
not care which of the two refused it. Fixing this is worth doing even if
the rest of docs/16 never ships; it is a v1 Hugo defect that this note
found rather than caused.

### Section dissolution

"As few headings as reasonable" empties sections. What happens to the
emptied ones is a per-plan-shape answer, and the nav-owned half is
already built.

**Nav-owned formats: the section is removed.** `validate.ts:337–346`
already drops sections whose topics all left, counts them in
`emptyDropped`, and reports the total as `emptySectionsDropped`
(`:516`). Sealed cards are exempt, because a sealed card's emptiness is
its normal state and counting rows cannot tell the two apart (docs/13).
**This is shipped behavior and this note changes none of it.**

Container `mayEmpty` guards still apply — a Mintlify tab may never be
emptied, because `tabs.groups` carries `minItems: 1` in the schema and
the adapter declares the bearing array `mayEmpty: false`
(`mintlify.ts:469`, `:476`).

> **[amended 2026-08-16] They apply now.** When this paragraph was first
> written the sentence above was false: `wouldEmptyContainer` had **no
> call site anywhere in `src/ai/`**, so a proposal that drained a tab
> dropped its last card and exported `groups: []` against a `minItems: 1`
> schema, silently — reachable without any toggle, since cards carry
> their chains across a reorganize and topics do not. It was reclassified
> a live defect and hotfixed ahead of this note's build: `emptiedContainers`
> is now the one rule the drag path and reconstruction share, consulted
> as a Layer-5 net beside the multiset and parentage nets. **The claim
> "container `mayEmpty` guards still apply" is true as of that fix and
> was not true before it** — dated here rather than quietly corrected,
> because a sentence that becomes true is still a sentence that was
> wrong.

**Hugo: emptied sections PERSIST.** Files are never deleted, and a
section is a directory with an `_index.md`, so dissolution has nothing
to delete. The emptied section stays as a genuinely-empty card on the
canvas — which is honest, because the directory is genuinely still
there. Review changes carries one line:

    section emptied — directory retained
    content/en/docs/tasks/legacy-setup/

Deleting it is the user's act, on the git side, where deletion belongs.
This is the never-delete law producing a visible consequence rather than
a hidden one, and the empty card is the disclosure: a section that
vanished from the canvas while its directory survived on disk would be
the canvas lying about the file tree.

> **[investigated 2026-08-17 — reported as a two-writer divergence; did
> NOT reproduce]** The report: `git apply` rmdirs a directory it empties
> (measured — a hunkless two-file rename leaves no source directory), so
> "directory retained" is true of the folder writer and false of the
> patch. The measurement is correct and does not reach this path: a
> dissolved section keeps its own `_index.md`, so the directory never
> becomes empty and git never touches it. Verified directly.
>
> The sentence is UNCHANGED. The amendment was written and reverted —
> a downward amendment retires a promise, and retiring one that was
> actually kept costs more than the overstatement would have.
>
> What was real is the ORACLE. `receipt-move-patch.sh` compared
> `expected/`, materialised from an in-memory snapshot that has no
> directories, so a tree that kept an emptied directory and one that
> removed it serialised identically and `diff -r` called them the same.
> It certified "byte-identical" while structurally unable to compare the
> disputed thing. The directory set is asserted now, so this sentence is
> measured rather than argued.

Note the asymmetry is real and worth stating plainly: **the same AI
proposal leaves eleven cards on MkDocs and thirteen on Hugo**, and both
are correct. The plan shape is the reason, and Review changes is where
it is explained.

## Validation invariants

Property tests, not example tests.

- **Path-multiset conservation under moves.** The multiset of page paths
  after applying a plan equals the multiset before, with exactly the
  planned `fromPath`s replaced by their `toPath`s. No page gains, loses
  or duplicates a path. This is the docs/10 / docs/12 net, extended from
  entries to paths — and it is what catches a bundle half-moved.
- **Undo restores byte-identical export**, unchanged as the top-level
  law, now exercised over command sequences containing moves.
- **Idempotence across a move**: `planChanges(parse(apply(plan)))` is
  `[]`. Re-planning a moved corpus must propose nothing.
- **Untouched-byte identity**, extended: a moved file's bytes differ only
  in its nav head; a neighbour differs only if the plan lists it as
  renumbered.
- **Alias soundness**: for every alias a plan writes, the alias URL is
  not any page's permalink in the post-plan document, and not any other
  page's alias. Generated against the five refusal conditions.
- **Absence tests** (fences get absence tests): no `blocking` warning is
  emitted for a link-count reason; `guards.ts` and `execute.ts` do not
  import `linkIndex`; and **with `allowFileMoves` off, any parent-change
  proposal is rejected regardless of capability** — asserted on an
  adapter whose capability is `true`, so collapsing the conjunction back
  to the capability alone fails the suite.
- **No container is emptied by a proposal.** For every adapter declaring
  `mayEmpty: false` on a bearing array, a reconstruction leaving it with
  no cards is refused. This is the invariant the drag path already has
  through `wouldEmptyContainer` and the AI path currently lacks.

## Fixtures plan

- **Synthetic Hugo tree** extending docs/14's: two sections with gapped
  weights, one all-unweighted destination (the forcing case), a leaf
  bundle with a resource (the refusal case), a path-collision pair, a
  page already carrying `aliases:`, and a page whose alias would collide
  with a real permalink.
- **Real slice** from kubernetes/website — the
  `tutorials/configuration` → `tutorials/cluster-management` move the
  history actually contains, with its inbound links, so the index is
  tested against a real edge set rather than an invented one. CC-BY-4.0
  attribution and commit `6449f1e` recorded, per existing dirs.
- **Docusaurus fixture** reused unchanged, to prove the shared harvester
  serves two URL derivations.
- **Sphinx**: none. Phase 2's move is a nav-only edit with no link
  exposure; it belongs to docs/12's sequencing, not here.
- Prettier-ignored, gitattributes `-text`.

## Sequencing

1. BUILT — **Fold `cardDrag.reparentRefusal` onto `cardChainRefused`.** Pay the
   groundwork debt before adding a consumer to the same file.
2. BUILT — **`collections/linkIndex.ts`** — shared harvester, species-parameterised,
   with its absence tests, wired into Hugo's and Docusaurus's `parse`.
   Measured against both corpora before anything consumes it.
3. BUILT — **Hugo `planChanges` emits moves**: `supportsReparent: true`, path
   collision, leaf-bundle refusal, weight-at-destination including the
   all-unweighted case.
4. BUILT — **Alias-on-move**, with the five plan-time checks and the Review
   toggle.
5. BUILT — **Consent surface**: drop highlighting, labels, the three refusal
   sentences, Review's move row, undo toast. Paint check with the
   occlusion-aware hit test.
6. BUILT — **New sections and the structural permissions.** Create-plus-move
   plan; `allowFileMoves` added to `ReorganizeOptions` and to
   `buildSystemMessage` (the constraint line ships whether the refusal
   comes from capability or from the toggle); the two-toggle dependency
   in `ConfigureView`; `validate.ts:466` becomes the conjunction, with
   its absence test. Section dissolution: the Hugo disclosure line, and
   `wouldEmptyContainer` given its missing call site in the AI path.
7. BUILT — **Back-port to Docusaurus**: its generic warning becomes specific.
8. **Adversarial pass on the file-move save path** — BUILT.
   `scripts/receipt-move-patch.sh` + `emit-move-patches.ts`: ten
   scenarios through the shipped planner and both shipped writers, handed
   to real `git apply` and then compared against each other. The oracle
   is the OTHER WRITER, not a simulation.

### What the pass found [2026-08-17]

Three things, and only two were defects.

**Two arithmetic defects, fixed.** `""` counted as one line
(`"".split("\n")` is `[""]`), so an empty side looked like a file
holding a blank line and the differ deleted it. And a zero-length side
started one line too late: with a zero count the number names the line
AFTER WHICH content goes, so a top-of-file insertion is `-0,0`. Correct
counts were not sufficient — `@@ -1,0 +1,3 @@` has them and real
`git apply` refuses it. **That literal came from git, not from
reasoning**, which is the whole argument for running the receipt against
the tool that consumes the bytes. Both predate moves: a pure reorder on
CRLF files reproduces the first, and 142 bare pages in
kubernetes/website reach the second.

Mutation-checking the header arithmetic turned up two mutants surviving
the entire suite — deleting `- contextBefore` from either start changed
nothing anywhere, so nothing pinned where a hunk CLAIMS to begin. Now
pinned.

**One structural case, resolved by ADOPTING the zero-context mode.**
A page gaining front matter has no owned context to anchor against: the
head is empty, and the body is not ours to claim. `git diff` would
anchor such a prepend with the following body lines; we cannot.

The resolution is the documented unified-diff mode, not a refusal.
`@@ -0,0 +1,N @@` with additions only is a real mode with production
precedent — public-inbox generates zero-context patches for exactly this
class of anchorless change — and the cross-tool behaviour is why the
header is pinned literally in a test:

| header | `git apply --unidiff-zero` | GNU `patch` |
| --- | --- | --- |
| `-0,0` | inserts at beginning of file | inserts at beginning of file |
| `-1,0` | inserts at beginning of file | inserts AFTER line 1 |

`-1,0` is tool-divergent, so a regression into it writes the right bytes
in the wrong place under one of the two tools the patch itself
recommends. The test asserts the header, not the behaviour.

The mode is **confined by measurement, not by assumption**: only an
in-place EDIT onto a bare page needs it.

> **[amended 2026-08-17, narrowing the experiment]** The table above
> compares HEADER FORMS. It does not settle which CHANGES need the flag,
> and the first classifier written from it was too broad — it flagged
> every head prepend, moves included.
>
> Measured: the flag class is **in-place head-creation only**. A `create`
> has its own flag-free path (`new file mode`, `/dev/null`), and a MOVE
> that also prepends applies under DEFAULT `git apply`, because **rename
> headers self-anchor**: `rename from` / `rename to` identify the file
> whole, so git needs no context line to locate the hunk. Only the
> in-place edit arrives with neither an anchor nor context.
>
> Caught within minutes by the receipt's own assertion that default apply
> must REFUSE every flagged patch — flagging a patch that does not need
> the flag makes its printed instruction a lie, and that assertion exists
> precisely so the lie cannot ship. A header experiment answers a header
> question; it took a second experiment, on changes rather than headers,
> to size the class.

> **[amended 2026-08-17 — the narrowing was wrong, and its own last
> sentence said why]** "A move that also prepends applies under DEFAULT
> `git apply`, because rename headers self-anchor" is FALSE. Measured
> through the shipped writer against real git: `git apply` refuses it
> (`patch failed: …bare.md:0`, exit 1) and `--unidiff-zero` accepts it,
> exactly as for the in-place edit. A rename header self-anchors the
> FILE; it does not give a zero-context hunk the context it lacks.
>
> The paragraph above ends "a header experiment answers a header
> question" and then answered a change question with it anyway. The
> classifier now keys on the CHANGE — empty original head, non-empty new
> head — and the mechanism carrying it is irrelevant.
>
> **What let it ship is the missing complement.** The receipt asserted
> that flagged patches are refused by default, and nothing asserted that
> unflagged ones apply. So a patch that silently needed a flag it never
> named was indistinguishable from one that needed nothing. Both
> assertions exist now, and `move-bare-into-weighted` is the scenario —
> its own first draft a corpus accident that the old classifier survived,
> caught by mutation rather than by reading.

## The residual ledger [2026-08-17]

Three residuals, each with its status stated, because the difference
between them is the whole point — a residual that is *accepted* is not
the same object as one that is *measured* or one that is *unverified*,
and collapsing them is how an unknown gets read as a decision.

| residual | status | where |
| --- | --- | --- |
| front-matter drift: a folder save can overwrite a body edit made after load | **ACCEPTED AND PINNED** — docs/15's baseline-is-not-a-mirror ruling working as designed; version control is the arbiter | docs/15 |
| re-applying a zero-context patch | **REFUSED AND MEASURED** — `git apply` declines it, the safe outcome; predicted to stack front matter and does not | `receipt-move-patch.sh`, scenario `residual-double-apply` |
| `patch -p1` idempotence | **UNVERIFIED AND LABELLED** — the preamble offers this as the flag-free alternative; GNU patch is far more permissive about re-application and this was not measured | recorded in the receipt, not claimed anywhere else |

The third is deliberately left open rather than assumed either way.
Claiming idempotence without measuring it would be exactly the unearned
assurance the receipt exists to refuse, and claiming its absence would
be a defect report without a control group.

**The patch documents itself.** When any such hunk is present the file
opens with a comment block naming the affected paths and both apply
commands. `git apply` tolerates leading text — `format-patch` mail
headers are the precedent — so the instruction travels with the bytes
rather than in a dialog the file outlives. No such hunk, no block: the
common patch is byte-for-byte what it was.

**Refusal was considered and declined [2026-08-17].** Refusing the case
in the patch path would have preserved refuse-on-drift purity exactly,
at the cost of making the `.patch` download less capable than the folder
save for 142 corpus pages. A product call: the mode is documented, the
flag is named in the file, and the capability survives on both writers.
Recorded rather than silently chosen, because it trades a purity this
project usually keeps.

**A predicted residual that did not reproduce.** The expectation was
that re-applying a zero-context patch would stack a second front-matter
block, since such a hunk has no context to notice its change is already
there. Measured: `git apply` refuses it — the safe outcome. Pinned as
measured, with `patch -p1` explicitly NOT verified for idempotence,
because claiming it without measuring would be the unearned assurance
this receipt exists to refuse.

## Corrections this note makes to earlier notes

Amendments are claims. Each was investigated before being written, and
each carries its receipt (**investigate before amending, sweep after**):

1. **docs/14 Decision 4** — "this corpus has `disableAliases = true`, so
   Hugo's own redirect mitigation is off". False. Receipts: Hugo's docs
   (`Aliases` remains available), `hugo.toml:106` REDIRECTS output
   format, `layouts/index.redirects` reading `$page.Aliases`, and 5 of 5
   public Docsy sites with working aliases. This is an **upward**
   amendment — it restores a capability the note wrote off.
2. **docs/14 Decision 4** — "running at 33% and 23% on the whole k8s
   site". Those are `content/en/docs` (34% / 23%). Whole-site is
   68% / 46%.
3. **docs/14 Decision 4 and docs/08** — "even *detecting* [links] needs
   bodies the snapshot does not own". `parse` receives whole bodies
   (`hugo.ts:748`); detection at import is free.
4. **`hugo.ts:1113`** — the comment reasons from `disableAliases = true`
   meaning no redirect. Correct the comment where it sits.
5. **`guards.ts` docblock** — "both callers import it" is true of the
   topic axis only. Either fold `cardDrag` (sequencing step 1, preferred)
   or narrow the sentence.
6. **`prompt.ts:14` — a v1 Hugo defect, found here, not caused here.**
   `buildSystemMessage` never tells the model that parent changes are
   refused, so a Hugo reorganize spends a call producing a proposal
   `validate.ts:466` then discards whole. Enforced but never
   communicated. Fixable independently of everything else in this note.
7. **`containers.ts:88` had no call site in `src/ai/`** — **FIXED
   2026-08-16**, ahead of this note's build, under the sealed-P0
   precedent. Reclassified from a design note's finding to a live defect
   because it was shipped, reachable and silent. `emptiedContainers` is
   now one rule with two callers; the net sits beside the multiset and
   parentage nets; the prompt states the constraint by id. Two things
   the fix turned up that the finding had not:
   - **reconstruction dropped `doc.containers` entirely.** Cards carried
     their own `chain`, so the export was fine and nothing looked wrong
     — but the registry the guards read was gone, so a *second*
     reorganize of a reorganize result was unprotected. The net without
     this carry was a fix that held only on first-generation tabs.
   - **the "arrived empty" case.** Adapters declare a descriptor for
     every container, including one that legally bears cards and holds
     none, so the predicate had to refuse EMPTYING rather than
     emptiness. Found by mutation-checking, not by review: dropping the
     occupied-before clause left every other test green.

Sweep targets after this note lands: `docs/08` reparenting entry (its
centerpiece paragraph is superseded by "the false constraint, retired"),
`docs/14` Decision 4, `hugo.ts:1113`, and **`CLAUDE.md` last**, where
`docs/16` moves from "reserved … the only unwritten number" to in-design.

## Open questions

### Must settle before implementation

None. The three that would have been here were settled by measurement
rather than by ruling: gate-vs-inform by the 92% prose cut, alias
viability by the redirects template, and index legitimacy by docs/17's
classifier.

### Settle during implementation

- **Exemplar ordering in `LinkIndex.from`.** Document order is the
  existing convention (`MAX_EXEMPLARS`, docs/17). Whether the 20 shown
  should instead be the nearest-in-tree sources is a legibility question
  best answered against a real Review dialog, not in advance.
- **Weight granularity at the destination.** Gap arithmetic has a free
  parameter — where in the gap to land. Existing intra-card reorder has
  an answer; confirm it composes across sections rather than assuming it.
- ~~**Whether the alias toggle is remembered per document.**~~
  **[settled 2026-08-16, during implementation] SESSION-LOCAL.** The
  toggle defaults ON and resets with the dialog.

  The rationale is about DEFAULTS, not about permissions — a permission
  analogy would be the wrong shape here, because unlike the AI's file-move
  toggle this control makes a move *safer*, not riskier. A remembered ON
  costs nothing to remember; the case that matters is a remembered OFF,
  and a deviation from a safe default should not self-perpetuate. Turning
  aliases off once, for one restructure with a reason, must not silently
  hold for every restructure after it — the direction of risk is what
  decides, and persistence inverts it.

  **The escape for sites where aliases really are inert** is site
  CONFIG, not a remembered UI toggle: a project whose theme consumes
  neither Hugo's alias stubs nor `Page.Aliases` should say so once, in
  the repo, where the fact lives and where a reviewer can see it —
  rather than in one user's browser, invisible to everyone else working
  the same corpus. Not built; named so the next person reaches for the
  right mechanism instead of persisting the checkbox.
- **Docusaurus doc-ID breakage** is a second species its warning already
  names, orthogonal to link URLs. The back-port in step 7 should count
  links and keep naming IDs, not conflate the two.

  **[settled by plan 2026-08-17] SETTLED AS SPECIFIED — closes with
  sequencing step 7.** Two species, two channels: the harvester COUNTS
  link URLs, and the existing warning keeps NAMING doc IDs. Nothing
  merges them, because they break differently and are fixed differently
  — a moved page's URL is repairable by a redirect, a doc ID is not. The
  item is listed here rather than struck through so the closing sweep
  collects it against the shipped back-port.
- ~~**Where an AI-created section lands in a scoped run.**~~
  **[settled 2026-08-17, during implementation] SLOT WITHIN SCOPE — and
  it was already true.** `builtSections` walks the proposal in order, so
  a `+ Title` keeps the position the model gave it, and scope
  pass-through inserts the whole in-scope block at the FIRST in-scope
  position. Nothing needed building; three tests were added to PIN it,
  because a property true by construction is one a later change to the
  assembly can quietly remove. (Verified by mutation: appending the
  block instead of slotting it fails four tests.)

  The draft's reason was perceptual — appending "reads as the model
  having reordered them". The **contract** reason is the load-bearing
  one: scope is a PROMISE that out-of-scope cards are untouched, and a
  new heading appended after them changes their relative position in the
  document. The result IMPERSONATES an out-of-scope reorder — a change
  the run was forbidden to make, arriving in a shape the user cannot
  distinguish from one the model chose. The perception is the symptom;
  the violated promise is the defect.
