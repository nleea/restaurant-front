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

/**
 * One line of what a station owes a dish.
 *
 * `ingredient_id` is what separates a derived task from a hand-written step: with it, routing
 * resolves the amount against the recipe of the variant that was actually ordered, so the
 * Doble's chit says 300 g and the Sencilla's says 150 g. It survives a rename — a cook calls
 * "Carne" what inventory calls "Carne de res".
 */
export interface StationTask {
  label: string
  ingredient_id: string | null
}

export interface ProductStation {
  id: string
  product_id: string
  kitchen_station_id: string
  // What this station does for the product (e.g. "Parrilla", "Fríos"); null when unset (≤60 chars).
  role: string | null
  // Itemized tasks the station owes this product; ≤10, labels ≤60 chars.
  tasks: StationTask[]
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
  /** Free-text kitchen note from the order item ("sin lechuga"), when present. */
  notes: string | null
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

/** Un producto que ninguna estación prepara: hoy se vende y la cocina nunca lo ve. */
export interface UnroutableProduct {
  product_id: string
  name: string
  category_name: string | null
  /** Cuántas de sus variantes se están vendiendo YA. >0 es lo urgente. */
  active_variants: number
}

export async function listUnroutableProducts(): Promise<UnroutableProduct[]> {
  return (await http.get<UnroutableProduct[]>('/kitchen/products/unroutable')).data
}

export async function listProductStations(productId: string): Promise<ProductStation[]> {
  return (await http.get<ProductStation[]>(`/kitchen/products/${productId}/stations`)).data
}

/** A station the product's recipe implies, with what it would owe and how it drifted. */
export interface SuggestedTask {
  label: string
  ingredient_id: string
  /**
   * Already formatted in the kitchen's unit. More than one when the variants disagree — the
   * recipe is per variant and the station is per product, so 150 g and 300 g are both true.
   * The saved label carries no amount: that gets resolved per variant when routing.
   */
  amounts: string[]
}

export interface SuggestedStation {
  station_id: string
  station_name: string
  /** The insumos this station works, unioned across every variant of the product. */
  tasks: SuggestedTask[]
  from_variants: string[]
  /** Tasks the recipe implies today that the saved mapping lacks. */
  missing_from_saved: string[]
  /** Saved tasks the recipe no longer implies (including ones that were never insumos). */
  saved_no_longer_implied: string[]
}

export interface UnassignedIngredient {
  ingredient_id: string
  name: string
  /** True when it does have a default station, but in another branch. */
  default_station_in_other_branch: boolean
}

export interface StationSuggestion {
  stations: SuggestedStation[]
  unassigned_ingredients: UnassignedIngredient[]
}

/**
 * What the product's recipe proposes for its station assignment.
 *
 * Read-only by contract: asking never writes a `product_stations` row, so a suggestion nobody
 * confirms changes nothing the kitchen will receive. Saving stays the job of attach/detach.
 */
export async function getStationSuggestion(
  productId: string,
  branchId: string,
): Promise<StationSuggestion> {
  return (
    await http.get<StationSuggestion>(`/kitchen/products/${productId}/station-suggestion`, {
      params: { branch_id: branchId },
    })
  ).data
}

export async function attachProductStation(input: {
  product_id: string
  kitchen_station_id: string
  role?: string | null
  tasks?: StationTask[]
}): Promise<ProductStation> {
  return (await http.post<ProductStation>('/kitchen/product-stations', input)).data
}

// Edit a mapping's role/tasks in place — tickets already fired keep their frozen copies.
export async function updateProductStation(
  mappingId: string,
  patch: Partial<{ role: string | null; tasks: StationTask[] }>,
): Promise<ProductStation> {
  return (await http.patch<ProductStation>(`/kitchen/product-stations/${mappingId}`, patch)).data
}

export async function detachProductStation(productId: string, stationId: string): Promise<void> {
  await http.delete(`/kitchen/products/${productId}/stations/${stationId}`)
}

// --- Routing + board -----------------------------------------------------------------------

/** Qué entró a la cocina y qué NO pudo entrar. */
export interface RouteResult {
  tickets: Ticket[]
  /** Nombres de los platos que no llegaron a ninguna estación. Casi siempre vacío. */
  unrouted: string[]
}

export async function routeOrder(orderId: string): Promise<RouteResult> {
  return (await http.post<RouteResult>(`/kitchen/orders/${orderId}/route`)).data
}

export async function listTickets(stationId: string, status?: string): Promise<Ticket[]> {
  const params = status ? { status_filter: status } : undefined
  return (await http.get<Ticket[]>(`/kitchen/stations/${stationId}/tickets`, { params })).data
}

export async function advanceTicket(ticketId: string): Promise<Ticket> {
  return (await http.post<Ticket>(`/kitchen/tickets/${ticketId}/advance`)).data
}
