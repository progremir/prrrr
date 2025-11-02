import { z } from "zod"
import { router, authedProcedure } from "@/lib/trpc"
import { commentsTable, reviewsTable, pullRequestsTable, repositoriesTable } from "@/db/schema"
import { accounts } from "@/db/auth-schema"
import { eq } from "drizzle-orm"
import { createGitHubClient, createReviewComment } from "@/lib/github"
import { parseTxid } from "@/lib/txid"
import { isReviewState } from "@/lib/review-types"

export const commentsRouter = router({
  getPending: authedProcedure.query(async ({ ctx }) => {
    const pending = await ctx.db
      .select()
      .from(commentsTable)
      .where(eq(commentsTable.synced_to_github, false))

    return pending
  }),

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

      const txidValue = parseTxid(txid.rows[0]?.txid)
      return { comment: result[0], txid: txidValue }
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

      const txidValue = parseTxid(txid.rows[0]?.txid)
      return { txid: txidValue }
    }),

  syncToGitHub: authedProcedure
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [account] = await ctx.db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, ctx.session.user.id))
        .limit(1)

      if (!account?.accessToken) {
        throw new Error(`No GitHub account connected`)
      }

      const [comment] = await ctx.db
        .select()
        .from(commentsTable)
        .where(eq(commentsTable.id, input.commentId))
        .limit(1)

      if (!comment) {
        throw new Error(`Comment not found`)
      }

      if (!comment.path || !comment.line) {
        throw new Error(`Comment missing required fields (path or line)`)
      }

      const [pr] = await ctx.db
        .select()
        .from(pullRequestsTable)
        .where(eq(pullRequestsTable.id, comment.pull_request_id))
        .limit(1)

      if (!pr) {
        throw new Error(`Pull request not found`)
      }

      if (!pr.head_sha) {
        throw new Error(`PR missing head SHA`)
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

      const ghComment = await createReviewComment(
        octokit,
        repository.owner,
        repository.name,
        pr.number,
        comment.body,
        pr.head_sha,
        comment.path,
        comment.line
      )

      await ctx.db
        .update(commentsTable)
        .set({
          synced_to_github: true,
          github_id: ghComment.id,
        })
        .where(eq(commentsTable.id, input.commentId))

      const txid = await ctx.db.execute(
        `SELECT pg_current_xact_id()::xid::text as txid`
      )

      const txidValue = parseTxid(txid.rows[0]?.txid)
      return { txid: txidValue }
    }),
})

export const reviewsRouter = router({
  getPending: authedProcedure.query(async ({ ctx }) => {
    const pending = await ctx.db
      .select()
      .from(reviewsTable)
      .where(eq(reviewsTable.synced_to_github, false))

    return pending
  }),

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

      const txidValue = parseTxid(txid.rows[0]?.txid)
      return { review: result[0], txid: txidValue }
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

      if (!isReviewState(review.state)) {
        throw new Error(`Invalid review state: ${String(review.state)}`)
      }

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

      const txidValue = parseTxid(txid.rows[0]?.txid)
      return { txid: txidValue }
    }),
})
