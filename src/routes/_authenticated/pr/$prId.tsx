import { createFileRoute, useParams } from "@tanstack/react-router"
import { useLiveQuery } from "@tanstack/react-db"
import { useState, type ChangeEvent } from "react"
import {
  pullRequestsCollection,
  prFilesCollection,
  repositoriesCollection,
  commentsCollection,
  reviewsCollection,
  togglePrFileViewed,
  syncReviewToGitHub,
} from "@/lib/collections"
import { authClient } from "@/lib/auth-client"

export const Route = createFileRoute(`/_authenticated/pr/$prId`)({
  component: PullRequestDetail,
  ssr: false,
  loader: async () => {
    await Promise.all([
      pullRequestsCollection.preload(),
      prFilesCollection.preload(),
      repositoriesCollection.preload(),
      commentsCollection.preload(),
      reviewsCollection.preload(),
    ])
    return null
  },
})

function PullRequestDetail() {
  const { prId } = useParams({ from: `/_authenticated/pr/$prId` })
  const [viewMode, setViewMode] = useState<`unified` | `split`>(`unified`)
  const [selectedFile, setSelectedFile] = useState<number | null>(null)
  const [showReviewModal, setShowReviewModal] = useState(false)

  const { data: pullRequests = [] } = useLiveQuery((q) =>
    q.from({ pullRequestsCollection })
  )
  const { data: prFiles = [] } = useLiveQuery((q) =>
    q.from({ prFilesCollection })
  )
  const { data: repositories = [] } = useLiveQuery((q) =>
    q.from({ repositoriesCollection })
  )
  const { data: comments = [] } = useLiveQuery((q) =>
    q.from({ commentsCollection })
  )
  const { data: reviews = [] } = useLiveQuery((q) =>
    q.from({ reviewsCollection })
  )

  const pr = pullRequests.find((p) => p.id === parseInt(prId))
  const files = prFiles.filter((f) => f.pull_request_id === parseInt(prId))
  const repo = repositories.find((r) => r.id === pr?.repository_id)
  const prComments = comments.filter((c) => c.pull_request_id === parseInt(prId))
  const prReviews = reviews.filter((r) => r.pull_request_id === parseInt(prId))

  if (!pr) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-gray-500">Pull request not found</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          {pr.state === `open` ? (
            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
              Open
            </span>
          ) : pr.merged ? (
            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">
              Merged
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
              Closed
            </span>
          )}
          <h1 className="text-2xl font-bold text-gray-900">{pr.title}</h1>
        </div>
        <p className="text-sm text-gray-600">
          {repo?.full_name} #{pr.number} opened by {pr.author}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {pr.head_branch} → {pr.base_branch}
        </p>
      </div>

      {pr.body && (
        <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Description</h2>
          <p className="text-gray-700 whitespace-pre-wrap">{pr.body}</p>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Files changed ({files.length})
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowReviewModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
          >
            Submit Review
          </button>
          <button
            onClick={() => setViewMode(`unified`)}
            className={`px-3 py-1 text-sm rounded ${
              viewMode === `unified`
                ? `bg-indigo-600 text-white`
                : `bg-gray-200 text-gray-700 hover:bg-gray-300`
            }`}
          >
            Unified
          </button>
          <button
            onClick={() => setViewMode(`split`)}
            className={`px-3 py-1 text-sm rounded ${
              viewMode === `split`
                ? `bg-indigo-600 text-white`
                : `bg-gray-200 text-gray-700 hover:bg-gray-300`
            }`}
          >
            Split
          </button>
        </div>
      </div>

      <ReviewModal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        prId={parseInt(prId)}
        onSuccess={() => setShowReviewModal(false)}
      />

      {prReviews.length > 0 && (
        <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Reviews ({prReviews.length})</h3>
            {prReviews.some((r) => !r.synced_to_github) && (
              <SyncReviewsButton reviews={prReviews.filter((r) => !r.synced_to_github)} />
            )}
          </div>
          <div className="space-y-3">
            {prReviews.map((review) => (
              <div key={review.id} className="flex items-start gap-3 text-sm">
                {review.author_avatar && (
                  <img
                    src={review.author_avatar}
                    alt={review.author}
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{review.author}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        review.state === `APPROVE`
                          ? `bg-green-100 text-green-800`
                          : review.state === `REQUEST_CHANGES`
                          ? `bg-red-100 text-red-800`
                          : `bg-gray-100 text-gray-800`
                      }`}
                    >
                      {review.state === `APPROVE`
                        ? `Approved`
                        : review.state === `REQUEST_CHANGES`
                        ? `Changes requested`
                        : `Commented`}
                    </span>
                    {!review.synced_to_github && (
                      <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">
                        Pending sync
                      </span>
                    )}
                  </div>
                  {review.body && <p className="text-gray-700">{review.body}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {files.map((file) => (
          <FileCard
            key={file.id}
            file={file}
            isExpanded={selectedFile === file.id}
            onToggle={() => setSelectedFile(selectedFile === file.id ? null : file.id)}
            prId={parseInt(prId)}
            comments={prComments.filter((c) => c.path === file.filename)}
          />
        ))}
      </div>
    </div>
  )
}

type FileCardProps = {
  file: {
    id: number
    filename: string
    status: string
    additions: number
    deletions: number
    changes: number
    patch: string | null
    viewed: boolean
  }
  isExpanded: boolean
  onToggle: () => void
  prId: number
  comments: Array<{
    id: number
    body: string
    line: number | null
    author: string
    author_avatar: string | null
    created_at: Date
  }>
}

function FileCard({ file, isExpanded, onToggle, prId, comments }: FileCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case `added`:
        return `text-green-600`
      case `removed`:
        return `text-red-600`
      case `modified`:
        return `text-yellow-600`
      default:
        return `text-gray-600`
    }
  }

  const handleToggleViewed = async (e: ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    const newViewed = !file.viewed

    try {
      await togglePrFileViewed(file.id, newViewed)
    } catch (err) {
      alert(`Failed to mark as viewed`)
    }
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${
      file.viewed ? `border-gray-300 opacity-60` : `border-gray-200`
    }`}>
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={file.viewed}
            onChange={handleToggleViewed}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 text-indigo-600 rounded"
            title="Mark as viewed"
          />
          <span className={`text-sm font-medium ${getStatusColor(file.status)}`}>
            {file.status}
          </span>
          <span className="font-mono text-sm">{file.filename}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-green-600">+{file.additions}</span>
          <span className="text-sm text-red-600">-{file.deletions}</span>
          <svg
            className={`w-5 h-5 transition-transform ${isExpanded ? `rotate-180` : ``}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>
      
      {isExpanded && file.patch && (
        <div className="bg-white">
          <DiffViewer
            patch={file.patch}
            filename={file.filename}
            prId={prId}
            comments={comments}
          />
        </div>
      )}
    </div>
  )
}

type DiffViewerProps = {
  patch: string
  filename: string
  prId: number
  comments: Array<{
    id: number
    body: string
    line: number | null
    author: string
    author_avatar: string | null
    created_at: Date
  }>
}

function DiffViewer({ patch, filename, prId, comments }: DiffViewerProps) {
  const { data: session } = authClient.useSession()
  const [commentingLine, setCommentingLine] = useState<number | null>(null)
  const [commentText, setCommentText] = useState(``)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const lines = patch.split(`\n`)

  const { data: pullRequests } = useLiveQuery((q) =>
    q.from({ pullRequestsCollection })
  )
  const pr = (pullRequests ?? []).find((p) => p.id === prId)

  const handleAddComment = async (lineNumber: number) => {
    if (!commentText.trim()) return

    if (!pr?.head_sha) {
      alert(`Cannot add comment: PR head SHA not found`)
      return
    }

    const user = session?.user

    if (!user) {
      alert(`Not authenticated`)
      return
    }

    setIsSubmitting(true)
    try {
      commentsCollection.insert({
        id: Math.floor(Math.random() * 1000000000),
        pull_request_id: prId,
        body: commentText,
        path: filename,
        line: lineNumber,
        side: `RIGHT`,
        commit_id: pr.head_sha,
        author: user.name || user.email,
        author_avatar: user.image || null,
        user_id: user.id,
        synced_to_github: false,
        github_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      })

      setCommentText(``)
      setCommentingLine(null)
    } catch (err) {
      alert(`Failed to add comment: ${err instanceof Error ? err.message : `Unknown error`}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="font-mono text-sm overflow-x-auto">
      {lines.map((line, index) => {
        const lineNumber = index + 1
        let bgColor = `bg-white`
        let textColor = `text-gray-700`
        
        if (line.startsWith(`+`)) {
          bgColor = `bg-green-50`
          textColor = `text-green-800`
        } else if (line.startsWith(`-`)) {
          bgColor = `bg-red-50`
          textColor = `text-red-800`
        } else if (line.startsWith(`@@`)) {
          bgColor = `bg-blue-50`
          textColor = `text-blue-800`
        }

        const lineComments = comments.filter((c) => c.line === lineNumber)

        return (
          <div key={index}>
            <div
              className={`${bgColor} ${textColor} px-4 py-0.5 hover:bg-opacity-75 group flex items-center`}
            >
              <button
                onClick={() => setCommentingLine(commentingLine === lineNumber ? null : lineNumber)}
                className="select-none text-gray-400 hover:text-indigo-600 mr-4 inline-block w-12 text-right opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {lineNumber}
              </button>
              <span className="flex-1">{line}</span>
            </div>

            {lineComments.length > 0 && (
              <div className="bg-gray-50 border-l-4 border-indigo-500 px-4 py-3">
                {lineComments.map((comment) => (
                  <div key={comment.id} className="flex gap-3 mb-3 last:mb-0">
                    {comment.author_avatar && (
                      <img
                        src={comment.author_avatar}
                        alt={comment.author}
                        className="w-8 h-8 rounded-full"
                      />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm text-gray-900">
                          {comment.author}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(comment.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {comment.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {commentingLine === lineNumber && (
              <div className="bg-gray-50 border-l-4 border-yellow-500 px-4 py-3">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAddComment(lineNumber)}
                    disabled={isSubmitting || !commentText.trim()}
                    className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isSubmitting ? `Adding...` : `Add comment`}
                  </button>
                  <button
                    onClick={() => {
                      setCommentingLine(null)
                      setCommentText(``)
                    }}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

type SyncReviewsButtonProps = {
  reviews: Array<{ id: number }>
}

function SyncReviewsButton({ reviews }: SyncReviewsButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncedCount, setSyncedCount] = useState(0)

  const handleSync = async () => {
    setIsSyncing(true)
    setSyncedCount(0)
    let successCount = 0

    try {
      for (const review of reviews) {
        try {
          await syncReviewToGitHub(review.id)
          successCount++
          setSyncedCount(successCount)
        } catch (err) {
          console.error(`Failed to sync review ${review.id}:`, err)
        }
      }

      if (successCount === reviews.length) {
        alert(`Successfully synced ${successCount} review(s) to GitHub!`)
      } else {
        alert(`Synced ${successCount} of ${reviews.length} reviews. Check console for errors.`)
      }
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={isSyncing}
      className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
    >
      {isSyncing ? `Syncing ${syncedCount}/${reviews.length}...` : `Sync to GitHub (${reviews.length})`}
    </button>
  )
}

type ReviewModalProps = {
  isOpen: boolean
  onClose: () => void
  prId: number
  onSuccess: () => void
}

function ReviewModal({ isOpen, onClose, prId, onSuccess }: ReviewModalProps) {
  const { data: session } = authClient.useSession()
  const [state, setState] = useState<`APPROVE` | `REQUEST_CHANGES` | `COMMENT`>(`COMMENT`)
  const [body, setBody] = useState(``)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!session) {
      setError(`Not authenticated`)
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      reviewsCollection.insert({
        id: Math.floor(Math.random() * 1000000000),
        pull_request_id: prId,
        state,
        body: body || null,
        author: session.user.name || session.user.email,
        author_avatar: session.user.image || null,
        user_id: session.user.id,
        synced_to_github: false,
        github_id: null,
        submitted_at: new Date(),
        created_at: new Date(),
      })

      setBody(``)
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to submit review`)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Submit Review</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Review Type
          </label>
          <select
            value={state}
            onChange={(e) => setState(e.target.value as typeof state)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="COMMENT">Comment</option>
            <option value="APPROVE">Approve</option>
            <option value="REQUEST_CHANGES">Request Changes</option>
          </select>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Review Comment (Optional)
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add your review feedback..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSubmitting ? `Submitting...` : `Submit Review`}
          </button>
        </div>
      </div>
    </div>
  )
}
