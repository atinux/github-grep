import { readFile, rm, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  yamlValue,
  yamlList,
  yamlReactions,
  formatReactionsInline,
  totalReactions,
  buildFrontmatter,
  buildIssueMarkdown,
  padNumber,
  slugify,
  issueFilename,
  writeIssues,
  writeIndex,
  readFetchedAt,
  parseFrontmatterMeta,
  updateIssues,
  readAllIssueMetas,
} from "../src/writer.js"
import { makeIssue, makeComment, makeReactions } from "./fixtures.js"

describe("yamlValue", () => {
  it("returns null for null/undefined", () => {
    expect(yamlValue(null)).toBe("null")
    expect(yamlValue(undefined)).toBe("null")
  })

  it("returns raw value for booleans and numbers", () => {
    expect(yamlValue(true)).toBe("true")
    expect(yamlValue(false)).toBe("false")
    expect(yamlValue(42)).toBe("42")
  })

  it("wraps strings in double quotes", () => {
    expect(yamlValue("hello")).toBe('"hello"')
  })

  it("escapes special characters in strings", () => {
    expect(yamlValue('say "hi"')).toBe('"say \\"hi\\""')
    expect(yamlValue("line\nnewline")).toBe('"line\\nnewline"')
    expect(yamlValue("has: colon")).toBe('"has: colon"')
  })
})

describe("yamlList", () => {
  it("returns [] for empty arrays", () => {
    expect(yamlList([])).toBe("[]")
  })

  it("formats items as YAML list", () => {
    const result = yamlList(["bug", "enhancement"])
    expect(result).toContain('  - "bug"')
    expect(result).toContain('  - "enhancement"')
    expect(result.startsWith("\n")).toBe(true)
  })
})

describe("yamlReactions", () => {
  it("returns {} for all-zero reactions", () => {
    expect(yamlReactions(makeReactions())).toBe("{}")
  })

  it("returns compact inline format with only non-zero values", () => {
    expect(yamlReactions(makeReactions({ "+1": 5, rocket: 3 }))).toBe('{"+1": 5, rocket: 3}')
  })

  it("includes all non-zero reactions in order", () => {
    const result = yamlReactions(makeReactions({ "+1": 1, "-1": 2, heart: 3, eyes: 4 }))
    expect(result).toBe('{"+1": 1, "-1": 2, heart: 3, eyes: 4}')
  })
})

describe("formatReactionsInline", () => {
  it("returns empty string for zero reactions", () => {
    expect(formatReactionsInline(makeReactions())).toBe("")
  })

  it("includes only non-zero reactions", () => {
    const result = formatReactionsInline(makeReactions({ "+1": 3, heart: 1 }))
    expect(result).toBe("+1: 3, heart: 1")
  })

  it("includes all non-zero reactions in order", () => {
    const result = formatReactionsInline(makeReactions({ "+1": 1, "-1": 2, rocket: 3, eyes: 4 }))
    expect(result).toBe("+1: 1, -1: 2, rocket: 3, eyes: 4")
  })
})

describe("totalReactions", () => {
  it("returns 0 for empty reactions", () => {
    expect(totalReactions(makeReactions())).toBe(0)
  })

  it("sums all reaction counts", () => {
    expect(totalReactions(makeReactions({ "+1": 5, heart: 3, rocket: 2 }))).toBe(10)
  })
})

describe("padNumber", () => {
  it("pads single digits to 5 chars", () => {
    expect(padNumber(1)).toBe("00001")
  })

  it("pads larger numbers", () => {
    expect(padNumber(42)).toBe("00042")
    expect(padNumber(12345)).toBe("12345")
  })

  it("does not truncate numbers exceeding width", () => {
    expect(padNumber(123456)).toBe("123456")
  })
})

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world")
  })

  it("removes special characters", () => {
    expect(slugify('Fix "TypeError" in module')).toBe("fix-typeerror-in-module")
  })

  it("collapses consecutive hyphens", () => {
    expect(slugify("foo---bar___baz")).toBe("foo-bar-baz")
  })

  it("strips leading and trailing hyphens", () => {
    expect(slugify("--hello--")).toBe("hello")
  })

  it("handles unicode and accents", () => {
    expect(slugify("Améliorer la résolution")).toBe("ameliorer-la-resolution")
  })

  it("truncates to maxLength without trailing hyphens", () => {
    const long = "this is a very long title that should be truncated at some point"
    const result = slugify(long, 20)
    expect(result.length).toBeLessThanOrEqual(20)
    expect(result.endsWith("-")).toBe(false)
  })

  it("returns empty string for non-alphanumeric input", () => {
    expect(slugify("🚀🔥✨")).toBe("")
  })
})

