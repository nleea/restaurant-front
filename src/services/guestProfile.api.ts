// Guest profile API: a returning anonymous customer's saved name/address/phone, keyed by an
// opaque token in the httponly `guest_token` cookie (never read by JS). These calls MUST send
// credentials so the cookie rides along — set per-request, NOT globally on `http`, so the
// Bearer-based real-user auth is untouched. Public + tenant-scoped by subdomain like /storefront.
import { http } from '@/lib/http'

/** Null-friendly read: every field is null when there is no cookie or no saved row. */
export interface GuestProfile {
  name: string | null
  address: string | null
  phone: string | null
}

/** Contact fields to persist (all optional — progressive fill). */
export interface GuestProfileInput {
  name?: string
  address?: string
  phone?: string
}

// Credentials must be sent on BOTH the cookie-setting write and the cookie-reading get.
const WITH_COOKIE = { withCredentials: true } as const

export async function getGuestProfile(): Promise<GuestProfile> {
  return (await http.get<GuestProfile>('/guest-profile', WITH_COOKIE)).data
}

export async function saveGuestProfile(input: GuestProfileInput): Promise<GuestProfile> {
  return (await http.post<GuestProfile>('/guest-profile', input, WITH_COOKIE)).data
}
