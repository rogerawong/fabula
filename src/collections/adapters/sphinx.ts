/**
 * sphinx.ts — Sphinx `toctree` adapter (docs/12 read, docs/19 write).
 *
 * Sphinx is a third structural shape: the nav is EXPLICIT (hand-written
 * `.. toctree::` directives, like a format adapter) but DISTRIBUTED over
 * dozens of files (like a collection). There is no nav file — the sidebar
 * is the global toctree, assembled by walking directives from the root
 * document, with each entry labelled by its TARGET document's title.
 *
 * Phase 1 omitted `planChanges` entirely, and its ABSENCE was the
 * read-only capability — `supportsWriteBack` reads the method's presence,
 * so there was never a flag to keep in step. docs/19 defines it, and
 * write-back is MOVES-ONLY: an entry line relocates between blocks and
 * possibly between files, and nothing else is rewritten. `supportsRename`
 * stays false because a rename still has no serialization here.
 *
 * Two things make the ingest unusual, both forced by scale — the
 * reference corpus is 1594 reachable documents / 32 MB:
 *   - `expand` walks the toctree GRAPH instead of the folder, so only
 *     documents the nav actually reaches are read at all;
 *   - what is READ is far larger than what is KEPT. Every reachable
 *     document is read IN FULL to take its title, then discarded; the
 *     kept snapshot is the nav hosts, conf.py and the title sidecar —
 *     63 files / ~113 KB for godot-docs, against 517 files / 5.4 MB
 *     read. Windowed reads were tried and removed: a window is really a
 *     host classifier, and a miss loses a subtree silently.
 */

import { deriveTitleFromPath } from "@/model/naming";
import { newId } from "@/model/id";
import type { ImportOccurrence, NodeRef } from "../importEvidence";
import type { Section, TocDocument, Topic } from "@/model/types";
import {
  documentTitle,
  DEFAULT_SOURCE_SUFFIXES,
  resolveDocname,
  isGlobbed,
  scanToctrees,
  type ToctreeBlock,
  type ToctreeEntry,
} from "../rst";
import { readTitles, withTitles } from "../titleSidecar";
import { emitRegion, navTailOf } from "../navTail";
import type {
  CollectionAdapter,
  CollectionParseResult,
  CollectionPlanResult,
  EntryMove,
  CollectionWarning,
  FileChange,
  FilesSnapshot,
} from "../types";
import type { SectionId } from "@/model/types";
import type {
  CardOrderRemainder,
  CreationRemainder,
  RowOrderRemainder,
  StructuralRemainder,
} from "@/model/remainders";

/**
 * An entry whose target host declares at least this many toctree entries
 * collapses to one atomic locked card, and the walk does not descend into
 * it. Sized from the reference corpus, where the gap is a canyon rather
 * than a gradient: `classes/index.rst` declares 1163 entries across six
 * blocks, and the next-largest host in the whole project declares 47.
 * Anything in the 150–500 range separates them; 250 sits clear of both.
 *
 * The signal is computed from the HOST's own blocks during expand, so it
 * costs no child reads — which is the point, since the subtree it fires
 * on is 1079 documents and 26.3 MB.
 */
export const ATOMIC_ENTRY_THRESHOLD = 250;

/**
 * Where a CHOSEN root is remembered — an import parameter, carried in
 * the snapshot rather than in config or in settings.
 *
 * Session-local means "not written back to `conf.py`, and not remembered
 * for the next import": a deviation from what the repository declares
 * must not self-perpetuate. It does NOT mean forgotten immediately —
 * `simulatePlan` re-parses `extras.files`, so a choice the snapshot
 * could not recall would re-parse under the declared (absent) root and
 * compare the edited document against an empty one.
 *
 * Never named by a plan; asserted.
 */
export const ROOT_KEY = ".toc-fable-root";

/** Cheap pre-filter before paying for a full directive scan. */
const HAS_TOCTREE = /^\s*\.\.\s+toctree::\s*$/m;
const CONF_RE = /(^|\/)conf\.py$/;
/** A MyST fenced directive: ```{toctree}. Never `.md` presence alone. */
const MYST_FENCE = /^\s*```+\s*\{toctree\}/m;
/** `.. include:: path` — angle-bracket forms are docutils' own data files. */
const INCLUDE_RE = /^\s*\.\.\s+include::\s+([^<\n][^\n]*)$/gm;

interface SphinxConfig {
  /** What the import reads from — the chosen root if there is one. */
  rootDoc: string;
  /** What `conf.py` says, which a substitution must still name. */
  declaredRoot: string;
  /** Set only when a chosen root REPLACED the declared one. */
  chosenRoot?: string;
  /** Keys present in conf.py whose SHAPE this reader could not parse. */
  unreadable: string[];
  /** Where conf.py was found, for a receipt. */
  confPath?: string;
  /** The FIRST configured suffix — what a docname is written back as. */
  suffix: string;
  /** Every configured suffix, in declaration order, for stripping. */
  suffixes: readonly string[];
}

/**
 * Read `conf.py` with regexes — never execute it. Sphinx's own defaults
 * apply when a key is absent (`index`, `.rst`); godot-docs declares both.
 *
 * `source_suffix` has THREE legal shapes and the scalar regex saw one:
 *
 *     source_suffix = ".rst"                         # str
 *     source_suffix = [".rst", ".txt"]               # list
 *     source_suffix = {".rst": "restructuredtext"}   # dict
 *
 * The kernel declares the dict form, so the scalar-only read fell
 * through to the default — which happened to be right, and would not be
 * for a MyST project declaring `.md` there. Reading all three is what
 * makes the fallback a real default rather than a coincidence.
 */
function readConfig(files: FilesSnapshot): SphinxConfig {
  const confPath = Object.keys(files).find((p) => CONF_RE.test(p));
  const conf = confPath === undefined ? "" : stripComments(files[confPath]!);
  // Chained assignment is idiomatic where a project supports two Sphinx
  // majors — ansible writes `root_doc = master_doc = 'index'`. Allowing
  // further `name =` hops before the literal is what reads it.
  const root = /^\s*(?:root_doc|master_doc)\s*=\s*(?:\w+\s*=\s*)*["']([^"']+)["']/m.exec(
    conf,
  );
  const suffixes = readSuffixes(conf);
  // CORRECT BY COINCIDENCE IS STILL UNRECOGNISED. A key that is present
  // but whose shape we could not read falls back to Sphinx's default —
  // which was right for both corpora that hit it, and that is exactly
  // why it has to be said out loud. The kernel's dict `source_suffix`
  // and ansible's chained `root_doc` both defaulted to the correct
  // value, so nothing looked wrong until a project defaulted to the
  // wrong one.
  const unreadable: string[] = [];
  if (/^\s*(?:root_doc|master_doc)\s*=/m.test(conf) && !root) unreadable.push("root_doc");
  if (/^\s*source_suffix\s*=/m.test(conf) && suffixes === DEFAULT_SOURCE_SUFFIXES) {
    unreadable.push("source_suffix");
  }
  const declared = root?.[1] ?? "index";
  const chosen = files[ROOT_KEY];
  return {
    declaredRoot: declared,
    ...(chosen !== undefined && chosen !== declared ? { chosenRoot: chosen } : {}),
    rootDoc: chosen ?? declared,
    suffix: suffixes[0]!,
    suffixes,
    unreadable,
    confPath,
  };
}

/** Drop `#` comments, honouring quotes so a `#` inside a string stays. */
function stripComments(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      let quote: string | null = null;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        if (quote) {
          if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (ch === "#") {
          return line.slice(0, i);
        }
      }
      return line;
    })
    .join("\n");
}

/**
 * Every `source_suffix` key, in declaration order; Sphinx's default when
 * absent.
 *
 * REGEX-SHAPED, NOT PARSE-SHAPED, and the boundary is worth naming
 * because it moved once already. This reads quoted dotted tokens out of
 * the declaration rather than evaluating Python — `conf.py` is never
 * executed (docs/12), so some heuristic is unavoidable. What it must not
 * do is fail in the dangerous direction, and it did: with
 * `source_suffix = SUFFIXES  # e.g. ".md"` the comment's token was read
 * as THE suffix, the root document was looked for at `contents.md`,
 * nothing was found, and the import produced an EMPTY DOCUMENT with no
 * warning. Comments are stripped first for that reason.
 *
 * What remains unsupported, deliberately and visibly: a suffix computed
 * at runtime, or one built by string concatenation. Both fall through to
 * Sphinx's own default, which is the safe direction — a wrong-but-common
 * `.rst` shows the corpus, while a wrong-and-invented suffix shows
 * nothing.
 */
