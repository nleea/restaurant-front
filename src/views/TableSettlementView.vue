<script setup lang="ts">
// Cobrar una mesa: el gesto que faltaba desde que cada comensal tiene su propia comanda.
//
// La decisión que manda sobre todo el diseño es que **junto y separado son el mismo mecanismo**.
// Abrir una mesa preselecciona TODAS sus comandas —casi todas las mesas pagan juntas—, y
// separar es esta misma pantalla con menos miembros marcados. Dos caminos distintos habrían
// duplicado el reparto, el cierre y la tirilla, y habría habido que decidir qué pasa cuando una
// mesa paga mitad y mitad.
//
// El cierre en cascada lo hace el SERVIDOR en una sola transacción. Aquí no se cierra nada a
// mano: esta pantalla pide y cuenta lo que pasó.
import { computed, onMounted, ref, watch } from 'vue'
import { cop } from '@/lib/cop'
import * as ordersApi from '@/services/orders.api'
import type { DiningTable, Order, TableBill } from '@/services/orders.api'
import { useBranchStore } from '@/stores/branch'
import { useCashStore } from '@/stores/cash'
import TableBillReceipt from '@/components/cashstation/TableBillReceipt.vue'

const branch = useBranchStore()
const cash = useCashStore()

const tables = ref<DiningTable[]>([])
const openOrders = ref<Order[]>([])
const loading = ref(false)
const problem = ref('')

/** La mesa que el cajero está cobrando. Null = está eligiendo. */
const bill = ref<TableBill | null>(null)
const activeTableId = ref<string | null>(null)
// Miembros marcados. Arranca con TODOS: junto es el caso común, separar es quitar.
const selected = ref<Set<string>>(new Set())
const payments = ref<{ amount: string; method: string }[]>([])
const draft = ref({ amount: '', method: 'cash' })
const settledOrders = ref<string[]>([])
const showReceipt = ref(false)

const METHODS = [
  { id: 'cash', label: 'Efectivo' },
  { id: 'card', label: 'Tarjeta' },
  { id: 'transfer', label: 'Transferencia' },
  { id: 'nequi', label: 'Nequi' },
]

// El cajero que firma el cobro es quien abrió la caja del turno: es quien está detrás del
// mostrador y quien responde por el arqueo.
const cashierId = computed(() => cash.currentSession?.opened_by_employee_id ?? null)

interface TableRow {
  table: DiningTable
  orders: Order[]
  total: number
}

const occupiedTables = computed<TableRow[]>(() =>
  tables.value
    .map((table) => {
      const orders = openOrders.value.filter((o) => o.dining_table_id === table.id)
      return {
        table,
        orders,
        total: orders.reduce((sum, o) => sum + Number(o.total), 0),
      }
    })
    .filter((row) => row.orders.length > 0)
    .sort((a, b) =>
      a.table.number.localeCompare(b.table.number, undefined, { numeric: true }),
    ),
)

const selectedMembers = computed(
  () => bill.value?.members.filter((m) => selected.value.has(m.order_id)) ?? [],
)
const selectedTotal = computed(() =>
  selectedMembers.value.reduce((sum, m) => sum + Number(m.outstanding), 0),
)
const paidSoFar = computed(() =>
  payments.value.reduce((sum, p) => sum + Number(p.amount || 0), 0),
)
/** Lo que falta. Siempre a la vista: el cajero está contando billetes con gente delante. */
const remaining = computed(() => Math.max(selectedTotal.value - paidSoFar.value, 0))
const canCharge = computed(
  () => selectedMembers.value.length > 0 && payments.value.length > 0 && !!cashierId.value,
)

async function load() {
  const branchId = branch.activeBranchId
  if (!branchId) return
  loading.value = true
  problem.value = ''
  try {
    tables.value = await ordersApi.listTables(branchId)
    openOrders.value = await ordersApi.listOrders({ branchId, status: 'open' })
  } catch {
    problem.value = 'No pudimos cargar las mesas. Inténtalo otra vez.'
  } finally {
    loading.value = false
  }
}

