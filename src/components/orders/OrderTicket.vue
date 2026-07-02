<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useMenuStore } from '@/stores/menu'
import { useOrdersStore } from '@/stores/orders'
import { isConflict, statusOf } from '@/lib/apiError'
import { formatCOP } from '@/lib/money'
import { PAYMENT_METHODS } from '@/services/orders.api'
import type { Order, PaymentMethod } from '@/services/orders.api'

const props = defineProps<{ order: Order }>()
const emit = defineEmits<{ back: [] }>()

const auth = useAuthStore()
const branch = useBranchStore()
const menu = useMenuStore()
const orders = useOrdersStore()

const canUpdate = computed(() => auth.can('orders.update'))
const canCancel = computed(() => auth.can('orders.cancel'))
const canPay = computed(() => auth.can('orders.pay'))
const isOpen = computed(() => props.order.status === 'open')

const error = ref<string | null>(null)
const items = computed(() => orders.itemsOf(props.order.id))

onMounted(() => {
  void orders.fetchItems(props.order.id)
  void orders.fetchPayments(props.order.id).then(() => {
    payAmount.value = orders.balanceOf(props.order.id)
  })
})

// --- Payments --------------------------------------------------------------
const methodOptions = PAYMENT_METHODS.map((m) => ({ label: m.label, value: m.value }))
const payments = computed(() => orders.paymentsOf(props.order.id))
const paid = computed(() => orders.paidOf(props.order.id))
const balance = computed(() => orders.balanceOf(props.order.id))
const methodLabel = (value: string): string =>
  PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value

const payMethod = ref<PaymentMethod>('cash')
const payAmount = ref<number>(0)
const dinerRef = ref('')
const paying = ref(false)
const payError = ref<string | null>(null)

async function registerPayment() {
  if (payAmount.value <= 0) return
  paying.value = true
  payError.value = null
  try {
    await orders.registerPayment(props.order.id, {
      amount: payAmount.value.toFixed(2),
      method: payMethod.value,
      diner_reference: dinerRef.value.trim() || null,
    })
    dinerRef.value = ''
    payAmount.value = orders.balanceOf(props.order.id)
  } catch (e) {
    // Keep amount/method intact for retry; the 409 means the branch has no open cash session.
    payError.value = isConflict(e)
      ? 'No hay una sesión de caja abierta en la sucursal. Abre la caja antes de cobrar.'
      : 'No se pudo registrar el pago.'
  } finally {
    paying.value = false
  }
}

// --- Item picker -----------------------------------------------------------
// Only products that have an active-branch price AND at least one active variant are orderable.
const pickProductId = ref<string | null>(null)
const pickVariantId = ref<string | null>(null)
const pickQty = ref<number>(1)
const adding = ref(false)

const productOptions = computed(() =>
  menu.products
    .filter(
      (p) =>
        menu.priceByProductId[p.id] != null &&
        (menu.variantsByProductId[p.id] ?? []).some((v) => v.is_active),
    )
    .map((p) => ({ label: p.name, value: p.id })),
)
const variantOptions = computed(() => {
  if (!pickProductId.value) return []
  return (menu.variantsByProductId[pickProductId.value] ?? [])
    .filter((v) => v.is_active)
    .map((v) => {
      const info = orders.variantIndex[v.id]
      const price = info ? ` — ${formatCOP(info.unitPrice)}` : ''
      return { label: `${v.name ?? 'Estándar'}${price}`, value: v.id }
    })
})

function onProductChange() {
  pickVariantId.value = null
}

async function addItem() {
  if (!pickVariantId.value || pickQty.value < 1) return
  adding.value = true
  error.value = null
  try {
    await orders.addItem(props.order.id, pickVariantId.value, pickQty.value)
    pickVariantId.value = null
    pickQty.value = 1
  } catch {
    error.value = 'No se pudo agregar el ítem.'
  } finally {
    adding.value = false
  }
}

async function changeQty(itemId: string, quantity: number) {
  if (quantity < 1) return
  error.value = null
  try {
    await orders.updateQuantity(props.order.id, itemId, quantity)
  } catch {
    error.value = 'No se pudo actualizar la cantidad.'
  }
}

async function removeItem(itemId: string) {
  error.value = null
  try {
    await orders.removeItem(props.order.id, itemId)
  } catch {
    error.value = 'No se pudo quitar el ítem.'
  }
}

// --- Discount --------------------------------------------------------------
const discountInput = ref(props.order.discount)
const savingDiscount = ref(false)
async function saveDiscount() {
  savingDiscount.value = true
  error.value = null
  try {
    await orders.setDiscount(props.order.id, String(discountInput.value).trim() || '0')
  } catch (e) {
    error.value = statusOf(e) === 422 ? 'Descuento inválido.' : 'No se pudo aplicar el descuento.'
  } finally {
    savingDiscount.value = false
  }
}

