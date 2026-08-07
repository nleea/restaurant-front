// El store de alertas: lo que alimenta al panel Y al indicador del riel.
//
// Lo que se prueba de verdad es el contador de "sin atender": es lo único que ve alguien que
// está en otra pantalla, y si se equivoca, el módulo entero deja de avisar.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  listAlerts: vi.fn<(...a: unknown[]) => unknown>(),
  acknowledgeAlert: vi.fn<(...a: unknown[]) => unknown>(),
  listRules: vi.fn<(...a: unknown[]) => unknown>(),
  saveRule: vi.fn<(...a: unknown[]) => unknown>(),
  getEscalationReach: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/alerts.api', () => apiMock)

// El primitivo en vivo es fontanería; el contrato del store es que arranca y para.
const liveMock = vi.hoisted(() => ({ start: vi.fn<() => void>(), stop: vi.fn<() => void>() }))
vi.mock('@/composables/useLiveRefetch', () => ({
  createLiveRefetch: vi.fn<(...a: unknown[]) => unknown>(() => liveMock),
}))

import { createLiveRefetch } from '@/composables/useLiveRefetch'
import { useAlertsStore } from '../alerts'

const alert = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  rule_key: 'low_stock',
  subject_ref: 'ing-tomate',
  subject_label: 'Tomate',
  status: 'fired',
  fired_at: '2026-07-30T18:00:00Z',
  acknowledged_at: null,
  acknowledged_by: null,
  holder_name: null,
  last_escalated_at: null, reminders_muted_at: null,
  ...over,
})

const rule = (over: Record<string, unknown> = {}) => ({
  rule_key: 'low_stock',
  is_enabled: false,
  threshold: null,
  recovery_buffer: 1,
  escalation_after_minutes: 30,
  escalate_to_whatsapp: false,
  ...over,
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  apiMock.listAlerts.mockResolvedValue([])
  apiMock.listRules.mockResolvedValue([rule()])
  apiMock.getEscalationReach.mockResolvedValue({
    has_session: true,
    subscribed: 1,
    with_chat: 1,
    reachable: 1,
  })
})

describe('el contador del indicador', () => {
  it('cuenta sólo lo que nadie ha tomado', async () => {
    apiMock.listAlerts.mockResolvedValue([
      alert({ id: 'a1' }),
      alert({ id: 'a2', status: 'acknowledged', holder_name: 'Ana' }),
    ])
    const store = useAlertsStore()

    await store.load('b1')

    // Tomada = ya hay alguien encima. Seguir contándola sería pedir trabajo duplicado.
    expect(store.unacknowledgedCount).toBe(1)
  })

  it('baja al tomar una alerta', async () => {
    apiMock.listAlerts.mockResolvedValue([alert()])
    apiMock.acknowledgeAlert.mockResolvedValue(
      alert({ status: 'acknowledged', holder_name: 'Ana' }),
    )
    const store = useAlertsStore()
    await store.load('b1')
    expect(store.unacknowledgedCount).toBe(1)

    await store.acknowledge('a1')

    expect(store.unacknowledgedCount).toBe(0)
  })

  it('es cero con todo en orden', async () => {
    const store = useAlertsStore()
    await store.load('b1')
    expect(store.unacknowledgedCount).toBe(0)
    expect(store.allClear).toBe(true)
  })

  it('"todo en orden" no se confunde con "aún no ha cargado"', () => {
    const store = useAlertsStore()
    store.loading = true
    // Sin esto, la pantalla anunciaría "todo en orden" durante la carga y después
    // aparecerían tres alertas. Peor que un spinner.
    expect(store.allClear).toBe(false)
  })

  it('una carga fallida NO es "todo en orden"', async () => {
    apiMock.listAlerts.mockRejectedValue(new Error('caído'))
    const store = useAlertsStore()

    await store.load('b1')

    // Lista vacía porque el servidor no contestó. Anunciar calma aquí manda a alguien a
    // casa tranquilo con el tomate acabándose.
    expect(store.alerts).toEqual([])
    expect(store.allClear).toBe(false)
  })
})

