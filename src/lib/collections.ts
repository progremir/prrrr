import { createCollection } from "@tanstack/react-db"
import { electricCollectionOptions } from "@tanstack/electric-db-collection"
import {
  selectUsersSchema,
  selectRepositorySchema,
  selectPullRequestSchema,
  selectPrFileSchema,
  selectCommentSchema,
  selectReviewSchema,
} from "@/db/schema"
import { trpc } from "@/lib/trpc-client"
import {
  enqueueCommentCreate,
  isLikelyOfflineError,
  removeCommentCreateByTempId,
} from "@/lib/offline-queue"
import { isCommentSide, isReviewState } from "@/lib/review-types"

function toDate(value: string | number | Date | null | undefined) {
  if (!value) return value
  if (value instanceof Date) return value
  return new Date(value)
}

export const usersCollection = createCollection(
  electricCollectionOptions({
    id: `users`,
    shapeOptions: {
      url: new URL(
        `/api/users`,
        typeof window !== `undefined`
          ? window.location.origin
          : `http://localhost:5173`
      ).toString(),
      parser: {
        timestamptz: (date: string) => {
          return new Date(date)
        },
      },
    },
    schema: selectUsersSchema,
    getKey: (item) => item.id,
  })
)
export const repositoriesCollection = createCollection(
  electricCollectionOptions({
    id: `repositories`,
    shapeOptions: {
      url: new URL(
        `/api/repositories`,
        typeof window !== `undefined`
          ? window.location.origin
          : `http://localhost:5173`
      ).toString(),
      parser: {
        timestamptz: (date: string) => {
          return new Date(date)
        },
      },
    },
    schema: selectRepositorySchema,
    getKey: (item) => item.id,
  })
)

export async function syncRepositoriesFromGitHub() {
  const result = await trpc.github.syncRepositories.mutate()
  await repositoriesCollection.preload()
  return result
}

export const pullRequestsCollection = createCollection(
  electricCollectionOptions({
    id: `pull_requests`,
    shapeOptions: {
      url: new URL(
        `/api/pull-requests`,
        typeof window !== `undefined`
          ? window.location.origin
          : `http://localhost:5173`
      ).toString(),
      parser: {
        timestamptz: (date: string) => {
          return new Date(date)
        },
      },
    },
    schema: selectPullRequestSchema,
    getKey: (item) => item.id,
  })
)

export async function syncRepositoryPullRequests(input: {
  repositoryId: number
  state: `open` | `closed` | `all`
}) {
  const result = await trpc.github.syncPullRequests.mutate(input)
  await pullRequestsCollection.preload()
  await prFilesCollection.preload()
  return result
}

export const prFilesCollection = createCollection(
  electricCollectionOptions({
    id: `pr_files`,
    shapeOptions: {
      url: new URL(
        `/api/pr-files`,
        typeof window !== `undefined`
          ? window.location.origin
          : `http://localhost:5173`
      ).toString(),
    },
    schema: selectPrFileSchema,
    getKey: (item) => item.id,
  })
)

export async function togglePrFileViewed(fileId: number, viewed: boolean) {
  let previousValue: boolean | undefined

  prFilesCollection.update(fileId, (draft) => {
    previousValue = draft.viewed
    draft.viewed = viewed
  })

  try {
    const result = await trpc.files.toggleViewed.mutate({
      fileId,
      viewed,
    })

    return { txid: result.txid }
  } catch (error) {
    const restoredValue = typeof previousValue === `boolean` ? previousValue : false

    prFilesCollection.update(fileId, (draft) => {
      draft.viewed = restoredValue
    })

    throw error
  }
}

