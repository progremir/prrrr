import { db } from "@/db/connection"
import {
  commentsTable,
  prEventsTable,
  pullRequestsTable,
  repositoriesTable,
  reviewsTable,
} from "@/db/schema"
import { isCommentSide, isReviewState } from "@/lib/review-types"
import { and, eq } from "drizzle-orm"

type TransactionClient = Parameters<
  Parameters<typeof db.transaction>[0]
>[0]

type GitHubWebhookPayload = Record<string, unknown>

type IngestResult = {
  alreadyProcessed: boolean
  status: `processed` | `ignored`
}

function toNumber(value: unknown): number | null {
  if (typeof value === `number`) {
    return value
  }
  if (typeof value === `string`) {
    const parsed = Number.parseInt(value, 10)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  const date = new Date(value as string)
  return Number.isNaN(date.getTime()) ? null : date
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === `string`) {
    return error
  }
  try {
    return JSON.stringify(error)
  } catch {
    return `Unknown error`
  }
}

function normalizeReviewState(state: unknown): `APPROVE` | `REQUEST_CHANGES` | `COMMENT` {
  if (typeof state !== `string`) {
    return `COMMENT`
  }
  const upper = state.toUpperCase()
  if (isReviewState(upper)) {
    return upper
  }
  if (upper === `APPROVED`) {
    return `APPROVE`
  }
  if (upper === `CHANGES_REQUESTED`) {
    return `REQUEST_CHANGES`
  }
  return `COMMENT`
}

function normalizeCommentSide(side: unknown): `LEFT` | `RIGHT` | null {
  if (typeof side !== `string`) {
    return null
  }
  const upper = side.toUpperCase()
  return isCommentSide(upper) ? upper : null
}

async function findPullRequestRow(
  tx: TransactionClient,
  payload: GitHubWebhookPayload
) {
  const pullRequest = payload.pull_request as Record<string, unknown> | undefined
  if (pullRequest) {
    const pullRequestGithubId = toNumber(pullRequest.id)
    if (pullRequestGithubId !== null) {
      const [row] = await tx
        .select({ id: pullRequestsTable.id })
        .from(pullRequestsTable)
        .where(eq(pullRequestsTable.github_id, pullRequestGithubId))
        .limit(1)

      if (row) {
        return row
      }
    }
  }

  const repository = payload.repository as Record<string, unknown> | undefined
  const issue = payload.issue as Record<string, unknown> | undefined

  if (!repository || !issue) {
    return null
  }

  const repoGithubId = toNumber(repository.id)
  const issueNumber = toNumber(issue.number)

  if (repoGithubId === null || issueNumber === null) {
    return null
  }

  const [repositoryRow] = await tx
    .select({ id: repositoriesTable.id })
    .from(repositoriesTable)
    .where(eq(repositoriesTable.github_id, repoGithubId))
    .limit(1)

  if (!repositoryRow) {
    return null
  }

  const [pullRequestRow] = await tx
    .select({ id: pullRequestsTable.id })
    .from(pullRequestsTable)
    .where(
      and(
        eq(pullRequestsTable.repository_id, repositoryRow.id),
        eq(pullRequestsTable.number, issueNumber)
      )
    )
    .limit(1)

  return pullRequestRow ?? null
}

async function upsertPullRequest(
  tx: TransactionClient,
  payload: GitHubWebhookPayload
): Promise<boolean> {
  const pullRequest = payload.pull_request as Record<string, unknown> | undefined
  const repository = payload.repository as Record<string, unknown> | undefined

  if (!pullRequest || !repository) {
    return false
  }

  const repositoryGithubId = toNumber(repository.id)
  if (repositoryGithubId === null) {
    throw new Error(`Missing repository GitHub ID in payload`)
  }

  const [repositoryRow] = await tx
    .select({ id: repositoriesTable.id })
    .from(repositoriesTable)
    .where(eq(repositoriesTable.github_id, repositoryGithubId))
    .limit(1)

  if (!repositoryRow) {
    throw new Error(`Repository ${repositoryGithubId} not synced locally`)
  }

  const pullRequestGithubId = toNumber(pullRequest.id)
  if (pullRequestGithubId === null) {
    throw new Error(`Missing pull request GitHub ID in payload`)
  }

  const author = pullRequest.user as Record<string, unknown> | undefined

  const values = {
    github_id: pullRequestGithubId,
    number: toNumber(pullRequest.number) ?? 0,
    title: (pullRequest.title as string) ?? ``,
    body: (pullRequest.body as string | null) ?? null,
    state: (pullRequest.state as string) ?? `open`,
    author: (author?.login as string) ?? `unknown`,
    author_avatar: (author?.avatar_url as string | null) ?? null,
    base_branch: (pullRequest.base as Record<string, unknown> | undefined)?.ref
      ? ((pullRequest.base as Record<string, unknown>).ref as string)
      : `unknown`,
    head_branch: (pullRequest.head as Record<string, unknown> | undefined)?.ref
      ? ((pullRequest.head as Record<string, unknown>).ref as string)
      : `unknown`,
    head_sha: (pullRequest.head as Record<string, unknown> | undefined)?.sha
      ? ((pullRequest.head as Record<string, unknown>).sha as string | null)
      : null,
    mergeable: (pullRequest.mergeable as boolean | null | undefined) ?? null,
    merged: Boolean(
      pullRequest.merged_at || pullRequest.merged || pullRequest.merged_by
    ),
    draft: Boolean(pullRequest.draft),
    created_at: toDate(pullRequest.created_at) ?? new Date(),
    updated_at: toDate(pullRequest.updated_at) ?? new Date(),
    closed_at: toDate(pullRequest.closed_at),
    merged_at: toDate(pullRequest.merged_at),
    repository_id: repositoryRow.id,
  }

  await tx
    .insert(pullRequestsTable)
    .values(values)
    .onConflictDoUpdate({
      target: pullRequestsTable.github_id,
      set: {
        title: values.title,
        body: values.body,
        state: values.state,
        author: values.author,
        author_avatar: values.author_avatar,
        head_branch: values.head_branch,
        head_sha: values.head_sha,
        mergeable: values.mergeable,
        merged: values.merged,
        draft: values.draft,
        updated_at: values.updated_at,
        closed_at: values.closed_at,
        merged_at: values.merged_at,
      },
    })

  return true
}

