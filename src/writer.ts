import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Issue, IssueMeta, IssueReactions } from "./types.js"

export function yamlValue(value: unknown): string {
  if (value === null || value === undefined) return "null"
  if (typeof value === "boolean" || typeof value === "number") return String(value)
  const str = String(value)
  if (str.includes(":") || str.includes("#") || str.includes('"') || str.includes("'") || str.includes("\n") || str.startsWith(" ") || str.endsWith(" ")) {
    return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`
  }
  return `"${str}"`
}

export function yamlList(items: string[], indent = 2): string {
  if (items.length === 0) return "[]"
  return "\n" + items.map((i) => `${" ".repeat(indent)}- ${yamlValue(i)}`).join("\n")
}

export function yamlReactions(reactions: IssueReactions): string {
  const entries: string[] = []
  if (reactions["+1"]) entries.push(`"+1": ${reactions["+1"]}`)
  if (reactions["-1"]) entries.push(`"-1": ${reactions["-1"]}`)
  if (reactions.laugh) entries.push(`laugh: ${reactions.laugh}`)
  if (reactions.hooray) entries.push(`hooray: ${reactions.hooray}`)
  if (reactions.confused) entries.push(`confused: ${reactions.confused}`)
  if (reactions.heart) entries.push(`heart: ${reactions.heart}`)
  if (reactions.rocket) entries.push(`rocket: ${reactions.rocket}`)
  if (reactions.eyes) entries.push(`eyes: ${reactions.eyes}`)
  if (entries.length === 0) return "{}"
  return `{${entries.join(", ")}}`
}

export function formatReactionsInline(reactions: IssueReactions): string {
  const parts: string[] = []
  if (reactions["+1"]) parts.push(`+1: ${reactions["+1"]}`)
  if (reactions["-1"]) parts.push(`-1: ${reactions["-1"]}`)
  if (reactions.laugh) parts.push(`laugh: ${reactions.laugh}`)
  if (reactions.hooray) parts.push(`hooray: ${reactions.hooray}`)
  if (reactions.confused) parts.push(`confused: ${reactions.confused}`)
  if (reactions.heart) parts.push(`heart: ${reactions.heart}`)
  if (reactions.rocket) parts.push(`rocket: ${reactions.rocket}`)
  if (reactions.eyes) parts.push(`eyes: ${reactions.eyes}`)
  return parts.join(", ")
}

export function totalReactions(reactions: IssueReactions): number {
  return reactions["+1"] + reactions["-1"] + reactions.laugh + reactions.hooray
    + reactions.confused + reactions.heart + reactions.rocket + reactions.eyes
}

export function buildFrontmatter(issue: Issue): string {
  const lines = [
    "---",
    `number: ${issue.number}`,
    `title: ${yamlValue(issue.title)}`,
    `state: ${issue.state}`,
    `stateReason: ${yamlValue(issue.stateReason)}`,
    `author: ${yamlValue(issue.author)}`,
    `authorAssociation: ${issue.authorAssociation}`,
    `labels: ${yamlList(issue.labels)}`,
    `assignees: ${yamlList(issue.assignees)}`,
    `milestone: ${yamlValue(issue.milestone)}`,
    `createdAt: ${yamlValue(issue.createdAt)}`,
    `updatedAt: ${yamlValue(issue.updatedAt)}`,
    `closedAt: ${yamlValue(issue.closedAt)}`,
    `closedBy: ${yamlValue(issue.closedBy)}`,
    `locked: ${issue.locked}`,
    `reactions: ${yamlReactions(issue.reactions)}`,
    `reactionsCount: ${totalReactions(issue.reactions)}`,
    `commentsCount: ${issue.commentsCount}`,
    `isPullRequest: ${issue.isPullRequest}`,
    `url: ${yamlValue(issue.url)}`,
    "---",
  ]
  return lines.join("\n")
}

export function buildIssueMarkdown(issue: Issue): string {
  const parts: string[] = [buildFrontmatter(issue)]

  parts.push(`\n# ${issue.title}\n`)

  if (issue.body) {
    parts.push(issue.body.trim())
  }

  if (issue.comments.length > 0) {
    parts.push("\n## Comments")

    for (const comment of issue.comments) {
      parts.push(`\n### @${comment.author} (${comment.authorAssociation}) on ${comment.createdAt}\n`)

      if (comment.body) {
        parts.push(comment.body.trim())
      }

      const total = totalReactions(comment.reactions)
      const reactionsStr = formatReactionsInline(comment.reactions)
      if (reactionsStr) {
        parts.push(`\n**Reactions (${total}):** ${reactionsStr}`)
      }
    }
  }

  return parts.join("\n") + "\n"
}

export function padNumber(n: number, width = 5): string {
  return String(n).padStart(width, "0")
}

export function slugify(text: string, maxLength = 60): string {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/, "")
}