function readSuffixes(conf: string): readonly string[] {
  // Scanned rather than regexed to the end, because `$` under /m matches
  // every LINE end: the non-greedy capture stopped at `source_suffix = {`
  // and read the kernel's multiline dict as an empty value. It fell back
  // to `.rst`, which is what the kernel declares first, so nothing looked
  // wrong — the fixture for this case passed on the same coincidence.
  const at = /^[ \t]*source_suffix[ \t]*=[ \t]*/m.exec(conf);
  if (!at) return DEFAULT_SOURCE_SUFFIXES;
  const from = at.index + at[0].length;
  const blank = /\n[ \t]*\n/.exec(conf.slice(from));
  const value = blank ? conf.slice(from, from + blank.index) : conf.slice(from);
  const decl: [string, string] = ["", value];
  // Quoted tokens in order. For the dict form this collects keys AND
  // values; a value like "restructuredtext" carries no dot, and every
  // real suffix does, which is what separates them without parsing
  // Python. Order is preserved because the write-back suffix is the
  // first one declared.
  const found = [...stripComments(decl[1]!).matchAll(/["']([^"']+)["']/g)]
    .map((m) => m[1]!)
    .filter((tok) => tok.startsWith("."));
  return found.length > 0 ? found : DEFAULT_SOURCE_SUFFIXES;
}

/**
 * Where a docname WOULD BE WRITTEN: the FIRST configured suffix, which
 * is what Sphinx itself would create.
 */
const docPath = (docname: string, cfg: SphinxConfig) => docname + cfg.suffix;

/**
 * Where a docname IS, trying every configured suffix in declaration
 * order — the lookup question, which is not the write question.
 *
 * These were one function using `cfg.suffix` alone, and that made a
 * project declaring `source_suffix = [".rst", ".md"]` unable to resolve
 * a single one of its markdown documents: they were read, and then
 * looked for under the wrong name. Sphinx resolves by trying each.
 */
function findDoc(
  docname: string,
  cfg: SphinxConfig,
  files: FilesSnapshot,
): string | undefined {
  for (const suffix of cfg.suffixes) {
    if (files[docname + suffix] !== undefined) return docname + suffix;
  }
  return undefined;
}

/** A path back to its docname, stripping whichever suffix it carries. */
function docnameOf(path: string, cfg: SphinxConfig): string {
  for (const suffix of cfg.suffixes) {
    if (suffix !== "" && path.endsWith(suffix)) return path.slice(0, -suffix.length);
  }
  return path;
}

/**
 * MyST signals — a recognizer plus a deferral, never silent unsupport.
 *
 * ZERO CORPUS COVERAGE, so this is a caveat rather than a result and the
 * fixtures are synthetic. What matters most is what it must NOT key on:
 * the mere presence of `.md` files. godot has 8 and zero MyST, so that
 * heuristic false-positives on the one corpus of the four with any
 * markdown at all — the reference corpus refusing itself.
 *
 * Three real signals, each a DECLARATION rather than a coincidence.
 */
function mystSignals(files: FilesSnapshot, cfg: SphinxConfig): string[] {
  const signals: string[] = [];
  const confPath = Object.keys(files).find((p) => CONF_RE.test(p));
  const conf = confPath === undefined ? "" : stripComments(files[confPath]!);
  if (/\bmyst_parser\b/.test(conf)) signals.push("myst_parser in extensions");
  if (cfg.suffixes.includes(".md")) signals.push(".md in source_suffix");
  // A CONFIRMATION, not a discovery — and the difference is worth
  // stating rather than leaving for someone to find. Markdown reaches
  // the snapshot only when the config asked for it, so by the time a
  // fence can be seen, `.md in source_suffix` has already fired. What
  // this catches is the project that declares `.md` and whose toctrees
  // are fenced rather than directive-shaped.
  //
  // NOT COVERED, stated: a MyST project with no readable `conf.py`. Its
  // markdown is never requested, so no signal fires and the import
  // reports `root-document-absent` instead. That is a true statement
  // about what was read, which is the safe direction, but it is not the
  // MyST message and nobody should think it is.
  for (const [path, content] of Object.entries(files)) {
    if (!path.endsWith(".md")) continue;
    if (MYST_FENCE.test(content)) {
      signals.push("a {toctree} fence");
      break;
    }
  }
  return signals;
}

/**
 * Carriers reached through `.. include::` rather than as documents.
 *
 * ZERO measured across four corpora in BOTH directions — no carrier is
 * included elsewhere, and no included file hosts a block. Fenced anyway,
 * because the failure is silent: the file of record and the page of
 * display differ, so a splice would edit bytes that render somewhere
 * the user was not looking at.
 */
function includeRoutedNav(files: FilesSnapshot): string[] {
  const found: string[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (!path.endsWith(".rst")) continue;
    for (const m of content.matchAll(INCLUDE_RE)) {
      const target = m[1]!.trim();
      // RST resolves an include relative to the including FILE, or from
      // the source root with a leading slash.
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      const resolved = target.startsWith("/")
        ? target.slice(1)
        : dir === ""
          ? target
          : `${dir}/${target}`;
      const included = files[resolved];
      if (included !== undefined && scanToctrees(included).length > 0) {
        found.push(resolved);
      }
    }
  }
  return [...new Set(found)];
}

function captionOf(block: ToctreeBlock): string | undefined {
  const caption = block.options.find((o) => o.startsWith(":caption:"));
  return caption === undefined ? undefined : caption.slice(":caption:".length).trim();
}

function entryCount(blocks: ToctreeBlock[]): number {
  return blocks.reduce((n, b) => n + b.entries.length, 0);
}

interface Traversal {
  sections: Section[];
  /** Paths worth reading next, for the expand fixpoint. Read in full. */
  requests: string[];
  /** docname → title, for the sidecar. */
  titles: Record<string, string>;
  /** Paths that host toctree blocks — the only files a plan may edit. */
  hosts: Set<string>;
  /**
   * Observed docnames WITH the node each was seen at, so a parse
   * observation can be FOCUSED rather than merely counted. docs/12 left
   * this half-done and named the reason: the section id has to reach the
   * place the placeholder is built.
   */
  missing: { docname: string; ref: NodeRef }[];
  duplicates: { docname: string; ref: NodeRef }[];
}

/**
 * The ONE walk. `expand` takes its requests, `parse` takes its sections —
 * two traversals that drifted would let the ingest set and the model
 * silently disagree (docs/12, decision 2).
 */
