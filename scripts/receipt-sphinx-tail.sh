#!/usr/bin/env bash
#
# receipt-sphinx-tail.sh — does a `navTail` patch APPLY, and do the two
# shipped writers AGREE? (docs/19 step 8.)
#
# The port of the session-local `sphinx-experiments.sh` the note named as
# a step-8 obligation. `receipt-move-patch.sh`'s shape: mktemp plus a
# cleanup trap, no absolute paths, real `git apply` as the oracle.
#
# WHAT THIS CHECKS THAT A TEST CANNOT
#
#   1. `git apply` accepts the patch. vitest cannot run git, and a
#      simulation agreeing with itself is not a receipt.
#   2. The two SHIPPED writers produce byte-identical trees. The patch
#      writer and the File System Access writer are independent
#      implementations of one job; docs/16 records what happens when an
#      in-app simulation is used as the oracle instead — it ignored
#      `region` entirely and would have blessed any splice at all.
#   3. NOTHING OUTSIDE THE REGION MOVES. A tail region is a SUFFIX, so
#      the failure mode is silent truncation of every byte above the nav
#      — which is why the corpus has prose there.
#
# WHAT IT CANNOT CHECK, stated so a green run is not over-read: `git
# apply` does NOT enforce hunk start lines. It searches by context and
# accepts a header off by one without a murmur, so this receipt would
# FALSE-PASS on wrong numbering. The offsets are pinned by unit
# assertion in `tailDiff.test.ts` instead.
#
#   bash scripts/receipt-sphinx-tail.sh

set -euo pipefail
cd "$(dirname "$0")/.."

W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT

echo "== generating patches from the shipped planner"
pnpm exec vite-node scripts/emit-sphinx-patches.ts "$W" >/dev/null

fail=0
for patch in "$W"/*.patch; do
  name="$(basename "$patch" .patch)"

  # A fresh checkout per scenario: patches are independent.
  rm -rf "$W/work"
  cp -R "$W/repo" "$W/work"
  git -C "$W/work" init -q .
  git -C "$W/work" -c user.email=r@r -c user.name=r add -A >/dev/null
  git -C "$W/work" -c user.email=r@r -c user.name=r commit -qm base >/dev/null

  # The patch names its own requirements, if it has any. Reading the
  # flag OUT OF THE BYTES rather than deciding it here is the point:
  # a patch that needs a flag it does not name is a patch that fails
  # for a reason the user cannot see.
  flags=""
  if grep -q 'git apply --unidiff-zero' "$patch"; then flags="--unidiff-zero"; fi

  if ! git -C "$W/work" apply $flags "$patch" 2>"$W/err"; then
    echo "  $name: REFUSED by git apply $flags"
    sed 's/^/      /' "$W/err"
    fail=1
    continue
  fi

  # THE DIFFERENTIAL: git's result against the other shipped writer.
  if diff -r "$W/work" "$W/expected/$name" \
      --exclude=.git >"$W/delta" 2>&1; then
    printf '  %-32s APPLIES  · byte-identical to the File System Access writer\n' "$name"
  else
    echo "  $name: WRITERS DISAGREE"
    sed 's/^/      /' "$W/delta" | head -20
    fail=1
    continue
  fi

  # NOTHING OUTSIDE THE REGION MOVED. Asserted on a line that exists
  # only above the nav — the silent-truncation failure would take it.
  if ! grep -q 'A paragraph above the navigation' "$W/work/index.rst"; then
    echo "  $name: PROSE ABOVE THE NAV WAS LOST"
    fail=1
  fi
  # And the file with no trailing newline still has none.
  if [ -n "$(tail -c 1 "$W/work/tools/index.rst")" ]; then
    : # still unterminated, as it was
  else
    echo "  $name: a file gained a trailing newline it never had"
    fail=1
  fi
done

echo
echo "== MEASURED: no tail patch names --unidiff-zero"
# docs/19's first inverted expectation, as an ABSENCE test. The flag's
# class is position-zero anchoring, not "no owned anchor"; a tail is the
# far end of the same file and anchors on its own context. A preamble
# here would also trip `receipt-move-patch.sh`'s flagged-direction
# assertion, which is the fence working.
if grep -l 'unidiff-zero' "$W"/*.patch >/dev/null 2>&1; then
  echo "  UNEXPECTED: a tail patch asks for --unidiff-zero"
  grep -l 'unidiff-zero' "$W"/*.patch | sed 's/^/      /'
  fail=1
else
  echo "  none — as the header experiment predicted"
fi

echo
echo "== MEASURED: a multi-file plan says so and does not offer patch(1)"
# GNU patch is not atomic across files, and a cross-file toctree move is
# multi-entry by construction: a half-applied patch drops the page from
# navigation entirely rather than leaving it slightly wrong.
for name in cross-file-move cross-file-into-unterminated; do
  if grep -q 'belong to ONE change' "$W/$name.patch" &&
     ! grep -q 'patch -p1' "$W/$name.patch"; then
    echo "  $name: names git apply, offers no patch(1)"
  else
    echo "  $name: MULTI-FILE PREAMBLE MISSING OR OFFERS patch(1)"
    fail=1
  fi
done

echo
if [ "$fail" -eq 0 ]; then
  echo "receipt-sphinx-tail: all scenarios green"
else
  echo "receipt-sphinx-tail: FAILURES above"
fi
exit "$fail"