// --- Close / cancel --------------------------------------------------------
const closing = ref(false)
async function close() {
  if (!branch.activeBranchId) return
  closing.value = true
  error.value = null
  try {
    await orders.closeOrder(branch.activeBranchId, props.order.id)
    emit('back')
  } catch {
    error.value = 'No se pudo cerrar la comanda.'
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
  try {
    await orders.cancelOrder(branch.activeBranchId, props.order.id, cancelReason.value.trim())
    showCancel.value = false
    emit('back')
  } catch {
    error.value = 'No se pudo cancelar la comanda.'
  } finally {
    cancelling.value = false
  }
}
</script>

<template>
  <div class="p-5">
    <button
      type="button"
      class="mb-3 flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500 lg:hidden"
      @click="emit('back')"
    >
      <i class="pi pi-angle-left" /> Salón
    </button>

    <header class="mb-4 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-lg font-extrabold text-ink">Ticket</h3>
        <p class="font-mono text-sm text-steel-500">
          {{ order.channel }}<span v-if="order.dining_table_id"> · mesa</span>
        </p>
      </div>
      <span
        class="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide"
        :class="isOpen ? 'bg-ember/10 text-ember' : 'bg-steel-500/10 text-steel-500'"
      >
        {{ order.status }}
      </span>
    </header>

    <p v-if="error" role="alert" class="mb-3 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
      {{ error }}
    </p>

    <!-- Items -->
    <ul v-if="items.length" class="mb-4 flex flex-col gap-1.5">
      <li
        v-for="it in items"
        :key="it.id"
        class="flex items-center justify-between gap-3 rounded-lg border border-line bg-app px-3 py-2"
      >
        <span class="min-w-0">
          <span class="block truncate text-sm text-ink">{{ orders.itemLabel(it) }}</span>
          <span class="font-mono text-[11px] text-steel-500">
            {{ formatCOP(it.unit_price) }} · {{ formatCOP(it.line_subtotal) }}
          </span>
        </span>
        <span class="flex shrink-0 items-center gap-2">
          <InputNumber
            v-if="canUpdate && isOpen"
            :model-value="it.quantity"
            :min="1"
            show-buttons
            button-layout="horizontal"
            class="w-28"
            @update:model-value="(q) => changeQty(it.id, Number(q))"
          />
          <span v-else class="font-mono text-sm text-ink">×{{ it.quantity }}</span>
          <button
            v-if="canUpdate && isOpen"
            type="button"
            class="text-steel-500 transition hover:text-alert focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert/30"
            aria-label="Quitar ítem"
            @click="removeItem(it.id)"
          >
            <i class="pi pi-trash text-sm" />
          </button>
        </span>
      </li>
    </ul>
    <p v-else class="mb-4 text-sm text-steel-500">Sin ítems.</p>

    <!-- Add item -->
    <section v-if="canUpdate && isOpen" class="mb-5 rounded-xl border border-line p-4">
      <h4 class="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ember">Agregar ítem</h4>
      <p v-if="!productOptions.length" class="font-mono text-[11px] text-steel-500">
        No hay productos vendibles (necesitan precio de sucursal y al menos una variante activa).
      </p>
      <div v-else class="flex flex-col gap-2">
        <Select
          v-model="pickProductId"
          :options="productOptions"
          option-label="label"
          option-value="value"
          placeholder="Producto"
          filter
          fluid
          @change="onProductChange"
        />
        <div class="flex items-end gap-2">
          <Select
            v-model="pickVariantId"
            :options="variantOptions"
            option-label="label"
            option-value="value"
            placeholder="Variante"
            :disabled="!pickProductId"
            fluid
          />
          <InputNumber v-model="pickQty" :min="1" show-buttons button-layout="horizontal" class="w-28" />
          <Button
            label="Agregar"
            size="small"
            icon="pi pi-plus"
            :loading="adding"
            :disabled="!pickVariantId"
            @click="addItem"
          />
        </div>
      </div>
    </section>

    <!-- Totals -->
    <dl class="mb-4 grid grid-cols-[1fr_auto] gap-y-1 text-sm">
      <dt class="text-steel-500">Subtotal</dt>
      <dd class="text-right font-mono text-ink">{{ formatCOP(order.subtotal) }}</dd>
      <dt class="text-steel-500">Descuento</dt>
      <dd class="text-right font-mono text-ink">− {{ formatCOP(order.discount) }}</dd>
      <dt class="font-medium text-ink">Total</dt>
      <dd class="text-right font-mono text-base font-extrabold text-ink">{{ formatCOP(order.total) }}</dd>
    </dl>

    <!-- Payments -->
    <section v-if="isOpen" class="mb-5 rounded-xl border border-line p-4">
      <h4 class="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ember">Cobro</h4>

      <dl class="mb-3 grid grid-cols-[1fr_auto] gap-y-1 text-sm">
        <dt class="text-steel-500">Pagado</dt>
        <dd class="text-right font-mono text-ink">{{ formatCOP(paid) }}</dd>
        <dt class="font-medium text-ink">Saldo</dt>
        <dd
          class="text-right font-mono text-base font-extrabold"
          :class="balance > 0 ? 'text-ember' : 'text-ink'"
        >
          {{ formatCOP(balance) }}
        </dd>
      </dl>

      <!-- Registered payments -->
      <ul v-if="payments.length" class="mb-3 flex flex-col gap-1.5">
        <li
          v-for="p in payments"
          :key="p.id"
          class="flex items-center justify-between gap-3 rounded-lg border border-line bg-app px-3 py-2"
        >
          <span class="min-w-0">
            <span class="block truncate text-sm text-ink">{{ methodLabel(p.method) }}</span>
            <span v-if="p.diner_reference" class="font-mono text-[11px] text-steel-500">
              {{ p.diner_reference }}
            </span>
          </span>
          <span class="shrink-0 font-mono text-sm text-ink">{{ formatCOP(p.amount) }}</span>
        </li>
      </ul>
      <p v-else class="mb-3 text-sm text-steel-500">Sin pagos registrados.</p>

      <p
        v-if="payError"
        role="alert"
        class="mb-3 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
      >
        {{ payError }}
      </p>

      <!-- Registration form -->
      <div v-if="canPay" class="flex flex-col gap-2">
        <div class="flex items-end gap-2">
          <Select
            v-model="payMethod"
            :options="methodOptions"
            option-label="label"
            option-value="value"
            placeholder="Método"
            fluid
          />
          <InputNumber
            v-model="payAmount"
            :min="0"
            mode="currency"
            currency="COP"
            locale="es-CO"
            :max-fraction-digits="0"
            class="w-40"
          />
        </div>
        <InputText v-model="dinerRef" placeholder="Referencia (opcional)" fluid />
        <Button
          label="Registrar pago"
          size="small"
          icon="pi pi-wallet"
          :loading="paying"
          :disabled="payAmount <= 0"
          @click="registerPayment"
        />
      </div>
    </section>

    <!-- Discount + actions -->
    <div v-if="isOpen" class="flex flex-col gap-3">
      <div v-if="canUpdate" class="flex items-end gap-2">
        <div class="flex flex-1 flex-col gap-1">
          <label for="disc" class="text-xs text-steel-500">Descuento</label>
          <InputText id="disc" v-model="discountInput" inputmode="decimal" fluid />
        </div>
        <Button label="Aplicar" size="small" outlined :loading="savingDiscount" @click="saveDiscount" />
      </div>
      <p
        v-if="canUpdate && balance > 0"
        class="font-mono text-[11px] text-steel-500"
      >
        Queda un saldo de {{ formatCOP(balance) }} por cobrar antes de cerrar.
      </p>
      <p
        v-else-if="canUpdate && payments.length"
        class="font-mono text-[11px] text-steel-500"
      >
        Comanda saldada. Puedes cerrarla.
      </p>
      <div class="flex gap-2">
        <Button
          v-if="canUpdate"
          label="Cerrar comanda"
          size="small"
          icon="pi pi-check"
          :loading="closing"
          @click="close"
        />
        <Button
          v-if="canCancel"
          label="Cancelar"
          severity="danger"
          outlined
          size="small"
          icon="pi pi-times"
          @click="showCancel = true"
        />
      </div>
    </div>

    <!-- Cancel dialog -->
    <Dialog v-model:visible="showCancel" modal header="Cancelar comanda" :style="{ width: '24rem' }" :breakpoints="{ '480px': '92vw' }">
      <div class="flex flex-col gap-2 pt-2">
        <label for="reason" class="text-xs font-medium uppercase tracking-wide text-steel-500">Motivo</label>
        <InputText id="reason" v-model="cancelReason" autofocus fluid />
      </div>
      <template #footer>
        <Button label="Volver" severity="secondary" text @click="showCancel = false" />
        <Button
          label="Cancelar comanda"
          severity="danger"
          :loading="cancelling"
          :disabled="cancelReason.trim() === ''"
          @click="confirmCancel"
        />
      </template>
    </Dialog>
  </div>
</template>
