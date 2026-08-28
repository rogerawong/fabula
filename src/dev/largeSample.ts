/**
 * largeSample.ts — Deterministic 1,000-topic document for the M3
 * performance gate ("60fps pan on a 1,000-topic fixture", docs/08).
 * Dev-only: wired into the Load menu behind import.meta.env.DEV.
 */

import { newId } from "@/model/id";
import type { Section, TocDocument, Topic } from "@/model/types";

const SECTIONS = 44;
const L1_PER_SECTION = 10; // 44 × (10 L1 + 10 L2 + 3 L3) = 1,012 topics

function topic(title: string, path: string, children: Topic[] = []): Topic {
  return { id: newId(), title, path, children };
}

export function makeLargeSample(): TocDocument {
  const sections: Section[] = [];
  for (let s = 0; s < SECTIONS; s++) {
    const topics: Topic[] = [];
    for (let i = 0; i < L1_PER_SECTION; i++) {
      const children: Topic[] = [];
      // every other L1 gets 2 children; every 5th child gets 1 grandchild
      if (i % 2 === 0) {
        for (let j = 0; j < 2; j++) {
          const grandchildren =
            (i + j) % 4 === 0
              ? [topic(`Detail ${s}.${i}.${j}.0`, `s${s}/t${i}/c${j}/d0.md`)]
              : [];
          children.push(
            topic(`Subtopic ${s}.${i}.${j}`, `s${s}/t${i}/c${j}.md`, grandchildren),
          );
        }
      }
      topics.push(topic(`Topic ${s}.${i}`, `s${s}/t${i}.md`, children));
    }
    sections.push({ id: newId(), title: `Section ${s + 1}`, topics });
  }
  return {
    id: newId(),
    name: "Large Sample (1k topics)",
    formatId: "docfx",
    extras: { rootStyle: "items" },
    sections,
  };
}
