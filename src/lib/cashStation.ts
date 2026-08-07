// ─────────────────────────────────────────────────────────────────────────────
// Caja station — store-backed adapter for the redesign screen.
//
// The redesign view + its dialogs (`components/cashstation/*`) were prototyped
// against an in-memory model. This module now maps the REAL backend (via the
// cash / branch / staff Pinia stores) onto the SAME export surface those
// components already import, so the visual layer barely changed.
//
// Pinia-at-import-time: the store composables (`useCashStore`, …) require an
// active Pinia, which does not exist when this module is first evaluated. Every
// export is therefore lazy — `cash`/`summary`/`channels`/`methods`/`history`
// are objects of getters or `computed()` refs whose bodies call `useXStore()`
// only when read (during a component's reactive render), never at import.
//
// Domain vocabulary is Spanish in copy only; identifiers are English per the
// project convention (arqueo→cash count, sucursal→branch, cajero→cashier).
// ─────────────────────────────────────────────────────────────────────────────
import { computed, reactive } from 'vue'
import { useCashStore } from '@/stores/cash'
import { useBranchStore } from '@/stores/branch'
import { useStaffStore } from '@/stores/staff'
import { getSessionSummary } from '@/services/cash.api'
import type { CashMovement, CashSession } from '@/services/cash.api'
import { conceptLabel } from '@/lib/cashConcepts'

export type MovementKind = 'sale' | 'entry' | 'withdrawal' | 'expense'
export type PayMethod = 'cash' | 'card' | 'nequi' | 'daviplata' | 'transfer'

export interface Movement {
  id: string
  kind: MovementKind
  concept: string
  amount: number // signed: +in / −out
  time: string // 'HH:MM:SS'
  detail: string
  person?: string
  method?: PayMethod
  /**
   * La cuenta de mesa que produjo este movimiento, cuando la hubo.
   *
   * Cobrar la mesa 5 con un billete deja un movimiento por comanda: para el arqueo es la misma
   * plata, pero el cajero hizo UN gesto y sin esto vería tres cobros donde hizo uno.
   */
  billId?: string
  fresh?: boolean // just printed → slide-in + flash highlight
}

export interface HistoryCaja {
  id: string
  openedAt: string // ISO
  closedAt: string // ISO
  cashier: string
  float: number
  expected: number
  counted: number
  difference: number
}

// ── Labels ──────────────────────────────────────────────────────────────────
const CHANNEL_LABELS: Record<string, string> = {
  dine_in: 'Mesa / salón',
  dinein: 'Mesa / salón',
  delivery: 'Domicilios',
  takeaway: 'Para llevar',
  bar: 'Bar',
}
const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  transfer: 'Transferencia',
}
function channelLabel(key: string): string {
  return CHANNEL_LABELS[key] ?? key
}
function methodLabel(key: string): string {
  return METHOD_LABELS[key] ?? key
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function num(value: string | null | undefined): number {
  return value == null || value === '' ? 0 : Number(value)
}
function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
function clamp(text: string, max: number): string {
  return text.trim().slice(0, max)
}
function localTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
}

// Resolve an employee id (staff) into a human name via the staff directory.
function employeeNameById(id: string | null): string {
  if (!id) return '—'
  const staff = useStaffStore()
  const employee = staff.employees.find((e) => e.id === id)
  return employee ? staff.employeeName(employee) : '—'
}

// Map an API movement's category (or, as a fallback, its in/out direction) onto the
// display kinds the tape colours by.
function kindOf(m: CashMovement): MovementKind {
  const c = m.category
  if (c === 'sale' || c === 'entry' || c === 'withdrawal' || c === 'expense') return c
  // Order-payment movements carry concept 'sale' even if their category wasn't set (legacy rows).
  // They're already counted in `sales_total`; treating them as a manual 'entry' double-counts them.
  if (m.concept === 'sale') return 'sale'
  return m.type === 'in' ? 'entry' : 'expense'
}

