import { Octokit } from "@octokit/rest"

export function createGitHubClient(token: string) {
  return new Octokit({ auth: token })
}

export async function fetchUserRepositories(octokit: Octokit) {
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: "updated",
    per_page: 100,
  })
  return data
}

export async function fetchRepositoryPullRequests(
  octokit: Octokit,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open"
) {
  const { data } = await octokit.pulls.list({
    owner,
    repo,
    state,
    per_page: 100,
    sort: "updated",
    direction: "desc",
  })
  return data
}

export async function fetchPullRequestFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  pull_number: number
) {
  const { data } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number,
    per_page: 100,
  })
  return data
}

export async function fetchPullRequestDetails(
  octokit: Octokit,
  owner: string,
  repo: string,
  pull_number: number
) {
  const { data } = await octokit.pulls.get({
    owner,
    repo,
    pull_number,
  })
  return data
}

export async function fetchPullRequestComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  pull_number: number
) {
  const { data } = await octokit.pulls.listReviewComments({
    owner,
    repo,
    pull_number,
    per_page: 100,
  })
  return data
}

export async function fetchPullRequestReviews(
  octokit: Octokit,
  owner: string,
  repo: string,
  pull_number: number
) {
  const { data } = await octokit.pulls.listReviews({
    owner,
    repo,
    pull_number,
    per_page: 100,
  })
  return data
}

export async function createReviewComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  pull_number: number,
  body: string,
  commit_id: string,
  path: string,
  position: number
) {
  const { data } = await octokit.pulls.createReviewComment({
    owner,
    repo,
    pull_number,
    body,
    commit_id,
    path,
    position,
  })
  return data
}

export const PR_WEBHOOK_EVENTS = [
  `pull_request`,
  `pull_request_review`,
  `pull_request_review_comment`,
  `issue_comment`,
] as const

export type RepositoryWebhook = Awaited<
  ReturnType<typeof listRepositoryWebhooks>
>[number]

export async function listRepositoryWebhooks(
  octokit: Octokit,
  owner: string,
  repo: string
) {
  const { data } = await octokit.rest.repos.listWebhooks({
    owner,
    repo,
    per_page: 100,
  })
  return data
}

type EnsureWebhookParams = {
  octokit: Octokit
  owner: string
  repo: string
  targetUrl: string
  secret: string
}

export type EnsureWebhookResult = {
  id: number
  action: `created` | `updated` | `unchanged`
}

export async function ensureRepositoryWebhook({
  octokit,
  owner,
  repo,
  targetUrl,
  secret,
}: EnsureWebhookParams): Promise<EnsureWebhookResult> {
  const webhooks = await listRepositoryWebhooks(octokit, owner, repo)
  const existing = webhooks.find((hook) => hook.config?.url === targetUrl)

  const config = {
    url: targetUrl,
    content_type: `json`,
    insecure_ssl: `0`,
    secret,
  }

  if (existing) {
    const eventsChanged =
      PR_WEBHOOK_EVENTS.length !== existing.events?.length ||
      PR_WEBHOOK_EVENTS.some((event) => !existing.events?.includes(event))
    const needsUpdate = !existing.active || eventsChanged

    if (needsUpdate) {
      await octokit.rest.repos.updateWebhook({
        owner,
        repo,
        hook_id: existing.id,
        active: true,
        events: [...PR_WEBHOOK_EVENTS],
        config,
      })
      return { id: existing.id, action: `updated` }
    }

    return { id: existing.id, action: `unchanged` }
  }

  const { data: created } = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    active: true,
    events: [...PR_WEBHOOK_EVENTS],
    config,
  })

  return { id: created.id, action: `created` }
}
