import { execSync } from "node:child_process"
import { createInterface } from "node:readline"
import { defineCommand, runMain } from "citty"
import { fetchAllIssues } from "./fetcher.js"
import { readIndexMeta, prepareOutputDir, writeIssueBatch, readAllIssueMetas, writeIndexFromMetas, type IndexOptions } from "./writer.js"
import type { CLIOptions } from "./types.js"

function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.toLowerCase().startsWith("y"))
    })
  })
}

function resolveToken(argToken?: string): string | undefined {
  if (argToken) return argToken
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
  try {
    return execSync("gh auth token", { encoding: "utf-8" }).trim()
  } catch {
    return undefined
  }
}

const main = defineCommand({
  meta: {
    name: "github-grep",
    version: "0.1.0",
    description: "Fetch GitHub issues into Markdown files for AI agent grep workflows",
  },
  args: {
    repo: {
      type: "positional",
      description: "GitHub repository (owner/repo)",
      required: true,
    },
    token: {
      type: "string",
      alias: "t",
      description: "GitHub personal access token (or set GITHUB_TOKEN env var)",
    },
    output: {
      type: "string",
      alias: "o",
      description: "Output directory",
      default: ".github-grep",
    },
    state: {
      type: "string",
      alias: "s",
      description: "Issue state filter: open, closed, all",
      default: "all",
    },
    "include-prs": {
      type: "boolean",
      description: "Include pull requests",
      default: false,
    },
    concurrency: {
      type: "string",
      description: "Number of parallel API requests for comments",
      default: "5",
    },
    force: {
      type: "boolean",
      alias: "f",
      description: "Force full re-fetch even if data already exists for this repo",
      default: false,
    },
  },
  async run({ args }) {
    const token = resolveToken(args.token)
    if (!token) {
      console.error("Error: GitHub token required. Use --token, set GITHUB_TOKEN env var, or login with `gh auth login`.")
      process.exit(1)
    }

    if (!args.repo.includes("/")) {
      console.error("Error: repo must be in owner/repo format (e.g. nuxt/nuxt)")
      process.exit(1)
    }

    const state = args.state as CLIOptions["state"]
    if (!["open", "closed", "all"].includes(state)) {
      console.error("Error: --state must be open, closed, or all")
      process.exit(1)
    }

    const output = args.output ?? ".github-grep"
    const force = args.force ?? false

    const includePrs = args["include-prs"] ?? false
    let isUpdate = false
    let since: string | undefined
    const existing = await readIndexMeta(output)

    if (existing && !force) {
      if (existing.repo !== args.repo) {
        console.log(`Directory ${output}/ contains issues from ${existing.repo} (fetched ${existing.fetchedAt}).`)
        const ok = await confirm(`Overwrite with ${args.repo}? [y/N] `)
        if (!ok) {
          console.log("Aborted.")
          process.exit(0)
        }
      } else if (existing.state !== state || existing.includePrs !== includePrs) {
        const changes: string[] = []
        if (existing.state !== state) changes.push(`state: ${existing.state} → ${state}`)
        if (existing.includePrs !== includePrs) changes.push(`include-prs: ${existing.includePrs} → ${includePrs}`)
        console.log(`Options changed (${changes.join(", ")}). Running full re-fetch.\n`)
      } else {
        isUpdate = true
        since = existing.fetchedAt
        console.log(`Found existing data for ${existing.repo} (fetched ${existing.fetchedAt}).`)
        console.log(`Running incremental update. Use --force to do a full re-fetch.\n`)
      }
    }

    const options: CLIOptions = {
      repo: args.repo,
      token: token!,
      output,
      state,
      includePrs,
      concurrency: parseInt(args.concurrency ?? "5", 10),
      since,
    }

    const indexOpts: IndexOptions = { repo: args.repo, state, includePrs }
    const dir = options.output

    const startTime = Date.now()

    await prepareOutputDir(dir, !isUpdate)

    const result = await fetchAllIssues(options, async (batch) => {
      await writeIssueBatch(batch, dir)
    })

    const allMetas = await readAllIssueMetas(dir)
    await writeIndexFromMetas(allMetas, dir, indexOpts)

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    if (result.rateLimited) {
      const resetLabel = result.resetAt
        ? ` Resets at ${result.resetAt.toLocaleTimeString()} (${Math.ceil((result.resetAt.getTime() - Date.now()) / 60000)} min).`
        : ""
      console.log(`\nRate limit hit after saving ${result.written}/${result.total} issues.${resetLabel}`)
      console.log(`Run the same command again later to continue where you left off.`)
      console.log(`\n  github-grep ${args.repo}`)
      process.exit(1)
    }

    const issueCount = allMetas.filter((i) => !i.isPullRequest).length
    const prCount = allMetas.filter((i) => i.isPullRequest).length
    const verb = isUpdate ? "updated" : "saved"
    const parts = [`${issueCount} issues`]
    if (prCount > 0) parts.push(`${prCount} PRs`)
    console.log(`\nDone in ${elapsed}s. ${parts.join(" + ")} ${verb} to ${dir}/`)
    console.log(`\nSearch your issues:\n`)
    console.log(`  grep -r "search term" ${dir}/`)
    console.log(`  rg "search term" ${dir}/`)
    console.log(`\n  Install ripgrep for faster search: https://github.com/BurntSushi/ripgrep#installation`)
  },
})

runMain(main)
