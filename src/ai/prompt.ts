/**
 * prompt.ts — Assemble the system + user messages.
 *
 * SEPARATION (plan): the user-editable instruction is ONLY the
 * optimization goal. The format contract — outline grammar, id rules,
 * markers, children-follow semantics, scope read-only rule — lives
 * HERE, in the fixed system message, so no instruction edit can break
 * the response parser.
 */

import { constraintPromptLines, type RunConstraint } from "./constraints";
import type { OutlineResult, ReorganizeOptions } from "./contract";

export function buildSystemMessage(
  options: Pick<
    ReorganizeOptions,
    "allowRenames" | "allowNewSections" | "allowFileMoves" | "mode"
  >,
  scoped: boolean,
  /**
   * Sections that may not ALL be emptied, per never-empty container
   * (`neverEmptyGroups`). Required rather than defaulted: a constraint
   * the reconstruction enforces and the prompt omits is a retry loop by
   * design, and an optional parameter is how a caller forgets one
   * silently. Empty array where the format has no such containers.
   */
  neverEmpty: readonly { label: string; ids: readonly string[] }[],
  /**
   * Every constraint the SOURCE places on this run (`constraints.ts`).
   *
   * One array rather than one parameter per rule, and that is the whole
   * point: the same values are handed to the pre-reconstruct checker,
   * so a constraint cannot be enforced without also being stated. Both
   * sides switch over the union exhaustively, so a new kind fails
   * `pnpm check` at both until it is answered.
   *
   * This replaced a `moves: boolean` that was the first fix of this
   * class (docs/16 step 6a, `8a193af`) — correct, and a second
   * hand-wired path from a source fact to a prompt sentence. Two
   * one-offs are not a pattern; this is.
   *
   * Required rather than defaulted, for the same reason `neverEmpty`
   * is: an optional parameter is how a caller forgets a constraint
   * silently, and this one costs a paid call per omission.
   */
  constraints: readonly RunConstraint[],
  /**
   * Must every node name a page (`nodesNeedTargets`)? When true, a
   * section id may never appear nested under anything.
   *
   * Required rather than defaulted, for the third time and the same
   * reason: the net discards a proposal that breaks this, and a
   * constraint the prompt omits costs a paid call per run, forever.
   */
  nodesNeedTargets: boolean,
): string {
  const lines = [
    "You reorganize documentation tables of contents.",
    "",
    "INPUT FORMAT: an indented outline. Each line is `<id> <title>`, where",
    "ids look like s1 (sections) or t1 (topics). Two spaces of indentation",
    "per level. A line ending in `(+N topics)` is a collapsed subtree that",
    "moves as one unit. A `| folder/` suffix is a location hint.",
    "",
    "RESPONSE FORMAT — follow it exactly:",
    "- Output ONLY the reorganized outline. No prose, no code fences, no",
    "  explanations before or after.",
    "- One node per line, using ONLY ids that appear in the input outline.",
    "  Never invent ids. Never use an id twice.",
    "- Indent with two spaces per level to express nesting.",
    "- A node listed WITHOUT children keeps its current children",
    "  automatically (minus any you explicitly place elsewhere). Only list",
    "  a node's children when you want to change them — then list ALL of",
    "  the children it should keep.",
    "- Every top-level line must be a section id, or a topic id (which",
    "  becomes its own section).",
  ];
  if (options.allowNewSections) {
    lines.push(
      "- To create a new section or group, use a line `+ <Title>` with its",
      "  contents indented beneath it.",
    );
  } else {
    lines.push("- Do NOT create new sections or groups.");
  }
  // A BLOCK IS NOT AN ENTRY (docs/19), stated in outline terms because
  // that is the only vocabulary the model has. "A card is a toctree
  // block, and a block has no docname" is true and unusable — every line
  // in the outline looks the same. What it can act on is the id shape.
  if (nodesNeedTargets) {
    lines.push(
      "- A section id (s1, s2, …) must stay at the TOP LEVEL. Never nest",
      "  one under another section or under a topic: in this format a",
      "  section is a group in the navigation file rather than a page, so",
      "  there is nothing to list it as. To move a section's contents,",
      "  move its topics.",
    );
  }
  if (options.allowRenames) {
    lines.push(
      "- To rename a section or topic, write `<id> ~ <New Title>`. Only",
      "  rename when it clearly improves the structure.",
    );
  } else {
    lines.push("- Do NOT rename anything. Write ids without titles.");
  }

  // ENFORCEMENT AND COMMUNICATION SHIP TOGETHER. A rule the layer below
  // rejects on and the prompt omits is discovered by the model at the
  // user's expense, once per run, forever — and at corpus scale one
  // omission burns a whole paid call (docs/10, the 2026-08-19 godot
  // incident). Every source constraint renders HERE, from the same
  // array the checker consumes, at ONE insertion point: a per-kind
  // placement rule in this file would be a second thing to remember,
  // and forgetting it renders nothing while compiling perfectly.
  for (const constraint of constraints) lines.push(...constraintPromptLines(constraint));
  if (neverEmpty.length > 0) {
    // MODE-AWARE, HAND-WIRED — the build's refactor choice (docs/21,
    // Substrate delta 3). Folding this into the `RunConstraint` union
    // would also satisfy parity; keeping it here keeps the ONE producer
    // it already has (`neverEmptyGroups`) feeding both the prompt and
    // the net, and leaves the union's blast radius alone.
    //
    // R5 obliges the aspirational framing. Enforcement-and-
    // communication ship together applies to CLASSIFY semantics exactly
    // as to discard semantics: a violation the model was told was
    // forbidden, then silently classified, makes the model's compliance
    // WORSE than the surface demands.
    //
    // The IDS are named in both modes and for the same reason —
    // containers are invisible to the outline, so "keep a section in
    // every tab" is advice the model has no way to follow.
    lines.push(
      "",
      "GROUPS THAT MUST NOT ALL BE EMPTIED: this document has navigation",
      "containers that each require at least one section. They are not",
      "shown in the outline, so they are listed here.",
      ...(options.mode === "aspirational"
        ? [
            "This format requires at least one section in each group below;",
            "you may propose emptying one, and it will be labeled for the",
            "user to resolve by hand:",
          ]
        : [
            "For every line below, at least one of its ids must still appear",
            "in your answer holding at least one topic:",
          ]),
      ...neverEmpty.map((group) => `- ${group.label}: ${group.ids.join(", ")}`),
    );
  }
  if (scoped) {
    lines.push(
      "",
      "SCOPE: you are reorganizing ONLY the sections in the outline. The",
      "input may mention other sections as context — they are read-only;",
      "do not include them in your answer.",
    );
  }
  return lines.join("\n");
}

export function buildUserMessage(instructions: string, outline: OutlineResult): string {
  const parts = [instructions.trim(), "", "Current outline:", outline.text];
  if (outline.contextLine) parts.push("", outline.contextLine);
  return parts.join("\n");
}

/** The correction message for the single guided retry. */
export function buildRetryMessage(previousOutput: string, errors: string[]): string {
  return [
    "Your previous response had problems:",
    ...errors.map((e) => `- ${e}`),
    "",
    "Previous response:",
    previousOutput,
    "",
    "Produce the corrected outline now, following the response format",
    "exactly. Output only the outline.",
  ].join("\n");
}
