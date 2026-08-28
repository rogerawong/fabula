/**
 * types.ts — The neutral, format-agnostic TOC model.
 *
 * This is the tree the whole app operates on (canvas, commands, undo,
 * persistence). It knows NOTHING about any file format — format-specific
 * parsing/serialization lives in `src/formats/` behind TocFormatAdapter,
 * which may stash format-private data in the opaque `extras` bags. The
 * core clones and carries extras but never interprets them.
 *
 * Deliberate choices (see docs/03-architecture.md):
 * - Sections carry stable `id`s; nothing addresses sections by array
 *   index (index addressing was the deepest bug source in prototyping).
 * - No stored `level` — depth is derived during traversal.
 * - No stored counts (`totalCount` etc.) — see selectors.ts.
 * - No stored raw YAML — serialization is on demand via the adapter.
 * - No stored `colorIndex` / `originalIndex` — palette assignment is a
 *   selector over document order (see palette.ts).
 */

export type TopicId = string;
export type SectionId = string;

/**
 * Why a node is pinned in place. These are not severity levels — they are
 * different kinds of thing, and conflating them is what made a collapsed
 * 1163-page subtree read as an empty one:
 *
 * - `atomic`   a real subtree, deliberately not expanded. A boundary.
 * - `reference` a second listing of a document whose primary is elsewhere.
 * - `pattern`  a glob; THIS LINE is a rule, not a document.
 * - `globbed`  a plain docname whose BLOCK expands patterns, so the
 *              rendered list is generated and no line in it is movable.
 *              Split from `pattern` because they are the line's property
 *              and the block's: collapsing them gave a docname a
 *              description false about it (docs/19).
 * - `outside-region` a line whose BLOCK sits above prose the app does
 *              not own, so the block is outside the file's trailing
 *              navigation run and none of its lines can be rewritten.
 *              Sibling of `globbed`: both are block-level enforcement,
 *              answering different questions — that one is WHY the list
 *              is not a list, this one is WHERE the block sits.
 * - `external` a link out of this documentation set entirely.
 * - `missing`  a listed document that does not exist. A fault in the
 *              source, not a decision — the only kind that is a problem.
 */
export type LockKind =
  | "atomic"
  | "reference"
  | "pattern"
  | "globbed"
  | "outside-region"
  | "external"
  | "missing";

/**
 * A section whose contents are generated elsewhere and are not editable
 * here — a Mintlify group sourced from an OpenAPI spec, say.
 *
 * DECLARED by the adapter at parse time, never derived from the rows.
 * Deriving it as `rows.every(locked)` is vacuously true at zero rows, so
 * a card generated from a spec (no rows, not editable) and a genuinely
 * empty card (no rows, a perfectly good drop target) come out identical.
 * They are opposites, and only the adapter knows which is which.
 */
export interface SectionSeal {
  /** Where the contents come from, shown on the card: "OpenAPI /openapi.json". */
  source?: string;
}

export interface TopicLock {
  kind: LockKind;
  /** `atomic` only: how many entries sit behind the boundary. */
  count?: number;
  /** `reference` only: title of the section holding the primary. */
  owner?: string;
}

/**
 * What a displacement RECORDS, and why each field is here.
 *
 * A MEASUREMENT of a past arrangement, kept because the arrangement it
 * describes no longer exists to be read. On a collection tab the same
 * facts are DERIVABLE from the snapshot and the derivation is the
 * selector of record; this is what a format tab has instead, and what
 * the two are cross-checked against (docs/21, Decision 3).
 */
export interface TopicDisplacement {
  /**
   * The uuid of what this node sat IN: a section, the topic above it, or
   * — when the node was a top-level card that a proposal demoted — the
   * DOCUMENT itself. One idea, three shapes of container, which is why
   * one field carries all three rather than a nullable pair.
   */
  parentId: string;
  /** That parent's title at displacement time — copy, for the badge and
   *  the checklist. Stored rather than looked up, because the parent may
   *  since have been renamed and the fact being recorded is where the
   *  row CAME FROM. */
  parentTitle: string;
  /**
   * Position among the original parent's children at displacement time.
   *
   * A recorded MEASUREMENT that the projection uses ONCE to place a
   * restoration, never an address anything looks a node up by — which
   * is what keeps it clear of the index-addressing bug class.
   * Nothing in this design keys on it.
   */
  index: number;
  kind: DisplacementKind;
}

