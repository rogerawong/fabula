# Roadmap

Milestones are vertical slices ending in something runnable and tested.
Order optimizes for de-risking: the model/command/undo core and the
adapter round-trip are the hard, novel parts — they come first and get
tests before any canvas exists. UI polish comes last because prototyping
already proved the UX; we're not discovering it, we're rebuilding it.

## M0 — Scaffold (small)

Vite + React + TS strict + Tailwind 4 + ESLint/Prettier + vitest +
CI skeleton (typecheck/lint/test/build). Empty app shell renders.
**Done when:** CI is green on a hello-world commit.

## M1 — Model + DocFX adapter (core risk #1)

`model/` (types, tree helpers, selectors) and `formats/` (interface,
registry, DocFX adapter with id-based addressing), conformance
suite + fixtures ported and passing, sample document in place.
**Done when:** Layers 1–2 of the test strategy are green; a script can
parse the sample and serialize it back to a fixpoint.

## M2 — Commands, store, undo (core risk #2)

Zustand store slices; command dispatcher with Immer patches; undo/redo
manager; all structural commands (move/insert/remove/rename topic,
create/remove section, reorder columns, depth changes); property-based
undo invariants green.
**Done when:** Layer 3 tests pass including fast-check invariants; a
headless script can run a random 500-command fuzz and undo to pristine.

## M3 — Read-only canvas

Column layout engine; canvas with pan/zoom/fit; cards with topic trees,
stats, orphan variant; connectors + sequence badges; minimap; zoom
controls; load sample via UI; depth controls (global + per-card).
**Done when:** sample renders correctly at 60fps pan on a 1,000-topic
fixture; Playwright flow 1 green.

## M4 — Direct manipulation

Interaction state machines: card drag/reorder (canvas + sidebar), topic
drag within/between cards, drag-to-canvas section creation (incl. unwrap),
multi-select (shift-click + box) and group drag, inline rename, topics
lock. All mutations land as commands (undo already works by construction —
verify with Playwright flows 2–4).
**Done when:** every gesture in 05 works and is undoable; e2e flows 2–4
green.

## M5 — Animation & feedback

FLIP utility wired to command animation hints; undo fly-back; ghost card;
reflow transitions; entrance animations; toasts with undo actions;
reduced-motion support. First-paint discipline dev-assertion in place.
**Done when:** undo of every command type is visually legible; no
flash-then-animate anywhere; e2e still green (end states unchanged).

## M6 — Documents & sessions

Tabs (create/rename/duplicate/close/reopen); localStorage persistence
(versioned, debounced, flush-on-unload); load from file/paste/URL (GitHub
raw rewrite + CORS fallback); export download; per-card code view
(CodeMirror, adapter-serialized).
**Done when:** Layer 4 tests + e2e flows 5–6 green; refresh-safe.

## M7 — Ship

Second adapter (MkDocS `nav:`) to validate the plugin story; CONTRIBUTING
(adapter guide); README with screenshot;
accessibility pass (labels, focus, keyboard reachability); GitHub Pages
deploy; LICENSE (AGPLv3); issue templates.
**Done when:** deployed URL public; a cold-start contributor doc-test
(follow CONTRIBUTING verbatim) succeeds.

## Shipped

**Reading the statuses below:** a mechanism with **no producer is not
shipped, it is staged** — the field exists, the selectors exist, the UI
draws it, and every path that merely *carries* it is untested by
construction. `Section.chain` and `Section.sealed` read as done for
weeks and lost four facts on their first real producer. **Decided ≠
built** in docs/13 records the pattern and its receipt; it is worth
reading before marking the next mechanism done.

- **Document summary / "Overview" panel (docs/17)** — **shipped**:
  `src/view/OverviewPanel.tsx`, Tier-1 selectors, and the evidence split
  that renamed `doc.extras.importWarnings` to `importEvidence`. A
  per-document surface of vital statistics and findings where clicking a
  finding focuses its subject on the canvas. It exists because a real
  number had nowhere to live — the canvas says "199 rows hidden" on one
  card and "8" on another, and nothing said **216 of 1,044**.

  Its sharpest design finding is worth keeping in view: "computed on
  open, never stored" and "adapter-contributed parse findings" cannot
  both hold, because the parse facts describe files the snapshot
  deliberately discards. The note splits the tiers by provenance
  instead — recomputable from the kept snapshot means selector, else
  evidence — and Tier 2 generalizes the existing import array rather
  than sitting beside it.

