/**
 * id.ts — Random, collision-free ids for topics/sections/documents.
 *
 * A sequential counter has to be re-seeded after hydration — forget it
 * once and new ids collide with persisted ones. Random UUIDs delete
 * the problem.
 */

export function newId(): string {
  return crypto.randomUUID();
}