describe("issueFilename", () => {
  it("combines padded number and title slug", () => {
    expect(issueFilename(makeIssue({ number: 42, title: "Support dark mode" }))).toBe("00042-support-dark-mode.md")
  })

  it("falls back to number-only when title produces empty slug", () => {
    expect(issueFilename(makeIssue({ number: 1, title: "🚀" }))).toBe("00001.md")
  })
})

describe("buildFrontmatter", () => {
  it("generates valid YAML frontmatter", () => {
    const issue = makeIssue({ number: 42, title: "My title", state: "open" })
    const fm = buildFrontmatter(issue)

    expect(fm.startsWith("---")).toBe(true)
    expect(fm.endsWith("---")).toBe(true)
    expect(fm).toContain("number: 42")
    expect(fm).toContain('title: "My title"')
    expect(fm).toContain("state: open")
    expect(fm).toContain("isPullRequest: false")
  })

  it("renders labels as YAML list", () => {
    const issue = makeIssue({ labels: ["bug", "critical"] })
    const fm = buildFrontmatter(issue)
    expect(fm).toContain('  - "bug"')
    expect(fm).toContain('  - "critical"')
  })

  it("renders empty labels as []", () => {
    const issue = makeIssue({ labels: [] })
    const fm = buildFrontmatter(issue)
    expect(fm).toContain("labels: []")
  })

  it("renders reactions as compact inline format", () => {
    const issue = makeIssue({ reactions: makeReactions({ "+1": 5, rocket: 3 }) })
    const fm = buildFrontmatter(issue)
    expect(fm).toContain('reactions: {"+1": 5, rocket: 3}')
    expect(fm).toContain("reactionsCount: 8")
    expect(fm).not.toContain("heart: 0")
  })

  it("renders empty reactions as {}", () => {
    const issue = makeIssue({ reactions: makeReactions() })
    const fm = buildFrontmatter(issue)
    expect(fm).toContain("reactions: {}")
    expect(fm).toContain("reactionsCount: 0")
  })
})

describe("buildIssueMarkdown", () => {
  it("includes frontmatter, title, and body", () => {
    const issue = makeIssue({ number: 7, title: "Hello World", body: "Some content." })
    const md = buildIssueMarkdown(issue)

    expect(md).toContain("---\nnumber: 7")
    expect(md).toContain("# Hello World")
    expect(md).toContain("Some content.")
  })

  it("omits Comments section when no comments", () => {
    const issue = makeIssue({ comments: [] })
    const md = buildIssueMarkdown(issue)
    expect(md).not.toContain("## Comments")
  })

  it("includes comments with author, association, and body", () => {
    const issue = makeIssue({
      comments: [
        makeComment({ author: "alice", body: "Looks good!", createdAt: "2024-02-01T09:00:00Z", authorAssociation: "MEMBER" }),
      ],
    })
    const md = buildIssueMarkdown(issue)

    expect(md).toContain("## Comments")
    expect(md).toContain("### @alice (MEMBER) on 2024-02-01T09:00:00Z")
    expect(md).not.toContain("> MEMBER")
    expect(md).toContain("Looks good!")
  })

  it("does not have --- separator before Comments", () => {
    const issue = makeIssue({
      comments: [makeComment()],
    })
    const md = buildIssueMarkdown(issue)
    const bodyEnd = md.indexOf("## Comments")
    const beforeComments = md.slice(Math.max(0, bodyEnd - 10), bodyEnd)
    expect(beforeComments).not.toContain("---")
  })

  it("shows inline reactions on comments with total count", () => {
    const issue = makeIssue({
      comments: [
        makeComment({ reactions: makeReactions({ "+1": 2, heart: 1 }) }),
      ],
    })
    const md = buildIssueMarkdown(issue)
    expect(md).toContain("**Reactions (3):** +1: 2, heart: 1")
  })

  it("omits reactions line when comment has zero reactions", () => {
    const issue = makeIssue({
      comments: [makeComment({ reactions: makeReactions() })],
    })
    const md = buildIssueMarkdown(issue)
    expect(md).not.toContain("**Reactions")
  })

  it("handles empty body", () => {
    const issue = makeIssue({ body: "" })
    const md = buildIssueMarkdown(issue)
    expect(md).toContain("# Test issue")
    expect(md).not.toContain("undefined")
  })

  it("handles title with special characters", () => {
    const issue = makeIssue({ title: 'Fix "TypeError" in module' })
    const md = buildIssueMarkdown(issue)
    expect(md).toContain('# Fix "TypeError" in module')
  })
})

