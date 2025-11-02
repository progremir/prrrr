import * as React from "react"
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { Outlet } from "@tanstack/react-router"
import { authClient, authStateCollection } from "@/lib/auth-client"
import { useLiveQuery } from "@tanstack/react-db"
import { repositoriesCollection } from "@/lib/collections"

export const Route = createFileRoute(`/_authenticated`)({
  ssr: false, // Disable SSR - run beforeLoad only on client
  component: AuthenticatedLayout,
  beforeLoad: async () => {
    if (
      authStateCollection.get(`auth`) &&
      authStateCollection.get(`auth`)?.session.expiresAt > new Date()
    ) {
      return authStateCollection.get(`auth`)!
    } else {
      const result = await authClient.getSession()
      authStateCollection.insert({ id: `auth`, ...result.data })
      return result.data
    }
  },
  errorComponent: ({ error }) => {
    const ErrorComponent = () => {
      const { data: session } = authClient.useSession()

      // Only redirect to login if user is not authenticated
      if (!session && typeof window !== `undefined`) {
        window.location.href = `/login`
        return null
      }

      // For other errors, render an error message
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
            <p className="text-gray-600 mb-4">
              {error?.message || `An unexpected error occurred`}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }

    return <ErrorComponent />
  },
})

function AuthenticatedLayout() {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()

  const { data: repositories } = useLiveQuery((q) =>
    q.from({ repositoriesCollection })
  )

  const handleLogout = async () => {
    await authClient.signOut()
    navigate({ to: `/login` })
  }

  if (isPending) {
    return null
  }

  if (!session) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex-shrink-0">
              <h1 className="text-xl font-semibold text-gray-900">
                PR Review App
              </h1>
            </Link>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {repositories.length} {repositories.length === 1 ? `repo` : `repos`}
              </span>
              <span className="text-sm text-gray-700">
                {session.user.email}
              </span>
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
