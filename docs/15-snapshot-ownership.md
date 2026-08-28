# 15 — Snapshot ownership (collections)

Status: **built**. Supersedes the snapshot paragraphs in docs/14, which
now defer here. `src/collections/navHead.ts` is the mechanism; the caps
change is in `src/view/loadCollection.ts`.

Verified against the real corpus by the shipped code, not by the survey
that proposed it — `navHeadOf` over `~/k8s-website` gives 347.8 KB of nav
heads + 97.7 KB of paths = **445.4 KB kept** against 14.79 MB whole-file.
Two independent implementations landing within 0.6 KB of each other is
the reason to believe the number.

A collection snapshot currently owns **whole files**. It should own only
the part of a file this app actually edits: **the navigation data**. For
folder-based systems that is the front matter, and nothing else.

The change is small and it buys two things — one of them is the reason
Hugo is worth building at all.

## The model

| source | snapshot holds | why |
|---|---|---|
| **collection adapter, from disk** | `path` + the **raw front-matter block** per page | the nav is the front matter; the body is not ours |
| **format adapter** (DocFX, MkDocs, Mintlify) | the whole file, unchanged | the file **is** the nav — whole-file ownership is correct there, and byte-identity depends on it |
| **diskless source** (paste, URL, GitHub import) | bodies, by necessity | there is nothing to re-read at save time, and no save path to clobber |

**Save becomes: read the current file → replace its front-matter block →
write.** Not "write the bytes we loaded".

## What this buys

**1. The whole site fits.** This is the headline. Measured on
kubernetes/website (`scripts/survey-hugo.ts`, commit `6449f1e`):

| kept, whole site | |
|---|---|
| front-matter blocks | 348.0 KB |
| paths | 98.0 KB |
| **total** | **446 KB** |
| against `MAX_TOTAL_BYTES` | 3072 KB |

Under whole-file ownership the same load is 14.79 MB — refused, and
still refused (4.62 MB) even with `reference/` excluded entirely. That is
the difference between a Kubernetes user seeing **all seven top-level
cards** and seeing one section's interior. For an IA tool whose stated
job is seeing the shape whole, that is not a scoping detail.

**2. Body preservation becomes a construction property.** Not a guard, not
a check — there is simply no body in the snapshot to write back. Splicing
into freshly-read bytes cannot revert an edit it never held.

## Concurrency: delegated to version control

**No body hashes. No drift detection. No conflict-surfacing UX.** Not
deferred — descoped. Nothing in this app watches for a concurrent edit,
and nothing should.

The delegation is to version control, and the coverage it gives is better
than assumed. Two layers are involved and they fail differently, so both
are measured below rather than one being generalized into the other.

### Patch layer — a stale `.patch` against a moved working copy

A real JTD plan rendered through `renderPatch`, applied with
`git apply --check` against a repo whose disk had moved on:

| case | result | why |
|---|---|---|
| disk unchanged since load | **accepts** | baseline |
| **body** edited since load | **accepts** — and the body edit survives | our hunks are front-matter-local with 3 lines of context; a body change sits outside the window, so git applies the nav edit surgically around it |
| **front matter** edited since load | **refuses** — `patch failed: ui-components/buttons.md:1` | the drift is *inside* the context window, so git catches exactly the collision that matters |

That **extends** the save-path record made earlier in review rather than
correcting it — that record stands. What it adds is that "refuses on
drift" is too coarse a summary of `git apply`: it refuses on drift that
overlaps our edit and cleanly preserves drift that does not.

The third case needs no receipt: **diskless sources have no save path**,
so nothing can be clobbered.

### Merge layer — a stale commit beside a fresh one

A different layer, and the one that actually happens on a shared docs
repo: nobody hand-applies a `.patch`; they commit and merge. Here the
comparison is stale-commit vs fresh-commit, resolved by three-way merge
rather than by context matching.

Measured on **Mercurial 7.2.4**, re-runnable as
`bash scripts/receipt-vcs-merge.sh`:

| case | result |
|---|---|
| our front-matter edit vs their **body** edit, both committed | rebase exits 0, `hg resolve -l` empty, file ends up **fm v2 + body v2** |
| our front-matter edit vs their **front-matter** edit, same key | `U buttons.md` — conflict markers, the collision surfaces |

Mercurial is the deliberate choice for this half, not git: its patch
engine applies with a **fuzz factor** where `git apply` demands exact
context, so it is the system most likely to paper over a collision. It
does not. That is what lets this note say *version control* rather than
*git*.

### Known residual, now complete