function traverse(files: FilesSnapshot, cfg: SphinxConfig): Traversal {
  const titles: Record<string, string> = { ...readTitles(files) };
  const hosts = new Set<string>();
  const requests: string[] = [];
  const missing: { docname: string; ref: NodeRef }[] = [];
  const duplicates: { docname: string; ref: NodeRef }[] = [];
  /** docname → title of the section that holds its primary listing. */
  const placed = new Map<string, string>([[cfg.rootDoc, ""]]);

  const titleOf = (docname: string): { title: string; derived: boolean } => {
    const at = findDoc(docname, cfg, files);
    const content = at === undefined ? undefined : files[at];
    if (content !== undefined) {
      const found = documentTitle(content);
      if (found !== undefined) {
        titles[docname] = found;
        return { title: found, derived: false };
      }
    }
    const cached = titles[docname];
    if (cached !== undefined) return { title: cached, derived: false };
    return { title: deriveTitleFromPath(docname), derived: true };
  };

  const topicFor = (
    entry: ToctreeEntry,
    fromDoc: string,
    sectionTitle: string,
    /** The card this node lands on — half of the `NodeRef` an
     *  observation needs to be focusable. */
    sectionId: string,
    /**
     * Does the CONTAINING BLOCK generate its list? Passed rather than
     * folded into the entry's kind, which is the split docs/19 asks for:
     * a plain docname in a `:glob:` block is still a docname, and it is
     * uneditable for a reason that has nothing to do with the line.
     */
    globbed: boolean,
    /**
     * Is the CONTAINING BLOCK above prose, and therefore outside the
     * file's trailing navigation run? Block-level enforcement again, and
     * the sibling of `globbed`: that one is WHY the list is not a list,
     * this one is WHERE the block sits.
     *
     * Mid-file carriers — where NO block is in a region — deliberately do
     * not lock here. That is a larger population (97 kernel carriers) and
     * it belongs with the drag-time gating work, not smuggled in beside
     * this one.
     */
    outsideRegion: boolean,
  ): Topic => {
    // Globs, external URLs and `self` are round-tripped verbatim: their
    // entry line is a pattern or a link, not a movable document.
    if (entry.kind !== "doc") {
      // Three different things, not one "opaque": a glob is a rule we
      // cannot enumerate, an external URL leaves the documentation set,
      // and `self` points back at the containing document.
      const kind =
        entry.kind === "glob"
          ? "pattern"
          : entry.kind === "external"
            ? "external"
            : "reference";
      return {
        id: newId(),
        title: entry.title ?? entry.target,
        lock: { kind },
        children: [],
      };
    }

    const docname = resolveDocname(entry.target, fromDoc, cfg.suffixes);
    // Where it IS, not where it would be written: a project may declare
    // more than one suffix, and the document answers to any of them.
    const path = findDoc(docname, cfg, files) ?? docPath(docname, cfg);
    const content = files[path];

    if (content === undefined) {
      const cached = titles[docname];
      if (cached !== undefined) {
        // A title-only leaf whose content was deliberately dropped after
        // the sidecar was built. Absent, but not missing — and movable.
        return {
          id: newId(),
          title: entry.title ?? cached,
          path: docname,
          ...(globbed
            ? { lock: { kind: "globbed" as const } }
            : outsideRegion
              ? { lock: { kind: "outside-region" as const } }
              : {}),
          children: [],
        };
      }
      const id = newId();
      missing.push({ docname, ref: { sectionId, topicId: id } });
      requests.push(path);
      return {
        id,
        title: entry.title ?? deriveTitleFromPath(docname),
        titleDerived: entry.title === undefined,
        path: docname,
        lock: { kind: "missing" },
        children: [],
      };
    }

    const label = titleOf(docname);

    const owner = placed.get(docname);
    if (owner !== undefined) {
      // A second reference to a document already placed elsewhere: a
      // pinned reference node, inert and never rewritten (docs/12). It
      // carries the owning section's title so the row can say where the
      // real one lives without the reader hunting for it.
      const id = newId();
      duplicates.push({ docname, ref: { sectionId, topicId: id } });
      return {
        id,
        title: entry.title ?? label.title,
        path: docname,
        lock: { kind: "reference", ...(owner === "" ? {} : { owner }) },
        children: [],
      };
    }
    placed.set(docname, sectionTitle);

    const blocks = scanToctrees(content);
    if (blocks.length > 0) hosts.add(path);
    // Which of this host's blocks a plan could rewrite. A mid-file
    // carrier has no region at all and locks nothing here — see the
    // `outsideRegion` note above.
    const childRegion = navTailOf(content);
    const writableFrom = childRegion.ok ? childRegion.fromBlock : 0;
    const total = entryCount(blocks);
    const atomic = total >= ATOMIC_ENTRY_THRESHOLD;

    return {
      id: newId(),
      title: entry.title ?? label.title,
      titleDerived: entry.title === undefined && label.derived,
      path: docname,
      // The count is the whole point of the boundary: without it the row
      // renders as a childless leaf, which reads as empty rather than big.
      //
      // `atomic` wins over `globbed` when both apply: a 250-entry subtree
      // behind a boundary is the more surprising fact, and the count is
      // the thing the reader cannot recover any other way.
      ...(atomic
        ? { lock: { kind: "atomic" as const, count: total } }
        : globbed
          ? { lock: { kind: "globbed" as const } }
          : outsideRegion
            ? { lock: { kind: "outside-region" as const } }
            : {}),
      children: atomic
        ? []
        : blocks.flatMap((b, i) =>
            b.entries.map((e) =>
              topicFor(
                e,
                docname,
                sectionTitle,
                sectionId,
                isGlobbed(b),
                i < writableFrom,
              ),
            ),
          ),
    };
  };

  const rootPath = findDoc(cfg.rootDoc, cfg, files) ?? docPath(cfg.rootDoc, cfg);
  const rootContent = files[rootPath];
  if (rootContent === undefined)
    return { sections: [], requests, titles, hosts, missing, duplicates };

  const rootBlocks = scanToctrees(rootContent);
  if (rootBlocks.length > 0) hosts.add(rootPath);
  const rootTitle = documentTitle(rootContent) ?? deriveTitleFromPath(cfg.rootDoc);

  const rootRegion = navTailOf(rootContent);
  const rootWritableFrom = rootRegion.ok ? rootRegion.fromBlock : 0;

  const sections: Section[] = rootBlocks.map((block, index) => {
    const title = captionOf(block) ?? rootTitle;
    // The id is minted BEFORE its topics, because a placeholder built
    // inside them has to name the card it is on.
    const id = newId();
    return {
      id,
      title,
      topics: block.entries.map((entry) =>
        topicFor(
          entry,
          cfg.rootDoc,
          title,
          id,
          isGlobbed(block),
          index < rootWritableFrom,
        ),
      ),
    };
  });

  return { sections, requests, titles, hosts, missing, duplicates };
}

/**
 * A neutral PARSE OBSERVATION, as evidence rather than as a warning
 * (docs/17). Both of these describe what the import SAW — a docname
 * listed but absent, a docname listed twice — and neither can make a
 * read-only result unsound, so neither belongs on the array whose
 * `blocking` field gates saving. They were on it because the evidence
 * channel did not exist when this adapter was written.
 *
 * ONE OCCURRENCE PER SUBJECT, so the count is the real number and the
 * detail names the first few: `groupIntoEvidence` sums the occurrences
 * and keeps the first detail, which is the collapsed-and-says-so shape
 * docs/17 asks for — "45 documents listed but not present · a, b, c and
 * 42 more" rather than a sentence with the count hidden inside it.
 *
 * They carry no `subject`, so they are counted but not FOCUSABLE. That
 * half needs a `NodeRef`, which needs the section id threaded through
 * `traverse` to where the placeholder node is built — more than this
 * change, and named in docs/19 rather than half-done here.
 */
function listOccurrences(
  kind: string,
  seen: readonly { docname: string; ref: NodeRef }[],
  describe: (shown: string, extra: number) => string,
): ImportOccurrence[] {
  // FIRST sighting per docname: the exemplar a reader is sent to should
  // be the one the import actually stumbled on, and a later duplicate
  // would point at the same fact from a less useful place.
  const first = new Map<string, NodeRef>();
  for (const { docname, ref } of seen) if (!first.has(docname)) first.set(docname, ref);
  if (first.size === 0) return [];
  const names = [...first.keys()];
  const shown = names.slice(0, 5).join(", ");
  const detail = describe(shown, Math.max(0, names.length - 5));
  return names.map((name, i) => ({
    kind,
    ...(i === 0 ? { detail } : {}),
    subject: first.get(name)!,
  }));
}

/**
 * Does this snapshot need a root chosen before it can be read?
 *
 * True only when the DECLARED root is absent and no choice has been made
 * yet — the trigger docs/19 specifies. Zero candidates is not this
 * function's business: the caller asks `rootCandidates` and leaves
 * today's `root-document-absent` line alone when the list is empty.
 */
/** What `conf.py` declares, for a disclosure that must still name it. */
export function declaredRootOf(files: FilesSnapshot): string {
  return readConfig(files).declaredRoot;
}

export function needsRootChoice(files: FilesSnapshot): boolean {
  if (files[ROOT_KEY] !== undefined) return false;
  const cfg = readConfig(files);
  return findDoc(cfg.declaredRoot, cfg, files) === undefined;
}

/** A document that could be this project's root, and how much it reaches. */
export interface RootCandidate {
  docname: string;
  /** Documents in its toctree closure, counting itself. THE LABEL. */
  reach: number;
}

/**
 * Documents that could be the root `root_doc` was supposed to name.
 *
 * THE RULE, corrected by measurement before it was written down: files
 * that HOST a toctree and appear as an ENTRY in no other file's toctree.
 * Against ansible that yields SIX rather than two — `dev_guide/*` is the
 * same build-time symlink one level down, and the `roadmap/*` pair are
 * genuinely unreferenced hosts, correctly found and not what anyone
 * means by "the root".
 *
 * RESTRICTING TO TOP-LEVEL docnames reproduces the expected pair
 * exactly, and it is principled rather than convenient: `root_doc`
 * resolves from the SOURCE ROOT, so a nested unreferenced host is a
 * sub-root or an orphan host, and either way it is reached THROUGH
 * whichever root is chosen.
 *
 * REACH is the label, and it validates the derivation independently —
 * the same walk run on corpora whose roots are not in doubt has to
 * reproduce numbers already known from elsewhere. So the number a user
 * reads to CHOOSE is the number that proves the walk is right.
 */
