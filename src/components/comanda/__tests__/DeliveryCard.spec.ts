// The Domicilio card: capture the address on the comanda when the order arrived without one,
// correct it while the order is open. Guards the states that matter — a 404 is "sin dirección"
// (the normal start), not a failure, and the write is permission-gated.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import DeliveryCard from '../DeliveryCard.vue'
import { useAuthStore } from '@/stores/auth'

const apiMock = vi.hoisted(() => ({
  getOrderDelivery: vi.fn<(...a: unknown[]) => unknown>(),
  createDelivery: vi.fn<(...a: unknown[]) => unknown>(),
  updateDelivery: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/delivery.api', () => apiMock)

const DELIVERY = {
  id: 'd1',
  order_id: 'o1',
  delivery_route_id: null,
  delivery_run_id: null,
  address_text: 'Calle 15 #10-20',
  neighborhood: 'San Martín',
  latitude: '11.54',
  longitude: '-72.91',
  delivery_status: 'pending',
  route_position: null,
  notes: null,
  delivered_at: null,
  created_at: null,
}

function notFound() {
  return Object.assign(new Error('not found'), { response: { status: 404 } })
}

function mountCard(permissions: string[]) {
  setActivePinia(createPinia())
  useAuthStore().permissions = permissions
  return mount(DeliveryCard, {
    props: { orderId: 'o1' },
    global: { stubs: { teleport: true } },
  })
}

beforeEach(() => {
  apiMock.getOrderDelivery.mockReset()
  apiMock.createDelivery.mockReset()
  apiMock.updateDelivery.mockReset()
})

describe('DeliveryCard', () => {
  it('treats a missing delivery record as an invitation, not an error', async () => {
    apiMock.getOrderDelivery.mockRejectedValue(notFound())
    const w = mountCard(['delivery.address'])
    await flushPromises()

    expect(w.text()).toContain('Agregar dirección')
    expect(w.text()).not.toContain('No se pudo')
  })

  it('shows an existing address as the edit affordance', async () => {
    apiMock.getOrderDelivery.mockResolvedValue(DELIVERY)
    const w = mountCard(['delivery.address'])
    await flushPromises()

    const btn = w.find('button[aria-label*="Corregir la dirección"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('Calle 15 #10-20')
  })

  it('creates the delivery record when capturing the first address', async () => {
    apiMock.getOrderDelivery.mockRejectedValue(notFound())
    apiMock.createDelivery.mockResolvedValue(DELIVERY)
    const w = mountCard(['delivery.address'])
    await flushPromises()

    await w.find('button').trigger('click') // "Agregar dirección"
    await w.find('textarea').setValue('  Calle 15 #10-20  ')
    await w.findAll('button').find((b) => b.text().includes('Guardar'))!.trigger('click')
    await flushPromises()

    // Trimmed, and no pin sent — the backend geocodes it.
    expect(apiMock.createDelivery).toHaveBeenCalledWith({
      order_id: 'o1',
      address_text: 'Calle 15 #10-20',
    })
    expect(apiMock.updateDelivery).not.toHaveBeenCalled()
    expect(w.text()).toContain('Calle 15 #10-20')
  })

  it('updates the record when correcting an existing address', async () => {
    apiMock.getOrderDelivery.mockResolvedValue(DELIVERY)
    apiMock.updateDelivery.mockResolvedValue({ ...DELIVERY, address_text: 'Calle 15 #10-22' })
    const w = mountCard(['delivery.address'])
    await flushPromises()

    await w.find('button[aria-label*="Corregir la dirección"]').trigger('click')
    await w.find('textarea').setValue('Calle 15 #10-22')
    await w.findAll('button').find((b) => b.text().includes('Guardar'))!.trigger('click')
    await flushPromises()

    expect(apiMock.updateDelivery).toHaveBeenCalledWith('d1', { address_text: 'Calle 15 #10-22' })
    expect(apiMock.createDelivery).not.toHaveBeenCalled()
  })

  it('will not save an empty address — a delivery without one is the bug being fixed', async () => {
    apiMock.getOrderDelivery.mockRejectedValue(notFound())
    const w = mountCard(['delivery.address'])
    await flushPromises()

    await w.find('button').trigger('click')
    await w.find('textarea').setValue('   ')
    const save = w.findAll('button').find((b) => b.text().includes('Guardar'))!
    expect((save.element as HTMLButtonElement).disabled).toBe(true)
    await save.trigger('click')
    expect(apiMock.createDelivery).not.toHaveBeenCalled()
  })

  it('is read-only for a dispatcher-less reader', async () => {
    apiMock.getOrderDelivery.mockResolvedValue(DELIVERY)
    const w = mountCard(['delivery.read'])
    await flushPromises()

    expect(w.text()).toContain('Calle 15 #10-20')
    expect(w.find('button[aria-label*="Corregir la dirección"]').exists()).toBe(false)
    expect(w.text()).not.toContain('Agregar dirección')
  })

  it('is hidden from a user with no delivery permission at all', async () => {
    const w = mountCard(['orders.update'])
    await flushPromises()

    expect(w.text()).toBe('')
    expect(apiMock.getOrderDelivery).not.toHaveBeenCalled()
  })

  it('surfaces a save failure instead of pretending it saved', async () => {
    apiMock.getOrderDelivery.mockRejectedValue(notFound())
    apiMock.createDelivery.mockRejectedValue(new Error('boom'))
    const w = mountCard(['delivery.address'])
    await flushPromises()

    await w.find('button').trigger('click')
    await w.find('textarea').setValue('Calle 15')
    await w.findAll('button').find((b) => b.text().includes('Guardar'))!.trigger('click')
    await flushPromises()

    expect(w.find('[role="alert"]').text()).toContain('No se pudo guardar la dirección')
  })

  it('reloads instead of insisting when the board created the record first', async () => {
    apiMock.getOrderDelivery.mockRejectedValueOnce(notFound()).mockResolvedValueOnce(DELIVERY)
    apiMock.createDelivery.mockRejectedValue(
      Object.assign(new Error('conflict'), { response: { status: 409 } }),
    )
    const w = mountCard(['delivery.address'])
    await flushPromises()

    await w.find('button').trigger('click')
    await w.find('textarea').setValue('Calle 15')
    await w.findAll('button').find((b) => b.text().includes('Guardar'))!.trigger('click')
    await flushPromises()

    // The address that actually exists wins, and no error is shown.
    expect(w.text()).toContain('Calle 15 #10-20')
    expect(w.find('[role="alert"]').exists()).toBe(false)
  })
})
