# Search Patterns Reference

Extended grep/rg recipes for searching github-grep issue files.

All examples assume issues are in `.github-grep/`. Adjust the path if you used `--output`.

## By State

```bash
# Open issues
grep -rl "state: open" .github-grep/issues/

# Closed issues
grep -rl "state: closed" .github-grep/issues/

# Closed as not planned
grep -rl 'stateReason: "not_planned"' .github-grep/issues/

# Closed as completed
grep -rl 'stateReason: "completed"' .github-grep/issues/
```

## By Author

```bash
# Issues by a specific author
grep -rl 'author: "atinux"' .github-grep/issues/

# Issues by maintainers (OWNER or MEMBER)
grep -rl "authorAssociation: OWNER" .github-grep/issues/
grep -rl "authorAssociation: MEMBER" .github-grep/issues/

# Comments by a specific user
grep -rl "### @atinux" .github-grep/issues/
```

## By Label

```bash
# Issues with a specific label
grep -rl '"bug"' .github-grep/issues/
grep -rl '"enhancement"' .github-grep/issues/

# Issues with multiple labels (both must match)
grep -rl '"bug"' .github-grep/issues/ | xargs grep -l '"critical"'
```

## By Reactions

```bash
# Issues with any reactions
grep -rl "reactionsCount: [1-9]" .github-grep/issues/

# Issues with 10+ reactions
grep -r 'reactionsCount: [0-9]\{2,\}' .github-grep/issues/

# Issues with thumbs up
grep -rl '"+1":' .github-grep/issues/

# Comments with reactions
grep -r "Reactions (" .github-grep/issues/
```

## By Date

```bash
# Issues created in 2026
grep -rl 'createdAt: "2026' .github-grep/issues/

# Issues updated recently
grep -rl 'updatedAt: "2026-03' .github-grep/issues/

# Issues that have been closed
grep -rl "closedAt:" .github-grep/issues/ | xargs grep -L "closedAt: null"
```

## Keyword and Regex

```bash
# Simple keyword
grep -rl "hydration" .github-grep/issues/

# Case-insensitive
grep -rli "typescript" .github-grep/issues/

# Regex pattern
grep -rlE "memory.+leak" .github-grep/issues/

# Error messages in comments
grep -r "TypeError" .github-grep/issues/
grep -r "ENOENT" .github-grep/issues/

# Show matching lines with context
grep -r -C 3 "breaking change" .github-grep/issues/
```

## Combined Filters

```bash
# Open bugs
grep -rl "state: open" .github-grep/issues/ | xargs grep -l '"bug"'

# Open issues by a specific author
grep -rl "state: open" .github-grep/issues/ | xargs grep -l 'author: "atinux"'

# Closed enhancements with high reactions
grep -rl "state: closed" .github-grep/issues/ | xargs grep -l '"enhancement"' | xargs grep -l 'reactionsCount: [0-9]\{2,\}'

# Issues mentioning a keyword that are still open
grep -rl "hydration" .github-grep/issues/ | xargs grep -l "state: open"
```

## Cross-Directory (Issues + PRs)

```bash
# Search across both issues and PRs
grep -r "deployment" .github-grep/

# Only in PRs
grep -r "deployment" .github-grep/pulls/

# Find related PRs for an issue keyword
grep -rl "fix hydration" .github-grep/pulls/
```

## Index File

```bash
# Quick overview of all issues
cat .github-grep/index.md

# Count by state
grep -c "| open |" .github-grep/index.md
grep -c "| closed |" .github-grep/index.md

# Find issues in the index table
grep "bug" .github-grep/index.md
```

## Using ripgrep (rg)

If [ripgrep](https://github.com/BurntSushi/ripgrep) is installed, it provides faster search with better output:

```bash
# Basic search
rg "hydration" .github-grep/

# Files only
rg -l "hydration" .github-grep/issues/

# With context
rg -C 3 "breaking change" .github-grep/issues/

# Case-insensitive regex
rg -i "type.?error" .github-grep/

# Search only in frontmatter (first 30 lines)
rg --max-count 1 "state: open" .github-grep/issues/

# Count matches per file
rg -c "workaround" .github-grep/issues/
```
