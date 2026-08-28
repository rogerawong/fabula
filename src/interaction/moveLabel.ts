/**
 * moveLabel.ts — what a reparent drag SAYS (docs/16 consent surface).
 *
 * Consent is in the gesture. There are no modals, and there is no seam
 * menu: a reparent target is a discrete card or row, so the pointer is
 * over one parent or another and no release-time question arises.
 * (Mintlify's seams are positions BETWEEN adjacent chains, where two
 * readings are equally live — a different problem.)
 *
 * Pure, and separate from the drag handler, because vitest runs in node:
 * a label the suite cannot read is a label only e2e can check.
 */

import { placementOf, type TopicMoveRefusal } from "@/commands/guards";
import type { WantedSpecies } from "@/model/birth";
import { containerFor, containersInOrder } from "@/model/containers";
import { chainPathKey } from "@/model/selectors";
import { inboundCount, type LinkIndex } from "@/collections/linkIndex";
import type { TocDocument } from "@/model/types";

/**
 * The refusal sentences, in the app's voice.
 *
 * Keyed by the discriminant `guards.ts` produces, so the drag can never
 * name a reason the executor would not give.
 *
 * TWO SENTENCES WHERE A PATH EXISTS, one where it does not (docs/18).
 * A refusal that only states a wall leaves the user to discover for
 * themselves that the same restructure is reachable another way — and
 * for section moves it is: the survey found that real reorganizations
 * REDISTRIBUTE pages rather than relocate directories (kubernetes/website
 * has had SIX in-TOC directory reparents in eight years and none since
 * 2019, while its `setup/` 15→5 restructure scored zero directory moves
 * because every page moved individually). So the copy teaches the
 * gesture the corpus actually performs, which v2 already ships.
 *
 * The leaf bundle gets no such sentence, deliberately: there is no
 * redistribution that saves a bundle's resources, so offering a path
 * would be inventing one.
 */
export function refusalSentence(
  reason: TopicMoveRefusal,
  /**
   * What the DROP was, for the one refusal whose sentence depends on it
   * (docs/22, Decision 2). Absent means the sentence degrades to the
   * general fact rather than acquiring a hole — a guard consumes
   * declared inputs, applied to copy.
   *
   * A CONTEXT AND NOT A SECOND DISCRIMINANT: `guards.ts` still owns the
   * rule, this still owns the voice, and what crosses between them is
   * the reason plus the values the reason's own sentence names.
   */
  ctx?: RefusalContext,
): string {
  switch (reason) {
    case "capability":
      return "This page's place is its folder, so the move would rename the file. Not in this version.";
    case "leaf-bundle":
      return "This page is a bundle: its folder holds images and files this app never read, so moving the page alone would strand them. There's no way around this one — its resource files would be left behind.";
    case "path-collision":
      return "A page with this filename is already there. Two pages can't share a path.";
    case "no-nav-list":
      // The fact, then the way round it — two sentences where a path
      // exists. Here one does, and it is one gesture away.
      return "This page doesn't have a list of its own, so there's nothing to add this to. Drop it on the card instead, or on a page that already lists other pages.";
    case "unhoused-species":
      // TWO SENTENCES WHERE A PATH EXISTS, and here one does: the lanes
      // that DO bear cards are named, in the document's own labels, so
      // the user can act on this now rather than learning a rule.
      return unhousedBirthSentence(ctx);
    case "subsection":
      // The v1 refusal's voice — states the fact, then the limit, and
      // does not send the user off to rename anything. The second
      // sentence is what deferral owes: the same truth the AI validator
      // gives when it refuses a nested section, in the same words.
      return "This row is a section — moving it would move its whole folder, which this version doesn't do. To relocate its pages: select them and drag them together; the emptied section stays behind for cleanup.";
  }
}

export interface MoveLabel {
  /** "→ moves file to tasks/configure-pod-container/" */
  destination: string;
  /**
   * "12 inbound links, as of import", or NULL when nothing was measured.
   *
   * Null renders as an ABSENT LINE, never as "0 inbound links". An
   * adapter without a harvest is correct, not broken, and a missing
   * measurement shown as zero is a number lying by omission.
   */
  inbound: string | null;
}

/** Where a section's rows live on disk. */
function dirOfSection(doc: TocDocument, sectionId: string): string | null {
  const section = doc.sections.find((s) => s.id === sectionId);
  if (!section?.path) return null;
  const i = section.path.lastIndexOf("/");
  return i < 0 ? "" : section.path.slice(0, i);
}

