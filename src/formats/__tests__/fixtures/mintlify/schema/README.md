# Mintlify `docs.json` JSON Schema — fetched, never vendored

The schema plank (`mintlifySchema.test.ts`) validates mutated documents
against Mintlify's own published schema. That oracle is **not in git**:
its license could not be determined, so under the 4c ruling
(2026-08-27, final form) it ships in neither the private nor the public
tree. The plank is network-gated instead — the sphinx-corpus shape:

```sh
pnpm fetch-mintlify-schema
```

fetches `docs.schema.json` into this directory (gitignored), and the
plank runs. Without it the plank **skips with its reason** and the
suite stays green on a fresh clone, offline.

- Source URL: <https://mintlify.com/docs.json> — answers **307**;
  the script's `-L` is load-bearing (without redirect following you get
  15 bytes of `text/plain`, and a truncated oracle validates
  everything, which is why the plank carries a known-invalid document
  asserted to FAIL).
- As last retrieved (2026-08-20): 173,532 bytes, `application/json`,
  draft-07 (`definitions`, not `$defs`).

## Why the license is "undetermined" (evidence, retrieved 2026-08-27)

- The served file carries no license or copyright statement of its own.
- The npm packages that validate `docs.json` (`@mintlify/validation`
  0.1.842, `@mintlify/models` 0.0.351) declare **Elastic-2.0** and name
  `github.com/mintlify/mint` as their repository — which answers 404
  (private). (npm registry metadata.)
- `mintlify/starter` and `mintlify/docs` are MIT, but neither contains
  this schema.

So the nearest licensed relatives are source-available (Elastic-2.0),
not MIT, and whether the published schema falls under those terms is
unknown. Not clearly permissive ⇒ the ruled fallback: do not ship it.

## The path back to vendoring

Roger emailed Mintlify on 2026-08-27 asking permission to carry a
verbatim copy as a test oracle; unanswered as of the 4c final-form
ruling, and nothing blocks on the reply. If Mintlify answers yes,
re-vendoring is one commit: remove the `.gitignore` entry, commit the
fetched file with the reply quoted as the receipt, and drop the
`skipIf` gate. If they answer with license terms, record them here
verbatim first.
