/**
 * validate.ts — Rebuild a TocDocument from the parsed LLM response
 * (plan: "Reconstruction"). Children-follow semantics; strict on
 * invention, lenient on omission (recovery); scope pass-through; the
 * Layer-5 safety net asserts the topic multiset before anything is
 * shown to the user. All payloads (paths, extras) come from the
 * ORIGINAL objects by id — the model's text can only rearrange.
 */

import { renameCapability, reparentCapability } from "@/formats/registry";
import { buildConstraints, pinnedRowCount } from "./constraints";
import { fileMovesAllowed, movesFilesOnReparent, nodesNeedTargets } from "./permissions";
import { bearingOf } from "@/model/bearing";
import { speciesAtBirth } from "@/model/birth";
import { containerFor, containerPhrase, emptiedContainers } from "@/model/containers";
import { structureReport } from "@/model/remainders";
import { filesOf } from "@/collections/types";
import { newId } from "@/model/id";
import { isPinned } from "@/model/locks";
import {
  chainKey,
  chainLabel,
  chainPathKey,
  countTopics,
  documentStats,
  isSealed,
} from "@/model/selectors";
import { cloneExtras, cloneSection, cloneTopic } from "@/model/tree";
import type { DisplacementKind, Section, TocDocument, Topic } from "@/model/types";
import {
  AiError,
  type IdMap,
  type ReorganizeOptions,
  type ReorganizeSummary,
  type ResultNode,
} from "./contract";

/** The row itself, wherever it now sits. Used only to attach a
 *  classification record after the arrangement is assembled. */
function findTopicById(sections: readonly Section[], id: string): Topic | null {
  const walk = (nodes: Topic[]): Topic | null => {
    for (const t of nodes) {
      if (t.id === id) return t;
      const found = walk(t.children);
      if (found) return found;
    }
    return null;
  };
  for (const s of sections) {
    const found = walk(s.topics);
    if (found) return found;
  }
  return null;
}

/**
 * Facts about a ROW that belong to the source or to the ledger rather
 * than to the arrangement — carried on every path that rebuilds a topic.
 *
 * The docs/13 chain-carry lesson, one field over: reconstruction carries
 * `chain`, `sealed` and `lock` on every path because dropping one
 * flattened every tab, and `displaced` joins them because a rebuild that
 * dropped it would silently launder a pinned move into an ordinary row
 * on the next run.
 *
 * ONE HELPER, so a fourth such field is added in one place rather than
 * at four sites of which somebody will miss one. The literal branch of
 * `implicitTopics` had already missed `lock` — a locked parent whose
 * subtree held an explicitly-placed row came back UNPINNED, and an
 * unpinned row is one the adapter will rewrite.
 */
function carriedRowFacts(t: Topic): Pick<Topic, "lock" | "displaced"> {
  return {
    ...(t.lock ? { lock: { ...t.lock } } : {}),
    ...(t.displaced ? { displaced: { ...t.displaced } } : {}),
  };
}

interface ReconstructArgs {
  doc: TocDocument;
  nodes: ResultNode[];
  idMap: IdMap;
  options: Pick<
    ReorganizeOptions,
    "scopeSectionIds" | "allowRenames" | "allowNewSections" | "allowFileMoves" | "mode"
  >;
}

/**
 * What the content-safety discard SAYS, from the numbers that caused it.
 *
 * THE SENTENCE THIS REPLACES COST A CORPUS-SCALE CALL. It read "This is a
 * bug on our side — please try again", and both halves were wrong in the
 * expensive direction: the first sends the user to report working code,
 * the second sends them to spend the same money on the same request at
 * the same granularity, which is the one action guaranteed to reproduce
 * the failure (docs/10's oracle log, 2026-08-19).
 *
 * THREE CASES, NEVER ONE APOLOGY. The invariant can fail three ways and
 * they are not the same event: rows missing, rows listed twice, or a set
 * that matches on neither count. Describing a duplication as an omission
 * would be the house conflation in a sentence — so where the numbers say
 * which happened, the copy says it, and where they do not it states the
 * fact it has rather than inventing a count.
 *
 * MEASURED, not assumed: only the DUPLICATE case is reachable through
 * reconstruction today, because omitted topics are recovered into their
 * original sections by design. The omission branch is kept because the
 * comparison genuinely admits it, and it is tested as a pure function
 * with that limit written down (`discardCopy.test.ts`).
 *
 * Exported for that test, and because a sentence with one producer is a
 * sentence two surfaces cannot render differently.
 */
export function multisetDiscardMessage(
  before: readonly string[],
  after: readonly string[],
): string {
  const head =
    "The reorganization could not be verified as content-safe, so it was discarded.";
  // THE REMEDY THAT CHANGES THE OUTCOME. A coarser granularity asks the
  // model to reproduce fewer ids, which is the pressure both reachable
  // failures come under at corpus scale.
  const remedy =
    "Try a coarser granularity, or reorganize fewer cards at a time — the answer has fewer rows to keep track of.";
  const seen = new Set(after);
  const missing = before.filter((id) => !seen.has(id)).length;
  const duplicated = after.length - new Set(after).size;

  if (missing > 0) {
    return `${head} The answer left out ${missing} of the ${before.length} rows in the request. ${remedy}`;
  }
  if (duplicated > 0) {
    return `${head} The answer listed ${duplicated} row${duplicated === 1 ? "" : "s"} twice. ${remedy}`;
  }
  return `${head} The rows it returned are not the rows it was given. ${remedy}`;
}

