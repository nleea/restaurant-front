<script setup lang="ts">
// Cobro as a slide-over from the dupe — the full close-out that OrderTicket used to
// carry: register split payments per method, edit the discount, show Pagado / Saldo /
// Vuelto, and the settlement-gated close. Fiado: when a balance remains, pick an
// EXISTING customer (search the directory; the chosen customer's outstanding credit is
// loaded on selection), assign them to the order → "Fiar y cerrar". No inline create —
// a "Crear cliente" link routes to the Clientes view. Cancel-with-reason lives here too.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import MoneyField from '@/components/cashstation/MoneyField.vue'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useCustomersStore } from '@/stores/customers'
import { useOrdersStore } from '@/stores/orders'
import { isConflict, statusOf } from '@/lib/apiError'
import { formatCOP } from '@/lib/money'
import { PAYMENT_METHODS } from '@/services/orders.api'
import type { PaymentMethod } from '@/services/orders.api'

const props = defineProps<{ orderId: string }>()
const emit = defineEmits<{ close: []; done: [] }>()

const auth = useAuthStore()
const branch = useBranchStore()
const customers = useCustomersStore()
const orders = useOrdersStore()

const canPay = computed(() => auth.can('orders.pay'))
const canUpdate = computed(() => auth.can('orders.update'))
const canCancel = computed(() => auth.can('orders.cancel'))

const CHANNEL_LABEL: Record<string, string> = {
  dine_in: 'Mesa',
  takeaway: 'Para llevar',
  delivery: 'Domicilio',
}
const order = computed(() => orders.orders.find((o) => o.id === props.orderId) ?? null)
const heading = computed(() => {
  const o = order.value
  if (!o) return ''
  if (o.channel === 'dine_in') {
    const num = o.dining_table_id ? orders.tables.find((t) => t.id === o.dining_table_id)?.number : null
    return num ? `Mesa ${num}` : 'Mesa'
  }
  return CHANNEL_LABEL[o.channel] ?? o.channel
})

// --- Settlement figures (server total is authoritative) --------------------
const total = computed(() => Number(order.value?.total ?? 0))
const paid = computed(() => orders.paidOf(props.orderId))
const balance = computed(() => orders.balanceOf(props.orderId))
const change = computed(() => Math.max(0, paid.value - total.value))
const isSettled = computed(() => total.value > 0 && balance.value <= 0)
const hasCustomer = computed(() => order.value?.customer_id != null)
const willFiar = computed(() => balance.value > 0 && hasCustomer.value)
const closeBlocked = computed(() => balance.value > 0 && !hasCustomer.value)

const payments = computed(() => orders.paymentsOf(props.orderId))
function methodLabel(value: string): string {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value
}

// --- Register a payment ----------------------------------------------------
const method = ref<PaymentMethod>('cash')
const amount = ref<number | null>(null)
const dinerRef = ref('')
const paying = ref(false)
const payError = ref<string | null>(null)

function fillBalance() {
  amount.value = balance.value
}

async function registerPayment() {
  const value = amount.value ?? 0
  if (value <= 0) {
    payError.value = 'Escribe cuánto está pagando el cliente.'
    return
  }
  paying.value = true
  payError.value = null
  try {
    await orders.registerPayment(props.orderId, {
      amount: value.toFixed(2),
      method: method.value,
      diner_reference: dinerRef.value.trim() || null,
    })
    dinerRef.value = ''
    amount.value = balance.value > 0 ? balance.value : null
  } catch (e) {
    // Keep amount/method for retry; a 409 means the branch has no open cash session.
    payError.value = isConflict(e)
      ? 'No hay una sesión de caja abierta en la sucursal. Abre la caja antes de cobrar.'
      : 'No se pudo registrar el pago.'
  } finally {
    paying.value = false
  }
}

// --- Discount --------------------------------------------------------------
const discount = ref<number | null>(Number(order.value?.discount ?? 0) || null)
const savingDiscount = ref(false)
const discountError = ref<string | null>(null)
async function saveDiscount() {
  savingDiscount.value = true
  discountError.value = null
  try {
    await orders.setDiscount(props.orderId, String(discount.value ?? 0))
  } catch (e) {
    discountError.value =
      statusOf(e) === 422 ? 'Descuento inválido.' : 'No se pudo aplicar el descuento.'
  } finally {
    savingDiscount.value = false
  }
}

// --- Fiado: assign an existing customer ------------------------------------
const custSearch = ref('')
const showPicker = ref(false)
const assigning = ref(false)
const assignError = ref<string | null>(null)

