# 17 — Document summary ("Overview") — design

Status: **built**. `src/view/OverviewPanel.tsx` and the Tier-1 selectors
ship; `doc.extras.importWarnings` is now `importEvidence`. This note is
the rationale record, not a proposal — where it says "the build must",
read it as "the build does", and check the code before trusting a
sentence here over it.

A per-document surface answering "what am I actually looking at?" —
vital statistics and findings, with **click-a-finding → focus its subject
on the canvas**. Invoked from a header button beside Reorganize / Review
changes.

The feature exists because a real number had nowhere to live. Hugo's
canvas can say "199 rows hidden via …" on the Reference card and "8" on
Tasks, and no surface anywhere says **216 of 1,044 pages are absent from
the published sidebar**.

Derivation, because this sentence should not be the note's one
unreceipted claim — measured on kubernetes/website at the current build:

```
own-flag                 17
inherited               207
both                      8
hidden (own ∪ inherited) 216  = 17 + 207 − 8      of 1,044 topics
```

Earlier drafts said 207 and then 210. Both were true of earlier builds:
the `.html` fast-follow added six pages, six of which are `toc_hide`, so
own-flag went 11 → 17 and the total 1,038 → 1,044. **The reconciliation
property test owns this number after the build** — until then it is a
measurement with a date on it, and it drifts whenever the scanner's reach
changes.

## The ruling that reshapes everything else

Two of this brief's requirements contradict each other, and the
contradiction is worth stating before the design rather than discovering
it in implementation.

**Fence:** the report is pure derivation, computed on open, never stored.
**Tier 2:** the adapter contributes facts only the parser knows —
`ignoreFiles` skips, TOML/JSON refusals, folded bundle resources.

Those facts describe **files deliberately excluded from the kept
snapshot** (docs/15: the snapshot owns the nav, not the folder). After
parse they are not in `doc`, not in `doc.extras.files`, and not
recoverable by any pure function of either. A report computed on open
cannot know how many files `ignoreFiles` skipped, because the evidence
was discarded on purpose.

**Ruling: split the tiers by provenance — and Tier 2 is not a new
array, it GENERALIZES `doc.extras.importWarnings`.**

| tier | when | where it lives | recomputed on open? |
| --- | --- | --- | --- |
| **1 — model-derived** | any time | nowhere; it is a selector | **yes, always** |
| **2 — parse-observed** | parse only | the existing `doc.extras.importWarnings`, enriched | **aggregates yes, evidence no** |

The fence survives in the form that gave it its force: **no derived
display data is stored.** Tier 1 is a selector, as `documentStats` and
`hiddenSubtreeSummary` already are. Tier 2 stores *per-occurrence
evidence* — which is not derived display data, it is an observation of an
import that no longer exists to be re-observed.

**The count is stored, and the classifier is what says so.** An earlier
draft claimed aggregates are never stored and that the panel groups
per-occurrence records on open. That framing is **withdrawn**: it cannot
survive the bound (629 folded bundle resources one-per-occurrence is
exactly the unbounded storage the bound prevents), and more importantly
it fails this note's own test. *Can a count of discarded files be
recomputed from the kept snapshot?* No — the files are gone. Therefore it
is evidence. Therefore it is stored. The classifier settles it without
needing a judgement call, which is what a good classifier is for.

So the stored record is **one per `kind`**, carrying its count and up to
20 exemplars. The fence's real content is untouched and is the part worth
keeping: **no Tier-1 derivation is stored.**

**The bound is a Tier-2 STORAGE property, and does not generalize.**
Tier 1 selectors are complete by construction — they read the model,
which is entirely present — so a Tier-1 finding names every subject it
has. Recorded explicitly so the exemplar bound is not over-applied to
selectors that have no reason to sample.

### The classifier

One test decides the tier, and it is mechanical rather than editorial:

> **Can this be recomputed from the kept snapshot?**
> Yes → Tier 1, a selector, never stored.
> No → Tier 2, parse evidence, stored.