async function upsertReview(
  tx: TransactionClient,
  payload: GitHubWebhookPayload
): Promise<boolean> {
  const review = payload.review as Record<string, unknown> | undefined
  const pullRequest = payload.pull_request as Record<string, unknown> | undefined
  if (!review || !pullRequest) {
    return false
  }

  const pullRequestRow = await findPullRequestRow(tx, payload)
  if (!pullRequestRow) {
    throw new Error(`Pull request not synced locally for review event`)
  }

  const reviewGithubId = toNumber(review.id)
  if (reviewGithubId === null) {
    throw new Error(`Missing review GitHub ID in payload`)
  }

  const reviewer = review.user as Record<string, unknown> | undefined
  const submittedAt = toDate(review.submitted_at) ?? new Date()
  const normalizedState = normalizeReviewState(review.state)

  await tx
    .insert(reviewsTable)
    .values({
      github_id: reviewGithubId,
      state: normalizedState,
      body: (review.body as string | null) ?? null,
      author: (reviewer?.login as string) ?? `unknown`,
      author_avatar: (reviewer?.avatar_url as string | null) ?? null,
      synced_to_github: true,
      submitted_at: submittedAt,
      pull_request_id: pullRequestRow.id,
      user_id: null,
    })
    .onConflictDoUpdate({
      target: reviewsTable.github_id,
      set: {
        state: normalizedState,
        body: (review.body as string | null) ?? null,
        author: (reviewer?.login as string) ?? `unknown`,
        author_avatar: (reviewer?.avatar_url as string | null) ?? null,
        synced_to_github: true,
        submitted_at: submittedAt,
      },
    })

  return true
}

async function upsertComment(
  tx: TransactionClient,
  payload: GitHubWebhookPayload
): Promise<boolean> {
  const comment = payload.comment as Record<string, unknown> | undefined

  if (!comment) {
    return false
  }

  const pullRequestRow = await findPullRequestRow(tx, payload)
  if (!pullRequestRow) {
    throw new Error(`Pull request not synced locally for comment event`)
  }

  const commentGithubId = toNumber(comment.id)
  if (commentGithubId === null) {
    throw new Error(`Missing comment GitHub ID in payload`)
  }

  const author = comment.user as Record<string, unknown> | undefined
  const createdAt = toDate(comment.created_at) ?? new Date()
  const updatedAt = toDate(comment.updated_at) ?? createdAt
  const position =
    toNumber(comment.position) ??
    toNumber(comment.original_position) ??
    toNumber(comment.line)
  const side = normalizeCommentSide(comment.side)
  const path = (comment.path as string | null) ?? null
  const commitId =
    (comment.commit_id as string | null) ??
    (comment.original_commit_id as string | null) ??
    null

  await tx
    .insert(commentsTable)
    .values({
      github_id: commentGithubId,
      body: (comment.body as string) ?? ``,
      line: position,
      side,
      path,
      commit_id: commitId,
      author: (author?.login as string) ?? `unknown`,
      author_avatar: (author?.avatar_url as string | null) ?? null,
      synced_to_github: true,
      created_at: createdAt,
      updated_at: updatedAt,
      pull_request_id: pullRequestRow.id,
      user_id: null,
    })
    .onConflictDoUpdate({
      target: commentsTable.github_id,
      set: {
        body: (comment.body as string) ?? ``,
        line: position,
        side,
        path,
        commit_id: commitId,
        author: (author?.login as string) ?? `unknown`,
        author_avatar: (author?.avatar_url as string | null) ?? null,
        synced_to_github: true,
        updated_at: updatedAt,
      },
    })

  return true
}

