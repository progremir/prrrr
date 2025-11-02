export function parseTxid(value: unknown): number {
  if (typeof value === `number` && Number.isFinite(value)) {
    return value
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid txid value: ${String(value)}`)
  }

  return parsed
}