function toDisplayMovement(m: CashMovement, fresh: boolean): Movement {
  return {
    id: m.id,
    kind: kindOf(m),
    concept: conceptLabel(m.concept),
    amount: num(m.amount) * (m.type === 'in' ? 1 : -1),
    time: localTime(m.created_at),
    detail: m.method ? methodLabel(m.method) : '',
    person: undefined,
    method: (m.method as PayMethod) || undefined,
    // Cobrar una mesa deja UN movimiento por comanda: para el arqueo es la misma plata, pero
    // el cajero hizo un solo gesto y vería tres cobros donde hizo uno. Esto los ata.
    billId: m.table_bill_id ?? undefined,
    fresh,
  }
}

// ── "Fresh" flash bookkeeping ─────────────────────────────────────────────────
// The mapped movements are recreated on every recompute, so the flash flag can't
// live on them. Instead a reactive id-set marks the newly-arrived rows; the view
// diffs incoming ids after each poll and calls `markFresh`.
const freshIds = reactive(new Set<string>())
export function markFresh(ids: string[]): void {
  for (const id of ids) {
    freshIds.add(id)
    setTimeout(() => freshIds.delete(id), 1600)
  }
}

// ── The live drawer (readonly view onto the store) ───────────────────────────
export const cash = {
  get status(): 'ABIERTA' | 'CERRADA' {
    return useCashStore().hasOpenSession ? 'ABIERTA' : 'CERRADA'
  },
  get cashier(): { name: string; initials: string } {
    const session = useCashStore().currentSession
    const name = employeeNameById(session?.opened_by_employee_id ?? null)
    return { name, initials: initialsOf(name === '—' ? '' : name) }
  },
  get openedAt(): string {
    return useCashStore().currentSession?.opened_at ?? new Date().toISOString()
  },
  get float(): number {
    return num(useCashStore().currentSession?.opening_amount)
  },
  get salesTotal(): number {
    return num(useCashStore().currentSummary?.sales_total)
  },
  get manualEntries(): number {
    return sumByCategory('entry')
  },
  get withdrawals(): number {
    return sumByCategory('withdrawal')
  },
  get expenses(): number {
    return sumByCategory('expense')
  },
  get ticketsOpen(): number {
    return 0
  },
  get ticketsDone(): number {
    return useCashStore().currentSummary?.tickets ?? 0
  },
  get ticketsCancelled(): number {
    return 0
  },
  get movements(): Movement[] {
    // Store movements are created_at ASC; the tape prints newest-first.
    return [...useCashStore().currentMovements]
      .reverse()
      .map((m) => toDisplayMovement(m, freshIds.has(m.id)))
  },
}

function sumByCategory(category: MovementKind): number {
  return useCashStore().currentMovements.reduce(
    (s, m) => (kindOf(m) === category ? s + num(m.amount) : s),
    0,
  )
}

// ── Derived figures ─────────────────────────────────────────────────────────
export const summary = {
  totalIn: computed(() => cash.salesTotal + cash.manualEntries),
  totalOut: computed(() => cash.withdrawals + cash.expenses),
  expectedCash: computed(() => {
    const store = useCashStore()
    return store.currentSummary
      ? num(store.currentSummary.expected_cash)
      : num(store.runningExpectedCash)
  }),
  ticketAvg: computed(() => num(useCashStore().currentSummary?.avg_ticket)),
  elapsedMs: computed(() => Date.now() - new Date(cash.openedAt).getTime()),
}

export const channels = computed(() => {
  const summaryData = useCashStore().currentSummary
  if (!summaryData) return [] as { key: string; label: string; value: number; pct: number }[]
  const total = summaryData.channels.reduce((s, c) => s + num(c.amount), 0) || 1
  return summaryData.channels.map((c) => ({
    key: c.channel,
    label: channelLabel(c.channel),
    value: num(c.amount),
    pct: (num(c.amount) / total) * 100,
  }))
})

export const methods = computed(() => {
  const summaryData = useCashStore().currentSummary
  if (!summaryData) return [] as { key: string; label: string; value: number; pct: number }[]
  const total = summaryData.payments.reduce((s, p) => s + num(p.amount), 0) || 1
  return summaryData.payments
    .map((p) => ({
      key: p.method,
      label: methodLabel(p.method),
      value: num(p.amount),
      pct: (num(p.amount) / total) * 100,
    }))
    .filter((m) => m.value > 0)
})