- **Sphinx `toctree` adapter (docs/12)** — **phase 1 and phase 2 shipped
  (write-back is moves-only; `docs/19`)**; the line below is phase-1 history
  — **phase 1 shipped
  (read-only)**: graph-driven ingest, parse, title sidecar, per-node
  locking and its visual states, registered so a folder or GitHub tree
  imports and reorganizes on the canvas. Nothing writes back yet; phase 2
  is moves-only `planChanges`. Sphinx is a **third structural shape**: the nav is
  explicit (hand-written `.. toctree::` directives, like a format
  adapter) but distributed across dozens of files (like a collection).
  `CollectionAdapter` is the right contract for it, with two gaps the
  survey exposed: ingest is a per-path folder scan that cannot walk the
  toctree graph (godot-docs would be refused at the 500-file / 3 MB cap
  before any adapter code ran), and `simulatePlan` re-parses the
  snapshot while comparing titles, so a title read lazily from a file
  outside the snapshot can never be reproduced. Both, plus the snapshot
  options and the open questions, are in docs/12. Read-only first
  (`.patch` download), same sequencing rationale as manual Docusaurus
  sidebars below — but unlike `sidebars.ts` this does not break the
  byte-minimal round-trip law, so it is a genuine collection adapter.

- **Mintlify `docs.json` adapter (docs/13)** — **shipped** on branch
  `mintlify-adapter`: `src/formats/adapters/mintlify.ts`, registered,
  with four conformance fixtures, a bundled sample, an e2e flow and the
  legacy `mint.json` recognizer co-located. It clears a bar no other
  adapter meets — **byte identity with the input**, not merely fixpoint —
  and both real corpora reproduce byte-for-byte, `starter`'s missing
  trailing newline included. The recorded formatting state is indent
  unit, trailing newline, EOL style and byte-order mark; CRLF in, CRLF
  out. Still to come, and unchanged in scope: the folder-loading Mintlify
  COLLECTION adapter, which is where real page titles, frontmatter
  renames and `$ref` resolution live.

  Three refusals are load bearing, because `parse` uses `JSON.parse`
  while `detect` keeps the registry's shared js-yaml result: duplicate
  keys (js-yaml errors where `JSON.parse` silently drops one — reachable
  without that gate, since the load dialog lets a user name the format),
  a container holding two kinds of child, and a key order JavaScript
  would change. The last one was **narrowed during build**: refusing
  every array-index-like key blocked `errors: {"404": …}`, which the
  schema requires. Design and survey below, still accurate.

  A FORMAT adapter — one config file in and out, nav as a subtree of a file
  carrying theme/colors/logo/etc., so MkDocs is the sibling to copy, not
  DocFX. JSON turns out to be a far better host for the round-trip law
  than YAML: it has no comments to lose, and re-serializing the parsed
  object reproduces mintlify/starter **byte-for-byte**, so this adapter
  can assert input identity rather than only fixpoint. Two things the
  survey killed: navigation is not a fixed `tabs → groups → pages` chain
  (the two shipped corpora have different top containers, depth reaches
  6), and there are **zero** OpenAPI navigation entries — the nav-vs-file
  gap is translations, via `{"$ref": "./fr.json"}` pointers. Those, plus
  the fact that every title lives in a sibling MDX frontmatter, are two
  independent signals that the fuller answer is a second, folder-loading
  Mintlify COLLECTION adapter — docs/04's one-file rule is now a routing
  rule, not a refusal. Schema check settled the titles question: a
  Mintlify `pages` entry is a string path or a group — there is **no
  per-page title in the schema at all** — while group names are stored in
  `docs.json`. So cards are correctly named and only rows are
  path-derived, and rename capability becomes per node kind
  (`{sections, topics}`, defaulting to `{true, true}`) across **both**
  adapter contracts; Mintlify declares `{sections: true, topics: false}`
  and Sphinx's `supportsRename: false` migrates to `{false, false}`. A
  folder-loading Mintlify collection adapter is the designated fix for
  both real page titles and topic renames, out of scope for v1.

  **Per-kind rename: shipped** with the adapter, including the enforcing
  layer — the AI validator refuses a topic rename for `{topics: false}`
  at the invariant layer, not the prompt — and the mixed shape now has
  behavioural coverage, which the all-true and all-false cases could not
  give it.

  Also shipped alongside: a document-level **"Page titles from paths"**
  chip, fired by `pageTitlesAllDerived`. Every Mintlify document derives
  100% of its page titles (224/224 on the real corpus) where DocFX and
  MkDocs derive a minority (3/24, 5/19), so the predicate needs no
  threshold. Decided on the rendered corpus: a per-row marker would mark
  all 224 rows and carry no information.
