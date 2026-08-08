import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  getGuestProfile: vi.fn<(...a: unknown[]) => unknown>(),
  saveGuestProfile: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/guestProfile.api', async (orig) => {
  const actual = (await orig()) as object
  return { ...actual, ...apiMock }
})

import { useGuestProfileStore } from '../guestProfile'
import { useCartStore } from '../cart'
import { useAuthStore } from '../auth'

describe('guestProfile store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiMock.getGuestProfile.mockReset()
    apiMock.saveGuestProfile.mockReset()
  })

  it('prefills the cart contact for a returning guest', async () => {
    apiMock.getGuestProfile.mockResolvedValue({
      name: 'Ana',
      phone: '3001234567',
      address: 'Calle 1 #2-3, Centro',
    })
    await useGuestProfileStore().load()

    const cart = useCartStore()
    expect(cart.customerName).toBe('Ana')
    expect(cart.customerPhone).toBe('3001234567')
    expect(cart.address.reference).toBe('Calle 1 #2-3, Centro')
  })

  it('leaves the form empty and does not throw for a first-time guest', async () => {
    apiMock.getGuestProfile.mockResolvedValue({ name: null, phone: null, address: null })
    await expect(useGuestProfileStore().load()).resolves.toBeUndefined()

    const cart = useCartStore()
    expect(cart.customerName).toBe('')
    expect(cart.customerPhone).toBe('')
    expect(cart.address.reference).toBe('')
  })

  it('swallows a failed fetch without blocking checkout', async () => {
    apiMock.getGuestProfile.mockRejectedValue(new Error('network'))
    await expect(useGuestProfileStore().load()).resolves.toBeUndefined()
    expect(useCartStore().customerName).toBe('')
  })

  // A staff token in localStorage used to switch the whole feature off. It never meant "this
  // customer has an account" — customers have no login — only "someone signed into the panel on
  // this browser", which is the owner's own machine and the shop's tablet.
  it('still reads the guest profile with a staff session in the browser', async () => {
    useAuthStore().accessToken = 'a-real-token'
    apiMock.getGuestProfile.mockResolvedValue({ name: 'Ana', phone: '300', address: null })

    await useGuestProfileStore().load()

    expect(apiMock.getGuestProfile).toHaveBeenCalled()
    expect(useCartStore().customerName).toBe('Ana')
  })

  it('persists the entered contact and composed address', async () => {
    apiMock.saveGuestProfile.mockResolvedValue({ name: 'Ana', phone: '300', address: 'Cra 5' })
    const cart = useCartStore()
    cart.setContact({ name: 'Ana', phone: '3001234567' })

    await useGuestProfileStore().persist('Calle 1 #2-3, Centro')

    expect(apiMock.saveGuestProfile).toHaveBeenCalledWith({
      name: 'Ana',
      phone: '3001234567',
      address: 'Calle 1 #2-3, Centro',
    })
  })

  it('still persists with a staff session in the browser', async () => {
    useAuthStore().accessToken = 'a-real-token'
    apiMock.saveGuestProfile.mockResolvedValue({ name: null, phone: null, address: null })
    useCartStore().setContact({ name: 'Ana', phone: '3001234567' })

    await useGuestProfileStore().persist('Calle 1')

    expect(apiMock.saveGuestProfile).toHaveBeenCalledWith({
      name: 'Ana',
      phone: '3001234567',
      address: 'Calle 1',
    })
  })
})
