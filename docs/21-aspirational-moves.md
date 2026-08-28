# 21 — Aspirational moves: proposing what the app won't yet write — design

> STATUS: CERTIFIED (Roger, 2026-08-19, at revision 2 — 4d56893,
> merged ce6dcda). BUILT WHOLE (2026-08-20): arc 1 — the model path
> and the write path (docs21-pipeline, merged 1ea6eeb); arc 2 — the
> hand: Decision 9 and gate 2's G1 (docs21-gesture, merged 99df95e,
> adjudicated ACCEPT after one scoped revise, certified by Roger
> 2026-08-20). Decision 3 carries one post-build amendment from
> arc 1's collision; Decision 9 carries one post-build addendum from
> arc 2 (pinned-to-card), below — **RETIRED 2026-08-21** in
> `docs22-hand`, which is docs/22 arc 2 landing the unlock it named.
>
> **Citations.** Every claim about current behavior cites its file or
> note. The baseline is **`69691ba`** — the constraint-parity merge,
> now landed on main. The first draft designed against that arc
> observed in flight, uncommitted; this revision re-cites against the
> merged code and discharges the draft's "if the arc lands differently"
> conditional (it landed with retry-reachability — ruled 1b — and the
> two-consumer union, the shape the note designed against; see
> Substrate). Where a cited line number could drift, the citation names
> the construct as well as the file. Where the record and the code
> disagree, the code wins and the disagreement is named.

## Open rulings

**None.** Gate 2's single question — G1, switch-back — was ruled
2026-08-19, as recommended; its dated record joins the Rulings record
below. The note returns to certification with zero open questions.

## Rulings record — gate 1, ruled 2026-08-19

The first draft's "Rulings needed" list, converted to the dated record.
Each entry names where it landed in this revision.

- **R1 — Names: Grounded / Aspirational, adopted.** Production/Sandbox
  was considered and declined: an environment metaphor is the wrong
  axis — it claims write authority the mode does not carry. Lands
  throughout; the naming alternatives stay recorded in Decision 2.
- **R2 — Third visual tone AUTHORIZED.** The intent tone for the
  aspirational badge is approved; the docs/05 scoped dated amendment
  itself lands with the BUILD, not this revision. Recorded in
  Decision 3, listed as a build obligation in "Sweep obligations".
- **R3 — Mode not persisted; per-dialog-open stands.** Decision 2.
  The tab-STATE seeding question this raised is answered in
  Decision 2 ("Seeding").
- **R4 — Confirmed:** plan-level file-move consent in Review changes,
  default OFF; declined moves join the checklist labeled **"declined
  this run"**. Decision 4.
- **R5 — CLASSIFY:** never-empty containers are violable in
  aspirational proposals; the checklist remedy names the by-hand
  `docs.json` edit; the empty-lane display cost is accepted.
  Decisions 1 and 6 (the R5 hedging in both is removed).
- **R6 — Confirmed:** Review-changes panel section always, plus the
  `.patch` preamble comment block; NO file written into the user's
  folder; "Copy checklist" rides along. Decision 4.
- **R7 — WIDENED, overturning the draft.** The manual pinned drag
  enters scope: the drag starts, a seam at the gesture explains the
  split and offers the tab-state switch, decline is sticky with a
  named escape hatch, and a deliberate per-tab control exists. The
  draft's "manual dragging stays refused; Put back is the only pinned
  gesture" is overturned and recorded as History's third buried shape.
  Decision 9 is the shipped gesture design.
- **R8 — Uniform:** `pattern` stays in aspirational space; the remedy
  line disambiguates. Decision 1.

**The revise round's six re-decisions, indexed**: (1) the ledger
redesign — Decision 3; (2) the vocabulary split and the tab state's
storage — Decision 2; (3) birth states, including the seam on a source
tab — Decision 2; (4) switch-back — G1, ruled at gate 2, below; (5)
dialog seeding from the tab state — Decision 2; (6) a grounded run on
a ledgered tab — Decision 5.

**Gate 2 — ruled 2026-08-19:**

