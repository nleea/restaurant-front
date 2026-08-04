// Live-refetch primitive — the KDS realtime pattern (SSE doorbell → debounced refetch + polling
// fallback) extracted from `stores/kitchen.ts` so any branch-scoped view can opt into live updates.
//
// The model, unchanged from the KDS: an SSE event is a *doorbell*, not a payload — on receipt the
// caller refetches its authoritative data (debounced so bursts collapse into one call). A polling
// timer always runs as a safety net: relaxed while the stream is healthy, full cadence when it
// drops. This is a plain factory (no Vue lifecycle hooks) so Pinia stores can own it and start/stop
// it with the view.
import { createSseClient, type SseClient } from '@/lib/sse'
import { getAccessToken } from '@/lib/tokens'

/** Full fallback cadence — the view stays current on polling alone when the stream is down. */
export const POLL_FULL_MS = 10_000
/** Cadence while the SSE stream is healthy: polling is only a safety net then. */
export const POLL_RELAXED_MS = 60_000
/** Events arriving within this window collapse into one refetch. */
export const EVENT_DEBOUNCE_MS = 300

export interface LiveRefetchOptions {
  /** Absolute SSE stream URL (including `?branch_id=…`). */
  url: string
  /** The refetch to run on a doorbell (or a poll tick). Errors are swallowed; the next fires. */
  onDoorbell: () => void | Promise<void>
  /** Full fallback cadence (ms) — used until the stream reports healthy, and when it drops. */
  pollFull?: number
  /** Relaxed cadence (ms) while the stream is connected. */
  pollRelaxed?: number
  /** Debounce window (ms) for collapsing event bursts into one refetch. */
  debounceMs?: number
  /** Bearer token source; defaults to the same one the KDS uses. */
  getToken?: () => string | null
}

export interface LiveRefetch {
  start(): void
  stop(): void
}

// Timers and the SSE client are process plumbing, not reactive state, so they live in the closure.
export function createLiveRefetch(options: LiveRefetchOptions): LiveRefetch {
  const pollFull = options.pollFull ?? POLL_FULL_MS
  const pollRelaxed = options.pollRelaxed ?? POLL_RELAXED_MS
  const debounceMs = options.debounceMs ?? EVENT_DEBOUNCE_MS
  const getToken = options.getToken ?? getAccessToken

  let client: SseClient | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let inFlight = false

  // One refetch at a time: a tick is skipped while a previous fetch (from a poll or a doorbell) is
  // still running, so a slow API never stacks overlapping requests.
  async function fire(): Promise<void> {
    if (inFlight) return
    inFlight = true
    try {
      await options.onDoorbell()
    } catch {
      // keep the last good view; the next event/tick retries
    } finally {
      inFlight = false
    }
  }

  // A hidden tab shouldn't hammer the API (a wall screen left up, a backgrounded phone).
  function startPolling(intervalMs: number): void {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void fire()
    }, intervalMs)
  }

  function start(): void {
    stop()
    // Poll at full cadence until the stream reports healthy, then it relaxes to a safety net.
    startPolling(pollFull)
    const current = createSseClient({
      url: options.url,
      getToken,
      onEvent: () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          debounceTimer = undefined
          void fire()
        }, debounceMs)
      },
      onStateChange: (connected) => {
        if (client !== current) return // stale client (stopped/replaced): don't touch polling
        startPolling(connected ? pollRelaxed : pollFull)
      },
    })
    client = current
    current.start()
  }

  function stop(): void {
    const current = client
    client = undefined
    current?.stop()
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = undefined
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = undefined
  }

  return { start, stop }
}
