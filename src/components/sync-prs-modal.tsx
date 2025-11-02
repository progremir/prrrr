import { useState } from "react"
import { trpc } from "@/lib/trpc-client"
import type { Repository } from "@/db/schema"

type SyncPRsModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  repositories: Repository[]
}

export function SyncPRsModal({ isOpen, onClose, onSuccess, repositories }: SyncPRsModalProps) {
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null)
  const [state, setState] = useState<`open` | `closed` | `all`>(`open`)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSync = async () => {
    if (!selectedRepoId) return

    setIsSyncing(true)
    setError(null)

    try {
      const result = await trpc.github.syncPullRequests.mutate({
        repositoryId: selectedRepoId,
        state,
      })
      onSuccess()
      alert(`Synced ${result.count} pull requests!`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to sync pull requests`)
    } finally {
      setIsSyncing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Sync Pull Requests</h2>
        
        {repositories.length === 0 ? (
          <p className="text-gray-600 mb-6">
            No repositories found. Please sync repositories first.
          </p>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Repository
              </label>
              <select
                value={selectedRepoId || ``}
                onChange={(e) => setSelectedRepoId(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select a repository</option>
                {repositories.map((repo) => (
                  <option key={repo.id} value={repo.id}>
                    {repo.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                PR State
              </label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value as `open` | `closed` | `all`)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="all">All</option>
              </select>
            </div>
          </>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isSyncing}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSync}
            disabled={isSyncing || !selectedRepoId}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSyncing ? `Syncing...` : `Sync PRs`}
          </button>
        </div>
      </div>
    </div>
  )
}
