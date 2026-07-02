// Fetch-stream SSE client. The native EventSource cannot send an `Authorization` header (and
// putting the JWT in the query string would leak it into logs), so this reads the event stream
// with `fetch` + a Bearer token instead. Heartbeat comments (`: ping`) keep the connection warm
// and are ignored by the parser; `data:` lines are JSON-parsed and handed to the caller.
//
// Reconnection: exponential backoff, reset after a healthy connection. The token is re-read on
// every (re)connect, so a 401 from an expired access token self-heals on the next attempt once
// the app's regular HTTP traffic (e.g. the polling fallback) has refreshed it.

export interface SseClientOptions {
  /** Absolute stream URL (including query). */
  url: string
  /** Called with the JSON-parsed payload of each `data:` event. */
  onEvent: (data: unknown) => void
  /** Connection health — drives the caller's polling cadence (relaxed vs full fallback). */
  onStateChange?: (connected: boolean) => void
  /** Read the current Bearer token; called per connection attempt. */
  getToken: () => string | null
  minBackoffMs?: number
  maxBackoffMs?: number
}

export interface SseClient {
  start(): void
  stop(): void
}

export function createSseClient(options: SseClientOptions): SseClient {
  const minBackoff = options.minBackoffMs ?? 1_000
  const maxBackoff = options.maxBackoffMs ?? 30_000

  let running = false
  let controller: AbortController | null = null

  async function consume(response: Response): Promise<void> {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('SSE response has no body')
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      // SSE frames are separated by a blank line.
      let sep = buffer.indexOf('\n\n')
      while (sep >= 0) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue // comments/heartbeats are ignored
          try {
            options.onEvent(JSON.parse(line.slice(5).trim()))
          } catch {
            // malformed frame: skip it, the stream stays up
          }
        }
        sep = buffer.indexOf('\n\n')
      }
    }
  }

  async function loop(): Promise<void> {
    let backoff = minBackoff
    while (running) {
      controller = new AbortController()
      try {
        const token = options.getToken()
        const response = await fetch(options.url, {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`SSE connect failed: ${response.status}`)
        options.onStateChange?.(true)
        backoff = minBackoff // healthy connection resets the backoff
        await consume(response)
      } catch {
        // aborted (stop) or transport error — fall through to the backoff/retry below
      }
      options.onStateChange?.(false)
      if (!running) return
      await new Promise((resolve) => setTimeout(resolve, backoff))
      backoff = Math.min(backoff * 2, maxBackoff)
    }
  }

  return {
    start() {
      if (running) return
      running = true
      void loop()
    },
    stop() {
      running = false
      controller?.abort()
      options.onStateChange?.(false)
    },
  }
}
