import { z } from "zod"
import { router, authedProcedure } from "@/lib/trpc"
import { replayPrEvent } from "@/lib/github-webhook"

export const eventsRouter = router({
  replay: authedProcedure
    .input(z.object({ eventId: z.number() }))
    .mutation(async ({ input }) => {
      await replayPrEvent(input.eventId)
      return { success: true }
    }),
})
