# 22 — Structural remainders: creation, card order, row order — design

> STATUS: CERTIFIED (Roger, 2026-08-21, in its entirety, at revision 1
> — `b3a964c`). Decided and **BUILT WHOLE (2026-08-21) — arc 1 (the machinery) in
> `docs22-machinery`, certified as adjudicated at `584a75b`; arc 2 (the
> hand) in `docs22-hand`, CERTIFIED (Roger, 2026-08-21, as adjudicated
> at `6c27f89`).** Every
> current-behavior claim cites its construct at **`a8f28cf`** (the
> mintlify-creation-gap merge, verified origin tip at drafting). Where a
> cited line number could drift, the citation names the construct as
> well as the file. Measurements M1–M4 were taken in a throwaway
> worktree at that SHA; each lands below with what was run and what it
> showed. Rulings R1–R5 (Roger, 2026-08-20) are built on, not
> relitigated. Proposals O1 and O2 are adopted, scoped by the gate-1
> rulings below: O1 stands whole; O2 stands with OR-5's narrow
> resolution, which scopes R3's deferred commitment to the CHILDLESS
> drag. Where a measurement sharpened a proposal, the sharpening is
> stated at the point of adoption.

## Open rulings

**None.** All five were ruled 2026-08-21; the dated records follow,
each naming where it lands in this revision.

## Rulings record — gate 1, ruled 2026-08-21

- **OR-1 — ADOPTED.** "Standalone entry" / "standalone page"
  user-facing; "orphan" stays internal — it names a parse mechanism,
  not a thing a writer chose to make. Lands in Decision 1's words
  subsection.
- **OR-2 — ADOPTED as proposed.** Heading removal on a card with more
  than one top-level row refuses with the sentence naming the
  split-by-drag path. Dissolve-into-N declined: a bulk destructive
  gesture with no demand receipt, and N placement decisions nobody
  made. Lands in Decision 2's species commands.
- **OR-3 — ADOPTED.** One consent, widened meaning: "this tab may
  hold arrangements the app cannot write, labeled." Both predicate
  widenings ride it — the birth rule's first clause, and G1's
  switch-back becoming empty ledger AND empty report. **Recorded
  trade, accepted at gate**: consent at one seam licenses later
  imagined structure on that tab without a fresh seam; the mark, the
  checklist and the Overview carry the visibility. Lands in
  Decision 7.
- **OR-4 — ADOPTED: deferred, unlock = demand** (a real corpus run
  refused at `section-set-changed` for a delete). The deferral record
  gains the gate's addition: **the projection-direction question
  travels with the unlock** — a deletion's projection would UN-DELETE
  the card to let the rest apply, which fights user intent harder
  than dissolving a creation does, and the future note answers that
  before the kind ships. Lands in Decision 3's deletion bullet.
- **OR-5 — RESOLVED NARROW, plus directed clauses.** Ruling of
  record, verbatim: *"Dragging a topic out to the canvas must always
  be interpreted as user intent to promote a topic/topic tree to the
  top-level."* Consequences, all directed: **(a)** standalone stays
  CHILDLESS-ONLY — the one-entry-with-children generalization is
  declined, `isOrphan` keeps its shipped shape, and the consumer
  sweep it would have obligated is removed; **(b)** one gesture
  meaning, two birth shapes, decided by the entry — a parented entry
  births the PROMOTED section in every home that bears sections, a
  childless entry births the STANDALONE (promotion of a leaf IS the
  standalone; R3's deferred commitment is hereby scoped to the
  childless drag), and today's childless wrap-into-a-duplicate-named
  group is the misreading of the ruled motive; **(c)** PINNED
  parented entries WRAP, canvas-wide — the entry stays a row inside
  the born section, the pin survives, the displacement records; a
  pinned childless entry births the standalone, where the pin
  survives on `topics[0]`; `pinned-to-card` still retires, re-grounded
  on this clause; **(d)** a parented entry dropped on a
  standalones-only home refuses with the regime-2 sentence naming the
  homes that bear sections. Lands in Decisions 1, 2, 6 and 7 and the
  Substrate's motive framings.

## The problem, in the product's own terms

Three kinds of structure the app can display and cannot write are
today refused late, wholesale, or silently — and every one has a
demand receipt:

- **Creation.** A model run on godot-docs (aspirational, allow new
  sections ON, 2026-08-19 — docs/10's oracle log) validated, opened,
  badged its pinned moves, and then had the ENTIRE plan refused at
  Review because the model had created four cards: a Sphinx card is a
  toctree block, and creating blocks is not something moves-only
  write-back does (`sphinx.ts` `section-set-changed`). One hundred
  moves, 88 writable, all discarded at the gate for four cards nobody
  could act on. docs/10's disposition (2026-08-20) names this note as
  the unlock. The manual twin: `guards.ts` `pinned-to-card` refuses a
  pinned row the empty-canvas drop, and docs/21 Decision 9's addendum
  states the reason as exactly this gap — "CREATION is not yet a
  projectable record kind."
- **Card order.** The sibling run (aspirational, new sections OFF)
  reordered top-level cards ("Class reference", 6 → 5) and Review
  refused everything again: block order is written in prose positions
  Sphinx does not rewrite (`sphinx.ts` `card-reordered`). The
  capability-fields arc communicated the constraint to the model; the
  arrangement itself still dies at the gate.
- **Row order.** docs/21 Decision 8's deferred `order` kind: a
  reorder inside a frozen toctree block passes the validator (the
  pinned net is parent-change-only, deliberately) and blocks at Review
  with a blocking warning. Priced there, deferred to "the
  structural-remainders design" — this note.

The shape of the fix is the one docs/21 already built for pinned rows:
**refused structure becomes labeled, listed, and remediable** — a
derived record with a badge policy, a checklist remedy in the lock
legend's grammar, and an applyable projection so the writable part of
an arrangement ships while the remainder is handed to the person, with
units, instead of poisoning the whole plan.

Two of the three kinds also force the question docs/13's 2026-08-20
amendment left open: what IS a created card, and where may it live?
R1–R4 rule the gesture (drag out, drop on canvas; the drop names the
home; species is deferred commitment; motive is never recorded), O1
rules the species mechanism (heading-as-commitment), and O2 rules the
home law (per-home bearing from the declared `accepts` data). This
note is where those become one design.

## Substrate — measured at `a8f28cf`

Method for M1–M3: a scratch vitest file in a throwaway worktree at the
base SHA, driving the SHIPPED adapter, reconstruction, and layout
functions — no product code changed. The scratch file is not
committed; the receipts are the observed outputs below, restated with
enough method to re-derive. M4 is a code reading, cited by construct.

### M1 — what a chainless orphan does on a container root

Run: parse `tabs-rooted-valid.json` (the schema-valid container-rooted
fixture) with `mintlifyAdapter.parse`, append sections, serialize,
validate against the vendored schema with the shipped `regExp` shim
(`mintlifySchema.test.ts`'s compile, verbatim — the published schema's
`^phc\_` does not compile under default ajv).

| case | appended | serialized as | schema | refused? |
| --- | --- | --- | --- | --- |
| A | chainless **orphan** (`isOrphan`, one topic, path `created/standalone`) | the bare string `"created/standalone"` appended into `navigation.tabs`, sibling of the tab objects | **invalid** | **no — bytes emitted** |
| B | orphan with `chain: ["Guides"]` (a `groups` container, `accepts: {sections: true, orphans: false}`) | the bare string appended into that tab's `groups`, sibling of the group objects | **invalid** | **no — bytes emitted** |
| C (control) | chainless **non-orphan** section | — | — | **yes** — `SerializeRefusedError`, "outside every navigation container" |
| D (baseline) | nothing | the fixture round-trips | valid | — |

So the orphan exemption in `refuseUnhousedSections` (`mintlify.ts` —
"SECTION cards only, the same carve-out `lintContainers` makes") is
wider than the carve-out's own justification: the justification is
`$ref` pointers that legitimately sit in container arrays, and those
parse **sealed** (`orphanSection` sets `sealed: {source: ref}`); an
UNSEALED orphan reaching a bears-no-orphans home has no legitimate
producer at parse and writes invalid bytes unrefused. The fixture's
declared containers, for the record: root `""` ("Top level",
`accepts: {sections: false, orphans: false}`), `Guides` and
`Reference` (both `{sections: true, orphans: false}`, `mayEmpty:
false`).

### M2 — where a chainless card renders on a container-rooted doc

Run: the same fixture plus a chainless section, through
`distributeIntoColumns(sections, { containers, viewportHeight })` and
`columnBands`.

    columns: [["Created On Canvas"], ["Getting Started","Advanced"], ["API"]]
    bands:   ["Top level", "Guides", "Reference"]

A chainless card groups under the DECLARED root descriptor (chainKey
`""`, order 0), so on auto-arrange it lands in its own **first**
column under a band labeled **"Top level"** — a labeled lane for a
home that, on this root, bears nothing. Before auto-arrange the card
sits at the column/index the drop chose (`insertCard`), which can be
mid-lane; the band then reports `null` for that mixed column
(`columnBands` claims a band only over a single-container column).

### M3 — can a proposal express a standalone top-level topic?

**Yes — and the adoption rule makes the answer hazardous.** Run: build
the outline for the same fixture (`buildOutline`, full granularity),
then `reconstructDocument` with every section listed as-is and one
existing leaf topic appended at outline ROOT as a bare id.

- The leaf reconstructs as a section with **`isOrphan: true`** — the
  model layer's standalone-topic shape (`validate.ts`, the
  "topic at root … children.length === 0" branch). The outline
  grammar accepts a root-level topic id (`parse.ts` — root nodes are
  not restricted to section ids), and the childless branch consults
  **neither `allowNewSections` nor any capability** — hoisting a leaf
  is treated as a move, not a creation, in every mode.
