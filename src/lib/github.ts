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
