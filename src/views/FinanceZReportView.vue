<script setup lang="ts">
// Finanzas · Reporte Z — the end-of-shift cash close, as a printed thermal docket.
// Design prototype (in-memory) adapted to El Pase: the Z is the restaurant's most
// operational financial artifact, so it's rendered as the paper that prints at
// close — narrow, monospaced, perforated (docket-perf). The DIFERENCIA line is the
// beat: it glows (heat-warm/heat-hot) when the drawer doesn't square. Closing an
// open shift counts the drawer by denomination with the difference updating live.
import { computed, defineComponent, h, onMounted, reactive, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import AppShell from '@/components/AppShell.vue'
import StatCard from '@/components/finance/StatCard.vue'
import GroupedBars from '@/components/finance/GroupedBars.vue'
import DonutChart from '@/components/finance/DonutChart.vue'
import CashFlowLine from '@/components/finance/CashFlowLine.vue'
import RankBars from '@/components/finance/RankBars.vue'
import { copShort } from '@/lib/cop'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import * as cashApi from '@/services/cash.api'
import type { CashSession } from '@/services/cash.api'
import * as financeApi from '@/services/finance.api'
import type { Expense as ApiExpense } from '@/services/finance.api'
import { useFinanceStore } from '@/stores/finance'
import CategoriesArea from '@/components/finance/CategoriesArea.vue'
import { getMyEmployee } from '@/services/staff.api'
import {
  getZReport,
  getRevenue,
  getDaily,
  getTopProducts,
  getProfitAndLoss,
  getCostKpis,
  getProductMargins,
  getCashFlow,
} from '@/services/reports.api'
import type {
  ZReport,
  RevenueSummary,
  DailyPoint,
  TopProductRow,
  ProfitAndLoss,
  ManagerCostKpis,
  ProductMarginReport,
  CashFlowSummary,
} from '@/services/reports.api'

const auth = useAuthStore()
const branch = useBranchStore()
const finance = useFinanceStore()
const canManageFinance = computed(() => auth.can('finance.manage'))

// ── Money (Colombian peso: $1.250.000, dots, no decimals) ────────────────────────
function cop(n: number): string {
  return '$' + Math.round(Math.abs(n)).toLocaleString('es-CO', { maximumFractionDigits: 0 })
}
function copSigned(n: number): string {
  return n < 0 ? `(${cop(n)})` : cop(n)
}

// ── The receipt's section divider (kept local so the docket reads in one place) ──
const ZSection = defineComponent({
  props: { title: { type: String, required: true } },
  setup(props) {
    return () =>
      h('div', { class: 'mt-4 mb-1 flex items-center gap-2' }, [
        h('span', { class: 'font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-steel-500' }, props.title),
        h('span', { class: 'h-px flex-1 bg-line' }),
      ])
  },
})

// ── Domain (seed) ────────────────────────────────────────────────────────────────
interface Line {
  name: string
  amount: number
  count?: number
  unit?: string
}
interface ZData {
  restaurant: string
  channels: Line[]
  discounts: number
  discountOrders: number
  returns: number
  returnOrders: number
  payments: Line[]
  paymentsPct: number[]
  arqueo: { fondo: number; ingresosEfectivo: number; retiros: number; contado: number | null }
  taxes: { iva: number; inc: number; impoconsumo: number }
  operative: { ticketPromedio: number; horaActiva: string; productoTop: string; meseroTop: string }
  observations: string
}
type ShiftStatus = 'closed' | 'pending'
interface Shift {
  id: string
  dayLabel: string
  dateLong: string
  name: 'Mañana' | 'Tarde' | 'Noche'
  hours: string
  cashier: string
  status: ShiftStatus
  z: ZData
}

function grossSales(z: ZData): number {
  return z.channels.reduce((s, c) => s + c.amount, 0)
}
function grossTickets(z: ZData): number {
  return z.channels.reduce((s, c) => s + (c.count ?? 0), 0)
}
function netSales(z: ZData): number {
  return grossSales(z) - z.discounts - z.returns
}
function expected(z: ZData): number {
  return z.arqueo.fondo + z.arqueo.ingresosEfectivo - z.arqueo.retiros
}
function difference(z: ZData): number {
  return z.arqueo.contado === null ? 0 : z.arqueo.contado - expected(z)
}

// ── Real data: cash sessions → Z docket ──────────────────────────────────────────
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const CHANNEL_LABEL: Record<string, string> = { dine_in: 'Mesas (dine-in)', delivery: 'Domicilios', takeaway: 'Para llevar' }
const CHANNEL_UNIT: Record<string, string> = { dine_in: 'tickets', delivery: 'pedidos', takeaway: 'pedidos' }

function isoDate(iso: string | null): Date | null {
  return iso ? new Date(iso) : null
}
function hm(iso: string | null): string {
  const d = isoDate(iso)
  return d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '—'
}
function dayLabelOf(iso: string | null): string {
  const d = isoDate(iso)
  if (!d) return 'Sin fecha'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dd = new Date(d); dd.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - dd.getTime()) / 86400000)
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  if (diff === 0) return `Hoy — ${base}`
  if (diff === 1) return `Ayer — ${base}`
  return base
}
function dateLongOf(iso: string | null): string {
  const d = isoDate(iso)
  return d ? `${d.getDate()} de ${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}` : '—'
}
function shiftNameOf(iso: string | null): 'Mañana' | 'Tarde' | 'Noche' {
  const h = isoDate(iso)?.getHours() ?? 0
  return h < 14 ? 'Mañana' : h < 22 ? 'Tarde' : 'Noche'
}
function emptyZ(): ZData {
  return { restaurant: '', channels: [], discounts: 0, discountOrders: 0, returns: 0, returnOrders: 0, payments: [], paymentsPct: [], arqueo: { fondo: 0, ingresosEfectivo: 0, retiros: 0, contado: null }, taxes: { iva: 0, inc: 0, impoconsumo: 0 }, operative: { ticketPromedio: 0, horaActiva: '—', productoTop: '—', meseroTop: '—' }, observations: '' }
}

interface SessionShift extends Shift {
  session: CashSession
  loaded: boolean
}
const shifts = ref<SessionShift[]>([])
const zLoading = ref(false)
const zError = ref<string | null>(null)

function sessionToShift(s: CashSession): SessionShift {
  return {
    id: s.id, session: s, loaded: false,
    dayLabel: dayLabelOf(s.opened_at), dateLong: dateLongOf(s.opened_at),
    name: shiftNameOf(s.opened_at),
    hours: `${hm(s.opened_at)} – ${hm(s.closed_at)}`,
    cashier: '—', status: s.status === 'closed' ? 'closed' : 'pending',
    z: emptyZ(),
  }
}

// Map the real Z report into the docket's ZData shape. `ingresosEfectivo` is the
// cash inflow implied by the server's expected (expected = opening + cash − retiros),
// so the docket's expected()/difference() helpers reproduce the server figures.
function applyZ(shift: SessionShift, z: ZReport): void {
  const totalPaid = z.payments.reduce((s, p) => s + Number(p.amount), 0) || 1
  const opening = Number(z.opening_amount)
  const expected = z.expected_amount != null ? Number(z.expected_amount) : opening
  const withdrawals = Number(z.withdrawals)
  shift.cashier = z.cashier_name ?? '—'
  shift.z = {
    restaurant: branch.branches.find((b) => b.id === z.branch_id)?.name ?? 'Restaurante',
    channels: z.channels.map((c) => ({ name: CHANNEL_LABEL[c.channel] ?? c.channel, amount: Number(c.amount), count: c.tickets, unit: CHANNEL_UNIT[c.channel] ?? 'tickets' })),
    discounts: Number(z.discounts), discountOrders: 0,
    returns: Number(z.returns), returnOrders: z.return_count,
    payments: z.payments.map((p) => ({ name: p.method, amount: Number(p.amount) })),
    paymentsPct: z.payments.map((p) => Math.round((Number(p.amount) / totalPaid) * 100)),
    arqueo: { fondo: opening, ingresosEfectivo: expected - opening + withdrawals, retiros: withdrawals, contado: z.counted_amount != null ? Number(z.counted_amount) : null },
    taxes: { iva: Number(z.tax_iva), inc: Number(z.tax_inc), impoconsumo: Number(z.tax_impoconsumo) },
    operative: {
      ticketPromedio: Number(z.avg_ticket),
      horaActiva: z.peak_hour != null ? `${String(z.peak_hour).padStart(2, '0')}:00–${String(z.peak_hour + 1).padStart(2, '0')}:00` : '—',
      productoTop: z.top_product_name ? `${z.top_product_name} (${z.top_product_units} uds)` : '—',
      meseroTop: z.top_server_name ?? '—',
    },
    observations: '',
  }
}

async function loadZ(shift: SessionShift): Promise<void> {
  if (shift.loaded || shift.status !== 'closed') return
  zLoading.value = true
  try {
    applyZ(shift, await getZReport(shift.id))
    shift.loaded = true
  } catch {
    zError.value = 'No se pudo cargar el Reporte Z.'
  } finally {
    zLoading.value = false
  }
}

async function loadSessions(): Promise<void> {
  zError.value = null
  await branch.ensureLoaded()
  const branchId = branch.activeBranchId
  if (!branchId) return
  try {
    shifts.value = (await cashApi.listSessions(branchId)).map(sessionToShift)
  } catch {
    zError.value = 'No se pudieron cargar las sesiones de caja.'
    return
  }
  const firstClosed = shifts.value.find((s) => s.status === 'closed')
  selectedId.value = firstClosed?.id ?? shifts.value[0]?.id ?? ''
  if (firstClosed) await loadZ(firstClosed)
}
onMounted(loadSessions)
watch(() => branch.activeBranchId, loadSessions)

const groups = computed(() => {
  const map = new Map<string, SessionShift[]>()
  for (const s of shifts.value) {
    const arr = map.get(s.dayLabel) ?? []
    arr.push(s)
    map.set(s.dayLabel, arr)
  }
  return [...map.entries()].map(([label, items]) => ({ label, items }))
})

const selectedId = ref('')
const selected = computed<SessionShift | null>(
  () => shifts.value.find((s) => s.id === selectedId.value) ?? null,
)
async function select(id: string) {
  selectedId.value = id
  const s = shifts.value.find((x) => x.id === id)
  if (s) await loadZ(s)
}

type DiffTone = 'ok' | 'minor' | 'alert'
function diffTone(diff: number): DiffTone {
  if (diff === 0) return 'ok'
  return Math.abs(diff) <= 5000 ? 'minor' : 'alert'
}

// ── Tabs ─────────────────────────────────────────────────────────────────────────
const TABS = ['Resumen', 'Ingresos', 'Gastos', 'Rentabilidad', 'Reporte Z', 'Reportes']
const tab = ref('Resumen')

// ── Global period filter ──────────────────────────────────────────────────────────
type PeriodPreset = 'today' | 'week' | 'month' | 'year' | 'custom'
const PERIOD_OPTIONS = [
  { label: 'Hoy', value: 'today' },
  { label: 'Esta semana', value: 'week' },
  { label: 'Este mes', value: 'month' },
  { label: 'Este año', value: 'year' },
  { label: 'Personalizado', value: 'custom' },
]
const periodPreset = ref<PeriodPreset>('month')
const customFrom = ref('')
const customTo = ref('')
function fmtIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const period = computed<{ from: string; to: string }>(() => {
  const today = new Date()
  const to = fmtIso(today)
  if (periodPreset.value === 'custom') return { from: customFrom.value || to, to: customTo.value || to }
  if (periodPreset.value === 'today') return { from: to, to }
  if (periodPreset.value === 'week') {
    const s = new Date(today)
    const dow = s.getDay()
    s.setDate(s.getDate() - (dow === 0 ? 6 : dow - 1))
    return { from: fmtIso(s), to }
  }
  if (periodPreset.value === 'year') return { from: `${today.getFullYear()}-01-01`, to }
  return { from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, to }
})