> **[extended 2026-08-17, docs/19]** Apply it to the NOUN, and to every
> term the noun is made of. **A derived count inherits the tier of its
> LEAST-AVAILABLE term.** docs/19 first placed orphanhood in Tier 1
> because the toctree closure recomputes from the kept snapshot — true,
> and irrelevant to the count, which is `files_on_disk − closure` and
> needs a file list the snapshot does not hold. One recomputable operand
> does not make an expression recomputable. Asking the question of "the
> orphan count" rather than of "the closure" gets it right the first
> time.

Applying it honestly re-sorts several examples this brief had in Tier 2:

| fact | tier | why |
| --- | --- | --- |
| implicit sections (dir with pages, no `_index.md`) | **1** | the snapshot has the paths; recompute |
| unweighted / tied sibling sets | **1** | weights live in the nav heads |
| `.html` pages included | **1** | the paths are right there |
| languages **declared** | **1** | the config file is kept |
| languages **present** | **2** | presence was observed against the granted folder, which is gone |
| `ignoreFiles` skips | **2** | skipped files were never kept |
| TOML/JSON refusals | **2** | refused files were never kept |
| bundle resources folded | **2** | folded resources were never kept |

The pattern is exact: **Tier 2 is precisely the set of facts about files
the snapshot deliberately does not hold.** Anything still in the snapshot
is a selector, and treating it as evidence would store a derivation —
the thing the fence forbids.

### Why this is one array and not two

`importWarnings` was surveyed as a precedent and turns out to be the
same thing, which makes a sibling field the wrong move — two
parse-time-persisted arrays a commit apart is precisely the
redundancy the dissolve-binaries rule exists to prevent.

Two receipts from the shipped code:

1. **`importWarnings` already carries neutral observations.**
   `sibling-languages` ("17 languages declared · English loaded"),
   `hugo-config-missing`, `frontmatter-created`, `page-hidden` and
   `stub-created` are disclosures, not warnings. The array is a
   parse-observation log wearing a warning's name.
2. **`blocking` is already dead on this array.** Saving is gated by
   *plan* warnings (`const { warnings, blocked } = plan` in
   `ChangesDialog`); `importWarnings` render display-only in a collapsed
   `<details>` that reads `detail` and nothing else. The type carries a
   field meaningless in one of its two uses — which is what an array
   looks like just before it is asked to serve a second reader.

### The rename, and why it is type surgery

**`doc.extras.importWarnings` becomes `doc.extras.importEvidence`, at the
docs/17 build, before the panel reads it.**

Not cosmetic. **Names steer producers**: an array called *warnings*
starves of neutral evidence, because no author files "6 `.html` pages
included" as a warning — they either distort it into one or invent a
sibling field for it. The redundancy this note spent a section
dissolving is the predictable end state of a misnamed array, not an
accident.

**`blocking` splits the types rather than moving with them.** Verified
rather than assumed, and the answer decided the shape:

| adapter | `planChanges` begins | `blocking: true` emitted at |
| --- | --- | --- |
| jtd | 296 | 448, 531 |
| docusaurus | 427 | 686, 697, 735, 811 |
| hugo | 880 | 904, 930, 1001, 1034 |