Under splice-on-save, a concurrent external edit to the front matter of a
file this plan touches is **last-writer-wins** — we overwrite it. The
body is safe by construction; the front matter is not.

The merge-layer rows narrow that residual considerably, and the narrowing
is the point. **Committed** divergent front-matter edits do *not* vanish:
they conflict, loudly, at merge. So the genuinely unrecoverable case is
only this — **an uncommitted front-matter edit, made in the same session,
to a file this plan touches.** Two people, one window of one editing
session, the same file's nav metadata, nothing committed in between. That
is what we accept, and it is a much smaller thing than "we overwrite
concurrent edits".

It is accepted, not overlooked. Anyone wanting the strict behaviour can
export a `.patch` instead of saving to the folder — that path refuses.

## `.patch` rendering

Hunks stay front-matter-local, which is what makes the coverage above
work. A real hunk from the JTD planner, unmodified:

```diff
diff --git a/ui-components/buttons.md b/ui-components/buttons.md
--- a/ui-components/buttons.md
+++ b/ui-components/buttons.md
@@ -1,6 +1,6 @@
 ---
 title: Buttons
-parent: UI Components
+parent: Components
 nav_order: 2
 ---
 
```

Three lines of context (`unifiedHunks(before, after, context = 3)`,
`diff.ts:80`), and the body never appears.

### Where the nav head ends — measured, and not obvious

The rendered patch above is byte-identical whether the diff inputs are
whole files or nav heads. That is a real result, but the first version of
this note stated it from one fixture set, and it is **only true for one
of the two ways to define the head**:

| head boundary | hunk | applied to a file whose body starts right after the fence |
|---|---|---|
| through the closing fence **and its EOL** | `@@ -1,6 +1,6 @@` | **refuses** — `patch failed: p.md:1` |
| through the closing fence, **EOL excluded** | `@@ -1,5 +1,5 @@` | **applies** |

Including the trailing EOL makes `split("\n")` yield one final empty
element, which the differ emits as a trailing blank **context line the
real file may not have**. Every JTD fixture happens to put a blank line
after the fence, so the fabricated context matched and the hazard was
invisible. In kubernetes/website it is not marginal: of 1,530 pages with
front matter, **634 — 41% — start their body immediately after the
closing fence.** The first definition would have produced an unappliable
patch for every one of them.

**Law: the nav head is byte 0 through the closing fence, exclusive of its
line terminator.** Stated as a rule rather than a constant because it is
the property that matters — *a nav head must never claim context it did
not read.* It is a prefix of the file, so a diff between two prefixes is
positionally valid for the whole file; extend it by one byte past what
was read and it stops being one.

This is what whole-file ownership was quietly buying: not correctness,
just insulation from having to state that rule.

> **[corollary, added 2026-08-17 by docs/16 step 8] Where no owned
> context exists, the writer emits ZERO-CONTEXT hunks and documents the
> flag.** The rule above is EXTENDED here, never breached: no body byte
> is stored, and none is claimed.
>
> The case that forced it: a page with NO front matter that gains some. Its
> head is empty, so there is no owned context to anchor a prepend
> against, and `git diff` would anchor one with the following body lines
> — bytes this app does not own. Two outs existed. Claim one body line as
> context, breaching the rule for a single byte. Or refuse the case,
> preserving the rule at the cost of a `.patch` download less capable
> than the folder save on 142 corpus pages.
>
> Neither was needed, because `@@ -0,0 +1,N @@` — additions only, no
> context — is a documented unified-diff mode with production precedent,
> and it claims nothing. It requires `git apply --unidiff-zero`, so the
> patch names that in its own first lines; `git apply` tolerates leading
> text, which is how `format-patch` carries mail headers.
>
> **Context is a CLAIM.** That is the sentence the whole rule reduces to,
> and the corollary follows from it rather than amending it: a patch may
> claim only bytes its writer owns, so where it owns none it claims none.
>
> Its KIN is the front-matter drift residual recorded above. Both are
> disclosed last-writer residuals, one per writer: the folder save can
> overwrite a front-matter edit made after load, and the patch can be
> re-applied — measured on `git apply`, which refuses, though GNU `patch`
> is unverified. Each is named where it lives rather than engineered
> away, because version control is the arbiter (`scripts/receipt-vcs-merge.sh`).

## Caps

**`MAX_TOTAL_BYTES` stops binding.** 446 KB against a 3 MB cap for the
largest corpus we have. It stays as the backstop it was written to be;
nothing needs to move.

