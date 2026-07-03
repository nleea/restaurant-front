<script setup lang="ts">
// Despacho — the dispatch board, wired to real data.
// Three-pane board: rail (stats + filters) · list (domicilios / despachos) · detail.
// Signature: the "stop strip" — each despacho renders its domicilios as route
// segments colored by state, and time pressure reuses the KDS heat-lamp glow.
// Assignment happens only through runs (backend rule): a pending domicilio is
// assigned by picking a preparing despacho, never by picking a driver directly.
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import AppShell from '@/components/AppShell.vue'
import LocationPickerMap from '@/components/dispatch/LocationPickerMap.vue'
import { parseSharedLocation, toCoordinateStrings } from '@/lib/geo'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useDispatchStore } from '@/stores/dispatch'
import { useDeliveryStore } from '@/stores/delivery'
import { useStaffStore } from '@/stores/staff'
import { useOrdersStore } from '@/stores/orders'
import { listDrivers, type Delivery, type Run } from '@/services/delivery.api'
import type { Employee } from '@/services/staff.api'
import { statusOf } from '@/lib/apiError'

const auth = useAuthStore()
const branch = useBranchStore()
const dispatch = useDispatchStore()
const delivery = useDeliveryStore()
const staff = useStaffStore()
const orders = useOrdersStore()

const canManage = computed(() => auth.can('delivery.manage'))
const canAssign = computed(() => auth.can('delivery.assign'))

// --- Load --------------------------------------------------------------------
const loading = ref(false)
const error = ref<string | null>(null)
const lastRefresh = ref<Date | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    await branch.ensureLoaded()
    const branchId = branch.activeBranchId ?? undefined
    await Promise.all([
      dispatch.loadDeliveries(),
      dispatch.loadRuns(),
      branchId ? delivery.loadRoutes(branchId) : Promise.resolve(),
      branchId ? delivery.loadSettings(branchId) : Promise.resolve(),
      staff.ensureLoaded({ branchId, active: true }),
      branchId ? orders.loadOrders(branchId, 'open') : Promise.resolve(),
      branchId ? orders.loadTables(branchId) : Promise.resolve(),
    ])
    lastRefresh.value = new Date()
  } catch {
    error.value = 'No se pudo cargar el despacho.'
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(
  () => branch.activeBranchId,
  () => {
    selectedDeliveryId.value = null
    selectedRunId.value = null
    void load()
  },
)

// --- Clock: keeps "hace N min" and heat alive between refreshes ---------------
const now = ref(Date.now())
const tick = setInterval(() => {
  now.value = Date.now()
}, 30_000)
onBeforeUnmount(() => clearInterval(tick))

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })
}
function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  return Math.max(0, Math.floor((now.value - new Date(iso).getTime()) / 60_000))
}
function agoLabel(iso: string | null | undefined): string {
  const e = minutesSince(iso)
  if (e === null) return '—'
  if (e < 60) return `hace ${e} min`
  return `hace ${Math.floor(e / 60)} h ${String(e % 60).padStart(2, '0')} min`
}
function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false
  return new Date(iso).toDateString() === new Date(now.value).toDateString()
}

// --- Vocabulary (backend statuses, Spanish copy) -------------------------------
const DELIVERY_STATUS: Record<string, { label: string; pill: string; dot: string }> = {
  pending: { label: 'Sin asignar', pill: 'pill-warn', dot: 'bg-warn' },
  assigned: { label: 'Asignado', pill: 'pill-neutral', dot: 'bg-steel-400' },
  in_transit: { label: 'En ruta', pill: 'pill-info', dot: 'bg-info' },
  delivered: { label: 'Entregado', pill: 'pill-success', dot: 'bg-success' },
  not_delivered: { label: 'No entregado', pill: 'pill-alert', dot: 'bg-alert' },
}
const RUN_STATUS: Record<string, { label: string; pill: string; dot: string }> = {
  preparing: { label: 'Preparando', pill: 'pill-warn', dot: 'bg-warn' },
  in_transit: { label: 'En ruta', pill: 'pill-info', dot: 'bg-info' },
  finished: { label: 'Finalizado', pill: 'pill-success', dot: 'bg-success' },
}
const DRIVER_STATUS: Record<string, { label: string; pill: string }> = {
  available: { label: 'Disponible', pill: 'pill-success' },
  on_route: { label: 'En ruta', pill: 'pill-info' },
  inactive: { label: 'Inactivo', pill: 'pill-neutral' },
}
function deliveryStatusMeta(status: string) {
  return DELIVERY_STATUS[status] ?? { label: status, pill: 'pill-neutral', dot: 'bg-steel-400' }
}
function runStatusMeta(status: string) {
  return RUN_STATUS[status] ?? { label: status, pill: 'pill-neutral', dot: 'bg-steel-400' }
}
const OPEN_DELIVERY = new Set(['pending', 'assigned', 'in_transit'])

// --- Label helpers -------------------------------------------------------------
const CHANNELS: Record<string, string> = {
  dine_in: 'Mesa',
  takeaway: 'Para llevar',
  delivery: 'Domicilio',
}
function orderLabel(orderId: string): string {
  const order = orders.orders.find((o) => o.id === orderId)
  if (!order) return `#${orderId.slice(0, 8)}`
  if (order.dining_table_id) {
    const table = orders.tables.find((t) => t.id === order.dining_table_id)
    if (table) return `Mesa ${table.number}`
  }
  return CHANNELS[order.channel] ?? order.channel
}
function routeName(routeId: string | null): string {
  if (!routeId) return 'Sin ruta'
  return delivery.routes.find((r) => r.id === routeId)?.name ?? `#${routeId.slice(0, 8)}`
}
function employeeName(employeeId: string | null): string {
  if (!employeeId) return 'Sin conductor'
  const emp = staff.employees.find((e: Employee) => e.id === employeeId)
  return emp ? staff.employeeName(emp) : `#${employeeId.slice(0, 8)}`
}
function employeeEmail(employeeId: string): string | null {
  const emp = staff.employees.find((e: Employee) => e.id === employeeId)
  if (!emp) return null
  const email = staff.employeeEmail(emp)
  return email === '—' ? null : email
}
function driverInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
function runOf(d: Delivery): Run | null {
  if (!d.delivery_run_id) return null
  return dispatch.runs.find((r) => r.id === d.delivery_run_id) ?? null
}
function deliveryDriverName(d: Delivery): string | null {
  const run = runOf(d)
  return run ? employeeName(run.employee_id) : null
}

// --- Tabs, selection, responsive drill-down ------------------------------------
type Area = 'deliveries' | 'runs'
const area = ref<Area>('deliveries')
const areas: { value: Area; label: string }[] = [
  { value: 'deliveries', label: 'Domicilios' },
  { value: 'runs', label: 'Despachos' },
]
const selectedDeliveryId = ref<string | null>(null)
const selectedRunId = ref<string | null>(null)
const selectedDelivery = computed(
  () => dispatch.deliveries.find((d) => d.id === selectedDeliveryId.value) ?? null,
)
const selectedRun = computed(() => dispatch.runs.find((r) => r.id === selectedRunId.value) ?? null)
const mobileDetailOpen = computed(() =>
  area.value === 'deliveries' ? selectedDelivery.value !== null : selectedRun.value !== null,
)
function closeDetail() {
  if (area.value === 'deliveries') selectedDeliveryId.value = null
  else selectedRunId.value = null
}
function goToDelivery(id: string) {
  area.value = 'deliveries'
  selectedDeliveryId.value = id
}
function goToRun(id: string) {
  area.value = 'runs'
  selectedRunId.value = id
}

// --- Action feedback -------------------------------------------------------------
const actionError = ref<string | null>(null)
const acting = ref(false)
async function act(fn: () => Promise<void>, conflictMsg: string, failMsg: string) {
  acting.value = true
  actionError.value = null
  try {
    await fn()
  } catch (e) {
    actionError.value = statusOf(e) === 409 ? conflictMsg : failMsg
  } finally {
    acting.value = false
  }
}
watch([selectedDeliveryId, selectedRunId, area], () => {
  actionError.value = null
})

