/**
 * trainingNote.test.ts — the training-disclosure copy near the AI key
 * input (docs/08 backlog item, shipped release-prep 2026-08-27).
 *
 * The copy is a CLAIM about what a provider does with submitted data,
 * and the claims differ per preset: a free-tier provider that trains on
 * submissions and a paid-only provider that does not by default are two
 * different sentences, and copying one onto the other is a lie told to
 * the person least able to check it (the keyLabel precedent, docs/10).
 * These tests pin the load-bearing distinctions, not the full prose —
 * wording may be edited; the direction of each claim may not.
 *
 * Asserted over the LIVE registry, not the interface: presets reach
 * PROVIDERS from tests and fixtures too, and a cast pierces the
 * required-field guarantee for exactly the objects that skipped review.
 */

import { describe, expect, it } from "vitest";
import { PROVIDERS, getProvider } from "../providers";

describe("every preset carries a training disclosure", () => {
  it.each(PROVIDERS.map((p) => [p.id] as const))(
    "%s declares a non-empty trainingNote",
    (id) => {
      expect(getProvider(id).trainingNote.trim()).not.toBe("");
    },
  );
});

describe("the claims point in their measured directions", () => {
  it("the free-tier preset says submissions are used for training", () => {
    // Gemini API Additional Terms, Unpaid Services: "Google uses the
    // content you submit … to provide, improve, and develop Google
    // products and services and machine learning technologies."
    // (retrieved 2026-08-27)
    const note = getProvider("gemini").trainingNote.toLowerCase();
    expect(note).toContain("train");
    // …and must not claim the opposite
    expect(note).not.toMatch(/not|never/);
  });

  it("the Claude preset attributes its no-training-by-default claim", () => {
    // Anthropic privacy center: "By default, we will not use your
    // inputs or outputs from our commercial products (e.g. … Anthropic
    // API …) to train our models." (retrieved 2026-08-27). The claim is
    // Anthropic's, so the copy names Anthropic and keeps "by default" —
    // an unattributed absolute would be a stronger claim than the
    // source makes.
    const note = getProvider("claude").trainingNote;
    expect(note).toContain("Anthropic");
    expect(note.toLowerCase()).toContain("not");
    expect(note.toLowerCase()).toContain("by default");
  });

  it("the custom preset is conditional — this app cannot know", () => {
    // An arbitrary OpenAI-compatible endpoint has no policy this app
    // can verify, so the copy sends the user to the provider's terms
    // rather than asserting either direction on their behalf.
    const note = getProvider("custom").trainingNote.toLowerCase();
    expect(note).toMatch(/terms|policy/);
    expect(note).not.toMatch(/does not train|will not train/);
  });

  it("no two presets share a note — different presets, different claims", () => {
    const notes = PROVIDERS.map((p) => p.trainingNote);
    expect(new Set(notes).size).toBe(notes.length);
  });
});
