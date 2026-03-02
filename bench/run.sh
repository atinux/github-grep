#!/usr/bin/env bash
#
# Benchmark: github-grep (local grep) vs gh CLI (GitHub API)
#
# Usage:
#   ./bench/run.sh                          # uses defaults
#   REPO=nuxt/nuxt DIR=.github-grep ./bench/run.sh
#
# Prerequisites:
#   - gh CLI installed and authenticated
#   - github-grep data already fetched in $DIR
#   - (optional) ripgrep installed for rg benchmarks

set -euo pipefail

REPO="${REPO:-nuxt-hub/core}"
DIR="${DIR:-.github-grep}"
ISSUES_DIR="$DIR/issues"
RUNS="${RUNS:-5}"

if [ ! -d "$ISSUES_DIR" ]; then
  echo "Error: $ISSUES_DIR not found. Run github-grep first:"
  echo "  pnpm dev -- --repo $REPO"
  exit 1
fi

if ! command -v gh &> /dev/null; then
  echo "Error: gh CLI not found. Install it: https://cli.github.com/"
  exit 1
fi

HAS_RG=false
if command -v rg &> /dev/null; then
  HAS_RG=true
fi

ISSUE_COUNT=$(ls "$ISSUES_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "============================================"
echo " github-grep benchmark"
echo "============================================"
echo ""
echo " Repo:       $REPO"
echo " Issues:     $ISSUE_COUNT files in $ISSUES_DIR"
echo " Runs:       $RUNS (per query, median reported)"
echo " ripgrep:    $HAS_RG"
echo ""
echo "--------------------------------------------"

# Time a command N times, return median in ms
bench() {
  local label="$1"
  shift
  local times=()

  for ((i = 0; i < RUNS; i++)); do
    local start end elapsed
    start=$(python3 -c 'import time; print(int(time.time()*1000))')
    eval "$@" > /dev/null 2>&1 || true
    end=$(python3 -c 'import time; print(int(time.time()*1000))')
    elapsed=$((end - start))
    times+=("$elapsed")
  done

  # Sort and pick median
  IFS=$'\n' sorted=($(sort -n <<<"${times[*]}")); unset IFS
  local mid=$(( RUNS / 2 ))
  local median="${sorted[$mid]}"
  echo "$median"
}

# Count results from a command
count_results() {
  local result
  result=$(eval "$@" 2>/dev/null) || true
  if [ -z "$result" ]; then
    echo "0"
  else
    echo "$result" | wc -l | tr -d ' '
  fi
}

print_row() {
  printf "  %-42s %8s %8s %8s %8s\n" "$1" "$2" "$3" "$4" "$5"
}

echo ""
print_row "Query" "grep" "rg" "gh CLI" "gh API"
print_row "$(printf '%.0s-' {1..42})" "--------" "--------" "--------" "--------"

# ---- Query 1: Simple keyword search ----
QUERY="blob"
GREP_CMD="grep -rl '$QUERY' '$ISSUES_DIR/'"
RG_CMD="rg -l '$QUERY' '$ISSUES_DIR/'"
GH_CMD="gh issue list -R '$REPO' --search '$QUERY' --limit 100 --json number"
GH_API_CMD="gh api '/search/issues?q=$QUERY+repo:$REPO&per_page=100' --jq '.total_count'"

t_grep=$(bench "grep" "$GREP_CMD")
t_rg="n/a"
[ "$HAS_RG" = true ] && t_rg=$(bench "rg" "$RG_CMD")
t_gh=$(bench "gh" "$GH_CMD")
t_api=$(bench "api" "$GH_API_CMD")

c_grep=$(count_results "$GREP_CMD")
c_rg="n/a"
[ "$HAS_RG" = true ] && c_rg=$(count_results "$RG_CMD")
c_gh=$(count_results "$GH_CMD" | head -1)
c_api=$(eval "$GH_API_CMD" 2>/dev/null || echo "?")

print_row "\"$QUERY\" (keyword)" "${t_grep}ms/$c_grep" "${t_rg}ms/$c_rg" "${t_gh}ms/$c_gh" "${t_api}ms/$c_api"

# ---- Query 2: Search in comments ----
QUERY="workaround"
GREP_CMD="grep -rl '$QUERY' '$ISSUES_DIR/'"
RG_CMD="rg -l '$QUERY' '$ISSUES_DIR/'"
GH_CMD="gh issue list -R '$REPO' --search '$QUERY in:comments' --limit 100 --json number"
GH_API_CMD="gh api '/search/issues?q=$QUERY+in:comments+repo:$REPO&per_page=100' --jq '.total_count'"

t_grep=$(bench "grep" "$GREP_CMD")
t_rg="n/a"
[ "$HAS_RG" = true ] && t_rg=$(bench "rg" "$RG_CMD")
t_gh=$(bench "gh" "$GH_CMD")
t_api=$(bench "api" "$GH_API_CMD")

c_grep=$(count_results "$GREP_CMD")
c_rg="n/a"
[ "$HAS_RG" = true ] && c_rg=$(count_results "$RG_CMD")
c_gh=$(count_results "$GH_CMD" | head -1)
c_api=$(eval "$GH_API_CMD" 2>/dev/null || echo "?")

print_row "\"$QUERY\" (in comments)" "${t_grep}ms/$c_grep" "${t_rg}ms/$c_rg" "${t_gh}ms/$c_gh" "${t_api}ms/$c_api"

# ---- Query 3: Regex search ----
QUERY_DISPLAY="deploy.+fail"
GREP_CMD="grep -rlE 'deploy.+fail' '$ISSUES_DIR/'"
RG_CMD="rg -l 'deploy.+fail' '$ISSUES_DIR/'"
GH_CMD="gh issue list -R '$REPO' --search 'deploy fail' --limit 100 --json number"
GH_API_CMD="gh api '/search/issues?q=deploy+fail+repo:$REPO&per_page=100' --jq '.total_count'"

t_grep=$(bench "grep" "$GREP_CMD")
t_rg="n/a"
[ "$HAS_RG" = true ] && t_rg=$(bench "rg" "$RG_CMD")
t_gh=$(bench "gh" "$GH_CMD")
t_api=$(bench "api" "$GH_API_CMD")

c_grep=$(count_results "$GREP_CMD")
c_rg="n/a"
[ "$HAS_RG" = true ] && c_rg=$(count_results "$RG_CMD")
c_gh=$(count_results "$GH_CMD" | head -1)
c_api=$(eval "$GH_API_CMD" 2>/dev/null || echo "?")

print_row "/$QUERY_DISPLAY/ (regex)" "${t_grep}ms/$c_grep" "${t_rg}ms/$c_rg" "${t_gh}ms/$c_gh" "${t_api}ms/$c_api"

# ---- Query 4: Author filter ----
AUTHOR="atinux"
GREP_CMD="grep -rl 'author: \"$AUTHOR\"' '$ISSUES_DIR/'"
RG_CMD="rg -l 'author: \"$AUTHOR\"' '$ISSUES_DIR/'"
GH_CMD="gh issue list -R '$REPO' --author '$AUTHOR' --limit 100 --state all --json number"
GH_API_CMD="gh api '/search/issues?q=author:$AUTHOR+repo:$REPO&per_page=100' --jq '.total_count'"

t_grep=$(bench "grep" "$GREP_CMD")
t_rg="n/a"
[ "$HAS_RG" = true ] && t_rg=$(bench "rg" "$RG_CMD")
t_gh=$(bench "gh" "$GH_CMD")
t_api=$(bench "api" "$GH_API_CMD")

c_grep=$(count_results "$GREP_CMD")
c_rg="n/a"
[ "$HAS_RG" = true ] && c_rg=$(count_results "$RG_CMD")
c_gh=$(count_results "$GH_CMD" | head -1)
c_api=$(eval "$GH_API_CMD" 2>/dev/null || echo "?")

print_row "author:$AUTHOR" "${t_grep}ms/$c_grep" "${t_rg}ms/$c_rg" "${t_gh}ms/$c_gh" "${t_api}ms/$c_api"

# ---- Query 5: Label + state filter ----
GREP_CMD="grep -rl 'state: open' '$ISSUES_DIR/' | xargs grep -l 'bug'"
RG_CMD_LABEL=""
if [ "$HAS_RG" = true ]; then
  RG_CMD_LABEL="rg -l 'state: open' '$ISSUES_DIR/' | xargs rg -l 'bug'"
fi
GH_CMD="gh issue list -R '$REPO' --label 'bug' --state open --limit 100 --json number"
GH_API_CMD="gh api '/search/issues?q=label:bug+state:open+repo:$REPO&per_page=100' --jq '.total_count'"

t_grep=$(bench "grep" "$GREP_CMD")
t_rg="n/a"
[ "$HAS_RG" = true ] && t_rg=$(bench "rg" "$RG_CMD_LABEL")
t_gh=$(bench "gh" "$GH_CMD")
t_api=$(bench "api" "$GH_API_CMD")

c_grep=$(count_results "$GREP_CMD")
c_rg="n/a"
[ "$HAS_RG" = true ] && c_rg=$(count_results "$RG_CMD_LABEL")
c_gh=$(count_results "$GH_CMD" | head -1)
c_api=$(eval "$GH_API_CMD" 2>/dev/null || echo "?")

print_row "open + label:bug" "${t_grep}ms/$c_grep" "${t_rg}ms/$c_rg" "${t_gh}ms/$c_gh" "${t_api}ms/$c_api"

# ---- Query 6: Error message deep search ----
QUERY="ENOENT"
GREP_CMD="grep -rl '$QUERY' '$ISSUES_DIR/'"
RG_CMD="rg -l '$QUERY' '$ISSUES_DIR/'"
GH_CMD="gh issue list -R '$REPO' --search '$QUERY' --limit 100 --json number"
GH_API_CMD="gh api '/search/issues?q=$QUERY+repo:$REPO&per_page=100' --jq '.total_count'"

t_grep=$(bench "grep" "$GREP_CMD")
t_rg="n/a"
[ "$HAS_RG" = true ] && t_rg=$(bench "rg" "$RG_CMD")
t_gh=$(bench "gh" "$GH_CMD")
t_api=$(bench "api" "$GH_API_CMD")

c_grep=$(count_results "$GREP_CMD")
c_rg="n/a"
[ "$HAS_RG" = true ] && c_rg=$(count_results "$RG_CMD")
c_gh=$(count_results "$GH_CMD" | head -1)
c_api=$(eval "$GH_API_CMD" 2>/dev/null || echo "?")

print_row "\"$QUERY\" (error message)" "${t_grep}ms/$c_grep" "${t_rg}ms/$c_rg" "${t_gh}ms/$c_gh" "${t_api}ms/$c_api"

echo ""
echo "--------------------------------------------"
echo ""
echo " Format: <median time>/<result count>"
echo ""
echo " Notes:"
echo "   - grep/rg search the full file content (body + comments)"
echo "   - gh CLI search uses GitHub's search index (may differ in results)"
echo "   - gh CLI times include network round-trip"
echo "   - grep/rg times are local I/O only (after one-time fetch)"
echo ""
echo "============================================"
