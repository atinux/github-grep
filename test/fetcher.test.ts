import { describe, it, expect } from "vitest"
import { parseReactions, chunk } from "../src/fetcher.js"

describe("parseReactions", () => {
  it("extracts all reaction types from a raw object", () => {
    const raw = {
      "+1": 5,
      "-1": 1,
      laugh: 2,
      hooray: 0,
      confused: 0,
      heart: 3,
      rocket: 1,
      eyes: 0,
      url: "https://api.github.com/...",
      total_count: 12,
    }

    const result = parseReactions(raw)

    expect(result).toEqual({
      "+1": 5,
      "-1": 1,
      laugh: 2,
      hooray: 0,
      confused: 0,
      heart: 3,
      rocket: 1,
      eyes: 0,
    })
  })

  it("defaults missing fields to 0", () => {
    const result = parseReactions({})

    expect(result).toEqual({
      "+1": 0,
      "-1": 0,
      laugh: 0,
      hooray: 0,
      confused: 0,
      heart: 0,
      rocket: 0,
      eyes: 0,
    })
  })

  it("coerces string values to numbers", () => {
    const result = parseReactions({ "+1": "3", heart: "1" })
    expect(result["+1"]).toBe(3)
    expect(result.heart).toBe(1)
  })

  it("handles null/undefined values as 0", () => {
    const result = parseReactions({ "+1": null, heart: undefined })
    expect(result["+1"]).toBe(0)
    expect(result.heart).toBe(0)
  })
})

describe("chunk", () => {
  it("splits array into chunks of given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it("returns single chunk when array is smaller than size", () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]])
  })

  it("returns empty array for empty input", () => {
    expect(chunk([], 3)).toEqual([])
  })

  it("handles chunk size of 1", () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]])
  })

  it("handles exact multiples", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]])
  })
})

describe("fetchAllIssues", () => {
  it("filters out pull requests by default", async () => {
    const rawIssues = [
      { number: 1, title: "Issue", pull_request: undefined, comments: 0, user: { login: "u" }, author_association: "NONE", labels: [], assignees: [], milestone: null, state: "open", state_reason: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z", closed_at: null, locked: false, body: "", reactions: {}, html_url: "https://github.com/a/b/issues/1" },
      { number: 2, title: "PR", pull_request: { url: "..." }, comments: 0, user: { login: "u" }, author_association: "NONE", labels: [], assignees: [], milestone: null, state: "open", state_reason: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z", closed_at: null, locked: false, body: "", reactions: {}, html_url: "https://github.com/a/b/pull/2" },
    ]

    const filtered = rawIssues.filter((i) => !i.pull_request)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].number).toBe(1)
  })

  it("includes pull requests when includePrs is true", () => {
    const rawIssues = [
      { number: 1, pull_request: undefined },
      { number: 2, pull_request: { url: "..." } },
    ]

    const includePrs = true
    const filtered = includePrs ? rawIssues : rawIssues.filter((i) => !i.pull_request)
    expect(filtered).toHaveLength(2)
  })

  it("maps raw labels correctly", () => {
    const rawLabels: (string | { name?: string })[] = [
      { name: "bug" },
      { name: "enhancement" },
      "plain-string",
    ]

    const labels = rawLabels.map((l) => (typeof l === "string" ? l : l.name ?? ""))
    expect(labels).toEqual(["bug", "enhancement", "plain-string"])
  })

  it("handles missing user as ghost", () => {
    const raw = { user: null }
    const author = raw.user?.login ?? "ghost"
    expect(author).toBe("ghost")
  })

  it("handles missing assignees", () => {
    const raw = { assignees: null as { login: string }[] | null }
    const assignees = (raw.assignees ?? []).map((a) => a.login)
    expect(assignees).toEqual([])
  })
})