export function issueFilename(issue: Issue): string {
  const slug = slugify(issue.title)
  return slug ? `${padNumber(issue.number)}-${slug}.md` : `${padNumber(issue.number)}.md`
}

function issueSubdir(issue: { isPullRequest: boolean }): string {
  return issue.isPullRequest ? "pulls" : "issues"
}

export async function writeIssues(issues: Issue[], outputDir: string): Promise<void> {
  const issuesDir = join(outputDir, "issues")
  const pullsDir = join(outputDir, "pulls")
  await rm(issuesDir, { recursive: true, force: true })
  await rm(pullsDir, { recursive: true, force: true })
  await mkdir(issuesDir, { recursive: true })

  const hasPrs = issues.some((i) => i.isPullRequest)
  if (hasPrs) await mkdir(pullsDir, { recursive: true })

  const issueCount = issues.filter((i) => !i.isPullRequest).length
  const prCount = issues.filter((i) => i.isPullRequest).length
  const label = prCount > 0 ? `${issueCount} issues + ${prCount} PRs` : `${issueCount} issues`
  console.log(`Writing ${label} to ${outputDir}/...`)

  for (const issue of issues) {
    const dir = join(outputDir, issueSubdir(issue))
    const filename = issueFilename(issue)
    const content = buildIssueMarkdown(issue)
    await writeFile(join(dir, filename), content, "utf-8")
  }

  console.log(`  Done: ${label} written.`)
}

export interface IndexMeta {
  repo: string
  fetchedAt: string
  state: string
  includePrs: boolean
}

export async function readIndexMeta(outputDir: string): Promise<IndexMeta | undefined> {
  try {
    const content = await readFile(join(outputDir, "index.md"), "utf-8")
    const repoMatch = content.match(/repo:\s*"([^"]+)"/)
    const fetchedAtMatch = content.match(/fetchedAt:\s*"([^"]+)"/)
    if (!repoMatch || !fetchedAtMatch) return undefined
    const stateMatch = content.match(/state:\s*"([^"]+)"/)
    const prsMatch = content.match(/includePrs:\s*(true|false)/)
    return {
      repo: repoMatch[1],
      fetchedAt: fetchedAtMatch[1],
      state: stateMatch?.[1] ?? "all",
      includePrs: prsMatch?.[1] === "true",
    }
  } catch {
    return undefined
  }
}

export async function readFetchedAt(outputDir: string): Promise<string | undefined> {
  const meta = await readIndexMeta(outputDir)
  return meta?.fetchedAt
}

export function parseFrontmatterMeta(content: string): IssueMeta | undefined {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return undefined

  const fm = match[1]
  const get = (key: string) => {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))
    return m?.[1]?.replace(/^"|"$/g, "") ?? ""
  }

  const labels: string[] = []
  const labelsMatch = fm.match(/^labels:\s*\n((?:\s+-\s+.+\n?)*)/m)
  if (labelsMatch?.[1]) {
    for (const line of labelsMatch[1].split("\n")) {
      const lm = line.match(/^\s+-\s+"?([^"]*)"?$/)
      if (lm) labels.push(lm[1])
    }
  }

  return {
    number: parseInt(get("number"), 10),
    title: get("title"),
    state: get("state"),
    labels,
    commentsCount: parseInt(get("commentsCount") || "0", 10),
    reactionsCount: parseInt(get("reactionsCount") || "0", 10),
    isPullRequest: get("isPullRequest") === "true",
  }
}

async function readMetasFromDir(dir: string): Promise<IssueMeta[]> {
  try {
    const files = await readdir(dir)
    const metas: IssueMeta[] = []
    for (const file of files) {
      if (!file.endsWith(".md")) continue
      const content = await readFile(join(dir, file), "utf-8")
      const meta = parseFrontmatterMeta(content)
      if (meta) metas.push(meta)
    }
    return metas
  } catch {
    return []
  }
}

