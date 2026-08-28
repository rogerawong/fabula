Fixtures for the Mintlify `docs.json` adapter (design in docs/13).

Vendored files are MIT, © Mintlify, Inc.:

- `starter-docs.json` — **verbatim** from
  https://github.com/mintlify/starter at commit
  `92e9a1a2db4803a4c596e83540a3576168f88fcb`. Copied byte-for-byte,
  including the fact that it has **no trailing newline** — that is a real
  formatting property the round trip has to reproduce, not an oversight
  to tidy up. This is the fixture the input-identity assertion runs on:
  `serialize(parse(x)) === x`, a stronger bar than any shipped adapter
  currently meets.
- `docs-reduced.json` — a **reduced slice** of
  https://github.com/mintlify/docs at commit
  `6e09e8eef029c2824804e2b9cbb694524b8a001d` (23 KB → 6.9 KB). Trimmed by
  deletion only: tabs, groups and page lists are shortened, and nothing
  is invented or edited. All 18 top-level keys are kept so the
  "non-navigation keys round-trip untouched" test has real subjects, and
  the structural shapes survive — two tabs, nine groups, nested groups
  inside `pages`, the `root` / `boost` / `hidden` group metadata, and all
  three `{"$ref": "./xx.json"}` language pointers.

  Its indentation is canonicalised at 2 spaces. The source file has
  hand-edited indentation drift (89 of 727 lines, whitespace only), which
  docs/13 records as a hazard; reproducing the drift in a trimmed file
  would be meaningless, so this fixture cannot be used for an
  input-identity assertion. Use `starter-docs.json` for that.

Ours, not vendored:

- `synthetic-shapes.json` — carries the navigation entry shapes **neither
  real corpus contains**: `openapi` (both string and object forms),
  `asyncapi`, an external `href` entry inside a `pages` array, a `page`
  object, and an unrecognised future key. The survey found **zero**
  OpenAPI entries in mintlify/docs — its API reference is configured from
  page frontmatter, not navigation — so these shapes have no real-world
  coverage here and must not be presented as if they do. Same caveat as
  the Sphinx rename syntax in docs/12.

Not vendored on purpose: `mint.json`. The legacy schema is detected and
redirected to Mintlify's upgrade path, never parsed (docs/13), so a
fixture would only test an error message — one synthetic line in the
adapter's own test covers that better than a vendored file.

- `tabs-rooted-valid.json` — **synthetic**, and the only container-rooted
  fixture here that validates against Mintlify's published schema
  (`schema/docs.schema.json`). It exists because the plank in
  `mintlifySchema.test.ts` has to mutate a document that was VALID to
  begin with, and measured on 2026-08-20 none of the other three
  container-rooted or reduced fixtures is: `docs-reduced.json` keeps
  `{"$ref": "./redirects.json"}` and three bare `{"$ref": …}` language
  entries verbatim from mintlify/docs, and the published schema models
  no `$ref` composition at all; `empty-container.json` and
  `synthetic-shapes.json` omit `colors` (required at root) and carry a
  `_comment` key that `additionalProperties: false` rejects. Those three
  remain exactly as they were — they are inputs for parse, round-trip
  and refusal tests, none of which need schema validity.

MIT's one condition is that the copyright and permission notice travel
with copies, so it is carried here verbatim (mintlify/starter `LICENSE`,
retrieved 2026-08-27; mintlify/docs declares the same license):

> MIT License
>
> Copyright (c) 2026 Mintlify
>
> Permission is hereby granted, free of charge, to any person obtaining
> a copy of this software and associated documentation files (the
> "Software"), to deal in the Software without restriction, including
> without limitation the rights to use, copy, modify, merge, publish,
> distribute, sublicense, and/or sell copies of the Software, and to
> permit persons to whom the Software is furnished to do so, subject to
> the following conditions:
>
> The above copyright notice and this permission notice shall be
> included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
> EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
> MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
> IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
> CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
> TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
> SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The **schema** the plank test validates against is NOT covered by the
notice above and is NOT vendored at all — its license is undetermined,
so it is fetched at test time and gitignored. `schema/README.md`
carries the evidence, the ruling and the fetch command.
