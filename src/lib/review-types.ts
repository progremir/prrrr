export type CommentSide = `LEFT` | `RIGHT`

export function isCommentSide(value: string | null | undefined): value is CommentSide {
  return value === `LEFT` || value === `RIGHT`
}

export type ReviewState = `APPROVE` | `REQUEST_CHANGES` | `COMMENT`

export function isReviewState(value: string | null | undefined): value is ReviewState {
  return value === `APPROVE` || value === `REQUEST_CHANGES` || value === `COMMENT`
}