// --- Filters ----------------------------------------------------------------------
const showFilters = ref(false)
const deliveryStatusSel = reactive(new Set<string>())
const runStatusSel = reactive(new Set<string>())
const routeSel = reactive(new Set<string>())
const driverFilter = ref<string>('all')
const query = ref('')

function toggleIn<T>(set: Set<T>, value: T) {
  if (set.has(value)) set.delete(value)
  else set.add(value)
}
const driverFilterOptions = computed(() => {
  const ids = [...new Set(dispatch.runs.map((r) => r.employee_id))]
  return [
    { label: 'Todos los conductores', value: 'all' },
    ...ids
      .map((id) => ({ label: employeeName(id), value: id }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ]
})

function deliveryMatchesDriver(d: Delivery): boolean {
  if (driverFilter.value === 'all') return true
  return runOf(d)?.employee_id === driverFilter.value
}

const filteredDeliveries = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = dispatch.deliveries.filter((d) => {
    if (deliveryStatusSel.size && !deliveryStatusSel.has(d.delivery_status)) return false
    if (routeSel.size && (!d.delivery_route_id || !routeSel.has(d.delivery_route_id))) return false
    if (!deliveryMatchesDriver(d)) return false
    if (q) {
      const hay =
        `${d.address_text} ${d.neighborhood ?? ''} ${d.id.slice(0, 8)} ${orderLabel(d.order_id)}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  // Working set first (oldest on top — that's who's waiting longest), resolved after.
  const open = (d: Delivery) => OPEN_DELIVERY.has(d.delivery_status)
  return [...list].sort((a, b) => {
    if (open(a) !== open(b)) return open(a) ? -1 : 1
    if (open(a)) return (a.created_at ?? '').localeCompare(b.created_at ?? '')
    return (b.delivered_at ?? '').localeCompare(a.delivered_at ?? '')
  })
})

const filteredRuns = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = dispatch.runs.filter((r) => {
    if (runStatusSel.size && !runStatusSel.has(r.status)) return false
    if (routeSel.size && !routeSel.has(r.delivery_route_id)) return false
    if (driverFilter.value !== 'all' && r.employee_id !== driverFilter.value) return false
    if (q) {
      const hay = `${employeeName(r.employee_id)} ${routeName(r.delivery_route_id)}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const rank: Record<string, number> = { in_transit: 0, preparing: 1, finished: 2 }
  return [...list].sort(
    (a, b) =>
      (rank[a.status] ?? 3) - (rank[b.status] ?? 3) ||
      (a.created_at ?? '').localeCompare(b.created_at ?? ''),
  )
})

// --- Stats -------------------------------------------------------------------------
const stats = computed(() => {
  const ds = dispatch.deliveries
  return {
    enRoute: ds.filter((d) => d.delivery_status === 'in_transit').length,
    pending: ds.filter((d) => d.delivery_status === 'pending' || d.delivery_status === 'assigned')
      .length,
    delivered: ds.filter((d) => d.delivery_status === 'delivered' && isToday(d.delivered_at))
      .length,
    total: ds.filter((d) => isToday(d.created_at)).length,
  }
})

// --- Heat: the longer a customer waits, the hotter the docket -----------------------
function heatClass(d: Delivery): string {
  if (!OPEN_DELIVERY.has(d.delivery_status)) return ''
  const waited = minutesSince(d.created_at)
  if (waited === null) return ''
  if (waited >= 50) return 'heat-hot'
  if (waited >= 35) return 'heat-warm'
  return ''
}

// --- Delivery lifecycle timeline -----------------------------------------------------
interface TimelineStep {
  label: string
  time: string | null
  state: 'done' | 'active' | 'pending' | 'failed'
}
function timelineOf(d: Delivery): TimelineStep[] {
  const run = runOf(d)
  const received: TimelineStep = {
    label: 'Pedido recibido',
    time: d.created_at ? fmtTime(d.created_at) : null,
    state: d.delivery_status === 'pending' ? 'active' : 'done',
  }
  const assigned: TimelineStep = {
    label: 'Asignado a despacho',
    time: null,
    state:
      d.delivery_status === 'pending'
        ? 'pending'
        : d.delivery_status === 'assigned'
          ? 'active'
          : 'done',
  }
  const inTransit: TimelineStep = {
    label: 'En ruta',
    time: run?.departed_at ? fmtTime(run.departed_at) : null,
    state:
      d.delivery_status === 'in_transit'
        ? 'active'
        : d.delivery_status === 'delivered' || d.delivery_status === 'not_delivered'
          ? 'done'
          : 'pending',
  }
  const outcome: TimelineStep =
    d.delivery_status === 'not_delivered'
      ? { label: 'No entregado', time: fmtTime(d.delivered_at), state: 'failed' }
      : {
          label: 'Entregado',
          time: d.delivery_status === 'delivered' ? fmtTime(d.delivered_at) : null,
          state: d.delivery_status === 'delivered' ? 'done' : 'pending',
        }
  return [received, assigned, inTransit, outcome]
}

// --- Notes ----------------------------------------------------------------------------
const noteDraft = ref('')
const noteSaved = ref(false)
const noteSaving = ref(false)
let noteTimer: ReturnType<typeof setTimeout> | null = null
watch(
  selectedDelivery,
  (d, prev) => {
    if (d?.id !== prev?.id) {
      noteDraft.value = d?.notes ?? ''
      noteSaved.value = false
    }
  },
  { immediate: true },
)
async function saveNote() {
  const d = selectedDelivery.value
  if (!d) return
  noteSaving.value = true
  actionError.value = null
  try {
    await dispatch.updateDeliveryNotes(d.id, noteDraft.value.trim() || null)
    noteSaved.value = true
    if (noteTimer) clearTimeout(noteTimer)
    noteTimer = setTimeout(() => (noteSaved.value = false), 2000)
  } catch {
    actionError.value = 'No se pudo guardar la nota.'
  } finally {
    noteSaving.value = false
  }
}

// --- Run helpers ------------------------------------------------------------------------
function stopsOf(runId: string): Delivery[] {
  return dispatch.deliveriesOfRun(runId)
}
function stopSegmentClass(d: Delivery): string {
  if (d.delivery_status === 'delivered') return 'bg-success'
  if (d.delivery_status === 'not_delivered') return 'bg-alert/50'
  if (d.delivery_status === 'in_transit') return 'animate-pulse bg-info'
  return 'bg-steel-300'
}
function canFinishRun(r: Run): boolean {
  const stops = stopsOf(r.id)
  return stops.every(
    (d) => d.delivery_status === 'delivered' || d.delivery_status === 'not_delivered',
  )
}
function runTimeLabel(r: Run): string {
  if (r.status === 'preparing') return `Creado ${fmtTime(r.created_at)}`
  if (r.status === 'in_transit') return `En ruta ${agoLabel(r.departed_at)}`
  return `Finalizado ${fmtTime(r.finished_at)}`
}
async function departRun(r: Run) {
  await act(
    () => dispatch.departRun(r.id),
    'El despacho no está en preparación.',
    'No se pudo dar salida.',
  )
}
async function finishRun(r: Run) {
  if (!canFinishRun(r)) return
  await act(
    () => dispatch.finishRun(r.id),
    'El despacho no está en camino.',
    'No se pudo finalizar.',
  )
}
async function markDelivered(d: Delivery, delivered: boolean) {
  await act(
    () => dispatch.markDelivered(d.id, delivered),
    'La entrega debe estar en camino.',
    'No se pudo marcar la entrega.',
  )
}

// --- Assign-to-run picker (replaces direct driver assignment) -----------------------------
const assignTarget = ref<Delivery | null>(null)
const assignRunId = ref<string | null>(null)
const assignCandidateRuns = computed(() =>
  dispatch.runs
    .filter((r) => r.status === 'preparing' && r.id !== assignTarget.value?.delivery_run_id)
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')),
)
function openAssignPicker(d: Delivery) {
  assignTarget.value = d
  assignRunId.value = null
}
async function applyAssign() {
  const d = assignTarget.value
  if (!d || !assignRunId.value) return
  await act(
    async () => {
      await dispatch.assignDelivery(d.id, assignRunId.value as string)
      assignTarget.value = null
    },
    'El despacho ya salió o el domicilio no se puede asignar.',
    'No se pudo asignar el domicilio.',
  )
}
function createRunForDelivery() {
  const d = assignTarget.value
  assignTarget.value = null
  openNewRun(d?.id ?? null)
}

// --- "Nuevo despacho" modal (2 steps) --------------------------------------------------------
interface DriverRow {
  employeeId: string
  name: string
  status: string
  routeIds: string[]
}
const showNewRun = ref(false)
const runStep = ref<1 | 2>(1)
const runDriver = ref<DriverRow | null>(null)
const runRouteId = ref<string | null>(null)
const runDriverQuery = ref('')
const runSelected = reactive(new Set<string>())
const driverRows = ref<DriverRow[]>([])
const loadingDrivers = ref(false)
const creatingRun = ref(false)
const runFormError = ref<string | null>(null)

async function openNewRun(preselectDeliveryId: string | null = null) {
  runStep.value = 1
  runDriver.value = null
  runRouteId.value = null
  runDriverQuery.value = ''
  runSelected.clear()
  if (preselectDeliveryId) runSelected.add(preselectDeliveryId)
  runFormError.value = null
  showNewRun.value = true
  loadingDrivers.value = true
  try {
    // Aggregate active drivers across the branch's active routes; the backend
    // derives each driver's status (available / on_route) from live runs.
    const routes = delivery.activeRoutes
    const perRoute = await Promise.all(routes.map((r) => listDrivers(r.id)))
    const byEmployee = new Map<string, DriverRow>()
    routes.forEach((route, i) => {
      for (const rd of perRoute[i] ?? []) {
        if (!rd.is_active) continue
        const row = byEmployee.get(rd.employee_id)
        if (row) row.routeIds.push(route.id)
        else
          byEmployee.set(rd.employee_id, {
            employeeId: rd.employee_id,
            name: employeeName(rd.employee_id),
            status: rd.status,
            routeIds: [route.id],
          })
      }
    })
    driverRows.value = [...byEmployee.values()]
  } catch {
    runFormError.value = 'No se pudieron cargar los conductores.'
  } finally {
    loadingDrivers.value = false
  }
}
const runDriverRows = computed(() => {
  const q = runDriverQuery.value.trim().toLowerCase()
  const rank: Record<string, number> = { available: 0, on_route: 1, inactive: 2 }
  return driverRows.value
    .filter((r) => !q || r.name.toLowerCase().includes(q))
    .sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || a.name.localeCompare(b.name))
})
function pickRunDriver(row: DriverRow) {
  if (row.status !== 'available') return
  runDriver.value = row
  runRouteId.value = row.routeIds[0] ?? null
  runStep.value = 2
}
const runRouteOptions = computed(() =>
  (runDriver.value?.routeIds ?? []).map((id) => ({ label: routeName(id), value: id })),
)
const runCandidates = computed(() => dispatch.pendingDeliveries)
async function createRun() {
  if (!runDriver.value || !runRouteId.value || runSelected.size === 0) return
  creatingRun.value = true
  runFormError.value = null
  try {
    const run = await dispatch.createRun({
      delivery_route_id: runRouteId.value,
      employee_id: runDriver.value.employeeId,
    })
    for (const id of runSelected) {
      await dispatch.assignDelivery(id, run.id)
    }
    showNewRun.value = false
    goToRun(run.id)
  } catch (e) {
    runFormError.value =
      statusOf(e) === 404 || statusOf(e) === 422
        ? 'El conductor no está asignado a esa ruta.'
        : 'No se pudo crear el despacho.'
  } finally {
    creatingRun.value = false
  }
}

// --- Location picking (shared by the create modal and the detail editor) -------------------
const PASTE_HELP =
  'No se reconoció. Pega un par "lat, lng" o un link largo de Google Maps; si es un link corto (maps.app.goo.gl), ábrelo y copia el link completo.'

function branchPin(): [number, number] | null {
  const s = delivery.settings
  if (!s || s.latitude == null || s.longitude == null) return null
  return [Number(s.latitude), Number(s.longitude)]
}
function hasLocation(d: Delivery): boolean {
  return d.latitude != null && d.longitude != null
}
// Parse a pasted share into a point; empty text just clears the error.
function watchPaste(text: () => string, setPoint: (p: [number, number]) => void, setError: (m: string | null) => void) {
  watch(text, (value) => {
    const trimmed = value.trim()
    if (!trimmed) return setError(null)
    const point = parseSharedLocation(trimmed)
    if (point) {
      setPoint(point)
      setError(null)
    } else {
      setError(PASTE_HELP)
    }
  })
}

// --- "Nuevo domicilio" modal --------------------------------------------------------------
const showNewDelivery = ref(false)
const fOrderId = ref<string | null>(null)
const fAddress = ref('')
const fNeighborhood = ref('')
const fNotes = ref('')
const fShowLocation = ref(false)
const fPoint = ref<[number, number] | null>(null)
const fPaste = ref('')
const fPasteError = ref<string | null>(null)
const creatingDelivery = ref(false)
const deliveryFormError = ref<string | null>(null)
watchPaste(
  () => fPaste.value,
  (p) => (fPoint.value = p),
  (m) => (fPasteError.value = m),
)

const openOrderOptions = computed(() => {
  // Orders that already have a delivery are excluded to avoid guaranteed 409s.
  const taken = new Set(dispatch.deliveries.map((d) => d.order_id))
  return orders.orders
    .filter((o) => !taken.has(o.id))
    .map((o) => ({ label: `${orderLabel(o.id)} · #${o.id.slice(0, 8)}`, value: o.id }))
})
function openNewDelivery() {
  fOrderId.value = null
  fAddress.value = ''
  fNeighborhood.value = ''
  fNotes.value = ''
  fShowLocation.value = false
  fPoint.value = null
  fPaste.value = ''
  fPasteError.value = null
  deliveryFormError.value = null
  showNewDelivery.value = true
}
const canSaveDelivery = computed(() => fOrderId.value !== null && fAddress.value.trim() !== '')
async function createDelivery() {
  if (!canSaveDelivery.value || !fOrderId.value) return
  creatingDelivery.value = true
  deliveryFormError.value = null
  try {
    const created = await dispatch.createDelivery({
      order_id: fOrderId.value,
      address_text: fAddress.value.trim(),
      neighborhood: fNeighborhood.value.trim() || null,
      ...(fPoint.value ? toCoordinateStrings(fPoint.value) : {}),
    })
    const note = fNotes.value.trim()
    if (note) await dispatch.updateDeliveryNotes(created.id, note)
    showNewDelivery.value = false
    goToDelivery(created.id)
  } catch (e) {
    deliveryFormError.value =
      statusOf(e) === 409
        ? 'Ese pedido ya tiene un domicilio.'
        : 'No se pudo crear el domicilio.'
  } finally {
    creatingDelivery.value = false
  }
}

// --- "Agregar domicilio al despacho" mini modal ----------------------------------------------
const showAddToRun = ref(false)
const addQuery = ref('')
const addSelected = reactive(new Set<string>())
const addingToRun = ref(false)
function openAddToRun() {
  addQuery.value = ''
  addSelected.clear()
  showAddToRun.value = true
}
const addCandidates = computed(() => {
  const q = addQuery.value.trim().toLowerCase()
  return dispatch.pendingDeliveries.filter(
    (d) => !q || `${d.address_text} ${d.neighborhood ?? ''}`.toLowerCase().includes(q),
  )
})
// --- "Agregar/corregir ubicación" editor (detail pane) --------------------------------------
const locOpen = ref(false)
const locPoint = ref<[number, number] | null>(null)
const locPaste = ref('')
const locPasteError = ref<string | null>(null)
const locSaving = ref(false)
const locPicker = ref<InstanceType<typeof LocationPickerMap> | null>(null)
watchPaste(
  () => locPaste.value,
  (p) => (locPoint.value = p),
  (m) => (locPasteError.value = m),
)
function openLocationEditor() {
  const d = selectedDelivery.value
  if (!d) return
  locPoint.value = hasLocation(d) ? [Number(d.latitude), Number(d.longitude)] : null
  locPaste.value = ''
  locPasteError.value = null
  locOpen.value = true
}
async function saveLocation() {
  const d = selectedDelivery.value
  if (!d || !locPoint.value) return
  locSaving.value = true
  actionError.value = null
  try {
    const { latitude, longitude } = toCoordinateStrings(locPoint.value)
    await dispatch.updateDeliveryLocation(d.id, latitude, longitude)
    locOpen.value = false
  } catch {
    actionError.value = 'No se pudo guardar la ubicación.'
  } finally {
    locSaving.value = false
  }
}

async function addToRun() {
  const r = selectedRun.value
  if (!r || addSelected.size === 0) return
  addingToRun.value = true
  actionError.value = null
  try {
    for (const id of addSelected) {
      await dispatch.assignDelivery(id, r.id)
    }
    showAddToRun.value = false
  } catch (e) {
    actionError.value =
      statusOf(e) === 409
        ? 'El despacho ya salió — no se pueden agregar domicilios.'
        : 'No se pudo agregar el domicilio.'
    showAddToRun.value = false
  } finally {
    addingToRun.value = false
  }
}
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-[100rem] flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <!-- ── Top bar ─────────────────────────────────────────────────────── -->
        <header class="flex flex-wrap items-end justify-between gap-3">
          <div class="min-w-0">
            <p class="eyebrow">Estación · Despacho</p>
            <h1 class="mt-1 text-2xl font-extrabold text-ink">Despacho</h1>
            <p class="text-steel-500">Domicilios, despachos y su ciclo de entrega.</p>
          </div>
          <div class="flex items-center gap-3">
            <span v-if="lastRefresh" class="font-mono text-[11px] text-steel-500">
              Última actualización · {{ fmtTime(lastRefresh.toISOString()) }}
            </span>
            <Button
              label="Actualizar"
              size="small"
              severity="secondary"
              outlined
              icon="pi pi-refresh"
              :loading="loading"
              @click="load"
            />
          </div>
        </header>

        <!-- ── Tabs + filter toggle ─────────────────────────────────────────── -->
        <div class="flex items-center justify-between gap-2">
          <nav class="flex w-fit gap-1 rounded-xl border border-line bg-app p-1">
            <button
              v-for="t in areas"
              :key="t.value"
              type="button"
              class="rounded-lg px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
              :class="area === t.value ? 'bg-ember text-graphite-900' : 'text-steel-500 hover:text-ink'"
              @click="area = t.value"
            >
              {{ t.label }}
            </button>
          </nav>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500 transition hover:text-ink xl:hidden"
            @click="showFilters = !showFilters"
          >
            <i class="pi pi-sliders-h text-xs" />
            Filtros
          </button>
        </div>

        <p v-if="error" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ error }}
        </p>
        <div v-if="loading && !dispatch.deliveries.length" class="text-steel-500">
          Cargando el despacho…
        </div>

        <!-- ── Board ────────────────────────────────────────────────────────── -->
        <div
          v-else
          class="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-5 xl:grid-cols-[15rem_minmax(0,1fr)_22rem]"
        >
          <!-- LEFT RAIL — stats + filters -->
          <aside
            class="flex-col gap-5 lg:max-xl:col-span-full"
            :class="showFilters ? 'flex' : 'hidden xl:flex'"
          >
            <div class="grid grid-cols-2 gap-2">
              <div class="card px-3 py-2.5">
                <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">En ruta</p>
                <p class="mt-0.5 font-display text-2xl font-bold text-info-600">{{ stats.enRoute }}</p>
              </div>
              <div class="card px-3 py-2.5">
                <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Pendientes</p>
                <p class="mt-0.5 font-display text-2xl font-bold text-warn-600">{{ stats.pending }}</p>
              </div>
              <div class="card px-3 py-2.5">
                <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Entregados</p>
                <p class="mt-0.5 font-display text-2xl font-bold text-success-600">{{ stats.delivered }}</p>
              </div>
              <div class="card px-3 py-2.5">
                <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Total hoy</p>
                <p class="mt-0.5 font-display text-2xl font-bold text-ink">{{ stats.total }}</p>
              </div>
            </div>

            <!-- Estado -->
            <section>
              <h3 class="eyebrow">Por estado</h3>
              <div v-if="area === 'deliveries'" class="mt-2 flex flex-col gap-0.5">
                <button
                  type="button"
                  class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-sunken"
                  :class="deliveryStatusSel.size === 0 ? 'bg-sunken font-medium text-ink' : 'text-muted'"
                  @click="deliveryStatusSel.clear()"
                >
                  <span class="h-2 w-2 rounded-full bg-steel-300" />
                  Todos
                </button>
                <button
                  v-for="(meta, key) in DELIVERY_STATUS"
                  :key="key"
                  type="button"
                  class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-sunken"
                  :class="deliveryStatusSel.has(key) ? 'bg-sunken font-medium text-ink' : 'text-muted'"
                  @click="toggleIn(deliveryStatusSel, key)"
                >
                  <span class="h-2 w-2 rounded-full" :class="meta.dot" />
                  {{ meta.label }}
                  <i v-if="deliveryStatusSel.has(key)" class="pi pi-check ml-auto text-[10px] text-steel-400" />
                </button>
              </div>
              <div v-else class="mt-2 flex flex-col gap-0.5">
                <button
                  type="button"
                  class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-sunken"
                  :class="runStatusSel.size === 0 ? 'bg-sunken font-medium text-ink' : 'text-muted'"
                  @click="runStatusSel.clear()"
                >
                  <span class="h-2 w-2 rounded-full bg-steel-300" />
                  Todos
                </button>
                <button
                  v-for="(meta, key) in RUN_STATUS"
                  :key="key"
                  type="button"
                  class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-sunken"
                  :class="runStatusSel.has(key) ? 'bg-sunken font-medium text-ink' : 'text-muted'"
                  @click="toggleIn(runStatusSel, key)"
                >
                  <span class="h-2 w-2 rounded-full" :class="meta.dot" />
                  {{ meta.label }}
                  <i v-if="runStatusSel.has(key)" class="pi pi-check ml-auto text-[10px] text-steel-400" />
                </button>
              </div>
            </section>

            <!-- Ruta -->
            <section>
              <h3 class="eyebrow">Por ruta</h3>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  class="rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wide transition"
                  :class="
                    routeSel.size === 0
                      ? 'border-graphite-900 bg-graphite-900 text-paper'
                      : 'border-line bg-paper text-muted hover:border-steel-400'
                  "
                  @click="routeSel.clear()"
                >
                  Todas
                </button>
                <button
                  v-for="r in delivery.activeRoutes"
                  :key="r.id"
                  type="button"
                  class="rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wide transition"
                  :class="
                    routeSel.has(r.id)
                      ? 'border-graphite-900 bg-graphite-900 text-paper'
                      : 'border-line bg-paper text-muted hover:border-steel-400'
                  "
                  @click="toggleIn(routeSel, r.id)"
                >
                  {{ r.name.replace('Anillo ', '') }}
                </button>
              </div>
            </section>

            <!-- Conductor -->
            <section>
              <h3 class="eyebrow">Por conductor</h3>
              <Select
                v-model="driverFilter"
                :options="driverFilterOptions"
                option-label="label"
                option-value="value"
                size="small"
                class="mt-2 w-full"
              />
            </section>

            <!-- Buscar -->
            <section>
              <h3 class="eyebrow">Buscar dirección</h3>
              <div class="relative mt-2">
                <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-xs text-steel-400" />
                <input
                  v-model="query"
                  type="search"
                  placeholder="Dirección, barrio o pedido…"
                  class="w-full rounded-lg border border-line bg-paper py-2 pl-8 pr-3 text-sm text-ink placeholder:text-steel-400"
                />
              </div>
            </section>
          </aside>

          <!-- CENTER — main list -->
          <section class="min-w-0" :class="mobileDetailOpen ? 'max-lg:hidden' : ''">
            <div class="mb-3 flex items-center justify-between gap-2">
              <p class="font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500">
                <template v-if="area === 'deliveries'">{{ filteredDeliveries.length }} domicilios</template>
                <template v-else>{{ filteredRuns.length }} despachos</template>
              </p>
              <Button
                v-if="area === 'deliveries' && canManage"
                label="Nuevo domicilio"
                size="small"
                icon="pi pi-plus"
                @click="openNewDelivery"
              />
              <Button
                v-else-if="area === 'runs' && canManage"
                label="Nuevo despacho"
                size="small"
                icon="pi pi-plus"
                @click="openNewRun()"
              />
            </div>

            <!-- Domicilios -->
            <template v-if="area === 'deliveries'">
              <div
                v-if="!filteredDeliveries.length"
                class="rounded-xl border border-dashed border-line bg-paper/60 p-10 text-center"
              >
                <i class="pi pi-inbox text-2xl text-steel-300" />
                <p class="mt-2 text-sm text-steel-500">No hay domicilios para estos filtros.</p>
              </div>
              <ul v-else class="flex flex-col gap-2">
                <li v-for="(d, i) in filteredDeliveries" :key="d.id">
                  <button
                    type="button"
                    class="card animate-docket w-full px-4 py-3 text-left transition hover:border-steel-400"
                    :class="[
                      selectedDeliveryId === d.id ? 'border-ember ring-1 ring-ember/40' : '',
                      d.delivery_status === 'pending' ? 'border-l-[3px] border-l-ember' : '',
                      !OPEN_DELIVERY.has(d.delivery_status) ? 'opacity-70' : '',
                      heatClass(d),
                    ]"
                    :style="{ animationDelay: `${Math.min(i, 10) * 35}ms` }"
                    @click="selectedDeliveryId = d.id"
                  >
                    <span class="flex items-start justify-between gap-3">
                      <span class="min-w-0">
                        <span class="block truncate text-sm font-medium text-ink">
                          {{ d.address_text }}<template v-if="d.neighborhood">, {{ d.neighborhood }}</template>
                        </span>
                        <span class="mt-0.5 block truncate font-mono text-[11px] text-steel-500">
                          {{ orderLabel(d.order_id) }} · {{ routeName(d.delivery_route_id) }}
                        </span>
                      </span>
                      <span class="pill shrink-0" :class="deliveryStatusMeta(d.delivery_status).pill">
                        {{ deliveryStatusMeta(d.delivery_status).label }}
                      </span>
                    </span>
                    <span class="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                      <template v-if="deliveryDriverName(d)">
                        <i class="pi pi-user text-[10px] text-steel-400" />
                        {{ deliveryDriverName(d) }}
                        <span class="text-steel-300">·</span>
                      </template>
                      <span class="font-mono text-[11px]">{{ agoLabel(d.created_at) }}</span>
                      <i
                        v-if="hasLocation(d)"
                        class="pi pi-map-marker ml-auto text-[10px] text-steel-400"
                        title="Con ubicación en el mapa"
                      />
                    </span>
                  </button>
                </li>
              </ul>
            </template>

            <!-- Despachos -->
            <template v-else>
              <div
                v-if="!filteredRuns.length"
                class="rounded-xl border border-dashed border-line bg-paper/60 p-10 text-center"
              >
                <i class="pi pi-send text-2xl text-steel-300" />
                <p class="mt-2 text-sm text-steel-500">No hay despachos activos hoy.</p>
              </div>
              <ul v-else class="flex flex-col gap-2">
                <li v-for="(r, i) in filteredRuns" :key="r.id">
                  <button
                    type="button"
                    class="card animate-docket w-full px-4 py-3 text-left transition hover:border-steel-400"
                    :class="[
                      selectedRunId === r.id ? 'border-ember ring-1 ring-ember/40' : '',
                      r.status === 'finished' ? 'opacity-70' : '',
                    ]"
                    :style="{ animationDelay: `${Math.min(i, 10) * 35}ms` }"
                    @click="selectedRunId = r.id"
                  >
                    <span class="flex items-start justify-between gap-3">
                      <span class="flex min-w-0 items-center gap-2.5">
                        <span
                          class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-graphite-900 font-mono text-[11px] font-semibold text-paper"
                        >
                          {{ driverInitials(employeeName(r.employee_id)) }}
                        </span>
                        <span class="min-w-0">
                          <span class="block truncate font-display text-sm font-semibold text-ink">
                            {{ employeeName(r.employee_id) }}
                          </span>
                          <span class="block truncate font-mono text-[11px] text-steel-500">
                            {{ routeName(r.delivery_route_id) }} · {{ stopsOf(r.id).length }} domicilios · {{ runTimeLabel(r) }}
                          </span>
                        </span>
                      </span>
                      <span class="pill shrink-0" :class="runStatusMeta(r.status).pill">
                        {{ runStatusMeta(r.status).label }}
                      </span>
                    </span>
                    <!-- Signature: the stop strip — one segment per domicilio, colored by state. -->
                    <span class="mt-2.5 flex items-center gap-2">
                      <span v-if="stopsOf(r.id).length" class="flex h-1.5 flex-1 gap-1">
                        <span
                          v-for="d in stopsOf(r.id)"
                          :key="d.id"
                          class="flex-1 rounded-full"
                          :class="stopSegmentClass(d)"
                        />
                      </span>
                      <span v-else class="h-1.5 flex-1 rounded-full bg-sunken" />
                      <span class="shrink-0 font-mono text-[10px] text-steel-500">
                        {{ dispatch.runProgress(r.id).delivered }} de {{ dispatch.runProgress(r.id).total }}
                      </span>
                    </span>
                  </button>
                </li>
              </ul>
            </template>
          </section>

          <!-- RIGHT — detail -->
          <aside class="min-w-0" :class="mobileDetailOpen ? '' : 'max-lg:hidden'">
            <!-- Domicilio detail -->
            <div v-if="area === 'deliveries' && selectedDelivery" class="card p-4 sm:p-5">
              <button
                type="button"
                class="mb-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-steel-500 transition hover:text-ink lg:hidden"
                @click="closeDetail"
              >
                <i class="pi pi-angle-left" /> Volver
              </button>

              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h2 class="font-display text-lg font-bold leading-snug text-ink">
                    {{ selectedDelivery.address_text }}
                  </h2>
                  <p class="font-mono text-[11px] text-steel-500">#{{ selectedDelivery.id.slice(0, 8) }}</p>
                </div>
                <span class="pill shrink-0" :class="deliveryStatusMeta(selectedDelivery.delivery_status).pill">
                  {{ deliveryStatusMeta(selectedDelivery.delivery_status).label }}
                </span>
              </div>

              <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Barrio</dt>
                  <dd class="mt-0.5 text-sm text-ink">{{ selectedDelivery.neighborhood ?? '—' }}</dd>
                </div>
                <div>
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Pedido</dt>
                  <dd class="mt-0.5 text-sm text-ink">{{ orderLabel(selectedDelivery.order_id) }}</dd>
                </div>
                <div>
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Ruta</dt>
                  <dd class="mt-0.5 text-sm text-ink">{{ routeName(selectedDelivery.delivery_route_id) }}</dd>
                </div>
                <div>
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Conductor</dt>
                  <dd class="mt-0.5 text-sm text-ink">{{ deliveryDriverName(selectedDelivery) ?? 'Sin conductor' }}</dd>
                </div>
                <div>
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Recibido</dt>
                  <dd class="mt-0.5 font-mono text-sm text-ink">{{ fmtTime(selectedDelivery.created_at) }}</dd>
                </div>
                <div>
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Transcurrido</dt>
                  <dd class="mt-0.5 font-mono text-sm text-ink">
                    {{ agoLabel(selectedDelivery.created_at).replace('hace ', '') }}
                  </dd>
                </div>
                <div class="col-span-2">
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Ubicación</dt>
                  <dd class="mt-0.5 flex items-center gap-2 text-sm">
                    <template v-if="hasLocation(selectedDelivery)">
                      <i class="pi pi-map-marker text-xs text-steel-400" />
                      <span class="text-ink">En el mapa</span>
                    </template>
                    <span v-else class="text-steel-500">Sin ubicación</span>
                    <button
                      v-if="canManage"
                      type="button"
                      class="font-mono text-[11px] uppercase tracking-wide text-ember-600 underline-offset-2 hover:underline"
                      @click="openLocationEditor"
                    >
                      {{ hasLocation(selectedDelivery) ? 'Corregir' : 'Agregar' }}
                    </button>
                  </dd>
                </div>
              </dl>

              <!-- Lifecycle timeline -->
              <h3 class="mt-5 eyebrow">Ciclo de entrega</h3>
              <ol class="mt-2.5 flex flex-col gap-2.5">
                <li
                  v-for="step in timelineOf(selectedDelivery)"
                  :key="step.label"
                  class="flex items-center gap-3"
                >
                  <span
                    class="h-3 w-3 shrink-0 rounded-full border-2"
                    :class="{
                      'border-success bg-success': step.state === 'done',
                      'animate-pulse border-ember bg-ember': step.state === 'active',
                      'border-line bg-paper': step.state === 'pending',
                      'border-alert bg-alert': step.state === 'failed',
                    }"
                  />
                  <span
                    class="flex-1 text-sm"
                    :class="{
                      'text-ink': step.state === 'done',
                      'font-medium text-ember-600': step.state === 'active',
                      'text-steel-300': step.state === 'pending',
                      'text-alert': step.state === 'failed',
                    }"
                  >
                    {{ step.label }}
                  </span>
                  <span class="font-mono text-[11px] text-steel-500">{{ step.time ?? '—' }}</span>
                </li>
              </ol>

              <!-- Actions -->
              <div v-if="canAssign" class="mt-5 flex flex-col gap-2">
                <Button
                  v-if="selectedDelivery.delivery_status === 'pending'"
                  label="Asignar a despacho"
                  icon="pi pi-send"
                  size="small"
                  fluid
                  @click="openAssignPicker(selectedDelivery)"
                />
                <template v-else-if="selectedDelivery.delivery_status === 'assigned'">
                  <p class="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">
                    Sale con el despacho de {{ deliveryDriverName(selectedDelivery) ?? '—' }}.
                    <button
                      v-if="selectedDelivery.delivery_run_id"
                      type="button"
                      class="font-medium text-ember-600 underline-offset-2 hover:underline"
                      @click="goToRun(selectedDelivery.delivery_run_id)"
                    >
                      Ver despacho
                    </button>
                  </p>
                  <Button
                    label="Mover a otro despacho"
                    icon="pi pi-arrow-right-arrow-left"
                    size="small"
                    severity="secondary"
                    text
                    @click="openAssignPicker(selectedDelivery)"
                  />
                </template>
                <div v-else-if="selectedDelivery.delivery_status === 'in_transit'" class="flex flex-col gap-2">
                  <Button
                    label="Marcar entregado"
                    icon="pi pi-check"
                    size="small"
                    fluid
                    :loading="acting"
                    @click="markDelivered(selectedDelivery, true)"
                  />
                  <Button
                    label="No entregado"
                    icon="pi pi-times"
                    size="small"
                    severity="danger"
                    text
                    :loading="acting"
                    @click="markDelivered(selectedDelivery, false)"
                  />
                </div>
                <p v-if="actionError" role="alert" class="font-mono text-xs text-alert">{{ actionError }}</p>
              </div>

              <!-- Notes -->
              <template v-if="canManage">
                <h3 class="mt-5 eyebrow">Notas del domicilio</h3>
                <textarea
                  v-model="noteDraft"
                  rows="2"
                  maxlength="500"
                  placeholder="Instrucciones, observaciones…"
                  class="mt-2 w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-steel-400"
                />
                <div class="mt-1.5 flex items-center gap-2">
                  <Button
                    label="Guardar nota"
                    size="small"
                    severity="secondary"
                    outlined
                    :loading="noteSaving"
                    @click="saveNote"
                  />
                  <span v-if="noteSaved" class="font-mono text-[11px] text-success-600">Nota guardada</span>
                </div>
              </template>
              <p v-else-if="selectedDelivery.notes" class="mt-5 rounded-lg bg-sunken px-3 py-2 text-xs text-muted">
                {{ selectedDelivery.notes }}
              </p>
            </div>

            <!-- Despacho detail -->
            <div v-else-if="area === 'runs' && selectedRun" class="card p-4 sm:p-5">
              <button
                type="button"
                class="mb-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-steel-500 transition hover:text-ink lg:hidden"
                @click="closeDetail"
              >
                <i class="pi pi-angle-left" /> Volver
              </button>

              <div class="flex items-start justify-between gap-3">
                <div class="flex min-w-0 items-center gap-3">
                  <span
                    class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-graphite-900 font-mono text-xs font-semibold text-paper"
                  >
                    {{ driverInitials(employeeName(selectedRun.employee_id)) }}
                  </span>
                  <div class="min-w-0">
                    <h2 class="truncate font-display text-lg font-bold text-ink">
                      {{ employeeName(selectedRun.employee_id) }}
                    </h2>
                    <p class="font-mono text-[11px] text-steel-500">
                      {{ routeName(selectedRun.delivery_route_id) }} · {{ runTimeLabel(selectedRun) }}
                    </p>
                  </div>
                </div>
                <span class="pill shrink-0" :class="runStatusMeta(selectedRun.status).pill">
                  {{ runStatusMeta(selectedRun.status).label }}
                </span>
              </div>

              <!-- Primary lifecycle action -->
              <div v-if="canAssign" class="mt-4">
                <Button
                  v-if="selectedRun.status === 'preparing'"
                  label="Dar salida"
                  icon="pi pi-send"
                  fluid
                  :loading="acting"
                  @click="departRun(selectedRun)"
                />
                <template v-else-if="selectedRun.status === 'in_transit'">
                  <Button
                    label="Finalizar despacho"
                    icon="pi pi-flag"
                    severity="success"
                    fluid
                    :loading="acting"
                    :disabled="!canFinishRun(selectedRun)"
                    @click="finishRun(selectedRun)"
                  />
                  <p v-if="!canFinishRun(selectedRun)" class="mt-1.5 text-xs text-muted">
                    Para finalizar, cada domicilio debe quedar entregado o no entregado.
                  </p>
                </template>
                <p v-else class="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">
                  Despacho finalizado a las {{ fmtTime(selectedRun.finished_at) }} ·
                  {{ dispatch.runProgress(selectedRun.id).delivered }} de
                  {{ dispatch.runProgress(selectedRun.id).total }} entregados.
                </p>
                <p v-if="actionError" role="alert" class="mt-2 font-mono text-xs text-alert">{{ actionError }}</p>
              </div>

              <!-- Stops -->
              <div class="mt-5 flex items-center justify-between gap-2">
                <h3 class="eyebrow">Domicilios del despacho</h3>
                <span class="font-mono text-[10px] text-steel-500">
                  {{ dispatch.runProgress(selectedRun.id).delivered }} de
                  {{ dispatch.runProgress(selectedRun.id).total }} entregados
                </span>
              </div>
              <div v-if="stopsOf(selectedRun.id).length" class="mt-2 flex h-1.5 gap-1">
                <span
                  v-for="d in stopsOf(selectedRun.id)"
                  :key="d.id"
                  class="flex-1 rounded-full"
                  :class="stopSegmentClass(d)"
                />
              </div>
              <p v-if="!stopsOf(selectedRun.id).length" class="mt-2 text-sm text-steel-500">
                Sin domicilios asignados.
              </p>
              <ul v-else class="mt-2.5 divide-y divide-hairline overflow-hidden rounded-lg border border-line bg-app">
                <li v-for="(d, i) in stopsOf(selectedRun.id)" :key="d.id">
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-sunken"
                    @click="goToDelivery(d.id)"
                  >
                    <span
                      class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-paper font-mono text-[11px] text-steel-600 ring-1 ring-line"
                    >
                      {{ i + 1 }}
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium text-ink">
                        {{ d.address_text }}<template v-if="d.neighborhood">, {{ d.neighborhood }}</template>
                      </span>
                      <span class="block font-mono text-[10px] text-steel-500">{{ orderLabel(d.order_id) }}</span>
                    </span>
                    <span class="pill shrink-0" :class="deliveryStatusMeta(d.delivery_status).pill">
                      {{ deliveryStatusMeta(d.delivery_status).label }}
                    </span>
                  </button>
                </li>
              </ul>
              <button
                v-if="canAssign && selectedRun.status === 'preparing'"
                type="button"
                class="mt-2 w-full rounded-lg border border-dashed border-steel-300 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500 transition hover:border-ember hover:text-ember-600"
                @click="openAddToRun"
              >
                + Agregar domicilio al despacho
              </button>

              <!-- Driver -->
              <h3 class="mt-5 eyebrow">Conductor</h3>
              <div class="mt-2 flex items-center gap-3 rounded-lg border border-line bg-app px-3 py-2.5">
                <span
                  class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-graphite-900 font-mono text-[11px] font-semibold text-paper"
                >
                  {{ driverInitials(employeeName(selectedRun.employee_id)) }}
                </span>
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-ink">{{ employeeName(selectedRun.employee_id) }}</p>
                  <p v-if="employeeEmail(selectedRun.employee_id)" class="truncate font-mono text-[11px] text-steel-500">
                    {{ employeeEmail(selectedRun.employee_id) }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Empty detail -->
            <div v-else class="card grid min-h-52 place-items-center p-6 text-center">
              <div>
                <i class="pi pi-inbox text-2xl text-steel-300" />
                <p class="mt-2 text-sm text-steel-500">
                  {{ area === 'deliveries' ? 'Elige un domicilio para ver su detalle.' : 'Elige un despacho para ver su detalle.' }}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>

    <!-- ── Asignar a despacho ───────────────────────────────────────────────── -->
    <Dialog
      :visible="assignTarget !== null"
      modal
      header="Asignar a despacho"
      :style="{ width: '26rem' }"
      :breakpoints="{ '480px': '94vw' }"
      @update:visible="assignTarget = null"
    >
      <div class="flex flex-col gap-3 pt-1">
        <p class="text-sm text-muted">
          {{ assignTarget?.address_text }} sale con el despacho que elijas (en preparación).
        </p>
        <p v-if="!assignCandidateRuns.length" class="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">
          No hay despachos en preparación.
        </p>
        <ul v-else class="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          <li v-for="r in assignCandidateRuns" :key="r.id">
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition"
              :class="assignRunId === r.id ? 'border-ember bg-ember-50' : 'border-line bg-paper hover:border-steel-400'"
              @click="assignRunId = r.id"
            >
              <span
                class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-graphite-900 font-mono text-[11px] font-semibold text-paper"
              >
                {{ driverInitials(employeeName(r.employee_id)) }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-ink">{{ employeeName(r.employee_id) }}</span>
                <span class="block font-mono text-[10px] text-steel-500">
                  {{ routeName(r.delivery_route_id) }} · {{ stopsOf(r.id).length }} domicilios
                </span>
              </span>
              <i v-if="assignRunId === r.id" class="pi pi-check text-sm text-ember-600" />
            </button>
          </li>
        </ul>
        <button
          v-if="canManage"
          type="button"
          class="w-full rounded-lg border border-dashed border-steel-300 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500 transition hover:border-ember hover:text-ember-600"
          @click="createRunForDelivery"
        >
          + Crear despacho nuevo con este domicilio
        </button>
        <p v-if="actionError" role="alert" class="font-mono text-xs text-alert">{{ actionError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text size="small" @click="assignTarget = null" />
        <Button label="Asignar" size="small" :disabled="!assignRunId" :loading="acting" @click="applyAssign" />
      </template>
    </Dialog>

    <!-- ── Nuevo despacho (2 pasos) ─────────────────────────────────────────── -->
    <Dialog
      v-model:visible="showNewRun"
      modal
      :header="runStep === 1 ? 'Nuevo despacho' : 'Asignar domicilios'"
      :style="{ width: '30rem' }"
      :breakpoints="{ '520px': '94vw' }"
    >
      <p class="font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500">Paso {{ runStep }} / 2</p>

      <!-- Paso 1: conductor -->
      <div v-if="runStep === 1" class="mt-3 flex flex-col gap-3">
        <div class="relative">
          <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-xs text-steel-400" />
          <input
            v-model="runDriverQuery"
            type="search"
            placeholder="Buscar conductor…"
            class="w-full rounded-lg border border-line bg-paper py-2 pl-8 pr-3 text-sm text-ink placeholder:text-steel-400"
          />
        </div>
        <p v-if="loadingDrivers" class="text-sm text-steel-500">Cargando conductores…</p>
        <p v-else-if="!runDriverRows.length" class="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">
          No hay conductores en las rutas activas. Asígnalos en Domicilios → Rutas.
        </p>
        <ul v-else class="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
          <li v-for="row in runDriverRows" :key="row.employeeId">
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2.5 text-left transition"
              :class="row.status === 'available' ? 'hover:border-ember/60' : 'cursor-not-allowed opacity-60'"
              :disabled="row.status !== 'available'"
              @click="pickRunDriver(row)"
            >
              <span
                class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-graphite-900 font-mono text-[11px] font-semibold text-paper"
              >
                {{ driverInitials(row.name) }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-ink">{{ row.name }}</span>
                <span class="block truncate font-mono text-[10px] text-steel-500">
                  {{ row.routeIds.map((id) => routeName(id)).join(' · ') }}
                </span>
              </span>
              <span class="pill shrink-0" :class="DRIVER_STATUS[row.status]?.pill ?? 'pill-neutral'">
                {{ DRIVER_STATUS[row.status]?.label ?? row.status }}
              </span>
            </button>
          </li>
        </ul>
      </div>

      <!-- Paso 2: domicilios -->
      <div v-else class="mt-3 flex flex-col gap-3">
        <button
          type="button"
          class="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-app px-3 py-1.5 text-sm text-ink transition hover:border-steel-400"
          @click="runStep = 1"
        >
          <span
            class="grid h-5 w-5 place-items-center rounded-full bg-graphite-900 font-mono text-[9px] font-semibold text-paper"
          >
            {{ driverInitials(runDriver?.name ?? '') }}
          </span>
          {{ runDriver?.name }}
          <i class="pi pi-times text-[10px] text-steel-400" />
        </button>

        <div class="flex flex-col gap-1.5">
          <label class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Ruta del despacho</label>
          <Select
            v-model="runRouteId"
            :options="runRouteOptions"
            option-label="label"
            option-value="value"
            size="small"
            fluid
          />
        </div>

        <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Domicilios sin asignar</p>
        <p v-if="!runCandidates.length" class="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">
          No hay domicilios sin asignar.
        </p>
        <ul v-else class="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
          <li v-for="d in runCandidates" :key="d.id">
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition"
              :class="runSelected.has(d.id) ? 'border-ember bg-ember-50' : 'border-line bg-paper hover:border-steel-400'"
              @click="toggleIn(runSelected, d.id)"
            >
              <i
                class="pi shrink-0 text-sm"
                :class="runSelected.has(d.id) ? 'pi-check-square text-ember-600' : 'pi-stop text-steel-300'"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-ink">
                  {{ d.address_text }}<template v-if="d.neighborhood">, {{ d.neighborhood }}</template>
                </span>
                <span class="block font-mono text-[10px] text-steel-500">{{ orderLabel(d.order_id) }}</span>
              </span>
            </button>
          </li>
        </ul>
        <p v-if="runFormError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ runFormError }}
        </p>
      </div>

      <template #footer>
        <div class="flex w-full items-center justify-between gap-2">
          <span v-if="runStep === 2" class="font-mono text-[11px] text-steel-500">
            {{ runSelected.size }} seleccionados
          </span>
          <span v-else />
          <div class="flex gap-2">
            <Button
              v-if="runStep === 2"
              label="Atrás"
              severity="secondary"
              text
              size="small"
              @click="runStep = 1"
            />
            <Button v-else label="Cancelar" severity="secondary" text size="small" @click="showNewRun = false" />
            <Button
              v-if="runStep === 2"
              label="Crear despacho"
              icon="pi pi-arrow-right"
              icon-pos="right"
              size="small"
              :disabled="runSelected.size === 0 || !runRouteId"
              :loading="creatingRun"
              @click="createRun"
            />
          </div>
        </div>
      </template>
    </Dialog>

    <!-- ── Nuevo domicilio ──────────────────────────────────────────────────── -->
    <Dialog
      v-model:visible="showNewDelivery"
      modal
      header="Nuevo domicilio"
      :style="{ width: '28rem' }"
      :breakpoints="{ '520px': '94vw' }"
    >
      <div class="flex flex-col gap-3 pt-1">
        <div class="flex flex-col gap-1.5">
          <label class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Pedido abierto *</label>
          <Select
            v-model="fOrderId"
            :options="openOrderOptions"
            option-label="label"
            option-value="value"
            placeholder="Elige un pedido"
            filter
            size="small"
            fluid
          />
          <p v-if="!openOrderOptions.length" class="font-mono text-[11px] text-steel-500">
            No hay pedidos abiertos sin domicilio.
          </p>
        </div>
        <div class="grid grid-cols-[2fr_1fr] gap-2">
          <div class="flex flex-col gap-1.5">
            <label for="nd-address" class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
              Dirección completa *
            </label>
            <input
              id="nd-address"
              v-model="fAddress"
              type="text"
              placeholder="Cra 7 # 12-34"
              class="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-steel-400"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="nd-hood" class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Barrio</label>
            <input
              id="nd-hood"
              v-model="fNeighborhood"
              type="text"
              placeholder="Centro"
              class="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-steel-400"
            />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="nd-notes" class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
            Notas adicionales
          </label>
          <textarea
            id="nd-notes"
            v-model="fNotes"
            rows="2"
            maxlength="500"
            placeholder="Instrucciones para el conductor…"
            class="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-steel-400"
          />
        </div>

        <!-- Ubicación (opcional): tap en el mapa o pegar una ubicación compartida -->
        <button
          type="button"
          class="inline-flex w-fit items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500 transition hover:text-ink"
          @click="fShowLocation = !fShowLocation"
        >
          <i class="pi text-[10px]" :class="fShowLocation ? 'pi-chevron-down' : 'pi-chevron-right'" />
          Ubicación en el mapa (opcional)
          <i v-if="fPoint" class="pi pi-map-marker text-[10px] text-ember-600" />
        </button>
        <div v-if="fShowLocation" class="flex flex-col gap-2">
          <input
            v-model="fPaste"
            type="text"
            placeholder="Pega una ubicación compartida (lat,lng o link de Google Maps)"
            class="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-steel-400"
          />
          <p v-if="fPasteError" class="text-xs text-warn-600">{{ fPasteError }}</p>
          <LocationPickerMap v-model="fPoint" :center="branchPin()" />
          <p v-if="fPoint" class="font-mono text-[11px] text-steel-500">
            {{ fPoint[0].toFixed(5) }}, {{ fPoint[1].toFixed(5) }} · toca el mapa para ajustar
          </p>
          <p v-else class="text-xs text-muted">Toca el punto de entrega en el mapa.</p>
        </div>

        <p v-if="deliveryFormError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ deliveryFormError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text size="small" @click="showNewDelivery = false" />
        <Button
          label="Guardar domicilio"
          size="small"
          :disabled="!canSaveDelivery"
          :loading="creatingDelivery"
          @click="createDelivery"
        />
      </template>
    </Dialog>

    <!-- ── Agregar domicilio al despacho ────────────────────────────────────── -->
    <Dialog
      v-model:visible="showAddToRun"
      modal
      header="Agregar domicilios"
      :style="{ width: '26rem' }"
      :breakpoints="{ '480px': '94vw' }"
    >
      <div class="flex flex-col gap-3 pt-1">
        <div class="relative">
          <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-xs text-steel-400" />
          <input
            v-model="addQuery"
            type="search"
            placeholder="Buscar dirección…"
            class="w-full rounded-lg border border-line bg-paper py-2 pl-8 pr-3 text-sm text-ink placeholder:text-steel-400"
          />
        </div>
        <p v-if="!addCandidates.length" class="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">
          No hay domicilios sin asignar.
        </p>
        <ul v-else class="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
          <li v-for="d in addCandidates" :key="d.id">
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition"
              :class="addSelected.has(d.id) ? 'border-ember bg-ember-50' : 'border-line bg-paper hover:border-steel-400'"
              @click="toggleIn(addSelected, d.id)"
            >
              <i
                class="pi shrink-0 text-sm"
                :class="addSelected.has(d.id) ? 'pi-check-square text-ember-600' : 'pi-stop text-steel-300'"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-ink">
                  {{ d.address_text }}<template v-if="d.neighborhood">, {{ d.neighborhood }}</template>
                </span>
                <span class="block font-mono text-[10px] text-steel-500">{{ orderLabel(d.order_id) }}</span>
              </span>
            </button>
          </li>
        </ul>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text size="small" @click="showAddToRun = false" />
        <Button
          :label="`Agregar (${addSelected.size})`"
          size="small"
          :disabled="addSelected.size === 0"
          :loading="addingToRun"
          @click="addToRun"
        />
      </template>
    </Dialog>

    <!-- ── Ubicación del domicilio (agregar / corregir) ─────────────────────── -->
    <Dialog
      v-model:visible="locOpen"
      modal
      header="Ubicación del domicilio"
      :style="{ width: '28rem' }"
      :breakpoints="{ '520px': '94vw' }"
      @show="locPicker?.invalidate()"
    >
      <div class="flex flex-col gap-2 pt-1">
        <input
          v-model="locPaste"
          type="text"
          placeholder="Pega una ubicación compartida (lat,lng o link de Google Maps)"
          class="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-steel-400"
        />
        <p v-if="locPasteError" class="text-xs text-warn-600">{{ locPasteError }}</p>
        <LocationPickerMap ref="locPicker" v-model="locPoint" :center="branchPin()" />
        <p v-if="locPoint" class="font-mono text-[11px] text-steel-500">
          {{ locPoint[0].toFixed(5) }}, {{ locPoint[1].toFixed(5) }} · toca el mapa para ajustar
        </p>
        <p v-else class="text-xs text-muted">Toca el punto de entrega en el mapa.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text size="small" @click="locOpen = false" />
        <Button
          label="Guardar ubicación"
          size="small"
          :disabled="!locPoint"
          :loading="locSaving"
          @click="saveLocation"
        />
      </template>
    </Dialog>
  </AppShell>
</template>
