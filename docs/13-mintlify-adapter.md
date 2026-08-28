# 13 — Mintlify docs.json adapter (design)

Status: **built**. `src/formats/adapters/mintlify.ts`, registered, with
the legacy `mint.json` recognizer co-located, four conformance fixtures,
a bundled sample and an e2e flow. All seven open questions are settled;
see the last section for what implementation changed. This note records
what the format is, what a survey of two real repositories says, where
the direction it was briefed with is wrong, and what was decided.

Reference corpora, both read-only and MIT:

- **mintlify/docs** (`6e09e8ee`) — 23 KB `docs.json`, 727 lines, 192 nav
  paths, 1074 MDX files on disk.
- **mintlify/starter** (`92e9a1a2`) — 1.4 KB `docs.json`, 71 lines.

## What the format is

One root `docs.json`, identified by `"$schema":
"https://mintlify.com/docs.json"`. Navigation is a **subtree of a config
file that carries everything else too** — `name`, `theme`, `colors`,
`logo`, `favicon`, `navbar`, `footer`, `integrations`, `redirects`,
`seo`, `contextual`, `api`. The nav is explicit and hand-maintained.

This note designs a **format adapter** (docs/04): one file in, one file
out, no folder snapshot, no `expand`, no `planChanges`, no caps. MkDocs
is the closest sibling, not DocFX — it is the existing adapter whose nav
also lives inside a larger config file it must preserve.

It is deliberately the *cheap subset* of Mintlify support. Two findings
below — `$ref` language files and frontmatter titles — say the fuller
answer is a second, folder-loading **collection** adapter, which docs/04's
routing rule now permits rather than forbids. Both can exist; detection
routes on whether the user loaded a file or a folder.

## Survey

| | mintlify/docs | mintlify/starter |
|---|---|---|
| bytes / lines | 23044 / 727 | 1380 / 71 |
| top-level keys | 18 | 10 |
| `navigation` top key(s) | `languages` | `pages`, `global` |
| nav string paths | 192 | 2 |
| groups | 45 | 1 |
| tabs | 5 | 0 |
| max nesting depth | **6** | 2 |
| indent unit | 2 spaces | 2 spaces |
| trailing newline | yes | **no** |
| CRLF / tabs / non-ASCII | no / no / no | no / no / no |
| integer-like keys | 0 | 0 |

Entry shapes across both files:

| shape | count | example |
|---|---|---|
| plain page path (string) | 194 | `"index"` |
| `group` object | 46 | `{"group": "CLI", "root": "cli/index", "pages": [...]}` |
| `tab` object | 5 | `{"tab": "Documentation", "groups": [...]}` |
| `$ref` object | 3 | `{"$ref": "./fr.json"}` |
| external link (`href`) | 2 | `{"anchor": "Documentation", "href": "https://…", "icon": "book-open-cover"}` |
| `language` object | 1 | `{"tabs": [...]}` |
| **openapi / asyncapi** | **0** | — |

Metadata seen on group-like containers: `root` (15), `boost` (2),
`hidden` (1), `searchable` (1), `menu` (1), `icon`, `tag`.

### What the survey changes

Four corrections to the direction this was briefed with. Code and corpus
win.

**1. Navigation is not "tabs → groups → pages".** The top of
`navigation` is a *variable container*, and the two corpora disagree:
starter is `{pages, global}` with no tabs at all; docs is `{languages:
[…]}` with tabs one level further down. Depth reaches **6**
(languages → tabs → groups → pages → group → pages). Any parser that
assumes a fixed chain will fail on one of the two files that ship with
the product.