- **Container mechanism (docs/13)** — **v1 shipped** with the Mintlify
  adapter, which is its first producer. Nav levels that sit ABOVE the
  card and have no card of their own: cards carry an ancestor chain; the
  meta ribbon shows a chain chip; cross-chain drops are refused at drag
  time rather than silently ignored at export; the serializer partitions
  by chain and preserves container order.

  The producer is what finished it. Chains and seals were carried by
  some rebuild paths and not others, so a reorganize that moved nothing
  flattened every tab on export — see **Decided ≠ built** in docs/13,
  which is the general lesson and has the receipt. Reconstruction now
  carries `chain`, `sealed` and `lock` on every path, and a proposal
  that rearranges cards across containers returns a warning instead of
  exporting a silent no-op.

  The **sidebar list drag was unguarded** — `beginSidebarCardDrag` never
  called `crossChainDrop`, so the gesture refused on the canvas still
  committed from the list and exported as the silent no-op the refusal
  exists to make impossible. Fixed by moving the guard into a
  `previewOrRefuse` both paths share: the refusal belongs to the DROP,
  not to the gesture that produced it, which is why one affordance could
  ship without it. Covered by e2e, verified to fail without the guard.

  **v2 SHIPPED (docs/13; marked here 2026-08-18): a cross-container
  drop becomes a REPARENT** — the card moves into that container, and
  refusal stops being the default outcome. Receipts in the tree:
  `ContainerDescriptor`'s v2 docblock names the lanes, band labels,
  seam-menu/toast copy and never-empty guard (`src/model/types.ts`);
  legality lives at the section-reorder commit path
  (`src/commands/__tests__/reparent.test.ts`,
  `cardChainRefusal.test.ts`); layout takes a `containers` param and
  draws chain bands (`src/layout/positions.ts`,
  `chainColumns.test.ts`). Consent lives in the gesture rather than
  after it: labeled drop zones and container lanes while dragging, a
  direct commit with an undo toast naming the container, and a
  two-option menu only at a seam, where reorder-within and move-between
  are genuinely both plausible. No modal confirmations — the operation
  is undoable, visible and non-destructive, and a modal would presume
  the cross-container reading exactly where it is least certain.

  Two refusals remain, both type errors rather than confirmations: a
  target that is not groups-bearing, and a move that would empty its
  source container (`tabs.groups` has `minItems: 1`).

  **Auto-arrange grouping columns by chain with label bands folded into
  v2**, where it stopped being cosmetic: containers are drop targets
  now, so a container you cannot see when the canvas is tidy is not a
  target. (Shipped with v2 — `src/layout/positions.ts` takes the
  `containers` param and `chainColumns.test.ts` pins the bands; the
  "no chain reference in src/layout" sentence this replaced described
  the pre-build tree.)

  The enforcement shape is the lesson from the sidebar hole, applied one
  layer down: legality is checked **once at the section-reorder commit
  path**, and the drag guards become UX messaging over it. The test that
  matters is the one that cannot tell which UI fired the gesture.

  Still out of scope after v2, and recorded rather than deferred by
  accident: **container reordering** stays a separate explicit
  affordance (deriving chain order from card positions is
  action-at-a-distance), and an **`allowReparent` AI run option** is
  follow-up work — the manual gesture first, the model capability
  second, so the semantics are settled by hand before they are
  delegated. **mdBook parts, Jupyter Book parts, GitBook parts,
  Docusaurus categories and DITA branches all reuse this** — it is the
  general mechanism, not Mintlify plumbing.
