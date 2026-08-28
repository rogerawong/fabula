/** Tiny builders for model-layer tests. */

import { newId } from "../id";
import type { Section, TocDocument, Topic } from "../types";

export function topic(title: string, children: Topic[] = [], path?: string): Topic {
  return { id: newId(), title, path, children };
}

export function section(title: string, topics: Topic[]): Section {
  return { id: newId(), title, topics };
}

export function doc(sections: Section[]): TocDocument {
  return { id: newId(), name: "Test Doc", formatId: "test", sections };
}

/**
 * A small, shape-diverse document:
 *
 *   Guide            Reference        (orphan) FAQ
 *   ├─ Intro         └─ API
 *   ├─ Setup            ├─ Core
 *   │  ├─ Install       └─ Plugins
 *   │  └─ Config
 *   └─ Advanced
 */
export function sampleDoc(): TocDocument {
  const guide = section("Guide", [
    topic("Intro", [], "intro.md"),
    topic(
      "Setup",
      [topic("Install", [], "install.md"), topic("Config", [], "config.md")],
      "setup/",
    ),
    topic("Advanced", [], "advanced.md"),
  ]);
  const reference = section("Reference", [
    topic("API", [topic("Core"), topic("Plugins")]),
  ]);
  const faq: Section = {
    id: newId(),
    title: "FAQ",
    isOrphan: true,
    topics: [topic("FAQ", [], "faq.md")],
  };
  return doc([guide, reference, faq]);
}
