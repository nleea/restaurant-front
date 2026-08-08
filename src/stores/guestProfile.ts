import { defineStore } from 'pinia'
import * as api from '@/services/guestProfile.api'
import { useCartStore } from './cart'

// Bridges the cookie-backed guest profile to the checkout cart: prefill contact on mount,
// persist it on order.
//
// A logged-in session is NOT a reason to skip this, though it reads like one. The storefront
// shares an origin with the staff panel, and `isAuthenticated` is only "there is a token in
// this browser's localStorage" — a STAFF token. Customers have no login here (nothing calls
// /guest-profile/claim), so gating on it protected a case that cannot happen while killing the
// feature for every device that ever signed into the panel: the owner testing the storefront,
// and the shop's own tablet taking orders over the phone.
//
// Address note: the guest profile stores a single free-text address string, but the cart's
// delivery address is structured (street/number/neighborhood/city/reference). We can't losslessly
// rebuild the structured form from one string, so the saved address is surfaced in the free-text
// `reference` field (a returning delivery customer sees their prior address to reuse). Name and
// phone — the required contact fields — map 1:1 and are the primary win.
export const useGuestProfileStore = defineStore('guestProfile', {
  state: () => ({ loaded: false }),

  actions: {
    async load(): Promise<void> {
      let profile: api.GuestProfile
      try {
        profile = await api.getGuestProfile()
      } catch (err) {
        // Never block checkout on a profile fetch — but say so, or a broken profile looks
        // exactly like a first-time visitor and there is nothing to debug from.
        console.warn('No se pudo leer el perfil de invitado:', err)
        return
      }
      const cart = useCartStore()
      if (profile.name) cart.setContact({ name: profile.name })
      if (profile.phone) cart.setContact({ phone: profile.phone })
      if (profile.address && cart.address.reference.trim() === '') {
        cart.setAddress({ reference: profile.address })
      }
      this.loaded = true
    },

    async persist(address: string): Promise<void> {
      const cart = useCartStore()
      try {
        await api.saveGuestProfile({
          name: cart.customerName.trim(),
          phone: cart.customerPhone.trim(),
          address: address.trim(),
        })
      } catch (err) {
        // Non-blocking: an order must never fail because profile persistence did.
        console.warn('No se pudo guardar el perfil de invitado:', err)
      }
    },
  },
})