- **Registry recognizers (docs/04, docs/13)** — **shipped** with the
  Mintlify adapter. `{test, message, helpUrl}` consulted after every
  `detect` returns 0 *and* when YAML parsing fails outright, replacing
  the generic "Unrecognized TOC format" with a specific answer via a
  typed `KnownUnsupportedFormatError` the load dialog renders as a link.
  Not formats: never parsed, never serialized, excluded from the
  conformance suites by construction. Two entries shipped together so the
  shape is general from the start — **`mint.json`** (legacy Mintlify,
  never parsed or written) and **`SUMMARY.md`** ("mdBook support is
  planned"). Add an entry as each format joins this queue: it is the
  cheapest honest answer to "why doesn't my file load".

  **The `mint.json` guidance names `mint dev`, not
  `npx mintlify@latest upgrade`** — as this entry and docs/13 both said
  before the corpus was checked. Mintlify renamed the CLI from `mintlify`
  to `mint`, and `organize/settings.mdx` ("Upgrade from `mint.json`")
  documents installing `mint` and running `mint dev`. Sending someone to
  a retired command is the failure a recognizer exists to prevent.

  Its shape sniff was also **inverted** as first written: it tested for
  the ABSENCE of `$schema`, but a real mint.json carries its own
  (`mintlify.com/schema.json`), so the sniff declined every renamed or
  pasted copy — the exact case it was written for — while claiming
  unrelated JSON that merely had a `navigation` key. The signal is a
  navigation **list**, which `detect` already scores 0.

## Post-v1 backlog (unordered)


- **Hugo: scan content `.html` pages (fast-follow, docs/14).** Hugo
  renders a front-mattered `.html` under `content/` as a page just like a
  `.md`; the scanner is `.md`-only. kubernetes/website has 6, all
  `toc_hide`, so nothing is visibly missing there — but that is a
  property of the corpus, not of the rule. A missing page is a missing
  branch, so this is a shape gap.

- **Reparenting / cross-section file moves — `docs/16`, SHIPPED
  (2026-08-17 merge; retired from this backlog 2026-08-18).** Hugo
  moves pages between sections: `supportsReparent`, `FileChange.move`
  with `region: "navHead"`, alias-on-move where the format has a
  redirect key, the link index that informs and never gates, four
  refusals from one discriminant. docs/16 is the record and CLAUDE.md's
  roadmap carries the as-built summary — this entry stops duplicating
  either. Figures of record: `scripts/survey-reparent.ts`.

- **Validate a serialized export against the format's OWN schema, in
  tests.** **PLANTED 2026-08-20** (`mintlify-creation-gap`),
  Mintlify-only and shaped so a second schema-publishing adapter is an
  added fixture rather than a rewrite. The fixpoint suite proves byte
  identity for an UNCHANGED document, and the round-trip property proves
  an edit touches only what changed — neither says the bytes a MUTATED
  document produces are valid for the format. Mintlify publishes a
  JSON Schema and the adapter already writes `$schema` into every file,
  so the cheapest version is: reorganize/edit a fixture, serialize,
  assert the output validates.

  As built: `src/formats/__tests__/mintlifySchema.test.ts`, against the
  schema vendored verbatim at `fixtures/mintlify/schema/docs.schema.json`
  with `ajv` as a devDependency (tests only, never bundled). It carries
  its own teeth — a known-invalid document asserted to FAIL — because a
  validator handed a truncated schema accepts everything and the run
  stays green either way. That is not hypothetical: the source URL
  answers **307** and a fetch without `-L` yields 15 bytes of
  `text/plain`.

  Two findings from planting it, both recorded in docs/13's 2026-08-20
  amendment: the published schema **does not compile under a default
  `ajv`** (it contains `^phc\_`, an invalid escape in unicode mode), and
  **only one of the four Mintlify fixtures validates as published** —
  `docs-reduced.json` fails on `$ref` composition kept verbatim from
  mintlify/docs, which the published schema does not model. So the plank
  asserts that MUTATION does not break a document that was valid to
  begin with, which is narrower than "our output is valid" and is the
  claim the evidence supports.

  Written down because a defect of exactly this class shipped and was
  found by reasoning rather than by the suite — a proposal that drained
  a Mintlify tab exported `groups: []` against a `minItems: 1` schema,
  silently, and every test stayed green (docs/16, fixed 2026-08-16). The
  guard now exists; the class does not have a detector. Post-export
  validity is the gap, and it is one the tests can hold rather than a
  rule contributors have to remember.

- **Section reparenting / directory moves — `docs/18`, a DECISION
  RECORD: deferred, charter parked.** docs/16 named this its successor.
  The charter is settled and unbuilt, and the reason is demand rather
  than difficulty: kubernetes/website shows **25 whole-directory moves
  in eight years**, of which **six** are reparents inside the
  documentation tree and **none since 2019-06-12** — against 577
  cross-directory FILE moves over the same history. Its `setup/` 15→5
  restructure scores ZERO directory moves, because real reorganizations
  REDISTRIBUTE pages, which v2 already ships.

  The honest case was never demand but the **page-less-subtree
  correctness hole** (`tutorials/kubernetes-basics/public/` — 42 files,
  no canvas presence, must travel with any move of `tutorials/`), and
  that hole only opens if the gesture exists.

  Settled in the note so a build is not a redesign: NAMES not counts
  (the scan already enumerates while filtering — zero new I/O, and the
  fourth instance of docs/16's false-constraint pattern); contents never
  read, stored or claimed (content-free relocation via FSA `move()` and
  git rename headers, neither of which needs bytes or a hash); a
  COMPLETE manifest as a stated exception to the 20-exemplar convention,
  costing 1.46–3.23 KB against 2704 KB of headroom — so **any future
  threshold must be justified by something other than bytes**; Tier-2
  evidence stamped "as of import".

  Measured by experiment and recorded there: FSA has **no directory
  move** at all (absent from the IDL, Chromium 149), so a section move
  is a RECURSION with an ordering law whose wrong order LOSES BYTES;
  `git apply` does hunkless binary renames atomically; GNU `patch`
  cannot, and used to be recommended anyway. **Unlock conditions are
  named**: demand evidence, or the page-less hole becoming reachable by
  some other gesture.

- **Sphinx write-back — `docs/19`, SHIPPED, all eight steps (2026-08-17
  merges; retired from this backlog 2026-08-18).** `planChanges`
  (moves-only), cross-toctree moves as one plan, Save-to-folder, the
  root-candidate picker labeled by reach. The `navTail` boundary law,
  the refusal set, the patch-mechanics inversions and the tab-fidelity
  fix all live in docs/19 (the record) and CLAUDE.md's roadmap
  (as-built summary) — this entry stops duplicating either. The
  coverage pair this entry used to cite was the note's design-time
  table, retired at build; the count of record is **24% strict /
  94% sequence** of godot's entries editable, per
  `scripts/survey-navtail.ts`.

- **Canvas polish — ONE session, not five tickets.** ~~The tooltip
  surface, badge contrast (white on #3b82f6 at 3.7:1, on #22c55e at
  2.3:1), the 10px chip floor, the type ramp (10–16px at 1.6:1) and the
  marketing tagline under the minimap~~ **DONE 2026-08-18
  (polish-glyphs), as one session, plus the lock-glyph system riding
  with it.** Styled tooltip component (`view/Tooltip.tsx`, native
  `title` retired app-wide), dark-on-tint badges and level chips
  (unit-asserted ≥ 4.5:1, `badgeContrast.test.ts`), 11px floor
  (`text-[10px]` count in src/: 0), type ramp tokens in `index.css`.
  Detector delta at the pinned install, same k8s view:
  undersized-ui-text 21 → 0, low-contrast 15 → 8, total 172 → 142.
  The eight survivors were the pinned palette's card-title shades — a
  docs/05 question, ruled same-day: header ink now derives from the
  badge-numeral ramp under a scoped dated amendment in docs/05, and
  the survivors collapse to 0. The critique file carries the closed
  dispositions.
- **Fresh `/impeccable critique` on today's build — DEFERRED (Roger,
  2026-08-18): wanted, not now.** Premise corrected the same day: an
  earlier version of this entry said the last critique was "never
  persisted for lack of repo access" — that described the 28/40
  claude.ai pass, and it stopped being true on 2026-08-16 when
  `.impeccable/critique/2026-08-16-k8s-whole-site.md` was committed.
  That file is the whole-site baseline of record (Design Health 34/40
  amended, detector 172), and the polish session closed its findings —
  detector 172 → 134, every first-pass finding disposed (its
  amendments log, entries 4–5). What a fresh pass would newly cover,
  which is why the entry stays: the lock-glyph system, the styled
  tooltip surface, header ink under docs/05's dated amendment, and the
  Overview's error-tier second doors — all shipped after the baseline
  was captured. Run it standalone, not folded into adapter work.
- Redo UI affordance + history panel (redo itself lands in M2)
- Card context menu (rename/remove/collapse/code view) reusing the
  ContextMenu component the tab strip introduced
- Command palette (Cmd+K) — the scaling home for commands that
  currently live only on shortcuts or hidden idioms
- Dark mode (tokens prepared from M0)
- Search/filter topics across cards
- **Diff view: compare two tabs' structures — the highest-value item on
  this list, and the language door is why.** Three jobs, one feature: the
  AI review-step upgrade (docs/10); the reviewer artifact PRODUCT.md's
  third audience needs; and, since Hugo's i18n work shipped,
  **localization gap analysis** — open `content/en` beside `content/ja`
  and the diff names every page the translation is missing or has grown.

  The promotion is not enthusiasm, it is sequencing. **The door is
  substrate; the diff is the product.** Opening a sibling language as its
  own tab was cheap and is already shipped, but on its own it hands the
  user two trees and a memory test. The diff is what converts them into
  an answer. Beneficiary is concrete rather than hypothetical: SIG Docs
  runs per-language localization teams against a moving English tree.

  **Its feed now exists** (docs/10 amendment, 2026-08-19): a reorganized
  tab stores `TabProvenance` — provider, model, preset, timestamp —
  which survives rename, duplicate, reopen and persistence. Storage
  only; no diff UI, deliberately, because building one on a shape with
  a single producer is the mistake this project already has receipts
  for. But "compare two tabs" now has something to say about WHAT it is
  comparing, which the AI review-step upgrade needs and the sibling-
  language case does not.

  Already free in the meantime, and worth knowing before scheduling
  this: **the Overview panel on a sibling tab is a per-language health
  report today** — counts, hidden pages, derived titles, orphans, all
  per language, no new code. It answers "what shape is the Japanese
  tree in"; the diff answers "where has it drifted from English", which
  is the harder and more useful question.
- **Structure propagation (default → translation)** — far future,
  recorded rather than designed. If sibling-language editing is
  convergent (docs/14), the end state is applying a structural change
  made in the default language to a translation that should mirror it.
  That is a CROSS-DOCUMENT operation — two snapshots, two plans, one
  intent — and nothing in the current contracts spans two documents.
  docs/16+ territory, after reparenting has taught us what cross-tree
  moves cost. Noted here only so it is not re-invented as a small
  feature.
- Keyboard-driven drag (a11y)
- Keyboard route for disabled-control reasons (disabled buttons take
  no focus, so their tooltips are hover-only in practice;
  aria-disabled or an inline reason closes it)
- Hugo/GitBook adapters (Docusaurus autogenerated shipped as a
  collection adapter, docs/11; Sphinx and Mintlify are above)
- **Manual Docusaurus sidebars (`sidebars.ts`/`.js`)** — the other
  Docusaurus nav type (docusaurus.io itself is mostly hand-written,
  with autogenerated subtrees mixed in). Conceptually a FORMAT
  adapter (one config file in/out, like MkDocs `nav:`) but the file
  is executable TypeScript: reading needs TS parsing, byte-minimal
  write-back needs CST preservation — and manual sidebars carry
  item kinds with no clean canvas analog (`link`, `html`, `ref`,
  multiple sidebars). Realistic first step: READ-ONLY import
  (visualize + AI reorganize + export a freshly generated
  sidebars.ts) as an explicitly different mode — it breaks the
  byte-minimal round-trip law, so it must not masquerade as a
  collection adapter. `sidebars.json` variants would round-trip.
- **DocBook via entity includes — PostgreSQL first** (scoped in chat
  2026-08-18; its design note will take `docs/20`; file counts
  deliberately not carried — re-derive at survey time). Primary corpus: PostgreSQL `doc/src/sgml`.
  `postgres.sgml` is a DocBook **XML 4.5** `<book>` living in
  `.sgml`-named files — the extension lies, a conflation specimen for
  the house ledger. Entity-include architecture: parts wrap chapter
  entities (`&intro;`); a `filelist.sgml` registry with a nested
  parameter entity (`func/allfiles.sgml`); the DTD internal subset
  must round-trip byte-exactly. The design problem is
  structural-vs-content entity classification (`&legal;` vs `&intro;`
  vs `&zwsp;` are three different kinds wearing one syntax). The key
  insight, which dissolves the ownership collision the AWS/Zonbook
  analysis surfaced: **the master file's entity sequence IS the nav
  layer**, so chapter moves and reorders are one-file, nav-only
  edits. Scope sketch: cards = parts; topics = chapters (entity
  refs); titles full-read from the target's `<title>` (the Sphinx
  pattern); `sect1`/`sect2` locked in v1. Supporting cast: PHP doc-en
  (scale + i18n siblings), TDG5 (the 4.5-DTD vs 5.x RELAX-NG dialect
  specimen), Samba (generated hazard), svnbook (minimal fixture).
  Rejected: FreeBSD (migrated to Hugo+AsciiDoctor 2021), KDE
  (fragmented). The next design note is **20** when a session opens
  this; 18 is not free.
