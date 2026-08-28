/**
 * The silhouette is a MEASUREMENT STANDIN, so its shape is asserted
 * rather than trusted: a fixture that quietly drifts from the corpus it
 * mimics turns a performance verdict into a performance anecdote.
 * Corpus figures come from scripts/survey-hugo.ts over kubernetes/website.
 */

import { describe, expect, it } from "vitest";
import type { Topic } from "@/model/types";
import { K8S_MAX_DEPTH, K8S_TOPIC_COUNT, makeK8sSilhouette } from "../k8sSilhouette";

const doc = makeK8sSilhouette();

function walk(
  topics: Topic[],
  depth = 1,
): { total: number; deepest: number; containers: number } {
  let total = 0;
  let deepest = depth;
  let containers = 0;
  for (const t of topics) {
    total += 1;
    if (t.children.length > 0) {
      containers += 1;
      const sub = walk(t.children, depth + 1);
      total += sub.total;
      containers += sub.containers;
      deepest = Math.max(deepest, sub.deepest);
    }
  }
  return { total, deepest, containers };
}

const stats = doc.sections.map((s) => walk(s.topics));

describe("k8s silhouette matches the surveyed corpus", () => {
  it("has 1,672 topics — the real page count", () => {
    expect(stats.reduce((n, s) => n + s.total, 0)).toBe(1672);
    expect(K8S_TOPIC_COUNT).toBe(1672);
  });

  it("has the seven top-level sections kubernetes.io/docs presents", () => {
    expect(doc.sections.map((s) => s.title)).toEqual([
      "Home",
      "Setup",
      "Concepts",
      "Tasks",
      "Tutorials",
      "Reference",
      "Contribute",
    ]);
  });

  it("nests 5 levels deep, no deeper", () => {
    expect(Math.max(...stats.map((s) => s.deepest))).toBe(K8S_MAX_DEPTH);
  });

  it("is LOPSIDED — one card holds ~70% of the site", () => {
    // The property that makes this fixture worth having. An even spread
    // would be 239 topics per card and would not exercise the case.
    const reference = stats[5]!.total;
    expect(reference).toBe(1163);
    expect(reference / K8S_TOPIC_COUNT).toBeGreaterThan(0.69);
    const smallest = Math.min(...stats.map((s) => s.total));
    expect(smallest).toBe(5);
  });

  it("has container nodes in the corpus's order of magnitude (183 dirs)", () => {
    const containers = stats.reduce((n, s) => n + s.containers, 0);
    expect(containers).toBeGreaterThan(140);
    expect(containers).toBeLessThan(260);
  });

  it("is deterministic in shape across builds", () => {
    const a = makeK8sSilhouette();
    const b = makeK8sSilhouette();
    const shape = (d: typeof a): unknown =>
      d.sections.map((s) => walk(s.topics).total + ":" + walk(s.topics).deepest);
    expect(shape(a)).toEqual(shape(b));
  });
});
