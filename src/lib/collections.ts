import { createCollection } from "@tanstack/react-db"
import { electricCollectionOptions } from "@tanstack/electric-db-collection"
import {
  selectUsersSchema,
  selectRepositorySchema,
  selectPullRequestSchema,
  selectPrFileSchema,
  selectCommentSchema,
  selectReviewSchema,
} from "@/db/schema"
import { trpc } from "@/lib/trpc-client"

export const usersCollection = createCollection(
  electricCollectionOptions({
    id: `users`,
    shapeOptions: {
      url: new URL(
        `/api/users`,
        typeof window !== `undefined`
          ? window.location.origin
          : `http://localhost:5173`
      ).toString(),
      parser: {
        timestamptz: (date: string) => {
          return new Date(date)
        },
      },
    },
    schema: selectUsersSchema,
    getKey: (item) => item.id,
  })
)
export const repositoriesCollection = createCollection(
  electricCollectionOptions({
    id: `repositories`,
    shapeOptions: {
      url: new URL(
        `/api/repositories`,
        typeof window !== `undefined`
          ? window.location.origin
          : `http://localhost:5173`
      ).toString(),
      parser: {
        timestamptz: (date: string) => {
          return new Date(date)
        },
      },
    },
    schema: selectRepositorySchema,
    getKey: (item) => item.id,
  })
)

export const pullRequestsCollection = createCollection(
  electricCollectionOptions({
    id: `pull_requests`,
    shapeOptions: {
      url: new URL(
        `/api/pull-requests`,
        typeof window !== `undefined`
          ? window.location.origin
          : `http://localhost:5173`
      ).toString(),
      parser: {
        timestamptz: (date: string) => {
          return new Date(date)
        },
      },
    },
    schema: selectPullRequestSchema,
    getKey: (item) => item.id,
  })
)

export const prFilesCollection = createCollection(
  electricCollectionOptions({
    id: `pr_files`,
    shapeOptions: {
      url: new URL(
        `/api/pr-files`,
        typeof window !== `undefined`
          ? window.location.origin
          : `http://localhost:5173`
      ).toString(),
    },
    schema: selectPrFileSchema,
    getKey: (item) => item.id,
  })
)

export const commentsCollection = createCollection(
  electricCollectionOptions({
    id: `comments`,
    shapeOptions: {
      url: new URL(
        `/api/comments`,
        typeof window !== `undefined`
          ? window.location.origin
          : `http://localhost:5173`
      ).toString(),
      parser: {
        timestamptz: (date: string) => {
          return new Date(date)
        },
      },
    },
    schema: selectCommentSchema,
    getKey: (item) => item.id,
  })
)

export const reviewsCollection = createCollection(
  electricCollectionOptions({
    id: `reviews`,
    shapeOptions: {
      url: new URL(
        `/api/reviews`,
        typeof window !== `undefined`
          ? window.location.origin
          : `http://localhost:5173`
      ).toString(),
      parser: {
        timestamptz: (date: string) => {
          return new Date(date)
        },
      },
    },
    schema: selectReviewSchema,
    getKey: (item) => item.id,
  })
)
