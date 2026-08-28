# 14 — Hugo section-tree adapter (Docsy convention) — design

Status: design only. No adapter file, no registry entry, no src/ code.

Provenance: drafted in a claude.ai planning session, then **corrected by an
adversarial review** (six independent lenses over the repo and the corpus, every
finding re-checked by a skeptic). The original draft's figures and its claims
about TOC-fable's machinery were both wrong in places; corrections are marked
**[corrected]** inline rather than silently overwritten, and the analysis they
support is unchanged. What review changed, and the four decisions it produced,
are at the end.

The corpus is kubernetes/website (`content/en/docs`, commit `6449f1e`,
CC-BY-4.0 — attribution required on any vendored fixture).

**Figures below are re-runnable**: `pnpm exec vite-node scripts/survey-hugo.ts
<path-to-hugo-repo>`. The first draft's numbers came from a throwaway sandbox
script and could not be checked without redoing the work. Standing rule from
here: a survey that decides a design ships with the design.

The `VERIFY:` tags the draft carried were the right instinct and every one of
them was justified — all four were wrong or incomplete. The lesson runs the
other way too: the *untagged* corpus numbers were also wrong, so confidence
tracked whether the drafting session could see the repo, not whether the claim
was true.

Reference corpus: kubernetes/website — the Kubernetes documentation, maintained
by SIG Docs. 1,672 markdown files / **14.79 MB** under `content/en/docs`
(**[corrected]** from 22 MB, which contradicted the draft's own per-section
table).

## What the format is

There is no navigation artifact. Hugo has no nav file, no toctree, no docs.json:
the sidebar **is** the content directory tree, and the *theme* decides how to
render it. This adapter targets the section-tree convention used by Docsy — the
CNCF-standard theme (Kubernetes, etcd, Knative, and most of the cloud-native
docs estate) — in which:

- a directory containing `_index.md` is a **section**; `_index.md` is the
  section's own landing page and carries the section's front matter;
- every other `.md` file is a **page**, except inside leaf bundles (below);
- sibling order is Hugo's default page sort (next section);
- display names come from front matter `linktitle` if present, else `title`.

Verified live on the corpus (`hugo.toml`): `theme = ["docsy"]`,
`contentDir = "content/en"`, `disableAliases = true`, and `ignoreFiles`
regexes covering `OWNERS`, `README-*.md`, and
`content/en/docs/doc-contributor-tools` — the scanner must honor these.

Scope is named honestly: **Hugo (section tree, Docsy convention)**. Hugo
itself guarantees none of this; other themes (Book, Relearn) share most of the
convention but differ at the edges. Detection targets the convention, and the
adapter's copy should say "Hugo section tree" rather than promising all of Hugo.

## The ordering law

Hugo's default page sort, which the Docsy sidebar inherits:

