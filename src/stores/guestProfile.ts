import { defineStore } from 'pinia'
import * as api from '@/services/guestProfile.api'
import { useAuthStore } from './auth'
import { useCartStore } from './cart'

// Bridges the cookie-backed guest profile to the checkout cart: prefill contact on mount,
// persist it on order. A real authenticated user's account data takes precedence, so when the
// auth store reports a logged-in user we neither read nor write the guest profile.
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
      if (useAuthStore().isAuthenticated) return // account data wins
      let profile: api.GuestProfile
      try {
        profile = await api.getGuestProfile()
      } catch {
        return // never block checkout on a profile fetch
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
      if (useAuthStore().isAuthenticated) return
      const cart = useCartStore()
      try {
        await api.saveGuestProfile({
          name: cart.customerName.trim(),
          phone: cart.customerPhone.trim(),
          address: address.trim(),
        })
      } catch {
        // Non-blocking: an order must never fail because profile persistence did.
      }
    },
  },
})
