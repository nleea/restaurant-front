import { defineStore } from 'pinia'
import * as api from '@/services/purchasing.api'
import type {
  CreateOrderInput,
  CreateRequestInput,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchasePayment,
  PurchaseRequest,
  PurchaseRequestItem,
  ReceiveInput,
  RegisterPaymentInput,
} from '@/services/purchasing.api'
import { useBranchStore } from '@/stores/branch'

// Money/quantity travel as strings. The only client arithmetic is the outstanding balance, summed
// in integer cents so repeated parse/accumulate never drifts; the server's payment_status/status
// stay authoritative.
function toCents(value: string | null | undefined): number {
  if (!value) return 0
  return Math.round(Number(value) * 100)
}
function fromCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

interface ProcurementState {
  requests: PurchaseRequest[]
  requestItems: Record<string, PurchaseRequestItem[]>
  orders: PurchaseOrder[]
  orderItems: Record<string, PurchaseOrderItem[]>
  payments: Record<string, PurchasePayment[]>
  selectedRequestId: string | null
  selectedOrderId: string | null
}

// Procure-to-pay transactions, scoped to the active branch (the list endpoints filter only by
// status, so branch scoping is client-side on each record's branch_id). Write-through discipline:
// every mutation refetches the affected collection so server state is shown verbatim. Labels
// (ingredient/unit/supplier/employee) are resolved by the components from the existing stores.
export const useProcurementStore = defineStore('procurement', {
  state: (): ProcurementState => ({
    requests: [],
    requestItems: {},
    orders: [],
    orderItems: {},
    payments: {},
    selectedRequestId: null,
    selectedOrderId: null,
  }),

  getters: {
    // Active-branch filtered views of the status-filtered lists.
    branchRequests: (state): PurchaseRequest[] => {
      const branchId = useBranchStore().activeBranchId
      return state.requests.filter((r) => r.branch_id === branchId)
    },
    branchOrders: (state): PurchaseOrder[] => {
      const branchId = useBranchStore().activeBranchId
      return state.orders.filter((o) => o.branch_id === branchId)
    },

    selectedRequest: (state): PurchaseRequest | null =>
      state.requests.find((r) => r.id === state.selectedRequestId) ?? null,
    selectedOrder: (state): PurchaseOrder | null =>
      state.orders.find((o) => o.id === state.selectedOrderId) ?? null,

    itemsOfRequest:
      (state) =>
      (requestId: string): PurchaseRequestItem[] =>
        state.requestItems[requestId] ?? [],
    itemsOfOrder:
      (state) =>
      (orderId: string): PurchaseOrderItem[] =>
        state.orderItems[orderId] ?? [],
    paymentsOf:
      (state) =>
      (orderId: string): PurchasePayment[] =>
        state.payments[orderId] ?? [],

    // total − Σ payments, in integer cents. Guidance only; payment_status is authoritative.
    outstandingBalance:
      (state) =>
      (orderId: string): string => {
        const order = state.orders.find((o) => o.id === orderId)
        if (!order) return '0.00'
        const paid = (state.payments[orderId] ?? []).reduce((sum, p) => sum + toCents(p.amount), 0)
        return fromCents(Math.max(0, toCents(order.total) - paid))
      },

    // received vs ordered for one order item. `remaining` is a number (quantity, not money) so the
    // receive input can cap on it; computed in integer thousandths to avoid float drift.
    receiptProgress:
      () =>
      (
        item: PurchaseOrderItem,
      ): { received: string; ordered: string; remaining: number; done: boolean } => {
        const milli = (v: string): number => Math.round(Number(v) * 1000)
        const remainingMilli = Math.max(0, milli(item.ordered_quantity) - milli(item.received_quantity))
        return {
          received: item.received_quantity,
          ordered: item.ordered_quantity,
          remaining: remainingMilli / 1000,
          done: remainingMilli === 0,
        }
      },

    // --- Board helpers (client-side, over the loaded branch orders) -------------------------
    // Distinct supplier ids present in the branch's orders — feeds the toolbar supplier filter.
    distinctOrderSupplierIds(): string[] {
      const seen = new Set<string>()
      for (const o of this.branchOrders) seen.add(o.supplier_id)
      return [...seen]
    },

    // Orders bucketed by receipt status — one loaded list feeds stats, filters and alerts.
    ordersByStatus(): Record<'created' | 'partially_received' | 'received', PurchaseOrder[]> {
      const buckets: Record<'created' | 'partially_received' | 'received', PurchaseOrder[]> = {
        created: [],
        partially_received: [],
        received: [],
      }
      for (const o of this.branchOrders) {
        if (o.status === 'partially_received') buckets.partially_received.push(o)
        else if (o.status === 'received') buckets.received.push(o)
        else buckets.created.push(o)
      }
      return buckets
    },

    // Σ outstanding balance across the branch's unpaid/partial orders, in integer cents. A fully
    // paid order contributes 0; for the rest, total − Σ (loaded) payments. Guidance only —
    // payment_status stays authoritative.
    payableTotal(state): string {
      const branchId = useBranchStore().activeBranchId
      let cents = 0
      for (const o of state.orders) {
        if (o.branch_id !== branchId || o.payment_status === 'paid') continue
        const paid = (state.payments[o.id] ?? []).reduce((sum, p) => sum + toCents(p.amount), 0)
        cents += Math.max(0, toCents(o.total) - paid)
      }
      return fromCents(cents)
    },

    // The stats row: counts by status + total por pagar, all from the loaded branch list.
    orderStats(): {
      total: number
      created: number
      partiallyReceived: number
      received: number
      payable: string
    } {
      const buckets = this.ordersByStatus
      return {
        total: this.branchOrders.length,
        created: buckets.created.length,
        partiallyReceived: buckets.partially_received.length,
        received: buckets.received.length,
        payable: this.payableTotal,
      }
    },

    // Orders with an outstanding balance (not fully paid) and partially-received orders — the two
    // alert affordances; derived from the branch list without a second fetch.
    ordersWithOutstanding(): PurchaseOrder[] {
      return this.branchOrders.filter((o) => o.payment_status !== 'paid')
    },
    partiallyReceivedOrders(): PurchaseOrder[] {
      return this.branchOrders.filter((o) => o.status === 'partially_received')
    },

    // Aggregate receipt progress for one order — the depletion-bar analog. Exact when the order's
    // items are loaded (Σ received / Σ ordered); otherwise a status-derived estimate (0/50/100)
    // so the list stays single-fetch. State/colour always follow the authoritative order.status.
    orderProgress:
      (state) =>
      (
        orderId: string,
      ): { received: number; ordered: number; pct: number; done: boolean; hasItems: boolean } => {
        const order = state.orders.find((o) => o.id === orderId)
        const items = state.orderItems[orderId] ?? []
        if (items.length) {
          const milli = (v: string): number => Math.round(Number(v) * 1000)
          let ordered = 0
          let received = 0
          for (const it of items) {
            ordered += milli(it.ordered_quantity)
            received += milli(it.received_quantity)
          }
          const pct = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0
          return {
            received: received / 1000,
            ordered: ordered / 1000,
            pct,
            done: ordered > 0 && received >= ordered,
            hasItems: true,
          }
        }
        const status = order?.status
        const pct = status === 'received' ? 100 : status === 'partially_received' ? 50 : 0
        return { received: 0, ordered: 0, pct, done: status === 'received', hasItems: false }
      },
  },

  actions: {
    async loadRequests(status?: string): Promise<void> {
      this.requests = await api.listRequests(status)
    },
    async loadOrders(status?: string): Promise<void> {
      this.orders = await api.listOrders(status)
    },
    async loadRequestItems(requestId: string): Promise<void> {
      this.requestItems[requestId] = await api.listRequestItems(requestId)
    },
    async loadOrderItems(orderId: string): Promise<void> {
      this.orderItems[orderId] = await api.listOrderItems(orderId)
    },
    async loadPayments(orderId: string): Promise<void> {
      this.payments[orderId] = await api.listPayments(orderId)
    },

    async selectRequest(requestId: string): Promise<void> {
      this.selectedRequestId = requestId
      await this.loadRequestItems(requestId)
    },
    async selectOrder(orderId: string): Promise<void> {
      this.selectedOrderId = orderId
      await Promise.all([this.loadOrderItems(orderId), this.loadPayments(orderId)])
    },

    // --- Request mutations (write-through) -----------------------------------
    async createRequest(input: CreateRequestInput): Promise<PurchaseRequest> {
      const request = await api.createRequest(input)
      await this.loadRequests()
      return request
    },
    async approveRequest(requestId: string, employeeId: string): Promise<void> {
      await api.approveRequest(requestId, { employee_id: employeeId })
      await this.loadRequests()
    },
    async rejectRequest(requestId: string, employeeId: string): Promise<void> {
      await api.rejectRequest(requestId, { employee_id: employeeId })
      await this.loadRequests()
    },

    // --- Order mutations (write-through) -------------------------------------
    async createOrder(input: CreateOrderInput): Promise<PurchaseOrder> {
      const order = await api.createOrder(input)
      await this.loadOrders()
      return order
    },
    async receiveOrder(orderId: string, input: ReceiveInput): Promise<void> {
      await api.receiveOrder(orderId, input)
      await Promise.all([this.loadOrders(), this.loadOrderItems(orderId)])
    },
    async registerPayment(orderId: string, input: RegisterPaymentInput): Promise<void> {
      await api.registerPayment(orderId, input)
      await Promise.all([this.loadOrders(), this.loadPayments(orderId)])
    },
  },
})
