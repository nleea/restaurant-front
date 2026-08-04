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

// --- Kilometer tariff bands (branch-scoped) --------------------------------------------------
// La escalera de precios del domicilio. Cada banda dice "hasta X km cuesta Y", y la ÚLTIMA
// define además el máximo de cobertura de la sede: más allá no se cotiza y no se cobra.
export interface TariffBand {
  id: string
  max_distance_km: string
  fee: string
  position: number
}

export interface TariffBandInput {
  max_distance_km: number
  fee: number
}

export async function listTariffBands(branchId: string): Promise<TariffBand[]> {
  return (await http.get<TariffBand[]>(`/delivery/branches/${branchId}/tariff-bands`)).data
}

/** Reemplaza el plan entero. No hay edición parcial: el plan es una escalera, no una lista. */
export async function replaceTariffBands(
  branchId: string,
  bands: TariffBandInput[],
): Promise<TariffBand[]> {
  return (
    await http.put<TariffBand[]>(`/delivery/branches/${branchId}/tariff-bands`, { bands })
  ).data
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
  // Su comanda se canceló y nunca salió del local. NO es 'not_delivered': ahí nadie salió a
  // entregar nada, y contarlo como fallo inventaría un fracaso que no ocurrió.
  'cancelled',
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
  /**
   * Readiness of the delivery's ORDER in the kitchen (`none` | `in_kitchen` | `ready`).
   * Derived server-side, never stored on the delivery. A delivery can only be assigned once
   * this is `ready` — you cannot hand a courier food that is not cooked.
   */
  kitchen_state: string | null
  /** `pending_quote` | `quoted` | `outside_coverage` | `unquotable`. */
  quote_status: string
  quote_distance_km: string | null
  quoted_fee: string | null
  quote_failure_reason: string | null
  /** Si el cliente recibió su enlace de pago: `sent` | `failed` | `no_contact` | `pending`. */
  emission_status: string | null
  emission_failure_reason: string | null
}

/** Reemite el enlace de pago de una entrega ya cotizada. Acuña uno NUEVO: el viejo no existe. */
export async function reissuePaymentRequest(deliveryId: string): Promise<{
  order_id: string
  quoted_fee: string
  expires_at: string
  emission_status: string
  emission_failure_reason: string | null
}> {
  return (await http.post(`/delivery/deliveries/${deliveryId}/payment-request`)).data
}

/** True when the delivery can be handed to a run: its order came out of the kitchen. */
export function isAssignable(delivery: Delivery): boolean {
  return delivery.kitchen_state === 'ready'
}