function pathOfTopic(doc: TocDocument, topicId: string): string | undefined {
  for (const section of doc.sections) {
    let found: string | undefined;
    const walk = (nodes: typeof section.topics): void => {
      for (const node of nodes) {
        if (node.id === topicId) found = node.path;
        else walk(node.children);
        if (found !== undefined) return;
      }
    };
    walk(section.topics);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * What this drop will do, in the target system's own terms, or null when
 * it moves no file (a reorder, or a nav-owned format).
 *
 * The order is the one the user cares about: WHERE first, then what it
 * costs. The count is stamped "as of import" from the index's own
 * provenance, because bodies change after import and a count presented
 * as current would claim more than the evidence supports.
 */
export function moveLabel(
  doc: TocDocument,
  topicIds: readonly string[],
  to: { sectionId: string; parentTopicId: string | null },
): MoveLabel | null {
  const moving = topicIds.filter((id) => {
    const at = placementOf(doc, id);
    return (
      at !== null &&
      (at.sectionId !== to.sectionId || at.parentTopicId !== to.parentTopicId)
    );
  });
  if (moving.length === 0) return null;

  const dir = dirOfSection(doc, to.sectionId);
  if (dir === null) return null;

  const index = (doc.extras as { linkIndex?: LinkIndex } | undefined)?.linkIndex;
  let total = 0;
  let measured = false;
  for (const id of moving) {
    const path = pathOfTopic(doc, id);
    if (path === undefined) continue;
    const n = inboundCount(index, path);
    if (n === null) continue;
    measured = true;
    total += n;
  }

  return {
    destination: `→ moves ${moving.length === 1 ? "file" : `${moving.length} files`} to ${dir}/`,
    // Absent, not zero, when unmeasured. Zero when measured AND zero is
    // a real answer and says so.
    inbound: measured
      ? `${total} inbound link${total === 1 ? "" : "s"}, as of import`
      : null,
  };
}

/** What a refused BIRTH was trying to make, and where. */
export interface RefusalContext {
  doc: TocDocument;
  /** The home the drop named; empty is the root. */
  chain: readonly string[];
  /** The species the entry would have been born as. */
  wants: WantedSpecies;
}

/**
 * The unhoused-birth sentence, ONE PRODUCER (docs/22, Decision 2).
 *
 * TWO REGIMES, ONE SHAPE. A home that bears NEITHER species and a home
 * that bears only the other one are the same problem to the person
 * holding the pointer — "not here, and here is where" — so they get one
 * sentence with the fact swapped, rather than two sentences somebody has
 * to keep in step.
 *
 * NAMES THE LANES FROM THE DOCUMENT'S OWN LABELS, never from a format's
 * vocabulary: this file may not import an adapter (the fence in
 * `aspirationalFences.test.ts` says so on the construction), and it does
 * not need to — `ContainerDescriptor` carries the label and the noun,
 * declared at parse for exactly this kind of use.
 *
 * NO HOME EXISTS ⇒ NO "DROP IT SOMEWHERE" ADVICE. Telling someone to
 * drag a card into a container that does not exist is the unactionable
 * refusal this design keeps refusing to ship; the by-hand remedy and the
 * app's own boundary go in its place, in docs/13's recorded-absence
 * words.
 */
function unhousedBirthSentence(ctx: RefusalContext | undefined): string {
  if (!ctx) {
    return "This card has nowhere to live in this navigation — no container here holds one.";
  }
  const home = containerFor(ctx.doc, chainPathKey(ctx.chain));
  const wantsOrphan = ctx.wants === "standalone";
  const homes = containersInOrder(ctx.doc)
    .filter(
      (c) =>
        c.chainKey !== home?.chainKey &&
        (wantsOrphan ? c.accepts.orphans : c.accepts.sections),
    )
    .map((c) => `"${c.label}"`);

  // WHERE the card is, said in the terms of the place it landed. A drop
  // at the top level and a drop inside a lane that refuses this species
  // are genuinely different places, and one sentence for both would be
  // false about one of them.
  const where =
    home === undefined || home.chainKey === ""
      ? "this navigation's top level"
      : `"${home.label}"`;
  const holds =
    home === undefined
      ? "no cards"
      : home.accepts.sections
        ? "sections only"
        : home.accepts.orphans
          ? "standalone entries only"
          : "containers only";

  const remedy =
    homes.length > 0
      ? `Drop it inside ${homes.slice(0, 2).join(" or ")}${homes.length > 2 ? " (or another)" : ""} instead.`
      : "Add a container for it in the navigation file yourself — the app never edits containers.";
  return `${where} holds ${holds}. ${remedy}`;
}