/**
 * ADOPTION OBEYS THE HOME'S BEARING (docs/22, Decision 6 — the M3 fix).
 *
 * The three adoption sites used to inherit the card-above's chain
 * blindly, and measured at `a8f28cf` that produced invalid bytes through
 * a route nobody had to do anything wrong to reach: hoisting one leaf on
 * a container-rooted Mintlify document minted a STANDALONE into a
 * `groups` container, whose descriptor declares `orphans: false`, and the
 * export wrote a bare page path into an array of group objects.
 *
 * The inherited candidate is now consulted against the home's declared
 * bearing FOR THE SPECIES BEING MINTED — the same `accepts` data the drop
 * refusal, the descriptors and the write-path refusal read. Never a
 * second table.
 *
 * Three regimes, and the middle one is the species-at-birth rule:
 *  - the home bears the species → inherit, as before;
 *  - the home bears SECTIONS ONLY and the card would be a standalone →
 *    the card is BORN A SECTION wrapping the entry. A `groups` array
 *    holds group objects, not paths, so there is no neutral state to
 *    defer to; the wrapper is titled after its entry with
 *    `titleDerived`, because nobody is present mid-run to answer a
 *    placeholder and a single-page group named for its page is the
 *    format's own idiom;
 *  - nothing reachable bears it → CHAINLESS, and Decision 5's unhoused
 *    surfacing owns it. Surfaced rather than refused: a hand mid-gesture
 *    can be handed a sentence naming real homes and act on it now, a
 *    model mid-outline cannot.
 *
 * A GUARD CONSUMES DECLARED INPUTS. A document that declares no
 * containers is not a document whose homes bear nothing — it is one that
 * said nothing, so this checks nothing and inherits exactly as before.
 */
function adoptHome(
  doc: TocDocument,
  candidate: readonly string[] | undefined,
  wantsStandalone: boolean,
): { chain?: string[]; standalone: boolean } {
  if (!candidate || candidate.length === 0) {
    // THE ROOT IS A HOME LIKE ANY OTHER (docs/22 arc 2). Decision 6's
    // three regimes were written against CONTAINER-rooted documents,
    // where a descriptor answers; a document with no containers has a
    // root too, and each adapter now DECLARES what it bears, so the
    // regime that root gets follows the receipt rather than a guess.
    //
    // It is not hypothetical: Sphinx declares that its root bears no
    // standalone — every entry lives inside a toctree block — while this
    // branch used to return early and mint `isOrphan: true` anyway, so
    // the declaration and the AI path contradicted each other on the one
    // adapter whose answer is not {both}.
    //
    // A guard consumes declared inputs, and `bearingOf` supplies the
    // permissive answer where nothing was declared, so a format nobody
    // has classified behaves exactly as before.
    const born = speciesAtBirth(
      bearingOf(doc, []),
      wantsStandalone ? "standalone" : "section",
    );
    return { standalone: born === "standalone" };
  }
  const home = containerFor(doc, chainPathKey(candidate));
  if (!home) return { chain: [...candidate], standalone: wantsStandalone };
  // THE TABLE, NOT A SECOND COPY OF IT (docs/22, Decision 2's
  // species-at-birth rule). The gesture and this path mint cards from
  // one rule; what differs is only how each obtains the bearing and what
  // each does with `unhoused` — the gesture refuses with a sentence
  // naming real lanes, and this mints CHAINLESS and lets Decision 5's
  // unhoused surfacing own it, because nobody is present mid-run to act
  // on a sentence.
  const born = speciesAtBirth(home.accepts, wantsStandalone ? "standalone" : "section");
  if (born === "unhoused") return { standalone: wantsStandalone };
  return { chain: [...candidate], standalone: born === "standalone" };
}

