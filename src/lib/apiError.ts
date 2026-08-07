// Tiny helper to read an HTTP status off an unknown caught error without pulling axios types
// into every component. Used to distinguish 409 Conflict (delete blocked by dependents) from
// generic failures so screens can show a friendly, non-destructive message.
export function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response
    return response?.status
  }
  return undefined
}

export function isConflict(error: unknown): boolean {
  return statusOf(error) === 409
}

// FastAPI surfaces validation/business errors as `{ detail: "…" }`. Pull that human string off a
// caught error so screens can show the backend's own message (e.g. the recipe/stock guards) instead
// of a generic fallback. Returns undefined when the payload isn't a plain-string detail.
export function detailOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const data = (error as { response?: { data?: { detail?: unknown } } }).response?.data
    if (typeof data?.detail === 'string') return data.detail
  }
  return undefined
}
