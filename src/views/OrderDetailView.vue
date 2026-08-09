<script setup lang="ts">
// The order detail — the Comanda, wired to a real order, as a routed child of the
// Salón. Reads :id, resolves the order (loading the store on a deep-link/hard
// refresh), and renders the tap-to-stamp menu field + the live perforated dupe +
// the cobro sheet. A closed/cancelled/missing order redirects back to /floor.
// Items are born pending; "Enviar a cocina" routes them to the KDS (per round). The
// terminal action is Cobrar → Cerrar / Fiar.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import MenuField from '@/components/comanda/MenuField.vue'
import LiveDupe from '@/components/comanda/LiveDupe.vue'
import PaymentSheet from '@/components/comanda/PaymentSheet.vue'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useMenuStore } from '@/stores/menu'
import { useOrdersStore } from '@/stores/orders'
import { detailOf, isConflict } from '@/lib/apiError'
import { formatCOP } from '@/lib/money'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const branch = useBranchStore()
const menu = useMenuStore()
const orders = useOrdersStore()

const orderId = computed(() => String(route.params.id))
const order = computed(() => orders.orders.find((o) => o.id === orderId.value) ?? null)
const canUpdate = computed(() => auth.can('orders.update'))

const CHANNEL_LABEL: Record<string, string> = {
  dine_in: 'Mesa',
  takeaway: 'Para llevar',
  delivery: 'Domicilio',
}
const channelLabel = computed(() => {
  const o = order.value
  return o ? (CHANNEL_LABEL[o.channel] ?? o.channel) : ''
})
const tableNumber = computed(() => {
  const id = order.value?.dining_table_id
  if (!id) return null
  return orders.tables.find((t) => t.id === id)?.number ?? null
})

const loading = ref(true)
// True once an OPEN order has been shown. Guards the redirect watcher below so it
// only fires when the order *leaves* (closed/cancelled), not during the initial load.
const ready = ref(false)
const error = ref<string | null>(null)
const flashItemId = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | undefined
const payOpen = ref(false)
const mobileDupeOpen = ref(false)
const sending = ref(false)
const sentNotice = ref(false)
let sentTimer: ReturnType<typeof setTimeout> | undefined

function leaveToFloor() {
  void router.replace({ path: '/floor', query: { notice: 'order-unavailable' } })
}

async function load() {
  loading.value = true
  try {
    await branch.ensureLoaded()
    const bid = branch.activeBranchId
    if (!bid) {
      leaveToFloor()
      return
    }
    // Deep-link / hard refresh: el store puede estar vacío. `ensureLoaded` trae empleado, mesas y
    // las comandas abiertas CON sus líneas, en tres peticiones.
    if (!order.value) {
      await orders.ensureLoaded(bid)
    }
    // Dos peticiones para el campo de menú: las categorías (los tags mono y el riel) y los mosaicos
    // pedibles con su precio ya resuelto. Antes eran ~81 — una por producto para precios y otra por
    // producto para variantes — y se disparaban de refilón desde `buildVariantIndex`.
    await Promise.all([menu.fetchCategories(), menu.loadOrderable(bid)])

    const o = order.value
    if (!o || o.status !== 'open') {
      // Missing, closed, or cancelled — nothing to work on here.
      leaveToFloor()
      return
    }
    // Ya no hace falta ningún índice del menú: la línea trae su nombre y el servidor pone el
    // precio. El menú que esta pantalla sí carga (arriba) es el de los MOSAICOS para elegir plato,
    // que es otra cosa y es inevitable.
    await Promise.all([orders.fetchItems(orderId.value), orders.fetchPayments(orderId.value)])
    ready.value = true
  } catch {
    leaveToFloor()
  } finally {
    loading.value = false
  }
}

onMounted(load)

// Once an open order has been shown, if it leaves the open list (closed or cancelled from
// the cobro sheet — closeOrder/cancelOrder refetch open-only orders, dropping it), return to
// the Salón. This is the reliable redirect: it doesn't depend on the cobro sheet's `done`
// event surviving its own unmount when `order` becomes null.
watch(order, (o) => {
  if (ready.value && !o) void router.replace('/floor')
})

