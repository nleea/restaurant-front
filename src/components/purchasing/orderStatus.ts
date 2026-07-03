// STATUS_META-style maps for the Compras board — the procurement analog of Inventario's
// ok/low/out map. Each order/payment status resolves to El Pase classes ({label, pill, dot, bar})
// so stats, rows, cards, drawer and alerts read the same colour language. Row-tint mirrors the
// depletion-bar row background.
import type { PurchaseOrder } from '@/services/purchasing.api'

export type OrderStatus = 'created' | 'partially_received' | 'received'
export type PaymentStatus = 'pending' | 'partial' | 'paid'

export interface StatusMeta {
  label: string
  pill: string
  dot: string
  bar: string
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  created: { label: 'Creada', pill: 'pill-info', dot: 'bg-info', bar: 'bg-info' },
  partially_received: { label: 'Parcial', pill: 'pill-warn', dot: 'bg-warn', bar: 'bg-warn' },
  received: { label: 'Recibida', pill: 'pill-success', dot: 'bg-success', bar: 'bg-success' },
}

export const PAYMENT_STATUS_META: Record<PaymentStatus, StatusMeta> = {
  pending: { label: 'Sin pagar', pill: 'pill-alert', dot: 'bg-alert', bar: 'bg-alert' },
  partial: { label: 'Pago parcial', pill: 'pill-warn', dot: 'bg-warn', bar: 'bg-warn' },
  paid: { label: 'Pagada', pill: 'pill-success', dot: 'bg-success', bar: 'bg-success' },
}

export function orderStatusOf(order: PurchaseOrder): OrderStatus {
  if (order.status === 'partially_received') return 'partially_received'
  if (order.status === 'received') return 'received'
  return 'created'
}

export function paymentStatusOf(order: PurchaseOrder): PaymentStatus {
  if (order.payment_status === 'partial') return 'partial'
  if (order.payment_status === 'paid') return 'paid'
  return 'pending'
}

export function orderMeta(order: PurchaseOrder): StatusMeta {
  return ORDER_STATUS_META[orderStatusOf(order)]
}

export function paymentMeta(order: PurchaseOrder): StatusMeta {
  return PAYMENT_STATUS_META[paymentStatusOf(order)]
}

/** Row background tint by receipt state, mirroring the Inventario table. */
export function orderRowTint(order: PurchaseOrder): string {
  const status = orderStatusOf(order)
  if (status === 'partially_received') return 'bg-warn/5'
  if (status === 'received') return 'bg-success/5'
  return ''
}
