import { defineStore } from 'pinia'
import * as api from '@/services/customers.api'
import type {
  CreateCustomerInput,
  Credit,
  CreditPayment,
  CreditPaymentInput,
  Customer,
  Preference,
  RegisterCreditInput,
} from '@/services/customers.api'

// Money travels as strings; the only client arithmetic is credit balances, summed in integer cents
// so repeated parse/accumulate never drifts. The server's payment_status stays authoritative.
function toCents(value: string | null | undefined): number {
  if (!value) return 0
  return Math.round(Number(value) * 100)
}
function fromCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

interface CustomersState {
  customers: Customer[]
  selectedCustomerId: string | null
  preferences: Preference[]
  credits: Credit[]
  paymentsByCredit: Record<string, CreditPayment[]>
}

// Tenant-scoped customer directory + preferences + fiado credits/payments. Write-through
// discipline: every mutation refetches the affected collection so the screen reflects server state
// verbatim. Customer reads now carry the person identity (backend embed), so names resolve directly.
export const useCustomersStore = defineStore('customers', {
  state: (): CustomersState => ({
    customers: [],
    selectedCustomerId: null,
    preferences: [],
    credits: [],
    paymentsByCredit: {},
  }),

  getters: {
    activeCustomers: (state): Customer[] => state.customers.filter((c) => c.is_active),

    selectedCustomer: (state): Customer | null =>
      state.customers.find((c) => c.id === state.selectedCustomerId) ?? null,

    customerName:
      () =>
      (customer: Customer): string => {
        const name = `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim()
        return name || `#${customer.id.slice(0, 8)}`
      },

    paymentsOf:
      (state) =>
      (creditId: string): CreditPayment[] =>
        state.paymentsByCredit[creditId] ?? [],

    // total_amount − Σ payments for a credit, in integer cents. Guidance; payment_status authoritative.
    creditBalance:
      (state) =>
      (creditId: string): string => {
        const credit = state.credits.find((c) => c.id === creditId)
        if (!credit) return '0.00'
        const paid = (state.paymentsByCredit[creditId] ?? []).reduce((s, p) => s + toCents(p.amount), 0)
        return fromCents(Math.max(0, toCents(credit.total_amount) - paid))
      },

    // The selected customer's total outstanding across credits not yet fully paid.
    customerOutstanding(): string {
      const owed = this.credits
        .filter((c) => c.payment_status !== 'paid')
        .reduce((sum, c) => sum + Number(this.creditBalance(c.id)) * 100, 0)
      return fromCents(Math.round(owed))
    },
  },

  actions: {
    async loadCustomers(): Promise<void> {
      this.customers = await api.listCustomers()
    },

    async selectCustomer(customerId: string): Promise<void> {
      this.selectedCustomerId = customerId
      const [preferences, credits] = await Promise.all([
        api.listPreferences(customerId),
        api.listCredits(customerId),
      ])
      this.preferences = preferences
      this.credits = credits
      this.paymentsByCredit = {}
    },

    // --- Customer mutations (write-through) ----------------------------------
    async createCustomer(input: CreateCustomerInput): Promise<Customer> {
      const customer = await api.createCustomer(input)
      await this.loadCustomers()
      return customer
    },
    async updateCustomer(customerId: string, patch: { is_active?: boolean }): Promise<void> {
      await api.updateCustomer(customerId, patch)
      await this.loadCustomers()
    },
    async deactivateCustomer(customerId: string): Promise<void> {
      await api.deactivateCustomer(customerId)
      await this.loadCustomers()
    },

    // --- Preference mutations ------------------------------------------------
    async setPreference(customerId: string, key: string, value: string): Promise<void> {
      await api.setPreference(customerId, { key, value })
      this.preferences = await api.listPreferences(customerId)
    },
    async removePreference(customerId: string, preferenceId: string): Promise<void> {
      await api.removePreference(preferenceId)
      this.preferences = await api.listPreferences(customerId)
    },

    // --- Credit + payment mutations ------------------------------------------
    async registerCredit(customerId: string, input: RegisterCreditInput): Promise<void> {
      await api.registerCredit(customerId, input)
      this.credits = await api.listCredits(customerId)
    },
    async loadPayments(creditId: string): Promise<void> {
      this.paymentsByCredit[creditId] = await api.listCreditPayments(creditId)
    },
    async registerCreditPayment(creditId: string, input: CreditPaymentInput): Promise<void> {
      await api.registerCreditPayment(creditId, input)
      // Refresh the credit (payment_status) and its payments. The credit belongs to the selected
      // customer, so refetch that customer's credits plus this credit's payments.
      if (this.selectedCustomerId) this.credits = await api.listCredits(this.selectedCustomerId)
      this.paymentsByCredit[creditId] = await api.listCreditPayments(creditId)
    },
  },
})