export function rootCandidates(files: FilesSnapshot): RootCandidate[] {
  const cfg = readConfig(files);
  /** docname -> the blocks it hosts, for hosts only. */
  const hosts = new Map<string, ToctreeBlock[]>();
  const referenced = new Set<string>();
  for (const [path, content] of Object.entries(files)) {
    if (!cfg.suffixes.some((x) => path.endsWith(x))) continue;
    const blocks = scanToctrees(content);
    if (blocks.length === 0) continue;
    const from = docnameOf(path, cfg);
    hosts.set(from, blocks);
    for (const block of blocks) {
      for (const entry of block.entries) {
        if (entry.kind !== "doc") continue;
        referenced.add(resolveDocname(entry.target, from, cfg.suffixes));
      }
    }
  }

  /**
   * Documents in the closure THAT EXIST AS FILES, counting the root.
   *
   * Existing-only, because the label is read next to the orphan
   * disclosure and the two must be in the same units: "294 documents"
   * beside "leaves 111 of 405 files outside" is arithmetic a reader can
   * do, and counting dangling entries here would break it. A listed
   * document that is not present becomes a locked placeholder row, not
   * a document.
   *
   * The distinction is invisible on the two corpora that anchor this
   * walk — godot and cpython have no missing documents, so both readings
   * agree — which is exactly why it is settled on principle rather than
   * by picking whichever number matched.
   */
  const reachOf = (root: string): number => {
    // The visited set IS the termination condition: a toctree graph has
    // cycles and repeated references, so re-reaching a document must be
    // free rather than fatal.
    const seen = new Set<string>([root]);
    const queue = [root];
    while (queue.length > 0) {
      const at = queue.shift()!;
      for (const block of hosts.get(at) ?? []) {
        for (const entry of block.entries) {
          if (entry.kind !== "doc") continue;
          const next = resolveDocname(entry.target, at, cfg.suffixes);
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
    }
    let present = 0;
    for (const docname of seen) {
      if (findDoc(docname, cfg, files) !== undefined) present++;
    }
    return present;
  };

  return (
    [...hosts.keys()]
      .filter((docname) => !docname.includes("/") && !referenced.has(docname))
      .map((docname) => ({ docname, reach: reachOf(docname) }))
      // Biggest first: the label is the thing being compared, so the list
      // is ordered by it rather than by name.
      .sort((a, b) => b.reach - a.reach || a.docname.localeCompare(b.docname))
  );
}

/** Joins key lists for comparison. A character no docname contains. */
const SEP = "\u0000";

function entryKey(node: { path?: string; title: string }): string {
  return node.path ?? `~${node.title}`;
}

function keyOfEntry(entry: ToctreeEntry, fromDoc: string, cfg: SphinxConfig): string {
  if (entry.kind !== "doc") return `~${entry.title ?? entry.target}`;
  return resolveDocname(entry.target, fromDoc, cfg.suffixes);
}

/**
 * Express `docname` as a target written INSIDE `host`, following the
 * conventions of the line it replaces.
 *
 * This is the one place a move edits an entry's TEXT. A relative docname
 * resolves against its containing document's DIRECTORY — `docname_join`
 * pops the base document's own basename — so a line moved between files
 * points somewhere else unless it is rewritten, and "somewhere else" is
 * usually nowhere.
 *
 * VERIFIED, NOT TRUSTED: the result is resolved back through the shipped
 * `resolveDocname` and must reproduce the docname it started from. When
 * it does not, the ABSOLUTE form is written instead — it resolves from
 * the source root and is therefore correct from any host. The check
 * costs one call and turns a whole class of path arithmetic into a
 * fallback rather than a bug.
 */
function targetIn(
  docname: string,
  host: string,
  cfg: SphinxConfig,
  template: ToctreeEntry | undefined,
): string {
  const absolute = template?.target.startsWith("/") === true;
  const suffix = cfg.suffixes.find(
    (x) => template !== undefined && x !== "" && template.target.endsWith(x),
  );
  const write = (body: string): string => body + (suffix ?? "");

  let target = write(absolute ? `/${docname}` : relativeDocname(docname, host));
  if (resolveDocname(target, host, cfg.suffixes) !== docname) {
    target = write(`/${docname}`);
  }
  const title = template?.title;
  return title === undefined ? target : `${title} <${target}>`;
}

/** `docname` written relative to `host`'s directory, with `../` as needed. */
export function relativeDocname(docname: string, host: string): string {
  const dir = host.includes("/") ? host.slice(0, host.lastIndexOf("/")).split("/") : [];
  const parts = docname.split("/");
  let common = 0;
  while (
    common < dir.length &&
    common < parts.length - 1 &&
    dir[common] === parts[common]
  ) {
    common++;
  }
  const ups = dir.length - common;
  return "../".repeat(ups) + parts.slice(common).join("/");
}

/**
 * Assign a host's desired entries back to its BLOCKS.
 *
 * A multi-block host flattens all its blocks into one children list in
 * the model, so writing back has to put them somewhere. Entries that
 * were already here keep their block; an entry arriving from elsewhere
 * joins the block of the entry it now follows, which is docs/19's
 * "nav order within the target block".
 *
 * Returns null when the desired order is NOT BLOCK-CONTIGUOUS — the user
 * has interleaved two blocks' entries, which the format cannot express
 * because a re-parse reads block after block. Refusing is the honest
 * answer; simulation would catch it anyway, but a warning naming the
 * document beats a generic "does not reproduce".
 */
function distribute(wanted: string[], original: string[][]): string[][] | null {
  // Belt and braces behind the explicit refusal above: with no blocks
  // there is nowhere to put anything, and a guard that INVENTS a block
  // would write a toctree nobody asked for.
  if (original.length === 0) return wanted.length === 0 ? [] : null;
  const blockOf = new Map<string, number>();
  for (const [i, keys] of original.entries()) {
    for (const key of keys) if (!blockOf.has(key)) blockOf.set(key, i);
  }
  const out: string[][] = original.map(() => []);
  let previous = 0;
  for (const key of wanted) {
    const at = blockOf.get(key) ?? previous;
    out[at]!.push(key);
    previous = at;
  }
  if (out.flat().join(SEP) !== wanted.join(SEP)) return null;
  return out;
}

/* ─────────────────────────────────────────────────────────────────
 * THE STRUCTURAL COMPARISON, EXTRACTED (docs/22, Decision 3).
 *
 * ONE RULE, TWO CONSUMERS, split BEFORE the drift rather than after.
 * `planChanges` asks each predicate "must this plan be refused?" and
 * `structuralRemainders` asks the same predicate "which structure is
 * imagined?". Re-deriving either answer a second way — approximately,
 * from locks and keys, in the neutral layer — is the drift `guards.ts`
 * exists to prevent, one adapter over.
 *
 * EACH PREDICATE ANSWERS BOTH QUESTIONS IN TWO NAMED FIELDS, never one.
 * `refuses` is phase 1's own arithmetic, verbatim, so the enforcement
 * side does not move; the other field is what the report shows. They are
 * genuinely two sentences: "the card COUNT differs, so no plan here is
 * trustworthy" and "these particular cards are not in the source". A
 * DELETION makes the first true and the second empty, which is exactly
 * the ruled behavior (OR-4 defers the deletion kind) and exactly why one
 * boolean could not serve both.
 * ───────────────────────────────────────────────────────────────── */

/** Every entry this arrangement wants written, per host, in nav order —
 *  and the rows that supplied them, for locks, titles and ids.
 *
 *  ONE WALK, because two would be two things to keep in step: the plan
 *  and the report must agree about which host owns which row or the
 *  report would name a block the plan never looked at. */
interface DesiredEntries {
  /** host path -> desired entry keys, in nav order across its blocks. */
  wanted: Map<string, string[]>;
  /** host path -> the topics that supplied them, index-aligned with
   *  `wanted`, so a key can be pointed back at the row on screen. */
  sources: Map<string, Topic[]>;
  /** Per-block desired keys for the ROOT, since card <-> block is 1:1. */
  rootWanted: string[][];
  /** docname -> the card title it now sits under, for the move report. */
  cardOf: Map<string, string>;
  /** A NESTED host -> the row whose page hosts it. The ROOT is absent
   *  and deliberately so: its blocks are CARDS, one parent each, and a
   *  single entry here would be the conflation of a file with a card. */
  hostParent: Map<string, { id: string; title: string }>;
}

function desiredEntries(
  files: FilesSnapshot,
  cfg: SphinxConfig,
  ordered: readonly Section[],
  rootPath: string,
): DesiredEntries {
  const wanted = new Map<string, string[]>();
  const sources = new Map<string, Topic[]>();
  const cardOf = new Map<string, string>();
  const hostParent = new Map<string, { id: string; title: string }>();
  const push = (host: string, node: Topic) => {
    const list = wanted.get(host) ?? [];
    list.push(entryKey(node));
    wanted.set(host, list);
    const from = sources.get(host) ?? [];
    from.push(node);
    sources.set(host, from);
  };

  const rootWanted: string[][] = ordered.map((section) => {
    for (const topic of section.topics) {
      push(rootPath, topic);
      cardOf.set(entryKey(topic), section.title);
    }
    return section.topics.map(entryKey);
  });

  const walk = (topic: Topic): void => {
    if (topic.path !== undefined && topic.children.length > 0) {
      const host = findDoc(topic.path, cfg, files) ?? docPath(topic.path, cfg);
      if (files[host] !== undefined) {
        hostParent.set(host, { id: topic.id, title: topic.title });
        for (const child of topic.children) {
          push(host, child);
          cardOf.set(entryKey(child), topic.title);
        }
      }
    }
    for (const child of topic.children) walk(child);
  };
  for (const section of ordered) for (const topic of section.topics) walk(topic);

  return { wanted, sources, rootWanted, cardOf, hostParent };
}

/** A source card's natural key. A Sphinx card is a toctree block in the
 *  root document, and a block has no docname at all — so its key is its
 *  caption, or the root document's own title where it declares none. */
function blockKey(block: ToctreeBlock, rootTitle: string): string {
  return `~${captionOf(block) ?? rootTitle}`;
}

/**
 * THE CARD-SET COMPARISON.
 *
 * `refuses` is phase 1's own test — the card COUNT against the root
 * block count — kept verbatim so defining the report cannot move the
 * enforcement. `created` is the surplus by natural key, counted as a
 * MULTISET rather than a set: two captionless blocks legitimately share
 * one key, and set membership would silently forgive a third.
 */
function cardSetChange(
  rootBlocks: readonly ToctreeBlock[],
  ordered: readonly Section[],
  rootTitle: string,
): { refuses: boolean; created: Section[] } {
  const budget = new Map<string, number>();
  for (const block of rootBlocks) {
    const key = blockKey(block, rootTitle);
    budget.set(key, (budget.get(key) ?? 0) + 1);
  }
  const created: Section[] = [];
  for (const section of ordered) {
    const key = entryKey(section);
    const left = budget.get(key) ?? 0;
    if (left > 0) budget.set(key, left - 1);
    else created.push(section);
  }
  return { refuses: ordered.length !== rootBlocks.length, created };
}

/**
 * THE CARD-ORDER COMPARISON.
 *
 * `refuses` is phase 1's own per-index caption test, verbatim. `moved`
 * excludes CREATED cards — they have no source position to have moved
 * from, and counting them here would double-report one act under two
 * kinds.
 */
function cardOrderChange(
  rootBlocks: readonly ToctreeBlock[],
  ordered: readonly Section[],
  rootTitle: string,
  created: readonly Section[],
): { refuses: boolean; moved: CardOrderRemainder["moved"] } {
  const refuses = ordered.some(
    (section, i) =>
      i < rootBlocks.length && section.title !== (captionOf(rootBlocks[i]!) ?? rootTitle),
  );
  const isNew = new Set(created.map((s) => s.id));
  const surviving = ordered.filter((s) => !isNew.has(s.id));
  const was = rootBlocks.map((b) => blockKey(b, rootTitle));
  const taken = new Set<number>();
  const moved: CardOrderRemainder["moved"] = [];
  surviving.forEach((section, to) => {
    const key = entryKey(section);
    // FIRST UNTAKEN match, so two blocks sharing a caption keep their
    // relative order rather than both claiming index 0.
    const from = was.findIndex((k, i) => k === key && !taken.has(i));
    if (from === -1) return;
    taken.add(from);
    if (from !== to)
      moved.push({ sectionId: section.id, title: section.title, from, to });
  });
  return { refuses, moved };
}

/**
 * THE FROZEN-PREFIX COMPARISON, per host.
 *
 * A block above the prose is outside the file's trailing navigation run,
 * so its lines are read-only: those entries occupy the front of this
 * host's desired list and must ARRIVE UNCHANGED. `refuses` is phase 1's
 * flat prefix test, verbatim; `blocks` is the same comparison asked
 * per-block, because a remedy names ONE run of lines in ONE file and a
 * flat answer could not say which.
 */
function frozenPrefix(
  blocks: readonly ToctreeBlock[],
  from: number,
  hostDoc: string,
  cfg: SphinxConfig,
): string[][] {
  return blocks
    .slice(0, from)
    .map((b) => b.entries.map((e) => keyOfEntry(e, hostDoc, cfg)));
}

function frozenRowChange(
  perBlock: readonly string[][],
  keys: readonly string[],
): { refuses: boolean; changed: { block: number; at: number; length: number }[] } {
  const flat = perBlock.flat();
  // THE PLAN'S QUESTION, verbatim: the frozen entries occupy the front of
  // this host's desired list and must ARRIVE UNCHANGED. Membership
  // changes and reorders alike reach the bytes, so both are refused.
  const refuses = keys.slice(0, flat.length).join(SEP) !== flat.join(SEP);

  // THE REPORT'S QUESTION, and it is a NARROWER one: are the rows this
  // block still has in a different ORDER than the source has them?
  //
  // MEMBERSHIP IS NOT THIS KIND'S FACT. A frozen row is pinned by
  // construction, so a row leaving or arriving is a DISPLACEMENT — the
  // ledger's `pin` record owns it, the projection returns it home, and
  // after that the block's order is exactly the source's. Reporting it
  // here too produced a second checklist item saying the same thing
  // about the same move with the same remedy, which is how this was
  // found (flow 15, not this file's own suite).
  const present = new Set(keys);
  const changed: { block: number; at: number; length: number }[] = [];
  let at = 0;
  perBlock.forEach((source, block) => {
    const survivors = source.filter((key) => present.has(key));
    const here = keys.filter((key) => source.includes(key));
    if (survivors.length > 1 && here.join(SEP) !== survivors.join(SEP)) {
      changed.push({ block, at, length: source.length });
    }
    at += source.length;
  });
  return { refuses, changed };
}

/** What a card IS here. Copy only — nothing branches on it. */
const CARD_NOUN = "toctree block";

export const sphinxAdapter: CollectionAdapter = {
  id: "sphinx",
  label: "Sphinx (toctree)",
  // Parentage is an explicit toctree, so a reparent moves an ENTRY
  // LINE between two files and the page itself stays put. True of
  // phase 2 as much as phase 1 — the shape is the reason, not the
  // absence of a planner.
  reparentMovesFiles: false,
  // A card here IS a toctree block in the root document, so both answers
  // are the planner's own refusals read back: `section-set-changed`
  // ("creating or deleting blocks is not something this version writes")
  // and `card-reordered` ("each block's caption stays where it is
  // written"). docs/19 records the second as a designed absence — a
  // heading binds to its block only by convention.
  createCards: false,
  reorderCards: false,
  // A toctree entry line IS a docname. A card is a BLOCK, and a block
  // has no docname at all — so a card demoted into another card leaves
  // nothing to write. True of phase 2 exactly as of phase 1.
  nodesNeedTargets: true,
  /**
   * SECTIONS ONLY. Every entry in a Sphinx navigation lives INSIDE a
   * `.. toctree::` block — there is no way to spell a bare top-level
   * entry outside one — and a card here IS a block. So the root bears
   * sections and cannot bear a standalone, which puts a childless
   * drag-out in Decision 2's third regime: the entry is WRAPPED in a
   * card with a placeholder heading rather than left as a shape the
   * format cannot write.
   *
   * METHOD — the format's own grammar, verified against this adapter:
   * `parse` builds cards from `scanToctrees(rootContent)` and there is
   * no orphan producer anywhere in this file, so no Sphinx project has
   * ever parsed INTO a standalone; `structuralRemainders` and
   * `planChanges` both read a card as a block for the same reason.
   *
   * NOT "BEARS NEITHER". A bears-nothing root is Decision 2's fourth
   * regime, which REFUSES the drop, and its stated ground is that an
   * unhoused card on a FORMAT tab has no snapshot to project against so
   * the whole export would wedge behind it. A Sphinx tab has both a
   * snapshot and a projection: a card the write path cannot create is
   * exactly the `creation` remainder docs/22 arc 1 built, gated by the
   * seam and dissolved by the projection. `createCards: false` is where
   * that fact lives, not here.
   */
  rootBearing: { sections: true, orphans: false },
  // ONE LITERAL, TWO CONSUMERS: the checklist's remedy ("add a toctree
  // block in index.rst") and the creation seam's headline ("here, cards
  // are toctree blocks"), which needs it at DRAG time where no record
  // exists yet. Spelling it in both places is one noun that drifts.
  cardNoun: CARD_NOUN,

  /**
   * A page holds children only if it declares a `toctree`. Per-PAGE, not
   * per-format, which is why this is a method rather than a flag.
   */
  canHostChildren(files: FilesSnapshot, path: string): boolean {
    const cfg = readConfig(files);
    const at = findDoc(path, cfg, files);
    return at !== undefined && scanToctrees(files[at]!).length > 0;
  },
  // Phase 1 writes nothing back, so no rename of either kind has a
  // serialization and the UI must not offer one (docs/12, decision 5;
  // shape per docs/13).
  supportsRename: { sections: false, topics: false },

  ingests(path: string): boolean {
    // `.rst` and `conf.py` — what a Sphinx project ALWAYS has. Markdown
    // is deliberately NOT claimed here: `ingests` is a per-path predicate
    // with no access to `conf.py`, so claiming `.md` unconditionally
    // reads every markdown file in every reStructuredText project on the
    // chance that one of them is MyST.
    //
    // Markdown arrives CONFIG-KEYED instead, through `expand`, which does
    // see the configuration: a project declaring `.md` in `source_suffix`
    // has its documents requested by name. `ingestible()` is the union of
    // every adapter's claim, so those paths are available to ask for.
    return path.endsWith(".rst") || CONF_RE.test(path);
  },

  detect(files: FilesSnapshot): number {
    let score = 0;
    const paths = Object.keys(files);
    if (paths.some((p) => CONF_RE.test(p))) score += 0.5;
    const rst = paths.filter((p) => p.endsWith(".rst"));
    if (rst.length > 0) score += 0.1;
    if (rst.some((p) => HAS_TOCTREE.test(files[p]!))) score += 0.4;
    return Math.min(1, score);
  },

  expand(files: FilesSnapshot): string[] {
    const seed = ["conf.py", "index.rst"];
    if (Object.keys(files).length === 0) return seed;

    const cfg = readConfig(files);
    const rootPath = findDoc(cfg.rootDoc, cfg, files);
    if (rootPath === undefined) {
      // Ask for every configured spelling: a MyST-flavoured project
      // declaring `.md` first has its root at `index.md`, and asking only
      // for `.rst` reported it absent when it was right there.
      return [...seed, ...cfg.suffixes.map((x) => cfg.rootDoc + x)];
    }
    return traverse(files, cfg).requests;
  },

  parse(files: FilesSnapshot, rootName: string): CollectionParseResult {
    const cfg = readConfig(files);
    const walk = traverse(files, cfg);
    const myst = mystSignals(files, cfg);
    const included = includeRoutedNav(files);
    const rootPath = findDoc(cfg.rootDoc, cfg, files) ?? docPath(cfg.rootDoc, cfg);
    const evidence: ImportOccurrence[] = [
      // THE DECLARED ROOT IS ABSENT — and an empty canvas with no
      // explanation is the one outcome this project refuses. Ansible is
      // the specimen: `root_doc = master_doc = 'index'` with no
      // `index.rst` anywhere, because its Makefile symlinks one at build
      // time and picks WHICH one by the doc set being built:
      //
      //   Makefile:69  ln -sf ../rst/ansible_index.rst rst/index.rst
      //   Makefile:75  ln -sf ../rst/core_index.rst   rst/index.rst
      //
      // Producing no nav is correct. Producing no nav SILENTLY turns a
      // property of the project into an apparent defect in the app.
      // A CHOSEN ROOT NAMES ITSELF, and pre-empts the alarm it causes.
      // Choosing one tree leaves the others outside its closure, and
      // those documents surface as orphans — correct, and alarming, so
      // the measurement is stated here rather than discovered there.
      ...(cfg.chosenRoot !== undefined
        ? [
            {
              kind: "root-chosen",
              detail: (() => {
                const total = Object.keys(files).filter((p) =>
                  cfg.suffixes.some((x) => p.endsWith(x)),
                ).length;
                const reached = new Set<string>();
                const walkFrom = (from: string): void => {
                  if (reached.has(from)) return;
                  reached.add(from);
                  const at = findDoc(from, cfg, files);
                  if (at === undefined) return;
                  for (const block of scanToctrees(files[at]!)) {
                    for (const entry of block.entries) {
                      if (entry.kind !== "doc") continue;
                      walkFrom(resolveDocname(entry.target, from, cfg.suffixes));
                    }
                  }
                };
                walkFrom(cfg.chosenRoot);
                const inside = [...reached].filter(
                  (d) => findDoc(d, cfg, files) !== undefined,
                ).length;
                const outside = Math.max(0, total - inside);
                return (
                  `root: "${cfg.chosenRoot}" — chosen; declared "${cfg.declaredRoot}" absent. ` +
                  `Choosing it leaves ${outside} of ${total} documents outside its ` +
                  `navigation, and documents reachable only from other roots appear as orphans.`
                );
              })(),
              ...(cfg.confPath !== undefined ? { receipt: cfg.confPath } : {}),
            },
          ]
        : []),
      ...(files[rootPath] === undefined
        ? [
            {
              kind: "root-document-absent",
              detail: `the root document "${cfg.rootDoc}" is declared but not in this folder — some projects generate it at build time, so there may be nothing here to read yet`,
              ...(cfg.confPath !== undefined ? { receipt: cfg.confPath } : {}),
            },
          ]
        : []),
      // A key we saw and could not read. Reported even though the
      // fallback was right for every corpus measured, because "right by
      // coincidence" is indistinguishable from "right" until it is not.
      ...cfg.unreadable.map((key) => ({
        kind: "config-shape-unrecognised",
        detail: `${key} is declared in a form this app does not read; Sphinx's default was used instead`,
        ...(cfg.confPath !== undefined ? { receipt: cfg.confPath } : {}),
      })),
      ...(myst.length > 0
        ? [
            {
              kind: "myst-unsupported",
              detail: `this project declares MyST (${myst.join(", ")}); MyST toctrees are read as prose and are not editable here`,
              ...(cfg.confPath !== undefined ? { receipt: cfg.confPath } : {}),
            },
          ]
        : []),
      ...included.map((path) => ({
        kind: "include-routed-nav",
        detail: `${path} hosts a toctree but is reached through .. include::, so the file holding the nav is not the page that displays it — its entries are not editable here`,
        receipt: path,
      })),
      ...listOccurrences(
        "missing-document",
        walk.missing,
        (shown, extra) =>
          `${shown}${extra > 0 ? ` and ${extra} more` : ""} — listed in a toctree but not present. Shown as locked placeholders.`,
      ),
      ...listOccurrences(
        "duplicate-reference",
        walk.duplicates,
        (shown, extra) =>
          `${shown}${extra > 0 ? ` and ${extra} more` : ""} — listed in more than one toctree. The first listing is movable; the others are pinned references.`,
      ),
    ];

    // What is KEPT: nav hosts (the only files a future plan may edit),
    // conf.py (the detection anchor and root-doc source), and the title
    // sidecar standing in for every source whose content was discarded.
    const kept: FilesSnapshot = {};
    for (const path of walk.hosts) kept[path] = files[path]!;
    for (const path of Object.keys(files)) {
      if (CONF_RE.test(path)) kept[path] = files[path]!;
    }
    // The chosen root travels with the snapshot, because `simulatePlan`
    // re-parses it: a choice the snapshot could not recall would
    // re-parse under the declared — absent — root and compare the
    // edited document against an empty one.
    if (files[ROOT_KEY] !== undefined) kept[ROOT_KEY] = files[ROOT_KEY]!;

    const doc: TocDocument = {
      id: newId(),
      name: rootName,
      formatId: "sphinx",
      sections: walk.sections,
      extras: { files: withTitles(kept, walk.titles) },
    };
    return { doc, warnings: [], evidence };
  },

  /**
   * WHAT THIS ARRANGEMENT IMAGINES that moves-only write-back cannot
   * express (docs/22, Decision 3) — the showing half of `planChanges`'
   * own comparison, through the same extracted predicates.
   *
   * SPHINX IS THE SINGLE PRODUCER, pre-declared: the mechanism is staged
   * until a second structurally-different adapter needs it, and the
   * derivation oracle (`sphinxRemainders.test.ts`) is the guard in the
   * meantime — the report must be empty exactly when the planner refuses
   * none of the three.
   *
   * WHY THIS ADAPTER AND NOT THE NEUTRAL LAYER: a card here IS a toctree
   * block, a frozen block is a fact about a FILE's layout, and neither is
   * recoverable from the model. `createCards: false` and
   * `reorderCards: false` are the same two facts declared statically;
   * this says WHICH cards and WHICH blocks.
   */
  structuralRemainders(
    files: FilesSnapshot,
    doc: TocDocument,
    sectionOrder: SectionId[],
  ): StructuralRemainder[] {
    const cfg = readConfig(files);
    const rootPath = findDoc(cfg.rootDoc, cfg, files) ?? docPath(cfg.rootDoc, cfg);
    const rootContent = files[rootPath];
    // A snapshot with no root document is not a comparison that came out
    // empty — it is a comparison that could not be made. Declared inputs.
    if (rootContent === undefined) return [];

    const ordered = sectionOrder
      .map((id) => doc.sections.find((s) => s.id === id))
      .filter((s): s is Section => s !== undefined);
    const rootBlocks = scanToctrees(rootContent);
    const rootTitle = documentTitle(rootContent) ?? deriveTitleFromPath(cfg.rootDoc);

    const out: StructuralRemainder[] = [];
    // THE FORMAT'S OWN WORDS for what a card is here and where the card
    // set lives — copy only, never behavior (the `ContainerDescriptor.kind`
    // precedent). Without them a remedy can only say "edit the source
    // yourself", which is not the smallest real act.
    const words = { cardNoun: CARD_NOUN, carrierPath: cfg.rootDoc };

    // ── creation ───────────────────────────────────────────────
    const { created } = cardSetChange(rootBlocks, ordered, rootTitle);
    for (const section of created) {
      const record: CreationRemainder = {
        ...words,
        kind: "creation",
        sectionId: section.id,
        title: section.title,
        // SPECIES IS AN OBSERVABLE FACT, never a stored flag: the card
        // either is its single childless entry or carries a heading.
        species: section.isOrphan ? "standalone" : "section",
        // THE HEADING IS STILL NOBODY'S, and the remedy has to say so:
        // whoever writes this block by hand has to invent a caption, and
        // being told beats discovering it.
        ...(section.untitled ? { untitled: true as const } : {}),
        // A STANDALONE CARD IS ITS SINGLE ENTRY, so its identity lives on
        // `topics[0]` and not on the wrapper the model built around it.
        ownKey: section.isOrphan
          ? entryKey(section.topics[0] ?? section)
          : entryKey(section),
        memberKeys: section.topics.map(entryKey),
      };
      out.push(record);
    }

    // ── card order ─────────────────────────────────────────────
    // ONE RECORD FOR A PERMUTATION. N per-card records would make the
    // counts lie: reordering six cards is one edit for the hand.
    const { moved } = cardOrderChange(rootBlocks, ordered, rootTitle, created);
    if (moved.length > 0) out.push({ ...words, kind: "card-order", moved });

    // ── row order ──────────────────────────────────────────────
    const { wanted, sources, hostParent } = desiredEntries(files, cfg, ordered, rootPath);
    for (const [host, keys] of wanted) {
      const content = files[host];
      if (content === undefined) continue;
      const hostDoc = docnameOf(host, cfg);
      const blocks = scanToctrees(content);
      if (blocks.length === 0) continue;
      const region = navTailOf(content);
      const from = region.ok ? region.fromBlock : blocks.length;
      const rows = sources.get(host) ?? [];
      const carrierPath = hostDoc;

      /** Which row a card or a hosting page owns this block through. The
       *  ROOT's blocks are CARDS — one parent each — so they are named
       *  per block rather than per file. */
      const parentOf = (blockIndex: number): { id: string; title: string } => {
        if (host === rootPath) {
          const section = ordered[blockIndex];
          if (section) return { id: section.id, title: section.title };
        }
        const owner = hostParent.get(host);
        if (owner) return owner;
        return { id: host, title: hostDoc };
      };

      const perFrozenBlock = frozenPrefix(blocks, from, hostDoc, cfg);
      for (const { block, at, length } of frozenRowChange(perFrozenBlock, keys).changed) {
        const parent = parentOf(block);
        const record: RowOrderRemainder = {
          kind: "row-order",
          carrierPath,
          parentId: parent.id,
          parentTitle: parent.title,
          rows: rows
            .slice(at, at + length)
            .map((t) => ({ topicId: t.id, title: t.title })),
          lockKind: "outside-region",
        };
        out.push(record);
      }

      // A GENERATED block's list is expanded at build time, so reordering
      // its lines changes nothing on the site — the same refusal the
      // planner raises, shown rather than enforced.
      const keysOf = (bs: ToctreeBlock[]) =>
        bs.map((b) => b.entries.map((e) => keyOfEntry(e, hostDoc, cfg)));
      const original = keysOf(blocks.slice(from));
      const desired = distribute(keys.slice(perFrozenBlock.flat().length), original);
      if (desired === null) continue;
      let offset = perFrozenBlock.flat().length;
      for (const [i, block] of blocks.slice(from).entries()) {
        if (isGlobbed(block) && desired[i]!.join(SEP) !== original[i]!.join(SEP)) {
          const parent = parentOf(from + i);
          out.push({
            kind: "row-order",
            carrierPath,
            parentId: parent.id,
            parentTitle: parent.title,
            rows: rows
              .slice(offset, offset + desired[i]!.length)
              .map((t) => ({ topicId: t.id, title: t.title })),
            lockKind: "globbed",
          });
        }
        offset += desired[i]!.length;
      }
    }

    return out;
  },

  /**
   * MOVES-ONLY WRITE-BACK (docs/19). Defining this method is what
   * un-encodes phase 1's read-only capability: `supportsWriteBack` reads
   * its presence, so there is no flag to keep in step with it.
   *
   * Pure, like every planner here — no edit journal, so undo and redo
   * integrate for free. The original structure is re-derived from the
   * snapshot each time and diffed against the edited model.
   */
  planChanges(files, doc, sectionOrder) {
    const cfg = readConfig(files);
    const warnings: CollectionWarning[] = [];
    const refuse = (kind: string, detail: string): CollectionPlanResult => ({
      changes: [],
      warnings: [...warnings, { kind, detail, blocking: true }],
    });

    // WHOLE-DOCUMENT refusals first: these say the app cannot read this
    // project's navigation faithfully, so no plan it produces is
    // trustworthy — a narrower refusal would be a wrong plan with a
    // caveat attached.
    const myst = mystSignals(files, cfg);
    if (myst.length > 0) {
      return refuse(
        "myst-unsupported",
        `this project declares MyST (${myst.join(", ")}). Its toctrees are not read as navigation here, so nothing can be written back.`,
      );
    }
    const included = includeRoutedNav(files);
    if (included.length > 0) {
      return refuse(
        "include-routed-nav",
        `${included.join(", ")} holds navigation reached through .. include::, so the file of record is not the page that displays it. Nothing is written back.`,
      );
    }

    /**
     * EVERY entry line in the project, keyed the same way the desired
     * lists are, so an entry arriving from another file can inherit its
     * OWN conventions rather than this host's — an explicit title, a
     * written suffix (cpython puts `.rst` on all 526 of its entries), an
     * absolute form. Only the target is rewritten; everything else about
     * the line is the author's and travels with it.
     */
    const elsewhere = new Map<string, ToctreeEntry>();
    for (const [path, content] of Object.entries(files)) {
      if (!cfg.suffixes.some((x) => path.endsWith(x))) continue;
      const hostDoc = docnameOf(path, cfg);
      for (const block of scanToctrees(content)) {
        for (const entry of block.entries) {
          const key = keyOfEntry(entry, hostDoc, cfg);
          if (!elsewhere.has(key)) elsewhere.set(key, entry);
        }
      }
    }

    const rootPath = findDoc(cfg.rootDoc, cfg, files) ?? docPath(cfg.rootDoc, cfg);
    const rootContent = files[rootPath];
    if (rootContent === undefined) return { changes: [], warnings };

    const ordered = sectionOrder
      .map((id) => doc.sections.find((s) => s.id === id))
      .filter((s): s is Section => s !== undefined);
    const rootBlocks = scanToctrees(rootContent);
    const rootTitle = documentTitle(rootContent) ?? deriveTitleFromPath(cfg.rootDoc);

    // THE ENFORCEMENT SIDE READS THE SHARED PREDICATE and refuses on its
    // `refuses` field, which is this phase's own arithmetic unchanged.
    // The other field is the report's; defining one must never move the
    // other, and `sphinxPlan.test.ts` asserts exactly that.
    const cardSet = cardSetChange(rootBlocks, ordered, rootTitle);
    if (cardSet.refuses) {
      return refuse(
        "section-set-changed",
        "cards were added or removed. A Sphinx card is a toctree block in the root document, and creating or deleting blocks is not something this version writes.",
      );
    }

    // CARD ORDER IS BLOCK ORDER, and a block's caption stays with the
    // block. Dragging one card above another therefore swaps their
    // CONTENTS while the captions sit still, so "Guides" would list the
    // reference pages. Simulation catches that — it did — but it catches
    // it as "does not reproduce the edited structure", which names no
    // cause and suggests no action. Refused here, by name.
    if (cardOrderChange(rootBlocks, ordered, rootTitle, cardSet.created).refuses) {
      return refuse(
        "card-reordered",
        `Cards here are toctree blocks in ${rootPath}, and each block's caption stays where it is written — so reordering cards would move the pages between captions rather than moving the cards. Put them back, or reorder the pages inside a card instead.`,
      );
    }

    const { wanted, rootWanted, cardOf } = desiredEntries(files, cfg, ordered, rootPath);

    const changes: FileChange[] = [];
    for (const [host, keys] of wanted) {
      const content = files[host];
      if (content === undefined) continue;
      const hostDoc = docnameOf(host, cfg);
      const blocks = scanToctrees(content);
      if (blocks.length === 0) {
        // A NEW INPUT SPECIES: a host with no blocks at all, which only
        // happens when a row is dropped UNDER a page rather than onto a
        // card. It arrived as a crash — `distribute` maps its output
        // over the blocks, so zero blocks meant no array to push into.
        //
        // Refused rather than repaired: adding a page here means giving
        // this document a toctree it does not have, and creating blocks
        // is not something moves-only write-back does.
        return refuse(
          "no-toctree-in-target",
          `${host} has no toctree, so there is no list of pages to add to. Drop the row onto a card whose page already has one, or add a toctree to ${host} by hand first.`,
        );
      }
      // BLOCKS ABOVE THE PROSE ARE NOT OURS. Prose ends a sequence, so
      // the region is the last maximal heading-interrupted sequence
      // reaching EOF, and everything before it is read-only. Those
      // entries still exist in the model — the card shows them, locked —
      // so they occupy the front of this host's desired list and must
      // arrive unchanged.
      //
      // A carrier with NO region has every block outside it, which makes
      // the arithmetic below say exactly that without a special case.
      const region = navTailOf(content);
      const from = region.ok ? region.fromBlock : blocks.length;
      const keysOf = (bs: ToctreeBlock[]) =>
        bs.map((b) => b.entries.map((e) => keyOfEntry(e, hostDoc, cfg)));
      const perFrozenBlock = frozenPrefix(blocks, from, hostDoc, cfg);
      const frozen = perFrozenBlock.flat();
      const untouchedAbove = !frozenRowChange(perFrozenBlock, keys).refuses;
      const original = keysOf(blocks.slice(from));
      const desired = !untouchedAbove
        ? null
        : host === rootPath
          ? rootWanted.slice(from)
          : distribute(keys.slice(frozen.length), original);

      // NOTHING TO DO COMES FIRST, before any refusal. A host this plan
      // does not touch must not be able to block it — otherwise a corpus
      // merely CONTAINING a mid-file carrier could never be saved at all,
      // which is a refusal aimed at the wrong document. (Found by the
      // complement test written for exactly this in step 3: the refusal
      // was correct and its POSITION was not.)
      if (
        untouchedAbove &&
        desired !== null &&
        desired.length === original.length &&
        desired.every((d, i) => d.join(SEP) === original[i]!.join(SEP))
      ) {
        continue;
      }

      if (!region.ok) {
        return refuse(
          "region-unavailable",
          region.reason === "mid-file"
            ? `${host} has content below its last toctree, so its navigation is not the end of the file and cannot be rewritten safely.`
            : `${host} declares no toctree.`,
        );
      }
      if (!untouchedAbove) {
        return refuse(
          "outside-region",
          `${host} has prose between its toctree blocks, so only the run at the end of the file can be rewritten. The pages listed above that prose stay where they are.`,
        );
      }
      if (desired === null) {
        return refuse(
          "interleaved-blocks",
          `${host} lists its pages in more than one toctree, and the new order mixes them. Sphinx reads one block after another, so this order cannot be written.`,
        );
      }

      // A GENERATED block's list is not a list of lines to rewrite.
      for (const [i, block] of blocks.slice(from).entries()) {
        if (!isGlobbed(block)) continue;
        if (desired[i]!.join(SEP) !== original[i]!.join(SEP)) {
          return refuse(
            "generated-block",
            `${host} builds part of its navigation from a :glob: pattern. The lines there are expanded at build time, so reordering them would change nothing on the site.`,
          );
        }
      }

      // Every original line, so a moved entry can inherit its own
      // conventions — explicit title, written suffix, absolute form.
      const template = new Map<string, ToctreeEntry>();
      for (const block of blocks) {
        for (const entry of block.entries) {
          template.set(keyOfEntry(entry, hostDoc, cfg), entry);
        }
      }
      const raws = desired.map((keys) =>
        keys.map((key) => {
          const here = template.get(key);
          if (here !== undefined) return here.raw;
          // Arrived from another file: rewrite the target for THIS
          // document's directory.
          const from = elsewhere.get(key);
          return key.startsWith("~")
            ? (from?.raw ?? key.slice(1))
            : targetIn(key, hostDoc, cfg, from);
        }),
      );
      changes.push({
        kind: "edit",
        path: host,
        newContent: emitRegion(content, raws),
        region: "navTail",
      });
    }
    /**
     * WHICH ENTRIES CHANGED CARDS, declared rather than left to the
     * dialog to infer. Derived from the same snapshot the plan is, so a
     * move and the edits expressing it can never disagree.
     */
    const before = sphinxAdapter.parse(files, "").doc;
    const wasIn = new Map<string, string>();
    for (const section of before.sections) {
      for (const topic of section.topics) {
        wasIn.set(entryKey(topic), section.title);
        const descend = (parent: Topic): void => {
          for (const child of parent.children) {
            wasIn.set(entryKey(child), parent.title);
            descend(child);
          }
        };
        descend(topic);
      }
    }
    const rewritten = changes
      .map((c) => (c.kind === "edit" ? c.path : ""))
      .filter((p) => p !== "")
      .sort();
    const entryMoves: EntryMove[] = [];
    for (const [key, to] of cardOf) {
      const from = wasIn.get(key);
      if (from === undefined || from === to) continue;
      entryMoves.push({
        title: titleFor(key, before) ?? key,
        from,
        to,
        // Only files this plan actually rewrites. A move whose source
        // and destination share a file spans ONE, and saying "2 files"
        // there would be a count that lies.
        paths: rewritten,
      });
    }
    return { changes, warnings, entryMoves };
  },
};

/** The canvas title for a moved entry, so the report speaks the user's
 *  words rather than a docname. */
function titleFor(key: string, doc: TocDocument): string | undefined {
  let found: string | undefined;
  const visit = (node: Topic): void => {
    if (entryKey(node) === key) found = node.title;
    for (const child of node.children) visit(child);
  };
  for (const section of doc.sections) for (const topic of section.topics) visit(topic);
  return found;
}