**`MAX_FILES` — provenance answered.** The question was whether the file
cap guards a measured per-entry cost, or is a second expression of the
same storage worry. `git log -S "MAX_FILES" --all -- '*.ts'` returns
**exactly one commit**, `a7aad09` — the commit that created
`loadCollection.ts`. Both constants are declared adjacently there under a
single docblock sentence, quoted verbatim:

```
 * Hard caps refuse oversized imports up front: if the originals can't
 * persist, planChanges breaks after a reload — worse than refusing.
```

`originals` **is the snapshot**. So the stated reason for the file cap is
snapshot persistence, and persistence is measured in bytes. The two
enforcement blocks land side by side in the same function, with parallel
messages ending in the same sentence (*"Import a docs subfolder
instead."*) — one guard expressed twice, not two guards. The commit
message says it once for both: *"HARD caps 500 files / 3 MB — refusing
beats an unpersistable snapshot"*, and docs/11:103-105 restates the same
single reason. **No per-entry measurement exists anywhere, then or
since.** Persistence serializes the session to one JSON string, where
per-entry cost is key overhead — bytes, already counted directly.

**Disposition: `MAX_FILES` is removed.** Not lowered, not raised, not
replaced with a bigger number — deleted, because a kept-set *count* cap
has nothing left to guard. What remains, and why each is measured:

| guard | bounds | measured against |
|---|---|---|
| `MAX_TOTAL_BYTES` = 3 MB | the **kept** set — what localStorage holds | k8s whole site keeps 446 KB |
| `MAX_READ_FILES` = 5000 | the **read** set — the scan, incl. GitHub fetches | k8s whole site reads 1,672 |
| `MAX_READ_BYTES` = 64 MB | the **read** set, by bytes | k8s whole site reads 14.79 MB |

A successor kept-count number would be unmeasured by construction: the
per-entry cost it would defend is localStorage key overhead, which
`MAX_TOTAL_BYTES` already counts, and the per-file cost of *reading*,
which `MAX_READ_FILES` already counts. Inventing a third number to sit
between them would be re-committing the original error with a fresher
date on it.

**Acceptance:** the kubernetes/website tree — 1,672 files, 446 KB kept —
imports and opens. Under today's cap it is refused at 500.

**Packing is not built.** Collapsing every page's front matter into one
synthetic snapshot entry — the Sphinx title-sidecar shape — would only be
justified if the cap guarded a real per-entry cost, and it does not.

And it would not buy what its name suggests even then. Packing is a
**storage-shape change only**: plans stay per-file, saves stay per-file,
and the canvas still renders a card per page. It moves where bytes sit in
one JSON blob; it does not make the app scale better in any dimension a
user meets. Building it speculatively would add a reserved key and its
guardrails to defend a number nobody measured — the exact trade docs/12's
sidecar made for a reason that was real there and is absent here.

## Sequencing

1. `FilesSnapshot` gains front-matter-only entries for disk-backed
   collection sources; format adapters and diskless sources untouched.
2. `planChanges` emits front-matter `newContent`; `renderPatch` output is
   unchanged (see above).
3. Save path: read current file → splice the nav head → write. The
   `it.fails` characterization test in `fsAccess.test.ts` turns red here
   and becomes a real assertion.
4. Remove `MAX_FILES` per the disposition above; k8s whole-site import is
   the acceptance test.

## The baseline is not a disk mirror

`refreshCollectionFiles` (post-save snapshot refresh) **splices in
memory** — it does not re-read the folder. Four reasons, and the first is
the one that decides it:

- **Descope compliance.** A post-save re-read *is* drift machinery, just
  silent: it would absorb whatever a concurrent editor had written into
  our baseline, so the next plan would diff against their change without
  anyone knowing. Refusing to detect drift and quietly swallowing it are
  not the same policy.
- **Target uniformity.** `memoryTarget` has no disk to re-read. If save
  re-read, the tested path and the shipped path would diverge exactly
  where the risk is.
- **Purity.** Refresh stays a pure function of (snapshot, changes), so it
  cannot fail *after* a successful write — there is no state where the
  bytes landed but the session is inconsistent.
- **One mechanism.** `applyChanges` is extended to nav-head entries and
  then serves both simulation and refresh, so the property tests already
  covering simulation cover refresh for free.

The semantic this commits to, stated plainly because it is load-bearing:
**the snapshot is what the app loaded or last wrote — never a mirror of
what is on disk now.** Everything above follows from that one line.

**Acceptance property:** after a save, `planChanges(refreshed snapshot,
same canvas)` is the empty plan — the "nothing left to save" fixpoint.

## Open

Nothing blocking. Post-implementation, the note's claims should be
re-checked against the built code once rather than trusted from here.
