import type { Issue, IssueComment, IssueReactions } from "../src/types.js"

export function makeReactions(overrides: Partial<IssueReactions> = {}): IssueReactions {
  return {
    "+1": 0,
    "-1": 0,
    laugh: 0,
    hooray: 0,
    confused: 0,
    heart: 0,
    rocket: 0,
    eyes: 0,
    ...overrides,
  }
}

export function makeComment(overrides: Partial<IssueComment> = {}): IssueComment {
  return {
    id: 100,
    author: "contributor",
    authorAssociation: "NONE",
    body: "This is a comment.",
    createdAt: "2024-06-01T10:00:00Z",
    updatedAt: "2024-06-01T10:00:00Z",
    reactions: makeReactions(),
    ...overrides,
  }
}

export function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    number: 1,
    title: "Test issue",
    state: "open",
    stateReason: null,
    author: "atinux",
    authorAssociation: "OWNER",
    labels: [],
    assignees: [],
    milestone: null,
    createdAt: "2024-01-15T10:30:00Z",
    updatedAt: "2024-03-01T08:00:00Z",
    closedAt: null,
    closedBy: null,
    locked: false,
    body: "Issue body content here.",
    reactions: makeReactions(),
    commentsCount: 0,
    comments: [],
    isPullRequest: false,
    url: "https://github.com/test/repo/issues/1",
    ...overrides,
  }
}