**2. There are zero OpenAPI navigation entries.** The brief attributed
the nav-pages-vs-files gap to OpenAPI-generated reference content. It is
not: `docs.json`'s only `api` key is `{"mdx": {"auth": {"method":
"bearer"}}}`, and the `*-openapi.json` specs in the repo are referenced
from page frontmatter, never from navigation. **The gap is
translations** — `fr.json`, `es.json` and `zh.json` each carry exactly
192 paths, so 4 × 192 = 768 nav paths, plus snippets and components,
accounts for the 1074 MDX files. OpenAPI entries are a real Mintlify
feature and should be designed for, but this corpus gives them **zero
coverage**, the same caveat that applies to Sphinx's rename syntax
(docs/12).

**3. `$ref` is real and load-bearing — and it is a routing signal.**
`navigation.languages` holds three `{"$ref": "./fr.json"}` entries, each
pointing at a sibling file containing a complete `{tabs, language}`
navigation subtree; `redirects` uses one too.

docs/04 used to call this out as "No multi-file resolution", a flat
non-goal. That sentence was v1 scope restated without its qualifier, and
collection adapters crossed it years of work ago — it now reads as a
**routing rule**: a format adapter parses one blob, and a system whose
nav genuinely spans files belongs to the collection contract. So the
right reading is not "Mintlify is partly unsupportable" but "Mintlify is
showing us which contract it wants". See Titles, where a second and much
larger signal points the same way.

**4. Byte-identity to the input is stronger than any shipped adapter
delivers** — see the next section, which is the important one.

## Round trip: what the contract actually promises

The brief asked for "every other key round-trips byte-identically,
including key order, indentation style, and trailing-newline state."
Measured against the shipped adapters, that is not what the contract
delivers, and it is worth being precise about the gap before designing
to it.

`serialize` in every current adapter **re-serializes the whole
document**. MkDocs keeps the entire parsed config in `doc.extras.config`
and emits `yaml.dump({ ...config, nav })` — the spread preserves sibling
keys, their values, and the `nav` key's position, but the *text* is
regenerated by js-yaml.

Measured (parse → serialize → parse → serialize):

| | output == input | fixpoint |
|---|---|---|
| MkDocs, bundled sample | ✅ | ✅ |
| DocFX, bundled sample | ❌ (2169 B → 2503 B) | ✅ |
| MkDocs, hand-written config with comments | ❌ — **every comment destroyed** | ✅ |

So the law in docs/04 is **fixpoint** — the *second* serialize is
byte-identical — not identity with the input. The bundled MkDocs sample
matches its input only because it was authored in js-yaml's own output
style. "Comment/format-preserving YAML (CST)" is a docs/08 backlog item
precisely because this is a known limitation.

### JSON is in a much better position

The dominant YAML loss mode does not exist here: **`docs.json` has no
comments.** Measured on the corpora, re-dumping the parsed object at
2-space indent gives:

- **mintlify/starter: byte-identical**, including its missing trailing
  newline.
- **mintlify/docs: 89 of 727 lines differ, and every one is
  whitespace-only — zero content differences.** The file has hand-edited
  indentation drift between lines 136 and 561 (69 lines indented 4
  deeper than canonical, 15 shallower, 5 by 2).

**Recommendation: full re-serialize, same discipline as MkDocs, plus
recorded formatting.** Store in `doc.extras`: the whole parsed config,
and the four formatting facts the text carries but the parsed object
does not —

| recorded | why it is not cosmetic |
|---|---|
| **indent unit** (spaces, tab, or 0 for minified) | a re-indented file is a whole-file diff |
| **trailing newline** | starter has none; a spurious one is a diff in a config file |
| **EOL style** | as built. A CRLF file parsed fine and exported as LF, which is the trailing-newline harm at whole-file scale, so **CRLF in → CRLF out** |
| **byte-order mark** | as built. `JSON.parse` *rejects* a BOM outright, so an otherwise valid docs.json failed to load with an error naming a character its author cannot see. Stripped before parsing, recorded, written back |

Serialize with `JSON.stringify(config, null, indent)` and re-apply all
four. Neither corpus has a CRLF file or a BOM — both are covered by
synthetic tests and named as such — but both are ordinary on Windows,
and each is the same mechanism as the indent unit rather than a new one.
That yields:

- content identity always;
- **byte identity for any consistently-formatted file** — which is
  strictly better than MkDocs manages for YAML, and makes starter a
  fixture that can assert input-identity, not just fixpoint;
- fixpoint trivially, since our own output is canonical.

A file with drifted indentation re-exports canonicalised. That is a
whitespace-only diff in a machine-maintained config, and the honest
alternative — a JSON CST preserving original whitespace per token — is
the same class of work as the backlog's comment-preserving YAML, for a
much smaller prize. **Do not attempt a text-preserving edit of only the
nav subtree**: it re-implements a parser to save whitespace the format
does not carry meaning in.

**Decided: `parse` uses `JSON.parse(raw)`; `detect` keeps the registry's
shared `js-yaml` result** (docs/04 forbids adapters re-parsing for
detection). Two parsers now read the same bytes, which is fine — they
disagree only on inputs we refuse — but it makes the refuse list load
bearing.

Three JSON-specific traps the implementation must handle:

- **Integer-like keys reorder.** JavaScript objects hoist keys matching
  array indices to the front, so `{"2": …, "name": …}` would silently
  reorder on round-trip. Neither corpus has one (0 occurrences), but the
  parser should detect and refuse rather than corrupt.

  **Corrected in build:** refusing the *key* rather than the *reordering*
  was too coarse and rejected valid files — see the hazards table. The
  parser records each object's own key order and refuses only when
  JavaScript's iteration order would differ from it.
- **Escaping.** `JSON.stringify` emits raw UTF-8 and never escapes `/`.
  A source using `\uXXXX` escapes or `\/` round-trips *semantically* but
  not byte-wise. Neither corpus does either; assert it, don't assume it.
- **Duplicate keys — detect and refuse.** `JSON.parse` resolves them
  silently, last-wins, so `{"navigation": A, "navigation": B}` loads as B
  and re-exports having dropped A without a word. js-yaml treats them as
  an error, so the two parsers would disagree about whether the file is
  even valid. Refuse, alongside integer-like keys: a config file whose
  meaning depends on which parser read it is not one to round-trip.

## Model mapping

| Mintlify | model | why |
|---|---|---|
| `group` object | **section** (card) | the only container that directly holds pages; the section analog |
| page path string | **topic**, `titleDerived: true` | exactly MkDocs' bare-path case |
| nested `group` inside `pages` | **topic with children** | groups nest; depth 6 observed |
| `tab`, `language`, `anchor`, `dropdown`, `version` | **ancestor chain in section `extras`** | see below |
| top-level page string (no group) | **orphan section** (compact card) | docs/04's existing mapping; removes the zero-card outcome entirely |
| `navigation.global` anchor | **orphan section**, chain `global`, `external` lock | visible and immovable, rather than invisible |
| `{"$ref": "./fr.json"}` | **orphan section**, locked | a card that says a quarter of the site lives elsewhere |
| everything outside `navigation` | `doc.extras.config`, verbatim | MkDocs' proven mechanism |

**Groups are cards; everything above them is recorded, not modelled.**
The alternative — modelling tabs as cards — fails because tabs contain
groups contain pages, and the canvas is two levels (card → topic tree).
Flattening the other way (a card per tab) would bury 45 groups inside 5
cards and destroy the comparison the product exists for.

So: **every group in the file becomes a card**, wherever it sits, and
each section records its ancestor chain (which language, which tab) in
`extras`. Serialize rebuilds the containers from those chains. Two
consequences to accept deliberately:

- Cards from different tabs sit side by side on one canvas. That is
  arguably *right* for an IA tool — the whole point is seeing the site
  whole — but the tab a group belongs to must be visible, or the reader
  cannot tell why two "Get started" cards exist. This is a UI question,
  not a parse question; docs/12's card-level treatment is the precedent.
- Reordering cards **within** a tab is expressible; dragging a card
  *between* tabs changes its ancestor chain. Decided, and general — see
  Containers.

## Locked nodes

docs/12 established `Topic.lock` with five kinds; Mintlify reuses them
rather than inventing more:

| entry | kind | note |
|---|---|---|
| `{"href": "…"}` external link | `external` | exact fit, already implemented |
| `{"openapi": …}` / `{"asyncapi": …}` | `pattern` | a rule that generates pages, like `:glob:` — zero corpus coverage |
| `{"$ref": "./fr.json"}` | `pattern` | nav we cannot enumerate, for a different reason: we may not read the file |
| any unrecognised object | `pattern` | round-trips verbatim; never rewritten |

**A group may replace its `pages` with an OpenAPI/AsyncAPI source**
(schema-confirmed). That is an *atomic locked section*, not a locked
topic: a card whose contents are generated from a spec we do not read.

### Decided: sealed is declared, not derived

This exposed a real defect in docs/12's card treatment, since fixed.

`isSectionSealed` derived the seal as
`topics.length > 0 && topics.every(locked)`. That guard makes the
predicate **vacuously false** at zero rows — so an OpenAPI-sourced group
(no rows, *not editable*) and a genuinely empty card (no rows, a perfectly
good drop target) were indistinguishable. They are opposites, and only the
adapter knows which is which.

**`Section.sealed` is now declared section data**, set by the adapter at
parse time and carrying a source label. The one predicate splits into
three named ones:

| predicate | means | who uses it |
|---|---|---|
| `isSealed` | declared: contents generated elsewhere, card not editable | **every behavioral consumer** — drop refusal, AI movement rules, merge candidacy |
| `allRowsLocked` | non-empty and nothing in it is currently movable | **UI hint only** |
| `isEmpty` | no rows | empty-state rendering |

Zero rows never derives a seal. **Empty and undeclared means empty**: a
drop target, and visible to the Balance preset as a merge candidate.

Auto-sealing a card because its last movable row became locked is
**rejected by name** — action-at-a-distance, where editing a row silently
changes what the card permits.

UI follows the distinction: a sealed-empty card shows its source label
with the lock treatment, no drop affordance and no empty-state prompt; a
genuinely empty card shows the drop affordance. The validator refuses
drops into sealed sections, and AI proposals that modify sealed contents
are rejected at the invariant layer, alongside the rename and multiset
rules.

**The twin was real.** Sphinx derived its seal the same way, and the fix
exposed a second over-reach: the godot Class reference card was rendering
as inert when dropping a topic into it is a legal Sphinx edit. Sphinx now
declares no seals, and that card renders on the `allRowsLocked` hint.

`$ref` as `pattern` is the weakest of these — see Open questions.

## Containers: the general mechanism

Mintlify is the **first instance** of a shape the codebase will meet
repeatedly: navigation containers that sit *above* the card level and
have no card of their own — Mintlify tabs, dropdowns and languages, and
next mdBook parts, Jupyter Book parts, GitBook parts, Docusaurus
categories, and DITA branches. Everything below is written as that
mechanism, not as Mintlify plumbing.

A card's **chain** is the full ordered ancestor path (e.g. *language
"en" → tab "Documentation"*), outermost first. The chain key is that
path, in order.

**Implementation note, correcting this note's own first draft:** the
chain is a model field, `Section.chain`, **not** `extras`. Same reason as
`Topic.lock` — the core must interpret it to draw the chip and refuse a
drop, and `extras` is data the core clones but never reads. It is absent
for every format whose cards are top level, which makes the whole
mechanism inert for the five adapters shipped today.

### Serializing

Partition sections by chain key (`partitionByChain` in
`model/selectors.ts`); order **within** a chain from `sectionOrder`; take
the order **of** chains from the original navigation, preserved in
`doc.extras`. `serialize(doc, sectionOrder)`
keeps its signature — the flat list stays the only ordering input, and
the chain partition is a serializer-internal mechanism.

### The no-op is not acceptable — it must be impossible

An earlier draft accepted "dragging a card across chains has no visible
effect on export" as a documented consequence. That is the wrong trade:
a gesture that appears to work and silently does nothing is worse than a
gesture that is refused, and documenting it does not reach the user doing
it. **The limitation is enforced at drag time, not ignored at serialize
time.**

V1 does three things:

- **A chain chip on the card meta ribbon**, beside the existing level and
  depth chips ([SectionCard.tsx:227](../src/view/canvas/SectionCard.tsx#L227)),
  naming the containing tab or dropdown. Without it a user cannot see
  that two cards live in different containers, which is the precondition
  for the constraint making any sense.
- ~~**Cross-chain drops rejected at drag time**~~ — **superseded by v2
  below, which reparents instead of refusing.** The rejection was right
  about the silent no-op and wrong about the gesture. What survives it:
  the cross-chain *predicate* (a slot is cross-chain when **every**
  neighbour at the post-removal index belongs to a different chain — a
  boundary between two chains stays legal, or ordinary reordering would
  break) is exactly the seam test v2 needs, and the one-line reason on
  the drag ghost is the channel v2's labels and refusals reuse.
- **Auto-arrange groups columns by chain**, with label bands, so the
  spatial layout matches the constraint rather than fighting it.
  **Unbuilt in v1 and folded into v2**, where it stops being cosmetic:
  containers are drop targets now, and a target you cannot see when the
  canvas is tidy is not a target.

New sections adopt the chain of the card above their creation or drop
position — the only rule that needs no extra UI and no guessing.

> **Amended 2026-08-20.** Measured against the code, this was true of ONE
> of the three arrival paths. AI reconstruction implements it
> (`validate.ts`, three sites). Canvas creation does NOT:
> `execCreateSection` builds its section with `createSection`, which sets
> no chain, whether or not a card sits above. The chainless card is
> therefore the ordinary case on canvas, not a remainder — which is what
> made the write-path refusal necessary. Adoption on the canvas path was
> never ruled and stays unbuilt; see the amendment at the end of this
> note.

> **Amended 2026-08-21 (docs/22 arc 2, Decision 2 — RULED AND BUILT on
> the canvas path).** The paragraph above is now history. R2 rules that
> **the drop position names the HOME**, and `execMoveTopicsToNewSection`
> assigns the chain at birth from the drop slot's neighbours — the same
> neighbour reading `classifyDrop` gives a card drag, minus its seam
> case, because a card being MOVED has a chain of its own that a seam
> could offer to keep and a card being BORN has none.
>
> The consequence is bigger than the field: a chainless card is no longer
> the ordinary case on canvas, it is **unreachable by any gesture**. The
> home's declared bearing decides what may be born there, and a home that
> bears neither species refuses the drop with a sentence naming the lanes
> that do ("nothing is born unhoused"). The write-path refusal stays the
> FLOOR (docs/22, R5) and stops being the first notice.

> **Amended 2026-08-21 (docs/22, Decision 6 — ruled AND built, on the AI
> path only).** Adoption is no longer "inherit the card above's chain";
> it is **per-home**, consulted against the home's declared bearing FOR
> THE SPECIES BEING MINTED, at all three `validate.ts` sites. Three
> regimes: the home bears the species, inherit; the home bears sections
> only and the card would be a standalone, it is BORN A SECTION wrapping
> the entry (titled after it, `titleDerived`); nothing reachable bears
> it, chainless — surfaced rather than refused, since a model
> mid-outline cannot be handed a sentence naming real homes and act on
> it. The rule governs a BIRTH: a card that already exists is re-listed
> and keeps its species, which is what stops a sealed `$ref` standalone
> being re-speciated into a group.
>
> **THE CANVAS PATH IS UNCHANGED BY THAT ARC** and this paragraph still
> describes it: `docs22-machinery` changes no gesture. The canvas drop's
> own home law is arc 2's.

The **AI validator** enforces the same rule at the same layer as the
rename and multiset guards (docs/10, docs/12). Chains are invisible to
the outline, so a proposal cannot name one — what it *can* do is reorder
cards across chains, which the serializer then cannot honour. Sections
keep their own chain through reconstruction, new sections inherit the
chain of the card above them (and are CHAINLESS when there is no card
above — the outline's first entry has nothing to inherit from), and a
proposal that interleaves chains
returns a warning saying that part of it will not appear on export,
rather than exporting a silent no-op.

### V2 — the drop means what it looks like

**Superseding v1's second bullet.** Refusal was the right answer to the
silent no-op and the wrong answer to the gesture: a user dragging a card
into another tab is not making a mistake, they are asking for a move the
format supports. V1 made the limitation visible; v2 removes the
limitation. The chip and the lanes stay — they are what makes the
gesture legible — and only the *refusal* is replaced.

**A cross-container drop is a REPARENT**: the section's `chain` becomes
the target container's, at the drop position.

#### Consent lives in the gesture, not after it

The whole design follows from one question — *how does the user say they
meant the cross-container reading?* — answered **before** the drop
rather than after:

- **Drop zones are labeled with their meaning while dragging.** A
  same-chain position reads as a reorder; a cross-chain zone reads
  **"→ moves to *Container*"**. Container regions highlight as lanes;
  ineligible regions dim. The stage has to exist for the consent model
  to play on it, so **reparent does not ship without the depiction.**
- **An unambiguous drop commits directly** — clearly inside another
  container's cluster is not a question worth asking. The undo toast
  names what happened: **"Moved to *Container*" · Undo**.
- **A seam-ambiguous drop asks, in two options.** Between the last card
  of chain A and the first of chain B, reorder-within and move-between
  are both plausible readings of the same pixel, and there is no
  defensible default: **"Keep in *A* (reorder)"** / **"Move to *B*"**.
  Esc cancels the drag as it already does.

**No modal confirmations anywhere.** Recorded because it is the obvious
thing to reach for and it is wrong three times over: the operation is
**undoable**, **visible** (the chain chip updates on the card), and
**non-destructive** — no page path moves, nothing is deleted.
Consequence-checkpointing belongs to Review changes, where a diff is on
screen, not to a canvas gesture. And a proceed/cancel modal would
*presume the cross-container reading* at exactly the position where that
reading is least certain, which is the seam — it answers the wrong
question loudly. The two-option menu asks the right one quietly.

> **A SECOND PRODUCER, 2026-08-20 (docs/21 arc 2).** The seam-menu shape
> has one now: `PinnedSeamMenu`, raised when a drop would move a row the
> source pins in place on a tab that has not yet said whether it holds
> imagined arrangements. It is different in KIND from this one, which is
> what makes it worth having — the card seam asks *which move was meant*
> at a position that reads both ways, while the pinned seam asks *what
> kind of tab is this*, at a position that is not ambiguous at all. What
> transfers verbatim is the reasoning above: two readings genuinely live,
> the operation undoable and non-destructive, so the release asks WHICH
> rather than WHETHER, and a proceed/cancel modal would presume an answer
> — there, the cross-container reading; here, that a displacement is a
> thing to be authorized, when it is thought rather than action. The
> "no modal confirmations anywhere" rule survives both.

#### The container registry — declared, never derived

Both refusals need a fact the model did not have: *what does this
container hold?* `Section.chain` is a list of labels, and "bears groups
vs bears anchors" is format law.

**Rejected: like-joins-like** — judging what a container accepts from
the cards already inside it. It is the `sealed` mistake one level up:
aggregate derivation of a property that gates behaviour. Named failures,
all three fatal on their own:

- a container that legally bears sections and **holds none** reads as
  bearing nothing — it refuses a legal move and draws no lane;
- **bootstrap is bricked**: the first card of an empty container can
  never be placed, because there is nothing to infer from;
- **format law is re-derived from instance state** on every edit, which
  is not where format law lives.

**Adopted: declared container descriptors, promoted to model data** —
`{ chainKey, label, order, accepts: { sections, orphans }, mayEmpty }`,
populated by the adapter at parse. Model data rather than `extras`,
because the core has to read it and never reads adapter extras.
Mintlify declares per array KEY, which is where the format states it:
`groups` bears sections and may not empty (`tabs.groups` has
`minItems: 1`); a container-level `pages` bears both; `anchors` bears
orphans only; the arrays that hold other containers — `languages`,
`tabs`, `menu` — bear neither, so a `$ref` orphan may sit in one but
nothing can be dropped there. Formats without containers declare none,
and the whole mechanism stays inert.

**One field is deliberately toothless.** `kind` carries the format's own
noun for a container — "tab", "dropdown", "language" — and feeds **copy
only**: the chip's tooltip, the seam menu, the undo toast. Behaviour
stays on `accepts` and `mayEmpty`, and the field says so at its own
declaration so it cannot quietly start gating something later. It is
optional: a format with no noun for its containers omits it and every
copy surface degrades to the label alone.

The chip itself still shows the container's NAME and never the bare
word "tab", which collides with the app's own document tabs and has
already confused a real reader. The tooltip is where the format's term
earns its keep — *Tab 'API reference'* — because it has the room and
the reader asked for it by hovering.

**The registry absorbs what v2 had scattered**: the order OF containers
(out of adapter extras, where the core could not see it), lane identity,
band labels, the seam menu's and toast's copy, and the never-empty
guard — all format knowledge with the same problem, now with the same
home.

**Like-joins-like survives as a lint**, which is what it was always good
for: a declared non-bearing container holding section cards, or a
section whose chain resolves to no bearing container, is an adapter bug.
It runs in the conformance suite, so every future container format
inherits it, and it judges SECTION cards only — an orphan in a
bears-neither container is the `$ref` case, and flagging it would be the
lint disagreeing with the format rather than with the adapter.

#### Two refusals at the DROP, and they are type errors, not confirmations

Refused with a one-line reason and no menu, because neither has a second
reading a user could have meant:

- **the target is not a groups-bearing container** — dropping a group
  into something that holds pages is not a move, it is a type error;
- **the move would empty the source container** — `tabs.groups` has
  `minItems: 1`, schema-verified, so emptying a tab writes a file
  Mintlify rejects. Same family as docs/12's co-location refusal: an
  edit whose result the format cannot represent.

**Amended 2026-08-20 — count these by LAYER, not as a flat total.** A
third refusal now exists and it is not a third item in this list,
because it fires somewhere else entirely. The three families:

| layer | refuses | reaches the user as |
| --- | --- | --- |
| parse | two containers sharing a path; one level holding two kinds of child | a load error |
| drop commit | the two type errors above | a one-line reason on the drag ghost |
| write | a card inside no container at all | `SerializeRefusedError`, at export |

The drop refusals answer *may this gesture happen*; the write refusal
answers *can this arrangement be written*. An arrangement can be legal
at every gesture and still be unwritable, because a card that was never
dropped anywhere was never asked.

#### Where the check lives, and why that is the whole lesson

**Once, at the section-reorder commit path** — the choke point every
gesture funnels through — and never per UI entry.

This is the sidebar hole generalised. V1's cross-chain guard sat inside
the canvas drag handler, so the sidebar list shipped without it and
committed the very move the canvas refused. The fix shared one
`previewOrRefuse` between the two drag paths, which closed *that* hole
and left the shape intact: the guard was still in the **drag layer**, so
anything reaching `reorderCard` another way — a command, a restored
layout, a future affordance — was unguarded. V2 moves legality to the
command, and canvas and sidebar guards become **UX messaging over a
check they no longer own**.

The test that matters is therefore the one that **cannot tell which UI
fired the gesture**: dispatch the command, assert the invariant. A test
that drives a drag proves that drag; a test at the choke point proves
every entrance, including the ones not built yet.

#### The sidebar expresses the same semantics

Within-chain drops reorder, as today. A drop at a chain boundary is
**by construction** seam-ambiguous — a list has no lanes to be
unambiguously inside — so it raises the same two-option menu over the
same commit path. Neither affordance gets bespoke rules; that is what
produced the hole the first time.

#### What this does not change

- **Chains become MUTABLE data.** They were adapter-declared and
  read-only; a reparent writes one. The multiset invariant is unaffected
  and the reason is worth stating: a reparent moves **ancestry**, not
  content — every page path is conserved, so the net that guards content
  safety neither fires nor needs to.
- **No serializer change is expected.** `partitionByChain` already
  rebuilds the navigation from the recorded template, and
  reconstruction preserves `chain`. A reparent is a minimal edit inside
  the navigation subtree, and both corpora must stay byte-identical.
- **New sections still adopt the chain of the card above** their
  creation or drop position. Unchanged, and still the only rule that
  needs no extra UI and no guessing.
  **Amended 2026-08-20:** true of the AI path only; canvas creation
  sets no chain at all. See this note's last amendment.
  **Amended 2026-08-21 (docs/22 arc 2):** true of BOTH paths now, and
  sharpened on both — the chain is consulted against the home's declared
  BEARING for the species being minted, rather than inherited blindly.
- **Container reordering stays out of scope**, and stays a future
  *explicit* affordance. Deriving chain order from member card positions
  is rejected by name: action-at-a-distance, where dragging one card
  silently reorders a container the user was not editing and the effect
  is invisible until export.
- **The AI pipeline is unchanged this iteration.** The validator still
  rejects a proposal that changes a section's chain, and still warns
  about rearrangement it cannot honour. An `allowReparent` run option is
  **follow-up work, recorded not built**: the manual gesture first, the
  model capability second, so the semantics are settled by hand before
  they are delegated.

#### Rejected in design

- **Freeform container polygons** — drawing a hull around each
  container's cards. It reads well on a tidy layout and lies on every
  other one: cards are freely positioned, so a hull either overlaps its
  neighbours or excludes its own members. Lanes are honest because they
  are only claimed where the layout actually is one.

## Titles: the hard problem

**Verified against the published schema** (`https://mintlify.com/docs.json`):
a `pages` entry is **a string path or a group object — nothing else.
There is no per-page title anywhere in the schema.** Group display names,
by contrast, *are* stored in `docs.json` (`{"group": "Get started", …}`).