export const commentsCollection = createCollection(
  electricCollectionOptions({
    id: `comments`,
    shapeOptions: {
      url: new URL(
        `/api/comments`,
        typeof window !== `undefined`
          ? window.location.origin
          : `http://localhost:5173`
      ).toString(),
      parser: {
        timestamptz: (date: string) => {
          return new Date(date)
        },
      },
    },
    schema: selectCommentSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newComment } = transaction.mutations[0]
      const commentSide = isCommentSide(newComment.side)
        ? newComment.side
        : undefined

      const mutationInput = {
        pull_request_id: newComment.pull_request_id,
        body: newComment.body,
        path: newComment.path || undefined,
        line: newComment.line || undefined,
        side: commentSide,
        commit_id: newComment.commit_id || undefined,
      }
      const queuedPayload = {
        pull_request_id: newComment.pull_request_id,
        body: newComment.body,
        path: newComment.path ?? null,
        line: newComment.line ?? null,
        side: commentSide ?? null,
        commit_id: newComment.commit_id ?? null,
      }

      const queueAndResolve = () => {
        enqueueCommentCreate(newComment.id, queuedPayload)
        return undefined
      }

      if (typeof navigator !== `undefined` && navigator.onLine === false) {
        console.log(`Offline detected - queueing comment create`)
        return queueAndResolve()
      }

      try {
        const result = await trpc.comments.create.mutate(mutationInput)
        const serverComment = result.comment

        commentsCollection.update(newComment.id, (draft) => {
          draft.id = serverComment.id
          draft.github_id = serverComment.github_id ?? null
          draft.synced_to_github = Boolean(serverComment.synced_to_github)
          const createdAt = toDate(serverComment.created_at)
          const updatedAt = toDate(serverComment.updated_at)
          if (createdAt) {
            draft.created_at = createdAt as Date
          }
          if (updatedAt) {
            draft.updated_at = updatedAt as Date
          }
        })

        try {
          await trpc.comments.syncToGitHub.mutate({ commentId: serverComment.id })
          commentsCollection.update(serverComment.id, (draft) => {
            draft.synced_to_github = true
            draft.updated_at = new Date()
          })
        } catch (err) {
          console.error(`Failed to sync comment to GitHub:`, err)
        }

        return { txid: result.txid }
      } catch (err) {
        if (isLikelyOfflineError(err as Error | TypeError | string | null | undefined)) {
          console.log(`Unable to reach server - queueing comment create for later sync`)
          return queueAndResolve()
        }

        throw err
      }
    },
    onDelete: async ({ transaction }) => {
      const { original: deletedComment } = transaction.mutations[0]
      const removedFromQueue = removeCommentCreateByTempId(deletedComment.id)

      if (removedFromQueue) {
        console.log(`Removed pending offline comment ${deletedComment.id}`)
        return
      }

      const result = await trpc.comments.delete.mutate({
        id: deletedComment.id,
      })

      return { txid: result.txid }
    },
  })
)

export const reviewsCollection = createCollection(
  electricCollectionOptions({
    id: `reviews`,
    shapeOptions: {
      url: new URL(
        `/api/reviews`,
        typeof window !== `undefined`
          ? window.location.origin
          : `http://localhost:5173`
      ).toString(),
      parser: {
        timestamptz: (date: string) => {
          return new Date(date)
        },
      },
    },
    schema: selectReviewSchema,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const { modified: newReview } = transaction.mutations[0]

      if (!isReviewState(newReview.state)) {
        throw new Error(`Invalid review state: ${String(newReview.state)}`)
      }

      try {
        const result = await trpc.reviews.create.mutate({
          pull_request_id: newReview.pull_request_id,
          state: newReview.state,
          body: newReview.body || undefined,
        })

        try {
          await trpc.reviews.submitToGitHub.mutate({ reviewId: result.review.id })
        } catch (err) {
          console.error(`Failed to sync review to GitHub:`, err)
        }

        return { txid: result.txid }
      } catch (err) {
        console.log(`Offline - review will sync when connection restored:`, err)
        return
      }
    },
  })
)

export async function syncReviewToGitHub(reviewId: number) {
  let previousValue: boolean | undefined

  reviewsCollection.update(reviewId, (draft) => {
    previousValue = draft.synced_to_github
    draft.synced_to_github = true
  })

  try {
    const result = await trpc.reviews.submitToGitHub.mutate({ reviewId })
    return { txid: result.txid }
  } catch (error) {
    const restoredValue = typeof previousValue === `boolean` ? previousValue : false

    reviewsCollection.update(reviewId, (draft) => {
      draft.synced_to_github = restoredValue
    })

    throw error
  }
}
