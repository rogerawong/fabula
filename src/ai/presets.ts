/**
 * presets.ts — IA-optimization presets. A preset is a STARTING TEMPLATE
 * for the visible, editable instruction field — the textarea is the
 * source of truth for what's sent; numbers live in the text where the
 * user can edit them. `defaults` seed the structured toggles (which
 * gate code behavior, not just prompt wording).
 */

export interface Preset {
  id: string;
  label: string;
  blurb: string;
  template: string;
  /**
   * TWO FIELDS, deliberately. `allowFileMoves` is absent and must stay
   * absent: presets are editable instruction templates, and a template
   * that silently re-enables disk moves is a template with a side
   * effect. Off is the only default a run may inherit (docs/16).
   */
  defaults: { allowNewSections: boolean; allowRenames: boolean };
}

export const PRESETS: Preset[] = [
  {
    id: "balance",
    label: "Balance & right-size",
    blurb: "Merge tiny sections, split oversized ones",
    template:
      "Reorganize this table of contents so sections are comparably sized. " +
      "Merge sections with fewer than 3 topics into the most closely related " +
      "section. Split sections larger than about 12 topics into coherent " +
      "groups. Aim for 4–10 top-level sections overall. Logical affinity " +
      "matters more than exact counts — never group unrelated topics just to " +
      "hit a number.",
    defaults: { allowNewSections: true, allowRenames: false },
  },
  {
    id: "flatten",
    label: "Flatten deep nesting",
    blurb: "Promote topics buried past a depth budget",
    template:
      "Reduce nesting so no topic sits deeper than 3 levels. Promote buried " +
      "topics upward into sensible groups. Eliminate single-child chains " +
      "(a parent with exactly one child). Keep closely related topics " +
      "adjacent after promotion.",
    defaults: { allowNewSections: true, allowRenames: false },
  },
  {
    id: "journey",
    label: "Reader journey",
    blurb: "Order as a learning path, start to reference",
    template:
      "Reorder the table of contents as a reader's learning journey: " +
      "orientation and overview first; then installation and getting " +
      "started; then core everyday tasks; then advanced usage; then " +
      "reference material; and finally meta content (FAQ, changelog, " +
      "release notes) last. Move topics between sections where it serves " +
      "the journey.",
    defaults: { allowNewSections: true, allowRenames: false },
  },
  {
    id: "diataxis",
    label: "Diátaxis grouping",
    blurb: "Tutorials · How-to · Reference · Explanation",
    template:
      "Regroup all content following the Diátaxis framework into four " +
      'top-level sections: "Tutorials" (learning-oriented lessons), ' +
      '"How-to guides" (task-oriented steps), "Reference" ' +
      '(information-oriented descriptions), and "Explanation" ' +
      "(understanding-oriented discussion). Add one extra section only for " +
      "content that genuinely fits none of the four (e.g. a changelog). " +
      "Preserve sensible ordering within each group.",
    defaults: { allowNewSections: true, allowRenames: true },
  },
];

export const DEFAULT_PRESET_ID = PRESETS[0]!.id;
