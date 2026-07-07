<script setup lang="ts">
// Turnos — the weekly line-up board, wired to real data (Phase 1: Calendario).
// The backend materializes every shift as a row; a cell is the shift for
// (employee, date) or none. Coverage is a separate `covered` row referencing the
// absentee. Signature preserved from the prototype: the "sin cubrir" heat lamp —
// a short-staffed day borrows the pass's heat-warm glow. Colour/operational role
// are out of scope; employee identity is name + a stable derived accent.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import AppShell from '@/components/AppShell.vue'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useStaffStore } from '@/stores/staff'
import { useShiftsStore } from '@/stores/shifts'
import { statusOf as httpStatusOf } from '@/lib/apiError'
import type {
  Employee,
  PlannedShift,
  RequestStatus,
  ShiftTemplate,
  TimeOffRequest,
} from '@/services/staff.api'

const auth = useAuthStore()
const branch = useBranchStore()
const staff = useStaffStore()
const shifts = useShiftsStore()

const canManage = computed(() => auth.can('staff.manage'))

// ── Date helpers (iso yyyy-mm-dd ↔ Date) ─────────────────────────────────────────
const DOW_SHORT = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const DOW_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}
function dateToIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
function addDaysIso(iso: string, n: number): string {
  const d = isoToDate(iso)
  d.setDate(d.getDate() + n)
  return dateToIso(d)
}
function startOfWeekMonIso(iso: string): string {
  const d = isoToDate(iso)
  const dow = d.getDay()
  const delta = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + delta)
  return dateToIso(d)
}
function hm(t: string): string {
  return t.slice(0, 5) // "08:00:00" → "08:00"
}
function toMin(t: string): number {
  const [h = 0, m = 0] = t.split(':').map(Number)
  return h * 60 + m
}
function durLabel(s: string, e: string): string {
  const d = (toMin(e) - toMin(s)) / 60
  return Number.isInteger(d) ? `${d}h` : `${d.toFixed(1)}h`
}

const todayIso = dateToIso(new Date())

// ── Identity (name resolved; colour derived, purely cosmetic) ────────────────────
const PALETTE = ['#3B82F6', '#8B5CF6', '#10B981', '#EF4444', '#F2933B', '#EC4899', '#0EA5E9', '#14B8A6']
function colorFor(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]!
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '—'
}

interface Row {
  emp: Employee
  name: string
  initials: string
  color: string
}
const roster = computed<Row[]>(() =>
  staff.employees
    .filter((e) => e.is_active)
    .map((e) => {
      const name = staff.employeeName(e)
      return { emp: e, name, initials: initials(name), color: colorFor(e.id) }
    }),
)
function nameOf(employeeId: string | null): string {
  if (!employeeId) return '—'
  const e = staff.employees.find((x) => x.id === employeeId)
  return e ? staff.employeeName(e) : '—'
}
function firstName(employeeId: string | null): string {
  return nameOf(employeeId).split(/\s+/)[0] ?? '—'
}