export function reconstructDocument(args: ReconstructArgs): {
  doc: TocDocument;
  summary: ReorganizeSummary;
} {
  const { doc, nodes, idMap, options } = args;
  const scope = options.scopeSectionIds ? new Set(options.scopeSectionIds) : null;

  // reverse: original topic uuid → compact id
  const compactOf = new Map<string, string>();
  for (const [cid, entry] of idMap) {
    if (entry.kind === "topic") compactOf.set(entry.topic.id, cid);
  }

  // every compact id explicitly referenced in the response
  const explicitIds = new Set<string>();
  const collectExplicit = (list: ResultNode[]) => {
    for (const n of list) {
      if (n.id) explicitIds.add(n.id);
      if (n.children) collectExplicit(n.children);
    }
  };
  collectExplicit(nodes);

  const placed = new Set<string>();
  const promotedUuids = new Set<string>();
  /** Section uuids now living as topic ids (merges) — excluded from the
   *  topic-multiset check, since they were never topics before. */
  const demotedSectionUuids = new Set<string>();
  const counts = {
    renamed: 0,
    newSections: 0,
    promoted: 0,
    recovered: 0,
    emptyDropped: 0,
  };
  const warnings: string[] = [];
  /** Sealed cards a proposal tried to merge away; restored as cards. */
  const unmergeableSections = new Map<string, Section>();

  /**
   * A card's navigation container and its seal are facts about the
   * document, not about the arrangement: chains are invisible to the
   * outline, so a proposal can neither name nor change one. Reconstruction
   * carries both across untouched — dropping the chain would silently
   * flatten every tab into the root container on the next export (docs/13).
   */
  const carried = (s: Section | undefined): Pick<Section, "chain" | "sealed"> =>
    s === undefined
      ? {}
      : {
          ...(s.chain ? { chain: [...s.chain] } : {}),
          ...(s.sealed ? { sealed: { ...s.sealed } } : {}),
        };

  // Rename capability is enforced HERE, not in the prompt (docs/13).
  // Prompt instructions are advisory; a model that renames anyway would
  // otherwise produce a document the adapter cannot serialize. This is
  // the same layer that guards the topic-id multiset for the same reason.
  const caps = renameCapability(doc);

  const decideTitle = (
    kind: "section" | "topic",
    origTitle: string,
    origDerived: boolean | undefined,
    candidate: string | undefined,
  ): { title: string; titleDerived: boolean | undefined } => {
    // the outline sanitized whitespace — an echo of the sanitized title
    // is NOT a rename
    const sanitized = origTitle.replace(/\s+/g, " ").trim();
    if (
      options.allowRenames &&
      (kind === "section" ? caps.sections : caps.topics) &&
      candidate &&
      candidate !== origTitle &&
      candidate !== sanitized
    ) {
      counts.renamed++;
      return { title: candidate, titleDerived: false };
    }
    return { title: origTitle, titleDerived: origDerived };
  };

  const subtreeHasExplicit = (t: Topic): boolean => {
    const cid = compactOf.get(t.id);
    if (cid && explicitIds.has(cid)) return true;
    return t.children.some(subtreeHasExplicit);
  };

  const markSubtreePlaced = (t: Topic): void => {
    const cid = compactOf.get(t.id);
    if (cid) placed.add(cid);
    t.children.forEach(markSubtreePlaced);
  };

  /** Original children, minus anything explicitly placed elsewhere. */
  const implicitTopics = (origChildren: Topic[]): Topic[] => {
    const out: Topic[] = [];
    for (const child of origChildren) {
      const cid = compactOf.get(child.id);
      if (cid && (explicitIds.has(cid) || placed.has(cid))) continue;
      if (!subtreeHasExplicit(child)) {
        // fast path: whole subtree rides along (incl. granularity-hidden
        // topics, which have no compact ids)
        markSubtreePlaced(child);
        out.push(cloneTopic(child, { keepIds: true }));
      } else {
        if (cid) placed.add(cid);
        out.push({
          id: child.id,
          title: child.title,
          titleDerived: child.titleDerived,
          path: child.path,
          ...carriedRowFacts(child),
          extras: cloneExtras(child.extras),
          children: implicitTopics(child.children),
        });
      }
    }
    return out;
  };

  /** Build the topic(s) a response node contributes (arrays because a
   *  disallowed new-group hoists its children). */
  const buildTopics = (node: ResultNode): Topic[] => {
    if (!node.id) {
      // new grouping node
      const children = (node.children ?? []).flatMap(buildTopics);
      if (!options.allowNewSections) {
        warnings.push(
          `New group "${node.title ?? "Untitled"}" was disallowed — its topics were kept in place`,
        );
        return children;
      }
      return [
        {
          id: newId(),
          title: node.title?.trim() || "New Section",
          children,
        },
      ];
    }

    const entry = idMap.get(node.id)!;
    placed.add(node.id);

    if (entry.kind === "topic") {
      const orig = entry.topic;
      const children = node.children
        ? node.children.flatMap(buildTopics)
        : implicitTopics(orig.children);
      const named = decideTitle("topic", orig.title, orig.titleDerived, node.title);
      return [
        {
          id: orig.id,
          ...named,
          path: orig.path,
          // A lock is a fact about the source, not the arrangement: drop
          // it and an external link comes back as an ordinary row, which
          // the adapter then writes out as a group. A displacement is a
          // fact about arrangement-VS-source, and dropping it launders a
          // pinned move into an ordinary row.
          ...carriedRowFacts(orig),
          extras: cloneExtras(orig.extras),
          children,
        },
      ];
    }

    // section id nested below root → demote to a topic (a merge)
    const s = entry.section;
    if (isSealed(s)) {
      // A topic has nowhere to carry a seal, so merging a generated card
      // into another would export an empty page list over contents this
      // adapter never read. Refuse the merge and keep the card.
      warnings.push(
        `"${s.title}" could not be merged — its contents are generated elsewhere, so it stays its own card`,
      );
      unmergeableSections.set(s.id, s);
      placed.delete(node.id);
      return [];
    }
    demotedSectionUuids.add(s.id);
    const children = node.children
      ? node.children.flatMap(buildTopics)
      : implicitTopics(s.topics);
    const named = decideTitle("section", s.title, s.titleDerived, node.title);
    return [
      {
        id: s.id, // payload transfer; id spaces are both uuids, stays unique
        ...named,
        path: s.path,
        extras: cloneExtras(s.extras),
        children,
      },
    ];
  };

  // ── Root pass: response roots → sections ──────────────────
  const builtSections: Section[] = [];
  for (const node of nodes) {
    if (!node.id) {
      if (!options.allowNewSections) {
        // skip entirely: its explicit descendants stay unplaced and the
        // recovery pass returns them to their original sections
        warnings.push(
          `New section "${node.title ?? "Untitled"}" was disallowed — its topics stay in their original sections`,
        );
        continue;
      }
      counts.newSections++;
      // A new card adopts the chain of the card above it (docs/13) — the
      // only rule that needs no extra UI and no guessing — and that
      // adoption now obeys the home's declared bearing (docs/22).
      const above = builtSections[builtSections.length - 1]?.chain;
      const home = adoptHome(doc, above, false);
      builtSections.push({
        id: newId(),
        title: node.title?.trim() || "New Section",
        ...(home.chain ? { chain: home.chain } : {}),
        topics: (node.children ?? []).flatMap(buildTopics),
      });
      continue;
    }

    const entry = idMap.get(node.id)!;
    placed.add(node.id);

    if (entry.kind === "section") {
      const s = entry.section;
      const named = decideTitle("section", s.title, s.titleDerived, node.title);
      builtSections.push({
        id: s.id,
        ...named,
        path: s.path,
        ...carried(s),
        extras: cloneExtras(s.extras),
        topics: node.children
          ? node.children.flatMap(buildTopics)
          : implicitTopics(s.topics),
      });
      continue;
    }

    // topic at root
    const orig = entry.topic;
    const children = node.children
      ? node.children.flatMap(buildTopics)
      : implicitTopics(orig.children);
    const named = decideTitle("topic", orig.title, orig.titleDerived, node.title);

    if (children.length === 0) {
      const wrapper = entry.orphanSection;
      // A card minted from a row that lived inside a container needs one
      // too: with no chain the serializer can only write it into the
      // container array itself, where a page path is not a legal entry.
      const inherited = wrapper?.chain ?? builtSections[builtSections.length - 1]?.chain;
      // THE M3 FIX, SCOPED TO A BIRTH. The species-at-birth rule governs
      // what a card is BORN as; a card that already exists is not born
      // here, it is re-listed. So an existing wrapper keeps its species
      // and its home outright — dropping that distinction re-speciated
      // every `$ref` standalone in a real fixture into a group, which is
      // the docs/13 chain-carry lesson one field over.
      const home = wrapper
        ? { ...(wrapper.chain ? { chain: [...wrapper.chain] } : {}), standalone: true }
        : adoptHome(doc, inherited, true);
      const row: Topic = {
        id: orig.id,
        ...named,
        path: orig.path,
        ...carriedRowFacts(orig),
        extras: cloneExtras(orig.extras),
        children: [],
      };
      builtSections.push({
        id: wrapper?.id ?? newId(),
        title: named.title,
        titleDerived: home.standalone ? named.titleDerived : true,
        path: home.standalone ? wrapper?.path : undefined,
        ...carried(wrapper),
        ...(wrapper?.chain === undefined && home.chain ? { chain: home.chain } : {}),
        extras: wrapper ? cloneExtras(wrapper.extras) : undefined,
        // BORN A SECTION where the home bears no standalone: a `groups`
        // array holds group objects, not page paths, so the entry is
        // WRAPPED rather than written as a bare string the format
        // rejects. Titled after its entry, derived.
        ...(home.standalone ? { isOrphan: true as const } : {}),
        topics: [row],
      });
      if (!wrapper) counts.newSections++;
    } else if (isPinned(orig)) {
      // OR-5c — THE ONE BEHAVIORAL DEPARTURE. A pinned parented entry is
      // WRAPPED, never promoted: promotion makes the entry the card's
      // face, and `Section` has no lock, so the pin would be erased and
      // the displacement would become unnameable. The entry stays a ROW
      // inside the born card, the pin survives, and the displacement
      // records exactly as any other cross-parent move.
      //
      // Near-theoretical on shipped corpora (Mintlify pins are
      // leaf-shaped) and built anyway, because the silent alternative
      // fails in the dangerous direction.
      const inherited =
        entry.orphanSection?.chain ?? builtSections[builtSections.length - 1]?.chain;
      const home = adoptHome(doc, inherited, false);
      builtSections.push({
        id: entry.orphanSection?.id ?? newId(),
        title: named.title,
        titleDerived: true,
        ...(home.chain ? { chain: home.chain } : {}),
        topics: [
          {
            id: orig.id,
            ...named,
            path: orig.path,
            ...carriedRowFacts(orig),
            extras: cloneExtras(orig.extras),
            children,
          },
        ],
      });
      if (!entry.orphanSection) counts.newSections++;
    } else {
      // promote via unwrap (the drag-parent-to-canvas semantics): the
      // topic's payload becomes the section; children become its topics
      counts.promoted++;
      promotedUuids.add(orig.id);
      // An unwrapped orphan keeps its own container; a topic promoted out
      // of a section adopts the container of the card above it, the same
      // rule a brand-new card follows.
      const inherited =
        entry.orphanSection?.chain ?? builtSections[builtSections.length - 1]?.chain;
      // A promoted card is a SECTION, so the home is asked about that
      // species (docs/22, Decision 6).
      const home =
        entry.orphanSection?.chain !== undefined
          ? { chain: [...entry.orphanSection.chain] }
          : adoptHome(doc, inherited, false);
      builtSections.push({
        id: entry.orphanSection?.id ?? newId(),
        title: named.title,
        titleDerived: named.titleDerived,
        path: orig.path,
        ...(home.chain ? { chain: home.chain } : {}),
        ...(entry.orphanSection?.sealed
          ? { sealed: { ...entry.orphanSection.sealed } }
          : {}),
        extras: cloneExtras(orig.extras),
        topics: children,
      });
    }
  }

  // ── Empty sections drop ───────────────────────────────────
  const nonEmpty = builtSections.filter((s) => {
    if (s.topics.length > 0) return true;
    // A sealed card's contents are generated elsewhere, so having no rows
    // is its normal state rather than evidence it was emptied. Counting
    // rows cannot tell the two apart, which is exactly why the seal is
    // declared and not derived (docs/13).
    if (isSealed(s)) return true;
    counts.emptyDropped++;
    return false;
  });
  // Do NOT add a third exemption here for "dropping this would empty its
  // container". Retaining one card the proposal wanted gone is repair,
  // and this layer refuses rather than repairs — the same choice the
  // multiset and parentage nets make. The container check is a net
  // below, on the assembled arrangement, where it can see what a
  // per-section exemption cannot: whether ANY card survives in the
  // container, including out-of-scope ones this pass never touched.

  // ── Sealed cards the proposal left out ────────────────────
  // A card with no rows cannot be recovered from its topics, and the
  // multiset net cannot miss what was never a topic — so an omitted
  // sealed card would simply disappear from the export. Restore it.
  const built = new Set(nonEmpty.map((s) => s.id));
  for (const [, entry] of idMap) {
    if (entry.kind !== "section") continue;
    const s = entry.section;
    if (!isSealed(s) || built.has(s.id)) continue;
    nonEmpty.push(cloneSection(s, { keepIds: true }));
    built.add(s.id);
  }
  for (const [id, s] of unmergeableSections) {
    if (built.has(id)) continue;
    nonEmpty.push(cloneSection(s, { keepIds: true }));
    built.add(id);
  }

  // ── Recovery: unplaced topics return home ─────────────────
  const recoveredBySection = new Map<string, Topic[]>();
  for (const [cid, entry] of idMap) {
    if (entry.kind !== "topic") continue;
    if (placed.has(cid)) continue;
    placed.add(cid);
    counts.recovered++;
    const rebuilt: Topic = {
      id: entry.topic.id,
      title: entry.topic.title,
      titleDerived: entry.topic.titleDerived,
      path: entry.topic.path,
      ...carriedRowFacts(entry.topic),
      extras: cloneExtras(entry.topic.extras),
      children: implicitTopics(entry.topic.children),
    };
    const list = recoveredBySection.get(entry.sectionId) ?? [];
    list.push(rebuilt);
    recoveredBySection.set(entry.sectionId, list);
  }
  for (const [sectionId, topics] of recoveredBySection) {
    const home = nonEmpty.find((s) => s.id === sectionId);
    if (home) {
      home.topics.push(...topics);
    } else {
      const origSection = doc.sections.find((s) => s.id === sectionId);
      nonEmpty.push({
        id: sectionId,
        title: origSection?.title ?? "Recovered",
        titleDerived: origSection?.titleDerived,
        path: origSection?.path,
        ...carried(origSection),
        extras: origSection ? cloneExtras(origSection.extras) : undefined,
        isOrphan: origSection?.isOrphan && topics.length === 1 ? true : undefined,
        topics,
      });
    }
  }

  // ── Scope pass-through assembly ───────────────────────────
  const sections: Section[] = [];
  let scopeInserted = false;
  for (const s of doc.sections) {
    const inScope = !scope || scope.has(s.id);
    if (!inScope) {
      sections.push(cloneSection(s, { keepIds: true }));
    } else if (!scopeInserted) {
      sections.push(...nonEmpty);
      scopeInserted = true;
    }
  }
  if (!scopeInserted) sections.push(...nonEmpty);

  const result: TocDocument = {
    id: newId(),
    name: doc.name,
    formatId: doc.formatId,
    extras: cloneExtras(doc.extras),
    // The container REGISTRY, not just each card's chain. Cards carried
    // their own `chain` from the start, so the export survived without
    // this and nothing looked wrong — but the registry is what the
    // guards read: lanes, chips, `cardChainRefused`, and the never-empty
    // net below. A result without it is a tab that silently lost its
    // protections, and reorganizing a reorganize result is the ordinary
    // next gesture.
    ...(doc.containers ? { containers: doc.containers.map((c) => ({ ...c })) } : {}),
    sections,
  };

  // ── Aspirational classification (docs/21, Decision 6) ─────
  //
  // THE ARMS REPLACE THROWS AT THE SAME SITES, in the same order, and
  // AFTER the multiset net below: a document that fails multiset is
  // discarded before any record is written, so a fabricated arrangement
  // can never arrive wearing badges. Imagination never licenses dropped
  // or duplicated topics.
  //
  // THE FIRST CLASSIFIER TO CLAIM A ROW NAMES IT. That is what the
  // order-is-load-bearing comment at the directory net means under
  // classify semantics: both nets would fire on the same demotion, and
  // only one of them names the actual obstacle.
  const aspirational = options.mode === "aspirational";
  const claimed = new Set<string>();

  /** Where every node sat in the RUN'S INPUT document. A top-level card's
   *  container is the document itself — one idea, three shapes. */
  const originOf = new Map<
    string,
    { parentId: string; parentTitle: string; index: number }
  >();
  {
    const walk = (nodes: Topic[], parent: { id: string; title: string }): void => {
      nodes.forEach((t, index) => {
        originOf.set(t.id, { parentId: parent.id, parentTitle: parent.title, index });
        walk(t.children, { id: t.id, title: t.title });
      });
    };
    doc.sections.forEach((sec, index) => {
      originOf.set(sec.id, { parentId: doc.id, parentTitle: doc.name, index });
      walk(sec.topics, { id: sec.id, title: sec.title });
    });
  }

  /**
   * Write one displacement record onto the rebuilt row.
   *
   * NEVER OVERWRITES. A row that arrived already displaced keeps its
   * original origin: it did not come from where it was last, it came
   * from the source, and a record that drifted would launder a pinned
   * move into a shorter one on every subsequent run.
   */
  const classify = (
    result: TocDocument,
    topicId: string,
    kind: DisplacementKind,
  ): void => {
    if (claimed.has(topicId)) return;
    claimed.add(topicId);
    const origin = originOf.get(topicId);
    if (origin === undefined) return; // nothing declared, nothing recorded
    const row = findTopicById(result.sections, topicId);
    if (row === null || row.displaced !== undefined) return;
    row.displaced = {
      parentId: origin.parentId,
      parentTitle: origin.parentTitle,
      index: origin.index,
      kind,
    };
  };

  // ── Layer-5 safety net: topic multiset must be preserved ──
  const uuidsOf = (secs: Section[]): string[] => {
    const out: string[] = [];
    const walk = (t: Topic) => {
      out.push(t.id);
      t.children.forEach(walk);
    };
    for (const s of secs) s.topics.forEach(walk);
    return out;
  };
  const before = uuidsOf(doc.sections).sort();
  const after = [
    ...uuidsOf(result.sections).filter((id) => !demotedSectionUuids.has(id)),
    ...promotedUuids,
  ].sort();
  if (
    before.length !== after.length ||
    before.some((id, i) => id !== after[i]) ||
    new Set(after).size !== after.length
  ) {
    if (import.meta.env?.DEV) {
      console.error("[ai] reconstruction failed the multiset invariant", {
        before: before.length,
        after: after.length,
      });
    }
    throw new AiError("bad-response", multisetDiscardMessage(before, after));
  }

  // ── Layer-5 safety net: parentage, where it cannot change ──
  // Same layer and same reason as the multiset net (docs/14 Decision 3).
  // The prompt is advisory; a model that reparents anyway would produce
  // a document the planner must refuse at save, after the user has
  // already accepted the tab. Sharing the capability with the command
  // executors is what keeps the three answers identical.
  // CAPABILITY ∧ PERMISSION. The capability answers "can this system
  // record a parent change"; the toggle answers "did the user agree to
  // it this time". Either one false refuses, and the layer does not
  // move: it stays the Layer-5 net beside the multiset invariant,
  // because the prompt is advisory and the three answers — drag,
  // planner, validator — have to be identical.
  //
  // The absence test beside this asserts the conjunction on an adapter
  // whose capability is TRUE, so collapsing it back to the capability
  // alone fails the suite. That regression is one `&&` away at all
  // times, which is exactly why it is tested rather than described.
  // ── Layer-5 safety net: LOCKED rows are pinned ────────────
  //
  // `Topic.lock`'s docblock is the contract: locked nodes "cannot be
  // dragged, deleted or renamed, and planners never rewrite their
  // lines". The drag has enforced it since docs/12 (`topicDrag.ts`
  // consults `anyTopicLocked` before starting a gesture). Nothing in
  // `commands/`, `guards.ts` or here did — so the canvas refused what a
  // prompt could ask for and get. Two entry points, one rule, one
  // enforcer: the sidebar hole, found by pinning rather than by
  // reading.
  //
  // PARENT CHANGE ONLY, and the narrower scope is deliberate. Refusing a
  // locked row's index among its own siblings would refuse nearly every
  // proposal on a corpus with scattered `reference` locks — godot has 85
  // duplicate references — for a claim the lock does not make. What the
  // source pins is WHERE the node belongs, not who it sits beside.
  {
    const placement = (secs: Section[]): Map<string, string> => {
      const out = new Map<string, string>();
      const walk = (nodes: Topic[], parent: string) => {
        for (const t of nodes) {
          out.set(t.id, parent);
          walk(t.children, t.id);
        }
      };
      for (const s of secs) walk(s.topics, s.id);
      return out;
    };
    const lockedTitles = new Map<string, string>();
    const collectLocked = (nodes: Topic[]) => {
      for (const t of nodes) {
        if (t.lock !== undefined) lockedTitles.set(t.id, t.title);
        collectLocked(t.children);
      }
    };
    for (const s of doc.sections) collectLocked(s.topics);
    if (lockedTitles.size > 0) {
      const was = placement(doc.sections);
      const now = placement(result.sections);
      const moved = [...lockedTitles.keys()].filter(
        (id) => now.has(id) && was.get(id) !== now.get(id),
      );
      if (moved.length > 0 && aspirational) {
        // CLASSIFY, NOT DISCARD. The proposal opens; every displaced
        // pinned row carries a record, and the badge, the checklist and
        // the projection read it from there.
        for (const id of moved) classify(result, id, "pin");
      } else if (moved.length > 0) {
        const named = moved
          .map((id) => `"${lockedTitles.get(id)!}"`)
          .slice(0, 3)
          .join(", ");
        const subject = moved.length === 1 ? "A row is" : `${moved.length} rows are`;
        const them = moved.length === 1 ? "it" : "them";
        const head = `${subject} pinned in place by the source and cannot change section — ${named}${moved.length > 3 ? " and others" : ""}.`;

        // THE COPY IS A CLAIM, and this one changed because the world
        // did. It used to end "try an instruction that leaves the
        // pinned rows where they are", which was honest while the model
        // had never been told — and became a sentence blaming the user
        // for the model's non-compliance the moment the request started
        // marking every pinned row (docs/10, 2026-08-19).
        //
        // Which sentence is true depends on whether THIS request could
        // mark the rows, so it is asked rather than assumed. A pinned
        // row inside a collapsed subtree has no compact id, so nothing
        // could name it — and telling that user the model ignored a
        // mark they never sent would be the same lie in the other
        // direction. Both branches are asserted.
        const marked = pinnedRowCount(buildConstraints(doc, options, idMap));
        throw new AiError(
          "bad-response",
          marked > 0
            ? `${head} The request marks every pinned row, and this answer moved ${them} anyway — the result was discarded and nothing changed. Running again often works, since the same request can produce a different answer.`
            : `${head} ${moved.length === 1 ? "It sits" : "They sit"} inside a collapsed subtree, so the request could not mark ${them} individually. The result was discarded; use a finer granularity so every row can be marked, or reduce the scope.`,
        );
      }
    }
  }

  // ── Layer-5 safety net: a DEMOTED SECTION is a directory move ──
  //
  // BEFORE the parentage net, and the order is load-bearing for the
  // same reason `guards.ts` checks `subsection` before `path-collision`:
  // both would fire, and only one names the actual obstacle.
  //
  // The parentage net cannot see this. It keys its map by TOPIC id
  // (`walk(s.topics, s.id)`), so a section id is only ever a VALUE.
  // Demoting a section makes that id a KEY in `now`, but `was.has(id)`
  // is false — and the filter drops it. A whole directory changed
  // parents and nothing objected. Pinned by test before it was fixed.
  //
  // Unconditional on a file-move adapter, NOT gated on the toggle.
  //
  //   CONSENT GATES CONSEQUENCES; IT CANNOT LEGALIZE REFUSALS.
  //
  // `allowFileMoves` exists so a user can accept a consequence — files
  // relocating on disk — that they might not want this run. A directory
  // move is not a consequence anyone can accept, because no version of
  // this app performs one (docs/18 defers it with its charter parked).
  // Routing it through the toggle would offer a permission that buys
  // nothing, which is how a checkbox starts meaning "try anyway". That matches the canvas exactly, where `topicMoveRefusal`
  // answers `subsection` for an `_index.md` row whatever the toggle
  // says — one truth, three surfaces.
  if (movesFilesOnReparent(doc)) {
    const wasSection = new Set(doc.sections.map((s) => s.id));
    const nowTopic = new Set<string>();
    const collect = (nodes: Topic[]): void => {
      for (const t of nodes) {
        nowTopic.add(t.id);
        collect(t.children);
      }
    };
    for (const s of result.sections) collect(s.topics);
    const demoted = [...wasSection].filter((id) => nowTopic.has(id));
    if (demoted.length > 0 && aspirational) {
      // ONE OBSTACLE, NOT N. A card demoted whole is a directory move —
      // recorded as that rather than as one displacement per row inside
      // it, which is the same reason this net runs before the parentage
      // one.
      for (const id of demoted) classify(result, id, "directory-move");
    } else if (demoted.length > 0) {
      if (import.meta.env?.DEV) {
        console.error("[ai] reconstruction nested a section, which moves a directory", {
          count: demoted.length,
        });
      }
      const count = demoted.length === 1 ? "one section" : `${demoted.length} sections`;
      throw new AiError(
        "bad-response",
        `Putting one section inside another would move its whole folder, which this version does not do — and ${count} in the proposal did. The result was discarded; to relocate a section's pages, ask for them to be moved individually instead.`,
      );
    }
  }

  // ── Layer-5 safety net: A BLOCK IS NOT AN ENTRY ──────────
  //
  // The directory net above gates on `movesFilesOnReparent`, and for
  // Sphinx that is FALSE — correctly, since nesting a Sphinx card moves
  // no directory. But the CONSEQUENCE is unguarded and it is a different
  // one: where the nav is a list of TARGETS, a card has no page of its
  // own, so a card demoted into another card leaves no line to write.
  //
  // Keyed on a DECLARED fact about the format, never on an adapter id: a
  // hardcoded list at the consent layer fails silently in the dangerous
  // direction, which docs/16 paid for once already.
  if (nodesNeedTargets(doc)) {
    const wasSection = new Map(doc.sections.map((s) => [s.id, s]));
    const nested = new Set<string>();
    const collect = (nodes: Topic[]): void => {
      for (const t of nodes) {
        nested.add(t.id);
        collect(t.children);
      }
    };
    for (const s of result.sections) collect(s.topics);
    // A demoted card with a PATH is still writable — the entry names its
    // page. Only the pageless ones have nothing to say.
    const pageless = [...wasSection]
      .filter(([id]) => nested.has(id))
      .filter(([, s]) => s.path === undefined);
    if (pageless.length > 0 && aspirational) {
      for (const [id] of pageless) classify(result, id, "block-entry");
    } else if (pageless.length > 0) {
      if (import.meta.env?.DEV) {
        console.error("[ai] reconstruction nested a card that has no page", {
          count: pageless.length,
        });
      }
      const count = pageless.length === 1 ? "one card" : `${pageless.length} cards`;
      throw new AiError(
        "bad-response",
        `A card here is a group in the navigation file, not a page — so it cannot be listed inside another card, and ${count} in the proposal was. The result was discarded; to move a card's contents somewhere else, ask for its pages to be moved individually instead.`,
      );
    }
  }

  if (!fileMovesAllowed(doc, options)) {
    const parents = (secs: Section[]): Map<string, string> => {
      const out = new Map<string, string>();
      const walk = (nodes: Topic[], parent: string) => {
        for (const t of nodes) {
          out.set(t.id, parent);
          walk(t.children, t.id);
        }
      };
      for (const s of secs) walk(s.topics, s.id);
      return out;
    };
    const was = parents(doc.sections);
    const now = parents(result.sections);
    const moved = [...now].filter(
      ([id, parent]) => was.has(id) && was.get(id) !== parent,
    );
    if (moved.length > 0 && aspirational) {
      // TWO REFUSALS WEARING ONE SHAPE, and the R4 control is why they
      // must not share a record kind. A permission-off move is
      // consent-class: the app WILL write it if the user agrees at
      // apply. A capability-false move is refusal-class: there is
      // nothing to agree to, and a control offering to write it would
      // be lying.
      const kind: DisplacementKind = reparentCapability(doc)
        ? "consent"
        : "reparent-unsupported";
      for (const [id] of moved) classify(result, id, kind);
    } else if (moved.length > 0) {
      if (import.meta.env?.DEV) {
        console.error("[ai] reconstruction reparented on a system that cannot", {
          count: moved.length,
        });
      }
      // Which of the two refused decides the SENTENCE, though not the
      // outcome: telling a user their system cannot do this, when in
      // fact they left a checkbox off, sends them to look for a
      // capability gap that is not there.
      const count = moved.length === 1 ? "one topic" : `${moved.length} topics`;
      throw new AiError(
        "bad-response",
        reparentCapability(doc) && movesFilesOnReparent(doc)
          ? `Moving pages between sections was left off for this run, and ${count} in the proposal changed section. The result was discarded; turn on "Allow file moves" and try again, or ask for an instruction that reorders within each group.`
          : `This system stores a page's place in the file tree, so a page cannot change parents without moving files — and ${count} in the proposal did. The result was discarded; try an instruction that reorders within each group instead.`,
      );
    }
  }

  // ── Layer-5 safety net: never-empty containers ────────────
  // Same layer and same reason as the multiset and parentage nets. The
  // outline cannot name a container, so the model cannot be blamed for
  // draining one — but the export would be schema-invalid and silent
  // (an unfilled card slot leaves no hole), which is the failure mode
  // this project refuses on principle.
  // R5: VIOLABLE IN AN ASPIRATIONAL PROPOSAL. "This tab should not
  // exist" is a legitimate aspiration whose remedy is a human edit to
  // the nav file, and the checklist names that edit. Nothing is recorded
  // on a row, because the fact is about the CONTAINER — the ledger
  // derives it (`emptiedNeverEmpty`), so it survives undo for free.
  // The display cost (a card-less lane) was accepted at gate: a
  // container that vanished from the canvas while the file still
  // required it would be the canvas lying about the file.
  const emptied = aspirational ? [] : emptiedContainers(doc, result.sections);
  if (emptied.length > 0) {
    const named = emptied.map((c) => containerPhrase(c) ?? c.label).join(", ");
    const noun = emptied[0]?.kind ?? "container";
    if (import.meta.env?.DEV) {
      console.error("[ai] reconstruction emptied a never-empty container", {
        chainKeys: emptied.map((c) => c.chainKey),
      });
    }
    throw new AiError(
      "bad-response",
      `This proposal would leave ${named} with no sections, and this format requires at least one. The result was discarded — try an instruction that keeps at least one section in every ${noun}.`,
    );
  }

  // ── Summary ───────────────────────────────────────────────
  const mkdocsWarn = mkdocsPathWarnings(doc, result);
  if (mkdocsWarn) warnings.push(mkdocsWarn);
  const chainWarn = chainRearrangeWarning(nonEmpty, doc.sections);
  if (chainWarn) warnings.push(chainWarn);
  const statsBefore = documentStats(doc);
  const statsAfter = documentStats(result);
  const summary: ReorganizeSummary = {
    scopedSections: scope ? scope.size : doc.sections.length,
    totalSections: doc.sections.length,
    sectionsBefore: doc.sections.length,
    sectionsAfter: result.sections.length,
    maxDepthBefore: statsBefore.maxDepth,
    maxDepthAfter: statsAfter.maxDepth,
    moved: countMoved(doc, result, promotedUuids),
    renamed: counts.renamed,
    newSections: counts.newSections,
    promoted: counts.promoted,
    demoted: demotedSectionUuids.size,
    recovered: counts.recovered,
    emptySectionsDropped: counts.emptyDropped,
    // Counted from the RECORDS this run wrote, so the split and the
    // badges cannot disagree — they are the same set read twice.
    // `moved` counts topics only, so a demoted card is added here: its
    // id was never in topic space before, which is exactly why the
    // parentage net cannot see it either.
    aspirational: (() => {
      const written = [...claimed].flatMap((id) => {
        const row = findTopicById(result.sections, id);
        return row?.displaced ? [row.displaced.kind] : [];
      });
      const demotions = written.filter(
        (k) => k === "directory-move" || k === "block-entry",
      ).length;
      // THE STRUCTURE REPORT, read on the RESULT against the source the
      // document carries. Keyed on (document, source, card order) and on
      // nothing about the run, which is why a grounded result carries it
      // too — the split sentence has to be true of both modes.
      const remainders = structureReport(
        result,
        filesOf(result),
        result.sections.map((s) => s.id),
      );
      const structural = {
        createdCards: remainders.filter((r) => r.kind === "creation").length,
        cardOrderChanged: remainders.some((r) => r.kind === "card-order"),
        frozenBlocks: remainders.filter((r) => r.kind === "row-order").length,
      };
      return {
        needsHand: written.filter((k) => k !== "consent").length,
        needsConsent: written.filter((k) => k === "consent").length,
        moves: countMoved(doc, result, promotedUuids) + demotions,
        // ABSENT, NEVER ZEROED, WHERE NOTHING WAS MEASURED. A format tab
        // keeps no snapshot, so there is no source to compare against
        // and "0 created cards" would be a fact nobody established —
        // not measured is not zero, applied to a summary field.
        ...(Object.keys(filesOf(result)).length > 0 ? { structural } : {}),
      };
    })(),
    warnings,
  };

  return { doc: result, summary };
}