const customerResults = computed(() => {
  const q = custSearch.value.trim().toLowerCase()
  return customers.activeCustomers
    .filter((c) => q === '' || customers.customerName(c).toLowerCase().includes(q))
    .slice(0, 8)
})
const assignedName = computed(() => {
  const id = order.value?.customer_id
  if (!id) return null
  const c = customers.customers.find((x) => x.id === id)
  return c ? customers.customerName(c) : '—'
})
// Loaded outstanding for the currently selected customer (avoids an N+1 over the list).
const assignedOutstanding = computed(() =>
  customers.selectedCustomerId === order.value?.customer_id ? customers.customerOutstanding : null,
)

async function chooseCustomer(customerId: string) {
  assigning.value = true
  assignError.value = null
  try {
    await customers.selectCustomer(customerId) // loads that customer's outstanding credit
    await orders.assignCustomer(props.orderId, customerId)
    showPicker.value = false
  } catch (e) {
    assignError.value =
      statusOf(e) === 404
        ? 'El cliente no existe.'
        : isConflict(e)
          ? 'La comanda ya no está abierta.'
          : 'No se pudo asignar el cliente.'
  } finally {
    assigning.value = false
  }
}

// --- Close / cancel --------------------------------------------------------
const closing = ref(false)
const closeError = ref<string | null>(null)
async function close() {
  if (!branch.activeBranchId) return
  closing.value = true
  closeError.value = null
  try {
    await orders.closeOrder(branch.activeBranchId, props.orderId)
    emit('done')
  } catch (e) {
    const s = statusOf(e)
    closeError.value =
      s === 422
        ? 'La comanda no está saldada. Cobra el resto o asígnale un cliente registrado para fiar.'
        : s === 409
          ? 'No hay una sesión de caja abierta en la sucursal.'
          : 'No se pudo cerrar la comanda.'
  } finally {
    closing.value = false
  }
}

