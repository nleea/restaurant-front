<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import AppShell from '@/components/AppShell.vue'
import TableCard from '@/components/floor/TableCard.vue'
import TablePanel from '@/components/floor/TablePanel.vue'
import RegisterTableModal from '@/components/floor/RegisterTableModal.vue'
import OrderTicket from '@/components/orders/OrderTicket.vue'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useOrdersStore } from '@/stores/orders'
import { useKitchenStore } from '@/stores/kitchen'
import { statusOf } from '@/lib/apiError'
import { formatCOP } from '@/lib/money'
import { buildTableVMs, occupancyCounts } from '@/lib/floorModel'
import { buildOrderProgress } from '@/lib/kitchenProgress'
import { elapsedMinutesFromMs, formatMinutes, heatLevel } from '@/lib/kitchenTime'
import type { Order, OrderChannel } from '@/services/orders.api'

const router = useRouter()
const auth = useAuthStore()
const branch = useBranchStore()
const orders = useOrdersStore()
const kitchen = useKitchenStore()

const canCreate = computed(() => auth.can('orders.create'))

// --- Load & re-scope on branch change --------------------------------------
const loading = ref(false)
const loadError = ref<string | null>(null)

async function load() {
  loading.value = true
  loadError.value = null
  try {
    await branch.ensureLoaded()
    if (branch.activeBranchId) {
      await orders.ensureLoaded(branch.activeBranchId)
      await loadKitchen(branch.activeBranchId)
    }
  } catch {
    loadError.value = 'No se pudo cargar el salón.'
  } finally {
    loading.value = false
  }
}

// Kitchen tickets feed the ready rollup. Best-effort: a kitchen hiccup must not break the Salón —
// the cards degrade to plain occupied/total when this data is missing.
async function loadKitchen(branchId: string) {
  try {
    await kitchen.loadStations(branchId)
    await kitchen.loadAllStationTickets()
    await kitchen.buildItemIndex(branchId)
  } catch {
    /* degrade gracefully */
  }
}

