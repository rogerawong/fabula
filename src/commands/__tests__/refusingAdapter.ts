/**
 * The refusing side of `supportsReparent`, as a shared fixture.
 *
 * After docs/16 step 3 NO shipped adapter declares `supportsReparent:
 * false` — Hugo was the only occupant and the capability is a birth
 * state, not a fixed property. The mechanism stays because it is the
 * contract point where the next membership-is-path adapter declares
 * which side it is on, so the stage has to stay exercised between
 * occupants.
 *
 * REGISTERED, not mocked: what these tests are for is the real wiring
 * from `doc.formatId` through the registry to the executor and the drag
 * layer. A mocked capability proves only that the mock works.
 *
 * Importing this module registers it. Idempotent, so two importing test
 * files do not double-register.
 */

import { COLLECTION_ADAPTERS } from "@/collections/registry";
import type { CollectionAdapter } from "@/collections/types";

export const REFUSING = "fixture-no-reparent";

const refusingAdapter = {
  id: REFUSING,
  label: "Fixture (cannot reparent)",
  ingests: () => false,
  detect: () => 0,
  supportsReparent: false,
  // Declared even though the cast below would let them be omitted: a
  // registry occupant answering `undefined` here is the exact silent gap
  // the required fields exist to close, and a fixture that models the
  // gap teaches the next adapter to have it.
  //
  // BOTH of these were added because the live-registry assertion went
  // red, not because the compiler complained — it cannot, past a cast.
  // `nodesNeedTargets` arrived in docs/19 and this fixture was
  // `undefined` on its first run.
  reparentMovesFiles: false,
  nodesNeedTargets: false,
  // The third one added for the same reason and by the same route: the
  // live-registry assertion went red, the compiler stayed silent.
  rootBearing: { sections: true, orphans: true },
  parse: () => {
    throw new Error("fixture adapter is a capability declaration only");
  },
} as unknown as CollectionAdapter;

if (!COLLECTION_ADAPTERS.some((a) => a.id === REFUSING)) {
  COLLECTION_ADAPTERS.push(refusingAdapter);
}
