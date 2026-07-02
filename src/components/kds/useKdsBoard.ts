// KDS board state (lazy module singleton, so every component shares one board). Real data: the
// kitchen store owns tickets/stations/labels (write-through + polling); this composable adapts
// them into the KDS view model (lib/kds/adapter.ts) and holds the pure view state — filters,
// pagination, clocks, expo. Mutations go through the store so server state is shown verbatim:
//   • tap a component  → POST /kitchen/tickets/{id}/advance (forward-only; Done is terminal)
//   • bump a docket    → advance every remaining ticket of the order to ready
// Phase 1 maps 1 ticket = 1 component (no dish decomposition yet) — see adapter.ts.

import { computed, reactive, ref, watch, type ComputedRef, type Ref } from 'vue'
import { adaptTickets } from '@/lib/kds/adapter'
import {
  expoRows,
  filterBoardOrders,
  itemAlert,
  orderHasStation,
  orderStatus,
  readyOrderCount,
  sortOrdersForBoard,
  stationActiveCount,
  stationHasAlert,
  stationOrderCount,
  totalAlertCount,
} from '@/lib/kds/logic'
import { DEFAULT_WAIT_MIN, deriveStationMeta } from '@/lib/kds/stations'
import type { KdsOrder, Station, StationMeta } from '@/lib/kds/types'
import { getRecipeCard, type RecipeCard } from '@/services/recipes.api'
import { useAuthStore } from '@/stores/auth'
import { useKitchenStore } from '@/stores/kitchen'

const PAGE_SIZE = 8

/** Recipes are fed by the backend recipe card (`/recipes/variants/{id}/card`). */
export const RECIPES_ENABLED = true

export interface RecipeDrawerState {
  itemName: string
  station: Station | null
  status: 'loading' | 'card' | 'none'
  card: RecipeCard | null
}

type Board = ReturnType<typeof createBoard>
let board: Board | null = null

