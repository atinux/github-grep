---
name: github-grep
description: >-
  Search GitHub issues and PRs locally using grep instead of the GitHub API.
  Use when the user asks about issues, bugs, feature requests, or wants to
  search across issue comments. Provides 10-50x faster search with full regex
  and comment search support.
---

# github-grep

Search GitHub issues locally with `grep` instead of calling the GitHub API. Issues are stored as Markdown files with YAML frontmatter -- one file per issue, all comments included.

## When to Use

- User asks to search, find, or triage GitHub issues
- User asks about bugs, feature requests, or past discussions
- User wants to check if something has been reported before
- You need context about known issues before making changes
- User asks to search inside issue comments (GitHub API cannot do this)

## Setup

Fetch issues once (auto-detects `gh` CLI auth):

```bash
npx github-grep <owner/repo>
```

This creates `.github-grep/` with all issues as Markdown files. Re-running the same command auto-detects existing data and only fetches what changed.

Add `.github-grep/` to `.gitignore` if you don't want to track fetched data in version control. Or commit it so AI agents always have access without re-fetching.

To include pull requests:

```bash
npx github-grep <owner/repo> --include-prs
```

## Data Location

```
.github-grep/
  index.md          # Summary table of all issues
  issues/           # One .md file per issue
  pulls/            # One .md file per PR (if --include-prs)
```

Filenames are `{number}-{title-slug}.md` (e.g., `00042-support-dark-mode.md`).

## Searching

Use `grep` to search across all issues and comments:

```bash
# Keyword search
grep -rl "hydration" .github-grep/issues/

# Search in comments (GitHub API cannot do this)
grep -r "workaround" .github-grep/issues/

# Find issues by author
grep -rl 'author: "username"' .github-grep/issues/

# Find open issues with a label
grep -rl "state: open" .github-grep/issues/ | xargs grep -l "bug"

# Find highly-reacted issues
grep -r 'reactionsCount: [0-9]\{2,\}' .github-grep/issues/

# Regex search across everything
grep -rE "memory.+leak" .github-grep/
```

For more search patterns, see [references/search-patterns.md](references/search-patterns.md).

## Frontmatter Fields

Each issue file has YAML frontmatter with these fields:

| Field | Type | Description |
|-------|------|-------------|
| `number` | int | Issue number |
| `title` | string | Issue title |
| `state` | string | `open` or `closed` |
| `stateReason` | string/null | `completed`, `not_planned`, `reopened` |
| `author` | string | GitHub username |
| `authorAssociation` | string | `OWNER`, `MEMBER`, `CONTRIBUTOR`, `NONE` |
| `labels` | string[] | Label names |
| `assignees` | string[] | Assigned usernames |
| `milestone` | string/null | Milestone title |
| `createdAt` | string | ISO 8601 timestamp |
| `updatedAt` | string | ISO 8601 timestamp |
| `closedAt` | string/null | ISO 8601 timestamp |
| `reactions` | object | Compact format: `{"+1": 5, heart: 2}` |
| `reactionsCount` | int | Total reaction count |
| `commentsCount` | int | Number of comments |
| `isPullRequest` | boolean | `true` if PR |
| `url` | string | GitHub web URL |

## Comments Format

Comments appear after the issue body:

```markdown
## Comments

### @username (MEMBER) on 2024-01-16T09:00:00Z

Comment body here...

**Reactions (4):** +1: 3, heart: 1
```

## Quick Reference

| Task | Command |
|------|---------|
| Fetch issues | `npx github-grep <owner/repo>` |
| Update issues | Re-run the same command (auto-incremental) |
| Force full re-fetch | `npx github-grep <owner/repo> --force` |
| Include PRs | `npx github-grep <owner/repo> --include-prs` |
| Search keyword | `grep -rl "term" .github-grep/issues/` |
| Search in comments | `grep -r "term" .github-grep/issues/` |
| Read index | `cat .github-grep/index.md` |