// ── Resumen dashboard (real data) ──────────────────────────────────────────────────
const CHANNEL_COLORS = ['var(--color-success)', 'var(--color-ember)', 'var(--color-info)', 'var(--color-steel-400)']
const CHANNEL_DOTS = ['bg-success', 'bg-ember', 'bg-info', 'bg-steel-400']
const cashThreshold = 500000

const revenue = ref<RevenueSummary | null>(null)
const dailySeries = ref<DailyPoint[]>([])
const topProd = ref<TopProductRow[]>([])
// Cost-dependent reporting (Phase 4): P&L, manager cost KPIs, product margins.
const pl = ref<ProfitAndLoss | null>(null)
const costKpis = ref<ManagerCostKpis | null>(null)
const prodMargins = ref<ProductMarginReport | null>(null)
const cashFlowData = ref<CashFlowSummary | null>(null)
const resumenLoading = ref(false)
const resumenError = ref<string | null>(null)

async function loadResumen(): Promise<void> {
  const branchId = branch.activeBranchId
  if (!branchId) return
  resumenLoading.value = true
  resumenError.value = null
  try {
    const { from, to } = period.value
    const [rev, day, top, profit, kpi, margins, cash] = await Promise.all([
      getRevenue(branchId, from, to),
      getDaily(branchId, from, to),
      getTopProducts(branchId, from, to, 5),
      getProfitAndLoss(branchId, from, to),
      getCostKpis(branchId, from, to),
      getProductMargins(branchId, from, to, 5),
      getCashFlow(branchId, from, to),
    ])
    revenue.value = rev
    dailySeries.value = day
    topProd.value = top
    pl.value = profit
    costKpis.value = kpi
    prodMargins.value = margins
    cashFlowData.value = cash
  } catch {
    resumenError.value = 'No se pudieron cargar los indicadores.'
  } finally {
    resumenLoading.value = false
  }
}

const expenseTotalPeriod = computed(() => dailySeries.value.reduce((s, d) => s + Number(d.expenses), 0))
const revenueTotal = computed(() => (revenue.value ? Number(revenue.value.total) : 0))
const utilidad = computed(() => revenueTotal.value - expenseTotalPeriod.value)
const margen = computed(() => (revenueTotal.value ? Math.round((utilidad.value / revenueTotal.value) * 100) : 0))
const deliveryChannel = computed(() => revenue.value?.channels.find((c) => c.channel === 'delivery'))

const kpis = computed(() => [
  { label: 'Ingresos', value: cop(revenueTotal.value), icon: 'pi-wallet', tone: 'income' as const },
  { label: 'Gastos', value: cop(expenseTotalPeriod.value), icon: 'pi-arrow-down', tone: 'expense' as const },
  { label: 'Utilidad', value: cop(utilidad.value), icon: 'pi-chart-line', tone: 'profit' as const, sub: `Margen ${margen.value}%` },
  { label: 'Tickets', value: String(revenue.value?.tickets ?? 0), icon: 'pi-receipt', tone: 'neutral' as const },
  { label: 'Domicilios', value: String(deliveryChannel.value?.tickets ?? 0), icon: 'pi-send', tone: 'neutral' as const, sub: cop(deliveryChannel.value ? Number(deliveryChannel.value.amount) : 0) },
  { label: 'Promedio', value: cop(revenue.value ? Number(revenue.value.avg_ticket) : 0), icon: 'pi-hashtag', tone: 'neutral' as const, sub: 'por ticket' },
])

// Bar chart: the period's daily series (capped for readability), day-of-month labels.
const daily = computed(() =>
  dailySeries.value.slice(-14).map((d) => ({ day: d.day.slice(8, 10), income: Number(d.income), expenses: Number(d.expenses) })),
)

const channels = computed(() => {
  const chs = revenue.value?.channels ?? []
  const total = chs.reduce((s, c) => s + Number(c.amount), 0) || 1
  return chs.map((c, i) => ({
    name: CHANNEL_LABEL[c.channel] ?? c.channel,
    amount: Number(c.amount),
    pct: Math.round((Number(c.amount) / total) * 100),
    color: CHANNEL_COLORS[i % CHANNEL_COLORS.length]!,
    dot: CHANNEL_DOTS[i % CHANNEL_DOTS.length]!,
  }))
})

// Cash-flow category breakdown for the "Flujo de caja" report card.
const cashInflows = computed(() => (cashFlowData.value?.categories ?? []).filter((c) => c.direction === 'in'))
const cashOutflows = computed(() => (cashFlowData.value?.categories ?? []).filter((c) => c.direction === 'out'))

// Real cash trajectory: cumulative running balance of the cash-flow net series
// (money-in − money-out per day) from /reports/cash-flow, not a revenue proxy.
const cashFlow = computed(() => {
  let bal = 0
  return (cashFlowData.value?.daily ?? []).slice(-14).map((d) => {
    bal += Number(d.net)
    return { label: d.day.slice(8, 10), value: bal }
  })
})

const topProducts = computed(() =>
  topProd.value.map((p) => ({ name: p.name ?? 'Producto', value: Number(p.revenue), sub: `${p.units} uds` })),
)

const alerts: { tone: 'warn'; text: string }[] = []

// Cost-free indicators plus the cost-dependent KPIs from product costing (Phase 4).
// Food cost = COGS/ventas; prime cost = food + labor (needs a labor expense category);
// gross margin = 100 − food cost. Partial costing is flagged, not hidden.
const pctLabel = (v: string | null): string => (v != null ? `${Math.round(Number(v))}%` : '—')
const costPartialNote = computed(() => (costKpis.value?.cogs_partial ? 'costeo parcial' : ''))
const managerKpis = computed(() => {
  const k = costKpis.value
  const foodPct = k?.food_cost_pct != null ? Math.round(Number(k.food_cost_pct)) : null
  return [
    { name: 'Ticket promedio', value: cop(revenue.value ? Number(revenue.value.avg_ticket) : 0), status: 'neutral' as const, note: '' },
    { name: 'Tickets del período', value: String(revenue.value?.tickets ?? 0), status: 'neutral' as const, note: '' },
    { name: 'Descuentos', value: cop(revenue.value ? Number(revenue.value.discounts) : 0), status: 'neutral' as const, note: '' },
    { name: 'Devoluciones', value: cop(revenue.value ? Number(revenue.value.returns) : 0), status: 'neutral' as const, note: '' },
    { name: 'Food cost', value: pctLabel(k?.food_cost_pct ?? null), status: (foodPct != null && foodPct > 40 ? 'warn' : 'neutral') as 'warn' | 'neutral', note: costPartialNote.value },
    { name: 'Prime cost', value: k?.labor_available ? pctLabel(k.prime_cost_pct) : '—', status: 'neutral' as const, note: k?.labor_available ? '' : 'sin nómina registrada' },
    { name: 'Margen bruto', value: foodPct != null ? `${100 - foodPct}%` : '—', status: 'neutral' as const, note: costPartialNote.value },
  ]
})
onMounted(loadResumen)
watch([() => branch.activeBranchId, period], loadResumen)
const STATUS_META = {
  ok: { icon: 'pi-check-circle', class: 'text-success-600' },
  warn: { icon: 'pi-exclamation-triangle', class: 'text-warn-600' },
  alert: { icon: 'pi-times-circle', class: 'text-alert-600' },
  neutral: { icon: '', class: 'text-steel-400' },
}

// ── INGRESOS (real revenue engine — driven by the global período) ──────────────────
const CHANNEL_META: Record<string, { dot: string; icon: string; unit: string }> = {
  dine_in: { dot: 'bg-success', icon: 'pi-table', unit: 'tickets' },
  delivery: { dot: 'bg-ember', icon: 'pi-send', unit: 'pedidos' },
  takeaway: { dot: 'bg-info', icon: 'pi-shopping-bag', unit: 'pedidos' },
}
const PAYMENT_COLORS = ['var(--color-success)', 'var(--color-info)', 'var(--color-ember)', 'var(--color-steel-400)']
const PAYMENT_DOTS = ['bg-success', 'bg-info', 'bg-ember', 'bg-steel-400']
const incomeStats = computed(() => [
  { label: 'Total ingresos', value: cop(revenueTotal.value), tone: 'income' as const, icon: 'pi-wallet' },
  { label: 'Ticket promedio', value: cop(revenue.value ? Number(revenue.value.avg_ticket) : 0), tone: 'neutral' as const, icon: 'pi-hashtag' },
  { label: 'Transacciones', value: String(revenue.value?.tickets ?? 0), tone: 'neutral' as const, icon: 'pi-receipt' },
])
const channelIncome = computed(() =>
  (revenue.value?.channels ?? []).map((c) => {
    const m = CHANNEL_META[c.channel] ?? { dot: 'bg-steel-400', icon: 'pi-tag', unit: 'ventas' }
    return { name: CHANNEL_LABEL[c.channel] ?? c.channel, amount: Number(c.amount), count: `${c.tickets} ${m.unit}`, dot: m.dot, icon: m.icon }
  }),
)
const paymentMethods = computed(() => {
  const ps = revenue.value?.payments ?? []
  const total = ps.reduce((s, p) => s + Number(p.amount), 0) || 1
  return ps.map((p, i) => ({
    name: p.method,
    amount: Number(p.amount),
    pct: Math.round((Number(p.amount) / total) * 100),
    color: PAYMENT_COLORS[i % PAYMENT_COLORS.length]!,
    dot: PAYMENT_DOTS[i % PAYMENT_DOTS.length]!,
  }))
})
const paymentsTotal = computed(() => (revenue.value?.payments ?? []).reduce((s, p) => s + Number(p.amount), 0))
interface TxItem { name: string; qty: number; price: number }
interface Tx {
  time: string; order: string; channel: string; channelKind: 'mesa' | 'domicilio' | 'llevar' | 'bar'
  subtotal: number; discount: number; tax: number; total: number; method: string; cashier: string
  items: TxItem[]
}
const CH_ICON: Record<Tx['channelKind'], string> = { mesa: 'pi-table', domicilio: 'pi-send', llevar: 'pi-shopping-bag', bar: 'pi-glass' }
const transactions: Tx[] = [
  { time: 'Hoy 14:23', order: '#ORD-4821', channel: 'Mesa 4', channelKind: 'mesa', subtotal: 45000, discount: 0, tax: 4500, total: 49500, method: 'Efectivo', cashier: 'Camila',
    items: [{ name: 'Bandeja Paisa', qty: 1, price: 28000 }, { name: 'Limonada de coco', qty: 2, price: 8500 }] },
  { time: 'Hoy 14:10', order: '#ORD-4820', channel: 'Domicilio', channelKind: 'domicilio', subtotal: 38000, discount: 5000, tax: 3300, total: 36300, method: 'Nequi', cashier: 'Diego',
    items: [{ name: 'Churrasco', qty: 1, price: 32000 }, { name: 'Gaseosa', qty: 1, price: 6000 }] },
  { time: 'Hoy 13:52', order: '#ORD-4819', channel: 'Mesa 9', channelKind: 'mesa', subtotal: 72000, discount: 0, tax: 7200, total: 79200, method: 'Tarjeta', cashier: 'Camila',
    items: [{ name: 'Hamburguesa clásica', qty: 2, price: 24000 }, { name: 'Papas', qty: 2, price: 8000 }, { name: 'Cerveza', qty: 2, price: 4000 }] },
  { time: 'Hoy 13:40', order: '#ORD-4818', channel: 'Para llevar', channelKind: 'llevar', subtotal: 21000, discount: 0, tax: 2100, total: 23100, method: 'Efectivo', cashier: 'Diego',
    items: [{ name: 'Empanadas x3', qty: 3, price: 7000 }] },
  { time: 'Hoy 13:18', order: '#ORD-4817', channel: 'Bar', channelKind: 'bar', subtotal: 34000, discount: 0, tax: 3400, total: 37400, method: 'Tarjeta', cashier: 'Camila',
    items: [{ name: 'Cóctel de la casa', qty: 2, price: 17000 }] },
  { time: 'Hoy 12:55', order: '#ORD-4816', channel: 'Mesa 2', channelKind: 'mesa', subtotal: 56000, discount: 8000, tax: 4800, total: 52800, method: 'Daviplata', cashier: 'Diego',
    items: [{ name: 'Bandeja Paisa', qty: 2, price: 28000 }] },
  { time: 'Hoy 12:30', order: '#ORD-4815', channel: 'Domicilio', channelKind: 'domicilio', subtotal: 42000, discount: 0, tax: 4200, total: 46200, method: 'Nequi', cashier: 'Camila',
    items: [{ name: 'Churrasco', qty: 1, price: 32000 }, { name: 'Limonada', qty: 1, price: 8500 }] },
  { time: 'Hoy 12:05', order: '#ORD-4814', channel: 'Mesa 7', channelKind: 'mesa', subtotal: 98000, discount: 0, tax: 9800, total: 107800, method: 'Efectivo', cashier: 'Diego',
    items: [{ name: 'Churrasco', qty: 2, price: 32000 }, { name: 'Bandeja Paisa', qty: 1, price: 28000 }] },
]
const txChannelFilter = ref('Todos')
const txMethodFilter = ref('Todos')
const txPage = ref(1)
const TX_PER_PAGE = 6
const filteredTx = computed(() =>
  transactions.filter(
    (t) =>
      (txChannelFilter.value === 'Todos' || t.channel.startsWith(txChannelFilter.value) || (txChannelFilter.value === 'Mesa' && t.channelKind === 'mesa')) &&
      (txMethodFilter.value === 'Todos' || t.method === txMethodFilter.value),
  ),
)
const pagedTx = computed(() => filteredTx.value.slice((txPage.value - 1) * TX_PER_PAGE, txPage.value * TX_PER_PAGE))
const txChannelOptions = ['Todos', 'Mesa', 'Domicilio', 'Para llevar', 'Bar'].map((v) => ({ label: v, value: v }))
const txMethodOptions = ['Todos', 'Efectivo', 'Tarjeta', 'Nequi', 'Daviplata'].map((v) => ({ label: v, value: v }))
const selectedTx = ref<Tx | null>(null)

