import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "@/db/connection" // your drizzle instance
import * as schema from "@/db/auth-schema"
import { networkInterfaces } from "os"

// Get network IP for trusted origins
const nets = networkInterfaces()
let networkIP = `192.168.1.1` // fallback

for (const name of Object.keys(nets)) {
  const netInterfaces = nets[name]
  if (netInterfaces) {
    for (const net of netInterfaces) {
      if (net.family === `IPv4` && !net.internal) {
        networkIP = net.address
        break
      }
    }
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: `pg`,
    usePlural: true,
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: process.env.NODE_ENV === `production`,
    minPasswordLength: process.env.NODE_ENV === `production` ? 8 : 1,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scope: [`repo`, `read:user`, `user:email`],
    },
  },
  trustedOrigins: [
    `https://tanstack-start-db-electric-starter.localhost`,
    `https://${networkIP}`,
    `http://localhost:5173`,
  ],
})