// Shared clock for the cooling timers; ticks every 20s, cleared on unmount.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void load()
  timer = setInterval(() => (now.value = Date.now()), 20_000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
watch(
  () => branch.activeBranchId,
  () => {
    selectedTableId.value = null
    closeTicket()
    void load()
  },
)

// --- Floor view-model ------------------------------------------------------
const kitchenProgress = computed(() =>
  buildOrderProgress(kitchen.allTickets, kitchen.itemOrderIndex),
)
const tableVMs = computed(() =>
  buildTableVMs(orders.tables, orders.orders, kitchenProgress.value),
)
const counts = computed(() => occupancyCounts(tableVMs.value))
const noTableOrders = computed(() =>
  orders.orders.filter((o) => !o.dining_table_id && o.status === 'open'),
)

// Readiness cue for a no-table order (takeaway/delivery), reusing the same rollup + timer helpers.
interface KitchenCue {
  text: string
  tone: string
  timer: string
  progress: string
}
function kitchenCue(o: Order): KitchenCue | null {
  if (o.kitchen_state === 'none') return null
  const progress = kitchenProgress.value[o.id] ?? null
  if (o.kitchen_state === 'ready') {
    const m = elapsedMinutesFromMs(progress?.readySinceMs ?? null, now.value)
    const heat = heatLevel(m)
    const tone = heat === 'hot' ? 'text-alert' : heat === 'warm' ? 'text-ember' : 'text-success'
    const timer = m === null ? '' : m < 1 ? 'recién' : `hace ${formatMinutes(m)}`
    const text = o.channel === 'takeaway' ? '🔔 Listo para entregar' : '🔔 Listo para despacho'
    return { text, tone, timer, progress: '' }
  }
  return {
    text: 'En cocina',
    tone: 'text-ember-600',
    timer: '',
    progress: progress ? `${progress.ready}/${progress.total}` : '',
  }
}

const selectedTableId = ref<string | null>(null)
const selectedVM = computed(
  () => tableVMs.value.find((v) => v.table.id === selectedTableId.value) ?? null,
)

function toggleSelect(id: string) {
  selectedTableId.value = selectedTableId.value === id ? null : id
  openError.value = null
}

// --- Open an order (shared by the panel and the "Nueva orden" dialog) -------
const activeOrderId = ref<string | null>(null)
const activeOrder = computed(() => orders.orders.find((o) => o.id === activeOrderId.value) ?? null)
const ticketOpen = ref(false)
const opening = ref(false)
const openError = ref<string | null>(null)

async function openOrder(channel: OrderChannel, tableId: string | null): Promise<boolean> {
  if (!branch.activeBranchId) return false
  opening.value = true
  openError.value = null
  try {
    const order = await orders.openOrder(branch.activeBranchId, channel, tableId)
    activeOrderId.value = order.id
    ticketOpen.value = true
    return true
  } catch (e) {
    openError.value =
      statusOf(e) === 409 ? 'La mesa ya está ocupada.' : 'No se pudo abrir la comanda.'
    return false
  } finally {
    opening.value = false
  }
}

function takeOrderForSelected() {
  if (selectedVM.value) void openOrder('dine_in', selectedVM.value.table.id)
}
function openTicketForSelected() {
  const id = selectedVM.value?.openOrder?.id
  if (id) {
    activeOrderId.value = id
    ticketOpen.value = true
  }
}
function openTicketFor(orderId: string) {
  activeOrderId.value = orderId
  ticketOpen.value = true
}
function closeTicket() {
  ticketOpen.value = false
  activeOrderId.value = null
}
function onTicketBack() {
  closeTicket()
  selectedTableId.value = null
}

// --- "Nueva orden" dialog (channel + free table) ---------------------------
const newOrderOpen = ref(false)
const fChannel = ref<OrderChannel>('dine_in')
const fTableId = ref<string | null>(null)

const CHANNELS: { label: string; value: OrderChannel }[] = [
  { label: 'Mesa', value: 'dine_in' },
  { label: 'Para llevar', value: 'takeaway' },
  { label: 'Domicilio', value: 'delivery' },
]
const freeTableOptions = computed(() =>
  orders.tables
    .filter((t) => t.is_active && t.status === 'free')
    .map((t) => ({ label: `Mesa ${t.number}`, value: t.id })),
)

function openNewOrder() {
  fChannel.value = 'dine_in'
  fTableId.value = null
  openError.value = null
  newOrderOpen.value = true
}
async function submitNewOrder() {
  const ok = await openOrder(fChannel.value, fChannel.value === 'dine_in' ? fTableId.value : null)
  if (ok) newOrderOpen.value = false
}

// --- Register table --------------------------------------------------------
const registerOpen = ref(false)
const savingTable = ref(false)
const nextNumber = computed(() => {
  const max = orders.tables.reduce((m, t) => Math.max(m, Number(t.number) || 0), 0)
  return String(max + 1).padStart(2, '0')
})
async function saveTable(payload: { number: string; capacity: number }) {
  if (!branch.activeBranchId) return
  savingTable.value = true
  try {
    await orders.createTable(branch.activeBranchId, payload.number, payload.capacity)
    registerOpen.value = false
  } finally {
    savingTable.value = false
  }
}

function channelLabel(c: string): string {
  return CHANNELS.find((x) => x.value === c)?.label ?? c
}
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <!-- Header -->
        <header class="flex flex-wrap items-start justify-between gap-4">
          <div class="flex items-start gap-3">
            <button
              type="button"
              class="mt-0.5 grid size-9 place-items-center rounded-lg border border-line bg-paper text-steel-500 transition hover:text-ink hover:border-ember/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
              aria-label="Volver"
              @click="router.back()"
            >
              <i class="pi pi-arrow-left" />
            </button>
            <div class="min-w-0">
              <p class="eyebrow">Estación · Servicio</p>
              <h1 class="mt-1 font-display text-[length:var(--text-hero)] font-extrabold leading-none text-ink">
                Salón
              </h1>
              <p class="mt-1 text-sm text-steel-500">
                {{ counts.total }} mesas · {{ counts.occupied }} ocupadas
              </p>
            </div>
          </div>
        </header>

        <!-- Actions + status summary -->
        <div class="flex flex-wrap items-center gap-3">
          <Button
            label="Nueva orden"
            icon="pi pi-plus"
            :disabled="!branch.hasActiveBranch || !orders.hasEmployee"
            @click="openNewOrder"
          />
          <Button
            label="Registrar mesa"
            icon="pi pi-table"
            severity="secondary"
            :disabled="!branch.hasActiveBranch || !canCreate"
            @click="registerOpen = true"
          />
          <div class="ml-auto flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em]">
            <span class="inline-flex items-center gap-1.5 text-success"><span class="size-2 rounded-full bg-success" />{{ counts.free }} libres</span>
            <span class="inline-flex items-center gap-1.5 text-ember-600"><span class="size-2 rounded-full bg-ember" />{{ counts.occupied }} ocupadas</span>
          </div>
        </div>

        <!-- Gating / status messages -->
        <p v-if="loadError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ loadError }}
        </p>
        <p v-else-if="!branch.hasActiveBranch && !loading" class="rounded-lg border border-line bg-paper px-3.5 py-2 font-mono text-[11px] text-steel-500">
          Esta cuenta aún no tiene sucursales.
        </p>
        <p v-else-if="orders.employeeResolved && !orders.hasEmployee" class="rounded-lg border border-line bg-paper px-3.5 py-2 font-mono text-[11px] text-steel-500">
          Tu usuario no está vinculado a un empleado; no puedes abrir comandas.
        </p>

        <!-- Grid + action rail -->
        <div class="flex flex-col gap-6 xl:flex-row xl:items-start">
          <section class="min-w-0 flex-1">
            <p v-if="loading" class="text-steel-500">Cargando…</p>
            <p v-else-if="!tableVMs.length" class="rounded-xl border border-dashed border-line bg-paper px-4 py-10 text-center text-sm text-steel-500">
              No hay mesas todavía. Usa “Registrar mesa” para crear la primera.
            </p>
            <ul v-else class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
              <li v-for="vm in tableVMs" :key="vm.table.id">
                <TableCard
                  :vm="vm"
                  :now="now"
                  :selected="selectedTableId === vm.table.id"
                  @select="toggleSelect(vm.table.id)"
                />
              </li>
            </ul>

            <!-- No-table orders (takeaway / delivery) -->
            <section v-if="noTableOrders.length" class="mt-8">
              <h2 class="eyebrow mb-3">Para llevar y domicilios</h2>
              <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <li v-for="o in noTableOrders" :key="o.id">
                  <button
                    type="button"
                    class="card flex w-full items-center justify-between gap-3 border-l-4 px-4 py-3 text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
                    :class="
                      o.kitchen_state === 'ready' ? 'border-l-success' : 'border-l-info'
                    "
                    @click="openTicketFor(o.id)"
                  >
                    <span class="min-w-0">
                      <span class="block truncate text-sm font-semibold text-ink">{{ channelLabel(o.channel) }}</span>
                      <!-- Kitchen readiness for the strip: ready → deliver/dispatch cue; else cooking -->
                      <span v-if="kitchenCue(o)" class="flex items-center gap-1.5">
                        <span class="truncate text-xs font-semibold" :class="kitchenCue(o)!.tone">{{ kitchenCue(o)!.text }}</span>
                        <span v-if="kitchenCue(o)!.progress" class="font-mono text-[10px] tabular-nums text-steel-500">{{ kitchenCue(o)!.progress }}</span>
                        <span v-if="kitchenCue(o)!.timer" class="font-mono text-[10px] tabular-nums" :class="kitchenCue(o)!.tone">{{ kitchenCue(o)!.timer }}</span>
                      </span>
                      <span v-else class="font-mono text-[10px] uppercase tracking-wide text-steel-500">{{ o.status }}</span>
                    </span>
                    <span class="shrink-0 font-mono text-sm tabular-nums text-ember-600">{{ formatCOP(o.total) }}</span>
                  </button>
                </li>
              </ul>
            </section>
          </section>

          <!-- Action panel: sticky rail on xl, bottom sheet below -->
          <Transition
            enter-active-class="transition duration-200 ease-out"
            leave-active-class="transition duration-200 ease-in"
            enter-from-class="opacity-0 translate-y-6 xl:translate-y-0 xl:translate-x-3"
            leave-to-class="opacity-0 translate-y-6 xl:translate-y-0 xl:translate-x-3"
          >
            <aside
              v-if="selectedVM"
              class="fixed inset-x-0 bottom-0 z-40 max-h-[82vh] overflow-hidden rounded-t-2xl border border-line bg-paper shadow-[0_-16px_40px_-24px_rgb(20_24_28/0.5)] xl:sticky xl:top-6 xl:z-auto xl:inset-auto xl:max-h-none xl:w-[340px] xl:shrink-0 xl:rounded-2xl xl:shadow-[0_1px_2px_-1px_rgb(20_24_28/0.06),0_8px_24px_-18px_rgb(20_24_28/0.28)]"
            >
              <TablePanel
                :vm="selectedVM"
                :can-open="orders.hasEmployee"
                :opening="opening"
                :open-error="openError"
                @take-order="takeOrderForSelected"
                @open-ticket="openTicketForSelected"
                @close="selectedTableId = null"
              />
            </aside>
          </Transition>

          <Transition
            enter-active-class="transition-opacity duration-200"
            leave-active-class="transition-opacity duration-200"
            enter-from-class="opacity-0"
            leave-to-class="opacity-0"
          >
            <div
              v-if="selectedVM"
              class="fixed inset-0 z-30 bg-graphite-900/40 xl:hidden"
              aria-hidden="true"
              @click="selectedTableId = null"
            />
          </Transition>
        </div>
      </div>
    </main>

    <!-- Register table -->
    <RegisterTableModal
      v-model:visible="registerOpen"
      :suggested-number="nextNumber"
      :saving="savingTable"
      @save="saveTable"
    />

    <!-- Nueva orden -->
    <Dialog
      v-model:visible="newOrderOpen"
      modal
      header="Nueva orden"
      :style="{ width: '26rem' }"
      :breakpoints="{ '480px': '92vw' }"
    >
      <div class="flex flex-col gap-4 pt-1">
        <div class="flex flex-col gap-1.5">
          <label for="no-channel" class="eyebrow">Canal</label>
          <Select id="no-channel" v-model="fChannel" :options="CHANNELS" option-label="label" option-value="value" fluid />
        </div>
        <div v-if="fChannel === 'dine_in'" class="flex flex-col gap-1.5">
          <label for="no-table" class="eyebrow">Mesa libre</label>
          <Select
            id="no-table"
            v-model="fTableId"
            :options="freeTableOptions"
            option-label="label"
            option-value="value"
            placeholder="Sin mesa"
            show-clear
            fluid
          />
        </div>
        <p v-if="openError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ openError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="newOrderOpen = false" />
        <Button label="Abrir" icon="pi pi-check" :loading="opening" @click="submitNewOrder" />
      </template>
    </Dialog>

    <!-- Order ticket (reused) -->
    <Dialog
      v-model:visible="ticketOpen"
      modal
      :header="activeOrder ? `Comanda · ${channelLabel(activeOrder.channel)}` : 'Comanda'"
      :style="{ width: '40rem' }"
      :breakpoints="{ '960px': '95vw' }"
      @hide="closeTicket"
    >
      <OrderTicket v-if="activeOrder" :key="activeOrder.id" :order="activeOrder" @back="onTicketBack" />
    </Dialog>
  </AppShell>
</template>