- **G1 — Switch-back: EXISTS in v1, empty-ledger only, as
  recommended.** *(Predicate widened 2026-08-21 by docs/22's OR-3 to
  **empty ledger AND empty structure report**, and built: a tab holding
  a card the write path cannot record cannot wear the Grounded promise
  either, and the disabled reason names both ways back — Put back for a
  displaced row, deleting or re-homing for an imagined card. The
  reasoning below is unchanged and is exactly what the widening
  applies.)* Aspirational → Grounded is offered only while the
  ledger is empty — after "Put back" (or undo) has returned every
  displaced row. While records remain, the per-tab control is
  disabled-with-a-reason (docs/12's decision-5 seam) naming the Put
  back path, because "Grounded" is a promise (everything here is
  applyable) that a tab holding displacements cannot make, and a
  state contradicting its own facts is the conflation this project
  pays for. A switched-back tab lands **Grounded-UNASKED** — a
  deliberate switch-back is not a seam decline, so the seam may offer
  again. The alternatives stay recorded: a pure one-way ratchet was
  the acceptable simpler fallback (not needed); switch-back-anytime
  was the wrong answer — it mints a third de-facto state ("Grounded
  with displacements") nobody can define. Decision 9's
  per-tab-control paragraph carries the ruled shape.

## The problem, in the product's own terms

Some formats embed navigation inside content files. Rewriting that
navigation risks the content, so the source adapter pins those rows —
`Topic.lock`, seven kinds (`model/types.ts:47–54`) — and the app
refuses to move them: the drag declines to start
(`topicDrag.ts:175`, the `anyTopicLocked` early return — silently, no
refusal sentence; Decision 9 designs this line's death), the keyboard
declines to delete (`useKeyboard.ts:49`), and the AI validator
discards any proposal that moved one (`validate.ts`, the "LOCKED rows
are pinned" net inside `reconstructDocument`).

Correct — at write time. But the pin is currently enforced at PROPOSAL
time, which conflates two different things:

- The danger is in the ACT of writing, not in the ARRANGEMENT being
  imagined.
- The product's purpose (Roger's words): let people imagine alternative
  realities of TOC arrangements. A compelling-enough arrangement may
  move them to do the manual content edits themselves — or to edit the
  source until the app considers the move safe. Today the tool is
  forbidden from showing them that arrangement at all.

A pin, as currently implemented, is a write permission wearing a
thinking restriction's clothes. This note gives each its own clothes:
the pin keeps absolute authority over what is WRITTEN, and loses its
authority over what may be IMAGINED — provided the imagining is
labeled, at every surface, as imagination. Since gate 1 that holds for
both producers of an arrangement: the model (Decisions 2–6) and the
hand (Decision 9).

The write-safety line is restated here because everything below leans
on it: **unsafe navigation is never written, in any mode, in any tab
state, by any setting, by any producer. Nothing in this note moves
that line.** Per-kind relaxation of what the adapters will write is
explicitly out of scope (it would be "a change to what the app is
willing to write", which the charter excludes).

## Substrate: the constraint-parity object, landed

Merged at `69691ba` ("constraint parity — every enforced constraint is
now communicated"); docs/10 carries the amendment of record
("Amendment 2026-08-19 — constraint parity"). The landed shape, with
stable line numbers:

- **`RunConstraint`** (`src/ai/constraints.ts:107`) — a discriminated
  union: `pinned-rows` (rows `{id, title}` walked from the ID MAP, so
  only nameable rows are listed) and `reparent`
  (`allowed: capability ∧ permission`).
- **One producer, two consumers.** `buildConstraints` (`:123`) feeds
  `constraintPromptLines` (`:167` — what the model is TOLD) and
  `explicitViolations` (`:232` — what is pre-CHECKED); both switch
  exhaustively, so a new kind fails `pnpm check` until both sides
  answer.
- **Pinned rows are marked at the point of use**: `[pinned]`
  (`PINNED_MARKER`, `:72`) inline in the outline (`outline.ts`,
  `pushTopic`), explained once in the system message. `isPinned`
  (`:89`) is uniform over all seven lock kinds, argued at the
  declaration and in docs/10 ("Seven kinds, one marker").
- **Retry reachability landed as ruled 1b**: `run.ts` feeds
  `explicitViolations` into the existing guided retry (`problemsIn`,
  `run.ts:130`; wiring at `:52`). The pre-check is sound-not-complete;
  `validate.ts` stays the complete enforcer and the only discard site.
- **The discard copy is honest and branch-aware** (`validate.ts`, the
  "THE COPY IS A CLAIM" block in the pinned net): it consults
  `pinnedRowCount` (`constraints.ts:150`) and says either "the request
  marks every pinned row and this answer moved them anyway" or — when
  the moved rows sat inside collapsed subtrees and could not be marked
  — "use a finer granularity so every row can be marked". Decision 6's
  grounded column inherits both branches as-is.

The first draft's conditional — "if the arc lands differently…" — is
**discharged**: it landed with the shape designed against. docs/10's
amendment closes by naming this note as the incumbent's successor and
states the division of labor this note relies on: parity changed what
the model is told and when a violation can retry; **what the lock net
refuses is docs/21's question**.

**What this note adds to the object, revised at gate 1:**

1. `buildConstraints` takes the run's **mode** (Decision 2); the
   `pinned-rows` member's prompt rendering and violation semantics
   become mode-dependent (Decisions 5 and 6). Same producer, same two
   consumers, one more input — no second source of constraint truth.
2. **The first draft's "a third consumer joins the union" is
   WITHDRAWN.** Classification (Decision 3) is not a switch over
   `RunConstraint` — it is a fact about a DOCUMENT's arrangement
   (current placement vs source placement over `isPinned` rows), with
   two producers (reconstruction and the manual gesture) and its own
   derivation. The constraints object stays run-side truth (what this
   run tells and pre-checks); the **ledger** (Decision 3) is
   document-side truth (what this arrangement has displaced). Keeping
   them apart is the run-mode/tab-state split of Decision 2, one layer
   down — and the "run mode and tab state never conflate" fence pins
   it.
3. Never-empty containers and `nodesNeedTargets` remain outside the
   union, hand-parity-compliant, exactly as docs/10's amendment
   records ("folding them in is a refactor this arc did not rule on,
   and the seam is now there for it"). R5 obliges an aspirational
   FRAMING for never-empty (Decision 5); whether the build folds the
   member into the union or keeps the hand-wired block mode-aware is
   the build's refactor choice — either satisfies parity, and the
   note does not pre-empt it.

## The stale line, discharged

The first draft named one record/code disagreement: CLAUDE.md still
claimed "the reparent refusal has been enforced since Hugo v1 with no
prompt line at all". The parity merge corrected it — CLAUDE.md's
constraint bullet now carries the correction AND the post-mortem ("it
cost a real dispatch: an arc opened … to fix reparent's communication,
which was already fixed, while the actual gap was locks"). Nothing is
owed; the section stays as the record of why this note cites code over
record, and the sweep obligation ("verify it happened, two arcs in
flight against one file") is discharged by observation at `69691ba`.

## History — three rejected shapes, kept because the rejection is part of the design

### Proposal-time-only enforcement (the incumbent), rejected as an end state

The shipped design enforces the pin at three layers — gesture
(`topicDrag.ts`), proposal (`validate.ts`'s pinned net), and plan
(`sphinx.ts` `planChanges`' refusal set: `region-unavailable`,
`outside-region`, `generated-block`, plus blocking warnings gating the
save in `ChangesDialog.tsx`). The middle layer is the one this note
re-clothes, and it is worth recording why it was built that way,
because the reasoning was sound where it stood:

- The result tab was conceived as something the user would APPLY
  (docs/10: compare, keep, or close). Under that reading, a proposal
  containing unwritable moves is a defective product — showing it
  invites an apply that must then fail.
- "An invalid result is never shown" (CLAUDE.md's phrasing; docs/10's
  safety contract says it as "refuses to open any result that fails") —
  the discard was the honest surface while there was no vocabulary for
  showing a result that is valid as imagination and partially
  unwritable as an edit.

What changed is the second point: this note builds that vocabulary
(Decision 3's classification and badges, Decision 4's partial apply).
Once a tab can SAY "these four moves need your hand, here is why, here
is the edit that would unbolt each", the discard stops being the honest
option and becomes the tool forbidding the thought. The enforcement
does not weaken — it RELOCATES to the layers that own the consequence:
the plan and the save, where it already lives today.

Rejected, then, not as a mistake but as a stage: correct while the
vocabulary was missing, wrong to keep once it exists.

### Snap-back, rejected

The alternative once the tab may show pinned moves: let the proposal
open, then snap every displaced pinned row back to its original parent
— at open, or at apply. Rejected on three grounds:

1. **It is the silent downgrade this design's charter forbids.** The
   user asked for an arrangement; the tab shows a different one and
   calls it the model's. The constraint on this design is explicit: no
   silent downgrade of an aspirational proposal into an applied subset
   without the user seeing the split. Snap-back is that downgrade,
   performed at the least visible moment.
2. **It makes the canvas lie about provenance.** A tab named
   `"<source> (<model>)"` (`store/provenance.ts`,
   `provenanceTabName`) claims to show what the model produced.
   Snap-back would show a document nobody produced — not the model's
   proposal, not the user's arrangement, not the source.
3. **It destroys the product's deliverable.** The aspirational
   arrangement IS the artifact — the thing a compelling version of
   which moves a human to do manual edits. Snapping it back deletes the
   artifact to protect a write that was never going to happen anyway
   (the write path refuses regardless; Decision 4).

The shape that survives from snap-back is the **applyable projection**
(Decision 4): the same computation — displaced pinned rows returned to
their original parents — performed at PLAN time, on a derived document
the user never mistakes for the proposal, with the split counted on
screen. Snap-back's arithmetic was right; its address was wrong.

### "The model may imagine what the hand may not", overturned at gate 1

The first draft kept the manual pinned drag refused (its R7): the model
could propose a pinned move, badged; the user's own hand could not make
the identical move on the identical canvas. The draft called the
asymmetry "real and stated" and shipped "Put back" as the only pinned
gesture.

That was correct **while the gesture had no consent vocabulary** — a
drag that silently commits a needs-your-hand displacement would have
been the silent downgrade again, performed by the least suspicious
gesture in the app. It was overturned the day the seam gave the gesture
one (Decision 9): docs/13's consent-in-the-gesture pattern — labeled
consequences at the gesture, a two-option menu only at a genuine seam,
no modals for what is undoable — is exactly the missing vocabulary, and
containers v2 is the shipped receipt that it works. With it, the
asymmetry loses its justification: imagination is imagination,
whichever producer arranges the cards.

Recorded rather than deleted, because the rejection's reasoning ("no
consent vocabulary at the gesture") is the load-bearing part: any
future gesture that acquires aspirational consequences must bring a
seam with it, or it inherits the original objection.

## Decision 1 — the constraint taxonomy

### The split, and the test for membership

Two kinds, with a subdivision in the second:

- **Proposal-constraints** — binding even on imagination. Test: *would
  violating it make the result tab a lie about the document?* These
  hold in every mode, because the tab's trustworthiness is the product
  (shape-fidelity, PRODUCT.md principle 6), and no badge can label its
  way out of a fabricated or vanished topic.
- **Apply-constraints** — violable in a proposal, gated at write time.
  Test: *is the rule a fact about what can be WRITTEN — the format's
  mechanics, the files' safety, or a consequence someone must consent
  to?* Subdivided, because two different things gate them:
  - **refusal-class**: the app will not write it, full stop (pins,
    directory moves, pageless-card nesting, emptied never-empty
    containers). The gate is the adapter's refusal; the aspirational
    surface is the badge and the checklist.
  - **consent-class**: the app WILL write it if the user agrees this
    run (file-relocating parent changes). The gate is a permission,
    and it lives at apply time.

The subdivision is the answer to "is reparent a different kind than the
pins?" — **yes, and the difference is the whole taxonomy in
miniature.** A pin says *the format cannot safely record this edit* — a
fact about the source, discovered at parse. The reparent toggle says
*the user has not agreed to this consequence* — a fact about the run,
supplied by a person. Conflating them is exactly the "write permission
wearing a thinking restriction's clothes" the charter names, in the
other direction: a consent gate wearing a capability's clothes.
`permissions.ts` already keeps the two halves separate
(`fileMovesAllowed` = capability ∧ permission, with the docblock
naming both); the taxonomy adopts that split rather than inventing one.

### Every current constraint, classified

The enforcement sites are the `reconstructDocument` nets
(`validate.ts`), the parse layer (`parse.ts`), and the assembly rules.
Each row states its classification and the reason:

| constraint | enforcement today | class | reason |
| --- | --- | --- | --- |
| identity-strict parse (unknown/duplicate ids) | `parse.ts`, guided retry, then discard | **proposal** | an invented id is content invention; the tab would show a node the document does not have. Untouched in both modes (charter). |
| topic-id multiset (nothing dropped or duplicated) | multiset net, throws | **proposal** | a dropped topic is a lost branch — the shape-fidelity law's exact failure. "Imagination never licenses dropped or duplicated topics" (charter). Untouched. |
| scope pass-through (out-of-scope cards untouched) | assembly + slot-within-scope (docs/16) | **proposal** | scope is a PROMISE to the user, not a fact about files; a violation impersonates an out-of-scope change. Binding in both modes. |
| sealed sections (contents generated elsewhere) | warning + card restored, never a throw (`unmergeableSections`) | **proposal**, by displayability | a sealed card's contents were never read, so an arrangement dissolving it cannot be SHOWN honestly — there are no rows to show moved. Not a badge candidate; the existing restore-with-warning behavior is already the right surface and is unchanged in both modes. |
| the seven lock kinds (pins) | pinned net, parent-change only, throws | **apply / refusal-class** | per-kind analysis below |
| reparent where files move | conjunction net (`fileMovesAllowed`), throws | **apply / consent-class** | the format CAN record it; the question is agreement to a disk consequence. See Decision 2 for where the consent lives per mode. |
| reparent where the capability is absent | same net, capability side | **apply / refusal-class** | no shipped adapter answers false today (docs/16: "flipping it leaves the stage empty") but the contract point stays; a capability-false format simply cannot record the edit. |
| demoted section = directory move | directory net, unconditional on file-move adapters, throws | **apply / refusal-class** | "a consequence anyone can accept" does not exist — no version of the app performs a directory move (docs/18, charter parked). Aspirationally displayable: the arrangement "this section belongs inside that one" is precisely the kind of restructuring a human might execute by hand, and docs/18's own finding is that the gesture is rare, not meaningless. |
| a block is not an entry (pageless card nested) | `nodesNeedTargets` net, throws | **apply / refusal-class** | the serialization does not exist (no docname to write), but the arrangement is displayable — a topic with no `path` is a legal model state (`model/types.ts`, `path?`). Checklist remedy: give the group a page, or keep it a block. |
| never-empty containers | `emptiedContainers` net, throws | **apply / refusal-class — RULED R5: classify** | the schema fact (`minItems: 1`) is about the FILE; "this tab should not exist" is a legitimate aspiration whose remedy is a human edit to `docs.json`, and the checklist names that edit. The empty-lane display cost is accepted by the ruling; the build renders a card-less container lane rather than hiding the emptied container (a container that vanished from the canvas while `docs.json` still requires it would be the canvas lying about the file). |
| chain rearrangement (cards across containers) | warning only; export partially no-ops (`chainRearrangeWarning`) | **apply / refusal-class** | already ships as a disclosed unwritable arrangement — the nearest existing relative of an aspirational proposal, and the receipt that displaying-what-won't-export is survivable. Folded into the classification surface rather than left as a lone warning string. |
| rename capability per kind | silently reverted at `decideTitle`; never thrown | **apply / refusal-class — out of v1** | parity records this as its own deliberate omission (docs/10, "A third instance, recorded and not fixed": enforcement is *ignore*, not *discard*). Aspirational RENAMES are real (docs/19's deferred Sphinx rename is exactly an aspiration with a named unlock) but this note's charter is moves; renames enter the taxonomy, not the v1 build. |

### The seven lock kinds, one by one

Gate 1 ruled the family uniform (R8 explicitly for `pattern`); the
argument stays recorded because the per-kind REASONS drive the badge
copy: **uniform in OUTCOME (all seven violable in proposal, all seven
refused at write), distinct in COPY (each badge carries its own kind's
cause, consequence and remedy).** The test each kind answers: *does
imagining this row elsewhere make the tab lie about the document?* —
with the badge carrying the pin, the tab does not lie; it says
"imagined there, pinned here, and here is why".

The kind-by-kind reasons, anchored to what each kind PROMISES
(docs/19's promise table; tooltip copy in `model/locks.ts`,
`lockTooltip`):

- **`atomic`** ("I did not descend; this subtree is N deep" — about
  SIZE). The pin is epistemic: moving it relocates N entries nobody has
  seen on canvas. The imagined move is fully coherent — the subtree
  moves as one unit, which the tooltip already says — and the badge's
  job is to carry the N. Remedy: none needed in the files; the unbolt
  is an import that descends (a capability question, not a corpus
  edit). The one kind whose checklist line is about the APP's
  boundary, and the copy must not send the user to edit files.
- **`reference`** ("a second listing; another is primary" — about
  IDENTITY). Imagining the reference elsewhere is a statement about
  where the second listing should live — coherent. Remedy: edit the
  entry in the source file; the primary (named by `owner` when known)
  is unaffected.
- **`pattern`** ("this line is a pattern, not a docname" — about
  SYNTAX). **Ruled uniform at gate 1 (R8).** The row is a RULE; "move
  it" means "the pages this pattern generates should list there" —
  coherent as an aspiration about the rule's output, and the remedy
  line resolves the rule-vs-output ambiguity in the user's hands.
  `lockTooltip`'s shipped remedy is *"To rearrange them, replace the
  pattern with explicit entries in the source file."*
  (`model/locks.ts`, the `pattern` case, quoted exactly); the badge's
  displacement continuation — "…then the move is real" — is NEW
  interpolated copy this note adds, not existing text, so a builder
  extends the vocabulary file rather than copying a string from here.
- **`globbed`** (block enforcement worn by the line — the entry may be
  an ordinary docname). The line exists in the source and is
  individually movable in principle; the BLOCK is generated, so the
  app may not rewrite it (docs/19: enforcement is the block's, kind is
  the line's). Remedy: replace the block's pattern with explicit
  entries — after which the plain docname's move is an ordinary entry
  edit. The cleanest "unbolting" story of the seven.
- **`outside-region`** (the block sits above prose — about WHERE). The
  archetypal write-mechanics pin: nothing is wrong with the entry, the
  file's shape just puts it outside the splice region (docs/19's
  boundary law). Remedy, already in the tooltip: move the toctree run
  to the end of the file. The kind most likely to actually get
  unbolted by a motivated user, which is the product case for this
  whole note — and the dominant kind in practice: godot's 47 pinned
  rows are 46 `outside-region` and 1 `atomic` (docs/10's measured
  table).
- **`external`** ("this target is outside the project" — about
  TARGET). The entry line is real and lives in a writable region; the
  pin is conservatism about a line the app cannot verify. Imagining it
  elsewhere is coherent; remedy: edit the entry in the source file.
  (Mintlify produces this kind too — see "Two producers".)
- **`missing`** ("this target does not exist" — about TARGET, and the
  only error-tier kind). Imagining a dangling entry's future home is
  arguably the most USEFUL aspirational move of the seven: the row is
  already a to-do (create the document), and the aspiration extends it
  (create it, and list it here). The badge composes with the existing
  error-tier glyph rather than replacing it — the corpus fault and the
  imagined placement are two facts, and the tier law (docs/19,
  `model/locks.ts` `LOCK_TIER`) keeps the warning token on the fault.

**Two producers, and what that buys the design.** Pins are not a
Sphinx-only phenomenon: `sphinx.ts` produces every kind at parse
(docs/19's kernel row alone shows `reference` 42, `pattern` 18,
`atomic` 1, `external` 1; blender adds `missing` 4), and **Mintlify**
produces `external` and `pattern` for `href` nodes and unrecognized
shapes (`formats/adapters/mintlify.ts`, `lockedTitle` / `lock:`
assignment). So the classification machinery must live at the model/AI
layer, keyed on `Topic.lock`, never on an adapter id or a
collection-vs-format branch — the second producer is already here, and
it is inverse in kind (format adapter, JSON nav, no snapshot, write
path = whole-file serialize) exactly the way this project prefers its
second producers. Decision 3's ledger design is forced by this
inversion.

### What the taxonomy is NOT

Not a severity ladder, and not a write-relaxation schedule. The
grounded mode enforces every row of the table exactly as today; the
aspirational mode moves only the apply-constraint rows from "discard"
to "classify"; and no row's WRITE behavior changes under any mode or
tab state — the adapters' refusal sets (`sphinx.ts` `planChanges`, the
blocking warnings, `simulatePlan`) are untouched by this entire design.

## Decision 2 — modes and states

### One word, two referents — split before shipping

Gate 1's R7 widened "Aspirational" into two facts, and the two-sentence
test says they cannot share a name in code:

- *"The run MODE says what the model was allowed to imagine during one
  call."* Chosen per dialog open (R3), recorded immutably in
  provenance, over the moment it is used.
- *"The tab STATE says whether this tab's arrangement may hold pinned
  displacements going forward."* Entered by the seam or the per-tab
  control, persistent, mutable — a standing fact about the tab, not
  about any one run.

  > **[amended 2026-08-21, docs/22 OR-3 — ruled, and built in
  > `docs22-machinery`]** The sentence widens to *"this tab may hold
  > ARRANGEMENTS THE APP CANNOT WRITE, labeled"* — pinned displacements
  > and unwritable structure alike. One switch, one meaning: two
  > consents would put a second indistinguishable toggle on the tab and
  > force the seam to say which kind of imagination it was asking
  > about. The trade was recorded and accepted at that gate: consent
  > given at one seam licenses later imagined structure on the tab
  > without a fresh seam, and the mark, the checklist and the Overview
  > carry the visibility. Both predicates below ride this ruling.

Two names in code: **`RunMode`** (`"grounded" | "aspirational"` — on
`ReorganizeOptions` and `TabProvenance`) and the **tab state** (on
`TabState`, below). One word in the UI — "Aspirational" — because the
surfaces disambiguate (the dialog's control is visibly about a run; the
tab chrome is visibly about the tab), and inventing a second user-facing
word would make the product explain a distinction the code exists to
absorb. The "run mode and tab state never conflate" fence pins the
rule.

**The tab state is NOT provenance.** Provenance is immutable run
metadata — "no gesture in the app alters it" is its founding sentence
(`store/provenance.ts`). The state mutates by design. It lives beside
provenance on the tab record, never inside it.

**Storage and persistence.** Two optional fields on `TabState`
(`store/index.ts`, beside `provenance?` at `:37`):

- `aspirational?: true` — the state itself; absent = Grounded.
- `seamDeclined?: true` — the sticky decline memory (Decision 9);
  absent = the seam may offer.

Both persist with the tab, the `provenance` pattern
(`persistence.ts`: "spread so an absent provenance stays ABSENT in the
payload") — **absent reads as Grounded-unasked, no `PERSIST_VERSION`
bump**, asserted not assumed, on the provenance precedent (the cost of
being wrong is every user's tabs discarded on upgrade). Deliberately
NOT the `topicsLocked` pattern — that field resets to `false` on
rehydrate (`persistence.ts`, the tab reconstruction) because it is
transient VIEW state; the aspirational state is a consent memory, and a
consent that silently evaporates on reload would re-ask a question the
user already answered, or worse, re-refuse a tab full of badges as if
they were illegal. Two fields rather than one three-valued union
because they answer two questions ("what is the tab's state?" / "was
the seam declined?") that merely correlate — a union member
`"declined"` would make one value answer both, the house conflation
with three letters saved.

### The two modes (run postures)

| | **Grounded** | **Aspirational** |
| --- | --- | --- |
| proposal space | what the app can apply (today's semantics, verbatim) | any arrangement of this document |
| proposal-constraints | binding | binding — identical |
| apply-constraints | binding at proposal (discard, with parity's honest branch-aware copy) | classified, badged, never discarded |
| result tab | applyable by construction (caveat: the writability gap, Decision 8) | applyable subset + labeled remainder |
| result tab's birth state | Grounded — unless it inherits displacements (below) | Aspirational |
| who it serves | the differential workflow; users who want "what can I have today" | the imagining user; the reviewer audience shown a target structure |

**Grounded is today's run, unchanged.** This note deliberately defines
it by reference rather than by redesign: the landed parity arc gives it
honest communication (`[pinned]` markers, the reparent line),
retry-reachable violations (ruled 1b), and branch-aware discard copy.
Least change is the point — the differential workflow depends on the
grounded run staying comparable across time.

**Shapes considered for the structure itself**, before the two-mode
answer:

- *No modes — always classify.* One run posture; every proposal opens
  with whatever badges it earned. Rejected: grounded's guarantee
  ("what you see can be applied") is a real product property the
  differential workflow leans on, and a user who wants an applyable
  answer should be able to ASK for one — the model told "pinned moves
  will be labeled" produces different arrangements than one told
  "pinned moves are rejected", so the postures are not one posture
  with two renderings. (The gate also confirmed grounded's discard
  semantics explicitly, which a no-mode design cannot honor.)
- *Per-constraint toggles* — "allow pinned moves", "allow directory
  moves", … one checkbox per apply-constraint class. Rejected: it
  rebuilds the conflation at finer grain (each toggle is again a
  proposal-shaper wearing a permission's clothes), multiplies the
  dialog's surface with choices whose combinations are mostly
  meaningless, and buys nothing the mode plus the checklist does not —
  a user who objects to one CLASS of aspirational move can simply not
  do those edits, and "Put back" covers the per-row objection.

### Naming — RULED (R1)

**Grounded / Aspirational, adopted.** The alternatives stay recorded
with their reasons, including the one the gate itself considered:

1. **Grounded / Aspirational** — adopted. "Aspirational" is the
   charter's own word and the checklist's natural adjective;
   "grounded" states the promise (every move stands on what the app
   can write) without implying the other mode is untrustworthy.
2. *Production / Sandbox* — considered at gate, **declined**: an
   environment metaphor is the wrong axis. Both modes produce the same
   KIND of artifact (a tab, never a write); "production" claims write
   authority the mode does not carry, and "sandbox" implies the
   aspirational tab is throwaway when it is the deliverable.
3. *Buildable / Blue-sky* — declined in draft: "blue-sky" undersells
   that the proposal is still identity-safe and multiset-safe.
4. *Within limits / Beyond limits* — declined in draft: "limits"
   points at the app, and half the pins are facts about the corpus.
5. *Faithful / Visionary* — declined in draft: "faithful" implies the
   aspirational tab is unfaithful, the exact reading the badges exist
   to prevent.

Dialog copy under the adopted names: *Grounded — every proposed move is
one this app can write back.* *Aspirational — the model arranges
freely; moves the app can't write are labeled for you.*

### Default, per-run, seeding

- **Default: Grounded** on a Grounded tab. Least surprise; today's
  behavior; the mode whose result needs no new literacy.
- **Per-run, per-dialog-open — RULED (R3).** `mode` joins
  `ReorganizeConfig` and resets with the dialog like every sibling
  field (`ReorganizeDialog.tsx`, `initialConfig` on open). Device
  persistence stays ruled out.
- **Seeding (re-decision 5, answered):** opening the dialog on a
  tab whose STATE is Aspirational seeds the mode radio to
  Aspirational for that dialog session. This is seeding, not
  persistence — the value comes from the tab in front of the user, not
  from a device store, and R3's reasoning (a remembered deviation
  self-perpetuates invisibly) does not apply to a visible property of
  the visible tab: the tab already wears its state in its chrome, so
  the seeded default surprises no one and matches the standing choice
  the user made for exactly this document. A Grounded or
  Grounded-declined tab seeds Grounded. The radio stays live either
  way — seeding sets the default, never the answer.
- **Presets never set the mode.** A preset is an editable instruction
  template (docs/10) and stays two-field (`presets.ts` `defaults`).
  The mode is not a permission — but it is not an optimization goal
  either; it is a run posture, and a preset that flipped it would make
  "Diátaxis" mean different things on different days. Stated here so
  the next person who notices "instructions may ride presets" does not
  fold the mode in on that syllogism.

### Birth states (re-decision 3, answered)

One rule, producers enumerated:

> **A tab is born Aspirational iff it holds displacements at birth or
> was produced by an aspirational run; otherwise it is born
> Grounded-unasked.**

> **[amended 2026-08-21, docs/22 OR-3 — ruled, and built]** The first
> clause reads **"holds displacements OR STRUCTURAL REMAINDERS at
> birth"**. The gap it closes is not hypothetical: a GROUNDED run on a
> Sphinx tab can hoist a leaf — the validator opens it deliberately,
> and the pinned net is parent-change-only — so the result arrives
> holding a creation record with an EMPTY row ledger, and under the
> unwidened rule it was born Grounded while holding structure the app
> cannot write. Read from the derived report exactly as
> `hasDisplacements` reads the records; a collection result carries its
> snapshot through the rebuild, so the derivation is available at
> birth.

- An **aspirational-run result tab** arrives with the state enabled —
  even when its ledger is empty (the model may simply not have moved a
  pinned row; the user chose the posture and the tab keeps it).
- A **grounded-run result tab** from an unledgered source arrives
  Grounded.
- A **grounded-run result tab from a LEDGERED source** inherits the
  displacements (the carry is Decision 3's; the run semantics are
  Decision 5's) and is therefore born Aspirational by the first clause — a tab holding displacements cannot honestly wear the
  Grounded promise, whatever run produced it.
- A **fresh import** arrives Grounded-unasked.
- A **duplicate** copies the source tab's state and decline memory
  with the rest of its tab facts; a **reopened tab** restores what it
  had. Both are consumers of the persisted fields and each gets its
  own assertion (the provenance carry precedent, docs/10).

**The seam may fire on a SOURCE tab, and that is by standing law, not
an oversight.** Manual edits are in-place — "the original is never
touched" is AI-results law (docs/10: the RESULT opens as a new tab and
the source is not modified by the RUN), not editing law; a user has
always been free to rearrange their imported tab directly, and undo is
the safety. So a pinned drag on a fresh import offers the seam, and
accepting switches THAT tab to Aspirational. Stated here so it is a
sentence rather than a discovery; the alternative — cloning a new tab
on seam-accept — was considered and declined: it would make one
gesture (drop) mint a surprise tab, and the user who wants a pristine
source keeps it the way they always have, with duplicate-before-edit
or undo.

### Where the one permission moment lives, restated for the widened design

Write authority appears exactly once, at apply time — `Save to folder`
/ `Download .patch`, gated by `saveDisabled` (`ChangesDialog.tsx`),
plus the plan-level file-move consent of R4 for the consent-class
subset. Everything upstream of it authorizes NOTHING on disk:

- the run MODE shapes proposal space (instruction-class);
- the tab STATE shapes which gestures the canvas accepts
  (imagination-class — the seam's "yes" licenses a displacement to
  EXIST on the canvas, labeled; it does not bring its write one inch
  closer);
- the grounded dialog's `allowFileMoves` toggle stays what docs/16
  made it — proposal-space consent, retained unchanged in grounded
  runs, and its moves write at Save exactly as today: **no second
  consent control appears for a grounded run's moves**, because
  docs/16's ruling stands and a double-ask would teach users to
  ignore consents. For aspirational runs the toggle is not shown (the
  space is already maximal), and the consent it would have carried
  moves to apply: R4's control, which appears exactly when the ledger
  holds CONSENT-kind records (Decision 3) — a document fact, so the
  apply surface never has to ask which run produced the plan.

The seam is deliberately worded as a mode choice, never a move
confirmation (Decision 9), for exactly this reason: a "confirm move?"
dialog would read as authorization, and there is nothing to authorize
— the move is thought, not action.

## Decision 3 — the ledger, classification and badging

### Classification is computed by the app, never by the model

No new response syntax. The model's answer stays the outline grammar
(`parse.ts` untouched); which moves are aspirational is DERIVED by
comparing current placement against source placement over `isPinned`
rows. Trusting model annotations would create a second source of truth
for a fact the app can compute, and an annotation the model forgets
would silently downgrade a pinned move into an applyable one — the
exact lie the identity-strict layer exists to prevent, one field over.

### The ledger, redesigned at gate 1: two record kinds, derived where derivable, cross-checked where both exist

The first draft stored the classification once at tab creation,
run-stamped. **That design is dead, and R7 is what killed it**: with
the manual gesture in scope, a hand can displace a fourth row a week
after the tab was born — and every consumer of a stored count starts
lying the moment it does. A ledger is a fact about the ARRANGEMENT,
and the arrangement changes; only something that changes with it can
be trusted.

**Two record KINDS first, because they answer different questions and
have different sources of truth:**

- **`pin`** — "this pinned row sits away from its source placement."
  Producer-blind: true whether the model or the hand displaced it, so
  it is DERIVABLE from placement alone.
- **`consent`** — "this file-relocating move was proposed by a run
  that had no proposal-time consent to give it." Producer-DEPENDENT: a
  manual cross-section drag on a file-move adapter carries its consent
  in the gesture (docs/16), and a grounded run carries it in the
  dialog toggle, so the same placement fact means different things
  depending on who made it. A consent record is therefore RECORDED
  only — written by aspirational reconstruction for unpinned parent
  changes on adapters declaring `reparentMovesFiles` — never derived,
  and
  **superseded by the hand**: any manual move of a consent-recorded
  row clears the record, because the gesture's own consent replaces
  the run's lack of one (moving it home clears it like any other
  return; moving it elsewhere is a docs/16-consented reparent). It is
  what keys R4's apply-time control (Decision 4) as a document fact.

Two mechanisms for the `pin` kind, one selector:

- **Collection tabs: DERIVED.** The snapshot rides
  `doc.extras.files` through every rebuild (`validate.ts` carries
  `extras` on the result; `filesOf` reads it), and re-parsing it
  yields original placement — the comparison `planChanges` already
  performs to declare `entryMoves` (`sphinx.ts`, `wasIn`). The ledger
  selector runs the same comparison filtered to `isPinned` rows:
  correct regardless of which producer displaced the row, and
  **undo-safe for free** — undo changes the model, the next derivation
  reflects it, which is docs/11's founding argument for planning from
  (files, model) with no journal, applied to classification.

  > **[amended 2026-08-19, post-build]** The derived reading keys
  > on the row's NATURAL key — `path ?? ~title`, sphinx.ts's
  > `entryKey` lifted to the neutral layer
  > (`model/ledger.ts:naturalKey`) — never on node ids, which
  > remint on every parse (`newId()`, random by design). This decision's
  > original wording implied an id-keyed placement comparison; its
  > own citation (`wasIn`, the `planChanges` comparison) already
  > carried the correct key, which is why the build could resolve
  > the collision without a design fork. Recorded so the sentence
  > and the code say one thing.

- **Format tabs: RECORDED, per-topic, undo-participating.** Mintlify
  pins have no snapshot behind them; original placement exists only at
  the moment of displacement. So the displacing act writes it down
  where the displacement lives: `Topic.displaced?: { parentId,
  parentTitle, index, kind }` — a first-class model field, NOT an
  `extras` entry, for the reason `Topic.lock` is not in extras
  (`model/types.ts`: the core must interpret it to badge, project and
  put back, and extras is the bag the core never interprets). `index`
  is the row's position among its original parent's children at
  displacement time — a recorded MEASUREMENT of a past arrangement
  that the projection uses once to place a restoration (Decision 4),
  never an address anything looks a node up by, which is what keeps it
  clear of the index-addressing bug class (nothing in this
  design keys on it). Because it is document data
  mutated by commands, it rides Immer patches: the displacing command
  writes the move and the record together, so **undo removes both by
  inversion** — nothing to keep in step. The record is written by
  every displacing producer (the seam-accepted drag, and
  reconstruction when it classifies), is left UNTOUCHED by further
  moves of an already-displaced row (the origin does not change
  because the row moved twice), and is CLEARED by any move that lands
  the row back at `parentId` (putting a thing back is not a
  displacement, whoever does it).
- **The selector of record**: for `pin` records, derived where a
  snapshot exists, recorded otherwise; `consent` records are read from
  the recorded field on every tab (recorded-only by design, above). On
  collection tabs both pin sources exist — producers write `displaced`
  uniformly — and **the derived and recorded PIN records must agree**:
  the display-is-its-own-oracle rule (docs/19's reach-label
  precedent), wired as a test and a DEV assertion. A disagreement
  names a producer that forgot to write, or a carry path that dropped
  the field — caught as a red check instead of a wrong badge. The
  oracle deliberately does not cover `consent` records: there is no
  second derivation to check them against, and inventing one would
  mean deriving a fact (who consented) that placement cannot carry.

**Reconstruction carries `displaced` like it carries `lock`.** A
displacement record is a fact about arrangement-vs-source, and a
rebuild that dropped it would silently launder a pinned move into an
ordinary row on the next run (the docs/13 chain-carry lesson,
verbatim: reconstruction now carries `chain`, `sealed` and `lock` on
every path because dropping one flattened every tab). `displaced` is a
**new input species** for every path that rebuilds topics —
reconstruction's three build sites, recovery, duplicate, persistence —
and each consumer gets its assertion, per the consumer-sweep rule.

Ledger record shape, assembled by the selector from either source:
`{ topicId, kind: "pin" | "consent", lockKind?, originalParentId,
originalParentTitle, originalIndex, carrier? }` — `lockKind` on `pin`
records only; `originalIndex` from the snapshot where derived and from
`displaced.index` where recorded; `carrier` is the file whose
construct pins the row,
derivable on collection tabs from the snapshot (the planner's own
host derivation) and absent on format tabs unless the adapter can name
it: **absent, never guessed** (the guard-consumes-declared-inputs
rule).

**Substrate reconciliation, restated from that section:** the ledger
is document-side truth with two producers; it is NOT a third consumer
of the `RunConstraint` union. The union answers "what does THIS RUN
tell and check"; the ledger answers "what has THIS ARRANGEMENT
displaced". The draft's "third consumer" framing is withdrawn.

### The badge

- **One per PIN-kind ledger record** — a displaced pinned row — in
  the row's existing mark region. **`consent` records get no canvas
  badge, deliberately**: the row is ordinary, movable, and
  writable-with-consent, so a canvas mark would cry wolf about a row
  nothing is wrong with; its surface is Review changes — the R4
  control and, when declined, the "declined this run" list (Decision
  4) — because the fact it carries is entirely about the write. It COMPOSES with the lock glyph (the
  row is still pinned — that fact did not change) rather than
  replacing it.
- **Tone: the intent tone, AUTHORIZED at gate 1 (R2).** The
  tier-membership test (docs/19, `model/locks.ts`: "does this mean
  something in the FILES should change?") puts it embarrassingly close
  to the error tier — an aspirational move MEANS something in the
  files should change — but the two-sentence test splits them: *"the
  warning token marks a fault in the corpus"* / *"the warning token
  marks a move awaiting your hand"*. A fault and an intention are
  different kinds of thing; painting intention in the fault's tone
  spends the error tier's jump (the same economy that keeps six lock
  kinds monochrome). The docs/05 scoped dated amendment that pins the
  tone's values **lands with the build, not this note** — listed under
  "Sweep obligations" as a build obligation; docs/05 is cited here,
  not amended by a design draft.
- **Tooltip grammar: cause → consequence → remedy**, reusing
  `lockTooltip`'s per-kind copy as the cause/remedy source (one
  vocabulary file, one more consumer — the arrangement `locks.ts`
  exists for), plus the displacement interpolation:

      Imagined under "Tutorials" — pinned under "Getting started".
      In a glob block (reference/index.rst): the block's entries are
      generated, so no line in it is one the app may rewrite.
      To make this real: replace the pattern with explicit entries,
      then re-import and re-run.

- **"Put back", per badge.** Return this row to its original parent —
  one undoable command that executes the move and clears the record
  together. Still wanted after R7, but its rationale changes: the
  draft justified it as the ONLY pinned gesture; now it is the
  CONVENIENT one — the drag can also return a row home (any move
  landing at the origin clears the record), and Put back is the
  one-click form that reads the ledger so the user does not have to
  find "home" by eye. Legal by construction — `commands/` has never
  enforced locks (the enforcement sites are the drag, the keyboard and
  the AI net; `validate.ts`'s own comment records that "Nothing in
  `commands/`, `guards.ts` or here did" before the AI net was added)
  — and safe by direction: restoring the pin's truth cannot create a
  write hazard.

### The counts, and the Overview

- **The result view says the split before the tab opens.**
  `ReorganizeSummary` gains the aspirational count; the dialog's
  result view states it in one line — *"14 moves — 11 the app can
  write, 3 need your hand"* — so the no-silent-downgrade constraint is
  met at the earliest surface, not first at Review.
- **The Overview gains one attention line** on tabs holding `pin`
  records: *"Aspirational: 3 moves need your hand"* — the count is of
  `pin` records (`consent` records surface at Review, where their
  question lives), split by lock kind beneath it per the house rule (counts split by kind,
  never summed into one), subjects focusable (unlike orphans, every
  displaced row EXISTS on canvas, so focus works — the affordance is a
  link, not a stat).
- **Review changes integration is Decision 4's checklist** — the same
  records, rendered where the write decision happens.

## Decision 4 — partial apply

### The mechanism: plan the projection, never filter the plan

At apply time (Review changes for collection tabs; Export for format
tabs), the app computes the **applyable projection** of the document:
every projected record's subtree (`pin` records always; `consent`
records while the R4 control is off) returned to its original parent —
MEMBERSHIP is the exact obligation, because membership is what the pin
refuses to write. Position within that parent is restored exactly
where derivable (collection tabs: the snapshot re-parse carries the
full original order, so the row lands at its original index and the
re-plan emits nothing for it) and from `originalIndex` clamped to the
current sibling count otherwise (format tabs). The residual is stated
rather than hidden: if the original siblings were themselves
rearranged after the displacement, the restored POSITION is
approximate while membership stays exact — visible in the ordinary
Review diff, never silent, and consistent with the promise analysis
(no lock kind promises position; docs/19, and the parent-change-only
net for the same reason). Everything else stays exactly as
arranged. Then the EXISTING pipeline runs on the projection,
unmodified: `planChanges(files, projection, order)` → blocking
warnings → `simulatePlan` → save (`ChangesDialog.tsx` flow, unchanged
in structure).

Explicitly rejected shape: computing the plan from the displaced
document and filtering out the unsafe `FileChange`s. A plan is not
separable per-change — ordering, renumbering and cross-file edits
interdepend (docs/16's weight-at-destination; docs/19's two-edit
cross-file moves) — and a filtered plan is a document nobody verified.
The projection keeps the verification story whole: the plan is computed
from a real document and simulated against it, exactly as every plan
today.

**Producer-agnostic and mode-agnostic by construction.** The gate keys
on the LEDGER — a fact about the document — never on the tab state or
the run mode (the "tab state never gates a write" fence). So the same machinery serves an
aspirational-run result tab, a grounded-run tab that inherited
displacements, and a SOURCE tab the seam switched: R7 widened the
producers and the apply design did not move, which is what keying on
the document bought.

### The consistency proof

The charter demands the applied subset be provably consistent on disk.
Four invariants, each with its enforcement:

1. **Pinned rows stay put.** By construction: the projection returns
   every displaced pinned row home before the planner sees anything,
   so no plan line can express its displacement. Belt: the adapters'
   own refusals (`sphinx.ts`'s frozen-prefix check — "blocks above the
   prose … must arrive unchanged" — and the globbed/mid-file refusal
   set) are still live underneath, unchanged, so even a defective
   projection cannot reach an unsafe write. Two independent layers,
   and the outer one is the shipped one.
2. **The projection is a valid document.** The same Layer-5 nets that
   guard a grounded result run over the projection (multiset holds
   trivially — the projection only re-places; never-empty and the
   directory/block nets re-answer on the projected arrangement). A
   projection that fails a net blocks the save with the net's own
   sentence — this can genuinely happen (an arrangement whose
   applyable part alone would empty a container) and the failure is
   honest and names the cause.
3. **Nothing written references the imagined state.** Structural, not
   filtered: the displaced arrangement never reaches the planner, so
   no byte it writes can encode it. There is no "reference" to leak —
   nav formats have no forward-pointer species that could name a
   future arrangement — but the property is stated as a prohibition
   test anyway (fences get absence tests): the plan produced from a
   projection is byte-identical to the plan produced from an
   identical document arranged that way directly.
4. **The split is visible at the gate.** The verified line's copy
   changes for ledgered tabs — the shipped sentence ("re-parsing these
   N file changes reproduces your canvas exactly",
   `ChangesDialog.tsx` `changes-verified`) becomes false the moment
   the plan reproduces the projection instead. Post-change:
   *"Verified: these N changes reproduce the applyable part of your
   canvas — 3 aspirational moves are left to you, below."* A
   capability flip obligates the copy sweep; this is the sweep, named
   in advance.

**After a save, the checklist survives and the plan collapses —
both correctly.** `refreshCollectionFiles` swaps the snapshot for the
post-save contents (`ChangesDialog.tsx`), in which pinned rows sit at
HOME; the still-displaced canvas rows therefore still derive as
ledger entries (the remainder is still owed), while re-planning the
projection against the new snapshot returns `[]` (nothing left to
write) — docs/11's "the plan visibly collapses to empty", holding
with a remainder on screen. The two surfaces disagree in exactly the
honest way: nothing left for the app, three things left for the hand.

### The file-move consent, at apply — RULED (R4)

The control appears exactly when the ledger holds **`consent`
records** (Decision 3) — file-relocating moves an aspirational run
proposed with no proposal-time consent to carry. Review changes then
carries a plan-level consent control, default OFF, the `writeAliases`
precedent (`ChangesDialog.tsx` — plan-level, one decision for a burst
of moves). ON includes those moves in the plan; OFF (the default)
projects them home, and they join the remainder list labeled
**"declined this run"**, because "the app cannot write this" and "you
chose not to write this today" are different facts and the list must
not blame the format for a choice the user made.

Scoping by record kind is what keeps every other flow untouched: a
grounded run's moves were dialog-consented (docs/16) and produce no
`consent` records, so no second control appears and Save behaves as
today; a manual reparent's consent is the gesture itself and likewise
records nothing. The control never has to ask which run produced the
plan — the document says.

### The checklist — RULED (R6)

**Content** — the remainder list is `pin` records (needs your hand)
plus declined `consent` records (declined this run):

    ASPIRATIONAL — needs your hand (3)
    1. "Using the Project Manager" — imagined under "Tutorials",
       stays under "Getting started".
       Pinned: above prose, in getting_started/index.rst.
       To make it real: move the toctree run to the end of
       getting_started/index.rst, then re-import and re-run.

The grammar is the badge's (cause → consequence → remedy, from
`lockTooltip` + displacement), because the checklist and the badge are
two renderings of one record and must not drift. For an R5 item the
remedy names the by-hand `docs.json` edit ("remove the emptied tab
from docs.json yourself — the app never deletes"); for a directory
move it names the by-hand move and the redistribution alternative in
the same words the drag refusal uses (one truth, N surfaces).

**Form:** the Review-changes panel section always, rendered above the
file rows (the `entryMoves` precedent — the gesture above what it
costs on disk, file rows never replaced); a comment block in the
`.patch` preamble when a checklist exists (the self-documenting-patch
precedent, docs/16 — the instruction travels with the bytes); a "Copy
checklist" affordance for the folder-save user. **No file is written
into the user's folder** — a checklist file would be a new species of
write (a non-corpus file in the corpus), refused with its reason.

**Lifecycle.** Recomputed with the plan on every dialog open (no
journal). It does NOT track the disk: after the user performs a manual
edit, the snapshot deliberately does not know (docs/15 — the snapshot
is never a disk mirror, and re-reading would absorb concurrent edits).
The reconciliation path is the honest one the architecture already
has: **re-import the folder, and the unbolted rows arrive unpinned**;
re-run or re-arrange from there. Named as the workflow rather than
papered over; the diff view between tabs (docs/08, highest-value
backlog) is the future upgrade that would let the re-imported document
be compared against the ledgered tab directly — and this note's ledger
and mode provenance are typed feed for exactly that comparison.

## Decision 5 — prompt communication per mode

The landed parity rendering is the substrate; the mode changes the
`pinned-rows` FRAMING, not the mechanism. `constraintPromptLines`
becomes mode-aware (one more exhaustive input, same producer):

**Grounded** — as parity ships it, verbatim (`constraints.ts:167`):
markers inline, one explanatory block, imperative ("Keep each of them
under the exact same parent it already has … A single moved pinned row
causes the whole answer to be rejected."), plus the reparent line per
`allowed`.

**Aspirational** — the same markers (same `PINNED_MARKER`, same
outline serialization — the payload diff between modes is the system-
message block and nothing else, assertable as a DIFF exactly like the
streaming amendment's `stream: true`), with the block reframed:

    PINNED ROWS: lines ending in [pinned] are pinned in place by the
    source document — the app cannot write a move of these rows; a
    human can. You MAY move them when the arrangement genuinely calls
    for it: each such move will be labeled for the user to carry out
    by hand. Prefer arrangements that need few pinned moves over
    arrangements that need many. Never rename a [pinned] row.

An informed dream beats an ignorant one: the model can weigh a pinned
move's cost, minimize gratuitous ones, and spend them where the
structure demands it. The "prefer few" sentence is the weighing
instruction; it is advisory (nothing enforces a minimum), which is
correct — the enforcer downstream classifies rather than refuses, so
there is no enforced-but-uncommunicated gap opening here in either
direction.

Two mode-dependent details beyond the pinned block:

- **The reparent member** renders its ALLOWED branch unconditionally
  in aspirational mode — proposal space is wide by definition — and
  the consent it used to carry has moved to apply time (Decision 2,
  R4).
- **Never-empty gains an aspirational framing (R5 obliges it).** The
  grounded block stays parity's hand-wired imperative
  (`prompt.ts`, the `neverEmpty` block: "at least one of its ids must
  still appear"); the aspirational rendering states the fact and the
  labeling instead: *"this format requires at least one section in
  each group below; you may propose emptying one, and it will be
  labeled for the user to resolve by hand."* Enforcement-and-
  communication ship together applies to classify semantics exactly as
  to discard semantics — a silently-classified violation the model was
  told was forbidden would make the model's compliance WORSE than the
  surface demands. Whether this ships by folding never-empty into the
  union or by making the hand-wired block mode-aware is the build's
  refactor choice (Substrate, delta 3).

**A grounded run on a ledgered tab needs one sentence, and here it
is** (re-decision 6): pinned markers describe the rows' CURRENT
placement — the document as it stands, inherited displacements
included — and "keep each under the exact same parent" therefore
holds displaced rows at their DISPLACED positions. A grounded run on a
ledgered tab cannot ADD displacements, inherits the existing ones
(carried per Decision 3), and its result projects them home at apply
like any other ledgered tab. Nothing in the machinery needed changing
for this — the net compares against the run's input document, not
against the source of the source — but the sentence is stated so it is
a design fact rather than an emergent surprise. (The result tab is
born Aspirational by the birth rule, since it holds displacements.)

**A side effect worth naming: the aspirational framing closes
uncommunicated-refusal gaps as a class.** In grounded mode, every
refusal-class net needs its own prompt line or it burns calls (the
parity incident). In aspirational mode the blanket framing — "moves
the app can't write are labeled" — covers the whole family at once,
because nothing in the family is refused. The mode is, among other
things, the cheap end of the parity ledger.

## Decision 6 — validator semantics per mode

| net (`validate.ts`) | grounded | aspirational |
| --- | --- | --- |
| identity-strict parse (layer above) | retry → discard (unchanged) | identical |
| multiset | throw (unchanged) | identical — imagination never licenses dropped or duplicated topics |
| scope assembly + slot-within-scope | structural (unchanged) | identical |
| sealed restore + warning | warn + restore (unchanged) | identical |
| pinned rows | throw, with parity's branch-aware honest copy (marked vs unmarkable-at-this-granularity) | **classify**: write `displaced` records, no throw |
| demoted section = directory move | throw | **classify**: record, kind `directory-move`; checklist remedy names the by-hand move and the redistribution alternative |
| a block is not an entry | throw | **classify**: remedy "give this group a page, or keep it a block" |
| reparent conjunction | throw (which-half-refused decides the sentence, unchanged) | **classify as `consent` records** (Decision 3) — the permission no longer gates proposal space; the records key R4's apply-time control, where consent actually lives. The capability-false branch still classifies as refusal-class. |
| never-empty containers | throw (unchanged) | **classify — RULED (R5)**: record against the container; checklist names the by-hand `docs.json` edit; the emptied container renders as an empty lane (display cost accepted at gate) |

**Retry interaction, on the landed shape.** Parity's
`explicitViolations` pre-check exists to rescue a grounded call; in
aspirational mode the `pinned-rows` arm returns no violations — a
pinned move is not a violation there; that is the mode's definition —
so the retry is reserved for parse errors, the pre-parity behavior.
This falls out of the exhaustive switch rather than being a special
case: the aspirational arm returns `[]`, with the reason at the
clause. (The draft's "if retry-reachability lands differently"
contingency is discharged; it landed, ruled 1b.)

**Classify-then-throw ordering.** The nets that classify still run
AFTER the multiset net — a document that fails multiset is discarded
before any record is written, so a fabricated arrangement can never
arrive wearing badges. The existing net order (`validate.ts`: multiset
→ pinned → directory → block-entry → reparent → never-empty) is
preserved; the aspirational arms replace throws with record emission
at the same sites, so the order-is-load-bearing comment at the
directory net ("both would fire, and only one names the actual
obstacle") keeps its meaning: the FIRST classifier to claim a row
names it, and a directory-move demotion is recorded as that rather
than as N pinned-row displacements.

## Decision 7 — provenance, state, ledger: three facts, three homes

The draft's two-way mode-vs-state split became three-way at gate 1:

| fact | home | mutability | persistence |
| --- | --- | --- | --- |
| **run mode** — what one run was allowed to imagine | `TabProvenance.mode` (`store/provenance.ts`) | immutable, like every provenance field | rides provenance; absent = grounded-era run |
| **tab state** — whether this tab may hold pinned displacements | `TabState.aspirational` / `seamDeclined` (Decision 2) | mutated by the seam and the per-tab control; never by a run | rides the persisted tab; absent = Grounded-unasked; no version bump |
| **ledger** — what this arrangement has displaced | the document: derived from the snapshot, recorded as `Topic.displaced` (Decision 3) | changes with every displacing or restoring edit, undo-participating | rides the document (records) and its snapshot (derivation) |

- **Provenance stays immutable run metadata.** `mode` joins it as the
  record of what the run was; the tab state is deliberately NOT in
  provenance, because provenance's founding sentence is "no gesture in
  the app alters it" and the state exists to be altered by gestures.
- **Absent reads correctly everywhere**: provenance without `mode` is
  a grounded-era run; a tab without state fields is Grounded-unasked;
  a document without `displaced` records and with placement matching
  its snapshot has an empty ledger. Three absences, three correct
  readings, zero `PERSIST_VERSION` bumps — each asserted, per the
  provenance precedent.
- **The differential oracle's log already records the mode —
  discharged by observation.** docs/10's log adopted the term at the
  parity merge, "recorded here ahead of that note landing" in its own
  words, with every prior entry classified grounded by construction
  and the second entry stamped "grounded semantics" (verified at
  `69691ba`). The reasoning stands as this note's (two runs in
  different modes are not the same experiment — a
  grounded/aspirational pair against one model measures the constraint
  framing, not the model); what remains is only that future entries
  keep the term, which the format now demands.
- **The apply surfaces read the LEDGER; the gesture surfaces read the
  STATE; the run reads the MODE.** Each consumer keys on exactly one
  of the three (the "run mode and tab state never conflate" fence). "An Aspirational tab" (state) and "a
  tab with aspirational moves" (ledger) are different sentences — a
  tab switched by the seam whose displacement was then undone is
  Aspirational with an empty ledger, and behaves at apply exactly like
  a Grounded tab, which is correct: there is nothing to project and
  nothing to list.

## Decision 8 — costs and edges

**Token cost — measured, no longer estimated.** The parity arc
measured the grounded rendering through the shipped serializer
(`scripts/measure-constraint-cost.ts`; table of record in docs/10):
godot at full granularity is 515 rows, **47 pinned, +189 tokens,
4.08%**; `two` is +85 tokens; `top` is **+0** (nothing to mark,
nothing to violate). The aspirational block differs from the grounded
block by a few sentences of O(1) prose — the per-row marker cost is
identical by construction (same marker, same serialization; Decision 5)
— so the mode's marginal cost over parity is ~+30–40 tokens flat,
chars/4. The draft's estimates are retired in favor of the measured
table; the note keeps only the delta claim, which the payload-diff
assertion pins (Decision 5). Also worth carrying from the
measurement: godot's 47 pinned (46 `outside-region`, 1 `atomic`) and
the "85 duplicate references" are different denominators — locks on
the 515 shown rows vs duplicates across the 1,594-document closure —
recorded because someone comparing them would reasonably think one is
wrong. The 85 figure's home is **docs/12** (`classes/`, 1,163 entries)
and `validate.ts`'s parent-change-only comment — NOT docs/19, whose
godot row carries no duplicate-reference evidence at all; docs/10's
amendment points at docs/19 for it, the same misattribution, and its
correction rides this note's docs/10 sweep obligation.

**Entirely-pinned documents, re-checked against the widened design.**
A document whose every id-bearing row is pinned (reachable: a corpus
whose carriers are all mid-file or above-prose) makes grounded
structural instructions nearly vacuous — every move discarded, sibling
reorder the only live gesture. The dialog states it rather than
disabling anything: a notice when `pinnedRowCount` equals the ID MAP's
topic count — *"Every row in scope is pinned. A Grounded run can only
reorder within sections; Aspirational proposes freely and hands you
the changes as a checklist."* Disabled-with-a-reason is the wrong seam
because grounded is not useless (sibling reorder is real work on such
corpora — docs/19's blast-radius measurement is the receipt). R7 adds
the second door: such a document is also exactly where the CANVAS
seam will fire on the first drag, so the notice and the seam answer
the same situation from the dialog and the gesture respectively —
same split, same names, two surfaces.

**Scope = selected cards.** Scope stays a proposal-constraint in both
modes; the pinned marker set is already scope-correct by construction
(`buildConstraints` walks the ID MAP, and out-of-scope rows have no
ids — the landed comment: a row that cannot be named cannot be moved).
An aspirational proposal therefore cannot move a pinned row INTO an
out-of-scope section — the out-of-scope block is untouchable by
assembly (`validate.ts` scope pass-through) — and the checklist's
remedies never name out-of-scope cards. No new rule needed; stated so
the interaction is a sentence rather than a discovery.

**Migration.** Decision 7's table: three absent-field readings, no
bump, each asserted. One more assertion rides the build: a pre-modes
persisted session rehydrates byte-identically through the new code.

**The grounded-writability gap, recorded.** Grounded's promise is
"applyable", and today's enforcement does not fully deliver it: the
pinned net refuses PARENT changes only (deliberate — docs/19's blast
radius; `validate.ts` "PARENT CHANGE ONLY … godot has 85 duplicate
references"), while the Sphinx planner refuses ANY reorder that
touches a frozen block (`sphinx.ts`: the frozen-prefix comparison and
the `generated-block` refusal). So a grounded proposal that reorders
siblings inside an above-prose block passes the validator and blocks
at Review with a blocking warning. This is shipped behavior, not a
regression of this note, and the classification machinery is what
turns it from a dead-end surprise into a visible split: those rows'
REORDERS can join the remainder at apply as a **third record kind
(`order`)** *(built 2026-08-21 as docs/22's **`row-order`** — the name
split because "order" alone served two referents, cards and rows, which
is the house failure mode; and it is a member of the sibling STRUCTURE
REPORT rather than of this ledger, since it is anchored to a block and
not to a row)* — named as its own kind rather than absorbed into "the
same ledger", because it breaks two equivalences the `pin` kind holds
(it earns no per-row canvas badge, a reorder not being a
displacement; and the projection restores its ORDER, not its parent).
Derived-only, collection tabs only, where the frozen set is derivable
from the snapshot. Named here so the build prices it; if it slips to
a fast-follow, the blocking warning stays the honest surface it
already is.

## Decision 9 — the pinned drag and the seam (R7, ruled shape)

The manual gesture, designed. Precedents load-bearing throughout:
docs/13's containers v2 (consent lives in the gesture; labeled
consequences while dragging; a two-option menu only at a genuine seam;
no modals for what is undoable) and docs/16's consent surface (drop
labels state the consequence in the user's terms; refusal sentences
name the actual obstacle).

### The gesture, state by state

**The drag STARTS.** `topicDrag.ts:175`'s silent `anyTopicLocked`
early return — a refusal with no sentence, the one DRAG surface that
currently declines without saying so (the keyboard delete at
`useKeyboard.ts:49` is equally silent, and deliberately survives —
deletion is not displacement) — dies. A pinned row (or a
selection containing one) begins a drag like any other row, in every
tab state. What differs is the drop:

- **Grounded-unasked tab**: targets highlight normally; the drop label
  carries the consequence preview in the docs/16 pattern —
  *"→ needs your hand — pinned (above prose)"* — and RELEASE opens
  the seam (below). No displacement commits before the seam answers.
  **The seam fires on CROSS-PARENT drops only**: a within-parent
  reorder of a pinned row never fires it, in any tab state, because a
  reorder is not a displacement, writes no record, and the seam's
  opening claim ("the app can't write it") would be false for it —
  the Sphinx frozen-block case where a reorder really cannot be
  written stays Decision 8's plan-time surface (the `order` kind —
  built 2026-08-21 as docs/22's `row-order`, and this sentence is now
  a description of shipped behaviour rather than a deferral).
- **Grounded-declined tab** (`seamDeclined`, Decision 2): the drag
  starts and every cross-parent target refuses with the sentence,
  through the existing refusal channel (`dragStore.refusal` — the red
  pointer sentence the reparent refusals already use):
  *"Pinned rows stay put while this tab is Grounded — switch the tab
  to Aspirational to move them (tab menu)."* The sticky decline never
  reads as breakage because the sentence names the escape hatch, per
  the ruling. Within-parent reorder of a pinned row becomes possible
  for the HAND for the first time here — today no pinned drag starts
  at all (`topicDrag.ts:175`) — and its legality matches the AI net's
  parent-change-only scope (`validate.ts`), so hand and model finally
  answer to one rule.
- **Aspirational tab**: the drop commits directly, badged — the
  displacing command writes the move and the `displaced` record
  together (Decision 3), the undo toast names the move, and no seam
  re-prompts. Consent was given once, for the tab; re-asking per move
  would be the forty-modals failure docs/16 measured.

### The seam

Fires once per tab, at the first pinned drop on a Grounded-unasked
tab. It is a two-option menu at the release point (docs/13's seam-menu
shape — the one place a menu is justified: two readings genuinely
live), and its copy is a MODE choice, never a move confirmation:

    This move includes a pinned row — the app can't write it.

    ▸ Switch this tab to Aspirational and make the move
        Pinned moves are labeled for your hands; everything else
        stays writable and verified as normal.
    ▸ Keep this tab Grounded
        The row stays put. You can switch later from the tab menu.

Copy laws, from the ruling: it states the SPLIT — this move can't be
written by the app; everything else stays writable and verified — and
never a vanishing. "No guarantee anything writes back" is the opposite
lie and is ruled out: the tab keeps full verification on the applyable
part (Decision 4), and copy implying otherwise would spend the
product's honesty to dramatize a boundary. "No" answers the MODE, not
the move — declining does not mean "cancel this drop and ask again
next time"; it sets `seamDeclined`, and later pinned drags refuse with
the named escape hatch.

Multi-select: one seam for the set, counting — *"2 of the 5 rows in
this move are pinned"* — because the gesture is one gesture; per-row
seams would be the modal-per-move failure again.

### The per-tab control

A deliberate Grounded → Aspirational switch exists without the
gesture: the tab's context menu (the `ContextMenu` component the tab
strip already has, docs/08), shown when the document has any pinned
row or the state is already non-default — a control that can do
nothing for this document is noise. It clears `seamDeclined` when
turning Aspirational on (the decline answered the seam; a deliberate
switch supersedes it). The switch BACK is RULED (G1, 2026-08-19): it
exists in v1, offered only while the ledger is empty; while records
remain the control is disabled-with-a-reason naming the Put back
path; and a switched-back tab lands Grounded-UNASKED, so the seam may
offer again — a deliberate switch-back is not a seam decline. The
Overview's aspirational line may carry a second door to the same
control; that is a build choice, not a design fact.

### What the seam does NOT cover

- **Deletion**: `useKeyboard.ts:49` stands. Deleting a pinned row is
  not a displacement — the lock's contract refuses it
  (`model/types.ts`: "cannot be dragged, deleted or renamed") and no
  mode or state changes that. The seam licenses imagination about
  PLACEMENT; a deletion is not an arrangement.
- **Renames** of pinned rows: refused as today, out of v1 (Decision 1,
  renames row).
- **Undo**: the displacing command inverts cleanly (move + record,
  one command). The tab STATE does not revert on undo — deliberately:
  view/consent state is never part of undo (`commands/types.ts:25`
  names the law for view state; a consent answered is a fact about
  the user, not the document). Undoing the first aspirational move
  leaves an Aspirational tab with an empty ledger, which Decision 7
  already defines as behaving like Grounded at apply — harmless, and
  honest.

> **[addendum 2026-08-20, post-build — adjudicated and blessed]** One
> drop this decision never named, decided by the ledger's own shape:
> **a pinned row may not become a CARD** (`guards.ts`,
> `pinned-to-card`, scoped to the empty-canvas drop only). The reason
> is not that a card cannot wear a restriction mark — sealed and
> all-rows-locked cards visibly do — but that CREATION is not yet a
> projectable record kind: every ledger record names a ROW, so a
> promotion erases the pin and leaves a displacement the badge cannot
> show, the checklist cannot list and the projection cannot return
> home. The hand's sibling of the oracle log's created-cards wall and
> of Decision 8's `order` kind; the unlock is the structural-remainders
> design (creation as a record kind with a checklist remedy). Until
> then the refusal names the working gesture: a pinned row moves
> between cards, seam permitting — it cannot stop being a row.
>
> **[unlock landed 2026-08-21, PARTIALLY]** docs/22 mints the record
> kind this addendum was waiting for: creation is now derived,
> badgeable, listable and projectable, and "every ledger record names a
> ROW" is qualified — the SIBLING REPORT (`model/remainders.ts`) is
> anchored to what each record is ABOUT, following
> `emptiedNeverEmpty`'s precedent rather than widening `LedgerRecord`.
> The `pinned-to-card` refusal itself is **arc 2's** to retire, with
> the ruled births and the seam; `docs22-machinery` changes no gesture,
> so the clause is still live and this addendum still describes the
> shipped behaviour of the drop.
>
> **[RETIRED 2026-08-21, in `docs22-hand`]** The refusal is gone, and its
> stated reason was made FALSE BY CONSTRUCTION rather than overruled —
> which is the distinction worth keeping, because the reason was right
> about the thing it named. It said promotion erases the pin and leaves a
> displacement the badge cannot show, the checklist cannot list and the
> projection cannot return home. docs/22's OR-5c rules that a pinned
> PARENTED entry is **wrapped**, not promoted: the entry stays a row
> inside the born card, `Topic.lock` intact, and a pinned CHILDLESS entry
> births the standalone where the pin rides `topics[0]` exactly as it
> does inside any card. Either way the move is an ordinary cross-parent
> displacement — `captureOrigins`/`settleDisplacement` record it, the
> badge shows it, Put back returns it, the projection sends it home. So
> promotion still erases a pin; the gesture simply no longer promotes
> one.
>
> The `guards.ts` clause and `moveLabel.ts`'s sentence are deleted, and
> `unhoused-species` stands in the union slot they left — the refusal
> that survives once this one falls, and a fact about the FILE's shape
> rather than about any row. The drop now gates exactly like any pinned
> cross-parent drop: seam, refuse, or commit-badged by tab state.

## Fences and invariants for the build

Prohibition-form, per the house rule (a fence without a test is a
request):

- **Classification never gates a write.** No adapter's `planChanges`,
  no `simulatePlan`, no `saveChanges` path consults the ledger to
  refuse — asserted as an import-absence test on `collections/` (the
  linkIndex fence's shape, construction not vocabulary).
- **The TAB STATE never gates a write — the LEDGER keys the apply
  surfaces.** Named test: two tabs identical in document and ledger,
  differing only in `aspirational`/`seamDeclined`, produce
  byte-identical plans, checklists and save behavior; plus the
  construction assertion that the plan/checklist computation's inputs
  are (files, document, order) with no tab-state parameter.
- **The seam and gesture layer never reach an adapter.** Named test:
  import-absence — `src/interaction/` imports nothing from
  `collections/adapters/` or `formats/adapters/`; the seam's inputs
  are the tab and the model layer's `isPinned`, nothing
  format-shaped.
- **Run mode and tab state never conflate in one predicate.** Named
  test: the four combinations (mode × state) driven through the three
  consumer families — prompt building varies only with mode; seam
  behavior varies only with state; apply output varies with neither
  (only with the ledger). A helper that accepts "aspirational:
  boolean" without saying WHICH aspirational fails review by
  construction, because the two live in different types with no
  common parameter site.
- **No model-authored classification.** `parse.ts` accepts no
  aspiration syntax; asserted by the existing grammar tests plus one
  prohibition test: a response line carrying an invented marker parses
  as title text, never as classification input.
- **The multiset net is mode-independent.** Property test runs the
  same fast-check corpus through both modes and asserts identical
  accept/reject on multiset grounds.
- **Projection equivalence.** For any ledgered document,
  plan(projection) ≡ plan(same arrangement built directly) — Decision
  4's invariant 3.
- **Grounded is byte-stable.** A grounded run's payload, prompt and
  validator behavior are unchanged by this feature's existence —
  asserted as a DIFF against the parity-arc fixtures (the streaming
  amendment's payload-diff discipline), so the differential workflow's
  baseline survives.
- **Ledger honesty on collection tabs.** Derived and recorded PIN
  records agree — the display-is-its-own-oracle test, plus a DEV
  assertion at the selector. (`consent` records are recorded-only by
  design and outside the oracle; Decision 3 says why.)
- **`displaced` carry.** Every path that rebuilds topics —
  reconstruction's build sites, recovery, duplicate, persistence —
  carries `displaced` like `lock`; one assertion per consumer (the
  docs/13 chain-carry lesson, applied before the drift).

## Out of scope

Implementation (this is a design note). DocBook (note 20 stays
reserved). Diff-view design (its feed — mode in provenance, the
ledger — is typed here; the UI is docs/08 backlog). Any change to what
the app is willing to write, including per-kind write relaxation of
pins. Aspirational renames (taxonomy row exists; build deferred with
docs/19's rename deferral as the standing reason). Sphinx block
reorder, MyST, and every other adapter refusal not listed in
Decision 1's table — they are plan-time refusals today and stay so.

(The first draft excluded "manual aspirational dragging of pinned
rows" here. That exclusion is dead — R7 widened it into Decision 9 —
and its record lives in History, not in this list.)

## Sweep obligations (on landing, not before)

- ~~CLAUDE.md: the stale reparent-uncommunicated sentence~~ —
  **discharged**: corrected at the parity merge, verified at
  `69691ba` ("The stale line, discharged").
- docs/10: the "results open as a new tab" paragraph gains the mode;
  ~~the oracle-log format gains its term~~ — **discharged**: the log
  adopted the mode term at the parity merge, ahead of this note
  (verified at `69691ba`; Decision 7); the amendment's closing section
  ("its successor is already in design") updates when this note is
  certified; and its "docs/19's '85 duplicate references'" pointer is
  corrected to docs/12 in the same pass (Decision 8 carries the
  receipt).
- docs/13 and docs/16: one pointer each — the seam reuses
  consent-in-the-gesture (docs/13's menu-at-a-seam, docs/16's drop
  labels and refusal sentences), so both notes gain a line naming
  docs/21 as a consumer, per the second-producer discipline.
- `topicDrag.ts` is **no longer "unchanged"** in any claim this note
  makes: line 175's silent return dies with Decision 9's build, and
  the refusal-copy sweep (grounded-declined sentence) rides the same
  change. The keyboard path (`useKeyboard.ts:49`) IS unchanged, and
  the note says so where it matters (Decision 9).
- The docs/05 scoped dated amendment for the intent tone — a BUILD
  obligation, authorized at gate 1 (R2), landing with the badge's
  implementation, not with this note.
- `ChangesDialog.tsx` verified-line copy (Decision 4, invariant 4) —
  the copy sweep is part of the build, listed so it is priced.
- CLAUDE.md index line for docs/21, last (the index-goes-stale-first
  rule).