const showCancel = ref(false)
const cancelReason = ref('')
const cancelling = ref(false)
async function confirmCancel() {
  if (!branch.activeBranchId || cancelReason.value.trim() === '') return
  cancelling.value = true
  closeError.value = null
  try {
    await orders.cancelOrder(branch.activeBranchId, props.orderId, cancelReason.value.trim())
    emit('done')
  } catch {
    closeError.value = 'No se pudo cancelar la comanda.'
  } finally {
    cancelling.value = false
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  amount.value = balance.value > 0 ? balance.value : null
  // Load the customer directory for the fiado picker; if a customer is already assigned,
  // preload its outstanding so the reference figure shows on a deep-link.
  void customers.loadCustomers().then(() => {
    const id = order.value?.customer_id
    if (id) void customers.selectCustomer(id)
  })
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <!-- Scrim -->
  <div class="fixed inset-0 z-40 bg-graphite-900/40 backdrop-blur-sm" @click="emit('close')" />

  <!-- Sheet: right slide-over on lg, bottom sheet on mobile -->
  <aside
    class="sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-2xl border border-line bg-paper lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[440px] lg:rounded-none lg:rounded-l-2xl"
    role="dialog"
    aria-modal="true"
    aria-label="Cobrar la comanda"
  >
    <header class="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <p class="eyebrow">Cobro · {{ heading }}</p>
        <p class="font-display text-lg font-bold text-ink">Cobrar</p>
      </div>
      <button
        type="button"
        class="grid size-9 place-items-center rounded-lg border border-line text-steel-500 transition hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        aria-label="Cerrar cobro"
        @click="emit('close')"
      >
        <i class="pi pi-times" />
      </button>
    </header>

    <div class="flex-1 overflow-y-auto px-5 py-4">
      <!-- Running figures -->
      <dl class="grid grid-cols-3 gap-2">
        <div class="rounded-xl border border-line bg-surface p-3">
          <dt class="eyebrow">Total</dt>
          <dd class="mt-1 font-mono text-base font-bold tabular-nums text-ink">{{ formatCOP(total) }}</dd>
        </div>
        <div class="rounded-xl border border-line bg-surface p-3">
          <dt class="eyebrow">Pagado</dt>
          <dd class="mt-1 font-mono text-base font-bold tabular-nums text-steel-600">{{ formatCOP(paid) }}</dd>
        </div>
        <div
          class="rounded-xl border p-3"
          :class="isSettled ? 'border-success/40 bg-success/8' : 'border-ember/40 bg-ember-50'"
        >
          <dt class="eyebrow">{{ change > 0 ? 'Vuelto' : 'Saldo' }}</dt>
          <dd
            class="mt-1 font-mono text-base font-bold tabular-nums"
            :class="isSettled ? 'text-success-600' : 'text-ember'"
          >
            {{ formatCOP(change > 0 ? change : balance) }}
          </dd>
        </div>
      </dl>

      <p
        v-if="isSettled"
        class="mt-3 flex items-center gap-2 rounded-xl border border-success/30 bg-success/8 px-3 py-2 text-sm font-semibold text-success-600"
      >
        <i class="pi pi-check-circle text-sm" /> Cuenta saldada{{ change > 0 ? ` · devuelve ${formatCOP(change)}` : '' }}
      </p>

      <!-- Register a payment -->
      <template v-if="canPay">
        <p class="mt-5 eyebrow">Medio de pago</p>
        <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button
            v-for="m in PAYMENT_METHODS"
            :key="m.value"
            type="button"
            class="min-h-11 rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
            :class="method === m.value ? 'border-ember bg-ember-50 text-ember-600' : 'border-line bg-surface text-steel-600 hover:bg-sunken'"
            @click="method = m.value"
          >
            {{ m.label }}
          </button>
        </div>

        <div class="mt-4 flex items-end justify-between gap-2">
          <p class="eyebrow">Monto recibido</p>
          <button type="button" class="font-mono text-[11px] text-ember-600 hover:underline" @click="fillBalance">
            Exacto · {{ formatCOP(balance) }}
          </button>
        </div>
        <div class="mt-1.5">
          <MoneyField v-model="amount" big placeholder="0" />
        </div>
        <input
          v-model="dinerRef"
          type="text"
          placeholder="Referencia (opcional)"
          aria-label="Referencia del pago"
          class="mt-2 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-steel-400 focus:border-ember/60 focus:ring-2 focus:ring-ember/20"
        />
        <p v-if="payError" role="alert" class="mt-2 font-mono text-[11px] text-alert-600">{{ payError }}</p>

        <button
          type="button"
          class="mt-3 min-h-12 w-full rounded-xl bg-ember text-base font-bold text-white transition hover:bg-ember-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/50 disabled:opacity-40"
          :disabled="paying"
          @click="registerPayment"
        >
          Registrar pago
        </button>
      </template>

      <!-- Registered abonos -->
      <div v-if="payments.length" class="mt-5">
        <p class="eyebrow">Pagos registrados</p>
        <ul class="mt-2 flex flex-col divide-y divide-hairline overflow-hidden rounded-xl border border-line bg-surface">
          <li v-for="p in payments" :key="p.id" class="flex items-center gap-3 px-3 py-2">
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm text-ink">{{ methodLabel(p.method) }}</span>
              <span v-if="p.diner_reference" class="font-mono text-[11px] text-steel-400">{{ p.diner_reference }}</span>
            </span>
            <span class="font-mono text-sm font-semibold tabular-nums text-ink">{{ formatCOP(p.amount) }}</span>
          </li>
        </ul>
      </div>

      <!-- Discount -->
      <template v-if="canUpdate">
        <p class="mt-5 eyebrow">Descuento</p>
        <div class="mt-2 flex items-end gap-2">
          <div class="flex-1">
            <MoneyField v-model="discount" placeholder="0" />
          </div>
          <button
            type="button"
            class="min-h-11 shrink-0 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-steel-600 transition hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40 disabled:opacity-40"
            :disabled="savingDiscount"
            @click="saveDiscount"
          >
            Aplicar
          </button>
        </div>
        <p v-if="discountError" role="alert" class="mt-2 font-mono text-[11px] text-alert-600">{{ discountError }}</p>
      </template>

      <!-- Fiado: assign an existing customer when a balance remains -->
      <template v-if="canUpdate">
        <div v-if="hasCustomer" class="mt-5 rounded-xl border border-line bg-surface p-3">
          <p class="eyebrow">Cliente (fiado)</p>
          <div class="mt-1 flex items-center justify-between gap-2">
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold text-ink">{{ assignedName }}</span>
              <span v-if="assignedOutstanding !== null" class="font-mono text-[11px] text-steel-500">
                Debe {{ formatCOP(assignedOutstanding) }}
              </span>
            </span>
            <button
              type="button"
              class="shrink-0 font-mono text-[11px] text-ember-600 hover:underline"
              @click="showPicker = !showPicker"
            >
              Cambiar
            </button>
          </div>
        </div>

        <div v-if="closeBlocked || showPicker" class="mt-3 rounded-xl border border-line bg-surface p-3">
          <div class="flex items-center justify-between gap-2">
            <p class="eyebrow">Elegir cliente para fiar</p>
            <RouterLink to="/customers" class="font-mono text-[11px] text-ember-600 hover:underline">
              Crear cliente
            </RouterLink>
          </div>
          <input
            v-model="custSearch"
            type="search"
            placeholder="Buscar cliente…"
            aria-label="Buscar cliente"
            class="mt-2 h-11 w-full rounded-xl border border-line bg-app px-3 text-sm text-ink outline-none placeholder:text-steel-400 focus:border-ember/60 focus:ring-2 focus:ring-ember/20"
          />
          <ul v-if="customerResults.length" class="mt-2 flex max-h-52 flex-col divide-y divide-hairline overflow-y-auto rounded-lg border border-line bg-app">
            <li v-for="c in customerResults" :key="c.id">
              <button
                type="button"
                class="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-none disabled:opacity-50"
                :disabled="assigning"
                @click="chooseCustomer(c.id)"
              >
                <span class="truncate text-sm text-ink">{{ customers.customerName(c) }}</span>
                <i class="pi pi-angle-right text-xs text-steel-400" />
              </button>
            </li>
          </ul>
          <p v-else class="mt-2 font-mono text-[11px] text-steel-400">
            No hay clientes que coincidan. Usa “Crear cliente”.
          </p>
          <p v-if="assignError" role="alert" class="mt-2 font-mono text-[11px] text-alert-600">{{ assignError }}</p>
        </div>
      </template>

      <!-- Guidance + close-out -->
      <p v-if="canUpdate && closeBlocked" class="mt-4 font-mono text-[11px] text-alert">
        Queda un saldo de {{ formatCOP(balance) }}. Cobra el resto o elige un cliente registrado para fiar.
      </p>
      <p v-else-if="canUpdate && willFiar" class="mt-4 font-mono text-[11px] text-ember">
        Se fiará {{ formatCOP(balance) }} a crédito del cliente al cerrar.
      </p>
      <p v-else-if="canUpdate" class="mt-4 font-mono text-[11px] text-steel-500">
        Comanda saldada. Puedes cerrarla.
      </p>

      <p v-if="closeError" role="alert" class="mt-2 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-[11px] text-alert">
        {{ closeError }}
      </p>

      <button
        v-if="canUpdate"
        type="button"
        class="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-graphite-900 text-base font-bold text-white transition hover:bg-graphite-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/50 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="closeBlocked || closing"
        @click="close"
      >
        <i :class="willFiar ? 'pi pi-user' : 'pi pi-check'" class="text-sm" />
        {{ willFiar ? 'Fiar y cerrar' : 'Cerrar comanda' }}
      </button>

      <!-- Cancel-with-reason -->
      <template v-if="canCancel">
        <button
          v-if="!showCancel"
          type="button"
          class="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface text-sm font-semibold text-steel-500 transition hover:border-alert/40 hover:text-alert-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert/30"
          @click="showCancel = true"
        >
          Cancelar comanda
        </button>
        <div v-else class="mt-2 rounded-xl border border-alert/30 bg-alert/5 p-3">
          <label for="cancel-reason" class="eyebrow text-alert-600">Motivo de cancelación</label>
          <input
            id="cancel-reason"
            v-model="cancelReason"
            type="text"
            autofocus
            class="mt-1.5 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-alert/60 focus:ring-2 focus:ring-alert/20"
          />
          <div class="mt-2 flex gap-2">
            <button
              type="button"
              class="min-h-10 flex-1 rounded-lg border border-line bg-surface text-sm font-semibold text-steel-600 transition hover:bg-sunken"
              @click="showCancel = false"
            >
              Volver
            </button>
            <button
              type="button"
              class="min-h-10 flex-1 rounded-lg bg-alert text-sm font-bold text-white transition hover:bg-alert-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert/40 disabled:opacity-40"
              :disabled="cancelReason.trim() === '' || cancelling"
              @click="confirmCancel"
            >
              Cancelar comanda
            </button>
          </div>
        </div>
      </template>
    </div>
  </aside>
</template>

<style scoped>
@keyframes sheet-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.sheet {
  animation: sheet-in 0.24s cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
@media (min-width: 1024px) {
  @keyframes sheet-in-lg {
    from {
      opacity: 0;
      transform: translateX(24px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .sheet {
    animation-name: sheet-in-lg;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sheet {
    animation: none;
  }
}
</style>
