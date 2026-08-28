/**
 * DRAG-TIME gating for Sphinx, from the same discriminant the planner
 * uses (docs/19; the deferred-lie ban).
 *
 * A drop the planner can only refuse at Review is a lie told by the
 * gesture: the app knew when the pointer was over the row and said so
 * three clicks later, in words about files rather than about what the
 * user did. `guards.ts` exists because a second copy of a rule let the
 * sidebar commit the move the canvas refused — so this is the
 * SAME predicate, not a second one that agrees today.
 *
 * The case: dropping a row UNDER a page whose document hosts no
 * toctree. There is no list to add it to, and creating one is block
 * creation, which moves-only write-back does not do. It arrived as a
 * planner CRASH found by e2e; now it is refused before the drag lands.
 */

import { describe, expect, it } from "vitest";
import { sphinxAdapter } from "@/collections/adapters/sphinx";
import { topicMoveRefusal } from "../guards";
import { refusalSentence } from "@/interaction/moveLabel";
import type { FilesSnapshot } from "@/collections/types";

const CONF = 'master_doc = "index"\nsource_suffix = ".rst"\n';
const PROJECT: FilesSnapshot = {
  "conf.py": CONF,
  "index.rst": [
    "Docs",
    "====",
    "",
    ".. toctree::",
    "   :caption: Guides",
    "",
    "   guides/index",
    "",
    ".. toctree::",
    "   :caption: Reference",
    "",
    "   reference/api",
    "",
  ].join("\n"),
  "guides/index.rst": "Guides\n======\n\n.. toctree::\n\n   install\n",
  "guides/install.rst": "Install\n=======\n\nbody\n",
  "reference/api.rst": "API\n===\n\nbody\n",
};

const doc = () => sphinxAdapter.parse(PROJECT, "p").doc;

describe("dropping under a page with no toctree is refused at drag time", () => {
  it("refuses a drop under a leaf page", () => {
    const d = doc();
    const api = d.sections[1]!.topics[0]!;
    const install = d.sections[0]!.topics[0]!.children[0]!;
    expect(
      topicMoveRefusal(d, [install.id], {
        sectionId: d.sections[1]!.id,
        parentTopicId: api.id,
      }),
    ).toBe("no-nav-list");
  });

  it("allows the SAME row onto the card itself", () => {
    // The complement, and the distinction the refusal turns on: the card
    // is backed by `index.rst`, which has a toctree; the row inside it
    // is backed by `reference/api.rst`, which does not.
    const d = doc();
    const install = d.sections[0]!.topics[0]!.children[0]!;
    expect(
      topicMoveRefusal(d, [install.id], {
        sectionId: d.sections[1]!.id,
        parentTopicId: null,
      }),
    ).toBeNull();
  });

  it("allows a drop under a page that DOES host a toctree", () => {
    const d = doc();
    const guides = d.sections[0]!.topics[0]!;
    const api = d.sections[1]!.topics[0]!;
    expect(
      topicMoveRefusal(d, [api.id], {
        sectionId: d.sections[0]!.id,
        parentTopicId: guides.id,
      }),
    ).toBeNull();
  });

  it("says what happened, in the user's terms", () => {
    const sentence = refusalSentence("no-nav-list");
    expect(sentence).toMatch(/list|toctree/i);
    // Two sentences where a path exists: the fact, then the way round it.
    expect(sentence).toMatch(/card|instead/i);
  });
});

describe("adapters with no such rule are untouched", () => {
  it("does not fire where the adapter declares no predicate", async () => {
    // The absence half. `canHostChildren` is OPTIONAL, and an adapter
    // that omits it must behave exactly as before — a guard that invents
    // the fact it is missing produces a refusal nobody can act on.
    const { hugoAdapter } = await import("@/collections/adapters/hugo");
    expect(hugoAdapter.canHostChildren).toBeUndefined();
  });
});