/** Topics whose parent changed (section or parent topic). */
function countMoved(
  before: TocDocument,
  after: TocDocument,
  promoted: ReadonlySet<string>,
): number {
  const parentKey = (doc: TocDocument): Map<string, string> => {
    const map = new Map<string, string>();
    for (const s of doc.sections) {
      const walk = (t: Topic, parent: string) => {
        map.set(t.id, parent);
        t.children.forEach((c) => walk(c, t.id));
      };
      s.topics.forEach((t) => walk(t, s.id));
    }
    return map;
  };
  const a = parentKey(before);
  const b = parentKey(after);
  let moved = 0;
  for (const [id, parent] of b) {
    const prev = a.get(id);
    if (prev !== undefined && prev !== parent && !promoted.has(id)) moved++;
  }
  return moved;
}

/** MkDocs export drops a page's own path once it gains children. */
/**
 * A card arrangement the serializer cannot honour (docs/13). A proposal
 * cannot name a container — chains are invisible to the outline — but it
 * can rearrange cards across them, and the serializer partitions by
 * container and takes the order OF containers from the file. Either
 * rearrangement exports as a partial no-op, so say so rather than let it
 * appear to have worked.
 *
 * Two shapes, both invisible to the other's check: cards INTERLEAVED
 * (a container's run broken up) and containers REORDERED (each run
 * intact, but in a different order than the file has them).
 *
 * Reads the sections the model itself arranged, NOT the assembled
 * document: scope pass-through hoists the whole in-scope block to one
 * position, which can split a container the proposal never touched.
 * Inert for every format whose cards are top level.
 */
