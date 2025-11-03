import {
  boolean,
  integer,
  pgTable,
  timestamp,
  varchar,
  text,
  bigint,
  jsonb,
} from "drizzle-orm/pg-core"
import { createSchemaFactory } from "drizzle-zod"
import { z } from "zod"
export * from "./auth-schema"
import { users } from "./auth-schema"

const { createInsertSchema, createSelectSchema, createUpdateSchema } =
  createSchemaFactory({ zodInstance: z })

export const repositoriesTable = pgTable(`repositories`, {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  github_id: bigint(`github_id`, { mode: 'number' }).notNull().unique(),
  full_name: varchar({ length: 255 }).notNull(),
  owner: varchar({ length: 255 }).notNull(),
  name: varchar({ length: 255 }).notNull(),
  description: text(),
  default_branch: varchar({ length: 255 }),
  private: boolean().notNull().default(false),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  user_id: text(`user_id`)
    .notNull()
    .references(() => users.id, { onDelete: `cascade` }),
})

export const pullRequestsTable = pgTable(`pull_requests`, {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  github_id: bigint(`github_id`, { mode: 'number' }).notNull().unique(),
  number: integer().notNull(),
  title: varchar({ length: 500 }).notNull(),
  body: text(),
  state: varchar({ length: 50 }).notNull(),
  author: varchar({ length: 255 }).notNull(),
  author_avatar: text(`author_avatar`),
  base_branch: varchar({ length: 255 }).notNull(),
  head_branch: varchar({ length: 255 }).notNull(),
  head_sha: varchar({ length: 255 }),
  mergeable: boolean(),
  merged: boolean().notNull().default(false),
  draft: boolean().notNull().default(false),
  created_at: timestamp({ withTimezone: true }).notNull(),
  updated_at: timestamp({ withTimezone: true }).notNull(),
  closed_at: timestamp({ withTimezone: true }),
  merged_at: timestamp({ withTimezone: true }),
  repository_id: integer(`repository_id`)
    .notNull()
    .references(() => repositoriesTable.id, { onDelete: `cascade` }),
})

export const prFilesTable = pgTable(`pr_files`, {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  filename: varchar({ length: 500 }).notNull(),
  status: varchar({ length: 50 }).notNull(),
  additions: integer().notNull().default(0),
  deletions: integer().notNull().default(0),
  changes: integer().notNull().default(0),
  patch: text(),
  previous_filename: varchar({ length: 500 }),
  sha: varchar({ length: 255 }),
  viewed: boolean().notNull().default(false),
  pull_request_id: integer(`pull_request_id`)
    .notNull()
    .references(() => pullRequestsTable.id, { onDelete: `cascade` }),
})

export const commentsTable = pgTable(`comments`, {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  github_id: bigint(`github_id`, { mode: 'number' }).unique(),
  body: text().notNull(),
  line: integer(),
  side: varchar({ length: 10 }),
  path: varchar({ length: 500 }),
  commit_id: varchar({ length: 255 }),
  author: varchar({ length: 255 }).notNull(),
  author_avatar: text(`author_avatar`),
  synced_to_github: boolean(`synced_to_github`).notNull().default(false),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  pull_request_id: integer(`pull_request_id`)
    .notNull()
    .references(() => pullRequestsTable.id, { onDelete: `cascade` }),
  user_id: text(`user_id`).references(() => users.id, {
    onDelete: `set null`,
  }),
})

export const reviewsTable = pgTable(`reviews`, {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  github_id: bigint(`github_id`, { mode: 'number' }).unique(),
  state: varchar({ length: 50 }).notNull(),
  body: text(),
  author: varchar({ length: 255 }).notNull(),
  author_avatar: text(`author_avatar`),
  synced_to_github: boolean(`synced_to_github`).notNull().default(false),
  submitted_at: timestamp({ withTimezone: true }),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  pull_request_id: integer(`pull_request_id`)
    .notNull()
    .references(() => pullRequestsTable.id, { onDelete: `cascade` }),
  user_id: text(`user_id`).references(() => users.id, {
    onDelete: `set null`,
  }),
})

export const prEventsTable = pgTable(`pr_events`, {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  delivery_id: varchar({ length: 255 }).notNull().unique(),
  github_event: varchar({ length: 100 }).notNull(),
  action: varchar({ length: 100 }),
  repository_github_id: bigint(`repository_github_id`, { mode: 'number' }),
  pull_request_github_id: bigint(`pull_request_github_id`, { mode: 'number' }),
  status: varchar({ length: 50 }).notNull().default(`pending`),
  retry_count: integer(`retry_count`).notNull().default(0),
  error_message: text(`error_message`),
  payload: jsonb(`payload`).notNull(),
  processed_at: timestamp({ withTimezone: true }),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const selectRepositorySchema = createSelectSchema(repositoriesTable)
export const createRepositorySchema = createInsertSchema(repositoriesTable)
export const updateRepositorySchema = createUpdateSchema(repositoriesTable)

export const selectPullRequestSchema = createSelectSchema(pullRequestsTable)
export const createPullRequestSchema = createInsertSchema(pullRequestsTable)
export const updatePullRequestSchema = createUpdateSchema(pullRequestsTable)

export const selectPrFileSchema = createSelectSchema(prFilesTable)
export const createPrFileSchema = createInsertSchema(prFilesTable)
export const updatePrFileSchema = createUpdateSchema(prFilesTable)

export const selectCommentSchema = createSelectSchema(commentsTable)
export const createCommentSchema = createInsertSchema(commentsTable)
export const updateCommentSchema = createUpdateSchema(commentsTable)

export const selectReviewSchema = createSelectSchema(reviewsTable)
export const createReviewSchema = createInsertSchema(reviewsTable)
export const updateReviewSchema = createUpdateSchema(reviewsTable)

export const selectPrEventSchema = createSelectSchema(prEventsTable)
export const createPrEventSchema = createInsertSchema(prEventsTable)
export const updatePrEventSchema = createUpdateSchema(prEventsTable)

export type Repository = z.infer<typeof selectRepositorySchema>
export type PullRequest = z.infer<typeof selectPullRequestSchema>
export type PrFile = z.infer<typeof selectPrFileSchema>
export type Comment = z.infer<typeof selectCommentSchema>
export type Review = z.infer<typeof selectReviewSchema>
export type PrEvent = z.infer<typeof selectPrEventSchema>

export const selectUsersSchema = createSelectSchema(users)