All ten occurrences sit inside `planChanges`; **none** come from `parse`.
And `blocked` is computed from the *plan's* warnings
([`ChangesDialog.tsx:71`](../src/view/ChangesDialog.tsx#L71)), never from
the import array. So the field is not dead — it is **misplaced**, alive
in exactly one of the two uses, which is precisely why one type serving
both was a smell rather than an economy.

Therefore **split, do not delete**:

```ts
// plan-side, unchanged in meaning; `blocking` is its whole point
interface CollectionWarning {
  kind: string;
  detail: string;
  blocking?: boolean;      // gates saving — alive, and only here
}

// import-side, stored as doc.extras.importEvidence — ONE PER KIND
interface ImportEvidence {
  kind: string;            // grouping key; "warning" is a KIND, not a type
  count: number;           // total occurrences, INCLUDING un-exemplified ones
  detail?: string;         // prose, for the review dialog
  receipt?: string;        // flag name, rule, or config source
  exemplars: NodeRef[];    // FIRST 20, document order; empty is normal
}
```

**`ImportOccurrence` is the EMISSION type, and the split is where the
bound lives.** An adapter or the driver emits one occurrence per thing
observed — `{ kind, detail?, receipt?, subject? }` — and the WRITER owns
what happens next: aggregation into one record per kind, the 20-exemplar
bound, and the determinism that makes the same corpus store the same
bytes. Emitters therefore cannot get the bound wrong, cannot vary run to
run, and cannot each invent their own grouping; they report, and
`openCollection` decides.

`'warning'` becoming a kind value is the move that lets one array hold
both a refusal and a neutral observation without either lying about the
other.

### Migration

- **Read** `extras.importEvidence ?? extras.importWarnings`, so documents
  already in `localStorage` keep working. `PERSIST_VERSION` does **not**
  bump: the old shape is still readable, which is the difference between
  a migration and a break (contrast the `TopicUnlisted` reshape, which
  was neither readable nor bumped, and blanked the app).
- **Write** the new key only.
- **Retire the alias** once no session predates the rename — recorded
  here so the alias is a dated decision rather than permanent furniture.

### One writer, aggregating at write time

`openCollection` stays the single writer, and it does the grouping:
it merges **driver-observed** and **adapter-observed** occurrences and
writes **one `ImportEvidence` per `kind`**. Aggregation happens here, not
in the panel — which is what makes the stored form bounded rather than
proportional to the corpus.

`CollectionWarning` does not appear in this path at all. It is plan-side
only, per the split above, and keeps `blocking`.

**The writer must reach further than `parse`.** Some evidence is
driver-observed: files dropped by `shouldSkipPath` / `ingestible` never
reach `parse`, so no adapter can report them. Hugo's `ignoreFiles` skips
happen inside `scan()` today and so *are* adapter-observed — but the two
sources are genuinely different, and a writer that assumes `parse` saw
everything will silently under-report exactly the skips this panel exists
to surface.

One storage, two projections: the **review dialog** and the **Overview
panel** both read `doc.extras.importEvidence`.

**The review dialog changes, and an earlier draft wrongly said it did
not.** Records are one-per-`kind` now, so it renders **one line per kind**
— `detail` with a count suffix — where it previously listed one line per
occurrence. That is a better list for a folder that skipped 84 files, and
it is a change, not a no-op. Legacy `{ kind, detail }` records read as
`count: 1` through the alias, so an old session renders exactly as it
does today.

**One residual mismatch, named rather than smoothed over:** format-adapter
documents have no `importWarnings` at all — `openCollection` sets it, and
that path is collection-only. DocFX, MkDocs and Mintlify therefore have
no `importWarnings` to generalize, which is consistent with them having
nothing to contribute (below) but means the generalization is
collection-scoped in v1.

## Data model

### Tier 1 — model-derived, format-agnostic

Every document, no adapter involvement. Tier-1 subjects are node ids and
the list is COMPLETE (no bound — see above), so
every line can focus.

| line | receipt |
| --- | --- |
| sections · topics · max depth | `documentStats` |
| depth histogram | counts per level; the only line that reveals a lone 6-deep branch |
| orphan cards | `isOrphan` |
| **hidden from published navigation** | split three ways, plus a total, below |
| titles derived from paths (topics, sections) | `titleDerived` |
| locked nodes by kind | `lock.kind` (7 kinds — docs/12's five plus `globbed` and `outside-region` from docs/19; breakdown keys are the legend's labels from `model/locks.ts`, "above prose" never "outside-region") |
| sealed sections + declared source | `sealed.source` |
| containers, and cards per container | `chainLookup` |
| empty sections | `isEmpty` |

**Hidden** is three lines, not one, because they are three different
facts and collapsing them is the error docs/14 already made once — and
then a fourth line, which is an addition rather than a collapse:

Measured on kubernetes/website by `pnpm paint-check` at the build, and
matching the derivation at the top of this note rather than the
pre-`.html` figures earlier drafts carried:

1. own-flag, **by kind** — `headless` 15, `toc_hide` 9. They sum past
   the 17 own-flag total on purpose: a page can carry both, and a
   breakdown that summed to the total would be hiding one of them.
2. inherited, **total** — 207, the number with no home before this;
3. inherited, **per ancestor** — 135 via "Kubeadm Generated", 64 via
   "Definitions", 8 via "Tools Included". This is the line that focuses
   well: each row's subject is the flagged ancestor.
4. **any reason, as a total** — 216 of 1,044, printed with its
   derivation inline: `own 17 + inherited 207 − both 8`. The three
   lines above answer *in what way* and overlap on purpose; none of
   them answers *how many rows does a reader never reach*, which is
   the first question a stranger asks. Adding a line is not the
   collapse the three-lines rule forbids — collapsing them into one
   is, and summing them would say 224 of 1,044, overcounting by
   exactly the eight pages that carry both facts.

   It is **stat-only**: every node it counts already folds out of a
   line above, so a third fold over the same rows would be noise
   rather than an affordance. And it emits nothing unless BOTH ways
   are present — with one of them zero the total restates a line
   already visible.

**The relationship is declared, on `ReportFinding.summarises`**: a
finding names the ids it totals, in the order its receipt names them.
That field is the only place the grouping exists, which is what keeps
it a fact about the report rather than a guess about it — nothing
downstream infers a group from labels, id prefixes or shared subjects.

**And it renders as a CLUSTER**: the total heads, its terms nest
beneath it, and the whole cluster ranks as one entry by the head's
count, in the section its terms landed in. Nesting is what makes the
adjacency structural. The first cut placed the total after its last
term, which looked equivalent and was not: on kubernetes/website the
141 derived-title rows ranked their way into the middle of the hidden
block by arithmetic accident, separating the receipt from two of the
three numbers it cites. A property that holds per corpus is not a
property. The head is stat-only, so the cluster takes its section
from the TERMS — otherwise a total with nothing to focus would drag
three focusable lines into Observations behind it.

The general form, worth keeping: **group by declared relationship,
never by invented category.** A renderer that decides some findings
look related is making a claim about what the model means from the
layer least equipped to make it, and it is wrong the first time an
adapter emits a line that does not fit the shape someone imagined.

### Tier 2 — parse-observed, adapter-contributed

The panel reads `doc.extras.importEvidence` (shape above) and renders it
directly. There is no second derived type: the stored record is already
one-per-`kind` with its count, so grouping has happened at write time —
which is exactly what makes it bounded.

Surveyed against all seven shipped formats:

| adapter | contributes | node refs available |
| --- | --- | --- |
| hugo | languages declared vs present · `ignoreFiles` skips · TOML/JSON refusals · bundle resources folded · implicit sections · `.html` pages included · unweighted and tied sibling sets | **mostly none** |
| jtd | duplicate titles · ambiguous / unknown parent · parent cycles · skipped files | partial |
| docusaurus | number-prefixed files · broken / duplicate / empty category · path collisions | partial |
| sphinx | atomic collapses · missing refs · external refs | yes |
| docfx · mkdocs · mintlify | **nothing** | — |

Two results from that survey shape the contract:

**Empty contributions are the majority case, not an edge case.** Three of
seven formats emit no warnings at all — they throw on bad input
rather than reporting. A design that assumes every adapter has something
to say would give DocFX an empty panel section that looks broken. The
panel renders Tier 2 only when non-empty.

**Subjectless findings are the majority within Tier 2.** "84 files
skipped by `ignoreFiles`" has no node to focus — those files are not in
the document by definition. Per the brief these are **stat-only**: they
render without a focus affordance, and the absence of a click target is
the honest signal that there is nothing on the canvas to look at.

## Focus semantics

The load-bearing choice, and the one that constrains the data model
above: **a finding is only a finding if it can name what it points at.**

### What focuses, and on what

- **Singular** finding → the node itself.
- **Aggregate** finding → its **cause**, not its members. "199 rows
  hidden via Kubeadm Generated" focuses the *flagged ancestor*, made
  visible — its ancestors open, but the target itself never
  auto-expands, uniform with the boundary rule below.
  Selecting 199 rows would be a selection, not an orientation, and the
  user asked "why are these hidden" — the answer is one node.
- **Stat-only** → no affordance. Not a disabled button: nothing to
  press.
- **Tier-2 evidence with exemplars** → each exemplar is individually
  focusable. This does not contradict the aggregate rule above: a Tier-1
  aggregate has ONE cause and focusing it answers "why", whereas Tier-2
  exemplars are unrelated instances of a kind and there is no single
  node that explains them.

**Sampling is never silent.** When `count > exemplars.length` the panel
labels the list "first 20" and appends "+K more". A sampled list that
looks complete is the same defect class as a truncated cause name: it
answers the question wrongly rather than declining to answer.

### The mechanics — settled

Focus does three things and no more: **expand the ancestor path**,
pan/zoom the subject into view, flash it.

**Expansion is ordinary expansion.** It writes the same per-node
overrides a chevron click writes, producing state identical to the user
having opened that path by hand. Depth settings are not read, not
raised, and not restored — this is not a view mode.

The precedent is already shipped and load-bearing:

```ts
const expanded = ctx.overrides.get(topic.id) ?? level < ctx.depth;
```

**The panel reaches that state through a CONSUMED REQUEST, not a second
map.** Expansion truth stays in `TopicTree`'s own overrides; the panel
dispatches a request addressed to one card, which applies it and
acknowledges, clearing it. Lifting the overrides into a store would have
refactored working view-state for the benefit of a read-only reader, and
dragged persistence and cross-tab surface along with it.

([`TopicRow.tsx:112`](../src/view/canvas/TopicRow.tsx#L112)) — per-node
overrides and the depth chip already coexist, so a node can sit open at
depth 2 of 5. Focus therefore needs **no new mechanism and no new state
to reconcile**, which is what makes it cheap.

It also disposes of "is the override sticky?" — exactly as sticky as a
chevron click, a question the app answered before this note existed. An
earlier draft recommended raising the card's depth and not restoring it;
that was a worse answer to a question that turned out to be already
answered, and it is recorded here only so the reasoning is not
rediscovered.

**Boundaries — settled: focus stops at them.** Focusing *into* a
collapsed atomic subtree would undo the collapse that made the card
legible. Focus lands on the **boundary node** and leaves it collapsed:
the boundary is the honest subject, and docs/12 already treats it as a
thing rather than a lid.

**The rule keys off declared boundary state, not off "locked" broadly** —
and that distinction is not a nuance, it is most of the lock kinds:

| state | boundary? | focus behaviour |
| --- | --- | --- |
| `Section.sealed` | **yes** — contents generated elsewhere | stop at the card |
| `lock.kind === "atomic"` | **yes** — a subtree stands behind it | stop at the boundary row |
| `lock.kind` `reference` · `pattern` · `external` · `missing` | **no** | ordinary node; focus it directly |

A merely-locked row is not a container. It is one row that happens to be
immobile, and refusing to focus it would withhold the node the user
asked for on the strength of a property that has nothing to do with
containment.

The model already draws this line and can be read rather than
re-derived: `TopicLock.count` is documented **"`atomic` only: how many
entries sit behind the boundary"**
([`types.ts:55`](../src/model/types.ts#L55)). A kind that can say how
much is behind it is a boundary; the other four cannot, because there is
nothing behind them.

**The panel stays open across focuses.** This is why it is a drawer.

## Panel anatomy

**A right-hand drawer, not a modal.** Click-to-focus needs the report and
the canvas visible at once; a modal that closes on focus makes every
finding a one-shot and forces a reopen to compare two. Recorded fallback
if the drawer proves disproportionate: modal-that-closes-on-focus, which
degrades the feature to a launcher.

**Label: "Overview".** Kept from the brief. It promises orientation
rather than a verdict, which matches what the panel does and matches
PRODUCT.md's cold-start principle. "Report" was considered and rejected:
it implies findings requiring action, and most lines are description.

**Long subject lists FOLD, and say how much.** Measured at corpus scale:
kubernetes/website renders 207 inherited-hidden and 141 derived-title
subjects, which as sixty blue links is a wall that answers nothing. Over
EIGHT subjects a finding collapses behind a count-labeled toggle —
"207 nodes ▸" — chosen because eight sits above the useful case (a
per-ancestor line names three causes and stays open) and below where
links stop helping.

The fold is a RENDER property and the completeness rule is a DATA one,
which is why they do not conflict: the selector still holds all 207, the
toggle says 207, and opening it shows them. A fold that lied about its
count would be the data truncation completeness forbids — and it stays
distinct from Tier-2's "+K more", which reports a record that never held
the rest.

Anatomy, top to bottom: identity (name, format, source) → vital
statistics (Tier 1 stats) → attention (clusters with something to
focus) → observations (stat-only clusters, then Tier 2 evidence).
Receipts inline on every line, never hover-only — this panel is read by
the third audience who never opens the app (PRODUCT.md), and a
screenshot of it must carry its evidence.

**The panel QUOTES titles and never edits them**, which is the same
promise one level down: a rewritten name would have this surface
claiming the document says something it does not, to exactly the
readers who cannot check. So where two subjects in a rendered list
share a title, the difference is ADDED — the path segment where they
diverge, as secondary text beside the link, which is receipts-inline
applied to identity. Collision-triggered, never universal: a path
beside every link would be noise on the lists whose titles already
differ. Collisions are a normal corpus condition rather than a defect
to design against — Just the Docs emits a `duplicate-title` evidence kind
for precisely this, and kubernetes/website ships six pages titled
"Not found", the Katacoda tutorial stubs, which the panel now
separates by their `scale/`, `expose/`, `explore/` segments. Where nothing
distinguishes them — no path, or the same path twice — it adds
nothing, because an index would be signage the document never wrote.

## Unification path

The header stats line, the `pageTitlesAllDerived` chip, the language
chip, the card-level cause line and the import disclosures are all
**projections of this report**. They were each built where they were
needed, which is why they disagree in vocabulary.

**v1 does not rewire them.** Rewiring five surfaces while introducing a
sixth is how all six end up subtly different. Instead:

- a **reconciliation property test** pins report totals ==
  model derivations == header line, so the projections cannot drift
  while they wait;
- chip rewiring is recorded as the follow-up, to be done once the
  report's vocabulary has survived contact.

## Fences

- **No body reads.** "Broken links: N" is docs/16's import-time
  link-index question wearing a friendly face. Named here so it is
  refused deliberately rather than discovered as scope creep.

  **[amended — docs/16]** The fence holds for this panel, but the NAME
  carried two ideas and docs/16 splits them: **no stored bodies** (the
  docs/15 law) and **no post-import body reads** (the fence). The middle
  case is neither — `parse` already receives whole file contents and
  chooses what to keep, so an import-time harvest reads nothing new.
  What this panel still refuses is the *display*, not the derivation.
- **Tier 1 is never stored**; Tier 2 is stored as parse *evidence*, not
  as derived display data (see the ruling above).
- **No AI calls, no network.** The panel is a selector and a record.

## Decision A — the card-level cause line

**The brief lists this as pending; it shipped in `47671ff`.** It is on
the canvas now: a persistent line in each card's chrome naming its
causes, with the full per-cause list on hover.

**Ruling: keep both.** They answer different questions at different
scopes, and the summary's focus feature makes them *more*
complementary rather than less:

- the card line is **passive and local** — it explains rows already in
  front of you, with no click, on a card you were already reading;
- the summary is **active and global** — it states the document-wide
  number and takes you somewhere.

Clicking a summary finding lands the user at the glyphed ancestor. The
card line is what tells them, once they arrive, that they are looking at
the cause of 135 hidden rows. Removing it would make the destination
mute.

Revisit only if the panel's per-ancestor breakdown proves to make the
card line redundant **in use** — which is a measurement, not a
prediction.

## Open questions

**Must settle before build**

*(None — and the build has since shipped, so this section is history.)*

**Invariants the build tests**

- `count >= exemplars.length`, always.
- Exemplar selection is **deterministic** — first 20 in document order —
  so the same corpus produces byte-identical evidence. A sampled record
  that varied run to run would make the reconciliation property test
  unfalsifiable.
- A synthetic 25-occurrence fixture stores 20 exemplars, reports
  `count: 25`, and renders "+5 more".
- Legacy `{ kind, detail }` records read-alias as `count: 1` alongside
  the `importEvidence ?? importWarnings` key alias.
**Settled since drafting**

- **Evidence counts under `MAX_TOTAL_BYTES`. No exemption, no new cap.**
  Bounded by construction: per kind, a count plus the first 20 exemplars
  plus "+K more". Measured today —

  | corpus | observations | stored |
  | --- | --- | --- |
  | kubernetes/website (hugo) | 1 | **0.11 KB** |
  | godot-docs (sphinx) | 0 | 0.00 KB |
  | mintlify | no `importWarnings` | 0.00 KB |

  **Read that as a floor, not a ceiling.** The array is nearly empty
  because most Tier-2 facts above are not emitted yet — the adapters
  skip files and fold bundles silently. Once they report, the bound is
  what holds the size: ~10 kinds x 20 exemplars x ~120 bytes ≈ **24 KB
  worst case**, against a 3 MB cap. The bound exists so that a corpus
  with 629 folded resources stores 20 of them and a number, not 629
  strings.

- **Collection contract only, and it is a PARSE-RESULT FIELD** —
  `CollectionParseResult.evidence?`, not a method on the adapter. The
  distinction is purity: evidence is something a parse OBSERVED while it
  ran, so it leaves with the parse's result. A separate adapter member
  would have to be called again, against files the snapshot no longer
  holds, and would either re-derive what cannot be re-derived or quietly
  return nothing. Optional, and where real producers exist (Hugo,
  Sphinx). The
  format contract gains it on the **first real producer** and not
  before — adding a member DocFX, MkDocs and Mintlify would all decline
  is the mechanism-with-no-producer shape docs/13 warns about. Trigger
  recorded; no speculative surface. An empty contribution renders no
  section at all, rather than an empty one that reads as broken.

**Settle during implementation**

4. Drawer width, and whether it pushes or overlays the canvas.
5. Whether the panel is keyboard-reachable per finding (it should be;
   the shortcut question belongs to the command-palette work).
6. Copy for each Tier-1 line — the receipts are known, the phrasing is
   not.
7. Whether "attention" findings sort by count or by severity.

## Fixtures plan

No new corpora. The reconciliation property test runs over the existing
fixture documents for all seven formats, asserting report == selectors
for every one — which also proves the empty-Tier-2 path on DocFX,
MkDocs and Mintlify. Hugo's `hugo-edges` already carries every Tier-2
case this note names (ignored files, TOML refusal, folded bundle,
implicit section, declared-but-absent language, `.html` page), so the
adapter contribution is testable without new fixtures.
