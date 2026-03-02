# github-grep

Fetch GitHub issues into local Markdown files so AI agents (and humans) can search them with `grep` and `rg` instead of hitting the GitHub API.

## Why?

AI coding agents struggle with GitHub's issue search -- limited query syntax, no full-text search across comments, rate limits, and no offline access. Most end up falling back to Google.

**github-grep** downloads every issue (with comments and reactions) into individual Markdown files with YAML frontmatter. Once fetched, any tool that reads files becomes a powerful issue search engine.

| | GitHub API / gh CLI | github-grep |
|---|---|---|
| Search titles + bodies | Limited search syntax | Full regex with `rg` |
| Search in comments | Not supported | `rg "pattern" .github-grep/` |
| Combine multiple filters | API params only | `rg` + `yq` on frontmatter |
| Offline access | No | Yes |
| Rate limits | 5,000 req/hour | One-time fetch, then unlimited |
| AI agent friendly | Requires API tool | Just `grep` |

## Use Cases

### Give AI agents full context on issues

AI coding agents (Cursor, Claude Code, Copilot, Codex...) can search through all issues and comments using `grep` -- the tool they're already best at. No API setup, no rate limits, no incomplete search results.

```bash
# Agent can search for related issues before making changes
grep -rl "hydration error" .github-grep/issues/
```

### Automate issue triage with LLMs

Feed all issues to an LLM for duplicate detection, label suggestions, or staleness analysis. Everything is local Markdown, ready to pipe.

```bash
cat .github-grep/issues/*.md | llm "find duplicate issues and group them"
```

### Search across comments

GitHub's search API only indexes issue titles and bodies. github-grep stores the full conversation, so you can search for error messages, workarounds, and decisions buried in comment threads.

### Run as a CI step for AI-ready repos

Add github-grep to a GitHub Action on a schedule, commit the output, and every AI tool that clones the repo automatically has searchable issue context -- no API key needed.

### Cross-repo analysis

Fetch issues from multiple related repos and search across all of them at once.

```bash
github-grep nuxt/nuxt --output .issues/nuxt
github-grep nuxt-hub/core --output .issues/nuxthub
grep -r "deployment" .issues/
```

### Offline access and migration

Review issues on a plane, snapshot a repo before migration, or audit issue patterns (common bug types, response times, contributor activity) with standard shell tools.

## Quick Start

```bash
# Fetch all issues (auto-detects gh CLI auth)
npx github-grep unjs/citty

# Search
grep -r "subcommand" .github-grep/issues/
```

## Installation

```bash
# Run directly (no install)
npx github-grep <owner/repo>

# Or install globally
npm install -g github-grep
```

## Authentication

The token is resolved in order:

