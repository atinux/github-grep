import { Octokit } from "octokit"
import type { CLIOptions, Issue, IssueComment, IssueReactions } from "./types.js"

export function parseReactions(reactions: Record<string, unknown>): IssueReactions {
  return {
    "+1": Number(reactions["+1"] ?? 0),
    "-1": Number(reactions["-1"] ?? 0),
    laugh: Number(reactions.laugh ?? 0),
    hooray: Number(reactions.hooray ?? 0),
    confused: Number(reactions.confused ?? 0),
    heart: Number(reactions.heart ?? 0),
    rocket: Number(reactions.rocket ?? 0),
    eyes: Number(reactions.eyes ?? 0),
  }
}

async function fetchComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<IssueComment[]> {
  const comments = await octokit.paginate(
    octokit.rest.issues.listComments,
    { owner, repo, issue_number: issueNumber, per_page: 100 },
  )

  return comments.map((c) => ({
    id: c.id,
    author: c.user?.login ?? "ghost",
    authorAssociation: c.author_association,
    body: c.body ?? "",
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    reactions: parseReactions((c.reactions ?? {}) as Record<string, unknown>),
  }))
}

export async function fetchAllIssues(options: CLIOptions): Promise<Issue[]> {
  const octokit = new Octokit({ auth: options.token })
  const [owner, repo] = options.repo.split("/")

  const sinceLabel = options.since ? ` since ${options.since}` : ""
  console.log(`Fetching issues from ${options.repo} (state: ${options.state})${sinceLabel}...`)

  const params: Record<string, unknown> = {
    owner, repo, state: options.state as "open" | "closed" | "all", per_page: 100,
  }
  if (options.since) {
    params.since = options.since
  }

  const rawIssues = await octokit.paginate(
    octokit.rest.issues.listForRepo,
    params as Parameters<typeof octokit.rest.issues.listForRepo>[0],
  )

  const filtered = options.includePrs
    ? rawIssues
    : rawIssues.filter((i) => !i.pull_request)

  console.log(`Found ${filtered.length} issues${options.includePrs ? " (including PRs)" : ""}. Fetching comments...`)

  const issues: Issue[] = []
  const batches = chunk(filtered, options.concurrency)

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const batchIssues = await Promise.all(
      batch.map(async (raw) => {
        const comments = raw.comments > 0
          ? await fetchComments(octokit, owner, repo, raw.number)
          : []

        return {
          number: raw.number,
          title: raw.title,
          state: raw.state,
          stateReason: (raw.state_reason as string) ?? null,
          author: raw.user?.login ?? "ghost",
          authorAssociation: raw.author_association ?? "NONE",
          labels: raw.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")),
          assignees: (raw.assignees ?? []).map((a) => a.login),
          milestone: raw.milestone?.title ?? null,
          createdAt: raw.created_at,
          updatedAt: raw.updated_at,
          closedAt: raw.closed_at ?? null,
          closedBy: null,
          locked: raw.locked,
          body: raw.body ?? "",
          reactions: parseReactions((raw.reactions ?? {}) as Record<string, unknown>),
          commentsCount: raw.comments,
          comments,
          isPullRequest: !!raw.pull_request,
          url: raw.html_url,
        } satisfies Issue
      }),
    )

    issues.push(...batchIssues)
    const done = Math.min((i + 1) * options.concurrency, filtered.length)
    process.stdout.write(`\r  Progress: ${done}/${filtered.length} issues`)
  }

  console.log()

  const { remaining, limit } = await getRateLimit(octokit)
  console.log(`Rate limit: ${remaining}/${limit} remaining`)

  return issues
}

async function getRateLimit(octokit: Octokit) {
  const { data } = await octokit.rest.rateLimit.get()
  return {
    remaining: data.rate.remaining,
    limit: data.rate.limit,
    reset: new Date(data.rate.reset * 1000),
  }
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}