describe("writeIssues", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `github-grep-test-${Date.now()}`)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("writes issue files with slugified filenames", async () => {
    const issues = [
      makeIssue({ number: 1, title: "First issue" }),
      makeIssue({ number: 42, title: "Support dark mode" }),
    ]
    await writeIssues(issues, tmpDir)

    const file1 = await readFile(join(tmpDir, "issues", "00001-first-issue.md"), "utf-8")
    const file42 = await readFile(join(tmpDir, "issues", "00042-support-dark-mode.md"), "utf-8")

    expect(file1).toContain("number: 1")
    expect(file42).toContain("number: 42")
  })

  it("separates issues and PRs into different directories", async () => {
    const issues = [
      makeIssue({ number: 1, title: "Bug report", isPullRequest: false }),
      makeIssue({ number: 2, title: "Fix the bug", isPullRequest: true }),
    ]
    await writeIssues(issues, tmpDir)

    const issueFile = await readFile(join(tmpDir, "issues", "00001-bug-report.md"), "utf-8")
    expect(issueFile).toContain("number: 1")

    const prFile = await readFile(join(tmpDir, "pulls", "00002-fix-the-bug.md"), "utf-8")
    expect(prFile).toContain("number: 2")
  })

  it("creates the issues directory if it does not exist", async () => {
    await writeIssues([makeIssue({ number: 1, title: "Test issue" })], tmpDir)
    const content = await readFile(join(tmpDir, "issues", "00001-test-issue.md"), "utf-8")
    expect(content).toBeTruthy()
  })
})

describe("writeIndex", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `github-grep-test-${Date.now()}`)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("generates index.md with YAML frontmatter and table", async () => {
    const issues = [
      makeIssue({ number: 1, title: "First", state: "open", labels: ["bug"], commentsCount: 2, reactions: makeReactions({ "+1": 5 }) }),
      makeIssue({ number: 2, title: "Second", state: "closed", labels: ["enhancement"], commentsCount: 0, reactions: makeReactions() }),
    ]

    const opts = { repo: "test/repo", state: "all", includePrs: false }
    await writeIndex(issues, tmpDir, opts)
    const content = await readFile(join(tmpDir, "index.md"), "utf-8")

    expect(content).toContain('repo: "test/repo"')
    expect(content).toContain("totalIssues: 2")
    expect(content).toContain("openIssues: 1")
    expect(content).toContain("closedIssues: 1")
    expect(content).toContain("# Issues Index for test/repo")
    expect(content).toContain("| #1 | First | open | bug | 2 | 5 |")
    expect(content).toContain("| #2 | Second | closed | enhancement | 0 | 0 |")
  })

  it("stores state and includePrs in frontmatter", async () => {
    const issues = [makeIssue({ number: 1, state: "open" })]
    await writeIndex(issues, tmpDir, { repo: "test/repo", state: "open", includePrs: true })
    const content = await readFile(join(tmpDir, "index.md"), "utf-8")
    expect(content).toContain('state: "open"')
    expect(content).toContain("includePrs: true")
  })

  it("sorts issues by number descending", async () => {
    const issues = [
      makeIssue({ number: 1, state: "open" }),
      makeIssue({ number: 99, state: "open" }),
      makeIssue({ number: 50, state: "open" }),
    ]

    await writeIndex(issues, tmpDir, { repo: "test/repo", state: "all", includePrs: false })
    const content = await readFile(join(tmpDir, "index.md"), "utf-8")

    const rows = content.split("\n").filter((line: string) => line.startsWith("| #"))
    expect(rows[0]).toContain("| #99")
    expect(rows[1]).toContain("| #50")
    expect(rows[2]).toContain("| #1")
  })

  it("escapes pipe characters in titles", async () => {
    const issues = [makeIssue({ number: 1, title: "A | B", state: "open" })]

    await writeIndex(issues, tmpDir, { repo: "test/repo", state: "all", includePrs: false })
    const content = await readFile(join(tmpDir, "index.md"), "utf-8")
    expect(content).toContain("A \\| B")
  })
})