/**
 * What KIND of thing the write path refuses about this displacement —
 * and therefore what the badge, the checklist and the projection each
 * do with it (docs/21, Decisions 3, 4 and 6).
 *
 * REFUSAL-CLASS (the app will not write it, full stop):
 * - `pin` — the row is pinned by the source. Producer-blind, so it is
 *   DERIVABLE from placement alone wherever a snapshot exists.
 * - `directory-move` — a card nested into another card, which on a
 *   file-move system relocates a whole directory (docs/18, parked).
 * - `block-entry` — a card with no page nested into another card, where
 *   the nav is a list of targets and there is no line to write.
 *
 * CONSENT-CLASS (the app WILL write it if the user agrees this run):
 * - `consent` — a file-relocating parent change proposed by a run that
 *   had no proposal-time consent to give it. Producer-DEPENDENT, so it
 *   is RECORDED only and never derived: a manual drag carries its
 *   consent in the gesture and a grounded run carries it in the dialog
 *   toggle, so the same placement fact means different things depending
 *   on who made it.
 *
 * The union is exhaustive at every consumer — the checklist copy, the
 * projection and the badge — so a fourth kind fails `pnpm check` at all
 * of them rather than shipping unlabelled.
 */
/**
 * `reparent-unsupported` is refusal-class too: the format cannot record a
 * parent change AT ALL, so no consent could license it and the R4 control
 * must not offer to. It is split from `consent` for exactly that reason —
 * one says "you have not agreed to this", the other says "there is nothing
 * to agree to". STAGED, not proved: no shipped adapter answers
 * `supportsReparent: false` today (docs/16 — "flipping it leaves the stage
 * empty"), so its only producer is the refusing test adapter.
 */
export type DisplacementKind =
  "pin" | "directory-move" | "block-entry" | "reparent-unsupported" | "consent";

export interface Topic {
  id: TopicId;
  title: string;
  /**
   * True when the title was derived (e.g. from a filename) because the
   * source document had no explicit name for this node. Adapters use it
   * to avoid writing a name on export that wasn't in the original file.
   * An explicit in-app rename clears the flag.
   */
  titleDerived?: boolean;
  /** Link target (href / file path), if any */
  path?: string;
  /**
   * Set when the source pins this node in place. Locked nodes render,
   * cannot be deleted or renamed, and planners never rewrite their
   * lines (docs/12).
   *
   * DRAGGING IS THE ONE THIS NO LONGER REFUSES (docs/21, arc 2). The
   * sentence used to read "cannot be dragged, deleted or renamed", and
   * that made a WRITE permission into a restriction on thought: the pin
   * keeps absolute authority over what is WRITTEN — the applyable
   * projection returns every displaced row home before a planner sees
   * anything, with the adapters' own refusals still live underneath —
   * and loses its authority over what may be IMAGINED, provided the
   * imagining is labeled. So a pinned row drags, its DROP asks once per
   * tab, and a displacement is recorded and badged. Deletion is not
   * displacement and stays refused; renames stay refused with docs/19's
   * deferral as the reason.
   *
   * NOT in `extras`: that bag is data the core clones but never
   * interprets, and the core must interpret this to refuse a gesture.
   * Distinct from the per-tab `topicsLocked` view mode, which is
   * transient and undo-free; this describes the document, so it persists
   * and travels with the node.
   */
  lock?: TopicLock;
  /**
   * Where this node sat before an ASPIRATIONAL move put it here
   * (docs/21, Decision 3) — the recorded half of the displacement
   * ledger.
   *
   * NOT in `extras`, for the same reason `lock` is not: the core has to
   * interpret it to badge the row, project it home at apply time and
   * put it back, and extras is the bag the core clones but never reads.
   *
   * WRITTEN BY EVERY DISPLACING PRODUCER — reconstruction when it
   * classifies, and the seam-accepted drag — and CLEARED by any move
   * that lands the row back at `parentId`, because putting a thing back
   * is not a displacement whoever does it. LEFT UNTOUCHED by further
   * moves of an already-displaced row: the origin does not change
   * because the row moved twice.
   *
   * Because it is document data mutated by commands it rides Immer
   * patches, so the displacing command writes the move and the record
   * together and undo removes BOTH by inversion — there is nothing to
   * keep in step.
   */
  displaced?: TopicDisplacement;
  /**
   * The page exists and can be moved, but the published site leaves it
   * out of navigation.
   *
   * "Out of navigation" means the SITE does not link to it, verified
   * against the theme's templates — not merely that some front-matter
   * key looks suppressive. Hugo's `no_list` reads like one and is not:
   * it styles a landing page's child list and the sidebar never consults
   * it (see docs/14).
   *
   * DELIBERATELY NOT a `lock`. A lock means immobile; these pages are
   * fully movable and their flag is a fact about the site's rendering,
   * not a restriction on editing. Borrowing lock styling would teach the
   * wrong thing about both (docs/14).
   *
   * Never a reason to hide the node from the canvas: seeing the shape
   * whole includes seeing what the site omits (PRODUCT.md principle 6).
   */
  unlisted?: TopicUnlisted;
  /** Opaque format-specific properties, preserved for round-trip export */
  extras?: Record<string, unknown>;
  children: Topic[];
}

