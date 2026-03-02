export interface CLIOptions {
  repo: string
  token: string
  output: string
  state: "open" | "closed" | "all"
  includePrs: boolean
  concurrency: number
  since?: string
}

export interface IssueMeta {
  number: number
  title: string
  state: string
  labels: string[]
  commentsCount: number
  reactionsCount: number
  isPullRequest: boolean
}

export interface IssueReactions {
  "+1": number
  "-1": number
  laugh: number
  hooray: number
  confused: number
  heart: number
  rocket: number
  eyes: number
}

export interface IssueComment {
  id: number
  author: string
  authorAssociation: string
  body: string
  createdAt: string
  updatedAt: string
  reactions: IssueReactions
}

export interface Issue {
  number: number
  title: string
  state: string
  stateReason: string | null
  author: string
  authorAssociation: string
  labels: string[]
  assignees: string[]
  milestone: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  closedBy: string | null
  locked: boolean
  body: string
  reactions: IssueReactions
  commentsCount: number
  comments: IssueComment[]
  isPullRequest: boolean
  url: string
}