- The minted orphan **inherited `chain: ["Reference"]`** — the chain
  of the card above it (`validate.ts`: `inherited = wrapper?.chain ??
  builtSections[last]?.chain`). That is a `groups` container, whose
  descriptor declares `orphans: false`. This is the live producer of
  M1 case B: **a run that hoists one leaf to top level on a
  container-rooted Mintlify document yields a document whose export
  writes schema-invalid bytes, unrefused, today.** Found by this
  measurement; the design closes it twice over (Decision 5 extends the
  refusal, Decision 6 fixes the adoption), and the build owes the
  regression test (Fences).

### M4 — the adoption table, re-verified

docs/13's 2026-08-20 amendment table holds at `a8f28cf`:

- AI reconstruction adopts the chain of the card above at **three
  sites** in `validate.ts`: the `+ Title` root branch ("A new card
  adopts the chain of the card above it"), the childless topic-at-root
  branch (orphan wrapper, `wrapper?.chain ?? last`), and the promotion
  branch (`entry.orphanSection?.chain ?? last`). Chainless when the
  new node is first in the outline — nothing above to inherit from.
- Canvas creation adopts **nothing**: the executor is
  `execMoveTopicsToNewSection` (`execute.ts`), which builds via
  `createSection` / `createSectionByUnwrapping` (`tree.ts`), and
  neither sets a chain. (docs/13's amendment names this executor
  `execCreateSection`; the construct of record is
  `execMoveTopicsToNewSection` — same code, one name drift, noted so
  nobody hunts for a second creation path. There is none: canvas
  creation is exactly this one command.)

### The creation gesture as shipped — inventory

What exists today on the canvas path, all cited:

- One creation gesture: drag topics to empty canvas
  (`topicDrag.ts` `resolveDrop` canvas branch →
  `moveTopicsToNewSection`). R1's "no empty-card creation" is already
  true — there is no other producer.
- A single childless topic dragged out becomes a **non-orphan
  section titled after the topic** (`createSection(detached.title,
  removed)`): a one-entry GROUP whose heading duplicates the entry's
  name. It does not become an orphan; `isOrphan` has no canvas
  producer. Under OR-5's ruling (the drag means PROMOTE), this wrap
  is the **misreading of the ruled motive** — a leaf's promotion is
  the bare entry at top level, and on MkDocs today's export is a
  group wrapping one page where the ruled meaning is a top-level
  page. Kept as the receipt behind Decision 2's childless-standalone
  cell.
- A topic WITH children dragged out **unwraps**
  (`createSectionByUnwrapping`): the entry becomes the card — title,
  path, `titleDerived` carried; children become rows. Under OR-5's
  ruling this commit IS the gesture's meaning — the shipped shape is
  kept, now as the ruled reading rather than an accident.
- A multi-selection dragged out becomes a section titled
  **"New Section"** (no `cmd.title` producer exists on the canvas
  path).
- On a Sphinx tab the canvas drop **commits**: `topicMoveRefusal(doc,
  ids, null)` passes (Sphinx omits `supportsReparent`, absent = yes;
  its paths are docnames, so the `_index.md`/`index.md` clauses never
  fire), and the arrangement then dies at Review as
  `section-set-changed`. The gesture promises what the plan must
  refuse — the same class the capability-fields arc measured on the
  dialog toggle, one surface over.
- The one lock-aware clause: `pinned-to-card` (`guards.ts`), scoped to
  `to === null`, refusing a pinned row the drop because promotion
  would erase the pin (docs/21 Decision 9 addendum — this note is its
  named unlock).

## Decision 1 — two species, one observable fact

### The species

A card is one of two things, and the difference is exactly what the
navigation writes for it:

- A **standalone entry** (internal: the `isOrphan` shape, unchanged —
  OR-5a) — the card IS its single CHILDLESS entry. It has no heading
  of its own; its title is a mirror of the entry's. Export unwraps it
  to the bare entry, exactly as orphans export today.
- A **section** — the card carries a heading, with entries beneath
  it. The heading comes in two flavors that are one species: a PURE
  NAME (a group name, a caption, a `name:` key — a fact of its own in
  the navigation), or a PROMOTED ENTRY's own name — one referent, two
  roles, path carried — which is what the shipped unwrap produces and
  what OR-5's ruling makes the meaning of dragging a subtree out. At
  the format level the two flavors are one shape (a DocFX item with
  `items:`, an MkDocs key with a list, a Mintlify nested group), and
  the flavor is observable: the heading either has a path or it does
  not. Decision 2's "Remove heading" scoping keys on exactly that.

**Species = has-heading (O1, adopted).** There is no stored species
flag and no hidden state: the card either shows a heading — a pure
name or a promoted entry — or it does not. The drag-out hysteresis the
pre-mortem names cannot occur, because there is nothing invisible to
lag — a card that became a section wears its heading on screen, and
dragging its rows back out leaves a visibly-headed near-empty section,
which is a legible state, not a surprise. The species transition is a
pair of explicit, undoable commands (Decision 2), never an inference
from row count.

### The standalone species stays childless-only (OR-5a, ruled)

A one-entry-with-children generalization of `isOrphan` was proposed
and **declined at gate 1**: the ruling of record reads the drag-out
of a subtree as intent to PROMOTE it, so a parented entry's card IS
the promoted section (the shipped unwrap, kept), and there is no
neutral state for it to defer to — R3's deferred commitment is scoped
to the childless drag, where the format genuinely has two shapes (a
bare entry vs a one-entry group) and the first drag commits to
neither. `isOrphan` keeps its shipped shape and its shipped
consumers; the consumer sweep the generalization would have obligated
is removed with it. What the declined shape was carrying —
pin survival through birth — is carried instead by OR-5c's wrap
clause (Decision 2's table; Decision 7 re-grounds on it).

### The user-facing words (pre-mortem 8; OR-1, adopted)

**"Standalone entry"**, and "standalone page" where the entry has a
page path. Rejected: *"orphan"* — internal mechanism vocabulary; a
writer did not orphan anything, they placed a page at top level.
*"Loose page"* — reads as an accident. *"Page card"* — false for
`href`/`$ref` entries that have no page. *"Topic card"* — "topic" is
this app's own jargon for every row. The copy surfaces that say the
word: the born card's affordance hint, the species refusal sentences
(Decision 2), the checklist and Overview lines (Decision 5).

### What species is NOT

Not a lock, not a capability, not a mode. A standalone card is fully
editable; whether a given HOME can hold it is the home's declared
bearing (Decision 2), and whether a given adapter can create any new
card at all stays the static `createCards` field (R5 — the fields do
not move).

## Decision 2 — birth: the gesture, the home, the heading

### The gesture (R1, R2)

Creation is the one shipped gesture, kept: drag a topic (or
selection) out of a card, drop it on the canvas. No empty-card
creation — recorded as ruled (R1), and it is already true in the code
(Substrate). What changes is what the drop makes and where it may
land.

**The drop position names the HOME (R2).** The canvas is fully laned:
`distributeIntoColumns` packs per-container columns and `columnBands`
labels them (M2), so a canvas drop resolves to a container the same
way a card drag already does — by the drop slot's neighbours
(`classifyDrop`'s neighbour logic, reused for the new card's
column/index). The born card takes the home's chain. Root is a home
like any other, legitimate exactly where the format bears it — which
on a pages-rooted Mintlify file it does (`accepts: {sections: true,
orphans: true}`) and on a tabs-rooted file it does not (M1's
declared root: bears nothing). Formats with no containers have a
single home, the root; its bearing is Decision 8's owed declaration.

### Per-home bearing (O2, adopted) — the four regimes (O2's three, plus the root that bears nothing)

The born card's species derives from the SAME declared
`accepts`/`ARRAY_BEARS` data the drop refusal, the descriptors and the
write-path refusal already consume — never a per-format boolean,
never a second table. Asked of the home the card is born into:

| the home bears | childless entry | parented entry (OR-5b: the drag means PROMOTE) |
| --- | --- | --- |
| sections AND standalones (`pages`) | **standalone** — deferred commitment (R3, scoped by OR-5b to exactly this drag). | **promoted section** — heading is the entry's own name, path carried, children become rows. Pinned: **wrapped** instead (OR-5c, below). |
| standalones only (`anchors`) | **standalone** — deferred; a later section-conversion is unwritable HERE, so that drop refuses with a sentence naming the homes that bear sections (below). | **refuses** (OR-5d) — promotion births a section and this home bears none; the regime-2 sentence names the homes that do. Pinned parented refuses identically (a wrap is a section too). |
| sections only (`groups`) | **born a section immediately** (R3's exception): a bare entry is not a legal child of this array, so there is no neutral state to defer to — the childless entry is WRAPPED (species-at-birth rule below). | **promoted section**, as in the bears-both row. Pinned: wrapped. |
| neither (a `tabs`/`languages` root) | **the drop refuses** — same discriminant family as `cardChainRefusal`'s `not-accepted`, with a sentence naming the lanes that bear cards. Nothing is born unhoused; R2's "root is a legitimate home wherever the format bears it" has a contrapositive and this is it. | **refuses**, same sentence. |

The refusal sentence for the fourth regime, one producer, reusing the
export-refusal's vocabulary (`unhousedMessage` names the
sections-bearing containers): *"This docs.json's top level holds
containers only — drop it inside "Guides" or "API reference"
instead."* The drop label carries the consequence BEFORE release,
docs/16's pattern. The refusal holds in EVERY tab state, Aspirational
included, and the reason is stated because it looks like a breach of
"imagine anything, labeled": every remainder kind in this design has
a projection home, and an unhoused card on a format tab has none — no
snapshot exists to dissolve it against, so the whole export would
wedge behind it (R5's floor). The fact is about the file's shape, not
about imagination. The near-twin on the AI path (a chainless card
minted when the outline's first entry has no card above — Decision 6's
third regime) is surfaced instead of refused, and the asymmetry is
deliberate rather than the overturned "the model may imagine what the
hand may not": a hand mid-gesture can be handed a sentence naming
real homes and act on it now; a model mid-outline cannot, so
classify-and-surface (Decision 5) is its honest fallback. Both end
labeled; neither is silent.

### The species-at-birth rule — one table, both producers (OR-5b/c, ruled)

What a drag-out births is decided by the ENTRY, and the rule is
shared verbatim by the gesture and by reconstruction (pre-mortem 4's
demand — one vocabulary, two arrival paths). The ruling of record:
*"Dragging a topic out to the canvas must always be interpreted as
user intent to promote a topic/topic tree to the top-level."*

- **A parented entry births the PROMOTED SECTION, in every home that
  bears sections** — the shipped unwrap, kept and now ruled as the
  gesture's meaning: heading is the entry's own name (one referent,
  two roles), path carried, children become the rows.
- **A childless entry births the STANDALONE** — promotion of a leaf
  IS the standalone: the entry itself, at top level, wrapped in
  nothing. Today's `createSection(detached.title, removed)` — a group
  duplicating the entry's name — is the misreading of the ruled
  motive, and the Substrate keeps the finding as its receipt.
- **Where the home bears sections only**, a childless entry cannot be
  the bare standalone, so it is **WRAPPED**: a section holding the
  entry as its single row (a Mintlify `groups` array holds group
  objects, not paths). The heading's default differs by producer, and
  the difference is producer PRESENCE, not vocabulary: the
  **gesture** births the placeholder (`"New section"`,
  `untitled: true` — the user is one click from naming it, and a
  silently entry-titled group would be the duplicate-name wart
  committed without consent); the **AI path** births it titled after
  the entry with `titleDerived: true` (no one is present mid-run to
  answer a placeholder, and a single-page group named for its page is
  the format's own idiom).
- **A parented entry that is PINNED is WRAPPED, not promoted —
  canvas-wide** (OR-5c), in every home that bears sections: the entry
  stays a row inside the born section, so the pin survives and the
  displacement records normally. The reason is the addendum's own
  canon — a pinned row never stops being a row; promotion would erase
  the pin (`Section` has no lock). A pinned CHILDLESS entry births
  the standalone, where the pin survives on `topics[0]` exactly as it
  does inside any card. Near-theoretical on shipped corpora (Mintlify
  pins are leaf-shaped) and stated anyway, because the silent
  alternative fails in the dangerous direction.

**No motive is recorded anywhere (R4).** Species, home and heading
are all facts about what the arrangement IS; nothing stores why the
user dragged, and subsequent action — a second drop, a rename, a
heading removal — is what reveals intent, by changing the observable
facts.

### The second drag, and the heading as the commitment (O1, R3)

Dropping a topic ONTO a standalone card (today refused by
`resolveDrop`'s orphan clause — that clause dies) converts it in the
same command that inserts the row: the card becomes a section whose
heading is a **visible, editable placeholder**, and both topics are
its rows. One gesture, one undoable command, whose inverse restores
the standalone card and the moved row's origin together. With OR-5's
narrow resolution, this conversion is **childless-seeded only** — the
standalone is the childless card, so the placeholder path always
starts from a leaf. Two drop geometries, two ruled meanings: a
**sibling** drop is the commitment above (placeholder section, both
entries as rows); a drop **as a child of the standalone's entry**
makes that entry parented, and a parented top-level entry IS the
promoted section (OR-5b's own invariant), so the card promotes —
heading becomes the entry's name — or, for a pinned entry, wraps
(OR-5c). One accepted order-dependence, recorded at gate: *"a new
heading with a subtree and a newcomer as top-level siblings"* is
reachable by seeding with the CHILDLESS topic and dropping the
subtree in as its sibling — not by dragging the subtree out first,
which births the promoted section instead. Rare, reachable, named.

- **Placeholder, not prompt (pre-mortem 3).** No modal, no focus
  steal: a multi-drag flow (gather five topics into a new card) is
  five drops, uninterrupted. The placeholder text is `"New section"`,
  rendered visibly AS a placeholder (the build styles it; the fact it
  must communicate is "nobody chose this name yet"), and the existing
  inline-rename affordance names it.
- **The placeholder fact is a model fact**: `Section.untitled?: true`,
  set at placeholder birth, cleared by the first explicit rename,
  riding Immer patches so undo restores it. Deliberately NOT
  `titleDerived`: two sentences, two referents — *"`titleDerived`:
  the title came from a filename because the source had none"* /
  *"`untitled`: the title is a stand-in no one has replaced"* — and
  the first is true of 224/224 Mintlify pages that must not light up
  as placeholders. Export does not refuse an `untitled` section (the
  formats write the text happily); its surface is pre-save legibility
  (Decision 5).
- **Explicit species commands, both directions.** "Add heading" on a
  standalone card (the one-topic-section intent, pre-mortem 2 — one
  drag plus one click, no drag-in-drag-out ritual) and "Remove
  heading" (O1's return-to-neutral). Both are document commands:
  undoable, FLIP-hinted, and refused where the home's bearing refuses
  the resulting species (an anchors-lane card refuses "Add heading"
  with the sentence above; a groups-lane section refuses "Remove
  heading" the same way).
- **"Remove heading" is scoped to headings that are PURE NAMES** —
  forced by promotion (OR-5b): a path-bearing card face is an ENTRY,
  and removing it would be topic deletion wearing a species command's
  clothes, refused with its own sentence — *"This card's heading is
  the page itself, not a label — there is nothing to remove without
  deleting the page."* On a pure-name heading over exactly one
  top-level entry, removal yields what the entry dictates: a
  childless entry → the standalone; a parented entry → the promoted
  section (the same invariant as the child drop — the heading goes,
  the entry becomes the face). Heading removal on a multi-entry
  card: **refused with a sentence naming the path** — *"A heading
  with several entries under it is a section; to break it up, drag
  its entries out"* (OR-2, adopted; the dissolve-into-standalones
  alternative declined at gate — a bulk destructive gesture with no
  demand receipt and N placement decisions nobody made).

### What the birth writes, per producer

- **Canvas, capable home**: the standalone card (or born-section, per
  regime), chain = home. No record of any kind — this is ordinary
  writable editing.
- **Canvas, `createCards: false` document** (Sphinx): the drop is a
  structure-making drop and gates on the tab's consent (Decision 7).
  Committed on an Aspirational tab, it is exactly the arrangement the
  derived creation record describes (Decision 3).
- **AI reconstruction**: Decision 6's unified species rule — same
  vocabulary, same per-home law.

Rejected alternatives for the birth design: *a "create section
here" canvas affordance* (R1 rules it out; also re-introduces the
naming-before-content modal docs/13 refused); *species chosen by a
menu at drop time* (a two-option menu at every creation would spend
docs/13's seam-menu pattern on a position that is not ambiguous —
deferral answers it better); *deriving species from row count*
(hidden state; the sealed/empty lesson — aggregate derivation of a
gating property, docs/13's like-joins-like rejection verbatim).

## Decision 3 — the structure report: three derived kinds

### One report beside the row ledger, anchors honest

docs/21's ledger is topic-anchored by construction — every
`LedgerRecord` names a row — and `emptiedNeverEmpty` already models
the exception correctly: a fact about a CONTAINER is derived from the
document, not forced into a row record. The three new kinds follow
that precedent rather than widening `LedgerRecord`: each is anchored
to the thing it is about, and all three are **DERIVED, never
recorded** — recomputed from (document, source) like
`derivedPinRecords`, so they survive undo by construction and no
producer has to remember to write anything. There is no journal
(docs/11's founding law), and no `PERSIST_VERSION` bump: nothing new
persists.

    StructuralRemainder =
      | { kind: "creation";  sectionId; title; species: "section" | "standalone";
          untitled?: true; memberKeys: string[] }        // one per created card
      | { kind: "card-order"; moved: { sectionId; title; from; to }[] }
          // at most ONE per document — a permutation is one fact
      | { kind: "row-order"; carrierPath?; parentId; parentTitle;
          rows: { topicId; title }[]; lockKind }         // one per frozen block

> **[amended 2026-08-21, scoped — built in `docs22-machinery`]** Three
> notes on the shapes as built.
>
> - **`ownKey`** joins `creation`: the card's own natural key, SPECIES-
>   AWARE (a standalone card IS its single childless entry, so its key
>   is that entry's). Derived ONCE at construction rather than in each
>   consumer, because the transform verb and the projection both need it
>   and two derivations of one idea are two things to keep in step. Still
>   derived, never persisted.
> - **`cardNoun` / `carrierPath`** join `creation` and `card-order`:
>   COPY ONLY, never behavior — the `ContainerDescriptor.kind` precedent
>   — because a remedy must name the smallest real act, and without them
>   it can only say "edit the source yourself".
> - **`untitled`** is designed and deliberately NOT staged: it arrives
>   WITH its producer, `Section.untitled`, in arc 2. A record field
>   reading a model field that does not exist is a surface with nothing
>   behind it.

- **`creation`** — a card whose natural key (`model/ledger.ts`
  `naturalKey`, `path ?? ~title`) is absent from the source. Carries
  its species and its members' natural keys, which is what makes the
  projection (Decision 4) and the transform verb (below) derivable.
- **`card-order`** — on a `reorderCards: false` document, the
  top-level card sequence (by natural key, created cards excluded)
  differs from the source's. ONE record listing the moved cards: a
  permutation is one edit for the hand, and N per-card records would
  make the counts lie.
- **`row-order`** — docs/21 Decision 8's `order` kind, renamed in the
  split this note forces: "order" alone would be one name for two
  referents (cards, rows), the house failure mode. One record per
  frozen block whose internal row sequence differs from the source;
  `lockKind` (`outside-region` or `globbed`) is what selects the
  remedy sentence.

### Where the derivation lives

The comparison is the planner's own: `planChanges` already computes
exactly these three refusals (`section-set-changed`,
`card-reordered`, the frozen-prefix check). Re-deriving them
approximately in the neutral layer from locks and keys would be a
second copy of a rule — the drift `guards.ts` exists to prevent — so
the derivation is **the adapter's, extracted**: one pure predicate
per kind, shared by `planChanges` (which enforces) and a new optional
`CollectionAdapter` hook the report selector reads (which shows). One
rule, two consumers, split before the drift rather than after.
Absent hook = empty report (a guard consumes declared inputs);
Sphinx implements it; Hugo/JTD/Docusaurus need none (`createCards`
and `reorderCards` true, no frozen blocks). **Single producer,
pre-declared** (the docs/13 discipline): the mechanism is staged
until a second structurally-different producer exists, and the
derivation oracle below is the guard in the meantime.

Scope consequences, stated rather than implied:

- **Collection tabs only.** All three kinds exist only where a source
  exists to compare against. Format tabs cannot produce them — and
  measured at `a8f28cf` no format adapter answers `createCards` or
  `reorderCards` false, so nothing is lost. A future format adapter
  answering false owes the same hook; the exhaustive switches will
  name it.
- **The derivation is sound only where renames cannot forge keys.**
  A title-keyed card that is renamed would derive as
  created-plus-deleted. Sphinx declares `supportsRename: {false,
  false}`, so the coupling holds today; it is stated AT the hook's
  contract so the adapter that first combines title keys with renames
  finds the sentence waiting.
- **Deletion is visible to the same comparison** (a source key absent
  from the document) and is deliberately not a kind here (OR-4,
  ruled): the charter names creation and the two orders. The unlock
  for a `deletion` kind is demand — a real corpus run refused at
  `section-set-changed` for a delete rather than a create. **The
  projection-direction question travels with the unlock** (gate 1's
  addition): a deletion's projection would UN-DELETE the card so the
  rest of the plan can apply, which fights user intent harder than
  dissolving a creation does — the future note answers that before
  the kind ships.

### The transform verb is derivable (pre-mortem 6)

The queued comparison-as-motion work needs to say what happened, not
just that something did. The record fields make the verb a total
function, and this note designs the DERIVATION, not the animation:

The creation verbs split on the card's OWN natural key
(`path ?? ~title`, derivable from the section itself), because a
created card can be three different acts wearing one record kind:

| evidence | verb |
| --- | --- |
| `creation`, species `standalone` — its own key exists in the source (a former row, now the bare entry at top level) | **hoist** |
| `creation`, species `section` — its OWN key exists in the source as a former row (the entry became the heading) | **promote** |
| `creation`, species `section` — its own key is NEW; member keys existing (a new name over existing rows) | **wrap** |
| a section present in source, standalone in the arrangement (the inverse comparison) | **unwrap** |
| `card-order` | **reorder (cards)** |
| `row-order` | **reorder (rows)** |
| a `pin`/`consent` ledger record (docs/21) | **displace** / its clearing: **restore** |

Asserted as a pure exhaustive function (Fences): the totality fence
covers all three creation verbs, and a new kind or evidence
combination cannot ship verbless.

### Rejected shapes

*Widening `LedgerRecord` with an anchor discriminant* — every
existing consumer (badge, checklist, projection, oracle) would grow
branches for records that are not rows; the `emptiedNeverEmpty`
precedent shows the sibling-report shape costs less and reads
honestly. *Recording creations on the section*
(`Section.created?: true`) — a recorded fact needs every producer to
remember it and every rebuild path to carry it (the `displaced`
carry-sweep, re-paid), and buys nothing derivation does not already
give on the only tabs that can produce the kind. *Model-authored
records* — refused for the same reason docs/21 Decision 3 refuses
them: the app can compute the fact, and an annotation the model
forgets silently launders a remainder into a writable edit.

## Decision 4 — the projection extended: three verbs, one law

`applyableProjection` (docs/21 Decision 4) grows three clauses, and
the law does not move: **plan the projection, never filter the plan.**
The projection is a real document; the existing pipeline runs on it
unmodified; the adapters' own refusals stay live underneath as the
outer layer.

- **Creation dissolves.** Every `creation` record's member rows
  return to their source placements (derivable — the same snapshot
  comparison that found the creation), and the created card itself is
  removed from the projection. **A PROMOTED creation dissolves as one
  unit**: the card's own key IS the entry and its `memberKeys` are
  the children, so the projection restores the promoted entry WITH
  its subtree to the entry's source placement — the entry becomes a
  row again where it came from, children still under it, rather than
  the children scattering to their own source rows. Rows whose source
  placement no longer exists follow the ledger's existing gone-parent
  clause (project nothing, adapters still refuse underneath). A standalone husk
  emptied by OTHER projections (a pin record returning the only row
  home) is pruned the same way `pruneEmptyOrphans` prunes it on
  canvas — without this clause the projection would hand Sphinx a
  card count its block count refuses, and the projection would
  CREATE the refusal it exists to clear.
- **Card order restores.** With a `card-order` record, the projected
  section order is the source order (created cards, already
  dissolved, excepted). The user's within-card edits ride untouched.
- **Row order restores.** For each `row-order` record, the frozen
  block's rows return to source sequence. Runs AFTER the pin/creation
  membership passes, on what remains — order restoration on a set
  membership just changed would restore positions of rows that are
  no longer there.

**Pass order, load-bearing and stated**: membership first (pins home,
consent-declined home, creations dissolved), husk pruning, then card
order, then row order. Each later pass reads the earlier passes'
output; the reverse order restores indices against lists whose
membership is about to change — the same arithmetic the ledger's
ascending-index sort already defends in its own comment.

**The consistency invariants extend verbatim** (docs/21's four): the
projection is a valid document (the Layer-5 nets re-answer on it); no
byte written references imagined structure (structural — the created
card never reaches the planner); and the split is visible at the gate
(the verified-line copy counts the remainder — Decision 5). The new
completeness claim, pinned as a property (Fences): **a projected
plan never refuses `section-set-changed` or `card-reordered` and
never carries a frozen-block blocking warning** — that is what "the
report is complete" MEANS, and it is testable against the planner
itself.

**Grounded tabs get this too, by construction.** The report keys on
the document, never the mode or tab state (docs/21's fences hold
unchanged). A grounded run can still hoist a leaf or reorder cards —
the validator deliberately opens both (Substrate M3;
`constraints.ts`'s create/reorder arms rescue nothing) — and today
that grounded tab hits the whole-plan wall. After this note it gets
the same projection and checklist. Grounded's promise sharpens
rather than breaks: *everything the app can write, written; any
structural remainder split out visibly at Review* — the reading
docs/21 Decision 8 already gave the row-order gap, upgraded from "the
blocking warning stays the honest surface" to a partial apply.

## Decision 5 — surfaces: marks, checklist, counts, and the two legibility gaps

### Badge policy, per kind, from the displacement-not-decoration test

- **`creation`** (unwritable at its home): the created card wears a
  card-level mark in the intent tone (`--color-intent`, docs/21 R2's
  token — a new card-chrome consumer, docs/05 sweep rides the build).
  It is the one new kind that IS a visible thing on canvas needing
  pre-save legibility: without the mark, the card looks as writable
  as its neighbours until Review.
- **`card-order` / `row-order`: no marks.** A reorder is not a
  displacement — docs/21 Decision 8 ruled the reasoning for rows and
  it transfers whole to cards: order marks would decorate every
  affected card for one fact that is a single edit, and the Overview
  line plus the checklist carry it with units.

### The checklist, extended — one grammar, kind-specific remedies (pre-mortem 7)

`buildChecklist` already merges row records and container items; the
report's kinds join it, each in the cause → consequence → remedy
grammar, each remedy naming the smallest real act:

- **creation** (Sphinx): *"Section 'Workflow' — imagined as a new
  card; this system's cards are toctree blocks, and the app does not
  create blocks. To make it real: add a toctree block in
  <root file> listing: a, b, c — then re-import and re-run."* The
  member list comes from `memberKeys`; entries print as docnames.
  An `untitled` creation appends: *"…and give it a name — its
  heading is still the placeholder."*
- **card-order**: *"Cards imagined in a different order — block order
  here is written in the file's own layout. To make it real: reorder
  the toctree blocks in <root file> yourself (a block's caption
  travels with it when you move the whole block), then re-import."*
  One item, however many cards moved.
- **row-order**, by `lockKind`, reusing the lock legend's own unbolt
  vocabulary (`lockUnbolt` — one vocabulary file, one more consumer):
  `outside-region` → *"move the toctree run to the end of <file>,
  then re-import and re-run — or reorder the entry lines by hand"*;
  `globbed` → *"replace the pattern with explicit entries, then the
  order is yours to write."*

Counts stay split by kind with stated units (the house rule, and
`checklistText`'s own comment): *"7 items: 3 rows, 1 new card, 1 card
order, 2 blocks"* — never one integer, because these are different
questions and a bare sum reads as one measurement gone wrong.

The Overview gains the same lines (counts by kind, subjects focusable
where the subject is on canvas — a created card is; an order fact
focuses its carrier card). The result view's split sentence
(`ReorganizeSummary`) extends: *"14 moves — 11 the app can write, 3
need your hand; 1 created card and the card order need your hand at
Review."*

### The two pre-save legibility gaps (pre-mortem 3), closed without new walls

- **The unhoused card** (M1's class, format tabs): the export refusal
  stays the floor (R5) and stops being the FIRST notice. The same
  derived predicate (`accepts` over placement — `lintContainers`'
  computation, given its first product consumer) feeds an Overview
  attention line and a card mark while the state exists, with the
  two-remedy copy: *"'Install' has no home this docs.json can write
  — drag it into 'Guides' or 'API reference', or add a container for
  it in docs.json yourself (the app never edits containers)."*
  In-app remedy first, by-hand remedy second, blaming neither.
- **The placeholder heading**: an `untitled` section at export/save
  gets one line — *"1 section still has a placeholder name"* — as a
  neutral notice, never a refusal (the bytes are legal; the name is
  merely nobody's).

### The write-path refusal extension (closing M1 in the bytes)

`refuseUnhousedSections`' orphan carve-out narrows from *all orphans*
to **sealed orphans**: the carve-out's own justification is `$ref`
pointers, which parse sealed, and M1 measured that an unsealed
standalone in a bears-no-orphans home writes schema-invalid bytes
unrefused. Narrowing a classifier obligates the other side's receipt
(the house rule): the build asserts BOTH that the unsealed standalone
now refuses with the one-producer message AND that every shipped
fixture's sealed `$ref` orphans still round-trip byte-identically —
the exclusion tested, not just the inclusion.

## Decision 6 — the AI path speaks the same species (pre-mortem 4)

### One species rule for reconstruction

The root pass's shipped promote/orphan split turns out to BE the
ruled species rule — OR-5b rules the canvas and the outline into one
meaning, and reconstruction already speaks it. What changes is one
pinned departure and the adoption fix below:

- **A childless topic id at outline root** → the **standalone**, as
  shipped (`isOrphan: true`). **A parented topic id at root** →
  **PROMOTES**, as shipped (`promotedUuids` keeps its producer;
  `summary.promoted` and its copy are unchanged — the r0 rework of
  both is withdrawn under OR-5b, which rules the canvas and the
  outline into one meaning: a hoist to root is a promotion). A
  PINNED parented id at root wraps instead (OR-5c, the
  species-at-birth rule) — the one departure from the shipped branch,
  and the pin is why.
- **A `+ Title` group at root** → a **section**, as today. The
  model named it, so the heading is the model's commitment —
  `untitled` is never set on the AI path.
- **An existing section id** → a section, unchanged.

### Adoption obeys the home's bearing (the M3 fix)

The three adoption sites stop inheriting a chain blindly. The
inherited candidate (own wrapper's chain, else the card above's) is
consulted against the home's declared bearing FOR THE SPECIES BEING
MINTED — the same `accepts` data, fourth consumer (O2's "never a
second table"):

- home bears the species → inherit, as today;
- home bears sections only and the minted card is standalone → the
  card is **born a section by the species-at-birth rule** (Decision 2:
  a parented entry promotes, a childless entry wraps entry-titled
  with `titleDerived`, a pinned parented entry wraps). On M3's
  fixture the hoisted leaf becomes a one-page group inside the tab:
  writable, valid, and what "top level" honestly means on a
  container root;
- no reachable home bears it (a bears-nothing root with no card
  above) → the outline's first-entry case: chainless, and Decision
  5's unhoused surfacing owns it.

The regression test for M1-case-B's producer is named in Fences.

### The constraint arms grow their labels

The capability-fields arc declined a mode field on `create-cards` /
`reorder-cards` with its reason stated: "a created card cannot [be
labeled] … a mode-dependent framing would promise a label that does
not exist." This note mints the label, so the reason retires and the
framing lands — the same reversal-with-its-cause the streaming
amendment performed on the truncation-capture ruling:

- **Grounded**: both arms render exactly today's sentences —
  byte-stable, diff-asserted against the parity fixtures (the
  grounded baseline must not move).
- **Aspirational**, capability false: *"…you MAY create one /
  reorder them when the arrangement calls for it: each will be
  labeled for the user to carry out by hand."* — enforcement and
  communication shipping together, classify-semantics edition
  (docs/21 Decision 5's never-empty precedent, verbatim in shape).
- `explicitViolations` arms stay `[]` in both modes with the reason
  at the clause updated: the validator opens these arrangements, so
  there is still nothing a retry would rescue.

`newSectionsGate` becomes mode-aware in ONE branch: on a
`createCards: false` document an **aspirational** run re-arms the
toggle (the run may imagine new cards; they will be labeled), while
the grounded branch keeps its disabled-with-a-reason sentence. The
gate stays a single producer for the control, the sentence and the
clamp; the mode joins its inputs.

### What does not change

`parse.ts` accepts no new syntax; the multiset and identity nets are
untouched in both modes; scope pass-through is untouched; the
grounded validator discards nothing new (a created card still opens —
the wall it used to hit at Review becomes Decision 4's projection).
Also considered and rejected: a grounded-mode DISCARD net for
created/reordered cards, to keep "grounded = applyable" pure. That
net would spend a corpus-scale call to enforce at proposal time what
the plan now handles with a partial apply — the discard is the most
expensive outcome the pipeline has, and parity exists because of a
call it burned.

## Decision 7 — the hand: gating, the seam's second producer, and the death of pinned-to-card

### Which drops gate, and which merely say

- **A structure-MAKING drop on a document that cannot write it** — a
  canvas drop (or "Add heading", or the row menu's "Move to new card" — third
  producer, added at arc-2 certification) on a `createCards: false` document —
  runs the SAME consent gate as the pinned drop
  (`pinnedGate`, generalized: the verdict function gains the
  structural cause alongside the pinned count). Grounded-unasked: the
  seam fires at the release point, second producer of docs/21's seam
  shape, different in KIND from the first exactly as the
  second-producer discipline wants — the pinned seam asks about a
  ROW the source owns, this one asks about STRUCTURE the format
  cannot record. Copy, same laws (a mode choice, never a move
  confirmation; states the split, never a vanishing):

      This creates a card — here, cards are toctree blocks, and the
      app can't write a new one.

      ▸ Switch this tab to Aspirational and make it
          The card is labeled for your hands; everything else stays
          writable and verified as normal.
      ▸ Keep this tab Grounded
          Nothing changes. You can switch later from the tab menu.

  Declined tab: the drop refuses through `dragStore.refusal` with the
  escape hatch named. Aspirational tab: commits, card marked. This
  closes the Substrate finding that a Sphinx canvas drop today
  commits an arrangement Review must refuse — the gesture stops
  promising what the plan refuses.
- **Order-changing gestures do NOT gate.** A card drag on a
  `reorderCards: false` document and a within-block row reorder
  commit as today, with the docs/16-pattern consequence LABEL on the
  drop (*"→ order needs your hand here"*) and Decision 4's plan-time
  surface. Grounds: docs/21 Decision 9 already ruled the frozen-block
  reorder out of the seam ("the seam's opening claim would be false"
  … it "stays Decision 8's plan-time surface"), a reorder writes no
  record for consent to license, and a seam on every card drag of a
  Sphinx tab would be the forty-modals failure with a menu.

### One consent, widened (OR-3)

The tab's `aspirational` state licenses **imagined structure of every
kind** — pinned displacements and unwritable creations. One switch,
one meaning: "this tab may hold arrangements the app cannot write,
labeled." Two consents would put a second indistinguishable toggle on
the tab and force the seam to say which kind of imagination it is
asking about. The widening amends docs/21 Decision 2's defining
sentence and `TabState`'s docblock — named in Sweep obligations;
**OR-3 ruled it at gate 1**, with the trade recorded and accepted
there: consent given at one seam licenses later imagined structure on
that tab without a fresh seam, and the mark, the checklist and the
Overview carry the visibility.

**Two predicates widen with it, or the state contradicts its own
facts** (pre-mortem 5, and G1's own reasoning):

- **The birth rule.** docs/21: "born Aspirational iff it holds
  displacements at birth or was produced by an aspirational run."
  A GROUNDED run on a Sphinx tab can hoist a leaf (the validator
  opens it — Substrate M3) and the result then holds a creation
  record with an empty row ledger, so under the unwidened rule it
  would be born Grounded while holding structure the app cannot
  write. The clause widens to "holds displacements OR structural
  remainders at birth" — read from the derived report exactly as
  `hasDisplacements` reads the records (a collection result carries
  its snapshot through the rebuild, so the derivation is available at
  birth).
- **G1's switch-back predicate.** "Empty-ledger only" becomes "empty
  ledger AND empty report", with the disabled-with-a-reason sentence
  naming both ways back: Put back for displaced rows, and for a
  created card, deleting it or re-homing its rows. Same ruling, same
  ground: "Grounded" is a promise a tab holding remainders cannot
  make.

Both widenings ride OR-3 — one ruling covers the meaning and its two
consumers.

### `pinned-to-card` dies, and what replaces it (pre-mortem 5)

The refusal's stated reason was that promotion erases the pin
(docs/21 Decision 9's addendum names this note as the unlock).
OR-5c's wrap clause makes the reason false by construction, in both
entry shapes: a pinned CHILDLESS entry births the standalone, where
the pin survives on `topics[0]` exactly as it does inside any card;
a pinned PARENTED entry is WRAPPED, canvas-wide — the entry stays a
row inside the born section, `Topic.lock` intact. Either way the
move is an ordinary cross-parent displacement —
`captureOrigins`/`settleDisplacement` record it, the badge shows it,
Put back returns it, the projection sends it home (and then prunes
the emptied standalone husk, Decision 4; an emptied wrap dissolves
under its creation record where one exists). The drop therefore
gates exactly like any pinned cross-parent drop: seam, refuse, or
commit-badged by tab state. The `guards.ts` clause and
`moveLabel.ts`'s `pinned-to-card` sentence are deleted with the
build; the capability-flip copy sweep is theirs.

Interaction facts, stated so they are sentences rather than
discoveries: a pinned row may seed a creation on a `createCards:
false` document only through the seam (both facts — the pin and the
creation — ride one consent, one seam, with the copy naming both
counts); "Add heading" over a pinned standalone row is legal in every
tab state (the row stays a row; nothing displaces); creation records
and pin records compose on one card (a created card holding displaced
pinned rows lists both, and the projection's pass order handles the
composition).

## Decision 8 — costs, edges, migration

- **Persistence: nothing new persists.** All three kinds derive; the
  one new stored field is `Section.untitled?: true` on documents (an
  absent optional rehydrates as undefined — the provenance
  precedent, asserted not assumed, no `PERSIST_VERSION` bump).
  `isOrphan` keeps its shipped shape (OR-5a), so persisted sessions
  are untouched by construction.
- **Token cost.** The two aspirational arm reframings are O(1) prose,
  ~+40 tokens each by chars/4, only on capability-false documents,
  only in aspirational mode; the grounded payload is diff-asserted
  unchanged. No per-row cost anywhere — the marker set is untouched.
- **Root bearing on adapters without containers** — a declaration
  owed, not assumed. DocFX and MkDocs roots bear both species (their
  parses produce root orphans today — the model's own orphan-wrap
  law). Sphinx's root bears neither new species (`createCards:
  false` covers it). Hugo, JTD and Docusaurus roots: whether a
  STANDALONE page at content root is a thing their published sites
  render is a published-rendering-fidelity question (the `no_list`
  lesson — a plausible answer read off a key name mismarked 77
  pages), so this note declines to answer it. **Marked**: the build
  answers per adapter with a receipt from the theme or live site,
  through the same required-declaration discipline as
  `reparentMovesFiles`, verified against each adapter's own planner
  (the capability-fields method — every answer verified, never
  copied).
- **An entirely-refusing document** (Sphinx: no creations, no card
  order, frozen rows): the dialog's existing entirely-pinned notice
  pattern extends its sentence where all three capabilities are
  false-or-frozen; disabled-with-a-reason stays wrong for the same
  reason as before — within-card reorder of unfrozen rows is real
  work.
- **Cross-checkable numbers wired where they exist**: the creation
  record count must equal the planner's would-be
  `section-set-changed` surplus (blocks vs cards); the report-empty
  ⇔ plan-clean equivalence is the standing oracle (Fences). A wrong
  derivation shows up as a wrong count on screen, not as nothing.

## Fences and contract tests for the build

Named per the test-ownership split: what is asserted, in what form,
against which oracle. The builder writes all test code.

1. **Derivation oracle (report ⇔ plan).** Property, Sphinx fixtures:
   for arrangements generated by random moves/creations/reorders, the
   structure report is empty iff `planChanges` on the raw document
   raises none of `section-set-changed` / `card-reordered` /
   frozen-block warnings; and each kind's presence predicts exactly
   its refusal. Oracle: the planner itself — the display is its own
   oracle, wired.
2. **Projection completeness.** Property: `planChanges(files,
   projection, projectedOrder)` NEVER refuses `section-set-changed`
   or `card-reordered` and never carries a frozen-block blocking
   warning. Plus projection equivalence (docs/21 invariant 3
   extended): plan(projection) ≡ plan(the same arrangement built
   directly), byte-compared.
3. **Pass-order pinned by minimal pair.** Example test: one document
   holding a pin record, a creation whose member is that same pinned
   row, and a row-order record on the emptied block — asserted
   restored membership first, husk pruned, order restored on the
   survivors. Mutating the pass order fails it.

   > **[amended 2026-08-21, scoped — built in `docs22-machinery`;
   > wording corrected at arc-1 certification]** "Mutating the pass
   > order fails it" holds at every boundary except around pass 4,
   > which is confluent with what precedes it for TWO DIFFERENT
   > REASONS. With MEMBERSHIP, under the locked-prefix invariant:
   > pass 4 sorts frozen rows into the positions they ALREADY OCCUPY,
   > and frozen entries always occupy the front of a host's list, so
   > no unlocked row can interleave and the answer never depends on
   > whether an earlier pass has put a row back yet. With PASS 3,
   > STRUCTURALLY: pass 3 writes only the card SEQUENCE and reads
   > only section natural keys, which pass 4 — reordering rows WITHIN
   > cards — never changes. Both orders are pinned by CONFLUENCE
   > ASSERTIONS rather than by mutants (`sphinxProjection.test.ts`,
   > "THE CONFLUENCE that licenses the pass-order deviation"): the
   > membership half is MUTATION-VERIFIED — an INDEX-SPLICE
   > reimplementation of row order, placing each row at its absolute
   > source index, turns it red — and the 3↔4 half is a REGRESSION
   > GUARD on the independence, failing the day pass 3 starts reading
   > row state. Every other boundary stays mutation-killed, six for
   > six.
4. **M1 regression, both sides.** The unsealed standalone in a
   bears-no-orphans home refuses at serialize with the one-producer
   message (form: the exact bytes M1 case A/B produced, kept as the
   vacuity check the schema plank already models); every shipped
   fixture's sealed `$ref` orphans still round-trip byte-identical
   (the exclusion asserted, not just the inclusion).
5. **M3 regression (adoption per home).** Property over
   container-rooted fixtures: reconstruction never mints a card into
   a home whose declared bearing refuses its species; the hoisted
   leaf on a tabs root arrives as a one-page section inside the tab
   and the export validates (oracle: the vendored schema, shipped
   shim).
6. **Species round-trip and birth shapes.** Conformance-suite
   extension, every format adapter: a standalone card (childless
   entry — the ruled shape) serializes and re-parses to the same
   species; heading-add then heading-remove restores byte-identical
   export (command-inverse property, the undo law's shape). Plus
   three named birth assertions (the OR-5 set): a canvas CHILDLESS
   drag-out births the standalone and the old
   wrap-into-a-duplicate-named group is no longer minted (regression
   against the Substrate's receipt); a PINNED parented drag-out
   births the wrap with the pin intact and the displacement recorded
   (form: the born card's row still carries `lock` and `displaced`);
   a parented drop on an anchors lane refuses with the regime-2
   sentence (OR-5d).
7. **Species predicates get the minimal pair, mutation-checked before
   review.** Standalone vs promoted vs wrapped, untitled vs renamed,
   born vs converted — fixtures carry one node in each state in one
   document (the state/transition conflation rule).
8. **Tab-state fences extend.** Two tabs identical in document,
   differing only in `aspirational`/`seamDeclined`: byte-identical
   plans, checklists, reports, projections. The creation seam fires
   only on `createCards: false` documents, once per tab; construction
   assertion that the report selector's inputs are (document, source)
   with no tab-state or mode parameter.
9. **Grounded byte-stability.** The grounded payload, prompt and
   validator behavior are unchanged — diff-asserted against the
   parity fixtures; the aspirational payload differs by exactly the
   reframed arm blocks on capability-false documents.
10. **Verb totality.** The transform-verb derivation is an exhaustive
    switch over remainder kinds plus the species evidence; a new kind
    fails `pnpm check` at the verb function and at the checklist
    renderer before it can ship unlabeled.
11. **No-journal fence.** Absence test on the construction: no store
    import in the report module; no new persisted field beyond
    `Section.untitled`; grep-proof by import/call, not vocabulary.
12. **Copy honesty sweeps as tests where a capability flip lands**:
    the `pinned-to-card` sentence is gone from `moveLabel.ts`; the
    Sphinx canvas drop on a Grounded-unasked tab opens the seam
    rather than committing (e2e, real pointers, no provider — the
    flow-16 shape).

## Out of scope

Implementation (this is a design note). Container creation and
container reordering (docs/13's recorded absences — a "new tab" is
still made by hand, and the unhoused remedy says so). Card deletion
as a remainder kind (OR-4 — derivation sees it; demand does not yet).
Aspirational renames (docs/19's deferral stands). Any change to what
the adapters will write: no new `FileChange` species, no block
creation, no `planChanges` widening — the projection exists so that
NOTHING here touches a writer. Slug/naming of created Hugo sections
beyond what docs/16 shipped. The diff view and the
comparison-as-motion animation (Decision 3 types their feed; docs/08
holds the feature). DocBook (note 20 stays reserved).

## Sweep obligations (on landing, not before)

- docs/21: Decision 9's addendum (unlock landed — `pinned-to-card`
  retires); Decision 8's `order` paragraph (superseded by the
  `row-order` kind here, named); Decision 2's tab-state sentence,
  `TabState`'s docblock, the birth rule's first clause and G1's
  switch-back predicate (all OR-3's widening); the "every ledger
  record names a row" sentences that the sibling report qualifies.
- docs/13: the adoption amendment ("never ruled and stays unbuilt" —
  ruled here, per-home; the canvas path adopts by the drop's home);
  the carve-out sentence in the write-path section (narrowed to
  sealed).
- docs/10: the disposition's "structural-remainders design" pointer
  gains this note's number; `constraints.ts`'s "NO MODE FIELD"
  docblock (the reason retires with the label minted).
- docs/05: the gestures table (childless wrap → standalone birth;
  parented promotion unchanged and now ruled; pinned parented →
  wrap; the species commands); the card-level intent mark joins the
  badge amendment's family.
- `moveLabel.ts` / `guards.ts`: the `pinned-to-card` member and
  sentence — the capability-flip copy sweep.
- CLAUDE.md index line for docs/22 — proposed in the report, landed
  only on merge instruction, last (the index-goes-stale-first rule).