That single fact splits the problem cleanly along the model's own seam,
and corrects an overstatement in an earlier draft of this note:

| model node | source of the title | editable in `docs.json`? |
|---|---|---|
| **section** (group) | the `group` string, right there in the file | **yes** |
| **topic** (page) | that page's MDX frontmatter (`sidebarTitle`, else `title`) | **no — the schema has no slot for it** |

So it is not true that every title is derived. **Card titles are real and
editable**; only row titles are path-derived. That matters, because the
cards carry the structure a reader scans first — the "legible to a
stranger" risk is real but much narrower than "the whole canvas is
mislabelled".

It also means a topic rename is not merely unsupported by this adapter —
it is **inexpressible in the format**. No amount of adapter cleverness
writes a page title into a file with no field for one.

**Option A — path-derived topic titles (decided for v1).**
`deriveTitleFromPath("organize/settings-appearance")` → "Settings
appearance", with `titleDerived: true`. This is **exactly what MkDocs and
DocFX already do** for bare paths and href-only entries: serialize writes
the path back unchanged, so an untouched document round-trips perfectly.
Section titles need none of this — they are read from and written to the
`group` string directly.

**Option B — a folder-loading Mintlify collection adapter (later).**
Read the folder, take titles from frontmatter, write nav changes back to
`docs.json` and renames back to page frontmatter. This is precisely what
the collection contract is for, and Sphinx already built the machinery:
graph-ish ingest, a title sidecar so titles survive into
`simulatePlan`, `supportsRename`. Two adapters for one system is
allowed and is the honest shape — a file adapter for the config and a
collection adapter for the folder.

