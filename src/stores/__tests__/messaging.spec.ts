import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  listConversations: vi.fn<(...a: unknown[]) => unknown>(),
  getThread: vi.fn<(...a: unknown[]) => unknown>(),
  claimConversation: vi.fn<(...a: unknown[]) => unknown>(),
  sendReply: vi.fn<(...a: unknown[]) => unknown>(),
  closeConversation: vi.fn<(...a: unknown[]) => unknown>(),
  listSessions: vi.fn<(...a: unknown[]) => unknown>(),
  createSession: vi.fn<(...a: unknown[]) => unknown>(),
  startPairing: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/messaging.api', () => apiMock)

// The live primitive is process plumbing; the store's contract is that it starts and stops.
const liveMock = vi.hoisted(() => ({
  start: vi.fn<() => void>(),
  stop: vi.fn<() => void>(),
}))
vi.mock('@/composables/useLiveRefetch', () => ({
  createLiveRefetch: vi.fn<(...a: unknown[]) => unknown>(() => liveMock),
}))

import { createLiveRefetch } from '@/composables/useLiveRefetch'
import { useMessagingStore } from '../messaging'

const conversation = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'c1',
  branch_id: 'b1',
  contact_id: 'k1',
  contact_name: 'Ana',
  contact_phone: '+573001112233',
  status: 'new',
  employee_id: null,
  holder_name: null,
  started_at: '2026-07-30T10:00:00Z',
  closed_at: null,
  last_message_at: '2026-07-30T10:00:00Z',
  last_message_preview: 'Hola',
  last_message_sender_type: 'contact',
  message_count: 1,
  awaiting_reply: true,
  ...over,
})

const thread = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'c1',
  branch_id: 'b1',
  contact_id: 'k1',
  contact_name: 'Ana',
  contact_phone: '+573001112233',
  status: 'new',
  employee_id: null,
  holder_name: null,
  started_at: '2026-07-30T10:00:00Z',
  closed_at: null,
  messages: [],
  ...over,
})

function conflict(status: number, data: Record<string, unknown> = {}) {
  return { response: { status, data } }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  apiMock.listConversations.mockResolvedValue([conversation()])
  apiMock.getThread.mockResolvedValue(thread())
})

describe('messaging store', () => {
  it('loads the active branch conversations and opens its live stream', async () => {
    const store = useMessagingStore()
    await store.load('b1')
    store.startLive('b1')

    expect(apiMock.listConversations).toHaveBeenCalledWith('b1')
    expect(store.conversations).toHaveLength(1)
    expect(store.awaitingCount).toBe(1)
    expect(vi.mocked(createLiveRefetch).mock.calls[0]![0].url).toContain(
      '/messaging/events?branch_id=b1',
    )
    expect(liveMock.start).toHaveBeenCalled()
  })

  it('drops a thread from the previous branch when the branch changes', async () => {
    const store = useMessagingStore()
    await store.load('b1')
    await store.openThread('c1')
    expect(store.thread).not.toBeNull()

    apiMock.listConversations.mockResolvedValue([])
    await store.load('b2')

    // A conversation belongs to the number it arrived at; it must not leak across branches.
    expect(store.thread).toBeNull()
    expect(store.conversations).toEqual([])
  })

  it('surfaces a lost claim with the holder instead of swallowing it', async () => {
    const store = useMessagingStore()
    await store.load('b1')
    apiMock.claimConversation.mockRejectedValue(
      conflict(409, {
        code: 'conversation_already_claimed',
        holder_name: 'Bruno Díaz',
        holder_employee_id: 'e2',
      }),
    )
    apiMock.listConversations.mockResolvedValue([
      conversation({ employee_id: 'e2', holder_name: 'Bruno Díaz', status: 'human' }),
    ])

    const won = await store.claim('c1')

    expect(won).toBe(false)
    expect(store.claimConflict).toEqual({ conversationId: 'c1', holderName: 'Bruno Díaz' })
    // And the list is refreshed so it stops looking available.
    expect(store.conversations[0]!.holder_name).toBe('Bruno Díaz')
  })

  it('keeps a failed reply visible and says it did not land', async () => {
    const store = useMessagingStore()
    await store.load('b1')
    apiMock.sendReply.mockRejectedValue(conflict(502, { code: 'message_delivery_failed' }))
    apiMock.getThread.mockResolvedValue(
      thread({
        messages: [
          {
            id: 'm1',
            sender_type: 'employee',
            employee_id: 'e1',
            content: 'no salió',
            delivery_state: 'failed',
            sent_at: '2026-07-30T10:05:00Z',
          },
        ],
      }),
    )

    const ok = await store.reply('c1', 'no salió')

    expect(ok).toBe(false)
    expect(store.replyError).toContain('no salió')
    // The message stays in the thread marked failed — the agent must know.
    expect(store.thread!.messages[0]!.delivery_state).toBe('failed')
  })

  it('refuses to send to a contact who never wrote, with its own message', async () => {
    const store = useMessagingStore()
    await store.load('b1')
    apiMock.sendReply.mockRejectedValue(conflict(409, { code: 'contact_not_reachable' }))

    expect(await store.reply('c1', 'hola')).toBe(false)
    expect(store.replyError).toContain('No se puede escribir')
  })

  it('a successful reply refreshes both the thread and the list', async () => {
    const store = useMessagingStore()
    await store.load('b1')
    apiMock.sendReply.mockResolvedValue(
      thread({
        messages: [
          {
            id: 'm1',
            sender_type: 'employee',
            employee_id: 'e1',
            content: 'claro',
            delivery_state: 'sent',
            sent_at: '2026-07-30T10:05:00Z',
          },
        ],
      }),
    )

    expect(await store.reply('c1', 'claro')).toBe(true)
    expect(store.replyError).toBeNull()
    expect(store.thread!.messages[0]!.delivery_state).toBe('sent')
    expect(apiMock.listConversations).toHaveBeenCalledTimes(2)
  })

  it('closing a conversation clears the thread and reloads the open list', async () => {
    const store = useMessagingStore()
    await store.load('b1')
    await store.openThread('c1')
    apiMock.closeConversation.mockResolvedValue(thread({ status: 'closed' }))
    apiMock.listConversations.mockResolvedValue([])

    await store.close('c1')

    expect(store.thread).toBeNull()
    expect(store.conversations).toEqual([])
  })

  it('reports a branch without a paired number as having no session', async () => {
    const store = useMessagingStore()
    apiMock.listSessions.mockResolvedValue([
      {
        id: 's1',
        branch_id: 'b1',
        provider_instance_ref: 'inst-1',
        status: 'connected',
        phone_number: '+573001234567',
        last_seen_at: null,
      },
    ])
    await store.loadSessions()

    expect(store.sessionOf('b1')!.status).toBe('connected')
    expect(store.sessionOf('b2')).toBeNull()
  })

  it('stops the stream so a view unmount leaks nothing', async () => {
    const store = useMessagingStore()
    store.startLive('b1')
    store.stopLive()
    expect(liveMock.stop).toHaveBeenCalled()
  })
})