async function deleteComment(
  tx: TransactionClient,
  payload: GitHubWebhookPayload
): Promise<boolean> {
  const comment = payload.comment as Record<string, unknown> | undefined
  if (!comment) {
    return false
  }

  const commentGithubId = toNumber(comment.id)
  if (commentGithubId === null) {
    return false
  }

  await tx.delete(commentsTable).where(eq(commentsTable.github_id, commentGithubId))
  return true
}

async function processEvent(
  tx: TransactionClient,
  eventName: string,
  action: string | null,
  payload: GitHubWebhookPayload
): Promise<`processed` | `ignored`> {
  switch (eventName) {
    case `pull_request`:
      await upsertPullRequest(tx, payload)
      return `processed`
    case `pull_request_review`:
      if (action === `submitted` || action === `edited`) {
        await upsertReview(tx, payload)
        return `processed`
      }
      if (action === `dismissed`) {
        const review = payload.review as Record<string, unknown> | undefined
        const reviewGithubId = review ? toNumber(review.id) : null
        if (reviewGithubId !== null) {
          await tx
            .delete(reviewsTable)
            .where(eq(reviewsTable.github_id, reviewGithubId))
          return `processed`
        }
      }
      return `ignored`
    case `pull_request_review_comment`:
      if (action === `deleted`) {
        const removed = await deleteComment(tx, payload)
        return removed ? `processed` : `ignored`
      }
      if (action === `created` || action === `edited`) {
        await upsertComment(tx, payload)
        return `processed`
      }
      return `ignored`
    case `issue_comment`:
      if (!payload.issue || !(payload.issue as Record<string, unknown>).pull_request) {
        return `ignored`
      }
      if (action === `deleted`) {
        const removed = await deleteComment(tx, payload)
        return removed ? `processed` : `ignored`
      }
      await upsertComment(tx, payload)
      return `processed`
    default:
      return `ignored`
  }
}

export async function ingestGitHubEvent(params: {
  deliveryId: string
  eventName: string
  action: string | null
  payload: GitHubWebhookPayload
}): Promise<IngestResult> {
  const { deliveryId, eventName, action, payload } = params

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: prEventsTable.id, status: prEventsTable.status })
      .from(prEventsTable)
      .where(eq(prEventsTable.delivery_id, deliveryId))
      .limit(1)

    if (existing.length > 0) {
      return {
        alreadyProcessed: true,
        status: existing[0]!.status === `failed` ? `ignored` : `processed`,
      }
    }

    const repositoryGithubId = toNumber((payload.repository as Record<string, unknown> | undefined)?.id)
    const pullRequestGithubId = toNumber((payload.pull_request as Record<string, unknown> | undefined)?.id)

    const [insertedEvent] = await tx
      .insert(prEventsTable)
      .values({
        delivery_id: deliveryId,
        github_event: eventName,
        action: action ?? null,
        repository_github_id: repositoryGithubId ?? null,
        pull_request_github_id: pullRequestGithubId ?? null,
        payload,
      })
      .returning()

    try {
      const status = await processEvent(tx, eventName, action, payload)

      await tx
        .update(prEventsTable)
        .set({
          status: status,
          processed_at: new Date(),
          error_message: null,
          retry_count: insertedEvent.retry_count ?? 0,
          updated_at: new Date(),
        })
        .where(eq(prEventsTable.id, insertedEvent.id))

      return {
        alreadyProcessed: false,
        status,
      }
    } catch (error) {
      const nextRetryCount = (insertedEvent.retry_count ?? 0) + 1

      await tx
        .update(prEventsTable)
        .set({
          status: `failed`,
          error_message: getErrorMessage(error),
          retry_count: nextRetryCount,
          updated_at: new Date(),
        })
        .where(eq(prEventsTable.id, insertedEvent.id))

      throw error
    }
  })
}

export async function replayPrEvent(eventId: number) {
  return db.transaction(async (tx) => {
    const [eventRecord] = await tx
      .select()
      .from(prEventsTable)
      .where(eq(prEventsTable.id, eventId))
      .limit(1)

    if (!eventRecord) {
      throw new Error(`PR event ${eventId} not found`)
    }

    const payload = eventRecord.payload as GitHubWebhookPayload

    try {
      const status = await processEvent(tx, eventRecord.github_event, eventRecord.action ?? null, payload)

      await tx
        .update(prEventsTable)
        .set({
          status,
          processed_at: new Date(),
          error_message: null,
          retry_count: eventRecord.retry_count ?? 0,
          updated_at: new Date(),
        })
        .where(eq(prEventsTable.id, eventId))
    } catch (error) {
      const nextRetryCount = (eventRecord.retry_count ?? 0) + 1

      await tx
        .update(prEventsTable)
        .set({
          status: `failed`,
          error_message: getErrorMessage(error),
          retry_count: nextRetryCount,
          updated_at: new Date(),
        })
        .where(eq(prEventsTable.id, eventId))

      throw error
    }
  })
}
