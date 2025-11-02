import { trpc } from "@/lib/trpc-client"
import { commentsCollection } from "@/lib/collections"
import {
  getPendingCommentCreates,
  isLikelyOfflineError,
  removeOfflineOperation,
} from "@/lib/offline-queue"

function toDate(value: unknown) {
  if (!value) return value
  if (value instanceof Date) return value
  return new Date(value as string | number)
}

export function startBackgroundSync() {
  if (typeof window === `undefined`) return

  let syncInterval: NodeJS.Timeout | null = null

  const syncPendingItems = async () => {
    try {
      const pendingLocalCreates = getPendingCommentCreates()
      if (pendingLocalCreates.length > 0) {
        let requiresRefresh = false

        for (const operation of pendingLocalCreates) {
          try {
            const payload = operation.payload
            const result = await trpc.comments.create.mutate({
              pull_request_id: payload.pull_request_id,
              body: payload.body,
              path: payload.path ?? undefined,
              line: payload.line ?? undefined,
              side: payload.side ?? undefined,
              commit_id: payload.commit_id ?? undefined,
            })

            const serverComment = result.comment

            commentsCollection.update(operation.tempId, (draft) => {
              draft.id = serverComment.id
              draft.github_id = serverComment.github_id ?? null
              draft.synced_to_github = serverComment.synced_to_github ?? false
              const createdAt = toDate(serverComment.created_at)
              const updatedAt = toDate(serverComment.updated_at)
              if (createdAt) {
                draft.created_at = createdAt as Date
              }
              if (updatedAt) {
                draft.updated_at = updatedAt as Date
              }
            })

            removeOfflineOperation(operation.id)

            try {
              await trpc.comments.syncToGitHub.mutate({ commentId: serverComment.id })
              commentsCollection.update(serverComment.id, (draft) => {
                draft.synced_to_github = true
                draft.updated_at = new Date()
              })
            } catch (err) {
              console.error(`Failed to sync queued comment ${serverComment.id} to GitHub`, err)
            }

            requiresRefresh = true
          } catch (err) {
            if (isLikelyOfflineError(err)) {
              console.log(`Still offline while flushing queued comments`)
              break
            }

            console.error(`Failed to flush queued comment`, err)
            removeOfflineOperation(operation.id)
          }
        }

        if (requiresRefresh) {
          await commentsCollection.preload()
        }
      }

      const pendingComments = await trpc.comments.getPending.query()
      const pendingReviews = await trpc.reviews.getPending.query()

      for (const comment of pendingComments) {
        try {
          await trpc.comments.syncToGitHub.mutate({ commentId: comment.id })
          console.log(`Synced comment ${comment.id} to GitHub`)
        } catch (err) {
          console.error(`Failed to sync comment ${comment.id}:`, err)
        }
      }

      for (const review of pendingReviews) {
        try {
          await trpc.reviews.submitToGitHub.mutate({ reviewId: review.id })
          console.log(`Synced review ${review.id} to GitHub`)
        } catch (err) {
          console.error(`Failed to sync review ${review.id}:`, err)
        }
      }

      if (pendingComments.length > 0 || pendingReviews.length > 0) {
        console.log(`Background sync complete: ${pendingComments.length} comments, ${pendingReviews.length} reviews`)
      }
    } catch (err) {
      console.error(`Background sync error:`, err)
    }
  }

  const startSync = () => {
    if (syncInterval) return
    syncInterval = setInterval(syncPendingItems, 30000)
    console.log(`Background sync started (every 30s)`)
  }

  const stopSync = () => {
    if (syncInterval) {
      clearInterval(syncInterval)
      syncInterval = null
      console.log(`Background sync stopped`)
    }
  }

  window.addEventListener(`online`, () => {
    console.log(`Network online - triggering immediate sync`)
    syncPendingItems()
    startSync()
  })

  window.addEventListener(`offline`, () => {
    console.log(`Network offline - pausing background sync`)
    stopSync()
  })

  if (navigator.onLine) {
    startSync()
  }

  return () => {
    stopSync()
    window.removeEventListener(`online`, syncPendingItems)
    window.removeEventListener(`offline`, stopSync)
  }
}