async function onAdd(variantId: string) {
  if (!canUpdate.value) return
  error.value = null
  try {
    await orders.addItem(orderId.value, variantId, 1)
    // Flash the freshly stamped line (resolve its id from the refetched items).
    const hit = orders.itemsOf(orderId.value).find((it) => it.product_variant_id === variantId)
    if (hit) {
      flashItemId.value = hit.id
      clearTimeout(flashTimer)
      flashTimer = setTimeout(() => (flashItemId.value = null), 650)
    }
  } catch {
    error.value = 'No se pudo agregar el ítem.'
  }
}

async function onBump(itemId: string, delta: number) {
  const item = orders.itemsOf(orderId.value).find((it) => it.id === itemId)
  if (!item) return
  const next = item.quantity + delta
  error.value = null
  try {
    if (next < 1) await orders.removeItem(orderId.value, itemId)
    else await orders.updateQuantity(orderId.value, itemId, next)
  } catch {
    error.value = 'No se pudo actualizar la cantidad.'
  }
}

async function onRemove(itemId: string) {
  error.value = null
  try {
    await orders.removeItem(orderId.value, itemId)
  } catch (e) {
    error.value = isConflict(e)
      ? 'No se pudo quitar el ítem: ya cambió en el servidor. Recarga la comanda.'
      : 'No se pudo quitar el ítem.'
  }
}

// Verificar el pago de un prepago: registra el cobro y manda a cocina en una sola llamada.
// Si el cobro no se puede registrar (sin caja abierta, p. ej.) no pasa ninguna de las dos
// cosas, y el mensaje del servidor dice cuál falló.
const verifying = ref(false)
async function onVerifyPayment() {
  const employeeId = orders.currentEmployee?.id
  if (!employeeId || verifying.value) return
  error.value = null
  verifying.value = true
  try {
    await orders.verifyPayment(orderId.value, employeeId)
    sentNotice.value = true
    clearTimeout(sentTimer)
    sentTimer = setTimeout(() => (sentNotice.value = false), 2200)
  } catch (e) {
    error.value = detailOf(e) ?? 'No se pudo confirmar el pago.'
  } finally {
    verifying.value = false
  }
}

async function onSend() {
  if (!canUpdate.value || sending.value) return
  error.value = null
  sending.value = true
  try {
    const unrouted = await orders.sendToKitchen(orderId.value)
    if (unrouted.length) {
      // No se dice "enviado" cuando media comanda no llegó. Lo que SÍ tiene estación entró; el
      // resto se nombra, porque un plato que la cocina no ve sólo se descubre cuando no sale.
      error.value =
        `${unrouted.join(', ')} no llegó a cocina: sin estación asignada. ` +
        'Asígnasela en la carta para que alguien lo prepare.'
      return
    }
    // Brief confirmation; the lines also flip to EN COCINA after the store refresh.
    sentNotice.value = true
    clearTimeout(sentTimer)
    sentTimer = setTimeout(() => (sentNotice.value = false), 2200)
  } catch {
    error.value = 'No se pudo enviar a cocina.'
  } finally {
    sending.value = false
  }
}

function openCobro() {
  mobileDupeOpen.value = false
  payOpen.value = true
}
function onCobroDone() {
  payOpen.value = false
  void router.replace('/floor')
}

const itemCount = computed(() => orders.itemsOf(orderId.value).reduce((s, it) => s + it.quantity, 0))
const total = computed(() => Number(order.value?.total ?? 0))
</script>

