// Typed Delivery API layer over the route slice of `/delivery`. Routes are branch-scoped; route
// drivers are reached through a route. Reads require `delivery.read`; route create/edit/deactivate
// and driver assign/remove require `delivery.manage` (the dispatch lifecycle uses `delivery.assign`,
// a separate follow-up). Route drivers carry only `employee_id` — names are resolved in the store.
import { http } from '@/lib/http'

export interface Route {
  id: string
  branch_id: string
  name: string
  /** Covered zone names (chips on the coverage map), ≤20 × ≤60 chars. */
  zones: string[]
  /** Ring color (hex); null falls back to the frontend palette by position. */
  color: string | null
  /** Ring band order around the business (0 = innermost). */
  position: number
  is_active: boolean
}

/** Derived at read time from dispatch runs — never stored. */
export type DriverStatus = 'on_route' | 'available' | 'inactive'

export interface RouteDriver {
  id: string
  delivery_route_id: string
  employee_id: string
  is_active: boolean
  status: DriverStatus
}

export interface CreateRouteInput {
  branch_id: string
  name: string
  zones?: string[]
  color?: string | null
}

export interface UpdateRouteInput {
  name?: string
  zones?: string[]
  color?: string | null
  is_active?: boolean
}

// Per-branch coverage-map config; null coordinates = the pin hasn't been placed yet.
export interface DeliverySettings {
  id: string
  branch_id: string
  latitude: string | null
  longitude: string | null
  ring_step_km: string
}

// --- Branch delivery settings ----------------------------------------------------------------
export async function getSettings(branchId: string): Promise<DeliverySettings> {
  return (await http.get<DeliverySettings>(`/delivery/branches/${branchId}/settings`)).data
}

export async function updateSettings(
  branchId: string,
  patch: Partial<{ latitude: string; longitude: string; ring_step_km: string }>,
): Promise<DeliverySettings> {
  return (await http.patch<DeliverySettings>(`/delivery/branches/${branchId}/settings`, patch))
    .data
}

// --- Routes (branch-scoped) ----------------------------------------------------------------
export async function listRoutes(branchId: string): Promise<Route[]> {
  return (await http.get<Route[]>('/delivery/routes', { params: { branch_id: branchId } })).data
}

export async function createRoute(input: CreateRouteInput): Promise<Route> {
  return (await http.post<Route>('/delivery/routes', input)).data
}

export async function updateRoute(routeId: string, patch: UpdateRouteInput): Promise<Route> {
  return (await http.patch<Route>(`/delivery/routes/${routeId}`, patch)).data
}

// --- Route drivers -------------------------------------------------------------------------
export async function listDrivers(routeId: string): Promise<RouteDriver[]> {
  return (await http.get<RouteDriver[]>(`/delivery/routes/${routeId}/drivers`)).data
}

export async function assignDriver(
  routeId: string,
  input: { employee_id: string },
): Promise<RouteDriver> {
  return (await http.post<RouteDriver>(`/delivery/routes/${routeId}/drivers`, input)).data
}

export async function removeDriver(routeId: string, employeeId: string): Promise<void> {
  await http.delete(`/delivery/routes/${routeId}/drivers/${employeeId}`)
}

// ============================================================================
// Dispatch: per-order delivery records → dispatch runs → the assign/depart/
// deliver/finish lifecycle. Deliveries/runs lists are tenant-wide (status only).
// Lifecycle transitions require `delivery.assign`; create delivery/run `delivery.manage`.
// ============================================================================

export const DELIVERY_STATUSES = [
  'pending',
  'assigned',
  'in_transit',
  'delivered',
  'not_delivered',
] as const
export const RUN_STATUSES = ['preparing', 'in_transit', 'finished'] as const

export interface Delivery {
  id: string
  order_id: string
  delivery_route_id: string | null
  delivery_run_id: string | null
  address_text: string
  neighborhood: string | null
  latitude: string | null
  longitude: string | null
  delivery_status: string
  route_position: number | null
  notes: string | null
  delivered_at: string | null
  created_at: string | null
}

export interface Run {
  id: string
  delivery_route_id: string
  employee_id: string
  status: string
  departed_at: string | null
  finished_at: string | null
  created_at: string | null
}

export interface CreateDeliveryInput {
  order_id: string
  address_text: string
  neighborhood?: string | null
  latitude?: string | null
  longitude?: string | null
}

export interface CreateRunInput {
  delivery_route_id: string
  employee_id: string
}

// --- Deliveries ----------------------------------------------------------------------------
export async function createDelivery(input: CreateDeliveryInput): Promise<Delivery> {
  return (await http.post<Delivery>('/delivery/deliveries', input)).data
}

export async function listDeliveries(status?: string): Promise<Delivery[]> {
  const params = status ? { status_filter: status } : undefined
  return (await http.get<Delivery[]>('/delivery/deliveries', { params })).data
}

export async function getOrderDelivery(orderId: string): Promise<Delivery> {
  return (await http.get<Delivery>(`/delivery/orders/${orderId}/delivery`)).data
}

export async function updateDelivery(
  deliveryId: string,
  patch: {
    address_text?: string
    neighborhood?: string | null
    notes?: string | null
    latitude?: string | null
    longitude?: string | null
  },
): Promise<Delivery> {
  return (await http.patch<Delivery>(`/delivery/deliveries/${deliveryId}`, patch)).data
}

// --- Runs ----------------------------------------------------------------------------------
export async function createRun(input: CreateRunInput): Promise<Run> {
  return (await http.post<Run>('/delivery/runs', input)).data
}

export async function listRuns(status?: string): Promise<Run[]> {
  const params = status ? { status_filter: status } : undefined
  return (await http.get<Run[]>('/delivery/runs', { params })).data
}

export async function getRun(runId: string): Promise<Run> {
  return (await http.get<Run>(`/delivery/runs/${runId}`)).data
}

// --- Lifecycle (delivery.assign) -----------------------------------------------------------
export async function assignDelivery(
  deliveryId: string,
  input: { delivery_run_id: string },
): Promise<Delivery> {
  return (await http.post<Delivery>(`/delivery/deliveries/${deliveryId}/assign`, input)).data
}

export async function departRun(runId: string): Promise<Run> {
  return (await http.post<Run>(`/delivery/runs/${runId}/depart`)).data
}

export async function markDelivered(deliveryId: string, delivered: boolean): Promise<Delivery> {
  return (
    await http.post<Delivery>(`/delivery/deliveries/${deliveryId}/mark-delivered`, { delivered })
  ).data
}

export async function finishRun(runId: string): Promise<Run> {
  return (await http.post<Run>(`/delivery/runs/${runId}/finish`)).data
}
