import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSseClient } from '../sse'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

function okResponse(chunks: string[]): Response {
  return new Response(streamOf(chunks), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function until(predicate: () => boolean, ms = 500): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time')
    await new Promise((r) => setTimeout(r, 5))
  }
}

describe('fetch-stream SSE client', () => {
  it('parses data frames, ignores heartbeats, and sends the Bearer token', async () => {
    const fetchMock = vi.fn<(...a: unknown[]) => Promise<Response>>().mockImplementation(() =>
      Promise.resolve(
        okResponse([
          ': ping\n\n',
          'data: {"type":"ticket_advanced","station_id":"s1"}\n\n',
          'data: {"type":"ticket_created"',
          ',"station_id":"s2"}\n\n', // frame split across chunks
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const events: unknown[] = []
    const states: boolean[] = []
    const client = createSseClient({
      url: 'http://x/kitchen/events?branch_id=b1',
      getToken: () => 'tok-123',
      onEvent: (e) => events.push(e),
      onStateChange: (c) => states.push(c),
      minBackoffMs: 5,
      maxBackoffMs: 10,
    })
    client.start()
    await until(() => events.length >= 2)
    client.stop()

    const init = (fetchMock.mock.calls[0]?.[1] ?? {}) as RequestInit
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-123')
    expect(events[0]).toEqual({ type: 'ticket_advanced', station_id: 's1' })
    expect(events[1]).toEqual({ type: 'ticket_created', station_id: 's2' })
    expect(states[0]).toBe(true)
  })

  it('reconnects with backoff after a failed connection', async () => {
    const fetchMock = vi
      .fn<(...a: unknown[]) => Promise<Response>>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockImplementation(() =>
        Promise.resolve(okResponse(['data: {"type":"ticket_advanced","station_id":"s9"}\n\n'])),
      )
    vi.stubGlobal('fetch', fetchMock)

    const events: unknown[] = []
    const states: boolean[] = []
    const client = createSseClient({
      url: 'http://x/kitchen/events?branch_id=b1',
      getToken: () => null,
      onEvent: (e) => events.push(e),
      onStateChange: (c) => states.push(c),
      minBackoffMs: 5,
      maxBackoffMs: 10,
    })
    client.start()
    await until(() => events.length >= 1)
    client.stop()

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    // first attempt failed (state false), then the retry connected (state true)
    expect(states).toContain(false)
    expect(states).toContain(true)
    expect(events[0]).toEqual({ type: 'ticket_advanced', station_id: 's9' })
  })

  it('stops cleanly and does not reconnect after stop()', async () => {
    const fetchMock = vi.fn<(...a: unknown[]) => Promise<Response>>().mockImplementation(() => Promise.resolve(okResponse([])))
    vi.stubGlobal('fetch', fetchMock)

    const client = createSseClient({
      url: 'http://x/kitchen/events?branch_id=b1',
      getToken: () => null,
      onEvent: () => undefined,
      minBackoffMs: 5,
    })
    client.start()
    await until(() => fetchMock.mock.calls.length >= 1)
    client.stop()
    const calls = fetchMock.mock.calls.length
    await new Promise((r) => setTimeout(r, 40))
    expect(fetchMock.mock.calls.length).toBe(calls)
  })
})
