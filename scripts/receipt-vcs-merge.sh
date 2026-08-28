#!/usr/bin/env bash
# receipt-vcs-merge.sh — The measurement behind docs/15's concurrency
# descope: TOC Fable ships no drift detection because version control
# already resolves the collision, and this proves it rather than asserting
# it.
#
#   bash scripts/receipt-vcs-merge.sh
#
# Two layers, deliberately, because they fail differently and docs/15
# claims both:
#
#   patch layer  — a .patch built at load time applied to a working copy
#                  that has since moved (see the git apply --check rows in
#                  docs/15; that half lives in the test suite, not here)
#   merge layer  — a stale commit landing beside a fresh one, which is what
#                  actually happens when two people edit a docs repo
#
# This script is the merge layer, on Mercurial, because the git half was
# easy to run and therefore easy to over-generalize from. hg is the harder
# case: its patch engine applies with fuzz where git demands exact context,
# so "VCS handles it" needed checking on a second system before docs/15
# could say VCS rather than git.
#
# Requires: hg (pip install mercurial). Verified against hg 7.2.4.
# Writes only inside a temp dir. Never touches a real repo.
#
# ui.merge is pinned to internal:merge so the result is the same on every
# machine. Left to the default, hg may pick a GUI tool or none, and case 2
# then reports unresolved WITHOUT writing conflict markers -- a real run of
# this script caught exactly that, and it read like a failed claim rather
# than an unconfigured tool.

set -u
command -v hg >/dev/null || { echo "hg not installed (pip install mercurial)"; exit 127; }
export HGUSER="${HGUSER:-receipt}"
echo "hg $(hg --version -q | sed 's/.*version //;s/)//')"

W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
fail=0

# ── Case 1: body edit vs front-matter edit → must auto-merge clean ──
# This is the case TOC Fable creates: we write nav metadata from a
# baseline that predates someone else's prose edit.
c1="$W/divergent-regions"; mkdir -p "$c1"; cd "$c1" || exit 1
hg init . -q
printf -- '---\ntitle: Buttons\nparent: UI Components\nnav_order: 2\n---\n\nBody v1.\n' > buttons.md
hg add -q buttons.md; hg commit -q -m base
printf -- '---\ntitle: Buttons\nparent: UI Components\nnav_order: 2\n---\n\nBody v2, rewritten by a colleague.\n' > buttons.md
hg commit -q -m 'A: body v2'
hg update -q -r 0
printf -- '---\ntitle: Buttons\nparent: Components\nnav_order: 2\n---\n\nBody v1.\n' > buttons.md
hg commit -q -m 'B: fm v2 from a stale baseline'
hg --config extensions.rebase= --config ui.merge=internal:merge rebase -s 2 -d 1 -q 2>/dev/null
rc=$?
unresolved="$(hg resolve -l)"
echo
echo "case 1 — body edit vs front-matter edit (what this app causes)"
echo "  rebase exit      : $rc            (expect 0)"
echo "  unresolved       : [$unresolved]  (expect empty)"
if grep -q 'parent: Components' buttons.md && grep -q 'Body v2' buttons.md; then
  echo "  merged file      : fm v2 + body v2 — BOTH survive"
else
  echo "  merged file      : UNEXPECTED"; fail=1
fi
[ "$rc" -eq 0 ] || fail=1
[ -z "$unresolved" ] || fail=1

# ── Case 2: front matter vs front matter → must CONFLICT ──
# The residual docs/15 records. Same key, two values, no way to pick:
# version control must refuse rather than silently choose.
c2="$W/same-region"; mkdir -p "$c2"; cd "$c2" || exit 1
hg init . -q
printf -- '---\ntitle: Buttons\nparent: UI Components\n---\n\nBody.\n' > buttons.md
hg add -q buttons.md; hg commit -q -m base
printf -- '---\ntitle: Buttons\nparent: Widgets\n---\n\nBody.\n' > buttons.md
hg commit -q -m 'A: parent -> Widgets'
hg update -q -r 0
printf -- '---\ntitle: Buttons\nparent: Components\n---\n\nBody.\n' > buttons.md
hg commit -q -m 'B: parent -> Components'
hg --config extensions.rebase= --config ui.merge=internal:merge rebase -s 2 -d 1 -q >/dev/null 2>&1
unresolved2="$(hg resolve -l)"
echo
echo "case 2 — front matter vs front matter (the recorded residual)"
echo "  unresolved       : [$unresolved2]  (expect 'U buttons.md')"
if grep -q '<<<<<<<' buttons.md; then
  echo "  merged file      : conflict markers — the collision SURFACES"
else
  echo "  merged file      : NO CONFLICT — residual claim is wrong"; fail=1
fi
[ -n "$unresolved2" ] || fail=1

echo
if [ "$fail" -eq 0 ]; then
  echo "RECEIPT OK — committed divergence is version control's problem and it"
  echo "solves it. Only same-session UNCOMMITTED front matter is last-writer-wins."
else
  echo "RECEIPT FAILED — docs/15's concurrency descope rests on these rows."
fi
exit "$fail"