<template>
  <AppShell>
    <main class="min-h-screen bg-app">
      <div v-if="loading" class="mx-auto max-w-7xl p-6">
        <p class="text-steel-500">Cargando comanda…</p>
      </div>

      <template v-else-if="order">
        <div class="mx-auto flex max-w-7xl flex-col gap-3 p-4 sm:p-6 lg:h-screen lg:overflow-hidden lg:p-6">
          <!-- Header + back to Salón -->
          <header class="flex items-start gap-3">
            <button
              type="button"
              class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-paper text-steel-500 transition hover:text-ink hover:border-ember/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
              aria-label="Volver al salón"
              @click="router.push('/floor')"
            >
              <i class="pi pi-arrow-left" />
            </button>
            <div class="min-w-0">
              <p class="eyebrow">Estación · Comanda</p>
              <h1 class="mt-0.5 font-display text-[length:var(--text-hero)] font-extrabold leading-none text-ink">
                <template v-if="order.channel === 'dine_in'">{{ tableNumber ? `Mesa ${tableNumber}` : 'Mesa' }}</template>
                <template v-else>{{ channelLabel }}</template>
              </h1>
              <p class="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-steel-500">
                {{ channelLabel }} · {{ order.status }}
              </p>
            </div>
          </header>

          <p v-if="error" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
            {{ error }}
          </p>

          <div class="flex min-h-0 flex-1 gap-5">
            <!-- LEFT · menu field -->
            <section class="flex-1 lg:h-full lg:overflow-y-auto lg:pr-1">
              <MenuField @add="onAdd" />
              <!-- Spacer so the mobile pill never covers the last tiles -->
              <div class="h-24 lg:hidden" />
            </section>

            <!-- RIGHT · live dupe (desktop/tablet) -->
            <aside class="hidden w-[38%] max-w-md shrink-0 lg:block lg:h-full">
              <LiveDupe
                class="lg:h-full"
                :order-id="orderId"
                :flash-item-id="flashItemId"
                :sending="sending"
                :verifying="verifying"
                @bump="onBump"
                @remove="onRemove"
                @cobrar="openCobro"
                @send="onSend"
                @verify="onVerifyPayment"
              />
            </aside>
          </div>
        </div>

        <!-- Mobile running-total pill: taps up the dupe bottom sheet -->
        <button
          v-if="!mobileDupeOpen && !payOpen"
          type="button"
          class="fixed inset-x-4 bottom-4 z-30 flex min-h-[52px] items-center justify-between gap-3 rounded-2xl bg-graphite-900 px-5 text-white shadow-lg lg:hidden"
          @click="mobileDupeOpen = true"
        >
          <span class="flex items-center gap-2">
            <span class="grid size-6 place-items-center rounded-full bg-ember font-mono text-[11px] font-bold text-white">{{ itemCount }}</span>
            <span class="text-sm font-semibold">Ver comanda</span>
          </span>
          <span class="font-mono text-base font-bold tabular-nums">{{ formatCOP(total) }}</span>
        </button>

        <!-- Mobile dupe bottom sheet -->
        <template v-if="mobileDupeOpen">
          <div class="fixed inset-0 z-40 bg-graphite-900/40 backdrop-blur-sm lg:hidden" @click="mobileDupeOpen = false" />
          <div class="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] lg:hidden">
            <LiveDupe
              class="max-h-[88vh] rounded-b-none"
              :order-id="orderId"
              :flash-item-id="flashItemId"
              :sending="sending"
              :verifying="verifying"
              @bump="onBump"
              @remove="onRemove"
              @cobrar="openCobro"
              @send="onSend"
              @verify="onVerifyPayment"
            />
          </div>
        </template>

        <!-- Enviar a cocina confirmation: transient, dismisses itself -->
        <Transition
          enter-active-class="transition duration-200 ease-out"
          leave-active-class="transition duration-200 ease-in"
          enter-from-class="opacity-0 translate-y-2"
          leave-to-class="opacity-0 translate-y-2"
        >
          <div
            v-if="sentNotice"
            role="status"
            class="fixed inset-x-0 top-4 z-[60] mx-auto flex w-fit items-center gap-2 rounded-full bg-graphite-900 px-4 py-2 text-sm font-semibold text-white shadow-lg"
          >
            <i class="pi pi-check-circle text-success" /> Enviado a cocina
          </div>
        </Transition>

        <!-- Cobro slide-over / sheet -->
        <PaymentSheet
          v-if="payOpen"
          :order-id="orderId"
          @close="payOpen = false"
          @done="onCobroDone"
        />
      </template>
    </main>
  </AppShell>
</template>