/** One reason a page is absent from the published navigation: the source
 *  key, and one line of what it actually does. */
export interface UnlistedReason {
  label: string;
  note: string;
}

/**
 * Why a page is absent from the published navigation.
 *
 * A LIST because a page can carry more than one such flag — in
 * kubernetes/website `tasks/tools/included/_index.md` is both `toc_hide`
 * and `headless`. The canvas shows one glyph and names every reason on
 * hover; collapsing to a single label would drop the other fact.
 */
export interface TopicUnlisted {
  /**
   * Flags in THIS page's own front matter. May be empty: a page can be
   * absent from navigation purely because an ancestor is.
   */
  reasons: UnlistedReason[];
  /**
   * Set when an ancestor is hidden, INDEPENDENTLY of whether this page
   * carries a flag of its own — the two are orthogonal facts and a page
   * can be both.
   *
   * They were briefly collapsed into one field, and the collapse showed:
   * nine pages under `tasks/tools/included/` are `headless` AND sit
   * inside a `toc_hide`'d section, and only the first fact reached the
   * canvas. Rows in identical structural positions then rendered
   * differently because of a property unrelated to inheritance.
   */
  inheritedFrom?: { via: string; reasons: UnlistedReason[] };
}

export interface Section {
  id: SectionId;
  /**
   * The section is absent from the published navigation — same field and
   * same meaning as `Topic.unlisted`, because in a path-addressed system
   * a section and a nested directory are THE SAME THING and which one a
   * directory becomes depends only on where the import was rooted.
   *
   * Hugo receipt: Docsy's sidebar filters `union .Pages .Sections` on
   * `toc_hide` (`sidebar-tree.html:87`), so a `toc_hide`'d section is
   * dropped as a node — subtree and all.
   */
  unlisted?: TopicUnlisted;
  title: string;
  /** See Topic.titleDerived */
  titleDerived?: boolean;
  /** Section link target (if any) */
  path?: string;
  /**
   * Set when the adapter knows this card's contents are generated
   * elsewhere and cannot be edited here. Declared at parse time — never
   * inferred from the rows. Absence means "an ordinary card", including
   * when it happens to have no rows.
   */
  sealed?: SectionSeal;
  /**
   * Ordered ancestor path for formats with navigation containers ABOVE
   * the card that have no card of their own — Mintlify tabs, dropdowns
   * and languages; later mdBook/Jupyter/GitBook parts, Docusaurus
   * categories, DITA branches (docs/13).
   *
   * Outermost first, e.g. `["en", "Documentation"]`. Absent for every
   * format whose cards are top level, which is all of them today.
   *
   * NOT in `extras`, for the same reason as `Topic.lock`: the core has to
   * interpret it to show the chip and refuse a cross-chain drop, and
   * extras is data the core clones but never reads.
   */
  chain?: readonly string[];
  /** Opaque format-specific properties, preserved for round-trip export */
  extras?: Record<string, unknown>;
  /**
   * True if this section wraps an orphan — a top-level TOC entry with no
   * children. Rendered as a compact card; unwrapped back to a leaf entry
   * on export. Its single wrapped entry lives in `topics[0]`.
   *
   * "STANDALONE ENTRY" is the user-facing word for this shape (docs/22,
   * OR-1); `isOrphan` names the parse mechanism and stays internal. A
   * writer did not orphan anything — they placed a page at top level.
   */
  isOrphan?: boolean;
  /**
   * The title is a STAND-IN NO ONE HAS REPLACED (docs/22, Decision 2).
   *
   * Set when a gesture births a card the user has not named — a wrap,
   * where the format cannot hold a bare entry and something has to carry
   * a heading — and CLEARED by the first explicit rename. Rides Immer
   * patches with the rest of the document, so undo restores it and there
   * is nothing to keep in step.
   *
   * DELIBERATELY NOT `titleDerived`: two sentences, two referents.
   * *"`titleDerived`: the title came from a filename because the source
   * had none"* is true of 224/224 Mintlify pages, which must not light
   * up as placeholders; *"`untitled`: the title is a stand-in no one has
   * replaced"* is true only of a card this app just invented a name for.
   * Collapsing them would put a placeholder mark on every derived title
   * in the corpus.
   *
   * NEVER A REFUSAL. Export writes the text happily — the bytes are
   * legal and the name is merely nobody's — so its whole surface is
   * pre-save legibility (Decision 5's notice and the checklist's
   * appendix line).
   *
   * NEVER SET ON THE AI PATH. Nobody is present mid-run to answer a
   * placeholder, so reconstruction titles a wrap after its entry with
   * `titleDerived` instead (`validate.ts`) — the difference is producer
   * PRESENCE, not vocabulary.
   */
  untitled?: true;
  topics: Topic[];
}

