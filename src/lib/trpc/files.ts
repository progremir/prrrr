import { z } from "zod"
import { router, authedProcedure } from "@/lib/trpc"
import { prFilesTable } from "@/db/schema"
import { eq } from "drizzle-orm"

export const filesRouter = router({
  toggleViewed: authedProcedure
    .input(
      z.object({
        fileId: z.number(),
        viewed: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(prFilesTable)
        .set({ viewed: input.viewed })
        .where(eq(prFilesTable.id, input.fileId))

      const txid = await ctx.db.execute(
        `SELECT pg_current_xact_id()::xid::text as txid`
      )

      return { txid: txid.rows[0].txid }
    }),
})