describe('tomar una alerta', () => {
  it('explica quién la tiene cuando se pierde la carrera', async () => {
    apiMock.listAlerts.mockResolvedValue([alert()])
    apiMock.acknowledgeAlert.mockRejectedValue({
      response: { status: 409, data: { detail: 'Esta alerta ya la tomó Bruno Díaz.' } },
    })
    const store = useAlertsStore()
    await store.load('b1')

    const won = await store.acknowledge('a1')

    expect(won).toBe(false)
    expect(store.claimConflict?.message).toContain('Bruno Díaz')
    // Y se refresca, para que la lista deje de mostrarla como libre.
    expect(apiMock.listAlerts).toHaveBeenCalledTimes(2)
  })

  it('un fallo cualquiera no se disfraza de conflicto', async () => {
    apiMock.listAlerts.mockResolvedValue([alert()])
    apiMock.acknowledgeAlert.mockRejectedValue({ response: { status: 500 } })
    const store = useAlertsStore()
    await store.load('b1')

    expect(await store.acknowledge('a1')).toBe(false)
    expect(store.claimConflict).toBeNull()
    expect(store.error).toBeTruthy()
  })

  it('limpia el conflicto anterior al volver a intentarlo', async () => {
    apiMock.listAlerts.mockResolvedValue([alert()])
    apiMock.acknowledgeAlert.mockResolvedValue(alert({ status: 'acknowledged' }))
    const store = useAlertsStore()
    store.claimConflict = { alertId: 'a1', message: 'viejo' }
    await store.load('b1')

    await store.acknowledge('a1')

    expect(store.claimConflict).toBeNull()
  })
})

describe('el alcance por sucursal', () => {
  it('pide las alertas de la sucursal activa', async () => {
    const store = useAlertsStore()
    await store.load('b1')
    expect(apiMock.listAlerts).toHaveBeenCalledWith('b1')
  })

  it('el timbre se suscribe a la sucursal, no a todo', () => {
    const store = useAlertsStore()
    store.startLive('b1')
    const options = vi.mocked(createLiveRefetch).mock.calls[0]?.[0] as { url: string }
    expect(options.url).toContain('branch_id=b1')
    expect(liveMock.start).toHaveBeenCalled()
  })

  it('arrancar el timbre dos veces no deja el primero colgado', () => {
    const store = useAlertsStore()
    store.startLive('b1')
    store.startLive('b2')
    // Cambiar de sucursal no puede dejar escuchando la anterior: el contador mezclaría dos
    // cocinas y nadie sabría de cuál es la alerta.
    expect(liveMock.stop).toHaveBeenCalled()
  })
})

describe('las reglas', () => {
  it('repite el mensaje del backend cuando rechaza el colchón cero', async () => {
    apiMock.saveRule.mockRejectedValue({
      response: { status: 422, data: { detail: 'El colchón no puede ser cero…' } },
    })
    const store = useAlertsStore()
    await store.loadRules('b1')

    const ok = await store.saveRule(rule({ recovery_buffer: 0 }) as never)

    expect(ok).toBe(false)
    // Explica POR QUÉ, que es más útil que "no se pudo guardar".
    expect(store.error).toContain('colchón')
  })

  it('un diagnóstico caído no rompe la pantalla de reglas', async () => {
    // Es información de apoyo: sin ella se siguen pudiendo configurar las reglas.
    apiMock.getEscalationReach.mockRejectedValue(new Error('caído'))
    const store = useAlertsStore()

    await store.loadRules('b1')

    expect(store.rules).toHaveLength(1)
    expect(store.reach).toBeNull()
  })

  it('reemplaza la regla guardada en la lista', async () => {
    apiMock.saveRule.mockResolvedValue(rule({ is_enabled: true, recovery_buffer: 5 }))
    const store = useAlertsStore()
    await store.loadRules('b1')

    await store.saveRule(rule({ is_enabled: true, recovery_buffer: 5 }) as never)

    expect(store.rules[0]?.is_enabled).toBe(true)
    expect(store.rules[0]?.recovery_buffer).toBe(5)
  })
})