// ── Week state ───────────────────────────────────────────────────────────────────
const weekStart = ref(startOfWeekMonIso(todayIso))
const isThisWeek = computed(() => weekStart.value === startOfWeekMonIso(todayIso))
const columns = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const iso = addDaysIso(weekStart.value, i)
    const d = isoToDate(iso)
    return {
      iso,
      dow: DOW_SHORT[d.getDay()],
      num: d.getDate(),
      isToday: iso === todayIso,
      cov: shifts.coverageFor(iso),
    }
  }),
)
const rangeLabel = computed(() => {
  const a = isoToDate(weekStart.value)
  const b = isoToDate(addDaysIso(weekStart.value, 6))
  const ma = MONTHS[a.getMonth()]
  const mb = MONTHS[b.getMonth()]
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${ma} ${b.getFullYear()}`
  return `${a.getDate()} ${ma} – ${b.getDate()} ${mb} ${b.getFullYear()}`
})

// ── Load ─────────────────────────────────────────────────────────────────────────
const error = ref<string | null>(null)
async function load() {
  error.value = null
  try {
    await branch.ensureLoaded()
    const branchId = branch.activeBranchId
    if (!branchId) return
    await Promise.all([
      staff.ensureLoaded({ branchId, active: true }),
      shifts.loadWeek(branchId, weekStart.value),
      shifts.loadRequests(),
    ])
  } catch {
    error.value = 'No se pudieron cargar los turnos.'
  }
}
onMounted(load)
watch(() => branch.activeBranchId, () => {
  closePopover()
  void load()
})
watch(weekStart, (w) => {
  closePopover()
  if (branch.activeBranchId) void shifts.loadWeek(branch.activeBranchId, w)
})

function shiftWeek(n: number) {
  weekStart.value = addDaysIso(weekStart.value, n * 7)
}
function goThisWeek() {
  weekStart.value = startOfWeekMonIso(todayIso)
}

// ── View tabs + employee filter ──────────────────────────────────────────────────
type View = 'calendario' | 'plantillas' | 'solicitudes'
const view = ref<View>('calendario')
const TABS: { key: View; label: string; icon: string }[] = [
  { key: 'calendario', label: 'Calendario', icon: 'pi-calendar' },
  { key: 'plantillas', label: 'Plantillas', icon: 'pi-users' },
  { key: 'solicitudes', label: 'Solicitudes', icon: 'pi-inbox' },
]

const selectedEmp = ref<Set<string>>(new Set())
watch(roster, (r) => {
  if (selectedEmp.value.size === 0 && r.length) {
    selectedEmp.value = new Set(r.map((row) => row.emp.id))
  }
})
function toggleEmp(id: string) {
  const s = new Set(selectedEmp.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedEmp.value = s
}
function allEmps() {
  selectedEmp.value = new Set(roster.value.map((r) => r.emp.id))
}
const displayRoster = computed(() =>
  roster.value.filter((r) => selectedEmp.value.has(r.emp.id)),
)

// ── Cell resolution (from the materialized shift row) ────────────────────────────
type CellKind = 'off' | 'working' | 'special' | 'covering' | 'libre'
interface Cell {
  kind: CellKind
  row: Row
  dateIso: string
  isToday: boolean
  shift: PlannedShift | null
  coveredByName?: string // libre: who covers, if anyone
  coversForName?: string // covering: whose slot this fills
}
function resolveCell(row: Row, iso: string, isToday: boolean): Cell {
  const s = shifts.shiftFor(row.emp.id, iso)
  if (!s) return { kind: 'off', row, dateIso: iso, isToday, shift: null }
  if (s.status === 'covered') {
    return {
      kind: 'covering', row, dateIso: iso, isToday, shift: s,
      coversForName: firstName(s.covered_by_employee_id),
    }
  }
  if (s.status === 'day_off') {
    const cover = shifts.shifts.find(
      (x) => x.status === 'covered' && x.covered_by_employee_id === row.emp.id && x.shift_date === iso,
    )
    return {
      kind: 'libre', row, dateIso: iso, isToday, shift: s,
      coveredByName: cover ? firstName(cover.employee_id) : undefined,
    }
  }
  if (s.status === 'manual') return { kind: 'special', row, dateIso: iso, isToday, shift: s }
  return { kind: 'working', row, dateIso: iso, isToday, shift: s }
}
const grid = computed(() =>
  displayRoster.value.map((row) => ({
    row,
    cells: columns.value.map((c) => resolveCell(row, c.iso, c.isToday)),
  })),
)

// ── Stats ────────────────────────────────────────────────────────────────────────
const weekStats = computed(() => {
  let turnos = 0
  let minutes = 0
  for (const s of shifts.shifts) {
    if (s.status !== 'day_off') {
      turnos++
      minutes += toMin(s.end_time) - toMin(s.start_time)
    }
  }
  const uncovered = columns.value.reduce((sum, c) => sum + c.cov.uncovered, 0)
  return {
    turnos,
    horas: Math.round(minutes / 60),
    sinCubrir: uncovered,
    solicitudes: shifts.pendingRequestCount,
  }
})

// Horizon warning: does the visible week reach the last generated day?
const horizonWarning = computed(() => {
  const end = shifts.horizonEnd
  if (!end) return false
  return addDaysIso(weekStart.value, 6) >= end
})

// ── Popover ──────────────────────────────────────────────────────────────────────
interface PopState {
  cell: Cell
  x: number
  top: string
  bottom: string
}
const popover = ref<PopState | null>(null)
function openPopover(cell: Cell, ev: MouseEvent) {
  if (cell.kind === 'off' || !canManage.value) return
  const el = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  const width = 256
  const vw = window.innerWidth
  const above = window.innerHeight - el.bottom < 240 && el.top > 240
  popover.value = {
    cell,
    x: Math.min(Math.max(el.left, 12), vw - width - 12),
    top: above ? '' : `${el.bottom + 8}px`,
    bottom: above ? `${window.innerHeight - el.top + 8}px` : '',
  }
}
function closePopover() {
  popover.value = null
}

// ── Mutations (dialogs) ──────────────────────────────────────────────────────────
const busy = ref(false)
async function run(fn: () => Promise<void>) {
  busy.value = true
  error.value = null
  try {
    await fn()
  } catch (e) {
    error.value =
      httpStatusOf(e) === 409
        ? 'Conflicto: ya existe un turno o el empleado no está disponible.'
        : 'No se pudo completar la acción.'
  } finally {
    busy.value = false
  }
}

// Dar día libre
const dayOffCell = ref<Cell | null>(null)
const dayOffReason = ref('Descanso')
const dayOffAutoCover = ref(true)
const dayOffCovers = ref<Employee[]>([])
const MOTIVOS = ['Descanso', 'Cita médica', 'Permiso personal', 'Vacaciones', 'Otro'].map((m) => ({ label: m, value: m }))
async function startDayOff(cell: Cell) {
  closePopover()
  dayOffCell.value = cell
  dayOffReason.value = 'Descanso'
  dayOffAutoCover.value = true
  dayOffCovers.value = await shifts.availableCovers(cell.dateIso)
}
async function applyDayOff() {
  const cell = dayOffCell.value
  if (!cell?.shift) return
  const cover = dayOffAutoCover.value ? (dayOffCovers.value[0]?.id ?? null) : null
  await run(() => shifts.markDayOff(cell.shift!.id, dayOffReason.value, cover))
  dayOffCell.value = null
}

// Asignar cobertura (on an uncovered libre)
const coverCell = ref<Cell | null>(null)
const coverList = ref<Employee[]>([])
async function startCover(cell: Cell) {
  closePopover()
  coverCell.value = cell
  coverList.value = await shifts.availableCovers(cell.dateIso)
}
async function assignCover(coverId: string) {
  const cell = coverCell.value
  if (!cell?.shift) return
  await run(() => shifts.assignCoverage(cell.shift!.id, coverId))
  coverCell.value = null
}

// Editar horario
const editCell = ref<Cell | null>(null)
const editStart = ref('08:00')
const editEnd = ref('17:00')
function startEdit(cell: Cell) {
  closePopover()
  if (!cell.shift) return
  editCell.value = cell
  editStart.value = hm(cell.shift.start_time)
  editEnd.value = hm(cell.shift.end_time)
}
async function applyEdit() {
  const cell = editCell.value
  if (!cell?.shift) return
  await run(() => shifts.editHours(cell.shift!.id, editStart.value, editEnd.value))
  editCell.value = null
}

// Quitar turno
async function removeShift(cell: Cell) {
  closePopover()
  if (!cell.shift) return
  await run(() => shifts.removeShift(cell.shift!.id))
}

// Asignar turno manual
const manualOpen = ref(false)
const manualEmp = ref('')
const manualDate = ref(todayIso)
const manualStart = ref('08:00')
const manualEnd = ref('17:00')
const manualNote = ref('')
const empOptions = computed(() => roster.value.map((r) => ({ label: r.name, value: r.emp.id })))
function openManual() {
  manualEmp.value = displayRoster.value[0]?.emp.id ?? roster.value[0]?.emp.id ?? ''
  manualDate.value = todayIso
  manualStart.value = '08:00'
  manualEnd.value = '17:00'
  manualNote.value = ''
  manualOpen.value = true
}
async function applyManual() {
  if (!manualEmp.value) return
  await run(() =>
    shifts.createManual(manualEmp.value, {
      shift_date: manualDate.value,
      start_time: manualStart.value,
      end_time: manualEnd.value,
      note: manualNote.value || 'Turno manual',
    }),
  )
  manualOpen.value = false
}

function longDate(iso: string): string {
  const d = isoToDate(iso)
  return `${DOW_LONG[d.getDay()]} ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`
}

// ── Plantillas editor (Phase 3) ──────────────────────────────────────────────────
// Weekday pills in human order (Mon→Sun) mapped to the 0=Sun..6=Sat encoding.
const DAY_PILLS = [
  { label: 'L', dow: 1 }, { label: 'M', dow: 2 }, { label: 'X', dow: 3 },
  { label: 'J', dow: 4 }, { label: 'V', dow: 5 }, { label: 'S', dow: 6 }, { label: 'D', dow: 0 },
]
function templateFor(empId: string): ShiftTemplate | undefined {
  return shifts.templates.find((t) => t.employee_id === empId)
}
const tplEmpId = ref<string | null>(null)
const tplWeekdays = ref<Set<number>>(new Set())
const tplStart = ref('08:00')
const tplEnd = ref('17:00')
const tplValidFrom = ref(todayIso)
const tplIndefinido = ref(true)
const tplValidUntil = ref('')

const selectedTemplate = computed(() =>
  tplEmpId.value ? templateFor(tplEmpId.value) : undefined,
)
const selectedTplRow = computed(() =>
  roster.value.find((r) => r.emp.id === tplEmpId.value) ?? null,
)
const tplDurationValid = computed(() => tplEnd.value > tplStart.value)
const tplCanSave = computed(
  () =>
    canManage.value &&
    tplEmpId.value !== null &&
    tplWeekdays.value.size > 0 &&
    tplDurationValid.value &&
    (tplIndefinido.value || !!tplValidUntil.value),
)

function selectTplEmp(empId: string) {
  tplEmpId.value = empId
  const t = templateFor(empId)
  if (t) {
    tplWeekdays.value = new Set(t.weekdays)
    tplStart.value = hm(t.start_time)
    tplEnd.value = hm(t.end_time)
    tplValidFrom.value = t.valid_from
    tplIndefinido.value = !t.valid_until
    tplValidUntil.value = t.valid_until ?? ''
  } else {
    tplWeekdays.value = new Set([1, 2, 3, 4, 5])
    tplStart.value = '08:00'
    tplEnd.value = '17:00'
    tplValidFrom.value = todayIso
    tplIndefinido.value = true
    tplValidUntil.value = ''
  }
}
function toggleDay(dow: number) {
  const s = new Set(tplWeekdays.value)
  if (s.has(dow)) s.delete(dow)
  else s.add(dow)
  tplWeekdays.value = s
}
// Filled squares for the list mini-indicator (Mon→Sun order).
function miniDays(empId: string): { dow: number; on: boolean }[] {
  const t = templateFor(empId)
  const set = new Set(t?.weekdays ?? [])
  return DAY_PILLS.map((p) => ({ dow: p.dow, on: set.has(p.dow) }))
}
async function saveTemplate() {
  const empId = tplEmpId.value
  if (!empId) return
  await run(() =>
    shifts.saveTemplate(empId, {
      weekdays: [...tplWeekdays.value].sort((a, b) => a - b),
      start_time: tplStart.value,
      end_time: tplEnd.value,
      valid_from: tplValidFrom.value,
      valid_until: tplIndefinido.value ? null : tplValidUntil.value || null,
    }),
  )
}
async function extendTemplate() {
  const empId = tplEmpId.value
  if (!empId) return
  await run(() => shifts.extendHorizon(empId))
}

// ── Solicitudes (Phase 2) ────────────────────────────────────────────────────────
type ReqFilter = RequestStatus | 'all'
const reqFilter = ref<ReqFilter>('pending')
const REQ_TABS: { key: ReqFilter; label: string }[] = [
  { key: 'pending', label: 'Pendientes' },
  { key: 'approved', label: 'Aprobadas' },
  { key: 'rejected', label: 'Rechazadas' },
  { key: 'all', label: 'Todas' },
]
const REQ_META: Record<RequestStatus, { label: string; pill: string; border: string }> = {
  pending: { label: 'Pendiente', pill: 'pill-warn', border: 'border-l-warn' },
  approved: { label: 'Aprobada', pill: 'pill-success', border: 'border-l-success' },
  rejected: { label: 'Rechazada', pill: 'pill-alert', border: 'border-l-alert' },
}
const filteredRequests = computed<TimeOffRequest[]>(() =>
  reqFilter.value === 'all'
    ? shifts.requests
    : shifts.requests.filter((r) => r.status === reqFilter.value),
)
function reqCount(status: RequestStatus): number {
  return shifts.requests.filter((r) => r.status === status).length
}
function fmtDecided(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('es-CO', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

// Approve (with optional coverage)
const approveReq = ref<TimeOffRequest | null>(null)
const approveCovers = ref<Employee[]>([])
const approveCoverId = ref<string | null>(null)
async function startApprove(r: TimeOffRequest) {
  approveReq.value = r
  approveCoverId.value = null
  approveCovers.value = await shifts.availableCovers(r.request_date)
}
async function confirmApprove() {
  const r = approveReq.value
  if (!r) return
  await run(() => shifts.approveRequest(r.id, approveCoverId.value))
  approveReq.value = null
}

// Reject (with reason)
const rejectReq = ref<TimeOffRequest | null>(null)
const rejectReason = ref('')
function startReject(r: TimeOffRequest) {
  rejectReq.value = r
  rejectReason.value = ''
}
async function confirmReject() {
  const r = rejectReq.value
  if (!r || !rejectReason.value.trim()) return
  await run(() => shifts.rejectRequest(r.id, rejectReason.value.trim()))
  rejectReq.value = null
}

// New request (admin registers on behalf of an employee)
const newReqOpen = ref(false)
const newReqEmp = ref('')
const newReqDate = ref(todayIso)
const newReqReason = ref('Descanso')
function openNewReq() {
  newReqEmp.value = roster.value[0]?.emp.id ?? ''
  newReqDate.value = todayIso
  newReqReason.value = 'Descanso'
  newReqOpen.value = true
}
async function createReq() {
  if (!newReqEmp.value) return
  await run(() => shifts.createRequest(newReqEmp.value, newReqDate.value, newReqReason.value))
  newReqOpen.value = false
}

// ── Keyboard / scroll dismissal ─────────────────────────────────────────────────
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') closePopover()
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('scroll', closePopover, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', closePopover, true)
})
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-[1500px] flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <!-- Header -->
        <header class="flex flex-wrap items-end justify-between gap-4">
          <div class="min-w-0">
            <p class="eyebrow truncate">Estación · Turnos</p>
            <h1 class="mt-1 text-hero font-extrabold leading-none text-ink">Gestión de turnos</h1>
            <p class="mt-1 text-sm text-steel-500">
              La plantilla manda: los turnos se generan solos y las excepciones se resuelven sobre el riel.
            </p>
          </div>

          <div class="flex max-sm:w-full overflow-x-auto rounded-xl border border-line bg-sunken p-1" role="tablist" aria-label="Vistas de turnos">
            <button
              v-for="t in TABS" :key="t.key"
              type="button" role="tab" :aria-selected="view === t.key"
              class="relative flex flex-1 shrink-0 items-center justify-center gap-2 rounded-lg px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition"
              :class="view === t.key ? 'bg-paper text-ink shadow-sm' : 'text-steel-500 hover:text-ink'"
              @click="view = t.key"
            >
              <i :class="['pi', t.icon, 'text-[13px]']" />
              <span>{{ t.label }}</span>
              <span
                v-if="t.key === 'solicitudes' && shifts.pendingRequestCount"
                class="grid min-w-[18px] place-items-center rounded-full bg-warn px-1 text-[10px] font-bold text-white"
              >{{ shifts.pendingRequestCount }}</span>
            </button>
          </div>
        </header>

        <p v-if="error" class="pill pill-alert self-start">{{ error }}</p>

        <!-- ══ CALENDARIO ══ -->
        <template v-if="view === 'calendario'">
          <!-- Stats -->
          <section class="card grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
            <div class="flex flex-col gap-0.5 p-4">
              <span class="eyebrow">Turnos · semana</span>
              <span class="font-mono text-2xl font-bold tabular-nums text-ink">{{ weekStats.turnos }}</span>
            </div>
            <div class="flex flex-col gap-0.5 p-4">
              <span class="eyebrow">Horas programadas</span>
              <span class="font-mono text-2xl font-bold tabular-nums text-ink">{{ weekStats.horas }}<span class="text-base text-steel-400">h</span></span>
            </div>
            <div class="flex flex-col gap-0.5 p-4">
              <span class="eyebrow">Sin cubrir</span>
              <span class="font-mono text-2xl font-bold tabular-nums" :class="weekStats.sinCubrir ? 'text-alert' : 'text-success'">{{ weekStats.sinCubrir }}</span>
            </div>
            <div class="flex flex-col gap-0.5 p-4">
              <span class="eyebrow">Solicitudes</span>
              <span class="font-mono text-2xl font-bold tabular-nums" :class="weekStats.solicitudes ? 'text-warn' : 'text-steel-400'">{{ weekStats.solicitudes }}</span>
            </div>
          </section>

          <!-- Controls -->
          <section class="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            <div class="flex items-center gap-1 self-start rounded-xl border border-line bg-paper p-1 lg:self-auto">
              <button type="button" aria-label="Semana anterior" class="grid size-8 place-items-center rounded-lg text-steel-500 transition hover:bg-sunken hover:text-ink" @click="shiftWeek(-1)"><i class="pi pi-chevron-left text-xs" /></button>
              <div class="flex flex-col items-center px-2 leading-tight">
                <span class="font-mono text-[13px] font-bold tabular-nums text-ink">{{ rangeLabel }}</span>
                <button type="button" class="font-mono text-[10px] uppercase tracking-[0.12em] transition" :class="isThisWeek ? 'text-ember' : 'text-steel-400 hover:text-ember'" @click="goThisWeek">{{ isThisWeek ? 'Semana actual' : 'Ir a hoy' }}</button>
              </div>
              <button type="button" aria-label="Semana siguiente" class="grid size-8 place-items-center rounded-lg text-steel-500 transition hover:bg-sunken hover:text-ink" @click="shiftWeek(1)"><i class="pi pi-chevron-right text-xs" /></button>
            </div>

            <div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
              <button
                v-for="r in roster" :key="r.emp.id" type="button"
                class="flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 transition"
                :class="selectedEmp.has(r.emp.id) ? 'border-line bg-paper text-ink' : 'border-transparent bg-sunken text-steel-400 opacity-60'"
                :aria-pressed="selectedEmp.has(r.emp.id)"
                @click="toggleEmp(r.emp.id)"
              >
                <span class="grid size-6 place-items-center rounded-full font-mono text-[10px] font-bold text-white" :style="{ backgroundColor: selectedEmp.has(r.emp.id) ? r.color : '#c2c8cd' }">{{ r.initials }}</span>
                <span class="font-mono text-[11px] uppercase tracking-wide">{{ r.name.split(' ')[0] }}</span>
              </button>
              <button v-if="roster.length" type="button" class="ml-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-steel-400 underline-offset-2 transition hover:text-ember hover:underline" @click="allEmps">Todos</button>
            </div>

            <Button v-if="canManage" label="Asignar turno" icon="pi pi-plus" size="small" @click="openManual" />
          </section>

          <p v-if="horizonWarning" class="pill pill-warn self-start">
            <i class="pi pi-exclamation-triangle text-[10px]" /> Los turnos generados terminan pronto — extiende una plantilla en la pestaña Plantillas.
          </p>

          <!-- Board -->
          <section class="card animate-docket overflow-hidden">
            <div v-if="shifts.loading" class="grid place-items-center py-20 text-steel-500">
              <i class="pi pi-spin pi-spinner text-2xl" />
            </div>
            <div v-else-if="!roster.length" class="grid place-items-center px-6 py-20 text-center text-steel-500">
              No hay empleados activos en esta sucursal.
            </div>
            <div v-else class="overflow-x-auto">
              <div class="lineup" style="min-width: 944px">
                <!-- Header -->
                <div class="lineup-row border-b border-line bg-sunken">
                  <div class="sticky left-0 z-20 flex items-center bg-sunken px-4 py-3"><span class="eyebrow">Empleado</span></div>
                  <div
                    v-for="(col, i) in columns" :key="'h' + i"
                    class="flex flex-col items-center justify-center gap-0.5 border-l border-line py-2.5 transition"
                    :class="[col.isToday ? 'bg-ember-50' : '', col.cov.uncovered > 0 ? 'heat-warm' : '']"
                  >
                    <span class="font-mono text-[11px] uppercase tracking-[0.14em]" :class="col.isToday ? 'text-ember-600' : col.cov.uncovered > 0 ? 'text-warn-600' : 'text-steel-500'">{{ col.dow }}</span>
                    <span class="font-display text-lg font-bold leading-none" :class="col.isToday ? 'text-ember-600' : 'text-ink'">{{ col.num }}</span>
                  </div>
                </div>

                <!-- Rows -->
                <div v-for="entry in grid" :key="entry.row.emp.id" class="lineup-row border-b border-hairline last:border-b-0 hover:bg-app/40">
                  <div class="sticky left-0 z-10 flex items-center gap-2.5 border-r border-line bg-paper px-3 py-2">
                    <span class="grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold text-white" :style="{ backgroundColor: entry.row.color, boxShadow: '0 0 0 2px ' + entry.row.color + '33' }">{{ entry.row.initials }}</span>
                    <span class="min-w-0">
                      <span class="block truncate text-[13px] font-semibold leading-tight text-ink">{{ entry.row.name }}</span>
                      <span class="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-steel-500">
                        <span class="size-1.5 rounded-full" :style="{ backgroundColor: entry.row.color }" />
                        {{ staff.roleName(entry.row.emp.role_id) }}
                      </span>
                    </span>
                  </div>

                  <div
                    v-for="(cell, i) in entry.cells" :key="i"
                    class="cell border-l border-hairline p-1.5"
                    :class="cell.isToday ? 'bg-ember-50/40' : ''"
                  >
                    <!-- WORKING -->
                    <button
                      v-if="cell.kind === 'working'" type="button"
                      class="group flex h-full w-full flex-col justify-center gap-1 overflow-hidden rounded-lg border border-line bg-paper pl-2.5 pr-2 text-left transition hover:border-steel-300 hover:shadow-sm"
                      :style="{ boxShadow: 'inset 3px 0 0 ' + cell.row.color }"
                      @click="openPopover(cell, $event)"
                    >
                      <span class="font-mono text-[12px] font-semibold tabular-nums text-ink">{{ hm(cell.shift!.start_time) }}<span class="text-steel-400">–</span>{{ hm(cell.shift!.end_time) }}</span>
                      <span class="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-steel-500">
                        <span class="size-1.5 rounded-full" :style="{ backgroundColor: cell.row.color }" /> En turno
                      </span>
                    </button>

                    <!-- SPECIAL (manual) -->
                    <button
                      v-else-if="cell.kind === 'special'" type="button"
                      class="group flex h-full w-full flex-col justify-center gap-1 overflow-hidden rounded-lg border border-dashed border-ember/45 bg-ember-50 pl-2.5 pr-2 text-left transition hover:border-ember"
                      @click="openPopover(cell, $event)"
                    >
                      <span class="font-mono text-[12px] font-semibold tabular-nums text-ember-600">{{ hm(cell.shift!.start_time) }}<span class="opacity-50">–</span>{{ hm(cell.shift!.end_time) }}</span>
                      <span class="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-ember-600/80"><i class="pi pi-bolt text-[9px]" /> Refuerzo</span>
                    </button>

                    <!-- COVERING -->
                    <button
                      v-else-if="cell.kind === 'covering'" type="button"
                      class="group flex h-full w-full flex-col justify-center gap-1 overflow-hidden rounded-lg border border-info/35 bg-info/10 pl-2.5 pr-2 text-left transition hover:border-info/60"
                      @click="openPopover(cell, $event)"
                    >
                      <span class="font-mono text-[12px] font-semibold tabular-nums text-info-600">{{ hm(cell.shift!.start_time) }}<span class="opacity-50">–</span>{{ hm(cell.shift!.end_time) }}</span>
                      <span class="flex items-center gap-1 truncate font-mono text-[10px] uppercase tracking-wide text-info-600"><i class="pi pi-sync text-[9px]" /> cubre a {{ cell.coversForName }}</span>
                    </button>

                    <!-- LIBRE (day off) -->
                    <button
                      v-else-if="cell.kind === 'libre'" type="button"
                      class="group flex h-full w-full flex-col justify-center gap-1 overflow-hidden rounded-lg border border-dashed pl-2.5 pr-2 text-left transition"
                      :class="cell.coveredByName ? 'border-steel-300 bg-sunken' : 'border-alert/40 bg-alert/[0.06] hover:border-alert/70'"
                      @click="openPopover(cell, $event)"
                    >
                      <span class="flex items-center gap-1 font-mono text-[11px] uppercase tracking-wide" :class="cell.coveredByName ? 'text-steel-500' : 'text-alert-600'"><i class="pi pi-moon text-[10px]" /> Día libre</span>
                      <span v-if="cell.coveredByName" class="flex items-center gap-1 truncate font-mono text-[10px] text-steel-500"><i class="pi pi-check-circle text-[9px] text-success" /> {{ cell.coveredByName }}</span>
                      <span v-else class="truncate font-mono text-[10px] uppercase tracking-wide text-alert-600">sin cubrir</span>
                    </button>

                    <!-- OFF -->
                    <div v-else class="grid h-full w-full place-items-center"><span class="text-steel-300">·</span></div>
                  </div>
                </div>

                <!-- Coverage footer -->
                <div class="lineup-row border-t-2 border-line bg-app/60">
                  <div class="sticky left-0 z-10 flex items-center border-r border-line bg-app px-4 py-2.5"><span class="eyebrow">Cobertura</span></div>
                  <div
                    v-for="(col, i) in columns" :key="'c' + i"
                    class="flex flex-col justify-center gap-0.5 border-l border-hairline px-2 py-2"
                    :class="col.cov.uncovered > 0 ? 'bg-warn/[0.07]' : ''"
                  >
                    <span class="flex items-center gap-1 font-mono text-[11px] tabular-nums text-success-600"><span class="size-1.5 rounded-full bg-success" />{{ col.cov.onDuty }} en línea</span>
                    <span class="font-mono text-[10px] tabular-nums text-steel-500">{{ col.cov.off }} libre</span>
                    <span v-if="col.cov.uncovered > 0" class="font-mono text-[10px] font-semibold uppercase tracking-wide tabular-nums text-alert-600">⚠ {{ col.cov.uncovered }} sin cubrir</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.1em] text-steel-500">
            <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm border border-line bg-paper" /> Turno</span>
            <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm border border-info/40 bg-info/15" /> Cubierto</span>
            <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm border border-dashed border-ember/50 bg-ember-50" /> Refuerzo</span>
            <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm border border-dashed border-alert/50 bg-alert/10" /> Sin cubrir</span>
            <span class="ml-auto hidden sm:inline">La columna se calienta cuando un servicio queda sin cubrir.</span>
          </div>
        </template>

        <!-- ══ PLANTILLAS ══ -->
        <template v-else-if="view === 'plantillas'">
          <div class="grid gap-4 lg:grid-cols-[264px_1fr]">
            <!-- Employee list -->
            <div class="card self-start overflow-hidden">
              <div class="border-b border-line px-4 py-3"><span class="eyebrow">Empleados</span></div>
              <ul v-if="roster.length" class="max-h-[70vh] divide-y divide-hairline overflow-y-auto">
                <li v-for="r in roster" :key="r.emp.id">
                  <button
                    type="button"
                    class="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition"
                    :class="tplEmpId === r.emp.id ? 'bg-ember-50' : 'hover:bg-app/50'"
                    @click="selectTplEmp(r.emp.id)"
                  >
                    <span class="grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold text-white" :style="{ backgroundColor: r.color }">{{ r.initials }}</span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[13px] font-semibold leading-tight text-ink">{{ r.name }}</span>
                      <span class="mt-1 flex items-center gap-[3px]">
                        <span v-for="d in miniDays(r.emp.id)" :key="d.dow" class="size-2 rounded-[2px]" :class="d.on ? 'bg-ember' : 'bg-line'" />
                        <span v-if="!templateFor(r.emp.id)" class="ml-1 font-mono text-[9px] uppercase tracking-wide text-steel-400">sin plantilla</span>
                      </span>
                    </span>
                  </button>
                </li>
              </ul>
              <p v-else class="px-4 py-10 text-center text-sm text-steel-500">Sin empleados activos.</p>
            </div>

            <!-- Editor -->
            <div v-if="selectedTplRow" class="card flex flex-col gap-5 p-5">
              <header class="flex items-center gap-3 border-b border-line pb-4">
                <span class="grid size-10 place-items-center rounded-full font-mono text-[13px] font-bold text-white" :style="{ backgroundColor: selectedTplRow.color }">{{ selectedTplRow.initials }}</span>
                <div class="min-w-0">
                  <p class="truncate font-display text-lg font-bold text-ink">{{ selectedTplRow.name }}</p>
                  <p class="font-mono text-[10px] uppercase tracking-wide text-steel-500">
                    <template v-if="selectedTemplate">Turnos generados hasta {{ selectedTemplate.generated_through ?? '—' }}</template>
                    <template v-else>Nueva plantilla</template>
                  </p>
                </div>
              </header>

              <!-- Days -->
              <div class="flex flex-col gap-2">
                <span class="eyebrow">Días de la semana</span>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="p in DAY_PILLS" :key="p.dow"
                    type="button" :disabled="!canManage"
                    class="grid size-12 place-items-center rounded-xl font-display text-lg font-bold transition disabled:opacity-50"
                    :class="tplWeekdays.has(p.dow) ? 'bg-ember text-white shadow-sm' : 'bg-sunken text-steel-500 hover:bg-line'"
                    :aria-pressed="tplWeekdays.has(p.dow)"
                    @click="toggleDay(p.dow)"
                  >{{ p.label }}</button>
                </div>
                <span class="font-mono text-[11px] text-steel-500">{{ tplWeekdays.size }} {{ tplWeekdays.size === 1 ? 'día' : 'días' }} · los días no marcados son descanso</span>
              </div>

              <!-- Times -->
              <div class="flex flex-wrap items-end gap-4">
                <label class="flex flex-col gap-1.5"><span class="eyebrow">Entrada</span><input v-model="tplStart" type="time" :disabled="!canManage" class="w-32 rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-ember focus:outline-none" /></label>
                <label class="flex flex-col gap-1.5"><span class="eyebrow">Salida</span><input v-model="tplEnd" type="time" :disabled="!canManage" class="w-32 rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-ember focus:outline-none" /></label>
                <span class="pb-2 font-mono text-[12px]" :class="tplDurationValid ? 'text-steel-500' : 'text-alert-600'">
                  {{ tplDurationValid ? 'Duración: ' : 'Fin ≤ inicio' }}<b v-if="tplDurationValid" class="text-ink">{{ durLabel(tplStart, tplEnd) }}</b>
                </span>
              </div>

              <!-- Validity -->
              <div class="flex flex-wrap items-end gap-4">
                <label class="flex flex-col gap-1.5"><span class="eyebrow">Válida desde</span><input v-model="tplValidFrom" type="date" :disabled="!canManage" class="rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-ember focus:outline-none" /></label>
                <label class="flex flex-col gap-1.5">
                  <span class="eyebrow">Válida hasta</span>
                  <input v-if="!tplIndefinido" v-model="tplValidUntil" type="date" :disabled="!canManage" class="rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-ember focus:outline-none" />
                  <span v-else class="rounded-lg border border-dashed border-line bg-sunken px-3 py-2 font-mono text-sm text-steel-500">Indefinido</span>
                </label>
                <label class="flex items-center gap-2 pb-2 text-sm text-ink">
                  <input v-model="tplIndefinido" type="checkbox" :disabled="!canManage" class="size-4 accent-[var(--color-ember)]" /> Indefinido
                </label>
              </div>

              <p class="rounded-lg bg-info/10 px-3 py-2 text-[12px] text-info-600">
                <i class="pi pi-bolt text-[10px]" /> Al guardar, esta plantilla generará turnos para los próximos 90 días. Los días libres y coberturas ya aprobados se conservan.
              </p>

              <div v-if="canManage" class="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <Button label="Guardar plantilla" icon="pi pi-check" :disabled="!tplCanSave" :loading="busy" @click="saveTemplate" />
                <Button v-if="selectedTemplate" label="Extender +90 días" icon="pi pi-forward" text severity="secondary" :loading="busy" @click="extendTemplate" />
              </div>
            </div>
            <div v-else class="card grid place-items-center px-6 py-16 text-center text-sm text-steel-500">
              Selecciona un empleado para ver o crear su plantilla.
            </div>
          </div>
        </template>

        <!-- ══ SOLICITUDES ══ -->
        <template v-else>
          <section class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex rounded-xl border border-line bg-sunken p-1">
              <button
                v-for="t in REQ_TABS" :key="t.key"
                type="button"
                class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition"
                :class="reqFilter === t.key ? 'bg-paper text-ink shadow-sm' : 'text-steel-500 hover:text-ink'"
                @click="reqFilter = t.key"
              >
                {{ t.label }}
                <span
                  v-if="t.key === 'pending' && reqCount('pending')"
                  class="grid min-w-[16px] place-items-center rounded-full bg-warn px-1 text-[10px] font-bold text-white"
                >{{ reqCount('pending') }}</span>
              </button>
            </div>
            <Button v-if="canManage" label="Nueva solicitud" icon="pi pi-plus" size="small" text @click="openNewReq" />
          </section>

          <div class="flex flex-col gap-3">
            <article
              v-for="r in filteredRequests" :key="r.id"
              class="card border-l-[3px] p-4" :class="REQ_META[r.status].border"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="flex items-center gap-3">
                  <span class="grid size-9 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold text-white" :style="{ backgroundColor: colorFor(r.employee_id) }">{{ initials(nameOf(r.employee_id)) }}</span>
                  <div>
                    <p class="text-[14px] font-semibold text-ink">{{ nameOf(r.employee_id) }}</p>
                    <p class="font-mono text-[11px] uppercase tracking-wide text-steel-500">{{ longDate(r.request_date) }}</p>
                  </div>
                </div>
                <span class="pill" :class="REQ_META[r.status].pill">{{ REQ_META[r.status].label }}</span>
              </div>

              <p class="mt-3 text-[13px] text-ink"><span class="text-steel-500">Motivo:</span> {{ r.reason }}</p>

              <!-- Pending → actions -->
              <div v-if="r.status === 'pending' && canManage" class="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-3">
                <Button label="Aprobar" icon="pi pi-check" size="small" @click="startApprove(r)" />
                <Button label="Rechazar" icon="pi pi-times" size="small" severity="danger" outlined @click="startReject(r)" />
              </div>
              <!-- Resolved → outcome -->
              <p v-else-if="r.status === 'approved'" class="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-success-600">
                <i class="pi pi-check-circle text-[11px]" /> Aprobada{{ r.decided_at ? ' · ' + fmtDecided(r.decided_at) : '' }}
              </p>
              <p v-else-if="r.status === 'rejected'" class="mt-3 text-[12px] text-alert-600">
                <i class="pi pi-times-circle text-[11px]" /> Rechazada{{ r.note ? ' — ' + r.note : '' }}
              </p>
            </article>

            <div v-if="!filteredRequests.length" class="card grid place-items-center px-6 py-16 text-center text-sm text-steel-500">
              <span class="mb-2 grid size-11 place-items-center rounded-xl bg-sunken text-steel-400"><i class="pi pi-inbox text-lg" /></span>
              No hay solicitudes {{ reqFilter === 'all' ? '' : REQ_TABS.find((t) => t.key === reqFilter)?.label.toLowerCase() }}.
            </div>
          </div>
        </template>
      </div>
    </main>

    <!-- Popover -->
    <template v-if="popover">
      <div class="fixed inset-0 z-40" @click="closePopover" />
      <div class="card fixed z-50 w-64 p-0 max-sm:left-1/2 max-sm:top-1/2 max-sm:-translate-x-1/2 max-sm:-translate-y-1/2" :style="{ left: popover.x + 'px', top: popover.top, bottom: popover.bottom }" role="dialog" @click.stop>
        <div class="flex items-center gap-2.5 border-b border-line p-3">
          <span class="grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold text-white" :style="{ backgroundColor: popover.cell.row.color }">{{ popover.cell.row.initials }}</span>
          <div class="min-w-0">
            <p class="truncate text-[13px] font-semibold text-ink">{{ popover.cell.row.name }}</p>
            <p class="truncate font-mono text-[10px] uppercase tracking-wide text-steel-500">{{ longDate(popover.cell.dateIso) }}</p>
          </div>
        </div>
        <div class="flex flex-col gap-1 p-3 text-[12px]">
          <div v-if="popover.cell.shift" class="flex items-center justify-between">
            <span class="text-steel-500">Horario</span>
            <span class="font-mono font-semibold tabular-nums text-ink">{{ hm(popover.cell.shift.start_time) }}–{{ hm(popover.cell.shift.end_time) }} <span class="text-steel-400">({{ durLabel(hm(popover.cell.shift.start_time), hm(popover.cell.shift.end_time)) }})</span></span>
          </div>
          <div v-if="popover.cell.coversForName" class="flex items-center justify-between"><span class="text-steel-500">Cubre a</span><span class="text-info-600">{{ popover.cell.coversForName }}</span></div>
          <div v-if="popover.cell.kind === 'libre'" class="flex items-center justify-between"><span class="text-steel-500">Cobertura</span><span :class="popover.cell.coveredByName ? 'text-success-600' : 'text-alert-600'">{{ popover.cell.coveredByName ?? 'Sin cubrir' }}</span></div>
          <div v-if="popover.cell.shift?.note" class="flex items-center justify-between"><span class="text-steel-500">Nota</span><span class="truncate text-ink">{{ popover.cell.shift.note }}</span></div>
        </div>
        <div class="flex flex-col border-t border-line p-1.5">
          <template v-if="popover.cell.kind === 'working' || popover.cell.kind === 'special' || popover.cell.kind === 'covering'">
            <button class="pop-act" @click="startEdit(popover.cell)"><i class="pi pi-pencil" /> Editar horario</button>
            <button class="pop-act" @click="startDayOff(popover.cell)"><i class="pi pi-moon" /> Dar día libre</button>
            <button class="pop-act pop-act-danger" @click="removeShift(popover.cell)"><i class="pi pi-times-circle" /> Quitar turno</button>
          </template>
          <template v-else-if="popover.cell.kind === 'libre'">
            <button v-if="!popover.cell.coveredByName" class="pop-act" @click="startCover(popover.cell)"><i class="pi pi-sync" /> Asignar cobertura</button>
            <button class="pop-act pop-act-danger" @click="removeShift(popover.cell)"><i class="pi pi-times-circle" /> Quitar del calendario</button>
          </template>
        </div>
      </div>
    </template>

    <!-- Dar día libre -->
    <Dialog :visible="!!dayOffCell" modal :closable="true" :draggable="false" :style="{ width: '26rem' }" @update:visible="(v: boolean) => { if (!v) dayOffCell = null }">
      <template #header><div><p class="eyebrow">Día libre</p><p class="font-display text-lg font-bold text-ink">{{ dayOffCell?.row.name }}</p></div></template>
      <div v-if="dayOffCell" class="flex flex-col gap-4">
        <p class="text-sm text-steel-500">{{ longDate(dayOffCell.dateIso) }}</p>
        <label class="flex flex-col gap-1.5"><span class="eyebrow">Motivo</span><Select v-model="dayOffReason" :options="MOTIVOS" option-label="label" option-value="value" /></label>
        <label class="flex items-center justify-between rounded-lg border border-line bg-app/50 px-3 py-2.5">
          <span class="flex flex-col">
            <span class="text-sm font-medium text-ink">Buscar cobertura automática</span>
            <span class="font-mono text-[10px] uppercase tracking-wide text-steel-500">{{ dayOffCovers.length ? dayOffCovers.length + ' disponibles' : 'nadie libre ese día' }}</span>
          </span>
          <input v-model="dayOffAutoCover" type="checkbox" class="size-4 accent-[var(--color-ember)]" />
        </label>
        <p v-if="dayOffAutoCover && dayOffCovers.length" class="rounded-lg bg-info/10 px-3 py-2 text-[12px] text-info-600"><i class="pi pi-sync text-[10px]" /> Cubrirá <b>{{ staff.employeeName(dayOffCovers[0]!) }}</b></p>
        <p v-else-if="dayOffAutoCover" class="rounded-lg bg-warn/10 px-3 py-2 text-[12px] text-warn-600"><i class="pi pi-exclamation-triangle text-[10px]" /> Este turno quedará sin cubrir.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" text severity="secondary" @click="dayOffCell = null" />
        <Button label="Aplicar día libre" icon="pi pi-check" :loading="busy" @click="applyDayOff" />
      </template>
    </Dialog>

    <!-- Asignar cobertura -->
    <Dialog :visible="!!coverCell" modal :closable="true" :draggable="false" :style="{ width: '26rem' }" @update:visible="(v: boolean) => { if (!v) coverCell = null }">
      <template #header><div><p class="eyebrow">Cobertura</p><p class="font-display text-lg font-bold text-ink">Cubrir a {{ coverCell?.row.name }}</p></div></template>
      <div v-if="coverCell" class="flex flex-col gap-2">
        <p class="text-sm text-steel-500">{{ longDate(coverCell.dateIso) }} · empleados libres ese día</p>
        <button v-for="c in coverList" :key="c.id" type="button" class="flex items-center gap-3 rounded-lg border border-line bg-paper p-2.5 text-left transition hover:border-ember hover:bg-ember-50" @click="assignCover(c.id)">
          <span class="grid size-8 place-items-center rounded-full font-mono text-[11px] font-bold text-white" :style="{ backgroundColor: colorFor(c.id) }">{{ initials(staff.employeeName(c)) }}</span>
          <span class="flex-1"><span class="block text-[13px] font-semibold text-ink">{{ staff.employeeName(c) }}</span><span class="font-mono text-[10px] uppercase tracking-wide text-steel-500">{{ staff.roleName(c.role_id) }}</span></span>
          <span class="pill pill-success">libre</span>
        </button>
        <p v-if="!coverList.length" class="rounded-lg bg-warn/10 px-3 py-3 text-center text-[12px] text-warn-600">Nadie está libre ese día.</p>
      </div>
    </Dialog>

    <!-- Editar horario -->
    <Dialog :visible="!!editCell" modal :closable="true" :draggable="false" :style="{ width: '22rem' }" @update:visible="(v: boolean) => { if (!v) editCell = null }">
      <template #header><div><p class="eyebrow">Editar horario</p><p class="font-display text-lg font-bold text-ink">{{ editCell?.row.name }}</p></div></template>
      <div v-if="editCell" class="flex flex-col gap-4">
        <p class="text-sm text-steel-500">{{ longDate(editCell.dateIso) }}</p>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1.5"><span class="eyebrow">Entrada</span><input v-model="editStart" type="time" class="rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-ember focus:outline-none" /></label>
          <label class="flex flex-col gap-1.5"><span class="eyebrow">Salida</span><input v-model="editEnd" type="time" class="rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-ember focus:outline-none" /></label>
        </div>
        <p class="font-mono text-[11px] text-steel-500">Duración: <b class="text-ink">{{ durLabel(editStart, editEnd) }}</b></p>
      </div>
      <template #footer>
        <Button label="Cancelar" text severity="secondary" @click="editCell = null" />
        <Button label="Guardar" icon="pi pi-check" :loading="busy" @click="applyEdit" />
      </template>
    </Dialog>

    <!-- Asignar turno manual -->
    <Dialog v-model:visible="manualOpen" modal :closable="true" :draggable="false" :style="{ width: '26rem' }">
      <template #header><div><p class="eyebrow">Turno manual</p><p class="font-display text-lg font-bold text-ink">Refuerzo puntual</p></div></template>
      <div class="flex flex-col gap-4">
        <label class="flex flex-col gap-1.5"><span class="eyebrow">Empleado</span><Select v-model="manualEmp" :options="empOptions" option-label="label" option-value="value" filter /></label>
        <label class="flex flex-col gap-1.5"><span class="eyebrow">Fecha</span><input v-model="manualDate" type="date" class="rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-ember focus:outline-none" /></label>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1.5"><span class="eyebrow">Entrada</span><input v-model="manualStart" type="time" class="rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-ember focus:outline-none" /></label>
          <label class="flex flex-col gap-1.5"><span class="eyebrow">Salida</span><input v-model="manualEnd" type="time" class="rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-ember focus:outline-none" /></label>
        </div>
        <label class="flex flex-col gap-1.5"><span class="eyebrow">Nota</span><input v-model="manualNote" type="text" placeholder="Refuerzo por evento especial" class="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-steel-400 focus:border-ember focus:outline-none" /></label>
      </div>
      <template #footer>
        <Button label="Cancelar" text severity="secondary" @click="manualOpen = false" />
        <Button label="Crear turno" icon="pi pi-plus" :loading="busy" @click="applyManual" />
      </template>
    </Dialog>

    <!-- Aprobar solicitud -->
    <Dialog :visible="!!approveReq" modal :closable="true" :draggable="false" :style="{ width: '26rem' }" @update:visible="(v: boolean) => { if (!v) approveReq = null }">
      <template #header><div><p class="eyebrow">Aprobar solicitud</p><p class="font-display text-lg font-bold text-ink">{{ nameOf(approveReq?.employee_id ?? null) }}</p></div></template>
      <div v-if="approveReq" class="flex flex-col gap-4">
        <p class="text-sm text-steel-500">{{ longDate(approveReq.request_date) }} · {{ approveReq.reason }}</p>
        <div class="flex flex-col gap-1.5">
          <span class="eyebrow">Cobertura (opcional)</span>
          <button type="button" class="flex items-center justify-between rounded-lg border px-3 py-2 text-left transition" :class="approveCoverId === null ? 'border-ember bg-ember-50' : 'border-line hover:bg-app/50'" @click="approveCoverId = null">
            <span class="text-sm text-ink">Sin cobertura</span>
            <span v-if="approveCoverId === null" class="pill pill-warn">quedará sin cubrir</span>
          </button>
          <button
            v-for="c in approveCovers" :key="c.id" type="button"
            class="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition"
            :class="approveCoverId === c.id ? 'border-ember bg-ember-50' : 'border-line hover:bg-app/50'"
            @click="approveCoverId = c.id"
          >
            <span class="grid size-7 place-items-center rounded-full font-mono text-[10px] font-bold text-white" :style="{ backgroundColor: colorFor(c.id) }">{{ initials(staff.employeeName(c)) }}</span>
            <span class="flex-1 text-[13px] text-ink">{{ staff.employeeName(c) }}</span>
            <span class="pill pill-success">libre</span>
          </button>
          <p v-if="!approveCovers.length" class="px-1 font-mono text-[10px] uppercase tracking-wide text-steel-400">Nadie libre ese día.</p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" text severity="secondary" @click="approveReq = null" />
        <Button label="Aprobar" icon="pi pi-check" :loading="busy" @click="confirmApprove" />
      </template>
    </Dialog>

    <!-- Rechazar solicitud -->
    <Dialog :visible="!!rejectReq" modal :closable="true" :draggable="false" :style="{ width: '24rem' }" @update:visible="(v: boolean) => { if (!v) rejectReq = null }">
      <template #header><div><p class="eyebrow">Rechazar solicitud</p><p class="font-display text-lg font-bold text-ink">{{ nameOf(rejectReq?.employee_id ?? null) }}</p></div></template>
      <div v-if="rejectReq" class="flex flex-col gap-3">
        <p class="text-sm text-steel-500">{{ longDate(rejectReq.request_date) }}</p>
        <label class="flex flex-col gap-1.5">
          <span class="eyebrow">Motivo del rechazo (visible al empleado)</span>
          <textarea v-model="rejectReason" rows="3" placeholder="Ej: semana con alta demanda…" class="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-steel-400 focus:border-ember focus:outline-none" />
        </label>
      </div>
      <template #footer>
        <Button label="Cancelar" text severity="secondary" @click="rejectReq = null" />
        <Button label="Rechazar solicitud" icon="pi pi-times" severity="danger" :disabled="!rejectReason.trim()" :loading="busy" @click="confirmReject" />
      </template>
    </Dialog>

    <!-- Nueva solicitud -->
    <Dialog v-model:visible="newReqOpen" modal :closable="true" :draggable="false" :style="{ width: '24rem' }">
      <template #header><div><p class="eyebrow">Nueva solicitud</p><p class="font-display text-lg font-bold text-ink">Día libre</p></div></template>
      <div class="flex flex-col gap-4">
        <label class="flex flex-col gap-1.5"><span class="eyebrow">Empleado</span><Select v-model="newReqEmp" :options="empOptions" option-label="label" option-value="value" filter /></label>
        <label class="flex flex-col gap-1.5"><span class="eyebrow">Fecha</span><input v-model="newReqDate" type="date" class="rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-ember focus:outline-none" /></label>
        <label class="flex flex-col gap-1.5"><span class="eyebrow">Motivo</span><Select v-model="newReqReason" :options="MOTIVOS" option-label="label" option-value="value" /></label>
      </div>
      <template #footer>
        <Button label="Cancelar" text severity="secondary" @click="newReqOpen = false" />
        <Button label="Enviar solicitud" icon="pi pi-send" :loading="busy" @click="createReq" />
      </template>
    </Dialog>
  </AppShell>
</template>

<style scoped>
.lineup-row {
  display: grid;
  grid-template-columns: 160px repeat(7, minmax(112px, 1fr));
}
.cell {
  min-height: 84px;
}
.pop-act {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.625rem;
  border-radius: 0.5rem;
  font-size: 12px;
  color: var(--color-ink);
  transition: background-color 0.12s ease;
}
.pop-act i {
  font-size: 12px;
  color: var(--color-steel-500);
}
.pop-act:hover {
  background-color: var(--color-sunken);
}
.pop-act-danger {
  color: var(--color-alert-600);
}
.pop-act-danger i {
  color: var(--color-alert);
}
</style>