export async function readAllIssueMetas(outputDir: string): Promise<IssueMeta[]> {
  const issues = await readMetasFromDir(join(outputDir, "issues"))
  const pulls = await readMetasFromDir(join(outputDir, "pulls"))
  return [...issues, ...pulls]
}

export async function updateIssues(issues: Issue[], outputDir: string): Promise<void> {
  const issuesDir = join(outputDir, "issues")
  const pullsDir = join(outputDir, "pulls")
  await mkdir(issuesDir, { recursive: true })

  const hasPrs = issues.some((i) => i.isPullRequest)
  if (hasPrs) await mkdir(pullsDir, { recursive: true })

  console.log(`Updating ${issues.length} items in ${outputDir}/...`)

  const existingIssueFiles = await readdir(issuesDir).catch(() => [] as string[])
  const existingPullFiles = await readdir(pullsDir).catch(() => [] as string[])

  for (const issue of issues) {
    const prefix = padNumber(issue.number)
    for (const old of existingIssueFiles.filter((f) => f.startsWith(prefix))) {
      await rm(join(issuesDir, old), { force: true })
    }
    for (const old of existingPullFiles.filter((f) => f.startsWith(prefix))) {
      await rm(join(pullsDir, old), { force: true })
    }
    const dir = join(outputDir, issueSubdir(issue))
    const filename = issueFilename(issue)
    const content = buildIssueMarkdown(issue)
    await writeFile(join(dir, filename), content, "utf-8")
  }

  console.log(`  Done: ${issues.length} items updated.`)
}

export interface IndexOptions {
  repo: string
  state: string
  includePrs: boolean
}

function buildIndexLines(
  repo: string,
  total: number,
  openCount: number,
  closedCount: number,
  opts: IndexOptions,
): string[] {
  return [
    "---",
    `repo: ${yamlValue(repo)}`,
    `fetchedAt: ${yamlValue(new Date().toISOString())}`,
    `state: ${yamlValue(opts.state)}`,
    `includePrs: ${opts.includePrs}`,
    `totalIssues: ${total}`,
    `openIssues: ${openCount}`,
    `closedIssues: ${closedCount}`,
    "---",
    "",
    `# Issues Index for ${repo}`,
    "",
    "| Number | Title | State | Labels | Comments | Reactions |",
    "|--------|-------|-------|--------|----------|-----------|",
  ]
}

export async function writeIndexFromMetas(metas: IssueMeta[], outputDir: string, opts: IndexOptions): Promise<void> {
  await mkdir(outputDir, { recursive: true })
  const sorted = [...metas].sort((a, b) => b.number - a.number)
  const openCount = metas.filter((i) => i.state === "open").length
  const closedCount = metas.filter((i) => i.state === "closed").length

  const lines = buildIndexLines(opts.repo, metas.length, openCount, closedCount, opts)

  for (const meta of sorted) {
    const labels = meta.labels.join(", ")
    const title = meta.title.replace(/\|/g, "\\|")
    lines.push(`| #${meta.number} | ${title} | ${meta.state} | ${labels} | ${meta.commentsCount} | ${meta.reactionsCount} |`)
  }

  lines.push("")
  await writeFile(join(outputDir, "index.md"), lines.join("\n"), "utf-8")
  console.log(`Index written to ${join(outputDir, "index.md")}`)
}

export async function writeIndex(issues: Issue[], outputDir: string, opts: IndexOptions): Promise<void> {
  await mkdir(outputDir, { recursive: true })
  const sorted = [...issues].sort((a, b) => b.number - a.number)
  const openCount = issues.filter((i) => i.state === "open").length
  const closedCount = issues.filter((i) => i.state === "closed").length

  const lines = buildIndexLines(opts.repo, issues.length, openCount, closedCount, opts)

  for (const issue of sorted) {
    const labels = issue.labels.join(", ")
    const title = issue.title.replace(/\|/g, "\\|")
    const reactions = totalReactions(issue.reactions)
    lines.push(`| #${issue.number} | ${title} | ${issue.state} | ${labels} | ${issue.commentsCount} | ${reactions} |`)
  }

  lines.push("")
  await writeFile(join(outputDir, "index.md"), lines.join("\n"), "utf-8")
  console.log(`Index written to ${join(outputDir, "index.md")}`)
}