/**
 * A navigation container, DECLARED by the adapter at parse time — the
 * registry the core consults to decide what a card may be dragged into
 * (docs/13 v2).
 *
 * Declared, never derived from the cards currently inside it. Deriving
 * "what does this container accept" from its members is the `sealed`
 * mistake one level up: it reads the wrong answer for a container that
 * legally bears sections but happens to hold none — refusing a legal
 * move, rendering no lane, and making the first card of a new container
 * impossible to place. It also re-derives format law from instance
 * state on every edit, which is not where format law lives.
 *
 * This registry also owns what v2 would otherwise have scattered: the
 * order OF containers (out of adapter extras, where the core could not
 * read it), lane identity and band labels, the copy the seam menu and
 * undo toast use, and the never-empty guard.
 */
export interface ContainerDescriptor {
  /** Matches `chainKey`/`chainPathKey` for the sections inside it. */
  chainKey: string;
  /** Display name — the lane band, the chip, the menu, the toast. */
  label: string;
  /**
   * The format's own noun for this container ("tab", "dropdown",
   * "language"). COPY ONLY — tooltip, seam menu, undo toast — and never
   * behavior, which stays on `accepts` and `mayEmpty`. Optional: a
   * format with no noun for its containers omits it and every copy
   * surface degrades to the label alone.
   */
  kind?: string;
  /** Position among containers, from the source. Never derived from cards. */
  order: number;
  /** What may be dropped in. A container may bear both, one, or neither. */
  accepts: { sections: boolean; orphans: boolean };
  /** False when the format requires at least one entry (Mintlify: `tabs.groups`). */
  mayEmpty: boolean;
}

export interface TocDocument {
  id: string;
  /** Display name, derived from the file name */
  name: string;
  /** ID of the format adapter that parsed this document (round-trip routing) */
  formatId: string;
  /** Opaque format-specific document-level data (e.g. root style) */
  extras?: Record<string, unknown>;
  /**
   * Navigation containers, declared by the adapter. Absent for every
   * format whose cards are top level. MODEL data, not `extras`: the core
   * must interpret it to draw a lane and refuse a drop, and `extras` is
   * data the core clones but never reads.
   */
  containers?: readonly ContainerDescriptor[];
  /** Section order here is the document's canonical (original) order. */
  sections: Section[];
}
