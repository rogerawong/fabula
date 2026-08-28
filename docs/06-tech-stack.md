# Tech Stack

Decisions with rationale. Bias: boring, proven, few dependencies — this is
a client-only SPA that should still build cleanly in five years.

| Concern | Choice | Rationale / rejected alternatives |
|---|---|---|
| Language | TypeScript, strict | Non-negotiable. |
| UI | React 19 | Team/model familiarity; prototyping proved it handles this app fine. Rejected: Svelte/Solid (no advantage worth losing the ecosystem). |
| Build | Vite 7 | Fast, `?raw` imports for YAML fixtures/samples, vitest integration. |
| State | Zustand + Immer (`produceWithPatches`) | Tiny, selector-based subscriptions kill prop-drilling; Immer patches give undo/redo nearly free (see 03). Rejected: Redux Toolkit (heavier, same patch trick available but more ceremony), plain context+reducer (re-render control is exactly where prototyping bled), XState for global state (overkill; state machines live in the interaction layer as plain TS). |
| Styling | Tailwind CSS 4 + shadcn/ui | CSS-based config, OKLCH tokens. Only import the shadcn primitives actually used. |
| Drag & drop | Custom pointer-event machines | The canvas work (zoom-aware coordinates, tree hit-testing, drop-on-canvas) is beyond dnd-kit's model anyway; prototyping ended up custom for everything that mattered. One system, no library. Rejected: dnd-kit (a library for the sidebar alone creates a second parallel drag system). |
| Animation | Web Animations API + CSS transitions | One FLIP utility (05). Rejected: Motion/framer (large, and FLIP-on-command-hints is simple enough by hand). |
| YAML | js-yaml | Round-trip behavior proven in prototyping. Watch item: key-order/format preservation is best-effort; if minimal-diff export needs more, evaluate `yaml` (eemeli) which preserves comments/formatting via CST — likely a post-v1 adapter-level upgrade. |
| Code view | CodeMirror 6 (read-only, YAML) | Monaco measured ~70% of a prototype bundle for a read-only viewer. CM6 is ~10x smaller and lazy-loadable. Rejected: Monaco (weight), `<pre>` + highlighter (loses line numbers/selection niceties — acceptable fallback if CM6 annoys). |
| Toasts | sonner | Small, proven in prototyping. |
| Icons | lucide-react | Small, proven in prototyping. |
| Routing | none | Single view. Rejected: any router (a router for one route is pure weight — prototyping carried exactly that). |
| Tests | Vitest + Playwright | Vitest for model/commands/adapters (conformance suite), Playwright for smoke flows (07). |
| Package manager | pnpm 10 | Settings in `pnpm-workspace.yaml` (pnpm 10 ignores `package.json#pnpm` — learned the hard way). |
| Deploy | GitHub Pages via Actions | Static output only; no server in the repo at all (a server that exists only to serve static files is weight with no job). |
| Fonts | Self-hosted Inter + JetBrains Mono | Kills the Google Fonts runtime dependency (privacy + offline). |
| Lint/format | Prettier + ESLint (typescript-eslint, react-hooks) | hooks-lint catches a real bug class prototyping shipped. |

## Dependency budget

Runtime deps target: **under ~15** (react, react-dom, zustand, immer,
js-yaml, sonner, lucide-react, CM6 packages, clsx/tailwind-merge, cva,
radix primitives as needed). Every addition beyond this list needs a
rationale in the PR.

## Node/tooling baseline

Node ≥ 22 LTS, pnpm 10.x. CI: GitHub Actions — `pnpm check`
(tsc), `pnpm lint`, `pnpm test`, `pnpm build`, Playwright smoke on PRs,
deploy on main.
