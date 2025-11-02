export type CommentCreatePayload = {
  pull_request_id: number
  body: string
  path: string | null
  line: number | null
  side: `LEFT` | `RIGHT` | null
  commit_id: string | null
}

export type CommentCreateOperation = {
  id: string
  type: `comment:create`
  tempId: number
  payload: CommentCreatePayload
}

const STORAGE_KEY = `prrrr.offlineQueue`

function isBrowser() {
  return typeof window !== `undefined` && typeof window.localStorage !== `undefined`
}

function readQueue(): CommentCreateOperation[] {
  if (!isBrowser()) {
    return []
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item && typeof item === `object`)
  } catch (error) {
    console.error(`Failed to read offline queue`, error)
    return []
  }
}

function writeQueue(queue: CommentCreateOperation[]) {
  if (!isBrowser()) return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  } catch (error) {
    console.error(`Failed to write offline queue`, error)
  }
}

function generateId() {
  if (typeof crypto !== `undefined` && typeof crypto.randomUUID === `function`) {
    return crypto.randomUUID()
  }

  return `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function enqueueCommentCreate(tempId: number, payload: CommentCreatePayload) {
  if (!isBrowser()) return

  const queue = readQueue().filter(
    (operation) => !(operation.type === `comment:create` && operation.tempId === tempId)
  )

  queue.push({
    id: generateId(),
    type: `comment:create`,
    tempId,
    payload,
  })

  writeQueue(queue)
}

export function removeCommentCreateByTempId(tempId: number) {
  if (!isBrowser()) return false

  const queue = readQueue()
  const newQueue = queue.filter(
    (operation) => !(operation.type === `comment:create` && operation.tempId === tempId)
  )

  if (newQueue.length === queue.length) {
    return false
  }

  writeQueue(newQueue)
  return true
}

export function removeOfflineOperation(id: string) {
  if (!isBrowser()) return

  const queue = readQueue().filter((operation) => operation.id !== id)
  writeQueue(queue)
}

export function getPendingCommentCreates(): CommentCreateOperation[] {
  return readQueue().filter((operation) => operation.type === `comment:create`)
}

const OFFLINE_ERROR_MESSAGE = /Failed to fetch|NetworkError|Network request failed|fetch failed|load failed/i

export function isLikelyOfflineError(error: unknown) {
  if (typeof navigator !== `undefined` && navigator.onLine === false) {
    return true
  }

  if (!error) return false

  if (error instanceof TypeError && OFFLINE_ERROR_MESSAGE.test(error.message)) {
    return true
  }

  if (error instanceof Error && OFFLINE_ERROR_MESSAGE.test(error.message)) {
    return true
  }

  return false
}
