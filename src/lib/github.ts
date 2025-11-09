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

/**
 * List all webhooks for a repository
 */
export async function listRepositoryWebhooks(
  octokit: Octokit,
  owner: string,
  repo: string
) {
  const { data } = await octokit.repos.listWebhooks({
    owner,
    repo,
    per_page: 100,
  })
  return data
}

/**
 * Register a webhook for a repository
 */
export async function registerRepositoryWebhook(
  octokit: Octokit,
  owner: string,
  repo: string,
  webhookUrl: string,
  webhookSecret: string
) {
  const events = [
    "pull_request",
    "pull_request_review",
    "pull_request_review_comment",
    "issue_comment",
  ]

  const { data } = await octokit.repos.createWebhook({
    owner,
    repo,
    config: {
      url: webhookUrl,
      content_type: "json",
      secret: webhookSecret,
      insecure_ssl: "0",
    },
    events,
    active: true,
  })

  return data
}

/**
 * Check if a webhook already exists for the repository with the given URL
 */
export async function findExistingWebhook(
  octokit: Octokit,
  owner: string,
  repo: string,
  webhookUrl: string
) {
  const webhooks = await listRepositoryWebhooks(octokit, owner, repo)
  return webhooks.find((hook) => hook.config?.url === webhookUrl)
}

/**
 * Register or update a webhook for a repository
 * Returns the webhook ID and whether it was newly created
 */
export async function ensureRepositoryWebhook(
  octokit: Octokit,
  owner: string,
  repo: string,
  webhookUrl: string,
  webhookSecret: string
): Promise<{ id: number; created: boolean }> {
  const existingWebhook = await findExistingWebhook(octokit, owner, repo, webhookUrl)

  if (existingWebhook) {
    // Update existing webhook to ensure events and config are correct
    const events = [
      "pull_request",
      "pull_request_review",
      "pull_request_review_comment",
      "issue_comment",
    ]

    await octokit.repos.updateWebhook({
      owner,
      repo,
      hook_id: existingWebhook.id,
      config: {
        url: webhookUrl,
        content_type: "json",
        secret: webhookSecret,
        insecure_ssl: "0",
      },
      events,
      active: true,
    })

    return { id: existingWebhook.id, created: false }
  }

  // Create new webhook
  const webhook = await registerRepositoryWebhook(
    octokit,
    owner,
    repo,
    webhookUrl,
    webhookSecret
  )

  return { id: webhook.id, created: true }
}
