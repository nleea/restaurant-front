// Typed Purchasing API layer over the supplier slice of `/purchasing`. Suppliers are tenant-scoped
// (no branch). Reads require `purchasing.read`; supplier create/edit/deactivate and catalog
// attach/detach require `purchasing.manage`. `reference_price` is a server-side decimal serialized
// as a string ("1200.00") and kept verbatim in transit; only the display layer (formatCOP) reformats.
// Supplier-ingredient rows carry only ingredient_id/unit_of_measure_id — labels are resolved in the store.
import { http } from '@/lib/http'

export interface Supplier {
  id: string
  name: string
  tax_id: string | null
  phone: string | null
  email: string | null
  address: string | null
  is_active: boolean
}

export interface SupplierIngredient {
  id: string
  supplier_id: string
  ingredient_id: string
  reference_price: string
  unit_of_measure_id: string
  is_active: boolean
}

export interface CreateSupplierInput {
  name: string
  tax_id?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
}

export interface UpdateSupplierInput {
  name?: string
  tax_id?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  is_active?: boolean
}

export interface AttachIngredientInput {
  ingredient_id: string
  reference_price: string
  unit_of_measure_id: string
}

// --- Suppliers -----------------------------------------------------------------------------
export async function listSuppliers(active?: boolean): Promise<Supplier[]> {
  const params = active === undefined ? undefined : { active: String(active) }
  return (await http.get<Supplier[]>('/purchasing/suppliers', { params })).data
}

export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  return (await http.post<Supplier>('/purchasing/suppliers', input)).data
}

export async function updateSupplier(
  supplierId: string,
  patch: UpdateSupplierInput,
): Promise<Supplier> {
  return (await http.patch<Supplier>(`/purchasing/suppliers/${supplierId}`, patch)).data
}

// --- Supplier ingredient catalog -----------------------------------------------------------
export async function listSupplierIngredients(supplierId: string): Promise<SupplierIngredient[]> {
  return (await http.get<SupplierIngredient[]>(`/purchasing/suppliers/${supplierId}/ingredients`))
    .data
}

export async function attachIngredient(
  supplierId: string,
  input: AttachIngredientInput,
): Promise<SupplierIngredient> {
  return (
    await http.post<SupplierIngredient>(`/purchasing/suppliers/${supplierId}/ingredients`, input)
  ).data
}

export async function detachIngredient(supplierId: string, ingredientId: string): Promise<void> {
  await http.delete(`/purchasing/suppliers/${supplierId}/ingredients/${ingredientId}`)
}

// ============================================================================
// Procure-to-pay flow: purchase requests → orders → goods receipt → payments.
// Money/quantity fields are string-encoded decimals, kept verbatim in transit.
// List endpoints filter only by status; the store scopes to the active branch.
// ============================================================================

export const REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const
export const ORDER_STATUSES = ['created', 'partially_received', 'received'] as const
export const PAYMENT_STATUSES = ['pending', 'partial', 'paid'] as const

export interface PurchaseRequest {
  id: string
  branch_id: string
  requested_by_employee_id: string
  status: string
  reason: string | null
  approved_by_employee_id: string | null
  resolved_at: string | null
}

export interface PurchaseRequestItem {
  id: string
  purchase_request_id: string
  ingredient_id: string
  requested_quantity: string
  unit_of_measure_id: string
}

export interface PurchaseOrder {
  id: string
  branch_id: string
  purchase_request_id: string
  supplier_id: string
  status: string
  payment_status: string
  total: string
}

export interface PurchaseOrderItem {
  id: string
  purchase_order_id: string
  ingredient_id: string
  ordered_quantity: string
  received_quantity: string
  unit_price: string
  unit_of_measure_id: string
}

export interface PurchasePayment {
  id: string
  purchase_order_id: string
  amount: string
  method: string
  employee_id: string
}

export interface CreateRequestInput {
  branch_id: string
  requested_by_employee_id: string
  reason?: string | null
  items: { ingredient_id: string; requested_quantity: string; unit_of_measure_id: string }[]
}

export interface CreateOrderInput {
  purchase_request_id: string
  supplier_id: string
  items: {
    ingredient_id: string
    ordered_quantity: string
    unit_price: string
    unit_of_measure_id: string
  }[]
}

export interface ReceiveInput {
  received_by_employee_id: string
  items: { order_item_id: string; quantity: string }[]
}

export interface RegisterPaymentInput {
  amount: string
  method: string
  employee_id: string
}

// --- Requests ------------------------------------------------------------------------------
export async function createRequest(input: CreateRequestInput): Promise<PurchaseRequest> {
  return (await http.post<PurchaseRequest>('/purchasing/requests', input)).data
}

export async function listRequests(status?: string): Promise<PurchaseRequest[]> {
  const params = status ? { status_filter: status } : undefined
  return (await http.get<PurchaseRequest[]>('/purchasing/requests', { params })).data
}

export async function listRequestItems(requestId: string): Promise<PurchaseRequestItem[]> {
  return (await http.get<PurchaseRequestItem[]>(`/purchasing/requests/${requestId}/items`)).data
}

export async function approveRequest(
  requestId: string,
  input: { employee_id: string },
): Promise<PurchaseRequest> {
  return (await http.post<PurchaseRequest>(`/purchasing/requests/${requestId}/approve`, input)).data
}

export async function rejectRequest(
  requestId: string,
  input: { employee_id: string },
): Promise<PurchaseRequest> {
  return (await http.post<PurchaseRequest>(`/purchasing/requests/${requestId}/reject`, input)).data
}

// --- Orders --------------------------------------------------------------------------------
export async function createOrder(input: CreateOrderInput): Promise<PurchaseOrder> {
  return (await http.post<PurchaseOrder>('/purchasing/orders', input)).data
}

export async function listOrders(status?: string): Promise<PurchaseOrder[]> {
  const params = status ? { status_filter: status } : undefined
  return (await http.get<PurchaseOrder[]>('/purchasing/orders', { params })).data
}

export async function listOrderItems(orderId: string): Promise<PurchaseOrderItem[]> {
  return (await http.get<PurchaseOrderItem[]>(`/purchasing/orders/${orderId}/items`)).data
}

export async function receiveOrder(orderId: string, input: ReceiveInput): Promise<PurchaseOrder> {
  return (await http.post<PurchaseOrder>(`/purchasing/orders/${orderId}/receive`, input)).data
}

// --- Payments ------------------------------------------------------------------------------
export async function registerPayment(
  orderId: string,
  input: RegisterPaymentInput,
): Promise<PurchasePayment> {
  return (await http.post<PurchasePayment>(`/purchasing/orders/${orderId}/payments`, input)).data
}

export async function listPayments(orderId: string): Promise<PurchasePayment[]> {
  return (await http.get<PurchasePayment[]>(`/purchasing/orders/${orderId}/payments`)).data
}
