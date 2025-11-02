import { z } from "zod"
import { router, authedProcedure } from "@/lib/trpc"
import { commentsTable, reviewsTable, pullRequestsTable, repositoriesTable } from "@/db/schema"
import { accounts } from "@/db/auth-schema"
import { eq } from "drizzle-orm"
import { createGitHubClient } from "@/lib/github"

export const commentsRouter = router({
  create: authedProcedure
    .input(
      z.object({
        pull_request_id: z.number(),
        body: z.string(),
        path: z.string().optional(),
        line: z.number().optional(),
        side: z.enum([`LEFT`, `RIGHT`]).optional(),
        commit_id: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .insert(commentsTable)
        .values({
          ...input,
          author: ctx.session.user.name || ctx.session.user.email,
          author_avatar: ctx.session.user.image || null,
          user_id: ctx.session.user.id,
          synced_to_github: false,
        })
        .returning()

      const txid = await ctx.db.execute(
        `SELECT pg_current_xact_id()::xid::text as txid`
      )

      return { comment: result[0], txid: txid.rows[0].txid }
    }),

  delete: authedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(commentsTable)
        .where(eq(commentsTable.id, input.id))

      const txid = await ctx.db.execute(
        `SELECT pg_current_xact_id()::xid::text as txid`
      )

      return { txid: txid.rows[0].txid }
    }),
})

export const reviewsRouter = router({
  create: authedProcedure
    .input(
      z.object({
        pull_request_id: z.number(),
        state: z.enum([`APPROVE`, `REQUEST_CHANGES`, `COMMENT`]),
        body: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .insert(reviewsTable)
        .values({
          pull_request_id: input.pull_request_id,
          state: input.state,
          body: input.body || null,
          author: ctx.session.user.name || ctx.session.user.email,
          author_avatar: ctx.session.user.image || null,
          user_id: ctx.session.user.id,
          synced_to_github: false,
          submitted_at: new Date(),
        })
        .returning()

      const txid = await ctx.db.execute(
        `SELECT pg_current_xact_id()::xid::text as txid`
      )

      return { review: result[0], txid: txid.rows[0].txid }
    }),

  submitToGitHub: authedProcedure
    .input(z.object({ reviewId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [account] = await ctx.db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, ctx.session.user.id))
        .limit(1)

      if (!account?.accessToken) {
        throw new Error(`No GitHub account connected`)
      }

      const [review] = await ctx.db
        .select()
        .from(reviewsTable)
        .where(eq(reviewsTable.id, input.reviewId))
        .limit(1)

      if (!review) {
        throw new Error(`Review not found`)
      }

      const [pr] = await ctx.db
        .select()
        .from(pullRequestsTable)
        .where(eq(pullRequestsTable.id, review.pull_request_id))
        .limit(1)

      if (!pr) {
        throw new Error(`Pull request not found`)
      }

      const [repository] = await ctx.db
        .select()
        .from(repositoriesTable)
        .where(eq(repositoriesTable.id, pr.repository_id))
        .limit(1)

      if (!repository) {
        throw new Error(`Repository not found`)
      }

      const octokit = createGitHubClient(account.accessToken)

      const ghReview = await octokit.pulls.createReview({
        owner: repository.owner,
        repo: repository.name,
        pull_number: pr.number,
        event: review.state,
        body: review.body || undefined,
      })

      await ctx.db
        .update(reviewsTable)
        .set({
          synced_to_github: true,
          github_id: ghReview.data.id,
        })
        .where(eq(reviewsTable.id, input.reviewId))

      const txid = await ctx.db.execute(
        `SELECT pg_current_xact_id()::xid::text as txid`
      )

      return { txid: txid.rows[0].txid }
    }),
})