async function openTable(row: TableRow) {
  if (!cashierId.value) {
    problem.value = 'Abre la caja del turno antes de cobrar.'
    return
  }
  problem.value = ''
  settledOrders.value = []
  payments.value = []
  try {
    const created = await ordersApi.openTableBill({
      dining_table_id: row.table.id,
      employee_id: cashierId.value,
    })
    bill.value = created
    activeTableId.value = row.table.id
    // TODOS marcados: junto por defecto.
    selected.value = new Set(created.members.map((m) => m.order_id))
  } catch (err: unknown) {
    problem.value = detailOf(err) ?? 'No pudimos abrir la cuenta de esa mesa.'
  }
}

function detailOf(err: unknown): string | null {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? null
}

function toggle(orderId: string) {
  const next = new Set(selected.value)
  if (next.has(orderId)) next.delete(orderId)
  else next.add(orderId)
  selected.value = next
}

function addPayment() {
  const amount = Number(draft.value.amount)
  if (!amount || amount <= 0) return
  // A cadena SIEMPRE. `<input type="number">` entrega un número, y el dinero viaja como cadena
  // decimal en todo el proyecto: mandar un float por la red es cómo aparecen los 0.1 + 0.2.
  payments.value = [
    ...payments.value,
    { amount: String(draft.value.amount), method: draft.value.method },
  ]
  draft.value = { amount: '', method: draft.value.method }
}

async function charge() {
  if (!bill.value || !cashierId.value || !canCharge.value) return
  problem.value = ''
  try {
    // Si el cajero quitó a alguien, esta cuenta ya no sirve: se disuelve y se abre otra con los
    // que sí van. Cobrar sobre una cuenta con miembros que el cajero excluyó cobraría de más.
    if (selectedMembers.value.length !== bill.value.members.length) {
      const table = activeTableId.value
      await ordersApi.dissolveTableBill(bill.value.id)
      bill.value = await ordersApi.openTableBill({
        dining_table_id: table!,
        employee_id: cashierId.value,
        order_ids: [...selected.value],
      })
    }
    const before = bill.value.members.map((m) => m.order_label)
    const result = await ordersApi.chargeTableBill(
      bill.value.id,
      payments.value,
      cashierId.value,
    )
    bill.value = result
    if (result.status === 'settled') {
      settledOrders.value = before
      showReceipt.value = true
      await load()
    } else {
      // Cobro parcial: legítimo —el cajero recibe lo que le den— pero no cierra nada.
      payments.value = []
    }
  } catch (err: unknown) {
    problem.value = detailOf(err) ?? 'No pudimos registrar el cobro.'
  }
}

async function cancelBill() {
  if (!bill.value) return
  if (bill.value.status === 'open') await ordersApi.dissolveTableBill(bill.value.id)
  bill.value = null
  activeTableId.value = null
  payments.value = []
  settledOrders.value = []
  showReceipt.value = false
}

onMounted(async () => {
  await load()
})
watch(() => branch.activeBranchId, load)
</script>

