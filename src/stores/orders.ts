import { defineStore } from 'pinia'
import { baseURL } from '@/lib/http'
import { createLiveRefetch, type LiveRefetch } from '@/composables/useLiveRefetch'
import * as api from '@/services/orders.api'
import * as kitchenApi from '@/services/kitchen.api'
import type {
  DiningTable,
  Employee,
  Order,
  OrderItem,
  OrderChannel,
  OrderPayment,
  PaymentClaim,
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
  // Los comprobantes que mandó el cliente, por pedido. NO son pagos: no suman al saldo y sólo
  // existen para que una persona los mire antes de verificar.
  paymentClaims: Record<string, PaymentClaim[]>
  // variant_id → product/variant labels + computed orderable unit price (branch price + extra).
  variantIndex: Record<string, VariantInfo>
}

// Live-refetch handle (module-level plumbing, like the poll/SSE state in stores/kitchen.ts).
let live: LiveRefetch | undefined

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
    paymentClaims: {},
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
    // El pedido llegó diciendo que ya venía pagado (transferencia, Nequi, tarjeta) pero
    // todavía nadie ha confirmado el comprobante. Hasta que alguien lo haga no puede ir a
    // cocina: no se cocina para un dinero sin confirmar.
    //
    // El efectivo nunca lo necesita — su plata llega en la puerta.
    needsPaymentVerification:
      (state) =>
      (orderId: string): boolean => {
        const order = state.orders.find((o) => o.id === orderId)
        if (!order) return false
        const method = order.payment_method ?? 'cash'
        if (method === 'cash') return false
        const paid = (state.paymentsByOrder[orderId] ?? []).reduce(
          (sum, p) => sum + Number(p.amount),
          0,
        )
        return paid < Number(order.total ?? 0)
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

    // A tile tap stamps the line, nothing else — the kitchen note is written afterwards on
    // the dupe (`setItemNotes`), where there is room for it.
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

    async setItemNotes(orderId: string, itemId: string, notes: string | null): Promise<void> {
      await api.setItemNotes(itemId, notes?.trim() || null)
      await this.refreshOrder(orderId)
    },

    // "Enviar a cocina": route the order so its pending items get KDS tickets. Idempotent —
    // routes only the un-sent items, so it can be pressed per round. Refresh to flip `sent`.
    // Devuelve los platos que NO llegaron a la cocina. Casi siempre vacío —una variante no se
    // vende sin estación— pero cuando no lo está es lo único que importa: comida cobrada que
    // nadie va a preparar, y antes esto se reportaba como enviado sin más.
    async sendToKitchen(orderId: string): Promise<string[]> {
      const result = await kitchenApi.routeOrder(orderId)
      await this.refreshOrder(orderId)
      return result.unrouted
    },

    // "Verificar pago": dar por bueno el comprobante de un prepago y mandarlo a cocina, en un
    // gesto. Para quien atiende es un solo momento —mira el Nequi, dice ok— y separarlo
    // crearía el estado "verificado pero sin cocinar" que nadie mira.
    //
    // Ni monto ni método viajan: salen del propio pedido. Verificar es confirmar que llegó lo
    // que el pedido ya decía, no teclear una cifra que podría no coincidir con el comprobante.
    async fetchPaymentClaims(orderId: string): Promise<void> {
      // Silencioso a propósito: no tener comprobantes es lo normal, y un error aquí no puede
      // tapar la comanda — el pago se verifica igual mirando el banco.
      try {
        this.paymentClaims = { ...this.paymentClaims, [orderId]: await api.listPaymentClaims(orderId) }
      } catch {
        this.paymentClaims = { ...this.paymentClaims, [orderId]: [] }
      }
    },

    async rejectPaymentClaim(
      orderId: string,
      claimId: string,
      reason: string,
      employeeId: string,
    ): Promise<void> {
      await api.rejectPaymentClaim(orderId, claimId, reason, employeeId)
      await this.fetchPaymentClaims(orderId)
    },

    async verifyPayment(orderId: string, employeeId: string): Promise<void> {
      await api.verifyPayment(orderId, employeeId)
      // Verificar hace DOS cosas en el servidor —registra el pago y manda a cocina—, así que hay
      // que releer las dos. Sin `fetchPayments`, "saldada" se sigue calculando con los pagos
      // viejos (ninguno) y la comanda no ofrece cerrarse hasta que alguien recarga la pantalla:
      // el pedido ya estaba pagado y cocinándose, pero la pantalla no lo sabía.
      await Promise.all([
        this.fetchPayments(orderId),
        this.fetchPaymentClaims(orderId),
        this.refreshOrder(orderId),
      ])
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

    // Attach an existing customer to the open order (enables fiado at close); refresh the header
    // so the derived customer_id is reflected. 404/409 propagate to the caller for messaging.
    async assignCustomer(orderId: string, customerId: string): Promise<void> {
      await api.assignCustomer(orderId, customerId)
      await this.refreshOrder(orderId)
    },

    // --- Live salón (SSE doorbell → debounced refetch, polling fallback) -------
    // The floor subscribes to the branch's `orders` stream; each event refetches the open orders
    // and the tables so an order or table change made elsewhere appears without a manual refresh.
    // Start on view mount, stop on unmount.
    startLive(branchId: string): void {
      this.stopLive()
      live = createLiveRefetch({
        url: `${baseURL}/orders/events?branch_id=${branchId}`,
        onDoorbell: async () => {
          await Promise.all([this.loadOrders(branchId), this.loadTables(branchId)])
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
