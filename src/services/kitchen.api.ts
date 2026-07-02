// Typed Kitchen (KDS) API layer over the foundation's Axios instance. Reads require
// `kitchen.read`; station setup, product↔station mapping, order routing and ticket advance require
// `kitchen.update`. Tickets only carry `order_item_id`; labels are resolved client-side (store).
import { http } from '@/lib/http'

export const TICKET_STATUSES = ['pending', 'in_progress', 'ready'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export interface KitchenStation {
  id: string
  branch_id: string
  name: string
  position: number
  is_active: boolean
}

export interface ProductStation {
  id: string
  product_id: string
  kitchen_station_id: string
  // What this station does for the product (e.g. "Parrilla", "Fríos"); null when unset (≤60 chars).
  role: string | null
  // Itemized task names the station owes this product ("Carne", "Tocineta ahumada"); ≤10, ≤60 chars.
  tasks: string[]
}

export interface Ticket {
  id: string
  branch_id: string
  order_item_id: string
  kitchen_station_id: string
  status: string
  entered_at: string | null
  ready_at: string | null
  // Denormalized from the mapping's `role`/`tasks` at routing time; frozen for the ticket's life.
  role: string | null
  tasks: string[]
}

// --- Stations ------------------------------------------------------------------------------
export async function listStations(branchId: string): Promise<KitchenStation[]> {
  return (
    await http.get<KitchenStation[]>('/kitchen/stations', { params: { branch_id: branchId } })
  ).data
}

export async function createStation(input: {
  branch_id: string
  name: string
  position: number
}): Promise<KitchenStation> {
  return (await http.post<KitchenStation>('/kitchen/stations', input)).data
}

export async function updateStation(
  stationId: string,
  patch: Partial<{ name: string; position: number; is_active: boolean }>,
): Promise<KitchenStation> {
  return (await http.patch<KitchenStation>(`/kitchen/stations/${stationId}`, patch)).data
}

// --- Product ↔ station ---------------------------------------------------------------------
export async function listProductStations(productId: string): Promise<ProductStation[]> {
  return (await http.get<ProductStation[]>(`/kitchen/products/${productId}/stations`)).data
}

export async function attachProductStation(input: {
  product_id: string
  kitchen_station_id: string
  role?: string | null
  tasks?: string[]
}): Promise<ProductStation> {
  return (await http.post<ProductStation>('/kitchen/product-stations', input)).data
}

// Edit a mapping's role/tasks in place — tickets already fired keep their frozen copies.
export async function updateProductStation(
  mappingId: string,
  patch: Partial<{ role: string | null; tasks: string[] }>,
): Promise<ProductStation> {
  return (await http.patch<ProductStation>(`/kitchen/product-stations/${mappingId}`, patch)).data
}

export async function detachProductStation(productId: string, stationId: string): Promise<void> {
  await http.delete(`/kitchen/products/${productId}/stations/${stationId}`)
}

// --- Routing + board -----------------------------------------------------------------------
export async function routeOrder(orderId: string): Promise<Ticket[]> {
  return (await http.post<Ticket[]>(`/kitchen/orders/${orderId}/route`)).data
}

export async function listTickets(stationId: string, status?: string): Promise<Ticket[]> {
  const params = status ? { status_filter: status } : undefined
  return (await http.get<Ticket[]>(`/kitchen/stations/${stationId}/tickets`, { params })).data
}

export async function advanceTicket(ticketId: string): Promise<Ticket> {
  return (await http.post<Ticket>(`/kitchen/tickets/${ticketId}/advance`)).data
}