1. `--token` / `-t` flag
2. `GITHUB_TOKEN` environment variable
3. `gh auth token` (auto-detected if [GitHub CLI](https://cli.github.com/) is installed)

```bash
github-grep nuxt/nuxt --token ghp_xxx
GITHUB_TOKEN=ghp_xxx github-grep nuxt/nuxt
github-grep nuxt/nuxt  # auto-detects gh CLI
```

## CLI Reference

```
github-grep <owner/repo> [OPTIONS]

OPTIONS
  -t, --token         GitHub personal access token
  -o, --output        Output directory (default: .github-grep)
  -s, --state         Issue state filter: open, closed, all (default: all)
      --include-prs   Include pull requests (default: false)
      --concurrency   Parallel API requests for comments (default: 5)
  -f, --force         Force full re-fetch even if data already exists
```

```bash
github-grep vuejs/core --state open
github-grep denoland/deno --state all --include-prs
github-grep unjs/nitro --output ./nitro-issues
github-grep facebook/react --concurrency 10

# Force a full re-fetch (skip incremental update)
github-grep nuxt-hub/core --force
```

### Smart Incremental Updates

When you run `github-grep` on a repo that was already fetched, it automatically detects the previous run and only fetches issues that changed since then:

```
$ github-grep nuxt-hub/core
Found existing data for nuxt-hub/core (fetched 2026-03-02T10:13:52.489Z).
Running incremental update. Use --force to do a full re-fetch.

Fetching issues from nuxt-hub/core (state: all) since 2026-03-02T10:13:52.489Z...
Found 3 issues. Fetching comments...
```

If you run it against a **different repo** using the same output directory, it asks for confirmation before overwriting:

```
$ github-grep vuejs/core
Directory .github-grep/ contains issues from nuxt-hub/core (fetched 2026-03-02T10:13:52.489Z).
Overwrite with vuejs/core? [y/N]
```

## Output

By default, everything is written to `.github-grep/` in the current directory (change with `--output`).

```
.github-grep/
  index.md                                    # Summary table of all issues + PRs
  issues/
    00001-add-jsdocs-on-all-exported-utils.md
    00042-support-dark-mode-in-dashboard.md
    ...
  pulls/                                      # Only when --include-prs is used
    00153-fix-hydration-mismatch.md
    ...
```

Issues and pull requests are stored in separate directories. Filenames include a slugified title (truncated to 60 chars) for instant context when scanning grep results. Searching with `grep -r .github-grep/` covers both directories.

The directory is self-contained flat Markdown files. Commit it to your repo for always-on AI access, or add `.github-grep/` to `.gitignore` to re-fetch on demand.

### Issue File

Each issue is a standalone Markdown file with YAML frontmatter for all metadata:

```markdown
---
number: 42
title: "Support dark mode in dashboard"
state: open
stateReason: null
author: "atinux"
authorAssociation: OWNER
labels:
  - "enhancement"
  - "ui"
assignees:
  - "atinux"
milestone: "v4.0"
createdAt: "2024-01-15T10:30:00Z"
updatedAt: "2024-03-01T08:00:00Z"
closedAt: null
closedBy: null
locked: false
reactions: {"+1": 12, heart: 3, rocket: 5, eyes: 2}
reactionsCount: 22
commentsCount: 2
isPullRequest: false
url: "https://github.com/nuxt/nuxt/issues/42"
---

# Support dark mode in dashboard

The dashboard currently only supports light mode...

## Comments

### @danielroe (OWNER) on 2024-01-16T09:00:00Z

I think we should use CSS custom properties for this.

**Reactions (4):** +1: 3, heart: 1

### @pi0 (MEMBER) on 2024-01-17T14:20:00Z

+1, we could leverage `@nuxtjs/color-mode` for this.

**Reactions (7):** +1: 5, rocket: 2
```

### Index File

`index.md` provides a scannable overview without opening individual files:

```markdown
---
repo: "nuxt/nuxt"
fetchedAt: "2026-03-02T12:00:00Z"
totalIssues: 1234
openIssues: 456
closedIssues: 778
---

# Issues Index for nuxt/nuxt

| Number | Title | State | Labels | Comments | Reactions |
|--------|-------|-------|--------|----------|-----------|
| #1234 | Fix hydration mismatch | open | bug | 3 | 15 |
| #1233 | Add i18n support | closed | enhancement | 8 | 42 |
| ... |
```

## Search Examples

```bash
# Find issues mentioning "hydration"
grep -rl "hydration" .github-grep/issues/

# Find open bugs
grep -rl "state: open" .github-grep/issues/ | xargs grep -l "bug"

# Search inside comments for error messages
grep -r "TypeError" .github-grep/issues/

# Find most-reacted issues (10+ thumbs up)
grep -r 'reactionsCount: [0-9]\{2,\}' .github-grep/issues/

# List issues by author
grep -rl 'author: "atinux"' .github-grep/issues/

# Find issues with a specific label
grep -rl "enhancement" .github-grep/issues/
```

With [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`):

```bash
# Regex search across all issues and comments
rg "memory.+leak" .github-grep/

# Find issues updated this year
rg "updatedAt.*2026" .github-grep/issues/

# Show context around matches
rg -C 3 "breaking change" .github-grep/issues/
```

## Benchmarks

Local search is **10-50x faster** than the GitHub API, with better results for comment search and regex.

Tested on [nuxt-hub/core](https://github.com/nuxt-hub/core) (523 issues):

| Query | grep | rg | gh CLI | gh API |
|---|---|---|---|---|
| `"blob"` (keyword) | 46ms / 125 | 34ms / 125 | 584ms / 1 | 1926ms / 196 |
| `"workaround"` (in comments) | 45ms / 38 | 32ms / 38 | 651ms / 1 | 1119ms / 31 |
| `/deploy.+fail/` (regex) | 59ms / 38 | 40ms / 38 | 600ms / 1 | 1862ms / 129 |
| `author:atinux` | 89ms / 27 | 47ms / 27 | 586ms / 1 | 2327ms / 98 |
| `open + label:bug` | 76ms / 22 | 49ms / 22 | 697ms / 1 | 983ms / 20 |
| `"ENOENT"` (error message) | 59ms / 4 | 51ms / 4 | 639ms / 1 | 801ms / 4 |

> Format: `<median time> / <result count>` -- lower is better for time, higher is better for count.

- **grep/rg** search the full file content (body + comments) in 30-90ms
- **gh CLI / GitHub API** need a network round-trip per query (600-2300ms)
- **Comment search** -- grep finds results in comments that the GitHub API misses
- **Regex** -- grep/rg support real regex; GitHub search can only do keyword matching

Run the benchmark yourself:

```bash
github-grep nuxt-hub/core
./bench/run.sh

# Custom repo / more iterations
REPO=vuejs/core DIR=./vue-issues RUNS=10 ./bench/run.sh
```

## Rate Limits

With a GitHub PAT: 5,000 API requests per hour.

- **Listing issues**: ~1 request per 100 issues
- **Fetching comments**: ~1 request per issue with comments

A repo with 1,000 issues and ~5 comments each uses roughly 1,000-2,000 requests. The remaining rate limit is displayed after each run.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local development setup, project structure, and guidelines.

## License

MIT