/** Why a delivery cannot be assigned yet, or null when it can. */
export function blockedReason(delivery: Delivery): string | null {
  if (delivery.kitchen_state === 'ready') return null
  if (delivery.kitchen_state === 'in_kitchen') return 'La cocina todavía lo está preparando'
  return 'Todavía no ha entrado a cocina'
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

// Branch-scoped, like the routes beside them: deliveries belong to a branch, and a
// tenant-wide list would mix two branches' work into one board.
export async function listDeliveries(
  branchId: string,
  status?: string,
  openSessionOnly = false,
): Promise<Delivery[]> {
  // `openSessionOnly` is the live dispatch scope: only the branch's OPEN cash session's
  // deliveries (old/closed-shift ones drop off). Left off for other callers (e.g. history).
  const params = {
    branch_id: branchId,
    ...(status ? { status_filter: status } : {}),
    ...(openSessionOnly ? { open_session_only: true } : {}),
  }
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

export async function listRuns(branchId: string, status?: string): Promise<Run[]> {
  const params = { branch_id: branchId, ...(status ? { status_filter: status } : {}) }
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

// ============================================================================
// Driver self-service ("domiciliario"): the least-privilege slice under
// `/delivery/me`, authorized by run ownership under `delivery.drive` (never the
// dispatcher's `delivery.assign`/`delivery.manage`). Every action is session-
// scoped server-side — the frontend never sends an employee_id. The read model
// enriches each stop with its order (customer, phone, items, total, payment) so
// the driver app needs no branch-wide `orders.read`.
// ============================================================================

export interface DriverStopItem {
  name: string
  quantity: number
}

// A stop as the driver sees it: the delivery joined with its order at the doorstep.
// Decimal fields (latitude/longitude/total) are strings or null, like everywhere else.
export interface DriverStop {
  id: string
  order_id: string
  address_text: string
  neighborhood: string | null
  latitude: string | null
  longitude: string | null
  /** Deriva de `DELIVERY_STATUSES`: una unión escrita a mano se queda atrás en silencio. */
  delivery_status: (typeof DELIVERY_STATUSES)[number]
  route_position: number | null
  notes: string | null
  not_delivered_reason: string | null
  delivered_at: string | null
  order_code: string | null
  customer_name: string | null
  customer_phone: string | null
  total: string | null
  payment_method: string | null
  paid: boolean | null
  items: DriverStopItem[]
}

// The driver's own active run, with its stops. `finish` returns the bare Run (no stops).
export interface MyRun {
  id: string
  delivery_route_id: string
  employee_id: string
  status: 'preparing' | 'in_transit' | 'finished'
  departed_at: string | null
  finished_at: string | null
  created_at: string | null
  stops: DriverStop[]
}

// Self-open (create + pull) — idempotent: returns the already-active run if one exists.
// `deliveryRouteId` is only needed to disambiguate a driver of several routes; 400/422 when
// the driver drives no route (the store surfaces that message).
export async function openMyRun(deliveryRouteId?: string): Promise<MyRun> {
  const body = deliveryRouteId ? { delivery_route_id: deliveryRouteId } : {}
  return (await http.post<MyRun>('/delivery/me/run', body)).data
}

// The caller's active run, or null when they have none.
export async function getMyRun(): Promise<MyRun | null> {
  return (await http.get<MyRun | null>('/delivery/me/run')).data
}

// The routes I actively drive — the choices when opening a despacho (empty = no route assigned).
export async function listMyRoutes(): Promise<Route[]> {
  return (await http.get<Route[]>('/delivery/me/routes')).data
}

// Run-level departure: preparing → in_transit, flipping ALL its stops to in_transit at once.
export async function departMyRun(runId: string): Promise<MyRun> {
  return (await http.post<MyRun>(`/delivery/me/runs/${runId}/depart`)).data
}

// in_transit → finished; returns the bare Run (no stops) — the driver is free again.
export async function finishMyRun(runId: string): Promise<Run> {
  return (await http.post<Run>(`/delivery/me/runs/${runId}/finish`)).data
}

// Doorstep verdict. delivered=false carries the fixed reason (+ optional comment).
export async function markMyDelivered(
  deliveryId: string,
  delivered: boolean,
  reason?: string,
  comment?: string,
): Promise<MyRun> {
  const body: { delivered: boolean; reason?: string; comment?: string } = { delivered }
  if (reason) body.reason = reason
  if (comment) body.comment = comment
  return (await http.post<MyRun>(`/delivery/me/deliveries/${deliveryId}/mark-delivered`, body)).data
}

// Push a wrongly-pulled stop back to the pool — only while the run is still `preparing`.
export async function unassignMyDelivery(deliveryId: string): Promise<MyRun> {
  return (await http.post<MyRun>(`/delivery/me/deliveries/${deliveryId}/unassign`)).data
}

// ============================================================================
// Live location: the driver pushes GPS fixes for their own active run
// (`delivery.drive` + ownership); the dispatcher reads each active run's trail
// (`delivery.read`). Coordinates are decimal STRINGS, like everywhere else.
// Positions ride a dedicated `driver_position` realtime topic as FAT events —
// applied directly to the map, never a doorbell→refetch (see stores/views).
// ============================================================================

// One recorded fix on a run's trail. `trail[-1]` (last) is the run's current point.
export interface TrailPoint {
  latitude: string
  longitude: string
  recorded_at: string
}

// An active run's live position for the dispatcher: current point + its (simplified) trail.
export interface ActiveDriverPosition {
  run_id: string
  employee_id: string
  latitude: string
  longitude: string
  recorded_at: string
  trail: TrailPoint[]
}

// The server's echo of an appended fix.
export interface PushedPosition {
  run_id: string
  latitude: string
  longitude: string
  recorded_at: string
}

// Append a fix to the caller's own ACTIVE run. 409 when they have no active run (ignored by
// the caller — sampling is best-effort). lat/lng may be numbers or strings; the API coerces.
export async function pushMyPosition(
  latitude: number | string,
  longitude: number | string,
): Promise<PushedPosition> {
  return (await http.post<PushedPosition>('/delivery/me/run/location', { latitude, longitude }))
    .data
}

// The dispatcher read: every active run's current point + trail for a branch (delivery.read).
export async function listActivePositions(branchId: string): Promise<ActiveDriverPosition[]> {
  return (
    await http.get<ActiveDriverPosition[]>('/delivery/positions', {
      params: { branch_id: branchId },
    })
  ).data
}