- Comment/format-preserving YAML (eemeli `yaml` CST) for minimal
  diffs — same discipline a `sidebars.ts` writer would need
- **JSON structured output for AI reorganize (per provider)** — the
  outline format's one silent failure class is indent drift: a
  drifted line can misnest a proposal (content-safety still holds via
  the multiset net, but the new tab can misrepresent what the model
  meant). Constrained decoding closes that class structurally. Plan:
  a `supportsJsonSchema` capability on `ProviderPreset`; send
  `response_format: json_schema` where the provider supports it and
  keep the outline elsewhere (custom endpoints stay universal).
  `parse.ts` already ingests `{id/title/children}` JSON trees, and
  identity + multiset validation stay regardless — this changes the
  request, not the safety contract. Check recursive-`$ref` schema
  support per provider first, and mind the ≈2–4× output-token
  overhead vs the outline (scope/granularity still bound it).
- Training disclosure near the AI key input — **DONE 2026-08-27
  (release-prep)**: `ProviderPreset.trainingNote`, a required field so a
  preset cannot ship without answering, rendered by the key field in
  SettingsView. Per-preset because the claims differ: Gemini's free
  tier trains on submissions, Anthropic says the API does not by
  default, and a custom endpoint is unknowable so its copy is
  conditional. Sources with retrieval dates live at the field
  declaration; the claim directions are pinned by
  `trainingNote.test.ts` and the render is hit-tested in flow 8.

Shipped since v1 (see docs/10, docs/11): Reorganize with AI;
collection adapters (Just the Docs, Docusaurus autogenerated) with
folder/GitHub-tree import, verified change review, .patch export, and
File System Access write-back; import-warnings surfaced in the review
dialog.
