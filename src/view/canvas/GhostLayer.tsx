/**
 * GhostLayer.tsx — Renders the fading shells of removed cards. The
 * fade animation class is present at first commit (a ghost mounts WITH
 * its animation — docs/05 rule 1); the store removes it after the run.
 */

import { useGhostStore, GHOST_MS } from "@/animation/ghosts";

export function GhostLayer() {
  const ghosts = useGhostStore((s) => s.ghosts);
  if (ghosts.length === 0) return null;
  return (
    <>
      {ghosts.map((g) => (
        <div
          key={g.key}
          data-testid="ghost-card"
          aria-hidden="true"
          className="pointer-events-none fixed z-40 animate-[ghost-fade_var(--ghost-ms)_ease-out_forwards] rounded-lg border-[2.5px] border-dashed border-neutral-400 bg-white/50"
          style={
            {
              left: g.left,
              top: g.top,
              width: g.width,
              height: g.height,
              "--ghost-ms": `${GHOST_MS}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}
