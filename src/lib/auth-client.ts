import { createAuthClient } from "better-auth/react"
import {
  createCollection,
  localOnlyCollectionOptions,
} from "@tanstack/react-db"
import { z } from "zod"

const authUserSchema = z
  .object({
    id: z.string(),
    email: z.string().email().or(z.string()),
    name: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
  })
  .passthrough()

const authSessionSchema = z
  .object({
    expiresAt: z.union([z.string(), z.number(), z.date()]).nullable().optional(),
    user: authUserSchema.nullable().optional(),
  })
  .passthrough()

const authStateSchema = z
  .object({
    id: z.string(),
    session: authSessionSchema.nullable(),
    user: authUserSchema.nullable(),
  })
  .passthrough()

export type AuthState = z.infer<typeof authStateSchema>
export type AuthSession = z.infer<typeof authSessionSchema>
export type AuthUser = z.infer<typeof authUserSchema>

export const authStateCollection = createCollection(
  localOnlyCollectionOptions({
    id: `auth-state`,
    getKey: (item) => item.id,
    schema: authStateSchema,
  })
)

export const authClient = createAuthClient({
  baseURL:
    typeof window !== `undefined`
      ? window.location.origin // Always use current domain in browser
      : undefined, // Let better-auth handle server-side baseURL detection
})