describe("readFetchedAt", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `github-grep-test-${Date.now()}`)
    await mkdir(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("reads fetchedAt from existing index.md", async () => {
    await writeFile(join(tmpDir, "index.md"), '---\nrepo: "test/repo"\nfetchedAt: "2026-03-01T12:00:00Z"\n---\n', "utf-8")
    const result = await readFetchedAt(tmpDir)
    expect(result).toBe("2026-03-01T12:00:00Z")
  })

  it("returns undefined when index.md does not exist", async () => {
    const result = await readFetchedAt(tmpDir)
    expect(result).toBeUndefined()
  })
})

describe("parseFrontmatterMeta", () => {
  it("extracts metadata from frontmatter", () => {
    const content = `---
number: 42
title: "My issue"
state: open
labels:
  - "bug"
  - "critical"
commentsCount: 3
reactionsCount: 10
isPullRequest: false
---

# My issue`

    const meta = parseFrontmatterMeta(content)
    expect(meta).toEqual({
      number: 42,
      title: "My issue",
      state: "open",
      labels: ["bug", "critical"],
      commentsCount: 3,
      reactionsCount: 10,
      isPullRequest: false,
    })
  })

  it("handles empty labels", () => {
    const content = `---
number: 1
title: "No labels"
state: closed
labels: []
commentsCount: 0
reactionsCount: 0
isPullRequest: false
---`

    const meta = parseFrontmatterMeta(content)
    expect(meta?.labels).toEqual([])
  })

  it("returns undefined for invalid content", () => {
    expect(parseFrontmatterMeta("no frontmatter here")).toBeUndefined()
  })
})

describe("updateIssues", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `github-grep-test-${Date.now()}`)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("overwrites existing files and removes old filenames for same issue number", async () => {
    const issuesDir = join(tmpDir, "issues")
    await mkdir(issuesDir, { recursive: true })
    await writeFile(join(issuesDir, "00042-old-title.md"), "old content", "utf-8")

    const issues = [makeIssue({ number: 42, title: "New title" })]
    await updateIssues(issues, tmpDir)

    const files = (await readFile(join(issuesDir, "00042-new-title.md"), "utf-8"))
    expect(files).toContain("number: 42")

    await expect(readFile(join(issuesDir, "00042-old-title.md"), "utf-8")).rejects.toThrow()
  })

  it("adds new files without removing existing ones", async () => {
    const issuesDir = join(tmpDir, "issues")
    await mkdir(issuesDir, { recursive: true })
    await writeFile(join(issuesDir, "00001-existing.md"), "existing", "utf-8")

    const issues = [makeIssue({ number: 42, title: "New issue" })]
    await updateIssues(issues, tmpDir)

    const existing = await readFile(join(issuesDir, "00001-existing.md"), "utf-8")
    expect(existing).toBe("existing")

    const newFile = await readFile(join(issuesDir, "00042-new-issue.md"), "utf-8")
    expect(newFile).toContain("number: 42")
  })
})

describe("readAllIssueMetas", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `github-grep-test-${Date.now()}`)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("reads metadata from all issue files", async () => {
    const issues = [
      makeIssue({ number: 1, title: "First", state: "open", reactions: makeReactions({ "+1": 5 }) }),
      makeIssue({ number: 2, title: "Second", state: "closed" }),
    ]
    await writeIssues(issues, tmpDir)

    const metas = await readAllIssueMetas(tmpDir)
    expect(metas).toHaveLength(2)
    expect(metas.find((m) => m.number === 1)?.state).toBe("open")
    expect(metas.find((m) => m.number === 2)?.state).toBe("closed")
  })

  it("returns empty array when no issues directory exists", async () => {
    const metas = await readAllIssueMetas(tmpDir)
    expect(metas).toEqual([])
  })
})
