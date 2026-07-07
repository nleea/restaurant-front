// Typed Reports API — read-only finance aggregation. Reads require `finance.read`.
// Money fields are server-side decimals serialized as strings ("145000.00"); the
// display layer formats them. Taxes are estimates (see `taxes_estimated`).
import { http } from '@/lib/http'

export interface ZChannelLine {
  channel: string
  amount: string
  tickets: number
}

export interface ZPaymentLine {
  method: string
  amount: string
}

export interface ZReport {
  cash_session_id: string
  branch_id: string
  cashier_employee_id: string
  opened_at: string
  closed_at: string | null
  opening_amount: string
  expected_amount: string | null
  counted_amount: string | null
  difference: string | null
  withdrawals: string
  channels: ZChannelLine[]
  gross_sales: string
  gross_tickets: number
  discounts: string
  returns: string
  return_count: number
  net_sales: string
  payments: ZPaymentLine[]
  tax_iva: string
  tax_inc: string
  tax_impoconsumo: string
  taxes_estimated: boolean
  avg_ticket: string
  peak_hour: number | null
  cashier_name: string | null
  top_server_employee_id: string | null
  top_server_name: string | null
  top_product_variant_id: string | null
  top_product_name: string | null
  top_product_units: number
}

export async function getZReport(cashSessionId: string): Promise<ZReport> {
  return (await http.get<ZReport>(`/reports/z/${cashSessionId}`)).data
}

// --- Revenue engine (period-ranged) --------------------------------------------------------
export interface RevenueChannel {
  channel: string
  amount: string
  tickets: number
}
export interface RevenuePayment {
  method: string
  amount: string
}
export interface RevenueSummary {
  total: string
  tickets: number
  avg_ticket: string
  discounts: string
  returns: string
  return_count: number
  net: string
  channels: RevenueChannel[]
  payments: RevenuePayment[]
}
export interface DailyPoint {
  day: string
  income: string
  expenses: string
}
export interface TopProductRow {
  variant_id: string
  name: string | null
  units: number
  revenue: string
}

export async function getRevenue(
  branchId: string,
  from: string,
  to: string,
  cashierEmployeeId?: string | null,
): Promise<RevenueSummary> {
  const params: Record<string, string> = { branch_id: branchId, from, to }
  if (cashierEmployeeId) params.cashier_employee_id = cashierEmployeeId
  return (await http.get<RevenueSummary>('/reports/revenue', { params })).data
}

export async function getDaily(
  branchId: string,
  from: string,
  to: string,
): Promise<DailyPoint[]> {
  return (
    await http.get<DailyPoint[]>('/reports/daily', {
      params: { branch_id: branchId, from, to },
    })
  ).data
}

export async function getTopProducts(
  branchId: string,
  from: string,
  to: string,
  limit = 5,
): Promise<TopProductRow[]> {
  return (
    await http.get<TopProductRow[]>('/reports/top-products', {
      params: { branch_id: branchId, from, to, limit: String(limit) },
    })
  ).data
}

// --- Profitability (P&L, margins) — gated by cost availability -----------------------------
export interface ChannelMargin {
  channel: string
  revenue: string
  cogs: string
  margin: string
  margin_pct: string
}
export interface ProfitAndLoss {
  revenue: string
  cogs: string
  cogs_partial: boolean
  gross_profit: string
  gross_margin_pct: string
  operating_expenses: string
  ebitda: string
  ebitda_margin_pct: string
  estimated_taxes: string
  taxes_estimated: boolean
  net_profit: string
  net_margin_pct: string
  contribution_margin_pct: string
  break_even_revenue: string | null
  channels: ChannelMargin[]
}
export interface ManagerCostKpis {
  revenue: string
  food_cost_pct: string | null
  labor_cost: string | null
  labor_cost_pct: string | null
  prime_cost: string | null
  prime_cost_pct: string | null
  cogs_partial: boolean
  labor_available: boolean
}
export interface ProductMargin {
  variant_id: string
  name: string | null
  units: number
  revenue: string
  cogs: string
  margin: string
  margin_pct: string
  cost_available: boolean
}
export interface ProductMarginReport {
  top: ProductMargin[]
  bottom: ProductMargin[]
}

export async function getProfitAndLoss(
  branchId: string,
  from: string,
  to: string,
): Promise<ProfitAndLoss> {
  return (
    await http.get<ProfitAndLoss>('/reports/pl', {
      params: { branch_id: branchId, from, to },
    })
  ).data
}

export async function getCostKpis(
  branchId: string,
  from: string,
  to: string,
): Promise<ManagerCostKpis> {
  return (
    await http.get<ManagerCostKpis>('/reports/cost-kpis', {
      params: { branch_id: branchId, from, to },
    })
  ).data
}

export async function getProductMargins(
  branchId: string,
  from: string,
  to: string,
  limit = 5,
): Promise<ProductMarginReport> {
  return (
    await http.get<ProductMarginReport>('/reports/product-margins', {
      params: { branch_id: branchId, from, to, limit: String(limit) },
    })
  ).data
}

// --- Cash flow (money-in / money-out, cash-basis) ------------------------------------------
export interface CashFlowCategory {
  category: string
  direction: 'in' | 'out'
  amount: string
}
export interface CashFlowDailyPoint {
  day: string
  inflow: string
  outflow: string
  net: string
}
export interface CashFlowSummary {
  inflows: string
  outflows: string
  net: string
  cash_inflows: string
  other_inflows: string
  cash_outflows: string
  other_outflows: string
  categories: CashFlowCategory[]
  daily: CashFlowDailyPoint[]
}

export async function getCashFlow(
  branchId: string,
  from: string,
  to: string,
): Promise<CashFlowSummary> {
  return (
    await http.get<CashFlowSummary>('/reports/cash-flow', {
      params: { branch_id: branchId, from, to },
    })
  ).data
}
