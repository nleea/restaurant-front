// La pantalla de números. Lo que se prueba aquí es el aviso de las palomitas, y no es decoración:
// un número vinculado antes de esta versión no reporta acuses hasta que alguien lo revincule, y
// el síntoma —"a mis compañeros les salen y a mí no"— es indistinguible de un fallo. Sin el aviso,
// nadie va a adivinar que la cura es un botón que además parece peligroso.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const messagingMock = vi.hoisted(() => ({
  listSessions: vi.fn<(...a: unknown[]) => unknown>(),
  createSession: vi.fn<(...a: unknown[]) => unknown>(),
  startPairing: vi.fn<(...a: unknown[]) => unknown>(),
  getQuickReplies: vi.fn<(...a: unknown[]) => unknown>(),
  listConversations: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/messaging.api', () => messagingMock)

const branchMock = vi.hoisted(() => ({ listBranches: vi.fn<(...a: unknown[]) => unknown>() }))
vi.mock('@/services/branch.api', () => branchMock)

vi.mock('@/components/AppShell.vue', () => ({
  default: { name: 'AppShell', template: '<div><slot /></div>' },
}))

import WhatsAppSessionsView from '../WhatsAppSessionsView.vue'

const BRANCH = { id: 'b1', code: 'centro', name: 'Centro', is_active: true, is_primary: true }

describe('WhatsAppSessionsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    branchMock.listBranches.mockResolvedValue([BRANCH])
    messagingMock.listSessions.mockResolvedValue([
      {
        id: 's1',
        branch_id: 'b1',
        provider_instance_ref: 'inst-centro',
        status: 'connected',
        phone_number: '+573001112233',
        last_seen_at: '2026-08-01T18:00:00Z',
      },
    ])
  })

  async function mountView() {
    const wrapper = mount(WhatsAppSessionsView)
    await flushPromises()
    return wrapper
  }

  it('explica que revincular es lo que enciende las palomitas', async () => {
    const notice = (await mountView()).get('[data-testid="receipts-notice"]').text()
    expect(notice).toContain('vuelvan a vincular')
  })

  it('dice que revincular NO desconecta, que es el miedo que frena', async () => {
    const notice = (await mountView()).get('[data-testid="receipts-notice"]').text()
    expect(notice).toContain('no desconecta')
  })

  it('el botón de un número conectado invita a revincular', async () => {
    expect((await mountView()).text()).toContain('Volver a vincular')
  })
})
