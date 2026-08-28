# Format Adapters

The adapter contract stands on this repo's own conformance suite —
interface, registry, adapters and fixtures all run one shared law, and
every registered adapter answers to it. This doc states the contract
and its rationale.

## Principle

The core application knows nothing about any TOC file format. All format
knowledge lives in adapters — one module each — behind a small interface.
The contribution pitch for the whole project is: *support for your doc
system's TOC format is one file, one fixture, one registry line.*

## The interface

```ts
interface TocFormatAdapter {
  id: string;              // stable; stored on every Document for routing
  label: string;           // "DocFX (toc.yml)"
  fileExtensions: string[];

  detect(parsed: unknown, raw: string, fileName: string): number; // 0–1
  parse(raw: string, fileName: string): Document;
  serialize(doc: Document, sectionOrder: SectionId[]): string;
  serializeSection(section: Section): string;   // per-card code view

  createCards: boolean;    // can the write path add a top-level card?
  reorderCards: boolean;   // can it record a change to their order?

  sample?: { fileName: string; content: string };
}
```

**`createCards` / `reorderCards` are REQUIRED, and the direction of the
failure is why.** They condition the AI dialog's "Allow new sections"
toggle and two prompt lines, so a missing answer reads as *capable*: the
toggle re-arms, the lines vanish, and the run promises what the plan must
refuse. That is not hypothetical — three corpus-scale calls were refused
at Review for exactly that before the fields existed (docs/10's oracle
log, 2026-08-19). Required means `pnpm check` names the next adapter that
forgets, the same contract `CollectionAdapter.reparentMovesFiles` carries.

A whole-file serializer answers `true` to both by construction, which is
precisely why leaving them optional would feel harmless and would not be:
the next format adapter is the one that cannot. Answer them from your own
`serialize` — does it rebuild the top level from `sectionOrder`, and does
a section with no source `extras` serialize? — never by analogy with a
neighbouring adapter.

Contract decisions:
- `serialize` takes **section ids** (never indices — see 03, ids
  everywhere).
- Registry does one `yaml.load` and passes the result to every `detect` —
  adapters must not re-parse for detection.

## The round-trip contract

`serialize(parse(text))` must be **lossless and stable**:

1. **Lossless:** re-parsing the output yields a model deep-equal to the
   original parse (modulo generated ids).
2. **Stable:** serialize → parse → serialize is a fixpoint (byte-identical
   the second time).
3. **Minimal diffs:** an edit changes only the affected lines' region —
   preserve key order and original document shape wherever the YAML
   library allows.

Mechanisms:

- **`extras` bags** (`Document`/`Section`/`Topic`): every property the
  neutral model doesn't represent goes in, verbatim, and comes back out on
  serialize. The core clones and carries extras but never interprets them.
  Semantics are private to the adapter — a document always round-trips
  through the adapter that parsed it (`Document.formatId`). Extras may be
  `undefined` on anything created inside the app; serialize must cope.
- **`titleDerived`**: formats that allow unnamed nodes (DocFX href-only /
  uid-only entries) get display titles derived from href/uid, flagged
  `titleDerived: true`. Serialize omits the name for flagged nodes.
  An explicit in-app rename clears the flag (the rename command does this),
  after which the name is written.
- **Orphan mapping**: a top-level leaf entry parses to a section with
  `isOrphan: true` wrapping the entry as its single topic (the UI renders a
  compact card); serialize unwraps it back to a leaf.
- **Root shape preservation**: e.g. DocFX accepts both an `items:` root and
  a classic bare list; the adapter records which (in `Document.extras`) and
  reproduces it.

## Explicit non-goals

- **No cross-format conversion.** The architecture would technically allow
  serializing a document through a different adapter (dropping foreign
  extras), but v2 builds no UI for it and makes no promises. This keeps
  every adapter's `extras` handling private and simple — the trap this
  design deliberately avoids is a universal schema that must model every
  format's quirks.
- **No runtime plugins.** Adapters are compiled in via PRs. Loading
  arbitrary parser code at runtime is a security and support tarpit.
- **One file per format adapter — a routing rule, not a refusal.**
  `parse(raw)` takes a single blob, which is what keeps the round-trip law
  simple enough to assert as a fixpoint. A system whose navigation
  genuinely spans files is not unsupportable; it belongs to the
  **collection contract** (docs/11), and needing cross-file resolution is
  the signal that routes it there. DocFX's nested `toc.yml` stays a badged
  leaf on purpose — opening it in its own tab beats inlining it.

  This entry used to read "No multi-file resolution", which was v1 scope
  (docs/01) restated without its `in v1` qualifier. Collection adapters
  crossed that line deliberately and the sentence outlived its truth: JTD
  reads every page's frontmatter, Docusaurus reads a directory tree, and
  Sphinx walks a toctree graph across hundreds of files. Read it as "which
  contract does this system belong to?" rather than "we don't do that."

## Recognizers (not adapters)

A **recognizer** is a registry-level `{ test(input), message, helpUrl? }`
consulted after every `detect` returns 0, and also when parsing fails
outright — the formats most worth naming (an mdBook `SUMMARY.md`, a
TypeScript `sidebars.ts`) are not YAML at all, so they never reach
detection. It replaces the generic "Unrecognized TOC format" error with a
specific one — "this is a legacy Mintlify config, run `mint dev` to
write a `docs.json`" — via a typed `KnownUnsupportedFormatError` the
load UI can render as a link.

**Keep the message current.** This one named `npx mintlify@latest
upgrade` until the vendored corpus was checked; Mintlify had renamed the
CLI. Sending someone to a retired command is the failure a recognizer
exists to prevent, so its copy is a fact about the outside world with a
shelf life, not a constant.

Recognizers are **not formats**: never parsed, never serialized, and
excluded from the conformance and fixpoint suites *by construction*,
since there is no `parse` to call. That is the point of the separate
concept — the alternative considered was letting an adapter's `detect`
claim a format its `parse` refuses, which would have redefined `detect`,
turned an error path into a guidance channel, and needed a hand-written
suite exemption (docs/13).

Each recognizer lives with the adapter module that owns the knowledge, and
sniffs conservatively: an ambiguous, nameless input falls through to the
generic error, because a silent recognizer beats a wrong one.

## Conformance suite

A shared test suite runs **every registered adapter** against its fixtures
(adapters must register at least one; the suite fails otherwise):

1. detection: registry picks this adapter for the fixture
2. parse: non-empty, tagged with the adapter id
3. lossless: parse → serialize → parse ≡ parse (normalized comparison
   strips generated ids)
4. fixpoint: second serialize is byte-identical
5. serializeSection: valid non-empty output for every section

Plus per-adapter tests for format quirks (derived titles, extras
preservation, root shapes, order handling). The shared suite lives at
`formats/__tests__/conformance.test.ts`.

## Shipping adapters

- **DocFX (`toc.yml`)** — the first adapter, with the
  sample document and fixtures. Spec:
  https://dotnet.github.io/docfx/docs/table-of-contents.html
- **MkDocs (`nav:` in mkdocs.yml)** — second adapter, built before public
  announcement to keep the interface honest. Notable quirks to design for:
  nav entries are `- Title: path` single-key maps or bare paths; the nav
  lives inside a larger config file (adapter must preserve the surrounding
  document — a good stress test for `Document.extras`).
- Candidate backlog: Docusaurus `sidebars.js` (JS, not YAML — would force
  the interface to drop its YAML assumption; evaluate, don't promise),
  Hugo menus, Sphinx toctree, GitBook SUMMARY.md.
