import { Octokit } from "octokit"
import type { CLIOptions, FetchResult, Issue, IssueComment, IssueReactions } from "./types.js"

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

function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status
    return status === 403 || status === 429
  }
  return false
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

function mapRawIssue(raw: Record<string, unknown>, comments: IssueComment[]): Issue {
  const r = raw as Record<string, any>
  return {
    number: r.number,
    title: r.title,
    state: r.state,
    stateReason: (r.state_reason as string) ?? null,
    author: r.user?.login ?? "ghost",
    authorAssociation: r.author_association ?? "NONE",
    labels: (r.labels ?? []).map((l: string | { name?: string }) => (typeof l === "string" ? l : l.name ?? "")),
    assignees: (r.assignees ?? []).map((a: { login: string }) => a.login),
    milestone: r.milestone?.title ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    closedAt: r.closed_at ?? null,
    closedBy: null,
    locked: r.locked,
    body: r.body ?? "",
    reactions: parseReactions((r.reactions ?? {}) as Record<string, unknown>),
    commentsCount: r.comments,
    comments,
    isPullRequest: !!r.pull_request,
    url: r.html_url,
  }
}

export async function fetchAllIssues(
  options: CLIOptions,
  onBatch?: (issues: Issue[]) => Promise<void>,
): Promise<FetchResult> {
  const octokit = new Octokit({ auth: options.token })
  const [owner, repo] = options.repo.split("/")

  const sinceLabel = options.since ? ` since ${options.since}` : ""
  console.log(`Fetching issues from ${options.repo} (state: ${options.state})${sinceLabel}...\n`)

  const params: Record<string, unknown> = {
    owner, repo, state: options.state, per_page: 100, page: 1,
  }
  if (options.since) {
    params.since = options.since
  }

  let written = 0
  let page = 1
  let hasMore = true

  while (hasMore) {
    params.page = page

    let rawPage: Record<string, any>[]
    try {
      const response = await octokit.rest.issues.listForRepo(
        params as Parameters<typeof octokit.rest.issues.listForRepo>[0],
      )
      rawPage = response.data as Record<string, any>[]
    } catch (error) {
      if (isRateLimitError(error)) {
        const resetAt = await getRateLimitReset(octokit).catch(() => undefined)
        console.log()
        return { total: written, written, rateLimited: true, resetAt }
      }
      throw error
    }

    if (rawPage.length === 0) {
      hasMore = false
      break
    }

    const filtered = options.includePrs
      ? rawPage
      : rawPage.filter((i) => !i.pull_request)

    if (filtered.length > 0) {
      const batches = chunk(filtered, options.concurrency)

      for (const batch of batches) {
        try {
          const batchIssues = await Promise.all(
            batch.map(async (raw) => {
              const comments = raw.comments > 0
                ? await fetchComments(octokit, owner, repo, raw.number)
                : []
              return mapRawIssue(raw, comments)
            }),
          )

          if (onBatch) {
            await onBatch(batchIssues)
          }

          written += batchIssues.length
          process.stdout.write(`\r  Page ${page}: ${written} issues saved`)
        } catch (error) {
          if (isRateLimitError(error)) {
            const resetAt = await getRateLimitReset(octokit).catch(() => undefined)
            console.log()
            return { total: written, written, rateLimited: true, resetAt }
          }
          throw error
        }
      }
    }

    hasMore = rawPage.length === 100
    page++
  }

  console.log()

  try {
    const { remaining, limit } = await getRateLimit(octokit)
    console.log(`Rate limit: ${remaining}/${limit} remaining`)
  } catch {
    // ignore if rate limit check itself fails
  }

  return { total: written, written, rateLimited: false }
}

async function getRateLimit(octokit: Octokit) {
  const { data } = await octokit.rest.rateLimit.get()
  return {
    remaining: data.rate.remaining,
    limit: data.rate.limit,
    reset: new Date(data.rate.reset * 1000),
  }
}

async function getRateLimitReset(octokit: Octokit): Promise<Date> {
  const { data } = await octokit.rest.rateLimit.get()
  return new Date(data.rate.reset * 1000)
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}
