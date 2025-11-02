import * as React from "react"
import { createFileRoute, redirect, Link } from "@tanstack/react-router"
import { useLiveQuery } from "@tanstack/react-db"
import { useState } from "react"
import { repositoriesCollection, pullRequestsCollection } from "@/lib/collections"
import { authClient } from "@/lib/auth-client"
import { SyncReposModal } from "@/components/sync-repos-modal"
import { SyncPRsModal } from "@/components/sync-prs-modal"

export const Route = createFileRoute(`/_authenticated/`)({
  component: PullRequestList,
  ssr: false,
  beforeLoad: async () => {
    const res = await authClient.getSession()
    if (!res.data?.session) {
      throw redirect({
        to: `/login`,
        search: {
          redirect: location.href,
        },
      })
    }
  },
  loader: async () => {
    await Promise.all([repositoriesCollection.preload(), pullRequestsCollection.preload()])
    return null
  },
})

function PullRequestList() {
  const [searchTerm, setSearchTerm] = useState(``)
  const [filterState, setFilterState] = useState<`all` | `open` | `closed`>(`open`)
  const [showSyncRepos, setShowSyncRepos] = useState(false)
  const [showSyncPRs, setShowSyncPRs] = useState(false)
  
  const { data: repositories } = useLiveQuery((q) => q.from({ repositoriesCollection }), [showSyncRepos, showSyncPRs])
  const { data: pullRequests } = useLiveQuery((q) => q.from({ pullRequestsCollection }), [showSyncPRs])

  const filteredPRs = pullRequests.filter((pr) => {
    const matchesSearch = searchTerm === `` || 
      pr.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pr.author.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesState = filterState === `all` || pr.state === filterState
    return matchesSearch && matchesState
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pull Requests</h1>
          <p className="mt-2 text-sm text-gray-600">
            {repositories.length} {repositories.length === 1 ? `repository` : `repositories`} synced
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSyncRepos(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm font-medium"
          >
            Sync Repos
          </button>
          <button
            onClick={() => setShowSyncPRs(true)}
            disabled={repositories.length === 0}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sync PRs
          </button>
        </div>
      </div>

      <SyncReposModal
        isOpen={showSyncRepos}
        onClose={() => setShowSyncRepos(false)}
        onSuccess={() => {}}
      />
      <SyncPRsModal
        isOpen={showSyncPRs}
        onClose={() => setShowSyncPRs(false)}
        onSuccess={() => {}}
        repositories={repositories}
      />

      <div className="mb-6 flex gap-4">
        <input
          type="text"
          placeholder="Search pull requests..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={filterState}
          onChange={(e) => setFilterState(e.target.value as `all` | `open` | `closed`)}
          className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {filteredPRs.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No pull requests found</p>
          {repositories.length === 0 && (
            <p className="text-sm text-gray-400 mt-2">
              Add a repository to get started
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPRs.map((pr) => {
            const repo = repositories.find((r) => r.id === pr.repository_id)
            return (
              <Link
                key={pr.id}
                to="/pr/$prId"
                params={{ prId: pr.id.toString() }}
                className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-indigo-500 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
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
                      {pr.draft && (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          Draft
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-medium text-gray-900">{pr.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {repo?.full_name} #{pr.number} opened by {pr.author}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {pr.head_branch} → {pr.base_branch}
                    </p>
                  </div>
                  {pr.author_avatar && (
                    <img
                      src={pr.author_avatar}
                      alt={pr.author}
                      className="w-10 h-10 rounded-full"
                    />
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
