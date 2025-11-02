import { useState } from "react"
import { syncRepositoriesFromGitHub } from "@/lib/collections"

type SyncReposModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function SyncReposModal({ isOpen, onClose, onSuccess }: SyncReposModalProps) {
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSync = async () => {
    setIsSyncing(true)
    setError(null)

    try {
      const result = await syncRepositoriesFromGitHub()
      onSuccess()
      alert(`Synced ${result.count} repositories!`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to sync repositories`)
    } finally {
      setIsSyncing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Sync Repositories</h2>
        
        <p className="text-gray-600 mb-6">
          This will fetch all your GitHub repositories and sync them to the app.
        </p>

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
            disabled={isSyncing}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSyncing ? `Syncing...` : `Sync Repositories`}
          </button>
        </div>
      </div>
    </div>
  )
}
