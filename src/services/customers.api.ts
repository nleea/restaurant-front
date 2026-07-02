// Typed Customers API layer over `/customers` — customers (with embedded person identity),
// preferences (key/value CRM), store credit (fiado) and settlement payments. Tenant-scoped (no
// branch). Reads require `customers.read`; all writes require `customers.manage`. Money fields are
// server-side decimals serialized as strings and kept verbatim in transit; only display reformats.
import { http } from '@/lib/http'

export const PAYMENT_STATUSES = ['pending', 'partial', 'paid'] as const

export interface Customer {
  id: string
  person_id: string
  user_id: string | null
  total_spent: string
  order_count: number
  last_purchase_at: string | null
  is_active: boolean
  // Person identity, embedded on reads by the backend.
  first_name: string | null
  last_name: string | null
  document_number: string | null
  phone: string | null
  email: string | null
}

export interface Preference {
  id: string
  customer_id: string
  key: string
  value: string
}

export interface Credit {
  id: string
  customer_id: string
  total_amount: string
  payment_status: string
  reference_id: string | null
}

export interface CreditPayment {
  id: string
  customer_credit_id: string
  amount: string
  method: string
  employee_id: string
}

export interface CreateCustomerInput {
  first_name: string
  last_name: string
  document_number?: string | null
  phone?: string | null
  email?: string | null
  user_id?: string | null
}

export interface RegisterCreditInput {
  total_amount: string
  reference_id?: string | null
}

export interface CreditPaymentInput {
  amount: string
  method: string
  employee_id: string
}

// --- Customers -----------------------------------------------------------------------------
export async function listCustomers(active?: boolean): Promise<Customer[]> {
  const params = active === undefined ? undefined : { active: String(active) }
  return (await http.get<Customer[]>('/customers', { params })).data
}

export async function getCustomer(id: string): Promise<Customer> {
  return (await http.get<Customer>(`/customers/${id}`)).data
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  return (await http.post<Customer>('/customers', input)).data
}

export async function updateCustomer(
  id: string,
  patch: { user_id?: string | null; is_active?: boolean },
): Promise<Customer> {
  return (await http.patch<Customer>(`/customers/${id}`, patch)).data
}

export async function deactivateCustomer(id: string): Promise<Customer> {
  return (await http.delete<Customer>(`/customers/${id}`)).data
}

// --- Preferences ---------------------------------------------------------------------------
export async function listPreferences(customerId: string): Promise<Preference[]> {
  return (await http.get<Preference[]>(`/customers/${customerId}/preferences`)).data
}

export async function setPreference(
  customerId: string,
  input: { key: string; value: string },
): Promise<Preference> {
  return (await http.post<Preference>(`/customers/${customerId}/preferences`, input)).data
}

export async function removePreference(preferenceId: string): Promise<void> {
  await http.delete(`/customers/preferences/${preferenceId}`)
}

// --- Credits (fiado) -----------------------------------------------------------------------
export async function listCredits(customerId: string): Promise<Credit[]> {
  return (await http.get<Credit[]>(`/customers/${customerId}/credits`)).data
}

export async function getCredit(creditId: string): Promise<Credit> {
  return (await http.get<Credit>(`/customers/credits/${creditId}`)).data
}

export async function registerCredit(
  customerId: string,
  input: RegisterCreditInput,
): Promise<Credit> {
  return (await http.post<Credit>(`/customers/${customerId}/credits`, input)).data
}

// --- Credit payments -----------------------------------------------------------------------
export async function listCreditPayments(creditId: string): Promise<CreditPayment[]> {
  return (await http.get<CreditPayment[]>(`/customers/credits/${creditId}/payments`)).data
}

export async function registerCreditPayment(
  creditId: string,
  input: CreditPaymentInput,
): Promise<CreditPayment> {
  return (await http.post<CreditPayment>(`/customers/credits/${creditId}/payments`, input)).data
}