// ── GASTOS (real finance expense ledger) ──────────────────────────────────────────
// The finance backend stores category · description · amount · employee · date, so
// the table is trimmed to those; presupuesto y recurrentes quedan por implementar.
// Categories are owned by the finance store (single source of truth) so the
// embedded Categorías manager and this ledger stay in sync. The picker offers
// active categories; name resolution spans all (an expense may cite an inactive one).
const expenseCategories = computed(() => finance.activeCategories)
const expensesReal = ref<ApiExpense[]>([])
const expenseCategoryFilter = ref<string | null>(null) // category id
const gastosError = ref<string | null>(null)
const myEmployeeId = ref<string | null>(null)

function categoryName(id: string): string {
  return finance.categories.find((c) => c.id === id)?.name ?? '—'
}
function fmtExpenseDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
const expenseTotal = computed(() => expensesReal.value.reduce((s, e) => s + Number(e.amount), 0))
const expenseByCategory = computed(() => {
  const totals = new Map<string, number>()
  for (const e of expensesReal.value)
    totals.set(e.expense_category_id, (totals.get(e.expense_category_id) ?? 0) + Number(e.amount))
  const total = expenseTotal.value || 1
  return [...totals.entries()]
    .map(([id, value]) => ({ id, name: categoryName(id), value, sub: `${Math.round((value / total) * 100)}%` }))
    .sort((a, b) => b.value - a.value)
})
const expenseDays = computed(
  () => new Set(expensesReal.value.map((e) => (e.incurred_at ?? '').slice(0, 10)).filter(Boolean)).size,
)
const expenseStats = computed(() => [
  { label: 'Total gastos', value: cop(expenseTotal.value), tone: 'expense' as const, icon: 'pi-arrow-down' },
  { label: 'Mayor categoría', value: expenseByCategory.value[0]?.name ?? '—', tone: 'neutral' as const, icon: 'pi-box' },
  { label: 'Promedio diario', value: cop(expenseDays.value ? expenseTotal.value / expenseDays.value : 0), tone: 'neutral' as const, icon: 'pi-calendar' },
  { label: 'Registros', value: String(expensesReal.value.length), tone: 'neutral' as const, icon: 'pi-list' },
])
const filteredExpenses = computed(() =>
  expenseCategoryFilter.value
    ? expensesReal.value.filter((e) => e.expense_category_id === expenseCategoryFilter.value)
    : expensesReal.value,
)

async function loadGastos(): Promise<void> {
  gastosError.value = null
  const branchId = branch.activeBranchId
  if (!branchId) return
  try {
    const [, exps] = await Promise.all([
      finance.loadCategories(),
      financeApi.listExpenses({ branchId }),
    ])
    expensesReal.value = exps
  } catch {
    gastosError.value = 'No se pudieron cargar los gastos.'
  }
}
async function loadMyEmployee(): Promise<void> {
  try {
    myEmployeeId.value = (await getMyEmployee()).id
  } catch {
    myEmployeeId.value = null
  }
}
onMounted(() => {
  void loadGastos()
  void loadMyEmployee()
})
watch(() => branch.activeBranchId, () => void loadGastos())

const registrarOpen = ref(false)
const registrarBusy = ref(false)
const newExpense = reactive({ date: '', category: '', desc: '', amount: '' })
const categoryOptions = computed(() => expenseCategories.value.map((c) => ({ label: c.name, value: c.id })))
function openRegistrar() {
  Object.assign(newExpense, { date: '', category: expenseCategories.value[0]?.id ?? '', desc: '', amount: '' })
  registrarOpen.value = true
}
async function saveExpense() {
  const amt = Number(newExpense.amount)
  const branchId = branch.activeBranchId
  if (!newExpense.desc || !amt || !newExpense.category || !myEmployeeId.value || !branchId) return
  registrarBusy.value = true
  try {
    await financeApi.recordExpense({
      branch_id: branchId,
      expense_category_id: newExpense.category,
      description: newExpense.desc,
      amount: String(amt),
      employee_id: myEmployeeId.value,
      incurred_at: newExpense.date || null,
    })
    registrarOpen.value = false
    await loadGastos()
    flash('Gasto registrado')
  } catch {
    flash('No se pudo registrar el gasto')
  } finally {
    registrarBusy.value = false
  }
}

// ── RENTABILIDAD ─────────────────────────────────────────────────────────────────
type PLKind = 'header' | 'line' | 'subtotal' | 'total'
interface PLRow { label: string; amount?: number; pct?: number; kind: PLKind; tone?: 'income' | 'expense' | 'profit' }
const rnd = (v: string | number): number => Math.round(Number(v))
// The P&L statement, assembled from the /reports/pl aggregate. COGS lines carry a
// "estimado" note when costing is partial; taxes are the labeled IVA estimate.
const pnl = computed<PLRow[]>(() => {
  const p = pl.value
  if (!p) return []
  const rows: PLRow[] = [{ label: 'INGRESOS', kind: 'header' }]
  for (const c of p.channels)
    rows.push({ label: CHANNEL_LABEL[c.channel] ?? c.channel, amount: Number(c.revenue), kind: 'line' })
  rows.push({ label: 'TOTAL INGRESOS (neto)', amount: Number(p.revenue), pct: 100, kind: 'subtotal', tone: 'income' })
  rows.push({ label: p.cogs_partial ? 'COSTO DE VENTAS (COGS · parcial)' : 'COSTO DE VENTAS (COGS)', kind: 'header' })
  rows.push({ label: 'Insumos y materias primas', amount: Number(p.cogs), kind: 'line' })
  rows.push({ label: 'UTILIDAD BRUTA', amount: Number(p.gross_profit), pct: rnd(p.gross_margin_pct), kind: 'subtotal', tone: 'profit' })
  rows.push({ label: 'GASTOS OPERATIVOS', kind: 'header' })
  rows.push({ label: 'Gastos operativos del período', amount: Number(p.operating_expenses), kind: 'line' })
  rows.push({ label: 'EBITDA (Utilidad operativa)', amount: Number(p.ebitda), pct: rnd(p.ebitda_margin_pct), kind: 'total', tone: 'profit' })
  rows.push({ label: 'OTROS', kind: 'header' })
  rows.push({ label: 'Impuestos estimados (IVA 19%)', amount: Number(p.estimated_taxes), kind: 'line' })
  rows.push({ label: 'UTILIDAD NETA', amount: Number(p.net_profit), pct: rnd(p.net_margin_pct), kind: 'total', tone: 'profit' })
  return rows
})
const marginByChannel = computed(() =>
  (pl.value?.channels ?? []).map((c) => ({
    channel: CHANNEL_LABEL[c.channel] ?? c.channel,
    income: Number(c.revenue),
    cost: Number(c.cogs),
    margin: Number(c.margin),
    pct: rnd(c.margin_pct),
  })),
)
const daysInPeriod = computed(() => {
  const ms = new Date(period.value.to).getTime() - new Date(period.value.from).getTime()
  return Math.max(1, Math.round(ms / 86400000) + 1)
})
// Break-even = fixed opex ÷ contribution margin, for the selected period. Undefined
// (available: false) when the contribution margin is non-positive.
const breakeven = computed(() => {
  const p = pl.value
  if (!p) return null
  const be = p.break_even_revenue != null ? Number(p.break_even_revenue) : null
  return {
    fixed: Number(p.operating_expenses),
    contribution: rnd(p.contribution_margin_pct),
    available: be != null,
    period: be ?? 0,
    daily: be != null ? be / daysInPeriod.value : 0,
    surplus: be != null ? Number(p.revenue) - be : 0,
  }
})

