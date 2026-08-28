#!/usr/bin/env bash
# receipt-move-patch.sh — does `git apply` accept the patches docs/16
# produces for a MOVE whose nav head is also spliced?
#
# The seam docs/16 step 8 names: a region:"navHead" change whose path
# ALSO changed. Every other check in this repo simulates the writers;
# this one hands the bytes to the tool that will actually consume them,
# because "our simulation agrees with itself" is not a receipt.
#
#   bash scripts/receipt-move-patch.sh
#
# Writes only inside a temp dir. Never touches the repo or a corpus.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "== generating patches from the shipped planner"
cd "$ROOT"
pnpm exec vite-node scripts/emit-move-patches.ts "$WORK"

cd "$WORK/repo"
git init -q .
git config user.email r@example.test
git config user.name Receipt
git add -A
git commit -q -m "corpus before"

status=0
for patch in "$WORK"/*.patch; do
  name="$(basename "$patch")"
  printf '%-34s' "$name"

  # A patch carrying a zero-context hunk needs --unidiff-zero, and it
  # SAYS SO in its own first lines. The receipt reads that instruction
  # from the bytes rather than being told out of band, which is what
  # keeps the instruction from going stale: if the writer stops naming
  # the flag, this script stops passing it, and the scenario fails.
  # The gate keys on what the preamble SAYS, not on whether one exists.
  # It used to key on existence, and that was the hole D1 came through:
  # a preamble is now also emitted for renames, which need no flag, so
  # "has a preamble" and "needs --unidiff-zero" are two questions.
  flags=""
  if grep -q 'git apply --unidiff-zero' "$patch"; then
    flags="--unidiff-zero"
    # DEFAULT git apply must refuse it — otherwise the instruction is
    # noise and would rot unnoticed.
    if git apply --check "$patch" 2>/dev/null; then
      echo "DEFAULT APPLY SUCCEEDED — the instruction line is now a lie"
      status=1
      continue
    fi
  else
    # THE COMPLEMENT, and the tripwire whose absence let D1 ship. Every
    # patch that does NOT name the flag must apply under the DEFAULT
    # invocation. Without this, a patch that silently needed a flag it
    # never named looked exactly like a patch that needed nothing —
    # which is precisely what a moved bare page was doing.
    if ! git apply --check "$patch" 2>/tmp/errc.txt; then
      echo "NAMES NO FLAG YET DEFAULT APPLY REFUSES: $(head -2 /tmp/errc.txt | tr '\n' ' ')"
      status=1
      continue
    fi
  fi

  # D2: a patch that renames must not recommend GNU patch, and must warn
  # off --3way. Measured, not assumed: `patch -p1` on a rename+hunk entry
  # exits 0, applies the hunk at the OLD path and never moves the file;
  # `git apply --3way` reads the pre-image from the index and resurrects
  # a worktree-deleted file at the destination.
  if grep -q '^rename from ' "$patch"; then
    if grep -q 'patch -p1' "$patch"; then
      echo "RECOMMENDS GNU patch ON A RENAMING PATCH — it would edit in place and not move"
      status=1
      continue
    fi
    grep -q -- '--3way' "$patch" || {
      echo "RENAMES BUT DOES NOT WARN OFF --3way"; status=1; continue; }
  fi

  if git apply --check $flags "$patch" 2>/tmp/err.txt; then
    git apply $flags "$patch"
    printf 'APPLIES'
    # And the result must equal what the app itself predicted.
    # -x .git: the repo's own directory is not part of the corpus, and
    # comparing it made every scenario report a difference.
    if diff -r -x .git --brief . "$WORK/expected/${name%.patch}" >/dev/null 2>&1; then
      if [ -n "$flags" ]; then
        echo "  · byte-identical to the FSA writer (applied $flags, as its preamble says)"
      else
        echo "  · byte-identical to the File System Access writer"
      fi
    else
      echo "  · WRITERS DISAGREE"
      diff -r -x .git --brief . "$WORK/expected/${name%.patch}" | head -6 || true
      status=1
    fi

    # ── the DIRECTORY set, which the byte comparison cannot see ──
    #
    # `expected/` is materialised from an in-memory snapshot, and an
    # in-memory snapshot has no directories — only paths. So a tree that
    # kept an emptied directory and one that removed it serialise to the
    # same set of files and `diff -r` calls them identical. The oracle
    # was UNDER-DEFINED rather than wrong: it compared everything it
    # could represent, and directories were not in that set.
    #
    # What this asserts is the thing the shipped disclosure claims —
    # "section emptied — directory retained". That sentence was reported
    # as a defect (git rmdirs a directory it empties, measured) and the
    # report DID NOT REPRODUCE here: a dissolved Hugo section keeps its
    # `_index.md`, so the directory never becomes empty and git never
    # touches it. The check exists so that stays true by measurement
    # rather than by the argument above — if a future plan ever moves an
    # `_index.md` out, this fails and the disclosure gets revisited.
    for src in $(grep '^rename from ' "$patch" | sed 's/^rename from //' | xargs -n1 dirname | sort -u); do
      [ "$src" = "." ] && continue
      if [ -n "$(git ls-files "$src" 2>/dev/null)" ]; then
        if [ -d "$src" ]; then
          echo "  · directory set: source '$src' retained (files remain), as the disclosure says"
        else
          echo "  · DIRECTORY SET: '$src' vanished while still holding tracked files"
          status=1
        fi
      else
        echo "  · DIRECTORY SET: '$src' was fully emptied — the disclosure does not cover this"
        status=1
      fi
    done

    # reset --hard, not checkout: a patch that RENAMED leaves the new
    # path untracked, and `git checkout -- .` fails on it — which killed
    # the loop after the first scenario under `set -e`.
    # RE-APPLICATION, pinned as MEASURED rather than as predicted.
    #
    # The expectation going in was a documented residual: a zero-context
    # hunk carries no context, so `git apply` should have nothing to
    # notice and a second application should stack a second front-matter
    # block. It does not — git refuses, which is the SAFE outcome and
    # better than the accepted-residual this scenario was written to
    # record. Pinned so the safety cannot regress unnoticed.
    #
    # NOT verified for `patch -p1`, the flag-free alternative the
    # preamble also offers: GNU patch is far more permissive about
    # re-application, and claiming idempotence there without measuring it
    # would be exactly the kind of unearned assurance this receipt
    # exists to refuse.
    if [ -n "$flags" ]; then
      if git apply $flags "$patch" 2>/dev/null; then
        echo "  · RE-APPLY SUCCEEDED — git no longer refuses; check for stacked front matter"
        status=1
      else
        echo "  · re-apply refused by git (safe; the predicted stacking does not occur)"
      fi
    fi
    git reset --hard -q
    git clean -qfd
  else
    echo "REFUSED: $(head -2 /tmp/err.txt | tr '\n' ' ')"
    status=1
  fi
done

# ── DOCUMENTED REASON: why GNU patch is no longer offered ──────────
#
# Every other scenario above asserts that OUR bytes are right. This one
# asserts that a TOOL is wrong, which is a different kind of claim and
# needs its own label. We cannot fix GNU patch; what we fixed is that
# this project used to tell users to run it. The misbehavior is pinned
# so that "we stopped recommending it" keeps its reason attached, and so
# that a future version of patch(1) which learns renames shows up here
# as a surprise rather than as folklore.
echo
echo "== DOCUMENTED REASON: GNU patch on a rename (why the preamble no longer offers it)"
PW="$WORK/gnu"; mkdir -p "$PW/old"
printf -- '---\ntitle: A\n---\nbody\n' > "$PW/old/a.md"
cat > "$PW/rh.patch" <<'PATCH'
diff --git a/old/a.md b/new/a.md
rename from old/a.md
rename to new/a.md
--- a/old/a.md
+++ b/new/a.md
@@ -1,3 +1,4 @@
 ---
 title: A
+weight: 5
 ---
PATCH
( cd "$PW" && /usr/bin/patch -p1 < rh.patch >/dev/null 2>&1; echo "  patch -p1 exit=$?" )
moved="no";  [ -f "$PW/new/a.md" ] && moved="yes"
stayed="no"; [ -f "$PW/old/a.md" ] && stayed="yes"
edited="no"; grep -q 'weight: 5' "$PW/old/a.md" 2>/dev/null && edited="yes"
echo "  moved to new path: $moved | still at old path: $stayed | old path EDITED: $edited"
if [ "$moved" = "no" ] && [ "$stayed" = "yes" ] && [ "$edited" = "yes" ]; then
  echo "  · PINNED: exits 0, edits at the OLD path, never moves — succeeds at the wrong thing"
else
  echo "  · BEHAVIOUR CHANGED — patch(1) no longer does this; revisit the preamble"
  status=1
fi

exit "$status"