**Option C — ask the user for titles.** Rejected: it invents content the
source does not have, and the round-trip could not represent it.

### Decided: rename capability is per node kind

`supportsRename?: boolean` (docs/12, decision 5) is too coarse for this
format, because the answer genuinely differs by kind: groups rename,
pages cannot. A single flag would force a false choice between disabling
a rename the format *does* support and offering one it cannot express.

**The capability becomes `{ sections: boolean; topics: boolean }`,
shared across both adapter contracts**, defaulting to `{ true, true }` so
every shipped adapter is unchanged by the migration. Mintlify declares
`{ sections: true, topics: false }`.

Three consequences, each a change to code that already exists:

- **Contract.** The flag moves from `CollectionAdapter` only to both
  contracts. Sphinx's current `supportsRename: false` migrates to
  `{ sections: false, topics: false }` — same meaning, new shape. This is
  a cross-cutting change and should land before either adapter depends
  on it (docs/12's decision 5 records the original).
- **UI.** The decision-5 wiring extends per kind rather than per
  document: topic rename affordances disable with a reason, while card
  rename stays live and serializes as an edit to the `group` string.
  `renameable` is already threaded Canvas → SectionCard → TopicTree →
  TopicRow (docs/12), so this is a widening of an existing prop, not new
  plumbing.
- **AI.** The reorganize validator must reject `id ~ Title` rename syntax
  for **topic** ids when `topics` is false, enforced at the
  **multiset-invariant layer, not the prompt**. Prompt instructions are
  advisory; the invariant is the thing that cannot be talked out of it,
  and this is the same reasoning that put content-safety there in
  docs/10 rather than in the system message.

**Recommendation: A first, B as the real answer — and B is not distant.**

A is small, matches two shipped adapters exactly, round-trips losslessly,
and gives byte-identical export today. Build it. But be honest about what
it is: a **cheap subset**, not the finished support.

The reason to say so plainly is that the two multi-file signals point the
same way. Under docs/04's old flat non-goal, `$ref` and frontmatter
titles both read as fixed limitations to work around. Under the routing
rule they read as evidence: **Mintlify's navigation is centralized but
its titles are distributed**, which is a fourth combination the codebase
has not met before —

| system | nav | titles | contract |
|---|---|---|---|
| DocFX, MkDocs | one file | in the nav file | format |
| JTD, Docusaurus | inferred from many files | in the files | collection |
| Sphinx | explicit, across many files | in the target files | collection |
| **Mintlify** | **explicit, one file** | **in the target files** | **?** |

Sphinx is the precedent that matters: its nav is explicit, like a format
adapter's, and it still became a collection adapter *because the titles
were somewhere else*. That is exactly Mintlify's situation, and the
machinery already exists — the title sidecar (docs/12, decision 1) was
built for this problem.

The cost of stopping at A is real but bounded: **every row** is
path-derived, while every card is correctly named. A reader scanning card
titles sees the true structure; a reader reading rows sees slugs. That is
a partial hit on PRODUCT.md's *legible to a stranger* principle rather
than the total one an earlier draft claimed.

So: ship A, state the limitation in the UI (**page titles are derived
from paths and will differ from the published sidebar**), and treat a
folder-loading Mintlify collection adapter as planned work rather than a
someday. It is the designated fix for **both** open ends — real page
titles and topic renames — and the mechanism already exists: JTD reads
per-page frontmatter today, which is exactly what Mintlify pages need.
Explicitly out of scope for v1. Two adapters for one system is the honest
shape — a file adapter for the config, a collection adapter for the
folder — and detection routes on what the user loaded.

## mint.json, and registry recognizers

Legacy schema, still in production (browserbase/docs, triggerdotdev/docs).
**Recognize and redirect; never parse.** Parsing it would mean a second
schema generation to maintain, and writing it would mean writing a format
Mintlify itself is migrating away from.

### Rejected: detect-and-throw

The first proposal was to have the Mintlify adapter's `detect` **claim**
`mint.json` and its `parse` throw the guidance — on the reasoning that
`parseDocument` emits one generic error when every `detect` returns 0
([registry.ts:67](../src/formats/registry.ts#L67)), so this was "the only
mechanism the contract permits". Recorded here as considered and
rejected, with its costs named, so it is not reinvented:

- it **redefines `detect` semantics** from "how confident am I that I can
  read this" to "do I have an opinion about this";
- it uses **parse-throw as a guidance channel**, which is an error path
  carrying product copy;
- it forces a **conformance-suite exemption** for a format that refuses
  inputs it claims — the suite runs every registered adapter against its
  fixtures, and this one would have to be excused by hand.

The contract being unable to express something is a fact about today's
code, not a constraint on the design. The right answer was a new concept.

### Decided: recognizers

A **recognizer** is a registry-level `{ test(input), message, helpUrl? }`,
consulted only **after every `detect` returns 0**, replacing the generic
"Unrecognized TOC format" error with a specific one.

Recognizers are emphatically **not formats**. They are never parsed,
never serialized, and **excluded from the fixpoint and conformance suites
by construction** rather than by exemption — there is no `parse` to call.
That is the whole reason the concept earns its place: it cannot be
confused with an adapter.

`parseDocument` throws a typed **`KnownUnsupportedFormatError`** carrying
the message and optional help URL, so the load UI can render the link
instead of flattening it into a string.

**Co-location:** the `mint.json` recognizer lives in and is registered by
the Mintlify adapter module. The knowledge that `mint.json` is legacy
Mintlify belongs next to the code that knows what current Mintlify looks
like, not in a registry grab-bag.

Its test: **filename is `mint.json`**, OR **a JSON object carrying
`navigation` and no `$schema`**. Its message: this is a legacy Mintlify
config; run `npx mintlify@latest upgrade` to convert it to `docs.json`,
then load that. It promises nothing about future `mint.json` support.

**Both halves of that were wrong, and the build corrected them** — see
"What implementation changed" and question 6's neighbours below. The
shape test is a navigation **list** (a real `mint.json` carries its own
`$schema`, so "no `$schema`" declined the very files this exists for),
and the message names `mint dev`, the command Mintlify documents today.

**Conservative sniff.** An ambiguous, nameless input falls through to the
generic error. A silent recognizer beats a wrong one: telling someone
their file is legacy Mintlify when it is not sends them to run a
migration tool on something else.

**Seed a second one immediately** — `SUMMARY.md` → "mdBook support is
planned" — so the shape is general from the first commit rather than a
mint.json special case wearing a general name. Add entries as formats
join the docs/08 queue; a recognizer is the cheapest honest answer to
"why doesn't my file load".

## Hazards

| hazard | disposition |
|---|---|
| **Two navigation shapes** (`{pages, global}` vs `{languages: […]}`) | Parse the container generically: find groups wherever they are. Do not hard-code a chain. Both shipped corpora must be fixtures. |
| **`$ref` to sibling files** | Round-trip verbatim as a locked node; a format adapter may not read them. 3 of 4 languages in mintlify/docs are invisible — state it at load, never silently show a quarter of a site. Resolving them is the collection adapter's job, not a workaround here. |
| **Indentation drift** | Re-export canonicalises whitespace. Whitespace-only diff, documented; not a correctness problem. |
| **No trailing newline** (starter) | Record and reproduce. A spurious newline is a diff in a config file. |
| **CRLF, and a byte-order mark** | Record and reproduce, like the indent unit. A BOM additionally has to be stripped before `JSON.parse`, which rejects one outright. Zero corpus coverage; synthetic tests only. |
| **Integer-like keys** | **Refusal removed.** Refusing every array-index-like key blocked `errors: {"404": …}`, which the schema *requires*, and the message asked the author to rename a key `additionalProperties: false` forbids renaming. The harm is reordering, not numerals: the source key order is now recorded per node and re-emitted, and the refusal fires only when JavaScript's own iteration order would **differ** from the file's. |
| **Duplicate keys** | **Refusal stands, and is the other half of the same scanner.** `JSON.parse` resolves them last-wins in silence where js-yaml errors, so the two parsers disagree about whether the file is valid — the one case the split-parser decision cannot absorb. Keys are unescaped before comparison, since `a` and `a` are one key to `JSON.parse`. Tested separately from reordering, and reachable without the registry's js-yaml gate: the load dialog lets a user name the format outright. |
| **Group `root:`** (15 occurrences) | A page path that lives **outside the `pages` array** — the group's own landing page. It is a real page reference the canvas would otherwise never show, and a naive "sections have no path" parse drops it silently. Maps to the section's `path`; serialize must return it to `root`, not into `pages`. |
| **Group metadata** | Preserve verbatim in section `extras`, schema-confirmed set: `icon`, `tag`, `hidden`, `searchable`, `expanded`, `root`, `boost`, `public`, `directory`. |
| **Renames have no syntax** | See Titles. Must be refused or routed to frontmatter, never silently dropped. |

## Validation invariants

- **Fixpoint** (docs/04): second serialize byte-identical. Non-negotiable.
- **Lossless**: re-parse deep-equal modulo ids.
- **Input identity on well-formed files**: assert `serialize(parse(x)) === x`
  for mintlify/starter specifically. This is a stronger bar than any
  current adapter meets and JSON can actually hold it.
- **Non-navigation keys byte-identical**: assert every top-level key
  except `navigation` is unchanged, as its own test rather than as a
  corollary of fixpoint.
- **Page-path multiset conservation**: the multiset of page paths is
  preserved by any edit except explicit removal — the same net that
  guards the AI pipeline (docs/10) and Sphinx plans (docs/12).
- **Locked nodes verbatim**: every `$ref`, `href` and unrecognised object
  survives byte-identically.

## Sequencing

Unlike Sphinx, no read-only phase is needed: a format adapter's write
path is a re-serialize, and the round-trip law is testable from day one.

1. Parse + serialize + fixture conformance, including the two shipped
   corpora and the input-identity assertion on starter.
2. `mint.json` detection and its guidance message.
3. Rename policy (refuse, per Titles) and the derived-title disclosure.

A folder-based Mintlify **collection** adapter (Option B) is a separate,
larger project and should not be attempted inside this one — but it is
planned work, not a someday. It is where real titles, frontmatter
renames and `$ref` resolution live, and it is the difference between a
canvas a stranger can read and one labelled entirely from paths.

## Open questions

All seven are settled. Five were settled in design — the reasoning is
recorded because several were settled by seeing they were the same
question — and the last two at implementation, on the rendered corpus.

### Settled in design

1. **Parsers.** `parse` uses `JSON.parse(raw)`; `detect` keeps the
   registry's shared `js-yaml` result. Consequence handled above:
   duplicate keys join integer-like keys on the refuse list, because the
   two parsers disagree about them and `JSON.parse` drops one silently.
2. **Document name** is `docs.json`'s `name` (schema-required). The
   filename fallback stays, but is now theoretical.
3. **Groupless navigation** applies docs/04's orphan mapping: top-level
   page strings become compact orphan cards.
4. **`navigation.global` anchors** become orphan cards carrying chain
   `global` and the `external` lock kind. The container mechanism's v1
   cross-chain rejection makes them immovable without any new rule.
   Extras-only was rejected: silent invisibility is the failure mode this
   codebase keeps re-learning.
5. **All-`$ref` navigation** is not refused. Orphan mapping extends to
   locked entries, so each `$ref` renders as a locked reference card with
   the load-time disclosure the hazard row already requires.

**3, 4 and 5 were one question.** Each asked what to show when the
navigation is legal but yields no cards, and all three dissolve into
docs/04's orphan mapping — a mechanism that already existed and that this
note had simply never applied. The zero-card premise behind the proposed
refusal in 5 was false once 3 and 4 were settled.

*Follows from the sealed decision, worth confirming:* a `$ref` card's
contents genuinely are generated elsewhere, so it is a natural candidate
for a **declared** `Section.sealed` with source `./fr.json` — the exact
case that concept was introduced for.

### Settled at implementation

6. **`pattern` is the lock kind for `$ref`.** Paired with docs/12's
   `pattern`/`external` split; answering one answered both.

   **Principle, recorded in both notes: split lock kinds when *behavior*
   splits, not when meaning feels different.** The trigger here is
   concrete — the collection adapter, where `$ref` targets resolve and
   globs still do not. On that day the two stop behaving alike and the
   split pays for itself. Until then it is nomenclature, and a kind that
   changes nothing but a label is a concept to maintain for free.

   It also renders best of the five: `pattern` sets the row title in
   mono, so `./fr.json` reads as the file reference it is, where
   `reference` would claim "Also in …" and `external` would claim the
   target is outside the docs set. *(2026-08-18: those claims moved
   from text chips to the glyph tooltips and the Overview's locked
   breakdown — the chips are retired, docs/12's table — but the
   argument stands: the mono title is the `pattern` row's best voice.)*

7. **The derived-title caveat is one document-level chip**, in the
   header beside the document's other facts, reading *Page titles from
   paths* with the full sentence on hover. Fired by
   `pageTitlesAllDerived` in `model/selectors.ts`.

   Decided on the rendered corpus, as routed, and the density settled
   it. mintlify/docs loads as 30 cards and 253 rows; measured across
   every shipped corpus:

   | document | page titles derived |
   |---|---|
   | mintlify/docs | **224 / 224** |
   | mintlify/starter | **2 / 2** |
   | bundled Mintlify sample | **13 / 13** |
   | DocFX sample | 3 / 24 |
   | MkDocs sample | 5 / 19 |

   So the predicate needs no threshold: every Mintlify document derives
   100% of its page titles, and every other format's corpus derives a
   minority. It counts **pages** — a group row carries a real name from
   the file even when it also has a `root` path, and a locked row names
   itself; counting either makes the predicate false for every real
   corpus.

   **Per-row treatment: rejected on the evidence.** It would mark all
   224 rows and carry no information at the density it exists to serve —
   the rejection docs/13 predicted, now measured rather than argued. It
   would also compete for the caret and badge slots the locked kinds
   already own.

   **Card-level: rejected.** The meta ribbon is full at this density —
   the chain chip already truncates to "Documenta…" — and every card
   would carry the mark, so the no-signal problem simply moves up a
   level.

   **Load-dialog line: insufficient alone.** It is gone the moment the
   document opens, and the reader who most needs the caveat is
   PRODUCT.md's third audience: the reviewer shown a canvas, or a
   screenshot of one, that they did not build. A header chip is in the
   frame of both.

   The tell is visible in the first card of the real corpus, which reads
   `Index / Quickstart / Ai Native / CLI / …`. "Ai Native" is the page
   published as *AI-native*, and nothing on the canvas said so.

   **The reassurance is conditional, which review caught.** The hover
   line ends "Card titles are read from the file" — true for Mintlify,
   false for a bare-path DocFX or MkDocs nav, where the predicate also
   fires and every card is an orphan wrapper named from a path too.
   There the one sentence a reviewer relies on would have been wrong
   about every label on the canvas. The copy decision therefore lives in
   `view/derivedTitles.ts` rather than inside the header component, so
   the DOM-free suite can hold it.

## What implementation changed

Four things the design did not anticipate, each found by building it:

- **Container paths must be unique, so a collision is refused.** Cards
  are matched to their container by chain path, so two identically named
  sibling tabs would pour both containers' cards into one on export.
  Refused at parse with the offending path named, alongside duplicate
  and integer-like keys.
- **Chains and seals did not survive AI reconstruction.** Mintlify is
  the first format to declare either, and `reconstructDocument` rebuilt
  sections without them — so reorganizing a multi-tab `docs.json`
  flattened every tab into the root container on export. Fixed at all
  four build sites, with the promote branch inheriting the container
  above it.
- **A declared-sealed card with no rows was dropped as empty.** The
  empty-sections pass counted rows, which is exactly the distinction
  `Section.sealed` was introduced to make. It now asks `isSealed`.
- **The `mint.json` guidance names `mint dev`, not
  `npx mintlify@latest upgrade`.** The corpus documents the current
  path (`organize/settings.mdx`, "Upgrade from `mint.json`"): the CLI
  was renamed from `mintlify` to `mint`. Corpus wins over the brief on
  an outside-world fact.

Deliberately **not** built, and still true as written above: the
folder-loading Mintlify **collection** adapter (option B), where real
page titles, frontmatter renames and `$ref` resolution live.

### Decided ≠ built

The most reusable thing this adapter found is not about Mintlify.

`Section.chain`, `Section.sealed` and the per-kind `RenameCapability`
were all **decided, landed in shared code, and read as done** — the
model field existed, the selectors existed, the UI drew the chip, the
drag layer refused the cross-chain drop, and docs/12 and docs/13 both
recorded the decision in the past tense. None of that was wrong. It was
just not the whole of the thing, and nothing said so, because **the
mechanisms had no producer**: no shipped adapter emitted a chain or a
seal, so every path that merely *carries* one was untested by
construction.

**The receipt is `reconstructDocument`.** It rebuilds a section field by
field — `{ id, ...named, path, extras, topics }` — and simply had no
line for `chain` or `sealed`. Nothing failed, because nothing produced
them. The day Mintlify did, a reorganize that moved *nothing* flattened
every tab into the root container on export. The same shape held three
more times in the same function: `Topic.lock` dropped on rebuild, so an
echoed outline turned an external link into a group; a rowless sealed
card dropped by the empty-sections pass and by omission, since recovery
rebuilds from rows and it has none; and a seal discarded on merge.

Four bugs, one cause: **a declared fact has to be carried by every path
that rebuilds the node, and "the field exists" is not that.** The
generalisation for the next mechanism — mdBook parts, DITA branches,
whatever declares the next fact:

- a mechanism with **no producer is not shipped, it is staged**. Say so
  in the note, in those words, and keep it out of the past tense.
- the first adapter to produce it **is the test** of every consumer.
  Budget for that, rather than treating the producer as a one-file add.
- when a field is added to the model, the honest checklist is not "who
  reads it" but **"who rebuilds this node"** — reconstruction, cloning,
  recovery, promotion, demotion, merge. Each is a place a fact can fall
  out silently.

Recorded here rather than in a note of its own because this is where the
receipt is; docs/08 points back at it.

### What review changed

An adversarial review — every finding reproduced, then independently
refuted or confirmed — found twenty defects the tests did not. Three
have general lessons worth keeping:

- **A refuse rule must name the harm, not a proxy for it.** Refusing
  every array-index-like key rejected `errors: {"404": …}`, which the
  schema *requires*, and told the author to rename a key they cannot
  rename. The harm is reordering; the rule now tests for reordering.
- **The source's key order was a missing fact, not three bugs.** A
  spec-sourced nested group gaining `pages: []`, a pages-less group
  collapsing into its root path, and a group with unusual key order
  coming back rewritten were one absence wearing three faces.
  Recording the order per node replaced the group-vs-page *guess* this
  note had documented as an accepted trade — the guess was not needed.
- **`docs/13`'s own mechanisms were under-applied one level down.**
  `Section.sealed` was honoured for cards and ignored for the nested
  groups, merges and omissions that reach the same shape; `Topic.lock`
  and `Section.chain` were carried by some rebuild paths and not
  others. A declared fact has to be carried by *every* path that
  rebuilds the node, or a no-op AI run corrupts the file.

## Amendment 2026-08-20 — the creation gap, and the write path's own refusal

This note never carried this story, so the history is imported here
before the closure, from the `createCards` declaration comment that
held it.

### What the gap was

`createCards: true` was honest — the write path really does emit a card
created on canvas. But a card created on canvas has **no `chain`**, so
`partitionByChain` files it under the ROOT key. Where the root
navigation is a CONTAINER array (`tabs`, `languages`, `dropdowns`),
`fillContainer` appended a group object into an array `ARRAY_BEARS`
omits — an array the adapter itself declares bears no cards. Nothing on
the write path consulted `accepts`; the `minItems` knowledge that
guards a tab against being EMPTIED had no counterpart on the insertion
side.

The declaration comment recorded this as an open defect with its own
unlock ("a container check on the INSERTION side"), which is what this
arc built.

### The before-receipt

Measured at `87a33dd` on all three container-rooted fixtures — a
chainless card, serialized:

```json
{ "group": "Created On Canvas", "pages": ["created/a-page"] }
```

appended into `navigation.languages` / `navigation.tabs`. Against
Mintlify's published schema this is invalid, and not marginally: of the
**14 shapes** the schema permits in a `tabs` array, every one requires
`tab`. The object carries `group` and `pages` and no `tab`. The same
bytes are kept as a fixture in `mintlifySchema.test.ts`, where they
double as the schema plank's vacuity check — the defect stays
falsifiable after the code that caused it is gone.

For a page-rooted file (`starter-docs.json`'s `{pages, global}`) the
identical path was always correct, because `pages` bears sections. The
gap was never "creation is broken"; it was "creation is unchecked".

### What closed it

`refuseUnhousedSections`, consulted once in `serialize` before any
bytes are built. It reads the SAME `ARRAY_BEARS` → `accepts` data the
container descriptors and the drop-time refusal read — no second table,
no re-derivation — and throws `SerializeRefusedError` rather than
writing the closest legal-looking thing.

Three properties worth stating because each was a choice:

- **Never bytes.** A file whose own `$schema` rejects it is worse than
  a refusal, because it fails somewhere else, later, to somebody who
  did not make the edit.
- **Sections only.** Orphans are exempt, the same carve-out
  `lintContainers` makes: `navigation.languages` legitimately holds
  `$ref` pointers that model as orphan cards.

  > **Narrowed 2026-08-21 (docs/22, M1 — measured, and built).** The
  > carve-out is now **SEALED orphans only**, because it was wider than
  > its own justification: `$ref` pointers parse SEALED
  > (`orphanSection` sets `sealed: { source: ref }`), while an UNSEALED
  > standalone reaching a bears-no-orphans home has no legitimate
  > producer at parse. Measured at `a8f28cf` through the shipped
  > adapter: a chainless standalone appended the bare string
  > `"created/standalone"` into `navigation.tabs`, and the same card
  > chained into "Guides" appended it into that tab's `groups` array.
  > Both emitted bytes; both INVALID against the vendored schema. The
  > second has a live producer — one AI run hoisting one leaf.
- **Declared inputs only.** A document with no container descriptors
  declares nothing here, so the guard checks nothing rather than
  refusing on a guess.

The message is one producer and PATH-NEUTRAL — the card may have
arrived by a canvas gesture or out of an AI run, so it names the card,
states the fact and gives the remedy without blaming either:

> Cannot export: "Install" sits outside every navigation container.
> Drag it into "Documentation" or "API reference". This docs.json's top
> level holds containers only.

> **Amended 2026-08-21 (docs/22).** Two changes, both forced by a NEW
> INPUT SPECIES reaching this message — an unsealed standalone, which
> the narrowed carve-out above now sends here. The sentence is
> **species-aware**: it names homes that bear THIS species, because
> suggesting section homes to a standalone is advice that reproduces
> the refusal. And it is **position-aware**: a card that INHERITED a
> chain sits inside a container that refuses it, so telling that user
> the card sits "outside every navigation container" was false, and
> telling them to drag it into the container it is already in was
> advice to repeat what they had just done. Still ONE producer. Where
> no container bears the species at all, the remedy is the by-hand one
> and says so, because "drag it somewhere" would be unactionable.

It surfaces at ACTIVATION: `exportDocument` already caught adapter
throws and toasted the message, so the channel existed and needed
nothing new (*absent ≠ unbuilt*). The export control is a plain button
with no disabled-with-a-reason seam, which is the floor this note's
charter named for that case.

### `accepts` had three consumers, not two

Worth correcting because the design was reasoned from "two": the third
was already there. `lintContainers` (`model/containers.ts`) computes
almost exactly this predicate — and measured on the before-state it
returns

> section "Created On Canvas" sits in container "Top level", which
> declares it bears no sections

— but every one of its callers is a test. The predicate existed and was
proved; what was missing was a consumer on the path that writes bytes.
The write path is the fourth call site and the second that can refuse.

### The schema plank, planted (docs/08)

Mintlify's schema is vendored verbatim at
`fixtures/mintlify/schema/docs.schema.json` (retrieved 2026-08-20) and
`ajv` is a devDependency. Three measurements from planting it, each a
surprise:

- **The URL 307-redirects** to `www.`. A fetch without `-L` returns 15
  bytes of `text/plain`, which would vendor an oracle that validates
  everything — the accepts-is-not-checks trap, which is why the plank
  asserts a known-invalid document FAILS.
- **The published schema does not compile under a default `ajv`.** It
  contains the pattern `^phc\_`, an invalid escape in unicode mode.
  JSON Schema specifies `pattern` as ECMA-262 and does not require the
  `u` flag, so the validator drops it and checks the schema as written.
- **Only one of the four Mintlify fixtures validates as published.**
  `starter-docs.json` does. `docs-reduced.json` does not, and the cause
  is not our reduction: it keeps `{"$ref": "./redirects.json"}` and
  three bare `{"$ref": …}` language entries VERBATIM from
  mintlify/docs, and the published schema models no `$ref` composition
  at all. **The format's own author publishes a docs.json its own
  schema rejects.** So the plank asserts that MUTATION does not break a
  document that was valid to begin with — a narrower claim than "our
  output is valid", and the honest one. `tabs-rooted-valid.json` exists
  because the plank needed a container-rooted document that could
  validate.

### What was NOT built, and why

**Chain adoption on the canvas path.** The measurement above says it is
unbuilt there, and it was never ruled — building it would have been
this arc inventing a rule while fixing a different one. The write-path
refusal is the floor either way: with adoption, fewer cards arrive
unhoused; without it, they are refused legibly instead of written
wrongly. Whether to build adoption is a separate question, and it now
has a measurement behind it.

> **Answered 2026-08-21, on ONE path.** docs/22's Decision 6 rules and
> builds per-home adoption for the **AI path**. The canvas path is
> still unbuilt and still unruled here: `docs22-machinery` changes no
> gesture at all, and the drop's home law lands with the ruled births
> in arc 2. Stated exactly this narrowly so the next reader does not
> take "adoption is ruled" for "adoption is built everywhere" — which
> is the inverted `Decided ≠ built` this project pays for in both
> directions.