function createBoard() {
  const kitchen = useKitchenStore()
  const auth = useAuthStore()

  // Two clocks: a 1 s tick for the wall clock, a 15 s tick for ages/alerts. Split so the whole
  // board doesn't recompute every second.
  const startAt = Date.now()
  const clock = ref(startAt)
  const now = ref(startAt)

  let clockTimer: ReturnType<typeof setInterval> | undefined
  let ageTimer: ReturnType<typeof setInterval> | undefined
  let mounts = 0

  function start() {
    mounts++
    if (clockTimer) return
    clockTimer = setInterval(() => (clock.value = Date.now()), 1_000)
    ageTimer = setInterval(() => (now.value = Date.now()), 15_000)
  }
  function stop() {
    mounts = Math.max(0, mounts - 1)
    if (mounts > 0) return
    if (clockTimer) clearInterval(clockTimer)
    if (ageTimer) clearInterval(ageTimer)
    clockTimer = ageTimer = undefined
  }

  // Mutating controls are shown/enabled only with kitchen.update (UX gate; backend enforces).
  const canUpdate = computed(() => auth.can('kitchen.update'))

  // ── stations (dynamic, from the branch's DB rows) ─────────────────────────
  const stations: ComputedRef<StationMeta[]> = computed(() =>
    deriveStationMeta(kitchen.stations.filter((s) => s.is_active)),
  )
  const metaById = computed(() => new Map(stations.value.map((m) => [m.id, m])))
  function stationMeta(s: Station): StationMeta {
    return metaById.value.get(s) ?? { id: s, tag: '··', label: s, waitMin: DEFAULT_WAIT_MIN }
  }

  const activeStation: Ref<Station | null> = ref(null)
  const myStation: Ref<Station | null> = ref(null)

  // Keep the station selections valid as the branch's stations load/change.
  watch(
    stations,
    (list) => {
      if (myStation.value === null || !list.some((m) => m.id === myStation.value)) {
        myStation.value = list[0]?.id ?? null
      }
      if (activeStation.value !== null && !list.some((m) => m.id === activeStation.value)) {
        activeStation.value = null
      }
    },
    { immediate: true },
  )

  // ── orders (adapted from real tickets) ────────────────────────────────────
  const orders = computed<KdsOrder[]>(() =>
    adaptTickets(kitchen.allTickets, kitchen.itemIndex, metaById.value, now.value),
  )
  // Real tickets have no bump-fade: a fully-ready docket sinks via the board sort instead.
  const liveOrders = orders

  const viewMode = ref<'all' | 'mystation'>('all')
  const layout = ref<'grid' | 'list'>('grid')
  const theme = ref<'pass' | 'light'>('pass')
  const expoOpen = ref(false)
  const recipeDrawer: Ref<RecipeDrawerState | null> = ref(null)
  const expanded = reactive(new Set<string>())
  const page = ref(0)

  // Ready dockets leave the board by default; "Listas (N)" brings them back on demand.
  const showReady = ref(false)
  const readyCount = computed(() => readyOrderCount(liveOrders.value))
  function toggleShowReady() {
    showReady.value = !showReady.value
    page.value = 0
  }

  // What the grid renders: station + readiness filters, alert-then-newest sort, then paginated.
  const filteredOrders = computed(() => {
    const byStation = activeStation.value
      ? liveOrders.value.filter((o) => orderHasStation(o, activeStation.value as Station))
      : liveOrders.value
    return sortOrdersForBoard(filterBoardOrders(byStation, showReady.value), now.value)
  })

  const pageCount = computed(() => Math.max(1, Math.ceil(filteredOrders.value.length / PAGE_SIZE)))
  const pagedOrders = computed(() => {
    const p = Math.min(page.value, pageCount.value - 1)
    return filteredOrders.value.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE)
  })

  // ── actions ───────────────────────────────────────────────────────────────
  // Forward-only, matching the backend: pending → cooking → done, and Done is terminal (tapping
  // a done component is a no-op — there is no un-advance). The component id IS the ticket id.
  async function cycleComponent(orderId: string, itemId: string, compId: string) {
    if (!canUpdate.value) return
    const order = orders.value.find((o) => o.id === orderId)
    const comp = order?.items.find((i) => i.id === itemId)?.components.find((k) => k.id === compId)
    if (!comp || comp.status === 'done') return
    try {
      await kitchen.advanceTicket(compId)
    } catch {
      // conflict/network: the write-through refetch (or next poll) shows server truth
    }
    now.value = Date.now() // reflect the change in ages/alerts immediately
  }

  // Bump = advance every remaining ticket of the order to ready. Disabled while in flight; the
  // store refreshes the board once at the end (even on partial failure) so the server decides.
  const bumping = reactive(new Set<string>())
  function isBumping(orderId: string): boolean {
    return bumping.has(orderId)
  }
  async function bump(orderId: string) {
    if (!canUpdate.value || bumping.has(orderId)) return
    const order = orders.value.find((o) => o.id === orderId)
    if (!order) return
    const remaining = order.items
      .flatMap((i) => i.components)
      .filter((c) => c.status !== 'done')
      .map((c) => ({ id: c.id, status: c.status === 'cooking' ? 'in_progress' : 'pending' }))
    if (!remaining.length) return
    bumping.add(orderId)
    try {
      await kitchen.bumpTickets(remaining)
    } catch {
      // partial failure: the store already refetched, the board shows exactly what the server holds
    } finally {
      bumping.delete(orderId)
      now.value = Date.now()
    }
  }

  function toggleExpanded(itemId: string) {
    if (expanded.has(itemId)) expanded.delete(itemId)
    else expanded.add(itemId)
  }

  function focusOrder(orderId: string, itemId?: string) {
    // Jump to the page holding the order, expand the flagged item, and scroll to it.
    const idx = filteredOrders.value.findIndex((o) => o.id === orderId)
    if (idx >= 0) page.value = Math.floor(idx / PAGE_SIZE)
    if (itemId) expanded.add(itemId)
    expoOpen.value = false
    requestAnimationFrame(() => {
      document.getElementById(`kds-order-${orderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function toggleTheme() {
    theme.value = theme.value === 'pass' ? 'light' : 'pass'
  }
  function toggleLayout() {
    layout.value = layout.value === 'grid' ? 'list' : 'grid'
  }
  function setStation(s: Station | null) {
    activeStation.value = activeStation.value === s ? null : s
    page.value = 0
  }
  // The drawer loads the backend recipe card by the dish's variant. A stale fetch (drawer
  // closed or another dish opened meanwhile) is dropped by comparing a request token — the ref
  // wraps its value in a reactive proxy, so object identity wouldn't survive.
  let recipeRequestId = 0
  async function openRecipe(orderId: string, itemId: string) {
    if (!RECIPES_ENABLED) return
    const order = orders.value.find((o) => o.id === orderId)
    const item = order?.items.find((i) => i.id === itemId)
    if (!item) return
    const station = item.components[0]?.station ?? null
    const requestId = ++recipeRequestId
    recipeDrawer.value = {
      itemName: item.name,
      station,
      status: item.variantId ? 'loading' : 'none',
      card: null,
    }
    if (!item.variantId) return
    try {
      const card = await getRecipeCard(item.variantId)
      if (requestId === recipeRequestId) {
        recipeDrawer.value = { itemName: item.name, station, status: 'card', card }
      }
    } catch {
      // 404 (no recipe) and transport errors both read as a quiet "sin receta".
      if (requestId === recipeRequestId) {
        recipeDrawer.value = { itemName: item.name, station, status: 'none', card: null }
      }
    }
  }
  function closeRecipe() {
    recipeRequestId++ // invalidate any card fetch still in flight
    recipeDrawer.value = null
  }

  // Derived rollups the chrome needs.
  const expo = computed(() => expoRows(liveOrders.value, now.value))
  const alertCount = computed(() => totalAlertCount(liveOrders.value, now.value))

  return {
    // state
    orders,
    liveOrders,
    clock,
    now,
    canUpdate,
    stations,
    stationMeta,
    activeStation,
    viewMode,
    myStation,
    layout,
    theme,
    expoOpen,
    recipeDrawer,
    expanded,
    page,
    showReady,
    recipesEnabled: RECIPES_ENABLED,
    // derived
    filteredOrders,
    pagedOrders,
    pageCount,
    expo,
    alertCount,
    readyCount,
    // helpers re-exported so templates import from one place
    stationActiveCount: (s: Station) => stationActiveCount(liveOrders.value, s),
    stationOrderCount: (s: Station) => stationOrderCount(liveOrders.value, s),
    stationHasAlert: (s: Station) => stationHasAlert(liveOrders.value, s, now.value),
    itemAlert,
    orderStatus,
    // actions
    start,
    stop,
    cycleComponent,
    bump,
    isBumping,
    toggleExpanded,
    focusOrder,
    toggleTheme,
    toggleLayout,
    toggleShowReady,
    setStation,
    openRecipe,
    closeRecipe,
  }
}

export function useKdsBoard() {
  if (!board) board = createBoard()
  return board
}