1. `weight` ascending — and **unweighted or zero-weighted pages sort after
   every weighted page** (gohugo.io ByWeight docs; gohugoio/hugo sort tests,
   issue #2673);
2. then `date` **descending**;
3. then `linkTitle` (falling back to `title`) ascending;
4. then file path ascending.

Docsy issue #890 confirms the trap in the wild: sections whose pages carry no
weights render in date-modified order — meaningless for docs, and invisible in
the files. Consequences for the adapter:

- **Parse must compute effective order with the full chain**, or the canvas will
  display an order that disagrees with the published sidebar. This is unlike
  every prior adapter, where order was explicit data.
- **[corrected] The date tier is inert on this corpus.** `date:` appears in
  exactly **1** of 1,535 front matters, and `hugo.toml` sources dates only from
  front matter and the filename (no `:git`, no `:fileModTime`), so 1,534 pages
  have no date at all and unweighted runs fall through to linkTitle/title, then
  path. The draft's "sections render in date-modified order" reading of Docsy
  #890 does not apply here. Implementing the date tier in v1 buys one page — and
  the date would not be in the snapshot anyway.
- **Order is only partially stored.** Ties and unweighted runs are ordered by
  data the adapter must read (dates, titles) but should never write.

## Survey (kubernetes/website @ 6449f1e, content/en/docs)

Totals **[re-measured after the `.html` fast-follow]**: **1,678 content
files** — 1,672 `.md` plus **6 `.html`**, the Katacoda "interactive-gone"
tutorials under `tutorials/kubernetes-basics/`. **1,541** carry YAML front
matter (**0 TOML, 0 JSON**), **137** carry none. Earlier revisions of this
note said 1,672 / 1,535 because the scanner was `.md`-only; all six
`.html` pages are `toc_hide`, so nothing looked wrong — which is the
point, and why "a missing page is a missing branch" is stated as a law
rather than a preference.

**Not 0 unparseable — 1.**
`reference/command-line-tools-reference/feature-gates/ListFromCacheSnapshot.md`
closes its front matter with `--- ` (trailing space). The shipped scanner
requires the closer to be exactly `---`
([`frontmatter.ts:43`](../src/collections/frontmatter.ts#L43)), so it returns
`null` and the page silently loses every key — title included. Verified against
the shipped function, not just by grep. That is a bug in existing code affecting
JTD and Docusaurus today, filed separately as issue #1; this adapter must not
inherit it.

| top-level section | files | KB |
|---|---|---|
| reference | 1,163 | 10,417 |
| tasks | 220 | 1,653 |
| concepts | 176 | 2,122 |
| tutorials | 43 | 389 |
| contribute | 43 | 340 |
| setup | 22 | 203 |
| home, root, doc-contributor-tools | 5 | 16 |

Files by depth: {1: 14, 2: 628, 3: 773, 4: 122, 5: 133}. Section dirs
(`_index.md`) by depth: {1: 7, 2: 60, 3: 49, 4: 46, 5: 10} — max depth 5.

Front-matter flags **[corrected]**: `weight` on **851** of 1,535 (55%, none
zero-valued); `linktitle` 18 — but that is **two spellings**, 7 `linktitle` and
11 `linkTitle`, and a parser matching one misses the other; `no_list` **78**
(77 true, 1 false); `toc_hide` **3**; `draft` 0; `headless` **9**; `cascade`
**0**; `date` **1**; `card.weight` 37 (see hazards); sections without
`_index.md` but containing pages: 6.

Sibling ordering sets (n ≥ 2) **[corrected, and model-dependent]**: **100**
sets; **32 contain duplicate weights (32%)**; 7 mixed weighted/unweighted; 11
entirely unweighted. Gap histogram dominated by 10 (**336**), then 5 (41) and
20 (28) — the gapped-by-10 convention is real, which keeps most insertions
one-file edits.

These counts move with the model, which is why the draft's 106/41/11/3 and a
reviewer's independent sweep and this script all disagree. `survey-hugo.ts`
states its model: `_index.md` is excluded (it orders sections, not pages), leaf
bundle resources are excluded (they are not ordering peers), and only strictly
positive gaps between consecutive distinct weights are counted. **Cite the model
with the number.** The load-bearing conclusion is unchanged either way: duplicate
weights are common enough that ties are the serializer's hard case.

Leaf bundles (`index.md` directories): 4 — but two of them contain **627**
sibling `.md` files that are Hugo *page resources*, not pages:
`reference/command-line-tools-reference/feature-gates` (465) and
`reference/glossary` (162), plus 2 in `contribute/style/hugo-shortcodes`. A naive
every-md-is-a-topic scanner invents **629** phantom topics on this corpus
(**[corrected]** from 627 — the draft missed the third bundle). This is the
survey's headline hazard.

## What the survey decides

**1. `reference/` is the classes/ of this corpus.** 70% of files, 10.4 MB,
overwhelmingly generated API content.

**[corrected] The proposed trigger does not work, and the mechanism it invokes
does not exist.** Sphinx's rule is a private constant
(`ATOMIC_ENTRY_THRESHOLD = 250`, `sphinx.ts:56`) over entries a host file
*declares in its own toctree blocks* — cheap precisely because it needs no child
reads. Hugo has no such declaration. And **direct** child counts do not separate
the sections: `reference` **18**, `tasks` **17**. The draft's 1,163 vs 220 are
*recursive* file counts, which require walking the subtree you were trying not to
read. There is also no `expand`-style hook for a collection adapter to decline
reading: `loadCollection.ts:170` reads every `ingests()` match unless the adapter
implements `expand`.

Superseded by **Decision 2**.

**2. The kept set must be front matter, not files.** Even minus `reference`,
a whole-docs load is ~509 files / ~4.7 MB — over both kept-set caps
(`MAX_FILES` 500 / 3 MB). But everything this adapter reads or writes lives in
front matter. Recommendation: the snapshot keeps, per page, its path plus the
**raw front-matter block bytes** (not the body). That is ~300 KB for the whole
corpus — comfortably inside caps — and it preserves the untouched-file
byte-identity law because writes are a splice: replace exactly the original
front-matter block in the on-disk file at save time, byte-identical everywhere
else. `VERIFY:` that `simulatePlan`/`verify` re-parse works from a
front-matter-only snapshot (titles and weights all live there, so parse can),
and how JTD's snapshot handles this today — if JTD keeps whole files, this is
a deliberate, documented divergence, not an accident.

Settled in [docs/15-snapshot-ownership.md](15-snapshot-ownership.md), and no
longer a Hugo divergence: front-matter ownership becomes the rule for **every**
disk-backed collection adapter, JTD included. The 300 KB estimate here was low —
measured, it is 348.0 KB of front matter plus 98.0 KB of paths. The two caps are
separated there; this paragraph's "comfortably inside caps" was true of only one
of them.

**3. Ties are the serializer's hard case.** With 39% of sibling sets carrying
duplicate weights, canvas order within a tied run is *not expressible* without
weight edits. Law: untouched pages are never re-weighted (their tie resolves
by date/title exactly as before); a page the user *moves* gets a weight that
expresses its new position — using gap arithmetic where room exists (the
10-gap convention usually leaves room), renumbering the minimal set of
neighbors where it doesn't, with every renumbered file listed in the plan.
Moving an unweighted page MAY add a `weight:` key — that is a legal minimal
edit, disclosed in the plan; adding weights to pages the user didn't touch is
not.

**4. Leaf-bundle resources are not topics.** Inside a directory whose page
file is `index.md` (leaf bundle), sibling `.md` files parse as resources of
that single topic — one card row, not 466. The 627-phantom-topic number above
is the regression test.

**5. Renames edit `linktitle` when present, else `title`** — matching display
precedence, so a rename always changes what the sidebar shows. Both live in
front matter, so topic and section renames are fully writable:
`supportsRename: { sections: true, topics: true }` (**[corrected]** field name;
the type is `RenameCapability`, `formats/types.ts:40`).

**6. YAML-only v1, by evidence.** 0 TOML, 0 JSON front matter in 1,672 files.
TOML (`+++`) and JSON front matter are detected and refused with a message
naming the limitation. `cascade` has zero corpus coverage: preserved verbatim,
never interpreted — same caveat class as Sphinx's rename syntax (docs/12).

**7. Sections without `_index.md` (6 found)** parse as implicit sections with
a humanized directory-name title (`titleDerived: true` at the *section* level —
**[corrected]** not a first: `Section.titleDerived` has existed since M1 and
DocFX sets it on sections at parse, `docfx.ts:169`). Renaming or re-weighting such a section requires **creating**
`_index.md`; that is an explicit, disclosed plan op, mirroring the
weight-addition rule in (3).

## Model mapping

| Hugo | model | note |
|---|---|---|
| loaded root (e.g. `content/en/docs`) | document | root selection below |
| child dir with `_index.md` | section (card) | `_index.md` front matter = card's own data |
| deeper dirs + pages | topic tree | depth 5 observed; existing tree handles it |
| page `.md` | topic, `titleDerived: false` | title is real data in front matter |
| `_index.md` itself | the section's landing page | maps to the section's own path in extras — same shape as Mintlify's group `root` |
| leaf bundle | single topic | sibling `.md` = resources, folded in |
| front-matter-less page | topic, `titleDerived: true` | filename-derived label |

Load-root selection: the default is `content/en/docs` — **the whole site, with
`reference` expanded like every other section**, since nothing is collapsed
(Decision 2). Any subtree (`docs/concepts` etc.) remains selectable as a user
gesture. Both fit the caps comfortably under the nav-head snapshot. Detection: `hugo.toml`/`config.toml`/`config/`
present; use `contentDir` to name the tree; offer descent to it when the user
picked the repo root (docs/12's look-down heuristic, third customer).

### i18n — *settled*

`hugo.toml` declares **17** languages (**[corrected]** from 14). The decision:

- **Load the declared default immediately** — `defaultContentLanguage` /
  `contentDir` — with **no upfront picker and no modal**. Opening a site should
  not begin with a quiz.
- **Disclose persistently, in-session, with a door**:
  `N languages · <default> loaded · open another →`. Not a load-time toast that
  vanishes; the fact stays visible while the document is open.
- **Choosing another language opens it as its own document tab** — a
  programmatic sub-import through the RETAINED directory handle (the same
  one splice-save re-reads through), scoped to that language's
  `contentDir`, with its own snapshot and its own caps. Handle-less
  sources (webkitdirectory, GitHub, paste) render those entries
  disabled-with-reason — "re-import the folder to open this language" —
  rather than half-opening.
  **Rejected for the record:** preloading sibling nav heads into the open
  document. It breaks per-document snapshot identity, conflates cap
  accounting across two documents, and front-loads the cost of a door
  nobody opened.
- **DECLARED ≠ PRESENT.** A config states how many languages the SITE
  publishes; a folder grant carries whatever was cloned. kubernetes/website
  declares **17** and the reference clone holds **one**, and that is the
  ordinary case rather than a broken one. So the disclosure counts
  DECLARED — the true fact about the site — and the picker marks entries
  whose `contentDir` is absent from the granted folder with a one-line
  reason ("not present in this folder"). Reading a language's own
  `contentDir` matters here: only the default inherits the top-level one,
  which is why `[languages.en]` in the corpus declares none.

**What the door is for, and it is narrower than "multi-language
support".** Sibling-language editing is **convergent by nature**: the
work is bringing a translation back toward the default language's shape,
not designing a second information architecture. Mirror-policy projects
— kubernetes/website among them — treat the default tree as the spec and
a divergence as a defect to close.

That framing sets the whole feature's scope. The door is **substrate**:
it puts two trees in reach of each other. What converts them into an
answer is the diff between tabs (docs/08), which is why that item is
promoted rather than merely listed. In the meantime the **Overview panel
on a sibling tab is already a per-language health report** — counts,
hidden pages, derived titles, orphans, per language, shipped and free.

**Anti-goal, stated once and not enforced:** running AI reorganize
independently on a translation. For a mirror-policy project that is a
misuse pattern — it optimises one tree away from the tree it is supposed
to match, and every improvement it makes is a divergence someone must
later reconcile. Nothing stops it, and nothing should: a project that
genuinely maintains independent per-language IA is entitled to it. But
the default reading of "reorganize the Japanese tree" is a mistake, and
the note says so rather than leaving the user to discover it after a
merge.

**Why not a card per language, which this note previously leaned toward.** The
Mintlify `$ref` precedent looks like it transfers and does not. A `$ref` is
**in-artifact and unenumerable**: it is part of the `docs.json` being loaded, and
nothing in that file says what is behind it, so a locked sealed card is the only
honest way to keep a quarter of the site from being silently absent. Hugo's
sibling languages are **out-of-artifact and loadable**: `content/zh-cn` is a
separate content tree that the app can open in full, and `hugo.toml` enumerates
every one by name.

That difference is what makes shape-fidelity inapplicable here rather than
decisive. **Languages are sibling documents, not branches of the loaded
artifact.** The law governs the artifact you loaded — and `content/en` is
complete, with nothing hidden or folded. Sixteen cards standing in for whole
documents the user has not opened would misreport one site as seventeen sites'
worth of structure. Siblings get disclosure and a door, which is strictly more
than a card would give: the door actually opens.

## Membership is path — the format's hard constraint

In every prior format, moving a topic between sections edits navigation data.
Here it **relocates a file on disk**: inbound links break, and this corpus has
`disableAliases = true`, so Hugo's own redirect mitigation is off for the
exact community this adapter targets.

v1 therefore ships **without reparenting**: within-parent reorder (weight
edits), section reorder (`_index.md` weight edits), and renames are supported;
any drag that changes a topic's parent directory is refused with drag-time
messaging, never a silent snap-back — a `not-allowed` cursor plus the
one-line reason at the pointer, on the same channel the container refusal
uses (`dragStore.refusal` → `DragOverlay`).

**[corrected] There is no existing choke point for this.** The container guard
(`reparentAllowed` → `accepts`, `execute.ts:207`) takes a **Section** and
compares chain keys — it governs cards moving between navigation containers, and
returns `false` outright when `doc.containers` is empty. A topic changing parent
runs through `execMoveTopics` / `execMoveTopicsToNewSection`, whose only guards
are structural. The capability is also misnamed: the shipped field is
`supportsRename: RenameCapability`, not `renameSupport`. See **Decision 3**.

The AI validator inherits the same rule: proposals that change any topic's
parent are rejected at the invariant layer for this adapter (v1), alongside
the multiset and rename rules.

**v2 — see Decision 4, now scheduled as docs/16.** **[corrected]** The draft
charter said a file move
"collides with the files-are-never-deleted law … unless the plan model gains a
first-class move". The plan model already has one:
`{ kind: "move"; fromPath; toPath; newContent }` (`collections/types.ts:31`),
used by Docusaurus, applied by `fsAccess` and rendered as rename hunks by
`renderPatch`. Reparenting is therefore far less novel than the charter claimed,
which materially weakens the case for deferring it.

## Hazards

| hazard | disposition |
|---|---|
| Leaf-bundle resources (627 phantom topics) | resources fold into their bundle topic; regression-tested on feature-gates + glossary counts |
| `card.weight` (37 occurrences) | an unrelated weight namespace for landing-page tiles; never read, never written |
| Duplicate weights (41/106 sets) | effective order computed via full sort chain; ties never rewritten unless the user moves within them |
| Unweighted pages (fallback order) | date/title order computed at parse; `date` is never written by this adapter |
| `ignoreFiles` regexes | honored at scan: OWNERS, README-*, doc-contributor-tools excluded |
| `toc_hide` (3) / `headless` (9) | The ONLY two flags that remove a page from navigation. Receipts: the sidebar filters on `toc_hide` alone (`sidebar-tree.html:87`); `headless` means Hugo builds no page at all. Marked on the canvas, never hidden |
| `toc_hide` on a SECTION | Docsy filters `union .Pages .Sections` (`sidebar-tree.html:87`), so a hidden section is dropped as a **node — subtree and all**. `Section.unlisted` derives the same way `Topic.unlisted` does, because a section and a nested directory are the same thing and which one a directory becomes depends only on the load root |
| descendants of a hidden section | **Recorded, not fixed: a FALSE PRESENCE claim.** 199 of 1,038 corpus topics sit under a `toc_hide`'d container with no flag of their own, and render as ordinary published rows. The container's mark is what tells the reader; whether that is sufficient is a decision (see below) |
| a directory with pages but no `_index.md` | Real section, **no file to carry front matter** — its position and title cannot be recorded. Refused with a blocking warning rather than skipped, which used to emit weights for its siblings and reorder nothing |
| `no_list` (77) | **NOT a visibility flag** — it selects how a landing page renders its own child list (`section-index.html:11`). The page is in the sidebar and reachable. Preserved verbatim, no canvas mark |
| content `.html` pages (6) | **Closed.** Hugo renders a front-mattered `.html` under `content/` as a page, so the scanner reads them, slices their nav heads, and honours `ignoreFiles` identically. Bundle markers stay `index.md`/`_index.md`: no corpus we hold contains an `index.html`, so calling one a bundle marker would be a rendering claim with no receipt |
| `.adoc`, `.org`, `.rst`, `.pandoc` content | **Known-unsupported, not overlooked.** Hugo accepts them; neither corpus contains one, and each needs its own front-matter delimiters and bundle handling. A folder using them parses with those pages absent — which is a shape gap, so it is recorded here rather than left to be discovered |
| `headless` (8) | excluded from nav (Hugo semantics), preserved on disk, disclosed |
| Sections without `_index.md` (6) | implicit sections; edits require creating `_index.md` as a disclosed plan op |
| TOML / JSON front matter | detected, refused with reason (0 corpus coverage) |
| `cascade` | preserved verbatim, never interpreted (0 corpus coverage) |
| Sibling language trees | contentDir only; siblings disclosed at load |

## Validation invariants

- Untouched files byte-identical — the front-matter splice law; asserted
  per-file, not as a corollary.
- Page-path multiset conservation across any plan (the docs/10 / docs/12 net).
- A plan touches only: `weight`, `linktitle`/`title`, and (disclosed)
  `_index.md` creation. Any other changed byte in a touched file's front
  matter is a defect; the body is never touched.
- Effective-order fidelity: parse(corpus) ordering equals Hugo's default sort
  on the fixture set, including tie and unweighted cases.
- Phantom-topic guard: fixture asserts feature-gates parses as 1 topic, not 466.

## Fixtures

Synthetic mini-tree exercising every species: weighted (gapped and dense),
unweighted, duplicate weights, `linktitle`, `no_list`, leaf bundle with
resources, `_index`-less section, front-matter-less page, `card.weight`
decoy, TOML-front-matter refusal case. Plus a small real slice from
kubernetes/website (concepts/architecture) with CC-BY-4.0 attribution and
commit `6449f1e` recorded. `VERIFY:` fixture conventions (Prettier-ignore,
gitattributes `-text`) per existing dirs.

## Sequencing

1. Scanner + parse (bundles, implicit sections, effective order) + fixture
   conformance including the phantom-topic and order-fidelity tests.
2. planChanges: weight edits, renames, `_index.md` creation; splice-write;
   untouched-byte-identity gate on both real slices.
3. Reparent refusal wiring + AI validator rule + capability flag. Refused
   drops are **refused with cursor feedback** (`not-allowed`) in v1, not
   silently; full messaging ships with the docs/16 consent surface. The
   cursor reads the same predicate the executor enforces
   (`commands/guards.ts`) — one source of truth, cursor as its costume.
4. **Fast-follow: scan content `.html` too.** Hugo renders a
   front-mattered `.html` in `content/` as a page exactly like a `.md`,
   and kubernetes/website has 6. All six are `toc_hide` so this corpus
   shows no visible gap — which is luck, and luck is not a scanning
   rule. `.md`-only scanning is a **shape** gap (PRODUCT.md principle 6),
   so it is a fast-follow rather than a backlog item.
5. Recorded for later: reparenting / file-move (now **docs/16**, scheduled as
   the first post-v1 design note — Decision 4); non-Docsy theme variance.
   (`reference/` browsing is no longer a follow-up: it loads expanded like every
   other section — Decision 2.)

**New VERIFY, discharged:** a whole-site scan reads 1,672 files / 14.79 MB
transient, against `MAX_READ_FILES` 5,000 and `MAX_READ_BYTES` 64 MB — 3.0× and
4.3× headroom. The default root needs no caps-regime change. Had it not fit,
that would have been a caps question to settle in docs/15's terms, never a
Hugo-local workaround.

## Decisions

Review turned the draft's two open questions into four. Recommendations are
recorded as **recommendations**, not as settled outcomes, except where noted.

### 1. Snapshot shape — *settled and BUILT: implement from docs/15*

**This decision left Hugo.** It was never a Hugo question — every collection
adapter owns the same tradeoff — so it was settled as a core ownership model in
[docs/15-snapshot-ownership.md](15-snapshot-ownership.md) and **shipped**
(`src/collections/navHead.ts`). docs/15 supersedes both this section's
recommendation and item 2 of "What the survey decides" above.

**Implement from docs/15, not from here.** What Hugo inherits, already working
for JTD and Docusaurus:

- keep nav heads at `parse` via `toNavHeads(files)`;
- emit `navHeadOf(content)` with `region: "navHead"` from `planChanges`;
- saving splices into the bytes on disk at save time, so page bodies survive
  by construction. There is no drift guard and none is wanted.

**The default load root is the whole `contentDir` tree.** Not a narrowed
subtree — that recommendation is withdrawn, and the reason is now an axiom
rather than a preference: **a limit may cost detail, never shape**
(PRODUCT.md principle 6). Loading `docs/concepts` because the whole site was
inconvenient would show a Kubernetes user a confident picture missing six of
their seven top-level sections. Two measurements make the whole tree the
affordable choice as well as the correct one:

| budget | whole-site k8s | limit | headroom |
| --- | --- | --- | --- |
| kept set (`MAX_TOTAL_BYTES`) | 445.4 KB | 3 MB | 6.9× |
| read files (`MAX_READ_FILES`) | 1,672 | 5,000 | 3.0× |
| read bytes (`MAX_READ_BYTES`) | 14.79 MB | 64 MB | 4.3× |

Picking a subtree stays available as a **gesture** — the user may point at
`docs/concepts` and get exactly that — but it is a thing the user chooses, never
a thing the importer does to them to stay inside a budget.

What survives here is the diagnosis, because docs/15 is built on it. The draft's
`VERIFY:` asked the wrong question: whether `simulatePlan`/`verify` could
re-parse from front matter. They can, **and that is the hazard** — simulation
would pass green while two other paths break.

- `fsAccess.ts:114` writes `change.newContent` as the **entire file**, so saving
  truncates the body of every touched page.
- `diff.ts:166` builds `.patch` hunks as `unifiedHunks(originals[path],
  newContent)` where `originals` **is the kept snapshot**, so hunks are computed
  against a ~6-line pseudo-file and the patch does not apply.
- `frontmatter.ts` achieves byte-identity by whole-file surgery — its `rest`
  field ("everything from the closing fence onward") needs the body present.

There is no splice mechanism anywhere. And front-matter-only clears **one of two
caps**: 509 kept entries still trips `MAX_FILES` 500 regardless of byte size. The
draft conflated them ("comfortably inside caps").

Both objections were answered rather than accepted. docs/15 supplies the splice
as save-path behaviour — read the current file, replace its front-matter block,
write — so `fsAccess` and `frontmatter.ts` get the body they need at write time
instead of carrying it for the whole session; and it measures the `.patch` path
rather than predicting it, finding the hunks unchanged. On the second cap it
answers the provenance question this section could only raise: `MAX_FILES` is
inherited from `MAX_TOTAL_BYTES`, one commit, one rationale, no independent
per-entry measurement — so it is re-derived, not routed around.

**Lineage for docs/16, so it is not deleted as "old refusal UX":** the
`not-allowed` cursor is v1's whole consent surface, and v2's lanes,
dimming and labels **elaborate** it rather than replace it. A pointer
that says "not here" is the cheapest honest answer and stays correct
underneath whatever richer affordance arrives; removing it would trade a
working signal for a prettier one.

The general framing stands and docs/15 keeps it: this is *not* a Hugo mechanism.
Named beneficiaries are any adapter editing a small region of a large file —
Hugo front matter, comment-preserving YAML (docs/08), a future `sidebars.ts`
writer.

### 2. Atomic collapse — *re-decided on measurement: still no*

**Same outcome, entirely new reasoning.** The original rationale was "moot under
Decision 1: with a narrow default root, `reference/` is not loaded" — and it
explicitly said to revisit if the root widened. It has. The whole tree now loads
by default, so `reference/` and its 1,163 pages **are** on the canvas and the
question is live rather than moot.

That leaves one surviving argument: is a whole-site canvas *usable*? docs/02
requires 60fps pan at "50 cards / 1,000 topics" and docs/08's M3 cites a
1,000-topic fixture — `src/dev/largeSample.ts` — but no harness had ever put a
number against it. Now one does (`scripts/bench-canvas.ts`), against the
production bundle, alongside a new `src/dev/k8sSilhouette.ts` in the corpus's
real shape: 1,672 topics, 7 cards, 183 containers, depth 5, and **1,163 topics
in a single card**.

**Re-runnable**, per the standing rule that a measurement deciding a design
ships with the design:

```sh
pnpm build && pnpm exec vite-node scripts/bench-canvas.ts
```

The fixtures are `src/dev/largeSample.ts` (the docs/08 M3 floor) and
`src/dev/k8sSilhouette.ts` (this ceiling), both wired into the dev Load menu
behind `import.meta.env.DEV`. The silhouette's shape is asserted against the
surveyed corpus in `src/dev/__tests__/k8sSilhouette.test.ts` — a fixture that
drifts from the corpus it mimics turns a verdict back into an anecdote, and
those assertions caught two generator bugs before they could do it.

| | rows in DOM | load | pan p95 | worst frame |
| --- | --- | --- | --- | --- |
| largeSample (44 even cards), depth 2 | 880 | 127 ms | 60 fps | 41.6 ms |
| largeSample, expanded | 1,012 | +289 ms | 60 fps | 75.0 ms |
| **k8s silhouette (7 cards), depth 2** | **380** | **88 ms** | **116 fps** | **16.7 ms** |
| k8s silhouette, expanded | 1,672 | +211 ms | 30 fps | 100.0 ms |

Two results, and the first is the one that decides it.

**The whole-site load is the fastest configuration measured** — 116 fps p95,
88 ms to paint. It beats the existing 1,000-topic floor. The reason is that
**cost tracks CARD count, not topic count**: 44 cards with 1,012 topics is
dearer than 7 cards with 1,672. Hugo's shape is unusually kind to this canvas,
and collapsing `reference/` would have optimised the cheap axis.

**The only state that misses 60fps is fully expanded** (30 fps p95). That is a
deliberate, reversible user action on a 1,672-topic site, and the mitigation
already exists and is already the default: render depth. At depth 2 just 380 of
1,672 rows are in the DOM. Depth costs **detail** and is reversible with one
click; atomic collapse would cost **shape**, permanently and invisibly — exactly
the trade PRODUCT.md principle 6 forbids.

So: no atomic collapse, and now for a reason that survives the root widening
that killed the old one. docs/12's general deferral — "waiting for a second
corpus to ask" — is answered: Hugo asked, the canvas said it does not need it.

#### The lever for later is virtualisation, not collapse

Recorded because the expanded row is a real 30 fps and the next person to see
it deserves the named alternative rather than rediscovering collapse.

Row virtualisation paints only the rows near the viewport while the model keeps
every node. That makes it a **detail** lever by construction, and the
distinction is not a technicality: after virtualisation the tree still contains
every branch, every count is still right, scrolling still reaches everything,
and a screenshot of the card still shows the structure it always had. Atomic
collapse removes branches from the document — the counts change, the shape
changes, and a reviewer who was never told sees a smaller site than exists.
One is invisible because nothing was lost; the other is invisible because
something was. docs/02 already sanctions the first: *"Virtualize or simplify
card contents at low zoom if needed."*

**Not now, and the trigger is measurable.** The knee sits between the two
expanded rows above: 1,012 painted rows holds 60 fps, 1,672 falls to 30. So the
current budget is roughly 1–1.7k rows in the DOM, and today's default view of
the largest corpus we have paints 380. Build it when a state users actually
inhabit — not one they opted into and can leave with a single click — measures
below 60 fps p95 on this same harness. Until then it is speculative work against
a number that is already comfortable.

**Do not reach for collapse if that day comes.** The failure it would fix is
"too many rows painted", and painting is exactly what virtualisation controls.
Collapse addresses it by having fewer things exist, which is a different and
worse trade — PRODUCT.md principle 6.

### 3. Topic-reparent capability — *decided: new, per-adapter*

A new per-adapter capability, enforced in `execMoveTopics` and
`execMoveTopicsToNewSection` (not on the container guard, which never sees a
topic move), plus the AI validator, alongside the multiset and rename rules.

**Predicate: parent topic unchanged.** That formulation matters — it catches
re-nesting *inside* one card, where dragging a page under a different parent page
is also a directory change, which a cross-card-only check would miss.

Drag-time messaging mirrors the container refusal (`cardDrag.ts`,
`reparentRefusal`), so the gesture never appears to succeed. The fast-check
undo-round-trip properties must still hold with the guard in place.

**Verified, and the mirror turned out to be real.** The container refusal
is not mute: `reparentRefusal` returns a sentence, `cardDrag` puts it in
`dragStore.refusal`, and `DragOverlay` renders it in red at the pointer —
already branching on `kind === "topics"`, so the render path was waiting.
The topic side shipped a `not-allowed` cursor first and *looked* like a
second doc-overstates-build case; it was one call site short instead.
Both channels now: cursor for the pointer, sentence for the reason.

The lesson is narrow and worth keeping: "the mechanism does not exist"
and "nothing calls the mechanism" look identical from the outside, and
only one of them is a scheduling problem.

### 4. Reparenting v2 — *scheduled: docs/16, the first post-v1 design note*

**v1 ships capability-gated** (Decision 3's per-adapter flag, off for Hugo).
**Reparenting becomes `docs/16`**, and it earns a numbered note rather than a
bolt-on for a specific reason worth stating up front.

The blocker the draft named is not real — `FileChange.move` already exists and is
already used by Docusaurus. What remains is **link handling**, and this corpus
has `disableAliases = true`, so Hugo's own redirect mitigation is off for exactly
the community this adapter targets: inbound links break on any move.

> **[corrected — docs/16]** The last sentence is backwards. `disableAliases`
> does not disable aliases: Hugo's docs say it "only prevents the generation
> of the physical HTML files; the `Aliases` method on a `Page` object remains
> available for use in your configuration templates". kubernetes/website pairs
> it with a `REDIRECTS` output format (`hugo.toml:106`) whose template reads
> `$page.Aliases` and emits Netlify 301s — the setting means redirects moved
> server-side, not that they were switched off. Of five public Docsy sites
> surveyed, aliases work on five. **Alias-on-move is live on this corpus**, and
> docs/16 adopts it as the mitigation this paragraph wrote off.

**The centerpiece of docs/16 is that link handling collides with docs/15.**
Three options, and two of them run straight into the ownership law that was just
made core:

| option | what it needs | collision |
| --- | --- | --- |
| rewrite inbound links | plan changes that edit **body regions** | `FileChange.region` is `"navHead"` or whole-file; body-region plans are a **new law**, not a new flag |
| refuse moves that would break links | **detecting** inbound links | requires reading bodies, which the snapshot deliberately does not own **[corrected — docs/16: `parse` already receives whole bodies (`hugo.ts:748`); detection at import costs nothing. The option dies on the 92% prose-move breakage rate and on refusing from stale evidence, not on this]** |
| disclose, let git review catch it | nothing beyond today | none — and this is the only option that leaves docs/15 untouched |

So the note's real subject is a tension between two things this project
believes: **minimal honest moves** and **the snapshot owns the nav, not the
file**. Neither yields cheaply, and resolving it by reflex in a pull request is
how a core law gets quietly widened. That is what makes it note-sized.

> **[corrected — docs/16] The collision was not real, and the note was still
> worth writing.** Both halves of the framing above failed on contact. Option
> 2's constraint never applied (`parse` already holds whole bodies), and option
> 3 — "the only option that leaves docs/15 untouched" — is insufficient alone,
> because a generic warning fires on 92% of real cross-directory prose moves.
> The answer docs/16 lands was invisible from here: **a Hugo alias is front
> matter**, so alias-on-move mitigates the dominant link species from *inside*
> the ownership law, needing no new region, no body edit and no new law. What
> made this note-sized was not the tension — it was that three of this
> section's premises were wrong and only a survey could say so.

**One thread the note should pull before assuming the constraint bites.** Under
docs/15 the *kept* set holds no bodies — but the *read* set still sees every
byte at import, under its own budget (`MAX_READ_FILES` 5,000 /
`MAX_READ_BYTES` 64 MB, running at 33% and 23% on the whole k8s site
**[corrected — docs/16: those are `content/en/docs` (34% / 23%). Whole-site,
all languages, is 68% / 46%; English-only 50% / 35%. The claim holds; the
headroom is half this]**). Detection
during import is therefore not obviously blocked: it would keep a derived **link
index**, not body content. Whether that index is legitimately nav-adjacent data
or ownership creep wearing a smaller name is exactly the question docs/16 exists
to answer — flagged here so the note does not open by ruling option 2 out on a
constraint that may not apply.

**Two things for whoever opens docs/16, both learned after this section
was written:**

1. **docs/17's classifier already routes the link-index question.**
   "Recomputable from the kept snapshot → selector; otherwise →
   evidence." A link index is not recomputable — bodies are gone — so it
   lands as evidence: written at import, stored, bounded. That does not
   settle whether links SHOULD be indexed, but docs/16 no longer has to
   invent the framework to ask; it applies an existing one and argues
   about the result.
2. **Nobody has measured link density.** This section asserts inbound
   links break on any move, which is true, but no one has counted how
   many internal links exist in kubernetes/website or godot-docs, or
   what fraction of realistic moves would break one. That number decides
   whether "disclose and let review catch it" is pragmatic or negligent
   — and it is a survey, not a design decision, so it should be run
   before the note argues either way.

   **[discharged — docs/16]** Run, and committed as
   `scripts/survey-reparent.ts`. 8,002 in-corpus edges; 43% of pages have
   an inbound link; **92% of cross-directory PROSE moves land on a page
   that has one**, median 6. The number did its job in both directions:
   it killed the refuse-the-move option (a capability that declines nine
   moves in ten is not one) and it killed bare disclosure as a complete
   answer (a warning firing on 92% of moves is wallpaper).

Scheduling early is also where the K8s value is: SIG Docs restructures are
cross-section by nature, so reparenting is the operation that corpus most wants.

### 5. New sections — *settled: a DESIGNED absence in v1*

Hugo v1 does not create sections, and this is recorded rather than left
as a gap someone later "fixes" without reading docs/16.

Creating a section means creating `dir/_index.md` **and moving pages into
it** — which is a parent change, which is the thing v1 refuses. The two
are not separable, so shipping half of it would produce a section that
exists on the canvas and can never be populated.

It rides on the reparent capability rather than getting a flag of its
own, because a new section is by definition a new parent and
`execMoveTopicsToNewSection` already refuses on that predicate. A second
capability with no independent producer would be staged, not shipped
(docs/13's **Decided ≠ built**).

> **[extended — docs/16]** Still true of CAPABILITIES, and it hid a
> conflation. A capability is what an adapter can express; a **per-run
> permission** is what the user will let one AI call do to their disk.
> `allowNewSections` was serving both. docs/16 splits them: a second
> toggle, **Allow file moves (relocates files on disk)**, shown only on
> file-move plan shapes, default off — with new-sections
> disabled-with-reason until it is on, so the unpopulatable-section
> defect this section refused on the canvas cannot reappear in the
> dialog. Dependent, not merged.

Consequences, all disabled-with-reason rather than hidden:

- dragging a topic to the canvas is refused at the drag;
- **Allow new sections** in Reorganize is force-disabled and explains
  why (decision-5 precedent from docs/13);
- the AI validator discards a proposal that introduces one, at the same
  layer as the topic-multiset net.

Unblocks with docs/16, together with reparenting, because it is the same
problem wearing a different hat.

### 6. Descendants of a hidden section — *settled: a second channel*

A `toc_hide`'d container takes its whole subtree out of the published
sidebar (`sidebar-tree.html:87` filters `union .Pages .Sections`). Those
descendants used to render as ordinary published rows: a false PRESENCE
claim, and on kubernetes/website it was **199 of 1,038 topics (19%)** —
the P0's error class inverted and five times larger. The P0 over-marked
73 rows, which was cautious and visible; this under-marked 199, which was
misleading and invisible.

Marking them is therefore not optional. Marking them *the same way* was
the trap: 199 eye-off glyphs on one card is wallpaper, and a glyph that
appears on a fifth of the canvas stops meaning anything on the other
four fifths.

So the mark splits into two channels:

The two channels are **orthogonal**, and that is the whole design:

| channel | means | shown as |
| --- | --- | --- |
| **glyph** | this page carries a flag in its OWN front matter | solid eye-off |
| **italic** | this page is INSIDE something hidden | italic title |

A row can be both, and 8 corpus rows are: the pages under
`tasks/tools/included/` are `headless` *and* sit in a `toc_hide`'d
section. Measured after the change: **11 glyph, 207 italic, 8 both, 828
plain.**

They were briefly collapsed — "own flag beats inheritance" — and the
collapse is instructive. Those 8 rows showed the glyph and nothing else,
so they read as ordinary members of a visible section while
`reference/kubernetes-api/definitions/` (same structural position, no own
flag) went italic. Two rows in identical positions rendering differently
because of an unrelated property is the `no_list` error class again: a
visual claim that does not mirror the thing it claims about. Splitting
the fields fixed it, and the containers still carry the glyph while every
inheriting child carries the italics.

Tooltips carry cause **and** remedy, and keep the distinction that
matters: `toc_hide` is "not in the sidebar — still published at its URL",
`headless` is "not published at all — no URL". An inherited row has no
glyph to hover, so its explanation rides on the title and names the
ancestor responsible; otherwise italic would be a style nobody can
interrogate.

`headless` deliberately does **not** propagate — the sidebar filter is on
`toc_hide` alone, and `headless` describes the node itself.

**Audit before shipping** (italic must not already mean something):
`italic` occurred in exactly one place on the canvas, this feature's own
earlier styling, and docs/05 assigns it no meaning. Pattern-locked rows
use `font-mono`; derived titles carry no font-style. No collision.

### Settle during implementation### Settle during implementation

1. ~~Rendering of unlisted topics~~ — **settled: visible-but-marked, and
   CORRECTED once.**
   A ghosted row, and then TWO INDEPENDENT CHANNELS over it — see
   Decision 6 for the full argument:

   | channel | tracks | shown as |
   | --- | --- | --- |
   | glyph | this page's OWN front matter | solid eye-off |
   | italic | ANCESTRY — is it inside something hidden | italic title |

   They compose rather than compete, so all four states are expressible
   and a page that is both flagged and inside a hidden section shows
   both. An own flag does **not** suppress the inherited channel; an
   earlier draft said it did ("dual-flag rows: own-flag treatment") and
   that wording is wrong — it describes a model that shipped for one
   commit and was corrected. Verified live on
   `tasks/tools/included/`: 8/8 children italic + glyph + ghost, parent
   upright + glyph, tooltips carrying the inherited clause with the
   ancestor named.

   **The cause is named once, in the card's chrome** — "199 rows hidden
   via “Definitions”" — persistent, so it survives scrolling, zooming and
   touch, none of which a hover does. The italic can say "inside
   something hidden"; it cannot say WHICH something without a tooltip,
   and 199 of the corpus's inheriting rows share one container. Same
   logic that put the section mark on the section rather than repeating
   it down the subtree. Its limit is deliberate: per-card aggregate, not
   per-row detail — the per-row tooltips stay, so detail is one hover
   away for whoever thinks to hover, and `cursor: help` on inherited
   titles hints that hovering is worth it.

   Explicitly **not** lock styling: a lock means immobile and these pages
   move freely, so borrowing it would teach the wrong thing about both.
   Never hidden from the canvas — seeing the shape whole includes seeing
   what the site omits. Hugo is the first producer of both channels; a
   fresh Impeccable pass can refine the treatment without reopening the
   semantics.

   **The correction, and how it was caught.** The first implementation
   derived the mark from `no_list` as well, on the strength of the name.
   It is not a visibility flag: Docsy's sidebar filters on `toc_hide`
   alone (`sidebar-tree.html:87`) while `no_list` only chooses how a
   landing page renders its child list (`section-index.html:11`). That
   mismarked **77 of 1,038 topics**, `setup/production-environment` among
   them — pages the site links to normally, labelled as absent from it.
   After the fix the corpus marks 11.

   The provenance is worth keeping: a field check against the rendered
   kubernetes.io beat a green fixture suite. **Fixtures cannot catch a
   wrong spec they encode** — `flags/no-list.md` asserted the mark, so
   the error was durable and self-confirming. The tests are now inverted
   to assert the ABSENCE of a mark, which is the assertion that would
   have failed.
2. Weight-assignment scheme (gap midpoint vs renumber threshold) — and the
   operational definition of "moved", since the no-touch law depends on it: is a
   page that merely shifted because a neighbour left "untouched"?
3. Whether `headless` pages are locked rows or extras-only.
4. What a delete writes. `headless: true` vs `_build.list: never` vs
   `draft: true` differ in **whether the page stays reachable by URL**, so this
   has blast radius on a live site rather than being cosmetic. Precedent settles
   it: JTD writes `nav_exclude` and Docusaurus writes `unlisted`, both of which
   remove a page from navigation while leaving it reachable — so
   `_build.list: never`. Named explicitly because `draft: true` is the
   convenient-looking option and it silently unpublishes.

(i18n was item 4 and is now settled above.)
