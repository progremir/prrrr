import { z } from "zod"
import { router, authedProcedure } from "@/lib/trpc"
import { accounts } from "@/db/auth-schema"
import { repositoriesTable, pullRequestsTable, prFilesTable, commentsTable, reviewsTable } from "@/db/schema"
import { eq } from "drizzle-orm"
import {
  createGitHubClient,
  fetchUserRepositories,
  fetchRepositoryPullRequests,
  fetchPullRequestFiles,
  fetchPullRequestComments,
  fetchPullRequestReviews,
} from "@/lib/github"
import { parseTxid } from "@/lib/txid"
import { isCommentSide, isReviewState } from "@/lib/review-types"

function getErrorMessage(error: Error | { message?: string } | string | null | undefined) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === `string`) {
    return error
  }

  try {
    return JSON.stringify(error)
  } catch {
    return `Unknown error`
  }
}

export const githubRouter = router({
  syncRepositories: authedProcedure.mutation(async ({ ctx }) => {
    const [account] = await ctx.db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, ctx.session.user.id))
      .limit(1)

    if (!account?.accessToken) {
      throw new Error(`No GitHub account connected`)
    }

    const octokit = createGitHubClient(account.accessToken)
    const repos = await fetchUserRepositories(octokit)

    for (const repo of repos) {
      await ctx.db
        .insert(repositoriesTable)
        .values({
          github_id: repo.id,
          full_name: repo.full_name,
          owner: repo.owner.login,
          name: repo.name,
          description: repo.description || null,
          default_branch: repo.default_branch || null,
          private: repo.private,
          user_id: ctx.session.user.id,
        })
        .onConflictDoUpdate({
          target: repositoriesTable.github_id,
          set: {
            full_name: repo.full_name,
            name: repo.name,
            description: repo.description || null,
            default_branch: repo.default_branch || null,
            updated_at: new Date(),
          },
        })
    }

    const txid = await ctx.db.execute(
      `SELECT pg_current_xact_id()::xid::text as txid`
    )

    const txidValue = parseTxid(txid.rows[0]?.txid)

    return { count: repos.length, txid: txidValue }
  }),

  syncPullRequests: authedProcedure
    .input(
      z.object({
        repositoryId: z.number(),
        state: z.enum([`open`, `closed`, `all`]).default(`open`),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [account] = await ctx.db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, ctx.session.user.id))
        .limit(1)

      if (!account?.accessToken) {
        throw new Error(`No GitHub account connected`)
      }

      const [repository] = await ctx.db
        .select()
        .from(repositoriesTable)
        .where(eq(repositoriesTable.id, input.repositoryId))
        .limit(1)

      if (!repository) {
        throw new Error(`Repository not found`)
      }

      const octokit = createGitHubClient(account.accessToken)
      
      let prs
      try {
        prs = await fetchRepositoryPullRequests(
          octokit,
          repository.owner,
          repository.name,
          input.state
        )
      } catch (error) {
        console.error(`GitHub API error:`, error)
        const reason = getErrorMessage(error as Error | { message?: string } | string | null | undefined)
        throw new Error(`Failed to fetch PRs from GitHub: ${reason}`)
      }

      for (const pr of prs) {
        let insertedPr
        try {
          insertedPr = await ctx.db
            .insert(pullRequestsTable)
            .values({
              github_id: pr.id,
              number: pr.number,
              title: pr.title,
              body: pr.body || null,
              state: pr.state,
              author: pr.user?.login || `unknown`,
              author_avatar: pr.user?.avatar_url || null,
              base_branch: pr.base.ref,
              head_branch: pr.head.ref,
              head_sha: pr.head.sha,
              mergeable: null,
              merged: Boolean(pr.merged_at),
              draft: pr.draft || false,
              created_at: new Date(pr.created_at),
              updated_at: new Date(pr.updated_at),
              closed_at: pr.closed_at ? new Date(pr.closed_at) : null,
              merged_at: pr.merged_at ? new Date(pr.merged_at) : null,
              repository_id: repository.id,
            })
            .onConflictDoUpdate({
              target: pullRequestsTable.github_id,
              set: {
                title: pr.title,
                body: pr.body || null,
                state: pr.state,
                head_sha: pr.head.sha,
                mergeable: null,
                merged: Boolean(pr.merged_at),
                draft: pr.draft || false,
                updated_at: new Date(pr.updated_at),
                closed_at: pr.closed_at ? new Date(pr.closed_at) : null,
                merged_at: pr.merged_at ? new Date(pr.merged_at) : null,
              },
            })
            .returning()
        } catch (error) {
          console.error(`Failed to insert PR #${pr.number}:`, error)
          console.error(
            `PR data:`,
            JSON.stringify(
              {
                github_id: pr.id,
                number: pr.number,
                title: pr.title,
                state: pr.state,
                mergeable: null,
                merged: Boolean(pr.merged_at),
                draft: pr.draft,
              },
              null,
              2
            )
          )
          const reason = getErrorMessage(error as Error | { message?: string } | string | null | undefined)
          throw new Error(`Failed to insert PR #${pr.number}: ${reason}`)
        }

        const prId = insertedPr[0]?.id
        if (!prId) {
          console.error(`Failed to get PR ID for PR #${pr.number}`)
          continue
        }

        const files = await fetchPullRequestFiles(
          octokit,
          repository.owner,
          repository.name,
          pr.number
        )

        await ctx.db.delete(prFilesTable).where(eq(prFilesTable.pull_request_id, prId))

        for (const file of files) {
          await ctx.db.insert(prFilesTable).values({
            filename: file.filename,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
            changes: file.changes,
            patch: file.patch || null,
            previous_filename: file.previous_filename || null,
            sha: file.sha,
            pull_request_id: prId,
          })
        }

        const comments = await fetchPullRequestComments(
          octokit,
          repository.owner,
          repository.name,
          pr.number
        )

        for (const comment of comments) {
          const side = isCommentSide(comment.side) ? comment.side : null
          await ctx.db
            .insert(commentsTable)
            .values({
              github_id: comment.id,
              body: comment.body || ``,
              line: comment.line || null,
              side,
              path: comment.path || null,
              commit_id: comment.commit_id || null,
              author: comment.user?.login || `unknown`,
              author_avatar: comment.user?.avatar_url || null,
              synced_to_github: true,
              pull_request_id: prId,
              user_id: ctx.session.user.id,
              created_at: new Date(comment.created_at),
            })
            .onConflictDoUpdate({
              target: commentsTable.github_id,
              set: {
                body: comment.body || ``,
                updated_at: new Date(),
              },
            })
        }

        const reviews = await fetchPullRequestReviews(
          octokit,
          repository.owner,
          repository.name,
          pr.number
        )

        for (const review of reviews) {
          if (review.state === `PENDING`) continue

          const reviewState = isReviewState(review.state)
            ? review.state
            : `COMMENT`

          await ctx.db
            .insert(reviewsTable)
            .values({
              github_id: review.id,
              state: reviewState,
              body: review.body || null,
              author: review.user?.login || `unknown`,
              author_avatar: review.user?.avatar_url || null,
              synced_to_github: true,
              submitted_at: review.submitted_at ? new Date(review.submitted_at) : null,
              pull_request_id: prId,
              user_id: ctx.session.user.id,
            })
            .onConflictDoUpdate({
              target: reviewsTable.github_id,
              set: {
                state: reviewState,
                body: review.body || null,
                submitted_at: review.submitted_at ? new Date(review.submitted_at) : null,
              },
            })
        }
      }

      const txid = await ctx.db.execute(
        `SELECT pg_current_xact_id()::xid::text as txid`
      )

      const txidValue = parseTxid(txid.rows[0]?.txid)

      return { count: prs.length, txid: txidValue }
    }),
})