<template>
  <section class="mx-auto max-w-4xl px-4 py-6">
    <header class="mb-6">
      <p class="eyebrow">Estación · Caja</p>
      <h1 class="mt-1 font-display text-2xl font-extrabold text-ink">Cobrar una mesa</h1>
      <p class="mt-1 text-sm text-steel-500">
        Se cobra todo junto por defecto. Quita a quien pague aparte.
      </p>
    </header>

    <p v-if="problem" class="mb-4 rounded-xl border border-line bg-paper px-4 py-3 text-sm" data-testid="problem">
      {{ problem }}
    </p>

    <!-- Elegir mesa -->
    <div v-if="!bill" data-testid="table-list">
      <p v-if="loading" class="text-sm text-steel-500">Cargando…</p>
      <p v-else-if="!occupiedTables.length" class="text-sm text-steel-500" data-testid="no-tables">
        No hay mesas con comandas abiertas.
      </p>
      <ul v-else class="space-y-2">
        <li v-for="row in occupiedTables" :key="row.table.id">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-left transition hover:border-ember/50"
            data-testid="table-row"
            @click="openTable(row)"
          >
            <span class="font-display text-lg font-extrabold text-ink">Mesa {{ row.table.number }}</span>
            <span class="text-sm text-steel-500">
              {{ row.orders.length }} {{ row.orders.length === 1 ? 'comanda' : 'comandas' }}
            </span>
            <span class="ml-auto font-mono text-sm font-bold tabular-nums text-ink">{{ cop(row.total) }}</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- Cobrar -->
    <div v-else class="space-y-5">
      <ul class="space-y-2">
        <li
          v-for="m in bill.members"
          :key="m.order_id"
          class="flex items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3"
          data-testid="member"
        >
          <input
            type="checkbox"
            :checked="selected.has(m.order_id)"
            :data-testid="`member-check-${m.order_label}`"
            @change="toggle(m.order_id)"
          />
          <span class="min-w-0 flex-1">
            <span class="block font-medium text-ink">{{ m.diner_name || 'Sin nombre' }}</span>
            <span class="block font-mono text-[11px] text-steel-500">{{ m.order_label }}</span>
          </span>
          <span class="font-mono text-sm tabular-nums text-ink">{{ cop(Number(m.outstanding)) }}</span>
        </li>
      </ul>

      <!-- Fiado: se dice ANTES de que el cajero reciba dinero, no como error después. -->
      <p class="rounded-xl bg-paper px-4 py-3 text-xs text-steel-500" data-testid="credit-note">
        Una cuenta se cobra completa. Si alguien va a quedar debiendo (fiado), quítalo de la
        selección y cóbralo aparte desde su comanda.
      </p>

      <div class="rounded-xl border border-line p-4">
        <p class="flex items-baseline justify-between text-base font-semibold text-ink">
          <span>A cobrar</span>
          <span class="font-mono tabular-nums" data-testid="selected-total">{{ cop(selectedTotal) }}</span>
        </p>

        <ul v-if="payments.length" class="mt-3 space-y-1">
          <li
            v-for="(p, i) in payments"
            :key="i"
            class="flex justify-between font-mono text-xs tabular-nums text-steel-500"
            data-testid="payment-entry"
          >
            <span>{{ METHODS.find((m) => m.id === p.method)?.label ?? p.method }}</span>
            <span>{{ cop(Number(p.amount)) }}</span>
          </li>
        </ul>

        <p class="mt-2 flex items-baseline justify-between text-sm font-semibold" data-testid="remaining">
          <span>Falta</span>
          <span class="font-mono tabular-nums">{{ cop(remaining) }}</span>
        </p>

        <div class="mt-3 flex gap-2">
          <select v-model="draft.method" class="rounded-lg border border-line px-2 py-2 text-sm" data-testid="method">
            <option v-for="m in METHODS" :key="m.id" :value="m.id">{{ m.label }}</option>
          </select>
          <input
            v-model="draft.amount"
            type="number"
            min="0"
            placeholder="Monto"
            data-testid="amount"
            class="flex-1 rounded-lg border border-line px-3 py-2 text-sm"
          />
          <button type="button" class="rounded-lg border border-line px-3 py-2 text-sm" data-testid="add-payment" @click="addPayment">
            Añadir
          </button>
        </div>
      </div>

      <div class="flex gap-2">
        <button
          type="button"
          class="flex-1 rounded-xl bg-ember px-4 py-3 font-semibold text-white disabled:opacity-40"
          data-testid="charge"
          :disabled="!canCharge"
          @click="charge"
        >
          Cobrar
        </button>
        <button type="button" class="rounded-xl border border-line px-4 py-3 text-sm" data-testid="cancel" @click="cancelBill">
          Cancelar
        </button>
      </div>

      <p v-if="settledOrders.length" class="rounded-xl bg-paper px-4 py-3 text-sm" data-testid="settled">
        Cobrado. Se cerraron {{ settledOrders.length }}
        {{ settledOrders.length === 1 ? 'comanda' : 'comandas' }}: {{ settledOrders.join(' · ') }}
      </p>
    </div>

    <TableBillReceipt
      v-if="showReceipt && bill"
      :bill-id="bill.id"
      :employee-id="cashierId"
      @close="cancelBill"
    />
  </section>
</template>