// ── Historial (closed cajas) ──────────────────────────────────────────────────
export const history = computed<HistoryCaja[]>(() =>
  useCashStore()
    .history.filter((s) => s.status !== 'open')
    .map(toHistoryCaja),
)

function toHistoryCaja(session: CashSession): HistoryCaja {
  return {
    id: session.id,
    openedAt: session.opened_at ?? new Date().toISOString(),
    closedAt: session.closed_at ?? session.opened_at ?? new Date().toISOString(),
    cashier: employeeNameById(session.opened_by_employee_id),
    float: num(session.opening_amount),
    expected: num(session.expected_amount),
    counted: num(session.counted_amount),
    difference: num(session.difference),
  }
}

// Per-session breakdown for the closed-caja detail (arqueo review). Fetched on demand when a
// history row is selected; the caller hides the bars if this throws.
export interface RankedBar {
  key: string
  label: string
  value: number
  pct: number
}
export interface SessionBreakdown {
  salesTotal: number
  methods: RankedBar[]
}
export async function getSessionBreakdown(sessionId: string): Promise<SessionBreakdown> {
  const s = await getSessionSummary(sessionId)
  const total = s.payments.reduce((sum, p) => sum + num(p.amount), 0) || 1
  return {
    salesTotal: num(s.sales_total),
    methods: s.payments
      .map((p) => ({
        key: p.method,
        label: methodLabel(p.method),
        value: num(p.amount),
        pct: (num(p.amount) / total) * 100,
      }))
      .filter((m) => m.value > 0),
  }
}

// Employee pickers use the real staff directory (value = employee id).
export const employeeOptions = computed(() =>
  useStaffStore()
    .employees.filter((e) => e.is_active)
    .map((e) => ({ label: useStaffStore().employeeName(e), value: e.id })),
)

// ── Mutations (async, write-through the cash store) ───────────────────────────
export async function refresh(): Promise<void> {
  const branch = useBranchStore()
  if (branch.activeBranchId) await useCashStore().refresh(branch.activeBranchId)
}

export async function openCaja(employeeId: string, float: number): Promise<void> {
  const branch = useBranchStore()
  if (!branch.activeBranchId) throw new Error('No hay una sucursal activa.')
  await useCashStore().openSession({
    branch_id: branch.activeBranchId,
    opened_by_employee_id: employeeId,
    opening_amount: float.toFixed(2),
  })
}

export async function registerEntry(amount: number, concept: string, _note: string): Promise<void> {
  await useCashStore().registerMovement({
    type: 'in',
    category: 'entry',
    concept: clamp(concept, 50),
    amount: amount.toFixed(2),
    method: 'cash',
  })
}

export async function registerWithdrawal(
  amount: number,
  reason: string,
  _auth: string,
): Promise<void> {
  await useCashStore().registerMovement({
    type: 'out',
    category: 'withdrawal',
    concept: clamp(reason, 50),
    amount: amount.toFixed(2),
    method: 'cash',
  })
}

export async function registerExpense(
  amount: number,
  category: string,
  _note: string,
  method: PayMethod,
): Promise<void> {
  await useCashStore().registerMovement({
    type: 'out',
    category: 'expense',
    concept: clamp(category, 50),
    amount: amount.toFixed(2),
    method,
  })
}

export interface CloseMeta {
  notes: string
  incident: boolean
  incidentNote: string
}

export async function closeCaja(
  counted: number,
  meta: CloseMeta,
  closedByEmployeeId: string,
): Promise<HistoryCaja> {
  const closed = await useCashStore().closeSession({
    closed_by_employee_id: closedByEmployeeId,
    counted_amount: counted.toFixed(2),
    notes: meta.notes,
    incident: meta.incident,
    incident_note: meta.incidentNote,
  })
  return toHistoryCaja(closed)
}

// ── Formatting helpers ──────────────────────────────────────────────────────
export function humanDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${String(m).padStart(2, '0')}min`
}

export function shortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

// Cash denominations for the arqueo counter (COP).
export const DENOMS = {
  bills: [100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000],
  coins: [1_000, 500, 200, 100],
}