// ── REPORTES ─────────────────────────────────────────────────────────────────────
interface ReportCard { icon: string; title: string; desc: string; key: string }
const reportsOperativos: ReportCard[] = [
  { icon: 'pi-chart-bar', title: 'Ventas por producto', desc: 'Qué platos generan más ingresos y margen', key: 'producto' },
  { icon: 'pi-users', title: 'Rendimiento por mesero', desc: 'Tickets, propinas y ventas por empleado', key: 'mesero' },
  { icon: 'pi-clock', title: 'Ventas por hora', desc: 'Horas pico, horas lentas, staffing', key: 'hora' },
  { icon: 'pi-credit-card', title: 'Medios de pago y propinas', desc: 'Split por canal, propinas efectivo vs tarjeta', key: 'pagos' },
  { icon: 'pi-send', title: 'Rendimiento domicilios', desc: 'Tiempo de entrega, zonas, domiciliarios', key: 'domi' },
  { icon: 'pi-percentage', title: 'Descuentos y devoluciones', desc: 'Quién aplica más descuentos y por qué', key: 'desc' },
]
const reportsFinancieros: ReportCard[] = [
  { icon: 'pi-file', title: 'P&L mensual', desc: 'Estado de resultados del mes, exportable', key: 'pl' },
  { icon: 'pi-money-bill', title: 'Flujo de caja', desc: 'Entradas y salidas de efectivo día a día', key: 'flujo' },
  { icon: 'pi-sort-alt', title: 'Comparativo de períodos', desc: 'Este mes vs mes anterior, % variación', key: 'comp' },
  { icon: 'pi-box', title: 'Costo de inventario', desc: 'COGS por categoría, desperdicio, rotación', key: 'cogs' },
  { icon: 'pi-trophy', title: 'Top & Bottom productos', desc: 'Los 10 mejores y peores en ventas y margen', key: 'topbottom' },
  { icon: 'pi-calendar', title: 'Reporte diario ejecutivo', desc: 'Resumen del día: ventas, gastos, tickets', key: 'diario' },
]
interface ProductRow { name: string; category: string; units: number; income: number; cost: number; marginPct: number; share: number }
// Real per-product margins (top + bottom from /reports/product-margins). Only
// products with a priced recipe appear; category is not modeled yet, so "—".
const productReport = computed<ProductRow[]>(() => {
  const m = prodMargins.value
  if (!m) return []
  const totalRev = pl.value ? Number(pl.value.revenue) : 0
  const seen = new Set<string>()
  const rows: ProductRow[] = []
  for (const p of [...m.top, ...m.bottom]) {
    if (seen.has(p.variant_id)) continue
    seen.add(p.variant_id)
    rows.push({
      name: p.name ?? 'Producto',
      category: '—',
      units: p.units,
      income: Number(p.revenue),
      cost: Number(p.cogs),
      marginPct: rnd(p.margin_pct),
      share: totalRev ? Math.round((Number(p.revenue) / totalRev) * 100) : 0,
    })
  }
  return rows
})
const reportModal = ref<ReportCard | null>(null)
const prodSortKey = ref<keyof ProductRow>('income')
const prodSortAsc = ref(false)
function sortProducts(k: keyof ProductRow) {
  if (prodSortKey.value === k) prodSortAsc.value = !prodSortAsc.value
  else { prodSortKey.value = k; prodSortAsc.value = false }
}
const sortedProducts = computed(() =>
  [...productReport.value].sort((a, b) => {
    const av = a[prodSortKey.value]; const bv = b[prodSortKey.value]
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
    return prodSortAsc.value ? cmp : -cmp
  }),
)
const productMaxIncome = computed(() => Math.max(1, ...productReport.value.map((p) => p.income)))
function openReport(r: ReportCard) {
  reportModal.value = r
  prodSortKey.value = 'income'
  prodSortAsc.value = false
}
// Ventas por hora heatmap (hours × weekday), intensity 0..1.
const HEAT_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const HEAT_HOURS = ['08', '10', '12', '14', '16', '18', '20']
const heatmap = HEAT_HOURS.map((h, hi) =>
  HEAT_DAYS.map((_, di) => {
    // Lunch (12) and dinner (20) peaks, weekends hotter.
    const lunch = hi === 2 ? 1 : hi === 3 ? 0.85 : 0
    const dinner = hi === 5 || hi === 6 ? 0.75 : 0
    const base = 0.25 + hi * 0.03
    const weekend = di >= 4 ? 0.18 : 0
    return { h, di, v: Math.min(1, base + lunch + dinner + weekend) }
  }),
)
function heatColor(v: number): string {
  // white → ember → alert as intensity rises.
  if (v < 0.45) return `color-mix(in oklab, var(--color-ember) ${Math.round(v * 60)}%, white)`
  return `color-mix(in oklab, var(--color-alert) ${Math.round((v - 0.45) * 140)}%, var(--color-ember))`
}

// ── Toast (simulated export/print) ───────────────────────────────────────────────
const toast = ref<string | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined
function flash(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 1600)
}
function doPrint() {
  window.print()
}

// ── Cerrar turno (arqueo) ────────────────────────────────────────────────────────
const BILLS = [100000, 50000, 20000, 10000, 5000, 2000, 1000]
const COINS = [1000, 500, 200, 100]
const closeShift = ref<SessionShift | null>(null)
const closeOpen = ref(false)
const step = ref(1)
const counts = reactive<Record<number, number>>({})
const closeNote = ref('')
const hadIncident = ref(false)
const incidentText = ref('')

// Bills (keys 0..6) and coins (keys 7..10) share the $1.000 face, kept separate by key.
const billRows = computed(() => BILLS.map((d, i) => ({ d, key: i, sub: d * (counts[i] ?? 0) })))
const coinRows = computed(() => COINS.map((d, i) => ({ d, key: BILLS.length + i, sub: d * (counts[BILLS.length + i] ?? 0) })))
const countedTotal = computed(
  () => billRows.value.reduce((s, r) => s + r.sub, 0) + coinRows.value.reduce((s, r) => s + r.sub, 0),
)
// Open sessions have no server-computed `expected` until they close, so the live
// difference is only shown when the session already carries an expected amount.
const closeExpected = computed<number | null>(() => {
  const e = closeShift.value?.session?.expected_amount
  return e != null ? Number(e) : null
})
const closeDiff = computed<number | null>(() =>
  closeExpected.value != null ? countedTotal.value - closeExpected.value : null,
)
const closeBusy = ref(false)

