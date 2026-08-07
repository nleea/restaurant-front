import { defineStore } from 'pinia'
import { baseURL } from '@/lib/http'
import { createLiveRefetch, type LiveRefetch } from '@/composables/useLiveRefetch'
import * as api from '@/services/delivery.api'
import type { DriverStop, MyRun, Route } from '@/services/delivery.api'
import { useAuthStore } from '@/stores/auth'
import { detailOf, statusOf } from '@/lib/apiError'

// Live-refetch handle (module-level plumbing, like the poll/SSE state in stores/kitchen.ts).
let live: LiveRefetch | undefined

/** Which body tab the mobile bottom-nav is showing. */
export type DriverTab = 'home' | 'map' | 'day'

interface DriverState {
  /** The driver's own active run (the "despacho"), or null when free (empty state). */
  run: MyRun | null
  loading: boolean
  /** Human error to surface as a banner (e.g. "no route assigned" on open). */
  error: string | null
  /** Stop open in the detail sheet, or null. */
  selectedStopId: string | null
  /** The routes this driver actively drives — the choices when opening a despacho. */
  myRoutes: Route[]
  /** True once myRoutes has been fetched (so the empty state can pick its shape). */
  routesLoaded: boolean
  tab: DriverTab
  /** Consent toggle: is the driver sharing their live location? Off by default. */
  tracking: boolean
  /** The browser denied the location permission — surface a soft hint, never block. */
  trackingDenied: boolean
  /** The driver's latest own fix (the live "Tú" marker), or null until the first fix. */
  myPosition: { lat: number; lng: number } | null
  /** The driver's own accumulated trail for the active run (local fixes, reset per run). */
  myTrail: { lat: number; lng: number }[]
}

// Paradas ya resueltas: no son "la siguiente" ni cuentan como trabajo pendiente. `cancelled`
// entra aunque hoy no pueda llegar a un run — si algún día llega, sin esto `nextStop` mandaría
// al domiciliario a una dirección de un pedido que ya no existe.
const TERMINAL = ['delivered', 'not_delivered', 'cancelled']
const MAX = Number.MAX_SAFE_INTEGER