function chainRearrangeWarning(
  proposed: readonly Section[],
  before: readonly Section[],
): string | null {
  const runsOf = (sections: readonly Section[]): string[] => {
    const runs: string[] = [];
    for (const section of sections) {
      const key = chainKey(section);
      if (runs[runs.length - 1] !== key) runs.push(key);
    }
    return runs;
  };
  const runs = runsOf(proposed);
  const containers = new Set(runs);
  if (containers.size < 2) return null;

  const interleaved = runs.length !== containers.size;
  // Container order, as each first appears — in the proposal, and in the
  // document it came from, restricted to the containers it mentions.
  const sourceOrder = runsOf(before).filter((key) => containers.has(key));
  const proposedOrder = [...new Set(runs)];
  const reordered = proposedOrder.some((key, i) => sourceOrder[i] !== key);
  if (!interleaved && !reordered) return null;

  const labelFor = (key: string) =>
    proposed.find((s) => chainKey(s) === key) ?? before.find((s) => chainKey(s) === key);
  const named = [...containers]
    .map((key) => {
      const section = labelFor(key);
      return section ? (chainLabel(section) ?? "the top level") : "the top level";
    })
    .join(", ");
  return (
    `Cards were rearranged across navigation containers (${named}). A card ` +
    "cannot change container and the containers keep the order the file gives " +
    "them, so that part of the arrangement will not appear on export"
  );
}

function mkdocsPathWarnings(before: TocDocument, after: TocDocument): string | null {
  if (after.formatId !== "mkdocs") return null;
  const beforeChildless = new Set<string>();
  for (const s of before.sections) {
    const walk = (t: Topic) => {
      if (t.children.length === 0 && t.path) beforeChildless.add(t.id);
      t.children.forEach(walk);
    };
    s.topics.forEach(walk);
  }
  let count = 0;
  for (const s of after.sections) {
    const walk = (t: Topic) => {
      if (beforeChildless.has(t.id) && t.children.length > 0) count++;
      t.children.forEach(walk);
    };
    s.topics.forEach(walk);
  }
  if (count === 0) return null;
  return `${count} page${count === 1 ? "" : "s"} would lose their link on MkDocs export (a page with sub-items keeps only its children)`;
}

/** Total topics in a section list (used by the dialog stat line). */
export function topicTotal(sections: Section[]): number {
  return sections.reduce((sum, s) => sum + countTopics(s.topics).total, 0);
}