function startClose(s: SessionShift) {
  closeShift.value = s
  step.value = 1
  closeNote.value = ''
  hadIncident.value = false
  incidentText.value = ''
  for (const k of Object.keys(counts)) delete counts[Number(k)]
  closeOpen.value = true
}
async function confirmClose() {
  const s = closeShift.value
  if (!s) return
  closeBusy.value = true
  try {
    await cashApi.closeSession(s.session.id, {
      closed_by_employee_id: s.session.opened_by_employee_id,
      counted_amount: String(countedTotal.value),
    })
    closeOpen.value = false
    await loadSessions()
    await select(s.id)
    flash('Turno cerrado')
  } catch {
    flash('No se pudo cerrar el turno')
  } finally {
    closeBusy.value = false
  }
}
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <!-- Header -->
        <header class="no-print min-w-0">
          <p class="eyebrow truncate">Estación · Finanzas</p>
          <h1 class="mt-1 text-hero font-extrabold leading-none text-ink">Finanzas</h1>
          <p class="mt-1 text-sm text-steel-500">El cierre de caja, tal como sale impreso al final del turno.</p>
        </header>

        <!-- Tabs -->
        <nav class="no-print flex overflow-x-auto rounded-xl border border-line bg-sunken p-1" role="tablist">
          <button
            v-for="t in TABS" :key="t"
            type="button" role="tab" :aria-selected="tab === t"
            class="shrink-0 rounded-lg px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition"
            :class="tab === t ? 'bg-paper text-ink shadow-sm' : 'text-steel-500 hover:text-ink'"
            @click="tab = t"
          >{{ t }}</button>
        </nav>

        <!-- Global filter bar: período drives the Resumen/Ingresos aggregation. -->
        <section v-if="tab === 'Resumen' || tab === 'Ingresos'" class="no-print flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper px-4 py-2.5">
          <span class="eyebrow">Período</span>
          <Select v-model="periodPreset" :options="PERIOD_OPTIONS" option-label="label" option-value="value" size="small" class="w-40" />
          <template v-if="periodPreset === 'custom'">
            <input v-model="customFrom" type="date" class="rounded-lg border border-line bg-paper px-2.5 py-1.5 font-mono text-[12px] text-ink focus:border-ember focus:outline-none" />
            <span class="text-steel-400">–</span>
            <input v-model="customTo" type="date" class="rounded-lg border border-line bg-paper px-2.5 py-1.5 font-mono text-[12px] text-ink focus:border-ember focus:outline-none" />
          </template>
          <span v-else class="font-mono text-[12px] tabular-nums text-steel-500">{{ period.from }} → {{ period.to }}</span>
          <span class="ml-auto flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-steel-500">
            <i class="pi pi-map-marker text-[11px]" />{{ branch.activeBranch?.name ?? 'Sucursal' }}
          </span>
          <i v-if="resumenLoading" class="pi pi-spin pi-spinner text-sm text-steel-400" />
        </section>

        <!-- ══ REPORTE Z ══ -->
        <div v-if="tab === 'Reporte Z'" class="grid gap-5 lg:grid-cols-[280px_1fr]">
          <!-- Shift selector -->
          <aside class="no-print card self-start overflow-hidden">
            <div class="border-b border-line px-4 py-3"><span class="eyebrow">Turnos disponibles</span></div>
            <div v-for="g in groups" :key="g.label" class="border-b border-hairline last:border-b-0">
              <p class="bg-app/60 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">{{ g.label }}</p>
              <button
                v-for="s in g.items" :key="s.id"
                type="button"
                class="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition"
                :class="selectedId === s.id ? 'bg-ember-50' : 'hover:bg-app/50'"
                @click="select(s.id)"
              >
                <span class="grid size-6 shrink-0 place-items-center rounded-full text-[10px]" :class="s.status === 'pending' ? 'bg-warn/15 text-warn-600' : 'bg-success/15 text-success-600'">
                  <i :class="['pi', s.status === 'pending' ? 'pi-clock' : 'pi-check', 'text-[10px]']" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block text-[13px] font-semibold text-ink">Turno {{ s.name }}</span>
                  <span class="font-mono text-[10px] tabular-nums text-steel-500">{{ s.hours }}</span>
                </span>
                <span class="pill" :class="s.status === 'pending' ? 'pill-warn' : 'pill-success'">{{ s.status === 'pending' ? 'Pendiente' : 'Cerrado' }}</span>
              </button>
            </div>
            <p v-if="!shifts.length" class="px-4 py-8 text-center text-sm text-steel-500">Sin sesiones de caja.</p>
            <div v-if="selected?.status === 'pending'" class="border-t border-line p-3">
              <Button label="Cerrar turno actual" icon="pi pi-lock" class="w-full" @click="selected && startClose(selected)" />
            </div>
          </aside>

          <!-- The Z docket (signature) OR a pending prompt -->
          <section class="flex flex-col items-center gap-4">
            <p v-if="zError" class="pill pill-alert self-start">{{ zError }}</p>
            <div v-else-if="!shifts.length" class="card grid w-full max-w-[420px] place-items-center gap-2 px-6 py-16 text-center text-sm text-steel-500">
              <span class="grid size-12 place-items-center rounded-xl bg-sunken text-steel-400"><i class="pi pi-inbox text-xl" /></span>
              No hay sesiones de caja para mostrar en esta sucursal.
            </div>
            <template v-else-if="selected">
              <div v-if="selected.status === 'closed' && selected.loaded" class="no-print flex w-full max-w-[420px] items-center justify-end gap-1.5">
                <button type="button" class="doc-act" @click="doPrint"><i class="pi pi-print" /> Imprimir</button>
                <button type="button" class="doc-act" @click="flash('Exportando PDF…')"><i class="pi pi-file-pdf" /> PDF</button>
                <button type="button" class="doc-act" @click="flash('Enviado por correo')"><i class="pi pi-envelope" /> Enviar</button>
              </div>

              <!-- Pending: no Z yet -->
              <div v-if="selected.status === 'pending'" class="no-print card grid w-full max-w-[420px] place-items-center gap-3 px-6 py-16 text-center">
                <span class="grid size-12 place-items-center rounded-xl bg-warn/10 text-warn-600"><i class="pi pi-clock text-xl" /></span>
                <p class="font-display text-lg font-bold text-ink">Turno {{ selected.name }} en curso</p>
                <p class="max-w-xs text-sm text-steel-500">Aún no hay Reporte Z. Cuenta el cajón y cierra el turno para generarlo — el efectivo esperado lo calcula la caja al cerrar.</p>
                <Button label="Contar caja y cerrar" icon="pi pi-lock" @click="selected && startClose(selected)" />
              </div>

              <!-- Loading the Z report -->
              <div v-else-if="!selected.loaded" class="card grid w-full max-w-[420px] place-items-center py-20"><i class="pi pi-spin pi-spinner text-2xl text-steel-400" /></div>

              <!-- Closed: the printed docket -->
              <article v-else class="receipt w-full max-w-[420px] bg-paper text-ink">
              <div class="docket-perf h-[7px]" aria-hidden="true" />
              <div class="px-7 py-6 font-mono text-[12px] leading-relaxed">
                <div class="text-center">
                  <p class="font-display text-base font-extrabold tracking-tight text-ink">REPORTE Z</p>
                  <p class="text-[10px] uppercase tracking-[0.22em] text-steel-500">Cierre de turno</p>
                  <p class="mt-3 text-[13px] font-semibold text-ink">{{ selected.z.restaurant }}</p>
                </div>
                <div class="mt-4 flex flex-col gap-0.5 text-steel-600">
                  <div class="flex justify-between"><span>Turno</span><span class="text-ink">{{ selected.name }} · {{ selected.hours }}</span></div>
                  <div class="flex justify-between"><span>Fecha</span><span class="text-ink">{{ selected.dateLong }}</span></div>
                  <div class="flex justify-between"><span>Cajero</span><span class="text-ink">{{ selected.cashier }}</span></div>
                  <div class="flex justify-between"><span>Apertura</span><span class="text-ink tabular-nums">{{ cop(selected.z.arqueo.fondo) }}</span></div>
                </div>

                <ZSection title="Ventas por canal" />
                <div v-for="c in selected.z.channels" :key="c.name" class="flex items-baseline justify-between">
                  <span class="text-steel-700">{{ c.name }}</span>
                  <span class="flex items-baseline gap-2">
                    <span class="text-[10px] text-steel-400">{{ c.count }} {{ c.unit }}</span>
                    <span class="w-24 text-right tabular-nums text-ink">{{ cop(c.amount) }}</span>
                  </span>
                </div>
                <div class="mt-1 flex items-baseline justify-between border-t border-dashed border-line pt-1 font-bold">
                  <span>TOTAL VENTAS BRUTAS</span>
                  <span class="flex items-baseline gap-2"><span class="text-[10px] font-normal text-steel-400">{{ grossTickets(selected.z) }} tickets</span><span class="tabular-nums">{{ cop(grossSales(selected.z)) }}</span></span>
                </div>

                <ZSection title="Descuentos y devoluciones" />
                <div class="flex justify-between text-steel-700"><span>Descuentos <span class="text-[10px] text-steel-400">{{ selected.z.discountOrders }} órd.</span></span><span class="tabular-nums text-alert-600">-{{ cop(selected.z.discounts) }}</span></div>
                <div class="flex justify-between text-steel-700"><span>Devoluciones <span class="text-[10px] text-steel-400">{{ selected.z.returnOrders }} órd.</span></span><span class="tabular-nums text-alert-600">-{{ cop(selected.z.returns) }}</span></div>
                <div class="mt-1 flex justify-between border-t border-dashed border-line pt-1 font-bold"><span>TOTAL NETO</span><span class="tabular-nums">{{ cop(netSales(selected.z)) }}</span></div>

                <ZSection title="Métodos de pago" />
                <div v-for="(p, i) in selected.z.payments" :key="p.name" class="flex items-baseline justify-between text-steel-700">
                  <span>{{ p.name }}</span>
                  <span class="flex items-baseline gap-2"><span class="text-[10px] text-steel-400">{{ selected.z.paymentsPct[i] }}%</span><span class="w-24 text-right tabular-nums text-ink">{{ cop(p.amount) }}</span></span>
                </div>

                <ZSection title="Arqueo de caja" />
                <div class="flex justify-between text-steel-700"><span>Fondo inicial</span><span class="tabular-nums text-ink">{{ cop(selected.z.arqueo.fondo) }}</span></div>
                <div class="flex justify-between text-steel-700"><span>Ingresos efectivo</span><span class="tabular-nums text-ink">{{ cop(selected.z.arqueo.ingresosEfectivo) }}</span></div>
                <div class="flex justify-between text-steel-700"><span>Retiros</span><span class="tabular-nums text-alert-600">-{{ cop(selected.z.arqueo.retiros) }}</span></div>
                <div class="flex justify-between text-steel-700"><span>Efectivo esperado</span><span class="tabular-nums text-ink">{{ cop(expected(selected.z)) }}</span></div>
                <div class="flex justify-between text-steel-700"><span>Efectivo contado</span><span class="tabular-nums text-ink">{{ cop(selected.z.arqueo.contado ?? 0) }}</span></div>
                <div
                  class="mt-2 flex items-center justify-between rounded-lg px-3 py-2 font-bold"
                  :class="{
                    'bg-success/10 text-success-600': diffTone(difference(selected.z)) === 'ok',
                    'bg-warn/10 text-warn-600 heat-warm': diffTone(difference(selected.z)) === 'minor',
                    'bg-alert/10 text-alert-600 heat-hot': diffTone(difference(selected.z)) === 'alert',
                  }"
                >
                  <span class="uppercase tracking-wide">Diferencia</span>
                  <span class="flex items-center gap-2 tabular-nums">
                    {{ copSigned(difference(selected.z)) }}
                    <i v-if="difference(selected.z) < 0" class="pi pi-exclamation-triangle text-[11px]" />
                    <i v-else-if="difference(selected.z) > 0" class="pi pi-arrow-up text-[11px]" />
                    <i v-else class="pi pi-check text-[11px]" />
                  </span>
                </div>
                <p class="mt-1 text-center text-[10px] uppercase tracking-wide text-steel-400">
                  {{ difference(selected.z) < 0 ? 'Faltante' : difference(selected.z) > 0 ? 'Sobrante' : 'Caja cuadrada' }}
                </p>

                <ZSection title="Impuestos" />
                <div class="flex justify-between text-steel-700"><span>IVA generado (19%)</span><span class="tabular-nums text-ink">{{ cop(selected.z.taxes.iva) }}</span></div>
                <div class="flex justify-between text-steel-700"><span>INC (8% bebidas)</span><span class="tabular-nums text-ink">{{ cop(selected.z.taxes.inc) }}</span></div>
                <div class="flex justify-between text-steel-700"><span>Impoconsumo (8%)</span><span class="tabular-nums text-ink">{{ cop(selected.z.taxes.impoconsumo) }}</span></div>

                <ZSection title="Resumen operativo" />
                <div class="flex justify-between text-steel-700"><span>Ticket promedio</span><span class="tabular-nums text-ink">{{ cop(selected.z.operative.ticketPromedio) }}</span></div>
                <div class="flex justify-between text-steel-700"><span>Hora más activa</span><span class="text-right text-ink">{{ selected.z.operative.horaActiva }}</span></div>
                <div class="flex justify-between text-steel-700"><span>Producto más vendido</span><span class="text-right text-ink">{{ selected.z.operative.productoTop }}</span></div>
                <div class="flex justify-between text-steel-700"><span>Mesero con más ventas</span><span class="text-right text-ink">{{ selected.z.operative.meseroTop }}</span></div>

                <template v-if="selected.z.observations">
                  <ZSection title="Observaciones del cajero" />
                  <p class="text-steel-600">“{{ selected.z.observations }}”</p>
                </template>

                <p class="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-steel-400">— fin del reporte —</p>
              </div>
              <div class="docket-perf h-[7px] rotate-180" aria-hidden="true" />
            </article>
            </template>
          </section>
        </div>

        <!-- ══ RESUMEN (dashboard) ══ -->
        <div v-else-if="tab === 'Resumen'" class="flex flex-col gap-5">
          <p v-if="resumenError" class="pill pill-alert self-start">{{ resumenError }}</p>
          <!-- KPI row (2 rows of 3, per the brief — peso figures need the width) -->
          <section class="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard v-for="k in kpis" :key="k.label" v-bind="k" />
          </section>

          <!-- Charts row 1 -->
          <section class="grid gap-5 lg:grid-cols-2">
            <div class="card flex flex-col gap-4 p-5">
              <div class="flex items-center justify-between">
                <span class="eyebrow">Ingresos vs gastos · 7 días</span>
                <div class="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wide text-steel-500">
                  <span class="flex items-center gap-1"><span class="size-2 rounded-sm bg-success" />Ingresos</span>
                  <span class="flex items-center gap-1"><span class="size-2 rounded-sm bg-alert" />Gastos</span>
                  <span class="flex items-center gap-1"><span class="h-0.5 w-3 rounded bg-info" />Utilidad</span>
                </div>
              </div>
              <GroupedBars :data="daily" />
            </div>

            <div class="card flex flex-col gap-4 p-5">
              <span class="eyebrow">Distribución de ingresos</span>
              <div class="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                <DonutChart :segments="channels" center-top="Total" :center-bottom="copShort(revenueTotal)" />
                <ul class="flex flex-1 flex-col gap-2">
                  <li v-for="c in channels" :key="c.name" class="flex items-center gap-2">
                    <span class="size-2.5 shrink-0 rounded-full" :class="c.dot" />
                    <span class="min-w-0 flex-1 truncate text-[13px] text-ink">{{ c.name }}</span>
                    <span class="shrink-0 font-mono text-[12px] tabular-nums text-ink">{{ copShort(c.amount) }}</span>
                    <span class="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-steel-500">{{ c.pct }}%</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <!-- Charts row 2 -->
          <section class="grid gap-5 lg:grid-cols-2">
            <div class="card flex flex-col gap-4 p-5">
              <div class="flex items-center justify-between">
                <span class="eyebrow">Flujo de caja · este mes</span>
                <span class="pill pill-success">saludable</span>
              </div>
              <CashFlowLine :points="cashFlow" :threshold="cashThreshold" />
            </div>

            <div class="card flex flex-col gap-4 p-5">
              <span class="eyebrow">Top 5 productos</span>
              <RankBars :items="topProducts" />
            </div>
          </section>

          <!-- Alerts -->
          <section v-if="alerts.length" class="card overflow-hidden">
            <div class="flex items-center gap-2 border-b border-line bg-warn/[0.06] px-5 py-3">
              <i class="pi pi-exclamation-triangle text-warn-600" />
              <span class="font-mono text-[12px] font-semibold uppercase tracking-wide text-warn-600">{{ alerts.length }} alertas activas</span>
            </div>
            <ul class="divide-y divide-hairline">
              <li v-for="(a, i) in alerts" :key="i" class="flex items-center gap-3 px-5 py-3">
                <span class="size-2 rounded-full bg-warn" />
                <span class="text-[13px] text-ink">{{ a.text }}</span>
              </li>
            </ul>
          </section>

          <!-- Manager indicators -->
          <section class="card overflow-hidden">
            <div class="border-b border-line px-5 py-3"><span class="eyebrow">Indicadores gerenciales · este mes</span></div>
            <ul class="grid sm:grid-cols-2 lg:grid-cols-3">
              <li v-for="m in managerKpis" :key="m.name" class="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3 [&:nth-last-child(-n+1)]:border-b-0">
                <span class="min-w-0">
                  <span class="block truncate text-[13px] text-ink">{{ m.name }}</span>
                  <span v-if="m.note" class="font-mono text-[10px] text-steel-400">{{ m.note }}</span>
                </span>
                <span class="flex shrink-0 items-center gap-1.5">
                  <span class="font-mono text-[14px] font-semibold tabular-nums text-ink">{{ m.value }}</span>
                  <i v-if="STATUS_META[m.status].icon" :class="['pi', STATUS_META[m.status].icon, STATUS_META[m.status].class, 'text-[12px]']" />
                </span>
              </li>
            </ul>
          </section>
        </div>

        <!-- ══ INGRESOS ══ -->
        <div v-else-if="tab === 'Ingresos'" class="flex flex-col gap-5">
          <section class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard v-for="s in incomeStats" :key="s.label" v-bind="s" />
          </section>

          <section class="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div v-for="c in channelIncome" :key="c.name" class="card flex flex-col gap-1.5 p-4">
              <span class="flex items-center gap-1.5 eyebrow"><span class="size-2 rounded-full" :class="c.dot" />{{ c.name }}</span>
              <span class="font-mono text-xl font-bold tabular-nums text-ink">{{ cop(c.amount) }}</span>
              <span class="font-mono text-[11px] text-steel-500">{{ c.count }}</span>
            </div>
          </section>

          <div class="grid gap-5 lg:grid-cols-[1fr_296px]">
            <!-- transactions -->
            <div class="card overflow-hidden">
              <div class="flex flex-wrap items-center gap-2 border-b border-line p-4">
                <span class="eyebrow mr-1">Transacciones</span>
                <Select v-model="txChannelFilter" :options="txChannelOptions" option-label="label" option-value="value" size="small" class="w-40" />
                <Select v-model="txMethodFilter" :options="txMethodOptions" option-label="label" option-value="value" size="small" class="w-40" />
              </div>
              <div class="overflow-x-auto">
                <table class="w-full min-w-[720px] text-left">
                  <thead>
                    <tr class="border-b border-line bg-sunken font-mono text-[10px] uppercase tracking-wide text-steel-500">
                      <th class="px-3 py-2 font-medium">Hora</th>
                      <th class="px-3 py-2 font-medium">Orden</th>
                      <th class="px-3 py-2 font-medium">Canal</th>
                      <th class="px-3 py-2 text-right font-medium">Total</th>
                      <th class="px-3 py-2 font-medium">Pago</th>
                      <th class="px-3 py-2 font-medium">Cajero</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in pagedTx" :key="t.order" class="cursor-pointer border-b border-hairline transition last:border-b-0 hover:bg-app/50" @click="selectedTx = t">
                      <td class="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] tabular-nums text-steel-600">{{ t.time }}</td>
                      <td class="px-3 py-2.5 font-mono text-[12px] text-ink">{{ t.order }}</td>
                      <td class="px-3 py-2.5 text-[12px] text-ink"><i :class="['pi', CH_ICON[t.channelKind], 'mr-1 text-[10px] text-steel-400']" />{{ t.channel }}</td>
                      <td class="px-3 py-2.5 text-right font-mono text-[12px] font-semibold tabular-nums text-ink">{{ cop(t.total) }}</td>
                      <td class="px-3 py-2.5"><span class="pill pill-neutral">{{ t.method }}</span></td>
                      <td class="px-3 py-2.5 text-[12px] text-steel-600">{{ t.cashier }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="flex items-center justify-between border-t border-line px-4 py-2.5">
                <span class="font-mono text-[11px] text-steel-500">Mostrando {{ filteredTx.length ? (txPage - 1) * TX_PER_PAGE + 1 : 0 }}–{{ Math.min(txPage * TX_PER_PAGE, filteredTx.length) }} de {{ filteredTx.length }} · <span class="text-steel-400">147 en el período</span></span>
                <div class="flex gap-1">
                  <button type="button" class="grid size-7 place-items-center rounded-md border border-line text-steel-500 transition hover:bg-sunken disabled:opacity-40" :disabled="txPage === 1" @click="txPage--"><i class="pi pi-chevron-left text-[11px]" /></button>
                  <button type="button" class="grid size-7 place-items-center rounded-md border border-line text-steel-500 transition hover:bg-sunken disabled:opacity-40" :disabled="txPage * TX_PER_PAGE >= filteredTx.length" @click="txPage++"><i class="pi pi-chevron-right text-[11px]" /></button>
                </div>
              </div>
            </div>
            <!-- payment donut -->
            <div class="card flex flex-col gap-4 self-start p-5">
              <span class="eyebrow">Por método de pago</span>
              <DonutChart :segments="paymentMethods" center-top="Total" :center-bottom="copShort(paymentsTotal)" />
              <ul class="flex flex-col gap-2">
                <li v-for="p in paymentMethods" :key="p.name" class="flex items-center gap-2">
                  <span class="size-2.5 shrink-0 rounded-full" :class="p.dot" />
                  <span class="min-w-0 flex-1 truncate text-[13px] text-ink">{{ p.name }}</span>
                  <span class="shrink-0 font-mono text-[12px] tabular-nums text-ink">{{ copShort(p.amount) }}</span>
                  <span class="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-steel-500">{{ p.pct }}%</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- ══ GASTOS (real expense ledger) ══ -->
        <div v-else-if="tab === 'Gastos'" class="flex flex-col gap-5">
          <p v-if="gastosError" class="pill pill-alert self-start">{{ gastosError }}</p>

          <section class="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard v-for="s in expenseStats" :key="s.label" v-bind="s" />
          </section>

          <!-- category bars (click to filter) -->
          <section v-if="expenseByCategory.length" class="card flex flex-col gap-3 p-5">
            <span class="eyebrow">Gastos por categoría</span>
            <button
              v-for="c in expenseByCategory" :key="c.id"
              type="button"
              class="flex flex-col gap-1 rounded-lg px-2 py-1.5 text-left transition"
              :class="expenseCategoryFilter === c.id ? 'bg-ember-50' : 'hover:bg-app/50'"
              @click="expenseCategoryFilter = expenseCategoryFilter === c.id ? null : c.id"
            >
              <div class="flex items-baseline justify-between">
                <span class="text-[13px] text-ink">{{ c.name }}</span>
                <span class="font-mono text-[12px] font-semibold tabular-nums text-ink">{{ cop(c.value) }} <span class="ml-1 text-[10px] font-normal text-steel-400">{{ c.sub }}</span></span>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-sunken">
                <div class="h-full rounded-full" :style="{ width: c.sub, backgroundColor: 'var(--color-ember)' }" />
              </div>
            </button>
          </section>

          <div class="grid gap-5 lg:grid-cols-[1fr_296px]">
            <!-- expenses table -->
            <div class="card overflow-hidden">
              <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
                <span class="flex items-center gap-2 eyebrow">
                  Gastos
                  <button v-if="expenseCategoryFilter" type="button" class="pill pill-warn" @click="expenseCategoryFilter = null">{{ categoryName(expenseCategoryFilter) }} ✕</button>
                </span>
                <Button v-if="canManageFinance" label="Registrar gasto" icon="pi pi-plus" size="small" @click="openRegistrar" />
              </div>
              <div class="overflow-x-auto">
                <table class="w-full min-w-[520px] text-left">
                  <thead>
                    <tr class="border-b border-line bg-sunken font-mono text-[10px] uppercase tracking-wide text-steel-500">
                      <th class="px-3 py-2 font-medium">Fecha</th>
                      <th class="px-3 py-2 font-medium">Categoría</th>
                      <th class="px-3 py-2 font-medium">Descripción</th>
                      <th class="px-3 py-2 text-right font-medium">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="e in filteredExpenses" :key="e.id" class="border-b border-hairline transition last:border-b-0 hover:bg-app/50">
                      <td class="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] tabular-nums text-steel-600">{{ fmtExpenseDate(e.incurred_at) }}</td>
                      <td class="px-3 py-2.5 text-[12px] text-ink">{{ categoryName(e.expense_category_id) }}</td>
                      <td class="px-3 py-2.5 text-[12px] text-ink">{{ e.description }}</td>
                      <td class="px-3 py-2.5 text-right font-mono text-[12px] font-semibold tabular-nums text-alert-600">{{ cop(Number(e.amount)) }}</td>
                    </tr>
                    <tr v-if="!filteredExpenses.length">
                      <td colspan="4" class="px-3 py-10 text-center text-sm text-steel-500">No hay gastos registrados en este período.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div class="flex flex-col gap-5 self-start">
              <!-- category management (absorbed from the old expenses-only view) -->
              <div class="card p-5">
                <CategoriesArea :can-manage="canManageFinance" />
              </div>
              <!-- presupuesto — próxima entrega -->
              <div class="card flex flex-col items-center gap-2 px-5 py-10 text-center">
                <span class="grid size-10 place-items-center rounded-xl bg-sunken text-steel-400"><i class="pi pi-gauge" /></span>
                <span class="eyebrow">Presupuesto vs real</span>
                <p class="max-w-[200px] text-[12px] text-steel-500">Los presupuestos por categoría y los gastos recurrentes llegan cuando el backend los soporte.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- ══ RENTABILIDAD ══ -->
        <div v-else-if="tab === 'Rentabilidad'" class="grid gap-5 lg:grid-cols-2">
          <!-- P&L statement -->
          <div class="card flex flex-col p-6 font-mono text-[13px]">
            <div class="mb-3 border-b border-line pb-3">
              <div class="flex items-center justify-between gap-2">
                <p class="font-display text-base font-extrabold tracking-tight text-ink">Estado de resultados</p>
                <span v-if="pl?.cogs_partial" class="rounded-full bg-warn/10 px-2 py-0.5 text-[10px] font-semibold text-warn-600">costeo parcial</span>
              </div>
              <p class="text-[11px] text-steel-500">Período: {{ period.from }} → {{ period.to }}</p>
            </div>
            <p v-if="!pl" class="py-8 text-center text-[12px] text-steel-500">{{ resumenLoading ? 'Cargando…' : 'Sin datos para el período.' }}</p>
            <div v-else class="flex flex-col gap-0.5">
              <template v-for="(r, i) in pnl" :key="i">
                <p v-if="r.kind === 'header'" class="mt-3 mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel-500">{{ r.label }}</p>
                <div v-else-if="r.kind === 'line'" class="flex justify-between pl-3 text-steel-700">
                  <span>{{ r.label }}</span><span class="tabular-nums text-ink">{{ copSigned(r.amount!) }}</span>
                </div>
                <div v-else-if="r.kind === 'subtotal'" class="mt-0.5 flex items-baseline justify-between border-t border-dashed border-line pt-1 font-bold text-ink">
                  <span>{{ r.label }}</span>
                  <span class="flex items-baseline gap-2"><span v-if="r.pct" class="text-[10px] font-normal text-steel-400">{{ r.pct }}%</span><span class="tabular-nums">{{ copSigned(r.amount!) }}</span></span>
                </div>
                <div
                  v-else class="mt-1.5 flex items-baseline justify-between rounded-lg px-3 py-2 font-bold"
                  :class="{ 'bg-success/10 text-success-600': r.tone === 'income', 'bg-info/10 text-info-600': r.tone === 'profit', 'bg-alert/10 text-alert-600': r.tone === 'expense' }"
                >
                  <span class="uppercase tracking-wide">{{ r.label }}</span>
                  <span class="flex items-baseline gap-2"><span v-if="r.pct" class="text-[11px] font-normal opacity-70">{{ r.pct }}%</span><span class="tabular-nums">{{ copSigned(r.amount!) }}</span></span>
                </div>
              </template>
            </div>
          </div>

          <div class="flex flex-col gap-5">
            <!-- margen por canal -->
            <div class="card overflow-hidden">
              <div class="border-b border-line px-5 py-3"><span class="eyebrow">Margen por canal</span></div>
              <div class="overflow-x-auto">
                <table class="w-full min-w-[400px] text-left">
                  <thead>
                    <tr class="border-b border-line bg-sunken font-mono text-[10px] uppercase tracking-wide text-steel-500">
                      <th class="px-4 py-2 font-medium">Canal</th>
                      <th class="px-4 py-2 text-right font-medium">Ingresos</th>
                      <th class="px-4 py-2 text-right font-medium">Costo</th>
                      <th class="px-4 py-2 text-right font-medium">Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="m in marginByChannel" :key="m.channel" class="border-b border-hairline last:border-b-0">
                      <td class="px-4 py-2.5 text-[13px] text-ink">{{ m.channel }}</td>
                      <td class="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink">{{ copShort(m.income) }}</td>
                      <td class="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-alert-600">{{ copShort(m.cost) }}</td>
                      <td class="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-success-600">{{ copShort(m.margin) }} <span class="text-steel-400">{{ m.pct }}%</span></td>
                    </tr>
                    <tr v-if="!marginByChannel.length">
                      <td colspan="4" class="px-4 py-6 text-center text-[12px] text-steel-500">Sin ventas en el período.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- break-even -->
            <div v-if="breakeven" class="card flex flex-col gap-3 border-l-[3px] border-l-info p-5">
              <span class="flex items-center gap-2 eyebrow"><i class="pi pi-flag text-info-600" /> Punto de equilibrio</span>
              <div class="flex flex-col gap-1 font-mono text-[13px]">
                <div class="flex justify-between text-steel-600"><span>Gastos fijos del período</span><span class="tabular-nums text-ink">{{ cop(breakeven.fixed) }}</span></div>
                <div class="flex justify-between text-steel-600"><span>Margen de contribución</span><span class="tabular-nums text-ink">{{ breakeven.contribution }}%</span></div>
              </div>
              <template v-if="breakeven.available">
                <div class="rounded-lg bg-info/8 p-3">
                  <p class="mb-1 font-mono text-[10px] uppercase tracking-wide text-steel-500">Debes vender al menos</p>
                  <div class="flex flex-col gap-0.5 font-mono text-[13px]">
                    <div class="flex justify-between"><span class="text-steel-600">en el período</span><b class="tabular-nums text-info-600">{{ cop(breakeven.period) }}</b></div>
                    <div class="flex justify-between"><span class="text-steel-600">por día</span><span class="tabular-nums text-ink">{{ cop(breakeven.daily) }}</span></div>
                  </div>
                </div>
                <p v-if="breakeven.surplus >= 0" class="flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-2 text-[12px] font-medium text-success-600"><i class="pi pi-check-circle text-[11px]" /> Superado en {{ cop(breakeven.surplus) }} este período</p>
                <p v-else class="flex items-center gap-1.5 rounded-lg bg-alert/10 px-3 py-2 text-[12px] font-medium text-alert-600"><i class="pi pi-exclamation-triangle text-[11px]" /> Faltan {{ cop(breakeven.surplus) }} para el equilibrio</p>
              </template>
              <p v-else class="flex items-center gap-1.5 rounded-lg bg-warn/10 px-3 py-2 text-[12px] font-medium text-warn-600"><i class="pi pi-info-circle text-[11px]" /> Margen de contribución no positivo: el punto de equilibrio no está definido.</p>
            </div>
          </div>
        </div>

        <!-- ══ REPORTES ══ -->
        <div v-else-if="tab === 'Reportes'" class="flex flex-col gap-6">
          <section class="flex flex-col gap-3">
            <span class="eyebrow px-1">Reportes operativos</span>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <button v-for="r in reportsOperativos" :key="r.key" type="button" class="card flex flex-col gap-2 p-5 text-left transition hover:border-ember/50 hover:shadow-md" @click="openReport(r)">
                <span class="grid size-9 place-items-center rounded-lg bg-ember/10 text-ember"><i :class="['pi', r.icon, 'text-base']" /></span>
                <span class="mt-1 text-[14px] font-semibold text-ink">{{ r.title }}</span>
                <span class="text-[12px] leading-snug text-steel-500">{{ r.desc }}</span>
                <span class="mt-1 font-mono text-[11px] uppercase tracking-wide text-ember">Generar →</span>
              </button>
            </div>
          </section>
          <section class="flex flex-col gap-3">
            <span class="eyebrow px-1">Reportes financieros</span>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <button v-for="r in reportsFinancieros" :key="r.key" type="button" class="card flex flex-col gap-2 p-5 text-left transition hover:border-ember/50 hover:shadow-md" @click="openReport(r)">
                <span class="grid size-9 place-items-center rounded-lg bg-ember/10 text-ember"><i :class="['pi', r.icon, 'text-base']" /></span>
                <span class="mt-1 text-[14px] font-semibold text-ink">{{ r.title }}</span>
                <span class="text-[12px] leading-snug text-steel-500">{{ r.desc }}</span>
                <span class="mt-1 font-mono text-[11px] uppercase tracking-wide text-ember">Generar →</span>
              </button>
            </div>
          </section>
        </div>

        <!-- ══ fallback ══ -->
        <div v-else class="card grid place-items-center px-6 py-20 text-center">
          <span class="grid size-12 place-items-center rounded-xl bg-ember/10 text-ember"><i class="pi pi-chart-bar text-xl" /></span>
          <h2 class="mt-4 font-display text-xl font-bold text-ink">{{ tab }}</h2>
          <p class="mt-1 max-w-md text-sm text-steel-500">Esta pestaña llega en la próxima entrega. El Reporte Z ya está listo y es la pieza operativa central del módulo.</p>
          <button type="button" class="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-ember transition hover:text-ember-600" @click="tab = 'Reporte Z'">← Ver Reporte Z</button>
        </div>
      </div>
    </main>

    <!-- Cerrar turno: contar el cajón -->
    <Dialog v-model:visible="closeOpen" modal :closable="true" :draggable="false" :style="{ width: '30rem' }">
      <template #header>
        <div>
          <p class="eyebrow">Cierre de turno · paso {{ step }} de 3</p>
          <p class="font-display text-lg font-bold text-ink">{{ step === 1 ? 'Arqueo de caja' : step === 2 ? 'Observaciones' : 'Confirmar cierre' }}</p>
        </div>
      </template>

      <div v-if="step === 1" class="flex flex-col gap-4">
        <p class="text-sm text-steel-500">Cuenta el efectivo del cajón. La diferencia se calcula en vivo.</p>
        <div class="grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <p class="eyebrow mb-1.5">Billetes</p>
            <div class="flex flex-col gap-1">
              <div v-for="r in billRows" :key="r.key" class="flex items-center gap-2">
                <span class="w-16 font-mono text-[12px] tabular-nums text-steel-600">{{ cop(r.d) }}</span>
                <span class="text-steel-400">×</span>
                <input v-model.number="counts[r.key]" type="number" min="0" class="w-14 rounded-md border border-line bg-paper px-2 py-1 text-center font-mono text-[12px] tabular-nums text-ink focus:border-ember focus:outline-none" />
                <span class="ml-auto w-20 text-right font-mono text-[11px] tabular-nums text-steel-500">{{ cop(r.sub) }}</span>
              </div>
            </div>
          </div>
          <div>
            <p class="eyebrow mb-1.5">Monedas</p>
            <div class="flex flex-col gap-1">
              <div v-for="r in coinRows" :key="r.key" class="flex items-center gap-2">
                <span class="w-16 font-mono text-[12px] tabular-nums text-steel-600">{{ cop(r.d) }}</span>
                <span class="text-steel-400">×</span>
                <input v-model.number="counts[r.key]" type="number" min="0" class="w-14 rounded-md border border-line bg-paper px-2 py-1 text-center font-mono text-[12px] tabular-nums text-ink focus:border-ember focus:outline-none" />
                <span class="ml-auto w-20 text-right font-mono text-[11px] tabular-nums text-steel-500">{{ cop(r.sub) }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-1 rounded-lg border border-line bg-app/50 p-3 font-mono text-[13px]">
          <div class="flex justify-between text-steel-600"><span>Total contado</span><b class="tabular-nums text-ink">{{ cop(countedTotal) }}</b></div>
          <div class="flex justify-between text-steel-600"><span>Esperado</span><span class="tabular-nums">{{ closeExpected != null ? cop(closeExpected) : 'se calcula al cerrar' }}</span></div>
          <div
            v-if="closeDiff != null"
            class="mt-1 flex justify-between rounded-md px-2 py-1 font-bold"
            :class="closeDiff === 0 ? 'bg-success/10 text-success-600' : Math.abs(closeDiff) <= 5000 ? 'bg-warn/10 text-warn-600' : 'bg-alert/10 text-alert-600'"
          >
            <span class="uppercase tracking-wide">Diferencia</span><span class="tabular-nums">{{ copSigned(closeDiff) }}</span>
          </div>
          <p v-else class="mt-1 text-center text-[10px] uppercase tracking-wide text-steel-400">La diferencia la calcula la caja al cerrar</p>
        </div>
      </div>

      <div v-else-if="step === 2" class="flex flex-col gap-4">
        <label class="flex flex-col gap-1.5">
          <span class="eyebrow">Observaciones del cierre</span>
          <textarea v-model="closeNote" rows="3" placeholder="Ej: el faltante fue error de vuelto…" class="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-steel-400 focus:border-ember focus:outline-none" />
        </label>
        <label class="flex items-center justify-between rounded-lg border border-line bg-app/50 px-3 py-2.5">
          <span class="text-sm font-medium text-ink">¿Hubo incidente en caja?</span>
          <input v-model="hadIncident" type="checkbox" class="size-4 accent-[var(--color-ember)]" />
        </label>
        <label v-if="hadIncident" class="flex flex-col gap-1.5">
          <span class="eyebrow">Describe el incidente</span>
          <textarea v-model="incidentText" rows="2" class="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-ember focus:outline-none" />
        </label>
      </div>

      <div v-else class="flex flex-col gap-4">
        <div class="flex flex-col gap-1 rounded-lg border border-line bg-app/50 p-3 font-mono text-[13px]">
          <div class="flex justify-between text-steel-600"><span>Efectivo contado</span><b class="tabular-nums text-ink">{{ cop(countedTotal) }}</b></div>
          <div class="flex justify-between text-steel-600"><span>Esperado</span><span class="tabular-nums">{{ closeExpected != null ? cop(closeExpected) : 'se calcula al cerrar' }}</span></div>
          <div v-if="closeDiff != null" class="flex justify-between font-bold" :class="closeDiff < 0 ? 'text-alert-600' : closeDiff > 0 ? 'text-warn-600' : 'text-success-600'"><span>Diferencia</span><span class="tabular-nums">{{ copSigned(closeDiff) }}</span></div>
        </div>
        <p class="rounded-lg bg-alert/10 px-3 py-2 text-[12px] text-alert-600"><i class="pi pi-exclamation-triangle text-[10px]" /> Al cerrar, el turno queda bloqueado. Esta acción no se puede deshacer.</p>
      </div>

      <template #footer>
        <Button v-if="step > 1" label="Atrás" text severity="secondary" @click="step--" />
        <Button v-if="step < 3" label="Continuar" icon="pi pi-arrow-right" icon-pos="right" @click="step++" />
        <Button v-else label="Cerrar turno definitivamente" icon="pi pi-lock" severity="danger" :loading="closeBusy" @click="confirmClose" />
      </template>
    </Dialog>

    <!-- Transacción · detalle -->
    <Dialog :visible="!!selectedTx" modal :closable="true" :draggable="false" :style="{ width: '24rem' }" @update:visible="(v: boolean) => { if (!v) selectedTx = null }">
      <template #header>
        <div>
          <p class="eyebrow">{{ selectedTx?.order }}</p>
          <p class="font-display text-lg font-bold text-ink">{{ selectedTx?.channel }} · {{ selectedTx?.time }}</p>
        </div>
      </template>
      <div v-if="selectedTx" class="flex flex-col gap-4">
        <ul class="flex flex-col gap-1.5">
          <li v-for="(it, i) in selectedTx.items" :key="i" class="flex items-baseline justify-between text-[13px]">
            <span class="text-ink"><span class="mr-1.5 font-mono text-[11px] text-steel-400">{{ it.qty }}×</span>{{ it.name }}</span>
            <span class="font-mono tabular-nums text-steel-600">{{ cop(it.price * it.qty) }}</span>
          </li>
        </ul>
        <div class="flex flex-col gap-1 border-t border-line pt-3 font-mono text-[12px]">
          <div class="flex justify-between text-steel-600"><span>Subtotal</span><span class="tabular-nums">{{ cop(selectedTx.subtotal) }}</span></div>
          <div v-if="selectedTx.discount" class="flex justify-between text-steel-600"><span>Descuento</span><span class="tabular-nums text-alert-600">-{{ cop(selectedTx.discount) }}</span></div>
          <div class="flex justify-between text-steel-600"><span>Impuesto</span><span class="tabular-nums">{{ cop(selectedTx.tax) }}</span></div>
          <div class="mt-0.5 flex justify-between border-t border-dashed border-line pt-1 font-bold text-ink"><span>Total</span><span class="tabular-nums">{{ cop(selectedTx.total) }}</span></div>
        </div>
        <div class="flex items-center justify-between rounded-lg bg-app/50 px-3 py-2 text-[12px]">
          <span class="text-steel-500">Pago · {{ selectedTx.method }}</span>
          <span class="text-steel-500">Cajero · <b class="text-ink">{{ selectedTx.cashier }}</b></span>
        </div>
      </div>
      <template #footer>
        <Button label="Imprimir recibo" icon="pi pi-print" text severity="secondary" @click="flash('Enviando a impresora…')" />
      </template>
    </Dialog>

    <!-- Registrar gasto -->
    <Dialog v-model:visible="registrarOpen" modal :closable="true" :draggable="false" :style="{ width: '28rem' }">
      <template #header><div><p class="eyebrow">Gastos</p><p class="font-display text-lg font-bold text-ink">Registrar gasto</p></div></template>
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1.5"><span class="eyebrow">Fecha</span><input v-model="newExpense.date" type="date" class="rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-ember focus:outline-none" /></label>
          <label class="flex flex-col gap-1.5"><span class="eyebrow">Categoría</span><Select v-model="newExpense.category" :options="categoryOptions" option-label="label" option-value="value" filter /></label>
        </div>
        <label class="flex flex-col gap-1.5"><span class="eyebrow">Descripción</span><input v-model="newExpense.desc" type="text" placeholder="Compra churrasco 10kg" class="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-steel-400 focus:border-ember focus:outline-none" /></label>
        <label class="flex flex-col gap-1.5"><span class="eyebrow">Monto</span><input v-model="newExpense.amount" type="number" min="0" placeholder="0" class="rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm tabular-nums text-ink focus:border-ember focus:outline-none" /></label>
        <p class="font-mono text-[10px] text-steel-400">La fecha vacía registra el gasto con la fecha de hoy.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" text severity="secondary" @click="registrarOpen = false" />
        <Button label="Crear gasto" icon="pi pi-check" :disabled="!newExpense.desc || !newExpense.category || !Number(newExpense.amount)" :loading="registrarBusy" @click="saveExpense" />
      </template>
    </Dialog>

    <!-- Reporte generado -->
    <Dialog :visible="!!reportModal" modal :closable="true" :draggable="false" :style="{ width: '62rem' }" class="max-w-[95vw]" @update:visible="(v: boolean) => { if (!v) reportModal = null }">
      <template #header>
        <div class="flex w-full items-center justify-between gap-3 pr-6">
          <div>
            <p class="eyebrow">Reporte · 1–10 Agosto 2025</p>
            <p class="font-display text-lg font-bold text-ink">{{ reportModal?.title }}</p>
          </div>
          <button type="button" class="doc-act" @click="flash('Exportando Excel…')"><i class="pi pi-file-excel" /> Excel</button>
        </div>
      </template>

      <!-- Ventas por producto (sortable) -->
      <div v-if="reportModal?.key === 'producto'" class="overflow-x-auto">
        <table class="w-full min-w-[680px] text-left">
          <thead>
            <tr class="border-b border-line bg-sunken font-mono text-[10px] uppercase tracking-wide text-steel-500">
              <th class="px-3 py-2 font-medium">#</th>
              <th class="cursor-pointer px-3 py-2 font-medium hover:text-ink" @click="sortProducts('name')">Producto</th>
              <th class="px-3 py-2 font-medium">Categoría</th>
              <th class="cursor-pointer px-3 py-2 text-right font-medium hover:text-ink" @click="sortProducts('units')">Uds</th>
              <th class="cursor-pointer px-3 py-2 text-right font-medium hover:text-ink" @click="sortProducts('income')">Ingresos</th>
              <th class="cursor-pointer px-3 py-2 text-right font-medium hover:text-ink" @click="sortProducts('marginPct')">Margen</th>
              <th class="cursor-pointer px-3 py-2 text-right font-medium hover:text-ink" @click="sortProducts('share')">% total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, i) in sortedProducts" :key="p.name" class="border-b border-hairline last:border-b-0 hover:bg-app/50">
              <td class="px-3 py-2.5 font-mono text-[11px] text-steel-400">{{ i + 1 }}</td>
              <td class="px-3 py-2.5 text-[13px] font-medium text-ink">{{ p.name }}</td>
              <td class="px-3 py-2.5 text-[12px] text-steel-500">{{ p.category }}</td>
              <td class="px-3 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink">{{ p.units }}</td>
              <td class="px-3 py-2.5 text-right">
                <span class="font-mono text-[12px] font-semibold tabular-nums text-ink">{{ cop(p.income) }}</span>
                <span class="mt-1 block h-1 rounded-full bg-sunken"><span class="block h-full rounded-full bg-success" :style="{ width: (p.income / productMaxIncome) * 100 + '%' }" /></span>
              </td>
              <td class="px-3 py-2.5 text-right font-mono text-[12px] tabular-nums text-success-600">{{ p.marginPct }}%</td>
              <td class="px-3 py-2.5 text-right font-mono text-[12px] tabular-nums text-steel-500">{{ p.share }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Ventas por hora (heatmap) -->
      <div v-else-if="reportModal?.key === 'hora'" class="overflow-x-auto">
        <table class="mx-auto text-center">
          <thead>
            <tr class="font-mono text-[10px] uppercase tracking-wide text-steel-500">
              <th class="px-2 py-1" />
              <th v-for="d in HEAT_DAYS" :key="d" class="px-2 py-1 font-medium">{{ d }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in heatmap" :key="ri">
              <td class="pr-2 text-right font-mono text-[10px] tabular-nums text-steel-500">{{ HEAT_HOURS[ri] }}h</td>
              <td v-for="(cell, ci) in row" :key="ci" class="p-0.5">
                <span class="block size-9 rounded-md" :style="{ backgroundColor: heatColor(cell.v) }" :title="`${HEAT_DAYS[ci]} ${cell.h}h · intensidad ${Math.round(cell.v * 100)}%`" />
              </td>
            </tr>
          </tbody>
        </table>
        <div class="mt-4 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-wide text-steel-500">
          <span>bajo</span>
          <span class="h-2.5 w-24 rounded-full" style="background: linear-gradient(90deg, white, var(--color-ember), var(--color-alert))" />
          <span>pico</span>
        </div>
      </div>

      <!-- Flujo de caja (money-in / money-out, cash-basis) -->
      <div v-else-if="reportModal?.key === 'flujo'" class="flex flex-col gap-5">
        <p v-if="!cashFlowData" class="py-10 text-center text-sm text-steel-500">Sin movimientos de dinero en el período.</p>
        <template v-else>
          <div class="grid gap-4 sm:grid-cols-2">
            <!-- Entradas -->
            <div class="card overflow-hidden">
              <div class="flex items-center justify-between border-b border-line px-5 py-3">
                <span class="eyebrow">Entradas</span>
                <span class="font-mono text-[13px] font-semibold tabular-nums text-success-600">{{ cop(Number(cashFlowData.inflows)) }}</span>
              </div>
              <ul class="divide-y divide-hairline">
                <li v-for="c in cashInflows" :key="c.category" class="flex items-center justify-between px-5 py-2.5">
                  <span class="text-[13px] text-ink">{{ c.category }}</span>
                  <span class="font-mono text-[12px] tabular-nums text-ink">{{ cop(Number(c.amount)) }}</span>
                </li>
                <li v-if="!cashInflows.length" class="px-5 py-4 text-center text-[12px] text-steel-500">Sin entradas.</li>
              </ul>
            </div>
            <!-- Salidas -->
            <div class="card overflow-hidden">
              <div class="flex items-center justify-between border-b border-line px-5 py-3">
                <span class="eyebrow">Salidas</span>
                <span class="font-mono text-[13px] font-semibold tabular-nums text-alert-600">{{ cop(Number(cashFlowData.outflows)) }}</span>
              </div>
              <ul class="divide-y divide-hairline">
                <li v-for="c in cashOutflows" :key="c.category" class="flex items-center justify-between px-5 py-2.5">
                  <span class="text-[13px] text-ink">{{ c.category }}</span>
                  <span class="font-mono text-[12px] tabular-nums text-alert-600">{{ cop(Number(c.amount)) }}</span>
                </li>
                <li v-if="!cashOutflows.length" class="px-5 py-4 text-center text-[12px] text-steel-500">Sin salidas.</li>
              </ul>
            </div>
          </div>

          <!-- Efectivo vs otros (reconciliación con arqueo) -->
          <div class="card flex flex-col gap-2 border-l-[3px] border-l-info p-5">
            <span class="flex items-center gap-2 eyebrow"><i class="pi pi-wallet text-info-600" /> Efectivo vs otros medios</span>
            <div class="grid gap-x-6 gap-y-1 font-mono text-[12px] sm:grid-cols-2">
              <div class="flex justify-between text-steel-600"><span>Entradas efectivo</span><span class="tabular-nums text-ink">{{ cop(Number(cashFlowData.cash_inflows)) }}</span></div>
              <div class="flex justify-between text-steel-600"><span>Salidas efectivo</span><span class="tabular-nums text-ink">{{ cop(Number(cashFlowData.cash_outflows)) }}</span></div>
              <div class="flex justify-between text-steel-600"><span>Entradas otros medios</span><span class="tabular-nums text-ink">{{ cop(Number(cashFlowData.other_inflows)) }}</span></div>
              <div class="flex justify-between text-steel-600"><span>Salidas otros medios</span><span class="tabular-nums text-ink">{{ cop(Number(cashFlowData.other_outflows)) }}</span></div>
            </div>
            <p class="mt-1 text-[11px] text-steel-500">La porción en efectivo cuadra con el arqueo (Reporte Z); "otros medios" (tarjeta/Nequi/transferencia) queda en tránsito a banco.</p>
          </div>

          <!-- Neto -->
          <div class="flex items-center justify-between rounded-lg px-4 py-3 font-bold" :class="Number(cashFlowData.net) >= 0 ? 'bg-success/10 text-success-600' : 'bg-alert/10 text-alert-600'">
            <span class="uppercase tracking-wide">Flujo neto del período</span>
            <span class="font-mono tabular-nums">{{ copSigned(Number(cashFlowData.net)) }}</span>
          </div>
        </template>
      </div>

      <!-- Otros reportes -->
      <div v-else class="grid place-items-center gap-3 py-12 text-center">
        <span class="grid size-12 place-items-center rounded-xl bg-ember/10 text-ember"><i :class="['pi', reportModal?.icon, 'text-xl']" /></span>
        <p class="max-w-sm text-sm text-steel-500">Vista previa de <b class="text-ink">{{ reportModal?.title }}</b>. El detalle completo se arma al conectar datos reales de ventas y gastos.</p>
      </div>
    </Dialog>

    <!-- Toast -->
    <Transition enter-active-class="transition duration-200" leave-active-class="transition duration-200" enter-from-class="opacity-0 translate-y-2" leave-to-class="opacity-0 translate-y-2">
      <div v-if="toast" class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-graphite-900 px-4 py-2.5 font-mono text-[12px] text-paper shadow-lg">
        <i class="pi pi-check-circle mr-1.5 text-success" />{{ toast }}
      </div>
    </Transition>
  </AppShell>
</template>

<style scoped>
.receipt {
  border: 1px solid var(--color-line);
  border-radius: 0.5rem;
  box-shadow:
    0 1px 2px -1px rgb(20 24 28 / 0.06),
    0 18px 40px -24px rgb(20 24 28 / 0.35);
}
.doc-act {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-line);
  background: var(--color-paper);
  padding: 0.3rem 0.6rem;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-steel-600);
  transition: all 0.12s ease;
}
.doc-act:hover {
  border-color: color-mix(in oklab, var(--color-ember) 55%, transparent);
  color: var(--color-ink);
}
.doc-act i {
  font-size: 11px;
}

@media print {
  .no-print {
    display: none !important;
  }
  .receipt {
    box-shadow: none;
    border: none;
    max-width: 100%;
  }
}
</style>
