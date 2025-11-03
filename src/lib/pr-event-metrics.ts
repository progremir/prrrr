import { useMemo } from "react"
import { useLiveQuery } from "@tanstack/react-db"
import type { PrEvent } from "@/db/schema"
import { prEventsCollection } from "@/lib/collections"

export type PrEventMetrics = {
  processed: number
  pending: number
  failed: number
  ignored: number
  latestProcessedAt: Date | null
  latestFailure: {
    id: number
    deliveryId: string
    errorMessage: string | null
    updatedAt: Date | null
    retryCount: number
  } | null
}

export function calculatePrEventMetrics(events: PrEvent[]): PrEventMetrics {
  let processed = 0
  let pending = 0
  let failed = 0
  let ignored = 0
  let latestProcessedAt: Date | null = null
  let latestFailure: PrEventMetrics[`latestFailure`] = null

  for (const event of events) {
    switch (event.status) {
      case `processed`:
        processed += 1
        if (
          event.processed_at instanceof Date &&
          (!latestProcessedAt ||
            (event.processed_at as Date).getTime() > latestProcessedAt.getTime())
        ) {
          latestProcessedAt = event.processed_at as Date
        }
        break
      case `pending`:
        pending += 1
        break
      case `failed`:
        failed += 1
        if (
          !latestFailure ||
          ((event.updated_at as Date | null)?.getTime() ?? 0) >
            ((latestFailure.updatedAt as Date | null)?.getTime() ?? 0)
        ) {
          latestFailure = {
            id: event.id,
            deliveryId: event.delivery_id,
            errorMessage: event.error_message ?? null,
            updatedAt: (event.updated_at as Date | null) ?? null,
            retryCount: event.retry_count ?? 0,
          }
        }
        break
      case `ignored`:
        ignored += 1
        break
      default:
        break
    }
  }

  return {
    processed,
    pending,
    failed,
    ignored,
    latestProcessedAt,
    latestFailure,
  }
}

export function usePrEventMetrics(): PrEventMetrics {
  const { data: events } = useLiveQuery((q) => q.from({ prEventsCollection }))

  return useMemo(() => calculatePrEventMetrics(events ?? []), [events])
}