// Driver self-service store. Write-through discipline like stores/dispatch.ts: every mutation
// calls the API and replaces `run` with the server's response, so cascaded transitions (depart
// flips all stops to in_transit at once) are shown verbatim. Identity is the authenticated user;
// every driver endpoint is session-scoped server-side, so no employee_id lives here.
export const useDriverStore = defineStore('driver', {
  state: (): DriverState => ({
    run: null,
    loading: false,
    error: null,
    selectedStopId: null,
    myRoutes: [],
    routesLoaded: false,
    tab: 'home',
    tracking: false,
    trackingDenied: false,
    myPosition: null,
    myTrail: [],
  }),

  getters: {
    // Header identity: the logged-in user's name (a static role label is the subtitle).
    driverName: (): string => useAuthStore().user?.name ?? 'Domiciliario',

    hasRun: (s): boolean => s.run !== null,

    // Tracking is only meaningful — and only allowed — while a run is live (preparing/in_transit).
    isRunActive: (s): boolean =>
      s.run !== null && (s.run.status === 'preparing' || s.run.status === 'in_transit'),

    // Stops in delivery order — sorted by route_position defensively (the API returns them so).
    stops: (s): DriverStop[] =>
      [...(s.run?.stops ?? [])].sort(
        (a, b) => (a.route_position ?? MAX) - (b.route_position ?? MAX),
      ),

    // The highlighted "siguiente pedido": first stop, by route order, not yet delivered or
    // not-delivered. Derived from position + terminal status because depart moves every stop
    // to in_transit at once — a per-stop transit flag no longer distinguishes "next".
    nextStop(): DriverStop | null {
      return this.stops.find((st) => !TERMINAL.includes(st.delivery_status)) ?? null
    },

    deliveredCount: (s): number =>
      s.run?.stops.filter((st) => st.delivery_status === 'delivered').length ?? 0,

    settledCount: (s): number =>
      s.run?.stops.filter((st) => TERMINAL.includes(st.delivery_status)).length ?? 0,

    totalCount: (s): number => s.run?.stops.length ?? 0,

    /** Every stop reached a terminal state → the run can be finished. */
    isComplete(): boolean {
      return this.totalCount > 0 && this.settledCount === this.totalCount
    },

    // Cash the driver is carrying: delivered stops that were collected on delivery (paid=false).
    cashCollected: (s): number =>
      s.run?.stops
        .filter((st) => st.delivery_status === 'delivered' && st.paid === false)
        .reduce((sum, st) => sum + Number(st.total ?? 0), 0) ?? 0,

    selectedStop(): DriverStop | null {
      if (!this.selectedStopId) return null
      return this.stops.find((st) => st.id === this.selectedStopId) ?? null
    },

    // --- "Mi día" summary (CURRENT run only) ---------------------------------
    // The real API exposes only the active run — there is no "my finished runs today" endpoint
    // yet (a follow-up). So the day view summarizes the settled stops of the run in hand, and
    // shows an empty state when there is none. It never fabricates cross-run history.
    dayStops(): DriverStop[] {
      return this.stops.filter((st) => TERMINAL.includes(st.delivery_status))
    },
    dayDelivered(): number {
      return this.dayStops.filter((st) => st.delivery_status === 'delivered').length
    },
    dayFailed(): number {
      return this.dayStops.filter((st) => st.delivery_status === 'not_delivered').length
    },
    dayCash(): number {
      return this.dayStops
        .filter((st) => st.delivery_status === 'delivered' && st.paid === false)
        .reduce((sum, st) => sum + Number(st.total ?? 0), 0)
    },
  },

  actions: {
    setTab(tab: DriverTab) {
      this.tab = tab
    },
    openStop(id: string) {
      this.selectedStopId = id
    },
    closeStop() {
      this.selectedStopId = null
    },

    // Load the driver's own run. A 404 (e.g. the user has no employee link) reads as "no active
    // run" — a friendly empty state, not a crash. `silent` skips the spinner so a live doorbell
    // refetch (the dispatcher changed the run) refreshes in place without blanking the screen.
    async loadMyRun(options?: { silent?: boolean }): Promise<void> {
      if (!options?.silent) this.loading = true
      this.error = null
      try {
        this.run = await api.getMyRun()
      } catch (e) {
        if (statusOf(e) === 404) this.run = null
        else this.error = detailOf(e) ?? 'No se pudo cargar tu despacho.'
      } finally {
        this.loading = false
      }
    },

    // Load the routes the driver drives, so the empty state can open directly (one route) or
    // offer a picker (several). Never fatal — an error just leaves the list empty.
    async loadMyRoutes(): Promise<void> {
      try {
        this.myRoutes = await api.listMyRoutes()
      } catch {
        this.myRoutes = []
      } finally {
        this.routesLoaded = true
      }
    },

    // "Abrir despacho": self-open (create + pull). Pass a route when the driver drives several;
    // on the no-route error, surface the server's message and stay on the empty state.
    async openMyRun(routeId?: string): Promise<void> {
      this.error = null
      try {
        this.run = await api.openMyRun(routeId)
        this.tab = 'home'
      } catch (e) {
        this.error = detailOf(e) ?? 'No tienes una ruta asignada para abrir un despacho.'
      }
    },

    // "Salir a repartir": run-level departure, cascading all stops to in_transit.
    async departMyRun(): Promise<void> {
      if (!this.run) return
      this.error = null
      try {
        this.run = await api.departMyRun(this.run.id)
      } catch (e) {
        this.error = detailOf(e) ?? 'No se pudo salir a repartir.'
      }
    },

    // "Finalizar despacho": finish returns a bare Run (no stops) → back to the empty state.
    async finishMyRun(): Promise<void> {
      if (!this.run) return
      this.error = null
      try {
        await api.finishMyRun(this.run.id)
        this.run = null
        this.tab = 'home'
        this.disableTracking()
        this.resetTracking()
      } catch (e) {
        this.error = detailOf(e) ?? 'No se pudo finalizar el despacho.'
      }
    },

    // Doorstep verdict. Closes the sheet and lets `nextStop` advance to the following stop.
    async markMyDelivered(
      id: string,
      delivered: boolean,
      reason?: string,
      comment?: string,
    ): Promise<void> {
      this.error = null
      try {
        this.run = await api.markMyDelivered(id, delivered, reason, comment)
        // Sólo se cierra la hoja si de verdad se resolvió. Si el cobro falló, la parada
        // sigue pendiente y el domiciliario tiene que seguir viéndola — cerrarla le haría
        // creer que quedó entregada.
        this.selectedStopId = null
      } catch (e) {
        this.error = detailOf(e) ?? 'No se pudo actualizar la entrega.'
      }
    },

    // Push a wrongly-pulled stop back to the pool (server allows this only while `preparing`).
    async unassignMyDelivery(id: string): Promise<void> {
      this.error = null
      try {
        this.run = await api.unassignMyDelivery(id)
      } catch (e) {
        this.error = detailOf(e) ?? 'No se pudo quitar la parada.'
      } finally {
        this.selectedStopId = null
      }
    },

    // --- Live location (consent + local trail) ---------------------------------
    // The toggle is the consent gate; the geolocation watcher itself lives in the driver view
    // (browser API + view lifecycle) and feeds accepted fixes back through `recordFix`.
    enableTracking(): void {
      this.trackingDenied = false
      this.tracking = true
    },
    disableTracking(): void {
      this.tracking = false
    },
    // The browser denied permission: turn the toggle off and remember, so the UI can say so
    // without blocking the run.
    markTrackingDenied(): void {
      this.tracking = false
      this.trackingDenied = true
    },
    // Clear the local position + trail (a new run, or the run finished/changed).
    resetTracking(): void {
      this.myPosition = null
      this.myTrail = []
    },
    // A throttled, accepted fix: extend the local trail (the driver sees where they've been) and
    // push it to the own-run endpoint — best-effort, so a failed push (e.g. a 409 when the run
    // just closed) never disturbs the driver's screen.
    recordFix(latitude: number, longitude: number): void {
      this.myPosition = { lat: latitude, lng: longitude }
      this.myTrail.push({ lat: latitude, lng: longitude })
      void api.pushMyPosition(latitude, longitude).catch(() => undefined)
    },

    // --- Live run (SSE doorbell → silent refetch, polling fallback) ------------
    // The driver's run can change from the dispatcher's side (a stop added/removed, the run
    // departed). Subscribing to the branch's `delivery` stream refetches it in place. Start on
    // view mount, stop on unmount.
    startLive(branchId: string): void {
      this.stopLive()
      live = createLiveRefetch({
        url: `${baseURL}/delivery/events?branch_id=${branchId}`,
        onDoorbell: async () => {
          await this.loadMyRun({ silent: true })
        },
      })
      live.start()
    },
    stopLive(): void {
      live?.stop()
      live = undefined
    },
  },
})
