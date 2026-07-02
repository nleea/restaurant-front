import { defineStore } from 'pinia'
import * as api from '@/services/orders.api'
import type {
  DiningTable,
  Employee,
  Order,
  OrderItem,
  OrderChannel,
  OrderPayment,
  RegisterPaymentInput,
} from '@/services/orders.api'
import { useMenuStore } from '@/stores/menu'
import { statusOf } from '@/lib/apiError'

interface VariantInfo {
  productName: string
  variantName: string
  unitPrice: number
}

interface OrdersState {
  currentEmployee: Employee | null
  employeeResolved: boolean
  tables: DiningTable[]
  orders: Order[]
  itemsByOrder: Record<string, OrderItem[]>
  paymentsByOrder: Record<string, OrderPayment[]>
  // variant_id → product/variant labels + computed orderable unit price (branch price + extra).
  variantIndex: Record<string, VariantInfo>
}

// Write-through discipline: every mutation calls the API then refetches the affected order (and
// its items) so the server-recomputed totals are shown verbatim. The client only computes the
// per-item `unit_price` it submits (from the variant index), never the order totals.
export const useOrdersStore = defineStore('orders', {
  state: (): OrdersState => ({
    currentEmployee: null,
    employeeResolved: false,
    tables: [],
    orders: [],
    itemsByOrder: {},
    paymentsByOrder: {},
    variantIndex: {},
  }),

  getters: {
    hasEmployee: (state): boolean => state.currentEmployee !== null,
    itemsOf:
      (state) =>
      (orderId: string): OrderItem[] =>
        state.itemsByOrder[orderId] ?? [],
    paymentsOf:
      (state) =>
      (orderId: string): OrderPayment[] =>
        state.paymentsByOrder[orderId] ?? [],
    // paid = Σ payment.amount; balance = max(0, order.total − paid). The order `total` is the
    // server's authoritative value; these are presentational derivations, never persisted.
    paidOf:
      (state) =>
      (orderId: string): number =>
        (state.paymentsByOrder[orderId] ?? []).reduce((sum, p) => sum + Number(p.amount), 0),
    balanceOf:
      (state) =>
      (orderId: string): number => {
        const order = state.orders.find((o) => o.id === orderId)
        const total = Number(order?.total ?? 0)
        const paid = (state.paymentsByOrder[orderId] ?? []).reduce(
          (sum, p) => sum + Number(p.amount),
          0,
        )
        return Math.max(0, total - paid)
      },
    itemLabel:
      (state) =>
      (item: OrderItem): string => {
        const info = state.variantIndex[item.product_variant_id]
        if (!info) return '—'
        return info.variantName && info.variantName !== 'Estándar'
          ? `${info.productName} · ${info.variantName}`
          : info.productName
      },
  },

  actions: {
    // Resolve the current user's employee (404 ⇒ the account is not an employee).
    async resolveEmployee(): Promise<void> {
      try {
        this.currentEmployee = await api.getMyEmployee()
      } catch (e) {
        if (statusOf(e) === 404) this.currentEmployee = null
        else throw e
      } finally {
        this.employeeResolved = true
      }
    },

    async loadTables(branchId: string): Promise<void> {
      this.tables = await api.listTables(branchId)
    },

    async loadOrders(branchId: string, status: string | undefined = 'open'): Promise<void> {
      this.orders = await api.listOrders({ branchId, status })
    },

    // Build the variant index from the menu: products + active-branch prices + per-product
    // variants → { labels, unitPrice = branchPrice + variant.extra_price }.
    async buildVariantIndex(branchId: string): Promise<void> {
      const menu = useMenuStore()
      await menu.fetchProducts()
      await menu.loadPrices(branchId)
      await Promise.all(menu.products.map((p) => menu.loadVariants(p.id)))
      const index: Record<string, VariantInfo> = {}
      for (const product of menu.products) {
        const base = Number(menu.priceByProductId[product.id] ?? 0)
        for (const variant of menu.variantsByProductId[product.id] ?? []) {
          index[variant.id] = {
            productName: product.name,
            variantName: variant.name ?? 'Estándar',
            unitPrice: base + Number(variant.extra_price),
          }
        }
      }
      this.variantIndex = index
    },

    async ensureLoaded(branchId: string): Promise<void> {
      await Promise.all([
        this.resolveEmployee(),
        this.loadTables(branchId),
        this.loadOrders(branchId),
        this.buildVariantIndex(branchId),
      ])
    },

    async openOrder(
      branchId: string,
      channel: OrderChannel,
      diningTableId: string | null,
    ): Promise<Order> {
      if (!this.currentEmployee) throw new Error('Tu usuario no está vinculado a un empleado.')
      const order = await api.openOrder({
        branch_id: branchId,
        channel,
        employee_id: this.currentEmployee.id,
        dining_table_id: diningTableId,
      })
      await Promise.all([this.loadOrders(branchId), this.loadTables(branchId)])
      await this.fetchItems(order.id)
      return order
    },

    async createTable(branchId: string, number: string, capacity: number): Promise<void> {
      await api.createTable({ branch_id: branchId, number, capacity })
      await this.loadTables(branchId)
    },

    async fetchItems(orderId: string): Promise<void> {
      this.itemsByOrder[orderId] = await api.listItems(orderId)
    },

    async fetchPayments(orderId: string): Promise<void> {
      this.paymentsByOrder[orderId] = await api.listPayments(orderId)
    },

    // Register a payment then write-through: refetch the payments and the order header so the
    // derived paid/balance reflect the server verbatim. A 409 (no open cash session) propagates
    // to the caller, which maps it to an actionable message.
    async registerPayment(
      orderId: string,
      input: Omit<RegisterPaymentInput, 'employee_id'>,
    ): Promise<void> {
      if (!this.currentEmployee) throw new Error('Tu usuario no está vinculado a un empleado.')
      await api.registerPayment(orderId, { ...input, employee_id: this.currentEmployee.id })
      await Promise.all([this.fetchPayments(orderId), this.refreshOrder(orderId)])
    },

    // Refetch an order (header totals) and its items after a mutation.
    async refreshOrder(orderId: string): Promise<void> {
      const fresh = await api.getOrder(orderId)
      const idx = this.orders.findIndex((o) => o.id === orderId)
      if (idx >= 0) this.orders[idx] = fresh
      await this.fetchItems(orderId)
    },

    async addItem(orderId: string, variantId: string, quantity: number): Promise<void> {
      const info = this.variantIndex[variantId]
      const unitPrice = (info?.unitPrice ?? 0).toFixed(2)
      await api.addItem(orderId, {
        product_variant_id: variantId,
        quantity,
        unit_price: unitPrice,
      })
      await this.refreshOrder(orderId)
    },

    async updateQuantity(orderId: string, itemId: string, quantity: number): Promise<void> {
      await api.updateItemQuantity(itemId, quantity)
      await this.refreshOrder(orderId)
    },

    async removeItem(orderId: string, itemId: string): Promise<void> {
      await api.removeItem(itemId)
      await this.refreshOrder(orderId)
    },

    async setDiscount(orderId: string, discount: string): Promise<void> {
      await api.setDiscount(orderId, discount)
      await this.refreshOrder(orderId)
    },

    async closeOrder(branchId: string, orderId: string): Promise<void> {
      await api.closeOrder(orderId)
      await Promise.all([this.loadOrders(branchId), this.loadTables(branchId)])
    },

    async cancelOrder(branchId: string, orderId: string, reason: string): Promise<void> {
      if (!this.currentEmployee) throw new Error('Tu usuario no está vinculado a un empleado.')
      await api.cancelOrder(orderId, {
        reason,
        requested_by_employee_id: this.currentEmployee.id,
      })
      await Promise.all([this.loadOrders(branchId), this.loadTables(branchId)])
    },
  },
})
