import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  getSettings: vi.fn<(...a: unknown[]) => unknown>(),
  updateSettings: vi.fn<(...a: unknown[]) => unknown>(),
  listRoutes: vi.fn<(...a: unknown[]) => unknown>(),
  createRoute: vi.fn<(...a: unknown[]) => unknown>(),
  updateRoute: vi.fn<(...a: unknown[]) => unknown>(),
  listDrivers: vi.fn<(...a: unknown[]) => unknown>(),
  assignDriver: vi.fn<(...a: unknown[]) => unknown>(),
  removeDriver: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/delivery.api', async (orig) => {
  const actual = (await orig()) as object
  return { ...actual, ...apiMock }
})

import { useDeliveryStore } from '../delivery'

const route = (id: string, name: string, active = true) => ({
  id,
  branch_id: 'b1',
  name,
  zones: [] as string[],
  color: null,
  position: 0,
  is_active: active,
})

beforeEach(() => {
  setActivePinia(createPinia())
  for (const fn of Object.values(apiMock)) fn.mockReset()
})

describe('delivery store', () => {
  it('loads routes for the branch and exposes the active filter', async () => {
    apiMock.listRoutes.mockResolvedValue([route('r1', 'Norte'), route('r2', 'Vieja', false)])
    const d = useDeliveryStore()
    await d.loadRoutes('b1')
    expect(apiMock.listRoutes).toHaveBeenCalledWith('b1')
    expect(d.activeRoutes.map((r) => r.id)).toEqual(['r1'])
  })

  it('selecting a route loads its drivers', async () => {
    apiMock.listDrivers.mockResolvedValue([{ id: 'd1', employee_id: 'e1' }])
    const d = useDeliveryStore()
    await d.selectRoute('r1')
    expect(d.selectedRouteId).toBe('r1')
    expect(apiMock.listDrivers).toHaveBeenCalledWith('r1')
    expect(d.drivers).toHaveLength(1)
  })

  it('creating a route write-through refetches the branch routes', async () => {
    apiMock.listRoutes.mockResolvedValueOnce([]) // initial load
    const d = useDeliveryStore()
    await d.loadRoutes('b1')
    apiMock.createRoute.mockResolvedValue(route('r9', 'Sur'))
    apiMock.listRoutes.mockResolvedValueOnce([route('r9', 'Sur')])
    await d.createRoute({ branch_id: 'b1', name: 'Sur' })
    expect(apiMock.createRoute).toHaveBeenCalledWith({ branch_id: 'b1', name: 'Sur' })
    expect(d.routes).toHaveLength(1)
  })

  it('deactivating a route patches is_active false then refetches', async () => {
    apiMock.listRoutes.mockResolvedValueOnce([route('r1', 'Norte')])
    const d = useDeliveryStore()
    await d.loadRoutes('b1')
    apiMock.listRoutes.mockResolvedValueOnce([route('r1', 'Norte', false)])
    await d.deactivateRoute('r1')
    expect(apiMock.updateRoute).toHaveBeenCalledWith('r1', { is_active: false })
    expect(d.routes[0]?.is_active).toBe(false)
  })

  it('assigning and removing a driver write-through refetches that route drivers', async () => {
    apiMock.listDrivers
      .mockResolvedValueOnce([{ id: 'd1', employee_id: 'e1' }]) // select
      .mockResolvedValueOnce([{ id: 'd1', employee_id: 'e1' }, { id: 'd2', employee_id: 'e2' }]) // after assign
    const d = useDeliveryStore()
    await d.selectRoute('r1')
    await d.assignDriver('r1', 'e2')
    expect(apiMock.assignDriver).toHaveBeenCalledWith('r1', { employee_id: 'e2' })
    expect(d.drivers).toHaveLength(2)
  })

  it('loads and saves the coverage-map settings write-through', async () => {
    apiMock.getSettings.mockResolvedValue({
      id: 's1',
      branch_id: 'b1',
      latitude: null,
      longitude: null,
      ring_step_km: '1.00',
    })
    apiMock.listRoutes.mockResolvedValue([])
    const d = useDeliveryStore()
    await d.loadRoutes('b1')
    await d.loadSettings('b1')
    expect(d.settings?.latitude).toBeNull()

    apiMock.updateSettings.mockResolvedValue({
      id: 's1',
      branch_id: 'b1',
      latitude: '6.2442000',
      longitude: '-75.5812000',
      ring_step_km: '1.00',
    })
    await d.saveSettings({ latitude: '6.2442000', longitude: '-75.5812000' })
    expect(apiMock.updateSettings).toHaveBeenCalledWith('b1', {
      latitude: '6.2442000',
      longitude: '-75.5812000',
    })
    expect(d.settings?.latitude).toBe('6.2442000')
  })

  it('does not refetch drivers for a route that is not selected', async () => {
    apiMock.listDrivers.mockResolvedValue([])
    const d = useDeliveryStore()
    await d.selectRoute('r1')
    apiMock.listDrivers.mockClear()
    await d.removeDriver('other', 'e1')
    expect(apiMock.removeDriver).toHaveBeenCalledWith('other', 'e1')
    expect(apiMock.listDrivers).not.toHaveBeenCalled()
  })
})
