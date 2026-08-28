# Hugo fixtures — attribution

## `hugo/` — real files from kubernetes/website

Vendored from **[kubernetes/website](https://github.com/kubernetes/website)**
at commit `6449f1e`, the source of the survey in
[docs/14](../../../../../docs/14-hugo-adapter.md).

- **License:** CC BY 4.0 (documentation content), per the upstream
  repository's `LICENSE`. Attribution: the Kubernetes Authors / SIG Docs.
- **Modifications:** none. Files are byte-identical to upstream, which is
  the point — the round-trip law is asserted against real bytes, and
  reformatting them would quietly test our own output instead.

Contents are a slice, not the corpus: `hugo.toml` (read for `contentDir`,
`ignoreFiles`, `theme` and the language table) plus `concepts/` and
`setup/` landing pages and the `concepts/architecture` section, chosen
because it carries real weights, real nesting, and both `_index.md` and
ordinary pages.

The full corpus lives outside this repo (`~/k8s-website`, read-only) and
is re-measured by `scripts/survey-hugo.ts`.

## `hugo-edges/` — synthetic

Hand-written, no license constraint. One directory per hazard docs/14
names, so a failure points at a named case rather than at "the fixture":

| path | case |
| --- | --- |
| `ordering/` | weighted, duplicate weights, unweighted-sorts-last, both `linktitle` spellings |
| `bundle/glossary/` | leaf bundle — `index.md` plus sibling **resources** that must not become topics |
| `implicit/nested/` | a directory with pages and **no `_index.md`** |
| `flags/` | `no_list`, `toc_hide`, `headless`, the `card.weight` decoy, a front-matter-less page, TOML front matter, and the trailing-space fence from issue #1 |

**Do not reformat either directory.** Both are Prettier-ignored and
`-text` in `.gitattributes`; a formatting pass once silently
LF-normalized a CRLF fixture, and the trailing-space fence in
`flags/trailing-space-fence.md` is load-bearing — an editor that trims it
deletes the test.
