// Typed Orders API layer over the foundation's Axios instance. Reads require `orders.read`;
// opening/items/tables `orders.create`; quantity/discount/close `orders.update`; cancel
// `orders.cancel`. Every order operation carries an `employee_id` (resolved via getMyEmployee).
import { http } from '@/lib/http'

export type OrderChannel = 'dine_in' | 'takeaway' | 'delivery'

// Kitchen readiness rolled up from the order's tickets: never routed (`none`), cooking
// (`in_kitchen`), or all tickets ready (`ready`). Written server-side; read on Salón/Dispatch.
export type KitchenState = 'none' | 'in_kitchen' | 'ready'

export interface Employee {
  id: string
  branch_id: string
  role_id: string
  is_active: boolean
}

export interface DiningTable {
  id: string
  branch_id: string
  number: string
  capacity: number
  status: string
  is_active: boolean
}

export interface Order {
  id: string
  branch_id: string
  channel: string
  employee_id: string
  status: string
  subtotal: string
  discount: string
  total: string
  dining_table_id: string | null
  customer_id: string | null
  whatsapp_contact_id: string | null
  closed_at: string | null
  kitchen_state: KitchenState
}

export interface OrderItem {
  id: string
  order_id: string
  product_variant_id: string
  quantity: number
  unit_price: string
  line_subtotal: string
  status: string
}

// Payment methods are owned by the client: the backend accepts any ≤30-char string for `method`,
// so the offered set (Colombia-oriented) and its labels live here in one place. `value` is the
// string submitted to the API; `label` is the UI copy.
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'nequi', label: 'Nequi' },
  { value: 'daviplata', label: 'Daviplata' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

export interface OrderPayment {
  id: string
  order_id: string
  branch_id: string
  cash_session_id: string
  amount: string
  method: string
  employee_id: string
  diner_reference: string | null
}

export interface RegisterPaymentInput {
  amount: string
  method: PaymentMethod
  employee_id: string
  diner_reference?: string | null
}

// --- Current employee (session primitive) --------------------------------------------------
export async function getMyEmployee(): Promise<Employee> {
  return (await http.get<Employee>('/staff/employees/me')).data
}

// --- Dining tables -------------------------------------------------------------------------
export async function listTables(branchId: string): Promise<DiningTable[]> {
  return (await http.get<DiningTable[]>('/orders/tables', { params: { branch_id: branchId } }))
    .data
}

export async function createTable(input: {
  branch_id: string
  number: string
  capacity: number
}): Promise<DiningTable> {
  return (await http.post<DiningTable>('/orders/tables', input)).data
}

// --- Orders --------------------------------------------------------------------------------
export async function openOrder(input: {
  branch_id: string
  channel: OrderChannel
  employee_id: string
  dining_table_id?: string | null
}): Promise<Order> {
  return (await http.post<Order>('/orders', input)).data
}

export async function listOrders(params: {
  branchId: string
  status?: string
}): Promise<Order[]> {
  const query: Record<string, string> = { branch_id: params.branchId }
  if (params.status) query.status_filter = params.status
  return (await http.get<Order[]>('/orders', { params: query })).data
}

export async function getOrder(orderId: string): Promise<Order> {
  return (await http.get<Order>(`/orders/${orderId}`)).data
}

export async function setDiscount(orderId: string, discount: string): Promise<Order> {
  return (await http.put<Order>(`/orders/${orderId}/discount`, { discount })).data
}

export async function closeOrder(orderId: string): Promise<Order> {
  return (await http.post<Order>(`/orders/${orderId}/close`)).data
}

export async function cancelOrder(
  orderId: string,
  input: { reason: string; requested_by_employee_id: string },
): Promise<Order> {
  return (await http.post<Order>(`/orders/${orderId}/cancel`, input)).data
}

// --- Items ---------------------------------------------------------------------------------
export async function listItems(orderId: string): Promise<OrderItem[]> {
  return (await http.get<OrderItem[]>(`/orders/${orderId}/items`)).data
}

export async function addItem(
  orderId: string,
  input: { product_variant_id: string; quantity: number; unit_price: string },
): Promise<OrderItem> {
  return (await http.post<OrderItem>(`/orders/${orderId}/items`, input)).data
}

export async function updateItemQuantity(
  itemId: string,
  quantity: number,
): Promise<OrderItem> {
  return (await http.patch<OrderItem>(`/orders/items/${itemId}`, { quantity })).data
}

export async function removeItem(itemId: string): Promise<void> {
  await http.delete(`/orders/items/${itemId}`)
}

// --- Payments ------------------------------------------------------------------------------
// Register/list payments. The branch's open cash session is resolved server-side; a POST with no
// open session returns 409. Requires `orders.pay` (register) / `orders.read` (list).
export async function registerPayment(
  orderId: string,
  input: RegisterPaymentInput,
): Promise<OrderPayment> {
  return (await http.post<OrderPayment>(`/orders/${orderId}/payments`, input)).data
}

export async function listPayments(orderId: string): Promise<OrderPayment[]> {
  return (await http.get<OrderPayment[]>(`/orders/${orderId}/payments`)).data
}
