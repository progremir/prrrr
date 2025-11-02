import { createFileRoute } from "@tanstack/react-router"
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { router } from "@/lib/trpc"
import { usersRouter } from "@/lib/trpc/users"
import { githubRouter } from "@/lib/trpc/github"
import { commentsRouter, reviewsRouter } from "@/lib/trpc/comments"
import { filesRouter } from "@/lib/trpc/files"
import { db } from "@/db/connection"
import { auth } from "@/lib/auth"

export const appRouter = router({
  users: usersRouter,
  github: githubRouter,
  comments: commentsRouter,
  reviews: reviewsRouter,
  files: filesRouter,
})

export type AppRouter = typeof appRouter

const serve = ({ request }: { request: Request }) => {
  return fetchRequestHandler({
    endpoint: `/api/trpc`,
    req: request,
    router: appRouter,
    createContext: async () => ({
      db,
      session: await auth.api.getSession({ headers: request.headers }),
    }),
  })
}

export const Route = createFileRoute(`/api/trpc/$`)({
  server: {
    handlers: {
      GET: serve,
      POST: serve,
    },
  },
})
